import fs from "node:fs";

const bundlePath = new URL("../app/assets/index-BMXiw-qc.js", import.meta.url);
let source = fs.readFileSync(bundlePath, "utf8");

function replaceOnce(label, from, to) {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  source = source.replace(from, to);
}

function replaceRegex(label, pattern, replacement) {
  const matches = source.match(pattern);
  if (!matches || matches.length !== 1) throw new Error(`${label}: expected exactly one match, found ${matches?.length || 0}`);
  source = source.replace(pattern, replacement);
}

const copyUpdates = [
  [
    "先与本地图鉴对比，低把握时再用百度联网识别补充真实候选",
    "优先使用百度联网识别，本地图鉴仅作补充参考",
  ],
  [
    "本地图鉴低置信时，图片会通过 CFC 发送给百度看图识万物；返回真实候选、描述、搜索资料和百科链接。百度 Key 只保存在本手机。",
    "图片会优先通过 CFC 发送给百度看图识万物；百度不可用时才使用本地图鉴参考。百度 Key 只保存在本手机。",
  ],
  ["本地 + 百度联网识别", "百度优先 · 本地图鉴参考"],
  ["已先与图鉴中的", "本地图鉴中包含"],
  [
    "先与本地图鉴对比，如果没有高把握匹配，再用浏览器联网搜索补充参考",
    "优先调用百度联网识别；百度不可用时再用本地图鉴提供参考",
  ],
  ["浏览器识别", "百度联网识别优先"],
  ["翻译服务设置", "识别服务设置"],
  ["正在识别并整理中文结果……", "正在调用百度联网识别……"],
  [
    "上传后会先与本地图鉴做种类比对；如果图鉴中没有高把握匹配，再联网搜索补充参考结果。",
    "上传后优先调用百度联网识别；百度不可用时再用本地图鉴提供参考。",
  ],
  [
    "照片已载入，可以开始进行图鉴比对与联网补充识别。",
    "照片已载入，识别时优先调用百度；百度不可用时再使用本地图鉴参考。",
  ],
  ["先看演示图鉴，后续再换成本地真实资料", "查看本地图鉴，百度识别结果优先展示"],
  ["演示图鉴", "本地图鉴"],
  ["黄水图鉴", "本地图鉴"],
];

let copyChanged = false;
for (const [oldCopy, newCopy] of copyUpdates) {
  if (source.includes(oldCopy)) {
    source = source.split(oldCopy).join(newCopy);
    copyChanged = true;
  }
}

if (source.includes('import("./baidu-recognition.js")') && source.includes("baiduRecognize(e,t,[])")) {
  if (copyChanged) fs.writeFileSync(bundlePath, source);
  console.log(copyChanged ? "Baidu recognition copy updated." : "Baidu recognition patch already applied; no changes made.");
  process.exit(0);
}

const serviceHelpers = 'baiduModule=()=>import("./baidu-recognition.js"),baiduConfig=()=>{try{const e=JSON.parse(window.localStorage.getItem("huangshui-baidu-recognition-config-v1")||"{}");return{apiKey:typeof(e==null?void 0:e.apiKey)==="string"?e.apiKey.trim():"",proxyUrl:typeof(e==null?void 0:e.proxyUrl)==="string"?e.proxyUrl.trim():""}}catch{return{apiKey:"",proxyUrl:""}}},baiduRecognize=async(e,t,n)=>{const r=await baiduModule();return r.recognizeWithBaidu({imageSrc:e,guideEntries:t,localCandidates:n,config:baiduConfig()})},';

