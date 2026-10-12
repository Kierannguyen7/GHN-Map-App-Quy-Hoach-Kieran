(function(){
  'use strict';
  function updateCredit(){
    const credit=document.querySelector('#loginOverlay .ops-login-credit');
    if(!credit)return;
    credit.innerHTML='<span>Phần mềm được phát triển bởi</span><b>Kieran Nguyen - Thành viên ĐCL</b>';
    credit.dataset.v124='1';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',updateCredit);else updateCredit();
  setTimeout(updateCredit,500);
})();
