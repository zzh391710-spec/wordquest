/*
 * WordQuest · accounts
 *
 * Local accounts: passwords are salted and hashed with PBKDF2-SHA256
 * (Web Crypto) before they are stored. This protects against casual
 * reading of localStorage, but it is NOT server-side security; swap
 * WQ.DB for a real backend before going multi-device / public.
 */
(function (WQ) {
  'use strict';

  const DB = WQ.DB;
  const ITERATIONS = 120000;
  const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const AVATARS = ['🦊', '🐼', '🦉', '🐙', '🐯', '🐧', '🦄', '🐸', '🐨', '🦁'];

  class AuthError extends Error {
    constructor(message, field) {
      super(message);
      this.name = 'AuthError';
      this.field = field || null;
    }
  }

  const toHex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');

  function randomHex(bytes = 16) {
    const a = new Uint8Array(bytes);
    crypto.getRandomValues(a);
    return toHex(a);
  }

  async function hashPassword(password, salt) {
    if (window.crypto && crypto.subtle && window.TextEncoder) {
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: enc.encode(salt), iterations: ITERATIONS, hash: 'SHA-256' }, key, 256);
      return 'pbkdf2$' + toHex(bits);
    }
    // Fallback for very old browsers / insecure contexts: obfuscation only.
    let h = 2166136261;
    const s = salt + ':' + password;
    for (let r = 0; r < 2000; r++) {
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    }
    return 'fnv$' + (h >>> 0).toString(16);
  }

  function publicUser(u) {
    if (!u) return null;
    const { passwordHash, salt, ...rest } = u;
    return rest;
  }

  let current = null;

  function startSession(user) {
    current = publicUser(user);
    DB.session.set({ userId: user.id, since: Date.now() });
    WQ.bus.emit('auth', current);
  }

  function requireUser() {
    if (!current) throw new AuthError('Please sign in first.');
    return current;
  }

  function cleanDisplayName(v) {
    const name = String(v || '').trim();
    if (!name) throw new AuthError('Enter a display name.', 'displayName');
    if (name.length > 24) throw new AuthError('Display names can be up to 24 characters.', 'displayName');
    return name;
  }

  function cleanEmail(v) {
    const email = String(v || '').trim().toLowerCase();
    if (email && !EMAIL_RE.test(email)) throw new AuthError('Enter a valid email address, or leave it empty.', 'email');
    return email;
  }

  function checkNewPassword(pw, confirm, field = 'password') {
    if (String(pw || '').length < 6) throw new AuthError('Passwords need at least 6 characters.', field);
    if (pw !== confirm) throw new AuthError('The two passwords do not match.', 'confirm');
  }

  async function register(input) {
    const displayName = cleanDisplayName(input.displayName);
    const username = String(input.username || '').trim().toLowerCase();
    if (!USERNAME_RE.test(username)) {
      throw new AuthError('Usernames use 3–20 lowercase letters, numbers or underscores.', 'username');
    }
    const email = cleanEmail(input.email);
    checkNewPassword(input.password, input.confirm);

    if (await DB.users.findByLogin(username)) throw new AuthError('That username is taken.', 'username');
    if (email && await DB.users.findByLogin(email)) throw new AuthError('That email is already registered.', 'email');

    const salt = randomHex(16);
    const now = Date.now();
    const user = {
      id: DB.newId(),
      username,
      displayName,
      email,
      avatar: WQ.U.pick(AVATARS),
      salt,
      passwordHash: await hashPassword(input.password, salt),
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
      loginCount: 1
    };
    await DB.users.create(user);
    await DB.profiles.save(user.id, DB.defaultProfile());
    startSession(user);
    return publicUser(user);
  }

  async function login(loginId, password) {
    if (!String(loginId || '').trim()) throw new AuthError('Enter your username or email.', 'login');
    const user = await DB.users.findByLogin(loginId);
    if (!user) throw new AuthError('No account matches that username or email.', 'login');
    const hash = await hashPassword(String(password || ''), user.salt);
    if (hash !== user.passwordHash) throw new AuthError('Wrong password. Try again.', 'password');
    const updated = await DB.users.update(user.id, { lastLoginAt: Date.now(), loginCount: (user.loginCount || 0) + 1 });
    startSession(updated);
    return publicUser(updated);
  }

  async function restore() {
    const s = DB.session.get();
    if (!s) return null;
    const user = await DB.users.get(s.userId);
    if (!user) { DB.session.clear(); return null; }
    current = publicUser(user);
    return current;
  }

  function logout() {
    current = null;
    DB.session.clear();
    WQ.bus.emit('auth', null);
  }

  async function updateAccount(patch) {
    const me = requireUser();
    const clean = {};
    if ('displayName' in patch) clean.displayName = cleanDisplayName(patch.displayName);
    if ('email' in patch) {
      clean.email = cleanEmail(patch.email);
      if (clean.email && clean.email !== me.email) {
        const other = await DB.users.findByLogin(clean.email);
        if (other && other.id !== me.id) throw new AuthError('That email is already registered.', 'email');
      }
    }
    if ('avatar' in patch && AVATARS.includes(patch.avatar)) clean.avatar = patch.avatar;
    const updated = await DB.users.update(me.id, clean);
    current = publicUser(updated);
    WQ.bus.emit('auth', current);
    return current;
  }

  async function verifyPassword(userId, password, field = 'current') {
    const user = await DB.users.get(userId);
    const hash = await hashPassword(String(password || ''), user.salt);
    if (hash !== user.passwordHash) throw new AuthError('Your current password is not correct.', field);
    return user;
  }

  async function changePassword(currentPw, newPw, confirm) {
    const me = requireUser();
    await verifyPassword(me.id, currentPw, 'current');
    checkNewPassword(newPw, confirm, 'newPassword');
    const salt = randomHex(16);
    await DB.users.update(me.id, { salt, passwordHash: await hashPassword(newPw, salt) });
  }

  async function deleteAccount(password) {
    const me = requireUser();
    await verifyPassword(me.id, password, 'deletePassword');
    await DB.users.remove(me.id);
    logout();
  }

  WQ.Auth = {
    register, login, logout, restore, updateAccount, changePassword, deleteAccount,
    user: () => current,
    AVATARS,
    AuthError
  };
})(window.WQ = window.WQ || {});