// The previous patch returned a handful of static links. Keep the local
// fallback useful and honest, but never present those links as recognition.
replaceRegex("remove fixed search links", /Pm=e=>.*?},Tm=async/, "Pm=()=>\"\",Lm=async()=>[],Tm=async");
// Insert after the old Pm/Lm block has been replaced; otherwise the broad
// fixed-link matcher would consume this helper as part of the old block.
replaceOnce("Baidu service helpers", "Tm=async(", `${serviceHelpers}Tm=async(`);
replaceRegex(
  "local uncertain fallback",
  /Tm=async\(e,t,n\)=>\{.*?\},zm=async/,
  'Tm=(e,t,n,r)=>{var l;const i=e.slice(0,3),o=i.map(c=>c.entry.images[0]),a=r&&r.message?r.message:"百度联网识别暂时不可用，请稍后重试。",u=i[0];return{status:"uncertain",title:"暂未完成百度联网识别",subtitle:`百度联网识别未完成，现使用本地图鉴提供 ${n.length} 个候选参考（结果未确认）。`,warning_message:"请不要仅凭本次结果采食；配置百度联网识别后可以重新尝试。",reference_images:o,feature_summary:[`图鉴中最接近“${((l=u)==null?void 0:l.entry.name)??"未知种类"}”，但没有达到确认阈值。`,a,"本次没有把固定搜索链接当作识别结果；请配置百度 CFC 后重试。"],similar_species:i.map(c=>({name:c.entry.name,difference:`图鉴近似匹配，相似度约 ${Math.round(c.similarity*100)}%，当前不能直接认定为该种。`})),external_results:[],external_status:"not_configured",source_label:"本地图鉴兜底 · 未确认"}},zm=async'
);

const oldCompat = /compatRecognize=async\(\{imageSrc:e,guideEntries:t\}\)=>\{.*?\},RmTensor=async/;
const newCompat = "compatRecognize=async({imageSrc:e,guideEntries:t})=>{let n,r;try{n=await baiduRecognize(e,t,[])}catch(l){r=l}if(n)return n;const l=await compatImageFeatures(e),i=await(compatGuideCache.promise||(compatGuideCache.promise=Promise.all(t.map(async o=>({entry:o,embedding:await compatImageFeatures(o.images[0]),aliases:km[o.id]??[\"mushroom\"]}))))),a=i.map(u=>{const c=compatSimilarity(l,u.embedding);return{...u,similarity:c,aliasScore:0,totalScore:c}}).sort((u,c)=>c.totalScore-u.totalScore);return Tm(a,[],t,r)},RmTensor=async";
replaceRegex("compatibility recognition fallback", oldCompat, newCompat);

const oldTensor = /RmTensor=async\(\{imageSrc:e,guideEntries:t\}\)=>\{.*?\},Rm=async e=>/;
const newTensor = "RmTensor=async({imageSrc:e,guideEntries:t})=>{let n,r;try{n=await baiduRecognize(e,t,[])}catch(l){r=l}if(n)return n;const i=await qc(),o=await Xc(e),[a,u]=await Promise.all([recognitionTimeout(i.classify(o,5),12e3,\"图像分类超时，请重试。\"),recognitionTimeout(Zc(i.infer(o,!0)),12e3,\"图像特征提取超时，请重试。\")]),c=await Em(t,i);if(c.length===0)throw new Error(\"本地图鉴图片暂时无法加载，请稍后重试。\");const v=c.map(f=>{const m=Sm(u,f.embedding),h=_m(a,f.aliases);return{...f,similarity:m,aliasScore:h,totalScore:m*.82+h*.18}}).sort((f,m)=>m.totalScore-f.totalScore);return Tm(v,a,t,r)},Rm=async e=>";
replaceRegex("TensorFlow recognition fallback", oldTensor, newTensor);

replaceOnce(
  "Baidu configuration state",
  '[d,f]=F.useState("checking"),[x,N]=F.useState(""),[L,E]=F.useState(""),[j,I]=F.useState(gm)',
  '[d,f]=F.useState("checking"),[x,N]=F.useState(""),[L,E]=F.useState(""),[bkey,setBkey]=F.useState(""),[bproxy,setBproxy]=F.useState(""),[bstatus,setBstatus]=F.useState("unconfigured"),[bmsg,setBmsg]=F.useState(""),[j,I]=F.useState(gm)'
);

