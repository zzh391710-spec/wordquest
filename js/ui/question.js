/*
 * WordQuest · question and new-word cards shared by all modes.
 *
 * QuestionView(q, opts) -> { el, addTime(sec), destroy(), answered }
 *   opts.timeLimit   seconds (0 = no timer)
 *   opts.framing     element shown above the question (speaker, scene ...)
 *   opts.hints       { count(): number, use(): boolean }
 *   opts.settings    profile settings (autoSpeak)
 *   opts.onSettle    called right when the player answers (for animations)
 *   opts.onDone      called after feedback, with the result
 * result = { correct, close, timeout, hinted, ms, given }
 */
(function (WQ) {
  'use strict';

  const h = WQ.h, U = WQ.U, A = WQ.Audio, UI = WQ.UI;
  const PRAISE = ['Nice!', 'Correct!', 'Spot on!', 'Great!', 'Well done!'];

  function renderBlank(text) {
    const parts = text.split('_____');
    const out = [];
    parts.forEach((p, i) => {
      out.push(p);
      if (i < parts.length - 1) out.push(h('span', { class: 'blank', 'aria-label': 'blank' }, '\u00a0'));
    });
    return out;
  }

  function highlight(sentence, word) {
    const parts = sentence.split(new RegExp('(\\b' + U.escapeRegExp(word) + '\\b)', 'i'));
    return parts.map((p, i) => (i % 2 ? h('mark', null, p) : p));
  }

  function promptBlock(q) {
    const w = q.word;
    switch (q.prompt.kind) {
      case 'word':
        return h('div', { class: 'qv-prompt' },
          h('div', { class: 'qv-word', lang: 'en' }, w.word),
          h('div', { class: 'qv-meta' }, w.ipa ? h('span', { class: 'ipa' }, w.ipa) : null, h('span', { class: 'pos' }, w.pos), UI.speakBtn(w.word)));
      case 'def':
        return h('div', { class: 'qv-prompt' },
          h('p', { class: 'qv-def', lang: 'en' }, w.en),
          h('div', { class: 'qv-meta' }, h('span', { class: 'pos' }, w.pos)));
      case 'audio':
        return h('div', { class: 'qv-prompt' },
          h('button', { class: 'listen-btn', type: 'button', 'aria-label': 'Play the word again', onclick: () => A.speak(w.word) }, '🔊'),
          h('div', { class: 'qv-meta' }, h('span', null, 'Press R to replay')));
      case 'sentence':
        return h('div', { class: 'qv-prompt' },
          h('p', { class: 'qv-sentence', lang: 'en' }, renderBlank(q.prompt.text)),
          q.prompt.showDef ? h('p', { class: 'qv-def small', lang: 'en' }, `(${w.pos}) ${w.en}`) : null);
      default:
        return h('div');
    }
  }

  WQ.QuestionView = function (q, opts = {}) {
    const settings = opts.settings || {};
    const timeLimit = opts.timeLimit || 0;
    const t0 = performance.now();
    let deadline = timeLimit ? Date.now() + timeLimit * 1000 : 0;
    let answered = false, hinted = false, closed = false;
    let tick = null, later = null, result = null, contBtn = null;

    const feedback = h('div', { class: 'qv-feedback', 'aria-live': 'polite' });
    const hintOut = h('div', { class: 'qv-hint', 'aria-live': 'polite' });
    const timerBar = timeLimit ? h('div', { class: 'qv-timer', 'aria-hidden': 'true' }, h('span')) : null;

    let optionBtns = [], input = null, checkBtn = null, answerArea;
    if (q.input === 'choice') {
      optionBtns = q.options.map((o, i) => h('button', { class: 'opt', type: 'button', onclick: () => choose(i) },
        h('kbd', null, String(i + 1)), h('span', { class: 'opt-label' }, o.label)));
      answerArea = h('div', { class: 'qv-options' }, optionBtns);
    } else {
      input = h('input', { class: 'qv-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', 'aria-label': 'Your answer', placeholder: 'Type the word', lang: 'en' });
      checkBtn = h('button', { class: 'btn btn-gold', type: 'button', onclick: () => submitTyped() }, 'Check');
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); if (!answered) submitTyped(); }
      });
      answerArea = h('div', { class: 'qv-typing' }, input, checkBtn);
    }

    const hintBtn = opts.hints && q.hint ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: useHint }) : null;
    function refreshHint() {
      if (!hintBtn) return;
      const n = opts.hints.count();
      hintBtn.textContent = `💡 Hint (${n})`;
      hintBtn.disabled = n <= 0 || hinted || answered;
    }
    refreshHint();

    const el = h('div', { class: 'qv' },
      opts.framing || null,
      h('div', { class: 'qv-ask' }, h('span', null, q.ask), hintBtn),
      timerBar,
      promptBlock(q),
      hintOut,
      answerArea,
      feedback);

    function useHint() {
      if (hinted || answered || !opts.hints.use()) return;
      hinted = true;
      refreshHint();
      const w = q.word;
      if (q.hint === 'cn') hintOut.textContent = `中文：${w.cn}`;
      else if (q.hint === 'reveal-word') hintOut.textContent = `The word is: ${w.word}`;
      else if (q.hint === 'fifty') {
        let removed = 0;
        U.shuffle(optionBtns.map((_, i) => i)).forEach((i) => {
          if (removed < 2 && !q.options[i].correct) {
            optionBtns[i].disabled = true;
            optionBtns[i].classList.add('struck');
            removed += 1;
          }
        });
        hintOut.textContent = 'Two wrong answers removed.';
      } else if (q.hint === 'letters') {
        const n = Math.max(1, Math.ceil(w.word.length / 3));
        hintOut.textContent = `Starts with “${w.word.slice(0, n)}” · ${w.word.length} letters`;
        if (input) { input.value = w.word.slice(0, n); input.focus(); }
      }
    }

    const elapsed = () => Math.round(performance.now() - t0);

    function choose(i) {
      if (answered || optionBtns[i].disabled) return;
      const ok = q.options[i].correct;
      optionBtns[i].classList.add(ok ? 'correct' : 'wrong');
      if (!ok) optionBtns[q.options.findIndex((o) => o.correct)].classList.add('correct');
      settle({ correct: ok, given: q.options[i].label });
    }

    function submitTyped() {
      const val = input.value;
      if (!val.trim()) { input.focus(); return; }
      const r = WQ.Engine.checkTyped(q, val);
      input.classList.add(r.correct ? 'correct' : 'wrong');
      input.readOnly = true;
      settle({ correct: r.correct, close: r.close, given: val });
    }

    function timeout() {
      if (answered) return;
      if (q.input === 'choice') optionBtns[q.options.findIndex((o) => o.correct)].classList.add('correct');
      else if (input) input.readOnly = true;
      settle({ correct: false, timeout: true });
    }

    function settle(r) {
      answered = true;
      stopTimer();
      refreshHint();
      optionBtns.forEach((b) => { b.disabled = true; });
      if (checkBtn) checkBtn.disabled = true;
      result = Object.assign({ hinted, ms: elapsed(), close: false, timeout: false }, r);
      const w = q.word;
      if (settings.autoSpeak !== false) A.speak(w.word);
      if (opts.onSettle) { try { opts.onSettle(result); } catch (e) { console.error(e); } }

      if (result.correct) {
        A.sfx('correct');
        feedback.replaceChildren(h('div', { class: 'fb good' },
          h('div', null, U.pick(PRAISE), ' ', h('b', { lang: 'en' }, w.word), ` · ${w.cn}`),
          q.prompt.kind === 'sentence' ? h('div', { class: 'fb-example', lang: 'en' }, highlight(q.sentence || w.example, w.word)) : null));
        later = setTimeout(done, opts.correctDelay == null ? 900 : opts.correctDelay);
      } else {
        A.sfx('wrong');
        contBtn = h('button', { class: 'btn btn-gold', type: 'button', onclick: done }, 'Continue');
        const title = result.timeout ? 'Time is up.' : result.close ? 'Almost. Check the spelling.' : 'Not this time.';
        feedback.replaceChildren(h('div', { class: 'fb bad' },
          h('div', { class: 'fb-title' }, title),
          h('div', { class: 'fb-answer' }, h('b', { lang: 'en' }, w.word), ' ', w.ipa ? h('span', { class: 'ipa' }, w.ipa) : null, ` · ${w.cn}`),
          h('div', { class: 'fb-example', lang: 'en' }, highlight(q.sentence || w.example, w.word)),
          contBtn));
        setTimeout(() => { if (contBtn && contBtn.isConnected) contBtn.focus(); }, 30);
      }
    }

    function done() {
      if (closed) return;
      cleanup();
      if (opts.onDone) opts.onDone(result);
    }

    function onKey(e) {
      if (closed) return;
      if (!el.isConnected) { cleanup(); return; }
      if (e.defaultPrevented) return;
      const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
      if (!answered && q.input === 'choice' && /^[1-9]$/.test(e.key)) {
        const i = Number(e.key) - 1;
        if (optionBtns[i]) { e.preventDefault(); choose(i); }
      } else if (!typing && (e.key === 'r' || e.key === 'R') && (q.prompt.kind === 'audio' || q.prompt.kind === 'word')) {
        A.speak(q.word.word);
      } else if (answered && result && !result.correct && e.key === 'Enter' && document.activeElement !== contBtn) {
        e.preventDefault();
        done();
      }
    }

    function startTimer() {
      if (!timeLimit) return;
      const total = timeLimit * 1000;
      tick = setInterval(() => {
        const left = deadline - Date.now();
        const pct = U.clamp(left / total, 0, 1);
        timerBar.firstChild.style.width = (pct * 100) + '%';
        timerBar.classList.toggle('low', pct < 0.25);
        if (left <= 0) timeout();
      }, 100);
    }
    function stopTimer() { clearInterval(tick); tick = null; }

    function cleanup() {
      closed = true;
      stopTimer();
      clearTimeout(later);
      document.removeEventListener('keydown', onKey);
    }

    document.addEventListener('keydown', onKey);
    startTimer();
    if (q.speak && (q.prompt.kind === 'audio' || settings.autoSpeak !== false)) {
      setTimeout(() => { if (!closed) A.speak(q.word.word); }, 250);
    }
    if (input) setTimeout(() => { if (!closed && input.isConnected) input.focus(); }, 60);

    return {
      el,
      addTime(sec) { if (timeLimit && !answered) deadline += sec * 1000; },
      destroy: cleanup,
      get answered() { return answered; }
    };
  };

  /** Introduces a word the first time it appears in a session */
  WQ.IntroCard = function (entry, opts = {}) {
    const w = entry.word;
    let closed = false;
    const btn = h('button', { class: 'btn btn-gold', type: 'button', onclick: done }, opts.cta || 'Got it');
    const el = h('div', { class: 'intro-card' },
      h('div', { class: 'intro-label' }, opts.label || 'New word'),
      h('div', { class: 'qv-word', lang: 'en' }, w.word),
      h('div', { class: 'qv-meta' }, w.ipa ? h('span', { class: 'ipa' }, w.ipa) : null, h('span', { class: 'pos' }, w.pos), UI.speakBtn(w.word)),
      h('p', { class: 'intro-cn' }, w.cn),
      h('p', { class: 'intro-en', lang: 'en' }, w.en),
      h('p', { class: 'intro-ex', lang: 'en' }, highlight(w.example, w.word)),
      btn);

    function onKey(e) {
      if (closed) return;
      if (!el.isConnected) { cleanup(); return; }
      if (e.key === 'Enter' && document.activeElement !== btn && !e.defaultPrevented) { e.preventDefault(); done(); }
    }
    function cleanup() { closed = true; document.removeEventListener('keydown', onKey); }
    function done() {
      if (closed) return;
      cleanup();
      if (opts.onDone) opts.onDone();
    }

    document.addEventListener('keydown', onKey);
    setTimeout(() => {
      if (closed || !btn.isConnected) return;
      btn.focus();
      if (!opts.settings || opts.settings.autoSpeak !== false) A.speak(w.word);
    }, 80);

    return { el, destroy: cleanup };
  };
})(window.WQ = window.WQ || {});
