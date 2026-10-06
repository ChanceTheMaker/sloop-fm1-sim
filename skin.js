// SPDX-License-Identifier: GPL-3.0-only
// Website appearance only: never writes device preferences or MIDI.
(() => {
  const root = document.documentElement;
  const I18N = window.SloopI18n;
  const themes = [['sloop', 'SLOOP Original'], ['stage', 'Stage Red'], ['matrix', 'Matrix'], ['dx', 'Vintage DX7'], ['modeld', 'Model D Walnut'],
    ['chocolate', 'Chocolate Factory'], ['vapor', 'Vaporwave'], ['midnight', 'Midnight Studio'],
    ['space', 'Space Mission'], ['bauhaus', 'Bauhaus'], ['ocean', 'Ocean Lab'], ['arcade', 'Arcade \u201984'], ['hicon', 'High Contrast']];
  const read = (key, fallback) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, value); } catch { /* private browsing */ } };
  const requested = new URLSearchParams(location.search);
  if (themes.some(([id]) => id === requested.get('theme'))) {
    save('sloop.web.skin', requested.get('theme'));
    if (['light','dark'].includes(requested.get('mode'))) save('sloop.web.mode', requested.get('mode'));
  }
  root.dataset.skin = themes.some(([id]) => id === read('sloop.web.skin')) ? read('sloop.web.skin') : 'sloop';
  if (themes.some(([id]) => id === requested.get('theme'))) { root.dataset.skin = requested.get('theme'); }
  root.dataset.defaultControls = read('sloop.web.controls') === 'sliders' ? 'sliders' : 'knobs';
  root.dataset.mode = themes.some(([id]) => id === requested.get('theme')) && ['light','dark'].includes(requested.get('mode')) ? requested.get('mode') : read('sloop.web.mode') === 'light' ? 'light' : 'dark';
  root.dataset.contrast = root.dataset.skin === 'hicon' ? 'high' : 'normal';
  root.dataset.fullWidth = read('sloop.web.fullWidth') === 'true' ? 'true' : 'false';
  function sync(input) {
    const min = +input.min, max = +input.max;
    const fraction = max > min ? (+input.value - min) / (max - min) : 0;
    input.parentElement?.style.setProperty('--turn', `${-135 + fraction * 270}deg`);
  }
  function enhance(input) {
    if (input.type !== 'range') return input;
    const shell = document.createElement('span');
    shell.className = 'dial-control';
    const face = document.createElement('span');
    face.className = 'dial-face'; face.setAttribute('aria-hidden', 'true');
    shell.append(face, input);
    let drag = null;
    input.addEventListener('pointerdown', e => {
      if (input.closest('[data-controls]')?.dataset.controls !== 'knobs' || input.disabled || e.button !== 0) return;
      e.preventDefault(); input.focus(); input.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, y: e.clientY, value: +input.value };
    });
    input.addEventListener('pointermove', e => {
      if (!drag || drag.id !== e.pointerId) return;
      const step = +input.step || 1, min = +input.min, max = +input.max;
      const value = drag.value + (drag.y - e.clientY) * (max - min) / (e.shiftKey ? 1200 : 160);
      input.value = String(Math.max(min, Math.min(max, min + Math.round((value - min) / step) * step)));
      input.dispatchEvent(new Event('input', { bubbles: true })); sync(input);
    });
    const finish = e => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    input.addEventListener('pointerup', finish);
    input.addEventListener('pointercancel', finish);
    input.addEventListener('lostpointercapture', finish);
    input.addEventListener('input', () => sync(input));
    input.addEventListener('keydown', () => requestAnimationFrame(() => sync(input)));
    input.addEventListener('dblclick', () => sync(input));
    return shell;
  }
  const readJSON = (key, fallback) => { try { return JSON.parse(read(key)) ?? fallback; } catch { return fallback; } };
  const storedCards = readJSON('sloop.web.cards', {});
  const cards = storedCards && typeof storedCards === 'object' && !Array.isArray(storedCards) ? storedCards : {};
  function applyCard(card) {
    const preference = cards[card.dataset.cardKey];
    card.dataset.controls = ['knobs', 'sliders'].includes(preference) ? preference : root.dataset.defaultControls;
  }
  function decorate(container, layoutKey) {
    const sortable = container.id === 'groups';
    const orderKey = `sloop.web.order.${layoutKey}`;
    const saveOrder = () => save(orderKey, JSON.stringify([...container.children].map(c => c.dataset.cardKey)));
    let announce = document.getElementById('card-announcement');
    if (!announce) {
      announce = document.createElement('span'); announce.id = 'card-announcement'; announce.className = 'sr-only';
      announce.setAttribute('aria-live', 'polite'); document.body.append(announce);
    }
    for (const [index, card] of [...container.children].entries()) {
      card.dataset.cardKey ||= `${container.id}:fallback:${index}`;
      applyCard(card);
      const name = card.querySelector('h2')?.textContent.replace(/[\uEA00-\uEB09]/g, '').trim() || I18N.t('ui.section');
      const toolbar = document.createElement('div'); toolbar.className = 'card-tools';
      const select = document.createElement('select'); select.className = 'card-style';
      select.setAttribute('aria-label', I18N.t('ui.controlStyle',{name}));
      select.dataset.i18nAriaLabel = 'ui.controlStyle'; select.dataset.i18nValues = JSON.stringify({name});
      for (const value of ['default','knobs','sliders']) { const option = new Option(I18N.t('ui.'+value), value); option.dataset.i18n = 'ui.'+value; select.add(option); }
      select.value = ['knobs', 'sliders'].includes(cards[card.dataset.cardKey]) ? cards[card.dataset.cardKey] : 'default';
      select.addEventListener('change', () => {
        cards[card.dataset.cardKey] = select.value; save('sloop.web.cards', JSON.stringify(cards)); applyCard(card);
      });
      if (sortable) {
        const handle = document.createElement('button'); handle.type = 'button'; handle.className = 'card-grip';
        handle.textContent = '\u283f'; handle.setAttribute('aria-label', I18N.t('ui.moveCard',{name}));
        handle.dataset.i18nAriaLabel = 'ui.moveCard'; handle.dataset.i18nValues = JSON.stringify({name});
        handle.dataset.i18nTitle = 'ui.dragHelp'; handle.title = I18N.t('ui.dragHelp');
        let drag = null;
        const finish = (commit = false) => {
          if (!drag) return;
          const state = drag; drag = null;
          cancelAnimationFrame(state.frame);
          state.ghost?.remove(); card.classList.remove('reordering');
          container.querySelectorAll('.drop-target').forEach(c => c.classList.remove('drop-target'));
          if (commit && state.active && state.target && state.target !== card && state.target.isConnected) {
            const list = [...container.children];
            container.insertBefore(card, list.indexOf(card) < list.indexOf(state.target) ? state.target.nextSibling : state.target);
            saveOrder(); announce.textContent = I18N.t('ui.movedCard',{name,position:[...container.children].indexOf(card)+1});
          }
          if (card.hasPointerCapture(state.id)) card.releasePointerCapture(state.id);
          document.removeEventListener('keydown', escape);
          window.removeEventListener('blur', cancel);
        };
        const cancel = () => finish(false);
        const escape = e => { if (e.key === 'Escape') { e.preventDefault(); cancel(); } };
        card.addEventListener('pointerdown', e => {
          if (drag || e.button !== 0 || (e.target.closest('input,select,a,.dial-control,button,.studio-widget') && !e.target.closest('.card-grip'))) return;
          e.preventDefault(); handle.focus(); card.setPointerCapture(e.pointerId);
          const box = card.getBoundingClientRect();
          drag = { id:e.pointerId, startX:e.clientX, startY:e.clientY, x:e.clientX, y:e.clientY,
            offsetX:e.clientX-box.x, offsetY:e.clientY-box.y, box, active:false, target:null };
          document.addEventListener('keydown', escape); window.addEventListener('blur', cancel);
        });
        const tick = () => {
          if (!drag?.active) return;
          if (!card.isConnected) { cancel(); return; }
          drag.ghost.style.transform = `translate(${drag.x-drag.offsetX}px,${drag.y-drag.offsetY}px)`;
          const dockTop = document.querySelector('.play-keyboard')?.getBoundingClientRect().top || innerHeight;
          if (drag.y < 65) window.scrollBy(0,-12);
          else if (drag.y > dockTop-35 && drag.y < dockTop) window.scrollBy(0,12);
          const target = document.elementFromPoint(drag.x,drag.y)?.closest('#groups > .group');
          drag.target = target && target !== card ? target : null;
          container.querySelectorAll('.drop-target').forEach(c => c.classList.remove('drop-target'));
          drag.target?.classList.add('drop-target');
          drag.frame = requestAnimationFrame(tick);
        };
        card.addEventListener('pointermove', e => {
          if (!drag || drag.id !== e.pointerId) return;
          drag.x = e.clientX; drag.y = e.clientY;
          if (drag.active || Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY) < 6) return;
          drag.active = true;
          const layer = document.createElement('div'); layer.className = 'groups drag-ghost';
          layer.setAttribute('aria-hidden','true'); layer.inert = true;
          layer.style.width = `${drag.box.width}px`;
          const clone = card.cloneNode(true); clone.style.height = `${drag.box.height}px`;
          const originals = card.querySelectorAll('input,select');
          clone.querySelectorAll('input,select').forEach((e,i) => { e.value = originals[i].value; });
          clone.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
          layer.append(clone); document.body.append(layer); drag.ghost = layer;
          card.classList.add('reordering'); tick();
        });
        card.addEventListener('pointerup', e => {
          if (drag?.id !== e.pointerId) return;
          drag.target = document.elementFromPoint(e.clientX,e.clientY)?.closest('#groups > .group');
          finish(true);
        });
        card.addEventListener('pointercancel', e => { if (drag?.id === e.pointerId) cancel(); });
        card.addEventListener('lostpointercapture', e => { if (drag?.id === e.pointerId) cancel(); });
        handle.addEventListener('keydown', e => {
          const list = [...container.children], from = list.indexOf(card);
          const to = { ArrowLeft:from-1, ArrowUp:from-1, ArrowRight:from+1, ArrowDown:from+1, Home:0, End:list.length-1 }[e.key];
          if (to == null) return;
          e.preventDefault();
          if (to < 0 || to >= list.length || to === from) return;
          container.insertBefore(card, to > from ? list[to].nextSibling : list[to]); handle.focus(); saveOrder();
          announce.textContent = I18N.t('ui.movedCard',{name,position:to+1});
        });
        toolbar.append(handle);
      }
      toolbar.append(select); card.prepend(toolbar);
    }
    if (sortable) {
      const stored = readJSON(orderKey, []), order = Array.isArray(stored) ? stored : [];
      const ranks = new Map(order.map((key, i) => [key, i]));
      container.append(...[...container.children].sort((a,b) => (ranks.get(a.dataset.cardKey) ?? 999) - (ranks.get(b.dataset.cardKey) ?? 999)));
    }
  }
  window.SloopSkin = { enhance, sync, decorate };
  document.addEventListener('DOMContentLoaded', () => {
    const host = document.querySelector('[data-appearance]');
    if (!host) return;
    host.innerHTML = `<label><span data-i18n="ui.websiteTheme"></span><select id="web-skin" data-i18n-aria-label="ui.websiteTheme">${themes.map(([id, name]) => `<option value="${id}">${name}</option>`).join('')}</select></label>` +
      (document.body.classList.contains('editor-page') ? '<label><span data-i18n="ui.soundControls"></span><select id="web-controls" data-i18n-aria-label="ui.soundControls"><option value="knobs" data-i18n="ui.knobs"></option><option value="sliders" data-i18n="ui.sliders"></option></select></label>' : '') +
      '<label><span data-i18n="ui.displayMode"></span><select id="web-mode" data-i18n-aria-label="ui.displayMode"><option value="dark" data-i18n="ui.dark"></option><option value="light" data-i18n="ui.light"></option></select></label>' +
      '<label class="width-toggle"><span data-i18n="ui.fullWidth"></span><input id="web-width" type="checkbox" data-i18n-aria-label="ui.fullWidth"></label>';
    const menu = document.createElement('details'); menu.className = 'settings-menu';
    const trigger = document.createElement('summary'); trigger.textContent = '☰'; trigger.dataset.i18nAriaLabel = 'ui.websiteSettings';
    menu.append(trigger); document.querySelector('.brand-links').append(menu); if(!document.body.classList.contains('standalone-synth'))menu.append(host);else menu.hidden=true;
    document.addEventListener('pointerdown', e => { if (!menu.contains(e.target)) menu.open = false; });
    menu.addEventListener('keydown', e => { if (e.key === 'Escape') { menu.open = false; trigger.focus(); } });
    const width = document.getElementById('web-width'); width.checked = root.dataset.fullWidth === 'true';
    width.addEventListener('change', () => { root.dataset.fullWidth = String(width.checked); save('sloop.web.fullWidth', String(width.checked)); });
    const skin = document.getElementById('web-skin'); skin.value = root.dataset.skin;
    skin.addEventListener('change', () => { root.dataset.skin = skin.value; root.dataset.contrast = skin.value === 'hicon' ? 'high' : 'normal'; save('sloop.web.skin', skin.value); document.dispatchEvent(new Event('sloop:theme-change')); });
    const mode = document.getElementById('web-mode'); mode.value = root.dataset.mode;
    mode.addEventListener('change', () => { root.dataset.mode = mode.value; save('sloop.web.mode', mode.value); });
    const controls = document.getElementById('web-controls');
    if (controls) {
      controls.value = root.dataset.defaultControls;
      controls.addEventListener('change', () => { root.dataset.defaultControls = controls.value; save('sloop.web.controls', controls.value); document.querySelectorAll('[data-card-key]').forEach(applyCard); });
    }
    const keyboard = document.querySelector('.play-keyboard');
    if (keyboard) {
      const tray = document.createElement('button'); tray.type = 'button'; tray.className = 'keyboard-tray';
      tray.setAttribute('aria-controls', 'play-keys');
      const setCollapsed = collapsed => {
        // Release held notes/sustain before hiding the performance controls.
        if (collapsed) window.SloopPlay?.release();
        keyboard.classList.toggle('collapsed', collapsed);
        tray.textContent = collapsed ? '\u25b4 ' + I18N.t('ui.showKeyboard') : '\u25be';
        tray.setAttribute('aria-label', I18N.t(collapsed ? 'ui.showKeyboard' : 'ui.minimizeKeyboard'));
        tray.title = I18N.t(collapsed ? 'ui.showKeyboard' : 'ui.minimizeKeyboard');
        tray.setAttribute('aria-expanded', String(!collapsed));
        save('sloop.web.keyboardCollapsed', String(collapsed));
      };
      tray.addEventListener('click', () => setCollapsed(!keyboard.classList.contains('collapsed')));
      I18N.onChange(() => { const collapsed = keyboard.classList.contains('collapsed'); tray.textContent = collapsed ? '\u25b4 ' + I18N.t('ui.showKeyboard') : '\u25be'; tray.title = I18N.t(collapsed ? 'ui.showKeyboard' : 'ui.minimizeKeyboard'); tray.setAttribute('aria-label', tray.title); });
      keyboard.querySelector('.play-controls').append(tray); setCollapsed(read('sloop.web.keyboardCollapsed') === 'true');
      const measure = () => root.style.setProperty('--keyboard-height', `${Math.ceil(keyboard.getBoundingClientRect().height)}px`);
      new ResizeObserver(measure).observe(keyboard); measure();
    }
    I18N.apply();
  });
})();
