/*
 * Mode D · Echo Runner
 * Hear a word, move into the lane with its meaning before the gate
 * arrives. Every sixth gate is a spelling gate. Speed follows your combo.
 */
(function (WQ) {
  'use strict';

  const h = WQ.h, U = WQ.U, UI = WQ.UI;

  const WAVES = 18;
  const SPELL_EVERY = 6;
  const MAX_HP = 3;
  const START_Y = -14;   // % of track height
  const HIT_Y = 72;      // where the gate meets the runner
  const LANES = ['Left lane', 'Middle lane', 'Right lane'];

  WQ.Modes.register({
    id: 'runner',
    name: 'Echo Runner',
    icon: '🎧',
    tagline: 'Listen to each word, then run into the lane with its meaning.',
    sessionSize: (s) => Math.max(10, s.sessionSize),
    start: (ctx) => run(ctx)
  });

  const shortCn = (cn) => cn.split(/[；;，,]/)[0];

  async function run(ctx) {
    const st = { hp: MAX_HP, wave: 0, score: 0, speed: 0.17, lane: 1, over: false };
    const queue = ctx.entries.slice();
    let qi = 0;
    const next = () => queue[qi++ % queue.length];

    const hud = h('div', { class: 'rn-hud' });
    const lanes = LANES.map((label, i) => h('button', { class: 'rn-lane', type: 'button', 'aria-label': label, onclick: () => move(i) }));
    const player = h('div', { class: 'rn-player', 'aria-hidden': 'true' }, '🏃');
    const track = h('div', { class: 'rn-track' }, lanes, player);
    const reveal = h('div', { class: 'rn-reveal', 'aria-live': 'polite' });
    const panel = h('div', { class: 'rn-panel' });
    ctx.stage.replaceChildren(h('div', { class: 'runner' }, hud, track, reveal, panel));

    let current = null;
    let moveAt = 0;
    let acceptMoves = false;
    let raf = 0;
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));

    function drawHud() {
      hud.replaceChildren(
        UI.hearts(st.hp, MAX_HP),
        h('span', null, `Gate ${Math.min(st.wave + 1, WAVES)}/${WAVES}`),
        h('span', null, `Score ${st.score}`),
        h('span', null, `Combo ×${ctx.tracker.combo}`),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => current && ctx.audio.speak(current.word.word) }, '🔊 Replay (R)'));
    }
    function placePlayer() { player.style.left = (st.lane * 33.333 + 16.667) + '%'; }
    function move(i) {
      if (!acceptMoves) return;
      st.lane = U.clamp(i, 0, 2);
      moveAt = performance.now();
      placePlayer();
    }
    function onKey(e) {
      if (e.target && e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { e.preventDefault(); move(st.lane - 1); }
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { e.preventDefault(); move(st.lane + 1); }
      else if ((e.key === 'r' || e.key === 'R') && current) ctx.audio.speak(current.word.word);
    }
    document.addEventListener('keydown', onKey);
    ctx.onCleanup(() => {
      st.over = true;
      document.removeEventListener('keydown', onKey);
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
    });

    function gate(entry) {
      return new Promise((resolve) => {
        current = entry;
        const w = entry.word;
        const opts = ctx.E.meaningOptions(w, 3);
        const doors = opts.map((o) => h('div', { class: 'rn-door' }, shortCn(o.label)));
        const row = h('div', { class: 'rn-gate', style: { top: START_Y + '%' } }, doors);
        track.appendChild(row);
        let y = START_Y, last = 0;
        const spawn = performance.now();
        moveAt = 0;
        acceptMoves = true;
        reveal.textContent = '';
        ctx.audio.speak(w.word);

        function frame(t) {
          if (st.over) return;
          if (!last) last = t;
          const dt = Math.min(0.05, (t - last) / 1000);
          last = t;
          y += st.speed * 100 * dt;
          row.style.top = y + '%';
          if (y >= HIT_Y) { judge(); return; }
          raf = requestAnimationFrame(frame);
        }
        later(() => { if (!st.over) raf = requestAnimationFrame(frame); }, 600);

        function judge() {
          acceptMoves = false;
          const ok = !!opts[st.lane].correct;
          const ci = opts.findIndex((o) => o.correct);
          doors[ci].classList.add('good');
          if (!ok) doors[st.lane].classList.add('bad');
          const ms = (moveAt > spawn ? moveAt : performance.now()) - spawn;
          ctx.log(entry, 'listen', { correct: ok, ms, hinted: false });
          if (ok) {
            st.score += 10 * (1 + Math.floor(ctx.tracker.combo / 5));
            st.speed = Math.min(0.34, st.speed + 0.012);
            ctx.audio.sfx('correct');
            reveal.textContent = `${w.word} · ${w.cn}`;
          } else {
            st.hp -= 1;
            st.speed = Math.max(0.15, st.speed - 0.03);
            ctx.audio.sfx('wrong');
            UI.animate(track, 'shake');
            reveal.textContent = `${w.word} means ${w.cn}`;
            queue.splice(qi + 2, 0, entry);
          }
          drawHud();
          later(() => { row.remove(); resolve(ok); }, ok ? 650 : 1600);
        }
      });
    }

    async function spellGate(entry) {
      current = entry;
      track.classList.add('dim');
      reveal.textContent = '';
      const res = await ctx.ask(panel, entry, {
        type: 'spell-listen',
        timeLimit: ctx.E.timeFor(ctx.tracker, 25),
        framing: h('p', { class: 'dt-frame' }, 'Spelling gate: type the word you hear to pass.')
      });
      panel.replaceChildren();
      track.classList.remove('dim');
      if (res.correct) st.score += 25;
      else { st.hp -= 1; queue.splice(qi + 2, 0, entry); }
      drawHud();
    }

    placePlayer();
    drawHud();

    // Meet the new words first; the run itself is listening only.
    track.classList.add('dim');
    for (const e of ctx.entries.filter((x) => x.isNew)) {
      if (ctx.finished) return;
      await ctx.intro(panel, e, { label: 'New word for this run', cta: 'Next' });
    }
    if (ctx.finished) return;
    await UI.waitButton(panel,
      h('div', null,
        h('p', null, 'Listen, then move into the lane with the right meaning before the gate reaches you.'),
        h('p', { class: 'muted' }, 'Use ← → or A / D, or tap a lane. Press R to hear the word again. Every sixth gate asks you to spell.')),
      'Start running');
    if (ctx.finished) return;
    track.classList.remove('dim');
    panel.replaceChildren();

    for (st.wave = 0; st.wave < WAVES && st.hp > 0; st.wave++) {
      if (st.over || ctx.finished) return;
      drawHud();
      const entry = next();
      if ((st.wave + 1) % SPELL_EVERY === 0) await spellGate(entry);
      else await gate(entry);
    }
    if (st.over || ctx.finished) return;

    const win = st.hp > 0;
    ctx.audio.sfx(win ? 'win' : 'lose');
    ctx.finish({
      result: win ? 'win' : 'lose',
      title: win ? 'Finish line!' : 'Out of breath',
      summary: `Passed ${Math.min(st.wave, WAVES)} of ${WAVES} gates`,
      score: st.score,
      coins: Math.round(st.score / 10),
      xpBonus: win ? 20 : 0,
      detail: { gates: st.wave, total: WAVES }
    });
  }
})(window.WQ = window.WQ || {});
