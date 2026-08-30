/*
 * Baidu "看图识万物" client.
 *
 * The browser never talks to aip.baidubce.com directly.  The CFC URL is a
 * small same-purpose proxy that accepts X-Baidu-Api-Key and forwards the
 * request as Authorization: Bearer to Baidu.  This keeps the API request
 * usable from Android WebView, whose CORS preflight does not allow the
 * Authorization header on Baidu's endpoint.
 */

const STORAGE_KEY = "huangshui-baidu-recognition-config-v1";
const DEFAULT_TIMEOUT_MS = 32_000;
const MAX_IMAGE_CHARS = 12 * 1024 * 1024;

const makeError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

export function getBaiduConfig(storage = typeof window !== "undefined" ? window.localStorage : null) {
  if (!storage) return { apiKey: "", proxyUrl: "" };
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY) || "{}");
    return {
      apiKey: typeof value?.apiKey === "string" ? value.apiKey.trim() : "",
      proxyUrl: typeof value?.proxyUrl === "string" ? value.proxyUrl.trim() : "",
    };
  } catch {
    return { apiKey: "", proxyUrl: "" };
  }
}

export function saveBaiduConfig({ apiKey, proxyUrl }, storage = typeof window !== "undefined" ? window.localStorage : null) {
  const normalizedKey = String(apiKey || "").trim();
  const normalizedUrl = String(proxyUrl || "").trim().replace(/\/$/, "");
  if (!normalizedKey) throw makeError("BAIDU_KEY_NOT_CONFIGURED", "请填写百度 API Key。 ");
  if (!/^https:\/\//i.test(normalizedUrl)) {
    throw makeError("BAIDU_PROXY_INVALID", "CFC 代理地址必须以 https:// 开头。 ");
  }
  if (!storage) throw makeError("BAIDU_STORAGE_UNAVAILABLE", "当前环境不能保存百度识别配置。 ");
  storage.setItem(STORAGE_KEY, JSON.stringify({ apiKey: normalizedKey, proxyUrl: normalizedUrl }));
  return { apiKey: normalizedKey, proxyUrl: normalizedUrl };
}

export function clearBaiduConfig(storage = typeof window !== "undefined" ? window.localStorage : null) {
  storage?.removeItem(STORAGE_KEY);
}

function readJsonDataLine(line) {
  const value = line.replace(/^\s*data:\s?/, "").trim();
  if (!value || value === "[DONE]") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value && typeof value === "object" ? [value] : [];
}

function findFirst(object, keys) {
  if (!object || typeof object !== "object") return undefined;
  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null) return object[key];
  }
  return undefined;
}

function collectNested(object, keys, result = [], seen = new Set()) {
  if (!object || typeof object !== "object" || seen.has(object)) return result;
  seen.add(object);
  if (Array.isArray(object)) {
    object.forEach((item) => collectNested(item, keys, result, seen));
    return result;
  }
  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null) result.push(object[key]);
  }
  Object.values(object).forEach((value) => {
    if (value && typeof value === "object") collectNested(value, keys, result, seen);
  });
  return result;
}

function normalizeCandidate(value) {
  if (typeof value === "string") {
    const name = value.trim();
    return name ? { name, difference: "百度联网识别给出的可能候选。" } : null;
  }
  if (!value || typeof value !== "object") return null;
  const name = String(findFirst(value, ["name", "title", "chinese_name", "common_name", "species", "候选名称"]) || "").trim();
  if (!name) return null;
  const scientific = String(findFirst(value, ["scientific_name", "latin_name", "学名"]) || "").trim();
  const confidence = findFirst(value, ["confidence", "probability", "score", "certainty", "把握程度"]);
  const feature = String(findFirst(value, ["description", "features", "supporting_features", "支持特征", "说明"]) || "").trim();
  const toxic = String(findFirst(value, ["similar_toxic_species", "toxic_lookalike", "相似有毒种"]) || "").trim();
  const confidenceText = confidence === undefined || confidence === null || confidence === "" ? "" : `把握程度：${typeof confidence === "number" && confidence <= 1 ? `${Math.round(confidence * 100)}%` : confidence}`;
  return {
    name: scientific && !name.includes(scientific) ? `${name}（${scientific}）` : name,
    difference: [confidenceText, feature, toxic ? `相似有毒种：${toxic}` : ""].filter(Boolean).join("；") || "百度联网识别给出的可能候选。",
  };
}

