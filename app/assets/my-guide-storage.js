const DB_NAME = "huangshui-my-guide";
const DB_VERSION = 1;
const ENTRY_STORE = "guideEntries";
const IMAGE_STORE = "guideImages";

function guideError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function normalizeGuideName(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[（(][^)）]*[)）]/g, "")
    .replace(/[\s·•_—–-]+/g, "")
    .replace(/[，。！？、,:;；]/g, "")
    .trim();
}

function cleanText(value, maxLength = 800) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function sanitizeSources(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => ({
      title: cleanText(value?.title || value?.label, 160),
      url: /^https:\/\//i.test(String(value?.url || "")) ? String(value.url).slice(0, 2048) : "",
      summary: cleanText(value?.summary, 500),
      kind: cleanText(value?.kind, 40),
    }))
    .filter((value) => value.title || value.url || value.summary)
    .slice(0, 12);
}

export function createPendingEntry({
  id,
  name,
  imageKey,
  imageHash,
  featureSummary = [],
  sources = [],
  createdAt = new Date().toISOString(),
}) {
  const commonName = cleanText(name, 160);
  const normalizedName = normalizeGuideName(commonName);
  if (!commonName || !normalizedName) throw guideError("MY_GUIDE_NAME_REQUIRED", "没有可保存的候选名称。");
  if (!imageKey || !imageHash) throw guideError("MY_GUIDE_IMAGE_REQUIRED", "没有可保存的识别照片。");
  return {
    id: String(id || `my-guide-${Date.now()}`),
    status: "pending",
    name: { common: commonName, scientific: "", aliases: [] },
    normalizedName,
    imageKeys: [String(imageKey)],
    imageHashes: [String(imageHash)],
    evidence: {
      provider: "baidu",
      evidenceCount: 1,
      features: Array.isArray(featureSummary)
        ? featureSummary.map((item) => cleanText(item, 500)).filter(Boolean).slice(0, 24)
        : [],
    },
    sources: sanitizeSources(sources),
    review: { confirmedAt: null, note: "" },
    createdAt,
    updatedAt: createdAt,
  };
}

export function shouldMergeEntries(existing, incoming) {
  return Boolean(existing?.normalizedName && incoming?.normalizedName && existing.normalizedName === incoming.normalizedName);
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || guideError("MY_GUIDE_DB_ERROR", "本地数据库操作失败。"));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || guideError("MY_GUIDE_DB_ERROR", "本地数据库写入失败。"));
    transaction.onabort = () => reject(transaction.error || guideError("MY_GUIDE_DB_ABORTED", "本地数据库写入已取消。"));
  });
}

export function openMyGuideDb(indexedDb = globalThis.indexedDB) {
  if (!indexedDb || typeof indexedDb.open !== "function") {
    return Promise.reject(guideError("MY_GUIDE_UNAVAILABLE", "当前手机暂不支持“我的识别”本地存储，固定图鉴仍可正常使用。"));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const entries = db.objectStoreNames.contains(ENTRY_STORE)
        ? request.transaction.objectStore(ENTRY_STORE)
        : db.createObjectStore(ENTRY_STORE, { keyPath: "id" });
      if (!entries.indexNames.contains("normalizedName")) entries.createIndex("normalizedName", "normalizedName", { unique: false });
      if (!entries.indexNames.contains("status")) entries.createIndex("status", "status", { unique: false });
      if (!db.objectStoreNames.contains(IMAGE_STORE)) db.createObjectStore(IMAGE_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || guideError("MY_GUIDE_OPEN_FAILED", "无法打开“我的识别”本地数据库。"));
  });
}

