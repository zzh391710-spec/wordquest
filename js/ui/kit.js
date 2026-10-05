/* WordQuest · DOM helper, small UI pieces and the screen router */
(function (WQ) {
  'use strict';

  /** h('div', {class, onclick, style, ...}, ...children) */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') {
          for (const sk of Object.keys(v)) {
            if (sk.startsWith('--')) el.style.setProperty(sk, v[sk]);
            else el.style[sk] = v[sk];
          }
        } else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    append(el, kids);
    return el;
  }

  function append(el, kids) {
    kids.forEach((k) => {
      if (k == null || k === false) return;
      if (Array.isArray(k)) append(el, k);
      else el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
    });
  }

  const UI = {};

  UI.mount = function (el) {
    document.getElementById('app').replaceChildren(el);
    window.scrollTo(0, 0);
  };

  let toastTimer = null;
  UI.toast = function (msg, kind = 'info') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show ' + kind;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast'; }, 2600);
  };

  UI.pips = function (n, max, full, empty, label) {
    return h('span', { class: 'pips', role: 'img', 'aria-label': label || `${n} of ${max}` },
      Array.from({ length: max }, (_, i) => h('span', { class: i < n ? 'pip full' : 'pip' }, i < n ? full : empty)));
  };

  UI.hearts = (n, max) => UI.pips(n, max, '♥', '♡', `${n} of ${max} hearts`);

  UI.speakBtn = function (text, label = 'Play pronunciation') {
    return h('button', { class: 'icon-btn', type: 'button', 'aria-label': label, title: label, onclick: () => WQ.Audio.speak(text) }, '🔊');
  };

  UI.bar = function (pct, cls = '') {
    const p = Math.max(0, Math.min(1, pct || 0));
    return h('div', { class: 'bar ' + cls, role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(p * 100)) },
      h('span', { style: { width: (p * 100).toFixed(1) + '%' } }));
  };

  /** A labelled input with an error slot (data-err=name) */
  UI.field = function (label, name, type = 'text', attrs = {}, help = '') {
    const id = 'f-' + name;
    return h('div', { class: 'field' },
      h('label', { for: id }, label),
      h('input', Object.assign({ id, name, type, class: 'input' }, attrs)),
      help ? h('div', { class: 'field-help' }, help) : null,
      h('div', { class: 'field-err', 'data-err': name, role: 'alert' }));
  };

  UI.clearErrors = function (form) {
    form.querySelectorAll('.field-err, .form-err').forEach((e) => { e.textContent = ''; });
    form.querySelectorAll('.input.invalid').forEach((e) => e.classList.remove('invalid'));
  };

  UI.showError = function (form, err) {
    const field = err && err.field;
    const slot = field && form.querySelector(`[data-err="${field}"]`);
    if (slot) {
      slot.textContent = err.message;
      const input = form.querySelector(`[name="${field}"]`);
      if (input) { input.classList.add('invalid'); input.focus(); }
    } else {
      const general = form.querySelector('.form-err');
      if (general) general.textContent = (err && err.message) || 'Something went wrong.';
      else UI.toast((err && err.message) || 'Something went wrong.', 'bad');
    }
  };

  /** Shows a message with one button; resolves when pressed (or Enter). */
  UI.waitButton = function (container, content, cta = 'Continue') {
    return new Promise((resolve) => {
      let done = false;
      const btn = h('button', { class: 'btn btn-gold', type: 'button', onclick: finish }, cta);
      function finish() {
        if (done) return;
        done = true;
        document.removeEventListener('keydown', onKey);
        resolve();
      }
      function onKey(e) {
        if (!btn.isConnected) { document.removeEventListener('keydown', onKey); return; }
        if (e.key === 'Enter' && document.activeElement !== btn && !e.defaultPrevented) { e.preventDefault(); finish(); }
      }
      document.addEventListener('keydown', onKey);
      const body = typeof content === 'string' ? h('p', null, content) : content;
      container.replaceChildren(h('div', { class: 'note-card' }, body, btn));
      setTimeout(() => { if (btn.isConnected) btn.focus(); }, 40);
    });
  };

  UI.animate = function (el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // restart the animation
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 450);
  };

  UI.floatText = function (container, text) {
    const t = h('div', { class: 'float-text', 'aria-hidden': 'true' }, text);
    container.appendChild(t);
    setTimeout(() => t.remove(), 1000);
  };

  UI.download = function (filename, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /* ---------- router ---------- */
  const screens = {};
  WQ.App = {
    current: null,
    register(name, render) { screens[name] = render; },
    async go(name, params) {
      if (!WQ.Auth.user() && name !== 'auth') name = 'auth';
      const render = screens[name];
      if (!render) throw new Error('Unknown screen: ' + name);
      WQ.Audio.stop();
      WQ.App.current = name;
      try {
        await render(params || {});
      } catch (err) {
        console.error(err);
        UI.toast(err.message || 'Something went wrong.', 'bad');
      }
    }
  };

  WQ.h = h;
  WQ.UI = UI;
})(window.WQ = window.WQ || {});
