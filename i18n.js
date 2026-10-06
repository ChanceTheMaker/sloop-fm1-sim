// SPDX-License-Identifier: GPL-3.0-only
// Shared, local-only translations. User presets and firmware values are never translated.
(() => {
  'use strict';
  const catalogs = window.SloopLocales;
  const languages = [
    {code:'en', name:'English', flag:'US'}, {code:'ja', name:'日本語', flag:'JP'},
  ];
  const key = 'sloop.web.language';
  const resolve = value => {
    const prefix = String(value || '').toLowerCase().split('-')[0];
    return languages.find(l => l.code.toLowerCase().split('-')[0] === prefix)?.code;
  };
  let saved;
  try { saved = localStorage.getItem(key); } catch (_) {}
  let language = resolve(saved) || (navigator.languages || [navigator.language]).map(resolve).find(Boolean) || 'en';
  const listeners = new Set();
  function t(id, values = {}, locale = language) {
    const text = catalogs[locale]?.[id] ?? catalogs.en[id] ?? id;
    return text.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
  }
  const flags = {
    JP:'<path fill="white" d="M0 0h60v40H0z"/><circle fill="#bc002d" cx="30" cy="20" r="12"/>',
    US:'<path fill="white" d="M0 0h60v40H0z"/>'+Array.from({length:7},(_,i)=>`<path fill="#b22234" d="M0 ${i*80/13}h60v${40/13}H0z"/>`).join('')+'<path fill="#3c3b6e" d="M0 0h26v22H0z"/>'+Array.from({length:5},(_,i)=>`<text x="3" y="${5+i*4}" font-size="5" fill="white">⋆⋆⋆⋆⋆</text>`).join(''),
    ES:'<path fill="#aa151b" d="M0 0h60v40H0z"/><path fill="#f1bf00" d="M0 10h60v20H0z"/>',
    FR:'<path fill="#ed2939" d="M0 0h60v40H0z"/><path fill="white" d="M0 0h40v40H0z"/><path fill="#002395" d="M0 0h20v40H0z"/>',
    DE:'<path fill="#ffce00" d="M0 0h60v40H0z"/><path fill="#d00" d="M0 0h60v27H0z"/><path fill="black" d="M0 0h60v13H0z"/>',
    RU:'<path fill="#d52b1e" d="M0 0h60v40H0z"/><path fill="#0039a6" d="M0 0h60v27H0z"/><path fill="white" d="M0 0h60v13H0z"/>',
    CN:'<path fill="#de2910" d="M0 0h60v40H0z"/><text x="5" y="19" font-size="19" fill="#ffde00">★</text><text x="25" y="8" font-size="6" fill="#ffde00">★</text><text x="30" y="14" font-size="6" fill="#ffde00">★</text><text x="30" y="22" font-size="6" fill="#ffde00">★</text><text x="25" y="29" font-size="6" fill="#ffde00">★</text>',
    BR:'<path fill="#009b3a" d="M0 0h60v40H0z"/><path fill="#ffdf00" d="m30 4 26 16-26 16L4 20z"/><circle fill="#002776" cx="30" cy="20" r="10"/><path stroke="white" stroke-width="2" fill="none" d="M21 17q10-2 18 7"/>',
  };
  function mountPicker() {
    const old = document.getElementById('lang');
    if (!old || old.dataset.languagePicker) return;
    const wrap = document.createElement('div'); wrap.className = 'language-picker';
    const trigger = document.createElement('button'); trigger.id = 'lang'; trigger.type = 'button'; trigger.className = 'lang';
    trigger.dataset.languagePicker = 'true'; trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', 'language-options');
    const list = document.createElement('div'); list.id = 'language-options'; list.className = 'language-options'; list.hidden = true;
    list.setAttribute('role', 'group'); list.dataset.i18nAriaLabel = 'ui.language';
    const close = (focus = false) => { list.hidden = true; trigger.setAttribute('aria-expanded', 'false'); if (focus) trigger.focus(); };
    for (const item of languages) {
      const option = document.createElement('button'); option.type = 'button'; option.lang = item.code;
      option.dataset.language = item.code; option.textContent = item.name;
      option.addEventListener('click', () => { setLanguage(item.code); close(true); });
      list.append(option);
    }
    const open = () => { list.hidden = false; trigger.setAttribute('aria-expanded', 'true'); list.querySelector(`[data-language="${language}"]`).focus(); };
    trigger.addEventListener('click', () => list.hidden ? open() : close());
    wrap.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
      if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
      event.preventDefault();
      if (list.hidden) { open(); return; }
      const options = [...list.children], index = options.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length-1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options[next].focus();
    });
    document.addEventListener('pointerdown', event => { if (!wrap.contains(event.target)) close(); });
    wrap.addEventListener('focusout', event => { if (!wrap.contains(event.relatedTarget)) close(); });
    wrap.append(trigger, list); old.replaceWith(wrap);
  }
  function apply(root = document) {
    document.documentElement.lang = language;
    mountPicker();
    const picker = document.getElementById('lang');
    if (picker?.dataset.languagePicker) {
      const item = languages.find(l => l.code === language);
      picker.dataset.language = language;
      picker.innerHTML = `<svg viewBox="0 0 60 40" focusable="false" aria-hidden="true">${flags[item.flag]}</svg>`;
      picker.title = `${t('ui.language')}: ${item.name}`; picker.setAttribute('aria-label', picker.title);
      for (const option of document.querySelectorAll('#language-options [data-language]')) option.setAttribute('aria-pressed', String(option.dataset.language === language));
    }
    for (const node of root.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n, JSON.parse(node.dataset.i18nValues || '{}'));
    for (const attr of ['aria-label','title','placeholder','alt']) {
      for (const node of root.querySelectorAll(`[data-i18n-${attr}]`)) node.setAttribute(attr, t(node.getAttribute(`data-i18n-${attr}`), JSON.parse(node.dataset.i18nValues || '{}')));
    }
    document.title = t(document.body?.classList.contains('installer-page') ? 'ui.installerTitle' : 'ui.editorTitle');
  }
  function setLanguage(value, persist = true) {
    const next = resolve(value) || 'en';
    language = next;
    if (persist) { try { localStorage.setItem(key, next); } catch (_) {} }
    apply();
    for (const fn of listeners) fn(next);
  }
  window.SloopI18n = {languages, resolve, t, apply, setLanguage,
    text(node, id, values = {}) { node.dataset.i18n = id; node.dataset.i18nValues = JSON.stringify(values); node.textContent = t(id, values); },
    get language() { return language; }, onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    namespace(prefix, locale = language) {
      return Object.fromEntries(Object.keys(catalogs.en).filter(k=>k.startsWith(prefix+'.')).map(k=>[k.slice(prefix.length+1),t(k,{},locale)]));
    },
  };
  document.documentElement.lang = language;
  document.addEventListener('DOMContentLoaded', () => apply(), {once:true});
  window.addEventListener('storage', event => { if (event.key === key && event.newValue) setLanguage(event.newValue, false); });
})();
