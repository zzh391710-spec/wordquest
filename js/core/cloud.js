/*
 * WordQuest · cloud backend (AWS Amplify: Cognito accounts + DynamoDB data)
 *
 * If amplify_outputs.json is deployed next to index.html, this file swaps the
 * browser-only accounts/data in auth.js + db.js for online ones. If the file is
 * missing (opening index.html locally, or no backend yet), nothing changes and
 * the game keeps working exactly as before with localStorage.
 *
 *   Cognito user pool   -> passwords (hashed by AWS, never visible to anyone)
 *   UserProfile table   -> username, display name, email, avatar, sign-in stats,
 *                          level / coins / streak summary
 *   WordProgress table  -> one row per player per word (stage, reps, due date...)
 *   GameRecord table    -> one row per finished game
 */
(function (WQ) {
  'use strict';

  const LOGIN_DOMAIN = 'wordquest.example'; // private login id = <username>@wordquest.example
  const MAX_RECORDS = 500;

  const Cloud = { enabled: false, init };
  WQ.Cloud = Cloud;

  let L = null;          // window.AmplifyLib
  let M = null;          // client.models
  let userRow = null;    // this player's UserProfile row
  let sub = null;        // Cognito user id
  let srsMap = null;     // wordId -> SRS state (loaded lazily)
  let srsIds = new Map(); // wordId -> { id, sig }
  let recCache = null;   // game records, newest first

  /* ---------- helpers ---------- */
  const loginId = (username) => `${username}@${LOGIN_DOMAIN}`;
  const iso = (ms) => new Date(ms || 0).toISOString();
  const toMs = (s) => (s ? Date.parse(s) || 0 : 0);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const parseJson = (v, fallback) => {
    if (v == null || v === '') return fallback;
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch (e) { return fallback; }
  };
  const loginIdToUsername = (id) => String(id || '').split('@')[0];

  async function check(promise) {
    const res = await promise;
    if (res && res.errors && res.errors.length) throw new Error(res.errors[0].message || 'Server error.');
    return res.data;
  }

  async function listAll(model) {
    const out = [];
    let nextToken = null;
    do {
      const res = await model.list({ limit: 1000, nextToken });
      if (res.errors && res.errors.length) throw new Error(res.errors[0].message || 'Server error.');
      out.push(...res.data);
      nextToken = res.nextToken;
    } while (nextToken);
    return out;
  }

  async function runLimited(jobs, limit) {
    let i = 0;
    async function worker() { while (i < jobs.length) { const job = jobs[i++]; await job(); } }
    await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
  }

  function mapError(e, fallbackField) {
    const A = WQ.Auth.AuthError;
    if (e instanceof A) return e;
    const name = (e && e.name) || '';
    if (name === 'UsernameExistsException') return new A('That username is taken.', 'username');
    if (name === 'InvalidPasswordException') return new A(e.message || 'That password is not allowed.', 'password');
    if (name === 'NotAuthorizedException' || name === 'UserNotFoundException') return new A('Wrong username or password.', 'password');
    if (name === 'LimitExceededException' || name === 'TooManyRequestsException') return new A('Too many attempts. Please wait a few minutes and try again.');
    if (name === 'NetworkError' || /network/i.test((e && e.message) || '')) return new A('Cannot reach the server. Check your connection and try again.');
    return new A((e && e.message) || 'Something went wrong.', fallbackField || null);
  }

  /* ---------- row <-> object mapping ---------- */
  function mergeProfile(p) {
    const d = WQ.DB.defaultProfile();
    p = p || {};
    return Object.assign(d, p, {
      inventory: Object.assign(d.inventory, p.inventory || {}),
      settings: Object.assign(d.settings, p.settings || {}),
      best: Object.assign({}, p.best || {}),
      cafeDecor: Array.isArray(p.cafeDecor) ? p.cafeDecor.slice() : []
    });
  }

  function profileToRow(p) {
    return {
      xp: p.xp | 0,
      coins: p.coins | 0,
      streak: p.streak | 0,
      bestStreak: p.bestStreak | 0,
      totalSessions: p.totalSessions | 0,
      lastPlayDate: p.lastPlayDate || null,
      gameState: JSON.stringify({ inventory: p.inventory, settings: p.settings, best: p.best, cafeDecor: p.cafeDecor })
    };
  }

  function rowToProfile(r) {
    const state = parseJson(r.gameState, {});
    return mergeProfile(Object.assign({
      xp: r.xp || 0,
      coins: r.coins == null ? 50 : r.coins,
      streak: r.streak || 0,
      bestStreak: r.bestStreak || 0,
      totalSessions: r.totalSessions || 0,
      lastPlayDate: r.lastPlayDate || null
    }, state));
  }

  function rowToUser(r) {
    return {
      id: sub,
      username: r.username,
      displayName: r.displayName,
      email: r.email || '',
      avatar: r.avatar || '🦊',
      createdAt: toMs(r.createdAt),
      updatedAt: toMs(r.updatedAt),
      lastLoginAt: toMs(r.lastLoginAt),
      loginCount: r.loginCount || 1
    };
  }

  const srsSig = (s) => [s.ef, s.interval, s.reps, s.due, s.seen, s.correct, s.wrong, s.lapses, s.last].join('|');

  function srsToRow(wordId, s) {
    const w = WQ.Words && WQ.Words.get ? WQ.Words.get(wordId) : null;
    return {
      wordId,
      word: w ? w.word : null,
      stage: WQ.SRS.stage(s),
      ef: s.ef,
      interval: Math.round(s.interval || 0),
      reps: s.reps | 0,
      seen: s.seen | 0,
      correct: s.correct | 0,
      wrong: s.wrong | 0,
      lapses: s.lapses | 0,
      due: iso(s.due),
      lastSeen: iso(s.last)
    };
  }

  function rowToSrs(r) {
    return {
      ef: r.ef == null ? 2.5 : r.ef,
      interval: r.interval || 0,
      reps: r.reps || 0,
      due: toMs(r.due),
      seen: r.seen || 0,
      correct: r.correct || 0,
      wrong: r.wrong || 0,
      lapses: r.lapses || 0,
      last: toMs(r.lastSeen)
    };
  }

  function recToRow(rec) {
    return {
      id: rec.id,
      mode: rec.mode,
      result: rec.result || 'done',
      startedAt: iso(rec.startedAt),
      endedAt: iso(rec.endedAt),
      durationSec: rec.durationSec | 0,
      score: rec.score | 0,
      questions: rec.questions | 0,
      correct: rec.correct | 0,
      accuracy: rec.accuracy | 0,
      xp: rec.xp | 0,
      coins: rec.coins | 0,
      newWords: rec.newWords | 0,
      reviewedWords: rec.reviewedWords | 0,
      bestCombo: rec.bestCombo | 0,
      words: Array.isArray(rec.words) ? rec.words.map(String) : [],
      summary: rec.summary || '',
      detail: JSON.stringify(rec.detail || {})
    };
  }

  function rowToRec(r) {
    return {
      id: r.id,
      mode: r.mode,
      result: r.result || 'done',
      startedAt: toMs(r.startedAt),
      endedAt: toMs(r.endedAt),
      durationSec: r.durationSec || 0,
      score: r.score || 0,
      questions: r.questions || 0,
      correct: r.correct || 0,
      accuracy: r.accuracy || 0,
      xp: r.xp || 0,
      coins: r.coins || 0,
      newWords: r.newWords || 0,
      reviewedWords: r.reviewedWords || 0,
      bestCombo: r.bestCombo || 0,
      words: r.words || [],
      summary: r.summary || '',
      detail: parseJson(r.detail, {})
    };
  }

  /* ---------- session / profile loading ---------- */
  function resetCaches() {
    userRow = null; sub = null; srsMap = null; srsIds = new Map(); recCache = null;
  }

  /** Reads the signed-in Cognito user and loads (or creates) the UserProfile row. */
  async function loadUser(fallbackLoginId) {
    const cur = await L.getCurrentUser();
    sub = cur.userId;
    const rows = (await listAll(M.UserProfile)).sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
    userRow = rows[0] || null;
    if (!userRow) {
      // Account exists but its profile row is missing (e.g. a failed first save): repair it.
      const username = loginIdToUsername((cur.signInDetails && cur.signInDetails.loginId) || fallbackLoginId || cur.username);
      userRow = await check(M.UserProfile.create(Object.assign({
        username,
        displayName: username,
        email: null,
        avatar: WQ.U.pick(WQ.Auth.AVATARS),
        loginCount: 1,
        lastLoginAt: new Date().toISOString()
      }, profileToRow(WQ.DB.defaultProfile()))));
    }
    return rowToUser(userRow);
  }

  /* ---------- auth overrides ---------- */
  async function register(input) {
    const A = WQ.Auth.AuthError, V = WQ.Auth._v;
    const displayName = V.cleanDisplayName(input.displayName);
    const username = String(input.username || '').trim().toLowerCase();
    if (!V.USERNAME_RE.test(username)) throw new A('Usernames use 3–20 lowercase letters, numbers or underscores.', 'username');
    const email = V.cleanEmail(input.email);
    V.checkNewPassword(input.password, input.confirm);

    try { await L.signOut(); } catch (e) { /* not signed in */ }
    resetCaches();
    try {
      const res = await L.signUp({
        username: loginId(username),
        password: input.password,
        options: { userAttributes: { email: loginId(username) } }
      });
      if (res.nextStep && res.nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
        throw new A('The server asked for an email confirmation code, which this game does not support. Please contact the site owner.');
      }
      const si = await L.signIn({ username: loginId(username), password: input.password });
      if (!si.isSignedIn) throw new A('Sign-in needs an extra step that this game does not support.');
    } catch (e) {
      throw mapError(e, 'username');
    }

    try {
      const cur = await L.getCurrentUser();
      sub = cur.userId;
      userRow = await check(M.UserProfile.create(Object.assign({
        username,
        displayName,
        email: email || null,
        avatar: WQ.U.pick(WQ.Auth.AVATARS),
        loginCount: 1,
        lastLoginAt: new Date().toISOString()
      }, profileToRow(WQ.DB.defaultProfile()))));
    } catch (e) {
      throw mapError(e);
    }
    return WQ.Auth._setCurrent(rowToUser(userRow));
  }

  async function login(login, password) {
    const A = WQ.Auth.AuthError;
    const name = String(login || '').trim().toLowerCase();
    if (!name) throw new A('Enter your username.', 'login');
    if (name.includes('@')) throw new A('Please sign in with your username (not your email).', 'login');
    try { await L.signOut(); } catch (e) { /* not signed in */ }
    resetCaches();
    try {
      const si = await L.signIn({ username: loginId(name), password: String(password || '') });
      if (!si.isSignedIn) throw new A('Sign-in needs an extra step that this game does not support.');
      const user = await loadUser(loginId(name));
      userRow = await check(M.UserProfile.update({
        id: userRow.id,
        lastLoginAt: new Date().toISOString(),
        loginCount: (userRow.loginCount || 0) + 1
      }));
      return WQ.Auth._setCurrent(rowToUser(userRow)) || user;
    } catch (e) {
      resetCaches();
      throw mapError(e, 'password');
    }
  }

  async function restore() {
    try {
      await L.getCurrentUser();
    } catch (e) {
      return null; // nobody signed in
    }
    try {
      return WQ.Auth._setCurrent(await loadUser());
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  function logout() {
    WQ.Auth._setCurrent(null);
    resetCaches();
    L.signOut().catch((e) => console.error(e));
  }

  async function updateAccount(patch) {
    const A = WQ.Auth.AuthError, V = WQ.Auth._v;
    if (!userRow) throw new A('Please sign in first.');
    const clean = { id: userRow.id };
    if ('displayName' in patch) clean.displayName = V.cleanDisplayName(patch.displayName);
    if ('email' in patch) clean.email = V.cleanEmail(patch.email) || null;
    if ('avatar' in patch && WQ.Auth.AVATARS.includes(patch.avatar)) clean.avatar = patch.avatar;
    userRow = await check(M.UserProfile.update(clean));
    return WQ.Auth._setCurrent(rowToUser(userRow));
  }

  async function changePassword(currentPw, newPw, confirm) {
    const A = WQ.Auth.AuthError, V = WQ.Auth._v;
    if (!userRow) throw new A('Please sign in first.');
    V.checkNewPassword(newPw, confirm, 'newPassword');
    try {
      await L.updatePassword({ oldPassword: String(currentPw || ''), newPassword: newPw });
    } catch (e) {
      if (e && e.name === 'NotAuthorizedException') throw new A('Your current password is not correct.', 'current');
      throw mapError(e, 'newPassword');
    }
  }

  async function deleteAccount(password) {
    const A = WQ.Auth.AuthError;
    if (!userRow) throw new A('Please sign in first.');
    // Re-check the password: a wrong "old password" is rejected before any other rule is looked at.
    try {
      await L.updatePassword({ oldPassword: String(password || ''), newPassword: String(password || '') });
    } catch (e) {
      if (e && e.name === 'NotAuthorizedException') throw new A('Your current password is not correct.', 'deletePassword');
      if (e && (e.name === 'LimitExceededException' || e.name === 'TooManyRequestsException')) throw mapError(e);
      // any other error (e.g. "new password must differ") means the old password was accepted
    }
    try {
      const [words, recs] = await Promise.all([listAll(M.WordProgress), listAll(M.GameRecord)]);
      await runLimited([
        ...words.map((r) => () => check(M.WordProgress.delete({ id: r.id }))),
        ...recs.map((r) => () => check(M.GameRecord.delete({ id: r.id }))),
        () => check(M.UserProfile.delete({ id: userRow.id }))
      ], 6);
      await L.deleteUser();
    } catch (e) {
      throw mapError(e, 'deletePassword');
    }
    WQ.Auth._setCurrent(null);
    resetCaches();
  }

  /* ---------- data overrides ---------- */
  async function loadSrs() {
    if (srsMap) return srsMap;
    const rows = await listAll(M.WordProgress);
    const map = {};
    const ids = new Map();
    rows.forEach((r) => {
      const s = rowToSrs(r);
      map[r.wordId] = s;
      ids.set(r.wordId, { id: r.id, sig: srsSig(s) });
    });
    srsMap = map;
    srsIds = ids;
    return srsMap;
  }

  async function saveSrs(map) {
    await loadSrs();
    const jobs = [];
    Object.keys(map).forEach((wordId) => {
      const s = map[wordId];
      const sig = srsSig(s);
      const known = srsIds.get(wordId);
      if (known && known.sig === sig) return;
      jobs.push(async () => {
        if (known) {
          await check(M.WordProgress.update(Object.assign({ id: known.id }, srsToRow(wordId, s))));
          known.sig = sig;
        } else {
          const row = await check(M.WordProgress.create(srsToRow(wordId, s)));
          srsIds.set(wordId, { id: row.id, sig });
        }
      });
    });
    await runLimited(jobs, 5);
    srsMap = clone(map);
  }

  async function loadRecords() {
    if (recCache) return recCache;
    const rows = await listAll(M.GameRecord);
    recCache = rows.map(rowToRec).sort((a, b) => b.endedAt - a.endedAt).slice(0, MAX_RECORDS);
    return recCache;
  }

  function installOverrides() {
    const DB = WQ.DB, Auth = WQ.Auth;

    Object.assign(Auth, { register, login, restore, logout, updateAccount, changePassword, deleteAccount });

    DB.users.get = async (id) => (userRow && sub === id ? rowToUser(userRow) : null);

    DB.profiles.get = async () => (userRow ? rowToProfile(userRow) : DB.defaultProfile());
    DB.profiles.save = async (id, profile) => {
      if (!userRow) throw new Error('Please sign in first.');
      userRow = await check(M.UserProfile.update(Object.assign({ id: userRow.id }, profileToRow(profile))));
      return profile;
    };

    DB.srs.get = async () => clone(await loadSrs());
    DB.srs.save = async (id, map) => { await saveSrs(map); };

    DB.records.list = async () => (await loadRecords()).slice();
    DB.records.add = async (id, rec) => {
      await check(M.GameRecord.create(recToRow(rec)));
      if (recCache) recCache.unshift(rec);
      return rec;
    };

    DB.importUser = async (id, data) => {
      if (!data || data.format !== 'wordquest-backup') throw new Error('This file is not a WordQuest backup.');
      if (data.profile && typeof data.profile === 'object') await DB.profiles.save(id, mergeProfile(data.profile));
      if (data.srs && typeof data.srs === 'object') await saveSrs(data.srs);
      if (Array.isArray(data.records)) {
        const have = new Set((await loadRecords()).map((r) => r.id));
        const fresh = data.records.filter((r) => r && r.id && !have.has(r.id)).slice(0, MAX_RECORDS);
        await runLimited(fresh.map((r) => () => check(M.GameRecord.create(recToRow(r)))), 5);
        recCache = null;
      }
    };
  }

  /* ---------- start-up ---------- */
  async function init() {
    if (Cloud.enabled) return true;
    if (!window.AmplifyLib) return false;
    let outputs = null;
    try {
      const res = await fetch('amplify_outputs.json', { cache: 'no-store' });
      if (!res.ok) return false;
      outputs = await res.json();
    } catch (e) {
      return false; // opened as a local file, or no backend deployed yet
    }
    if (!outputs || !outputs.auth || !outputs.data) return false;

    L = window.AmplifyLib;
    L.Amplify.configure(outputs);
    M = L.generateClient().models;
    installOverrides();
    Cloud.enabled = true;
    return true;
  }
})(window.WQ = window.WQ || {});
