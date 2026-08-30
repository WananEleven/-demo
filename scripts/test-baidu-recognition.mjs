import assert from "node:assert/strict";
import fs from "node:fs";
import {
  parseBaiduSse,
  parseMushroomCountResponse,
  recognizeWithBaidu,
  estimateMushroomCount,
  saveBaiduConfig,
  getBaiduConfig,
  clearBaiduConfig,
} from "../app/assets/baidu-recognition.js";

const mushroomSse = [
  'data:{"result":{"description":"是否为蘑菇：是\\n候选：1. 牛肝菌（Boletus），把握程度：中等\\n支持特征：菌盖褐色，菌柄粗壮。"}}',
  'data:{"result":{"description":"相似有毒种：需警惕毒红菇。","search_result":[{"title":"牛肝菌资料","url":"https://example.test/boletus","summary":"形态资料"}]}}',
  'data:{"baike_result":[{"name":"牛肝菌百科","link":"https://example.test/baike","snippet":"百科摘要"}]}',
  "data:[DONE]",
  "",
].join("\n");

const parsedMushroom = parseBaiduSse(mushroomSse);
assert.equal(parsedMushroom.notMushroom, false);
assert.match(parsedMushroom.description, /菌盖褐色/);
assert.equal(parsedMushroom.candidates[0].name, "牛肝菌（Boletus）");
assert.equal(parsedMushroom.external.length, 2);

const parsedContinuous = parseBaiduSse('data:{"result":{"description":"候选1：牛肝菌：菌盖褐色，候选2：褐环乳牛肝菌：菌柄粗壮。"}}\n\n');
assert.deepEqual(parsedContinuous.candidates.map((item) => item.name), ["牛肝菌", "褐环乳牛肝菌"]);

const parsedCat = parseBaiduSse('data:{"result":{"description":"未识别为蘑菇，画面主体是猫。"}}\n\n');
assert.equal(parsedCat.notMushroom, true);
assert.equal(parsedCat.candidates.length, 0);

const memoryStorage = new Map();
const storage = { getItem: (key) => memoryStorage.get(key) || null, setItem: (key, value) => memoryStorage.set(key, value), removeItem: (key) => memoryStorage.delete(key) };
saveBaiduConfig({ apiKey: "test-api-key", proxyUrl: "https://cfc.example.test/proxy" }, storage);
assert.deepEqual(getBaiduConfig(storage), { apiKey: "test-api-key", proxyUrl: "https://cfc.example.test/proxy" });

const originalFetch = globalThis.fetch;
let fetchRequest;
globalThis.fetch = async (url, options) => {
  fetchRequest = { url, options };
  return new Response(mushroomSse, { status: 200, headers: { "content-type": "text/event-stream" } });
};
const recognized = await recognizeWithBaidu({
  imageSrc: "data:image/jpeg;base64,////",
  guideEntries: [{ id: "boletus", name: "牛肝菌", images: ["guide.webp"] }],
  localCandidates: [{ entry: { name: "平菇", images: ["guide.webp"] }, similarity: 0.42 }],
  config: getBaiduConfig(storage),
});
assert.equal(recognized.status, "uncertain");
assert.equal(recognized.similar_species[0].name, "牛肝菌（Boletus）");
assert.equal(recognized.external_results.length, 2);
assert.equal(fetchRequest.url, "https://cfc.example.test/proxy");
assert.equal(fetchRequest.options.headers["X-Baidu-Api-Key"], "test-api-key");
const sent = JSON.parse(fetchRequest.options.body);
assert.equal(sent.search_mode, "required");
assert.equal(sent.search_result, true);
assert.equal(sent.baike_result, true);
assert.equal(sent.messages[0].content[0].image_url.url, "data:image/jpeg;base64,////");

