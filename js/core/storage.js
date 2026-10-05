/* WordQuest · key-value storage on top of localStorage (falls back to memory) */
(function (WQ) {
  'use strict';

  const NS = 'wordquest:v1:';
  const memory = {};
  let persistent = true;

  try {
    const probe = NS + '__probe';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
  } catch (e) {
    persistent = false;
  }

  function readRaw(key) {
    if (persistent) return localStorage.getItem(NS + key);
    return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
  }

  function get(key, fallback) {
    const raw = readRaw(key);
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  function set(key, value) {
    const raw = JSON.stringify(value);
    if (!persistent) { memory[key] = raw; return; }
    try {
      localStorage.setItem(NS + key, raw);
    } catch (e) {
      console.error('Storage write failed', e);
      throw new Error('Browser storage is full or blocked, so progress could not be saved.');
    }
  }

  function remove(key) {
    if (persistent) localStorage.removeItem(NS + key);
    else delete memory[key];
  }

  function keys(prefix = '') {
    const out = [];
    if (persistent) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(NS + prefix)) out.push(k.slice(NS.length));
      }
    } else {
      Object.keys(memory).forEach((k) => { if (k.startsWith(prefix)) out.push(k); });
    }
    return out;
  }

  WQ.Storage = { get, set, remove, keys, persistent };
})(window.WQ = window.WQ || {});
