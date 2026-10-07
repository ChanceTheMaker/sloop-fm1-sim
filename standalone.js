// SPDX-License-Identifier: GPL-3.0-only
// Standalone presentation by Chance Roth (ChanceTheMaker).
export function mountStandalone(api){
 const host=document.getElementById('firmware-view'),drawer=document.getElementById('utility-drawer');
 const frame=host.querySelector('.native-screen-frame'),toolbar=host.querySelector('.native-toolbar');
 // Scale the responsive Device layout as one piece, preserving its proportions.
 // Compensate its flow height so credits follow the visible chassis.
 let fitFrame=0;
 function fitDevice(){
  fitFrame=0;
  if(window.visualViewport && Math.abs(window.visualViewport.scale-1)>.01)return; // Preserve pinch zoom.
  const enabled=host.dataset.layout==='device'&&!drawer.open;
  const height=host.offsetHeight,top=host.getBoundingClientRect().top+window.scrollY;
  const viewport=window.visualViewport?.height||window.innerHeight;
  const bottom=parseFloat(getComputedStyle(document.body).paddingBottom)||0;
  // Landscape needs more reduction to accommodate browser chrome and the keyboard.
  const landscape=matchMedia('(orientation:landscape) and (min-width:560px) and (max-height:500px)').matches;
  const scale=enabled&&height?Math.max(landscape?.45:.72,Math.min(1,(viewport-top-bottom)/height)):1;
  host.style.transform=scale<1?`scale(${scale})`:'';
  host.style.transformOrigin='top center';
  host.style.marginBottom=scale<1?`${height*(scale-1)}px`:'';
  host.dataset.fitScale=scale.toFixed(3);
 }
 function scheduleFit(){if(!fitFrame)fitFrame=requestAnimationFrame(fitDevice);}
 new ResizeObserver(scheduleFit).observe(host);
 new MutationObserver(scheduleFit).observe(host,{attributes:true,attributeFilter:['data-layout','hidden']});
 window.addEventListener('resize',scheduleFit);
 window.visualViewport?.addEventListener('resize',scheduleFit);
 document.fonts.ready.then(scheduleFit);
 scheduleFit();
 const overlay=document.createElement('div');overlay.className='synth-start';
 const logo=document.createElement('img');logo.src='sloop-boot.svg';logo.alt='Sloop FM-1 Simulator';
 const start=document.createElement('button');start.type='button';start.id='synth-start';start.textContent='Start synth';
 const message=document.createElement('p');message.className='synth-start-message';message.setAttribute('role','status');message.textContent='Click to enable sound';
 overlay.append(logo,start,message);frame.append(overlay);
 const power=document.createElement('button');power.type='button';power.className='synth-power';power.textContent='⏻';power.hidden=true;toolbar.prepend(power);
 const tools=document.createElement('div');tools.className='native-play-tools';
 const icon=path=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const shape=document.createElementNS(svg.namespaceURI,'path');shape.setAttribute('d',path);svg.append(shape);return svg;};
 const typing=document.getElementById('play-typing'),typingLabel=typing.closest('label');typingLabel.className='native-typing-toggle';
 typingLabel.querySelector('span').classList.add('sr-only');typingLabel.append(icon('M3 6h18v12H3z M6 9h1 M10 9h1 M14 9h1 M18 9h.1 M6 12h1 M10 12h1 M14 12h1 M18 12h.1 M7 15h10'));
 typingLabel.dataset.i18nTitle='play.typing';typingLabel.title=window.SloopI18n.t('play.typing');tools.append(typingLabel);
 for(const [id,key,path] of [['play-sustain','play.sustain','M4 17h16l-3-8H9z M10 9V5h5 M8 20h8'],['play-stop','play.stop','M7 7h10v10H7z']]){
  const button=document.getElementById(id);button.removeAttribute('data-i18n');button.dataset.i18nTitle=key;button.dataset.i18nAriaLabel=key;
  button.title=window.SloopI18n.t(key);button.setAttribute('aria-label',button.title);button.replaceChildren(icon(path));tools.append(button);
 }
 toolbar.insertBefore(tools,power.nextSibling);
 const playable=()=>[...host.querySelectorAll('.native-navigation,.native-controls'),document.querySelector('.play-keyboard'),tools];
 const lock=on=>playable().forEach(e=>{if(e)e.inert=on;});lock(true);
 let started=false,pending=false;
 api.progress?.(label=>{message.textContent=label+'…';});
 function reflect(){const running=started&&api.isRunning();power.title=running?'Pause audio':'Resume audio';power.setAttribute('aria-label',power.title);power.setAttribute('aria-pressed',String(running));}
 async function activate(){
  if(pending)return;pending=true;start.disabled=true;power.disabled=true;message.textContent='Starting synth…';
  try{if(!started)await api.start();else await api.resume();started=true;overlay.hidden=true;power.hidden=false;lock(false);help.disabled=false;reflect();}
  catch(error){overlay.hidden=false;message.textContent=error.message||'Unable to start audio. Try again.';start.textContent='Try again';lock(true);}
  finally{pending=false;start.disabled=false;power.disabled=false;}
 }
 start.onclick=activate;
 power.onclick=async()=>{if(pending)return;if(!api.isRunning())return activate();pending=true;power.disabled=true;try{await api.pause();lock(true);reflect();}finally{pending=false;power.disabled=false;}};
 // Keep layout changes safe before audio has been enabled.
 host.querySelector('.fw-layouts').addEventListener('click',()=>lock(!started||!api.isRunning()));
 const help=host.querySelector('.native-help-button');help.disabled=true;
 drawer.addEventListener('toggle',()=>{if(drawer.open)api.release();window.dispatchEvent(new Event('resize'));});
 drawer.addEventListener('keydown',e=>{if(e.key==='Escape'){drawer.open=false;drawer.querySelector('summary').focus();}});
 document.addEventListener('pointerdown',e=>{if(drawer.open&&!drawer.contains(e.target))drawer.open=false;});
 // Existing language/theme controls remain available inside the drawer, without a menu.
 const language=document.querySelector('.language-picker')||document.getElementById('lang');
 if(language)document.querySelector('.utility-content').prepend(language);
 const footer=document.querySelector('main>footer');footer.classList.add('device-credits');
 const note=document.createElement('p');note.textContent='Independent browser simulator. Not affiliated with or endorsed by M-VAVE. Browser playback may differ from the physical FM-1.';footer.prepend(note);const source=document.createElement('a');source.href='https://github.com/ChanceTheMaker/sloop_salt/tree/feat/standalone-fm1';source.textContent='Simulator source code';source.target='_blank';source.rel='noopener';const sourceLine=document.createElement('p');sourceLine.append(source);footer.append(sourceLine);
 // Imported sessions continue using the native view.
 document.getElementById('audio-file').addEventListener('change',()=>setTimeout(()=>window.dispatchEvent(new Event('resize')),250));
}
