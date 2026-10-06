// SPDX-License-Identifier: GPL-3.0-only
// Browser-only sessions are distinct from device backup files.
const FORMAT='sloop-browser-session',VERSION=1;
const integer=(v,min,max)=>{if(!Number.isInteger(v)||v<min||v>max)throw new Error('Invalid session value');return v;};
const list=(v,n,fn)=>{if(!Array.isArray(v)||v.length!==n)throw new Error('Invalid session length');return v.map(fn);};
const name=v=>{if(typeof v!=='string'||v.length>64)throw new Error('Invalid session name');return v;};
const params=v=>list(v,58,x=>integer(x,-8192,8191));
const globals=v=>list(v,32,x=>integer(x,-8192,8191));
const step=s=>({n:integer(s.n,0,4),notes:list(s.notes,4,x=>integer(x,0,127)),time:integer(s.time,0,2),flags:integer(s.flags,0,3),vel:integer(s.vel,0,127),lvl:integer(s.lvl||0,0,255),rat:integer(s.rat||0,0,255)});
const track=(t,k)=>({engine:integer(t.engine,0,8),preset:integer(t.preset,0,127),drum:k===3,p:params(t.p),step:list(t.step,64,step),
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
   slots:structuredClone(state.slots),bank:structuredClone(state.bank),native:native(state.native),
   smp:state.smp.map(s=>({flash:Array.from(s.flash),zones:s.zones,name:s.name,len:s.len,next:s.next}))};
}
export function validate(data) {
 if(data?.format!==FORMAT||data.version!==VERSION)throw new Error('Not a Sloop browser session');
 return {...project(data),solo:integer(data.solo||0,0,15),rec:0,native:native(data.native),
   slots:list(data.slots,4,p=>p===null?null:project(p)),
   bank:list(data.bank,32,p=>p===null?null:({engine:integer(p.engine,0,8),name:name(p.name),p:params(p.p),pattern:list(p.pattern,16,s=>list(s,2,(v,k)=>integer(v,0,k?7:127)))})),
   smp:list(data.smp,3,s=>({flash:Uint8Array.from(list(s.flash,0x14000,v=>integer(v,0,255))),zones:integer(s.zones,0,16),name:name(s.name),len:integer(s.len,0,0x13e00),next:integer(s.next,512,0x14000)}))};
}
let db;
function open() {
 return db||(db=new Promise((resolve,reject)=>{
   const request=indexedDB.open('sloop-browser-workspace',1);
   request.onupgradeneeded=()=>request.result.createObjectStore('sessions');
   request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 }));
}
export async function save(data) {
 const database=await open();
 return new Promise((resolve,reject)=>{const tx=database.transaction('sessions','readwrite');tx.objectStore('sessions').put(data,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
}
export async function load() {
 const database=await open();
 return new Promise((resolve,reject)=>{const r=database.transaction('sessions').objectStore('sessions').get('current');r.onsuccess=()=>resolve(r.result?validate(r.result):null);r.onerror=()=>reject(r.error);});
}