function candidatesFromDescription(description) {
  const candidates = [];
  const text = String(description || "").replace(/\r/g, "");
  // Baidu may stream a description without preserving newlines. Match both
  // "候选1：牛肝菌：...候选2：..." and Markdown/numbered forms.
  const marker = /(?:^|[\n。；;，,])\s*(?:[-*]\s*)?(?:(?:候选\s*[：:]\s*\d+[.)、]\s*)|(?:候选\s*[0-9一二三四五六七八九十]*\s*[：:]\s*)|(?:\d+[.)、]\s*))([^：:\n]{2,80})(?:[：:]\s*([\s\S]*?))(?=\s*[,，]?\s*(?:(?:候选\s*[：:]\s*\d+[.)、]\s*)|(?:候选\s*[0-9一二三四五六七八九十]*\s*[：:]\s*)|(?:\d+[.)、]\s*))|$)/gu;
  for (const match of text.matchAll(marker)) {
    const name = String(match[1] || "")
      .replace(/[，,].*$/u, "")
      .replace(/\s*(?:把握程度|置信度|支持特征|学名)\s*$/u, "")
      .trim();
    const candidate = normalizeCandidate({ name, description: String(match[2] || "").trim() });
    if (candidate && !candidates.some((item) => item.name === candidate.name)) candidates.push(candidate);
  }
  return candidates.slice(0, 3);
}

function normalizeExternal(value, kind) {
  if (typeof value === "string") {
    const urlMatch = value.match(/https?:\/\/[^\s)]+/i);
    if (!urlMatch) return null;
    return { title: kind === "baike" ? "百度百科资料" : "百度搜索资料", summary: value.replace(urlMatch[0], "").trim() || "查看百度返回的补充资料。", url: urlMatch[0], language: "zh-CN" };
  }
  if (!value || typeof value !== "object") return null;
  const url = String(findFirst(value, ["url", "link", "href", "baike_url", "百科链接"]) || "").trim();
  if (!/^https?:\/\//i.test(url)) return null;
  const title = String(findFirst(value, ["title", "name", "heading", "名称"]) || (kind === "baike" ? "百度百科资料" : "百度搜索资料")).trim();
  const summary = String(findFirst(value, ["summary", "snippet", "description", "content", "摘要", "简介"]) || "查看百度返回的补充资料。").trim();
  return { title, summary, url, language: "zh-CN" };
}

function isClearlyNotMushroom(description) {
  const text = String(description || "").toLowerCase();
  if (/(不是蘑菇|未识别为蘑菇|非蘑菇|不是真菌|非真菌|不是大型真菌|无法识别为蘑菇|更像是猫|看起来是猫|动物而不是)/u.test(text)) return true;
  return /(猫|狗|鸟|人脸|汽车|车辆|建筑|花朵|植物叶片)/u.test(text) && !/(可能是蘑菇|蘑菇|真菌)/u.test(text);
}

/**
 * Parse Baidu's SSE response. The service may split description across
 * multiple data packets and may attach search_result/baike_result to only
 * one packet, so every packet is inspected and descriptions are concatenated.
 */
