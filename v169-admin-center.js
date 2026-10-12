(function(){
  'use strict';
  const ACCOUNT_KEY='dcl_user_accounts_v1';
  const AUDIT_KEY='dcl_audit_log_v1';
  const CONFIG_KEY='dcl_admin_config_v1';
  const SESSION_KEY='ghn_dcl_login_ok';
  let activeTab='accounts';
  let selectedAccountId='';
  let logFilterUser='';

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const fmt=v=>(Number(v)||0).toLocaleString('vi-VN',{maximumFractionDigits:2});
  const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const roleLabel=role=>({ADMIN:'ADMIN',GDV:'GĐV',AM:'AM',VIEWER:'VIEWER'}[normalizeRole(role)]||'VIEWER');
  const roleDesc=role=>({ADMIN:'Toàn hệ thống',GDV:'Theo tỉnh',AM:'Theo bưu cục',VIEWER:'Chỉ xem'}[normalizeRole(role)]||'Chỉ xem');

  function normalizeRole(role){
    const value=String(role||'').trim().toUpperCase();
    if(value==='VIEW')return 'VIEWER';
    return ['ADMIN','GDV','AM','VIEWER'].includes(value)?value:'VIEWER';
  }

  function getFeatures(){try{return Array.isArray(all)?all:[]}catch(e){return []}}
  function getBranches(){
    try{
      if(Array.isArray(branches)&&branches.length)return branches.map(b=>({name:b.branch,province:(byBranch?.[b.branch]||b).province||'',raw:b}));
    }catch(e){}
    const map=new Map();
    getFeatures().forEach(f=>{const p=f.properties||{};if(p.branch&&!map.has(p.branch))map.set(p.branch,{name:p.branch,province:p.province||'',raw:{branch:p.branch,province:p.province}})});
    return [...map.values()];
  }
  function provinceId(name){return 'P_'+normalize(name||'khac').toUpperCase()}
  function branchId(name){const code=String(name||'').match(/\b\d{3,}\b/)?.[0];return 'B_'+(code||normalize(name||'bc')).toUpperCase()}
  function branchOwner(name){try{for(const am of Object.keys(amMapping||{})){if((amMapping[am]||[]).includes(name))return am}}catch(e){}return ''}
  function provinceOptions(){
    return [...new Map(getFeatures().map(f=>(f.properties||{}).province).filter(Boolean).map(name=>[provinceId(name),name])).entries()]
      .map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name,'vi'));
  }
  function branchOptions(){
    return getBranches().map(b=>({id:branchId(b.name),name:b.name,province:b.province||'',provinceId:provinceId(b.province||''),am:branchOwner(b.name)}))
      .sort((a,b)=>a.name.localeCompare(b.name,'vi'));
  }

  function readJSON(key,fallback){
    try{const value=localStorage.getItem(key);return value?JSON.parse(value):fallback}catch(e){return fallback}
  }
  function writeJSON(key,value){
    try{localStorage.setItem(key,JSON.stringify(value));return true}catch(e){return false}
  }
  function migrateAccount(account){
    const role=normalizeRole(account.role);
    const provinceNames=account.provinceNames||account.allowed_province_names||account.provinces||[];
    const branchNames=account.branchNames||account.allowed_branch_names||account.branches||[];
    return {
      ...account,
      role,
      fullName:account.fullName||account.full_name||account.name||account.username||'',
      status:account.status==='locked'?'locked':'active',
      scopeType:account.scopeType||(role==='VIEWER'&&branchNames.length?'branch':role==='VIEWER'?'province':''),
      provinceNames,
      branchNames,
      allowed_province_ids:account.allowed_province_ids||provinceNames.map(provinceId),
      allowed_branch_ids:account.allowed_branch_ids||branchNames.map(branchId)
    };
  }
  function readAccounts(){return (Array.isArray(readJSON(ACCOUNT_KEY,[]))?readJSON(ACCOUNT_KEY,[]):[]).map(migrateAccount)}
  function writeAccounts(list){writeJSON(ACCOUNT_KEY,list.map(migrateAccount))}
  function activeAdminCount(list){return (list||readAccounts()).filter(a=>a.status!=='locked'&&normalizeRole(a.role)==='ADMIN').length}
  function currentSession(){try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null')}catch(e){return null}}
  function currentUser(){return currentSession()?.user||null}
  function currentRole(){
    const user=currentUser();
    if(user?.role)return normalizeRole(user.role);
    if(user && !activeAdminCount())return 'ADMIN';
    return 'VIEWER';
  }
  function isAdmin(){return currentRole()==='ADMIN'}
  function audit(action,target,beforeData,afterData){
    const list=readJSON(AUDIT_KEY,[]);
    const actor=currentUser()||{};
    list.unshift({id:'LOG-'+Date.now()+'-'+Math.random().toString(16).slice(2),at:new Date().toISOString(),actor:actor.username||'unknown',action,target:target||'',beforeData:beforeData||null,afterData:afterData||null});
    writeJSON(AUDIT_KEY,list.slice(0,1000));
  }
  function toast(msg){
    let el=$('#v169AdminToast');if(!el){el=document.createElement('div');el.id='v169AdminToast';el.className='v169-toast';document.body.appendChild(el)}
    el.textContent=msg;el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),2600);
  }
  async function hashPassword(username,password){
    if(!window.crypto?.subtle||!password)return '';
    const raw=`${String(username||'').trim().toLowerCase()}:${password}`;
    const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  function selectedValues(id){const el=$('#'+id);return el?$$('option:checked',el).map(o=>o.value):[]}
  function setSelectedValues(id,values){const set=new Set(values||[]),el=$('#'+id);if(el)$$('option',el).forEach(o=>o.selected=set.has(o.value))}
  function branchNamesFromIds(ids){const set=new Set(ids||[]);return branchOptions().filter(b=>set.has(b.id)).map(b=>b.name)}
  function provinceNamesFromIds(ids){const set=new Set(ids||[]);return provinceOptions().filter(p=>set.has(p.id)).map(p=>p.name)}
  function branchNamesForScope(role,provinceIds,branchIds,scopeType){
    role=normalizeRole(role);
    if(role==='ADMIN')return branchOptions().map(b=>b.name);
    if(role==='GDV')return branchOptions().filter(b=>(provinceIds||[]).includes(b.provinceId)).map(b=>b.name);
    if(role==='AM')return branchNamesFromIds(branchIds);
    if(role==='VIEWER'&&scopeType==='branch')return branchNamesFromIds(branchIds);
    if(role==='VIEWER')return branchOptions().filter(b=>(provinceIds||[]).includes(b.provinceId)).map(b=>b.name);
    return [];
  }
  function statsFor(role,provinceIds,branchIds,scopeType){
    const names=branchNamesForScope(role,provinceIds,branchIds,scopeType),set=new Set(names);
    const features=getFeatures().filter(f=>set.has((f.properties||{}).branch));
    return {
      provinces:new Set(features.map(f=>(f.properties||{}).province).filter(Boolean)).size,
      branches:names.length,
      am:new Set(names.map(branchOwner).filter(Boolean)).size,
      wards:new Set(features.map(f=>(f.properties||{}).ward).filter(Boolean)).size,
      volG:features.reduce((s,f)=>s+(Number((f.properties||{}).vol_giao)||0),0),
      area:features.reduce((s,f)=>s+(Number((f.properties||{}).area)||0),0)
    };
  }
  function accountScopeText(a){
    if(a.role==='ADMIN')return 'Toàn hệ thống';
    if(a.role==='GDV')return (a.provinceNames||provinceNamesFromIds(a.allowed_province_ids)).join(', ')||'Chưa gán tỉnh';
    if(a.role==='AM')return `${(a.branchNames||branchNamesFromIds(a.allowed_branch_ids)).length} bưu cục`;
    if(a.scopeType==='branch')return `${(a.branchNames||branchNamesFromIds(a.allowed_branch_ids)).length} bưu cục`;
    return (a.provinceNames||provinceNamesFromIds(a.allowed_province_ids)).join(', ')||'Chưa gán phạm vi';
  }

  function ensureTopbarButton(){
    const topbar=$('.topbar');if(!topbar)return null;
    let btn=$('#v169AdminBtn');
    if(!btn){
      btn=document.createElement('button');
      btn.id='v169AdminBtn';btn.type='button';btn.className='tab v107-main-tab';btn.textContent='🛡️ Quản trị';
      ($('#v107OpsBtn')||$('.brand',topbar))?.insertAdjacentElement('afterend',btn);
    }
    btn.onclick=e=>{e.preventDefault();e.stopPropagation();openAdmin()};
    ['v107NetworkBtn','v107OpsBtn'].forEach(id=>{
      const tab=$('#'+id);
      if(tab&&!tab.dataset.v169Close){
        tab.dataset.v169Close='1';
        tab.addEventListener('click',closeAdmin,true);
      }
    });
    return btn;
  }
  function syncRoleVisibility(){
    const admin=isAdmin(),btn=ensureTopbarButton();
    document.documentElement.classList.toggle('dcl-role-admin',admin);
    document.body.classList.toggle('dcl-role-admin',admin);
    if(btn){btn.hidden=!admin;btn.style.display=admin?'':'none'}
    if(!admin)closeAdmin();
  }
  function ensurePanel(){
    let panel=$('#v169AdminCenter');if(panel)return panel;
    panel=document.createElement('section');panel.id='v169AdminCenter';panel.setAttribute('aria-label','Quản trị hệ thống');
    panel.innerHTML=`<div class="v169-admin-head"><div><h2>Quản trị hệ thống</h2><p>Quản lý tài khoản · Nhật ký thao tác · Cấu hình vận hành</p></div><button class="v169-admin-close" type="button" aria-label="Đóng">×</button></div><nav class="v169-admin-tabs"></nav><div class="v169-admin-content"></div>`;
    $('.v169-admin-close',panel).onclick=closeAdmin;
    document.body.appendChild(panel);
    return panel;
  }
  function openAdmin(){
    if(!isAdmin()){toast('Chỉ ADMIN được mở Quản trị');return}
    const panel=ensurePanel();
    document.body.classList.remove('v106-ops-mode','v98-ops-mode','v107-ops-mode','v77-ops-mode');
    $('#v107OpsPage')&&( $('#v107OpsPage').style.display='none' );
    $('#v121OpsCenter')?.classList.remove('open');
    $('#v118PlanningCenter')?.classList.remove('open');
    $('#v107NetworkBtn')?.classList.remove('active');
    $('#v107OpsBtn')?.classList.remove('active');
    $('#v169AdminBtn')?.classList.add('active');
    panel.classList.add('open');
    renderAdmin();
  }
  function closeAdmin(){
    $('#v169AdminCenter')?.classList.remove('open');
    $('#v169AdminBtn')?.classList.remove('active');
  }
  function renderAdmin(){
    const panel=ensurePanel();
    $('.v169-admin-tabs',panel).innerHTML=[
      ['accounts','1. Quản lý tài khoản'],
      ['logs','2. Nhật ký hệ thống'],
      ['config','3. Cấu hình']
    ].map(([id,label])=>`<button class="v169-admin-tab ${activeTab===id?'active':''}" data-tab="${id}" type="button">${label}</button>`).join('');
    $$('.v169-admin-tab',panel).forEach(btn=>btn.onclick=()=>{activeTab=btn.dataset.tab;renderAdmin()});
    const content=$('.v169-admin-content',panel);
    if(activeTab==='logs')content.innerHTML=logsHTML();
    else if(activeTab==='config')content.innerHTML=configHTML();
    else content.innerHTML=accountsHTML();
    bindAdmin();
  }
  function accountFormAccount(){return readAccounts().find(a=>a.id===selectedAccountId)||null}
  function accountsHTML(){
    const account=accountFormAccount();
    const role=account?.role||'GDV',scopeType=account?.scopeType||'province';
    const accounts=readAccounts();
    return `<div class="v169-grid">
      <div class="v169-card"><h3>${account?'Sửa tài khoản':'Tạo tài khoản'}</h3><p class="v169-help">Role dùng đúng chuẩn ADMIN / GĐV / AM / VIEWER. Bản static lưu hash local để test, production cần dùng backend.</p>
        <div class="v169-row"><div class="v169-field"><label>Username</label><input id="v169User" value="${esc(account?.username||'')}" placeholder="vd: gdv.tiengiang"></div><div class="v169-field"><label>Họ tên</label><input id="v169FullName" value="${esc(account?.fullName||'')}" placeholder="Nguyễn Văn A"></div></div>
        <div class="v169-row"><div class="v169-field"><label>Role</label><select id="v169Role"><option value="ADMIN">ADMIN</option><option value="GDV">GĐV</option><option value="AM">AM</option><option value="VIEWER">VIEWER</option></select></div><div class="v169-field"><label>Trạng thái</label><select id="v169Status"><option value="active">Đang hoạt động</option><option value="locked">Khóa tài khoản</option></select></div></div>
        <div class="v169-field"><label>Mật khẩu tạm ${account?'(bỏ trống nếu giữ nguyên)':'(bắt buộc)'}</label><input id="v169TempPassword" type="password" placeholder="Tạo password tạm, user sẽ đổi ở lần đăng nhập đầu"></div>
        <div class="v169-field v169-scope-viewer"><label>Phạm vi VIEWER</label><select id="v169ViewerScope"><option value="province">Theo tỉnh</option><option value="branch">Theo bưu cục</option></select></div>
        <div class="v169-field v169-scope-province"><label>Tỉnh được quản lý / xem</label><select id="v169ProvinceIds" multiple></select></div>
        <div class="v169-field v169-scope-branch-filter"><label>Lọc bưu cục theo tỉnh</label><select id="v169BranchProvinceFilter" multiple></select></div>
        <div class="v169-field v169-scope-branch"><label>Bưu cục được quản lý / xem</label><select id="v169BranchIds" multiple></select></div>
        <div class="v169-actions"><button class="v169-btn primary" id="v169SaveAccount">Lưu tài khoản</button><button class="v169-btn" id="v169NewAccount">+ Tạo tài khoản</button></div>
      </div>
      <div class="v169-card"><h3>Preview phạm vi quyền</h3><div id="v169ScopePreview" class="v169-mini-grid"></div><div class="v169-warning" style="margin-top:10px"><b>Lưu ý:</b> Frontend này chỉ mô phỏng để thao tác static. Backend thật phải kiểm tra role/phạm vi và trả 403 cho request ngoài quyền.</div></div>
      <div class="v169-card full"><div class="v169-actions" style="justify-content:space-between;margin-top:0"><h3 style="margin:0">Danh sách tài khoản</h3><button class="v169-btn primary" id="v169CreateTop">+ Tạo tài khoản</button></div><div class="v169-table-wrap"><table class="v169-table"><thead><tr><th>Username</th><th>Họ tên</th><th>Role</th><th>Phạm vi quản lý</th><th>Trạng thái</th><th>Lần đăng nhập cuối</th><th>Thao tác</th></tr></thead><tbody>${accounts.map(accountRow).join('')||'<tr><td colspan="7">Chưa có tài khoản. Đăng nhập đầu tiên sẽ tự khởi tạo ADMIN cho bản static.</td></tr>'}</tbody></table></div></div>
    </div><script type="application/json" id="v169FormState">${JSON.stringify({role,scopeType,provinceIds:account?.allowed_province_ids||[],branchIds:account?.allowed_branch_ids||[],branchProvinceIds:account?.allowed_province_ids||[]}).replace(/</g,'\\u003c')}</script>`;
  }
  function accountRow(a){
    const status=a.status==='locked'?'locked':'active';
    return `<tr class="${a.id===selectedAccountId?'selected':''}" data-id="${esc(a.id)}"><td><b>${esc(a.username)}</b><small>${esc(a.id)}</small></td><td>${esc(a.fullName||'')}</td><td><span class="v169-badge">${esc(roleLabel(a.role))}</span><small>${esc(roleDesc(a.role))}</small></td><td>${esc(accountScopeText(a))}</td><td><span class="v169-badge ${status}">${status==='locked'?'Khóa':'Đang hoạt động'}</span>${a.mustChangePassword?'<small>Cần đổi mật khẩu</small>':''}</td><td>${a.lastLoginAt?new Date(a.lastLoginAt).toLocaleString('vi-VN'):'-'}</td><td><div class="v169-split-actions"><button class="v169-link-btn" data-act="edit" data-id="${esc(a.id)}">Sửa</button><button class="v169-link-btn" data-act="${status==='locked'?'unlock':'lock'}" data-id="${esc(a.id)}">${status==='locked'?'Mở khóa':'Khóa'}</button><button class="v169-link-btn" data-act="reset" data-id="${esc(a.id)}">Reset password</button><button class="v169-link-btn" data-act="history" data-id="${esc(a.id)}">Xem lịch sử</button></div></td></tr>`;
  }
  function fillAccountOptions(){
    const state=JSON.parse($('#v169FormState')?.textContent||'{}');
    $('#v169Role').value=state.role||'GDV';$('#v169Status').value=accountFormAccount()?.status||'active';$('#v169ViewerScope').value=state.scopeType||'province';
    const provinceHTML=provinceOptions().map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    $('#v169ProvinceIds').innerHTML=provinceHTML;$('#v169BranchProvinceFilter').innerHTML=provinceHTML;
    setSelectedValues('v169ProvinceIds',state.provinceIds||[]);
    setSelectedValues('v169BranchProvinceFilter',state.branchProvinceIds||[]);
    fillBranchOptions(state.branchIds||[]);
    syncScopeUI();
  }
  function fillBranchOptions(selected){
    const filter=selectedValues('v169BranchProvinceFilter');
    const list=branchOptions().filter(b=>!filter.length||filter.includes(b.provinceId));
    $('#v169BranchIds').innerHTML=list.map(b=>`<option value="${esc(b.id)}">${esc(b.name)} · ${esc(b.province)}${b.am?' · '+esc(b.am):''}</option>`).join('');
    setSelectedValues('v169BranchIds',selected||[]);
  }
  function syncScopeUI(){
    const role=$('#v169Role')?.value||'GDV',viewerScope=$('#v169ViewerScope')?.value||'province';
    const showProvince=role==='GDV'||(role==='VIEWER'&&viewerScope==='province');
    const showBranch=role==='AM'||(role==='VIEWER'&&viewerScope==='branch');
    $('.v169-scope-viewer').style.display=role==='VIEWER'?'block':'none';
    $('.v169-scope-province').style.display=showProvince?'block':'none';
    $('.v169-scope-branch').style.display=showBranch?'block':'none';
    $('.v169-scope-branch-filter').style.display=showBranch?'block':'none';
    updatePreview();
  }
  function updatePreview(){
    const role=$('#v169Role')?.value||'GDV',scopeType=$('#v169ViewerScope')?.value||'province';
    const stats=statsFor(role,selectedValues('v169ProvinceIds'),selectedValues('v169BranchIds'),scopeType);
    $('#v169ScopePreview').innerHTML=[
      ['Vai trò',roleLabel(role)],['Tỉnh',fmt(stats.provinces)],['Bưu cục',fmt(stats.branches)],['AM liên quan',fmt(stats.am)],['Xã/Phường',fmt(stats.wards)],['Vol giao',fmt(stats.volG)],['Diện tích',fmt(Math.round(stats.area))+' km²']
    ].map(x=>`<div class="v169-mini"><span>${esc(x[0])}</span><b>${esc(x[1])}</b></div>`).join('');
  }
  async function saveAccount(){
    const username=$('#v169User').value.trim(),fullName=$('#v169FullName').value.trim(),role=normalizeRole($('#v169Role').value),status=$('#v169Status').value,temp=$('#v169TempPassword').value.trim(),scopeType=$('#v169ViewerScope').value;
    const provinceIds=selectedValues('v169ProvinceIds'),branchIds=selectedValues('v169BranchIds');
    if(!username||!fullName)return toast('Nhập đủ username và họ tên');
    if(!selectedAccountId&&!temp)return toast('Tài khoản mới cần mật khẩu tạm');
    if(role==='GDV'&&!provinceIds.length)return toast('GĐV cần ít nhất 1 tỉnh');
    if(role==='AM'&&!branchIds.length)return toast('AM cần ít nhất 1 bưu cục');
    if(role==='VIEWER'&&scopeType==='province'&&!provinceIds.length)return toast('VIEWER cần phạm vi tỉnh hoặc bưu cục');
    if(role==='VIEWER'&&scopeType==='branch'&&!branchIds.length)return toast('VIEWER cần phạm vi tỉnh hoặc bưu cục');
    const list=readAccounts(),current=list.find(a=>a.id===selectedAccountId);
    const duplicate=list.find(a=>a.id!==selectedAccountId&&String(a.username).toLowerCase()===username.toLowerCase());
    if(duplicate)return toast('Username đã tồn tại');
    if(current&&current.role==='ADMIN'&&current.status!=='locked'&&(role!=='ADMIN'||status==='locked')&&activeAdminCount(list)<=1)return toast('Không thể khóa hoặc hạ quyền ADMIN cuối cùng');
    const now=new Date().toISOString();
    const item={
      ...(current||{}),id:selectedAccountId||'ACC-'+Date.now(),username,fullName,role,status,scopeType,
      allowed_province_ids:(role==='GDV'||(role==='VIEWER'&&scopeType==='province'))?provinceIds:[],
      allowed_branch_ids:(role==='AM'||(role==='VIEWER'&&scopeType==='branch'))?branchIds:[],
      provinceNames:provinceNamesFromIds(provinceIds),
      branchNames:branchNamesFromIds(branchIds),
      updatedAt:now,createdAt:current?.createdAt||now,
      mustChangePassword:temp?true:!!current?.mustChangePassword,
      passwordHash:temp?await hashPassword(username,temp):(current?.passwordHash||''),
      passwordMode:temp?'local-hash':(current?.passwordMode||'local-hash')
    };
    const next=current?list.map(a=>a.id===item.id?item:a):[item,...list];
    writeAccounts(next);audit(current?'UPDATE_USER':'CREATE_USER',username,current,item);selectedAccountId=item.id;renderAdmin();toast(current?'Đã cập nhật tài khoản':'Đã tạo tài khoản');
  }
  function mutateAccount(id,action){
    const list=readAccounts(),account=list.find(a=>a.id===id);if(!account)return;
    if(action==='edit'){selectedAccountId=id;renderAdmin();return}
    if(action==='history'){logFilterUser=account.username;activeTab='logs';renderAdmin();return}
    if(action==='lock'&&account.role==='ADMIN'&&account.status!=='locked'&&activeAdminCount(list)<=1)return toast('Không thể khóa ADMIN cuối cùng');
    if(action==='lock'||action==='unlock'){
      const before={...account};account.status=action==='lock'?'locked':'active';account.sessionRevokedAt=new Date().toISOString();account.updatedAt=new Date().toISOString();
      writeAccounts(list.map(a=>a.id===id?account:a));audit(action==='lock'?'LOCK_USER':'UNLOCK_USER',account.username,before,account);renderAdmin();toast(action==='lock'?'Đã khóa tài khoản':'Đã mở khóa tài khoản');return;
    }
    if(action==='reset')resetPassword(account,list);
  }
  async function resetPassword(account,list){
    const temp='DCL@'+Math.random().toString(36).slice(2,8).toUpperCase();
    const before={...account};
    account.passwordHash=await hashPassword(account.username,temp);account.mustChangePassword=true;account.sessionRevokedAt=new Date().toISOString();account.updatedAt=new Date().toISOString();
    writeAccounts(list.map(a=>a.id===account.id?account:a));audit('RESET_PASSWORD',account.username,before,{...account,passwordHash:'***'});renderAdmin();alert(`Mật khẩu tạm mới cho ${account.username}: ${temp}\nUser sẽ phải đổi mật khẩu khi đăng nhập.`);toast('Đã reset password');
  }
  function logsHTML(){
    const logs=readJSON(AUDIT_KEY,[]);
    const keyword=(logFilterUser||'').toLowerCase();
    const rows=logs.filter(log=>!keyword||String(log.actor+' '+log.target+' '+log.action).toLowerCase().includes(keyword)).slice(0,300);
    return `<div class="v169-card full"><h3>Nhật ký hệ thống</h3><div class="v169-log-filter"><input id="v169LogKeyword" value="${esc(logFilterUser)}" placeholder="Tìm theo user / thao tác"><button class="v169-btn" id="v169ClearLogFilter">Xóa lọc</button></div><div class="v169-table-wrap"><table class="v169-table"><thead><tr><th>Thời gian</th><th>Người thao tác</th><th>Loại thao tác</th><th>Đối tượng</th><th>Chi tiết</th></tr></thead><tbody>${rows.map(log=>`<tr><td>${esc(new Date(log.at).toLocaleString('vi-VN'))}</td><td>${esc(log.actor)}</td><td>${esc(log.action)}</td><td>${esc(log.target||'')}</td><td><small>${esc(JSON.stringify(log.afterData||log.detail||{}).slice(0,260))}</small></td></tr>`).join('')||'<tr><td colspan="5">Chưa có nhật ký.</td></tr>'}</tbody></table></div></div>`;
  }
  function configHTML(){
    const cfg={ptttCommune:65,ptttWard:75,nvxl:900,pickupRatio:4,workDays:28,routeThreshold:85,sessionTimeout:10,...readJSON(CONFIG_KEY,{})};
    return `<div class="v169-grid"><div class="v169-card"><h3>Cấu hình vận hành</h3><p class="v169-help">Các tham số này lưu local để chuẩn bị cho backend cấu hình thật.</p>${[
      ['ptttCommune','Năng suất NVPTTT xã'],['ptttWard','Năng suất NVPTTT phường'],['nvxl','Năng suất NVXL'],['pickupRatio','Hệ số Vol lấy'],['workDays','Số ngày công'],['routeThreshold','Threshold tải route (%)'],['sessionTimeout','Timeout session (giờ)']
    ].map(([key,label])=>`<div class="v169-field"><label>${esc(label)}</label><input id="cfg_${key}" type="number" value="${esc(cfg[key])}"></div>`).join('')}<button class="v169-btn primary" id="v169SaveConfig">Lưu cấu hình</button></div><div class="v169-card"><h3>Backend cần triển khai</h3><div class="v169-warning">Production phải dùng Worker/API với Secure HttpOnly Cookie, D1 bảng users, user_province_permissions, user_branch_permissions, sessions, audit_logs. Frontend không được là lớp bảo mật duy nhất.</div></div></div>`;
  }
  function bindAdmin(){
    if(activeTab==='accounts'){
      fillAccountOptions();
      ['v169Role','v169ViewerScope','v169ProvinceIds','v169BranchIds'].forEach(id=>$('#'+id)?.addEventListener('change',syncScopeUI));
      $('#v169BranchProvinceFilter')?.addEventListener('change',()=>{const selected=selectedValues('v169BranchIds');fillBranchOptions(selected);updatePreview()});
      $('#v169SaveAccount')?.addEventListener('click',saveAccount);
      $('#v169NewAccount')?.addEventListener('click',()=>{selectedAccountId='';renderAdmin()});
      $('#v169CreateTop')?.addEventListener('click',()=>{selectedAccountId='';renderAdmin()});
      $$('.v169-link-btn').forEach(btn=>btn.onclick=()=>mutateAccount(btn.dataset.id,btn.dataset.act));
      $$('#v169AdminCenter tr[data-id]').forEach(row=>row.ondblclick=()=>{selectedAccountId=row.dataset.id;renderAdmin()});
    }else if(activeTab==='logs'){
      $('#v169LogKeyword')?.addEventListener('input',e=>{logFilterUser=e.target.value;renderAdmin()});
      $('#v169ClearLogFilter')?.addEventListener('click',()=>{logFilterUser='';renderAdmin()});
    }else if(activeTab==='config'){
      $('#v169SaveConfig')?.addEventListener('click',()=>{const cfg={};$$('[id^="cfg_"]').forEach(input=>cfg[input.id.replace('cfg_','')]=Number(input.value)||0);writeJSON(CONFIG_KEY,cfg);audit('UPDATE_CONFIG','admin-config',null,cfg);toast('Đã lưu cấu hình')});
    }
  }
  function boot(){
    ensureTopbarButton();syncRoleVisibility();
  }
  window.addEventListener('dcl-auth-changed',syncRoleVisibility);
  window.addEventListener('storage',syncRoleVisibility);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  setTimeout(boot,500);setInterval(syncRoleVisibility,2000);
})();