async function imageSha256(imageData, cryptoImpl = globalThis.crypto) {
  if (!cryptoImpl?.subtle || typeof TextEncoder === "undefined") {
    throw guideError("MY_GUIDE_HASH_UNAVAILABLE", "当前手机无法生成照片指纹，暂不能保存到“我的识别”。");
  }
  const digest = await cryptoImpl.subtle.digest("SHA-256", new TextEncoder().encode(String(imageData || "")));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomId(prefix, cryptoImpl = globalThis.crypto) {
  const suffix = typeof cryptoImpl?.randomUUID === "function"
    ? cryptoImpl.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

export async function listEntries(options = {}) {
  const db = await openMyGuideDb(options.indexedDB);
  try {
    const transaction = db.transaction(ENTRY_STORE, "readonly");
    const entries = await requestResult(transaction.objectStore(ENTRY_STORE).getAll());
    return entries.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
  } finally {
    db.close();
  }
}

export async function getImage(key, options = {}) {
  const db = await openMyGuideDb(options.indexedDB);
  try {
    const transaction = db.transaction(IMAGE_STORE, "readonly");
    return (await requestResult(transaction.objectStore(IMAGE_STORE).get(String(key))))?.data || null;
  } finally {
    db.close();
  }
}

export async function savePending(input, options = {}) {
  const imageData = String(input?.imageData || "");
  if (!imageData.startsWith("data:image/")) throw guideError("MY_GUIDE_IMAGE_REQUIRED", "识别原图无效，无法保存。");
  const now = options.now || new Date().toISOString();
  const imageHash = await imageSha256(imageData, options.crypto || globalThis.crypto);
  const imageKey = `my-guide-image-${imageHash}`;
  const candidate = createPendingEntry({
    id: options.id || randomId("my-guide", options.crypto || globalThis.crypto),
    name: input?.name,
    imageKey,
    imageHash,
    featureSummary: input?.featureSummary,
    sources: input?.sources,
    createdAt: now,
  });
  const db = await openMyGuideDb(options.indexedDB);
  try {
    const transaction = db.transaction([ENTRY_STORE, IMAGE_STORE], "readwrite");
    const entriesStore = transaction.objectStore(ENTRY_STORE);
    const imagesStore = transaction.objectStore(IMAGE_STORE);
    const existingEntries = await requestResult(entriesStore.index("normalizedName").getAll(candidate.normalizedName));
    const existing = existingEntries[0];
    if (existing?.imageHashes?.includes(imageHash)) {
      transaction.abort();
      return { entry: existing, deduplicated: true, merged: false };
    }
    imagesStore.put({ key: imageKey, hash: imageHash, data: imageData, source: "user", createdAt: now });
    if (existing && shouldMergeEntries(existing, candidate)) {
      const merged = {
        ...existing,
        imageKeys: [...new Set([...(existing.imageKeys || []), imageKey])],
        imageHashes: [...new Set([...(existing.imageHashes || []), imageHash])],
        evidence: {
          ...(existing.evidence || {}),
          provider: "baidu",
          evidenceCount: Number(existing.evidence?.evidenceCount || 1) + 1,
          features: [...new Set([...(existing.evidence?.features || []), ...candidate.evidence.features])].slice(0, 36),
        },
        sources: sanitizeSources([...(existing.sources || []), ...candidate.sources]),
        updatedAt: now,
      };
      entriesStore.put(merged);
      await transactionDone(transaction);
      return { entry: merged, deduplicated: false, merged: true };
    }
    entriesStore.add(candidate);
    await transactionDone(transaction);
    return { entry: candidate, deduplicated: false, merged: false };
  } finally {
    db.close();
  }
}

export async function setStatus(id, status, options = {}) {
  if (!new Set(["pending", "confirmed"]).has(status)) throw guideError("MY_GUIDE_STATUS_INVALID", "图鉴状态无效。");
  const db = await openMyGuideDb(options.indexedDB);
  try {
    const transaction = db.transaction(ENTRY_STORE, "readwrite");
    const store = transaction.objectStore(ENTRY_STORE);
    const entry = await requestResult(store.get(String(id)));
    if (!entry) throw guideError("MY_GUIDE_NOT_FOUND", "没有找到这条识别记录。");
    const now = options.now || new Date().toISOString();
    const updated = {
      ...entry,
      status,
      review: { ...(entry.review || {}), confirmedAt: status === "confirmed" ? now : null },
      updatedAt: now,
    };
    store.put(updated);
    await transactionDone(transaction);
    return updated;
  } finally {
    db.close();
  }
}

export async function deleteEntry(id, options = {}) {
  const db = await openMyGuideDb(options.indexedDB);
  try {
    const transaction = db.transaction([ENTRY_STORE, IMAGE_STORE], "readwrite");
    const entriesStore = transaction.objectStore(ENTRY_STORE);
    const imagesStore = transaction.objectStore(IMAGE_STORE);
    const entry = await requestResult(entriesStore.get(String(id)));
    if (!entry) return false;
    for (const key of entry.imageKeys || []) imagesStore.delete(key);
    entriesStore.delete(String(id));
    await transactionDone(transaction);
    return true;
  } finally {
    db.close();
  }
}

export const myGuideStorageInfo = { dbName: DB_NAME, version: DB_VERSION, entryStore: ENTRY_STORE, imageStore: IMAGE_STORE };
