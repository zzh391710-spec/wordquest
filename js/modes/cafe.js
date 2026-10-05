/*
 * Mode C · Word Café
 * One day of service. Guests ask for words; serve them before their
 * patience runs out. Regulars are your review words. Tips buy decor.
 */
(function (WQ) {
  'use strict';

  const h = WQ.h, U = WQ.U, UI = WQ.UI;

  const GUESTS = ['🧑‍🎨', '👩‍💼', '🧓', '🧑‍🎓', '👩‍🔬', '👨‍🚒', '🧑‍🍳', '👩‍🏫', '🧔', '👱‍♀️'];
  const NAMES = ['Ava', 'Leo', 'Mina', 'Omar', 'Priya', 'Jonas', 'Yuki', 'Rosa', 'Theo', 'Lena', 'Kofi', 'Ines'];
  const DECOR = [
    { id: 'plant', e: '🪴', n: 'Fern', price: 40 },
    { id: 'candle', e: '🕯️', n: 'Candle', price: 40 },
    { id: 'radio', e: '📻', n: 'Radio', price: 60 },
    { id: 'art', e: '🖼️', n: 'Painting', price: 80 },
    { id: 'cat', e: '🐈', n: 'Café cat', price: 120 },
    { id: 'piano', e: '🎹', n: 'Piano', price: 200 }
  ];
  const POOL = { recognize: ['def', 'meaning', 'listen'], recall: ['spell-def', 'spell-listen'], use: ['cloze', 'cloze-type'] };
  const LINES = {
    def: 'Hi! Which word means this?',
    meaning: 'What does this word on your menu mean?',
    listen: 'Listen to my order. What does it mean?',
    'spell-def': 'Could you write the word on my cup?',
    'spell-listen': 'Can you spell what I just said?',
    cloze: 'Help me finish my sentence.',
    'cloze-type': 'I forgot a word. Can you type it for me?'
  };
  const MAX_WALKOUTS = 3;

  WQ.Modes.register({
    id: 'cafe',
    name: 'Word Café',
    icon: '☕',
    tagline: 'Serve guests the words they ask for. Earn tips and decorate your café.',
    sessionSize: (s) => U.clamp(s.sessionSize, 8, 10),
    start: (ctx) => run(ctx)
  });

  async function run(ctx) {
    const p = ctx.profile;
    if (!Array.isArray(p.cafeDecor)) p.cafeDecor = [];
    const total = ctx.entries.length;
    const st = { earned: 0, served: 0, walkouts: 0, guest: 0 };

    const top = h('div', { class: 'cf-top' });
    const body = h('div', { class: 'cf-body' });
    ctx.stage.replaceChildren(h('div', { class: 'cafe' }, top, body));

    const shelf = () => h('div', { class: 'cf-shelf', 'aria-label': 'Café decorations' },
      p.cafeDecor.length
        ? p.cafeDecor.map((id) => { const d = DECOR.find((x) => x.id === id); return d ? h('span', { title: d.n }, d.e) : null; })
        : h('span', { class: 'muted small' }, 'An empty shelf. Buy decorations with your coins.'));

    function drawTop(open) {
      top.replaceChildren(shelf(), h('div', { class: 'cf-stats' },
        open
          ? [
            h('span', { class: 'chip' }, `Guest ${Math.min(st.guest + 1, total)}/${total}`),
            h('span', { class: 'chip' }, `💰 ${st.earned}`),
            h('span', { class: 'chip' }, `Walkouts ${st.walkouts}/${MAX_WALKOUTS}`)
          ]
          : h('span', { class: 'chip' }, `🪙 ${p.coins}`)));
    }

    /* Morning: decorate, then open */
    await new Promise((resolve) => {
      function draw() {
        drawTop(false);
        body.replaceChildren(
          h('div', { class: 'note-card' },
            h('p', null, `Good morning! ${total} guests are coming today. Serve the right word before their patience runs out.`),
            h('p', { class: 'muted' }, `Regulars are words you are reviewing. Three walkouts and the café closes early.`)),
          h('h3', null, 'Decorations'),
          h('div', { class: 'cf-shop' }, DECOR.map((d) => {
            const owned = p.cafeDecor.includes(d.id);
            return h('div', { class: 'cf-item' },
              h('div', { class: 'e', 'aria-hidden': 'true' }, d.e),
              h('div', null, h('b', null, d.n)),
              h('button', {
                class: 'btn btn-sm', type: 'button', disabled: owned || p.coins < d.price,
                onclick: async () => {
                  if (owned || p.coins < d.price) return;
                  p.coins -= d.price;
                  p.cafeDecor.push(d.id);
                  await ctx.saveProfile();
                  ctx.audio.sfx('coin');
                  UI.toast(`${d.n} added to your café.`, 'good');
                  draw();
                }
              }, owned ? 'Owned' : `🪙 ${d.price}`));
          })),
          h('div', { class: 'center' }, h('button', { class: 'btn btn-gold', type: 'button', onclick: resolve }, 'Open the café')));
      }
      draw();
    });

    /* Service */
    for (st.guest = 0; st.guest < total; st.guest++) {
      if (ctx.finished) return;
      drawTop(true);
      const entry = ctx.entries[st.guest];
      const guest = { e: U.pick(GUESTS), n: U.pick(NAMES), regular: !entry.isNew && entry.isDue };
      const panel = h('div');
      body.replaceChildren(panel);

      await ctx.intro(panel, entry, { label: 'New on the menu', cta: 'Add to menu' });
      const type = ctx.E.pickType(entry, POOL);
      const typing = type.startsWith('spell') || type === 'cloze-type';
      const limit = ctx.E.timeFor(ctx.tracker, typing ? 32 : 20);
      const framing = h('div', { class: 'cf-guest' },
        h('span', { class: 'e', 'aria-hidden': 'true' }, guest.e),
        h('div', null,
          h('div', { class: 'cf-name' }, h('b', null, guest.n), guest.regular ? h('span', { class: 'badge' }, 'Regular') : null),
          h('div', { class: 'bubble' }, LINES[type])));

      const res = await ctx.ask(panel, entry, {
        type, timeLimit: limit, framing,
        onSettle: (r) => {
          if (r.correct) {
            const frac = U.clamp(1 - r.ms / (limit * 1000), 0, 1);
            const pay = 5 + Math.round(2 + 8 * frac) + (guest.regular ? 3 : 0);
            st.earned += pay;
            st.served += 1;
            ctx.audio.sfx('coin');
            UI.toast(`${guest.n} paid ${pay} coins`, 'good');
          } else {
            st.walkouts += 1;
            UI.toast(`${guest.n} left without ordering`, 'bad');
          }
          drawTop(true);
        }
      });
      if (!res.correct && st.walkouts >= MAX_WALKOUTS) break;
    }
    if (ctx.finished) return;

    const closedEarly = st.walkouts >= MAX_WALKOUTS;
    ctx.audio.sfx(closedEarly ? 'lose' : 'win');
    ctx.finish({
      result: closedEarly ? 'lose' : 'win',
      title: closedEarly ? 'Closed early' : 'Day complete',
      summary: `Served ${st.served} of ${total} guests and earned ${st.earned} coins`,
      score: st.earned,
      coins: st.earned,
      xpBonus: closedEarly ? 0 : 20,
      detail: { served: st.served, guests: total, walkouts: st.walkouts }
    });
  }
})(window.WQ = window.WQ || {});
