(function(){
  'use strict';
  const q=(selector,root=document)=>root.querySelector(selector);

  function bindOpsMapDismiss(){
    const page=q('#v107OpsPage');
    if(!page||page.dataset.v125Dismiss)return;
    page.dataset.v125Dismiss='1';
    page.addEventListener('click',event=>{
      if(!document.body.classList.contains('v106-ops-mode'))return;
      const panel=q('#v106Left',page);
      const menu=q('#v121OpsMenuBtn',page);
      const map=q('#v106OpsMap',page);
      if(!panel?.classList.contains('mobile-open')||!map?.contains(event.target))return;
      if(event.target.closest('.leaflet-control'))return;
      if(menu?.contains(event.target))return;
      panel.classList.remove('mobile-open');
      menu?.setAttribute('aria-expanded','false');
    });
  }

  function sync(){bindOpsMapDismiss()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync);else sync();
  function watch(){
    if(!document.body)return;
    new MutationObserver(()=>requestAnimationFrame(sync)).observe(document.body,{childList:true,subtree:true});
  }
  if(document.body)watch();else document.addEventListener('DOMContentLoaded',watch,{once:true});
  setTimeout(sync,500);
  setTimeout(sync,1500);
})();