const highCount = parseMushroomCountResponse([
  'data:{"result":{"content":"```json\\n{\\"is_mushroom\\":true,\\"visible_count\\":4,\\"certainty\\":\\"high\\",\\"occluded\\":false,\\"reason\\":\\"四朵彼此分开且清晰可见。\\"}\\n```"}}',
  "data:[DONE]",
].join("\n"));
assert.deepEqual(highCount, {
  is_mushroom: true,
  visible_count: 4,
  certainty: "high",
  occluded: false,
  reason: "四朵彼此分开且清晰可见。",
  canPrefill: true,
  status: "estimated",
});

const nonMushroomCount = parseMushroomCountResponse('{"is_mushroom":false,"visible_count":0,"certainty":"low","occluded":false,"reason":"画面主体是猫。"}');
assert.equal(nonMushroomCount.status, "not_mushroom");
assert.equal(nonMushroomCount.canPrefill, false);

const lowCount = parseMushroomCountResponse('{"is_mushroom":true,"visible_count":3,"certainty":"low","occluded":false,"reason":"只能大致看到。"}');
assert.equal(lowCount.status, "uncertain");
assert.equal(lowCount.canPrefill, false);
const occludedCount = parseMushroomCountResponse('{"is_mushroom":true,"visible_count":3,"certainty":"high","occluded":true,"reason":"多朵被遮挡。"}');
assert.equal(occludedCount.status, "uncertain");
assert.equal(occludedCount.canPrefill, false);

assert.throws(() => parseMushroomCountResponse("百度暂时只返回了说明文字，没有 JSON。"), (error) => error.code === "BAIDU_COUNT_INVALID_RESPONSE");

let countRequest;
globalThis.fetch = async (url, options) => {
  countRequest = { url, options };
  return new Response('{"is_mushroom":true,"visible_count":2,"certainty":"medium","occluded":false,"reason":"两朵清晰可见。"}', { status: 200, headers: { "content-type": "application/json" } });
};
const estimated = await estimateMushroomCount({
  imageSrc: "data:image/jpeg;base64,////",
  config: getBaiduConfig(storage),
});
assert.equal(estimated.visible_count, 2);
assert.equal(estimated.canPrefill, true);
assert.equal(countRequest.url, "https://cfc.example.test/proxy");
assert.equal(countRequest.options.headers["X-Baidu-Api-Key"], "test-api-key");
const countSent = JSON.parse(countRequest.options.body);
assert.match(countSent.messages[0].content[1].text, /is_mushroom/);
assert.match(countSent.messages[0].content[1].text, /visible_count/);

globalThis.fetch = async () => {
  throw new Error("offline");
};
await assert.rejects(
  estimateMushroomCount({ imageSrc: "data:image/jpeg;base64,////", config: getBaiduConfig(storage) }),
  (error) => error.code === "BAIDU_NETWORK_ERROR",
);

globalThis.fetch = originalFetch;
clearBaiduConfig(storage);

const runtimeBundle = fs.readFileSync(new URL("../app/assets/index-BMXiw-qc.js", import.meta.url), "utf8");
assert.match(runtimeBundle, /compatRecognize=async\(\{imageSrc:e,guideEntries:t\}\)=>\{let n,r;try\{n=await baiduRecognize\(e,t,\[\]\)/);
assert.match(runtimeBundle, /RmTensor=async\(\{imageSrc:e,guideEntries:t\}\)=>\{let n,r;try\{n=await baiduRecognize\(e,t,\[\]\)/);
for (const staleCopy of [
  "先与本地图鉴对比，低把握时再用百度联网识别补充真实候选",
  "本地图鉴低置信时，图片会通过 CFC 发送给百度看图识万物",
  "本地 + 百度联网识别",
  "先看演示图鉴，后续再换成本地真实资料",
  "已先与图鉴中的",
]) {
  assert.equal(runtimeBundle.includes(staleCopy), false, `runtime bundle still contains stale recognition copy: ${staleCopy}`);
}
console.log("Baidu client and runtime checks passed: Baidu-first recognition, count parsing, safety gates, network failure and request options.");
