/*
 * Mode B · Word Detective
 * Inspect objects (clue words), question witnesses (words in context),
 * then complete the deduction with the evidence you collected.
 */
(function (WQ) {
  'use strict';

  const h = WQ.h, U = WQ.U, UI = WQ.UI;

  const CASES = ['The Missing Violin', 'Fog over Baker Lane', 'The Silent Gallery', 'Midnight at the Harbour', 'The Locked Library', 'A Letter Without a Name'];
  const OBJECTS = [
    { e: '🥾', n: 'Muddy boots' }, { e: '✉️', n: 'Torn letter' }, { e: '📔', n: 'Old diary' },
    { e: '🎫', n: 'Train ticket' }, { e: '⌚', n: 'Broken watch' }, { e: '☕', n: 'Cold coffee cup' },
    { e: '🗝️', n: 'Brass key' }, { e: '📰', n: 'Folded newspaper' }
  ];
  const SUSPECTS = [
    { e: '🧔', n: 'Mr Hale', role: 'the butler' }, { e: '👩‍🎨', n: 'Ms Reyes', role: 'the painter' },
    { e: '👨‍💼', n: 'Mr Okafor', role: 'the banker' }, { e: '👵', n: 'Mrs Lindqvist', role: 'the landlady' },
    { e: '🧑‍🔧', n: 'Sam Porter', role: 'the mechanic' }
  ];
  const SCENE_POOL = { recognize: ['def', 'meaning'], recall: ['spell-def', 'cloze-type'], use: ['cloze', 'cloze-type'] };
  const TALK_POOL = { recognize: ['cloze'], recall: ['cloze', 'cloze-type'], use: ['cloze-type'] };
  const MAX_CRED = 3;

  WQ.Modes.register({
    id: 'detective',
    name: 'Word Detective',
    icon: '🔍',
    tagline: 'Read the clues, question the witnesses and name the culprit.',
    sessionSize: () => 8,
    start: (ctx) => run(ctx)
  });

  function suspectCard(s, extraClass = '') {
    return h('div', { class: 'suspect ' + extraClass },
      h('div', { class: 'e', 'aria-hidden': 'true' }, s.e),
      h('div', null, h('b', null, s.n)),
      h('div', { class: 'muted small' }, s.role));
  }

  async function run(ctx) {
    const title = U.pick(CASES);
    const suspects = U.shuffle(SUSPECTS).slice(0, 3);
    const culprit = U.pick(suspects);
    const entries = ctx.entries;
    const sceneEntries = entries.slice(0, Math.min(4, entries.length));
    const talkEntries = entries.length > 4 ? entries.slice(4, 6) : entries.slice(0, 2);
    const objects = U.shuffle(OBJECTS).slice(0, sceneEntries.length).map((o, i) => Object.assign({}, o, { entry: sceneEntries[i], solved: false }));
    const st = { cred: MAX_CRED, evidence: [], deduced: 0, targets: 0 };

    const head = h('div', { class: 'dt-head' });
    const body = h('div', { class: 'dt-body' });
    ctx.stage.replaceChildren(h('div', { class: 'detective' }, head, body));

    function drawHead(phase) {
      head.replaceChildren(
        h('div', null, h('div', { class: 'dt-case' }, title), h('div', { class: 'muted' }, phase)),
        h('div', { class: 'dt-cred' }, h('span', { class: 'muted small' }, 'Credibility '), UI.pips(st.cred, MAX_CRED, '🔎', '·', `Credibility ${st.cred} of ${MAX_CRED}`)));
    }

    function addEvidence(entry) {
      if (!st.evidence.includes(entry)) st.evidence.push(entry);
    }

    async function end(win) {
      if (ctx.finished) return;
      const acc = ctx.tracker.accuracy();
      const hinted = ctx.tracker.answers.some((a) => a.hinted);
      const rating = !win ? '' : acc >= 0.95 && !hinted ? 'S' : acc >= 0.85 ? 'A' : acc >= 0.7 ? 'B' : 'C';
      drawHead(win ? 'Case closed' : 'Case unsolved');
      ctx.audio.sfx(win ? 'win' : 'lose');
      await UI.waitButton(body,
        h('div', null,
          h('div', { class: 'suspects' }, suspects.map((s) => suspectCard(s, s === culprit ? 'culprit' : ''))),
          h('p', null, win ? `Your deduction holds up. It was ${culprit.n}, ${culprit.role}.` : `The trail went cold. It was ${culprit.n}, ${culprit.role}, all along.`),
          win ? h('p', { class: 'dt-rating' }, `Detective rating: ${rating}`) : null),
        'See results');
      ctx.finish({
        result: win ? 'win' : 'lose',
        title: win ? 'Case closed' : 'Case unsolved',
        summary: win ? `${title} · rating ${rating}` : `${title} · unsolved`,
        score: st.evidence.length * 20 + st.deduced * 30 + st.cred * 15,
        coins: win ? 20 : 0,
        xpBonus: win ? 25 : 0,
        detail: { case: title, rating, deduced: st.deduced, targets: st.targets }
      });
    }

    /* Briefing */
    drawHead('Briefing');
    await UI.waitButton(body,
      h('div', null,
        h('p', null, `A new case: “${title}”. Three people were nearby when it happened.`),
        h('div', { class: 'suspects' }, suspects.map((s) => suspectCard(s))),
        h('p', { class: 'muted' }, 'Ink has hidden a word in every clue. Solve the clues, question the witnesses, then present your deduction. Each mistake costs credibility.')),
      'Inspect the scene');

    /* Phase 1: the scene */
    drawHead('Inspecting the scene');
    const sceneFailed = await new Promise((resolve) => {
      const grid = h('div', { class: 'dt-scene' });
      const panel = h('div', { class: 'dt-panel' });
      const evidenceBox = h('div', { class: 'dt-evidence' });
      let busy = false;

      function drawScene() {
        grid.replaceChildren(...objects.map((o) => h('button', {
          class: 'dt-obj' + (o.solved ? ' solved' : ''), type: 'button', disabled: o.solved || busy,
          onclick: () => inspect(o)
        },
        h('span', { class: 'e', 'aria-hidden': 'true' }, o.e),
        h('span', null, o.n),
        o.solved ? h('span', { class: 'word', lang: 'en' }, o.entry.word.word) : h('span', { class: 'muted small' }, 'Inspect'))));
      }
      function drawEvidence() {
        evidenceBox.replaceChildren(...(st.evidence.length
          ? st.evidence.map((e) => h('span', { class: 'tile static', lang: 'en' }, e.word.word))
          : [h('span', { class: 'muted small' }, 'No evidence yet.')]));
      }

      async function inspect(o) {
        busy = true;
        drawScene();
        await ctx.intro(panel, o.entry, { label: 'New word for your notebook', cta: 'Note it down' });
        const framing = h('p', { class: 'dt-frame' }, `${o.e} ${o.n}: part of the note is hidden under an ink stain.`);
        const res = await ctx.ask(panel, o.entry, { pool: SCENE_POOL, framing });
        busy = false;
        if (res.correct) { o.solved = true; addEvidence(o.entry); }
        else { st.cred -= 1; drawHead('Inspecting the scene'); }
        if (st.cred <= 0) { resolve(true); return; }
        drawScene();
        drawEvidence();
        if (objects.every((x) => x.solved)) resolve(false);
        else panel.replaceChildren(h('p', { class: 'muted center' }, res.correct ? 'Evidence added. Pick the next object.' : 'The clue is still unclear. Try it again or pick another object.'));
      }

      body.replaceChildren(grid, panel, h('h3', null, 'Evidence'), evidenceBox);
      drawScene();
      drawEvidence();
      panel.replaceChildren(h('p', { class: 'muted center' }, 'Pick an object to inspect it.'));
    });
    if (ctx.finished) return;
    if (sceneFailed) return end(false);

    /* Phase 2: witnesses */
    for (let i = 0; i < talkEntries.length; i++) {
      if (ctx.finished) return;
      drawHead('Questioning witnesses');
      const s = suspects[i % suspects.length];
      const entry = talkEntries[i];
      const panel = h('div');
      body.replaceChildren(h('div', { class: 'suspects' }, suspectCard(s)), panel);
      await ctx.intro(panel, entry, { label: 'New word', cta: 'Got it' });
      const framing = h('p', { class: 'dt-frame' }, `${s.e} ${s.n} says:`);
      const res = await ctx.ask(panel, entry, { pool: TALK_POOL, framing });
      if (res.correct) addEvidence(entry);
      else {
        st.cred -= 1;
        if (st.cred <= 0) return end(false);
      }
    }
    if (ctx.finished) return;

    /* Phase 3: deduction */
    drawHead('Your deduction');
    const targets = U.shuffle(st.evidence).slice(0, Math.min(3, st.evidence.length));
    st.targets = targets.length;
    if (!targets.length) return end(false);

    await new Promise((resolve) => {
      const tiles = U.shuffle(st.evidence);
      const filled = targets.map(() => null);
      let active = 0;
      const startedAt = performance.now();
      const list = h('ol', { class: 'dt-deduce' });
      const bank = h('div', { class: 'dt-evidence' });
      const submit = h('button', { class: 'btn btn-gold', type: 'button', disabled: true, onclick: present }, 'Present deduction');
      let presented = false;

      function draw() {
        list.replaceChildren(...targets.map((t, i) => {
          const parts = ctx.E.blank(t.word).split('_____');
          const slot = h('button', {
            class: 'slot' + (i === active && !presented ? ' active' : '') + (presented ? (filled[i] === t ? ' right' : ' wrongs') : ''),
            type: 'button', disabled: presented, 'aria-label': filled[i] ? `Blank ${i + 1}: ${filled[i].word.word}` : `Blank ${i + 1}, empty`,
            onclick: () => { if (filled[i]) filled[i] = null; active = i; draw(); }
          }, filled[i] ? filled[i].word.word : '\u00a0');
          return h('li', { lang: 'en' }, parts[0], slot, parts.slice(1).join('_____'),
            presented && filled[i] !== t ? h('div', { class: 'muted small' }, `Answer: ${t.word.word} · ${t.word.cn}`) : null);
        }));
        bank.replaceChildren(...tiles.map((e) => h('button', {
          class: 'tile' + (filled.includes(e) ? ' used' : ''), type: 'button', lang: 'en',
          disabled: presented || filled.includes(e),
          onclick: () => {
            filled[active] = e;
            const nextEmpty = filled.findIndex((f) => !f);
            active = nextEmpty === -1 ? active : nextEmpty;
            draw();
          }
        }, e.word.word)));
        submit.disabled = presented || filled.some((f) => !f);
      }

      function present() {
        presented = true;
        const ms = (performance.now() - startedAt) / targets.length;
        targets.forEach((t, i) => {
          const ok = filled[i] === t;
          if (ok) st.deduced += 1;
          ctx.log(t, 'deduce', { correct: ok, ms, hinted: false });
        });
        ctx.audio.sfx(st.deduced === targets.length ? 'correct' : 'wrong');
        draw();
        submit.replaceWith(h('button', { class: 'btn btn-gold', type: 'button', onclick: resolve }, 'Name the culprit'));
      }

      body.replaceChildren(
        h('p', { class: 'dt-frame' }, 'Complete each statement with a word from your evidence. Click a blank to change it.'),
        list, h('h3', null, 'Evidence'), bank, h('div', { class: 'center' }, submit));
      draw();
    });
    if (ctx.finished) return;

    return end(st.deduced >= Math.ceil(targets.length * 2 / 3));
  }
})(window.WQ = window.WQ || {});
