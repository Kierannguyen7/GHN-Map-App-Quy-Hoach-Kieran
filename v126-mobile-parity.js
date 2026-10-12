(function(){
  'use strict';
  function closeOpsPanelFromMap(event){
    if(!document.body.classList.contains('v106-ops-mode'))return;
    const panel=document.querySelector('#v106Left');
    const menu=document.querySelector('#v121OpsMenuBtn');
    if(!panel?.classList.contains('mobile-open'))return;
    if(panel.contains(event.target)||menu?.contains(event.target))return;
    if(event.target.closest('.leaflet-control'))return;
    if(!event.target.closest('.leaflet-container'))return;
    panel.classList.remove('mobile-open');
    menu?.setAttribute('aria-expanded','false');
  }
  if(!document.documentElement.dataset.v126MapDismiss){
    document.documentElement.dataset.v126MapDismiss='1';
    document.addEventListener('click',closeOpsPanelFromMap);
  }
})();
