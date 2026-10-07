// SPDX-License-Identifier: GPL-3.0-only
// Standalone presentation by Chance Roth (ChanceTheMaker).
export function mountStandalone(api){
 const host=document.getElementById('firmware-view'),drawer=document.getElementById('utility-drawer');
 const frame=host.querySelector('.native-screen-frame'),toolbar=host.querySelector('.native-toolbar');
 const overlay=document.createElement('div');overlay.className='synth-start';
 const logo=document.createElement('img');logo.src='sloop-boot.svg';logo.alt='Sloop FM-1 Simulator';
 const start=document.createElement('button');start.type='button';start.id='synth-start';start.textContent='Start synth';
 const message=document.createElement('p');message.className='synth-start-message';message.setAttribute('role','status');message.textContent='Click to enable sound';
 overlay.append(logo,start,message);frame.append(overlay);
 const power=document.createElement('button');power.type='button';power.className='synth-power';power.textContent='⏻';power.hidden=true;toolbar.prepend(power);
 const playable=()=>[...host.querySelectorAll('.native-navigation,.native-controls'),document.querySelector('.play-keyboard')];
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
 host.querySelector('.fw-layouts').addEventListener('click',()=>lock(!started));
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
