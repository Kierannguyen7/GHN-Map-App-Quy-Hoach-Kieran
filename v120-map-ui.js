(function(){
  'use strict';
  function boot(){
    const legacy=document.getElementById('mobileMenuBtn');
    if(legacy){legacy.style.setProperty('display','none','important');legacy.style.setProperty('visibility','hidden','important');legacy.style.setProperty('pointer-events','none','important');}
    if(document.getElementById('v120MapMenuBtn'))return;
    const sidebar=document.getElementById('mainSidebar'),backdrop=document.getElementById('mobileBackdrop');
    if(!sidebar){setTimeout(boot,200);return;}
    const button=document.createElement('button');
    button.id='v120MapMenuBtn';
    button.type='button';
    button.setAttribute('aria-label','Mở menu Quy hoạch');
    button.setAttribute('aria-expanded','false');
    button.textContent='☰';
    button.onclick=function(event){
      event.preventDefault();event.stopPropagation();
      const willOpen=!sidebar.classList.contains('mobile-open');
      sidebar.classList.toggle('mobile-open',willOpen);
      backdrop?.classList.toggle('open',willOpen);
      button.setAttribute('aria-expanded',String(willOpen));
      document.querySelector('#v118PlanningCenter')?.classList.remove('open');
      document.body.classList.remove('v118-center-open');
    };
    backdrop?.addEventListener('click',()=>button.setAttribute('aria-expanded','false'));
    document.addEventListener('keydown',event=>{if(event.key==='Escape')button.setAttribute('aria-expanded','false')});
    document.body.appendChild(button);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
