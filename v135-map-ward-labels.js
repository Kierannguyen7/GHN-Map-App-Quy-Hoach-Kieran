(function(){
  'use strict';
  const VERSION='135c';
  const maps=[];
  const featurePointCache=new WeakMap();
  const q=(s,r=document)=>r.querySelector(s);
  function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  function injectCss(){
    if(q('#v135WardLabelCss'))return;
    const css=document.createElement('style');
    css.id='v135WardLabelCss';
    css.textContent=[
      '.v135-ward-label{pointer-events:none;background:rgba(255,255,255,.92);color:#0f172a;border:1px solid rgba(255,255,255,.96);border-radius:999px;box-shadow:0 3px 12px rgba(15,23,42,.16);font:900 10px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;padding:4px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-sizing:border-box;transform:translateZ(0)}',
      '.v135-ward-label.far{font-size:9px;padding:3px 7px;opacity:.92}',
      '@media(max-width:640px){.v135-ward-label{font-size:8.5px;padding:3px 6px}.v135-ward-label.far{font-size:8px}}'
    ].join('');
    document.head.appendChild(css);
  }
  function compactWard(s,z){
    s=String(s||'').replace(/\s+/g,' ').trim();
    if(z>=12.5)return s;
    return s.replace(/^xã\s+/i,'X. ').replace(/^phường\s+/i,'P. ').replace(/^thị trấn\s+/i,'TT. ');
  }
  function ringsOfGeometry(geom){
    if(!geom)return [];
    if(geom.type==='Polygon')return geom.coordinates||[];
    if(geom.type==='MultiPolygon')return (geom.coordinates||[]).flat();
    return [];
  }
  function allPoints(geom){
    const pts=[];
    ringsOfGeometry(geom).forEach(r=>r.forEach(p=>{
      if(Array.isArray(p)&&isFinite(p[0])&&isFinite(p[1]))pts.push({lat:Number(p[1]),lng:Number(p[0])});
    }));
    return pts;
  }
  function pointInRing(pt,ring){
    let inside=false,x=pt.lng,y=pt.lat;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const xi=Number(ring[i][0]),yi=Number(ring[i][1]),xj=Number(ring[j][0]),yj=Number(ring[j][1]);
      const intersect=((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/((yj-yi)||1e-12)+xi);
      if(intersect)inside=!inside;
    }
    return inside;
  }
  function pointInGeometry(pt,geom){
    if(!pt||!geom)return false;
    if(geom.type==='Polygon'){
      const rings=geom.coordinates||[];
      if(!rings.length||!pointInRing(pt,rings[0]))return false;
      return !rings.slice(1).some(r=>pointInRing(pt,r));
    }
    if(geom.type==='MultiPolygon')return (geom.coordinates||[]).some(poly=>pointInGeometry(pt,{type:'Polygon',coordinates:poly}));
    return false;
  }
  function meanPoint(pts){
    if(!pts.length)return null;
    return {lat:pts.reduce((s,p)=>s+p.lat,0)/pts.length,lng:pts.reduce((s,p)=>s+p.lng,0)/pts.length};
  }
  function distanceToSample(pt,sample){
    let min=Infinity;
    for(let i=0;i<sample.length;i++){
      const p=sample[i];
      const d=(pt.lat-p.lat)*(pt.lat-p.lat)+(pt.lng-p.lng)*(pt.lng-p.lng);
      if(d<min)min=d;
    }
    return Math.sqrt(min);
  }
  function simplifySample(pts,max){
    if(pts.length<=max)return pts;
    const step=Math.max(1,Math.floor(pts.length/max));
    const out=[];
    for(let i=0;i<pts.length;i+=step)out.push(pts[i]);
    return out;
  }
  function labelPoint(geom){
    if(!geom)return null;
    const cached=featurePointCache.get(geom);
    if(cached)return cached;
    const pts=allPoints(geom),mean=meanPoint(pts);
    if(!pts.length)return null;
    const minLat=Math.min(...pts.map(p=>p.lat)),maxLat=Math.max(...pts.map(p=>p.lat)),minLng=Math.min(...pts.map(p=>p.lng)),maxLng=Math.max(...pts.map(p=>p.lng));
    const sample=simplifySample(pts,160);
    let best=null,bestScore=-Infinity;
    if(mean&&pointInGeometry(mean,geom)){
      best=mean;
      bestScore=distanceToSample(mean,sample);
    }
    const rows=(maxLat-minLat)>.28?13:11,cols=(maxLng-minLng)>.28?13:11;
    for(let yi=1;yi<rows;yi++){
      for(let xi=1;xi<cols;xi++){
        const p={lat:minLat+(maxLat-minLat)*yi/rows,lng:minLng+(maxLng-minLng)*xi/cols};
        if(!pointInGeometry(p,geom))continue;
        const clearance=distanceToSample(p,sample);
        const centerBias=mean?Math.hypot(p.lat-mean.lat,p.lng-mean.lng)*.12:0;
        const score=clearance-centerBias;
        if(score>bestScore){best=p;bestScore=score}
      }
    }
    if(!best){
      best=pts.slice().sort((a,b)=>mean?Math.hypot(a.lat-mean.lat,a.lng-mean.lng)-Math.hypot(b.lat-mean.lat,b.lng-mean.lng):0)[0]||null;
    }
    if(best)featurePointCache.set(geom,best);
    return best;
  }
  function features(){
    const f=window.GHN_GEOJSON&&Array.isArray(window.GHN_GEOJSON.features)?window.GHN_GEOJSON.features:[];
    return f.filter(x=>x&&x.geometry&&(x.properties?.ward||x.properties?.ward_name||x.properties?.name));
  }
  function rectFree(rects,x,y,w,h){
    const pad=4,r={x1:x-w/2-pad,y1:y-h/2-pad,x2:x+w/2+pad,y2:y+h/2+pad};
    if(rects.some(o=>!(r.x2<o.x1||r.x1>o.x2||r.y2<o.y1||r.y1>o.y2)))return false;
    rects.push(r);return true;
  }
  function shouldSkipBaseLabels(map){
    try{
      const sim=window.v132PlanningSimulation&&window.v132PlanningSimulation.state;
      if(sim&&sim.rows&&sim.rows.length&&sim.showPlan&&(!map||map===window.map))return true;
    }catch(e){}
    return false;
  }
  function visibleLimit(z){
    if(z<10.9)return 0;
    if(z<11.5)return 38;
    if(z<12.25)return 78;
    if(z<13)return 145;
    return 260;
  }
  function render(map){
    if(!map||!map.__v135WardLabels||!window.L)return;
    const layer=map.__v135WardLabels;
    layer.clearLayers();
    if(shouldSkipBaseLabels(map))return;
    const z=map.getZoom?map.getZoom():0,limit=visibleLimit(z);
    if(!limit)return;
    let bounds=null,size=null;
    try{bounds=map.getBounds().pad(.12);size=map.getSize()}catch(e){return}
    if(!bounds||!size||size.x<20||size.y<20)return;
    const visible=[];
    features().forEach(f=>{
      const p=f.properties||{},name=String(p.ward||p.ward_name||p.name||'').trim();
      if(!name)return;
      const pt=labelPoint(f.geometry);
      if(!pt||!bounds.contains([pt.lat,pt.lng]))return;
      const vol=Number(p.vol_giao||p.volume_giao||p.volume||0),area=Number(p.area||p.dien_tich||0);
      visible.push({f,name,pt,priority:vol*2+area});
    });
    visible.sort((a,b)=>b.priority-a.priority||a.name.localeCompare(b.name,'vi'));
    const rects=[];
    visible.slice(0,Math.min(visible.length,limit*2)).some(item=>{
      if(rects.length>=limit)return true;
      const cp=map.latLngToContainerPoint([item.pt.lat,item.pt.lng]);
      if(cp.x<-120||cp.y<-40||cp.x>size.x+120||cp.y>size.y+40)return false;
      const text=compactWard(item.name,z),w=Math.min(z>=13?170:136,34+text.length*(z>=13?5.8:5.1)),h=z>=12.5?20:18;
      if(!rectFree(rects,cp.x,cp.y,w,h))return false;
      const icon=L.divIcon({className:'',html:`<div class="v135-ward-label ${z<12?'far':''}">${esc(text)}</div>`,iconSize:[w,h],iconAnchor:[w/2,h/2]});
      L.marker([item.pt.lat,item.pt.lng],{pane:'v135WardLabelPane',interactive:false,keyboard:false,icon}).addTo(layer);
      return false;
    });
  }
  function schedule(map,delay){
    if(!map||!map.__v135WardLabels)return;
    clearTimeout(map.__v135WardLabelTimer);
    map.__v135WardLabelTimer=setTimeout(()=>render(map),delay==null?150:delay);
  }
  function trackMap(map){
    if(!window.L||!map||map.__v135Tracked)return map;
    map.__v135Tracked=true;
    try{
      if(!map.getPane('v135WardLabelPane')){
        map.createPane('v135WardLabelPane');
        map.getPane('v135WardLabelPane').style.zIndex=648;
        map.getPane('v135WardLabelPane').style.pointerEvents='none';
      }
      map.__v135WardLabels=L.layerGroup().addTo(map);
      map.on('zoomend moveend resize',()=>schedule(map));
      maps.push(map);
      schedule(map,260);
    }catch(e){}
    return map;
  }
  function patchLeaflet(){
    if(!window.L||L.__v135WardLabelPatch)return;
    L.__v135WardLabelPatch=true;
    const original=L.map;
    L.map=function(){
      const map=original.apply(this,arguments);
      return trackMap(map);
    };
  }
  function poll(){
    injectCss();patchLeaflet();
    try{if(window.map)trackMap(window.map)}catch(e){}
    try{if(window.v106OpsLeafletMap)trackMap(window.v106OpsLeafletMap)}catch(e){}
  }
  function refresh(){
    featurePointCache.clear?.();
    maps.forEach(m=>schedule(m,20));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',poll);else poll();
  const timer=setInterval(poll,1200);
  setTimeout(()=>clearInterval(timer),15000);
  window.v135WardLabels={version:VERSION,trackMap,render,schedule,refresh};
})();
