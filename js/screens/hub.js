/* WordQuest · home hub: player status, world select, shop, recent games */
(function (WQ) {
  'use strict';

  const h = WQ.h, U = WQ.U, UI = WQ.UI, DB = WQ.DB, E = WQ.Engine;

  const SHOP = [
    { id: 'hint', e: '💡', n: 'Hint scroll', d: 'Reveal a clue during any question.', price: 20 },
    { id: 'hourglass', e: '⏳', n: 'Hourglass', d: 'Add 10 seconds in the dungeon.', price: 30 },
    { id: 'feather', e: '🪶', n: 'Phoenix feather', d: 'Revive once when you fall in the dungeon.', price: 60 }
  ];

  /** Streak is only alive if the last game was today or yesterday */
  WQ.liveStreak = function (profile) {
    if (!profile.lastPlayDate) return 0;
    const gap = U.daysBetween(profile.lastPlayDate, U.dayKey());
    return gap <= 1 ? profile.streak : 0;
  };

  WQ.modeName = (id) => (WQ.Modes.get(id) || { name: id }).name;

  WQ.App.register('hub', async function () {
    const user = WQ.Auth.user();
    const [profile, srs, records] = await Promise.all([DB.profiles.get(user.id), DB.srs.get(user.id), DB.records.list(user.id)]);
    WQ.Audio.configure(profile.settings);
    const lv = E.levelInfo(profile.xp);
    const st = E.bankStats(srs);
    const streak = WQ.liveStreak(profile);

    const top = h('header', { class: 'topbar' },
      h('div', { class: 'avatar', 'aria-hidden': 'true' }, user.avatar || '🙂'),
      h('div', { class: 'who' },
        h('div', { class: 'who-name' }, user.displayName),
        h('div', { class: 'who-sub' }, '@' + user.username)),
      h('div', { class: 'level' },
        h('span', { class: 'level-badge' }, 'Lv ' + lv.level),
        UI.bar(lv.pct, 'xp'),
        h('span', { class: 'muted small' }, `${lv.into}/${lv.need} XP`)),
      h('div', { class: 'chips' },
        h('span', { class: 'chip', title: 'Coins' }, `🪙 ${profile.coins}`),
        h('span', { class: 'chip', title: 'Days in a row' }, `🔥 ${streak} day${streak === 1 ? '' : 's'}`),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => WQ.App.go('profile') }, 'Profile'),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { WQ.Auth.logout(); WQ.App.go('auth'); } }, 'Sign out')));

    const todayItem = (n, label) => h('div', { class: 'today-item' }, h('b', null, String(n)), h('span', null, label));
    const head = h('div', { class: 'hub-head' },
      h('h1', { class: 'hub-title' }, 'Choose a world'),
      h('div', { class: 'today' },
        todayItem(st.due, 'due for review'),
        todayItem(st.fresh, 'new words left'),
        todayItem(st.mastered, 'mastered')));

    const worlds = h('div', { class: 'worlds' }, WQ.Modes.list.map((m) => h('button', {
      class: 'portal', type: 'button', style: { '--c': `var(--${m.id})` },
      onclick: () => WQ.Game.start(m.id)
    },
    h('span', { class: 'portal-icon', 'aria-hidden': 'true' }, m.icon),
    h('span', { class: 'portal-name' }, m.name),
    h('span', { class: 'portal-tag' }, m.tagline),
    h('span', { class: 'portal-foot' },
      h('span', null, profile.best[m.id] ? `Best score ${profile.best[m.id]}` : 'Not played yet'),
      h('span', { class: 'portal-play' }, 'Play')))));

    const shop = h('section', { class: 'box' },
      h('h2', { class: 'box-title' }, 'Item shop'),
      SHOP.map((it) => h('div', { class: 'shop-row' },
        h('span', { class: 'shop-icon', 'aria-hidden': 'true' }, it.e),
        h('div', { class: 'grow' },
          h('div', null, h('b', null, it.n), ' ', h('span', { class: 'muted' }, `you have ${profile.inventory[it.id] || 0}`)),
          h('div', { class: 'muted small' }, it.d)),
        h('button', {
          class: 'btn btn-sm', type: 'button', disabled: profile.coins < it.price,
          'aria-label': `Buy ${it.n} for ${it.price} coins`,
          onclick: async () => {
            if (profile.coins < it.price) return;
            profile.coins -= it.price;
            profile.inventory[it.id] = (profile.inventory[it.id] || 0) + 1;
            await DB.profiles.save(user.id, profile);
            WQ.Audio.sfx('coin');
            UI.toast(`Bought a ${it.n.toLowerCase()}.`, 'good');
            WQ.App.go('hub');
          }
        }, `🪙 ${it.price}`))));

    const recent = h('section', { class: 'box' },
      h('h2', { class: 'box-title' }, 'Recent games'),
      records.length
        ? h('ul', { class: 'recent' }, records.slice(0, 4).map((r) => h('li', null,
          h('span', null, h('b', null, WQ.modeName(r.mode)), h('br'), h('span', { class: 'muted small' }, U.fmtDate(r.endedAt))),
          h('span', { class: 'right' }, `${r.accuracy}%`, h('br'), h('span', { class: 'muted small' }, `+${r.xp} XP`)))))
        : h('p', { class: 'muted' }, 'Your games will be listed here. Pick a world to start.'),
      records.length ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => WQ.App.go('profile', { tab: 'records' }) }, 'All game records') : null);

    const seg = (n, color, label) => (n ? h('span', { style: { width: (n / st.total * 100) + '%', background: color }, title: `${label}: ${n}` }) : null);
    const bank = h('section', { class: 'box bank' },
      h('div', { class: 'bank-head' },
        h('h2', { class: 'box-title' }, WQ.Words.bankName),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => WQ.App.go('profile', { tab: 'words' }) }, 'See all words')),
      h('div', { class: 'stack', role: 'img', 'aria-label': `${st.mastered} mastered, ${st.review} reviewing, ${st.learning} learning, ${st.fresh} new, out of ${st.total}` },
        seg(st.mastered, 'var(--good)', 'Mastered'),
        seg(st.review, '#3a8fd0', 'Reviewing'),
        seg(st.learning, '#7a68ff', 'Learning')),
      h('div', { class: 'legend' },
        h('span', null, h('i', { style: { background: 'var(--good)' } }), `Mastered ${st.mastered}`),
        h('span', null, h('i', { style: { background: '#3a8fd0' } }), `Reviewing ${st.review}`),
        h('span', null, h('i', { style: { background: '#7a68ff' } }), `Learning ${st.learning}`),
        h('span', null, h('i', { style: { background: 'rgba(0,0,0,.35)' } }), `New ${st.fresh}`)));

    UI.mount(h('main', { class: 'hub' }, top, head, worlds, h('div', { class: 'hub-lower' }, shop, recent), bank));
  });
})(window.WQ = window.WQ || {});
