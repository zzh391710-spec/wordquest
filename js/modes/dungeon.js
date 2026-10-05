/*
 * Mode A · Lexicon Dungeon
 * Six rooms: battles (recognition), a chest, an elite (spelling) and a
 * dragon boss (sentences). Wrong answers cost hearts; fast answers crit.
 */
(function (WQ) {
  'use strict';

  const h = WQ.h, U = WQ.U, UI = WQ.UI;

  const MONSTERS = [
    { e: '🦇', n: 'Cave bat' }, { e: '🕷️', n: 'Ink spider' }, { e: '🐍', n: 'Riddle snake' },
    { e: '👻', n: 'Echo ghost' }, { e: '🧟', n: 'Mumbling zombie' }, { e: '🐀', n: 'Library rat' }
  ];
  const ELITES = [{ e: '🗿', n: 'Stone scribe' }, { e: '🦂', n: 'Spelling scorpion' }];
  const BOSS = { e: '🐉', n: 'Lexicon dragon' };
  const ROOMS = ['battle', 'battle', 'chest', 'elite', 'battle', 'boss'];
  const ROOM_ICON = { battle: '⚔️', chest: '🎁', elite: '💀', boss: '🐉' };
  const ROOM_NAME = { battle: 'Battle', chest: 'Treasure', elite: 'Elite', boss: 'Boss' };
  const MAX_HP = 5;

  WQ.Modes.register({
    id: 'dungeon',
    name: 'Lexicon Dungeon',
    icon: '🗡️',
    tagline: 'Cast words as spells. Clear six rooms and defeat the dragon.',
    start: (ctx) => run(ctx)
  });

  async function run(ctx) {
    const st = { hp: MAX_HP, room: 0, coins: 0, damage: 0, cleared: 0 };
    const queue = ctx.entries.slice();
    let qi = 0;
    const nextEntry = () => queue[qi++ % queue.length];
    const revenge = (entry) => queue.splice(qi + 2, 0, entry); // missed words return soon

    const hud = h('div', { class: 'dg-hud' });
    const arena = h('div', { class: 'dg-arena' });
    const panel = h('div', { class: 'dg-panel' });
    const items = h('div', { class: 'dg-items' });
    ctx.stage.replaceChildren(h('div', { class: 'dungeon' }, hud, arena, panel));
    let view = null;

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

    function showFoe(foe, cls = '') {
      const foeEl = h('div', { class: 'monster ' + cls, 'aria-hidden': 'true' }, foe.e);
      const hpBar = UI.bar(1, 'foe-hp');
      arena.replaceChildren(h('div', { class: 'foe' }, foeEl, h('div', { class: 'foe-name' }, foe.n), hpBar));
      return { foeEl, hpBar };
    }

    async function revive() {
      await UI.waitButton(panel, h('p', null, 'You fall… but your phoenix feather glows. 🪶'), 'Rise again');
      if (ctx.useItem('feather')) { st.hp = 3; drawHud(); }
    }

    async function battle(kind) {
      const foe = kind === 'boss' ? BOSS : kind === 'elite' ? U.pick(ELITES) : U.pick(MONSTERS);
      const maxHp = kind === 'boss' ? 6 : kind === 'elite' ? 4 : 3;
      let hp = maxHp;
      const { foeEl, hpBar } = showFoe(foe, kind);

      while (hp > 0 && st.hp > 0) {
        const entry = nextEntry();
        await ctx.intro(panel, entry, { label: 'New spell scroll', cta: 'Learn this spell' });

        let type;
        if (kind === 'elite') type = U.pick(['spell-def', 'spell-listen']);
        else if (kind === 'boss') type = ctx.E.tierOf(entry) === 'recognize' ? 'cloze' : U.pick(['cloze', 'cloze-type']);
        const typing = type && (type.startsWith('spell') || type === 'cloze-type');
        const limit = ctx.E.timeFor(ctx.tracker, typing ? 30 : 18);

        const res = await ctx.ask(panel, entry, {
          type,
          timeLimit: limit,
          onView: (v) => { view = v; drawItems(); },
          onSettle: (r) => {
            if (r.correct) {
              const crit = r.ms < 3000 && !r.hinted;
              hp = Math.max(0, hp - (crit ? 2 : 1));
              st.damage += crit ? 2 : 1;
              hpBar.firstChild.style.width = (hp / maxHp * 100) + '%';
              UI.animate(foeEl, 'hit');
              ctx.audio.sfx('hit');
              if (crit) UI.floatText(arena, 'Critical!');
            } else {
              st.hp -= 1;
              UI.animate(arena, 'shake');
            }
            view = null;
            drawHud();
          }
        });
        if (!res.correct) {
          revenge(entry);
          if (st.hp <= 0 && ctx.profile.inventory.feather > 0) await revive();
        }
      }
      return hp <= 0;
    }

    async function chest() {
      arena.replaceChildren(h('div', { class: 'foe' }, h('div', { class: 'monster', 'aria-hidden': 'true' }, '🎁'), h('div', { class: 'foe-name' }, 'A treasure chest')));
      const roll = Math.random();
      let msg;
      if (roll < 0.4) { st.coins += 15; msg = 'You found 15 coins.'; ctx.audio.sfx('coin'); }
      else if (roll < 0.7) { ctx.profile.inventory.hint += 1; await ctx.saveProfile(); msg = 'You found a hint scroll. 💡 +1'; }
      else { st.hp = Math.min(MAX_HP, st.hp + 1); msg = 'A healing potion restores one heart.'; }
      drawHud();
      await UI.waitButton(panel, msg, 'Next room');
    }

    drawHud();
    showFoe({ e: '🚪', n: 'The dungeon gate' });
    await UI.waitButton(panel,
      h('div', null,
        h('p', null, 'Every monster carries a word. Answer to strike; answer within 3 seconds for a critical hit.'),
        h('p', { class: 'muted' }, 'Wrong answers cost a heart, and missed words come back later in the run.')),
      'Enter the dungeon');

    for (st.room = 0; st.room < ROOMS.length; st.room++) {
      if (ctx.finished) return;
      drawHud();
      const kind = ROOMS[st.room];
      if (kind === 'chest') { await chest(); st.cleared += 1; continue; }
      const won = await battle(kind);
      if (!won) break;
      st.cleared += 1;
      const loot = kind === 'boss' ? 30 : kind === 'elite' ? 12 : 6;
      st.coins += loot;
      ctx.audio.sfx('coin');
      drawHud();
      if (kind !== 'boss') await UI.waitButton(panel, `Room cleared. +${loot} coins.`, 'Next room');
    }
    if (ctx.finished) return;

    const win = st.cleared === ROOMS.length;
    ctx.audio.sfx(win ? 'win' : 'lose');
    ctx.finish({
      result: win ? 'win' : 'lose',
      title: win ? 'Dragon defeated!' : 'You fell in the dungeon',
      summary: `Cleared ${st.cleared} of ${ROOMS.length} rooms`,
      score: st.damage * 10 + st.cleared * 20 + ctx.tracker.bestCombo * 5,
      coins: st.coins,
      xpBonus: win ? 30 : 0,
      detail: { roomsCleared: st.cleared, rooms: ROOMS.length }
    });
  }
})(window.WQ = window.WQ || {});
