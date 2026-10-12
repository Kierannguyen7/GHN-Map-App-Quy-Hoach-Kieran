(function(){
  'use strict';
  function installMapSource(){
    if(document.getElementById('v129MapSource')) return;
    const link=document.createElement('a');
    link.id='v129MapSource';
    link.href='https://www.openstreetmap.org/copyright';
    link.target='_blank';
    link.rel='noopener noreferrer';
    link.textContent='ⓘ';
    link.title='Nguồn dữ liệu bản đồ: © OpenStreetMap';
    link.setAttribute('aria-label','Nguồn dữ liệu bản đồ: OpenStreetMap');
    document.body.appendChild(link);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',installMapSource);
  else installMapSource();
})();
