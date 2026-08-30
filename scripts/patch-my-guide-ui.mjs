import fs from "node:fs";

const bundlePath = new URL("../app/assets/index-BMXiw-qc.js", import.meta.url);
let source = fs.readFileSync(bundlePath, "utf8");

function replaceOnce(label, from, to) {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  source = source.replace(from, to);
}

if (source.includes('import("./my-guide-storage.js")') && source.includes("加入我的识别") && source.includes("我的识别（仅本机）")) {
  console.log("My guide UI patch already applied; no changes made.");
  process.exit(0);
}

replaceOnce(
  "my guide service helpers",
  'baiduEstimate=async e=>{const t=await baiduModule();return t.estimateMushroomCount({imageSrc:e,config:baiduConfig()})},Tm=',
  'baiduEstimate=async e=>{const t=await baiduModule();return t.estimateMushroomCount({imageSrc:e,config:baiduConfig()})},myGuideModule=()=>import("./my-guide-storage.js"),myGuideLoad=async()=>{const e=await myGuideModule(),t=await e.listEntries();return Promise.all(t.map(async n=>({...n,preview:n.imageKeys&&n.imageKeys[0]?await e.getImage(n.imageKeys[0]):null})))},myGuideSave=async e=>{const t=await myGuideModule();return t.savePending(e)},myGuideSetStatus=async(e,t)=>{const n=await myGuideModule();return n.setStatus(e,t)},myGuideDelete=async e=>{const t=await myGuideModule();return t.deleteEntry(e)},Tm='
);

replaceOnce(
  "my guide React state",
  '[w,_]=F.useState(null),[D,p]=F.useState(""),',
  '[w,_]=F.useState(null),[D,p]=F.useState(""),[myMode,setMyMode]=F.useState("fixed"),[myEntries,setMyEntries]=F.useState([]),[myMsg,setMyMsg]=F.useState(""),[myBusy,setMyBusy]=F.useState(!1),'
);

replaceOnce(
  "my guide handlers",
  'Ml=()=>{t({name:"guide"})},Fl=',
  'Ml=()=>{setMyMode("fixed"),setMyMsg(""),t({name:"guide"})},loadMyGuide=async()=>{setMyBusy(!0),setMyMsg("");try{setMyEntries(await myGuideLoad())}catch(m){console.error(m),setMyEntries([]),setMyMsg(String(m&&m.message||"无法读取我的识别，固定图鉴仍可正常使用。"))}finally{setMyBusy(!1)}},showMyGuide=()=>{setMyMode("mine"),loadMyGuide()},showFixedGuide=()=>{setMyMode("fixed"),setMyMsg("")},saveCurrentToGuide=async()=>{const m=w&&w.similar_species&&w.similar_species[0]&&w.similar_species[0].name;if(!m||!w||w.status==="not_mushroom"){setMyMsg("当前没有可保存的蘑菇候选。");return}setMyBusy(!0),setMyMsg("");try{const y=await myGuideSave({name:m,imageData:w.uploadedImage,featureSummary:w.feature_summary,sources:w.external_results});setMyMsg(y.deduplicated?"这张照片已经保存在“我的识别”中。":y.merged?"已把新照片合并到同名待确认记录。":"已保存到“我的识别”，当前状态为待确认。") }catch(y){console.error(y),setMyMsg(String(y&&y.message||"保存失败，请稍后重试。"))}finally{setMyBusy(!1)}},changeMyStatus=async m=>{setMyBusy(!0);try{await myGuideSetStatus(m.id,m.status==="confirmed"?"pending":"confirmed"),await loadMyGuide()}catch(y){console.error(y),setMyMsg(String(y&&y.message||"状态修改失败。"))}finally{setMyBusy(!1)}},removeMyEntry=async m=>{if(!window.confirm(`确定删除“${m.name&&m.name.common||"这条记录"}”吗？删除后本机照片也会移除。`))return;setMyBusy(!0);try{await myGuideDelete(m.id),await loadMyGuide()}catch(y){console.error(y),setMyMsg(String(y&&y.message||"删除失败。"))}finally{setMyBusy(!1)}},Fl='
);

