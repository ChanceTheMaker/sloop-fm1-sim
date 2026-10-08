// SPDX-License-Identifier: GPL-3.0-only
// Web Audio adapter derived from Chance Roth's Felucca browser implementation.
import * as session from './session.js';
export function catalogFrom(module) {
 const meta=new WebAssembly.Instance(module).exports,bytes=new Uint8Array(meta.memory.buffer);
 const text=p=>p?new TextDecoder().decode(bytes.subarray(p,bytes.indexOf(0,p))):'';
 const descriptor=(e,scope,i)=>{
   const [fmt,min,max,def]=[0,1,2,3].map(f=>meta.descriptor_value(e,scope,i,f));
   const label=text(meta.descriptor_text(e,scope,i,-1)),unit=text(meta.descriptor_text(e,scope,i,-2));
   const names=fmt===8?Array.from({length:max-min+1},(_,v)=>text(meta.descriptor_text(e,scope,i,v+min))):null;
   return {label,fmt,min,max,def,names,unit};
 };
 return {common:Array.from({length:meta.param_count()-8},(_,i)=>descriptor(0,0,i)),globals:Array.from({length:meta.global_count()},(_,i)=>descriptor(0,1,i)),
   engines:Array.from({length:meta.engine_count()},(_,e)=>({name:text(meta.engine_name(e)),edit:Array.from({length:8},(_,i)=>descriptor(e,0,meta.param_count()-8+i)),
     presets:Array.from({length:meta.preset_count(e)},(_,p)=>({name:text(meta.preset_name(e,p)),values:Array.from({length:meta.param_count()},(_,i)=>meta.preset_value(e,p,i))}))}))};
}
export function startupDeadline(promise,label,ms=12000){
 let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+' timed out. Tap Try again.')),ms);})]).finally(()=>clearTimeout(timer));
}
export class BrowserSynth {
 prepare(){
   if(!this.prepared){
     const controller=new AbortController();
     this.prepared=startupDeadline((async()=>{
       const response=await fetch(new URL('engine.wasm',import.meta.url),{signal:controller.signal});
       if(!response.ok)throw new Error(window.SloopI18n.t('audio.loadFailed'));
       return WebAssembly.compile(await response.arrayBuffer());
     })(),'Loading the synth engine',20000).catch(error=>{controller.abort();this.prepared=null;throw error;});
   }
   return this.prepared;
 }
 start(){
   if(this.starting)return this.starting;
   const attempt=this.initialize();this.starting=attempt;
   const clear=()=>{if(this.starting===attempt)this.starting=null;};attempt.then(clear,clear);return attempt;
 }
 async initialize() {
   if(this.context&&this.node){
     this.onStartup?.('Enabling audio');
     await startupDeadline(this.context.resume(),'Audio activation',8000);return;
   }
   const Context=window.AudioContext||window.webkitAudioContext;
   if(!Context)throw new Error(window.SloopI18n.t('audio.unavailable'));
   const context=new Context({latencyHint:'interactive'});this.context=context;
   try {
     // Called synchronously from Start synth, before any network or module await.
     this.onStartup?.('Enabling audio');
     await startupDeadline(context.resume(),'Audio activation',8000);
     if(!context.audioWorklet)throw new Error(window.SloopI18n.t('audio.unavailable'));
     this.onStartup?.('Loading synth engine');
     const module=await this.prepare();this.catalog=catalogFrom(module);
     this.onStartup?.('Starting audio engine');
     await startupDeadline(context.audioWorklet.addModule(new URL('worklet.js',import.meta.url)),'Starting the audio engine');
     this.node=new AudioWorkletNode(context,'sloop-dsp',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{module}});
     this.gain=context.createGain();this.gain.gain.value=0.35;
     this.analyser=context.createAnalyser();this.analyser.fftSize=2048;
     this.node.connect(this.gain).connect(context.destination);this.gain.connect(this.analyser);
     this.node.port.onmessage=({data})=>{
       if(data.type==='transport'){this.playing=data.playing;this.positions=data.positions;this.onTransport?.(data);}
       if(data.type==='native'){
         const {status,...state}=data.state;this.nativeStatus=status;this.nativePixels=data.pixels;this.nativeProject=data.project;
         if(this.virtual){Object.assign(this.virtual.state,state);const signature=JSON.stringify(state);
           if(signature!==this.nativeSignature){this.nativeSignature=signature;this.scheduleSave();}}
         this.onNative?.(data);this.nativePending?.get(data.id)?.(data);this.nativePending?.delete(data.id);
       }
     };
     this.node.onprocessorerror=()=>{this.gain.gain.value=0;this.onError?.(new Error(window.SloopI18n.t('audio.failed')));};
   }catch(error){context.close().catch(()=>{});this.context=null;this.node=null;this.signature=null;throw error;}
 }
 async device(factory) {
   if(this.virtual)return this.virtual;
   this.virtual=factory({auto:false,noBackup:true,catalog:this.catalog,midi:bytes=>this.midi(bytes),onChange:(state,cmd)=>{
     this.sync(state);
     if([13,14].includes(cmd))this.samples(state);
     // Read-only protocol replies do not cause storage writes.
     if([3,7,8,9,13,14,18,19,20,21,27,28,30,31,33,38,40,42,69,71].includes(cmd))this.scheduleSave();
   }});
   for(const output of this.virtual.access.outputs.values())output.panic=()=>this.panic();
   const state=this.virtual.state;
   // Start with empty patterns and banks; the silent demo is not a new song.
   for(const t of state.tracks){t.step.forEach(s=>Object.assign(s,{n:0,notes:[0,0,0,0],time:2,flags:0,vel:0,lvl:0,rat:0}));t.dstep?.forEach(s=>{s.on=0;s.lvl.fill(0);s.rat.fill(0);});}
   state.slots.fill(null);state.bank.fill(null);state.fm6bank.fill(null);state.rec=0;
   this.onStartup?.('Restoring saved session');
   try{const saved=await startupDeadline(session.load(),'Restoring the saved session',8000);if(saved)Object.assign(state,saved);}catch(error){this.virtual=null;this.onStorage?.(false);throw error;}
   this.sync(state);this.samples(state);return this.virtual;
 }
 sync(state) {
    if(this.firmwareActive||this.firmwareChanging)return;
   const data={type:'state',sel:state.sel,solo:state.solo,g:state.g,fm6bank:state.fm6bank,tracks:state.tracks.map(t=>({engine:t.engine,p:t.p,step:t.step,dstep:t.dstep,micro:t.micro,locks:t.locks,fill:t.fill,fm6:t.fm6}))};
   const signature=JSON.stringify(data);if(signature===this.signature)return;
   this.signature=signature;this.node.port.postMessage(data);
 }
 samples(state) {state.smp.forEach((s,slot)=>this.node.port.postMessage({type:'sample',slot,bytes:s.flash}));}
 midi(bytes){this.node?.port.postMessage({type:'midi',bytes:Array.from(bytes)});}
 panel(kind,id,value){if(this.firmwareActive)this.node?.port.postMessage({type:'panel',event:[kind,id,value]});}
 releasePanel(){this.node?.port.postMessage({type:'releasePanel'});}
 async firmware(on){
   if(this.firmwareChanging)await this.firmwareChanging;
   if(!!this.firmwareActive===on)return;
   this.firmwareActive=on;this.nativePending??=new Map();const id=(this.nativeId||0)+1;this.nativeId=id;
   const state=on?session.snapshot(this.virtual.state):null;if(state)delete state.smp;
   this.firmwareChanging=new Promise((resolve,reject)=>{
     const timer=setTimeout(()=>{this.nativePending.delete(id);reject(new Error('Firmware mode did not respond'));},5000);
     this.nativePending.set(id,data=>{clearTimeout(timer);resolve(data);});
     this.node.port.postMessage({type:'firmware',on,state,id});
   });
    try{await this.firmwareChanging;this.firmwareChanging=null;this.signature=null;if(!on)this.sync(this.virtual.state);await this.save();}
   finally{this.firmwareChanging=null;}
 }
 transport(op){this.node?.port.postMessage({type:'transport',op});}
 panic(){this.node?.port.postMessage({type:'panic'});}
 volume(value){this.gain?.gain.setTargetAtTime(Math.max(0,Math.min(1,value)),this.context.currentTime,0.015);}
 scheduleSave(){clearTimeout(this.saveTimer);this.saveTimer=setTimeout(()=>this.save(),300);}
  async save(){if(!this.virtual)return;clearTimeout(this.saveTimer);try{await startupDeadline(session.save(session.snapshot({...this.virtual.state,...this.nativeProject})),'Saving the session',8000);this.onStorage?.(true);}catch{this.onStorage?.(false);}}
  async export(){
    if(this.firmwareChanging)await this.firmwareChanging;
    if(this.firmwareActive){
      const id=++this.nativeId;
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.nativePending.delete(id);reject(new Error('Firmware snapshot timed out'));},5000);
        this.nativePending.set(id,data=>{clearTimeout(timer);resolve(data);});this.node.port.postMessage({type:'nativeSnapshot',id});});
    }
    return JSON.stringify(session.snapshot({...this.virtual.state,...this.nativeProject}));
  }
  async import(text){const state=session.validate(JSON.parse(text));await this.firmware(false);this.panic();delete this.virtual.state.native;Object.assign(this.virtual.state,state);this.sync(state);this.samples(state);await this.save();}
 async stop(){if(this.firmwareActive)await this.firmware(false);this.panic();await this.save();if(this.context?.state==='running')await this.context.suspend();}
 async close(){await this.stop();await this.context?.close();this.context=null;this.node=null;this.virtual=null;this.signature=null;}
 showScope(canvas) {
   cancelAnimationFrame(this.scopeFrame);const ctx=canvas.getContext('2d'),samples=new Float32Array(2048);
   const draw=()=>{
     if(!canvas.isConnected||canvas.closest('[hidden]'))return;
     const r=canvas.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,2),w=Math.round(r.width*ratio),h=Math.round(r.height*ratio);
     if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
     ctx.clearRect(0,0,w,h);samples.fill(0);
     if(this.context?.state==='running')this.analyser.getFloatTimeDomainData(samples);
     ctx.strokeStyle=getComputedStyle(canvas).color;ctx.lineWidth=ratio;ctx.beginPath();
     for(let i=0;i<1024;i++){const x=i*w/1023,y=h/2-Math.max(-1,Math.min(1,samples[i]))*h*.46;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}
     ctx.stroke();this.scopeFrame=requestAnimationFrame(draw);
   };draw();
 }
}
