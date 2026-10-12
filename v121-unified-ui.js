(function(){
  'use strict';
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  let densityReturnMarker=null;

  function addLoginHeader(){
    const shell=q('#loginOverlay .ops-login-shell');
    if(!shell||q('.v121-login-header',shell))return;
    const header=document.createElement('header');
    header.className='v121-login-header';
    header.innerHTML='<div class="v121-login-brand"><span class="v121-login-mark"><i></i><i></i><i></i><i></i></span><b>OPERATIONS</b></div><button class="v121-login-lang" type="button">◎ &nbsp; Tiếng Việt⌄</button>';
    shell.insertBefore(header,shell.firstChild);
    const features=q('.ops-feature-row',shell);
    if(features&&!q('.v121-security',features))features.insertAdjacentHTML('beforeend','<div class="ops-feature-icon v121-security">◇</div><div><b class="v121-security-text">Bảo mật & tin cậy</b><span>Dữ liệu an toàn,<br>hệ thống vận hành ổn định</span></div>');
  }

  function subAccordion(title){
    const wrap=document.createElement('div');wrap.className='v121-subacc';
    const head=document.createElement('button');head.type='button';head.className='v121-subhead';head.textContent=title;
    const body=document.createElement('div');body.className='v121-subbody';
    wrap.append(head,body);return {wrap,head,body};
  }

  function buildNetworkAccordion(){
    const group=qa('#mainSidebar>.accordion-group').find(x=>q('.accordion-header',x)?.textContent.includes('Bộ lọc & Quy hoạch'));
    if(!group||group.dataset.v121)return;
    const body=q(':scope>.accordion-body',group);if(!body)return;
    const sections=qa(':scope>.section',body);if(sections.length<3)return;
    group.dataset.v121='1';group.classList.remove('open');
    const first=sections[0],filter=subAccordion('Lọc dữ liệu'),coord=subAccordion('Kiểm tra vị trí mặt bằng'),colors=subAccordion('Chế độ màu & hiển thị'),branch=subAccordion('Quy hoạch bưu cục mới / di dời'),nav=document.createElement('div');nav.className='v121-subnav';
    const firstLabel=qa(':scope>.label',first).find(x=>x.textContent.trim()==='Lọc dữ liệu');
    [firstLabel,q('#province'),q('#amMulti'),q('#bcMulti'),q('#search'),q('#reset')].filter(Boolean).forEach(x=>filter.body.appendChild(x));
    const coordLabel=qa(':scope>.label',first).find(x=>x.textContent.includes('Kiểm tra vị trí'));
    const coordHint=coordLabel?.nextElementSibling;
    [coordLabel,coordHint,q('#coordInput'),q('#goCoord'),q('#coordResult'),q('#zoom'),q('#clearRental')].filter(Boolean).forEach(x=>coord.body.appendChild(x));
    colors.body.appendChild(sections[1]);branch.body.appendChild(sections[2]);
    [filter,coord,colors,branch].forEach(item=>{item.head.onclick=()=>{const open=!item.wrap.classList.contains('open');qa('.v121-subacc',nav).forEach(x=>x.classList.remove('open'));item.wrap.classList.toggle('open',open)};nav.appendChild(item.wrap)});
    body.replaceChildren(nav);
  }

  function ensureOpsCenter(){
    let center=q('#v121OpsCenter');if(center)return center;
    center=document.createElement('section');center.id='v121OpsCenter';center.setAttribute('aria-label','Trung tâm Hiệu suất vận hành');
    center.innerHTML='<div class="v121-ops-head"><div><h2>Trung tâm Hiệu suất vận hành</h2><p>Capacity · định biên · mật độ đơn · tuyến NVPTTT</p></div><button class="v121-ops-close" type="button" aria-label="Đóng">×</button></div><div class="v121-ops-content" id="v121OpsCenterContent"></div>';
    q('.v121-ops-close',center).onclick=()=>{restoreOrderDensityCard();center.classList.remove('open')};
    document.body.appendChild(center);return center;
  }

  function savedCount(key){try{return Object.keys(JSON.parse(localStorage.getItem(key)||'{}')||{}).length}catch(e){return 0}}

  function restoreOrderDensityCard(){
    const card=q('.v146-order-density-card');
    if(card&&densityReturnMarker?.parentNode&&q('#v121OpsCenter')?.contains(card)){
      card.classList.remove('v121-density-mounted');
      densityReturnMarker.parentNode.insertBefore(card,densityReturnMarker.nextSibling);
      window.__dclBindOrderDensityControls&&window.__dclBindOrderDensityControls();
      window.__dclRefreshOrderDensityStatus&&window.__dclRefreshOrderDensityStatus();
    }
  }

  function mountOrderDensityCard(slot,existingCard){
    const card=existingCard||q('.v146-order-density-card');
    if(!card||!slot)return false;
    if(!densityReturnMarker||!densityReturnMarker.parentNode){
      densityReturnMarker=document.createComment('v121-order-density-return');
      card.parentNode?.insertBefore(densityReturnMarker,card);
    }
    card.classList.add('open','v121-density-mounted');
    slot.appendChild(card);
    window.__dclBindOrderDensityControls&&window.__dclBindOrderDensityControls();
    window.__dclRefreshOrderDensityStatus&&window.__dclRefreshOrderDensityStatus();
    return true;
  }

  function renderOpsCenter(center){
    let densityCard=q('.v146-order-density-card');
    if(densityCard&&center.contains(densityCard)){
      restoreOrderDensityCard();
      densityCard=q('.v146-order-density-card');
    }
    const kpis=q('#v106Left .v106-kpi-grid'),table=q('#v107OpsPage .v106-dashboard .v106-table'),route=q('#v119SimResult');
    const vol=savedCount('ghn_v80_uploaded_vol_by_ward'),staff=savedCount('ghn_v77_staff_by_branch'),xl=savedCount('ghn_v79_nvxl_by_branch');
    const content=q('#v121OpsCenterContent',center)||q('.v121-ops-content',center);
    content.innerHTML=`<div class="v121-ops-accordion">
      <section class="v121-ops-section open" data-section="ops">
        <button class="v121-ops-section-head" type="button" aria-expanded="true"><span>📂 Hiệu suất vận hành</span><i>▾</i></button>
        <div class="v121-ops-section-body">
          <div class="v121-ops-card"><h3>Capacity và định biên toàn vùng</h3>${kpis?kpis.outerHTML:'<p class="v121-ops-note">Chưa có dữ liệu tổng quan.</p>'}</div>
          <div class="v121-ops-card"><h3>Định biên theo bưu cục</h3><div class="v121-ops-table">${table?table.outerHTML:'<p class="v121-ops-note">Chưa có bảng bưu cục.</p>'}</div></div>
          <div class="v121-ops-card"><h3>Mô phỏng tuyến NVPTTT đang chọn</h3>${route?route.outerHTML:'<p class="v121-ops-note">Chọn một bưu cục trong bảng Định biên BC để vẽ tuyến mô phỏng, thời gian di chuyển, phạm vi và thời gian xử lý trung bình mỗi đơn.</p>'}</div>
          <div class="v121-ops-card"><h3>Trạng thái dữ liệu</h3><div class="v106-kpi-grid"><div class="v106-kpi"><span>Dòng Vol đã lưu</span><b>${vol}</b></div><div class="v106-kpi"><span>BC có NVPTTT</span><b>${staff}</b></div><div class="v106-kpi"><span>BC có NVXL</span><b>${xl}</b></div></div><p class="v121-ops-note">Upload và xóa dữ liệu vẫn thực hiện trong Menu Hiệu suất ở góc trái bản đồ.</p></div>
        </div>
      </section>
      <section class="v121-ops-section open v121-density-section" data-section="density">
        <button class="v121-ops-section-head" type="button" aria-expanded="true"><span>📍 Mật độ đơn theo bưu cục</span><i>▾</i></button>
        <div class="v121-ops-section-body"><div class="v121-ops-card"><h3>Mật độ đơn theo bưu cục</h3><p class="v121-ops-note">Chọn tỉnh, chọn một hoặc nhiều bưu cục, bật/tắt lớp mật độ đơn và xem thống kê nhanh ngay trong Trung tâm Hiệu suất vận hành.</p><div id="v121OrderDensitySlot"></div></div></div>
      </section>
    </div>`;
    qa('.v121-ops-section-head',content).forEach(head=>head.onclick=event=>{event.preventDefault();event.stopPropagation();const section=head.closest('.v121-ops-section');const open=!section.classList.contains('open');section.classList.toggle('open',open);head.setAttribute('aria-expanded',String(open))});
    qa('button[data-bc]',content).forEach(button=>button.onclick=()=>{const bc=button.dataset.bc,original=qa('#v107OpsPage .v106-dashboard button[data-bc]').find(x=>x.dataset.bc===bc);center.classList.remove('open');if(original)original.click()});
    const slot=q('#v121OrderDensitySlot',center);
    if(slot&&!mountOrderDensityCard(slot,densityCard)){
      slot.innerHTML='<p class="v121-ops-note">Mở module Hiệu suất vận hành để khởi tạo menu Mật độ đơn theo bưu cục.</p>';
    }
  }

  function openOpsCenter(){const center=ensureOpsCenter();renderOpsCenter(center);center.classList.add('open');q('#v106Left')?.classList.remove('mobile-open')}

  function ensureOpsUI(){
    const page=q('#v107OpsPage'),mapCard=q('.v106-map-card',page),left=q('#v106Left',page);if(!page||!mapCard||!left)return;
    const planningCenter=q('#v118PlanningCenter');
    if(planningCenter?.classList.contains('open'))try{sessionStorage.setItem('ghn_v130_reopen_planning_center','1')}catch(err){}
    planningCenter?.classList.remove('open');
    document.body.classList.remove('v118-center-open');
    if(!q('#v121OpsMenuBtn',mapCard)){
      const button=document.createElement('button');button.id='v121OpsMenuBtn';button.type='button';button.setAttribute('aria-label','Mở menu Hiệu suất');button.textContent='☰';
      button.onclick=(event)=>{event.preventDefault();event.stopPropagation();const willOpen=!left.classList.contains('mobile-open');left.classList.toggle('mobile-open',willOpen);q('#v106Right')?.classList.remove('mobile-open');q('#v121OpsCenter')?.classList.remove('open')};mapCard.appendChild(button);
    }
    if(!q('#v121OpsCenterButton',left)){const button=document.createElement('button');button.id='v121OpsCenterButton';button.type='button';button.textContent='Trung tâm Hiệu suất vận hành';button.onclick=openOpsCenter;left.insertBefore(button,left.firstChild)}
    ensureOpsCenter();
  }

  function sync(){
    addLoginHeader();buildNetworkAccordion();
    if(document.body.classList.contains('v106-ops-mode'))ensureOpsUI();
    else{
      q('#v121OpsCenter')?.classList.remove('open');
      try{
        if(sessionStorage.getItem('ghn_v130_reopen_planning_center')==='1'){
          q('#v118PlanningCenter')?.classList.add('open');
          document.body.classList.add('v118-center-open');
          sessionStorage.removeItem('ghn_v130_reopen_planning_center');
        }
      }catch(err){}
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync);else sync();
  function watch(){
    if(!document.body)return;
    new MutationObserver(()=>requestAnimationFrame(sync)).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  }
  if(document.body)watch();else document.addEventListener('DOMContentLoaded',watch,{once:true});
  window.__dclRefreshOpsCenter=()=>{const center=q('#v121OpsCenter');if(center?.classList.contains('open'))renderOpsCenter(center)};
  setTimeout(sync,400);setTimeout(sync,1500);
})();
