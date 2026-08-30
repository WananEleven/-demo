import assert from "node:assert/strict";
import fs from "node:fs";
import { parseBaiduSse, recognizeWithBaidu, saveBaiduConfig, getBaiduConfig, clearBaiduConfig } from "../app/assets/baidu-recognition.js";

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
console.log("Baidu client and runtime priority checks passed: mushroom, non-mushroom, SSE aggregation, request options and Baidu-first copy.");
