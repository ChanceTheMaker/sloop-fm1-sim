// SPDX-License-Identifier: GPL-3.0-only
// External controller input for the browser synth; never opens a MIDI output.
export class MIDIInput {
 constructor({send,enabled,changed}){Object.assign(this,{send,enabled,changed});this.notes=new Set();this.deferred=new Set();this.sustain=new Set();this.channels=new Set();this.receive=e=>this.message(e.data);this.refresh=()=>{if(this.port?.state==='disconnected')this.select('');this.changed([...this.access.inputs.values()].filter(p=>p.state==='connected'));};}
 async connect(){if(!this.access){this.access=await navigator.requestMIDIAccess({sysex:false});this.access.addEventListener('statechange',this.refresh);}this.refresh();}
 select(id){this.release();this.port?.removeEventListener('midimessage',this.receive);this.port=this.access?.inputs.get(id)||null;this.port?.addEventListener('midimessage',this.receive);}
 message(data){
  if(!this.enabled()||data.length<2)return;
  const [status,a,b=0]=data,kind=status&240,ch=status&15,key=ch*128+a;
  if(status<128||status>=240||a>127||b>127)return;
  this.channels.add(ch);
  if(kind===144&&b){if(this.deferred.delete(key))this.send([128|ch,a,0]);this.notes.add(key);this.send([status,a,b]);}
  else if(kind===128||kind===144){if(!this.notes.delete(key))return;if(this.sustain.has(ch))this.deferred.add(key);else this.send([128|ch,a,0]);}
  else if(kind===176&&a===64){if(b>=64)this.sustain.add(ch);else{this.sustain.delete(ch);for(const n of [...this.deferred])if(n>>7===ch){this.send([128|ch,n&127,0]);this.deferred.delete(n);}}}
  else if(kind===176&&(a===120||a===123))this.release(ch);
  // The browser engine currently accepts notes; other controller messages
  // are intentionally not treated as patch edits or hardware commands.
 }
 release(channel){for(const n of new Set([...this.notes,...this.deferred]))if(channel===undefined||n>>7===channel){this.send([128|(n>>7),n&127,0]);this.notes.delete(n);this.deferred.delete(n);}for(const ch of [...this.channels])if(channel===undefined||channel===ch){this.sustain.delete(ch);this.channels.delete(ch);}}
}
