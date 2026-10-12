(function(){
  'use strict';
  const VERSION='132an';
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const palette=['#f97316','#2563eb','#16a34a','#9333ea','#e11d48','#0891b2','#ca8a04','#0f766e','#7c3aed','#dc2626','#65a30d','#0284c7'];
  const visualPalette=['#f97316','#2563eb','#16a34a','#9333ea','#e11d48','#0891b2','#ca8a04','#0f766e','#7c3aed','#dc2626','#65a30d','#0284c7','#14b8a6','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#84cc16','#ec4899','#0ea5e9'];
  const MIN_SPLIT_VOLUME_SIM=400;
  const state={rows:[],uploadRows:[],branches:[],branchMap:new Map(),selectedWards:new Set(),selectedBranches:new Set(),errors:[],audit:null,showCurrent:false,showPlan:true,sourceName:'',aliasCount:0,autoPlan:null};
  const cache={wardLayers:new Map(),branchMarkers:new Map(),branchCoords:new Map(),hiddenCurrentLayers:new Set()};
  let simLayers=null,ready=false,labelTimer=0,autoRunToken=0;

  function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  function fmt(n){n=Number(n)||0;return Math.round(n*100)/100===Math.round(n)?Math.round(n).toLocaleString('vi-VN'):(Math.round(n*100)/100).toLocaleString('vi-VN')}
  function deaccent(s){return String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D')}
  function norm(s){return deaccent(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
  function hashColor(text){let h=0;String(text||'').split('').forEach(ch=>h=(h*31+ch.charCodeAt(0))|0);return palette[Math.abs(h)%palette.length]}
  function officialRouteColor(row){
    return (row&&(row.officialRouteColor||row.color||row.originalRouteColor))||hashColor(row?.plannedBranch||row?.currentBranch||'');
  }
  function displayRouteColor(row){
    return row?.previewRouteColor||officialRouteColor(row);
  }
  function setOfficialRouteColor(row,color){
    const c=color||hashColor(row?.plannedBranch||row?.currentBranch||'');
    row.color=c;
    row.officialRouteColor=c;
    row.originalRouteColor=c;
    delete row.previewRouteColor;
    row.manualColor=false;
    return row;
  }
  function branchOfficialColor(name){
    const branch=state.branchMap&&state.branchMap.get?state.branchMap.get(name):null;
    return branch?.color||hashColor(name);
  }
  function isCoordLike(v){
    const s=String(v||'').trim();
    if(!s)return false;
    return /-?\d+(?:[.,]\d+)?\s*,\s*-?\d+(?:[.,]\d+)?/.test(s)||(/\d+\s*[°º]/.test(s)&&/[NSEW]/i.test(s));
  }
  function isBranchLike(v){
    const s=String(v||'').trim();
    if(!s||isCoordLike(s))return false;
    const n=norm(s);
    return n.includes('buu cuc')||/\([A-ZĐ0-9]{2,5}\)/i.test(s)||/^\s*\d{3,}\s*[-–]/.test(s);
  }
  function shortName(s){
    s=String(s||'').replace(/^\s*\d+\s*[-–]\s*/,'').replace(/\s+/g,' ').trim();
    const m=s.match(/\(([A-ZĐ0-9]{2,5})\)\s*(.+)$/i);
    return m?'('+m[1].toUpperCase()+') '+m[2].trim():s;
  }
  function compactWard(s,z){
    s=String(s||'').replace(/\s+/g,' ').trim();
    if(z>=11)return s;
    return s.replace(/^xã\s+/i,'X. ').replace(/^phường\s+/i,'P. ').replace(/^thị trấn\s+/i,'TT. ');
  }
  function compactBranch(s,z){
    const label=shortName(s);
    if(z>=11)return label;
    return label.replace(/Bưu Cục\s*/i,'').replace(/\s*-\s*(Đồng Tháp|Vĩnh Long|Trà Vinh|Bến Tre|Tiền Giang).*$/i,'');
  }
  function codeFromBranchName(name){
    const m=String(name||'').match(/\(([A-ZĐ0-9]{2,5})\)/i);
    return m?m[1].toUpperCase():'';
  }
  function findHeader(headers,pred){
    const n=headers.map(norm);
    for(let i=0;i<n.length;i++)if(pred(n[i],i))return i;
    return -1;
  }
  function getCell(cells,idx){return idx>=0&&idx<cells.length?cells[idx]:''}
  function numberVal(v){
    if(typeof v==='number')return isFinite(v)?v:0;
    let s=String(v??'').trim();
    if(!s)return 0;
    s=s.replace(/\s/g,'').replace(/[^\d,.-]/g,'');
    if(s.includes(',')&&s.includes('.')){
      s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
    }else if(s.includes(',')){
      const parts=s.split(',');
      s=(parts.length===2&&parts[1].length<=2)?parts[0].replace(/\./g,'')+'.'+parts[1]:s.replace(/,/g,'');
    }else if(s.includes('.')){
      const parts=s.split('.');
      if(parts.length>2||parts[parts.length-1].length===3)s=s.replace(/\./g,'');
    }
    const n=Number(s);
    return isNaN(n)?0:n;
  }
  function cloneRow(row){return Object.assign({},row)}
  function provinceCode(name){
    const s=norm(name);
    if(s.includes('vinh long'))return 'VLO';
    if(s.includes('dong thap'))return 'DTP';
    if(s.includes('tien giang'))return 'TGI';
    if(s.includes('ben tre'))return 'BTR';
    if(s.includes('tra vinh'))return 'TVI';
    return 'DCL';
  }
  function cleanWardName(name){return String(name||'').replace(/^(xã|phường|thị trấn)\s+/i,'').replace(/\s+/g,' ').trim()}
  function haversineKm(a,b){
    if(!a||!b)return 0;
    const R=6371,toRad=x=>Number(x)*Math.PI/180;
    const dLat=toRad((b.lat||0)-(a.lat||0)),dLng=toRad((b.lng||0)-(a.lng||0));
    const lat1=toRad(a.lat||0),lat2=toRad(b.lat||0);
    const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
    return 2*R*Math.asin(Math.sqrt(h));
  }
  function coordLabel(lat,lng){
    lat=Number(lat);lng=Number(lng);
    if(!isFinite(lat)||!isFinite(lng))return '';
    return lat.toFixed(6)+', '+lng.toFixed(6);
  }
  function round2(n){return Math.round((Number(n)||0)*100)/100}

  function parseDMS(text){
    const s=String(text||'');
    const hits=[];
    const re=/(\d+(?:\.\d+)?)\s*[°º]\s*(?:(\d+(?:\.\d+)?)\s*(?:['’′m])?)?\s*(?:(\d+(?:\.\d+)?)\s*(?:["”″s])?)?\s*([NSEW])/ig;
    let m;
    while((m=re.exec(s))){
      const deg=Number(m[1])||0,min=Number(m[2])||0,sec=Number(m[3])||0,hem=m[4].toUpperCase();
      let val=deg+min/60+sec/3600;
      if(hem==='S'||hem==='W')val=-val;
      hits.push({hem,val});
    }
    const lat=hits.find(x=>x.hem==='N'||x.hem==='S'),lng=hits.find(x=>x.hem==='E'||x.hem==='W');
    return lat&&lng?{lat:lat.val,lng:lng.val}:null;
  }
  function parseCoord(text){
    if(!text)return null;
    const dms=parseDMS(text);if(dms)return dms;
    let s=String(text).trim();
    const at=s.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
    if(at)return {lat:Number(at[1]),lng:Number(at[2])};
    const nums=s.match(/-?\d+(?:[.,]\d+)?/g);
    if(!nums||nums.length<2)return null;
    const a=Number(nums[0].replace(',','.')),b=Number(nums[1].replace(',','.'));
    if(isNaN(a)||isNaN(b))return null;
    if(Math.abs(a)<=20&&Math.abs(b)>90)return {lat:a,lng:b};
    if(Math.abs(b)<=20&&Math.abs(a)>90)return {lat:b,lng:a};
    return {lat:a,lng:b};
  }
  function parsePolygon(raw){
    const s=String(raw||'').trim();
    if(!s)return null;
    if(s[0]==='{'){
      try{const obj=JSON.parse(s);if(obj.type&&obj.coordinates)return obj;if(obj.geometry)return obj.geometry}catch(e){}
    }
    const matches=s.match(/-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?(?:\s*,\s*-?\d+(?:\.\d+)?)?/g)||[];
    const coords=matches.map(x=>{
      const p=x.split(',').map(v=>Number(String(v).trim()));
      const a=p[0],b=p[1];
      if(Math.abs(a)>90&&Math.abs(b)<=20)return [a,b];
      if(Math.abs(b)>90&&Math.abs(a)<=20)return [b,a];
      return [a,b];
    }).filter(p=>isFinite(p[0])&&isFinite(p[1]));
    if(coords.length<3)return null;
    const first=coords[0],last=coords[coords.length-1];
    if(first[0]!==last[0]||first[1]!==last[1])coords.push([first[0],first[1]]);
    return {type:'Polygon',coordinates:[coords]};
  }
  function centroidOfGeometry(g){
    const coords=(g&&g.type==='Polygon')?g.coordinates[0]:(g&&g.type==='MultiPolygon')?g.coordinates[0][0]:[];
    let lng=0,lat=0,n=0;coords.forEach(p=>{lng+=Number(p[0])||0;lat+=Number(p[1])||0;n++});
    return n?{lat:lat/n,lng:lng/n}:{lat:10.35,lng:106};
  }
  function pointOnSegment(x,y,x1,y1,x2,y2){
    const cross=(x-x1)*(y2-y1)-(y-y1)*(x2-x1);
    if(Math.abs(cross)>1e-10)return false;
    const dot=(x-x1)*(x2-x1)+(y-y1)*(y2-y1);
    if(dot<0)return false;
    const len=(x2-x1)*(x2-x1)+(y2-y1)*(y2-y1);
    return dot<=len+1e-10;
  }
  function pointInRing(pt,ring){
    if(!pt||!Array.isArray(ring)||ring.length<3)return false;
    const x=Number(pt.lng),y=Number(pt.lat);
    if(!isFinite(x)||!isFinite(y))return false;
    let inside=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const xi=Number(ring[i][0]),yi=Number(ring[i][1]),xj=Number(ring[j][0]),yj=Number(ring[j][1]);
      if(!isFinite(xi)||!isFinite(yi)||!isFinite(xj)||!isFinite(yj))continue;
      if(pointOnSegment(x,y,xi,yi,xj,yj))return true;
      const intersect=((yi>y)!==(yj>y))&&(x<((xj-xi)*(y-yi))/(yj-yi||1e-12)+xi);
      if(intersect)inside=!inside;
    }
    return inside;
  }
  function pointInPolygon(pt,poly){
    if(!Array.isArray(poly)||!poly.length)return false;
    if(!pointInRing(pt,poly[0]))return false;
    for(let i=1;i<poly.length;i++)if(pointInRing(pt,poly[i]))return false;
    return true;
  }
  function pointInGeometry(pt,g){
    if(!pt||!g)return false;
    if(g.type==='Polygon')return pointInPolygon(pt,g.coordinates);
    if(g.type==='MultiPolygon')return (g.coordinates||[]).some(poly=>pointInPolygon(pt,poly));
    return false;
  }
  function pointInRows(pt,rows){
    return (rows||[]).find(r=>pointInGeometry(pt,r.geometry))||null;
  }
  function geometryBounds(g){
    const rings=g&&g.type==='Polygon'?(g.coordinates||[]):g&&g.type==='MultiPolygon'?(g.coordinates||[]).flat():[];
    let minLng=Infinity,minLat=Infinity,maxLng=-Infinity,maxLat=-Infinity;
    rings.forEach(ring=>(ring||[]).forEach(p=>{
      const lng=Number(p[0]),lat=Number(p[1]);
      if(!isFinite(lat)||!isFinite(lng))return;
      minLng=Math.min(minLng,lng);maxLng=Math.max(maxLng,lng);minLat=Math.min(minLat,lat);maxLat=Math.max(maxLat,lat);
    }));
    return isFinite(minLng)?{minLng,minLat,maxLng,maxLat}:null;
  }
  function firstGeometryPoint(g){
    const ring=g&&g.type==='Polygon'?g.coordinates?.[0]:g&&g.type==='MultiPolygon'?g.coordinates?.[0]?.[0]:null;
    const p=ring&&ring[0];
    return p?{lat:Number(p[1]),lng:Number(p[0])}:null;
  }
  function pointOnSurface(g,target){
    const candidates=[];
    function add(pt){
      if(pt&&isFinite(Number(pt.lat))&&isFinite(Number(pt.lng))&&pointInGeometry(pt,g))candidates.push({lat:Number(pt.lat),lng:Number(pt.lng)});
    }
    add(target);
    const c=centroidOfGeometry(g);add(c);
    const b=geometryBounds(g);
    if(b){
      add({lat:(b.minLat+b.maxLat)/2,lng:(b.minLng+b.maxLng)/2});
      [4,8,12].forEach(step=>{
        for(let iy=0;iy<=step;iy++)for(let ix=0;ix<=step;ix++){
          add({lat:b.minLat+(b.maxLat-b.minLat)*(iy/step),lng:b.minLng+(b.maxLng-b.minLng)*(ix/step)});
        }
      });
    }
    if(!candidates.length){
      const p=firstGeometryPoint(g);
      if(p)candidates.push(p);
    }
    const ref=target||c||candidates[0];
    return candidates.sort((a,b)=>haversineKm(a,ref)-haversineKm(b,ref))[0]||null;
  }
  function boundsDistanceKm(a,b){
    if(!a||!b)return Infinity;
    const midLat=((Math.max(a.minLat,b.minLat)+Math.min(a.maxLat,b.maxLat))/2)||((a.minLat+a.maxLat+b.minLat+b.maxLat)/4)||10;
    const latGap=a.maxLat<b.minLat?b.minLat-a.maxLat:b.maxLat<a.minLat?a.minLat-b.maxLat:0;
    const lngGap=a.maxLng<b.minLng?b.minLng-a.maxLng:b.maxLng<a.minLng?a.minLng-b.maxLng:0;
    const dy=latGap*111.32,dx=lngGap*111.32*Math.max(.15,Math.cos(midLat*Math.PI/180));
    return Math.sqrt(dx*dx+dy*dy);
  }
  function geometrySamplePoints(g,maxPoints){
    const pts=[];
    if(g&&g.__v132SamplePoints)return g.__v132SamplePoints;
    const polys=g&&g.type==='Polygon'?[g.coordinates]:g&&g.type==='MultiPolygon'?(g.coordinates||[]):[];
    polys.forEach(poly=>(poly||[]).forEach(ring=>(ring||[]).forEach(p=>{
      const lng=Number(p&&p[0]),lat=Number(p&&p[1]);
      if(isFinite(lat)&&isFinite(lng))pts.push({lat,lng});
    })));
    maxPoints=maxPoints||180;
    if(pts.length<=maxPoints){
      try{Object.defineProperty(g,'__v132SamplePoints',{value:pts,configurable:true})}catch(e){}
      return pts;
    }
    const step=Math.ceil(pts.length/maxPoints);
    const out=[];
    for(let i=0;i<pts.length;i+=step)out.push(pts[i]);
    try{Object.defineProperty(g,'__v132SamplePoints',{value:out,configurable:true})}catch(e){}
    return out;
  }
  function geometryDistanceKm(a,b){
    const boundGap=boundsDistanceKm(geometryBounds(a),geometryBounds(b));
    if(boundGap>1.5)return boundGap;
    const pa=geometrySamplePoints(a,120),pb=geometrySamplePoints(b,120);
    if(!pa.length||!pb.length)return Infinity;
    let min=Infinity;
    for(let i=0;i<pa.length;i++){
      for(let j=0;j<pb.length;j++){
        const d=haversineKm(pa[i],pb[j]);
        if(d<min)min=d;
        if(min<=.08)return min;
      }
    }
    return min;
  }
  function connectedRowComponents(rows,epsKm){
    rows=rows||[];epsKm=Number(epsKm)||.45;
    const n=rows.length,adj=Array.from({length:n},()=>[]);
    for(let i=0;i<n;i++){
      for(let j=i+1;j<n;j++){
        if(geometryDistanceKm(rows[i].geometry,rows[j].geometry)<=epsKm){
          adj[i].push(j);adj[j].push(i);
        }
      }
    }
    const seen=new Set(),components=[];
    for(let i=0;i<n;i++){
      if(seen.has(i))continue;
      const stack=[i],comp=[];seen.add(i);
      while(stack.length){
        const x=stack.pop();comp.push(rows[x]);
        adj[x].forEach(y=>{if(!seen.has(y)){seen.add(y);stack.push(y)}});
      }
      components.push(comp);
    }
    return components.sort((a,b)=>{
      const av=a.reduce((s,r)=>s+(Number(r.volumeSim)||0),0),bv=b.reduce((s,r)=>s+(Number(r.volumeSim)||0),0);
      return b.length-a.length||bv-av;
    });
  }
  function disconnectedBranchGroups(branches){
    return (branches||[]).map(branch=>{
      const components=connectedRowComponents(branch.rows||[],.45);
      return components.length>1?{branch,components}:null;
    }).filter(Boolean);
  }
  function chooseConnectedKeepComponent(branch,components){
    const current=branch&&!branch.missingCoord?{lat:Number(branch.lat),lng:Number(branch.lng)}:null;
    const nameMatch=components.find(comp=>comp.some(r=>rowMatchesBranchName(r,branch)||routeKeepWithBranch(r,branch)));
    const isPlannedNew=branchLooksNew(branch);
    if(isPlannedNew&&nameMatch)return nameMatch;
    if(current){
      const inside=components.find(comp=>pointInRows(current,comp));
      if(inside)return inside;
    }
    if(nameMatch)return nameMatch;
    return components.slice().sort((a,b)=>{
      const av=a.reduce((s,r)=>s+(Number(r.volumeSim)||0),0),bv=b.reduce((s,r)=>s+(Number(r.volumeSim)||0),0);
      const aa=a.reduce((s,r)=>s+(Number(r.area)||0),0),ba=b.reduce((s,r)=>s+(Number(r.area)||0),0);
      return b.length-a.length||bv-av||ba-aa;
    })[0]||[];
  }
  function componentVolume(rows){
    return (rows||[]).reduce((s,r)=>s+(Number(r.volumeSim)||0),0);
  }
  function componentArea(rows){
    return (rows||[]).reduce((s,r)=>s+(Number(r.area)||0),0);
  }
  function branchGapKm(aRows,bRows){
    let min=Infinity;
    (aRows||[]).forEach(a=>{
      (bRows||[]).forEach(b=>{
        const boundGap=boundsDistanceKm(geometryBounds(a.geometry),geometryBounds(b.geometry));
        if(boundGap>min||boundGap>1.25)return;
        const d=geometryDistanceKm(a.geometry,b.geometry);
        if(d<min)min=d;
      });
    });
    return min;
  }
  function branchBounds(rows){
    let out=null;
    (rows||[]).forEach(row=>{
      const b=geometryBounds(row.geometry);
      if(!b)return;
      out=out?{minLng:Math.min(out.minLng,b.minLng),minLat:Math.min(out.minLat,b.minLat),maxLng:Math.max(out.maxLng,b.maxLng),maxLat:Math.max(out.maxLat,b.maxLat)}:{...b};
    });
    return out;
  }
  function branchApproxGapKm(aRows,bRows){
    return boundsDistanceKm(branchBounds(aRows),branchBounds(bRows));
  }
  function stableColorIndex(text,mod){
    let h=0;String(text||'').split('').forEach(ch=>h=(h*31+ch.charCodeAt(0))|0);
    return Math.abs(h)%(mod||1);
  }
  function colorDistance(a,b){
    const pa=String(a||'').replace('#',''),pb=String(b||'').replace('#','');
    if(pa.length<6||pb.length<6)return 999;
    const ar=parseInt(pa.slice(0,2),16),ag=parseInt(pa.slice(2,4),16),ab=parseInt(pa.slice(4,6),16);
    const br=parseInt(pb.slice(0,2),16),bg=parseInt(pb.slice(2,4),16),bb=parseInt(pb.slice(4,6),16);
    if([ar,ag,ab,br,bg,bb].some(x=>isNaN(x)))return 999;
    return Math.sqrt((ar-br)**2+(ag-bg)**2+(ab-bb)**2);
  }
  function colorTooClose(color,used){
    return [...used].some(c=>colorDistance(color,c)<92);
  }
  function assignDistinctBranchColors(rows){
    const groups=new Map();
    (rows||[]).forEach(row=>{
      const name=row.plannedBranch||'';
      if(!groups.has(name))groups.set(name,[]);
      groups.get(name).push(row);
    });
    const branches=[...groups.entries()].map(([name,list])=>({name,rows:list,vol:componentVolume(list),bounds:branchBounds(list)})).sort((a,b)=>b.rows.length-a.rows.length||b.vol-a.vol);
    const neighbors=new Map(branches.map(b=>[b.name,new Set()]));
    for(let i=0;i<branches.length;i++){
      for(let j=i+1;j<branches.length;j++){
        const gap=boundsDistanceKm(branches[i].bounds,branches[j].bounds);
        if(isFinite(gap)&&gap<=.42){
          neighbors.get(branches[i].name).add(branches[j].name);
          neighbors.get(branches[j].name).add(branches[i].name);
        }
      }
    }
    const assigned=new Map();
    branches.forEach((branch,idx)=>{
      const used=new Set([...neighbors.get(branch.name)].map(name=>assigned.get(name)).filter(Boolean));
      const preferred=visualPalette[stableColorIndex(branch.name,visualPalette.length)];
      const color=(!used.has(preferred)&&!colorTooClose(preferred,used)&&preferred)
        ||visualPalette.find(c=>!used.has(c)&&!colorTooClose(c,used))
        ||visualPalette.find(c=>!used.has(c))
        ||visualPalette[idx%visualPalette.length];
      assigned.set(branch.name,color);
    });
    (rows||[]).forEach(row=>{
      const official=assigned.get(row.plannedBranch)||hashColor(row.plannedBranch);
      row.color=official;
      row.officialRouteColor=official;
      row.originalRouteColor=official;
    });
    return rows;
  }
  function branchLooksNew(branch){
    return (newBranchLike(branch?.name||'')&&!branchMatchesExistingLocal(branch))||(branch?.rows||[]).some(r=>r.planAction==='open'||r.planAction==='topology_split'||r.planAction==='global_open');
  }
  function branchNameForLocal(rows,localName){
    const target=norm(localName);
    const names=[];
    (rows||[]).forEach(r=>{
      if(r.plannedBranch)names.push(r.plannedBranch);
      if(r.currentBranch)names.push(r.currentBranch);
    });
    return names.find(name=>norm(branchLocalName(name)).includes(target))||'';
  }
  function rowsByCleanNames(rows,names){
    const wanted=new Set((names||[]).map(norm));
    return (rows||[]).filter(r=>wanted.has(norm(cleanWardName(r.ward))));
  }
  function rowsForManualRule(rows,rule){
    const wanted=new Set((rule.wards||[]).map(norm));
    return (rows||[]).filter(r=>{
      if(wanted.size&&!wanted.has(norm(cleanWardName(r.ward))))return false;
      if(rule.province&&!norm(r.province).includes(norm(rule.province)))return false;
      if(rule.sourceLocals&&rule.sourceLocals.length){
        const locals=[r.currentBranch,r.plannedBranch].map(x=>norm(branchLocalName(x)));
        if(!rule.sourceLocals.map(norm).some(x=>locals.some(local=>local.includes(x))))return false;
      }
      return true;
    });
  }
  function targetCoordForManualRule(rows,rule,targetName,list){
    if(rule.useExistingCoord){
      const existing=(rows||[]).find(r=>norm(r.plannedBranch)===norm(targetName)||norm(r.currentBranch)===norm(targetName));
      const coord=branchCoordFromName(targetName)||(existing&&(existing.groupCoord||existing.currentCoord||existing.coord));
      if(coord&&isFinite(Number(coord.lat))&&isFinite(Number(coord.lng)))return {coord:{lat:Number(coord.lat),lng:Number(coord.lng)},row:existing||list[0]||null};
    }
    return preferredFacility(list,rule.preferred);
  }
  function preferredFacility(rows,preferredWard){
    const facility=weightedFacilityPoint(rows);
    let coord={lat:facility.lat,lng:facility.lng},row=facility.row;
    const preferred=(rows||[]).find(r=>norm(cleanWardName(r.ward))===norm(preferredWard));
    if(preferred){
      const pt=pointOnSurface(preferred.geometry,coord)||preferred.centroid;
      if(pt&&isFinite(Number(pt.lat))&&isFinite(Number(pt.lng))){
        coord={lat:Number(pt.lat),lng:Number(pt.lng)};
        row=preferred;
      }
    }
    return {coord,row,facility};
  }
  function applyManualBtrRules(rows){
    const rules=[
      {
        local:'cai be',
        wards:['hoi cu'],
        province:'dong thap',
        preferred:'cai be',
        useExistingCoord:true,
        note:'Theo rà soát vận hành: xã Hội Cư nhập về bưu cục Cái Bè vì địa bàn liền kề Cái Bè hơn, giảm vòng chạy từ Hậu Mỹ.'
      },
      {
        targetName:'BC (TGI) Mỹ Thiện',
        wards:['thanh my','my thien'],
        province:'dong thap',
        preferred:'my thien',
        note:'Theo rà soát vận hành: cụm Thanh Mỹ - Mỹ Thiện đủ volume mô phỏng tối thiểu 400 và xa Hậu Mỹ, nên tách một điểm mới đặt tại xã Mỹ Thiện để giảm quãng đường xuất phát.'
      },
      {
        targetName:'BC (VLO) Quới An',
        wards:['quoi an','quoi thien'],
        province:'vinh long',
        preferred:'quoi an',
        note:'Theo rà soát vận hành: Quới An - Quới Thiện đủ ngưỡng tách tối thiểu, mở điểm mô phỏng tại Quới An để gom tuyến liền kề; đây là cụm sát ngưỡng nên cần theo dõi volume thực tế.'
      },
      {
        targetName:'BC (TVI) Bình Phú',
        wards:['binh phu','nhi long'],
        province:'vinh long',
        preferred:'binh phu',
        note:'Theo rà soát Càng Long: nếu nhập Nhị Long vào Càng Long thì volume và diện tích vượt cao; phương án hợp lý hơn là tách cụm Bình Phú - Nhị Long và đặt điểm tại Bình Phú, bưu cục Càng Long hiện hữu không cần di dời.'
      },
      {
        targetName:'BC (BTR) Tân Thủy',
        wards:['tan thuy','bao thanh','ba tri'],
        sourceLocals:['ba tri'],
        preferred:'tan thuy',
        note:'Theo rà soát cụm Ba Tri ven biển: Tân Thủy và Bảo Thạnh nếu tách riêng chưa đủ ngưỡng 400 đơn mô phỏng, nên gom thêm xã Ba Tri để mở một điểm liền kề đặt tại Tân Thủy, nằm trong địa bàn phụ trách và giảm kéo tuyến về cụm An Ngãi Trung.'
      },
      {
        targetName:'BC (BTR) An Ngãi Trung',
        wards:['tan xuan','my chanh hoa','an ngai trung','an hiep'],
        sourceLocals:['ba tri','an ngai trung'],
        preferred:'an ngai trung',
        note:'Sau khi tách cụm Tân Thủy - Bảo Thạnh - Ba Tri, phần còn lại được gom thành cụm An Ngãi Trung để tránh một bưu cục phụ trách hai mảng rời; điểm đặt nằm trong cụm An Ngãi Trung và cần đối chiếu tuyến đường thực tế trước khi chốt.'
      },
      {
        targetName:'BC (TVI) Duyên Hải',
        wards:['duyen hai','truong long hoa','long huu'],
        province:'tra vinh',
        preferred:'duyen hai',
        locked:true,
        note:'Theo yêu cầu rà soát cụm Duyên Hải: bưu cục Duyên Hải phụ trách phường Duyên Hải, xã Trường Long Hòa và xã Long Hữu để giảm phạm vi ven biển quá rộng, giữ điểm xuất phát gần lõi Duyên Hải cho NVPTTT.'
      },
      {
        targetName:'BC (TVI) Long Thành',
        wards:['long vinh','dong hai','long thanh','don chau','ngu lac'],
        province:'tra vinh',
        preferred:'long thanh',
        locked:true,
        note:'Theo yêu cầu rà soát cụm Duyên Hải - Long Thành: tách Long Thành phụ trách Long Vĩnh, Đông Hải, Long Thành, Đôn Châu và Ngũ Lạc để giảm quãng đường xuất phát tuyến, cân bằng địa bàn và tránh một bưu cục phủ toàn dải ven biển quá rộng.'
      },
      {
        local:'phu tuc',
        wards:['giao long','phu tan'],
        preferred:'giao long',
        note:'Theo rule vận hành Bến Tre: Phú Túc chỉ phụ trách xã Giao Long và phường Phú Tân; di dời điểm đặt về xã Giao Long để cover tuyến phía bắc hiệu quả hơn.'
      },
      {
        local:'son dong',
        wards:['son dong','phu tuc','ben tre'],
        preferred:'son dong',
        note:'Theo rule vận hành Bến Tre: Sơn Đông phụ trách phường Sơn Đông, xã Phú Túc và phường Bến Tre; điểm đặt được kéo lên gần trung tâm cụm để giảm vòng chạy.'
      },
      {
        local:'an hoi',
        wards:['phu khuong','luong phu','luong hoa','phuoc long'],
        preferred:'luong phu',
        note:'Theo rule vận hành Bến Tre: An Hội phụ trách Phú Khương, Lương Phú, Lương Hòa và Phước Long; di dời về trung tâm các tuyến phụ trách.'
      }
    ];
    const adjustments=[];
    rules.forEach(rule=>{
      const targetName=rule.targetName||branchNameForLocal(rows,rule.local);
      const list=rule.province||rule.sourceLocals?rowsForManualRule(rows,rule):rowsByCleanNames(rows,rule.wards);
      if(!targetName||!list.length)return;
      const label=shortName(targetName),picked=targetCoordForManualRule(rows,rule,targetName,list),coord=picked.coord;
      const keys=new Set(list.map(r=>r.key));
      (rows||[]).forEach(r=>{
        if(!keys.has(r.key))return;
        r.currentBranch=r.currentBranch||r.plannedBranch;
        r.plannedBranch=targetName;
        r.branchLabel=label;
        r.coord=coord;
        r.groupCoord=coord;
        r.missingCoord=false;
        r.coordEdited=true;
        setOfficialRouteColor(r,hashColor(targetName));
        r.autoReason=rule.note;
        r.planAction='manual_scope';
        r.manualLocked=rule.locked!==false;
        r.manualRuleTarget=targetName;
      });
      adjustments.push({
        type:'manual_scope',
        name:targetName,
        label,
        coord,
        rows:list.slice(),
        locked:rule.locked!==false,
        reason:rule.note,
        volumeSim:componentVolume(list),
        area:componentArea(list)
      });
    });
    return adjustments;
  }
  function findSmallComponentTarget(comp,branch,branches){
    if(!comp||!comp.length||!branch)return null;
    const currentNames=new Set(comp.map(r=>norm(r.currentBranch||'')).filter(Boolean));
    const ownCode=branchAreaCode(branch,comp[0]);
    const candidates=[];
    (branches||[]).forEach(target=>{
      if(!target||target.name===branch.name||target.missingCoord||!(target.rows||[]).length)return;
      if(branchLooksNew(target)&&(Number(target.volumeSim)||0)<MIN_SPLIT_VOLUME_SIM)return;
      if(ownCode&&branchAreaCode(target,comp[0])!==ownCode)return;
      const combined=(target.rows||[]).concat(comp);
      if(connectedRowComponents(combined,.45).length!==1)return;
      const gap=branchGapKm(comp,target.rows);
      if(!isFinite(gap)||gap>1.25)return;
      const targetEval=target.eval||evaluateBranch(target);
      let score=gap;
      if(currentNames.has(norm(target.name)))score-=6;
      if(comp.some(r=>rowMatchesBranchName(r,target)||routeKeepWithBranch(r,target)))score-=2.5;
      if(branchLooksNew(target))score+=1.8;
      if(targetEval.level==='critical')score+=1.2;
      else if(targetEval.level==='over')score+=.55;
      score+=(Number(target.volumeSim)||0)/16000;
      score+=(Number(target.area)||0)/1800;
      candidates.push({branch:target,gap,score});
    });
    return candidates.sort((a,b)=>a.score-b.score||a.gap-b.gap)[0]||null;
  }
  function splitDisconnectedResponsibilities(rows,usedNames){
    const recommendations=[],smallTransfers=[];
    let safety=0;
    while(safety++<3){
      cache.branchCoords.clear();
      rows.forEach(r=>{if(r.groupCoord)cache.branchCoords.set(r.plannedBranch,r.groupCoord)});
      const branches=buildBranches(rows),issues=disconnectedBranchGroups(branches);
      if(!issues.length)break;
      let changed=false;
      issues.forEach(issue=>{
        const branch=issue.branch,keep=chooseConnectedKeepComponent(branch,issue.components);
        if(branchHasManualRule(branch))return;
        const keepKeys=new Set(keep.map(r=>r.key));
        issue.components.forEach(comp=>{
          if(comp.every(r=>keepKeys.has(r.key)))return;
          const vol=componentVolume(comp),area=componentArea(comp);
          if(vol<MIN_SPLIT_VOLUME_SIM){
            const target=findSmallComponentTarget(comp,branch,branches);
            if(!target)return;
            const coord={lat:Number(target.branch.lat),lng:Number(target.branch.lng)};
            const compKeys=new Set(comp.map(r=>r.key));
            const reason=[
              `Không tách thành bưu cục riêng vì volume mô phỏng ${fmt(vol)} thấp hơn ngưỡng tối thiểu ${fmt(MIN_SPLIT_VOLUME_SIM)}.`,
              `Cụm ${comp.map(r=>r.ward).join(', ')} được nhập về ${target.branch.label} vì liền kề địa bàn hơn và giúp bưu cục ${branch.label} không còn phụ trách mảng rời rạc.`,
              'Quy tắc này ưu tiên địa bàn chạy thực tế và độ liền mạch, không tạo điểm nhỏ chỉ vì polygon bị tách.'
            ].join(' ');
            rows.forEach(r=>{
              if(!compKeys.has(r.key))return;
              r.currentBranch=r.currentBranch||branch.name;
              r.plannedBranch=target.branch.name;
              r.branchLabel=target.branch.label;
              r.coord=coord;
              r.groupCoord=coord;
              r.missingCoord=false;
              setOfficialRouteColor(r,hashColor(target.branch.name));
              r.autoReason=reason;
              r.planAction='small_transfer';
            });
            smallTransfers.push({type:'small_transfer',fromName:branch.name,fromLabel:branch.label,toName:target.branch.name,toLabel:target.branch.label,rows:comp.slice(),coord,reason,volumeSim:vol,area,gapKm:target.gap});
            changed=true;
            return;
          }
          const facility=weightedFacilityPoint(comp);
          if(!facility||!isFinite(Number(facility.lat))||!isFinite(Number(facility.lng)))return;
          const namingRow=facility.row||comp.slice().sort((a,b)=>(b.volumeSim||0)-(a.volumeSim||0))[0]||comp[0];
          const newName=uniqueBranchName(bestAnchorName(namingRow),usedNames);
          const newLabel=shortName(newName),coord={lat:facility.lat,lng:facility.lng};
          const reason=[
            `Tách mảng rời khỏi ${branch.label}: ${comp.map(r=>r.ward).join(', ')} không liền mạch với cụm chính ${keep.map(r=>r.ward).join(', ')}.`,
            'Bước kiểm tra liên thông địa bàn phát hiện bưu cục đang phụ trách nhiều cụm tách rời, dễ làm NVPTTT chạy vòng/qua sông và giảm năng suất.',
            `Điểm đặt đề xuất nằm trong ${namingRow?.ward||'cụm phụ trách'}, cần đối chiếu đường chạy thực tế trước khi chốt.`
          ].join(' ');
          const compKeys=new Set(comp.map(r=>r.key));
          rows.forEach(r=>{
            if(!compKeys.has(r.key))return;
            r.currentBranch=r.currentBranch||branch.name;
            r.plannedBranch=newName;r.branchLabel=newLabel;r.coord=coord;r.groupCoord=coord;r.missingCoord=false;setOfficialRouteColor(r,hashColor(newName));r.autoReason=reason;r.planAction='topology_split';
          });
          recommendations.push({type:'open',topologySplit:true,oldName:branch.name,oldLabel:branch.label,newName,newLabel,coord,rows:comp.slice(),keepRows:keep.slice(),anchor:namingRow,facility,reason,volumeSim:vol,area,priority:88});
          changed=true;
        });
      });
      if(!changed)break;
    }
    optimizePlannedCoordinates(rows);
    return {recommendations,smallTransfers};
  }
  function enforceMinimumSplitVolume(rows){
    const smallTransfers=[];
    let safety=0;
    while(safety++<3){
      cache.branchCoords.clear();
      rows.forEach(r=>{if(r.groupCoord)cache.branchCoords.set(r.plannedBranch,r.groupCoord)});
      const branches=buildBranches(rows);
      const lows=branches.filter(b=>!branchHasManualRule(b)&&branchLooksNew(b)&&(Number(b.volumeSim)||0)<MIN_SPLIT_VOLUME_SIM);
      if(!lows.length)break;
      let changed=false;
      lows.forEach(branch=>{
        const target=findSmallComponentTarget(branch.rows||[],branch,branches);
        if(!target)return;
        const coord={lat:Number(target.branch.lat),lng:Number(target.branch.lng)};
        const compKeys=new Set((branch.rows||[]).map(r=>r.key));
        const vol=componentVolume(branch.rows),area=componentArea(branch.rows);
        const reason=[
          `Hủy tách ${branch.label} vì volume mô phỏng ${fmt(vol)} thấp hơn ngưỡng tối thiểu ${fmt(MIN_SPLIT_VOLUME_SIM)}.`,
          `Các xã/phường ${branch.rows.map(r=>r.ward).join(', ')} được nhập về ${target.branch.label} để giữ cụm phụ trách liền mạch và tránh sinh bưu cục nhỏ.`
        ].join(' ');
        rows.forEach(r=>{
          if(!compKeys.has(r.key))return;
          r.currentBranch=r.currentBranch||branch.name;
          r.plannedBranch=target.branch.name;
          r.branchLabel=target.branch.label;
          r.coord=coord;
          r.groupCoord=coord;
          r.missingCoord=false;
          setOfficialRouteColor(r,hashColor(target.branch.name));
          r.autoReason=reason;
          r.planAction='small_transfer';
        });
        smallTransfers.push({type:'small_transfer',fromName:branch.name,fromLabel:branch.label,toName:target.branch.name,toLabel:target.branch.label,rows:(branch.rows||[]).slice(),coord,reason,volumeSim:vol,area,gapKm:target.gap});
        changed=true;
      });
      if(!changed)break;
    }
    optimizePlannedCoordinates(rows);
    return smallTransfers;
  }
  function filterLiveRecommendations(recs,planned){
    const live=new Map((planned||[]).map(r=>[r.key,r]));
    return (recs||[]).map(rec=>{
      const rows=(rec.rows||[]).map(r=>live.get(r.key)).filter(r=>r&&r.plannedBranch===rec.newName);
      if(!rows.length)return null;
      const volumeSim=componentVolume(rows),area=componentArea(rows);
      if(volumeSim<MIN_SPLIT_VOLUME_SIM)return null;
      return Object.assign({},rec,{rows,volumeSim,area});
    }).filter(Boolean);
  }
  function branchCoordinateInsideArea(branch){
    if(!branch||branch.missingCoord)return false;
    return !!pointInRows({lat:branch.lat,lng:branch.lng},branch.rows);
  }
  function clusterLabelPoint(rows){
    let lat=0,lng=0,weight=0;
    (rows||[]).forEach(r=>{
      const w=Math.max(1,Number(r.volumeSim)||Number(r.volGiao)||0);
      if(!r.centroid)return;
      lat+=r.centroid.lat*w;lng+=r.centroid.lng*w;weight+=w;
    });
    if(weight)return {lat:lat/weight,lng:lng/weight};
    return rows&&rows[0]&&rows[0].centroid?rows[0].centroid:{lat:10.35,lng:106};
  }

  function indexes(headers){
    const idx={};
    idx.polygon=findHeader(headers,h=>h.includes('toa do polygon')||h==='polygon');
    idx.province=findHeader(headers,h=>h.includes('tinh moi')||h==='tinh');
    idx.ward=findHeader(headers,h=>h.includes('xa phuong moi')||h.includes('ten xa')||h==='xa phuong');
    idx.area=findHeader(headers,h=>h.includes('dien tich'));
    idx.currentBranch=findHeader(headers,h=>h.includes('buu cuc phu trach')&&!h.includes('moi')&&!h.includes('toa do'));
    idx.currentCoord=findHeader(headers,h=>h.includes('toa do')&&h.includes('buu cuc')&&!h.includes('de xuat')&&!h.includes('moi'));
    idx.newBranch=findHeader(headers,h=>(h.includes('buu cuc')&&h.includes('moi'))||h.includes('ten buu cuc moi'));
    idx.proposedCoord=findHeader(headers,h=>h.includes('toa do')&&(h.includes('de xuat')||h.includes('moi')));
    idx.oldWard=findHeader(headers,h=>h.includes('xa phuong cu'));
    idx.vol=findHeader(headers,h=>h.includes('vol giao')||h.includes('volume')||h==='vol');
    idx.volLay=findHeader(headers,h=>h.includes('vol lay'));
    idx.volAfter=findHeader(headers,h=>h.includes('sau tang truong')||h.includes('don tao')||h.includes('forecast')||h.includes('du bao'));
    idx.route=findHeader(headers,h=>h.includes('so tuyen')||h==='tuyen'||h.includes('route'));
    return idx;
  }
  function buildDataBranchAliases(aoa){
    const map=new Map(),coordMap=new Map();
    if(!Array.isArray(aoa)||!aoa.length)return {map,coordMap};
    const headers=(aoa[0]||[]).map(x=>String(x||'')),n=headers.map(norm);
    let newIdx=n.findIndex(h=>h.includes('buu cuc')&&h.includes('moi'));
    let oldIdx=-1;
    if(newIdx>0){
      for(let i=newIdx-1;i>=0;i--){
        if(n[i].includes('buu cuc')&&!n[i].includes('moi')&&!n[i].includes('toa do')){oldIdx=i;break}
      }
    }
    if(oldIdx<0)oldIdx=2;
    if(newIdx<0)newIdx=3;
    const newCoordIdx=newIdx>=0?newIdx+1:-1;
    const coordNameIdx=n.findIndex((h,i)=>h.includes('buu cuc')&&!h.includes('moi')&&!h.includes('toa do')&&n[i+1]&&n[i+1].includes('toa do'));
    const coordIdx=coordNameIdx>=0?coordNameIdx+1:-1;
    for(let r=1;r<aoa.length;r++){
      const cells=aoa[r]||[],oldName=String(getCell(cells,oldIdx)).trim(),newName=String(getCell(cells,newIdx)).trim();
      if(oldName&&newName&&!isCoordLike(newName))map.set(norm(oldName),newName);
      const newCoord=parseCoord(getCell(cells,newCoordIdx));
      if(newName&&newCoord&&!isCoordLike(newName))coordMap.set(norm(newName),newCoord);
    }
    for(let r=1;r<aoa.length;r++){
      const cells=aoa[r]||[],coordName=String(getCell(cells,coordNameIdx)).trim(),coord=parseCoord(getCell(cells,coordIdx));
      if(!coordName||!coord)continue;
      coordMap.set(norm(coordName),coord);
      const renamed=map.get(norm(coordName));
      if(renamed)coordMap.set(norm(renamed),coord);
    }
    return {map,coordMap};
  }
  function aliasBranch(name,aliasMap){
    const raw=String(name||'').trim();
    return (aliasMap&&aliasMap.get(norm(raw)))||raw;
  }
  function pickPlannedBranch(cells,idx,aliasMap){
    let newBranch=String(getCell(cells,idx.newBranch)).trim();
    if(!newBranch){
      const f=getCell(cells,5),g=getCell(cells,6);
      if(isBranchLike(f))newBranch=String(f).trim();
      else if(isBranchLike(g))newBranch=String(g).trim();
    }
    if(newBranch)return aliasBranch(newBranch,aliasMap);
    return aliasBranch(getCell(cells,idx.currentBranch>=0?idx.currentBranch:4),aliasMap);
  }
  function parseRows(aoa,sourceName,options){
    options=options||{};
    const aliasMap=options.aliasMap||new Map(),aliasCoordMap=options.aliasCoordMap||new Map();
    const headers=(aoa[0]||[]).map(x=>String(x||'')),idx=indexes(headers);
    const rows=[],errors=[];
    let aliasCount=0;
    for(let r=1;r<aoa.length;r++){
      const cells=aoa[r]||[];
      if(!cells.some(x=>String(x||'').trim()))continue;
      const geom=parsePolygon(getCell(cells,idx.polygon>=0?idx.polygon:0));
      const ward=String(getCell(cells,idx.ward>=0?idx.ward:2)).trim();
      const rawCurrentBranch=String(getCell(cells,idx.currentBranch>=0?idx.currentBranch:4)).trim();
      const currentBranch=aliasBranch(rawCurrentBranch,aliasMap);
      const plannedBranch=pickPlannedBranch(cells,idx,aliasMap);
      if(rawCurrentBranch&&currentBranch!==rawCurrentBranch&&plannedBranch===currentBranch)aliasCount++;
      if(!geom||!ward||!plannedBranch)continue;
      const proposed=String(getCell(cells,idx.proposedCoord>=0?idx.proposedCoord:7)).trim();
      const currentCoord=String(getCell(cells,idx.currentCoord>=0?idx.currentCoord:5)).trim();
      const proposedCoord=parseCoord(proposed);
      const currentCoordObj=parseCoord(currentCoord)||aliasCoordMap.get(norm(currentBranch))||aliasCoordMap.get(norm(rawCurrentBranch))||null;
      const sameBranch=norm(plannedBranch)===norm(currentBranch)||norm(plannedBranch)===norm(rawCurrentBranch);
      const pcoord=proposedCoord||aliasCoordMap.get(norm(plannedBranch))||(sameBranch?currentCoordObj:null);
      const resolvedCurrentCoord=currentCoordObj||(sameBranch?pcoord:null);
      const volGiao=numberVal(getCell(cells,idx.vol>=0?idx.vol:9));
      const volLay=numberVal(getCell(cells,idx.volLay>=0?idx.volLay:10));
      const volQuyDoi=volGiao+(volLay/4);
      const volumeSim=(volGiao+volLay)*1.3;
      const after=numberVal(getCell(cells,idx.volAfter>=0?idx.volAfter:11));
      const centroid=centroidOfGeometry(geom);
      const row={
        key:'r'+r+'-'+norm(ward),rowNumber:r+1,sourceName,
        province:String(getCell(cells,idx.province>=0?idx.province:1)).trim(),
        ward,currentBranch,plannedBranch,branchLabel:shortName(plannedBranch),
        proposedCoordRaw:proposed,currentCoordRaw:currentCoord,currentCoord:resolvedCurrentCoord,coord:pcoord,geometry:geom,centroid,
        area:numberVal(getCell(cells,idx.area>=0?idx.area:3)),
        volGiao,volLay,volQuyDoi,volumeSim,
        volume:volGiao,volumeAfter:after||volQuyDoi,
        oldWard:String(getCell(cells,idx.oldWard>=0?idx.oldWard:8)).trim(),
        routeCount:numberVal(getCell(cells,idx.route)),
        rawCurrentBranch,color:hashColor(plannedBranch),missingCoord:!pcoord
      };
      setOfficialRouteColor(row,row.color);
      rows.push(row);
    }
    const groups=new Map();
    rows.forEach(row=>{
      if(!groups.has(row.plannedBranch))groups.set(row.plannedBranch,[]);
      groups.get(row.plannedBranch).push(row);
    });
    groups.forEach(list=>{
      const coordRow=list.find(x=>x.coord);
      const coord=coordRow?coordRow.coord:null;
      list.forEach(row=>{row.groupCoord=coord;row.missingCoord=!coord;if(!coord)errors.push(row)});
    });
    return {rows,errors,headers,aliasCount};
  }

  function getMap(){try{return window.map||map}catch(e){return window.map||null}}
  function isSimLayer(l){
    if(!l)return true;
    if(simLayers&&(l===simLayers.polygons||l===simLayers.markers||l===simLayers.labels))return true;
    const pane=String(l.options&&l.options.pane||'');
    if(pane.indexOf('v132Sim')===0)return true;
    try{if(l._container&&String(l._container.className||'').includes('v132'))return true}catch(e){}
    try{if(l._icon&&String(l._icon.className||'').includes('branch-marker-wrap'))return true}catch(e){}
    return false;
  }
  function isBaseLayer(l){
    if(!l)return true;
    try{if(window.L&&L.TileLayer&&l instanceof L.TileLayer)return true}catch(e){}
    return !!(l._url||l.getTileUrl);
  }
  function currentLayerCandidates(){
    const out=[];
    const m=getMap();
    try{
      if(m&&m._layers){
        Object.values(m._layers).forEach(l=>{
          if(!l||isBaseLayer(l)||isSimLayer(l))return;
          const isMapObject=typeof l.setStyle==='function'||typeof l.getLatLng==='function'||typeof l.getLayers==='function'||typeof l.getBounds==='function';
          if(isMapObject)out.push(l);
        });
      }
    }catch(e){}
    try{if(typeof layer!=='undefined'&&layer&&!out.includes(layer))out.push(layer)}catch(e){}
    try{if(typeof marker!=='undefined'&&marker&&!out.includes(marker))out.push(marker)}catch(e){}
    return out;
  }
  function getCurrentLayers(){
    const out=currentLayerCandidates();
    cache.hiddenCurrentLayers.forEach(l=>{if(l&&!out.includes(l))out.push(l)});
    return out;
  }
  function ensureLayers(){
    const m=getMap();if(!m||!window.L)return null;
    if(simLayers)return simLayers;
    if(!m.getPane('v132SimPolygonPane')){m.createPane('v132SimPolygonPane');m.getPane('v132SimPolygonPane').style.zIndex=520}
    if(!m.getPane('v132SimMarkerPane')){m.createPane('v132SimMarkerPane');m.getPane('v132SimMarkerPane').style.zIndex=940}
    if(!m.getPane('v132SimLabelPane')){m.createPane('v132SimLabelPane');m.getPane('v132SimLabelPane').style.zIndex=920;m.getPane('v132SimLabelPane').style.pointerEvents='none'}
    simLayers={polygons:L.layerGroup(),markers:L.layerGroup(),labels:L.layerGroup()};
    simLayers.polygons.addTo(m);simLayers.markers.addTo(m);simLayers.labels.addTo(m);
    m.on('zoomend moveend',scheduleLabels);
    setSimPaneEvents(true);
    return simLayers;
  }
  function setSimPaneEvents(on){
    const m=getMap();if(!m||!m.getPane)return;
    ['v132SimPolygonPane','v132SimMarkerPane'].forEach(id=>{
      const p=m.getPane(id);if(p)p.style.pointerEvents=on?'auto':'none';
    });
    const lp=m.getPane('v132SimLabelPane');if(lp)lp.style.pointerEvents='none';
  }
  function toggleCurrent(show){
    const m=getMap();if(!m)return;
    if(show){
      getCurrentLayers().forEach(l=>{try{if(!isBaseLayer(l)&&!isSimLayer(l)&&!m.hasLayer(l))l.addTo(m)}catch(e){}});
      cache.hiddenCurrentLayers.clear();
    }else{
      currentLayerCandidates().forEach(l=>{
        try{
          if(!isBaseLayer(l)&&!isSimLayer(l)&&m.hasLayer(l)){cache.hiddenCurrentLayers.add(l);m.removeLayer(l)}
        }catch(e){}
      });
    }
  }
  function togglePlan(show){
    const m=getMap(),ls=ensureLayers();if(!m||!ls)return;
    Object.values(ls).forEach(l=>{try{show?(!m.hasLayer(l)&&l.addTo(m)):(m.hasLayer(l)&&m.removeLayer(l))}catch(e){}});
    setSimPaneEvents(!!show);
    if(show)scheduleLabels();
  }
  function wardStyle(row){
    const has=state.selectedWards.size||state.selectedBranches.size;
    const active=state.selectedWards.has(row.key)||state.selectedBranches.has(row.plannedBranch);
    const faded=has&&!active;
    const fill=displayRouteColor(row);
    return {
      pane:'v132SimPolygonPane',
      color:active?'#ff3d00':(faded?fill:'#111827'),
      weight:active?3.8:(faded?1.25:1.45),
      opacity:active?1:(faded?.74:.9),
      fill:true,
      fillColor:fill,
      fillOpacity:faded?.18:.72,
      dashArray:row.missingCoord?'6 4':null
    };
  }
  function markerIcon(selected,missing,type){
    const kind=type==='new'?'new':type==='relocate'?'relocate':type==='changed'?'changed':'';
    const html='<div class="branch-marker-house v132-sim-marker '+kind+' '+(selected?'active selected ':'')+(missing?'missing':'')+'"></div>';
    const base=(type==='new'||type==='relocate')?25:22;
    const s=selected?base+3:base;
    return L.divIcon({className:'branch-marker-wrap',html,iconSize:[s,s],iconAnchor:[s/2,s/2]});
  }
  function rowPlanType(row){
    const action=row&&row.planAction;
    if(action==='open')return 'Mở mới đề xuất';
    if(action==='global_open')return 'Mở mới tối ưu toàn mạng';
    if(action==='relocate')return 'Di dời đề xuất';
    if(action==='coord_adjust')return 'Điều chỉnh tọa độ sau tách';
    if(action==='manual_rename'||row?.nameEdited)return 'Đổi tên thủ công';
    if(action==='compact_reassign')return 'Tối ưu cụm gần BC';
    if(action==='manual_transfer')return 'Điều chỉnh theo rule vận hành';
    if(action==='scope_adjust')return 'Điều chỉnh phạm vi';
    if(row&&(norm(row.currentBranch||'')!==norm(row.plannedBranch||'')))return /^BC\s*\(/i.test(row.plannedBranch||'')?'Mở mới/gợi ý':'Chuyển phụ trách';
    if(row&&(row.autoReason||row.coordEdited))return 'Điều chỉnh mô phỏng';
    return 'Giữ nguyên';
  }
  function branchPlanKind(branch){
    const rows=branch&&branch.rows||[];
    const existingLocal=branchMatchesExistingLocal(branch);
    if(newBranchLike(branch?.name||'')&&!existingLocal&&rows.some(r=>r.planAction==='open'||r.planAction==='global_open'||r.planAction==='topology_split'||r.planAction==='manual_scope'||norm(r.currentBranch||'')!==norm(r.plannedBranch||'')))return 'new';
    if(rows.some(r=>r.planAction==='open'||r.planAction==='global_open'))return 'new';
    if(rows.some(r=>r.planAction==='relocate'))return 'relocate';
    if(existingLocal&&rows.some(r=>r.planAction==='manual_scope'&&r.coordEdited))return 'relocate';
    if(rows.some(r=>r.planAction==='coord_adjust'||r.planAction==='manual_rename'||r.nameEdited||r.planAction==='scope_adjust'||r.planAction==='compact_reassign'||r.autoReason||r.coordEdited||norm(r.currentBranch||'')!==norm(r.plannedBranch||'')))return 'changed';
    return 'current';
  }
  function branchPlanType(branch){
    const kind=branchPlanKind(branch);
    if(kind==='new')return 'Mở mới đề xuất';
    if(kind==='relocate')return 'Di dời đề xuất';
    if(kind==='changed')return 'Điều chỉnh mô phỏng';
    return 'Hiện hữu';
  }
  function branchReason(branch){
    return (branch&&branch.rows||[]).map(r=>r.autoReason).find(Boolean)||'';
  }
  function newBranchLike(name){
    const raw=String(name||'').trim();
    const n=norm(raw);
    return n.startsWith('bc moi')||/^BC\s*\(/i.test(raw);
  }
  function plannedNameMatchesExistingLocal(name,rows){
    const local=norm(branchLocalName(name));
    const code=codeFromBranchName(name);
    if(!local)return false;
    return (rows||[]).some(row=>{
      const cur=row.currentBranch||row.rawCurrentBranch||'';
      const curLocal=norm(branchLocalName(cur));
      const curCode=codeFromBranchName(cur);
      if(!curLocal)return false;
      if(code&&curCode&&code!==curCode)return false;
      return curLocal===local||curLocal.includes(local)||local.includes(curLocal);
    });
  }
  function branchMatchesExistingLocal(branch){
    return plannedNameMatchesExistingLocal(branch?.name||'',branch?.rows||[]);
  }
  function branchHasManualRule(branch){
    return (branch?.rows||[]).some(r=>r.manualLocked);
  }
  function simulationBranchOptions(selected){
    return (state.branches||[]).slice().sort((a,b)=>String(a.label).localeCompare(String(b.label),'vi')).map(b=>`<option value="${esc(b.name)}" ${b.name===selected?'selected':''}>${esc(b.label)}</option>`).join('');
  }
  function popupWard(row){
    return `<div class="v132-popup" data-row-key="${esc(row.key)}"><h3>${esc(row.ward)}</h3><div class="grid">
      <div><span>Bưu cục phụ trách</span><b>${esc(row.branchLabel)}</b></div>
      <div><span>Tỉnh</span><b>${esc(row.province||'')}</b></div>
      <div><span>Vol giao mới (cột J)</span><b>${fmt(row.volGiao)}</b></div>
      <div><span>Vol lấy mới (cột K)</span><b>${fmt(row.volLay)}</b></div>
      <div><span>Vol quy đổi</span><b>${fmt(row.volQuyDoi)}</b></div>
      <div><span>Volume mô phỏng ×1.3</span><b>${fmt(row.volumeSim)}</b></div>
      <div><span>Diện tích</span><b>${fmt(row.area)} km²</b></div>
    </div>
    <div class="v132-popup-transfer">
      <label>Chuyển tuyến trong mô phỏng</label>
      <div><select data-v132-transfer-select>${simulationBranchOptions(row.plannedBranch)}</select><button type="button" data-v132-transfer-save>Lưu</button></div>
      <button type="button" data-v132-open-base>Mở bảng chuyển tuyến gốc</button>
    </div>
    <span>Xã/phường cũ</span><div class="wards">${esc(row.oldWard||'--')}</div></div>`;
  }
  function findBaseFeatureForRow(row){
    let features=[];
    try{features=Array.isArray(all)?all:[]}catch(e){features=[]}
    if(!features.length)return null;
    const rp=norm(row.province||''),rw=norm(row.ward||''),ro=norm(row.oldWard||'');
    const exact=features.find(f=>{
      const p=f.properties||{};
      return (!rp||norm(p.province||'')===rp)&&norm(p.ward||'')===rw&&(!ro||norm(p.old_ward||'')===ro);
    });
    if(exact)return exact;
    return features.find(f=>{
      const p=f.properties||{};
      return (!rp||norm(p.province||'')===rp)&&norm(p.ward||'')===rw;
    })||null;
  }
  function openBaseWardPanel(row){
    const f=findBaseFeatureForRow(row);
    if(!f)return false;
    try{
      if(typeof showWard==='function'){
        showWard(f,null);
        return true;
      }
    }catch(e){}
    return false;
  }
  function simulationPanelElements(){
    return {
      panel:document.getElementById('panel'),
      title:document.getElementById('title'),
      sub:document.getElementById('sub'),
      body:document.getElementById('body')
    };
  }
  function simulationAMOwner(branch){
    try{
      if(typeof amOfBranch==='function')return amOfBranch(branch)||'';
    }catch(e){}
    try{
      const mapping=window.amMapping||{};
      return Object.keys(mapping).find(am=>(mapping[am]||[]).some(b=>norm(b)===norm(branch)))||'';
    }catch(e){}
    return '';
  }
  function simulationDensity(row){
    const area=Number(row.area)||0;
    return area>0?(Number(row.volGiao)||0)/area:0;
  }
  function simulationColorButtons(current){
    const selected=colorToLower(current||'');
    return visualPalette.slice(0,24).map(c=>`<button type="button" class="v132-side-color ${colorToLower(c)===selected?'active':''}" data-v132-side-color="${esc(c)}" style="--c:${esc(c)}" aria-label="Đổi màu ${esc(c)}"></button>`).join('');
  }
  function colorToLower(c){
    return String(c||'').trim().toLowerCase();
  }
  function refreshSimulationWardPanel(rowKey){
    const updated=state.rows.find(r=>r.key===rowKey);
    if(updated)openSimulationWardPanel(updated);
  }
  function updateSimulationWardLayer(rowKey){
    const row=state.rows.find(r=>r.key===rowKey);
    const layer=cache.wardLayers.get(rowKey);
    if(row&&layer&&typeof layer.setStyle==='function')layer.setStyle(wardStyle(row));
    try{scheduleLabels();}catch(e){}
    return row;
  }
  function setSimulationSideColorActive(color){
    const selected=colorToLower(color||'');
    const els=simulationPanelElements();
    qa('button[data-v132-side-color]',els.body||document).forEach(btn=>{
      btn.classList.toggle('active',colorToLower(btn.dataset.v132SideColor)===selected);
    });
  }
  function updateSimulationWardColor(rowKey,color){
    if(!rowKey||!color)return;
    const row=state.rows.find(item=>item.key===rowKey);
    if(!row)return;
    row.previewRouteColor=color;
    row.manualColor=true;
    row.autoReason=row.autoReason||'Người dùng xem thử màu tuyến/xã phường trong lớp mô phỏng; dữ liệu bưu cục chưa thay đổi.';
    state.selectedWards.add(rowKey);
    updateSimulationWardLayer(rowKey);
    setSimulationSideColorActive(color);
  }
  function restoreSimulationWardColor(rowKey){
    if(!rowKey)return;
    const row=state.rows.find(item=>item.key===rowKey);
    if(!row)return;
    delete row.previewRouteColor;
    delete row.transferPreviewBranch;
    row.manualColor=false;
    updateSimulationWardLayer(rowKey);
    setSimulationSideColorActive(officialRouteColor(row));
  }
  function previewSimulationWardTransfer(rowKey,newBranch){
    if(!rowKey||!newBranch)return;
    const previewColor=branchOfficialColor(newBranch);
    const row=state.rows.find(item=>item.key===rowKey);
    if(!row)return;
    row.previewRouteColor=previewColor;
    row.transferPreviewBranch=newBranch;
    state.selectedWards.add(rowKey);
    updateSimulationWardLayer(rowKey);
    setSimulationSideColorActive(previewColor);
  }
  function createSimulationBranchFromWard(rowKey,name,coordText){
    const row=state.rows.find(r=>r.key===rowKey);
    if(!row)return false;
    name=String(name||'').replace(/\s+/g,' ').trim();
    if(!name){alert('Nhập tên bưu cục mô phỏng cần tạo.');return false}
    const used=new Set((state.branches||[]).map(b=>norm(b.name)));
    const branchName=uniqueBranchName(name,used);
    let coord=parseCoord(coordText);
    const m=getMap();
    if(!coord&&m){
      try{const c=m.getCenter();coord={lat:c.lat,lng:c.lng}}catch(e){}
    }
    coord=pointOnSurface(row.geometry,coord||row.centroid)||coord||row.centroid;
    if(!coord){alert('Không xác định được tọa độ đặt bưu cục mô phỏng.');return false}
    const rows=state.rows.map(item=>{
      const next=cloneRow(item);
      if(next.key===rowKey){
        next.currentBranch=next.currentBranch||next.plannedBranch;
        next.plannedBranch=branchName;
        next.branchLabel=shortName(branchName);
        next.coord=coord;
        next.groupCoord=coord;
        next.missingCoord=false;
        next.coordEdited=true;
        next.dragBaseName=branchName;
        setOfficialRouteColor(next,hashColor(branchName));
        next.autoReason=`Người dùng tạo nhanh bưu cục mô phỏng ${shortName(branchName)} từ tuyến ${row.ward}; dữ liệu gốc chưa bị thay đổi.`;
        next.planAction='open';
      }
      return next;
    });
    renderSimulation(rows,state.errors,state.sourceName,state.aliasCount,{fit:false,selectedWards:[rowKey],selectedBranches:[branchName]});
    refreshSimulationWardPanel(rowKey);
    return true;
  }
  function openSimulationWardPanel(row){
    if(!row)return false;
    try{const m=getMap();if(m)m.closePopup()}catch(e){}
    const els=simulationPanelElements();
    if(!els.panel||!els.title||!els.sub||!els.body)return false;
    const current=row.currentBranch||row.rawCurrentBranch||'Chưa có';
    const planned=row.plannedBranch||current;
    const transferSelected=row.transferPreviewBranch||planned;
    const am=simulationAMOwner(planned)||simulationAMOwner(current)||'Chưa gán';
    const currentColor=displayRouteColor(row);
    const coord=row.groupCoord||row.coord||row.centroid||null;
    const defaultName=shortName(planned);
    const defaultNewName=bestAnchorName(row);
    const coordValue=coord?coordLabel(coord.lat,coord.lng):'';
    els.title.textContent=row.ward||'Xã/phường';
    els.sub.innerHTML=`${esc(row.province||'')} · Mô phỏng quy hoạch`;
    els.body.innerHTML=`<div class="v132-side-panel" data-row-key="${esc(row.key)}">
      <div class="v132-side-note"><b>Đang chỉnh dữ liệu mô phỏng.</b><span>Dữ liệu gốc chỉ dùng để so sánh, chưa bị ghi đè.</span></div>
      <div class="kpis">
        <div class="kpi"><span>Vol giao</span><strong>${fmt(row.volGiao)}</strong></div>
        <div class="kpi"><span>Vol lấy</span><strong>${fmt(row.volLay)}</strong></div>
        <div class="kpi"><span title="Vol quy đổi = Vol giao + Vol lấy / 4">Vol quy đổi</span><strong>${fmt(row.volQuyDoi)}</strong></div>
        <div class="kpi"><span title="Volume mô phỏng = (Vol giao + Vol lấy) x 1.3">Vol mô phỏng</span><strong>${fmt(row.volumeSim)}</strong></div>
        <div class="kpi"><span>Diện tích</span><strong>${fmt(row.area)} km²</strong></div>
        <div class="kpi"><span>Mật độ giao</span><strong>${fmt(simulationDensity(row))} đơn/km²</strong></div>
      </div>
      <div class="info-row"><b>Tỉnh:</b>${esc(row.province||'--')}</div>
      <div class="info-row"><b>Bưu cục phụ trách hiện tại:</b>${esc(shortName(current))}</div>
      <div class="info-row"><b>Bưu cục phụ trách trong mô phỏng:</b>${esc(shortName(planned))}</div>
      <div class="info-row"><b>AM phụ trách:</b>${esc(am)}</div>
      <div class="info-row v132-side-actions"><b>Chuyển tuyến sang bưu cục khác trong mô phỏng:</b><div><select id="v132SideTransfer">${simulationBranchOptions(transferSelected)}</select><button class="btn ghn" id="v132SideTransferSave">Lưu chuyển tuyến</button></div></div>
      <div class="info-row v132-side-actions"><b>Đổi màu tuyến/xã/phường này:</b><div><div class="v132-side-colors">${simulationColorButtons(currentColor)}</div><button class="btn secondary" id="v132SideColorRestore">Khôi phục màu gốc</button></div></div>
      <div class="info-row v132-side-actions"><b>Đổi tên bưu cục mô phỏng:</b><div><input id="v132SideRenameBranch" class="v132-side-input" value="${esc(defaultName)}"/><button class="btn secondary" id="v132SideRenameSave">Đổi tên BC</button></div></div>
      <details class="info-row v132-side-new"><summary>Tạo nhanh bưu cục mới từ tuyến này</summary>
        <input id="v132SideNewBranchName" class="v132-side-input" value="${esc(defaultNewName)}" placeholder="Tên bưu cục mô phỏng mới"/>
        <input id="v132SideNewBranchCoord" class="v132-side-input" value="${esc(coordValue)}" placeholder="Tọa độ: 10.123456, 106.123456"/>
        <button class="btn secondary" id="v132SideUseMapCenter">Lấy tâm màn hình làm tọa độ</button>
        <button class="btn ghn" id="v132SideCreateBranch">Tạo BC mô phỏng + chuyển tuyến này</button>
      </details>
      <div class="info-row"><b>Xã/Phường/Thị trấn cũ:</b>${esc(row.oldWard||'--')}</div>
      <div class="info-row"><b>Lý do/ghi chú mô phỏng:</b>${esc(row.autoReason||rowPlanType(row)||'Giữ nguyên trong phương án mô phỏng.')}</div>
    </div>`;
    els.panel.classList.add('open');
    const transfer=q('#v132SideTransfer',els.body),transferBtn=q('#v132SideTransferSave',els.body);
    if(transfer)transfer.onchange=()=>previewSimulationWardTransfer(row.key,transfer.value||'');
    if(transferBtn)transferBtn.onclick=()=>transferSimulationWard(row.key,transfer?.value||'');
    qa('button[data-v132-side-color]',els.body).forEach(btn=>btn.onclick=()=>updateSimulationWardColor(row.key,btn.dataset.v132SideColor));
    const restoreBtn=q('#v132SideColorRestore',els.body);
    if(restoreBtn)restoreBtn.onclick=()=>restoreSimulationWardColor(row.key);
    const renameBtn=q('#v132SideRenameSave',els.body),renameInput=q('#v132SideRenameBranch',els.body);
    if(renameBtn)renameBtn.onclick=()=>{
      const next=renameInput?renameInput.value:'';
      if(renameSimulationBranch(planned,next)){
        state.selectedWards.add(row.key);
        updateSelectionOnly();renderLists();refreshSimulationWardPanel(row.key);
      }
    };
    const centerBtn=q('#v132SideUseMapCenter',els.body),coordInput=q('#v132SideNewBranchCoord',els.body);
    if(centerBtn)centerBtn.onclick=()=>{
      try{const c=getMap().getCenter();if(coordInput)coordInput.value=coordLabel(c.lat,c.lng)}catch(e){}
    };
    const createBtn=q('#v132SideCreateBranch',els.body),newName=q('#v132SideNewBranchName',els.body);
    if(createBtn)createBtn.onclick=()=>createSimulationBranchFromWard(row.key,newName?newName.value:'',coordInput?coordInput.value:'');
    return true;
  }
  function transferSimulationWard(rowKey,newBranch){
    const row=state.rows.find(r=>r.key===rowKey);
    if(!row||!newBranch||row.plannedBranch===newBranch)return;
    const target=state.branchMap.get(newBranch);
    const coord=target&&!target.missingCoord?{lat:Number(target.lat),lng:Number(target.lng)}:(cache.branchCoords.get(newBranch)||branchCoordFromName(newBranch)||row.coord||null);
    const rows=state.rows.map(item=>{
      const next=cloneRow(item);
      if(next.key===rowKey){
        next.currentBranch=next.currentBranch||next.plannedBranch;
        next.plannedBranch=newBranch;
        next.branchLabel=target?.label||shortName(newBranch);
        next.coord=coord;
        next.groupCoord=coord;
        next.missingCoord=!coord;
        setOfficialRouteColor(next,hashColor(newBranch));
        delete next.transferPreviewBranch;
        next.autoReason='Người dùng chuyển tuyến trực tiếp trong lớp mô phỏng quy hoạch.';
        next.planAction='manual_transfer';
      }
      return next;
    });
    renderSimulation(rows,state.errors,state.sourceName,state.aliasCount,{fit:false,selectedWards:[rowKey]});
    refreshSimulationWardPanel(rowKey);
    return true;
  }
  function renameSimulationBranch(oldName,newName){
    oldName=String(oldName||'').trim();newName=String(newName||'').replace(/\s+/g,' ').trim();
    if(!oldName||!state.branchMap.has(oldName)){alert('Vui lòng chọn đúng một bưu cục trong mô phỏng để đổi tên.');return false}
    if(!newName){alert('Tên bưu cục mới không được để trống.');return false}
    const duplicate=state.branches.find(b=>norm(b.name)===norm(newName)&&norm(b.name)!==norm(oldName));
    if(duplicate){alert('Tên bưu cục này đã tồn tại trong phương án mô phỏng. Vui lòng chọn tên khác.');return false}
    const oldBranch=state.branchMap.get(oldName);
    const coord=cache.branchCoords.get(oldName)||(oldBranch&&!oldBranch.missingCoord?{lat:Number(oldBranch.lat),lng:Number(oldBranch.lng)}:null);
    if(coord)cache.branchCoords.set(newName,coord);
    cache.branchCoords.delete(oldName);
    const rows=state.rows.map(item=>{
      const next=cloneRow(item);
      if(next.plannedBranch!==oldName)return next;
      next.currentBranch=next.currentBranch||next.plannedBranch;
      next.renameBaseName=next.renameBaseName||oldName;
      next.plannedBranch=newName;
      next.branchLabel=shortName(newName);
      if(coord){next.coord=coord;next.groupCoord=coord;next.missingCoord=false}
      setOfficialRouteColor(next,hashColor(newName));
      next.nameEdited=true;
      next.planAction=next.planAction||'manual_rename';
      const note=`Người dùng đổi tên bưu cục mô phỏng từ ${shortName(oldName)} thành ${shortName(newName)}; phạm vi xã/phường phụ trách giữ nguyên.`;
      next.autoReason=next.autoReason?next.autoReason+' '+note:note;
      if(next.manualRuleTarget===oldName)next.manualRuleTarget=newName;
      return next;
    });
    const selected=[newName];
    if(state.selectedBranches.has(oldName)){state.selectedBranches.delete(oldName);state.selectedBranches.add(newName)}
    renderSimulation(rows,[],state.sourceName,state.aliasCount,{fit:false,selectedBranches:selected});
    if(state.autoPlan){
      state.autoPlan.after=state.branches;
      state.autoPlan.manualEdited=true;
      state.autoPlan.globalAudit=state.audit;
      renderAutoPlan();
    }
    return true;
  }
  function renameSelectedSimulationBranch(){
    if(!state.rows.length){alert('Chưa có dữ liệu mô phỏng để đổi tên bưu cục.');return}
    const selected=[...state.selectedBranches].filter(name=>state.branchMap.has(name));
    if(selected.length!==1){
      alert('Vui lòng tick hoặc bấm chọn đúng 1 bưu cục trên bản đồ/danh sách trước khi đổi tên.');
      return;
    }
    const current=state.branchMap.get(selected[0]);
    const next=prompt('Nhập tên bưu cục mới. Phạm vi xã/phường phụ trách sẽ được giữ nguyên.',current?.label||selected[0]);
    if(next===null)return;
    renameSimulationBranch(selected[0],next);
  }
  function addSimulationBranch(){
    if(!state.rows.length){alert('Chưa có dữ liệu mô phỏng để thêm bưu cục. Vui lòng upload hoặc chạy gợi ý trước.');return}
    const m=getMap(),center=m?m.getCenter():null;
    let baseRows=state.selectedWards.size?state.rows.filter(r=>state.selectedWards.has(r.key)):[];
    if(!baseRows.length&&center){
      const inside=pointInRows({lat:center.lat,lng:center.lng},state.rows);
      if(inside)baseRows=[inside];
    }
    if(!baseRows.length){
      alert('Hãy tick ít nhất 1 xã/phường, hoặc đặt bản đồ vào vùng muốn thêm bưu cục rồi bấm lại.');
      return;
    }
    const facility=weightedFacilityPoint(baseRows);
    const anchor=facility.row||baseRows.slice().sort((a,b)=>(b.volumeSim||0)-(a.volumeSim||0))[0];
    const used=new Set((state.branches||[]).map(b=>norm(b.name)));
    const newName=uniqueBranchName(bestAnchorName(anchor),used);
    const coord={lat:facility.lat,lng:facility.lng};
    const keys=new Set(baseRows.map(r=>r.key));
    const rows=state.rows.map(item=>{
      const next=cloneRow(item);
      if(keys.has(next.key)){
        next.currentBranch=next.currentBranch||next.plannedBranch;
        next.plannedBranch=newName;
        next.branchLabel=shortName(newName);
        next.coord=coord;
        next.groupCoord=coord;
        next.missingCoord=false;
        next.coordEdited=true;
        next.dragBaseName=newName;
        setOfficialRouteColor(next,hashColor(newName));
        next.autoReason=`Người dùng thêm bưu cục mô phỏng cho cụm ${baseRows.map(r=>r.ward).join(', ')}; tọa độ được đặt trong vùng phụ trách và có thể kéo chỉnh tiếp.`;
        next.planAction='open';
      }
      return next;
    });
    renderSimulation(rows,state.errors,state.sourceName,state.aliasCount,{fit:false,selectedBranches:[newName],selectedWards:[...keys]});
  }
  function targetForDeletedBranch(row,deletedName,branches){
    const candidates=(branches||[]).filter(b=>b.name!==deletedName&&!(b.planKind==='new'&&(Number(b.volumeSim)||0)<MIN_SPLIT_VOLUME_SIM)&&!b.missingCoord);
    const sameCurrent=candidates.find(b=>norm(b.name)===norm(row.currentBranch||row.rawCurrentBranch||''));
    if(sameCurrent)return sameCurrent;
    const code=provinceCode(row.province);
    const scored=candidates.map(b=>{
      const d=haversineKm(row.centroid,{lat:Number(b.lat),lng:Number(b.lng)});
      const sameCode=(codeFromBranchName(b.name)||codeFromBranchName(b.label)||code)===code;
      const connected=connectedRowComponents((b.rows||[]).concat([row]),.45).length===1;
      return {b,score:d+(sameCode?0:25)+(connected?0:8)+(branchLooksNew(b)?5:0)};
    }).sort((a,b)=>a.score-b.score);
    return scored[0]?.b||null;
  }
  function deleteSelectedSimulationBranches(){
    if(!state.rows.length){alert('Chưa có lớp mô phỏng để xóa bưu cục.');return}
    const names=[...state.selectedBranches];
    if(!names.length){alert('Hãy tick bưu cục mô phỏng cần xóa trong danh sách trước.');return}
    let rows=state.rows.map(cloneRow),changed=false;
    names.forEach(name=>{
      const branches=buildBranches(rows);
      const branch=branches.find(b=>b.name===name);
      if(!branch)return;
      branch.rows.forEach(row=>{
        const item=rows.find(r=>r.key===row.key);
        if(!item)return;
        const target=targetForDeletedBranch(item,name,branches);
        const fallback=item.currentBranch||item.rawCurrentBranch||item.plannedBranch;
        const targetName=target?.name||fallback;
        const coord=target&&!target.missingCoord?{lat:Number(target.lat),lng:Number(target.lng)}:(branchCoordFromName(targetName)||item.currentCoord||item.coord||null);
        item.plannedBranch=targetName;
        item.branchLabel=shortName(targetName);
        item.coord=coord;
        item.groupCoord=coord;
        item.missingCoord=!coord;
        setOfficialRouteColor(item,hashColor(targetName));
        item.planAction='manual_transfer';
        item.autoReason=`Người dùng xóa bưu cục mô phỏng ${branch.label}; xã/phường được trả về ${shortName(targetName)} để tiếp tục rà soát.`;
        changed=true;
      });
    });
    if(!changed)return;
    state.selectedBranches.clear();
    renderSimulation(rows,state.errors,state.sourceName,state.aliasCount,{fit:false});
  }
  function bindWardPopupControls(row){
    const root=Array.from(document.querySelectorAll('.leaflet-popup .v132-popup')).find(el=>el.dataset.rowKey===row.key);
    if(!root||root.dataset.bound==='1')return;
    root.dataset.bound='1';
    const select=root.querySelector('[data-v132-transfer-select]');
    const save=root.querySelector('[data-v132-transfer-save]');
    const base=root.querySelector('[data-v132-open-base]');
    if(select&&save)save.onclick=ev=>{ev.preventDefault();transferSimulationWard(row.key,select.value)};
    if(base)base.onclick=ev=>{ev.preventDefault();openBaseWardPanel(row)};
  }
  function popupBranch(branch){
    const wards=branch.rows.map(r=>r.ward).sort((a,b)=>a.localeCompare(b,'vi'));
    const reason=branch.planReason||branchReason(branch);
    return `<div class="v132-popup"><h3>${esc(branch.label)}</h3><div class="grid">
      <div><span>Loại quy hoạch</span><b>${esc(branch.planType||'Hiện hữu')}</b></div>
      <div><span>Vol giao mới (cột J)</span><b>${fmt(branch.volGiao)}</b></div>
      <div><span>Vol lấy mới (cột K)</span><b>${fmt(branch.volLay)}</b></div>
      <div><span>Vol quy đổi</span><b>${fmt(branch.volQuyDoi)}</b></div>
      <div><span>Volume mô phỏng ×1.3</span><b>${fmt(branch.volumeSim)}</b></div>
      <div><span>Đơn tạo / sau tăng trưởng</span><b>${fmt(branch.volumeAfter)}</b></div>
      <div><span>Diện tích phụ trách</span><b>${fmt(branch.area)} km²</b></div>
      <div><span>Số xã/phường</span><b>${branch.wardCount}</b></div>
      ${branch.eval?`<div><span>Trạng thái</span><b>${esc(branch.eval.status)}</b></div>`:''}
      <div><span>Số tuyến</span><b>${fmt(branch.routeCount||branch.wardCount)}</b></div>
      <div><span>Tọa độ</span><b>${branch.missingCoord?'Thiếu tọa độ':fmt(branch.lat)+', '+fmt(branch.lng)}</b></div>
    </div>${reason?`<span>Lý do quy hoạch</span><div class="wards">${esc(reason)}</div>`:''}<span>Các xã/phường phụ trách</span><div class="wards">${wards.map(w=>'• '+esc(w)).join('<br>')}</div></div>`;
  }
  function isUrbanWard(name){
    const s=deaccent(String(name||'')).toLowerCase().replace(/\s+/g,' ').trim();
    return /^(phuong|p\.|thi tran|tt\.|thanh pho|tp\.)\b/.test(s);
  }
  function thresholdForRows(rows){
    const urban=(rows||[]).some(r=>isUrbanWard(r.ward||r.name));
    return urban
      ?{type:'Đô thị/phường',areaLimit:100,volLimit:1000,kmLimit:14,wardLimit:5}
      :{type:'Xã/nông thôn',areaLimit:200,volLimit:800,kmLimit:26,wardLimit:6};
  }
  function evaluateBranch(branch){
    const th=thresholdForRows(branch.rows);
    const center={lat:Number(branch.lat)||0,lng:Number(branch.lng)||0};
    const maxKm=(branch.rows||[]).reduce((mx,r)=>Math.max(mx,haversineKm(center,r.centroid)),0);
    const vol=Number(branch.volumeSim)||0,area=Number(branch.area)||0,wards=Number(branch.wardCount)||(branch.rows||[]).length;
    const volRatio=th.volLimit?vol/th.volLimit:0,areaRatio=th.areaLimit?area/th.areaLimit:0,kmRatio=th.kmLimit?maxKm/th.kmLimit:0,wardRatio=th.wardLimit?wards/th.wardLimit:0;
    const reasons=[];
    if(volRatio>1)reasons.push(`Volume mô phỏng ${fmt(vol)} vượt ngưỡng ${fmt(th.volLimit)}`);
    else if(volRatio>.85)reasons.push(`Volume mô phỏng gần ngưỡng (${fmt(vol)}/${fmt(th.volLimit)})`);
    if(areaRatio>1)reasons.push(`Diện tích ${fmt(area)} km² vượt ngưỡng ${fmt(th.areaLimit)} km²`);
    else if(areaRatio>.85)reasons.push(`Diện tích gần ngưỡng (${fmt(area)}/${fmt(th.areaLimit)} km²)`);
    if(kmRatio>1)reasons.push(`Điểm xa nhất ước tính ${fmt(maxKm)} km`);
    if(wards>th.wardLimit)reasons.push(`Số xã/phường ${wards} cao hơn mức kiểm soát ${th.wardLimit}`);
    let status='Bình thường',level='normal';
    if((volRatio>1.25&&areaRatio>1.15)||volRatio>1.65||areaRatio>1.65||kmRatio>1.45||(wardRatio>1.5&&Math.max(volRatio,areaRatio)>1)){
      status='Quá tải nghiêm trọng';level='critical';
    }else if(volRatio>1.05||areaRatio>1.05||kmRatio>1.05||wards>th.wardLimit){
      status='Quá tải';level='over';
    }else if(volRatio>.85||areaRatio>.85||kmRatio>.85||wards>=Math.max(1,th.wardLimit-1)){
      status='Cần theo dõi';level='watch';
    }
    return {status,level,reasons,threshold:th,maxKm,ratios:{vol:volRatio,area:areaRatio,km:kmRatio,wards:wardRatio}};
  }
  function uniqueBranchName(base,used){
    let name=base,i=2;
    while(used.has(norm(name)))name=base+' '+i++;
    used.add(norm(name));
    return name;
  }
  function branchCoordFromName(name){
    const coords=window.GHN_BRANCH_COORDS||{};
    const raw=coords[name];
    if(Array.isArray(raw)&&raw.length>=2)return {lat:Number(raw[0]),lng:Number(raw[1])};
    if(raw&&typeof raw==='object'&&!isNaN(Number(raw.lat))&&!isNaN(Number(raw.lng)))return {lat:Number(raw.lat),lng:Number(raw.lng)};
    const arr=Array.isArray(window.GHN_BRANCHES)?window.GHN_BRANCHES:[];
    const b=arr.find(x=>x&&x.branch===name);
    return b&&!isNaN(Number(b.lat))&&!isNaN(Number(b.lng))?{lat:Number(b.lat),lng:Number(b.lng)}:null;
  }
  function bestAnchorName(row){
    const code=codeFromBranchName(row.currentBranch)||codeFromBranchName(row.plannedBranch)||provinceCode(row.province);
    return 'BC ('+code+') '+cleanWardName(row.ward);
  }
  function branchLocalName(name){
    return String(shortName(name)||'').replace(/^\([^)]+\)\s*/,'').replace(/^BC\s+/i,'').replace(/\s+\d+$/,'').trim();
  }
  function rowMatchesBranchName(row,branch){
    const local=norm(branchLocalName(branch?.label||branch?.name||''));
    const ward=norm(cleanWardName(row?.ward||''));
    return !!(local&&ward&&(local===ward||local.includes(ward)||ward.includes(local)));
  }
  function routeKeepWithBranch(row,branch){
    const ward=norm(cleanWardName(row?.ward||'')),local=norm(branchLocalName(branch?.label||branch?.name||''));
    const rules=[
      {ward:'vinh binh',branch:'dong son'}
    ];
    return rules.some(r=>ward===r.ward&&local.includes(r.branch));
  }
  function routeCorridorRule(branch){
    const local=norm(branchLocalName(branch?.label||branch?.name||''));
    const code=codeFromBranchName(branch?.name||branch?.label||'');
    if(code==='TVI'&&local.includes('tra vinh')){
      return {
        wards:['long duc'],
        preferredWard:'long duc',
        baseName:'BC (TVI) Long Đức',
        note:'Long Đức là cụm tải cao phía Trà Vinh; tách thành một điểm riêng để không kéo dài toàn bộ dải này về marker Trà Vinh.'
      };
    }
    return null;
  }
  function suggestRouteCorridorSplit(branch,usedNames){
    const rule=routeCorridorRule(branch);
    if(!rule||!branch.rows||branch.rows.length<4)return null;
    const wanted=new Set(rule.wards.map(norm));
    const newRows=branch.rows.filter(r=>wanted.has(norm(cleanWardName(r.ward))));
    const keepRows=branch.rows.filter(r=>!wanted.has(norm(cleanWardName(r.ward))));
    if(!newRows.length||keepRows.length<2)return null;
    const facility=weightedFacilityPoint(newRows);
    if(!facility||!isFinite(Number(facility.lat))||!isFinite(Number(facility.lng)))return null;
    const preferred=newRows.find(r=>norm(cleanWardName(r.ward))===norm(rule.preferredWard));
    const namingRow=preferred||facility.row||newRows.slice().sort((a,b)=>(b.volumeSim||0)-(a.volumeSim||0))[0];
    const newName=uniqueBranchName(rule.baseName||bestAnchorName(namingRow),usedNames);
    const vol=newRows.reduce((s,r)=>s+(Number(r.volumeSim)||0),0);
    const area=newRows.reduce((s,r)=>s+(Number(r.area)||0),0);
    if(vol<MIN_SPLIT_VOLUME_SIM)return null;
    const reason=[
      rule.note,
      `Cụm tách gồm ${newRows.map(r=>r.ward).join(', ')}; điểm đặt ưu tiên ${namingRow?.ward||'khu vực volume cao'} thay vì để toàn bộ dải này phụ thuộc một marker Trà Vinh ở phía dưới.`,
      'Đây là luật hành lang tuyến, không phải tự chuyển theo khoảng cách đường chim bay; cần đối chiếu cung đường thực tế, cầu/phà và mật độ dân cư trước khi chốt.'
    ].join(' ');
    return {
      type:'open',routeCorridor:true,oldName:branch.name,oldLabel:branch.label,
      newName,newLabel:shortName(newName),coord:{lat:facility.lat,lng:facility.lng},
      rows:newRows,keepRows,anchor:namingRow,facility,reason,volumeSim:vol,area,priority:99
    };
  }
  function weightedFacilityPoint(rows){
    const pts=(rows||[]).filter(r=>r&&r.centroid).map(r=>({
      row:r,lat:r.centroid.lat,lng:r.centroid.lng,
      w:Math.max(1,Number(r.volumeSim)||Number(r.volGiao)||0)
    }));
    if(!pts.length)return {lat:10.35,lng:106,row:null,avgKm:0,maxKm:0};
    let lat=pts.reduce((s,p)=>s+p.lat*p.w,0)/pts.reduce((s,p)=>s+p.w,0);
    let lng=pts.reduce((s,p)=>s+p.lng*p.w,0)/pts.reduce((s,p)=>s+p.w,0);
    for(let i=0;i<18;i++){
      let sw=0,slat=0,slng=0;
      pts.forEach(p=>{
        const d=Math.max(.08,haversineKm({lat,lng},{lat:p.lat,lng:p.lng}));
        const w=p.w/d;sw+=w;slat+=p.lat*w;slng+=p.lng*w;
      });
      if(sw){lat=slat/sw;lng=slng/sw}
    }
    const scored=pts.map(p=>{
      const d=haversineKm({lat,lng},{lat:p.lat,lng:p.lng});
      const volBonus=Math.min(6,Math.log(1+p.w));
      return {p,d,score:d-(volBonus*.18)};
    }).sort((a,b)=>a.score-b.score);
    let representative=scored[0]?.p||pts[0];
    let finalPoint={lat,lng},constrained=false;
    const containing=pointInRows(finalPoint,rows);
    if(containing){
      representative=pts.find(p=>p.row===containing)||representative;
    }else{
      const target=finalPoint;
      const candidates=(rows||[]).map(row=>{
        const pt=pointOnSurface(row.geometry,target);
        if(!pt)return null;
        const weightedDist=pts.reduce((s,p)=>s+haversineKm(pt,{lat:p.lat,lng:p.lng})*p.w,0);
        const targetDist=haversineKm(pt,target);
        const volumeBonus=Math.log(1+Math.max(1,Number(row.volumeSim)||Number(row.volGiao)||0));
        return {row,pt,score:weightedDist+(targetDist*60)-(volumeBonus*8)};
      }).filter(Boolean).sort((a,b)=>a.score-b.score);
      if(candidates.length){
        finalPoint=candidates[0].pt;
        representative=pts.find(p=>p.row===candidates[0].row)||representative;
        constrained=true;
      }
    }
    const distances=pts.map(p=>haversineKm(finalPoint,{lat:p.lat,lng:p.lng}));
    return {
      lat:finalPoint.lat,lng:finalPoint.lng,row:representative.row,constrained,insideArea:!!pointInRows(finalPoint,rows),
      avgKm:distances.length?distances.reduce((s,x)=>s+x,0)/distances.length:0,
      maxKm:distances.length?Math.max(...distances):0
    };
  }
  function shouldOptimizePlannedGroup(name,rows){
    if(!rows||!rows.length||rows.some(r=>r.coordEdited))return false;
    if(rows.some(r=>r.planAction==='open'||r.planAction==='global_open'||r.planAction==='relocate'))return true;
    if(newBranchLike(name))return true;
    const hasExistingCoord=!!branchCoordFromName(name);
    const changesOwner=rows.some(r=>norm(r.currentBranch||'')!==norm(r.plannedBranch||''));
    return changesOwner&&!hasExistingCoord;
  }
  function optimizePlannedCoordinates(rows){
    const groups=new Map();
    (rows||[]).forEach(row=>{
      if(!groups.has(row.plannedBranch))groups.set(row.plannedBranch,[]);
      groups.get(row.plannedBranch).push(row);
    });
    groups.forEach((list,name)=>{
      if(!shouldOptimizePlannedGroup(name,list))return;
      const facility=weightedFacilityPoint(list);
      if(!facility||!isFinite(Number(facility.lat))||!isFinite(Number(facility.lng)))return;
      const coord={lat:facility.lat,lng:facility.lng};
      const oldCoord=list.find(r=>r.groupCoord)?.groupCoord||list.find(r=>r.coord)?.coord||null;
      const movedKm=oldCoord?haversineKm(oldCoord,coord):0;
      const action=newBranchLike(name)&&!plannedNameMatchesExistingLocal(name,list)?'open':'relocate';
      const note=[
        action==='open'?'Tọa độ BC mở mới được tối ưu theo cụm phụ trách.':'Tọa độ BC di dời được tối ưu theo cụm phụ trách.',
        `Điểm đặt nằm trong ${facility.row?.ward||'khu vực phụ trách'}, ưu tiên xã/phường có volume cao và giảm quãng đường bao quát tuyến cho NVPTTT.`,
        facility.constrained?'Điểm đã được khóa nằm trong polygon phụ trách.':'',
        oldCoord&&movedKm?`So với tọa độ ban đầu, hệ thống dịch khoảng ${fmt(movedKm)} km để marker nằm hợp lý hơn.`:''
      ].filter(Boolean).join(' ');
      list.forEach(r=>{
        r.coord=coord;r.groupCoord=coord;r.missingCoord=false;
        r.planAction=r.planAction||action;
        r.autoReason=r.autoReason||note;
      });
    });
    return rows;
  }
  function branchAreaCode(branch,row){
    return codeFromBranchName(branch?.name)||codeFromBranchName(branch?.label)||codeFromBranchName(row?.plannedBranch)||provinceCode(row?.province);
  }
  function buildBranchSnapshot(rows){
    cache.branchCoords.clear();
    (rows||[]).forEach(r=>{if(r.groupCoord)cache.branchCoords.set(r.plannedBranch,r.groupCoord)});
    return buildBranches(rows);
  }
  function compactnessAudit(rows,branches){
    const byName=new Map((branches||[]).map(b=>[b.name,b]));
    const outliers=[];
    (rows||[]).forEach(row=>{
      const own=byName.get(row.plannedBranch);
      if(!own||own.missingCoord||!row.centroid)return;
      const ownPt={lat:Number(own.lat),lng:Number(own.lng)};
      const ownKm=haversineKm(ownPt,row.centroid);
      let nearest=null;
      (branches||[]).forEach(b=>{
        if(!b||b.name===own.name||b.missingCoord)return;
        const d=haversineKm({lat:Number(b.lat),lng:Number(b.lng)},row.centroid);
        if(!nearest||d<nearest.km)nearest={branch:b,km:d};
      });
      const th=thresholdForRows([row]);
      const ownCode=branchAreaCode(own,row),nearCode=nearest?branchAreaCode(nearest.branch,row):'';
      const sameCode=!ownCode||!nearCode||ownCode===nearCode;
      const extremeCrossCode=!sameCode&&ownKm>30&&nearest&&nearest.km<=ownKm*.45;
      if(nearest&&(sameCode||extremeCrossCode)&&ownKm>Math.max(10,(th.kmLimit||20)*.52)&&nearest.km+3<ownKm&&nearest.km<=ownKm*.72){
        outliers.push({row,own,ownKm,nearest:nearest.branch,nearestKm:nearest.km});
      }
    });
    outliers.sort((a,b)=>(b.ownKm-b.nearestKm)-(a.ownKm-a.nearestKm));
    return {outliers};
  }
  function compactResponsibilityClusters(rows,options){
    options=options||{};
    const maxMoves=Number(options.maxMoves)||Math.max(3,Math.round((rows||[]).length*.05));
    const moves=[];
    const locked=new Set();
    for(let round=0;round<2&&moves.length<maxMoves;round++){
      optimizePlannedCoordinates(rows);
      const branches=buildBranchSnapshot(rows);
      const byName=new Map(branches.map(b=>[b.name,b]));
      const candidates=[];
      (rows||[]).forEach(row=>{
        if(!row||!row.centroid||locked.has(row.key)||row.coordEdited)return;
        const own=byName.get(row.plannedBranch);
        if(!own||own.missingCoord)return;
        const ownCode=branchAreaCode(own,row);
        const ownKm=haversineKm({lat:Number(own.lat),lng:Number(own.lng)},row.centroid);
        const th=thresholdForRows([row]);
        let nearest=null;
        branches.forEach(b=>{
          if(!b||b.name===own.name||b.missingCoord)return;
          if(ownCode&&branchAreaCode(b,row)!==ownCode)return;
          const d=haversineKm({lat:Number(b.lat),lng:Number(b.lng)},row.centroid);
          if(!nearest||d<nearest.km)nearest={branch:b,km:d};
        });
        if(!nearest)return;
        const gain=ownKm-nearest.km;
        const farEnough=ownKm>Math.max(12,(th.kmLimit||22)*.55);
        const clearlyCloser=gain>Math.max(4,ownKm*.24)||nearest.km<=ownKm*.62;
        if(!farEnough||!clearlyCloser)return;
        const targetEval=nearest.branch.eval||evaluateBranch(nearest.branch);
        if(targetEval.level==='critical'&&nearest.branch.wardCount>(targetEval.threshold?.wardLimit||6)+2)return;
        const projectedRows=(nearest.branch.rows||[]).concat(row);
        if(connectedRowComponents(projectedRows,.45).length!==1)return;
        const projected=Object.assign({},nearest.branch,{
          rows:projectedRows,
          wardCount:projectedRows.length,
          volumeSim:(Number(nearest.branch.volumeSim)||0)+(Number(row.volumeSim)||0),
          volGiao:(Number(nearest.branch.volGiao)||0)+(Number(row.volGiao)||0),
          volLay:(Number(nearest.branch.volLay)||0)+(Number(row.volLay)||0),
          area:(Number(nearest.branch.area)||0)+(Number(row.area)||0)
        });
        const projectedEval=evaluateBranch(projected);
        if(projectedEval.level==='critical'&&targetEval.level!=='critical')return;
        if(projectedEval.ratios?.vol>Math.max(1.35,(targetEval.ratios?.vol||0)+.38))return;
        candidates.push({row,from:own,to:nearest.branch,ownKm,nearestKm:nearest.km,gain});
      });
      candidates.sort((a,b)=>b.gain-a.gain);
      candidates.slice(0,maxMoves-moves.length).forEach(c=>{
        const r=c.row;
        locked.add(r.key);
        const oldName=r.plannedBranch;
        r.currentBranch=r.currentBranch||oldName;
        r.plannedBranch=c.to.name;
        r.branchLabel=c.to.label;
        r.coord={lat:Number(c.to.lat),lng:Number(c.to.lng)};
        r.groupCoord={lat:Number(c.to.lat),lng:Number(c.to.lng)};
        r.missingCoord=false;
        setOfficialRouteColor(r,hashColor(c.to.name));
        r.planAction='compact_reassign';
        r.autoReason=`Điều chỉnh cụm phụ trách để xã/phường ${r.ward} gần bưu cục ${c.to.label} hơn: khoảng cách ước tính giảm từ ${fmt(c.ownKm)} km còn ${fmt(c.nearestKm)} km.`;
        moves.push({ward:r.ward,from:oldName,fromLabel:c.from.label,to:c.to.name,toLabel:c.to.label,ownKm:c.ownKm,nearestKm:c.nearestKm,gain:c.gain});
      });
    }
    optimizePlannedCoordinates(rows);
    return moves;
  }
  function rowPressure(row,branch){
    if(!row||!branch||row.manualLocked||routeKeepWithBranch(row,branch))return null;
    const ev=branch.eval||evaluateBranch(branch),th=ev.threshold||thresholdForRows(branch.rows||[]);
    const center=branch.missingCoord?null:{lat:Number(branch.lat),lng:Number(branch.lng)};
    const km=center?haversineKm(center,row.centroid):999;
    const score=(ev.level==='critical'?4:ev.level==='over'?2.6:ev.level==='watch'?1.2:0)
      +Math.max(0,(ev.ratios?.area||0)-.85)*1.1
      +Math.max(0,(ev.ratios?.vol||0)-.9)*.9
      +Math.max(0,(ev.ratios?.wards||0)-.9)*.7
      +Math.max(0,(km/(th.kmLimit||20))-.62)*2.4;
    if(score<2.05)return null;
    return {row,branch,km,score,ev,th};
  }
  function globalClusterCost(rows,branchByName,facility){
    let before=0,after=0,missing=0;
    (rows||[]).forEach(row=>{
      const b=branchByName.get(row.plannedBranch);
      const own=b&&!b.missingCoord?{lat:Number(b.lat),lng:Number(b.lng)}:null;
      const w=Math.max(1,Number(row.volumeSim)||Number(row.volGiao)||0);
      if(own)before+=haversineKm(own,row.centroid)*w;
      else{before+=80*w;missing++}
      after+=haversineKm({lat:facility.lat,lng:facility.lng},row.centroid)*w;
    });
    return {before,after,missing,gain:before-after};
  }
  function remainingBranchOkAfterGlobal(rows,clusterRows){
    const moving=new Set((clusterRows||[]).map(r=>r.key));
    const sources=[...new Set((clusterRows||[]).map(r=>r.plannedBranch))];
    return sources.every(name=>{
      const remain=(rows||[]).filter(r=>r.plannedBranch===name&&!moving.has(r.key));
      if(!remain.length)return false;
      return connectedRowComponents(remain,.45).length<=1;
    });
  }
  function buildGlobalCluster(seed,candidates,usedKeys){
    const seedCode=provinceCode(seed.row.province);
    const cluster=[seed.row],seen=new Set([seed.row.key]);
    const seedBounds=geometryBounds(seed.row.geometry);
    const pool=candidates.filter(c=>{
      if(usedKeys.has(c.row.key)||seen.has(c.row.key)||c.row.manualLocked)return false;
      if(provinceCode(c.row.province)!==seedCode)return false;
      const d=haversineKm(seed.row.centroid,c.row.centroid);
      return d<=32||boundsDistanceKm(seedBounds,geometryBounds(c.row.geometry))<=1.2;
    }).sort((a,b)=>b.score-a.score);
    for(let i=0;i<pool.length&&cluster.length<7;i++){
      const item=pool[i],itemBounds=geometryBounds(item.row.geometry);
      const gap=Math.min(...cluster.map(r=>boundsDistanceKm(itemBounds,geometryBounds(r.geometry))));
      if(!isFinite(gap)||gap>.55)continue;
      const sources=new Set(cluster.concat([item.row]).map(r=>r.plannedBranch));
      if(sources.size<2&&cluster.length>=3)continue;
      cluster.push(item.row);seen.add(item.row.key);
    }
    return cluster;
  }
  function applyGlobalNetworkOptimization(rows,usedNames,options){
    options=options||{};
    const recommendations=[],warnings=[];
    let branches=buildBranchSnapshot(rows),branchByName=new Map(branches.map(b=>[b.name,b]));
    const maxOpen=Number(options.maxOpen)||Math.max(1,Math.min(2,Math.round((branches.length||1)*.035)));
    const usedKeys=new Set();
    let attempts=0;
    while(recommendations.length<maxOpen&&attempts++<3){
      branches=buildBranchSnapshot(rows);
      branchByName=new Map(branches.map(b=>[b.name,b]));
      const pressures=[];
      rows.forEach(row=>{
        if(usedKeys.has(row.key))return;
        const item=rowPressure(row,branchByName.get(row.plannedBranch));
        if(item)pressures.push(item);
      });
      pressures.sort((a,b)=>b.score-a.score||b.km-a.km);
      const pressurePool=pressures.slice(0,70);
      const seed=pressurePool.find(p=>!usedKeys.has(p.row.key));
      if(!seed)break;
      const cluster=buildGlobalCluster(seed,pressurePool,usedKeys);
      const sourceCount=new Set(cluster.map(r=>r.plannedBranch)).size;
      const vol=componentVolume(cluster),area=componentArea(cluster);
      const facility=weightedFacilityPoint(cluster);
      const th=thresholdForRows(cluster);
      const branchEval=evaluateBranch({rows:cluster,lat:facility.lat,lng:facility.lng,volumeSim:vol,area,wardCount:cluster.length,missingCoord:false});
      const cost=globalClusterCost(cluster,branchByName,facility);
      const connected=connectedRowComponents(cluster,.45).length===1;
      const canOpen=sourceCount>=2&&connected&&vol>=MIN_SPLIT_VOLUME_SIM&&branchEval.level!=='critical'&&remainingBranchOkAfterGlobal(rows,cluster)&&(cost.gain>Math.max(260,cost.before*.12)||cost.missing);
      if(!canOpen){
        cluster.forEach(r=>usedKeys.add(r.key));
        warnings.push({type:'global_review',rows:cluster,sourceCount,volumeSim:vol,area,reason:`Cụm ${cluster.map(r=>r.ward).join(', ')} có tín hiệu cần rà soát toàn mạng nhưng chưa đủ điều kiện mở mới: ${sourceCount<2?'chỉ đến từ 1 bưu cục; ':''}${!connected?'địa bàn chưa liền mạch; ':''}${vol<MIN_SPLIT_VOLUME_SIM?'volume mô phỏng dưới 400; ':''}${branchEval.level==='critical'?'cụm mới vẫn quá tải; ':''}${cost.gain<=Math.max(260,cost.before*.12)?'chưa giảm đủ quãng đường ước tính; ':''}`});
        continue;
      }
      const anchor=facility.row||cluster.slice().sort((a,b)=>(b.volumeSim||0)-(a.volumeSim||0))[0];
      const newName=uniqueBranchName(bestAnchorName(anchor),usedNames);
      const coord={lat:facility.lat,lng:facility.lng};
      const keys=new Set(cluster.map(r=>r.key));
      const sourceLabels=[...new Set(cluster.map(r=>shortName(r.plannedBranch)))];
      rows.forEach(row=>{
        if(!keys.has(row.key))return;
        row.currentBranch=row.currentBranch||row.plannedBranch;
        row.plannedBranch=newName;
        row.branchLabel=shortName(newName);
        row.coord=coord;
        row.groupCoord=coord;
        row.missingCoord=false;
        setOfficialRouteColor(row,hashColor(newName));
        row.planAction='global_open';
        row.autoReason=`Tối ưu toàn mạng 5 tỉnh: hệ thống gom cụm liền kề từ ${sourceLabels.join(', ')} để hình thành ${shortName(newName)}, giảm quãng đường vận hành ước tính cho toàn mạng từ ${fmt(cost.before)} xuống ${fmt(cost.after)} điểm-km có trọng số volume.`;
        usedKeys.add(row.key);
      });
      rows.forEach(row=>{
        if(keys.has(row.key))return;
        if(sourceLabels.some(label=>norm(label)===norm(shortName(row.plannedBranch)))){
          row.planAction=row.planAction||'scope_adjust';
          row.autoReason=row.autoReason||`Điều chỉnh phạm vi sau bước tối ưu toàn mạng; xã/phường chuyển ra ngoài được gom vào cụm mới liền kề để cân bằng volume, diện tích và khoảng cách.`;
        }
      });
      recommendations.push({type:'global_open',oldName:sourceLabels.join(' + '),oldLabel:sourceLabels.join(' + '),newName,newLabel:shortName(newName),coord,rows:cluster.slice(),anchor,facility,reason:cluster[0].autoReason,volumeSim:vol,area,sourceCount,cost});
      optimizePlannedCoordinates(rows);
    }
    assignDistinctBranchColors(rows);
    return {recommendations,warnings};
  }
  function buildRouteReviewCandidates(branches,recs,relocs){
    const acted=new Set();
    (recs||[]).forEach(r=>{acted.add(norm(r.newName));});
    (relocs||[]).forEach(r=>{acted.add(norm(r.newName));});
    return (branches||[]).map(b=>{
      const ev=b.eval||evaluateBranch(b),th=ev.threshold||thresholdForRows(b.rows||[]);
      const volRatio=ev.ratios?.vol||0,areaRatio=ev.ratios?.area||0,kmRatio=ev.ratios?.km||0,wardRatio=ev.ratios?.wards||0;
      const corridor=(b.wardCount>=3&&areaRatio>.9)||(b.wardCount>=4&&kmRatio>.55)||(volRatio>2.4&&b.wardCount>=2);
      if(acted.has(norm(b.name))||ev.level==='normal'||!corridor)return null;
      const reasons=[];
      if(volRatio>1)reasons.push(`volume mô phỏng ${fmt(b.volumeSim)} cao hơn ngưỡng ${fmt(th.volLimit)}`);
      if(areaRatio>1)reasons.push(`diện tích ${fmt(b.area)} km² vượt ${fmt(th.areaLimit)} km²`);
      if(kmRatio>.55)reasons.push(`cụm có biên tuyến rộng, cần đo theo đường thực tế`);
      if(wardRatio>1)reasons.push(`${b.wardCount} xã/phường trong một cụm`);
      const score=volRatio*.7+areaRatio*1.15+kmRatio*1.1+wardRatio*.55;
      return {branch:b,status:ev.status,score,reasons};
    }).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,12);
  }
  function suggestSplit(branch,usedNames){
    const ev=branch.eval||evaluateBranch(branch);
    if(!branch.rows||branch.rows.length<4||ev.level!=='critical')return null;
    const th=ev.threshold,center={lat:Number(branch.lat)||0,lng:Number(branch.lng)||0};
    const severeArea=ev.ratios.area>=1.85;
    const severeDistance=ev.ratios.km>=1.45;
    const severeWards=branch.wardCount>=th.wardLimit+3;
    const geoPressure=severeArea||severeDistance||severeWards;
    const severeVolume=ev.ratios.vol>=3.2&&branch.wardCount>=6&&geoPressure;
    const enoughPressure=(severeArea&&severeDistance)||(severeWards&&Math.max(ev.ratios.area||0,ev.ratios.km||0)>=1.15)||severeVolume;
    if(!enoughPressure)return null;
    const enriched=branch.rows.map(r=>{
      const dist=haversineKm(center,r.centroid),vol=Number(r.volumeSim)||0,area=Number(r.area)||0;
      const score=(dist/(th.kmLimit||1))*1.15+(vol/(th.volLimit||1))*1.35+(area/(th.areaLimit||1))*.85;
      return {row:r,dist,vol,area,score};
    }).sort((a,b)=>b.score-a.score);
    let anchor=enriched[0];
    if(!anchor)return null;
    const anchorCoord=anchor.row.centroid;
    const near=enriched.map(x=>Object.assign({},x,{toAnchor:haversineKm(anchorCoord,x.row.centroid)}))
      .filter(x=>x.row.key===anchor.row.key||x.toAnchor<=Math.max(8,th.kmLimit*.55)||x.dist>th.kmLimit*.9)
      .sort((a,b)=>a.toAnchor-b.toAnchor||b.score-a.score);
    const picked=[];
    let vol=0,area=0;
    near.forEach(x=>{
      if(picked.length&&picked.length>=Math.max(1,Math.ceil(branch.rows.length/2)))return;
      const nextVol=vol+x.vol,nextArea=area+x.area;
      const allow=(!picked.length)||nextVol<=th.volLimit*1.35||nextArea<=th.areaLimit*1.35||x.dist>th.kmLimit*1.1;
      if(allow){picked.push(x.row);vol=nextVol;area=nextArea;}
    });
    if(!picked.length)picked.push(anchor.row);
    if(picked.length>=branch.rows.length&&branch.rows.length>1)picked.splice(Math.max(1,Math.floor(branch.rows.length/2)));
    if(picked.length<2||branch.rows.length-picked.length<2)return null;
    let newRows=picked.slice();
    let keepRows=branch.rows.filter(r=>!newRows.some(x=>x.key===r.key));
    let splitNote='';
    const protectedRows=newRows.filter(r=>routeKeepWithBranch(r,branch));
    if(protectedRows.length&&newRows.length-protectedRows.length>=2){
      newRows=newRows.filter(r=>!protectedRows.some(x=>x.key===r.key));
      keepRows=keepRows.concat(protectedRows);
      splitNote='Một số xã/phường được khóa theo tuyến vận hành thực tế nên vẫn giữ với bưu cục hiện hữu, không tự chuyển theo khoảng cách tọa độ.';
    }
    const current=branch.missingCoord?null:{lat:Number(branch.lat),lng:Number(branch.lng)};
    const newHasNameMatch=newRows.some(r=>rowMatchesBranchName(r,branch));
    const keepHasNameMatch=keepRows.some(r=>rowMatchesBranchName(r,branch));
    if(newHasNameMatch&&!keepHasNameMatch&&newRows.length>=2&&keepRows.length>=2){
      const oldPicked=newRows;
      newRows=keepRows;
      keepRows=oldPicked;
      anchor=enriched.filter(x=>newRows.some(r=>r.key===x.row.key)).sort((a,b)=>b.score-a.score)[0]||{row:newRows[0]};
      splitNote=`Cụm có xã/phường trùng tên ${branch.label} được giữ lại cho bưu cục hiện hữu; hệ thống mở bưu cục mới cho phần còn lại để tránh đặt marker/tên bưu cục sai địa bàn.`;
    }
    if(current&&newRows.length>=2&&keepRows.length>=2){
      const currentInNew=!!pointInRows(current,newRows);
      const currentInKeep=!!pointInRows(current,keepRows);
      if(!splitNote&&currentInNew&&!currentInKeep){
        const oldPicked=newRows;
        newRows=keepRows;
        keepRows=oldPicked;
        anchor=enriched.filter(x=>newRows.some(r=>r.key===x.row.key)).sort((a,b)=>b.score-a.score)[0]||{row:newRows[0]};
        splitNote=`Tọa độ hiện hữu của ${branch.label} nằm trong cụm giữ lại, nên hệ thống không chuyển marker cũ sang vùng khác mà mở bưu cục mới cho phần còn lại.`;
      }
    }
    vol=newRows.reduce((s,r)=>s+(Number(r.volumeSim)||0),0);
    area=newRows.reduce((s,r)=>s+(Number(r.area)||0),0);
    if(vol<MIN_SPLIT_VOLUME_SIM)return null;
    const facility=weightedFacilityPoint(newRows);
    const namingRow=facility.row||anchor.row;
    const newName=uniqueBranchName(bestAnchorName(namingRow),usedNames);
    const reason=[
      `${ev.status}: ${ev.reasons[0]||'vượt ngưỡng kiểm soát'}`,
      `Tách cụm quanh ${anchor.row.ward} vì điểm này có điểm tải/xa cao nhất trong cụm.`,
      splitNote,
      `Điểm đặt BC đề xuất tính theo Facility Location có trọng số volume và chỉ dùng như vị trí tham khảo; ${facility.constrained?'đã khóa điểm vào bên trong địa bàn phụ trách, ':''}cần đối chiếu tuyến đường thực tế trước khi chốt.`
    ].filter(Boolean).join(' ');
    const priority=(ev.ratios.area*1.2)+(ev.ratios.km*1.1)+(ev.ratios.vol*.65)+(branch.wardCount/(th.wardLimit||1))*.7;
    return {type:'open',oldName:branch.name,oldLabel:branch.label,newName,newLabel:shortName(newName),coord:{lat:facility.lat,lng:facility.lng},rows:newRows,keepRows,anchor:anchor.row,facility,reason,volumeSim:vol,area,priority};
  }
  function suggestRelocation(branch,usedNames){
    const ev=branch.eval||evaluateBranch(branch);
    if(!branch.rows||!branch.rows.length)return null;
    const facility=weightedFacilityPoint(branch.rows);
    if(!facility||!isFinite(Number(facility.lat))||!isFinite(Number(facility.lng)))return null;
    const current=branch.missingCoord?null:{lat:Number(branch.lat),lng:Number(branch.lng)};
    const inside=current?branchCoordinateInsideArea(branch):false;
    const moveKm=current?haversineKm(current,{lat:facility.lat,lng:facility.lng}):999;
    const th=ev.threshold||thresholdForRows(branch.rows);
    const outside=!!current&&!inside;
    const missing=branch.missingCoord;
    const protectedScope=branch.rows.some(r=>routeKeepWithBranch(r,branch));
    const severeDistance=ev.maxKm>(th.kmLimit||1)*1.25&&moveKm>Math.max(2.5,(th.kmLimit||1)*.12);
    const severeArea=ev.ratios.area>1.35&&moveKm>3.5;
    const severeWards=branch.wardCount>(th.wardLimit||6)+2&&moveKm>4;
    const scopeAdjusted=branch.rows.some(r=>r.planAction==='scope_adjust');
    const scopeShift=scopeAdjusted&&moveKm>Math.max(4,(th.kmLimit||20)*.18);
    if(!(missing||outside||severeDistance||severeArea||severeWards||scopeShift))return null;
    const namingRow=facility.row||branch.rows.slice().sort((a,b)=>(b.volumeSim||0)-(a.volumeSim||0))[0];
    const baseName=protectedScope?branch.name:bestAnchorName(namingRow);
    const newName=protectedScope||norm(baseName)===norm(branch.name)?branch.name:uniqueBranchName(baseName,usedNames);
    const reasons=[];
    if(missing)reasons.push('Bưu cục hiện hữu chưa có tọa độ tin cậy trong dữ liệu gốc.');
    if(outside)reasons.push('Tọa độ hiện tại nằm ngoài phạm vi xã/phường đang phụ trách.');
    if(severeDistance)reasons.push(`Điểm xa nhất ước tính ${fmt(ev.maxKm)} km, cao hơn ngưỡng ${fmt(th.kmLimit)} km.`);
    if(severeArea)reasons.push(`Diện tích phụ trách ${fmt(branch.area)} km² rộng hơn ngưỡng vận hành ${fmt(th.areaLimit)} km².`);
    if(severeWards)reasons.push(`Số xã/phường phụ trách ${branch.wardCount} cao hơn mức kiểm soát ${th.wardLimit}.`);
    if(scopeShift)reasons.push('Sau khi tách cụm, tọa độ hiện hữu không còn nằm gần trung tâm vùng phụ trách còn lại.');
    if(protectedScope)reasons.push('Tên bưu cục hiện hữu được giữ theo tuyến vận hành thực tế, không đổi tên theo điểm đặt tham khảo.');
    reasons.push(`Điểm đặt đề xuất nằm trong ${namingRow?.ward||'cụm phụ trách'}, tính bằng Facility Location có trọng số volume và chỉ là vị trí tham khảo. Cần đối chiếu tuyến đường thực tế, cầu/phà và mặt bằng trước khi chốt.`);
    const priority=(missing?4:0)+(outside?5:0)+(scopeShift?2.4:0)+(ev.ratios.km*1.35)+(ev.ratios.area*.9)+(ev.ratios.vol*.55)+(moveKm/8);
    return {type:'relocate',oldName:branch.name,oldLabel:branch.label,newName,newLabel:shortName(newName),coord:{lat:facility.lat,lng:facility.lng},rows:branch.rows.slice(),anchor:namingRow,facility,reason:reasons.join(' '),moveKm,volumeSim:branch.volumeSim,area:branch.area,priority};
  }
  function currentMapRows(){
    let features=[];
    try{if(typeof all!=='undefined'&&Array.isArray(all))features=all}catch(e){}
    if(!features.length&&window.GHN_GEOJSON&&Array.isArray(window.GHN_GEOJSON.features))features=window.GHN_GEOJSON.features;
    return features.map((f,i)=>{
      const p=f.properties||{},ward=String(p.ward||p.ward_name||p.name||'').trim(),branch=String(p.branch||p.bc_name||'Chưa gán').trim();
      if(!ward||!branch||!f.geometry)return null;
      const centroid=centroidOfGeometry(f.geometry),branchCoord=branchCoordFromName(branch),coord=branchCoord||centroid;
      const volGiao=numberVal(p.vol_giao??p.volume_giao??p.volGiao??0),volLay=numberVal(p.vol_lay??p.volume_lay??p.volLay??0);
      const row={key:'map-'+i+'-'+norm(ward),rowNumber:i+1,sourceName:'Dữ liệu bản đồ hiện tại',province:String(p.province||'').trim(),ward,currentBranch:branch,plannedBranch:branch,branchLabel:shortName(branch),proposedCoordRaw:'',currentCoordRaw:'',currentCoord:branchCoord||null,coord,groupCoord:branchCoord||null,geometry:f.geometry,centroid,area:numberVal(p.area),volGiao,volLay,volQuyDoi:volGiao+(volLay/4),volumeSim:(volGiao+volLay)*1.3,volume:volGiao,volumeAfter:(volGiao+volLay)*1.3,oldWard:String(p.old_ward||'').trim(),routeCount:numberVal(p.route_count||p.routeCount||0),rawCurrentBranch:branch,color:hashColor(branch),missingCoord:!branchCoord};
      setOfficialRouteColor(row,row.color);
      return row;
    }).filter(Boolean);
  }
  function rowsAsCurrentBase(rows){
    return (rows||[]).map(row=>{
      const r=cloneRow(row),sameBranch=norm(row.currentBranch)===norm(row.plannedBranch),coord=row.currentCoord||(sameBranch?(row.groupCoord||row.coord):null);
      r.plannedBranch=row.currentBranch||row.plannedBranch;
      r.branchLabel=shortName(r.plannedBranch);
      r.coord=coord;r.groupCoord=coord;r.missingCoord=!coord;setOfficialRouteColor(r,hashColor(r.plannedBranch));
      return r;
    });
  }
  function rowsForAutoPlan(){
    if(state.uploadRows&&state.uploadRows.length)return rowsAsCurrentBase(state.uploadRows);
    if(state.rows&&state.rows.length&&!state.autoPlan)return state.rows.map(cloneRow);
    return currentMapRows();
  }
  function createAutoPlan(baseRows){
    cache.branchCoords.clear();
    baseRows.forEach(r=>{if(r.groupCoord)cache.branchCoords.set(r.plannedBranch,r.groupCoord)});
    const before=buildBranches(baseRows.map(cloneRow));
    const planned=baseRows.map(cloneRow);
    let used=new Set(before.map(b=>norm(b.name)));
    const compactMoves=compactResponsibilityClusters(planned,{maxMoves:Math.max(3,Math.min(14,Math.round(planned.length*.035)))});
    const manualAdjustments=applyManualBtrRules(planned);
    manualAdjustments.forEach(x=>{if(x&&x.name)used.add(norm(x.name))});
    const manualNames=new Set(manualAdjustments.filter(x=>x.locked).map(x=>norm(x.name)));
    cache.branchCoords.clear();
    planned.forEach(r=>{if(r.groupCoord)cache.branchCoords.set(r.plannedBranch,r.groupCoord)});
    const afterTransfer=buildBranches(planned);
    const relocationCandidates=afterTransfer
      .filter(b=>!manualNames.has(norm(b.name)))
      .map(b=>suggestRelocation(b,used))
      .filter(Boolean)
      .sort((a,b)=>b.priority-a.priority);
    const maxRelocate=Math.max(1,Math.min(4,Math.round(before.length*.06)));
    const relocations=relocationCandidates.slice(0,maxRelocate);
    relocations.forEach(s=>{
      planned.forEach(r=>{
        if(r.plannedBranch!==s.oldName)return;
        r.currentBranch=r.currentBranch||s.oldName;
        r.plannedBranch=s.newName;r.branchLabel=s.newLabel;r.coord=s.coord;r.groupCoord=s.coord;r.missingCoord=false;setOfficialRouteColor(r,hashColor(s.newName));r.autoReason=s.reason;r.planAction='relocate';
      });
    });
    cache.branchCoords.clear();
    planned.forEach(r=>{if(r.groupCoord)cache.branchCoords.set(r.plannedBranch,r.groupCoord)});
    const afterRelocate=buildBranches(planned);
    used=new Set(afterRelocate.map(b=>norm(b.name)));
    const routeCandidates=[];
    afterRelocate.forEach(b=>{
      if(branchHasManualRule(b))return;
      const s=suggestRouteCorridorSplit(b,used);
      if(s)routeCandidates.push(s);
    });
    const routeOldNames=new Set(routeCandidates.map(r=>r.oldName));
    const candidates=routeCandidates.concat(afterRelocate.filter(b=>!routeOldNames.has(b.name)&&!branchHasManualRule(b)).map(b=>suggestSplit(b,used)).filter(Boolean)).sort((a,b)=>b.priority-a.priority);
    const maxAdd=Math.max(1,Math.min(5,Math.round(before.length*.08)));
    const recs=candidates.slice(0,maxAdd);
    recs.forEach(s=>{
      const keys=new Set(s.rows.map(r=>r.key));
      planned.forEach(r=>{
        if(!keys.has(r.key))return;
        r.currentBranch=r.currentBranch||r.plannedBranch;
        r.plannedBranch=s.newName;r.branchLabel=s.newLabel;r.coord=s.coord;r.groupCoord=s.coord;r.missingCoord=false;setOfficialRouteColor(r,hashColor(s.newName));r.autoReason=s.reason;r.planAction='open';
      });
      planned.forEach(r=>{
        if(r.plannedBranch!==s.oldName)return;
        r.planAction=r.planAction||'scope_adjust';
        r.autoReason=r.autoReason||`Điều chỉnh phạm vi sau khi tách một cụm khỏi ${s.oldLabel}; bưu cục hiện hữu giữ khu vực có tọa độ đang đặt để tránh marker nằm sai vùng phụ trách.`;
      });
    });
    relocateAffectedBranches(planned,recs);
    const topologyResult=splitDisconnectedResponsibilities(planned,used);
    const topologySplits=topologyResult.recommendations||[];
    const smallTransfers=(topologyResult.smallTransfers||[]).concat(enforceMinimumSplitVolume(planned));
    used=new Set(planned.map(r=>norm(r.plannedBranch)).filter(Boolean));
    const globalResult=applyGlobalNetworkOptimization(planned,used,{maxOpen:Math.max(1,Math.min(2,Math.round(before.length*.035)))});
    const globalOptimizations=globalResult.recommendations||[];
    const globalWarnings=globalResult.warnings||[];
    const allRecs=filterLiveRecommendations(recs.concat(topologySplits).concat(globalOptimizations),planned);
    cache.branchCoords.clear();
    planned.forEach(r=>{if(r.groupCoord)cache.branchCoords.set(r.plannedBranch,r.groupCoord)});
    assignDistinctBranchColors(planned);
    const after=buildBranches(planned);
    const routeReviews=buildRouteReviewCandidates(after,allRecs,relocations);
    const globalAudit=auditSimulation(planned,after);
    return {before,after,planned,recommendations:allRecs,relocations,manualAdjustments,compactMoves,smallTransfers,topologySplits,globalOptimizations,globalWarnings,routeReviews,globalAudit,skipped:candidates.length-recs.length,skippedRelocations:relocationCandidates.length-relocations.length,maxAdd,maxRelocate,phases:['Đọc dữ liệu hiện hữu','Đồng bộ tên/volume/tọa độ mới','Điều chuyển xã/phường lân cận','Áp rule vận hành đã rà','Di dời bưu cục lệch tâm','Mở mới cục bộ khi vẫn quá tải','Tối ưu toàn mạng 5 tỉnh','Tô màu theo bưu cục tiếp giáp','Kiểm tra toàn vùng trước khi hiển thị']};
  }
  function relocateAffectedBranches(rows,recs){
    const names=[...new Set((recs||[]).map(r=>r.oldName).filter(Boolean))];
    names.forEach(name=>{
      const remain=(rows||[]).filter(r=>r.plannedBranch===name);
      if(!remain.length)return;
      const current=branchCoordFromName(name)||remain.find(r=>r.currentCoord)?.currentCoord||remain.find(r=>r.groupCoord)?.groupCoord||remain.find(r=>r.coord)?.coord||null;
      if(current&&pointInRows(current,remain))return;
      const facility=weightedFacilityPoint(remain);
      if(!facility||!isFinite(Number(facility.lat))||!isFinite(Number(facility.lng)))return;
      const coord={lat:facility.lat,lng:facility.lng};
      const note='Điều chỉnh tọa độ mô phỏng để marker nằm trong phần địa bàn còn phụ trách sau khi tách/mở mới.';
      remain.forEach(r=>{
        r.coord=coord;r.groupCoord=coord;r.missingCoord=false;r.coordEdited=true;
        r.planAction=r.planAction||'coord_adjust';
        r.autoReason=r.autoReason||note;
      });
    });
  }
  function renderAutoPlan(){
    const el=q('#v132AutoResult');if(!el)return;
    const plan=state.autoPlan;
    if(!plan){el.innerHTML='<div class="v132-auto-empty">Bấm “Tự chạy gợi ý quy hoạch” để hệ thống gom/tách bưu cục theo volume mô phỏng, diện tích và khoảng cách ước tính.</div>';return}
    const statusCount=plan.after.reduce((m,b)=>{const k=b.eval?.status||'Bình thường';m[k]=(m[k]||0)+1;return m},{});
    const liveByName=new Map((plan.after||[]).map(b=>[norm(b.name),b]));
    const liveNewCount=(plan.after||[]).filter(b=>b.planKind==='new').length;
    const liveRelocateCount=(plan.after||[]).filter(b=>b.planKind==='relocate').length;
    const recs=(plan.recommendations||[]).filter(r=>r.type!=='global_open').map(r=>({r,live:liveByName.get(norm(r.newName))})).filter(x=>x.live&&x.live.planKind==='new').slice(0,18).map(({r,live})=>`<div class="v132-auto-rec new">
      <div><b>${esc(live.label||r.newLabel)}</b><small>Tách từ ${esc(r.oldLabel)} · ${live.rows.length} xã/phường</small></div>
      <div class="v132-auto-metrics"><span>Vol mô phỏng ${fmt(live.volumeSim)}</span><span>${fmt(live.area)} km²</span></div>
      <p>${esc(live.planReason||r.reason)}</p>
      <div class="v132-auto-wards">${live.rows.map(x=>esc(x.ward)).join(' · ')}</div>
    </div>`).join('');
    const globalRecs=(plan.globalOptimizations||[]).map(r=>({r,live:liveByName.get(norm(r.newName))})).filter(x=>x.live&&x.live.planKind==='new').slice(0,10).map(({r,live})=>`<div class="v132-auto-rec new">
      <div><b>${esc(live.label||r.newLabel)}</b><small>Tối ưu toàn mạng · ${r.sourceCount||2} nguồn BC · ${live.rows.length} xã/phường</small></div>
      <div class="v132-auto-metrics"><span>Vol mô phỏng ${fmt(live.volumeSim)}</span><span>${fmt(live.area)} km²</span><span>Giảm ${fmt((r.cost&&r.cost.gain)||0)} điểm-km</span></div>
      <p>${esc(live.planReason||r.reason)}</p>
      <div class="v132-auto-wards">${live.rows.map(x=>esc(x.ward)).join(' · ')}</div>
    </div>`).join('');
    const globalWarnings=(plan.globalWarnings||[]).slice(0,8).map(r=>`<div class="v132-auto-rec review">
      <div><b>Cụm cần rà soát</b><small>Tối ưu toàn mạng chưa tự mở</small></div>
      <div class="v132-auto-metrics"><span>Vol mô phỏng ${fmt(r.volumeSim)}</span><span>${fmt(r.area)} km²</span></div>
      <p>${esc(r.reason)}</p>
      <div class="v132-auto-wards">${(r.rows||[]).map(x=>esc(x.ward)).join(' · ')}</div>
    </div>`).join('');
    const relocs=(plan.relocations||[]).map(r=>({r,live:liveByName.get(norm(r.newName))})).filter(x=>x.live&&x.live.planKind==='relocate').slice(0,18).map(({r,live})=>`<div class="v132-auto-rec relocate">
      <div><b>${esc(live.label||r.newLabel)}</b><small>Di dời từ ${esc(r.oldLabel)} · ${live.rows.length} xã/phường</small></div>
      <div class="v132-auto-metrics"><span>Tọa độ mới ${fmt(live.lat)}, ${fmt(live.lng)}</span><span>Dịch chuyển ${fmt(r.moveKm)} km</span></div>
      <p>${esc(live.planReason||r.reason)}</p>
      <div class="v132-auto-wards">${live.rows.map(x=>esc(x.ward)).join(' · ')}</div>
    </div>`).join('');
    const manuals=(plan.manualAdjustments||[]).map(r=>({r,live:liveByName.get(norm(r.name))})).filter(x=>x.live).slice(0,12).map(({r,live})=>`<div class="v132-auto-rec manual">
      <div><b>${esc(live.label||r.label)}</b><small>Rule vận hành · ${live.rows.length} xã/phường</small></div>
      <div class="v132-auto-metrics"><span>Vol mô phỏng ${fmt(live.volumeSim)}</span><span>${fmt(live.area)} km²</span></div>
      <p>${esc(live.planReason||r.reason)}</p>
      <div class="v132-auto-wards">${live.rows.map(x=>esc(x.ward)).join(' · ')}</div>
    </div>`).join('');
    const compact=(plan.compactMoves||[]).slice(0,18).map(r=>`<div class="v132-auto-rec compact">
      <div><b>${esc(r.ward)}</b><small>${esc(r.fromLabel)} → ${esc(r.toLabel)}</small></div>
      <div class="v132-auto-metrics"><span>Giảm ${fmt(r.gain)} km</span><span>${fmt(r.ownKm)} km → ${fmt(r.nearestKm)} km</span></div>
      <p>Hệ thống gom lại xã/phường này về bưu cục cùng khu vực gần hơn để cụm phụ trách liền mạch, giảm quãng đường xuất phát của NVPTTT.</p>
    </div>`).join('');
    const smallTransfers=(plan.smallTransfers||[]).slice(0,18).map(r=>`<div class="v132-auto-rec transfer">
      <div><b>${esc(r.toLabel)}</b><small>Nhập từ ${esc(r.fromLabel)} · ${r.rows.length} xã/phường</small></div>
      <div class="v132-auto-metrics"><span>Vol mô phỏng ${fmt(r.volumeSim)}</span><span>${fmt(r.area)} km²</span></div>
      <p>${esc(r.reason)}</p>
      <div class="v132-auto-wards">${r.rows.map(x=>esc(x.ward)).join(' · ')}</div>
    </div>`).join('');
    const reviews=(plan.routeReviews||[]).slice(0,12).map(r=>`<div class="v132-auto-rec review">
      <div><b>${esc(r.branch.label)}</b><small>${esc(r.status)} · ${r.branch.wardCount} xã/phường</small></div>
      <div class="v132-auto-metrics"><span>Vol mô phỏng ${fmt(r.branch.volumeSim)}</span><span>${fmt(r.branch.area)} km²</span></div>
      <p>${esc((r.reasons||[]).join('; ')||'Cần đối chiếu tuyến thực tế trước khi chốt phạm vi phụ trách.')}</p>
      <div class="v132-auto-wards">${r.branch.rows.map(x=>esc(x.ward)).join(' · ')}</div>
    </div>`).join('');
    const phaseHtml=(plan.phases||[]).map((x,i)=>`<span>${i+1}. ${esc(x)}</span>`).join('');
    el.innerHTML=`<div class="v132-auto-grid">
      <div class="v132-auto-card"><span>BC trước</span><b>${plan.before.length}</b></div>
      <div class="v132-auto-card"><span>BC sau mô phỏng</span><b>${plan.after.length}</b></div>
      <div class="v132-auto-card hot"><span>Đề xuất mở thêm</span><b>${liveNewCount}</b></div>
      <div class="v132-auto-card move"><span>Đề xuất di dời</span><b>${liveRelocateCount}</b></div>
      <div class="v132-auto-card"><span>Không tách & nhập cụm</span><b>${(plan.smallTransfers||[]).length}</b></div>
      <div class="v132-auto-card"><span>Rule vận hành</span><b>${(plan.manualAdjustments||[]).length}</b></div>
      <div class="v132-auto-card hot"><span>Tối ưu toàn mạng</span><b>${(plan.globalOptimizations||[]).length}</b></div>
      <div class="v132-auto-card"><span>Còn quá tải</span><b>${(statusCount['Quá tải']||0)+(statusCount['Quá tải nghiêm trọng']||0)}</b></div>
    </div>
    <div class="v132-auto-statuses">${plan.after.slice(0,10).map(b=>`<span class="${b.eval?.level||'normal'}">${esc(b.label)}: ${esc(b.eval?.status||'Bình thường')}</span>`).join('')}</div>
    <div class="v132-auto-title">Trình tự xử lý mô phỏng</div>
    <div class="v132-auto-statuses">${phaseHtml||'<span>Đồng bộ dữ liệu → điều chuyển → di dời → mở mới → kiểm tra toàn vùng</span>'}</div>
    <div class="v132-auto-title">1. Điều chuyển xã/phường lân cận trước</div>
    ${compact||'<div class="v132-auto-empty">Chưa phát hiện xã/phường cần chuyển về bưu cục cùng khu vực gần hơn theo khoảng cách ước tính.</div>'}
    <div class="v132-auto-title">Điều chỉnh theo rule vận hành</div>
    ${manuals||'<div class="v132-auto-empty">Chưa có rule vận hành riêng được áp dụng.</div>'}
    <div class="v132-auto-title">2. Đề xuất di dời / chỉnh vị trí</div>
    ${relocs||'<div class="v132-auto-empty">Chưa phát hiện bưu cục cần di dời theo tọa độ, khoảng cách và vùng phụ trách hiện tại.</div>'}
    <div class="v132-auto-title">3. Mở mới sau cùng khi vẫn quá tải</div>
    ${recs||'<div class="v132-auto-empty">Chưa cần mở thêm theo ngưỡng hiện tại. Các bưu cục đang ở mức có thể kiểm soát.</div>'}
    <div class="v132-auto-title">4. Tối ưu toàn mạng 5 tỉnh</div>
    ${globalRecs||'<div class="v132-auto-empty">Chưa phát hiện cụm liền kề từ nhiều bưu cục đủ điều kiện mở mới toàn mạng.</div>'}
    ${globalWarnings||''}
    <div class="v132-auto-title">Không đủ 400 nên nhập về cụm liền kề</div>
    ${smallTransfers||'<div class="v132-auto-empty">Không có cụm nhỏ nào bị chặn tách theo ngưỡng volume 400.</div>'}
    <div class="v132-auto-title">Cần rà tuyến thực tế</div>
    ${reviews||'<div class="v132-auto-empty">Chưa phát hiện thêm cụm kéo dài hoặc quá tải cần khảo sát đường thực tế.</div>'}
    ${plan.skipped>0?`<div class="v132-auto-empty">Có thêm ${plan.skipped} cụm bị cảnh báo nhưng chưa đề xuất mở mới ngay vì đang vượt ngưỡng nhẹ hơn hoặc cần kiểm tra vận hành thực tế trước.</div>`:''}
    ${plan.skippedRelocations>0?`<div class="v132-auto-empty">Có thêm ${plan.skippedRelocations} vị trí cần kiểm tra nhưng chưa đưa vào danh sách ưu tiên để tránh đề xuất di dời quá nhiều cùng lúc.</div>`:''}
    <div class="v132-auto-note">Đây là mô phỏng hỗ trợ quyết định, không ghi đè dữ liệu gốc. Khoảng cách đang ước tính theo tọa độ polygon, chưa thay thế khảo sát đường, cầu và mặt bằng thực tế.</div>`;
  }
  function runAutoPlanning(){
    const baseRows=rowsForAutoPlan();
    if(!baseRows.length){alert('Chưa có dữ liệu để tự chạy quy hoạch. Vui lòng upload Excel hoặc mở dữ liệu bản đồ trước.');return}
    const baseSource=String((state.uploadRows&&state.uploadRows.length?state.sourceName:'')||'Dữ liệu bản đồ hiện tại').replace(/\s*·\s*Tự chạy gợi ý quy hoạch.*$/,'');
    const token=++autoRunToken;
    const steps=['Đọc dữ liệu','Đồng bộ tên bưu cục và volume mới','Tính volume mô phỏng','Đánh giá bưu cục hiện hữu','Điều chuyển xã/phường','Di dời bưu cục','Đề xuất mở mới','Tính vị trí tối ưu','Kiểm tra tổng thể toàn vùng','Xuất kết quả lên bản đồ'];
    showLoading(true,'Đang đọc dữ liệu quy hoạch...',steps,0);
    setTimeout(()=>{
      if(token!==autoRunToken){showLoading(false);return}
      try{
        showLoading(true,'Đang tính mô phỏng quy hoạch...',steps,4);
        const plan=createAutoPlan(baseRows);
        if(token!==autoRunToken)return;
        showLoading(true,'Đang xuất kết quả lên bản đồ...',steps,9);
        state.autoPlan={before:plan.before,after:plan.after,recommendations:plan.recommendations,relocations:plan.relocations,manualAdjustments:plan.manualAdjustments,compactMoves:plan.compactMoves,smallTransfers:plan.smallTransfers,topologySplits:plan.topologySplits,globalOptimizations:plan.globalOptimizations,globalWarnings:plan.globalWarnings,routeReviews:plan.routeReviews,globalAudit:plan.globalAudit,phases:plan.phases,skipped:plan.skipped,skippedRelocations:plan.skippedRelocations,maxAdd:plan.maxAdd,maxRelocate:plan.maxRelocate,source:baseSource,generatedAt:new Date().toISOString()};
        renderSimulation(plan.planned,[],baseSource+' · Tự chạy gợi ý quy hoạch',state.aliasCount);
        state.autoPlan={before:plan.before,after:state.branches,recommendations:plan.recommendations,relocations:plan.relocations,manualAdjustments:plan.manualAdjustments,compactMoves:plan.compactMoves,smallTransfers:plan.smallTransfers,topologySplits:plan.topologySplits,globalOptimizations:plan.globalOptimizations,globalWarnings:plan.globalWarnings,routeReviews:buildRouteReviewCandidates(state.branches,plan.recommendations,plan.relocations),globalAudit:state.audit,phases:plan.phases,skipped:plan.skipped,skippedRelocations:plan.skippedRelocations,maxAdd:plan.maxAdd,maxRelocate:plan.maxRelocate,source:baseSource,generatedAt:new Date().toISOString()};
        renderAutoPlan();
      }catch(err){alert('Không tự chạy được gợi ý quy hoạch: '+(err&&err.message?err.message:err))}
      finally{showLoading(false)}
    },80);
  }
  function buildBranches(rows){
    const groups=new Map();
    rows.forEach(row=>{
      if(!groups.has(row.plannedBranch))groups.set(row.plannedBranch,{name:row.plannedBranch,label:row.branchLabel,rows:[],color:row.color,volGiao:0,volLay:0,volQuyDoi:0,volumeSim:0,volume:0,volumeAfter:0,area:0,routeCount:0,missingCoord:false});
      const b=groups.get(row.plannedBranch);
      b.rows.push(row);b.volGiao+=row.volGiao;b.volLay+=row.volLay;b.volQuyDoi+=row.volQuyDoi;b.volumeSim+=(row.volumeSim||((row.volGiao+row.volLay)*1.3));b.volume+=row.volGiao;b.volumeAfter+=row.volumeAfter;b.area+=row.area;b.routeCount+=row.routeCount||0;
      if(row.groupCoord&&!cache.branchCoords.has(row.plannedBranch))cache.branchCoords.set(row.plannedBranch,row.groupCoord);
    });
    groups.forEach(b=>{
      const lp=clusterLabelPoint(b.rows);b.labelLat=lp.lat;b.labelLng=lp.lng;
      const coord=cache.branchCoords.get(b.name);
      if(coord){b.lat=coord.lat;b.lng=coord.lng}
      else{b.lat=lp.lat;b.lng=lp.lng;b.missingCoord=true}
      b.wardCount=b.rows.length;
      b.planKind=branchPlanKind(b);
      b.hasChanged=b.planKind!=='current';
      b.planType=branchPlanType(b);
      b.planReason=branchReason(b);
      b.coordText=coordLabel(b.lat,b.lng);
      b.eval=evaluateBranch(b);
    });
    return Array.from(groups.values()).sort((a,b)=>b.volumeSim-a.volumeSim);
  }
  function rowResponsibilityKey(row){
    return [norm(row.province||''),norm(row.ward||''),norm(row.oldWard||''),Math.round((row.centroid?.lat||0)*10000),Math.round((row.centroid?.lng||0)*10000)].join('|');
  }
  function nearbyChangedBranches(branches){
    const pairs=[];
    const list=(branches||[]).filter(b=>b&&!b.missingCoord&&isFinite(Number(b.lat))&&isFinite(Number(b.lng)));
    for(let i=0;i<list.length;i++){
      for(let j=i+1;j<list.length;j++){
        const a=list[i],b=list[j];
        if(!(a.hasChanged||b.hasChanged||branchLooksNew(a)||branchLooksNew(b)))continue;
        const codeA=branchAreaCode(a,a.rows&&a.rows[0]),codeB=branchAreaCode(b,b.rows&&b.rows[0]);
        if(codeA&&codeB&&codeA!==codeB)continue;
        const km=haversineKm({lat:Number(a.lat),lng:Number(a.lng)},{lat:Number(b.lat),lng:Number(b.lng)});
        if(km<.55)pairs.push({a,b,km});
      }
    }
    return pairs.sort((x,y)=>x.km-y.km);
  }
  function auditSimulation(rows,branches){
    const buckets=new Map();
    (rows||[]).forEach(row=>{
      const k=rowResponsibilityKey(row);
      if(!buckets.has(k))buckets.set(k,{rows:[],branches:new Set(),label:row.ward});
      const item=buckets.get(k);
      item.rows.push(row);item.branches.add(row.plannedBranch);
    });
    const overlaps=[];
    buckets.forEach(item=>{
      if(item.branches.size>1)overlaps.push({label:item.label,branches:[...item.branches],rows:item.rows});
    });
    const missingMoved=(branches||[]).filter(b=>b.hasChanged&&b.missingCoord);
    const outsideArea=(branches||[]).filter(b=>b.hasChanged&&!b.missingCoord&&!branchCoordinateInsideArea(b));
    const compactOutliers=compactnessAudit(rows,branches).outliers;
    const disconnectedBranches=disconnectedBranchGroups(branches).filter(x=>x&&x.branch&&(branchLooksNew(x.branch)||x.branch.hasChanged));
    const lowVolumeSplits=(branches||[]).filter(b=>branchLooksNew(b)&&(Number(b.volumeSim)||0)<MIN_SPLIT_VOLUME_SIM);
    const nearBranchPairs=nearbyChangedBranches(branches);
    const currentCount=new Set((rows||[]).map(r=>norm(r.currentBranch||r.rawCurrentBranch||r.plannedBranch)).filter(Boolean)).size;
    const tooManyBranches=currentCount&&branches&&branches.length>Math.ceil(currentCount*1.25)?{currentCount,branchCount:branches.length,limit:Math.ceil(currentCount*1.25)}:null;
    return {
      rows:(rows||[]).length,
      branchCount:(branches||[]).length,
      overlaps,
      missingMoved,
      outsideArea,
      compactOutliers,
      disconnectedBranches,
      lowVolumeSplits,
      nearBranchPairs,
      tooManyBranches,
      ok:!overlaps.length&&!missingMoved.length&&!outsideArea.length&&!disconnectedBranches.length&&!lowVolumeSplits.length&&!nearBranchPairs.length&&!tooManyBranches
    };
  }
  function missingCoordRows(rows){
    const groups=new Map();
    (rows||[]).forEach(row=>{
      if(!groups.has(row.plannedBranch))groups.set(row.plannedBranch,{rows:[],hasCoord:false});
      const g=groups.get(row.plannedBranch);
      g.rows.push(row);
      if(row.groupCoord||row.coord)g.hasCoord=true;
    });
    const out=[];
    groups.forEach(g=>{if(!g.hasCoord)out.push(...g.rows)});
    return out;
  }
  function plannedNameAtPoint(oldName,row){
    if(!row)return oldName;
    const code=codeFromBranchName(oldName)||provinceCode(row.province)||codeFromBranchName(row.plannedBranch)||'DCL';
    const base='BC ('+code+') '+cleanWardName(row.ward);
    const used=new Set((state.branches||[]).map(b=>norm(b.name)).filter(x=>x&&x!==norm(oldName)));
    let name=base,i=2;
    while(used.has(norm(name)))name=base+' '+i++;
    return name;
  }
  function shouldRenameDraggedBranch(branch){
    if(!branch||!branch.hasChanged)return false;
    return branch.planKind==='new'||branch.planKind==='relocate'||(branch.rows||[]).some(r=>r.planAction==='open'||r.planAction==='relocate'||r.coordEdited);
  }
  function stableDraggedBranchName(name,branch,containing){
    if(!shouldRenameDraggedBranch(branch))return name;
    const rows=branch?.rows||[];
    const inOwnArea=!!(containing&&rows.some(r=>r.key===containing.key));
    if(inOwnArea){
      const manual=rows.map(r=>r.manualRuleTarget).find(Boolean);
      const base=rows.map(r=>r.dragBaseName).find(Boolean);
      return manual||base||branch.name||name;
    }
    return plannedNameAtPoint(name,containing);
  }
  function updateBranchCoordinate(name,lat,lng){
    const coord={lat:Number(lat),lng:Number(lng)};
    if(!isFinite(coord.lat)||!isFinite(coord.lng))return;
    const currentBranch=state.branchMap.get(name);
    const containing=pointInRows(coord,state.rows);
    const renamed=stableDraggedBranchName(name,currentBranch,containing);
    cache.branchCoords.delete(name);
    cache.branchCoords.set(renamed,coord);
    state.rows.forEach(row=>{
      if(row.plannedBranch!==name)return;
      row.currentBranch=row.currentBranch||name;
      row.dragBaseName=row.dragBaseName||name;
      if(renamed!==name){
        row.plannedBranch=renamed;
        row.branchLabel=shortName(renamed);
        setOfficialRouteColor(row,hashColor(renamed));
      }
      row.coord=coord;row.groupCoord=coord;row.missingCoord=false;row.coordEdited=true;
      row.planAction=row.planAction||'coord_adjust';
      row.autoReason=renamed!==name
        ?`Người dùng kéo marker sang ${containing?containing.ward:'vị trí mới'}; hệ thống tự đổi tên bưu cục theo địa giới hành chính mới tại vị trí đặt.`
        :`Người dùng kéo marker để điều chỉnh tọa độ; hệ thống đã chạy lại kiểm tra toàn vùng sau chỉnh sửa.`;
    });
    assignDistinctBranchColors(state.rows);
    state.errors=missingCoordRows(state.rows);
    state.branches=buildBranches(state.rows);
    state.branchMap=new Map(state.branches.map(b=>[b.name,b]));
    state.audit=auditSimulation(state.rows,state.branches);
    if(state.autoPlan){
      state.autoPlan.after=state.branches;
      state.autoPlan.manualEdited=true;
      state.autoPlan.globalAudit=state.audit;
    }
    if(state.selectedBranches.has(name)){state.selectedBranches.delete(name);state.selectedBranches.add(renamed)}
    const b=state.branchMap.get(renamed),mk=cache.branchMarkers.get(name)||cache.branchMarkers.get(renamed);
    if(mk&&renamed!==name){cache.branchMarkers.delete(name);cache.branchMarkers.set(renamed,mk)}
    if(mk&&b){
      mk.setIcon(markerIcon(state.selectedBranches.has(renamed),false,b.planKind));
      mk.setPopupContent(popupBranch(b));
      try{mk.bindTooltip(`${esc(b.label)}<br>${esc(b.coordText)}`,{direction:'top',offset:[0,-16],opacity:.94})}catch(e){}
    }
    renderStatus();renderLists();renderAutoPlan();scheduleLabels();
  }
  function renderSimulation(rows,errors,sourceName,aliasCount,options){
    options=options||{};
    const m=getMap(),ls=ensureLayers();if(!m||!ls){alert('Bản đồ chưa sẵn sàng, vui lòng thử lại sau vài giây.');return}
    rows=assignDistinctBranchColors(optimizePlannedCoordinates((rows||[]).map(cloneRow)));
    try{m.closePopup()}catch(e){}
    clearMapOnly();
    setSimPaneEvents(true);
    const allErrors=[],seenErr=new Set();
    (errors||[]).concat(missingCoordRows(rows)).forEach(r=>{const k=r.key+'|'+r.plannedBranch;if(!seenErr.has(k)){seenErr.add(k);allErrors.push(r)}});
    state.rows=rows;state.errors=allErrors;state.sourceName=sourceName;state.aliasCount=Number(aliasCount)||0;state.selectedWards.clear();state.selectedBranches.clear();cache.branchCoords.clear();
    rows.forEach(r=>{if(r.groupCoord)cache.branchCoords.set(r.plannedBranch,r.groupCoord)});
    state.branches=buildBranches(rows);state.branchMap=new Map(state.branches.map(b=>[b.name,b]));
    state.audit=auditSimulation(rows,state.branches);
    rows.forEach(row=>{
      const gj={type:'Feature',geometry:row.geometry,properties:{ward:row.ward,branch:row.plannedBranch}};
      const ly=L.geoJSON(gj,{pane:'v132SimPolygonPane',style:()=>wardStyle(row),onEachFeature:(f,l)=>{
        l.on('click',()=>{
          state.selectedWards.clear();
          state.selectedBranches.clear();
          state.selectedWards.add(row.key);
          openSimulationWardPanel(row);
          updateSelectionOnly();renderLists();
        });
      }}).addTo(ls.polygons);
      cache.wardLayers.set(row.key,ly);
    });
    state.branches.forEach(b=>{
      if(b.missingCoord)return;
      const mk=L.marker([b.lat,b.lng],{pane:'v132SimMarkerPane',icon:markerIcon(false,b.missingCoord,b.planKind),zIndexOffset:1800,riseOnHover:true,draggable:true,bubblingMouseEvents:true})
        .bindPopup(popupBranch(b))
        .bindTooltip(`${esc(b.label)}<br>${esc(b.coordText)}`,{direction:'top',offset:[0,-16],opacity:.94})
        .on('click',()=>{state.selectedBranches.has(b.name)?state.selectedBranches.delete(b.name):state.selectedBranches.add(b.name);mk.openPopup();updateSelectionOnly();renderLists();})
        .on('dragend',ev=>{const ll=ev.target.getLatLng();updateBranchCoordinate(b.name,ll.lat,ll.lng);});
      mk.addTo(ls.markers);cache.branchMarkers.set(b.name,mk);
    });
    if(options.selectedWards){state.selectedWards.clear();options.selectedWards.forEach(k=>state.selectedWards.add(k))}
    if(options.selectedBranches){state.selectedBranches.clear();options.selectedBranches.forEach(k=>state.selectedBranches.add(k))}
    state.showCurrent=false;state.showPlan=true;
    const cur=q('#v132ShowCurrent'),plan=q('#v132ShowPlan');if(cur)cur.checked=false;if(plan)plan.checked=true;
    toggleCurrent(false);togglePlan(true);updateSelectionOnly();renderStatus();renderLists();renderAutoPlan();scheduleLabels();
    if(options.fit!==false)try{m.fitBounds(ls.polygons.getBounds(),{padding:[28,28],maxZoom:11})}catch(e){}
  }
  function clearMapOnly(){
    if(simLayers){simLayers.polygons.clearLayers();simLayers.markers.clearLayers();simLayers.labels.clearLayers()}
    cache.wardLayers.clear();cache.branchMarkers.clear();
    setSimPaneEvents(false);
  }
  function clearSimulation(){
    clearMapOnly();state.rows=[];state.branches=[];state.branchMap.clear();state.selectedWards.clear();state.selectedBranches.clear();state.errors=[];state.audit=null;state.sourceName='';
    state.uploadRows=[];state.autoPlan=null;state.showCurrent=true;state.showPlan=false;
    const cur=q('#v132ShowCurrent'),plan=q('#v132ShowPlan');if(cur)cur.checked=true;if(plan)plan.checked=false;
    toggleCurrent(true);togglePlan(false);
    try{if(typeof selectedRouteKey!=='undefined')selectedRouteKey='';document.body.classList.remove('v130-route-isolated')}catch(e){}
    try{if(typeof apply==='function')apply()}catch(e){}
    try{
      const m=getMap();
      if(m){
        getCurrentLayers().forEach(l=>{try{if(!m.hasLayer(l))l.addTo(m)}catch(e){}});
        if(m.invalidateSize)m.invalidateSize();
      }
    }catch(e){}
    renderStatus();renderLists();renderAutoPlan();
  }
  function updateSelectionOnly(){
    cache.wardLayers.forEach((ly,key)=>{
      const row=state.rows.find(r=>r.key===key);if(row)ly.setStyle(wardStyle(row));
    });
    const has=state.selectedWards.size||state.selectedBranches.size;
    cache.branchMarkers.forEach((mk,name)=>{
      const b=state.branchMap.get(name);
      if(!b)return;
      const active=state.selectedBranches.has(name)||b.rows.some(r=>state.selectedWards.has(r.key));
      mk.setIcon(markerIcon(active,b.missingCoord,b.planKind));
      if(mk.setOpacity)mk.setOpacity(!has||active?1:.72);
    });
    scheduleLabels();
  }
  function scheduleLabels(){clearTimeout(labelTimer);labelTimer=setTimeout(redrawLabels,150)}
  function place(rects,x,y,w,h){
    const r={x1:x-w/2,y1:y-h/2,x2:x+w/2,y2:y+h/2};
    if(rects.some(o=>!(r.x2<o.x1||r.x1>o.x2||r.y2<o.y1||r.y1>o.y2)))return false;
    rects.push(r);return true;
  }
  function placeBranchLabel(rects,x,y,w,h,force){
    const offsets=[[0,0],[0,-34],[0,34],[-95,0],[95,0],[-70,-28],[70,-28],[-70,28],[70,28]];
    for(const off of offsets){
      if(place(rects,x+off[0],y+off[1],w,h))return {x:x+off[0],y:y+off[1]};
    }
    if(force)return {x,y};
    return null;
  }
  function redrawLabels(){
    const m=getMap(),ls=ensureLayers();if(!m||!ls||!state.rows.length||!state.showPlan)return;
    ls.labels.clearLayers();
    const zoom=m.getZoom(),rects=[];
    let visibleBounds=null;
    try{visibleBounds=m.getBounds().pad(.12)}catch(e){}
    const hasSelection=state.selectedWards.size||state.selectedBranches.size;
    const visibleBranch=()=>true;
    state.branches.filter(visibleBranch).forEach(b=>{
      const atMarker=(hasSelection&&state.selectedBranches.has(b.name))||b.hasChanged||zoom>=10;
      const lat=(atMarker&&isFinite(Number(b.lat)))?b.lat:(b.labelLat||b.lat),lng=(atMarker&&isFinite(Number(b.lng)))?b.lng:(b.labelLng||b.lng);
      const pt=m.latLngToContainerPoint([lat,lng]),text=compactBranch(b.label,zoom),showCoord=b.hasChanged&&b.coordText&&(zoom>=9),w=Math.min(showCoord?210:170,46+Math.max(text.length,(showCoord?b.coordText.length:0))*6.4),h=showCoord?39:24;
      const html=`<div class="v132-branch-label ${b.planKind||''} ${b.missingCoord?'missing':''} ${showCoord?'with-coord':''}"><span>${esc(text)}</span>${showCoord?`<small>${esc(b.coordText)}</small>`:''}</div>`;
      const placed=placeBranchLabel(rects,pt.x,pt.y-(showCoord?30:0),w,h,b.hasChanged);
      if(placed)L.marker(m.containerPointToLatLng([placed.x,placed.y+(showCoord?30:0)]),{pane:'v132SimLabelPane',interactive:false,icon:L.divIcon({className:'',html,iconSize:[w,h],iconAnchor:[w/2,showCoord?h+8:h/2]})}).addTo(ls.labels);
    });
    const wardLimit=zoom<10.8?0:zoom<11.5?42:zoom<12.4?95:Math.min(180,state.rows.length);
    const selectedRows=state.rows.filter(row=>state.selectedBranches.has(row.plannedBranch)||state.selectedWards.has(row.key));
    const topRows=state.rows.slice().sort((a,b)=>(b.volumeSim||b.volQuyDoi)-(a.volumeSim||a.volQuyDoi)).slice(0,wardLimit);
    const seen=new Set();
    const wardRows=(hasSelection?selectedRows.concat(topRows):topRows).filter(row=>{if(seen.has(row.key))return false;seen.add(row.key);return true});
    wardRows.forEach(row=>{
      const labelPt=pointOnSurface(row.geometry,row.centroid)||row.centroid;
      if(!labelPt)return;
      if(visibleBounds&&!visibleBounds.contains([labelPt.lat,labelPt.lng]))return;
      const pt=m.latLngToContainerPoint([labelPt.lat,labelPt.lng]),text=compactWard(row.ward,zoom),w=Math.min(145,36+text.length*5.2),h=19;
      if(place(rects,pt.x,pt.y,w,h))L.marker([labelPt.lat,labelPt.lng],{pane:'v132SimLabelPane',interactive:false,icon:L.divIcon({className:'',html:`<div class="v132-ward-label">${esc(text)}</div>`,iconSize:[w,h],iconAnchor:[w/2,h/2]})}).addTo(ls.labels);
    });
  }

  function renderStatus(){
    const el=q('#v132SimStatus');if(!el)return;
    if(!state.rows.length){el.className='v132-sim-status';el.innerHTML='<b>Chưa có dữ liệu mô phỏng</b>Upload file Excel sheet Xa_Phuong, hệ thống sẽ vẽ lớp quy hoạch mới lên bản đồ và không ghi đè dữ liệu hiện tại.';return}
    const audit=state.audit||auditSimulation(state.rows,state.branches);
    const issueCount=(state.errors.length||0)+(audit.overlaps?.length||0)+(audit.missingMoved?.length||0)+(audit.outsideArea?.length||0)+(audit.disconnectedBranches?.length||0)+(audit.lowVolumeSplits?.length||0)+(audit.nearBranchPairs?.length||0)+(audit.tooManyBranches?1:0);
    const cls=issueCount?'warn':'good';el.className='v132-sim-status '+cls;
    const currentCount=new Set(state.rows.map(r=>norm(r.currentBranch||r.plannedBranch)).filter(Boolean)).size;
    const auditText=audit.overlaps.length
      ?`Phát hiện ${audit.overlaps.length} xã/phường bị gán chồng nhiều bưu cục.`
      :`Không chồng trách nhiệm: mỗi xã/phường thuộc đúng 1 bưu cục sau quy hoạch.`;
    const coordText=audit.missingMoved.length
      ?`${audit.missingMoved.length} BC mới/di dời thiếu tọa độ.`
      :audit.outsideArea.length
        ?`${audit.outsideArea.length} BC mới/di dời có tọa độ nằm ngoài vùng phụ trách.`
        :`BC mới/di dời đều có tọa độ nằm trong vùng phụ trách và hiển thị trên marker/label.`;
    const topologyText=audit.disconnectedBranches?.length
      ?`${audit.disconnectedBranches.length} bưu cục còn địa bàn rời, cần rà lại cụm phụ trách.`
      :`Địa bàn phụ trách sau mô phỏng đã được kiểm tra liền kề.`;
    const minVolText=audit.lowVolumeSplits?.length
      ?`${audit.lowVolumeSplits.length} bưu cục mở mới dưới ngưỡng ${fmt(MIN_SPLIT_VOLUME_SIM)} đơn mô phỏng.`
      :`Không có bưu cục mở mới dưới ngưỡng ${fmt(MIN_SPLIT_VOLUME_SIM)} đơn mô phỏng.`;
    const nearText=audit.nearBranchPairs?.length
      ?`${audit.nearBranchPairs.length} cặp BC mở mới/di dời quá gần nhau, cần gộp hoặc chỉnh lại tọa độ.`
      :`Không phát hiện BC mở mới/di dời đặt quá gần nhau.`;
    const countText=audit.tooManyBranches
      ?`Số BC sau mô phỏng ${audit.tooManyBranches.branchCount} vượt ngưỡng kiểm soát ${audit.tooManyBranches.limit} so với ${audit.tooManyBranches.currentCount} BC hiện hữu.`
      :`Số lượng BC sau mô phỏng nằm trong ngưỡng kiểm soát toàn vùng.`;
    const newCount=state.branches.filter(b=>b.planKind==='new').length,relocateCount=state.branches.filter(b=>b.planKind==='relocate').length;
    const roadNote=(audit.compactOutliers||[]).length?` · ${(audit.compactOutliers||[]).length} điểm cần đối chiếu đường chạy thực tế`:''; 
    el.innerHTML=`<b>${issueCount?'Đã render, cần kiểm tra thêm':'Đã render phương án quy hoạch'}</b>${esc(state.sourceName)} · ${state.rows.length} xã/phường · ${currentCount} bưu cục hiện hữu · ${state.branches.length} bưu cục sau quy hoạch${newCount?' · mở mới '+newCount:''}${relocateCount?' · di dời '+relocateCount:''}${state.aliasCount?' · đã đổi '+state.aliasCount+' dòng theo Data C→D':''}${state.errors.length?' · '+state.errors.length+' dòng cần bổ sung tọa độ':''}${roadNote}.<div class="v132-audit-line ${audit.ok?'ok':'warn'}"><span>${esc(auditText)}</span><span>${esc(coordText)}</span><span>${esc(topologyText)}</span><span>${esc(minVolText)}</span><span>${esc(nearText)}</span><span>${esc(countText)}</span></div>`;
    const err=q('#v132SimErrors'),list=q('#v132ErrorList');
    if(err&&list){err.classList.toggle('show',!!state.errors.length);list.innerHTML=state.errors.slice(0,80).map(r=>`<div class="v132-error-row" data-key="${esc(r.key)}"><b>Dòng ${r.rowNumber}</b><span>${esc(r.ward)} · ${esc(r.branchLabel)}</span></div>`).join('');qa('.v132-error-row',list).forEach(x=>x.onclick=()=>focusWard(x.dataset.key));}
  }
  function renderLists(){
    const branchBox=q('#v132BranchList'),wardBox=q('#v132WardList'),search=norm(q('#v132SimSearch')?.value||'');
    if(!branchBox||!wardBox)return;
    const branches=state.branches.filter(b=>!search||norm(b.name+' '+b.label).includes(search)||b.rows.some(r=>norm(r.ward).includes(search))).slice(0,90);
    branchBox.innerHTML=branches.length?branches.map(b=>`<label class="v132-sim-row branch ${esc(b.planKind||'')}"><input type="checkbox" data-branch="${esc(b.name)}" ${state.selectedBranches.has(b.name)?'checked':''}><span class="name">${esc(b.label)}<small>${esc(b.planType||'Hiện hữu')}</small></span><span class="pill">${b.wardCount} xã</span><button type="button" class="v132-rename-mini" data-rename-branch="${esc(b.name)}">Đổi tên</button></label>`).join(''):'<div class="v132-sim-help">Chưa có bưu cục mô phỏng.</div>';
    const wards=state.rows.filter(r=>!search||norm(r.ward+' '+r.plannedBranch+' '+r.province).includes(search)).slice(0,140);
    wardBox.innerHTML=wards.length?wards.map(r=>`<label class="v132-sim-row ${r.missingCoord?'missing':''}"><input type="checkbox" data-ward="${esc(r.key)}" ${state.selectedWards.has(r.key)?'checked':''}><span class="name">${esc(r.ward)}<small>${esc(r.branchLabel)}</small></span><span class="pill">G ${fmt(r.volGiao)} · L ${fmt(r.volLay)}</span></label>`).join(''):'<div class="v132-sim-help">Không tìm thấy xã/phường phù hợp.</div>';
    qa('input[data-branch]',branchBox).forEach(ch=>ch.onchange=()=>{ch.checked?state.selectedBranches.add(ch.dataset.branch):state.selectedBranches.delete(ch.dataset.branch);updateSelectionOnly()});
    qa('button[data-rename-branch]',branchBox).forEach(btn=>btn.onclick=e=>{
      e.preventDefault();e.stopPropagation();
      const branch=state.branchMap.get(btn.dataset.renameBranch);
      if(!branch)return;
      const next=prompt('Nhập tên bưu cục mới. Phạm vi xã/phường phụ trách sẽ được giữ nguyên.',branch.label||branch.name);
      if(next===null)return;
      renameSimulationBranch(branch.name,next);
    });
    qa('input[data-ward]',wardBox).forEach(ch=>ch.onchange=()=>{ch.checked?state.selectedWards.add(ch.dataset.ward):state.selectedWards.delete(ch.dataset.ward);updateSelectionOnly()});
  }
  function focusWard(key){
    const row=state.rows.find(r=>r.key===key);if(!row)return;
    state.selectedWards.clear();state.selectedBranches.clear();state.selectedWards.add(key);updateSelectionOnly();renderLists();
    const ly=cache.wardLayers.get(key),m=getMap();
    try{m.fitBounds(ly.getBounds(),{padding:[45,45],maxZoom:13})}catch(e){}
    openSimulationWardPanel(row);
  }

  function loadSheetJS(){
    return new Promise((resolve,reject)=>{
      if(window.XLSX)return resolve(window.XLSX);
      const s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload=()=>resolve(window.XLSX);s.onerror=()=>reject(new Error('Không tải được thư viện đọc Excel. Kiểm tra internet hoặc dùng Chrome.'));
      document.head.appendChild(s);
    });
  }
  function exportCoordText(coord){
    return coord&&isFinite(Number(coord.lat))&&isFinite(Number(coord.lng))?coordLabel(coord.lat,coord.lng):'';
  }
  function exportGeometryText(row){
    const txt=JSON.stringify(row.geometry||{});
    return txt.length>32000?txt.slice(0,32000)+'... [polygon quá dài, Excel giới hạn 32.767 ký tự/cell]':txt;
  }
  async function exportSimulationExcel(){
    if(!state.rows.length){alert('Chưa có dữ liệu mô phỏng để xuất Excel. Vui lòng upload hoặc chạy mô phỏng trước.');return}
    showLoading(true,'Đang xuất Excel mô phỏng...');
    try{
      const XLSX=await loadSheetJS();
      const detail=state.rows.map((r,i)=>{
        const branch=state.branchMap.get(r.plannedBranch);
        const changed=norm(r.currentBranch||'')!==norm(r.plannedBranch||'')||!!r.autoReason||!!r.coordEdited;
        const oldCoord=r.currentCoord||branchCoordFromName(r.currentBranch);
        const newCoord=branch&&!branch.missingCoord?{lat:branch.lat,lng:branch.lng}:(r.groupCoord||r.coord);
        return {
          'STT':i+1,
          'Tỉnh':r.province||'',
          'Tên xã/phường mới':r.ward||'',
          'Xã/phường cũ':r.oldWard||'',
          'Polygon tuyến/xã phường theo địa giới hành chính mới':exportGeometryText(r),
          'Tên bưu cục cũ phụ trách':r.currentBranch||r.rawCurrentBranch||'',
          'Tọa độ bưu cục cũ phụ trách':exportCoordText(oldCoord)||r.currentCoordRaw||'',
          'Tên bưu cục mới phụ trách (nếu di dời/mở mới)':changed?(r.plannedBranch||''):'',
          'Tọa độ bưu cục mới phụ trách (nếu di dời/mở mới)':changed?exportCoordText(newCoord):'',
          'Loại thay đổi':rowPlanType(r),
          'Volume giao trước +30%':round2(r.volGiao),
          'Volume lấy trước +30%':round2(r.volLay),
          'Volume giao sau +30%':round2(r.volGiao*1.3),
          'Volume lấy sau +30%':round2(r.volLay*1.3),
          'Lý do mô phỏng':r.autoReason||''
        };
      });
      const summary=state.branches.map((b,i)=>({
        'STT':i+1,
        'Bưu cục sau quy hoạch':b.name,
        'Tọa độ':b.missingCoord?'':coordLabel(b.lat,b.lng),
        'Số xã/phường':b.wardCount,
        'Vol giao trước +30%':round2(b.volGiao),
        'Vol lấy trước +30%':round2(b.volLay),
        'Vol giao sau +30%':round2(b.volGiao*1.3),
        'Vol lấy sau +30%':round2(b.volLay*1.3),
        'Diện tích km²':round2(b.area),
        'Trạng thái':b.eval?.status||'',
        'Loại':b.planType||''
      }));
      const wb=XLSX.utils.book_new();
      const ws=XLSX.utils.json_to_sheet(detail);
      ws['!cols']=[{wch:6},{wch:14},{wch:24},{wch:34},{wch:70},{wch:34},{wch:24},{wch:38},{wch:26},{wch:24},{wch:18},{wch:18},{wch:18},{wch:18},{wch:52}];
      ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:detail.length,c:Object.keys(detail[0]||{}).length-1}})};
      XLSX.utils.book_append_sheet(wb,ws,'Xa_Phuong_Mo_Phong');
      const sumWs=XLSX.utils.json_to_sheet(summary);
      sumWs['!cols']=[{wch:6},{wch:38},{wch:24},{wch:14},{wch:18},{wch:18},{wch:18},{wch:18},{wch:14},{wch:22},{wch:18}];
      sumWs['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:summary.length,c:Object.keys(summary[0]||{}).length-1}})};
      XLSX.utils.book_append_sheet(wb,sumWs,'Tong_Hop_Buu_Cuc');
      const stamp=new Date().toISOString().slice(0,16).replace(/[-:T]/g,'');
      XLSX.writeFile(wb,'mo_phong_quy_hoach_buu_cuc_DCL_'+stamp+'.xlsx');
    }catch(err){alert('Không xuất được Excel mô phỏng: '+(err&&err.message?err.message:err))}
    finally{showLoading(false)}
  }
  async function handleFile(file){
    if(!file)return;
    showLoading(true,'Đang đọc file Excel quy hoạch...');
    try{
      const XLSX=await loadSheetJS();
      const data=await file.arrayBuffer();
      const wb=XLSX.read(data,{type:'array'});
      const dataSheet=wb.Sheets['Data'];
      const aliasData=dataSheet?buildDataBranchAliases(XLSX.utils.sheet_to_json(dataSheet,{header:1,defval:'',raw:false})):{map:new Map(),coordMap:new Map()};
      const sh=wb.Sheets['Xa_Phuong'];
      if(!sh)throw new Error('Không tìm thấy sheet Xa_Phuong trong file Excel.');
      const aoa=XLSX.utils.sheet_to_json(sh,{header:1,defval:'',raw:false});
      const parsed=parseRows(aoa,file.name,{aliasMap:aliasData.map,aliasCoordMap:aliasData.coordMap});
      if(!parsed.rows.length)throw new Error('Sheet Xa_Phuong không có dòng hợp lệ để mô phỏng.');
      state.uploadRows=parsed.rows.map(cloneRow);
      state.autoPlan=null;
      renderSimulation(parsed.rows,parsed.errors,file.name,parsed.aliasCount);
    }catch(err){alert('Lỗi upload mô phỏng quy hoạch: '+(err&&err.message?err.message:err))}
    finally{showLoading(false)}
  }
  function showLoading(on,text,steps,activeIndex){
    let el=q('#v132SimLoading');if(!el){el=document.createElement('div');el.id='v132SimLoading';el.className='v132-sim-loading';document.body.appendChild(el)}
    if(!on){el.classList.remove('show');return}
    const hasSteps=Array.isArray(steps)&&steps.length;
    el.innerHTML=`<div class="v132-loading-title">${esc(text||'Đang xử lý...')}</div>${hasSteps?`<ol>${steps.map((s,i)=>`<li class="${i<activeIndex?'done':i===activeIndex?'active':''}">${esc(s)}</li>`).join('')}</ol><button type="button" id="v132CancelAutoPlan">Hủy chạy</button>`:''}`;
    el.classList.add('show');
    const cancel=q('#v132CancelAutoPlan',el);
    if(cancel)cancel.onclick=()=>{autoRunToken++;showLoading(false)};
  }

  function injectUI(){
    if(q('#v132SimulationAcc'))return true;
    const nav=q('.v121-subnav');
    if(!nav)return false;
    const wrap=document.createElement('div');wrap.id='v132SimulationAcc';wrap.className='v121-subacc';
    wrap.innerHTML=`<button type="button" class="v121-subhead">Mô phỏng quy hoạch bưu cục</button><div class="v121-subbody">
      <div class="v132-sim-panel">
        <div class="v132-sim-title"><b>Upload phương án quy hoạch</b><span class="v132-sim-badge">Không ghi đè dữ liệu gốc</span></div>
        <div class="v132-file-wrap"><label class="v132-upload-label" for="v132SimFile">Upload dữ liệu quy hoạch (.xlsx)</label><input id="v132SimFile" type="file" accept=".xlsx,.xls,.csv"><div class="v132-sim-help">Đọc sheet <b>Xa_Phuong</b>: cột J là <b>Vol giao mới</b>, cột K là <b>Vol lấy mới</b>. Nếu sheet <b>Data</b> có cột C “Bưu cục” và cột D “Bưu cục mới”, hệ thống tự đổi tên cũ sang tên mới trước khi vẽ.</div></div>
        <div class="v132-sim-compare">
          <label><input type="checkbox" id="v132ShowCurrent"> Bật bưu cục hiện tại / dữ liệu gốc</label>
          <label><input type="checkbox" id="v132ShowPlan" checked> Bật bưu cục sau quy hoạch / mô phỏng</label>
        </div>
        <div id="v132SimStatus" class="v132-sim-status"></div>
        <div class="v132-sim-actions four"><button class="v132-sim-btn orange" id="v132AutoPlan">Tự chạy gợi ý quy hoạch</button><button class="v132-sim-btn" id="v132ExportSim">Xuất Excel mô phỏng</button><button class="v132-sim-btn" id="v132AddBranch">Thêm BC mô phỏng</button><button class="v132-sim-btn" id="v132RenameBranch">Đổi tên BC</button><button class="v132-sim-btn" id="v132DeleteBranch">Xóa BC đang chọn</button><button class="v132-sim-btn" id="v132FitSim">Thu phóng mô phỏng</button><button class="v132-sim-btn" id="v132ClearSim">Xóa lớp mô phỏng</button></div>
        <div id="v132AutoResult" class="v132-auto-result"></div>
        <input id="v132SimSearch" class="v132-sim-search" placeholder="Tìm bưu cục hoặc xã/phường trong mô phỏng...">
        <div class="v132-sim-help"><b>Tick bưu cục:</b> chỉ highlight vùng phụ trách. <b>Tick xã/phường:</b> chỉ tăng viền và độ sáng, các vùng khác vẫn giữ nguyên.</div>
        <div class="v132-sim-list" id="v132BranchList"></div>
        <div class="v132-sim-list" id="v132WardList"></div>
        <div id="v132SimErrors" class="v132-sim-errors"><h4>Dòng thiếu tọa độ đề xuất</h4><div id="v132ErrorList" class="v132-error-list"></div></div>
      </div></div>`;
    q('.v121-subhead',wrap).onclick=()=>{const open=!wrap.classList.contains('open');qa('.v121-subacc',nav).forEach(x=>x.classList.remove('open'));wrap.classList.toggle('open',open)};
    nav.appendChild(wrap);
    q('#v132SimFile',wrap).onchange=e=>handleFile(e.target.files&&e.target.files[0]);
    q('#v132ShowCurrent',wrap).onchange=e=>{state.showCurrent=e.target.checked;toggleCurrent(state.showCurrent)};
    q('#v132ShowPlan',wrap).onchange=e=>{state.showPlan=e.target.checked;togglePlan(state.showPlan)};
    q('#v132AutoPlan',wrap).onclick=()=>runAutoPlanning();
    q('#v132ExportSim',wrap).onclick=()=>exportSimulationExcel();
    q('#v132AddBranch',wrap).onclick=()=>addSimulationBranch();
    q('#v132RenameBranch',wrap).onclick=()=>renameSelectedSimulationBranch();
    q('#v132DeleteBranch',wrap).onclick=()=>deleteSelectedSimulationBranches();
    q('#v132FitSim',wrap).onclick=()=>{try{getMap().fitBounds(simLayers.polygons.getBounds(),{padding:[28,28],maxZoom:11})}catch(e){}};
    q('#v132ClearSim',wrap).onclick=()=>clearSimulation();
    q('#v132SimSearch',wrap).oninput=()=>renderLists();
    renderStatus();renderLists();renderAutoPlan();
    return true;
  }
  function boot(){
    if(ready)return;ready=true;
    const timer=setInterval(()=>{if(injectUI()){clearInterval(timer);ensureLayers();}},250);
    setTimeout(()=>clearInterval(timer),10000);
  }
  window.v132PlanningSimulation={version:VERSION,state,parseRows,buildDataBranchAliases,buildBranches,evaluateBranch,createAutoPlan,currentMapRows,rowsAsCurrentBase,auditSimulation,optimizePlannedCoordinates,applyGlobalNetworkOptimization,assignDistinctBranchColors,pointInGeometry,pointInRows,renameSimulationBranch,renameSelectedSimulationBranch,runAutoPlanning,renderSimulation,clearSimulation,exportSimulationExcel,debugLoadAOA:(aoa,name='debug.xlsx',options)=>{const p=parseRows(aoa,name,options);state.uploadRows=p.rows.map(cloneRow);renderSimulation(p.rows,p.errors,name,p.aliasCount);return {rows:p.rows.length,errors:p.errors.length,branches:state.branches.length,aliasCount:p.aliasCount,audit:state.audit}}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  window.addEventListener('load',boot);
})();
