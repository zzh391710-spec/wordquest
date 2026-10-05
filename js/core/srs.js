/*
 * WordQuest · spaced repetition (SM-2 variant)
 *
 * Quality scale used by the engine:
 *   5 fast & correct · 4 correct · 3 correct with a hint
 *   2 wrong but close (one-letter typo) · 1 wrong · 0 timed out
 */
(function (WQ) {
  'use strict';

  const MIN = 60 * 1000;
  const DAY = 24 * 60 * MIN;

  function fresh() {
    return { ef: 2.5, interval: 0, reps: 0, due: 0, seen: 0, correct: 0, wrong: 0, lapses: 0, last: 0 };
  }

  function review(state, quality, now = Date.now()) {
    const s = Object.assign(fresh(), state || {});
    s.seen += 1;
    s.last = now;
    if (quality >= 3) {
      s.correct += 1;
      s.reps += 1;
      s.interval = s.reps === 1 ? 1 : s.reps === 2 ? 3 : Math.round(s.interval * s.ef);
      s.due = now + s.interval * DAY;
    } else {
      s.wrong += 1;
      if (s.reps > 0) s.lapses += 1;
      s.reps = 0;
      s.interval = 0;
      s.due = now + 10 * MIN; // comes back in the next game
    }
    const q = quality;
    s.ef = Math.max(1.3, +(s.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))).toFixed(3));
    return s;
  }

  /** Display stage of a word */
  function stage(s) {
    if (!s || !s.seen) return 'new';
    if (s.reps >= 5 && s.interval >= 21) return 'mastered';
    if (s.reps >= 3) return 'review';
    return 'learning';
  }

  /** Which kind of question a word is ready for */
  function tier(s) {
    const r = s ? s.reps : 0;
    if (r <= 1) return 'recognize';
    if (r <= 3) return 'recall';
    return 'use';
  }

  const isDue = (s, now = Date.now()) => !!(s && s.seen && s.due <= now);

  WQ.SRS = { fresh, review, stage, tier, isDue, DAY, MIN };
})(window.WQ = window.WQ || {});
