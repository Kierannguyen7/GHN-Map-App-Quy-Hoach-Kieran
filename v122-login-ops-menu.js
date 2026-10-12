(function(){
  'use strict';
  const q=(selector,root=document)=>root.querySelector(selector);
  const qa=(selector,root=document)=>[...root.querySelectorAll(selector)];

  const opsItems=[
    ['① Tổng quan vùng','Capacity hiện có/cần + định biên'],
    ['② Chế độ Vol','Vol thực tế / Vol mô phỏng'],
    ['③ Upload Vol xã/phường','Dữ liệu sản lượng theo địa bàn'],
    ['④ Upload nhân sự thực tế','NVPTTT và NVXL hiện có'],
    ['⑤ Hiệu quả tuyến','Tuyến xa · mật độ thấp theo địa giới cũ'],
    ['⑥ Dashboard định biên & Capacity','Định biên theo từng bưu cục'],
    ['⑦ Mô phỏng tuyến 1 NVPTTT','Thời gian · phạm vi · xử lý TB/đơn']
  ];

  function collectOpsCards(left,right,page){
    const leftCards=qa(':scope>.v106-card',left).slice(0,4);
    const efficiency=q(':scope>.v157-route-efficiency-card',right)||q('.v157-route-efficiency-card',page);
    const dashboard=q(':scope>.v106-dashboard',right)||q('.v106-dashboard',page);
    const route=q(':scope>.v106-route',right)||q('.v106-route',page);
    return [leftCards[0],leftCards[1],leftCards[2],leftCards[3],efficiency,dashboard,route];
  }

  function makeSubItem(item,index){
    const wrap=document.createElement('section');
    wrap.className='v122-ops-subacc';
    wrap.dataset.v122Index=String(index);
    const button=document.createElement('button');
    button.type='button';
    button.className='v122-ops-subhead';
    button.setAttribute('aria-expanded','false');
    button.innerHTML=`<span><b>${opsItems[index][0]}</b><small>${opsItems[index][1]}</small></span><i>▾</i>`;
    const body=document.createElement('div');
    body.className='v122-ops-subbody';
    item.classList.add('open','v122-moved-card');
    body.appendChild(item);
    wrap.append(button,body);
    return {wrap,button};
  }

  function bindSubToggle(sub,groupBody){
    sub.button.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();
      const shouldOpen=!sub.wrap.classList.contains('open');
      qa('.v122-ops-subacc',groupBody).forEach(other=>{
        other.classList.remove('open');
        q('.v122-ops-subhead',other)?.setAttribute('aria-expanded','false');
      });
      sub.wrap.classList.toggle('open',shouldOpen);
      sub.button.setAttribute('aria-expanded',String(shouldOpen));
    });
  }

  function ensureOpsSubItems(groupBody,cards){
    cards.forEach((card,index)=>{
      if(!card||q(`.v122-ops-subacc[data-v122-index="${index}"]`,groupBody))return;
      const sub=makeSubItem(card,index);
      bindSubToggle(sub,groupBody);
      groupBody.appendChild(sub.wrap);
    });
  }

  function ensureDensityMenu(left,right){
    if(!left||!right||q('#v122DensityGroup',left))return;
    const center=q('#v121OpsCenter');
    const card=q('.v146-order-density-card',right)||q('.v146-order-density-card');
    if(!card||center?.contains(card))return;

    const group=document.createElement('section');
    group.id='v122DensityGroup';
    group.className='v122-ops-group v122-density-group open';
    const groupHead=document.createElement('button');
    groupHead.type='button';
    groupHead.className='v122-ops-group-head';
    groupHead.setAttribute('aria-expanded','true');
    groupHead.innerHTML='<span>📍 Mật độ đơn theo bưu cục</span><i>▾</i>';
    const groupBody=document.createElement('div');
    groupBody.className='v122-ops-group-body';

    card.classList.add('open','v122-density-card');
    groupBody.appendChild(card);
    groupHead.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();
      const shouldOpen=!group.classList.contains('open');
      group.classList.toggle('open',shouldOpen);
      groupHead.setAttribute('aria-expanded',String(shouldOpen));
    });
    group.append(groupHead,groupBody);

    const opsGroup=q('#v122OpsGroup',left);
    const centerButton=q('#v121OpsCenterButton',left);
    if(opsGroup)opsGroup.insertAdjacentElement('afterend',group);
    else if(centerButton)centerButton.insertAdjacentElement('afterend',group);
    else left.prepend(group);

    right.classList.remove('v122-ops-right-merged');
    window.__dclBindOrderDensityControls?.();
    window.__dclRefreshOrderDensityStatus?.();
  }

  function buildOpsMenu(){
    const page=q('#v107OpsPage');
    const left=q('#v106Left',page);
    const right=q('#v106Right',page);
    if(!page||!left||!right)return;
    const existing=q('#v122OpsGroup',left);
    if(existing){
      const groupBody=q(':scope>.v122-ops-group-body',existing);
      if(groupBody)ensureOpsSubItems(groupBody,collectOpsCards(left,right,page));
      ensureDensityMenu(left,right);
      return;
    }
    const cards=collectOpsCards(left,right,page);
    if(cards.filter(Boolean).length<opsItems.length)return;

    const group=document.createElement('section');
    group.id='v122OpsGroup';
    group.className='v122-ops-group';
    const groupHead=document.createElement('button');
    groupHead.type='button';
    groupHead.className='v122-ops-group-head';
    groupHead.setAttribute('aria-expanded','false');
    groupHead.innerHTML='<span>📂 Hiệu suất vận hành</span><i>▾</i>';
    const groupBody=document.createElement('div');
    groupBody.className='v122-ops-group-body';

    ensureOpsSubItems(groupBody,cards);

    groupBody.addEventListener('click',event=>{
      const branchButton=event.target.closest('button[data-bc]');
      if(!branchButton)return;
      setTimeout(()=>{
        q('#v106Sheet')?.classList.remove('open');
        document.body.classList.remove('v107-route-on');
        const items=qa('.v122-ops-subacc',groupBody);
        items.forEach(other=>{
          other.classList.remove('open');
          q('.v122-ops-subhead',other)?.setAttribute('aria-expanded','false');
        });
        const routeCard=q('.v106-route',page);
        const routeWrap=routeCard?.closest('.v122-ops-subacc');
        if(routeWrap){
          routeWrap.classList.add('open');
          q('.v122-ops-subhead',routeWrap)?.setAttribute('aria-expanded','true');
        }
        routeCard?.classList.add('open');
        routeCard?.scrollIntoView({block:'nearest'});
      },120);
    });

    groupHead.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();
      const shouldOpen=!group.classList.contains('open');
      group.classList.toggle('open',shouldOpen);
      groupHead.setAttribute('aria-expanded',String(shouldOpen));
    });
    group.append(groupHead,groupBody);
    const centerButton=q('#v121OpsCenterButton',left);
    centerButton?.insertAdjacentElement('afterend',group);
    if(!centerButton)left.prepend(group);
    right.classList.remove('v122-ops-right-merged');
    ensureDensityMenu(left,right);
    left.dataset.v122Menu='1';
  }

  function polishLogin(){
    const overlay=q('#loginOverlay');
    if(!overlay)return;
    const header=q('.v121-login-header',overlay);
    if(header&&!q('.v122-login-bell',header)){
      const bell=document.createElement('span');
      bell.className='v122-login-bell';
      bell.setAttribute('aria-hidden','true');
      bell.textContent='';
      header.appendChild(bell);
    }
    const user=q('#loginUser',overlay),pass=q('#loginPass',overlay);
    if(user&&!user.value)user.value='';
    if(pass&&!pass.value)pass.value='';
    const credit=q('.ops-login-credit',overlay);
    if(credit&&!credit.dataset.v122){
      credit.dataset.v122='1';
      credit.innerHTML='<span>Phần mềm được phát triển bởi</span><b>Kieran Nguyen - Thành viên ĐCL</b>';
    }
  }

  function sync(){
    polishLogin();
    if(document.body?.classList.contains('v106-ops-mode'))buildOpsMenu();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync);else sync();
  function watch(){
    if(!document.body)return;
    new MutationObserver(()=>requestAnimationFrame(sync)).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  }
  if(document.body)watch();else document.addEventListener('DOMContentLoaded',watch,{once:true});
  setTimeout(sync,500);
  setTimeout(sync,1500);
})();
