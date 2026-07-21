'use strict';

const VERSION = '2.1.0 Build 023 + Order Import / Field Sheet';
const INSPECTION_PREFIX = 'organizealot_insp_';
const SETTINGS_KEY = 'organizealot_settings_023';
const OCR_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const DB_NAME = 'OrganizeALotPhotos';
const DB_VERSION = 1;
const PHOTO_STORE = 'photos';
const MIN_DETACHED_GAP_FT = 15;
const DETACHED_SHAPE_TYPES = new Set(['other_living','detached_garage','outbuilding']);

const NIIS_SECTIONS = [
  {name:'House Exterior',items:[
    ['front','Front of Home','Full front including roofline.'],['rear','Rear of Home','Full rear when accessible.'],['left','Left Side','Full left elevation.'],['right','Right Side','Full right elevation.'],['address','Address Verification','House number, mailbox, curb, or sign.'],['roof_front','Roof - Front','Ground-level or safe raised view.'],['roof_rear','Roof - Rear','Ground-level or safe raised view.'],['foundation','Foundation','Representative foundation view.'],['exterior_material','Exterior Wall Material','Representative siding, brick, stone, or other wall material.']
  ]},
  {name:'Interior',items:[
    ['level_1','Level 1 Overview','At least one representative photo.'],['level_2','Level 2 / Landing','Required when present.'],['basement','Basement','Representative interior and exterior wall type when present.'],['kitchen_1','Kitchen 1','Main kitchen overview.'],['kitchen_2','Kitchen 2','Second kitchen angle.'],['bathrooms','All Bathrooms','Add one or more photos for every bathroom.'],['living_room','Living Room','Representative living area.'],['electrical','Electrical Panel','Clear panel, breakers, manufacturer, and labels.'],['water_heater','Water Heater','Full unit and data plate when accessible.'],['heating','Heating System','Main heating equipment and data plate when accessible.']
  ]},
  {name:'Outbuildings & Exposures',items:[
    ['outbuildings','All Outbuildings','Detached garage, shed, barn, guest house, or other structures.'],['large_outbuilding','Outbuilding Over 400 sq ft','Perimeter views plus two roof views when present.'],['pool_spa','Pools / Spas','Show pool/spa and fencing or safety features.'],['hud_label','HUD Label - Manufactured Home','Required when applicable.'],['hazards','Damage / Hazards','Any visible concern, damage, or unusual exposure.']
  ]}
];

const PREFERRED_SECTIONS = [
  ['Property Verification',[['pr_front','Front View','Front of property/building.'],['pr_address','Address Verification','Clear address verification.']]],
  ['Building Exterior',[['pr_left','Left Side','Full left elevation.'],['pr_right','Right Side','Full right elevation.'],['pr_rear','Rear View','Rear when possible.'],['pr_material','Exterior Materials','Representative exterior construction.']]],
  ['Roof',[['pr_roof','Roof Views','Safe representative roof views and close-ups.']]],
  ['Grounds & Walkways',[['pr_walkways','Driveways / Sidewalks / Walkways','Show condition and hazards.'],['pr_fence','Fencing / Security','Show perimeter fencing and gates.'],['pr_lighting','Exterior Lighting','Representative exterior fixtures.']]],
  ['Parking Areas',[['pr_parking','Parking Lots / Areas','Wide views and condition.']]],
  ['Stairs, Railings & Balconies',[['pr_stairs','Steps / Stairs / Balconies','All representative areas.'],['pr_railings','Railings / Baluster Spacing','Show spacing and balcony height.']]],
  ['Common Areas',[['pr_common_ext','Exterior Common Areas','Courtyards, breezeways, recreation areas.'],['pr_common_int','Interior Common Areas','Hallways, mail rooms, gyms, offices, clubhouses.']]],
  ['Interior Unit / Business',[['pr_interior','Interior Areas','Required interior access areas.'],['pr_entry','Entry / Exit Points','Representative entry and exit doors.']]],
  ['Electrical',[['pr_electrical','Circuit Breaker Panels','Clear breakers, manufacturer, serial number, and labels.']]],
  ['Mechanical & Water Heating',[['pr_mechanical','Heating / Mechanical','Equipment and identifying labels.'],['pr_water_heater','Water Heaters','Full unit and identifying labels.']]],
  ['Fire & Life Safety',[['pr_smoke','Smoke / CO Detectors','Representative devices.'],['pr_extinguisher','Fire Extinguishers','Location, condition, and tags.'],['pr_alarm','Fire / Burglar Alarm Panel','Panel when present.'],['pr_sprinkler','Sprinkler Riser / Tag','Required when applicable.']]],
  ['Additional Buildings / Exposures',[['pr_buildings','Additional Buildings','All additional buildings and structures.'],['pr_pool','Swimming Pools','Show fencing, slides, and diving boards.'],['pr_cooking','Commercial Cooking','Cooking line, hood, suppression, fuel, and extinguishers when applicable.']]],
  ['Hazards / Additional Photos',[['pr_hazards','All Hazards','Photograph every visible hazard.'],['pr_additional','Additional Exposure Photos','Anything needed to explain the risk.']]]
].map(([name,items])=>({name,items}));

const OBS_SECTIONS = [{name:'OBS Exterior Photos',items:[
  ['obs_front','Front','Full front including roofline.'],['obs_angle','Front Angle','Front and one side.'],['obs_left','Left Side','Full left elevation.'],['obs_rear','Rear','Full rear when accessible.'],['obs_right','Right Side','Full right elevation.'],['obs_roof','Roof','Best visible safe roof view.'],['obs_address','Address','House number, mailbox, curb, or sign.'],['obs_outbuildings','Outbuildings','All visible detached structures.'],['obs_hazards','Damage / Hazards','Any visible concern.']
]}];

const SHAPE_TYPES = {
  main_living:'Main House Living Area', other_living:'Other Living Area', attached_garage:'Attached Garage',
  covered_porch:'Covered Porch', deck:'Deck / Uncovered Porch', detached_garage:'Detached Garage', outbuilding:'Outbuilding'
};
const DIRS = {F:{dx:0,dy:-1,label:'Forward'},R:{dx:1,dy:0,label:'Right'},B:{dx:0,dy:1,label:'Back'},L:{dx:-1,dy:0,label:'Left'}};

const state = {current:null,pendingItem:null,pendingFile:null,pendingDataUrl:null,selectedDir:'F',deferredInstall:null,db:null,orderScreenshotFile:null,orderReturnScreen:'setupScreen'};
const $ = id => document.getElementById(id);
const screens = ['homeScreen','setupScreen','orderImportScreen','dashboardScreen','photosScreen','cameraScreen','sketchScreen','reviewScreen','settingsScreen'];

