/*
 * WordQuest · data access layer
 *
 * Every method is async on purpose: today the data lives in localStorage,
 * but the same interface can later be backed by Supabase / Firebase / your
 * own API without touching the screens or game modes.
 *
 * Keys
 *   users            { [userId]: User }
 *   session          { userId, since }
 *   profile:<id>     Profile (xp, coins, inventory, settings ...)
 *   srs:<id>         { [wordId]: SrsState }
 *   records:<id>     GameRecord[] (newest first, max 500)
 */
(function (WQ) {
  'use strict';

  const S = WQ.Storage;
  const MAX_RECORDS = 500;

  const newId = () => (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);

  function defaultProfile() {
    return {
      xp: 0,
      coins: 50,
      streak: 0,
      bestStreak: 0,
      lastPlayDate: null,
      totalSessions: 0,
      inventory: { hint: 3, hourglass: 1, feather: 1 },
      cafeDecor: [],
      best: {},
      settings: {
        sessionSize: 12,
        newRatio: 0.25,
        speechRate: 0.9,
        accent: 'en-US',
        sound: true,
        autoSpeak: true
      }
    };
  }

  function withDefaults(p) {
    const d = defaultProfile();
    return Object.assign(d, p, {
      inventory: Object.assign(d.inventory, p.inventory || {}),
      settings: Object.assign(d.settings, p.settings || {}),
      best: Object.assign({}, p.best || {}),
      cafeDecor: Array.isArray(p.cafeDecor) ? p.cafeDecor.slice() : []
    });
  }

  const users = {
    async list() { return Object.values(S.get('users', {})); },
    async get(id) { return S.get('users', {})[id] || null; },
    async findByLogin(login) {
      const key = String(login || '').trim().toLowerCase();
      if (!key) return null;
      return Object.values(S.get('users', {}))
        .find((u) => u.username === key || (u.email && u.email === key)) || null;
    },
    async create(user) {
      const all = S.get('users', {});
      all[user.id] = user;
      S.set('users', all);
      return user;
    },
    async update(id, patch) {
      const all = S.get('users', {});
      if (!all[id]) throw new Error('Account not found.');
      all[id] = Object.assign({}, all[id], patch, { updatedAt: Date.now() });
      S.set('users', all);
      return all[id];
    },
    async remove(id) {
      const all = S.get('users', {});
      delete all[id];
      S.set('users', all);
      ['profile:', 'srs:', 'records:'].forEach((p) => S.remove(p + id));
    }
  };

  const session = {
    get() { return S.get('session', null); },
    set(s) { S.set('session', s); },
    clear() { S.remove('session'); }
  };

  const profiles = {
    async get(id) {
      const p = S.get('profile:' + id, null);
      return p ? withDefaults(p) : defaultProfile();
    },
    async save(id, profile) {
      S.set('profile:' + id, profile);
      return profile;
    }
  };

  const srs = {
    async get(id) { return S.get('srs:' + id, {}); },
    async save(id, map) { S.set('srs:' + id, map); }
  };

  const records = {
    async list(id) { return S.get('records:' + id, []); },
    async add(id, rec) {
      const list = S.get('records:' + id, []);
      list.unshift(rec);
      if (list.length > MAX_RECORDS) list.length = MAX_RECORDS;
      S.set('records:' + id, list);
      return rec;
    }
  };

  async function exportUser(id) {
    const user = await users.get(id);
    if (!user) throw new Error('Account not found.');
    const { passwordHash, salt, ...account } = user;
    return {
      format: 'wordquest-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      account,
      profile: await profiles.get(id),
      srs: await srs.get(id),
      records: await records.list(id)
    };
  }

  /** Restores progress into the signed-in account. Credentials are never imported. */
  async function importUser(id, data) {
    if (!data || data.format !== 'wordquest-backup') throw new Error('This file is not a WordQuest backup.');
    if (data.profile && typeof data.profile === 'object') await profiles.save(id, withDefaults(data.profile));
    if (data.srs && typeof data.srs === 'object') await srs.save(id, data.srs);
    if (Array.isArray(data.records)) S.set('records:' + id, data.records.slice(0, MAX_RECORDS));
  }

  WQ.DB = { newId, defaultProfile, users, session, profiles, srs, records, exportUser, importUser };
})(window.WQ = window.WQ || {});
