import assert from "node:assert/strict";
import fs from "node:fs";

const bundle = fs.readFileSync(new URL("../app/assets/index-BMXiw-qc.js", import.meta.url), "utf8");
for (const expected of [
  'import("./my-guide-storage.js")',
  "myGuideSave",
  "myGuideLoad",
  "myGuideSetStatus",
  "myGuideDelete",
  "加入我的识别",
  "我的识别（仅本机）",
  "待确认，不参与本地识别",
  "不会保存 API Key",
]) {
  assert.equal(bundle.includes(expected), true, `missing my-guide UI marker: ${expected}`);
}
assert.equal(bundle.includes("pending条目自动参与识别"), false);
console.log("My guide UI static checks passed: save, list, status, delete and safety copy are wired.");
