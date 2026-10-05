/*
 * WordQuest · learning engine shared by every game mode
 *
 *  buildSession()  picks due reviews + new words for one game
 *  makeQuestion()  turns a word into one of 7 question types
 *  createTracker() records answers during the game
 *  finish()        writes SRS, XP, coins, streak and the game record
 */
(function (WQ) {
  'use strict';

  const U = WQ.U, SRS = WQ.SRS, DB = WQ.DB;
  const E = {};

  /* ---------- levels ---------- */
  E.levelInfo = function (xp) {
    let level = 1, need = 100, rest = Math.max(0, xp || 0);
    while (rest >= need) { rest -= need; level += 1; need = 100 + (level - 1) * 50; }
    return { level, into: rest, need, pct: rest / need };
  };

  /* ---------- word bank stats ---------- */
  E.bankStats = function (srs) {
    const now = Date.now();
    const out = { total: 0, fresh: 0, learning: 0, review: 0, mastered: 0, due: 0 };
    WQ.Words.all().forEach((w) => {
      out.total += 1;
      const s = srs[w.id];
      const st = SRS.stage(s);
      if (st === 'new') out.fresh += 1; else out[st] += 1;
      if (SRS.isDue(s, now)) out.due += 1;
    });
    return out;
  };

  /* ---------- session ---------- */
  E.buildSession = async function (userId, settings) {
    const size = Math.max(4, settings.sessionSize || 12);
    const ratio = settings.newRatio == null ? 0.25 : settings.newRatio;
    const srs = await DB.srs.get(userId);
    const now = Date.now();
    const all = WQ.Words.all();
    const seen = (w) => srs[w.id] && srs[w.id].seen;

    const due = all.filter((w) => SRS.isDue(srs[w.id], now)).sort((a, b) => srs[a.id].due - srs[b.id].due);
    const fresh = U.shuffle(all.filter((w) => !seen(w)));
    const waiting = all.filter((w) => seen(w) && !SRS.isDue(srs[w.id], now))
      .sort((a, b) => (srs[a.id].ef - srs[b.id].ef) || (srs[a.id].due - srs[b.id].due));

    // A heavy review backlog pauses new words so the backlog can clear.
    let nNew = due.length >= size * 2 ? 0 : Math.min(fresh.length, Math.max(1, Math.round(size * ratio)));
    let list = due.slice(0, size - nNew);
    list = list.concat(fresh.slice(0, nNew));
    if (list.length < size) list = list.concat(fresh.slice(nNew, nNew + size - list.length));
    if (list.length < size) list = list.concat(waiting.slice(0, size - list.length));

    return U.shuffle(list).map((w) => ({
      word: w,
      state: srs[w.id] || null,
      isNew: !seen(w),
      isDue: SRS.isDue(srs[w.id], now)
    }));
  };

  /* ---------- question building ---------- */
  E.blank = function (w) {
    const re = new RegExp('\\b' + U.escapeRegExp(w.word) + '\\b', 'i');
    return w.example.replace(re, '_____');
  };

  function distractors(w) {
    const others = WQ.Words.all().filter((x) => x.id !== w.id);
    const conf = (w.confusables || []).map((c) => c.toLowerCase());
    const inBank = others.filter((x) => conf.includes(x.word));
    const external = U.shuffle(conf.filter((c) => c !== w.word && !others.some((x) => x.word === c)));
    const samePos = U.shuffle(others.filter((x) => x.pos === w.pos && !inBank.includes(x)));
    const rest = U.shuffle(others.filter((x) => x.pos !== w.pos && !inBank.includes(x)));
    return { bank: U.shuffle(inBank).concat(samePos, rest), external };
  }

  /** Options are English words; one look-alike from outside the bank may join. */
  E.wordOptions = function (w, n = 4) {
    const d = distractors(w);
    const labels = [];
    if (d.external.length) labels.push(d.external[0]);
    for (const x of d.bank) {
      if (labels.length >= n - 1) break;
      if (!labels.includes(x.word)) labels.push(x.word);
    }
    return U.shuffle([{ label: w.word, correct: true }].concat(labels.slice(0, n - 1).map((l) => ({ label: l, correct: false }))));
  };

  /** Options are Chinese meanings of bank words */
  E.meaningOptions = function (w, n = 4) {
    const picks = distractors(w).bank.slice(0, n - 1);
    return U.shuffle([{ label: w.cn, correct: true }].concat(picks.map((x) => ({ label: x.cn, correct: false }))));
  };

  E.TIERS = {
    recognize: ['meaning', 'def', 'listen'],
    recall: ['spell-def', 'spell-listen'],
    use: ['cloze', 'cloze-type']
  };

  E.tierOf = (entry) => SRS.tier(entry.state);

  E.pickType = function (entry, pool) {
    const tier = E.tierOf(entry);
    const list = (pool && pool[tier]) || E.TIERS[tier];
    return U.pick(list);
  };

  E.makeQuestion = function (entry, type) {
    const w = entry.word;
    const base = { type, entry, word: w, answer: w.word };
    switch (type) {
      case 'meaning':
        return Object.assign(base, { input: 'choice', prompt: { kind: 'word' }, options: E.meaningOptions(w), speak: true, hint: 'fifty', ask: 'Choose the meaning' });
      case 'listen':
        return Object.assign(base, { input: 'choice', prompt: { kind: 'audio' }, options: E.meaningOptions(w), speak: true, hint: 'reveal-word', ask: 'What does this word mean?' });
      case 'def':
        return Object.assign(base, { input: 'choice', prompt: { kind: 'def' }, options: E.wordOptions(w), hint: 'cn', ask: 'Which word has this meaning?' });
      case 'spell-def':
        return Object.assign(base, { input: 'type', prompt: { kind: 'def' }, hint: 'letters', ask: 'Type the word' });
      case 'spell-listen':
        return Object.assign(base, { input: 'type', prompt: { kind: 'audio' }, speak: true, hint: 'letters', ask: 'Type the word you hear' });
      case 'cloze':
        return Object.assign(base, { input: 'choice', prompt: { kind: 'sentence', text: E.blank(w) }, options: E.wordOptions(w), hint: 'cn', ask: 'Fill in the blank' });
      case 'cloze-type':
        return Object.assign(base, { input: 'type', prompt: { kind: 'sentence', text: E.blank(w), showDef: true }, hint: 'letters', ask: 'Type the missing word' });
      default:
        throw new Error('Unknown question type: ' + type);
    }
  };

  E.checkTyped = function (q, text) {
    const given = String(text || '').trim().toLowerCase();
    const answer = q.answer.toLowerCase();
    if (given === answer) return { correct: true, close: false };
    return { correct: false, close: answer.length >= 5 && U.levenshtein(given, answer) <= 1 };
  };

  E.quality = function (res) {
    if (res.timeout) return 0;
    if (res.correct) return res.hinted ? 3 : (res.ms || 0) < 4000 ? 5 : 4;
    return res.close ? 2 : 1;
  };

  /* ---------- tracking ---------- */
  E.createTracker = function (modeId, entries) {
    const t = { modeId, entries, startedAt: Date.now(), answers: [], combo: 0, bestCombo: 0 };
    t.log = function (entry, type, res) {
      t.answers.push({
        wordId: entry.word.id, type, correct: !!res.correct, quality: E.quality(res),
        ms: Math.round(res.ms || 0), hinted: !!res.hinted
      });
      if (res.correct) { t.combo += 1; t.bestCombo = Math.max(t.bestCombo, t.combo); }
      else t.combo = 0;
    };
    t.correctCount = () => t.answers.filter((a) => a.correct).length;
    t.accuracy = () => (t.answers.length ? t.correctCount() / t.answers.length : 0);
    t.rolling = (n = 8) => {
      const last = t.answers.slice(-n);
      return last.length ? last.filter((a) => a.correct).length / last.length : 1;
    };
    return t;
  };

  /** Adaptive pacing: keeps players near 75–85% accuracy */
  E.pace = function (tracker) {
    if (tracker.answers.length < 4) return 'steady';
    const r = tracker.rolling();
    return r < 0.65 ? 'easier' : r > 0.9 ? 'harder' : 'steady';
  };

  E.timeFor = function (tracker, base) {
    const p = E.pace(tracker);
    return p === 'easier' ? base + 8 : p === 'harder' ? Math.max(8, base - 5) : base;
  };

  /* ---------- end of game ---------- */
  E.finish = async function (userId, tracker, extra = {}) {
    const now = Date.now();
    const srs = await DB.srs.get(userId);

    // One SRS update per word: the weakest answer in this game counts.
    const byWord = {};
    tracker.answers.forEach((a) => {
      const b = byWord[a.wordId] || (byWord[a.wordId] = { correct: 0, wrong: 0, quality: 5 });
      if (a.correct) b.correct += 1; else b.wrong += 1;
      b.quality = Math.min(b.quality, a.quality);
    });

    const words = [];
    let newWords = 0, reviewed = 0;
    Object.keys(byWord).forEach((id) => {
      const before = srs[id];
      if (!before || !before.seen) newWords += 1; else reviewed += 1;
      srs[id] = SRS.review(before, byWord[id].quality, now);
      const w = WQ.Words.get(id);
      if (w) words.push(Object.assign({ word: w, stage: SRS.stage(srs[id]), due: srs[id].due }, byWord[id]));
    });
    await DB.srs.save(userId, srs);

    const total = tracker.answers.length;
    const correct = tracker.correctCount();
    const xp = correct * 10 + (extra.xpBonus || 0);
    const coins = Math.max(0, Math.round((extra.coins || 0) + correct * 2));

    const profile = await DB.profiles.get(userId);
    const levelBefore = E.levelInfo(profile.xp).level;
    profile.xp += xp;
    profile.coins += coins;
    profile.totalSessions += 1;

    if (total > 0) {
      const today = U.dayKey();
      if (profile.lastPlayDate !== today) {
        const gap = profile.lastPlayDate ? U.daysBetween(profile.lastPlayDate, today) : null;
        profile.streak = gap === 1 ? profile.streak + 1 : 1;
        profile.lastPlayDate = today;
        profile.bestStreak = Math.max(profile.bestStreak || 0, profile.streak);
      }
    }

    const score = Math.max(0, Math.round(extra.score || 0));
    const prevBest = profile.best[tracker.modeId] || 0;
    const isBest = score > 0 && score > prevBest;
    if (isBest) profile.best[tracker.modeId] = score;
    await DB.profiles.save(userId, profile);

    const record = {
      id: DB.newId(),
      mode: tracker.modeId,
      startedAt: tracker.startedAt,
      endedAt: now,
      durationSec: Math.round((now - tracker.startedAt) / 1000),
      result: extra.result || 'done',
      score,
      questions: total,
      correct,
      accuracy: total ? Math.round((correct / total) * 100) : 0,
      xp,
      coins,
      newWords,
      reviewedWords: reviewed,
      bestCombo: tracker.bestCombo,
      words: words.map((x) => x.word.id).slice(0, 40),
      summary: extra.summary || '',
      detail: extra.detail || {}
    };
    await DB.records.add(userId, record);

    words.sort((a, b) => (b.wrong - a.wrong) || a.word.word.localeCompare(b.word.word));
    return { record, words, xp, coins, isBest, levelBefore, levelAfter: E.levelInfo(profile.xp).level, profile };
  };

  WQ.Engine = E;
})(window.WQ = window.WQ || {});
