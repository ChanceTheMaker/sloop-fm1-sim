// SPDX-License-Identifier: GPL-3.0-only
// Live wheel selection only inside an open, hovered Studio dropdown.
(() => {
  if (!CSS.supports('appearance','base-select') || !CSS.supports('selector(select:open)')) return;
  const gestures=new WeakMap();
  for (const type of ['pointerdown','keydown','focusin']) document.addEventListener(type,event=>{
    const select=event.target.closest?.('select');
    if (select) gestures.delete(select);
  },true);
  document.addEventListener('wheel',event=>{
    const select=event.target.closest?.('.editor-page select:not([multiple]):not([size])');
    if (!select || select.disabled || !select.matches(':open') ||
        event.ctrlKey || event.metaKey || !event.deltaY || Math.abs(event.deltaX)>Math.abs(event.deltaY)) return;
    // The wheel's target identifies the hovered control/picker. :hover on the
    // select itself is false over its top-layer options in Chromium.
    // The customizable picker is DOM content. Outside/closed controls never
    // enter this handler, and normal keyboard/touch selection stays native.
    event.preventDefault();
    const now=performance.now(), direction=Math.sign(event.deltaY);
    let gesture=gestures.get(select);
    if (!gesture || now-gesture.time>200 || direction!==gesture.direction) gesture={sum:0,direction};
    gesture.time=now;
    gesture.sum+=event.deltaY*(event.deltaMode===1?40:event.deltaMode===2?200:1);
    gestures.set(select,gesture);
    if (Math.abs(gesture.sum)<40) return;
    gesture.sum=0; // one detent per wheel event; small trackpad deltas accumulate
    const options=select.options;
    let index=select.selectedIndex+direction;
    while(index>=0 && index<options.length) {
      const option=options[index];
      if (!option.disabled && !option.hidden && !option.closest('optgroup:disabled,optgroup[hidden]') &&
          getComputedStyle(option).display!=='none') break;
      index+=direction;
    }
    if (index<0 || index>=options.length) return;
    select.selectedIndex=index;
    select.dispatchEvent(new Event('input',{bubbles:true}));
    select.dispatchEvent(new Event('change',{bubbles:true}));
    // The change handler may rebuild/remove a parameter card.
    if (select.isConnected && select.matches(':open'))
      options[index]?.scrollIntoView({block:'nearest',inline:'nearest',container:'nearest'});
  },{passive:false});
})();