export function parseBaiduSse(text) {
  const packets = [];
  const lines = String(text || "").split(/\r?\n/);
  for (const line of lines) {
    const packet = readJsonDataLine(line);
    if (packet) packets.push(packet);
  }
  if (packets.length === 0) {
    try {
      const parsed = JSON.parse(String(text || ""));
      if (parsed && typeof parsed === "object") packets.push(parsed);
    } catch {
      // The caller gets a useful invalid-response error below.
    }
  }
  if (packets.length === 0) throw makeError("BAIDU_INVALID_RESPONSE", "百度返回的数据格式暂时无法解析，请稍后重试。 ");

  const descriptions = [];
  const candidateValues = [];
  const searchValues = [];
  const baikeValues = [];
  for (const packet of packets) {
    collectNested(packet, ["description", "answer", "content", "desc"], descriptions);
    collectNested(packet, ["candidates", "possible_species", "similar_species", "species_candidates", "候选"], candidateValues);
    collectNested(packet, ["search_result", "search_results"], searchValues);
    collectNested(packet, ["baike_result", "baike_results"], baikeValues);
  }
  const description = descriptions.filter((item) => typeof item === "string").join("").trim();
  const candidates = [];
  for (const value of candidateValues.flatMap(asArray)) {
    const candidate = normalizeCandidate(value);
    if (candidate && !candidates.some((item) => item.name === candidate.name)) candidates.push(candidate);
  }
  for (const candidate of candidatesFromDescription(description)) {
    if (!candidates.some((item) => item.name === candidate.name)) candidates.push(candidate);
  }
  const external = [];
  for (const [values, kind] of [[searchValues, "search"], [baikeValues, "baike"]]) {
    for (const value of values.flatMap(asArray)) {
      const item = normalizeExternal(value, kind);
      if (item && !external.some((existing) => existing.url === item.url)) external.push(item);
    }
  }
  if (!description && candidates.length === 0 && external.length === 0) {
    throw makeError("BAIDU_INVALID_RESPONSE", "百度没有返回可显示的识别内容，请稍后重试。 ");
  }
  return {
    description,
    candidates: candidates.slice(0, 3),
    external: external.slice(0, 8),
    notMushroom: isClearlyNotMushroom(description),
  };
}

function makeResult(parsed, guideEntries, localCandidates) {
  const nearby = (localCandidates || []).slice(0, 3);
  const referenceImages = nearby.map((item) => item.entry?.images?.[0]).filter(Boolean);
  const descriptionLines = formatDescriptionLines(parsed.description);
  if (parsed.notMushroom) {
    return {
      status: "not_mushroom",
      title: "这张照片未识别为蘑菇",
      subtitle: "百度联网识别判断画面主体更像其他物体，因此没有强行套用蘑菇图鉴。",
      warning_message: "如果要识别蘑菇，请让蘑菇主体占据画面中央，并拍清菌盖、菌柄和菌褶；野生菌不要仅凭照片决定食用。",
      reference_images: [],
      feature_summary: [...(descriptionLines.length ? descriptionLines : ["百度没有把画面主体判断为蘑菇。"]), "本次已停止强行匹配蘑菇图鉴，避免产生误导。"],
      similar_species: [],
      external_results: [],
      external_status: "not_needed",
      source_label: "百度看图识万物 · 非蘑菇提示",
    };
  }
  const localLine = nearby[0] ? `本地图鉴最接近“${nearby[0].entry?.name || "未知种类"}”，但仍需结合百度联网结果核对。` : "本地图鉴没有足够接近的候选。";
  return {
    status: "uncertain",
    title: "百度联网识别候选（仅供参考）",
    subtitle: `已先与图鉴中的 ${guideEntries.length} 个种类比对，再调用百度看图识万物补充候选。`,
    warning_message: "照片识别和联网资料都不能作为食用依据；无法由专业人员明确确认时，请不要采食。",
    reference_images: referenceImages,
    feature_summary: [localLine, ...(descriptionLines.length ? descriptionLines : ["百度未返回详细描述。"]), "候选名称、搜索资料和百科链接均来自百度联网接口，仅供继续核对。"],
    similar_species: parsed.candidates,
    external_results: parsed.external,
    external_status: parsed.external.length ? "ready" : "empty",
    source_label: "百度看图识万物 · 联网补充",
  };
}

