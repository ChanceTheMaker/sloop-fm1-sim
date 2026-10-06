// SPDX-License-Identifier: GPL-3.0-only
document.addEventListener('DOMContentLoaded',()=>{
 const progress=document.getElementById('install-progress');
 if(progress) {
  let action='go';
  const retry=document.getElementById('install-retry'),studio=document.getElementById('install-studio');
  for(const id of ['go','stock-go'])document.getElementById(id)?.addEventListener('click',()=>{
   action=id;retry.hidden=studio.hidden=true;progress.open=true;
   progress.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  },true);
  retry.addEventListener('click',()=>document.getElementById(action).click());
  window.SloopInstallUI={result(key){
   studio.hidden=key!=='done'||action!=='go';
   retry.hidden=!['error','notfound','denied','lost','stopped','mismatch','foreign','noreply'].includes(key);
  }};
 }
 const button=document.getElementById('back-to-top');
 if(!button)return;
 const sync=()=>{button.hidden=scrollY<300;};
 window.addEventListener('scroll',sync,{passive:true});sync();
 button.addEventListener('click',()=>window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}));
});
