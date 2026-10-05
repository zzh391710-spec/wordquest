/*
 * Mode A · Lexicon Dungeon
 * Six rooms: battles (recognition), a chest, an elite (spelling) and a
 * dragon boss (sentences). Wrong answers cost hearts; fast answers crit.
 *
 * Every word carries a sentence set inside the dungeon (js/data/dungeon-story.js).
 * Words are dealt to the rooms they fit (gate, battle, chest, elite, boss) and
 * the completed sentences form one short tale shown at the end.
 *
 * Rendering goes through a small "stage" adapter:
 *   - 3D (js/modes/dungeon3d.js, three.js) when WebGL is available
 *   - a 2D emoji arena otherwise
 */
(function (WQ) {
  'use strict';

  const h = WQ.h, U = WQ.U, UI = WQ.UI;

  const MONSTERS = [
    { key: 'bat', e: '🦇', n: 'Cave bat' },
    { key: 'spider', e: '🕷️', n: 'Ink spider' },
    { key: 'ghost', e: '👻', n: 'Echo ghost' },
    { key: 'slime', e: '🟢', n: 'Ink slime' },
    { key: 'skeleton', e: '💀', n: 'Rattling skeleton' }
  ];
  const ELITES = [{ key: 'golem', e: '🗿', n: 'Stone scribe' }, { key: 'knight', e: '🛡️', n: 'Shadow knight' }];
  const BOSS = { key: 'dragon', e: '🐉', n: 'Lexicon dragon' };
  const ROOMS = ['battle', 'battle', 'chest', 'elite', 'battle', 'boss'];
  const ROOM_ICON = { battle: '⚔️', chest: '🎁', elite: '💀', boss: '🐉' };
  const ROOM_NAME = { battle: 'Battle', chest: 'Treasure', elite: 'Elite', boss: 'Boss' };
  const FOE_HP = { battle: 3, elite: 4, boss: 6 };
  const MAX_HP = 5;

  WQ.Modes.register({
    id: 'dungeon',
    name: 'Lexicon Dungeon',
    icon: '🗡️',
    tagline: 'Walk a torch-lit dungeon. Every word is a line of the tale; defeat the dragon.',
    sessionSize: (s) => Math.max(14, s.sessionSize),
    start: (ctx) => run(ctx)
  });

  /* ---------- 3D stage ---------- */
  function stage3D(view, plan, reduced, chapter) {
    const scene = new WQ.Dungeon3D(view, {
      rooms: plan.map((p) => ({ kind: p.kind, key: p.foe ? p.foe.key : null })),
      reducedMotion: reduced,
      theme: chapter
    });
    return {
      is3D: true,
      dispose: () => scene.dispose(),
      intro() {},
      async enter(i, narration) {
        if (i === 0) await scene.openGate();
        await scene.walkTo(i);
        scene.banner(`Room ${i + 1}`, narration);
      },
      focus(i, name, pct) { scene.focusFoe(i, name, pct); },
      hit(crit, pct, dmg) {
        scene.heroAttack({ crit }).then(() => {
          scene.setFoeHp(pct);
          scene.floatText(crit ? `${dmg}! Critical` : String(dmg), crit ? 'crit' : '');
        });
      },
      hurt() { scene.foeAttack(); },
      defeat: () => scene.foeDie(),
      chest: () => scene.openChest(),
      loot(text) { scene.floatText(text, 'loot'); },
      fall: () => scene.heroFall(),
      revive: () => scene.heroRevive(),
      victory: () => scene.victory()
    };
  }

  /* ---------- 2D fallback ---------- */
  function stage2D(arena, plan) {
    let foeEl = null, hpBar = null;
    function show(e, name, cls = '') {
      foeEl = h('div', { class: 'monster ' + cls, 'aria-hidden': 'true' }, e);
      hpBar = UI.bar(1, 'foe-hp');
      arena.replaceChildren(h('div', { class: 'foe' }, foeEl, h('div', { class: 'foe-name' }, name), hpBar));
    }
    return {
      is3D: false,
      dispose() {},
      intro() { show('🚪', 'The dungeon gate'); hpBar.style.visibility = 'hidden'; },
      async enter(i) {
        const p = plan[i];
        if (p.foe) show(p.foe.e, p.foe.n, p.kind);
        else { show('🎁', 'A treasure chest'); hpBar.style.visibility = 'hidden'; }
      },
      focus() {},
      hit(crit, pct) {
        if (hpBar) hpBar.firstChild.style.width = (pct * 100) + '%';
        if (foeEl) UI.animate(foeEl, 'hit');
        if (crit) UI.floatText(arena, 'Critical!');
      },
      hurt() { UI.animate(arena, 'shake'); },
      async defeat() { if (foeEl) foeEl.style.opacity = '0.25'; await U.sleep(300); },
      async chest() {},
      loot(text) { UI.floatText(arena, text); },
      async fall() {},
      async revive() {},
      async victory() {}
    };
  }

  async function run(ctx) {
    const normals = U.shuffle(MONSTERS);
    let ni = 0;
    const plan = ROOMS.map((kind) => ({
      kind,
      foe: kind === 'boss' ? BOSS : kind === 'elite' ? U.pick(ELITES) : kind === 'battle' ? normals[ni++ % normals.length] : null
    }));

    const st = { hp: MAX_HP, room: 0, coins: 0, damage: 0, cleared: 0 };
    const Story = WQ.DungeonStory;
    const chapter = Story.chapterFor(ctx.entries.map((e) => e.word));
    const heroName = ctx.user.displayName;
    const story = [];
    const vars = () => {
      const room = plan[Math.min(st.room, plan.length - 1)];
      return { hero: heroName, foe: room.foe ? room.foe.n.toLowerCase() : 'chest' };
    };
    const narrate = (key) => Story.narration(key, vars());

    // Deal words to rooms: a word whose story line fits this room comes first,
    // then general battle lines, then anything left. Missed words return soon.
    const pool = ctx.entries.map((e) => Object.assign({ line: Story.lineFor(e.word) }, e));
    const revengeQueue = [];
    let dealt = 0;
    function nextEntry(kind, roomIndex) {
      if (revengeQueue.length && revengeQueue[0].after <= dealt) { dealt += 1; return revengeQueue.shift().entry; }
      const want = roomIndex === 0 ? ['gate', 'battle'] : [kind, 'battle'];
      let idx = pool.findIndex((e) => e.line.stage === want[0]);
      if (idx < 0) idx = pool.findIndex((e) => e.line.stage === want[1]);
      if (idx < 0) idx = 0;
      dealt += 1;
      if (!pool.length) return revengeQueue.length ? revengeQueue.shift().entry : null;
      return pool.splice(idx, 1)[0];
    }
    const revenge = (entry) => revengeQueue.push({ entry, after: dealt + 2 });
    const recycle = (entry) => pool.push(entry); // answered words can return if the run outlasts the deck

    function storyLine(entry) {
      return Story.fill(entry.line.text, vars());
    }
    function questionFor(entry, kind) {
      const tier = ctx.E.tierOf(entry);
      const sentence = storyLine(entry);
      if (kind === 'chest') return { type: 'cloze', sentence, showDef: true };
      if (kind === 'elite') return { type: 'cloze-type', sentence, showDef: tier !== 'use' };
      if (kind === 'boss') return { type: 'cloze-type', sentence, showDef: tier === 'recognize' };
      if (tier === 'recognize') return { type: 'cloze', sentence, showDef: true };
      if (tier === 'recall') return { type: U.pick(['cloze', 'cloze-type']), sentence, showDef: true };
      return { type: 'cloze-type', sentence, showDef: false };
    }
    function framing(kind) {
      return h('div', { class: 'dg-story-frame' },
        h('p', { class: 'dg-narration' }, narrate(kind === 'battle' && st.room === 0 ? 'gate' : kind)),
        story.length ? h('p', { class: 'dg-story-last', lang: 'en' }, story[story.length - 1].text) : null);
    }
    function remember(entry, sentence, correct) {
      story.push({ room: st.room + 1, word: entry.word.word, text: sentence, correct });
    }

    const hud = h('div', { class: 'dg-hud' });
    const items = h('div', { class: 'dg-items' });
    const panel = h('div', { class: 'dg-panel' });
    let view = null;
    let fx = null;

    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (WQ.Dungeon3D && WQ.Dungeon3D.supported()) {
      const viewport = h('div', { class: 'dg3d-view' }, hud);
      ctx.stage.replaceChildren(h('div', { class: 'dungeon dungeon-3d' }, viewport, panel));
      try {
        fx = stage3D(viewport, plan, reduced, chapter);
      } catch (err) {
        console.warn('3D scene unavailable, using 2D', err);
        fx = null;
      }
    }
    if (!fx) {
      const arena = h('div', { class: 'dg-arena' });
      ctx.stage.replaceChildren(h('div', { class: 'dungeon' }, hud, arena, panel));
      fx = stage2D(arena, plan);
    }
    ctx.onCleanup(() => fx.dispose());

    const status = (text) => panel.replaceChildren(h('p', { class: 'dg3d-status' }, text));

    function drawItems() {
      const inv = ctx.profile.inventory;
      const canTime = inv.hourglass > 0 && view && !view.answered;
      items.replaceChildren(
        h('button', {
          class: 'item-btn', type: 'button', disabled: !canTime, title: 'Hourglass: add 10 seconds',
          onclick: () => {
            if (view && !view.answered && ctx.useItem('hourglass')) { view.addTime(10); UI.toast('+10 seconds'); drawItems(); }
          }
        }, `⏳ ${inv.hourglass}`),
        h('span', { class: 'item-btn static', title: 'Phoenix feather: revive once' }, `🪶 ${inv.feather}`));
    }

    function drawHud() {
      hud.replaceChildren(
        UI.hearts(st.hp, MAX_HP),
        h('ol', { class: 'dg-rooms', 'aria-label': 'Rooms' },
          ROOMS.map((r, i) => h('li', {
            class: i < st.room ? 'done' : i === st.room ? 'here' : '',
            title: ROOM_NAME[r], 'aria-label': `${ROOM_NAME[r]}${i === st.room ? ' (current)' : ''}`
          }, ROOM_ICON[r]))),
        h('span', { class: 'dg-stat' }, `🪙 ${st.coins}`),
        h('span', { class: 'dg-stat' }, `Combo ×${ctx.tracker.combo}`),
        items);
      drawItems();
    }

    async function revive() {
      await UI.waitButton(panel, h('p', null, 'You fall… but your phoenix feather glows. 🪶'), 'Rise again');
      if (ctx.useItem('feather')) {
        await fx.revive();
        st.hp = 3;
        drawHud();
      }
    }

    async function battle(i) {
      const { kind, foe } = plan[i];
      const maxHp = FOE_HP[kind];
      let hp = maxHp;
      fx.focus(i, foe.n, 1);

      while (hp > 0 && st.hp > 0) {
        if (ctx.finished) return false;
        const entry = nextEntry(kind, i);
        if (!entry) break;
        await ctx.intro(panel, entry, { label: 'New spell scroll', cta: 'Learn this spell' });

        const q = questionFor(entry, kind);
        const typing = q.type === 'cloze-type';
        const limit = ctx.E.timeFor(ctx.tracker, typing ? 32 : 20);

        const res = await ctx.ask(panel, entry, {
          type: q.type,
          sentence: q.sentence,
          showDef: q.showDef,
          timeLimit: limit,
          framing: framing(kind),
          onView: (v) => { view = v; drawItems(); },
          onSettle: (r) => {
            if (r.correct) {
              const crit = r.ms < 3000 && !r.hinted;
              const dmg = crit ? 2 : 1;
              hp = Math.max(0, hp - dmg);
              st.damage += dmg;
              fx.hit(crit, hp / maxHp, dmg);
              ctx.audio.sfx('hit');
            } else {
              st.hp -= 1;
              fx.hurt();
            }
            view = null;
            drawHud();
          }
        });
        remember(entry, q.sentence, res.correct);
        if (res.correct) recycle(entry);
        else {
          revenge(entry);
          if (st.hp <= 0 && ctx.profile.inventory.feather > 0) await revive();
        }
      }
      return hp <= 0;
    }

    async function chest(i) {
      const entry = nextEntry('chest', i);
      let opened = true;
      if (entry) {
        await ctx.intro(panel, entry, { label: 'A word carved on the lid', cta: 'Got it' });
        const q = questionFor(entry, 'chest');
        const res = await ctx.ask(panel, entry, {
          type: q.type, sentence: q.sentence, showDef: q.showDef,
          timeLimit: ctx.E.timeFor(ctx.tracker, 24),
          framing: framing('chest'),
          onView: (v) => { view = v; drawItems(); },
          onSettle: () => { view = null; }
        });
        remember(entry, q.sentence, res.correct);
        if (res.correct) recycle(entry); else revenge(entry);
        opened = res.correct;
      }
      if (ctx.finished) return;
      await fx.chest();
      let msg;
      if (!opened) { st.coins += 5; msg = 'The lock resists, but a few coins slip through the crack. +5 coins'; fx.loot('+5 🪙'); }
      else {
        const roll = Math.random();
        if (roll < 0.4) { st.coins += 15; msg = 'The lock clicks open: 15 coins.'; fx.loot('+15 🪙'); ctx.audio.sfx('coin'); }
        else if (roll < 0.7) { ctx.profile.inventory.hint += 1; await ctx.saveProfile(); msg = 'The lock clicks open: a hint scroll. 💡 +1'; fx.loot('+1 💡'); }
        else { st.hp = Math.min(MAX_HP, st.hp + 1); msg = 'The lock clicks open: a healing potion restores one heart.'; fx.loot('+1 ♥'); }
      }
      drawHud();
      await UI.waitButton(panel, msg, 'Go deeper');
    }

    drawHud();
    fx.intro();
    await UI.waitButton(panel,
      h('div', null,
        h('p', { class: 'dg-chapter' }, `Chapter: ${chapter.title}`),
        h('p', null, `${heroName}, the village has sent you to bring back the stolen dictionary. Each room hides one line of the story; fill in the missing word to strike.`),
        h('p', { class: 'muted' }, 'Answer within 3 seconds for a critical hit. Wrong answers let the monster hit back, and missed words return later in the run.')),
      'Enter the dungeon');

    for (st.room = 0; st.room < ROOMS.length; st.room++) {
      if (ctx.finished) return;
      drawHud();
      const kind = ROOMS[st.room];
      status(st.room === 0 ? 'The gate creaks open…' : 'Heading deeper into the dungeon…');
      await fx.enter(st.room, narrate(st.room === 0 ? 'gate' : kind));
      if (ctx.finished) return;

      if (kind === 'chest') { await chest(st.room); st.cleared += 1; continue; }
      const won = await battle(st.room);
      if (ctx.finished) return;
      if (!won) break;

      await fx.defeat();
      st.cleared += 1;
      const loot = kind === 'boss' ? 30 : kind === 'elite' ? 12 : 6;
      st.coins += loot;
      fx.loot(`+${loot} 🪙`);
      ctx.audio.sfx('coin');
      drawHud();
      if (kind !== 'boss') {
        status(`${plan[st.room].foe.n} defeated. +${loot} coins.`);
        await U.sleep(fx.is3D ? 700 : 900);
      }
    }
    if (ctx.finished) return;

    const win = st.cleared === ROOMS.length;
    ctx.audio.sfx(win ? 'win' : 'lose');
    status(win ? 'The dragon falls. The dungeon is yours!' : 'Your strength runs out…');
    if (win) await fx.victory(); else await fx.fall();
    await U.sleep(fx.is3D ? 900 : 300);
    if (ctx.finished) return;
    // One line per word in the tale: first appearance keeps its place, the last answer decides the colour.
    const seen = new Map();
    story.forEach((l) => {
      if (!seen.has(l.word)) seen.set(l.word, { room: l.room, text: l.text, word: l.word, correct: l.correct });
      else seen.get(l.word).correct = l.correct;
    });
    const tale = {
      title: chapter.title,
      theme: chapter.theme,
      lines: Array.from(seen.values()),
      ending: narrate(win ? 'win' : 'lose')
    };
    ctx.finish({
      result: win ? 'win' : 'lose',
      title: win ? 'Dragon defeated!' : 'You fell in the dungeon',
      summary: `${chapter.title}: cleared ${st.cleared} of ${ROOMS.length} rooms`,
      score: st.damage * 10 + st.cleared * 20 + ctx.tracker.bestCombo * 5,
      coins: st.coins,
      xpBonus: win ? 30 : 0,
      story: tale,
      detail: { roomsCleared: st.cleared, rooms: ROOMS.length, chapter: chapter.title, story: tale.lines.map((l) => l.text), ending: tale.ending }
    });
  }
})(window.WQ = window.WQ || {});
