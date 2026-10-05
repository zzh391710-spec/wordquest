/*
 * WordQuest · mode registry and the game shell.
 *
 * A mode registers { id, name, icon, tagline, sessionSize?(settings), start(ctx) }.
 * start(ctx) draws into ctx.stage and calls ctx.finish({...}) when the game ends.
 *
 * ctx API
 *   ctx.ask(container, entry, { type?, pool?, timeLimit?, framing?, sentence?, showDef?, onSettle?, onView? }) -> Promise<result>
 *   ctx.intro(container, entry, { label?, cta? })  -> Promise<boolean>  (only for new words, once)
 *   ctx.log(entry, type, result)                    record an answer from a custom interaction
 *   ctx.useItem(name) -> boolean                    spend an inventory item
 *   ctx.saveProfile()                               persist ctx.profile changes
 *   ctx.onCleanup(fn)                               run on exit (timers, listeners, rAF)
 *   ctx.finish({ result, score, coins, xpBonus, title, summary, detail })
 */
(function (WQ) {
  'use strict';

  const h = WQ.h, E = WQ.Engine, A = WQ.Audio, DB = WQ.DB, UI = WQ.UI;

  WQ.Modes = {
    list: [],
    register(mode) { this.list.push(mode); },
    get(id) { return this.list.find((m) => m.id === id) || null; }
  };

  WQ.Game = {
    async start(modeId) {
      const mode = WQ.Modes.get(modeId);
      const user = WQ.Auth.user();
      if (!mode || !user) return;

      const profile = await DB.profiles.get(user.id);
      const settings = profile.settings;
      A.configure(settings);
      const size = mode.sessionSize ? mode.sessionSize(settings) : settings.sessionSize;
      const entries = await E.buildSession(user.id, Object.assign({}, settings, { sessionSize: size }));
      if (!entries.length) { UI.toast('The word bank is empty.', 'bad'); return; }

      const tracker = E.createTracker(mode.id, entries);
      const cleanups = [];
      const introduced = new Set();
      let current = null;
      let finished = false;

      const stage = h('div', { class: 'stage' });
      const root = h('div', { class: 'game', 'data-mode': mode.id },
        h('header', { class: 'game-bar' },
          h('h1', { class: 'game-title' }, h('span', { 'aria-hidden': 'true' }, mode.icon), mode.name),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => ctx.quit() }, 'Exit game')),
        stage);

      function onEsc(e) { if (e.key === 'Escape') ctx.quit(); }
      document.addEventListener('keydown', onEsc);
      cleanups.push(() => document.removeEventListener('keydown', onEsc));

      function runCleanups() {
        if (current && current.destroy) current.destroy();
        current = null;
        cleanups.splice(0).forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
      }

      const ctx = {
        mode, user, profile, settings, entries, tracker, stage, E,
        audio: A,
        get finished() { return finished; },

        ask(container, entry, o = {}) {
          const type = o.type || E.pickType(entry, o.pool);
          const q = E.makeQuestion(entry, type, { sentence: o.sentence, showDef: o.showDef });
          return new Promise((resolve) => {
            const view = WQ.QuestionView(q, {
              timeLimit: o.timeLimit || 0,
              framing: o.framing,
              settings,
              correctDelay: o.correctDelay,
              hints: { count: () => profile.inventory.hint || 0, use: () => ctx.useItem('hint') },
              onSettle: o.onSettle,
              onDone(res) {
                current = null;
                tracker.log(entry, q.type, res);
                resolve(Object.assign({ question: q }, res));
              }
            });
            current = view;
            container.replaceChildren(view.el);
            if (o.onView) o.onView(view);
          });
        },

        intro(container, entry, o = {}) {
          if (!entry.isNew || introduced.has(entry.word.id)) return Promise.resolve(false);
          introduced.add(entry.word.id);
          return new Promise((resolve) => {
            const card = WQ.IntroCard(entry, {
              label: o.label, cta: o.cta, settings,
              onDone() { current = null; resolve(true); }
            });
            current = card;
            container.replaceChildren(card.el);
          });
        },

        log(entry, type, res) { tracker.log(entry, type, res); },

        useItem(name) {
          if ((profile.inventory[name] || 0) <= 0) return false;
          profile.inventory[name] -= 1;
          DB.profiles.save(user.id, profile);
          WQ.bus.emit('inventory', profile.inventory);
          return true;
        },

        saveProfile() { return DB.profiles.save(user.id, profile); },

        onCleanup(fn) { cleanups.push(fn); },

        quit() {
          if (finished) return;
          const ok = tracker.answers.length === 0 || window.confirm('Leave this game? Your answers so far will still be saved.');
          if (ok) ctx.finish({ result: 'quit', summary: 'Left the game early' });
        },

        async finish(extra = {}) {
          if (finished) return;
          finished = true;
          runCleanups();
          A.stop();
          if (tracker.answers.length === 0) { WQ.App.go('hub'); return; }
          try {
            const summary = await E.finish(user.id, tracker, extra);
            summary.mode = mode;
            summary.extra = extra;
            WQ.App.go('results', summary);
          } catch (err) {
            console.error(err);
            UI.toast('Could not save this game: ' + err.message, 'bad');
            WQ.App.go('hub');
          }
        }
      };

      UI.mount(root);
      WQ.App.current = 'game';
      try {
        await mode.start(ctx);
      } catch (err) {
        console.error(err);
        UI.toast('The game hit an error: ' + err.message, 'bad');
        ctx.finish({ result: 'quit', summary: 'Stopped by an error' });
      }
    }
  };
})(window.WQ = window.WQ || {});
