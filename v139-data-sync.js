(function(){
  'use strict';
  const VERSION='139a';
  function installCoords(){
    window.GHN_BRANCH_COORDS=window.GHN_BRANCH_COORDS||{};
    if(Array.isArray(window.GHN_BRANCHES)){
      window.GHN_BRANCHES.forEach(b=>{
        if(!b||!b.branch||!isFinite(Number(b.lat))||!isFinite(Number(b.lng)))return;
        window.GHN_BRANCH_COORDS[b.branch]={lat:Number(b.lat),lng:Number(b.lng),coord:b.coord||(`${Number(b.lat).toFixed(6)}, ${Number(b.lng).toFixed(6)}`),source:'excel_FG'};
      });
    }
  }
  function refresh(){
    try{if(typeof rebuildBranches==='function')rebuildBranches();}catch(e){}
    try{if(typeof recolorAll==='function')recolorAll();}catch(e){}
    try{if(typeof apply==='function')apply();}catch(e){}
    try{if(typeof renderTree==='function')renderTree(true);}catch(e){}
    try{window.v135WardLabels&&window.v135WardLabels.refresh&&window.v135WardLabels.refresh();}catch(e){}
    try{window.all=all;window.branches=branches;window.byBranch=byBranch;}catch(e){}
  }
  function syncBaseData(options){
    installCoords();
    window.DCLDataSyncV139={version:VERSION,source:window.DCL_MAP_DATA_META&&window.DCL_MAP_DATA_META.source,features:window.GHN_GEOJSON?.features?.length||0,branches:Array.isArray(window.GHN_BRANCHES)?window.GHN_BRANCHES.length:0,markerSource:'excel_FG',ranAt:new Date().toISOString()};
    document.documentElement.dataset.dclDataSync='v139';
    if(!options||options.refresh!==false)refresh();
    return true;
  }
  window.DCLSyncBaseDataV139=syncBaseData;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>syncBaseData());else syncBaseData();
})();
