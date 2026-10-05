/* WordQuest · shared helpers and a tiny event bus */
(function (WQ) {
  'use strict';

  const U = {};

  U.shuffle = function (arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  U.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  U.clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  U.escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  U.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  U.levenshtein = function (a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  };

  /** Local calendar day as YYYY-MM-DD */
  U.dayKey = function (d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  U.daysBetween = function (fromKey, toKey) {
    return Math.round((new Date(toKey + 'T00:00:00') - new Date(fromKey + 'T00:00:00')) / 86400000);
  };

  U.fmtDuration = function (sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
    return m ? `${m}m ${s}s` : `${s}s`;
  };

  U.fmtDate = (ts) => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  U.relTime = function (ts) {
    const diff = ts - Date.now();
    if (diff <= 0) return 'now';
    const min = diff / 60000;
    if (min < 60) return `in ${Math.ceil(min)} min`;
    const hr = min / 60;
    if (hr < 24) return `in ${Math.round(hr)} h`;
    const d = Math.round(hr / 24);
    return `in ${d} day${d === 1 ? '' : 's'}`;
  };

  const handlers = {};
  WQ.bus = {
    on(evt, fn) { (handlers[evt] = handlers[evt] || []).push(fn); },
    off(evt, fn) { handlers[evt] = (handlers[evt] || []).filter((f) => f !== fn); },
    emit(evt, data) {
      (handlers[evt] || []).slice().forEach((fn) => {
        try { fn(data); } catch (err) { console.error(err); }
      });
    }
  };

  WQ.U = U;
})(window.WQ = window.WQ || {});
