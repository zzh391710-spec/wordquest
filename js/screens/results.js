/* WordQuest · results after a game */
(function (WQ) {
  'use strict';

  const h = WQ.h, U = WQ.U, UI = WQ.UI;
  const DEFAULT_TITLE = { win: 'Victory!', lose: 'Defeated', quit: 'Game ended', done: 'Finished' };

  function taleText(text, word) {
    const parts = text.split(new RegExp('(\\b' + U.escapeRegExp(word) + '\\b)', 'i'));
    return parts.map((p, i) => (i % 2 ? h('mark', null, p) : p));
  }

  WQ.App.register('results', function (s) {
    if (!s || !s.record) { WQ.App.go('hub'); return; }
    const r = s.record;
    const mode = s.mode;
    const extra = s.extra || {};
    const title = extra.title || DEFAULT_TITLE[r.result] || 'Finished';
    const stat = (value, label) => h('div', { class: 'stat' }, h('b', null, String(value)), h('span', null, label));

    const wordList = h('ul', { class: 'wordlist' }, s.words.map((x) => h('li', null,
      h('span', { class: x.wrong ? 'mark bad' : 'mark good', 'aria-label': x.wrong ? 'missed' : 'correct' }, x.wrong ? '✗' : '✓'),
      h('div', null,
        h('b', { lang: 'en' }, x.word.word), ' ', UI.speakBtn(x.word.word), ' ',
        h('span', { class: 'muted' }, x.word.cn)),
      h('span', { class: 'muted small right' }, `next ${U.relTime(x.due)}`))));

    UI.mount(h('main', { class: 'results', 'data-mode': mode.id },
      h('div', { class: 'res-mode' }, h('span', { 'aria-hidden': 'true' }, mode.icon), ' ', mode.name),
      h('h1', { class: 'res-title ' + r.result }, title),
      r.summary ? h('p', { class: 'res-summary' }, r.summary) : null,
      s.levelAfter > s.levelBefore ? h('div', { class: 'banner levelup' }, `Level up! You reached level ${s.levelAfter}.`) : null,
      s.isBest ? h('div', { class: 'banner best' }, `New best score in ${mode.name}: ${r.score}`) : null,
      h('div', { class: 'stat-row' },
        stat(`${r.accuracy}%`, 'accuracy'),
        stat(`${r.correct}/${r.questions}`, 'correct answers'),
        stat(`+${r.xp}`, 'XP'),
        stat(`+${r.coins}`, 'coins'),
        stat(`×${r.bestCombo}`, 'best combo'),
        stat(U.fmtDuration(r.durationSec), 'time')),
      extra.story ? h('section', { class: 'tale' },
        h('h2', { class: 'res-sub' }, `Your tale: ${extra.story.title}`),
        h('ol', { class: 'tale-lines', lang: 'en' }, extra.story.lines.map((l) => h('li', { class: l.correct ? '' : 'missed' },
          h('span', { class: 'tale-room' }, `Room ${l.room}`), ' ', taleText(l.text, l.word)))),
        h('p', { class: 'tale-end', lang: 'en' }, extra.story.ending)) : null,
      h('h2', { class: 'res-sub' }, `Words in this game · ${r.newWords} new, ${r.reviewedWords} reviewed`),
      wordList,
      h('div', { class: 'res-actions' },
        h('button', { class: 'btn btn-gold', type: 'button', onclick: () => WQ.Game.start(mode.id) }, 'Play again'),
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => WQ.App.go('hub') }, 'Back to worlds'))));
  });
})(window.WQ = window.WQ || {});