replaceOnce(
  "Baidu settings open state",
  'ps=()=>{N(""),E(""),t({name:"translationSettings"}),rd()}',
  'ps=()=>{N(""),E(""),setBkey(""),setBmsg("");const m=baiduConfig();setBproxy(m.proxyUrl),setBstatus(m.apiKey&&m.proxyUrl?"configured":"unconfigured"),t({name:"translationSettings"}),rd()}'
);

replaceOnce(
  "Baidu settings handlers",
  '},od=async()=>{try{await $m(),N(""),f("unconfigured"),E("已从本手机清除翻译密钥。")}catch{E("暂时无法清除翻译密钥，请稍后重试。")}},sd=async',
  '},saveBaidu=()=>{if(!We()){setBmsg("请在 Android App 中配置百度联网识别。"),setBstatus("unconfigured");return}const m=bkey.trim()||baiduConfig().apiKey,y=bproxy.trim().replace(/\\/$/,"");if(!m){setBmsg("请填写百度 API Key；保存后密钥只保存在本手机。"),setBstatus("unconfigured");return}if(!/^https:\\/\\//i.test(y)){setBmsg("CFC 代理地址必须以 https:// 开头。"),setBstatus("unconfigured");return}window.localStorage.setItem("huangshui-baidu-recognition-config-v1",JSON.stringify({apiKey:m,proxyUrl:y})),setBkey(""),setBstatus("configured"),setBmsg("百度联网识别配置已保存；识别时将优先调用百度，失败时再用本地图鉴兜底。")},clearBaidu=()=>{window.localStorage.removeItem("huangshui-baidu-recognition-config-v1"),setBkey(""),setBproxy(""),setBstatus("unconfigured"),setBmsg("已从本手机清除百度联网识别配置。")},od=async()=>{try{await $m(),N(""),f("unconfigured"),E("已从本手机清除翻译密钥。")}catch{E("暂时无法清除翻译密钥，请稍后重试。")}},sd=async'
);

replaceOnce(
  "Baidu recognition error detail",
  'p(y.includes("超时")||y.includes("加载")?y:/backend|webgl|shader|texture|tensor|predict|execute/i.test(y)?"手机图像计算组件不兼容，请重新打开应用后重试。":"识别计算没有完成，请重新选择照片后再试。")',
  'p(y.includes("超时")||y.includes("加载")||/百度|联网|配置|密钥|接口|重试/.test(y)?y:/backend|webgl|shader|texture|tensor|predict|execute/i.test(y)?"手机图像计算组件不兼容，请重新打开应用后重试。":"识别计算没有完成，请重新选择照片后再试。")'
);

replaceOnce(
  "Baidu recognition copy",
  '第三步：如果本地图鉴没有高把握命中，会提供百度、物种2000和中科院植物智的国内查询入口。',
  '第三步：优先通过 CFC 调用百度看图识万物，展示真实候选、描述、搜索资料和百科结果；百度失败时再使用本地图鉴作为参考。'
);