function formatDescriptionLines(value) {
  const text = String(value || "")
    .replace(/\r/g, "")
    .replace(/#{1,6}\s*/g, "\n")
    .replace(/\*\*/g, "")
    .replace(/(^|\s)\*\s+(?=\S)/g, "\n")
    .replace(/\*/g, "")
    .replace(/\s+(?=\d+[.、]\s*[^\d])/g, "\n")
    .replace(/\s+(?=(?:中文名|学名|其他可能|候选名称|菌盖形态|边缘特征|菌肉与变色|菌柄特征|菌褶|菌孔|生境|把握程度|风险提醒)[：:])/g, "\n");
  return text
    .split(/\n+/)
    .map((line) => line.trim().replace(/^[-•]+\s*/, ""))
    .filter(Boolean)
    .slice(0, 24);
}

export async function recognizeWithBaidu({ imageSrc, guideEntries = [], localCandidates = [], timeoutMs = DEFAULT_TIMEOUT_MS, config = getBaiduConfig() }) {
  const apiKey = String(config?.apiKey || "").trim();
  const proxyUrl = String(config?.proxyUrl || "").trim();
  if (!apiKey || !proxyUrl) throw makeError("BAIDU_NOT_CONFIGURED", "尚未配置百度联网识别：请长按首页标题，填写 CFC 代理地址和百度 API Key。 ");
  if (!/^https:\/\//i.test(proxyUrl)) throw makeError("BAIDU_PROXY_INVALID", "百度 CFC 代理地址无效，请检查是否以 https:// 开头。 ");
  if (typeof imageSrc !== "string" || !imageSrc.startsWith("data:image/")) throw makeError("BAIDU_IMAGE_INVALID", "当前照片格式暂不支持百度联网识别，请换一张 JPG、PNG 或 WebP。 ");
  if (imageSrc.length > MAX_IMAGE_CHARS) throw makeError("BAIDU_IMAGE_TOO_LARGE", "照片尺寸过大，请压缩照片后重试。 ");

  const prompt = "请先判断图片主体是否为蘑菇或其他大型真菌。若不是蘑菇，请明确说明“未识别为蘑菇”，指出更像什么，并不要给出蘑菇名称。若是蘑菇，请给出最多3个可能候选的中文名和学名、支持判断的外观特征、相似有毒种及把握程度。请同时说明：这只是照片参考，不能据此食用。请把搜索到的资料和百科结果放进 search_result 与 baike_result 字段（若接口返回这些字段），不要只给一个搜索链接。";
  const body = {
    messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: imageSrc } }, { type: "text", text: prompt }] }],
    search_mode: "required",
    search_result: true,
    baike_result: true,
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream", "X-Baidu-Api-Key": apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const responseText = await response.text();
    if (!response.ok) {
      let detail = "";
      try { detail = JSON.parse(responseText)?.message || JSON.parse(responseText)?.error_msg || ""; } catch { /* keep generic */ }
      throw makeError("BAIDU_HTTP_ERROR", `百度联网识别接口返回 ${response.status}${detail ? `：${detail}` : "，请稍后重试。"}`);
    }
    return makeResult(parseBaiduSse(responseText), guideEntries, localCandidates);
  } catch (error) {
    if (error?.name === "AbortError") throw makeError("BAIDU_TIMEOUT", "百度联网识别等待超过 32 秒，请检查网络后重试。 ");
    if (error?.code) throw error;
    throw makeError("BAIDU_NETWORK_ERROR", "百度联网识别暂时无法连接，请检查手机网络后重试。 ");
  } finally {
    clearTimeout(timer);
  }
}

export const baiduStorageKey = STORAGE_KEY;
