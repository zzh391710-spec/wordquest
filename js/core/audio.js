/* WordQuest · pronunciation (Web Speech API) and sound effects (Web Audio) */
(function (WQ) {
  'use strict';

  const A = { settings: { rate: 0.9, accent: 'en-US', sound: true } };
  const synth = window.speechSynthesis;
  A.ttsSupported = !!synth && typeof window.SpeechSynthesisUtterance !== 'undefined';

  let voices = [];
  function loadVoices() {
    if (!A.ttsSupported) return;
    voices = synth.getVoices().filter((v) => /^en/i.test(v.lang));
  }
  if (A.ttsSupported) {
    loadVoices();
    if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', loadVoices);
    else synth.onvoiceschanged = loadVoices;
  }

  function pickVoice() {
    const want = A.settings.accent.toLowerCase();
    const norm = (v) => v.lang.toLowerCase().replace('_', '-');
    return voices.find((v) => norm(v) === want && /natural|enhanced|premium|google|samantha|daniel/i.test(v.name))
      || voices.find((v) => norm(v) === want)
      || voices[0]
      || null;
  }

  A.speak = function (text, rate) {
    if (!A.ttsSupported || !text) return;
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice();
      if (v) u.voice = v;
      u.lang = v ? v.lang : A.settings.accent;
      u.rate = rate || A.settings.rate;
      synth.speak(u);
    } catch (e) {
      console.warn('Speech failed', e);
    }
  };

  A.stop = function () { if (A.ttsSupported) synth.cancel(); };

  let ctx = null;
  function audioCtx() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, start, dur, type = 'sine', gain = 0.12) {
    const c = audioCtx();
    if (!c) return;
    const t = c.currentTime + start;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  const SFX = {
    correct() { tone(660, 0, 0.12, 'triangle'); tone(990, 0.09, 0.16, 'triangle'); },
    wrong() { tone(180, 0, 0.22, 'sawtooth', 0.07); },
    coin() { tone(1320, 0, 0.08, 'square', 0.05); tone(1760, 0.07, 0.12, 'square', 0.05); },
    hit() { tone(140, 0, 0.12, 'square', 0.09); },
    win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.11, 0.22, 'triangle')); },
    lose() { [392, 330, 262].forEach((f, i) => tone(f, i * 0.16, 0.26, 'triangle', 0.1)); }
  };

  A.sfx = function (name) {
    if (!A.settings.sound || !SFX[name]) return;
    try { SFX[name](); } catch (e) { /* audio is optional */ }
  };

  A.configure = function (s) {
    if (!s) return;
    Object.assign(A.settings, { rate: s.speechRate, accent: s.accent, sound: s.sound });
  };

  WQ.Audio = A;
})(window.WQ = window.WQ || {});