replaceOnce(
  "result save card",
  's.jsx("p",{className:"muted-text",children:"联网结果来自百度接口，仅供参考，不能作为食用依据。"})]}):null]}):null,Nd=()=>',
  's.jsx("p",{className:"muted-text",children:"联网结果来自百度接口，仅供参考，不能作为食用依据。"})]}):null,w.status!=="not_mushroom"&&w.similar_species&&w.similar_species.length?s.jsxs("section",{className:"card",children:[s.jsx("div",{className:"section-header",children:s.jsxs("div",{children:[s.jsx("p",{className:"eyebrow",children:"个人图鉴"}),s.jsx("h2",{children:"保存这次识别"})]})}),s.jsx("p",{className:"muted-text",children:"保存用户原图和百度参考资料，默认进入待确认；不会保存 API Key，也不会自动认定物种或可食用。"}),s.jsx("button",{className:"primary-button",type:"button",onClick:saveCurrentToGuide,disabled:myBusy,children:myBusy?"正在保存...":"加入我的识别"}),myMsg?s.jsx("p",{className:"assist-hint",children:myMsg}):null]}):null]}):null,Nd=()=>'
);

replaceOnce(
  "guide page tabs and list",
  'Cd=()=>s.jsx("div",{className:"screen",children:s.jsxs("section",{className:"card",children:[s.jsxs("div",{className:"section-header",children:[s.jsxs("div",{children:[s.jsx("p",{className:"eyebrow",children:"本地图鉴"}),s.jsx("h2",{children:"黄水镇常见重点种展示区"})]}),s.jsx("span",{className:"section-tip",children:"公开资料 + 实拍图"})]}),s.jsx("div",{className:"guide-list",children:mi.map(m=>s.jsxs("button",{className:"guide-card",type:"button",onClick:()=>nd(m),children:[s.jsx("img",{src:m.images[0],alt:m.name}),s.jsxs("div",{children:[s.jsx("div",{className:"guide-card-head",children:s.jsx("strong",{children:m.name})}),s.jsx("p",{children:m.features.join(" · ")})]})]},m.id))})]})}),Pd=()=>',
  'Cd=()=>s.jsx("div",{className:"screen",children:s.jsxs("section",{className:"card",children:[s.jsxs("div",{className:"section-header",children:[s.jsxs("div",{children:[s.jsx("p",{className:"eyebrow",children:myMode==="mine"?"我的识别（仅本机）":"本地图鉴"}),s.jsx("h2",{children:myMode==="mine"?"我保存过的识别":"黄水镇常见重点种展示区"})]}),s.jsx("span",{className:"section-tip",children:myMode==="mine"?"待确认与已确认分开":"公开资料 + 实拍图"})]}),s.jsxs("div",{className:"button-row",children:[s.jsx("button",{className:myMode==="fixed"?"primary-button":"secondary-button",type:"button",onClick:showFixedGuide,children:"黄水图鉴"}),s.jsx("button",{className:myMode==="mine"?"primary-button":"secondary-button",type:"button",onClick:showMyGuide,children:"我的识别"})]}),myMode==="fixed"?s.jsx("div",{className:"guide-list",children:mi.map(m=>s.jsxs("button",{className:"guide-card",type:"button",onClick:()=>nd(m),children:[s.jsx("img",{src:m.images[0],alt:m.name}),s.jsxs("div",{children:[s.jsx("div",{className:"guide-card-head",children:s.jsx("strong",{children:m.name})}),s.jsx("p",{children:m.features.join(" · ")})]})]},m.id))}):s.jsxs(s.Fragment,{children:[myMsg?s.jsx("p",{className:"assist-hint",children:myMsg}):null,myBusy&&myEntries.length===0?s.jsx("div",{className:"empty-state",children:"正在读取我的识别..."}):null,!myBusy&&myEntries.length===0?s.jsx("div",{className:"empty-state",children:"还没有保存识别结果。识别蘑菇后，可在结果页加入这里。"}):null,s.jsx("div",{className:"guide-list",children:myEntries.map(m=>s.jsxs("article",{className:"guide-card",children:[m.preview?s.jsx("img",{src:m.preview,alt:m.name&&m.name.common||"我的识别照片"}):s.jsx("div",{className:"empty-state",children:"照片不可用"}),s.jsxs("div",{children:[s.jsx("div",{className:"guide-card-head",children:s.jsx("strong",{children:m.name&&m.name.common||"未命名候选"})}),s.jsx("p",{children:m.status==="confirmed"?"已由用户确认（仍不能作为食用依据）":"待确认，不参与本地识别"}),s.jsx("p",{className:"muted-text",children:`已保存 ${m.evidence&&m.evidence.evidenceCount||1} 次识别证据`}),s.jsxs("div",{className:"button-row",children:[s.jsx("button",{className:"secondary-button",type:"button",disabled:myBusy,onClick:()=>changeMyStatus(m),children:m.status==="confirmed"?"改回待确认":"确认名称"}),s.jsx("button",{className:"danger-button",type:"button",disabled:myBusy,onClick:()=>removeMyEntry(m),children:"删除"})]})]})]},m.id))})]})]})}),Pd=()=>'
);

fs.writeFileSync(bundlePath, source);
console.log("My guide UI patch applied.");
