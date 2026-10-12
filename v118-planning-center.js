(function(){
  'use strict';
  const AM_KEY='ghn_am_mapping_v35';
  const PLAN_KEY='ghn_branch_plan_v34';
  const WORKFLOW_KEY='ghn_planning_workflow_v130';
  const ACCOUNT_KEY='dcl_user_accounts_v1';
  const LEGACY_AMS=[
    'AM01 - Nguyễn Tuấn Anh','AM02 - Đồng Tháp 01','AM03 - Đồng Tháp 02',
    'AM04 - Tiền Giang 01','AM05 - Tiền Giang 02','AM06 - Bến Tre 01',
    'AM07 - Bến Tre 02','AM08 - Trà Vinh 02','AM09 - Vĩnh Long 01',
    'AM10 - Vĩnh Long 02','AM11 - Liên tỉnh'
  ];
  const DEFAULT_AMS=[
    '1705850 - Võ Hồng Chơn','1880732 - Lê Minh Tuấn','2047719 - Nguyễn Thành Huy',
    '255924 - Ngô Phan Mỹ Tú','27547 - Nguyễn Việt Tới','3003753 - Lý Quài Nhân',
    '3115359 - Đoàn Công Tín','3126726 - Nguyễn Huỳnh Quốc Dũng','3155955 - Nguyễn Anh Tùng',
    '3162597 - Nguyễn Tuấn Anh','3166061 - Huỳnh Quốc Trung'
  ];
  let center=null;
  let activeView='am';
  let selectedAMName='';
  let checkedBranches=new Set();
  let checkMarker=null;
  let coordPickInput='';
  let coordPickButton=null;
  let coordPickButtonIdle='';
  let coordPickCancelButton=null;
  let baseBranchCoordInfo=null;
  let planningColorBackup=null;
  let refreshFrame=0;
  let amFilterText='';
  let bcFilterText='';
  let wardFilterText='';
  let selectedAccountId='';

  const e=s=>escapeHtml(String(s??''));
  const n=v=>Number(v)||0;
  const f=v=>fmt(Number(v)||0);
  const q=id=>document.getElementById(id);
  const unique=a=>[...new Set(a)];
  const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

  function saveWorkflow(){
    try{sessionStorage.setItem(WORKFLOW_KEY,JSON.stringify({activeView,selectedAMName,checkedBranches:[...checkedBranches],amFilterText,bcFilterText,wardFilterText}));}catch(err){}
  }

  function restoreWorkflow(){
    try{
      const saved=JSON.parse(sessionStorage.getItem(WORKFLOW_KEY)||'null');
      if(!saved)return;
      activeView='am';
      selectedAMName='';
      checkedBranches.clear();
      amFilterText='';
      bcFilterText='';
      wardFilterText='';
    }catch(err){}
  }

  function toast(message){
    const el=q('v118Toast');
    if(!el)return;
    el.textContent=message;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer=setTimeout(()=>el.classList.remove('show'),2200);
  }

  function provinceOfBranch(branch){
    return String((byBranch[branch]||{}).province||'');
  }

  function ensureDefaultAMMapping(){
    const existingKeys=Object.keys(amMapping||{}),hasNew=DEFAULT_AMS.some(key=>existingKeys.includes(key)),hasLegacy=LEGACY_AMS.some(key=>existingKeys.includes(key));
    if(!hasNew&&hasLegacy){
      DEFAULT_AMS.forEach((key,index)=>amMapping[key]=[...(amMapping[LEGACY_AMS[index]]||[])]);
      LEGACY_AMS.forEach(key=>delete amMapping[key]);
    }
    DEFAULT_AMS.forEach(key=>{if(!Array.isArray(amMapping[key]))amMapping[key]=[];});
    if(Object.values(amMapping).some(list=>Array.isArray(list)&&list.length)){
      const value=JSON.stringify(amMapping);window.DCLStoreSet?window.DCLStoreSet(AM_KEY,value):localStorage.setItem(AM_KEY,value);return;
    }
    const provincePools={
      'Đồng Tháp':[DEFAULT_AMS[1],DEFAULT_AMS[2]],
      'Tiền Giang':[DEFAULT_AMS[3],DEFAULT_AMS[4]],
      'Bến Tre':[DEFAULT_AMS[5],DEFAULT_AMS[6]],
      'Trà Vinh':[DEFAULT_AMS[0],DEFAULT_AMS[7]],
      'Vĩnh Long':[DEFAULT_AMS[8],DEFAULT_AMS[9]]
    };
    const grouped={};
    branches.slice().sort((a,b)=>n(b.vol_giao)-n(a.vol_giao)).forEach(b=>{
      const pv=Object.keys(provincePools).find(x=>provinceOfBranch(b.branch).includes(x))||'Khác';
      (grouped[pv]||(grouped[pv]=[])).push(b.branch);
    });
    Object.keys(grouped).forEach(pv=>{
      const pool=provincePools[pv]||[DEFAULT_AMS[10]];
      grouped[pv].forEach((branch,i)=>{
        const owner=(i>0 && i%9===0)?DEFAULT_AMS[10]:pool[i%pool.length];
        amMapping[owner].push(branch);
      });
    });
    const value=JSON.stringify(amMapping);window.DCLStoreSet?window.DCLStoreSet(AM_KEY,value):localStorage.setItem(AM_KEY,value);
  }

  function installLocationOverride(){
    branchPlan.locationOverrides=branchPlan.locationOverrides||{};
    if(baseBranchCoordInfo)return;
    baseBranchCoordInfo=branchCoordInfo;
    branchCoordInfo=function(branch){
      const override=(branchPlan.locationOverrides||{})[branch];
      if(override && isFinite(Number(override.lat)) && isFinite(Number(override.lng))){
        return {
          lat:Number(override.lat),lng:Number(override.lng),
          coord:coordText(Number(override.lat),Number(override.lng)),
          address:String(override.address||''),id:String(override.id||''),isVirtual:!!override.isVirtual
        };
      }
      return baseBranchCoordInfo(branch);
    };
  }

  function rebuildLegacySelectors(){
    try{
      drawAM=setupMulti('amMulti',Object.keys(amMapping).sort().map(am=>({value:am,label:am,small:(amMapping[am]||[]).length+' BC',children:(amMapping[am]||[])})),selectedAM,()=>{
        selectedBC.clear();selectedAM.forEach(am=>(amMapping[am]||[]).forEach(b=>selectedBC.add(b)));setColorMode('am');apply();
      });
      drawBC=setupMulti('bcMulti',branches.map(b=>({value:b.branch,label:b.branch,small:b.count})),selectedBC,()=>{selectedAM.clear();setColorMode('branch');apply();});
      const newAM=q('newBranchAM'),newAMValue=newAM?.value||'';
      if(newAM){newAM.innerHTML='<option value="">Chưa gán AM</option>'+Object.keys(amMapping).sort().map(am=>`<option value="${e(am)}">${e(am)}</option>`).join('');if(amMapping[newAMValue])newAM.value=newAMValue;}
      const relocate=q('relocateBranchSelect'),relocateValue=relocate?.value||'';
      if(relocate){relocate.innerHTML=branches.map(b=>`<option value="${e(b.branch)}">${e(b.branch)}</option>`).join('');if(byBranch[relocateValue])relocate.value=relocateValue;}
      if(typeof renderTree==='function')renderTree(true);
    }catch(err){}
  }

  function refreshMapLayers(){
    try{rebuildBranches();}catch(err){}
    try{all.forEach(x=>x.properties.color=colorForFeatureProps(x.properties));window.__dclRefreshPlanningPolygons?window.__dclRefreshPlanningPolygons():layer.setStyle(style);}catch(err){}
    try{
      marker.clearLayers();
      branches.forEach(b=>{const m=makeBranchMarker(b);if(m)marker.addLayer(m);});
    }catch(err){}
    try{apply();}catch(err){}
  }

  function refreshSystem(message){
    const amValue=JSON.stringify(amMapping),planValue=JSON.stringify(branchPlan);
    if(window.DCLStoreSet){window.DCLStoreSet(AM_KEY,amValue);window.DCLStoreSet(PLAN_KEY,planValue);}
    else{localStorage.setItem(AM_KEY,amValue);localStorage.setItem(PLAN_KEY,planValue);}
    if(message)toast(message);
    if(refreshFrame)return;
    refreshFrame=requestAnimationFrame(()=>{
      refreshFrame=0;
      refreshMapLayers();
      rebuildLegacySelectors();
      renderGlobal();
      if(activeView==='am')renderAM();
      else if(activeView==='adjust')renderAdjustSelectors();
      else if(activeView==='alerts')renderAlerts();
      else if(activeView==='colors')renderColorTargets();
    });
  }

  function branchOwner(branch){
    return Object.keys(amMapping||{}).find(am=>(amMapping[am]||[]).includes(branch))||'';
  }

  function branchTotals(branch){
    const b=byBranch[branch]||{};
    const features=all.filter(feature=>feature.properties.branch===branch),props=features.map(feature=>feature.properties);
    return {
      bc:branch,
      wards:unique(props.map(p=>p.ward).filter(Boolean)).length||n(b.count),
      volG:props.reduce((sum,p)=>sum+n(p.vol_giao),0),
      volL:props.reduce((sum,p)=>sum+n(p.vol_lay),0),
      area:props.reduce((sum,p)=>sum+n(p.area),0)||n(b.area),
      lat:n(b.lat),lng:n(b.lng)
    };
  }

  function provinceCode(name){
    const s=String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
    if(s.includes('vinh long'))return 'VLO';
    if(s.includes('dong thap'))return 'DTP';
    if(s.includes('tien giang'))return 'TGI';
    if(s.includes('ben tre'))return 'BTR';
    if(s.includes('tra vinh'))return 'TVH';
    return 'DCL';
  }

  function cleanWardName(name){
    return String(name||'').replace(/^(xã|phường|thị trấn)\s+/i,'').replace(/\s+/g,' ').trim();
  }

  function plannedBranchNameAtPoint(pos,fallback){
    if(!pos)return '';
    const feature=typeof findFeatureAtPoint==='function'?findFeatureAtPoint(pos):null;
    if(!feature||!feature.properties)return fallback||'';
    return `BC (${provinceCode(feature.properties.province)}) ${cleanWardName(feature.properties.ward)}`;
  }

  function uniqueMovedBranchName(name,oldName){
    if(!name||name===oldName)return name;
    let out=name,i=2;
    while(byBranch[out]&&out!==oldName)out=name+' '+i++;
    return out;
  }

  function renameBranchEverywhere(oldName,newName,meta){
    newName=uniqueMovedBranchName(newName,oldName);
    if(!oldName||!newName||oldName===newName)return oldName;
    all.forEach(feature=>{if(feature.properties&&feature.properties.branch===oldName)feature.properties.branch=newName;});
    if(branchPlan.branchOverrides)Object.keys(branchPlan.branchOverrides).forEach(key=>{if(branchPlan.branchOverrides[key]===oldName)branchPlan.branchOverrides[key]=newName;});
    ['virtualBranches','locationOverrides'].forEach(bucket=>{
      branchPlan[bucket]=branchPlan[bucket]||{};
      if(branchPlan[bucket][oldName]){
        branchPlan[bucket][newName]=Object.assign({},branchPlan[bucket][oldName],meta||{},{name:newName});
        delete branchPlan[bucket][oldName];
      }
    });
    Object.keys(amMapping||{}).forEach(am=>{amMapping[am]=(amMapping[am]||[]).map(x=>x===oldName?newName:x);});
    if(customColors['BC::'+oldName]){customColors['BC::'+newName]=customColors['BC::'+oldName];delete customColors['BC::'+oldName];}
    checkedBranches=new Set([...checkedBranches].map(x=>x===oldName?newName:x));
    try{if(typeof selectedBC!=='undefined')selectedBC=new Set([...selectedBC].map(x=>x===oldName?newName:x));}catch(err){}
    saveColors();savePlan();
    return newName;
  }

  function amTotalsNow(am){
    const names=(amMapping[am]||[]).filter(x=>byBranch[x]);
    const items=names.map(branchTotals);
    return {
      am,bc:names.length,
      wards:unique(all.filter(feature=>names.includes(feature.properties.branch)).map(feature=>feature.properties.ward).filter(Boolean)).length,
      volG:items.reduce((s,x)=>s+x.volG,0),volL:items.reduce((s,x)=>s+x.volL,0),
      area:items.reduce((s,x)=>s+x.area,0)
    };
  }

  function regionTotals(){
    const wardNames=unique(all.map(x=>x.properties.ward));
    return {
      bc:branches.length,am:Object.keys(amMapping||{}).length,wards:wardNames.length,
      volG:all.reduce((s,x)=>s+n(x.properties.vol_giao),0),
      volL:all.reduce((s,x)=>s+n(x.properties.vol_lay),0),
      area:all.reduce((s,x)=>s+n(x.properties.area),0)
    };
  }

  function allAMTotals(){return Object.keys(amMapping||{}).sort().map(amTotalsNow);}
  function branchWardNames(branch){
    const direct=(byBranch[branch]&&Array.isArray(byBranch[branch].wards))?byBranch[branch].wards:[];
    if(direct.length)return direct;
    return all.filter(feature=>feature.properties.branch===branch).map(feature=>feature.properties.ward).filter(Boolean);
  }
  function branchMatchesPlanningFilter(branch){
    if(!branch||!byBranch[branch])return false;
    const bcNeedle=norm(bcFilterText),wardNeedle=norm(wardFilterText);
    if(bcNeedle&&!norm(branch).includes(bcNeedle))return false;
    if(wardNeedle&&!branchWardNames(branch).some(ward=>norm(ward).includes(wardNeedle)))return false;
    return true;
  }
  function filteredBranchesForAM(am){
    return (amMapping[am]||[]).filter(branchMatchesPlanningFilter);
  }
  function amMatchesPlanningFilter(total){
    const amNeedle=norm(amFilterText);
    if(amNeedle&&!norm(total.am).includes(amNeedle))return false;
    if(bcFilterText||wardFilterText)return filteredBranchesForAM(total.am).length>0;
    return true;
  }

  function amLoadStatus(t,averages){
    if(!t.bc)return {level:'blue',label:'Quá ít',ratio:0};
    const ratios=[t.bc/(averages.bc||1),t.volG/(averages.volG||1),t.area/(averages.area||1)];
    const ratio=Math.max(...ratios);
    const low=Math.max(...ratios)<.62;
    if(ratio>=1.45)return {level:'red',label:'Quá tải',ratio};
    if(ratio>=1.15)return {level:'yellow',label:'Cao',ratio};
    if(low)return {level:'blue',label:'Quá ít',ratio};
    return {level:'green',label:'Cân bằng',ratio};
  }

  function averages(){
    const list=allAMTotals().filter(x=>x.bc>0);
    const div=list.length||1;
    return {bc:list.reduce((s,x)=>s+x.bc,0)/div,volG:list.reduce((s,x)=>s+x.volG,0)/div,area:list.reduce((s,x)=>s+x.area,0)/div};
  }

  function branchRule(branch){
    const b=byBranch[branch]||{};
    const isWard=(b.wards||[]).some(x=>/^phường/i.test(String(x).trim()));
    return isWard?{kind:'Phường',area:200,vol:1000}:{kind:'Xã',area:350,vol:800};
  }

  function branchLoadStatus(branch){
    const t=branchTotals(branch),rule=branchRule(branch);
    const areaRatio=t.area/(rule.area||1),volRatio=t.volG/(rule.vol||1),ratio=Math.max(areaRatio,volRatio);
    if(ratio>=1.45)return {level:'red',label:'Quá tải',ratio,rule};
    if(ratio>=1)return {level:'yellow',label:'Cao',ratio,rule};
    if(areaRatio<.5 && volRatio<.5)return {level:'blue',label:'Quá ít',ratio,rule};
    return {level:'green',label:'Cân bằng',ratio,rule};
  }

  function renderGlobal(){
    const t=regionTotals(),box=q('v118Global');if(!box)return;
    box.innerHTML=[
      ['Bưu cục',f(t.bc)],['AM',f(t.am)],['Xã/Phường',f(t.wards)],['Vol giao',f(t.volG)],['Diện tích',f(Math.round(t.area))+' km²']
    ].map(x=>`<div class="v118-global-card"><span>${x[0]}</span><b>${x[1]}</b></div>`).join('');
  }

  function statusHTML(s){return `<span class="v118-status ${s.level}">${e(s.label)}</span>`;}

  function ensurePlanningLayersVisible(){
    try{
      const poly=q('v118TogglePoly'),mark=q('v118ToggleMarker');
      if(poly)poly.checked=true;
      if(mark)mark.checked=true;
      if(window.__dclSetPlanningPolygonsVisible)window.__dclSetPlanningPolygonsVisible(true);
      else if(layer&&!map.hasLayer(layer))layer.addTo(map);
      if(marker&&!map.hasLayer(marker))marker.addTo(map);
    }catch(err){}
  }

  function clearLegacyMapSelection(){
    try{window.__v118PlanningSoftFocus=null;}catch(err){}
    try{selectedBC.clear();selectedAM.clear();}catch(err){}
    try{selectedRouteKey='';document.body.classList.remove('v130-route-isolated');}catch(err){}
    try{syncMulti();}catch(err){}
  }

  function repaintFullLayer(){
    try{
      all.forEach(feature=>feature.properties.color=colorForFeatureProps(feature.properties));
      if(window.__dclRefreshPlanningPolygons)window.__dclRefreshPlanningPolygons();
      else layer.setStyle(style);
      apply();
      updateBranchMarkerActive&&updateBranchMarkerActive();
    }catch(err){}
  }

  function showFullPlanningMap(fit){
    ensurePlanningLayersVisible();
    clearLegacyMapSelection();
    try{colorMode='branch';const legacy=q('colorMode');if(legacy)legacy.value='branch';}catch(err){}
    repaintFullLayer();
    if(fit)try{map.fitBounds(layer.getBounds(),{padding:[32,32],maxZoom:9})}catch(err){}
  }

  function fitFocusBounds(branchNames,wardKeys){
    const branchSet=new Set(branchNames||[]),wardSet=new Set(wardKeys||[]);
    const features=all.filter(feature=>{
      const p=feature.properties||{};
      return branchSet.has(p.branch)||wardSet.has(featureKey(p));
    });
    if(!features.length)return;
    try{
      const bounds=L.geoJSON({type:'FeatureCollection',features}).getBounds();
      map.fitBounds(bounds,{padding:[42,42],maxZoom:12});
    }catch(err){}
  }

  function focusPlanningMap(options){
    options=options||{};
    ensurePlanningLayersVisible();
    const fineFilter=!!(bcFilterText||wardFilterText);
    const selectedAMOk=selectedAMName&&amMapping[selectedAMName];
    let names=[];
    if(selectedAMOk)names=filteredBranchesForAM(selectedAMName);
    else names=unique(allAMTotals().filter(amMatchesPlanningFilter).flatMap(total=>filteredBranchesForAM(total.am)));
    const wardNeedle=norm(wardFilterText);
    const branchSet=new Set(names);
    const wardKeys=wardNeedle?all.filter(feature=>branchSet.has(feature.properties.branch)&&norm(feature.properties.ward).includes(wardNeedle)).map(feature=>featureKey(feature.properties)):[];
    if(!names.length&&!wardKeys.length){showFullPlanningMap(!!options.fit);return;}
    clearLegacyMapSelection();
    const ams=(!fineFilter&&selectedAMOk)?[selectedAMName]:[];
    window.__v118PlanningSoftFocus={branches:names,ams,wardKeys,keepContext:true};
    try{
      colorMode=ams.length?'am':'branch';
      const legacy=q('colorMode');if(legacy)legacy.value=colorMode;
    }catch(err){}
    repaintFullLayer();
    if(options.fit)fitFocusBounds(names,wardKeys);
  }

  function resetPlanningFilters(){
    selectedAMName='';
    checkedBranches.clear();
    amFilterText='';
    bcFilterText='';
    wardFilterText='';
  }

  function setView(name){
    activeView=name;
    center.querySelectorAll('.v118-tab').forEach(x=>x.classList.toggle('active',x.dataset.view===name));
    center.querySelectorAll('.v118-view').forEach(x=>x.classList.toggle('active',x.dataset.view===name));
    const activeTab=center.querySelector('.v118-tab.active');
    if(activeTab)activeTab.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
    if(name==='am'){renderAM();(amFilterText||bcFilterText||wardFilterText)?focusPlanningMap():showFullPlanningMap();}
    if(name==='adjust')renderAdjustSelectors();
    if(name==='alerts')renderAlerts();
    if(name==='colors')renderColorTargets();
    if(name==='accounts')renderAccounts();
    saveWorkflow();
  }

  function openCenter(view,options){
    if(options&&options.resetFilters)resetPlanningFilters();
    center.classList.add('open');
    document.body.classList.add('v118-center-open');
    document.getElementById('mainSidebar')?.classList.remove('mobile-open');
    document.getElementById('mobileBackdrop')?.classList.remove('open');
    ensurePlanningLayersVisible();
    setView(view||activeView);
    setTimeout(()=>{try{map.invalidateSize();}catch(err){}},200);
  }

  function closeCenter(){
    center.classList.remove('open');
    document.body.classList.remove('v118-center-open');
    setTimeout(()=>{try{map.invalidateSize();}catch(err){}},200);
  }

  function renderAM(){
    const list=allAMTotals().filter(amMatchesPlanningFilter),avg=averages();
    if(!selectedAMName || !amMapping[selectedAMName] || !list.some(x=>x.am===selectedAMName))selectedAMName=(list[0]||{}).am||'';
    const filterInputs=[['v118FilterAM',amFilterText],['v118FilterBC',bcFilterText],['v118FilterWard',wardFilterText]];
    filterInputs.forEach(([id,val])=>{const input=q(id);if(input&&input.value!==val)input.value=val;});
    const table=q('v118AMTable');
    table.innerHTML=list.map(t=>{
      const st=amLoadStatus(t,avg),pct=Math.min(100,Math.round(st.ratio/1.5*100));
      return `<tr data-am="${e(t.am)}" class="${t.am===selectedAMName?'selected':''}">
        <td><b>${e(t.am)}</b><div class="v118-loadbar ${st.level}"><i style="width:${pct}%"></i></div></td>
        <td class="num">${f(t.bc)}</td><td class="num">${f(t.wards)}</td><td class="num">${f(t.volG)}</td>
        <td class="num">${f(t.volL)}</td><td class="num">${f(t.area)}</td><td>${statusHTML(st)}</td>
      </tr>`;
    }).join('')||'<tr><td colspan="7" class="v118-empty">Chưa có AM</td></tr>';
    table.querySelectorAll('tr[data-am]').forEach(row=>row.onclick=()=>{selectedAMName=row.dataset.am;checkedBranches.clear();renderAM();focusPlanningMap();saveWorkflow();});
    renderSelectedAM();
  }

  function amOptions(selected){
    return Object.keys(amMapping||{}).sort().map(am=>`<option value="${e(am)}" ${am===selected?'selected':''}>${e(am)}</option>`).join('');
  }

  function renderSelectedAM(){
    const am=selectedAMName,t=amTotalsNow(am),avg=averages(),st=amLoadStatus(t,avg);
    q('v118SelectedAMTitle').innerHTML=`${e(am||'Chưa chọn AM')} ${statusHTML(st)}`;
    q('v118AMSummary').innerHTML=[['Bưu cục',t.bc],['Xã/Phường',t.wards],['Vol giao',f(t.volG)],['Vol lấy',f(t.volL)],['Diện tích',f(t.area)+' km²'],['Trạng thái',st.label]].map(x=>`<div class="v118-mini"><span>${x[0]}</span><b>${e(x[1])}</b></div>`).join('');
    const names=filteredBranchesForAM(am);
    q('v118AMBranches').innerHTML=names.map(branch=>{
      const b=branchTotals(branch),checked=checkedBranches.has(branch)?'checked':'';
      return `<tr>
        <td><input type="checkbox" data-check-branch="${e(branch)}" ${checked}></td>
        <td><b title="${e(branch)}">${e(branch)}</b></td><td class="num">${f(b.volG)}</td><td class="num">${f(b.volL)}</td>
        <td class="num">${f(b.area)}</td><td class="num">${f(b.wards)}</td>
        <td><select data-branch-am="${e(branch)}">${amOptions(am)}</select></td>
      </tr>`;
    }).join('')||'<tr><td colspan="7" class="v118-empty">AM này chưa có bưu cục</td></tr>';
    q('v118AMBranches').querySelectorAll('[data-check-branch]').forEach(ch=>ch.onchange=()=>{
      ch.checked?checkedBranches.add(ch.dataset.checkBranch):checkedBranches.delete(ch.dataset.checkBranch);renderBulkCount();
    });
    q('v118AMBranches').querySelectorAll('[data-branch-am]').forEach(sel=>sel.onchange=()=>moveBranchesToAM([sel.dataset.branchAm],sel.value));
    q('v118BulkTarget').innerHTML='<option value="">Chuyển các BC đã chọn đến...</option>'+amOptions('');
    q('v118AMId').value=(splitAMKey(am).id||'');
    q('v118AMName').value=(splitAMKey(am).name||'');
    renderBulkCount();
  }

  function renderBulkCount(){const x=q('v118BulkCount');if(x)x.textContent=checkedBranches.size+' BC đã chọn';}

  function focusAMOnMap(){
    focusPlanningMap();
    saveWorkflow();
  }

  function moveBranchesToAM(names,target){
    if(!names.length||!target)return;
    names.forEach(branch=>{
      Object.keys(amMapping).forEach(am=>amMapping[am]=amMapping[am].filter(x=>x!==branch));
      if(!amMapping[target])amMapping[target]=[];
      if(!amMapping[target].includes(branch))amMapping[target].push(branch);
    });
    selectedAMName=target;selectedAM=new Set([target]);selectedBC.clear();checkedBranches.clear();colorMode='am';
    saveWorkflow();
    refreshSystem('Đã chuyển '+names.length+' bưu cục và tính lại toàn bộ AM');
  }

  function saveAMInline(){
    const id=q('v118AMId').value.trim(),name=q('v118AMName').value.trim();
    if(!id||!name)return toast('Nhập đủ ID và tên AM');
    const key=id+' - '+name;
    const old=selectedAMName&&amMapping[selectedAMName]?selectedAMName:'';
    if(old!==key){
      const exists=Object.keys(amMapping).find(x=>x!==old&&splitAMKey(x).id.toLowerCase()===id.toLowerCase());
      if(exists)return toast('ID AM đã tồn tại');
      amMapping[key]=old?(amMapping[old]||[]):[];
      if(old)delete amMapping[old];
    }
    selectedAMName=key;selectedAM=new Set([key]);selectedBC.clear();colorMode='am';saveWorkflow();
    refreshSystem(old?'Đã cập nhật AM':'Đã thêm AM mới');
  }

  function newAMForm(){selectedAMName='';selectedAM.clear();selectedBC.clear();checkedBranches.clear();colorMode='am';try{all.forEach(feature=>feature.properties.color=colorForFeatureProps(feature.properties));window.__dclRefreshPlanningPolygons?window.__dclRefreshPlanningPolygons():layer.setStyle(style);apply();}catch(err){}q('v118AMId').value='';q('v118AMName').value='';q('v118AMId').focus();saveWorkflow();}

  function deleteSelectedAM(){
    if(!selectedAMName||!amMapping[selectedAMName])return;
    if(!confirm('Xóa '+selectedAMName+'? Các bưu cục sẽ chuyển sang trạng thái chưa gán AM.'))return;
    delete amMapping[selectedAMName];selectedAMName='';selectedAM.clear();selectedBC.clear();checkedBranches.clear();colorMode='am';saveWorkflow();refreshSystem('Đã xóa AM');
  }

  function haversine(a,b){
    const R=6371,toRad=x=>x*Math.PI/180;
    const dLat=toRad(b.lat-a.lat),dLng=toRad(b.lng-a.lng);
    const h=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;
    return 2*R*Math.asin(Math.sqrt(h));
  }

  function checkCoordinate(){
    const pt=parseCoordinateInput(q('v118Coord').value),out=q('v118CoordResult');
    if(!pt){out.className='v118-result warn';out.textContent='Không đọc được tọa độ. Ví dụ: 10.123456, 106.123456';return;}
    if(checkMarker)try{map.removeLayer(checkMarker);}catch(err){}
    checkMarker=L.marker([pt.lat,pt.lng],{title:'Mặt bằng cần kiểm tra'}).addTo(map).bindPopup('<b>Mặt bằng cần kiểm tra</b><br>'+pt.lat.toFixed(6)+', '+pt.lng.toFixed(6)).openPopup();
    map.setView([pt.lat,pt.lng],13);
    const feature=findFeatureAtPoint(pt),nearest=branches.filter(b=>isFinite(b.lat)&&isFinite(b.lng)).map(b=>({branch:b.branch,d:haversine(pt,{lat:n(b.lat),lng:n(b.lng)})})).sort((a,b)=>a.d-b.d).slice(0,3);
    const current=feature?feature.properties:null;
    out.className='v118-result good';
    out.innerHTML=`<b>Kiểm tra mặt bằng</b><br>${current?`${e(current.province)} · ${e(current.ward)}<br>BC hiện hữu: <b>${e(current.branch)}</b><br>AM: ${e(branchOwner(current.branch)||'Chưa gán')}`:'Điểm nằm ngoài polygon xã/phường hiện có.'}
      <div class="v118-nearest">${nearest.map((x,i)=>`<div><span>${i===0?'Đề xuất gần nhất: ':''}${e(x.branch)}</span><b>${x.d.toFixed(1)} km</b></div>`).join('')}</div>`;
  }

  function colorModeApply(){
    const mode=q('v118ColorMode').value;
    if(mode==='planning'){
      if(!planningColorBackup)planningColorBackup=JSON.parse(JSON.stringify(customColors||{}));
      branches.forEach(b=>{
        const st=branchLoadStatus(b.branch);
        customColors['BC::'+b.branch]=st.level==='red'?'#ef4444':st.level==='yellow'?'#f59e0b':st.level==='blue'?'#3b82f6':'#22c55e';
      });
      colorMode='custom';recolorAll();toast('Đã tô màu theo trạng thái quy hoạch');
    }else{
      if(planningColorBackup){customColors=planningColorBackup;planningColorBackup=null;saveColors();}
      colorMode=mode==='route'?'ward':mode;
      const legacy=q('colorMode');if(legacy)legacy.value=colorMode;
      recolorAll();toast('Đã đổi chế độ hiển thị');
    }
    renderColorTargets();
  }

  function renderColorTargets(){
    const type=q('v118ColorTargetType')?.value||'am',sel=q('v118ColorTarget');if(!sel)return;
    let items=[];
    if(type==='am')items=Object.keys(amMapping).sort();
    else if(type==='bc')items=branches.map(x=>x.branch);
    else items=all.map(x=>featureKey(x.properties));
    sel.innerHTML=items.map(x=>`<option value="${e(x)}">${e(type==='route'?(all.find(f=>featureKey(f.properties)===x)?.properties.ward||x):x)}</option>`).join('');
    const preview=q('v118ColorPreview');
    if(preview){
      preview.innerHTML=branches.slice(0,12).map(b=>`<div class="v118-color-chip"><i style="background:${e(colorForFeatureProps({branch:b.branch,ward:''}))}"></i><span>${e(b.branch)}</span></div>`).join('');
    }
  }

  function applyManualColor(){
    const type=q('v118ColorTargetType').value,target=q('v118ColorTarget').value,color=q('v118ManualColor').value;
    if(!target)return;
    if(planningColorBackup){customColors=planningColorBackup;planningColorBackup=null;}
    if(type==='am')customColors['AM::'+target]=color;
    else if(type==='bc')customColors['BC::'+target]=color;
    else{
      const feature=all.find(x=>featureKey(x.properties)===target);
      if(feature)customColors[wardColorKey(feature.properties)]=color;
    }
    saveColors();colorMode=type==='route'?'ward':'custom';recolorAll();renderColorTargets();toast('Đã lưu màu thủ công');
  }

  function featureOptions(){
    return all.slice().sort((a,b)=>String(a.properties.ward).localeCompare(String(b.properties.ward),'vi')).map(x=>{
      const p=x.properties;return `<option value="${e(featureKey(p))}">${e(p.ward)} · ${e(p.branch)}</option>`;
    }).join('');
  }

  function branchOptions(selected){
    return branches.map(b=>`<option value="${e(b.branch)}" ${b.branch===selected?'selected':''}>${e(b.branch)}</option>`).join('');
  }

  function findFeatureByValue(value){return all.find(x=>featureKey(x.properties)===value);}

  function renderAdjustSelectors(){
    const route=q('v118RouteWard'),dest=q('v118RouteDest'),move=q('v118MoveBranch'),newAM=q('v118NewAM'),newWards=q('v118NewWards');
    if(!route)return;
    const routeValue=route.value,moveValue=move.value;
    route.innerHTML=featureOptions();if(routeValue)route.value=routeValue;
    dest.innerHTML=branchOptions('');
    move.innerHTML=branchOptions(moveValue);if(moveValue)move.value=moveValue;
    newAM.innerHTML='<option value="">Chưa gán AM</option>'+amOptions('');
    newWards.innerHTML=all.slice().sort((a,b)=>String(a.properties.ward).localeCompare(String(b.properties.ward),'vi')).map(x=>`<option value="${e(featureKey(x.properties))}">${e(x.properties.ward)} · ${e(x.properties.branch)}</option>`).join('');
    updateRoutePreview();updateMovePreview();
  }

  function updateRoutePreview(){
    const feature=findFeatureByValue(q('v118RouteWard')?.value),dest=q('v118RouteDest')?.value,out=q('v118RoutePreview');
    if(!feature||!out)return;
    const p=feature.properties,old=branchTotals(p.branch),to=branchTotals(dest),vol=n(p.vol_giao),area=n(p.area);
    out.innerHTML=`<div class="v118-delta"><div class="v118-delta-box"><b>${e(p.branch)}</b><span>-${f(vol)} Vol · -${f(area)} km²</span></div><div class="v118-arrow">→</div><div class="v118-delta-box"><b>${e(dest||'Chọn BC nhận')}</b><span>+${f(vol)} Vol · +${f(area)} km²</span></div></div><div class="v118-help" style="margin-top:7px">${e(p.ward)} hiện thuộc ${e(p.branch)}. Sau khi chuyển, số tuyến, Vol, diện tích và AM của hai BC được tính lại ngay.</div>`;
  }

  function transferWard(){
    const feature=findFeatureByValue(q('v118RouteWard').value),dest=q('v118RouteDest').value;
    if(!feature||!dest)return toast('Chọn xã/phường và BC nhận');
    if(feature.properties.branch===dest)return toast('Xã/phường đang thuộc BC này');
    const ward=feature.properties.ward;
    setWardBranch(feature,dest);
    refreshSystem('Đã chuyển '+ward+' và cập nhật toàn hệ thống');
  }

  function createBranchNow(){
    const enteredName=q('v118NewName').value.trim(),address=q('v118NewAddress').value.trim(),pos=parseCoordinateInput(q('v118NewCoord').value),am=q('v118NewAM').value;
    const wardKeys=[...q('v118NewWards').selectedOptions].map(x=>x.value);
    let name=plannedBranchNameAtPoint(pos,enteredName)||enteredName;
    if(!name||!address||!pos)return toast('Nhập tên, địa chỉ và tọa độ hợp lệ');
    if(byBranch[name]||branchPlan.virtualBranches[name])return toast('Tên bưu cục đã tồn tại');
    branchPlan.virtualBranches[name]={id:'BC-'+Date.now().toString().slice(-6),name,am,address,lat:pos.lat,lng:pos.lng,color:'#f26522',createdAt:new Date().toISOString()};
    branchPlan.locationOverrides=branchPlan.locationOverrides||{};
    branchPlan.locationOverrides[name]={lat:pos.lat,lng:pos.lng,address,isVirtual:true};
    if(am){if(!amMapping[am])amMapping[am]=[];amMapping[am].push(name);}
    wardKeys.forEach(key=>{const feature=findFeatureByValue(key);if(feature){branchPlan.branchOverrides[featureKey(feature.properties)]=name;feature.properties.branch=name;}});
    savePlan();
    q('v118NewName').value='';q('v118NewAddress').value='';q('v118NewCoord').value='';
    refreshSystem('Đã tạo BC mới, kéo '+wardKeys.length+' tuyến vào và tính lại số liệu');
    try{map.setView([pos.lat,pos.lng],13);}catch(err){}
  }

  function wardDistances(branch,pos){
    return all.filter(x=>x.properties.branch===branch).map(x=>{
      const c=centroid(x.geometry);return haversine(pos,{lat:c[1],lng:c[0]});
    });
  }

  function updateMovePreview(){
    const branch=q('v118MoveBranch')?.value,pos=parseCoordinateInput(q('v118MoveCoord')?.value||''),out=q('v118MovePreview');
    if(!out)return;
    const b=byBranch[branch];
    if(!b){out.textContent='Chọn bưu cục cần di dời.';return;}
    if(!pos){out.innerHTML=`Vị trí hiện tại: <b>${e(b.coord||coordText(b.lat,b.lng))}</b><br>${e(b.address||'Chưa có địa chỉ')}`;return;}
    const ds=wardDistances(branch,pos),avg=ds.length?ds.reduce((s,x)=>s+x,0)/ds.length:0,max=ds.length?Math.max(...ds):0;
    const newName=plannedBranchNameAtPoint(pos,'');
    out.innerHTML=`Vị trí mới: <b>${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}</b><br>${newName?`Tên BC sau di dời: <b>${e(newName)}</b><br>`:''}Khoảng cách thẳng trung bình tới ${ds.length} tuyến: <b>${avg.toFixed(1)} km</b> · xa nhất <b>${max.toFixed(1)} km</b>`;
  }

  function moveBranchNow(){
    const branch=q('v118MoveBranch').value,address=q('v118MoveAddress').value.trim(),pos=parseCoordinateInput(q('v118MoveCoord').value);
    if(!branch||!pos)return toast('Chọn BC và nhập tọa độ mới');
    branchPlan.locationOverrides=branchPlan.locationOverrides||{};
    const old=branchCoordInfo(branch)||{};
    const meta={lat:pos.lat,lng:pos.lng,address:address||old.address||'',id:old.id||'',isVirtual:!!old.isVirtual};
    const newName=renameBranchEverywhere(branch,plannedBranchNameAtPoint(pos,branch),meta);
    branchPlan.locationOverrides[newName]=meta;
    if(branchPlan.virtualBranches[newName])Object.assign(branchPlan.virtualBranches[newName],meta,{name:newName});
    savePlan();refreshSystem(`Đã di dời ${branch} → ${newName} và tính lại khoảng cách các tuyến`);
    try{map.setView([pos.lat,pos.lng],13);}catch(err){}
  }

  function deleteVirtualBranchNow(){
    const branch=q('v118MoveBranch').value;
    if(!branchPlan.virtualBranches[branch])return toast('Chỉ xóa được bưu cục quy hoạch mới');
    if(all.some(x=>x.properties.branch===branch))return toast('Hãy chuyển hết tuyến sang BC khác trước khi xóa');
    delete branchPlan.virtualBranches[branch];
    if(branchPlan.locationOverrides)delete branchPlan.locationOverrides[branch];
    delete customColors['BC::'+branch];
    Object.keys(amMapping).forEach(am=>amMapping[am]=amMapping[am].filter(x=>x!==branch));
    saveColors();savePlan();refreshSystem('Đã xóa bưu cục quy hoạch mới');
  }

  function resetCoordPickUI(){
    if(coordPickButton){
      coordPickButton.textContent=coordPickButtonIdle||'Chọn trên map';
      coordPickButton.classList.remove('orange');
      coordPickButton.classList.add('soft');
    }
    if(coordPickCancelButton)coordPickCancelButton.style.display='none';
    coordPickButton=null;
    coordPickButtonIdle='';
  }
  window.__v118CoordPickResetUI=resetCoordPickUI;
  function ensureCoordPickCancelButton(button){
    if(!button)return null;
    if(!coordPickCancelButton){
      coordPickCancelButton=document.createElement('button');
      coordPickCancelButton.type='button';
      coordPickCancelButton.className='v118-btn soft';
      coordPickCancelButton.textContent='✕ Hủy chọn tọa độ';
      coordPickCancelButton.style.display='none';
      coordPickCancelButton.onclick=()=>{
        if(typeof window.cancelCoordPick==='function')window.cancelCoordPick();
        coordPickInput='';
        resetCoordPickUI();
        if(center)center.classList.add('open');
      };
      button.insertAdjacentElement('afterend',coordPickCancelButton);
    }else if(coordPickCancelButton.previousElementSibling!==button){
      button.insertAdjacentElement('afterend',coordPickCancelButton);
    }
    return coordPickCancelButton;
  }
  function startPick(input,button){
    coordPickInput=input;
    coordPickButton=button||null;
    coordPickButtonIdle=button?.dataset?.idleText||button?.textContent||'Chọn trên map';
    if(button){
      button.dataset.idleText=coordPickButtonIdle;
      button.textContent='📍 Đang chọn tọa độ...';
      button.classList.remove('soft');
      button.classList.add('orange');
      const cancel=ensureCoordPickCancelButton(button);
      if(cancel)cancel.style.display='block';
    }
    toast('Bấm một điểm trên bản đồ để lấy tọa độ');
    if(center)center.classList.add('open');
    if(typeof window.startCoordPick==='function'){
      coordPickInput='';
      window.startCoordPick(input);
    }
  }

  function readAccounts(){
    try{
      const raw=localStorage.getItem(ACCOUNT_KEY);
      const list=raw?JSON.parse(raw):[];
      return Array.isArray(list)?list:[];
    }catch(err){return [];}
  }

  function writeAccounts(list){
    try{localStorage.setItem(ACCOUNT_KEY,JSON.stringify(list));}catch(err){}
  }

  function selectValues(id){
    const el=q(id);
    return el?[...el.selectedOptions].map(option=>option.value).filter(Boolean):[];
  }

  function setMultiValues(id,values){
    const wanted=new Set(values||[]),el=q(id);
    if(!el)return;
    [...el.options].forEach(option=>option.selected=wanted.has(option.value));
  }

  function roleLabel(role){
    if(role==='ADMIN')return 'ADMIN';
    if(role==='GDV')return 'GĐV';
    if(role==='AM')return 'AM';
    return 'VIEWER';
  }

  function statusLabel(status){
    return status==='locked'?'Khóa':'Đang hoạt động';
  }

  function provinceList(){
    return unique(all.map(feature=>feature.properties.province).filter(Boolean)).sort((a,b)=>String(a).localeCompare(String(b),'vi'));
  }

  function branchesByProvince(provinces){
    const set=new Set(provinces||[]);
    return branches.filter(branch=>!set.size||set.has(provinceOfBranch(branch.branch))).map(branch=>branch.branch);
  }

  function accountScopeBranches(role,provinces,branchNames){
    if(role==='ADMIN')return branches.map(branch=>branch.branch);
    if(role==='GDV')return branchesByProvince(provinces);
    if(role==='AM')return (branchNames||[]).filter(name=>byBranch[name]);
    return branches.map(branch=>branch.branch);
  }

  function accountScopeStats(role,provinces,branchNames){
    const names=accountScopeBranches(role,provinces,branchNames);
    const nameSet=new Set(names);
    const features=all.filter(feature=>nameSet.has(feature.properties.branch));
    return {
      branches:names.length,
      provinces:unique(features.map(feature=>feature.properties.province).filter(Boolean)).length,
      wards:unique(features.map(feature=>feature.properties.ward).filter(Boolean)).length,
      volG:features.reduce((sum,feature)=>sum+n(feature.properties.vol_giao),0),
      area:features.reduce((sum,feature)=>sum+n(feature.properties.area),0)
    };
  }

  function renderAccountFormOptions(){
    const provinceSel=q('v118AccountProvinces'),branchSel=q('v118AccountBranches');
    if(!provinceSel||!branchSel)return;
    const provinceValues=selectValues('v118AccountProvinces');
    const branchValues=selectValues('v118AccountBranches');
    provinceSel.innerHTML=provinceList().map(province=>`<option value="${e(province)}">${e(province)}</option>`).join('');
    branchSel.innerHTML=branches.slice().sort((a,b)=>String(a.branch).localeCompare(String(b.branch),'vi')).map(branch=>{
      const owner=branchOwner(branch.branch)||'Chưa gán AM';
      return `<option value="${e(branch.branch)}">${e(branch.branch)} · ${e(provinceOfBranch(branch.branch))} · ${e(owner)}</option>`;
    }).join('');
    setMultiValues('v118AccountProvinces',provinceValues);
    setMultiValues('v118AccountBranches',branchValues);
  }

  function renderAccountScope(){
    const role=q('v118AccountRole')?.value||'GDV';
    const gdvBox=q('v118AccountGDVScope'),amBox=q('v118AccountAMScope');
    if(gdvBox)gdvBox.style.display=role==='GDV'?'block':'none';
    if(amBox)amBox.style.display=role==='AM'?'block':'none';
    renderAccountPreview();
  }

  function renderAccountPreview(){
    const box=q('v118AccountPreview');
    if(!box)return;
    const role=q('v118AccountRole')?.value||'GDV';
    const provinces=selectValues('v118AccountProvinces');
    const branchNames=selectValues('v118AccountBranches');
    const stats=accountScopeStats(role,provinces,branchNames);
    box.innerHTML=[
      ['Vai trò',roleLabel(role)],
      ['Tỉnh',f(stats.provinces)],
      ['Bưu cục',f(stats.branches)],
      ['Xã/Phường',f(stats.wards)],
      ['Vol giao',f(stats.volG)],
      ['Diện tích',f(Math.round(stats.area))+' km²']
    ].map(item=>`<div class="v118-mini"><span>${e(item[0])}</span><b>${e(item[1])}</b></div>`).join('');
  }

  function resetAccountForm(){
    selectedAccountId='';
    ['v118AccountUser','v118AccountName','v118AccountTempPass'].forEach(id=>{const el=q(id);if(el)el.value='';});
    const role=q('v118AccountRole'),status=q('v118AccountStatus');
    if(role)role.value='GDV';
    if(status)status.value='active';
    setMultiValues('v118AccountProvinces',[]);
    setMultiValues('v118AccountBranches',[]);
    renderAccountScope();
  }

  function editAccount(id){
    const account=readAccounts().find(item=>item.id===id);
    if(!account)return;
    selectedAccountId=id;
    q('v118AccountUser').value=account.username||'';
    q('v118AccountName').value=account.fullName||'';
    q('v118AccountTempPass').value='';
    q('v118AccountRole').value=account.role||'GDV';
    q('v118AccountStatus').value=account.status||'active';
    setMultiValues('v118AccountProvinces',account.provinces||[]);
    setMultiValues('v118AccountBranches',account.branches||[]);
    renderAccountScope();
    renderAccounts();
  }

  async function accountPasswordHash(username,password){
    if(!window.crypto?.subtle||!password)return '';
    const normalized=String(username||'').trim().toLowerCase();
    const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${normalized}:${password}`));
    return Array.from(new Uint8Array(buf)).map(byte=>byte.toString(16).padStart(2,'0')).join('');
  }

  async function saveAccount(){
    const username=(q('v118AccountUser')?.value||'').trim();
    const fullName=(q('v118AccountName')?.value||'').trim();
    const role=q('v118AccountRole')?.value||'GDV';
    const status=q('v118AccountStatus')?.value||'active';
    const tempPass=(q('v118AccountTempPass')?.value||'').trim();
    const provinces=selectValues('v118AccountProvinces');
    const branchNames=selectValues('v118AccountBranches');
    if(!username||!fullName)return toast('Nhập đủ tài khoản và họ tên');
    if(role==='GDV'&&!provinces.length)return toast('Chọn ít nhất 1 tỉnh cho GĐV');
    if(role==='AM'&&!branchNames.length)return toast('Chọn ít nhất 1 bưu cục cho AM');
    const list=readAccounts();
    const duplicate=list.find(item=>item.id!==selectedAccountId&&String(item.username).toLowerCase()===username.toLowerCase());
    if(duplicate)return toast('Tên đăng nhập đã tồn tại');
    const now=new Date().toISOString();
    const current=selectedAccountId?list.find(item=>item.id===selectedAccountId):null;
    const passwordHash=tempPass?await accountPasswordHash(username,tempPass):((current&&current.passwordHash)||'');
    const item=Object.assign({},current||{},{
      id:selectedAccountId||('ACC-'+Date.now()),
      username,fullName,role,status,
      provinces:role==='GDV'?provinces:[],
      branches:role==='AM'?branchNames:[],
      updatedAt:now,
      createdAt:(current&&current.createdAt)||now,
      mustChangePassword:!!tempPass||(current&&current.mustChangePassword)||false,
      passwordHash,
      passwordMode:tempPass?'local-hash':((current&&current.passwordMode)||'not-set')
    });
    const next=current?list.map(account=>account.id===item.id?item:account):[item,...list];
    writeAccounts(next);
    selectedAccountId=item.id;
    renderAccounts();
    toast(current?'Đã cập nhật tài khoản':'Đã tạo cấu hình tài khoản');
  }

  function deleteAccount(){
    if(!selectedAccountId)return toast('Chọn tài khoản cần xóa');
    const account=readAccounts().find(item=>item.id===selectedAccountId);
    if(!account)return;
    if(!confirm('Xóa tài khoản '+account.username+'?'))return;
    writeAccounts(readAccounts().filter(item=>item.id!==selectedAccountId));
    resetAccountForm();
    renderAccounts();
    toast('Đã xóa tài khoản');
  }

  function accountScopeText(account){
    if(account.role==='GDV')return (account.provinces||[]).join(', ')||'Chưa gán tỉnh';
    if(account.role==='AM')return `${(account.branches||[]).length} bưu cục`;
    return 'Toàn vùng';
  }

  function renderAccounts(){
    renderAccountFormOptions();
    renderAccountScope();
    const list=readAccounts();
    const tbody=q('v118AccountTable');
    if(!tbody)return;
    tbody.innerHTML=list.map(account=>{
      const stats=accountScopeStats(account.role,account.provinces||[],account.branches||[]);
      return `<tr data-account-id="${e(account.id)}" class="${account.id===selectedAccountId?'selected':''}">
        <td><b>${e(account.username)}</b><small>${e(account.fullName)}</small></td>
        <td>${e(roleLabel(account.role))}</td>
        <td>${e(accountScopeText(account))}</td>
        <td class="num">${f(stats.branches)}</td>
        <td class="num">${f(stats.wards)}</td>
        <td>${e(statusLabel(account.status))}</td>
      </tr>`;
    }).join('')||'<tr><td colspan="6" class="v118-empty">Chưa có tài khoản GĐV/AM nào. Tạo tài khoản ở form bên trên.</td></tr>';
    tbody.querySelectorAll('tr[data-account-id]').forEach(row=>row.onclick=()=>editAccount(row.dataset.accountId));
  }

  function renderAlerts(){
    const avg=averages(),amAlerts=allAMTotals().map(t=>({kind:'AM',name:t.am,status:amLoadStatus(t,avg),meta:`${t.bc} BC · ${f(t.volG)} Vol · ${f(t.area)} km²`}));
    const bcAlerts=branches.map(b=>{const t=branchTotals(b.branch),status=branchLoadStatus(b.branch);return {kind:'BC',name:b.branch,status,meta:`${t.wards} xã/phường · ${f(t.volG)} Vol · ${f(t.area)} km² · Chuẩn ${status.rule.kind}: ${status.rule.vol} Vol / ${status.rule.area} km²`};});
    const order={red:0,yellow:1,blue:2,green:3};
    const allAlerts=[...amAlerts,...bcAlerts].sort((a,b)=>order[a.status.level]-order[b.status.level]);
    const counts=allAlerts.reduce((o,x)=>(o[x.status.level]=(o[x.status.level]||0)+1,o),{});
    q('v118AlertSummary').innerHTML=[['Quá tải',counts.red||0,'red'],['Cao',counts.yellow||0,'yellow'],['Quá ít',counts.blue||0,'blue'],['Cân bằng',counts.green||0,'green']].map(x=>`<div class="v118-mini"><span>${x[0]}</span><b>${x[1]}</b></div>`).join('');
    q('v118Alerts').innerHTML=allAlerts.map(x=>`<div class="v118-alert ${x.status.level}"><i class="v118-alert-mark"></i><div><strong>${e(x.kind)} · ${e(x.name)}</strong><small>${e(x.meta)}</small></div>${statusHTML(x.status)}</div>`).join('');
  }

  function renderAll(){renderGlobal();renderAM();renderAdjustSelectors();renderAlerts();renderColorTargets();renderAccounts();}

  function buildUI(){
    const sidebar=q('mainSidebar');
    if(sidebar&&!q('v118PlannerButton'))sidebar.insertAdjacentHTML('afterbegin','<button id="v118PlannerButton" type="button">Trung tâm điều chỉnh quy hoạch</button>');
    center=document.createElement('section');
    center.id='v118PlanningCenter';
    center.setAttribute('aria-label','Trung tâm điều chỉnh quy hoạch mạng lưới');
    center.innerHTML=`
      <div class="v118-head"><div class="v118-head-copy"><h2>Trung tâm điều chỉnh quy hoạch</h2><p>Một nguồn dữ liệu cho Bưu cục · AM · Toàn vùng</p><span class="v118-live">Cập nhật tức thì sau mỗi điều chỉnh</span></div><button class="v118-close" id="v118Close" aria-label="Đóng">×</button></div>
      <div class="v118-global" id="v118Global"></div>
      <nav class="v118-tabs">
        <button class="v118-tab" data-view="coord">1. Kiểm tra tọa độ</button>
        <button class="v118-tab" data-view="colors">2. Màu & hiển thị</button>
        <button class="v118-tab active" data-view="am">3. AM → Bưu cục</button>
        <button class="v118-tab" data-view="adjust">4. Điều chỉnh quy hoạch</button>
        <button class="v118-tab" data-view="alerts">5. So sánh & cảnh báo</button>
        <button class="v118-tab" data-view="accounts">6. Tài khoản & phân quyền</button>
      </nav>
      <div class="v118-content">
        <section class="v118-view" data-view="coord"><div class="v118-grid">
          <div class="v118-card"><h3>Kiểm tra mặt bằng</h3><p class="v118-help">Dán tọa độ hoặc link Google Maps. Hệ thống hiển thị vị trí, xã/phường, BC hiện hữu và AM trên bản đồ.</p><div class="v118-field"><label>Tọa độ mặt bằng</label><input id="v118Coord" placeholder="10.123456, 106.123456"></div><div class="v118-actions"><button class="v118-btn orange" id="v118CoordCheck">Kiểm tra trên map</button><button class="v118-btn soft" data-pick="v118Coord">Chọn trên map</button></div><div class="v118-result" id="v118CoordResult">Chưa có tọa độ để kiểm tra.</div></div>
          <div class="v118-card"><h3>Kết quả đề xuất</h3><p class="v118-help">Khoảng cách được đo theo đường thẳng để sàng lọc nhanh mặt bằng. Ba BC gần nhất được xếp theo khoảng cách.</p><div class="v118-result good"><b>Luồng kiểm tra</b><br>1. Xác định polygon xã/phường.<br>2. Đo khoảng cách tới toàn bộ BC.<br>3. Đề xuất BC gần nhất.<br>4. Phóng bản đồ tới mặt bằng.</div></div>
        </div></section>
        <section class="v118-view" data-view="colors"><div class="v118-grid">
          <div class="v118-card"><h3>Chế độ màu & hiển thị</h3><p class="v118-help">Đổi cách đọc bản đồ mà không làm thay đổi dữ liệu quy hoạch.</p><div class="v118-field"><label>Chế độ màu</label><select id="v118ColorMode"><option value="branch">Theo BC</option><option value="am">Theo AM</option><option value="route">Theo tuyến</option><option value="planning">Theo trạng thái quy hoạch</option><option value="custom">Màu thủ công</option></select></div><button class="v118-btn orange" id="v118ApplyColorMode">Áp dụng hiển thị</button><div class="v118-actions"><label><input type="checkbox" id="v118TogglePoly" checked> Địa bàn</label><label><input type="checkbox" id="v118ToggleMarker" checked> Bưu cục</label></div></div>
          <div class="v118-card"><h3>Màu thủ công</h3><div class="v118-row"><div class="v118-field"><label>Đối tượng</label><select id="v118ColorTargetType"><option value="am">AM</option><option value="bc">Bưu cục</option><option value="route">Tuyến xã/phường</option></select></div><div class="v118-field"><label>Màu</label><input type="color" id="v118ManualColor" value="#f26522"></div></div><div class="v118-field"><label>Chọn AM / BC / tuyến</label><select id="v118ColorTarget"></select></div><button class="v118-btn orange" id="v118ApplyManualColor">Lưu màu thủ công</button></div>
          <div class="v118-card full"><h3>Xem nhanh màu bưu cục</h3><div class="v118-color-list" id="v118ColorPreview"></div></div>
        </div></section>
        <section class="v118-view active" data-view="am">
          <div class="v118-card v118-filter-card"><h3>Bộ lọc trung tâm điều chỉnh</h3><p class="v118-help">Lọc AM, Bưu cục hoặc Xã/Phường để bảng và bản đồ cùng focus đúng khu vực đang thao tác.</p><div class="v118-grid three"><div class="v118-field"><label>Lọc AM</label><input id="v118FilterAM" placeholder="Nhập tên hoặc mã AM"></div><div class="v118-field"><label>Lọc Bưu cục</label><input id="v118FilterBC" placeholder="Nhập tên bưu cục"></div><div class="v118-field"><label>Lọc Xã/Phường</label><input id="v118FilterWard" placeholder="Nhập tên xã/phường"></div></div><div class="v118-actions"><button class="v118-btn soft" id="v118ClearPlanningFilters">Xóa bộ lọc</button><button class="v118-btn orange" id="v118ApplyPlanningFilters">Hiện kết quả trên map</button></div></div>
          <div class="v118-card"><h3>Tổng quan AM</h3><p class="v118-help">Nhìn nhanh AM quá tải, cao, cân bằng hoặc quá ít. Bấm một AM để mở danh sách Bưu cục ngay bên dưới.</p><div class="v118-table-wrap"><table class="v118-table"><thead><tr><th>AM</th><th>Bưu cục</th><th>Xã/Phường</th><th>Vol giao</th><th>Vol lấy</th><th>Diện tích</th><th>Cân bằng</th></tr></thead><tbody id="v118AMTable"></tbody></table></div></div>
          <div class="v118-card" style="margin-top:12px"><div class="v118-selected-am"><h3 id="v118SelectedAMTitle">AM</h3><button class="v118-btn soft" id="v118FocusAM">Hiện trên map</button></div><div class="v118-am-summary" id="v118AMSummary"></div>
            <div class="v118-bulk"><b id="v118BulkCount">0 BC đã chọn</b><select id="v118BulkTarget"></select><button class="v118-btn orange" id="v118BulkMove">Chuyển nhiều BC</button></div>
            <div class="v118-table-wrap"><table class="v118-table"><thead><tr><th></th><th>Bưu cục</th><th>Vol giao</th><th>Vol lấy</th><th>Diện tích</th><th>Số xã</th><th>Điều chỉnh AM</th></tr></thead><tbody id="v118AMBranches"></tbody></table></div>
            <h4>Quản trị AM ngay tại màn hình này</h4><div class="v118-row"><div class="v118-field"><label>ID AM</label><input id="v118AMId" placeholder="1705850"></div><div class="v118-field"><label>Tên AM</label><input id="v118AMName" placeholder="Võ Hồng Chơn"></div></div><div class="v118-actions"><button class="v118-btn orange" id="v118SaveAM">Thêm / Lưu AM</button><button class="v118-btn soft" id="v118NewAMForm">Tạo AM mới</button><button class="v118-btn danger" id="v118DeleteAM">Xóa AM</button></div>
          </div>
        </section>
        <section class="v118-view" data-view="adjust"><div class="v118-grid">
          <div class="v118-card"><h3>Chuyển tuyến xã/phường</h3><p class="v118-help">Chọn tuyến và BC nhận. Hai BC cùng AM liên quan được tính lại tự động.</p><div class="v118-field"><label>Xã/phường cần chuyển</label><select id="v118RouteWard"></select></div><div class="v118-field"><label>Chuyển sang bưu cục</label><select id="v118RouteDest"></select></div><div id="v118RoutePreview"></div><button class="v118-btn orange" id="v118TransferWard">Xác nhận chuyển tuyến</button></div>
          <div class="v118-card"><h3>Tạo bưu cục mới</h3><div class="v118-row"><div class="v118-field"><label>Tên BC</label><input id="v118NewName" placeholder="BC Long Toàn"></div><div class="v118-field"><label>AM phụ trách</label><select id="v118NewAM"></select></div></div><div class="v118-field"><label>Địa chỉ</label><input id="v118NewAddress" placeholder="Số nhà, xã/phường, tỉnh"></div><div class="v118-row"><div class="v118-field"><label>Tọa độ</label><input id="v118NewCoord" placeholder="10.123456, 106.123456"></div><button class="v118-btn soft" data-pick="v118NewCoord">Chọn map</button></div><div class="v118-field"><label>Kéo các tuyến vào BC mới (giữ Ctrl/Command để chọn nhiều)</label><select id="v118NewWards" multiple></select></div><button class="v118-btn orange" id="v118CreateBranch">Tạo BC và cập nhật toàn hệ thống</button></div>
          <div class="v118-card full"><h3>Di dời bưu cục</h3><div class="v118-grid three"><div class="v118-field"><label>BC cần di dời</label><select id="v118MoveBranch"></select></div><div class="v118-field"><label>Địa chỉ mới</label><input id="v118MoveAddress" placeholder="Địa chỉ mới"></div><div class="v118-field"><label>Tọa độ mới</label><input id="v118MoveCoord" placeholder="10.123456, 106.123456"></div></div><div class="v118-actions"><button class="v118-btn soft" data-pick="v118MoveCoord">Chọn tọa độ trên map</button><button class="v118-btn orange" id="v118MoveBranchNow">Di dời và tính lại khoảng cách</button><button class="v118-btn danger" id="v118DeleteVirtualBranch">Xóa BC quy hoạch mới</button></div><div class="v118-result" id="v118MovePreview"></div></div>
        </div></section>
        <section class="v118-view" data-view="alerts"><div class="v118-grid">
          <div class="v118-card full"><h3>So sánh & cảnh báo cân bằng</h3><p class="v118-help">Rule BC: Phường 200 km² / 1.000 Vol; Xã 350 km² / 800 Vol. AM được so với trung bình toàn vùng theo số BC, Vol và diện tích.</p><div class="v118-am-summary" id="v118AlertSummary"></div></div>
          <div class="v118-card full"><div class="v118-alert-list" id="v118Alerts"></div></div>
        </div></section>
        <section class="v118-view" data-view="accounts"><div class="v118-grid">
          <div class="v118-card"><h3>Tạo tài khoản GĐV / AM</h3><p class="v118-help">Bản static lưu cấu hình tài khoản trong trình duyệt để anh kiểm tra luồng phân quyền. Mật khẩu tạm được lưu dạng hash, không lưu plaintext. Khi nối backend, form này sẽ gọi API tạo tài khoản thật và áp dụng quyền truy cập dữ liệu.</p>
            <div class="v118-row"><div class="v118-field"><label>Tên đăng nhập</label><input id="v118AccountUser" placeholder="vd: gdv.dcl01 hoặc am.nguyenvana"></div><div class="v118-field"><label>Họ tên</label><input id="v118AccountName" placeholder="Nguyễn Văn A"></div></div>
            <div class="v118-row"><div class="v118-field"><label>Vai trò</label><select id="v118AccountRole"><option value="GDV">GĐV - Giám đốc vùng</option><option value="AM">AM - Area Manager</option><option value="VIEWER">VIEWER - Chỉ xem</option></select></div><div class="v118-field"><label>Trạng thái</label><select id="v118AccountStatus"><option value="active">Đang hoạt động</option><option value="locked">Khóa tài khoản</option></select></div></div>
            <div class="v118-field"><label>Mật khẩu tạm</label><input id="v118AccountTempPass" type="password" placeholder="Nhập nếu muốn đánh dấu cần reset mật khẩu"></div>
            <div id="v118AccountGDVScope"><div class="v118-field"><label>GĐV quản lý tỉnh (giữ Ctrl/Command để chọn nhiều)</label><select id="v118AccountProvinces" multiple></select></div></div>
            <div id="v118AccountAMScope" style="display:none"><div class="v118-field"><label>AM quản lý bưu cục (giữ Ctrl/Command để chọn nhiều)</label><select id="v118AccountBranches" multiple></select></div></div>
            <div class="v118-actions"><button class="v118-btn orange" id="v118SaveAccount">Thêm / Lưu tài khoản</button><button class="v118-btn soft" id="v118NewAccount">Tạo tài khoản mới</button><button class="v118-btn danger" id="v118DeleteAccount">Xóa tài khoản</button></div>
          </div>
          <div class="v118-card"><h3>Phạm vi dữ liệu được cấp</h3><p class="v118-help">GĐV sẽ xem các tỉnh được chọn. AM sẽ chỉ xem các bưu cục được gán và các xã/phường thuộc bưu cục đó.</p><div class="v118-am-summary" id="v118AccountPreview"></div><div class="v118-result warn"><b>Lưu ý bảo mật</b><br>Đây là cơ chế đăng nhập local cho bản static. Để quản trị người dùng thật giữa nhiều máy, cần bật backend xác thực và bảng users/roles trên Worker/D1.</div></div>
          <div class="v118-card full"><h3>Danh sách tài khoản đã cấu hình</h3><div class="v118-table-wrap"><table class="v118-table"><thead><tr><th>Tài khoản</th><th>Vai trò</th><th>Phạm vi</th><th>Bưu cục</th><th>Xã/Phường</th><th>Trạng thái</th></tr></thead><tbody id="v118AccountTable"></tbody></table></div></div>
        </div></section>
      </div>`;
    document.body.appendChild(center);
    document.body.insertAdjacentHTML('beforeend','<div class="v118-toast" id="v118Toast"></div>');
  }

  function bindUI(){
    q('v118PlannerButton').onclick=()=>openCenter('am',{resetFilters:true});q('v118Close').onclick=closeCenter;
    center.querySelectorAll('.v118-tab').forEach(x=>x.onclick=()=>setView(x.dataset.view));
    q('v118CoordCheck').onclick=checkCoordinate;
    q('v118ApplyColorMode').onclick=colorModeApply;
    q('v118ColorTargetType').onchange=renderColorTargets;q('v118ApplyManualColor').onclick=applyManualColor;
    q('v118TogglePoly').onchange=x=>window.__dclSetPlanningPolygonsVisible?window.__dclSetPlanningPolygonsVisible(x.target.checked):(x.target.checked?layer.addTo(map):map.removeLayer(layer));
    q('v118ToggleMarker').onchange=x=>x.target.checked?marker.addTo(map):map.removeLayer(marker);
    q('v118FocusAM').onclick=()=>focusPlanningMap({fit:true});
    [['v118FilterAM','am'],['v118FilterBC','bc'],['v118FilterWard','ward']].forEach(([id,type])=>{
      const input=q(id);
      if(!input)return;
      input.value=type==='am'?amFilterText:type==='bc'?bcFilterText:wardFilterText;
      input.oninput=()=>{
        amFilterText=q('v118FilterAM')?.value||'';
        bcFilterText=q('v118FilterBC')?.value||'';
        wardFilterText=q('v118FilterWard')?.value||'';
        checkedBranches.clear();
        renderAM();
        focusPlanningMap();
        saveWorkflow();
      };
    });
    q('v118ApplyPlanningFilters').onclick=()=>{renderAM();focusPlanningMap({fit:true});saveWorkflow();};
    q('v118ClearPlanningFilters').onclick=()=>{resetPlanningFilters();renderAM();showFullPlanningMap(true);saveWorkflow();};
    q('v118BulkMove').onclick=()=>moveBranchesToAM([...checkedBranches],q('v118BulkTarget').value);
    q('v118SaveAM').onclick=saveAMInline;q('v118NewAMForm').onclick=newAMForm;q('v118DeleteAM').onclick=deleteSelectedAM;
    q('v118RouteWard').onchange=updateRoutePreview;q('v118RouteDest').onchange=updateRoutePreview;q('v118TransferWard').onclick=transferWard;
    q('v118CreateBranch').onclick=createBranchNow;q('v118MoveBranch').onchange=updateMovePreview;q('v118MoveCoord').oninput=updateMovePreview;q('v118MoveBranchNow').onclick=moveBranchNow;q('v118DeleteVirtualBranch').onclick=deleteVirtualBranchNow;
    q('v118AccountRole').onchange=renderAccountScope;
    q('v118AccountProvinces').onchange=renderAccountPreview;
    q('v118AccountBranches').onchange=renderAccountPreview;
    q('v118SaveAccount').onclick=saveAccount;
    q('v118NewAccount').onclick=resetAccountForm;
    q('v118DeleteAccount').onclick=deleteAccount;
    center.querySelectorAll('[data-pick]').forEach(x=>x.onclick=()=>startPick(x.dataset.pick,x));
    map.on('click',evt=>{
      if(!coordPickInput)return;
      const input=q(coordPickInput);if(input)input.value=coordText(evt.latlng.lat,evt.latlng.lng);
      const target=coordPickInput;coordPickInput='';
      if(center)center.classList.add('open');
      if(target==='v118MoveCoord')updateMovePreview();
      resetCoordPickUI();
      toast('Đã lấy tọa độ từ bản đồ');
    });
  }

  function boot(){
    if(window.__v118PlanningCenter||typeof branches==='undefined'||typeof map==='undefined'){if(!window.__v118PlanningCenter)setTimeout(boot,250);return;}
    window.__v118PlanningCenter=true;
    restoreWorkflow();
    installLocationOverride();
    rebuildBranches();
    ensureDefaultAMMapping();
    rebuildLegacySelectors();
    window.v118AssignBranchToAM=(branch,target)=>moveBranchesToAM([branch],target);
    buildUI();bindUI();renderAll();
    const legend=document.querySelector('.legend');if(legend)legend.innerHTML='<b>Quy hoạch DCL V118</b><div>Điều chỉnh BC, tuyến và AM cập nhật tức thì trên một nguồn dữ liệu.</div>';
    setTimeout(()=>openCenter(activeView),700);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
