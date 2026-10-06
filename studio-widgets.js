// SPDX-License-Identifier: GPL-3.0-only
// Parameter diagrams for Studio. No timers, audio generation, or MIDI transport.
(() => {
  'use strict';
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const SCALE_INTERVALS = [
    [0,1,2,3,4,5,6,7,8,9,10,11], [0,2,4,5,7,9,11], [0,2,3,5,7,8,10],
    [0,2,3,5,7,9,10], [0,2,4,5,7,9,10], [0,2,4,7,9], [0,3,5,7,10],
    [0,2,3,5,7,8,11], [0,1,3,5,7,8,10], [0,2,4,6,7,9,11],
    [0,1,3,5,6,8,10], [0,2,3,5,7,9,11], [0,3,5,6,7,10],
    [0,2,4,6,8,10], [0,1,3,4,6,7,9,10], [0,2,3,5,6,8,9,11]
  ]; // firmware/src/seq.c SCALE_MASK, in descriptor order.
  const SL_PAT = [0x5555,0xB6DB,0x5249,0xB777,0x6D6D,0x0F0F,0x1111,0x54A5,
    0x5333,0xA929,0xAAFF,0xD501,0xAAAA,0xAB6B,0xBB5D,0x7597]; // slicer.c, bit 0 first.
  const NOTES = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
  const scaleNotes = (root, scale) => (SCALE_INTERVALS[scale] || SCALE_INTERVALS[0]).map(n => (n + root + 12) % 12);
  const slicerSteps = pattern => Array.from({length:16}, (_, i) => !!(SL_PAT[clamp(pattern-1,0,15)] & (1<<i)));
  function lfoValue(wave, phase) {
    const p = ((phase % 1) + 1) % 1;
    if (wave === 1) return 1 - 4 * Math.abs(p - .5);
    if (wave === 2) return 2*p - 1;
    if (wave === 3) return p < .5 ? 1 : -1;
    // An example S&H sequence, not the DSP random state.
    if (wave === 4) return [.3,-.65,.8,-.2][((Math.floor(phase)%4)+4)%4];
    return Math.sin(2*Math.PI*p);
  }
  function arpNotes(mode, octaves, order = 0) {
    // Example chord played G-C-E. NOTE sorts it; PLAY preserves that order.
    const played=[7,0,4], base=order ? played : [0,4,7];
    if (!mode) return [];
    const notes=Array.from({length:clamp(octaves,1,4)},(_,o)=>base.map(n=>n+12*o)).flat();
    return Array.from({length:16},(_,i)=> {
      let k=i%notes.length;
      if(mode===2) k=notes.length-1-k;
      if(mode===3) { const cycle=2*notes.length-2, j=i%cycle; k=j<notes.length?j:cycle-j; }
      if(mode===4) k=[11,3,7,1,9,5,10,0,8,2,6,4,11,7,0,5][i]%notes.length;
      return notes[k];
    });
  }
  function envelopePoints(values) {
    const [a,d,s,r]=values.map(v=>clamp(v,0,127));
    // Separate parameter lanes keep a short attack editable beside a long release.
    // This is a shape guide, not a uniformly scaled time axis.
    return [[8,86],[16+a/127*55,12],[88+d/127*55,86-s/127*74],
      [178,86-s/127*74],[198+r/127*54,86]];
  }
  const filterHz = cut => 30*Math.pow(16000/30,clamp(cut,0,127)/127);
  const frequencyX = hz => 8+Math.log(hz/20)/Math.log(1000)*244;
  const filterCutAt = x => clamp(Math.log((20*Math.pow(1000,(x-8)/244))/30)/Math.log(16000/30)*127,0,127);
  function filterY(hz, cut, res) {
    const ratio=hz/filterHz(cut), q=.5+clamp(res,0,127)/127*7.5;
    const db=-10*Math.log10((1-ratio*ratio)**2+(ratio/q)**2);
    return clamp(28-db*.95,8,86);
  }
  const filterHandle = (cut,res) => [frequencyX(filterHz(cut)),filterY(filterHz(cut),cut,res)];
  function filterPoints(cut, res) {
    // Illustrative two-pole LP response, not a measurement of the modulated DSP.
    return Array.from({length:81},(_,i)=>{
      const hz=20*Math.pow(1000,i/80);
      return [frequencyX(hz),filterY(hz,cut,res)];
    });
  }
  function arpSegments(mode,octaves,order,gate) {
    return arpNotes(mode,octaves,order).map((n,i)=>{
      const x=8+i*15.2,y=83-n/43*67;
      return [[x,y],[x+Math.max(1,clamp(gate,0,127)/128*15.2),y]];
    });
  }
  const pathOf = points => points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const svgNode = (tag, attrs) => { const e=document.createElementNS('http://www.w3.org/2000/svg',tag); for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e; };
  function mount(kind, options) {
    const {read, write, format, t, begin, end, reset, filterIds} = options;
    const root=document.createElement('div');root.className=`studio-widget widget-${kind}`;root.dataset.widget=kind;
    const caption=document.createElement('div');caption.className='widget-caption';
    const label=document.createElement('span'), value=document.createElement('span');caption.append(label,value);
    const plot=document.createElement('div');plot.className='widget-plot';
    const svg=svgNode('svg',{viewBox:'0 0 260 96','aria-hidden':'true',preserveAspectRatio:'none'});
    svg.append(svgNode('path',{d:'M8 12H252 M8 49H252 M8 86H252 M69 8V90 M130 8V90 M191 8V90',class:'widget-grid'}));
    const area=svgNode('path',{class:'widget-area'}), line=svgNode('path',{class:'widget-line'});
    svg.append(area,line);plot.append(svg);root.append(caption,plot);
    const controls=document.createElement('div');controls.className='widget-shortcuts';root.append(controls);
    const updateFns=[];
    function button(text, action, aria) {
      const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=action;
      if(aria)b.setAttribute('aria-label',aria);controls.append(b);return b;
    }
    function handle(id, key, point, valueFrom, vertical=false) {
      const b=document.createElement('button');b.type='button';b.className='widget-handle';b.setAttribute('role','slider');
      b.setAttribute('aria-valuemin','0');b.setAttribute('aria-valuemax','127');b.setAttribute('aria-orientation',vertical?'vertical':'horizontal');
      plot.append(b);let pointer=null;
      const setAt=e=>{const box=plot.getBoundingClientRect();write(id,clamp(Math.round(valueFrom((e.clientX-box.left)/box.width*260,(e.clientY-box.top)/box.height*96)),0,127));};
      b.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();b.focus();pointer=e.pointerId;b.setPointerCapture(pointer);begin?.(id);setAt(e);});
      b.addEventListener('pointermove',e=>{if(pointer===e.pointerId)setAt(e);});
      const finish=e=>{if(pointer!==e.pointerId)return;pointer=null;end?.(id);};
      b.addEventListener('pointerup',finish);b.addEventListener('pointercancel',finish);b.addEventListener('lostpointercapture',finish);
      b.addEventListener('dblclick',e=>{e.preventDefault();e.stopPropagation();reset?.(id);});
      b.addEventListener('keydown',e=>{
        const delta={ArrowLeft:-1,ArrowDown:-1,ArrowRight:1,ArrowUp:1}[e.key];
        if(delta==null&&!['Home','End'].includes(e.key))return;
        e.preventDefault();e.stopPropagation();write(id,e.key==='Home'?0:e.key==='End'?127:clamp(read(id)+delta*(e.shiftKey?10:1),0,127));
      });
      updateFns.push(()=>{const [x,y]=point();b.style.left=`${x/260*100}%`;b.style.top=`${y/96*100}%`;b.setAttribute('aria-label',t(key));b.setAttribute('aria-valuenow',read(id));b.setAttribute('aria-valuetext',format(id));b.title=`${t(key)}: ${format(id)}`;});
    }
    if(kind==='env') {
      const points=()=>envelopePoints([1,2,3,4].map(read));
      handle(1,'attack',()=>points()[1],x=>(x-16)/55*127);
      handle(2,'decay',()=>points()[2],x=>(x-88)/55*127);
      handle(3,'sustain',()=>points()[3],(_,y)=>(86-y)/74*127,true);
      handle(4,'release',()=>points()[4],x=>(x-198)/54*127);
    }
    if(kind==='filter') {
      handle(filterIds[0],'cutoff',()=>filterHandle(...filterIds.map(read)),filterCutAt);
    }
    if(kind==='lfo') for(const [i,wave] of ['SIN','TRI','SAW','SQR','S&H'].entries()) {
      const b=button(wave,()=>write(10,i));updateFns.push(()=>{b.setAttribute('aria-label',`${t('waveform')}: ${wave}`);b.setAttribute('aria-pressed',String(read(10)===i));});
    }
    if(kind==='arp') {
      for(let i=1;i<=4;i++) {const b=button(String(i),()=>write(19,i));updateFns.push(()=>{b.setAttribute('aria-label',`${t('octaves')}: ${i}`);b.setAttribute('aria-pressed',String(read(19)===i));});}
      const b=button('HOLD',()=>write(23,read(23)?0:1));updateFns.push(()=>{b.setAttribute('aria-label',t('hold'));b.setAttribute('aria-pressed',String(!!read(23)));});
    }
    if(kind==='scale') {
      plot.hidden=true;
      for(let n=0;n<12;n++) {
        const b=button(NOTES[n],()=>write(25,n));
        updateFns.push(()=>{b.classList.toggle('in-scale',scaleNotes(read(25),read(26)).includes(n));b.setAttribute('aria-pressed',String(read(25)===n));b.setAttribute('aria-label',`${t('root')}: ${NOTES[n]}`);b.title=`${NOTES[n]} · ${t(scaleNotes(read(25),read(26)).includes(n)?'inScale':'outScale')}`;});
      }
    }
    if(kind==='slicer') {
      const prev=button('‹',()=>write(46,read(46)===1?16:read(46)-1));
      const next=button('›',()=>write(46,read(46)===16?1:read(46)+1));
      updateFns.push(()=>{prev.setAttribute('aria-label',t('previousPattern'));next.setAttribute('aria-label',t('nextPattern'));});
    }
    function update() {
      let points=[], summary='', segments=null;
      label.textContent=t({env:'envelope',filter:'filter',lfo:'waveform',scale:'scale',arp:'arpExample',slicer:'slicer'}[kind]);
      root.classList.toggle('widget-off',(kind==='arp'&&!read(17))||(kind==='slicer'&&!read(45)));
      if(kind==='env') {points=envelopePoints([1,2,3,4].map(read));summary=`${format(1)} / ${format(4)}`;}
      if(kind==='filter') {points=filterPoints(...filterIds.map(read));summary=format(filterIds[0]);}
      if(kind==='lfo') {points=Array.from({length:161},(_,i)=>[8+i/160*244,49-33*lfoValue(read(10),i/160*2+read(11)/128)]);summary=format(9);}
      if(kind==='scale') summary=`${format(25)} · ${format(26)}`;
      if(kind==='arp') {
        // Representative pitches only: probability, swing and held notes aren't playback telemetry.
        segments=arpSegments(read(17),read(19),read(24),read(20));
        summary=`${format(17)} · ${format(18)}`;
      }
      if(kind==='slicer') {
        const steps=slicerSteps(read(46));
        points=steps.flatMap((on,i)=>[[8+i*15.2,on?22:read(45)===2?49:22+read(48)/127*61],[8+(i+1)*15.2,on?22:read(45)===2?49:22+read(48)/127*61]]);
        summary=`${format(45)} · ${read(46)}/16`;
      }
      line.setAttribute('d',segments?segments.map(pathOf).join(' '):pathOf(points));
      area.setAttribute('d',points.length?`${pathOf(points)} L252,90 L8,90 Z`:'');
      value.textContent=summary;plot.title=t('previewHelp');plot.setAttribute('role','group');plot.setAttribute('aria-label',`${label.textContent}: ${summary}`);
      for(const update of updateFns)update();
    }
    update();return {element:root,update};
  }
  globalThis.SloopWidgets={mount,scaleNotes,slicerSteps,lfoValue,arpNotes,arpSegments,envelopePoints,filterPoints,filterHandle,filterCutAt};
})();
