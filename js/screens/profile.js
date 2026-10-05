/* WordQuest · profile: account, game records, words, settings, security, backup */
(function (WQ) {
  'use strict';

  const h = WQ.h, U = WQ.U, UI = WQ.UI, DB = WQ.DB, E = WQ.Engine, SRS = WQ.SRS;

  const TABS = [
    ['account', 'Account'],
    ['records', 'Game records'],
    ['words', 'Words'],
    ['settings', 'Settings'],
    ['security', 'Password & account'],
    ['data', 'Backup']
  ];
  const RESULT_LABEL = { win: 'Won', lose: 'Lost', quit: 'Left early', done: 'Finished' };
  const STAGE_LABEL = { new: 'New', learning: 'Learning', review: 'Reviewing', mastered: 'Mastered' };

  const dt = (t) => h('dt', null, t);
  const dd = (t) => h('dd', null, t);
  const stat = (value, label) => h('div', { class: 'stat' }, h('b', null, String(value)), h('span', null, label));

  WQ.App.register('profile', async function (params) {
    let tab = TABS.some(([id]) => id === params.tab) ? params.tab : 'account';
    const tabsEl = h('div', { class: 'ptabs', role: 'tablist' });
    const body = h('section', { class: 'panel', role: 'tabpanel' });

    function renderTabs() {
      tabsEl.replaceChildren(...TABS.map(([id, label]) => h('button', {
        class: 'ptab', type: 'button', role: 'tab', 'aria-selected': String(id === tab),
        onclick: () => { tab = id; renderTabs(); renderBody(); }
      }, label)));
    }

    async function renderBody() {
      const views = { account, records, words, settings, security, data };
      body.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
      body.replaceChildren(await views[tab]());
    }

    /* ---------- Account ---------- */
    async function account() {
      const user = WQ.Auth.user();
      const [full, profile] = await Promise.all([DB.users.get(user.id), DB.profiles.get(user.id)]);
      const lv = E.levelInfo(profile.xp);
      let avatar = user.avatar;
      const avatarBtns = WQ.Auth.AVATARS.map((a) => h('button', {
        class: 'avatar-opt', type: 'button', 'aria-pressed': String(a === avatar), 'aria-label': 'Choose avatar ' + a,
        onclick: () => { avatar = a; avatarBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.textContent === a))); }
      }, a));

      const form = h('form', { novalidate: true },
        UI.field('Display name', 'displayName', 'text', { value: user.displayName, maxlength: '24' }),
        UI.field('Email', 'email', 'email', { value: user.email || '' }, 'Optional. You can sign in with it.'),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Avatar'), h('div', { class: 'avatars' }, avatarBtns)),
        h('div', { class: 'form-err', role: 'alert' }),
        h('button', { class: 'btn btn-gold', type: 'submit' }, 'Save changes'));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        UI.clearErrors(form);
        const fd = new FormData(form);
        try {
          await WQ.Auth.updateAccount({ displayName: fd.get('displayName'), email: fd.get('email'), avatar });
          UI.toast('Changes saved.', 'good');
        } catch (err) { UI.showError(form, err); }
      });

      return h('div', { class: 'grid-2' },
        h('div', null, h('h2', null, 'Account details'), form),
        h('div', null, h('h2', null, 'Overview'),
          h('dl', { class: 'kv' },
            dt('Username'), dd('@' + user.username),
            dt('Member since'), dd(new Date(full.createdAt).toLocaleDateString()),
            dt('Last sign-in'), dd(U.fmtDate(full.lastLoginAt)),
            dt('Sign-ins'), dd(String(full.loginCount || 1)),
            dt('Level'), dd(`${lv.level} · ${profile.xp} XP in total`),
            dt('Coins'), dd(String(profile.coins)),
            dt('Current streak'), dd(`${WQ.liveStreak(profile)} days`),
            dt('Best streak'), dd(`${profile.bestStreak || 0} days`),
            dt('Games played'), dd(String(profile.totalSessions)))));
    }

    /* ---------- Game records ---------- */
    async function records() {
      const user = WQ.Auth.user();
      const [list, profile] = await Promise.all([DB.records.list(user.id), DB.profiles.get(user.id)]);
      if (!list.length) {
        return h('div', null, h('h2', null, 'Game records'),
          h('p', { class: 'muted' }, 'No games yet. Every game you finish or leave will be listed here.'),
          h('button', { class: 'btn btn-gold', type: 'button', onclick: () => WQ.App.go('hub') }, 'Choose a world'));
      }
      const totalTime = list.reduce((s, r) => s + (r.durationSec || 0), 0);
      const totalQ = list.reduce((s, r) => s + r.questions, 0);
      const totalC = list.reduce((s, r) => s + r.correct, 0);
      const bestCombo = list.reduce((m, r) => Math.max(m, r.bestCombo || 0), 0);

      const filter = h('select', { class: 'input select', 'aria-label': 'Filter by world' },
        h('option', { value: '' }, 'All worlds'),
        WQ.Modes.list.map((m) => h('option', { value: m.id }, m.name)));
      const tbody = h('tbody');
      function fill() {
        const rows = list.filter((r) => !filter.value || r.mode === filter.value);
        tbody.replaceChildren(...rows.map((r) => h('tr', null,
          h('td', null, U.fmtDate(r.endedAt)),
          h('td', null, WQ.modeName(r.mode)),
          h('td', null, h('span', { class: 'res res-' + r.result }, RESULT_LABEL[r.result] || r.result)),
          h('td', { class: 'num' }, String(r.score)),
          h('td', { class: 'num' }, `${r.accuracy}%`),
          h('td', { class: 'num' }, `${r.correct}/${r.questions}`),
          h('td', { class: 'num' }, `${r.newWords} / ${r.reviewedWords}`),
          h('td', { class: 'num' }, `+${r.xp}`),
          h('td', { class: 'num' }, `+${r.coins}`),
          h('td', { class: 'num' }, U.fmtDuration(r.durationSec)),
          h('td', { class: 'summary' }, r.summary || ''))));
      }
      filter.addEventListener('change', fill);
      fill();

      return h('div', null,
        h('h2', null, 'Game records'),
        h('div', { class: 'stat-row' },
          stat(list.length, 'games'),
          stat(U.fmtDuration(totalTime), 'time played'),
          stat(totalQ ? Math.round(totalC / totalQ * 100) + '%' : '–', 'overall accuracy'),
          stat(bestCombo, 'best combo')),
        h('div', { class: 'stat-row' }, WQ.Modes.list.map((m) => stat(profile.best[m.id] || 0, `${m.name} best`))),
        h('div', { class: 'toolbar' }, filter, h('span', { class: 'muted small' }, `Showing up to 500 latest games`)),
        h('div', { class: 'table-wrap' }, h('table', null,
          h('thead', null, h('tr', null, ['Date', 'World', 'Result', 'Score', 'Accuracy', 'Correct', 'New / review', 'XP', 'Coins', 'Time', 'Summary'].map((c) => h('th', null, c)))),
          tbody)));
    }

    /* ---------- Words ---------- */
    async function words() {
      const user = WQ.Auth.user();
      const srs = await DB.srs.get(user.id);
      const rows = WQ.Words.all().map((w) => ({ w, s: srs[w.id], stage: SRS.stage(srs[w.id]) }));
      rows.sort((a, b) => {
        if (!a.s && !b.s) return a.w.word.localeCompare(b.w.word);
        if (!a.s) return 1;
        if (!b.s) return -1;
        return a.s.due - b.s.due;
      });
      const stageSel = h('select', { class: 'input select', 'aria-label': 'Filter by stage' },
        h('option', { value: '' }, 'All stages'),
        Object.keys(STAGE_LABEL).map((k) => h('option', { value: k }, STAGE_LABEL[k])));
      const search = h('input', { class: 'input', type: 'search', placeholder: 'Search words or meanings', 'aria-label': 'Search words' });
      const tbody = h('tbody');
      function fill() {
        const q = search.value.trim().toLowerCase();
        tbody.replaceChildren(...rows
          .filter((r) => (!stageSel.value || r.stage === stageSel.value) && (!q || r.w.word.includes(q) || r.w.cn.includes(q)))
          .map((r) => {
            const seen = r.s && r.s.seen;
            return h('tr', null,
              h('td', null, h('b', { lang: 'en' }, r.w.word), ' ', UI.speakBtn(r.w.word)),
              h('td', null, r.w.cn),
              h('td', null, h('span', { class: 'tag tag-' + r.stage }, STAGE_LABEL[r.stage])),
              h('td', { class: 'num' }, seen ? `${Math.round(r.s.correct / r.s.seen * 100)}% (${r.s.seen})` : '–'),
              h('td', null, seen ? U.relTime(r.s.due) : '–'));
          }));
      }
      stageSel.addEventListener('change', fill);
      search.addEventListener('input', fill);
      fill();
      const st = E.bankStats(srs);
      return h('div', null,
        h('h2', null, 'Words'),
        h('div', { class: 'stat-row' }, stat(st.total, 'in the word bank'), stat(st.due, 'due now'), stat(st.learning + st.review, 'in progress'), stat(st.mastered, 'mastered')),
        h('div', { class: 'toolbar' }, search, stageSel),
        h('div', { class: 'table-wrap' }, h('table', null,
          h('thead', null, h('tr', null, ['Word', 'Meaning', 'Stage', 'Accuracy (answers)', 'Next review'].map((c) => h('th', null, c)))),
          tbody)));
    }

    /* ---------- Settings ---------- */
    async function settings() {
      const user = WQ.Auth.user();
      const profile = await DB.profiles.get(user.id);
      const s = profile.settings;
      const opt = (value, label, current) => h('option', { value: String(value), selected: String(current) === String(value) }, label);
      const row = (label, help, control) => h('div', { class: 'setting' },
        h('div', null, h('div', { class: 'setting-label' }, label), help ? h('div', { class: 'muted small' }, help) : null), control);

      const size = h('select', { class: 'input select', name: 'sessionSize', 'aria-label': 'Words per game' }, [8, 12, 16, 20].map((n) => opt(n, `${n} words`, s.sessionSize)));
      const ratio = h('select', { class: 'input select', name: 'newRatio', 'aria-label': 'New words per game' }, [[0.15, 'Fewer'], [0.25, 'Normal'], [0.4, 'More']].map(([v, l]) => opt(v, l, s.newRatio)));
      const accent = h('select', { class: 'input select', name: 'accent', 'aria-label': 'Voice accent' }, [['en-US', 'American'], ['en-GB', 'British']].map(([v, l]) => opt(v, l, s.accent)));
      const rateOut = h('output', { class: 'rate-out' }, `${s.speechRate.toFixed(1)}×`);
      const rate = h('input', { type: 'range', min: '0.6', max: '1.2', step: '0.1', value: String(s.speechRate), name: 'speechRate', 'aria-label': 'Speech speed' });
      rate.addEventListener('input', () => { rateOut.textContent = `${Number(rate.value).toFixed(1)}×`; });
      const test = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => {
        WQ.Audio.configure({ speechRate: Number(rate.value), accent: accent.value, sound: s.sound });
        WQ.Audio.speak('unprecedented');
      } }, 'Test voice');
      const sound = h('input', { type: 'checkbox', name: 'sound', checked: !!s.sound, 'aria-label': 'Sound effects' });
      const auto = h('input', { type: 'checkbox', name: 'autoSpeak', checked: !!s.autoSpeak, 'aria-label': 'Speak words automatically' });

      const save = h('button', { class: 'btn btn-gold', type: 'button', onclick: async () => {
        profile.settings = Object.assign({}, s, {
          sessionSize: Number(size.value), newRatio: Number(ratio.value), accent: accent.value,
          speechRate: Number(rate.value), sound: sound.checked, autoSpeak: auto.checked
        });
        await DB.profiles.save(user.id, profile);
        WQ.Audio.configure(profile.settings);
        UI.toast('Settings saved.', 'good');
      } }, 'Save settings');

      return h('div', { class: 'settings' },
        h('h2', null, 'Settings'),
        row('Words per game', 'Some worlds adjust this slightly to fit their rules.', size),
        row('New words per game', 'Due reviews always come first.', ratio),
        row('Voice accent', WQ.Audio.ttsSupported ? 'Uses the voices installed on this device.' : 'This browser cannot speak words aloud.', accent),
        row('Speech speed', null, h('div', { class: 'inline' }, rate, rateOut, test)),
        row('Sound effects', null, sound),
        row('Speak words automatically', 'Plays each word when it appears and after you answer.', auto),
        h('div', { class: 'actions' }, save));
    }

    /* ---------- Password & account ---------- */
    async function security() {
      const pwForm = h('form', { novalidate: true },
        UI.field('Current password', 'current', 'password', { autocomplete: 'current-password' }),
        UI.field('New password', 'newPassword', 'password', { autocomplete: 'new-password' }, 'At least 6 characters.'),
        UI.field('Confirm new password', 'confirm', 'password', { autocomplete: 'new-password' }),
        h('div', { class: 'form-err', role: 'alert' }),
        h('button', { class: 'btn btn-gold', type: 'submit' }, 'Change password'));
      pwForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        UI.clearErrors(pwForm);
        const fd = new FormData(pwForm);
        try {
          await WQ.Auth.changePassword(fd.get('current'), fd.get('newPassword'), fd.get('confirm'));
          pwForm.reset();
          UI.toast('Password changed.', 'good');
        } catch (err) { UI.showError(pwForm, err); }
      });

      const delForm = h('form', { novalidate: true },
        h('p', { class: 'muted' }, 'This deletes your account, word progress and game records from this browser. It cannot be undone.'),
        UI.field('Enter your password to confirm', 'deletePassword', 'password', { autocomplete: 'current-password' }),
        h('div', { class: 'form-err', role: 'alert' }),
        h('button', { class: 'btn btn-danger', type: 'submit' }, 'Delete account'));
      delForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        UI.clearErrors(delForm);
        const fd = new FormData(delForm);
        if (!window.confirm('Delete your account and all progress?')) return;
        try {
          await WQ.Auth.deleteAccount(fd.get('deletePassword'));
          UI.toast('Account deleted.');
          WQ.App.go('auth');
        } catch (err) { UI.showError(delForm, err); }
      });

      return h('div', { class: 'grid-2' },
        h('div', null, h('h2', null, 'Change password'), pwForm),
        h('div', { class: 'danger-zone' }, h('h2', null, 'Delete account'), delForm));
    }

    /* ---------- Backup ---------- */
    async function data() {
      const user = WQ.Auth.user();
      const file = h('input', { type: 'file', accept: '.json,application/json', class: 'visually-hidden', id: 'import-file' });
      file.addEventListener('change', async () => {
        const f = file.files && file.files[0];
        if (!f) return;
        try {
          const parsed = JSON.parse(await f.text());
          if (!window.confirm('Replace the progress in this account with the backup?')) return;
          await DB.importUser(user.id, parsed);
          UI.toast('Backup restored.', 'good');
          renderBody();
        } catch (err) {
          UI.toast(err instanceof SyntaxError ? 'That file is not valid JSON.' : err.message, 'bad');
        } finally {
          file.value = '';
        }
      });
      return h('div', null,
        h('h2', null, 'Backup'),
        h('p', { class: 'muted measure' }, 'Progress lives in this browser. Download a backup to keep it safe or to move it to another device, then restore it after signing in there.'),
        h('div', { class: 'actions' },
          h('button', { class: 'btn btn-gold', type: 'button', onclick: async () => {
            const backup = await DB.exportUser(user.id);
            UI.download(`wordquest-${user.username}-${U.dayKey()}.json`, JSON.stringify(backup, null, 2));
          } }, 'Download backup'),
          h('label', { class: 'btn btn-ghost', for: 'import-file' }, 'Restore from file'),
          file),
        h('p', { class: 'muted small' }, 'Restoring replaces progress, records and settings. Your username and password stay the same.'));
    }

    renderTabs();
    UI.mount(h('main', { class: 'profile' },
      h('div', { class: 'page-head' },
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => WQ.App.go('hub') }, '← Worlds'),
        h('h1', { class: 'page-title' }, 'Your profile')),
      tabsEl, body));
    await renderBody();
  });
})(window.WQ = window.WQ || {});
