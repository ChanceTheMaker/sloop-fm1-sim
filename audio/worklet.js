// SPDX-License-Identifier: GPL-3.0-only
// Resampling/worklet structure adapted from Chance Roth's Felucca browser port.
import {NativeState} from './native-state.js';
class SloopProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.engine=new WebAssembly.Instance(options.processorOptions.module).exports;
    this.engine.synth_init();
    this.native=new NativeState(this.engine);this.firmware=false;this.events=[];this.uiFrames=0;
    this.samples=new Int32Array(this.engine.memory.buffer);
    this.index=32;this.position=0;this.a=[0,0];this.b=[0,0];
    this.state={tracks:[],g:[]};this.statusFrames=0;
    this.port.onmessage=({data})=>{
      if(data.type==='firmware'||data.type==='nativeSnapshot') {
        if(this.events.length)this.events.push(data);else this.nativeCommand(data);
      } else if(data.type==='panel')this.events.push(data.event);
      else if(data.type==='releasePanel'){this.events=this.events.filter(e=>!Array.isArray(e));this.engine.fw_release();}
      else if(data.type==='state'&&!this.firmware) {
        (data.fm6bank||[]).forEach((p,k)=>{if(JSON.stringify(p)!==JSON.stringify(this.state.fm6bank?.[k])){if(p)new Uint8Array(this.engine.memory.buffer,this.engine.fw_buffer(8,k),128).set(p);this.engine.fw_commit(8,k,!!p);}});
        data.tracks.forEach((t,k)=>{
          const old=this.state.tracks[k];this.engine.synth_target(k);
          if(old?.engine!==t.engine)this.engine.synth_engine(t.engine);
          t.p.forEach((v,i)=>{if(old?.engine!==t.engine||old?.p[i]!==v)this.engine.synth_param(i,v);});
          if(k<3&&t.fm6&&(old?.engine!==t.engine||JSON.stringify(old?.fm6)!==JSON.stringify(t.fm6))){new Uint8Array(this.engine.memory.buffer,this.engine.fw_buffer(7,k),128).set(t.fm6);this.engine.fw_commit(7,k,1);}
          (t.micro||[]).forEach((v,i)=>this.engine.synth_extras(k,0,i,v,0));
          (t.fill||[]).forEach((v,i)=>this.engine.synth_extras(k,1,i,v,0));
          for(let i=0;i<24;i++){const l=t.locks?.[i];this.engine.synth_extras(k,2,i,l?l.step:255,l?((l.param<<16)|(l.value&65535)):0);}
          if(k<3)t.step.forEach((s,i)=>{
            if(JSON.stringify(s)!==JSON.stringify(old?.step?.[i]))this.engine.synth_step(k,i,s.n,s.time,s.flags,s.vel,s.lvl||0,s.rat||0,...s.notes);
          });
          else t.dstep.forEach((s,i)=>{
            const pack=a=>a.reduce((bits,v,k)=>bits|((v&3)<<(k*2)),0)>>>0;
            if(JSON.stringify(s)!==JSON.stringify(old?.dstep?.[i]))this.engine.synth_drum_step(i,s.on,pack(s.lvl),pack(s.rat));
          });
        });
        data.g.forEach((v,i)=>{if(this.state.g[i]!==v)this.engine.synth_global(i,v);});
        this.engine.synth_select(data.sel);this.engine.synth_solo(data.solo||0);this.state=data;
      } else if(data.type==='midi')this.engine.synth_midi(...data.bytes);
      else if(data.type==='transport')this.engine.synth_transport(data.op);
      else if(data.type==='panic'){this.events=this.events.filter(e=>!Array.isArray(e));this.engine.fw_release();this.engine.synth_panic();}
      else if(data.type==='sample') {
        if(data.slot>=0&&data.slot<4&&data.bytes.length===0x14000) {
          new Uint8Array(this.engine.memory.buffer,this.engine.synth_sample_buffer(data.slot),0x14000).set(data.bytes);
          this.engine.synth_sample_apply(data.slot);
        }
      }
    };
  }
  nativeCommand(data){
    if(data.type==='firmware'){
      this.engine.fw_release();this.engine.synth_panic();
      if(data.on)this.native.write(data.state);
      this.firmware=data.on;this.state={tracks:[],g:[]};this.engine.fw_tick();
    }
    this.emitNative(data.id);
  }
  emitNative(id){
    const state=this.native.read();
    const pixels=new Uint16Array(this.engine.memory.buffer,this.engine.fw_screen(),240*240).slice();
    const project=state.status[15]?this.native.readProject(6):null;
    this.port.postMessage({type:'native',id,state,project,pixels},[pixels.buffer]);
  }
  next() {
    if(this.index===32){
      let tick=false;
      if(this.events.length){const event=this.events.shift();if(Array.isArray(event)){this.engine.fw_event(...event);tick=true;}else this.nativeCommand(event);}
      if(this.firmware){
        if(++this.uiFrames>=22){this.uiFrames=0;tick=true;}
      }
      this.offset=this.engine.synth_render()/4;this.index=0;
      if(tick)this.engine.fw_tick();
    }
    const i=this.offset+this.index++*2;
    this.b[0]=Math.max(-1,Math.min(1,this.samples[i]/32768));
    this.b[1]=Math.max(-1,Math.min(1,this.samples[i+1]/32768));
  }
  process(inputs,outputs) {
    const channels=outputs[0];if(!channels.length)return true;
    for(let i=0;i<channels[0].length;i++) {
      while(this.position>=1){this.a[0]=this.b[0];this.a[1]=this.b[1];this.next();this.position--;}
      for(let c=0;c<channels.length;c++)channels[c][i]=this.a[c%2]+(this.b[c%2]-this.a[c%2])*this.position;
      this.position+=44100/sampleRate;
    }
    this.statusFrames+=channels[0].length;
    if(this.statusFrames>=sampleRate/20) {
      if(this.firmware)this.emitNative();
      this.statusFrames=0;
      this.port.postMessage({type:'transport',playing:!!this.engine.synth_playing(),positions:[0,1,2,3].map(k=>this.engine.synth_position(k))});
    }
    return true;
  }
}
registerProcessor('sloop-dsp',SloopProcessor);
