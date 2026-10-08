// SPDX-License-Identifier: GPL-3.0-only
// Browser-only sessions are distinct from device backup files.
const FORMAT='sloop-browser-session',VERSION=2;
const integer=(v,min,max)=>{if(!Number.isInteger(v)||v<min||v>max)throw new Error('Invalid session value');return v;};
const list=(v,n,fn)=>{if(!Array.isArray(v)||v.length!==n)throw new Error('Invalid session length');return v.map(fn);};
const name=v=>{if(typeof v!=='string'||v.length>64)throw new Error('Invalid session name');return v;};
const params=v=>list(v,61,x=>integer(x,-8192,8191));
const patch=v=>v==null?null:list(v,128,x=>integer(x,0,127));
const globals=v=>list(v,32,x=>integer(x,-8192,8191));
const step=s=>({n:integer(s.n,0,4),notes:list(s.notes,4,x=>integer(x,0,127)),time:integer(s.time,0,2),flags:integer(s.flags,0,3),vel:integer(s.vel,0,127),lvl:integer(s.lvl||0,0,255),rat:integer(s.rat||0,0,255)});
const track=(t,k)=>({engine:integer(t.engine,0,9),preset:integer(t.preset,0,127),drum:k===3,p:params(t.p),step:list(t.step,64,step),
 fm6:patch(t.fm6),micro:list(t.micro||new Array(64).fill(0),64,x=>integer(x,-32,31)),
 fill:list(t.fill||new Array(16).fill(0),16,x=>integer(x,0,255)),
 locks:(()=>{if(!Array.isArray(t.locks||[])||(t.locks||[]).length>24)throw new Error('Invalid locks');return (t.locks||[]).map(l=>({step:integer(l.step,0,63),param:integer(l.param,0,60),value:integer(l.value,-8192,8191)}));})(),
 dstep:k===3?list(t.dstep,64,s=>({on:integer(s.on,0,65535),lvl:list(s.lvl,16,x=>integer(x,0,3)),rat:list(s.rat,16,x=>integer(x,0,3))})):null});
const project=p=>({tracks:list(p.tracks,4,track),sel:integer(p.sel,0,3),g:globals(p.g)});
const native=data=>{
 if(data==null)return undefined;
 const arrangement=list(data.arrangement,36,x=>integer(x,0,255)),prefs=list(data.prefs,5,x=>integer(x,0,0xffffffff));
 integer(arrangement[0],1,16);integer(arrangement[1],0,1);
 for(let i=0;i<16;i++){integer(arrangement[4+i*2],0,3);integer(arrangement[5+i*2],1,64);}
 return {arrangement,prefs};
};
export function snapshot(state) {
 return {format:FORMAT,version:VERSION,...project(state),solo:state.solo||0,
   slots:state.slots.map(p=>p?project(p):null),bank:structuredClone(state.bank),native:native(state.native),fm6bank:(state.fm6bank||new Array(27).fill(null)).map(patch),
   smp:state.smp.map(s=>({flash:Array.from(s.flash),zones:s.zones,name:s.name,len:s.len,next:s.next}))};
}
export function validate(data) {
 if(data?.format!==FORMAT||![1,VERSION].includes(data.version))throw new Error('Not a Sloop browser session');
 if(data.version===1){
   data=structuredClone(data);
   const upgrade=p=>{const old=list(p,58,x=>integer(x,-8192,8191));return [...old.slice(0,50),0,0,0,...old.slice(50)];};
   const upgradeProject=p=>{if(p)p.tracks.forEach(t=>{integer(t.engine,0,8);t.p=upgrade(t.p);});};
   upgradeProject(data);data.slots.forEach(upgradeProject);
   data.bank.forEach(p=>{if(p){integer(p.engine,0,8);p.p=upgrade(p.p);}});
   list(data.smp,3,x=>x);
   data.smp.push({flash:new Array(0x14000).fill(255),zones:0,name:'',len:0,next:512});
   data.fm6bank=new Array(27).fill(null);
 }
 return {...project(data),solo:integer(data.solo||0,0,15),rec:0,native:native(data.native),
   slots:list(data.slots,4,p=>p===null?null:project(p)),
   bank:list(data.bank,32,p=>p===null?null:({engine:integer(p.engine,0,9),name:name(p.name),p:params(p.p),pattern:list(p.pattern,16,s=>list(s,2,(v,k)=>integer(v,0,k?7:127)))})),
   fm6bank:list(data.fm6bank||new Array(27).fill(null),27,patch),
   smp:list(data.smp,4,s=>({flash:Uint8Array.from(list(s.flash,0x14000,v=>integer(v,0,255))),zones:integer(s.zones,0,16),name:name(s.name),len:integer(s.len,0,0x13e00),next:integer(s.next,512,0x14000)}))};
}
let db;
function open() {
 if(db)return db;
 db=new Promise((resolve,reject)=>{
   let settled=false;
   const request=indexedDB.open('sloop-browser-workspace',1);
   const fail=error=>{if(settled)return;settled=true;clearTimeout(timer);reject(error);};
   const timer=setTimeout(()=>fail(new Error('Saved session storage did not respond. Tap Try again.')),7000);
   request.onupgradeneeded=()=>request.result.createObjectStore('sessions');
   request.onsuccess=()=>{if(settled){request.result.close();return;}settled=true;clearTimeout(timer);resolve(request.result);};
   request.onerror=()=>fail(request.error);
   request.onblocked=()=>fail(new Error('Saved session storage is blocked. Close other simulator tabs, then try again.'));
 }).catch(error=>{db=null;throw error;});
 return db;
}
export async function save(data) {
 const database=await open();
 return new Promise((resolve,reject)=>{const tx=database.transaction('sessions','readwrite'),store=tx.objectStore('sessions'),previous=store.get('current');previous.onsuccess=()=>{if(previous.result?.version===1)store.put(previous.result,'before-2.4.1');store.put(data,'current');};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
}
export async function load() {
 const database=await open();
 return new Promise((resolve,reject)=>{const r=database.transaction('sessions').objectStore('sessions').get('current');r.onsuccess=()=>{try{resolve(r.result?validate(r.result):null);}catch(error){reject(error);}};r.onerror=()=>reject(r.error);});
}
