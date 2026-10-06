// SPDX-License-Identifier: GPL-3.0-only
// Bridge native project/preset layouts to the browser's portable JSON session.
export class NativeState {
 constructor(engine){this.e=engine;this.layout=Array.from({length:9},(_,i)=>engine.fw_layout(i));this.v=new DataView(engine.memory.buffer);this.b=new Uint8Array(engine.memory.buffer);}
 empty(){return {n:0,notes:[0,0,0,0],time:2,flags:0,vel:0,lvl:0,rat:0};}
 readProject(kind=0,index=0){
  const p=this.e.fw_buffer(kind,index),v=this.v,[,off,stride,steps]=this.layout;
  if(kind===1&&v.getUint32(p,true)!==0x46554e34)return null;
  const tracks=Array.from({length:4},(_,k)=>{
   const t=p+off+k*stride,s=t+steps;
   return {engine:k===3?0:this.b[t+116],preset:k===3?0:this.b[t+117],drum:k===3,
    p:Array.from({length:58},(_,i)=>v.getInt16(t+i*2,true)),
    step:Array.from({length:64},(_,i)=>{const a=s+i*10;return k===3?this.empty():{notes:Array.from(this.b.subarray(a,a+4)),n:this.b[a+4],time:this.b[a+5],flags:this.b[a+6],vel:this.b[a+7],lvl:this.b[a+8],rat:this.b[a+9]};}),
    dstep:k===3?Array.from({length:64},(_,i)=>{const a=s+i*10;return {on:v.getUint16(a,true),lvl:Array.from({length:16},(_,l)=>(this.b[a+2+(l>>2)]>>((l&3)*2))&3),rat:Array.from({length:16},(_,l)=>(this.b[a+6+(l>>2)]>>((l&3)*2))&3)};}):null};
  });
  return {tracks,g:Array.from({length:32},(_,i)=>v.getInt16(p+8+i*2,true)),sel:this.b[p+72]};
 }
 writeProject(project,kind=0,index=0){
  if(!project){this.e.fw_commit(kind,index,0);return;}
  const p=this.e.fw_buffer(kind,index),v=this.v,[size,off,stride,steps]=this.layout;
  this.b.fill(0,p,p+size);project.g.forEach((x,i)=>v.setInt16(p+8+i*2,x,true));this.b[p+72]=project.sel;
  project.tracks.forEach((t,k)=>{
   const a=p+off+k*stride;t.p.forEach((x,i)=>v.setInt16(a+i*2,x,true));this.b[a+116]=t.engine;this.b[a+117]=t.preset;
   if(k<3)t.step.forEach((s,i)=>this.b.set([...s.notes,s.n,s.time,s.flags,s.vel,s.lvl||0,s.rat||0],a+steps+i*10));
   else t.dstep.forEach((s,i)=>{const q=a+steps+i*10;v.setUint16(q,s.on,true);for(let l=0;l<16;l++){this.b[q+2+(l>>2)]|=(s.lvl[l]&3)<<((l&3)*2);this.b[q+6+(l>>2)]|=(s.rat[l]&3)<<((l&3)*2);}});
  });this.e.fw_commit(kind,index,1);
 }
 readBank(){return Array.from({length:32},(_,k)=>{
  const p=this.e.fw_buffer(2,k),[, , , , ,values,notes,flags]=this.layout;
  if(this.b[p]!==0xa5)return null;
  const name=String.fromCharCode(...this.b.subarray(p+4,p+16)).replace(/\0.*$/,'');
  return {engine:this.b[p+2],name,p:Array.from({length:58},(_,i)=>this.v.getInt16(p+values+i*2,true)),pattern:Array.from({length:16},(_,i)=>[this.b[p+notes+i],this.b[p+flags+i]])};
 });}
 writeBank(bank){bank.forEach((record,k)=>{
  const p=this.e.fw_buffer(2,k),[, , , ,size,values,notes,flags]=this.layout;this.b.fill(0,p,p+size);
  if(record){this.b.set([0xa5,1,record.engine,58],p);this.b.set(Array.from(record.name.replace(/[^\x20-\x7e]/g,'?').slice(0,12),c=>c.charCodeAt(0)),p+4);record.p.forEach((x,i)=>this.v.setInt16(p+values+i*2,x,true));record.pattern.forEach((s,i)=>{this.b[p+notes+i]=s[0];this.b[p+flags+i]=s[1];});}
  this.e.fw_commit(2,k,!!record);
 });}
 read(){
  const p=this.e.fw_buffer(3,0),a=Array.from(this.b.subarray(p,p+36));
  const prefs=Array.from(new Uint32Array(this.e.memory.buffer,this.e.fw_buffer(4,0),5));
  const status=Array.from(new Uint32Array(this.e.memory.buffer,this.e.fw_buffer(5,0),22));
  return {...this.readProject(),slots:Array.from({length:4},(_,i)=>this.readProject(1,i)),bank:this.readBank(),solo:status[11],native:{arrangement:a,prefs},status};
 }
 write(state){
  this.writeProject(state);this.e.synth_solo(state.solo||0);
  state.slots.forEach((p,k)=>this.writeProject(p,1,k));this.writeBank(state.bank);
  const native=state.native||{arrangement:[4,0,0,0,...Array.from({length:16},(_,i)=>[i%4,4]).flat()],prefs:[4,0,0,0,0]};
  this.b.set(native.arrangement,this.e.fw_buffer(3,0));this.e.fw_commit(3,0,1);
  new Uint32Array(this.e.memory.buffer,this.e.fw_buffer(4,0),5).set(native.prefs);this.e.fw_commit(4,0,1);
 }
}
