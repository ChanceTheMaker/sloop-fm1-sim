// SPDX-License-Identifier: GPL-3.0-only
// Note ownership adapted from Chance Roth's Felucca Salt BrowserKeyboard.
// SLOOP ignores CC64/120/123: sustain defers note-offs locally; panic releases owned pitches.
class SloopKeyboard {
  constructor(onChange=()=>{}) { this.output=null; this.channel=3; this.held=new Map(); this.deferred=new Set(); this.sustain=false; this.onChange=onChange; }
  send(bytes) { if(!this.output || this.output.state==='disconnected') return false; try {this.output.send(bytes);return true;} catch {return false;} }
  connect(output) { if(output!==this.output) {this.releaseAll();this.output=output;this.onChange();} }
  setChannel(channel) { if(Number.isInteger(channel)&&channel>=0&&channel<16&&channel!==this.channel) {this.releaseAll();this.channel=channel;} }
  press(source,note,velocity) {
    if(!Number.isInteger(note)||note<0||note>127||!Number.isInteger(velocity)||velocity<1||velocity>127) return false;
    if(this.held.get(source)===note)return true;
    this.release(source);
    if(![...this.held.values()].includes(note)) {
      if(this.deferred.delete(note))this.send([0x80|this.channel,note,0]);
      if(!this.send([0x90|this.channel,note,velocity]))return false;
    }
    this.held.set(source,note);this.onChange();return true;
  }
  release(source) {
    if(!this.held.has(source))return;
    const note=this.held.get(source);this.held.delete(source);
    if(![...this.held.values()].includes(note)) {
      if(this.sustain)this.deferred.add(note);else this.send([0x80|this.channel,note,0]);
    }
    this.onChange();
  }
  setSustain(on) {
    this.sustain=!!on;
    if(!on) {for(const note of this.deferred)this.send([0x80|this.channel,note,0]);this.deferred.clear();}
    this.onChange();
  }
  releaseAll() {
    for(const note of new Set([...this.held.values(),...this.deferred]))this.send([0x80|this.channel,note,0]);
    this.held.clear();this.deferred.clear();this.sustain=false;this.onChange();
  }
  panic() {this.releaseAll();}
}
globalThis.SloopKeyboard=SloopKeyboard;
if(typeof document!=='undefined') (()=>{
 const $=id=>document.getElementById(id), I=window.SloopI18n;
 const codes=['KeyA','KeyW','KeyS','KeyE','KeyD','KeyR','KeyF','KeyG','KeyY','KeyH','KeyU','KeyJ','KeyK','KeyO','KeyL','KeyP','Semicolon'];
 const black=n=>[1,3,6,8,10].includes(n%12);
 const name=n=>['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][n%12]+(Math.floor(n/12)-1);
 let device=null, native=null, nativeOctave=null, nativeOctaveUntil=0, lastRoute='', pending=false, layout='', focusedNote=null;
 let docked=false;
 const nativeNotes=new Map();
 const nativeOutput={state:'connected',send(bytes){
  const [status,note,velocity]=bytes,kind=status&240,index=note-base();
  if(kind===128||(kind===144&&!velocity)){
   if(nativeNotes.has(note)){native.panel(2,nativeNotes.get(note),0);nativeNotes.delete(note);return;}
  }else if(kind===144&&$('play-channel').value==='auto'&&index>=0&&index<27){nativeNotes.set(note,index);native.panel(2,index,1);return;}
  device?.output?.send(bytes);
 },panic(){device?.output?.panic?.();}};
 const pointers=new Set(), keyboard=new SloopKeyboard(renderState);
 const base=()=>12*(+$('play-octave').value+1)+5;
 const drums=()=>!native&&device?.track===3&&$('play-channel').value==='auto';
 function pitch(note) {
  if(!drums())return note;
  let lane=-1;for(let n=base();n<=note;n++)if(!black(n))lane++;
  return note>=base()&&note<=base()+26 ? device.lanes[lane]?.[0] : undefined;
 }
 function renderState() {
  const connected=!!keyboard.output&&keyboard.output.state!=='disconnected';
  const held=new Set([...keyboard.held.values(),...keyboard.deferred]);
  $('play-keys').querySelectorAll('button').forEach(b=>{b.disabled=!connected||pitch(+b.dataset.note)==null;b.setAttribute('aria-pressed',String(held.has(pitch(+b.dataset.note))));});
  const keys=[...$('play-keys').querySelectorAll('button:not(:disabled)')];
  const tabKey=keys.find(b=>+b.dataset.note===focusedNote)||keys.find(b=>+b.dataset.note===base())||keys[0];
  for(const b of $('play-keys').children)b.tabIndex=b===tabKey?0:-1;
  $('play-sustain').disabled=$('play-stop').disabled=!connected;
  $('play-sustain').setAttribute('aria-pressed',String(keyboard.sustain));
  $('play-help').textContent=I.t(!connected?'play.connect':device?.mock?'play.mock':drums()?'play.drums':device?.browser?'audio.keyboard':'play.help');
  if(pending&&!keyboard.held.size&&!pointers.size){pending=false;requestAnimationFrame(()=>renderKeys(true));}
 }
 function release(){keyboard.releaseAll();pointers.clear();}
 function route() {
  const requested=$('play-channel').value;
  // Channels 4..16 follow the selected track, except the configurable drum channel.
  const channel=requested==='auto'?(device?.drumChannel===4?4:3):+requested;
  const stamp=`${device?.track}:${device?.drumChannel}:${requested}`;
  if(stamp!==lastRoute){release();lastRoute=stamp;}
  keyboard.setChannel(channel);renderKeys();
 }
 function renderKeys(resize=false) {
  if(resize&&(keyboard.held.size||pointers.size)){pending=true;return;}
  if(!resize)release();
  if(native&&!resize){nativeOctave=+$('play-octave').value-3;nativeOctaveUntil=performance.now()+200;native.panel(3,0,nativeOctave);}
  const start=base(), width=$('play-keys').getBoundingClientRect().width;
  let first=start,last=start+26,whites=16;
  const extra=drums()||(native&&docked)?0:Math.max(0,Math.min(59,Math.floor(width/40)-16));
  for(let i=0;i<extra;i++){
   if((i%2===0&&first>0)||last>=127){if(first===0)break;do{first--;}while(first>0&&black(first));}
   else {do{last++;}while(last<127&&black(last));}
   whites++;
  }
  const key=`${first}:${last}:${start}:${drums()}`;if(resize&&layout===key)return;layout=key;
  const restoreFocus=$('play-keys').contains(document.activeElement);
  $('play-keys').replaceChildren();$('play-keys').style.setProperty('--white-keys',whites);
  let w=0;
  for(let note=first;note<=last;note++){
   const b=document.createElement('button'),dark=black(note),offset=note-start;
   b.type='button';b.dataset.note=note;b.className=[dark?'black':'',note<start||note>start+26?'extended':''].join(' ');
   b.style.left=`${dark?w*100/whites-30/whites:w++*100/whites}%`;
   const label=drums()?device.lanes.find(x=>x[0]===pitch(note))?.[1]:name(note);
   b.setAttribute('aria-label',label||name(note));b.setAttribute('aria-pressed','false');
   const title=document.createElement('span');title.textContent=label;
   const shortcut=document.createElement('small');shortcut.textContent=codes[offset]?.replace('Key','').replace('Semicolon',';')||'\u00a0';
   b.append(title,shortcut);$('play-keys').append(b);
  }
  $('play-oct-down').disabled=+$('play-octave').value<=-1;$('play-oct-up').disabled=+$('play-octave').value>=7;
  renderState();
  if(restoreFocus)$('play-keys').querySelector('[tabindex="0"]')?.focus({preventScroll:true});
 }
 function down(source,note){const n=pitch(+note);if(n!=null)keyboard.press(source,n,+$('play-velocity').value);}
 for(let i=-1;i<=7;i++)$('play-octave').add(new Option('F'+i,i));$('play-octave').value='3';
 for(let i=0;i<16;i++)$('play-channel').add(new Option('MIDI '+(i+1),i));
 $('play-channel').addEventListener('change',route);
 $('play-octave').addEventListener('change',()=>renderKeys());
 for(const [id,delta] of [['play-oct-down',-1],['play-oct-up',1]])$(id).addEventListener('click',()=>{$('play-octave').value=String(Math.max(-1,Math.min(7,+$('play-octave').value+delta)));renderKeys();});
 $('play-velocity').addEventListener('input',()=>{$('play-velocity-value').value=$('play-velocity').value;});
 $('play-typing').addEventListener('change',release);
 $('play-sustain').addEventListener('click',()=>keyboard.setSustain(!keyboard.sustain));
 $('play-stop').addEventListener('click',()=>{release();keyboard.output?.panic?.();});
 $('play-keys').addEventListener('focusin',e=>{
  const b=e.target.closest('button[data-note]');if(!b)return;
  focusedNote=+b.dataset.note;renderState();
 });
 $('play-keys').addEventListener('focusout',()=>{
  keyboard.release('button:Space');keyboard.release('button:Enter');
 });
 $('play-keys').addEventListener('keydown',e=>{
  if(e.altKey||e.ctrlKey||e.metaKey||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  const keys=[...$('play-keys').querySelectorAll('button:not(:disabled)')],index=keys.indexOf(e.target);
  if(index<0)return;
  e.preventDefault();e.stopPropagation();
  const next=e.key==='Home'?0:e.key==='End'?keys.length-1:Math.max(0,Math.min(keys.length-1,index+(e.key==='ArrowRight'?1:-1)));
  keys[next].focus({preventScroll:true});
 });
 $('play-keys').addEventListener('pointerdown',e=>{
  const b=e.target.closest('button[data-note]');if(!b||b.disabled||(e.pointerType==='mouse'&&e.button!==0))return;
  e.preventDefault();b.focus({preventScroll:true});b.setPointerCapture(e.pointerId);pointers.add(e.pointerId);down('pointer:'+e.pointerId,b.dataset.note);
 });
 $('play-keys').addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId))return;
  const b=document.elementFromPoint(e.clientX,e.clientY)?.closest('#play-keys button[data-note]');
  if(b)down('pointer:'+e.pointerId,b.dataset.note);else keyboard.release('pointer:'+e.pointerId);
 });
 for(const type of ['pointerup','pointercancel','lostpointercapture'])window.addEventListener(type,e=>{pointers.delete(e.pointerId);keyboard.release('pointer:'+e.pointerId);});
  window.addEventListener('keydown',e=>{
  if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||e.isComposing||document.querySelector('.play-keyboard.collapsed'))return;
  const b=e.target.closest?.('#play-keys button[data-note]');
  if(b&&['Space','Enter'].includes(e.code)){e.preventDefault();down('button:'+e.code,b.dataset.note);return;}
  if(!$('play-typing').checked||e.target.closest?.('input,select,textarea,button:not(#play-keys button):not(.native-buttons button),a,summary,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="dialog"],[role="tab"]'))return;
  const i=codes.indexOf(e.code);if(i<0||!keyboard.output)return;
  e.preventDefault();down('key:'+e.code,base()+i);
 });
 window.addEventListener('keyup',e=>{keyboard.release('key:'+e.code);keyboard.release('button:'+e.code);});
 window.addEventListener('blur',release);window.addEventListener('pagehide',release);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
 I.onChange(renderState);
 window.SloopPlay={
  dock(on){docked=!!on;renderKeys();},
  update(next){const old=device;device=next;keyboard.connect(next?.output?(native?nativeOutput:next.output):null);const changed=old?.track!==next?.track||old?.drumChannel!==next?.drumChannel;if(changed)route();else renderState();},
  firmware(adapter){release();native=adapter;nativeOctave=null;keyboard.connect(device?.output?(native?nativeOutput:device.output):null);renderKeys();},
  nativeStatus(s){if(!native)return;
   if(device)device.track=s[0];
   const octave=s[21]-4;
   if(nativeOctave===octave||performance.now()>nativeOctaveUntil)nativeOctave=null;
   if(nativeOctave==null&&+$('play-octave').value!==octave+3){release();$('play-octave').value=String(octave+3);renderKeys(true);}
   for(const b of $('play-keys').children){const k=+b.dataset.note-base(),active=k>=0&&k<27;b.classList.toggle('native-lit',active&&!!(s[16]&(1<<k)));b.classList.toggle('native-guide',active&&!!(s[17]&(1<<k)));}
  },
  release
 };
 renderKeys();new ResizeObserver(()=>renderKeys(true)).observe($('play-keys'));
})();