function show(id){
  screens.forEach(s=>$(s).classList.toggle('active',s===id));
  if(id==='homeScreen') renderSaved();
  if(id==='dashboardScreen') renderDashboard();
  if(id==='photosScreen') renderPhotos();
  if(id==='sketchScreen') renderSketch();
  window.scrollTo(0,0);
}
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function uid(prefix='id'){return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;}
function sanitizeFileName(v){return String(v||'inspection').replace(/[\\/:*?"<>|]+/g,'_').trim()||'inspection';}
function fmt(n){return Number(n||0).toLocaleString(undefined,{maximumFractionDigits:1});}
function settings(){try{return {...{galleryBackup:false},...JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')};}catch{return {galleryBackup:false};}}

function sectionsFor(type){if(type==='Preferred Reports')return PREFERRED_SECTIONS;if(type==='OBS')return OBS_SECTIONS;return NIIS_SECTIONS;}
function newInspection(type){
  const inspection={
    key:INSPECTION_PREFIX+uid('insp'),type,inspectionId:'',address:'',insuredName:'',inspector:'Chris Roberts',
    created:new Date().toISOString(),updated:new Date().toISOString(),photoItems:{},shapes:[],orderInfo:{}
  };
  sectionsFor(type).forEach(section=>section.items.forEach(([key,title,help])=>{
    inspection.photoItems[key]={key,title,help,section:section.name,required:true,photoIds:[],note:'',cannotGet:false};
  }));
  state.current=inspection;
}
function saveInspection(){
  if(!state.current)return;
  if(!state.current.inspectionId.trim()||!state.current.address.trim())return;
  state.current.updated=new Date().toISOString();
  localStorage.setItem(state.current.key,JSON.stringify(state.current));
}
function allInspections(){
  return Object.keys(localStorage).filter(k=>k.startsWith(INSPECTION_PREFIX)).map(k=>{
    try{return JSON.parse(localStorage.getItem(k));}catch{return null;}
  }).filter(Boolean).sort((a,b)=>new Date(b.updated)-new Date(a.updated));
}
function renderSaved(){
  const all=allInspections();
  renderSavedGroup($('resumeList'),all.slice(0,6),'No saved inspections yet.');
  renderSavedGroup($('archiveList'),all.slice(6),'No archived inspections.');
  $('archiveDetails').classList.toggle('hidden',all.length<=6);
}
function renderSavedGroup(box,items,empty){
  box.innerHTML='';
  if(!items.length){box.innerHTML=`<p class="muted">${empty}</p>`;return;}
  items.forEach(item=>{
    const b=document.createElement('button');b.className='saved-item';
    b.innerHTML=`<strong>${escapeHtml(item.type)} — ${escapeHtml(item.inspectionId||'No ID')}</strong><br><small>${escapeHtml(item.address||'No address')} · ${new Date(item.updated).toLocaleString()}</small>`;
    b.onclick=()=>{state.current=item;show('dashboardScreen');};box.appendChild(b);
  });
}
function renderDashboard(){
  const c=state.current;if(!c)return;
  $('dashTitle').textContent=`${c.type} Inspection`;
  $('dashMeta').textContent=`${c.inspectionId} • ${c.address}${c.insuredName?` • ${c.insuredName}`:''}`;
  const items=Object.values(c.photoItems||{});const complete=items.filter(i=>i.photoIds.length||i.cannotGet).length;
  $('photoProgressText').textContent=`${complete}/${items.length} required complete`;
  const totals=calculateTotals(c.shapes||[]);
  $('sketchSummaryText').textContent=c.type==='OBS'?'Not required':c.shapes?.length?`${fmt(totals.main_living)} main living sq ft`:'No sketch yet';
  $('sketchBtn').classList.toggle('hidden',c.type==='OBS');$('obsNotice').classList.toggle('hidden',c.type!=='OBS');
}
function openWaze(address){
  const q=encodeURIComponent(address||'');if(!q)return;
  window.open(`https://www.waze.com/ul?q=${q}&navigate=yes`,'_blank','noopener');
}


const ORDER_FIELDS = {
  inspectionId:'orderInspectionId',policyNumber:'orderPolicyNumber',valuationId:'orderValuationId',insuredName:'orderInsuredName',
  streetAddress:'orderStreetAddress',cityStateZip:'orderCityStateZip',phone:'orderPhone',county:'orderCounty',
  dateOrdered:'orderDateOrdered',dateDue:'orderDateDue',dateEffective:'orderDateEffective',yearBuilt:'orderYearBuilt',
  squareFeet:'orderSquareFeet',coverageA:'orderCoverageA',client:'orderClient',reportType:'orderReportType',preferredContact:'orderPreferredContact'
};
function blankOrderInfo(){return{inspectionId:'',policyNumber:'',valuationId:'',insuredName:'',streetAddress:'',cityStateZip:'',phone:'',county:'',dateOrdered:'',dateDue:'',dateEffective:'',yearBuilt:'',squareFeet:'',coverageA:'',client:'',reportType:'',preferredContact:'',appointmentRequired:false};}
function currentOrderInfo(){
  const c=state.current||{};const oi={...blankOrderInfo(),...(c.orderInfo||{})};
  oi.inspectionId=oi.inspectionId||c.inspectionId||'';oi.insuredName=oi.insuredName||c.insuredName||'';
  if(!oi.streetAddress&&!oi.cityStateZip&&c.address){oi.streetAddress=c.address;}
  return oi;
}
function setOrderForm(info={}){
  const oi={...blankOrderInfo(),...info};
  Object.entries(ORDER_FIELDS).forEach(([key,id])=>{if($(id))$(id).value=oi[key]||'';});
  $('orderAppointmentRequired').checked=!!oi.appointmentRequired;
}
function getOrderForm(){
  const oi=blankOrderInfo();Object.entries(ORDER_FIELDS).forEach(([key,id])=>{oi[key]=$(id).value.trim();});
  oi.appointmentRequired=$('orderAppointmentRequired').checked;return oi;
}
function joinOrderAddress(oi){return [oi.streetAddress,oi.cityStateZip].filter(Boolean).join(', ');}
function openOrderImport(returnScreen='setupScreen'){
  state.orderReturnScreen=returnScreen;state.orderScreenshotFile=null;$('orderScreenshotInput').value='';$('orderScreenshotPreview').src='';$('orderScreenshotPreview').classList.add('hidden');$('readOrderScreenshotBtn').disabled=true;$('orderOcrStatus').textContent='No screenshot selected.';
  setOrderForm(currentOrderInfo());show('orderImportScreen');
}
function applyOrderInfo({returnAfter=true}={}){
  if(!state.current)return false;const oi=getOrderForm();state.current.orderInfo=oi;
  if(oi.inspectionId)state.current.inspectionId=oi.inspectionId;
  if(oi.insuredName)state.current.insuredName=oi.insuredName;
  const fullAddress=joinOrderAddress(oi);if(fullAddress)state.current.address=fullAddress;
  if($('inspectionId'))$('inspectionId').value=state.current.inspectionId||'';
  if($('insuredName'))$('insuredName').value=state.current.insuredName||'';
  if($('address'))$('address').value=state.current.address||'';
  saveInspection();
  if(returnAfter)show(state.orderReturnScreen||'setupScreen');
  return true;
}
function lineValue(text,labelPattern){
  const re=new RegExp('(?:^|\\n)\\s*'+labelPattern+'\\s*[:#]?\\s*([^\\n]+)','i');const m=String(text||'').match(re);return m?m[1].trim():'';
}
function cleanOcrValue(v){return String(v||'').replace(/[|]/g,'I').replace(/\s{2,}/g,' ').trim();}
function firstCapture(text,patterns){for(const p of patterns){const m=String(text||'').match(p);if(m&&m[1])return cleanOcrValue(m[1]);}return'';}
function parseNiisOrderText(raw){
  const text=String(raw||'').replace(/\r/g,'').replace(/[“”]/g,'"');const one=text.replace(/[ \t]+/g,' ');
  const oi=blankOrderInfo();
  oi.inspectionId=firstCapture(text,[/\bID\s*#\s*([A-Z0-9-]{5,20})\b/i,/Inspection\s*(?:ID|#)\s*[:#]?\s*([A-Z0-9-]{4,20})/i]);
  oi.policyNumber=firstCapture(text,[/Policy\s*#?\s*:?\s*([A-Z0-9-]{5,30})/i]);
  oi.valuationId=firstCapture(text,[/Valuation\s*ID\s*:?\s*([A-Z0-9-]+)/i]);
  oi.insuredName=firstCapture(text,[/(?:^|\n)\s*Insured\s*:?\s*([^\n]+)/i]);
  oi.streetAddress=firstCapture(text,[/(?:^|\n)\s*Address\s*:?\s*([^\n]+)/i]);
  oi.cityStateZip=firstCapture(text,[/(?:^|\n)\s*City\s*\/\s*State\s*\/\s*Zip\s*:?\s*([^\n]+)/i,/(?:^|\n)\s*City\/State\/Zip\s*:?\s*([^\n]+)/i]);
  oi.phone=firstCapture(text,[/(?:^|\n)\s*Phone\s*:?\s*([0-9()\- .]{7,20})/i]);
  oi.dateOrdered=firstCapture(text,[/Date\s*Ordered\s*:?\s*([0-9]{1,2}[\/.-][0-9]{1,2}[\/.-][0-9]{2,4})/i]);
  oi.dateDue=firstCapture(text,[/Date\s*Due\s*:?\s*([0-9]{1,2}[\/.-][0-9]{1,2}[\/.-][0-9]{2,4})/i]);
  oi.dateEffective=firstCapture(text,[/Date\s*Effective\s*:?\s*([0-9]{1,2}[\/.-][0-9]{1,2}[\/.-][0-9]{2,4})/i]);
  oi.client=firstCapture(text,[/(?:^|\n)\s*Client\s*:?\s*([^\n]+)/i]);
  oi.yearBuilt=firstCapture(text,[/Client\s*Year\s*Built\s*:?\s*(\d{4})/i,/(?:^|\n)\s*Year\s*Built\s*:?\s*(\d{4})/i]);
  oi.squareFeet=firstCapture(text,[/Client\s*Sq\s*Ft\s*:?\s*([0-9,]+)/i,/Client\s*SqFt\s*:?\s*([0-9,]+)/i,/Square\s*Footage\s*:?\s*([0-9,]+)/i]);
  oi.coverageA=firstCapture(text,[/Client\s*Cov\s*A\s*:?\s*(\$?\s*[0-9,]+(?:\.\d{2})?)/i,/Coverage\s*A\s*:?\s*(\$?\s*[0-9,]+(?:\.\d{2})?)/i]);
  oi.county=firstCapture(text,[/(?:^|\n)\s*County\s*:?\s*([A-Z][A-Z .'-]{2,30})/i]);
  const report=one.match(/Property\s+Interior\s*\/\s*Exterior\s+ITV\s+Report/i);oi.reportType=report?report[0].replace(/\s*\/\s*/g,'/'):'';
  oi.appointmentRequired=/Appointment\s+Required/i.test(one);
  oi.preferredContact=firstCapture(text,[/Preferred\s*Contact\s*Method\s*:?\s*([A-Z ]{3,20})/i]);
  // Clean OCR spill-over where a value runs into the next label.
  const labels=['Valuation','Insured','Address','City','Phone','Date','Client','County','Tax','Agent','Policy'];
  for(const key of ['policyNumber','valuationId','insuredName','streetAddress','cityStateZip','phone','client','county']){
    let v=oi[key];for(const label of labels){const idx=v.search(new RegExp('\\s+'+label+'\\s*[:#]','i'));if(idx>0)v=v.slice(0,idx).trim();}oi[key]=v;
  }
  return oi;
}
function mergeOrderInfo(existing,extracted){const out={...blankOrderInfo(),...existing};Object.entries(extracted||{}).forEach(([k,v])=>{if(v!==''&&v!==false)out[k]=v;if(k==='appointmentRequired'&&v===true)out[k]=true;});return out;}
function loadOcrScript(){
  if(window.Tesseract)return Promise.resolve(window.Tesseract);
  return new Promise((resolve,reject)=>{const existing=document.querySelector('script[data-oal-ocr]');if(existing){existing.addEventListener('load',()=>resolve(window.Tesseract),{once:true});existing.addEventListener('error',()=>reject(new Error('OCR failed to load')),{once:true});return;}const script=document.createElement('script');script.src=OCR_SCRIPT_URL;script.async=true;script.dataset.oalOcr='1';script.onload=()=>resolve(window.Tesseract);script.onerror=()=>reject(new Error('OCR library could not be downloaded. Check your internet connection.'));document.head.appendChild(script);});
}
async function onOrderScreenshotChange(e){
  const file=e.target.files?.[0];if(!file)return;state.orderScreenshotFile=file;$('orderScreenshotPreview').src=await readAsDataUrl(file);$('orderScreenshotPreview').classList.remove('hidden');$('readOrderScreenshotBtn').disabled=false;$('orderOcrStatus').textContent='Screenshot ready. Tap Read Screenshot.';
}
async function readOrderScreenshot(){
  if(!state.orderScreenshotFile)return;$('readOrderScreenshotBtn').disabled=true;$('orderOcrStatus').textContent='Loading screenshot reader… First use may take a minute.';
  try{
    const T=await loadOcrScript();
    const result=await T.recognize(state.orderScreenshotFile,'eng',{logger:m=>{if(m.status){const pct=Number.isFinite(m.progress)?` ${Math.round(m.progress*100)}%`:'';$('orderOcrStatus').textContent=`${m.status}${pct}`;}}});
    const text=result?.data?.text||'';const extracted=parseNiisOrderText(text);setOrderForm(mergeOrderInfo(getOrderForm(),extracted));
    const found=Object.entries(extracted).filter(([k,v])=>k!=='appointmentRequired'&&v).length+(extracted.appointmentRequired?1:0);
    $('orderOcrStatus').textContent=`Screenshot read complete. ${found} fields found. Please check every field before using it.`;
  }catch(err){console.error(err);$('orderOcrStatus').textContent=`Could not read the screenshot automatically: ${err.message||err}. You can still type/correct the fields below.`;}
  finally{$('readOrderScreenshotBtn').disabled=false;}
}
function escPrint(v){return escapeHtml(v||'');}
function printValue(v){return escPrint(v||'');}
function buildGraphSvg(){
  const w=568.8,h=664.2,step=18;let lines=[];
  for(let x=0,i=0;x<=w+.1;x+=step,i++)lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="#000" stroke-width="${i%4===0?.7:.22}"/>`);
  for(let y=0,i=0;y<=h+.1;y+=step,i++)lines.push(`<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#000" stroke-width="${i%4===0?.7:.22}"/>`);
  return `<svg class="graph-svg" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" aria-label="One quarter inch sketch grid"><rect width="${w}" height="${h}" fill="white" stroke="#000" stroke-width="1"/>${lines.join('')}</svg>`;
}
function printFieldSheet(){
  if(!state.current)return;const oi={...currentOrderInfo(),...getOrderForm()};const c=state.current;
  const fullAddress=joinOrderAddress(oi)||c.address||'';
  const exterior=['Address / House Number','Front Elevation','Rear Elevation','Left Side','Right Side','Street View','Front Roof','Rear Roof','Roof Close-Up','Exterior Wall / Foundation','Electrical Meter','Outbuildings (if any)','Pool / Spa / Trampoline (if applicable)'];
  const interior=['Living Area','Kitchen','Bathroom(s)','Electrical Panel - Closed','Electrical Panel - Open','Panel Label / Data','HVAC Unit','HVAC Data Plate','Water Heater','Water Heater Data Plate','Basement / Crawl Access','Upstairs Landing / Hallway (if applicable)','Water Damage / Other Concern'];
  const field=(label,value='')=>`<div class="field"><span>${escPrint(label)}</span><b>${printValue(value)}</b></div>`;
  const check=list=>list.map(x=>`<div class="check"><i></i>${escPrint(x)}</div>`).join('');
  const detailsLeft=['Stories','Occupancy','Roof Type','Roof Age','Roof Condition','Foundation Type'];
  const detailsRight=['HVAC Type / Age','Electrical Service','Panel / Amps','Water Heater / Age','Plumbing Type','Exterior Wall'];
  const details=detailsLeft.map((x,i)=>`${field(x+':','')}${field(detailsRight[i]+':','')}`).join('');
  const appointment=oi.appointmentRequired?'APPOINTMENT REQUIRED':'Appointment: ____________________';
  const reportType=oi.reportType||c.type||'Insurance Inspection';
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>${escPrint(c.inspectionId||'Inspection')} Field Sheet</title><style>
  @page{size:letter;margin:.28in}*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff;font-size:9pt}.page{width:7.94in;min-height:10.44in;page-break-after:always;break-after:page}.page:last-child{page-break-after:auto;break-after:auto}h1{font-size:18pt;text-align:center;margin:0 0 2pt}h2{font-size:9pt;text-align:center;margin:0 0 8pt}.two{display:grid;grid-template-columns:1fr 1fr;gap:0 6pt}.field{display:grid;grid-template-columns:1.25in 1fr;border:1px solid #000;min-height:.27in;margin-top:-1px}.field span{padding:4pt;border-right:1px solid #000}.field b{padding:4pt;font-size:9pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.banner{border:1px solid #000;margin-top:7pt;padding:6pt;display:flex;justify-content:space-between;font-weight:700}.section{font-weight:700;font-size:10pt;margin:8pt 0 3pt}.details{display:grid;grid-template-columns:1fr 1fr;gap:0 6pt}.checks{display:grid;grid-template-columns:1fr 1fr;gap:0 22pt}.check{height:16pt;display:flex;align-items:center}.check i{width:9pt;height:9pt;border:1px solid #000;margin-right:5pt}.notes{height:1.25in;border:1px solid #000;background:repeating-linear-gradient(to bottom,transparent 0,transparent .20in,#999 .205in)}.small{font-size:7.5pt}.graph-head{height:.48in;display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:4pt}.graph-head h1{text-align:left;font-size:15pt}.graph-svg{display:block;width:7.9in;height:9.225in}.north{font-weight:700}.print-tip{position:fixed;top:8px;right:8px;background:#fff3cd;border:1px solid #a16207;padding:8px;font-size:12px;z-index:10}@media print{.print-tip{display:none}}
  </style></head><body><div class="print-tip">Print 2-sided • Flip on long edge</div>
  <section class="page"><h1>INSURANCE INSPECTION FIELD SHEET</h1><h2>${escPrint(reportType)}</h2>
  <div class="two">${field('Insured Name:',oi.insuredName||c.insuredName)}${field('Inspection ID #:',oi.inspectionId||c.inspectionId)}${field('Property Address:',oi.streetAddress||fullAddress)}${field('Policy #:',oi.policyNumber)}${field('City / State / ZIP:',oi.cityStateZip)}${field('Valuation ID:',oi.valuationId)}${field('Phone:',oi.phone)}${field('County:',oi.county)}${field('Client:',oi.client)}${field('Coverage A:',oi.coverageA)}${field('Date Ordered:',oi.dateOrdered)}${field('Date Due:',oi.dateDue)}${field('Date Effective:',oi.dateEffective)}${field('Date Inspected:','')}${field('Year Built:',oi.yearBuilt)}${field('Square Footage:',oi.squareFeet)}</div>
  <div class="banner"><span>${escPrint(appointment)}</span><span>Preferred Contact: ${printValue(oi.preferredContact)}</span></div>
  <div class="section">PROPERTY / SYSTEM DETAILS</div><div class="details">${details}</div>
  <div class="section">PHOTO CHECKLIST</div><div class="checks"><div><b>EXTERIOR</b>${check(exterior)}</div><div><b>INTERIOR / MECHANICALS</b>${check(interior)}</div></div>
  <div class="section">FIELD NOTES / HAZARDS / FOLLOW-UP PHOTOS</div><div class="notes"></div><div class="small" style="text-align:right;margin-top:3pt">Manual property sketch and measurements on back — 1/4&quot; grid</div></section>
  <section class="page"><div class="graph-head"><div><h1>PROPERTY SKETCH / MEASUREMENTS</h1><span class="small">Inspection ID: ${printValue(oi.inspectionId||c.inspectionId)} &nbsp;&nbsp; Address: ${printValue(fullAddress)}</span></div><div><span>Scale: 1 square = ______ ft</span> &nbsp;&nbsp; <span class="north">↑ N</span></div></div>${buildGraphSvg()}</section>
  <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350));<\/script></body></html>`;
  const w=window.open('','_blank');if(!w){alert('The print window was blocked. Allow pop-ups for OrganizeALot and try again.');return;}w.document.open();w.document.write(html);w.document.close();
}

function renderPhotos(){
  const box=$('photoSections');box.innerHTML='';if(!state.current)return;
  sectionsFor(state.current.type).forEach(section=>{
    const sectionEl=document.createElement('div');sectionEl.className='photo-section';
    const sectionItems=section.items.map(([key])=>state.current.photoItems[key]).filter(Boolean);
    const completed=sectionItems.filter(i=>i.photoIds.length||i.cannotGet).length;
    sectionEl.innerHTML=`<h3>${escapeHtml(section.name)} <small>${completed}/${sectionItems.length}</small></h3>`;
    sectionItems.forEach(item=>sectionEl.appendChild(renderPhotoItem(item)));
    box.appendChild(sectionEl);
  });
}
function renderPhotoItem(item){
  const wrap=document.createElement('div');wrap.className='photo-item';
  const count=item.photoIds.length;const done=count>0||item.cannotGet;
  wrap.innerHTML=`<div class="photo-item-header"><div class="photo-count ${done?'done':''}">${item.cannotGet?'!':count}</div><div class="info"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.cannotGet?'Marked unobtainable':item.help)}</small></div><button class="primary take-photo">Take Photo</button></div><div class="photo-thumbnails"></div>`;
  wrap.querySelector('.take-photo').onclick=()=>openCamera(item.key);
  const thumbs=wrap.querySelector('.photo-thumbnails');
  item.photoIds.forEach(photoId=>loadPhotoCard(photoId,item,thumbs));
  return wrap;
}
async function loadPhotoCard(photoId,item,box){
  const rec=await dbGet(photoId);if(!rec)return;
  const url=URL.createObjectURL(rec.blob);const card=document.createElement('div');card.className='thumb-card';
  card.innerHTML=`<img alt="${escapeHtml(item.title)}"><button class="danger">Delete Photo</button>`;card.querySelector('img').src=url;
  card.querySelector('button').onclick=async()=>{
    if(!confirm('Delete this photo from OrganizeALot? The separate downloaded backup, if made, will not be deleted.'))return;
    await dbDelete(photoId);item.photoIds=item.photoIds.filter(id=>id!==photoId);saveInspection();URL.revokeObjectURL(url);renderPhotos();
  };
  box.appendChild(card);
}
function openCamera(itemKey){
  state.pendingItem=itemKey;state.pendingFile=null;state.pendingDataUrl=null;
  const item=state.current.photoItems[itemKey];$('cameraTitle').textContent=item.title;$('cameraHelp').textContent=item.help;$('photoNote').value=item.note||'';
  $('cameraInput').value='';$('cameraPreview').classList.add('hidden');$('cameraStatus').classList.add('hidden');$('usePhotoBtn').disabled=true;show('cameraScreen');
  setTimeout(()=>$('cameraInput').click(),150);
}
function readAsDataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}
async function onCameraChange(e){
  const file=e.target.files?.[0];if(!file)return;
  state.pendingFile=file;state.pendingDataUrl=await readAsDataUrl(file);$('cameraPreview').src=state.pendingDataUrl;$('cameraPreview').classList.remove('hidden');$('usePhotoBtn').disabled=false;
  $('cameraStatus').innerHTML=`<strong>Preview ready.</strong> Check framing, blur, glare, darkness, and roof sun distortion before using the photo.`;$('cameraStatus').classList.remove('hidden');
}
async function usePendingPhoto(){
  if(!state.pendingFile||!state.pendingItem)return;
  const item=state.current.photoItems[state.pendingItem];const photoId=uid('photo');
  await dbPut({id:photoId,blob:state.pendingFile,name:state.pendingFile.name||`${item.key}.jpg`,type:state.pendingFile.type||'image/jpeg',created:new Date().toISOString(),inspectionKey:state.current.key,itemKey:item.key});
  item.photoIds.push(photoId);item.note=$('photoNote').value.trim();item.cannotGet=false;saveInspection();
  if(settings().galleryBackup)downloadBlob(state.pendingFile,`${sanitizeFileName(state.current.inspectionId)}_${sanitizeFileName(item.title)}_${Date.now()}.jpg`);
  show('photosScreen');
}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}

function hasStoredOrigin(shape){
  return shape&&shape.originX!==undefined&&shape.originX!==null&&shape.originX!==''&&shape.originY!==undefined&&shape.originY!==null&&shape.originY!=='';
}
function normalizeShape(shape){
  if(!shape)return shape;
  shape.segments=Array.isArray(shape.segments)?shape.segments:[];
  shape.stories=Math.max(.25,Number(shape.stories)||1);
  shape.segments.forEach(seg=>{seg.stories=Math.max(.25,Number(seg.stories)||shape.stories);});
  const lastStory=shape.segments.length?Number(shape.segments[shape.segments.length-1].stories):shape.stories;
  shape.activeStories=Math.max(.25,Number(shape.activeStories)||lastStory||shape.stories);
  shape.originX=Number.isFinite(Number(shape.originX))?Number(shape.originX):0;
  shape.originY=Number.isFinite(Number(shape.originY))?Number(shape.originY):0;
  return shape;
}
function isDetachedShapeType(type){return DETACHED_SHAPE_TYPES.has(type);}
function boundsForShape(shape){
  const pts=pointsFor(shape);return{
    minX:Math.min(...pts.map(p=>p.x)),maxX:Math.max(...pts.map(p=>p.x)),
    minY:Math.min(...pts.map(p=>p.y)),maxY:Math.max(...pts.map(p=>p.y))
  };
}
function nextDetachedOrigin(excludeId=''){
  const existing=(state.current.shapes||[]).filter(s=>s.id!==excludeId);
  if(!existing.length)return{x:MIN_DETACHED_GAP_FT,y:0};
  const bounds=existing.map(boundsForShape);
  return{x:Math.max(...bounds.map(b=>b.maxX))+MIN_DETACHED_GAP_FT,y:Math.min(...bounds.map(b=>b.minY))};
}
function ensureSketch(){
  if(!state.current.shapes)state.current.shapes=[];
  if(!state.current.shapes.length)addDefaultShape();
  state.current.shapes.forEach((shape,index)=>{
    const storedOrigin=hasStoredOrigin(shape);
    normalizeShape(shape);
    if(index===0&&!storedOrigin){shape.originX=0;shape.originY=0;}
    else if(index>0&&!storedOrigin&&isDetachedShapeType(shape.type)){
      const prior=state.current.shapes.slice(0,index);const bounds=prior.map(boundsForShape);
      shape.originX=Math.max(...bounds.map(b=>b.maxX))+MIN_DETACHED_GAP_FT;
      shape.originY=Math.min(...bounds.map(b=>b.minY));
    }
  });
}
function addDefaultShape(){
  const shape={id:uid('shape'),name:'Main House',type:'main_living',stories:1,activeStories:1,originX:0,originY:0,segments:[]};
  state.current.shapes.push(shape);return shape;
}
function selectedShape(){
  ensureSketch();const id=$('shapeSelect').value;
  return normalizeShape(state.current.shapes.find(s=>s.id===id)||state.current.shapes[0]);
}
function renderSketch(){
  if(!state.current)return;ensureSketch();
  const select=$('shapeSelect');const previous=select.value;select.innerHTML='';
  state.current.shapes.forEach(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=s.name;select.appendChild(o);});
  select.value=state.current.shapes.some(s=>s.id===previous)?previous:state.current.shapes[0].id;
  loadShapeForm();drawSketch();renderSegmentList();renderTotals();
}
function loadShapeForm(){
  const s=selectedShape();if(!s)return;
  $('shapeName').value=s.name;$('shapeType').value=s.type;$('shapeStories').value=s.activeStories;
  updateCurrentStoryMessage();
}
function updateCurrentStoryMessage(message=''){
  const s=selectedShape();if(!s)return;
  const base=`Next wall run: ${fmt(s.activeStories)} stor${Number(s.activeStories)===1?'y':'ies'} in the same structure.`;
  $('commandMessage').textContent=message||base;
}
function createShape(){
  const name=$('shapeName').value.trim()||`Section ${state.current.shapes.length+1}`;
  const type=$('shapeType').value;const stories=Math.max(.25,Number($('shapeStories').value)||1);
  const origin=isDetachedShapeType(type)?nextDetachedOrigin():{x:0,y:0};
  const shape={id:uid('shape'),name,type,stories,activeStories:stories,originX:origin.x,originY:origin.y,segments:[]};
  state.current.shapes.push(shape);saveInspection();renderSketch();$('shapeSelect').value=shape.id;loadShapeForm();drawSketch();renderSegmentList();renderTotals();
  updateCurrentStoryMessage(isDetachedShapeType(type)?`${name} starts ${MIN_DETACHED_GAP_FT} ft away from the nearest existing structure.`:`${name} is ready for measurements.`);
}
function setActiveStories(stories,{announce=true}={}){
  const s=selectedShape();if(!s)return false;
  const next=Math.max(.25,Number(stories)||1);const previous=Number(s.activeStories)||Number(s.stories)||1;
  s.activeStories=next;
  if(!s.segments.length)s.stories=next;
  $('shapeStories').value=next;saveInspection();
  if(announce){
    const location=s.segments.length?'at the current corner':'at the start of this structure';
    updateCurrentStoryMessage(`${fmt(next)}-story begins ${location}. The next wall run stays on the same house.`);
  }
  return previous!==next;
}
function updateShape(){
  const s=selectedShape();if(!s)return;
  s.name=$('shapeName').value.trim()||s.name;s.type=$('shapeType').value;
  setActiveStories($('shapeStories').value,{announce:false});saveInspection();renderSketch();$('shapeSelect').value=s.id;loadShapeForm();
  updateCurrentStoryMessage(`${fmt(s.activeStories)}-story is set for the next wall run on this same structure.`);
}
function addSegment(dir,feet,{refresh=true}={}){
  const s=selectedShape();const f=Number(feet);
  if(!s||!DIRS[dir]||!Number.isFinite(f)||f<=0)return false;
  s.segments.push({dir,feet:Math.round(f*100)/100,stories:Math.max(.25,Number(s.activeStories)||Number(s.stories)||1)});
  saveInspection();
  if(refresh){drawSketch();renderSegmentList();renderTotals();loadShapeForm();}
  return true;
}
const NUMBER_WORDS={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,first:1,second:2,third:3,fourth:4,fifth:5,sixth:6,seventh:7,eighth:8,ninth:9,tenth:10,half:.5,quarter:.25};
function replaceNumberWords(text){
  const parts=String(text||'').toLowerCase().replace(/\b(\d+)(?:st|nd|rd|th)\b/g,'$1').replace(/-/g,' ').split(/\s+/);const out=[];let value=0,active=false;
  const flush=()=>{if(active){out.push(String(value));value=0;active=false;}};
  for(const part of parts){
    if(Object.hasOwn(NUMBER_WORDS,part)){value+=NUMBER_WORDS[part];active=true;continue;}
    if(part==='hundred'){value=(value||1)*100;active=true;continue;}
    if(part==='and'&&active)continue;
    flush();if(part)out.push(part);
  }
  flush();return out.join(' ');
}
function cleanSpeechText(text){
  return replaceNumberWords(text)
    .replace(/\b(write|rite)\b/g,'right')
    .replace(/\b(foreword|forwards|forwarded)\b/g,'forward')
    .replace(/\b(backward|backwards)\b/g,'back')
    .replace(/\b(right-hand side|right hand side)\b/g,'right')
    .replace(/\b(left-hand side|left hand side)\b/g,'left')
    .replace(/\bstoreys?\b/g,match=>match.endsWith('s')?'stories':'story')
    .replace(/\b(?:beginning|began)\b/g,'begin')
    .replace(/\b(?:lower|drop|go)\s+(?:down\s+)?to\b/g,'change to')
    .replace(/\breturn\s+to\b/g,'change to')
    .replace(/\ba\s+(?=\d+(?:\.\d+)?\s*stor)/g,'')
    .replace(/[;:]/g,',')
    .replace(/\s+/g,' ')
    .trim();
}
function parseCommand(text){
  const normalized=cleanSpeechText(text).replace(/\b(?:feet|foot|ft)\.?\b/g,' ').replace(/to the /g,' ').replace(/\b(go|turn|move|put|side|the|a|an|then|and)\b/g,' ').replace(/,/g,' ');
  const aliases={forward:'F',front:'F',up:'F',straight:'F',right:'R',back:'B',rear:'B',down:'B',left:'L'};
  const tokens=normalized.match(/forward|front|up|straight|right|back|rear|down|left|-?\d+(?:\.\d+)?/g)||[];
  const commands=[];let pendingDir=null,pendingFeet=null;
  for(const token of tokens){
    if(aliases[token]){
      if(pendingFeet!==null){commands.push({dir:aliases[token],feet:pendingFeet});pendingFeet=null;pendingDir=null;}
      else pendingDir=aliases[token];
      continue;
    }
    const n=Number(token);if(!Number.isFinite(n)||n<=0)continue;
    if(pendingDir){commands.push({dir:pendingDir,feet:n});pendingDir=null;}
    else if(pendingFeet!==null){commands.push({dir:'F',feet:pendingFeet});pendingFeet=n;}
    else pendingFeet=n;
  }
  if(pendingFeet!==null)commands.push({dir:pendingDir||'F',feet:pendingFeet});
  return commands;
}
function parseVoiceEvents(text){
  const cleaned=cleanSpeechText(text);const events=[];
  // A story phrase changes the height for the NEXT wall run on the SAME structure.
  // The text before and after each phrase is parsed separately so spoken order is preserved.
  const storyPattern=/\b(?:(?:begin|start|star|switch|change|now|set|return)(?:\s+back)?(?:\s+to)?(?:\s+the)?\s*)?(\d+(?:\.\d+)?)\s*(?:story|stories|level|levels)\b/gi;
  let lastIndex=0;let match;
  while((match=storyPattern.exec(cleaned))){
    parseCommand(cleaned.slice(lastIndex,match.index)).forEach(c=>events.push({type:'segment',...c}));
    events.push({type:'story',stories:Math.max(.25,Number(match[1])||1)});
    lastIndex=storyPattern.lastIndex;
  }
  parseCommand(cleaned.slice(lastIndex)).forEach(c=>events.push({type:'segment',...c}));
  return events;
}
function canonicalEvents(events){
  return events.map(e=>e.type==='story'?`Begin ${fmt(e.stories)} stor${Number(e.stories)===1?'y':'ies'}`:`${fmt(e.feet)} ft ${DIRS[e.dir].label}`).join(', ');
}
function interpretVoice(text){
  const events=parseVoiceEvents(text);const commands=events.filter(e=>e.type==='segment');const storyChanges=events.filter(e=>e.type==='story');
  return {events,commands,storyChanges,canonical:canonicalEvents(events)};
}
function applyInterpretedEvents(result,{heard='',source='typed'}={}){
  if(!result.events.length){
    $('commandMessage').textContent=heard?`Heard: “${heard}” — no usable measurement or story change found.`:'No usable measurement or story change found.';
    return false;
  }
  let measurements=0,storyInstructions=0,transitions=0;
  result.events.forEach(event=>{
    if(event.type==='story'){
      storyInstructions++;
      if(setActiveStories(event.stories,{announce:false}))transitions++;
    }else if(addSegment(event.dir,event.feet,{refresh:false}))measurements++;
  });
  saveInspection();drawSketch();renderSegmentList();renderTotals();loadShapeForm();
  const parts=[];
  if(storyInstructions){
    parts.push(`${storyInstructions} story setting${storyInstructions===1?'':'s'}`);
  }
  if(measurements)parts.push(`${measurements} measurement${measurements===1?'':'s'}`);
  const prefix=source==='voice'?'Voice applied':'Added';
  const heardText=heard?`Heard: “${heard}” — `:'';
  const transitionText=storyInstructions&&!transitions?' The requested story level was already active.':'';
  const canonical=result.canonical?` (${result.canonical})`:'';
  $('commandMessage').textContent=`${heardText}${prefix} ${parts.join(' and ')} to the same structure${canonical}. Next wall run is ${fmt(selectedShape().activeStories)} stor${Number(selectedShape().activeStories)===1?'y':'ies'}.${transitionText}`;
  return true;
}
function addCommand(){
  const result=interpretVoice($('commandInput').value);
  if(applyInterpretedEvents(result))$('commandInput').value='';
}
function pointsFor(shape){
  normalizeShape(shape);let x=shape.originX,y=shape.originY;const pts=[{x,y}];
  shape.segments.forEach(seg=>{const d=DIRS[seg.dir];x+=d.dx*seg.feet;y+=d.dy*seg.feet;pts.push({x,y});});return pts;
}
function isClosed(shape){const p=pointsFor(shape);const a=p[0],b=p[p.length-1];return p.length>2&&Math.abs(a.x-b.x)<.01&&Math.abs(a.y-b.y)<.01;}
function polygonArea(points){
  if(points.length<3)return 0;let area=0;
  for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a.x*b.y-b.x*a.y;}
  return Math.abs(area)/2;
}
function footprintArea(shape){return polygonArea(pointsFor(shape));}
function polygonCentroid(points){
  if(!points.length)return{x:0,y:0};let crossSum=0,cx=0,cy=0;
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],cross=a.x*b.y-b.x*a.y;
    crossSum+=cross;cx+=(a.x+b.x)*cross;cy+=(a.y+b.y)*cross;
  }
  if(Math.abs(crossSum)<.0001)return{x:points.reduce((n,p)=>n+p.x,0)/points.length,y:points.reduce((n,p)=>n+p.y,0)/points.length};
  return{x:cx/(3*crossSum),y:cy/(3*crossSum)};
}
function storyRuns(shape){
  normalizeShape(shape);const n=shape.segments.length;if(!n)return[];
  const stories=shape.segments.map(seg=>Math.max(.25,Number(seg.stories)||shape.stories));
  const basePoints=pointsFor(shape).slice(0,n);
  let firstChange=-1;
  for(let i=0;i<n;i++){if(stories[i]!==stories[(i-1+n)%n]){firstChange=i;break;}}
  if(firstChange<0){return[{stories:stories[0],segmentIndexes:[...Array(n).keys()],points:pointsFor(shape)}];}
  const runs=[];let run=null;
  for(let step=0;step<n;step++){
    const index=(firstChange+step)%n;const story=stories[index];
    if(!run||run.stories!==story){if(run)runs.push(run);run={stories:story,segmentIndexes:[],points:[basePoints[index]]};}
    run.segmentIndexes.push(index);run.points.push(basePoints[(index+1)%n]);
  }
  if(run)runs.push(run);return runs;
}
function storyCalculation(shape){
  normalizeShape(shape);const footprint=footprintArea(shape);const runs=storyRuns(shape);
  if(!runs.length)return{footprint,total:0,regions:[],valid:false,reason:'No wall runs entered.'};
  const unique=[...new Set(runs.map(r=>r.stories))];
  if(unique.length===1){
    const region={...runs[0],area:footprint,centroid:polygonCentroid(pointsFor(shape))};
    return{footprint,total:footprint*unique[0],regions:[region],valid:true,reason:''};
  }
  if(!isClosed(shape)){
    return{footprint,total:0,regions:runs.map(r=>({...r,area:0,centroid:polygonCentroid(r.points)})),valid:false,reason:'Close the outline to calculate the 1-story and 2-story sections.'};
  }
  const regions=runs.map(r=>({...r,area:polygonArea(r.points),centroid:polygonCentroid(r.points)}));
  const regionArea=regions.reduce((sum,r)=>sum+r.area,0);const tolerance=Math.max(1,footprint*.02);
  const valid=Math.abs(regionArea-footprint)<=tolerance;
  return{
    footprint,
    total:valid?regions.reduce((sum,r)=>sum+r.area*r.stories,0):0,
    regions,
    valid,
    reason:valid?'':'The story divider could not be resolved. Use one “Begin 1 story” point and one return transition around each addition.'
  };
}
function calculatedArea(shape){return storyCalculation(shape).total;}
function closeShape(){
  const s=selectedShape();const pts=pointsFor(s);const start=pts[0],end=pts[pts.length-1];const dx=end.x-start.x,dy=end.y-start.y;
  if(Math.abs(dx)<.01&&Math.abs(dy)<.01)return;
  if(Math.abs(dx)>.01)addSegment(dx>0?'L':'R',Math.abs(dx),{refresh:false});
  if(Math.abs(dy)>.01)addSegment(dy>0?'F':'B',Math.abs(dy),{refresh:false});
  saveInspection();drawSketch();renderSegmentList();renderTotals();loadShapeForm();
}
function undoSegment(){
  const s=selectedShape();if(!s?.segments.length)return;s.segments.pop();
  s.activeStories=s.segments.length?Number(s.segments[s.segments.length-1].stories):Number(s.stories)||1;
  saveInspection();drawSketch();renderSegmentList();renderTotals();loadShapeForm();
}
function clearShape(event){
  event?.preventDefault?.();event?.stopPropagation?.();
  const s=selectedShape();
  if(!s)return;
  if(!confirm(`Clear all measurements and story transitions from ${s.name}?`))return;
  const clearedName=s.name;
  s.segments.length=0;
  s.activeStories=Math.max(.25,Number(s.stories)||1);
  saveInspection();
  renderSketch();
  $('shapeSelect').value=s.id;
  loadShapeForm();drawSketch();renderSegmentList();renderTotals();
  updateCurrentStoryMessage(`${clearedName} was cleared. The section remains available for new measurements.`);
}
function deleteShape(event){
  event?.preventDefault?.();event?.stopPropagation?.();
  const s=selectedShape();
  if(!s)return;
  if(!confirm(`Delete the entire ${s.name} section?`))return;
  const deletedName=s.name;
  state.current.shapes=state.current.shapes.filter(x=>x.id!==s.id);
  let replacement=null;
  if(!state.current.shapes.length)replacement=addDefaultShape();
  else replacement=state.current.shapes[0];
  saveInspection();renderSketch();
  if(replacement){$('shapeSelect').value=replacement.id;loadShapeForm();drawSketch();renderSegmentList();renderTotals();}
  updateCurrentStoryMessage(`${deletedName} was deleted.${state.current.shapes.length===1&&replacement?.name==='Main House'?' A new blank Main House section is ready.':''}`);
}
function calculateTotals(shapes){
  const totals={main_living:0,other_living:0,attached_garage:0,covered_porch:0,deck:0,detached_garage:0,outbuilding:0};
  shapes.forEach(s=>{totals[s.type]=(totals[s.type]||0)+calculatedArea(s);});return totals;
}
function storyFill(stories,selected){
  const opacity=selected?.22:.13;const hue=Number(stories)===1?142:Number(stories)===2?207:Number(stories)===3?272:35;
  return `hsla(${hue},70%,50%,${opacity})`;
}
function storyTransitions(shape){
  normalizeShape(shape);const transitions=[];const n=shape.segments.length;if(!n)return transitions;
  for(let i=1;i<n;i++){
    const current=Number(shape.segments[i].stories),previous=Number(shape.segments[i-1].stories);
    if(current!==previous)transitions.push({vertexIndex:i,stories:current});
  }
  if(isClosed(shape)&&Number(shape.segments[0].stories)!==Number(shape.segments[n-1].stories))transitions.push({vertexIndex:0,stories:Number(shape.segments[0].stories)});
  return transitions;
}
function drawSketch(){
  const svg=$('sketchSvg');const shapes=state.current.shapes||[];svg.innerHTML='';
  const allPts=[];shapes.forEach(s=>allPts.push(...pointsFor(s)));
  if(!allPts.length||shapes.every(s=>!s.segments.length)){
    svg.innerHTML='<rect width="800" height="600" fill="#ffffff"/><text x="400" y="270" text-anchor="middle" font-size="24" fill="#475569">Add measurements to draw the 2D sketch</text><text x="400" y="310" text-anchor="middle" font-size="16" fill="#64748b">Say “Begin 1 story” at the corner where the same house gets lower</text><text x="400" y="340" text-anchor="middle" font-size="16" fill="#64748b">Forward · Right · Back · Left</text>';return;
  }
  let minX=Math.min(...allPts.map(p=>p.x)),maxX=Math.max(...allPts.map(p=>p.x)),minY=Math.min(...allPts.map(p=>p.y)),maxY=Math.max(...allPts.map(p=>p.y));
  if(minX===maxX){minX-=1;maxX+=1;}if(minY===maxY){minY-=1;maxY+=1;}
  const pad=70,w=800,h=600,scale=Math.min((w-pad*2)/(maxX-minX),(h-pad*2)/(maxY-minY));
  const tx=x=>pad+(x-minX)*scale,ty=y=>pad+(y-minY)*scale;
  svg.appendChild(svgEl('rect',{x:0,y:0,width:w,height:h,fill:'#ffffff'}));
  for(let gx=Math.floor(minX/10)*10;gx<=maxX;gx+=10)svg.appendChild(svgEl('line',{x1:tx(gx),y1:pad,x2:tx(gx),y2:h-pad,stroke:'#e2e8f0','stroke-width':1}));
  for(let gy=Math.floor(minY/10)*10;gy<=maxY;gy+=10)svg.appendChild(svgEl('line',{x1:pad,y1:ty(gy),x2:w-pad,y2:ty(gy),stroke:'#e2e8f0','stroke-width':1}));
  shapes.forEach((shape,shapeIndex)=>{
    normalizeShape(shape);const pts=pointsFor(shape);if(pts.length<2)return;const selected=shape.id===$('shapeSelect').value;const calc=storyCalculation(shape);
    if(isClosed(shape)&&calc.regions.length){
      calc.regions.forEach(region=>{
        const regionPoints=region.points.map(p=>`${tx(p.x)},${ty(p.y)}`).join(' ');
        svg.appendChild(svgEl('polygon',{points:regionPoints,fill:storyFill(region.stories,selected),stroke:'none'}));
        if(calc.regions.length>1){
          const first=region.points[0],last=region.points[region.points.length-1];
          svg.appendChild(svgEl('line',{x1:tx(last.x),y1:ty(last.y),x2:tx(first.x),y2:ty(first.y),stroke:'#475569','stroke-width':2,'stroke-dasharray':'8 6'}));
        }
        if(region.area>0){
          const label=svgEl('text',{x:tx(region.centroid.x),y:ty(region.centroid.y),'text-anchor':'middle','font-size':16,'font-weight':800,fill:'#0f172a',stroke:'#fff','stroke-width':5,'paint-order':'stroke'});
          label.textContent=`${fmt(region.stories)} Story · ${fmt(region.area)} sq ft`;svg.appendChild(label);
        }
      });
    }
    const pointStr=pts.map(p=>`${tx(p.x)},${ty(p.y)}`).join(' ');
    svg.appendChild(svgEl('polyline',{points:pointStr,fill:'none',stroke:selected?'#15803d':'#0f172a','stroke-width':selected?5:3,'stroke-linejoin':'round','stroke-linecap':'round'}));
    pts.forEach((p,i)=>svg.appendChild(svgEl('circle',{cx:tx(p.x),cy:ty(p.y),r:i===0?6:4,fill:i===0?'#dc2626':'#0f172a'})));
    shape.segments.forEach((seg,i)=>{
      const a=pts[i],b=pts[i+1],mx=(tx(a.x)+tx(b.x))/2,my=(ty(a.y)+ty(b.y))/2;
      const text=svgEl('text',{x:mx,y:my-7,'text-anchor':'middle','font-size':15,'font-weight':700,fill:'#0f172a',stroke:'#ffffff','stroke-width':4,'paint-order':'stroke'});text.textContent=`${fmt(seg.feet)} ft`;svg.appendChild(text);
      const story=svgEl('text',{x:mx,y:my+12,'text-anchor':'middle','font-size':12,'font-weight':800,fill:'#334155',stroke:'#ffffff','stroke-width':4,'paint-order':'stroke'});story.textContent=`${fmt(seg.stories)}S`;svg.appendChild(story);
    });
    storyTransitions(shape).forEach(t=>{
      const p=pts[t.vertexIndex];const x=tx(p.x),y=ty(p.y);
      svg.appendChild(svgEl('polygon',{points:`${x},${y-9} ${x+9},${y} ${x},${y+9} ${x-9},${y}`,fill:'#f59e0b',stroke:'#7c2d12','stroke-width':2}));
      const label=svgEl('text',{x:x+12,y:y-12,'font-size':13,'font-weight':900,fill:'#7c2d12',stroke:'#fff','stroke-width':4,'paint-order':'stroke'});label.textContent=`Begin ${fmt(t.stories)} Story`;svg.appendChild(label);
    });
    const anchor=pts[0];const label=svgEl('text',{x:tx(anchor.x)+10,y:ty(anchor.y)-14,'font-size':14,'font-weight':800,fill:'#0f172a',stroke:'#fff','stroke-width':4,'paint-order':'stroke'});label.textContent=`${shapeIndex+1}. ${shape.name}`;svg.appendChild(label);
  });
}
function svgEl(name,attrs){const el=document.createElementNS('http://www.w3.org/2000/svg',name);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,String(v)));return el;}
function renderSegmentList(){
  const box=$('segmentList');const s=selectedShape();box.innerHTML='';
  if(!s?.segments.length){box.innerHTML='<p class="muted">No measurements entered.</p>';return;}
  s.segments.forEach((seg,i)=>{
    const row=document.createElement('div');row.className='segment-row';
    const transition=i>0&&Number(seg.stories)!==Number(s.segments[i-1].stories)?`<small class="story-change">Begin ${fmt(seg.stories)} Story at this corner</small>`:'';
    row.innerHTML=`<span>${i+1}</span><span><strong>${DIRS[seg.dir].label}</strong> ${fmt(seg.feet)} ft · ${fmt(seg.stories)} stor${Number(seg.stories)===1?'y':'ies'}${transition}</span><button class="danger">Delete</button>`;
    row.querySelector('button').onclick=()=>{s.segments.splice(i,1);s.activeStories=s.segments.length?Number(s.segments[s.segments.length-1].stories):Number(s.stories)||1;saveInspection();drawSketch();renderSegmentList();renderTotals();loadShapeForm();};box.appendChild(row);
  });
}
function renderTotals(){
  const s=selectedShape();const calc=s?storyCalculation(s):null;
  if(s&&calc){
    const breakdown=calc.regions.filter(r=>r.area>0).map(r=>`${fmt(r.area)} sq ft × ${fmt(r.stories)} stor${Number(r.stories)===1?'y':'ies'} = ${fmt(r.area*r.stories)} sq ft`).join('<br>');
    $('selectedShapeStats').innerHTML=`<strong>${escapeHtml(s.name)}</strong><br>${escapeHtml(SHAPE_TYPES[s.type])} · ${fmt(calc.footprint)} sq ft footprint<br>${breakdown||'<span class="muted">Story areas calculate after the outline is closed.</span>'}${calc.valid?`<br><strong>Total counted area: ${fmt(calc.total)} sq ft</strong>`:`<br><span class="warning-text"><strong>${escapeHtml(calc.reason)}</strong></span>`}<br><span class="muted">Next wall run: ${fmt(s.activeStories)} stor${Number(s.activeStories)===1?'y':'ies'} on this same structure.</span>`;
  }else $('selectedShapeStats').innerHTML='';
  const t=calculateTotals(state.current.shapes||[]);const labels=[['main_living','Main Living'],['other_living','Other Living'],['attached_garage','Attached Garage'],['covered_porch','Covered Porch'],['deck','Deck'],['detached_garage','Detached Garage'],['outbuilding','Outbuildings']];
  $('totalsBox').innerHTML=labels.map(([k,label])=>`<div class="total-card"><strong>${fmt(t[k])}</strong><small>${label} sq ft</small></div>`).join('');
}
function downloadSketch(){
  const clone=$('sketchSvg').cloneNode(true);clone.setAttribute('xmlns','http://www.w3.org/2000/svg');const xml=new XMLSerializer().serializeToString(clone);const blob=new Blob([xml],{type:'image/svg+xml'});downloadBlob(blob,`${sanitizeFileName(state.current.inspectionId)}_2D_Sketch.svg`);
}
function startVoice(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){$('commandMessage').textContent='Voice entry is not available in this browser.';return;}
  const r=new SR();r.lang='en-US';r.interimResults=false;r.continuous=false;r.maxAlternatives=1;
  $('voiceBtn').disabled=true;$('commandMessage').textContent='Listening… Speak the complete wall and story command.';
  r.onresult=e=>{
    const resultIndex=Number.isInteger(e.resultIndex)?e.resultIndex:0;
    const heard=e.results[resultIndex]?.[0]?.transcript||e.results[0][0].transcript;
    const result=interpretVoice(heard);
    $('commandInput').value=result.canonical||cleanSpeechText(heard);
    if(applyInterpretedEvents(result,{heard,source:'voice'}))$('commandInput').value='';
  };
  r.onerror=e=>{$('commandMessage').textContent=e.error==='not-allowed'?'Microphone permission was blocked. Allow microphone access and try again.':'Voice entry did not complete. Try speaking the full command again.';};
  r.onend=()=>{$('voiceBtn').disabled=false;};
  try{r.start();}catch{$('voiceBtn').disabled=false;$('commandMessage').textContent='Voice entry could not start. Try again.';}
}
function departureCheck(){
  const c=state.current;const items=Object.values(c.photoItems||{});const missing=items.filter(i=>!i.photoIds.length&&!i.cannotGet);const overrides=items.filter(i=>i.cannotGet);const totals=calculateTotals(c.shapes||[]);
  let html=`<div class="notice"><strong>${items.length-missing.length}/${items.length} photo items complete.</strong></div>`;
  if(missing.length)html+=`<div class="card"><h3>Missing Required Photos</h3><ul>${missing.map(i=>`<li>${escapeHtml(i.section)} — ${escapeHtml(i.title)}</li>`).join('')}</ul></div>`;
  if(overrides.length)html+=`<div class="card"><h3>Marked Unobtainable</h3><ul>${overrides.map(i=>`<li>${escapeHtml(i.title)}${i.note?` — ${escapeHtml(i.note)}`:''}</li>`).join('')}</ul></div>`;
  if(c.type!=='OBS')html+=`<div class="card"><h3>Sketch Check</h3><p>${c.shapes?.length?`${fmt(totals.main_living)} sq ft main living area recorded across ${c.shapes.length} section(s).`:'No 2D sketch sections have been entered.'}</p></div>`;
  if(!missing.length)html+=`<div class="notice"><strong>Photo checklist is ready.</strong> Review the sketch and notes before leaving.</div>`;
  $('reviewResults').innerHTML=html;show('reviewScreen');
}
async function exportInspection(){
  saveInspection();const c=structuredClone(state.current);const photoManifest=[];
  for(const item of Object.values(c.photoItems||{}))for(const id of item.photoIds){const rec=await dbGet(id);if(rec)photoManifest.push({id,itemKey:item.key,itemTitle:item.title,name:rec.name,type:rec.type,created:rec.created});}
  const payload={version:VERSION,exported:new Date().toISOString(),inspection:c,photoManifest,note:'Photo image files remain stored in this browser. This JSON is the inspection data backup.'};
  downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),`OrganizeALot_${sanitizeFileName(c.inspectionId)}_Build023.json`);
}

function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(PHOTO_STORE))db.createObjectStore(PHOTO_STORE,{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function dbTx(mode){return state.db.transaction(PHOTO_STORE,mode).objectStore(PHOTO_STORE);}
function dbPut(record){return new Promise((resolve,reject)=>{const r=dbTx('readwrite').put(record);r.onsuccess=()=>resolve(record);r.onerror=()=>reject(r.error);});}
function dbGet(id){return new Promise((resolve,reject)=>{const r=dbTx('readonly').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function dbDelete(id){return new Promise((resolve,reject)=>{const r=dbTx('readwrite').delete(id);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);});}

function wireEvents(){
  document.querySelectorAll('.tile').forEach(b=>b.onclick=()=>{newInspection(b.dataset.type);$('setupTitle').textContent=`New ${b.dataset.type} Inspection`;$('inspectionId').value='';$('address').value='';$('insuredName').value='';$('inspector').value='Chris Roberts';show('setupScreen');});
  document.querySelectorAll('[data-screen]').forEach(b=>b.onclick=()=>show(b.dataset.screen));
  $('setupImportOrderBtn').onclick=()=>openOrderImport('setupScreen');$('orderImportBackBtn').onclick=()=>show(state.orderReturnScreen||'setupScreen');
  $('orderScreenshotInput').addEventListener('change',onOrderScreenshotChange);$('readOrderScreenshotBtn').onclick=readOrderScreenshot;
  $('applyOrderToInspectionBtn').onclick=()=>applyOrderInfo({returnAfter:true});$('saveOrderInfoBtn').onclick=()=>applyOrderInfo({returnAfter:true});$('printOrderFieldSheetBtn').onclick=printFieldSheet;$('fieldSheetBtn').onclick=()=>openOrderImport('dashboardScreen');
  $('startBtn').onclick=()=>{const id=$('inspectionId').value.trim(),address=$('address').value.trim();if(!id||!address){alert('Enter both the Inspection ID and property address.');return;}Object.assign(state.current,{inspectionId:id,address,insuredName:$('insuredName').value.trim(),inspector:$('inspector').value.trim()||'Chris Roberts'});state.current.orderInfo={...blankOrderInfo(),...(state.current.orderInfo||{}),inspectionId:id,insuredName:state.current.insuredName};if(!state.current.orderInfo.streetAddress&&!state.current.orderInfo.cityStateZip)state.current.orderInfo.streetAddress=address;saveInspection();show('dashboardScreen');};
  $('setupWazeBtn').onclick=()=>openWaze($('address').value.trim());$('wazeBtn').onclick=()=>openWaze(state.current?.address);
  $('saveBtn').onclick=()=>{saveInspection();renderDashboard();};$('photosSaveBtn').onclick=()=>{saveInspection();renderPhotos();};$('photosBtn').onclick=()=>show('photosScreen');$('sketchBtn').onclick=()=>show('sketchScreen');$('reviewBtn').onclick=departureCheck;$('exportBtn').onclick=exportInspection;
  $('deleteInspectionBtn').onclick=()=>{if(!state.current||!confirm(`Delete inspection ${state.current.inspectionId}?`))return;localStorage.removeItem(state.current.key);state.current=null;show('homeScreen');};
  $('cameraInput').addEventListener('change',onCameraChange);$('usePhotoBtn').onclick=usePendingPhoto;$('retakePhotoBtn').onclick=()=>{$('cameraInput').value='';$('cameraInput').click();};
  $('cannotGetPhotoBtn').onclick=()=>{const item=state.current.photoItems[state.pendingItem];item.cannotGet=true;item.note=$('photoNote').value.trim()||'Photo could not be obtained.';saveInspection();show('photosScreen');};
  document.querySelectorAll('.direction').forEach(b=>b.onclick=()=>{state.selectedDir=b.dataset.dir;document.querySelectorAll('.direction').forEach(x=>x.classList.toggle('active',x===b));});
  $('addSegmentBtn').onclick=()=>{if(addSegment(state.selectedDir,$('segmentFeet').value))$('segmentFeet').value='';else alert('Enter a valid measurement in feet.');};
  $('newShapeBtn').onclick=createShape;$('updateShapeBtn').onclick=updateShape;$('shapeSelect').onchange=()=>{loadShapeForm();drawSketch();renderSegmentList();renderTotals();};
  $('addCommandBtn').onclick=addCommand;$('voiceBtn').onclick=startVoice;$('undoSegmentBtn').onclick=undoSegment;$('closeShapeBtn').onclick=closeShape;$('clearShapeBtn').addEventListener('click',clearShape);$('deleteShapeBtn').addEventListener('click',deleteShape);
  $('saveSketchBtn').onclick=()=>{saveInspection();renderSketch();};$('downloadSvgBtn').onclick=downloadSketch;$('printSketchBtn').onclick=()=>window.print();
  $('settingsBtn').onclick=()=>{const s=settings();$('galleryBackupSetting').checked=s.galleryBackup;show('settingsScreen');};$('saveSettingsBtn').onclick=()=>{localStorage.setItem(SETTINGS_KEY,JSON.stringify({galleryBackup:$('galleryBackupSetting').checked}));show('homeScreen');};
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.deferredInstall=e;$('installBtn').classList.remove('hidden');});$('installBtn').onclick=async()=>{if(state.deferredInstall){state.deferredInstall.prompt();state.deferredInstall=null;$('installBtn').classList.add('hidden');}};
}

async function init(){
  try{state.db=await openDb();}catch(err){console.error(err);alert('Photo storage could not be opened. Inspection text and sketch features will still work.');}
  wireEvents();renderSaved();if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(console.error);
}
init();
