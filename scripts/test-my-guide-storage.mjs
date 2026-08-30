import assert from "node:assert/strict";
import {
  createPendingEntry,
  normalizeGuideName,
  openMyGuideDb,
  sanitizeSources,
  shouldMergeEntries,
} from "../app/assets/my-guide-storage.js";

assert.equal(normalizeGuideName("  牛肝菌（Boletus） "), "牛肝菌");
assert.equal(normalizeGuideName("卷 边-牛肝菌"), "卷边牛肝菌");

const sources = sanitizeSources([{ title: "百科", url: "https://example.test", summary: "资料", apiKey: "secret", proxyUrl: "secret" }]);
assert.deepEqual(sources, [{ title: "百科", url: "https://example.test", summary: "资料", kind: "" }]);
assert.equal("apiKey" in sources[0], false);
assert.equal("proxyUrl" in sources[0], false);

const entry = createPendingEntry({
  id: "entry-1",
  name: "牛肝菌（Boletus）",
  imageKey: "image-1",
  imageHash: "hash-1",
  featureSummary: ["菌盖褐色", "菌柄粗壮"],
  sources,
  createdAt: "2026-08-31T00:00:00.000Z",
});
assert.equal(entry.status, "pending");
assert.equal(entry.evidence.provider, "baidu");
assert.equal(entry.normalizedName, "牛肝菌");
assert.equal(shouldMergeEntries(entry, { normalizedName: "牛肝菌" }), true);
assert.equal(shouldMergeEntries(entry, { normalizedName: "平菇" }), false);
assert.equal(JSON.stringify(entry).includes("secret"), false);

await assert.rejects(openMyGuideDb(null), (error) => error.code === "MY_GUIDE_UNAVAILABLE");

console.log("My guide storage tests passed: normalization, pending status, source sanitization, merge rule and unsupported fallback.");
