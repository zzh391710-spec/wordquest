/*
 * Mode A · 3D scene for Lexicon Dungeon
 *
 * Built with three.js (r149, js/vendor/three.min.js). Everything is
 * procedural: no models or image files, so it still works offline.
 *
 * A torch-lit corridor with six rooms. The hero walks room to room;
 * monsters wait in their rooms and can be seen down the corridor.
 *
 * Public API (all animations return Promises):
 *   new WQ.Dungeon3D(container, { rooms: [{ kind, key }], reducedMotion, theme: { color, dust } })
 *   openGate() · walkTo(i) · focusFoe(i, name, hpPct) · setFoeHp(pct)
 *   heroAttack({ crit }) · foeAttack() · foeDie() · openChest()
 *   heroFall() · heroRevive() · victory() · banner(title, sub)
 *   floatText(text, cls) · dispose()
 */
(function (WQ) {
  'use strict';

  const T = window.THREE;
  const GAP = 14;
  const roomZ = (i) => -i * GAP;
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = {
    inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    out: (t) => 1 - Math.pow(1 - t, 3),
    in: (t) => t * t * t,
    linear: (t) => t
  };

  function rng(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function supported() {
    if (!T) return false;
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) {
      return false;
    }
  }

  /* ---------- tiny tween engine ---------- */
  class Tweens {
    constructor() { this.list = []; }
    add(dur, fn, easing = ease.inOut) {
      return new Promise((resolve) => {
        this.list.push({ t: 0, dur: Math.max(0.001, dur), fn, easing, resolve });
      });
    }
    wait(sec) { return this.add(sec, () => {}); }
    update(dt) {
      for (let i = this.list.length - 1; i >= 0; i--) {
        const tw = this.list[i];
        tw.t += dt;
        const p = Math.min(1, tw.t / tw.dur);
        tw.fn(tw.easing(p), p);
        if (p >= 1) { this.list.splice(i, 1); tw.resolve(); }
      }
    }
    clear() { const l = this.list; this.list = []; l.forEach((tw) => tw.resolve()); }
  }

  /* ---------- geometry helpers ---------- */
  const M = (color, o = {}) => new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.82, metalness: 0.04, flatShading: true }, o));
  const B = (color) => new T.MeshBasicMaterial({ color });
  const G = {
    box: (w, h, d) => new T.BoxGeometry(w, h, d),
    sph: (r, ws = 12, hs = 9) => new T.SphereGeometry(r, ws, hs),
    cyl: (rt, rb, h, s = 8, open = false) => new T.CylinderGeometry(rt, rb, h, s, 1, open),
    cone: (r, h, s = 8) => new T.ConeGeometry(r, h, s)
  };
  function mesh(geo, mat, x = 0, y = 0, z = 0) { const o = new T.Mesh(geo, mat); o.position.set(x, y, z); return o; }
  function group(x = 0, y = 0, z = 0) { const o = new T.Group(); o.position.set(x, y, z); return o; }
  function shapeGeo(points) {
    const s = new T.Shape();
    s.moveTo(points[0][0], points[0][1]);
    points.slice(1).forEach(([x, y]) => s.lineTo(x, y));
    return new T.ShapeGeometry(s);
  }

  /* ---------- procedural textures ---------- */
  function canvasTexture(size, draw, repeat = true) {
    let ctx = null;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    try { ctx = c.getContext('2d'); } catch (e) { ctx = null; }
    if (!ctx) return null;
    draw(ctx, size);
    const t = new T.CanvasTexture(c);
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.encoding = T.sRGBEncoding; }
    return t;
  }
  function drawTiles(ctx, s) {
    const r = rng(7), n = 4, w = s / n;
    ctx.fillStyle = '#100e22';
    ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        ctx.fillStyle = `hsl(${245 + r() * 20}, 14%, ${24 + r() * 14}%)`;
        ctx.fillRect(x * w + 3, y * w + 3, w - 6, w - 6);
        for (let k = 0; k < 7; k++) {
          ctx.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.14})`;
          ctx.fillRect(x * w + 4 + r() * (w - 18), y * w + 4 + r() * (w - 18), 4 + r() * 12, 2 + r() * 6);
        }
      }
    }
  }
  function drawBricks(ctx, s) {
    const r = rng(11), rows = 8, h = s / rows;
    ctx.fillStyle = '#0e0c1d';
    ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < rows; y++) {
      const off = (y % 2) * h;
      for (let x = -h * 2; x < s; x += h * 2) {
        ctx.fillStyle = `hsl(${238 + r() * 28}, 12%, ${19 + r() * 13}%)`;
        ctx.fillRect(x + off + 2, y * h + 2, h * 2 - 4, h - 4);
      }
    }
  }
  function drawDot(ctx, s) {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.65)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }

  /* =========================================================
     Characters (all modelled facing +Z)
     ========================================================= */
  function buildHumanoid(p) {
    const root = new T.Group();
    const body = new T.Group();
    root.add(body);
    const m = {
      skin: M(p.skin), top: M(p.top), legs: M(p.legs), boots: M(p.boots), hair: M(p.hair),
      steel: M(p.steel, { metalness: 0.7, roughness: 0.3, emissive: p.bladeGlow, emissiveIntensity: 0.7 }),
      trim: M(p.trim, { metalness: 0.5, roughness: 0.4 }),
      cape: M(p.cape, { side: T.DoubleSide })
    };
    const legs = [-1, 1].map((s) => {
      const pv = group(s * 0.15, 0.78, 0);
      pv.add(mesh(G.box(0.22, 0.6, 0.26), m.legs, 0, -0.3, 0), mesh(G.box(0.26, 0.2, 0.34), m.boots, 0, -0.68, 0.04));
      body.add(pv);
      return pv;
    });
    body.add(mesh(G.box(0.62, 0.72, 0.38), m.top, 0, 1.14, 0));
    body.add(mesh(G.box(0.64, 0.1, 0.4), m.boots, 0, 0.84, 0));
    body.add(mesh(G.box(0.12, 0.1, 0.05), m.trim, 0, 0.84, 0.21));
    if (p.armor) body.add(mesh(G.box(0.66, 0.3, 0.42), m.trim, 0, 1.36, 0));

    const head = group(0, 1.72, 0);
    head.add(mesh(G.box(0.44, 0.44, 0.42), m.skin));
    if (p.helmet) {
      head.add(mesh(G.box(0.5, 0.5, 0.48), m.trim));
      head.add(mesh(G.cone(0.08, 0.4, 4), m.trim, 0, 0.42, 0));
    } else {
      head.add(mesh(G.box(0.47, 0.16, 0.45), m.hair, 0, 0.2, 0), mesh(G.box(0.47, 0.32, 0.12), m.hair, 0, 0.04, -0.2));
    }
    const eyeMat = p.eyeGlow ? B(p.eyeGlow) : M(0x1a1a2e);
    const eyeZ = p.helmet ? 0.25 : 0.215;
    [-1, 1].forEach((s) => head.add(mesh(G.box(0.08, 0.07, 0.02), eyeMat, s * 0.1, 0.02, eyeZ)));
    body.add(head);

    const arms = [-1, 1].map((s) => {
      const pv = group(s * 0.41, 1.44, 0);
      pv.add(mesh(G.box(0.18, 0.6, 0.22), p.armor ? m.trim : m.top, 0, -0.28, 0), mesh(G.box(0.18, 0.16, 0.2), m.skin, 0, -0.64, 0));
      body.add(pv);
      return pv;
    });

    // Sword in the model's -X hand, which ends up on the camera side.
    const sword = group(0, -0.66, 0.08);
    sword.add(
      mesh(G.box(0.06, 0.03, 0.95), m.steel, 0, 0, 0.55),
      mesh(G.box(0.34, 0.05, 0.07), m.trim, 0, 0, 0.06),
      mesh(G.box(0.05, 0.05, 0.2), m.boots, 0, 0, -0.08));
    const tip = group(0, 0, 1.05);
    sword.add(tip);
    arms[0].add(sword);
    if (p.shield) arms[1].add(mesh(G.box(0.08, 0.62, 0.5), m.trim, 0.12, -0.45, 0.08));

    const cape = mesh(new T.PlaneGeometry(0.62, 0.95, 1, 3), m.cape, 0, 1.02, -0.22);
    body.add(cape);

    return { root, body, legs, arms, head, sword, tip, cape, height: 2.0, center: 1.2 };
  }

  const HERO = { skin: 0xf1c39a, top: 0x3b6fd8, legs: 0x283058, boots: 0x4a3020, hair: 0x2b1b12, steel: 0xdfe6ff, bladeGlow: 0x3a6bff, trim: 0xffc94a, cape: 0xd0453c };

  const BUILDERS = {
    bat() {
      const root = new T.Group(), body = group(0, 1.7, 0);
      root.add(body);
      const fur = M(0x4a2c6e), wingM = M(0x2a1840, { side: T.DoubleSide }), eye = B(0xff3b5c), fang = M(0xf4f0e8);
      body.add(mesh(G.sph(0.34), fur));
      body.add(mesh(G.cone(0.1, 0.3, 4), fur, -0.16, 0.36, 0), mesh(G.cone(0.1, 0.3, 4), fur, 0.16, 0.36, 0));
      body.add(mesh(G.sph(0.06, 6, 5), eye, -0.11, 0.07, 0.29), mesh(G.sph(0.06, 6, 5), eye, 0.11, 0.07, 0.29));
      [-1, 1].forEach((s) => { const f = mesh(G.cone(0.03, 0.12, 4), fang, s * 0.06, -0.12, 0.3); f.rotation.x = Math.PI; body.add(f); });
      const wg = shapeGeo([[0, 0], [0.45, 0.38], [1.25, 0.3], [1.05, -0.05], [0.8, 0.05], [0.62, -0.2], [0.4, -0.02], [0.2, -0.18], [0, 0]]);
      const wings = [-1, 1].map((s) => {
        const pv = group(s * 0.25, 0.05, 0);
        const w = mesh(wg, wingM);
        w.scale.x = s;
        pv.add(w);
        body.add(pv);
        return pv;
      });
      return {
        root, body, height: 2.2, center: 1.7, flying: true,
        update(t) {
          body.position.y = 1.7 + Math.sin(t * 3) * 0.15;
          wings[0].rotation.z = -Math.sin(t * 16) * 0.6;
          wings[1].rotation.z = Math.sin(t * 16) * 0.6;
        }
      };
    },

    spider() {
      const root = new T.Group(), body = new T.Group();
      root.add(body);
      const ink = M(0x221d44), glyph = B(0x4fd1c5), eye = B(0xff3b5c);
      const abd = mesh(G.sph(0.55), ink, 0, 0.62, -0.5);
      abd.scale.set(1, 0.85, 1.15);
      body.add(abd);
      const mark = mesh(G.box(0.28, 0.04, 0.28), glyph, 0, 1.08, -0.5);
      mark.rotation.y = Math.PI / 4;
      body.add(mark);
      body.add(mesh(G.sph(0.34), ink, 0, 0.55, 0.25));
      [[-0.1, 0.66], [0.1, 0.66], [-0.17, 0.58], [0.17, 0.58]].forEach(([x, y]) => body.add(mesh(G.sph(0.05, 6, 5), eye, x, y, 0.55)));
      const legs = [];
      [-1, 1].forEach((s) => {
        for (let k = 0; k < 4; k++) {
          const pv = group(s * 0.22, 0.6, 0.3 - k * 0.2);
          const up = mesh(G.cyl(0.035, 0.035, 0.7, 5), ink, s * 0.3, 0.2, 0);
          up.rotation.z = -s * 1.0;
          const low = mesh(G.cyl(0.03, 0.015, 0.85, 5), ink, s * 0.75, -0.1, 0);
          low.rotation.z = s * 0.28;
          pv.add(up, low);
          body.add(pv);
          legs.push({ pv, k, s });
        }
      });
      return {
        root, body, height: 1.6, center: 0.65,
        update(t) {
          legs.forEach(({ pv, k, s }) => { pv.rotation.y = Math.sin(t * 8 + k * 1.3 + (s > 0 ? 0 : Math.PI)) * 0.18; });
          body.position.y = Math.abs(Math.sin(t * 8)) * 0.03;
        }
      };
    },

    ghost() {
      const root = new T.Group(), body = group(0, 0.4, 0);
      root.add(body);
      const gm = M(0xd8dcff, { transparent: true, opacity: 0.78, emissive: 0x5865ff, emissiveIntensity: 0.45, flatShading: false, side: T.DoubleSide });
      const dark = B(0x10102a);
      body.add(mesh(G.sph(0.55, 16, 12), gm, 0, 1.5, 0));
      body.add(mesh(G.cyl(0.55, 0.78, 1.0, 14, true), gm, 0, 0.98, 0));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const c = mesh(G.cone(0.14, 0.3, 6), gm, Math.sin(a) * 0.62, 0.36, Math.cos(a) * 0.62);
        c.rotation.x = Math.PI;
        body.add(c);
      }
      body.add(mesh(G.box(0.12, 0.2, 0.04), dark, -0.17, 1.58, 0.52), mesh(G.box(0.12, 0.2, 0.04), dark, 0.17, 1.58, 0.52));
      body.add(mesh(G.sph(0.09, 8, 6), dark, 0, 1.3, 0.5));
      [-1, 1].forEach((s) => body.add(mesh(G.sph(0.14, 8, 6), gm, s * 0.68, 1.1, 0.1)));
      return {
        root, body, height: 2.6, center: 1.6, flying: true,
        update(t) {
          body.position.y = 0.4 + Math.sin(t * 2) * 0.18;
          body.rotation.y = Math.sin(t * 1.3) * 0.2;
          gm.opacity = 0.66 + Math.sin(t * 3) * 0.12;
        }
      };
    },

    slime() {
      const root = new T.Group(), body = new T.Group();
      root.add(body);
      const sm = M(0x2bc4b0, { transparent: true, opacity: 0.88, emissive: 0x0a5a52, emissiveIntensity: 0.5, flatShading: false, roughness: 0.3 });
      const blob = mesh(G.sph(0.8, 18, 14), sm, 0, 0.6, 0);
      blob.scale.set(1, 0.78, 1);
      body.add(blob, mesh(G.sph(0.25, 10, 8), M(0x123a4a), 0, 0.5, 0));
      const white = M(0xffffff), black = B(0x0a0a18);
      [-1, 1].forEach((s) => body.add(mesh(G.sph(0.14, 10, 8), white, s * 0.24, 0.82, 0.62), mesh(G.sph(0.07, 8, 6), black, s * 0.24, 0.82, 0.74)));
      return {
        root, body, height: 1.6, center: 0.6,
        update(t) {
          const s = Math.sin(t * 4) * 0.07;
          body.scale.set(1 + s, 1 - s, 1 + s);
        }
      };
    },

    skeleton() {
      const root = new T.Group(), body = new T.Group();
      root.add(body);
      const bone = M(0xe9e3d0), dark = B(0x0c0a18), glow = B(0xff4060), rust = M(0x8a5a3a, { metalness: 0.4 });
      [-1, 1].forEach((s) => body.add(mesh(G.cyl(0.06, 0.05, 0.85, 6), bone, s * 0.14, 0.42, 0)));
      body.add(mesh(G.box(0.42, 0.12, 0.2), bone, 0, 0.88, 0));
      body.add(mesh(G.cyl(0.05, 0.05, 0.62, 6), bone, 0, 1.18, 0));
      [[0.5, 1.26], [0.46, 1.38], [0.4, 1.5]].forEach(([w, y]) => body.add(mesh(G.box(w, 0.05, 0.26), bone, 0, y, 0)));
      const head = group(0, 1.84, 0);
      head.add(mesh(G.sph(0.25, 10, 8), bone));
      [-1, 1].forEach((s) => head.add(mesh(G.sph(0.075, 6, 5), dark, s * 0.09, 0.02, 0.19), mesh(G.sph(0.035, 6, 5), glow, s * 0.09, 0.02, 0.24)));
      const jaw = group(0, -0.14, 0.02);
      jaw.add(mesh(G.box(0.28, 0.08, 0.22), bone, 0, -0.04, 0.04));
      head.add(jaw);
      body.add(head);
      const arms = [-1, 1].map((s) => {
        const pv = group(s * 0.3, 1.56, 0);
        pv.add(mesh(G.cyl(0.045, 0.04, 0.72, 6), bone, 0, -0.36, 0));
        body.add(pv);
        return pv;
      });
      arms[0].add(mesh(G.box(0.06, 0.04, 0.8), rust, 0, -0.72, 0.36));
      arms[0].rotation.x = -0.5;
      return {
        root, body, height: 2.25, center: 1.3,
        update(t) {
          body.rotation.z = Math.sin(t * 2) * 0.05;
          jaw.rotation.x = Math.max(0, Math.sin(t * 9)) * 0.35;
          arms[1].rotation.x = Math.sin(t * 1.8) * 0.15;
        }
      };
    },

    golem() {
      const root = new T.Group(), body = new T.Group();
      root.add(body);
      root.scale.setScalar(1.25);
      const stone = M(0x6c687c), dark = M(0x4f4b5e), rune = B(0x5ff2e2);
      const c1 = new T.Color(0x1f6f68), c2 = new T.Color(0x8ffff2);
      [-1, 1].forEach((s) => body.add(mesh(G.box(0.42, 0.9, 0.45), dark, s * 0.32, 0.45, 0)));
      body.add(mesh(G.box(1.3, 1.1, 0.8), stone, 0, 1.45, 0));
      [[-0.3, 1.6], [0.3, 1.6], [0, 1.3]].forEach(([x, y]) => body.add(mesh(G.box(0.18, 0.18, 0.04), rune, x, y, 0.41)));
      const head = group(0, 2.25, 0.05);
      head.add(mesh(G.box(0.6, 0.5, 0.55), stone), mesh(G.box(0.12, 0.06, 0.04), rune, -0.14, 0.03, 0.28), mesh(G.box(0.12, 0.06, 0.04), rune, 0.14, 0.03, 0.28));
      body.add(head);
      const arms = [-1, 1].map((s) => {
        const pv = group(s * 0.85, 1.85, 0);
        pv.add(mesh(G.box(0.5, 0.4, 0.5), dark, 0, 0.05, 0), mesh(G.box(0.42, 0.95, 0.45), stone, 0, -0.45, 0), mesh(G.box(0.5, 0.45, 0.5), dark, 0, -1.05, 0));
        body.add(pv);
        return pv;
      });
      return {
        root, body, height: 2.7, center: 1.5,
        update(t) {
          body.position.y = Math.sin(t * 1.5) * 0.04;
          arms[0].rotation.x = Math.sin(t * 1.2) * 0.08;
          arms[1].rotation.x = -Math.sin(t * 1.2) * 0.08;
          rune.color.copy(c1).lerp(c2, 0.5 + Math.sin(t * 3) * 0.5);
        }
      };
    },

    knight() {
      const k = buildHumanoid({ skin: 0x2a2440, top: 0x2b2840, legs: 0x1c1a2c, boots: 0x15131f, hair: 0x15131f, steel: 0x9aa0c0, bladeGlow: 0xb0203a, trim: 0x3c3858, cape: 0x5a1020, helmet: true, armor: true, shield: true, eyeGlow: 0xff3050 });
      k.root.scale.setScalar(1.3);
      k.arms[0].rotation.x = -0.4;
      return {
        root: k.root, body: k.body, height: 2.1, center: 1.2,
        update(t) {
          k.body.position.y = Math.sin(t * 2) * 0.02;
          k.cape.rotation.x = 0.15 + Math.sin(t * 2.5) * 0.06;
          k.arms[1].rotation.x = Math.sin(t * 1.5) * 0.06;
        }
      };
    },

    dragon() {
      const root = new T.Group(), body = new T.Group();
      root.add(body);
      const hide = M(0x7c2140), belly = M(0xf2a65a), horn = M(0xe8dcc4), wingM = M(0x5a1530, { side: T.DoubleSide }), eye = B(0xffd23f), dark = B(0x14060c);
      const torso = mesh(G.sph(1, 14, 10), hide, 0, 1.7, -0.3);
      torso.scale.set(1.15, 0.95, 1.6);
      const bel = mesh(G.sph(0.9, 12, 9), belly, 0, 1.5, 0.15);
      bel.scale.set(0.95, 0.8, 1.2);
      body.add(torso, bel);
      for (let i = 0; i < 5; i++) {
        const sp = mesh(G.cone(0.14, 0.4, 5), horn, 0, 2.62 - i * 0.04, 0.5 - i * 0.45);
        sp.rotation.x = -0.4;
        body.add(sp);
      }
      [[0.7, 0.6], [-0.7, 0.6], [0.75, -1.0], [-0.75, -1.0]].forEach(([x, z]) => {
        body.add(mesh(G.cyl(0.24, 0.3, 1.0, 7), hide, x, 0.5, z));
        const claw = mesh(G.cone(0.08, 0.25, 4), horn, x, 0.08, z + 0.3);
        claw.rotation.x = Math.PI / 2;
        body.add(claw);
      });
      const neck = group(0, 2.1, 0.7);
      [[0.6, 0, 0.15, 0.25], [0.52, 0, 0.6, 0.75], [0.46, 0, 1.0, 1.2], [0.42, 0, 1.3, 1.55]].forEach(([r, x, y, z]) => neck.add(mesh(G.sph(r, 10, 8), hide, x, y, z)));
      const head = group(0, 1.5, 1.95);
      head.scale.setScalar(1.25);
      head.add(mesh(G.box(0.85, 0.6, 0.9), hide), mesh(G.box(0.6, 0.38, 0.7), hide, 0, -0.08, 0.7));
      [-1, 1].forEach((s) => {
        const hn = mesh(G.cone(0.12, 0.65, 5), horn, s * 0.28, 0.4, -0.3);
        hn.rotation.x = -0.9;
        head.add(hn, mesh(G.sph(0.08, 6, 5), eye, s * 0.3, 0.12, 0.38), mesh(G.sph(0.04, 5, 4), dark, s * 0.14, -0.02, 1.06));
      });
      const jaw = group(0, -0.25, 0.2);
      jaw.add(mesh(G.box(0.55, 0.14, 0.85), hide, 0, -0.04, 0.42));
      head.add(jaw);
      const mouth = group(0, -0.18, 1.15);
      head.add(mouth);
      neck.add(head);
      body.add(neck);
      const wg = shapeGeo([[0, 0], [0.9, 1.7], [3.0, 2.3], [3.7, 1.2], [2.9, 0.8], [2.5, 0.1], [1.7, 0.4], [1.2, -0.35], [0, 0]]);
      const wings = [-1, 1].map((s) => {
        const pv = group(s * 0.7, 2.4, -0.4);
        pv.rotation.y = s * 0.5;
        const w = mesh(wg, wingM);
        w.scale.x = s;
        pv.add(w);
        body.add(pv);
        return pv;
      });
      const tail = group(0, 1.5, -1.6);
      for (let i = 0; i < 6; i++) {
        const r = 0.45 - i * 0.06;
        tail.add(mesh(G.sph(r, 9, 7), hide, 0, -i * 0.18, -i * 0.5));
        const sp = mesh(G.cone(0.08, 0.25, 4), horn, 0, -i * 0.18 + r, -i * 0.5);
        sp.rotation.x = -0.5;
        tail.add(sp);
      }
      body.add(tail);
      root.scale.setScalar(1.15);
      return {
        root, body, height: 4.4, center: 2.2, mouth, jaw,
        update(t) {
          wings[0].rotation.z = -0.15 - Math.sin(t * 2.2) * 0.35;
          wings[1].rotation.z = 0.15 + Math.sin(t * 2.2) * 0.35;
          neck.rotation.y = Math.sin(t * 0.9) * 0.15;
          neck.rotation.x = Math.sin(t * 1.3) * 0.05;
          tail.rotation.y = Math.sin(t * 1.4) * 0.35;
          body.position.y = Math.sin(t * 1.6) * 0.05;
          if (!this.breathing) jaw.rotation.x = 0.05 + Math.max(0, Math.sin(t * 0.7)) * 0.12;
        }
      };
    }
  };

  function buildChest() {
    const root = new T.Group(), body = new T.Group();
    root.add(body);
    const wood = M(0x7a4a26), gold = M(0xffc94a, { metalness: 0.6, roughness: 0.35, emissive: 0x3a2800, emissiveIntensity: 0.4 });
    body.add(mesh(G.box(1.2, 0.7, 0.8), wood, 0, 0.35, 0));
    [-0.55, 0.55].forEach((x) => body.add(mesh(G.box(0.08, 0.72, 0.84), gold, x, 0.36, 0)));
    const lid = group(0, 0.7, -0.4);
    lid.add(mesh(G.box(1.22, 0.34, 0.82), wood, 0, 0.17, 0.41), mesh(G.box(1.24, 0.08, 0.84), gold, 0, 0.3, 0.41));
    body.add(lid, mesh(G.box(0.16, 0.2, 0.06), gold, 0, 0.62, 0.42));
    const glow = mesh(new T.PlaneGeometry(1.05, 0.65), new T.MeshBasicMaterial({ color: 0xffd34a, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }), 0, 0.69, 0);
    glow.rotation.x = -Math.PI / 2;
    body.add(glow);
    return { root, body, lid, glow, height: 1.3, center: 0.6, chest: true, update() {} };
  }

  /* =========================================================
     Scene
     ========================================================= */
  class Dungeon3D {
    constructor(container, opts = {}) {
      this.container = container;
      this.rooms = opts.rooms || [];
      this.reduced = !!opts.reducedMotion;
      this.theme = opts.theme || {};
      this.tweens = new Tweens();
      this.particles = [];
      this.time = 0;
      this.shake = 0;
      this.fovKick = 0;
      this.walkPhase = 0;
      this.walking = false;
      this.attacking = false;
      this.posed = false;
      this.current = -1;
      this.disposed = false;

      const w = container.clientWidth || 800, h = container.clientHeight || 450;
      this.renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      this.renderer.setSize(w, h, false);
      this.renderer.outputEncoding = T.sRGBEncoding;
      this.renderer.setClearColor(0x0b0918, 1);
      this.canvas = this.renderer.domElement;
      this.canvas.className = 'dg3d-canvas';
      this.canvas.setAttribute('aria-hidden', 'true');
      container.appendChild(this.canvas);

      this.scene = new T.Scene();
      this.scene.fog = new T.FogExp2(0x0b0918, 0.058);
      this.baseFov = Dungeon3D.fovFor(w / h);
      this.camera = new T.PerspectiveCamera(this.baseFov, w / h, 0.1, 140);

      const h_ = WQ.h;
      this.overlay = h_('div', { class: 'dg3d-overlay', 'aria-hidden': 'true' });
      this.labelName = h_('div', { class: 'dg3d-name' });
      this.labelBar = WQ.UI.bar(1, 'dg3d-hp');
      this.label = h_('div', { class: 'dg3d-label hidden' }, this.labelName, this.labelBar);
      this.vignette = h_('div', { class: 'dg3d-vignette' });
      this.bannerEl = h_('div', { class: 'dg3d-banner' });
      this.overlay.append(this.vignette, this.label, this.bannerEl);
      container.appendChild(this.overlay);

      this.dotTex = canvasTexture(64, drawDot, false);
      this.shadowMat = new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false });

      this.buildLights();
      this.buildWorld();
      this.buildHero();
      this.buildRooms();
      this.buildDust();

      this.hero.root.position.set(-0.7, 0, 11);
      this.hero.root.rotation.y = Math.PI;
      this.camMode = 'intro';
      this.camPos = new T.Vector3(2.8, 2.8, 17);
      this.camLook = new T.Vector3(0, 2.2, 7);
      this.camPosT = this.camPos.clone();
      this.camLookT = this.camLook.clone();
      this.assignTorches(0);

      this.onResize = () => this.resize();
      if (window.ResizeObserver) { this.ro = new ResizeObserver(this.onResize); this.ro.observe(container); }
      else window.addEventListener('resize', this.onResize);

      this.last = performance.now();
      this.loop = this.loop.bind(this);
      this.raf = requestAnimationFrame(this.loop);
    }

    /* ---------- world ---------- */
    buildLights() {
      this.scene.add(new T.HemisphereLight(0x6c72d6, 0x1a0f14, 0.42));
      const moon = new T.DirectionalLight(0x9aa4ff, 0.22);
      moon.position.set(3, 10, 6);
      this.scene.add(moon);
      this.torchLights = [0, 1, 2, 3].map(() => {
        const l = new T.PointLight(0xff8a3a, 3.4, 12, 1.3);
        this.scene.add(l);
        return l;
      });
      this.heroLight = new T.PointLight(0xffd6a0, 1.25, 7.5, 1.4);
      this.fxLight = new T.PointLight(0x9fd0ff, 0, 8, 1.5);
      this.scene.add(this.heroLight, this.fxLight);
    }

    buildWorld() {
      const n = this.rooms.length;
      const zFront = 18, zBack = roomZ(n - 1) - 10;
      const len = zFront - zBack, zMid = (zFront + zBack) / 2;
      const r = rng(23);

      const floorTex = canvasTexture(256, drawTiles);
      if (floorTex) floorTex.repeat.set(3, len / 3);
      const floor = mesh(new T.PlaneGeometry(9, len), M(floorTex ? 0x9a94b6 : 0x2c2846, { map: floorTex, flatShading: false, roughness: 0.7 }), 0, 0, zMid);
      floor.rotation.x = -Math.PI / 2;
      this.scene.add(floor);

      const wallTex = canvasTexture(256, drawBricks);
      if (wallTex) wallTex.repeat.set(len / 4, 2);
      const wallMat = M(wallTex ? 0x8a84aa : 0x2a2640, { map: wallTex, flatShading: false });
      [-1, 1].forEach((s) => this.scene.add(mesh(G.box(1, 6.6, len), wallMat, s * 4.6, 3.3, zMid)));
      const ceil = mesh(new T.PlaneGeometry(9, len), M(0x0e0c1c), 0, 6.5, zMid);
      ceil.rotation.x = Math.PI / 2;
      this.scene.add(ceil);
      this.scene.add(mesh(G.box(9, 6.6, 1), wallMat, 0, 3.3, zBack), mesh(G.box(9, 6.6, 1), wallMat, 0, 3.3, zFront));

      const stone = M(0x26223a), stoneLight = M(0x34304c);
      for (let z = zFront - 2; z > zBack; z -= 3.5) {
        [-1, 1].forEach((s) => this.scene.add(mesh(G.box(0.5, 6.6, 0.5), stone, s * 4.0, 3.3, z)));
        this.scene.add(mesh(G.box(9, 0.35, 0.45), stone, 0, 6.15, z));
      }
      for (let i = 0; i < 46; i++) {
        const s = r() > 0.5 ? 1 : -1;
        const size = 0.12 + r() * 0.35;
        const rb = mesh(G.box(size, size * 0.7, size), r() > 0.5 ? stone : stoneLight, s * (3.0 + r() * 0.9), size * 0.3, zFront - r() * len);
        rb.rotation.set(r(), r() * 3, r());
        this.scene.add(rb);
      }

      // Arches between rooms; arch 0 holds the gate.
      const banner = M(this.theme.color || 0xb8402a, { side: T.DoubleSide }), emblem = M(0xffc94a, { metalness: 0.5 });
      this.banners = [];
      for (let i = 0; i < n; i++) {
        const z = roomZ(i) + 7;
        [-1, 1].forEach((s) => this.scene.add(mesh(G.box(0.9, 5, 0.9), stoneLight, s * 3.3, 2.5, z)));
        this.scene.add(mesh(G.box(7.5, 0.8, 1), stoneLight, 0, 5.2, z));
        [-1, 1].forEach((s) => {
          const pv = group(s * 2.1, 4.8, z + 0.55);
          const cloth = mesh(new T.PlaneGeometry(1.0, 2.0), banner, 0, -1.0, 0);
          const sigil = mesh(G.box(0.3, 0.3, 0.02), emblem, 0, -0.9, 0.01);
          sigil.rotation.z = Math.PI / 4;
          pv.add(cloth, sigil);
          this.scene.add(pv);
          this.banners.push(pv);
        });
      }

      // Torches beside each room
      const holder = M(0x3a2a1c), flameOut = new T.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.95, blending: T.AdditiveBlending, depthWrite: false }), flameIn = B(0xfff0b0);
      const haloMat = this.dotTex ? new T.SpriteMaterial({ map: this.dotTex, color: 0xff9a3a, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false }) : null;
      this.torches = [];
      this.flames = [];
      for (let i = 0; i < n; i++) {
        const z = roomZ(i);
        this.torches.push([-1, 1].map((s) => {
          const h = mesh(G.cyl(0.06, 0.08, 0.55, 6), holder, s * 3.92, 2.55, z);
          h.rotation.z = s * 0.35;
          this.scene.add(h, mesh(G.cyl(0.15, 0.08, 0.18, 8), holder, s * 3.84, 2.84, z));
          const f = group(s * 3.84, 3.08, z);
          f.add(mesh(G.cone(0.14, 0.45, 7), flameOut), mesh(G.cone(0.07, 0.28, 6), flameIn, 0, -0.05, 0));
          if (haloMat) { const halo = new T.Sprite(haloMat); halo.scale.set(1.5, 1.5, 1); halo.position.y = 0.05; f.add(halo); }
          this.scene.add(f);
          this.flames.push(f);
          return new T.Vector3(s * 3.4, 3.1, z);
        }));
      }

      // The gate (arch 0)
      const door = M(0x5b3a22), iron = M(0x34303f, { metalness: 0.6, roughness: 0.4 });
      this.doors = [-1, 1].map((s) => {
        const pv = group(s * 2.85, 0, 7);
        const panel = group(-s * 1.42, 2.3, 0);
        panel.add(mesh(G.box(2.84, 4.6, 0.25), door));
        [-1.4, 0, 1.4].forEach((y) => panel.add(mesh(G.box(2.86, 0.16, 0.3), iron, 0, y, 0)));
        panel.add(mesh(G.sph(0.1, 8, 6), iron, -s * 1.1, 0, 0.18));
        pv.add(panel);
        this.scene.add(pv);
        return pv;
      });
    }

    buildHero() {
      this.hero = buildHumanoid(HERO);
      this.hero.root.add(this.blob(0.55));
      this.heroMats = [];
      this.hero.root.traverse((o) => {
        if (o.material && o.material.emissive) {
          o.material.userData.baseEmissive = o.material.emissive.clone();
          o.material.userData.baseEI = o.material.emissiveIntensity;
          this.heroMats.push(o.material);
        }
      });
      this.scene.add(this.hero.root);
    }

    buildRooms() {
      this.roomObjs = this.rooms.map((r, i) => {
        const obj = r.kind === 'chest' ? buildChest() : (BUILDERS[r.key] || BUILDERS.slime)();
        const spot = this.foeSpot(i);
        const hs = this.heroSpot(i);
        obj.kind = r.kind;
        obj.key = r.key;
        obj.root.position.copy(spot);
        obj.root.rotation.y = Math.atan2(hs.x - spot.x, hs.z - spot.z);
        obj.root.add(this.blob(r.kind === 'boss' ? 2.0 : r.kind === 'elite' ? 0.9 : 0.7));
        obj.baseScale = obj.root.scale.x;
        obj.alive = true;
        obj.flashMats = [];
        obj.root.traverse((o) => {
          if (o.material && o.material.emissive) {
            o.material.userData.baseEmissive = o.material.emissive.clone();
            o.material.userData.baseEI = o.material.emissiveIntensity;
            obj.flashMats.push(o.material);
          }
        });
        this.scene.add(obj.root);
        return obj;
      });
    }

    buildDust() {
      const n = this.rooms.length, count = 260, r = rng(5);
      const zFront = 18, zBack = roomZ(n - 1) - 10;
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        pos[i * 3] = (r() - 0.5) * 8;
        pos[i * 3 + 1] = 0.2 + r() * 5.6;
        pos[i * 3 + 2] = zBack + r() * (zFront - zBack);
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3));
      this.dust = new T.Points(g, new T.PointsMaterial({ color: this.theme.dust || 0xffd8a8, size: 0.06, map: this.dotTex, transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending }));
      this.scene.add(this.dust);
    }

    blob(r) {
      const b = mesh(new T.CircleGeometry(r, 20), this.shadowMat, 0, 0.02, 0);
      b.rotation.x = -Math.PI / 2;
      return b;
    }

    heroSpot(i) {
      const boss = this.rooms[i] && this.rooms[i].kind === 'boss';
      return new T.Vector3(-0.8, 0, roomZ(i) + (boss ? 3.2 : 2.6));
    }
    foeSpot(i) {
      const boss = this.rooms[i] && this.rooms[i].kind === 'boss';
      return new T.Vector3(0.5, 0, roomZ(i) - (boss ? 3.2 : 2.4));
    }
    foeCenter(obj) {
      return obj.root.position.clone().add(new T.Vector3(0, obj.center * obj.root.scale.y, 0));
    }

    assignTorches(i) {
      const sets = [this.torches[i], this.torches[i + 1]];
      this.torchLights.forEach((l, k) => {
        const set = sets[k >> 1];
        if (set) { l.position.copy(set[k & 1]); l.userData.on = true; }
        else { l.userData.on = false; l.intensity = 0; }
      });
    }

    /* ---------- effects ---------- */
    burst(pos, o = {}) {
      if (this.disposed) return;
      const count = o.count || 30, speed = o.speed == null ? 3 : o.speed;
      const arr = new Float32Array(count * 3), vel = [];
      for (let i = 0; i < count; i++) {
        arr[i * 3] = pos.x; arr[i * 3 + 1] = pos.y; arr[i * 3 + 2] = pos.z;
        const d = new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.35 + Math.random() * 0.65));
        if (o.dir) d.add(o.dir.clone().multiplyScalar(0.6 + Math.random() * 0.6));
        d.y += o.up || 0;
        vel.push(d);
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(arr, 3));
      const m = new T.PointsMaterial({ color: o.color || 0xffffff, size: o.size || 0.18, map: this.dotTex, transparent: true, opacity: 1, depthWrite: false, blending: T.AdditiveBlending });
      const pts = new T.Points(g, m);
      this.scene.add(pts);
      this.particles.push({ pts, vel, age: 0, life: o.life || 0.8, gravity: o.gravity == null ? -3 : o.gravity });
    }

    flash(mats, hex, peak = 1.4, dur = 0.28) {
      const c = new T.Color(hex);
      return this.tweens.add(dur, (k) => {
        mats.forEach((m) => {
          if (!m.userData.baseEmissive) return;
          m.emissive.copy(c).lerp(m.userData.baseEmissive, k);
          m.emissiveIntensity = lerp(peak, m.userData.baseEI, k);
        });
      }, ease.out);
    }

    banner(title, sub) {
      if (this.disposed) return;
      this.bannerEl.replaceChildren(WQ.h('b', null, title), sub ? WQ.h('span', null, sub) : null);
      this.bannerEl.classList.remove('show');
      void this.bannerEl.offsetWidth;
      this.bannerEl.classList.add('show');
      clearTimeout(this.bannerTimer);
      this.bannerTimer = setTimeout(() => this.bannerEl.classList.remove('show'), 1900);
    }

    project(v) {
      const p = v.clone().project(this.camera);
      return { x: (p.x + 1) / 2 * this.container.clientWidth, y: (1 - p.y) / 2 * this.container.clientHeight, visible: p.z < 1 };
    }

    floatText(text, cls = '') {
      const obj = this.roomObjs[this.current];
      if (!obj || this.disposed) return;
      const s = this.project(this.foeCenter(obj).add(new T.Vector3(0, 0.6, 0)));
      const el = WQ.h('div', { class: 'dg3d-dmg ' + cls, style: { left: s.x + 'px', top: s.y + 'px' } }, text);
      this.overlay.appendChild(el);
      setTimeout(() => el.remove(), 1000);
    }

    hurtFlash() {
      this.vignette.classList.add('on');
      setTimeout(() => this.vignette.classList.remove('on'), 60);
    }

    /* ---------- story beats ---------- */
    openGate() {
      if (this.disposed) return Promise.resolve();
      this.burst(new T.Vector3(0, 0.3, 7), { count: 40, color: 0x9a8a7a, speed: 1.8, up: 0.6, gravity: -0.4, life: 1.4, size: 0.25 });
      const [L, R] = this.doors;
      return this.tweens.add(1.1, (k) => { L.rotation.y = 1.65 * k; R.rotation.y = -1.65 * k; }, ease.inOut);
    }

    async walkTo(i) {
      if (this.disposed) return;
      const h = this.hero;
      const from = h.root.position.clone(), to = this.heroSpot(i);
      const dist = from.distanceTo(to);
      this.label.classList.add('hidden');
      this.camMode = 'follow';
      this.walking = true;
      h.root.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
      await this.tweens.add(Math.max(0.6, dist / 4.2), (k) => h.root.position.lerpVectors(from, to, k), ease.inOut);
      this.walking = false;
      this.current = i;
      this.assignTorches(i);
      const obj = this.roomObjs[i];
      const want = Math.atan2(obj.root.position.x - to.x, obj.root.position.z - to.z);
      const start = h.root.rotation.y;
      let delta = want - start;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      this.camMode = 'battle';
      await this.tweens.add(0.3, (k) => { h.root.rotation.y = start + delta * k; });
    }

    focusFoe(i, name, pct = 1) {
      this.labelName.textContent = name;
      this.setFoeHp(pct);
      this.label.classList.toggle('hidden', !name);
    }

    setFoeHp(pct) {
      const span = this.labelBar.firstChild;
      if (span) span.style.width = (Math.max(0, Math.min(1, pct)) * 100).toFixed(1) + '%';
    }

    async heroAttack({ crit } = {}) {
      const obj = this.roomObjs[this.current];
      if (this.disposed || !obj || !obj.alive) return;
      const h = this.hero, arm = h.arms[0];
      const start = h.root.position.clone();
      const dir = obj.root.position.clone().sub(start).setY(0).normalize();
      this.attacking = true;
      await this.tweens.add(0.14, (k) => { arm.rotation.x = lerp(arm.rotation.x, -2.7, k); }, ease.out);
      this.tweens.add(0.18, (k) => {
        arm.rotation.x = lerp(-2.7, -0.6, k);
        h.root.position.copy(start).addScaledVector(dir, 0.45 * k);
      }, ease.in);
      await this.tweens.wait(0.11);
      if (this.disposed) return;
      const from = new T.Vector3();
      h.tip.getWorldPosition(from);
      const to = this.foeCenter(obj);
      await this.projectile(from, to, crit);
      if (this.disposed) return;
      this.burst(to, { count: crit ? 70 : 36, color: crit ? 0xffd34a : 0x9fe0ff, speed: crit ? 4.5 : 3, life: 0.7, size: crit ? 0.28 : 0.2, gravity: -2 });
      this.flash(obj.flashMats, crit ? 0xffd34a : 0xffffff);
      const b = obj.body, z0 = b.position.z;
      this.tweens.add(0.1, (k) => { b.position.z = z0 - 0.35 * k; }, ease.out).then(() => this.tweens.add(0.25, (k) => { b.position.z = z0 - 0.35 * (1 - k); }));
      if (crit) { this.fovKick = 5; this.shake = 0.12; }
      this.tweens.add(0.3, (k) => {
        arm.rotation.x = lerp(-0.6, 0, k);
        h.root.position.copy(start).addScaledVector(dir, 0.45 * (1 - k));
      }).then(() => { this.attacking = false; });
    }

    async projectile(from, to, crit) {
      const color = crit ? 0xffd34a : 0x8fd8ff;
      const orbMat = new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: T.AdditiveBlending, depthWrite: false });
      const orb = new T.Mesh(G.sph(crit ? 0.22 : 0.15, 12, 10), orbMat);
      const halo = new T.Mesh(G.sph(crit ? 0.48 : 0.34, 12, 10), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, blending: T.AdditiveBlending, depthWrite: false }));
      orb.add(halo);
      this.scene.add(orb);
      this.fxLight.color.set(color);
      this.fxLight.intensity = 2.6;
      const mid = from.clone().lerp(to, 0.5);
      mid.y += 0.8;
      const p = new T.Vector3();
      let frame = 0;
      await this.tweens.add(0.28, (k) => {
        const a = (1 - k) * (1 - k), b = 2 * (1 - k) * k, c = k * k;
        p.set(a * from.x + b * mid.x + c * to.x, a * from.y + b * mid.y + c * to.y, a * from.z + b * mid.z + c * to.z);
        orb.position.copy(p);
        this.fxLight.position.copy(p);
        if (frame++ % 2 === 0) this.burst(p, { count: 4, color, speed: 0.4, life: 0.35, size: 0.12, gravity: 0 });
      }, ease.linear);
      this.scene.remove(orb);
      orb.geometry.dispose(); orbMat.dispose(); halo.geometry.dispose(); halo.material.dispose();
      this.tweens.add(0.35, (k) => { this.fxLight.intensity = 2.6 * (1 - k); });
    }

    heroHurt(fromDir) {
      if (this.disposed) return;
      const h = this.hero;
      this.shake = 0.35;
      this.hurtFlash();
      this.flash(this.heroMats, 0xff3050, 1.2, 0.4);
      this.burst(h.root.position.clone().add(new T.Vector3(0, 1.3, 0)), { count: 26, color: 0xff4060, speed: 2.4, life: 0.6, size: 0.18 });
      const start = h.root.position.clone();
      const back = fromDir.clone().setY(0).normalize().multiplyScalar(0.35);
      this.tweens.add(0.12, (k) => { h.root.position.copy(start).addScaledVector(back, k); h.body.rotation.x = -0.3 * k; }, ease.out)
        .then(() => this.tweens.add(0.35, (k) => { h.root.position.copy(start).addScaledVector(back, 1 - k); h.body.rotation.x = -0.3 * (1 - k); }));
    }

    async foeAttack() {
      const obj = this.roomObjs[this.current];
      if (this.disposed || !obj || !obj.alive || obj.chest) return;
      const heroPos = this.hero.root.position.clone();
      const start = obj.root.position.clone();
      const dir = heroPos.clone().sub(start).setY(0);
      const dist = dir.length();
      dir.normalize();

      if (obj.key === 'dragon') {
        obj.breathing = true;
        await this.tweens.add(0.25, (k) => { obj.jaw.rotation.x = 0.05 + 0.5 * k; obj.root.position.copy(start).addScaledVector(dir, 0.6 * k); });
        const mouth = new T.Vector3();
        let hit = false, f = 0;
        await this.tweens.add(0.75, (k) => {
          obj.mouth.getWorldPosition(mouth);
          const aim = heroPos.clone().add(new T.Vector3(0, 1.2, 0)).sub(mouth).normalize();
          this.burst(mouth, { count: 14, color: (f++ % 3) ? 0xff7a2a : 0xffd06a, speed: 1.4, dir: aim.multiplyScalar(10), life: 0.6, size: 0.55, gravity: 1.5 });
          this.fxLight.color.set(0xff7a2a);
          this.fxLight.position.copy(mouth);
          this.fxLight.intensity = 3;
          if (!hit && k > 0.35) { hit = true; this.heroHurt(dir); }
        }, ease.linear);
        this.fxLight.intensity = 0;
        await this.tweens.add(0.35, (k) => { obj.jaw.rotation.x = 0.55 - 0.5 * k; obj.root.position.copy(start).addScaledVector(dir, 0.6 * (1 - k)); });
        obj.breathing = false;
        return;
      }

      const reach = Math.max(0, dist - (obj.flying ? 1.0 : 1.5));
      await this.tweens.add(0.22, (k) => obj.root.position.copy(start).addScaledVector(dir, reach * k), ease.in);
      this.heroHurt(dir);
      await this.tweens.add(0.38, (k) => obj.root.position.copy(start).addScaledVector(dir, reach * (1 - k)), ease.out);
    }

    async foeDie() {
      const obj = this.roomObjs[this.current];
      if (this.disposed || !obj || !obj.alive) return;
      obj.alive = false;
      this.label.classList.add('hidden');
      const c = this.foeCenter(obj);
      this.burst(c, { count: 70, color: 0xb18cff, speed: 3.6, life: 1.1, size: 0.26, gravity: -1 });
      this.burst(c, { count: 30, color: 0xffd34a, speed: 2, up: 2.5, life: 1.0, size: 0.18, gravity: -4 });
      const s0 = obj.baseScale;
      await this.tweens.add(0.7, (k) => {
        obj.root.scale.setScalar(s0 * (1 - 0.97 * k));
        obj.root.rotation.y += 0.22;
      }, ease.in);
      obj.root.visible = false;
    }

    async openChest() {
      const obj = this.roomObjs[this.current];
      if (this.disposed || !obj || !obj.chest) return;
      const top = obj.root.position.clone().add(new T.Vector3(0, 1.0, 0));
      this.fxLight.color.set(0xffd34a);
      this.fxLight.position.copy(top);
      await this.tweens.add(0.6, (k) => {
        obj.lid.rotation.x = -1.9 * k;
        obj.glow.material.opacity = 0.8 * k;
        this.fxLight.intensity = 3 * k;
      }, ease.out);
      this.burst(top, { count: 50, color: 0xffd34a, speed: 1.6, up: 3.6, gravity: -6, life: 1.3, size: 0.2 });
      await this.tweens.wait(0.6);
      this.tweens.add(0.8, (k) => { this.fxLight.intensity = 3 * (1 - k); });
    }

    async heroFall() {
      if (this.disposed) return;
      const b = this.hero.body;
      this.label.classList.add('hidden');
      await this.tweens.add(0.8, (k) => { b.rotation.x = -1.45 * k; b.position.y = 0.1 * k; }, ease.in);
      this.shake = 0.2;
    }

    async heroRevive() {
      if (this.disposed) return;
      const b = this.hero.body;
      await this.heroFall();
      this.burst(this.hero.root.position.clone().add(new T.Vector3(0, 0.5, 0)), { count: 60, color: 0xffb347, speed: 2.2, up: 3, gravity: -2, life: 1.3, size: 0.24 });
      this.flash(this.heroMats, 0xffc94a, 1.6, 0.9);
      await this.tweens.add(0.7, (k) => { b.rotation.x = -1.45 * (1 - k); b.position.y = 0.1 * (1 - k); }, ease.out);
      const obj = this.roomObjs[this.current];
      if (obj && obj.alive) this.label.classList.remove('hidden');
    }

    async victory() {
      if (this.disposed) return;
      const arm = this.hero.arms[0];
      this.posed = true;
      this.camMode = 'victory';
      await this.tweens.add(0.4, (k) => { arm.rotation.x = -3.0 * k; }, ease.out);
      const p = this.hero.root.position.clone();
      for (let i = 0; i < 3; i++) {
        this.burst(p.clone().add(new T.Vector3((Math.random() - 0.5) * 2, 2.5, (Math.random() - 0.5) * 2)), { count: 50, color: [0xffd34a, 0x9fe0ff, 0xff9fc8][i], speed: 3, gravity: -2, life: 1.4, size: 0.22 });
        await this.tweens.wait(0.3);
      }
    }

    /* ---------- frame loop ---------- */
    loop(now) {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(this.loop);
      const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.time += dt;
      const t = this.time;
      this.tweens.update(dt);
      if (this.disposed) return;

      // Hero animation
      const h = this.hero;
      if (this.walking) {
        this.walkPhase += dt * 9;
        const s = Math.sin(this.walkPhase);
        h.legs[0].rotation.x = s * 0.7;
        h.legs[1].rotation.x = -s * 0.7;
        h.arms[1].rotation.x = s * 0.5;
        if (!this.attacking) h.arms[0].rotation.x = -s * 0.35;
        h.body.position.y = Math.abs(Math.cos(this.walkPhase)) * 0.06;
      } else {
        h.legs.forEach((l) => { l.rotation.x *= 0.82; });
        h.arms[1].rotation.x = h.arms[1].rotation.x * 0.85 + Math.sin(t * 1.6) * 0.008;
        if (!this.attacking && !this.posed) h.arms[0].rotation.x *= 0.85;
        if (h.body.rotation.x === 0) h.body.position.y = Math.sin(t * 2) * 0.015;
      }
      h.cape.rotation.x = 0.15 + Math.sin(t * 3) * 0.05 + (this.walking ? 0.3 : 0);
      this.heroLight.position.set(h.root.position.x + 0.6, 2.4, h.root.position.z + 1.2);

      // Monsters near the hero
      const hz = h.root.position.z;
      this.roomObjs.forEach((o) => {
        if (o.alive && Math.abs(o.root.position.z - hz) < 34) o.update.call(o, t);
      });

      // Torches, banners, dust
      this.flames.forEach((f, i) => {
        const s = 1 + Math.sin(t * 14 + i * 1.7) * 0.12 + Math.sin(t * 23 + i) * 0.06;
        f.scale.set(1, s, 1);
      });
      this.torchLights.forEach((l, i) => {
        if (l.userData.on) l.intensity = 3.4 * (0.86 + Math.sin(t * 13 + i * 2) * 0.09 + Math.sin(t * 29 + i) * 0.05);
      });
      this.banners.forEach((b, i) => { b.rotation.x = Math.sin(t * 1.2 + i) * 0.06; });
      this.dust.rotation.y = Math.sin(t * 0.05) * 0.02;
      this.dust.position.y = Math.sin(t * 0.3) * 0.15;

      // Particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.age += dt;
        const attr = p.pts.geometry.attributes.position;
        const a = attr.array;
        for (let j = 0; j < p.vel.length; j++) {
          const v = p.vel[j];
          v.y += p.gravity * dt;
          a[j * 3] += v.x * dt; a[j * 3 + 1] += v.y * dt; a[j * 3 + 2] += v.z * dt;
        }
        attr.needsUpdate = true;
        p.pts.material.opacity = Math.max(0, 1 - p.age / p.life);
        if (p.age >= p.life) {
          this.scene.remove(p.pts);
          p.pts.geometry.dispose();
          p.pts.material.dispose();
          this.particles.splice(i, 1);
        }
      }

      this.updateCamera(dt, t);
      this.updateLabel();
      this.renderer.render(this.scene, this.camera);
    }

    updateCamera(dt, t) {
      const hp = this.hero.root.position;
      const P = this.camPosT, L = this.camLookT;
      if (this.camMode === 'intro') {
        P.set(hp.x + 2.4 + Math.sin(t * 0.35) * 0.6, 2.6, hp.z + 5.2);
        L.set(0, 2.2, 7);
      } else if (this.camMode === 'follow') {
        P.set(hp.x + 1.7, 2.5, hp.z + 4.8);
        L.set(hp.x + 0.5, 1.4, hp.z - 5);
      } else if (this.camMode === 'victory') {
        const a = t * 0.4;
        P.set(hp.x + Math.sin(a) * 4.2, 2.3, hp.z + Math.cos(a) * 4.2);
        L.set(hp.x, 1.3, hp.z);
      } else {
        const obj = this.roomObjs[this.current];
        const kind = obj ? obj.kind : 'battle';
        const sc = kind === 'boss' ? 1.5 : kind === 'elite' ? 1.15 : 1;
        // Stay on this side of the room's entrance arch (z + 7) so nothing blocks the view.
        const zMax = roomZ(this.current) + 6.4;
        P.set(hp.x + 1.9 * sc + Math.sin(t * 0.4) * 0.15, 2.3 + (sc - 1) * 2.2, Math.min(hp.z + 4.3 * sc, zMax));
        if (obj) L.copy(hp).lerp(obj.root.position, 0.55);
        else L.copy(hp);
        L.y = 1.2 * sc;
      }
      const k = 1 - Math.exp(-dt * (this.camMode === 'follow' ? 4 : 2.6));
      this.camPos.lerp(P, k);
      this.camLook.lerp(L, k);
      this.camera.position.copy(this.camPos);
      if (this.shake > 0) {
        if (!this.reduced) {
          this.camera.position.x += (Math.random() - 0.5) * this.shake;
          this.camera.position.y += (Math.random() - 0.5) * this.shake;
        }
        this.shake = Math.max(0, this.shake - dt * 1.2);
      }
      this.camera.lookAt(this.camLook);
      const wide = this.camMode === 'battle' && this.roomObjs[this.current] && this.roomObjs[this.current].kind === 'boss' ? 10 : 0;
      const fov = this.baseFov + wide - (this.reduced ? 0 : this.fovKick);
      if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
      this.fovKick *= Math.exp(-dt * 5);
    }

    updateLabel() {
      if (this.label.classList.contains('hidden')) return;
      const obj = this.roomObjs[this.current];
      if (!obj || !obj.alive) { this.label.classList.add('hidden'); return; }
      const top = obj.root.position.clone();
      top.y += obj.height * obj.root.scale.y + 0.35;
      const s = this.project(top);
      this.label.style.left = s.x + 'px';
      this.label.style.top = Math.max(64, s.y) + 'px';
      this.label.style.visibility = s.visible ? 'visible' : 'hidden';
    }

    resize() {
      const w = this.container.clientWidth, h = this.container.clientHeight;
      if (!w || !h || this.disposed) return;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.baseFov = Dungeon3D.fovFor(w / h);
      this.camera.updateProjectionMatrix();
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      cancelAnimationFrame(this.raf);
      clearTimeout(this.bannerTimer);
      if (this.ro) this.ro.disconnect();
      else window.removeEventListener('resize', this.onResize);
      this.tweens.clear();
      const seen = new Set();
      this.scene.traverse((o) => {
        if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        mats.forEach((m) => {
          if (seen.has(m)) return;
          seen.add(m);
          if (m.map && !seen.has(m.map)) { seen.add(m.map); m.map.dispose(); }
          m.dispose();
        });
      });
      this.renderer.dispose();
      if (this.renderer.forceContextLoss) this.renderer.forceContextLoss();
      this.canvas.remove();
      this.overlay.remove();
    }
  }

  // Narrow (phone) viewports get a wider lens so tall monsters stay in frame.
  Dungeon3D.fovFor = (aspect) => (aspect < 1.25 ? 62 : aspect < 1.6 ? 55 : 50);
  Dungeon3D.supported = supported;
  WQ.Dungeon3D = Dungeon3D;
})(window.WQ = window.WQ || {});
