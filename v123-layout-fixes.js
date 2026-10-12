(function(){
  'use strict';
  const q=(selector,root=document)=>root.querySelector(selector);
  const qa=(selector,root=document)=>[...root.querySelectorAll(selector)];

  function redesignLoginFeatures(){
    const row=q('#loginOverlay .ops-feature-row');
    if(!row||row.dataset.v123||row.children.length<6)return;
    const nodes=[...row.children];
    const fragment=document.createDocumentFragment();
    for(let index=0;index+1<nodes.length;index+=2){
      const card=document.createElement('article');
      card.className='v123-feature-card';
      card.append(nodes[index],nodes[index+1]);
      fragment.appendChild(card);
    }
    row.replaceChildren(fragment);
    row.dataset.v123='1';
  }

  function expandDashboardHeaders(){
    qa('#v107OpsPage .v106-dashboard th').forEach(cell=>{
      const text=cell.textContent.trim();
      if(text==='PTTT')cell.textContent='NVPTTT';
      if(text==='XL')cell.textContent='NVXL';
    });
    qa('#v121OpsCenter .v106-table th').forEach(cell=>{
      const text=cell.textContent.trim();
      if(text==='PTTT')cell.textContent='NVPTTT';
      if(text==='XL')cell.textContent='NVXL';
    });
  }

  function sync(){
    redesignLoginFeatures();
    expandDashboardHeaders();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync);else sync();
  function watch(){
    if(!document.body)return;
    new MutationObserver(()=>requestAnimationFrame(sync)).observe(document.body,{childList:true,subtree:true});
  }
  if(document.body)watch();else document.addEventListener('DOMContentLoaded',watch,{once:true});
  setTimeout(sync,500);
  setTimeout(sync,1500);
})();