replaceRegex(
  "recognition settings screen",
  /_d=\(\)=>\{.*?\},jd=\(\)=>/,
  '_d=()=>{const m={checking:"正在检查",unconfigured:"未配置",configured:"已配置",validating:"验证中",invalid:"密钥无效",unavailable:"仅 Android App 可配置"},y=We()&&d!=="validating"&&x.trim().length>0,A=We()&&!["checking","validating","unconfigured","unavailable"].includes(d),B={checking:"正在检查",unconfigured:"未配置",configured:"已配置"}[bstatus]??"未配置",C=We()&&bstatus!=="configured"&&!bkey.trim(),D=We()&&(bkey.trim()||baiduConfig().apiKey)&&bproxy.trim();return s.jsx("div",{className:"screen",children:s.jsxs(s.Fragment,{children:[s.jsx("section",{className:"card translation-settings-card",children:s.jsxs(s.Fragment,{children:[s.jsxs("div",{className:"section-header",children:[s.jsxs("div",{children:[s.jsx("p",{className:"eyebrow",children:"家人设置"}),s.jsx("h2",{children:"DeepSeek 中文翻译"})]}),s.jsx("span",{className:"translation-status "+d,children:m[d]??"未配置"})]}),s.jsx("p",{className:"muted-text",children:"密钥会由 Android Keystore 保护并加密保存在本手机中。DeepSeek 继续只负责中文翻译，不参与蘑菇候选识别。"}),s.jsxs("label",{className:"field",children:[s.jsx("span",{children:"DeepSeek API Key"}),s.jsx("input",{type:"password",value:x,onChange:ue=>N(ue.target.value),placeholder:"请输入 API Key",autoComplete:"off",autoCapitalize:"none",spellCheck:"false",disabled:!We()||d==="validating"})]}),s.jsxs("div",{className:"settings-actions",children:[s.jsx("button",{className:"primary-button",type:"button",onClick:id,disabled:!y,children:d==="validating"?"正在验证……":"验证并保存"}),s.jsx("button",{className:"danger-button",type:"button",onClick:od,disabled:!A,children:"清除密钥"})]}),L?s.jsx("p",{className:"assist-hint",children:L}):null,We()?null:s.jsx("p",{className:"assist-hint",children:"网页演示不会保存或使用密钥，请在安装到 Android 手机后完成设置。"}),s.jsx("p",{className:"security-note",children:"这是供家人个人使用的设备端方案。请为该密钥保留少量余额，不要与其他重要业务共用。"})]})}),s.jsx("section",{className:"card translation-settings-card",children:s.jsxs(s.Fragment,{children:[s.jsxs("div",{className:"section-header",children:[s.jsxs("div",{children:[s.jsx("p",{className:"eyebrow",children:"家人设置"}),s.jsx("h2",{children:"百度联网识别"})]}),s.jsx("span",{className:"translation-status "+bstatus,children:B})]}),s.jsx("p",{className:"muted-text",children:"识别时优先通过 CFC 调用百度看图识万物；百度不可用时才使用本地图鉴参考。返回真实候选、描述、搜索资料和百科链接。百度 Key 只保存在本手机。"}),s.jsxs("label",{className:"field",children:[s.jsx("span",{children:"CFC 代理 URL"}),s.jsx("input",{type:"url",value:bproxy,onChange:ue=>setBproxy(ue.target.value),placeholder:"https://你的CFC触发器地址",autoComplete:"off",autoCapitalize:"none",spellCheck:"false",disabled:!We()})]}),s.jsxs("label",{className:"field",children:[s.jsx("span",{children:"百度 API Key"}),s.jsx("input",{type:"password",value:bkey,onChange:ue=>setBkey(ue.target.value),placeholder:D?"已配置（如需更换请重新输入）":"请输入百度 API Key",autoComplete:"off",autoCapitalize:"none",spellCheck:"false",disabled:!We()})]}),s.jsxs("div",{className:"settings-actions",children:[s.jsx("button",{className:"primary-button",type:"button",onClick:saveBaidu,disabled:!We()||(!bkey.trim()&&!baiduConfig().apiKey)||!bproxy.trim(),children:"保存百度配置"}),s.jsx("button",{className:"danger-button",type:"button",onClick:clearBaidu,disabled:!We()||(!D&&!bproxy.trim()),children:"清除百度配置"})]}),bmsg?s.jsx("p",{className:"assist-hint",children:bmsg}):null,We()?null:s.jsx("p",{className:"assist-hint",children:"网页演示不会调用百度；请在安装到 Android 手机后长按首页标题完成设置。"}),s.jsx("p",{className:"security-note",children:"CFC 只作跨域转发，不保存 Key。百度联网结果仅供参考，野生蘑菇请以专业鉴定和当地安全指引为准。"})]})})]})})},jd=()=>'
);

fs.writeFileSync(bundlePath, source);
console.log("Baidu recognition patch applied.");
