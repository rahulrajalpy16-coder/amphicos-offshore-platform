// Procedural canvas textures, generated once at start (no image files, offline).
import * as THREE from 'three';
import { rng } from './kit.js';

const texCache = new Map();
let maxAniso = 8;
export function setMaxAnisotropy(a) { maxAniso = a; }

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function toTex(c, { repeat = true, srgb = true, aniso = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (aniso) t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}

function once(key, make) {
  if (!texCache.has(key)) texCache.set(key, make());
  return texCache.get(key);
}

function noise(ctx, w, h, amount, seed, alpha = 0.06) {
  const r = rng(seed);
  for (let i = 0; i < amount; i++) {
    const x = r() * w, y = r() * h, s = 1 + r() * 3;
    const v = r() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * r()})`;
    ctx.fillRect(x, y, s, s);
  }
}

function blotches(ctx, w, h, n, seed, color, maxR = 60, alpha = 0.05) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, rad = 10 + r() * maxR;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, color.replace('A', String(alpha * (0.5 + r()))));
    g.addColorStop(1, color.replace('A', '0'));
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

// Main deck plating, one tile = 12 m x 12 m.
export function deckTexture() {
  return once('deck', () => {
    const S = 1024, c = canvas(S, S), x = c.getContext('2d');
    x.fillStyle = '#6f7872';
    x.fillRect(0, 0, S, S);
    blotches(x, S, S, 70, 'deck-b', 'rgba(40,45,42,A)', 90, 0.08);
    blotches(x, S, S, 25, 'deck-r', 'rgba(110,70,45,A)', 40, 0.05);
    noise(x, S, S, 9000, 'deck-n', 0.07);
    // plate seams: plates 3 m x 12 m (rows along x)
    x.strokeStyle = 'rgba(30,34,32,0.55)';
    x.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { const y = i * S / 4; x.beginPath(); x.moveTo(0, y); x.lineTo(S, y); x.stroke(); }
    for (let i = 0; i < 4; i++) {
      const xo = ((i % 2) * 0.5 + 0.25) * S;
      x.beginPath(); x.moveTo(xo, i * S / 4); x.lineTo(xo, (i + 1) * S / 4); x.stroke();
    }
    x.strokeStyle = 'rgba(200,205,200,0.12)';
    x.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const y = i * S / 4 + 2; x.beginPath(); x.moveTo(0, y); x.lineTo(S, y); x.stroke(); }
    return toTex(c);
  });
}

// Hull side: u repeats every 24 m (plate pattern), v = z / depth absolute.
export function hullTextures(T, depth = 28) {
  return once('hull' + T + ':' + depth, () => {
    const W = 512, H = 1024;
    const c = canvas(W, H), x = c.getContext('2d');
    const zToY = (z) => H - (z / depth) * H;
    const top = '#22303d';      // dark hull above boot top
    const boot = '#1a1a1c';     // boot top band
    const af = '#7d2b22';       // antifouling red
    x.fillStyle = af; x.fillRect(0, 0, W, H);
    x.fillStyle = boot; x.fillRect(0, zToY(T + 1.6), W, zToY(T - 0.8) - zToY(T + 1.6));
    x.fillStyle = top; x.fillRect(0, 0, W, zToY(T + 1.6));
    // weathering streaks below deck edge and around the waterline
    const r = rng('hull');
    for (let i = 0; i < 120; i++) {
      const xx = r() * W, len = 20 + r() * 220, a = 0.03 + r() * 0.06;
      const g = x.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, `rgba(120,70,40,${a})`); g.addColorStop(1, 'rgba(120,70,40,0)');
      x.save(); x.translate(xx, zToY(depth - 0.2)); x.fillStyle = g; x.fillRect(0, 0, 1 + r() * 2, len); x.restore();
    }
    noise(x, W, H, 6000, 'hulln', 0.05);
    // seams
    const seam = canvas(W, H), s = seam.getContext('2d');
    s.fillStyle = '#808080'; s.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(0,0,0,0.35)'; s.strokeStyle = '#3a3a3a';
    x.lineWidth = s.lineWidth = 2;
    const strakes = [];
    for (let z = 2.6; z < depth; z += 2.9) strakes.push(z);
    for (const z of strakes) {
      for (const ctx of [x, s]) { ctx.beginPath(); ctx.moveTo(0, zToY(z)); ctx.lineTo(W, zToY(z)); ctx.stroke(); }
    }
    for (let i = 0; i < strakes.length; i++) {
      const z0 = i === 0 ? 0 : strakes[i - 1], z1 = strakes[i];
      const xo = (i % 2 === 0 ? 0.25 : 0.75) * W;
      for (const ctx of [x, s]) { ctx.beginPath(); ctx.moveTo(xo, zToY(z0)); ctx.lineTo(xo, zToY(z1)); ctx.stroke(); }
    }
    // frame shadows (very faint vertical lines every 0.8 m equivalent)
    x.strokeStyle = 'rgba(0,0,0,0.05)'; x.lineWidth = 1;
    for (let i = 0; i < 30; i++) { const xx = i * W / 30; x.beginPath(); x.moveTo(xx, 0); x.lineTo(xx, zToY(T - 1)); x.stroke(); }
    const map = toTex(c);
    map.wrapT = THREE.ClampToEdgeWrapping;
    const bump = toTex(seam, { srgb: false });
    bump.wrapT = THREE.ClampToEdgeWrapping;
    return { map, bump };
  });
}

// Draft mark strip: metric marks, labels every metre (e.g. "16M"), 20 cm figures.
export function draftMarkTexture(z0, z1) {
  return once('draft' + z0 + ':' + z1, () => {
    const W = 128, H = 1024, c = canvas(W, H), x = c.getContext('2d');
    x.clearRect(0, 0, W, H);
    const pxPerM = H / (z1 - z0);
    x.fillStyle = '#f2f2ee';
    x.textAlign = 'left';
    x.textBaseline = 'bottom';
    for (let z = Math.ceil(z0 * 5) / 5; z <= z1; z += 0.2) {
      const y = H - (z - z0) * pxPerM;
      const whole = Math.abs(z - Math.round(z)) < 0.01;
      const fs = 0.1 * pxPerM;
      x.font = `bold ${Math.max(6, fs)}px Arial`;
      if (whole) {
        x.font = `bold ${Math.max(7, fs * 1.0)}px Arial`;
        x.fillText(Math.round(z) + 'M', 8, y);
      } else {
        const d = Math.round((z - Math.floor(z)) * 10);
        x.fillText(String(d), 8, y);
      }
    }
    const t = toTex(c, { repeat: false });
    return t;
  });
}

// Open steel grating, one tile = 0.5 m. Alpha encodes openings.
export function gratingTexture() {
  return once('grating', () => {
    const S = 256, c = canvas(S, S), x = c.getContext('2d');
    x.clearRect(0, 0, S, S);
    x.fillStyle = '#9a9c96';
    const bars = 10, cross = 4;
    for (let i = 0; i < bars; i++) x.fillRect(i * S / bars, 0, 5, S);
    for (let i = 0; i < cross; i++) x.fillRect(0, i * S / cross, S, 4);
    return toTex(c);
  });
}

// Opaque grating (bars light, openings dark) for walkways seen at grazing angles indoors
export function gratingOpaqueTexture() {
  return once('gratingOpaque', () => {
    const S = 256, c = canvas(S, S), x = c.getContext('2d');
    x.fillStyle = '#2b2d2c'; x.fillRect(0, 0, S, S);
    x.fillStyle = '#a3a69f';
    for (let i = 0; i < 10; i++) x.fillRect(i * S / 10, 0, 6, S);
    for (let i = 0; i < 4; i++) x.fillRect(0, i * S / 4, S, 4);
    return toTex(c);
  });
}

export function raisedFloorTexture() {
  return once('raised', () => {
    const S = 512, c = canvas(S, S), x = c.getContext('2d');
    x.fillStyle = '#aeb3b5'; x.fillRect(0, 0, S, S);
    noise(x, S, S, 4000, 'rf', 0.05);
    x.strokeStyle = '#8f9497'; x.lineWidth = 3;
    for (let i = 0; i <= 2; i++) {
      x.beginPath(); x.moveTo(i * S / 2, 0); x.lineTo(i * S / 2, S); x.stroke();
      x.beginPath(); x.moveTo(0, i * S / 2); x.lineTo(S, i * S / 2); x.stroke();
    }
    // a perforated airflow tile
    x.fillStyle = 'rgba(80,85,88,0.6)';
    for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) x.fillRect(S / 2 + 20 + i * 18, 20 + j * 18, 8, 8);
    return toTex(c);
  });
}

// Engine room floor plates: chequer (diamond tread) plate, 1 tile = 2 m, plate seams and bolts
export function erFloorTexture() {
  return once('erfloor', () => {
    const S = 512, c = canvas(S, S), x = c.getContext('2d');
    x.fillStyle = '#8a908c'; x.fillRect(0, 0, S, S);
    const r = rng('chq');
    for (let j = 0; j < 40; j++) for (let i = 0; i < 40; i++) {
      const px = i * 13 + (j % 2) * 6, py = j * 13;
      x.save(); x.translate(px, py); x.rotate((j % 2 ? 1 : -1) * 0.7);
      x.fillStyle = 'rgba(200,205,200,0.35)'; x.fillRect(-4, -1, 8, 2);
      x.fillStyle = 'rgba(40,42,40,0.35)'; x.fillRect(-4, 1, 8, 1);
      x.restore();
    }
    blotches(x, S, S, 18, 'erf', 'rgba(50,45,35,A)', 60, 0.14);
    void r;
    x.strokeStyle = 'rgba(25,25,25,0.7)'; x.lineWidth = 3;
    x.strokeRect(1, 1, S - 2, S / 2 - 2); x.strokeRect(1, S / 2 + 1, S - 2, S / 2 - 2);
    x.fillStyle = '#3a3c3a';
    for (const [bx, by] of [[12, 12], [S - 12, 12], [12, S / 2 - 12], [S - 12, S / 2 - 12], [12, S / 2 + 12], [S - 12, S - 12], [S / 2, 12], [S / 2, S - 12]]) { x.beginPath(); x.arc(bx, by, 4, 0, 7); x.fill(); }
    return toTex(c);
  });
}

// Accommodation facade, one tile = 3 m wide x deck height (3 m)
export function facadeTexture() {
  return once('facade', () => {
    const W = 256, H = 256, c = canvas(W, H), x = c.getContext('2d');
    x.fillStyle = '#e8eae8'; x.fillRect(0, 0, W, H);
    noise(x, W, H, 1500, 'fac', 0.03);
    // deck line
    x.fillStyle = '#c9ccca'; x.fillRect(0, H - 10, W, 10);
    // window
    const wx = 70, wy = 70, ww = 116, wh = 80;
    x.fillStyle = '#5f6467'; x.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
    const g = x.createLinearGradient(0, wy, 0, wy + wh);
    g.addColorStop(0, '#5d7d98'); g.addColorStop(0.55, '#2b3e52'); g.addColorStop(1, '#1c2a38');
    x.fillStyle = g; x.fillRect(wx, wy, ww, wh);
    x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(wx + 6, wy + 6, ww * 0.35, wh * 0.25);
    x.fillStyle = '#5f6467'; x.fillRect(wx + ww / 2 - 2, wy, 4, wh);
    return toTex(c);
  });
}

// Corrugated / stiffened steel wall for machinery spaces, 1 tile = 2.4 m
export function stiffenedWallTexture(base = '#b9bfbd', seed = 'w') {
  return once('wall' + base + seed, () => {
    const S = 256, c = canvas(S, S), x = c.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, S, S);
    noise(x, S, S, 2000, seed, 0.05);
    for (let i = 0; i < 4; i++) {
      const xx = i * S / 4 + 30;
      const g = x.createLinearGradient(xx - 10, 0, xx + 14, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.16)'); g.addColorStop(1, 'rgba(255,255,255,0.05)');
      x.fillStyle = g; x.fillRect(xx - 10, 0, 24, S);
    }
    return toTex(c);
  });
}

// Light panelled wall for electrical / control rooms, 1 tile = 1.2 m x 1.2 m
export function panelWallTexture() {
  return once('panelwall', () => {
    const S = 256, c = canvas(S, S), x = c.getContext('2d');
    x.fillStyle = '#e1e3e1'; x.fillRect(0, 0, S, S);
    noise(x, S, S, 1500, 'pw', 0.03);
    x.strokeStyle = 'rgba(120,125,125,0.55)'; x.lineWidth = 2;
    x.strokeRect(1, 1, S - 2, S - 2);
    return toTex(c);
  });
}

export function ceilingTexture() {
  return once('ceil', () => {
    const S = 256, c = canvas(S, S), x = c.getContext('2d');
    x.fillStyle = '#eeefee'; x.fillRect(0, 0, S, S);
    noise(x, S, S, 3000, 'ce', 0.04);
    x.strokeStyle = '#b8bcbc'; x.lineWidth = 3;
    x.strokeRect(0, 0, S, S);
    return toTex(c);
  });
}

// Cutaway section hatch for the cut caps
export function hatchTexture() {
  return once('hatch', () => {
    const S = 128, c = canvas(S, S), x = c.getContext('2d');
    x.fillStyle = '#9c6f58'; x.fillRect(0, 0, S, S);
    x.strokeStyle = 'rgba(60,35,25,0.35)'; x.lineWidth = 5;
    for (let i = -S; i < S * 2; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + S, S); x.stroke(); }
    return toTex(c);
  });
}

// Helideck markings: dark green deck, yellow circle, white H, perimeter line
export function helideckTexture(text = 'AMPHICOS') {
  return once('heli' + text, () => {
    const S = 1024, c = canvas(S, S), x = c.getContext('2d');
    x.fillStyle = '#2f4a3a'; x.fillRect(0, 0, S, S);
    noise(x, S, S, 8000, 'heli', 0.06);
    x.save(); x.translate(S / 2, S / 2);
    // octagon perimeter white line
    x.strokeStyle = '#f4f4f0'; x.lineWidth = 16;
    x.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + i * Math.PI / 4, r = S * 0.47;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.closePath(); x.stroke();
    // touchdown circle
    x.strokeStyle = '#f2c230'; x.lineWidth = 40;
    x.beginPath(); x.arc(0, 0, S * 0.26, 0, Math.PI * 2); x.stroke();
    // H
    x.fillStyle = '#f4f4f0';
    const hw = S * 0.11, hh = S * 0.18, bar = S * 0.035;
    x.fillRect(-hw, -hh, bar, hh * 2); x.fillRect(hw - bar, -hh, bar, hh * 2); x.fillRect(-hw, -bar / 2, hw * 2, bar);
    x.restore();
    // name on the sector, as typical deck identification
    x.fillStyle = '#f4f4f0'; x.font = 'bold 54px Arial'; x.textAlign = 'center';
    x.fillText(text, S / 2, S * 0.9);
    x.fillText('D 22.8  12.8t', S / 2, S * 0.15);
    return toTex(c, { repeat: false });
  });
}

// 19 inch rack front textures: base + emissive (LEDs only). kind: telecom|paga|pabx|iptv|nvr|server|ups
export function rackFrontTextures(kind = 'telecom', seed = 'r') {
  return once('rack' + kind + seed, () => {
    const W = 256, H = 1024, c = canvas(W, H), x = c.getContext('2d');
    const e = canvas(W, H), ex = e.getContext('2d');
    ex.fillStyle = '#000'; ex.fillRect(0, 0, W, H);
    x.fillStyle = '#17191b'; x.fillRect(0, 0, W, H);
    const r = rng(kind + seed);
    const U = H / 42;
    let u = 1;
    const led = (px, py, col, sz = 3) => {
      x.fillStyle = col; x.fillRect(px, py, sz, sz);
      ex.fillStyle = col; ex.fillRect(px - 1, py - 1, sz + 2, sz + 2);
    };
    const unit = (n, draw) => { if (u + n > 41) return; const y = u * U; draw(y, n * U); u += n; };
    const plan = {
      telecom: ['patch', 'patch', 'cable', 'switch', 'switch', 'blank', 'patch', 'fibre', 'switch', 'router', 'blank', 'server2', 'server2', 'blank', 'pdu'],
      paga: ['amp3', 'amp3', 'amp3', 'amp3', 'blank', 'ctrl2', 'patch', 'monitor2', 'blank', 'psu3', 'batt3'],
      pabx: ['shelf6', 'shelf6', 'blank', 'patch', 'patch', 'switch', 'server2', 'blank', 'psu3'],
      iptv: ['enc2', 'enc2', 'enc2', 'mod2', 'mod2', 'switch', 'server2', 'server2', 'patch', 'blank', 'psu3'],
      nvr: ['disk3', 'disk3', 'disk3', 'switch', 'switch', 'patch', 'blank', 'server2', 'monitor2', 'psu3'],
      server: ['server2', 'server2', 'server2', 'server2', 'switch', 'switch', 'patch', 'blank', 'pdu'],
      ups: ['psu3', 'psu3', 'batt3', 'batt3', 'batt3', 'batt3', 'batt3'],
    }[kind] || ['patch', 'switch', 'blank'];
    for (const item of plan) {
      switch (item) {
        case 'patch': unit(1, (y, h) => {
          x.fillStyle = '#222'; x.fillRect(10, y + 1, W - 20, h - 2);
          for (let i = 0; i < 24; i++) { x.fillStyle = '#0b0b0b'; x.fillRect(22 + i * 9, y + 6, 7, h - 12); x.fillStyle = ['#3a7bd5', '#e8e8e8', '#e3c341', '#d04b3c'][Math.floor(r() * 4)]; if (r() > 0.3) x.fillRect(23 + i * 9, y + 7, 5, 4); }
        }); break;
        case 'cable': unit(1, (y, h) => { x.fillStyle = '#2b2b2b'; x.fillRect(10, y + 2, W - 20, h - 4); x.fillStyle = '#111'; for (let i = 0; i < 8; i++) x.fillRect(20 + i * 28, y + 6, 22, 4); }); break;
        case 'switch': unit(1, (y, h) => {
          x.fillStyle = '#2d3238'; x.fillRect(10, y + 1, W - 20, h - 2);
          for (let i = 0; i < 24; i++) { x.fillStyle = '#0d0d0d'; x.fillRect(40 + i * 8, y + 6, 6, h - 12); if (r() > 0.25) led(41 + i * 8, y + 5, r() > 0.15 ? '#38e06b' : '#f0b429', 2); }
          led(18, y + 8, '#38e06b');
        }); break;
        case 'router': unit(1, (y, h) => { x.fillStyle = '#414a52'; x.fillRect(10, y + 1, W - 20, h - 2); led(20, y + 8, '#38e06b'); led(30, y + 8, '#38e06b'); led(40, y + 8, '#3aa0ff'); }); break;
        case 'fibre': unit(1, (y, h) => { x.fillStyle = '#3b3f45'; x.fillRect(10, y + 1, W - 20, h - 2); for (let i = 0; i < 12; i++) { x.fillStyle = '#2aa3c8'; x.fillRect(30 + i * 16, y + 7, 8, 6); } }); break;
        case 'server2': unit(2, (y, h) => {
          x.fillStyle = '#2a2e33'; x.fillRect(10, y + 1, W - 20, h - 2);
          for (let i = 0; i < 8; i++) { x.fillStyle = '#16181a'; x.fillRect(16 + i * 22, y + 5, 19, h - 10); led(30 + i * 22, y + 8, r() > 0.1 ? '#38e06b' : '#3aa0ff', 2); }
          led(W - 30, y + 10, '#3aa0ff', 4);
        }); break;
        case 'amp3': unit(3, (y, h) => {
          x.fillStyle = '#30353a'; x.fillRect(10, y + 1, W - 20, h - 2);
          x.fillStyle = '#1b1e21'; x.fillRect(20, y + 8, 60, h - 16);
          for (let i = 0; i < 10; i++) led(95 + i * 9, y + h / 2 - 2, i < 6 ? '#38e06b' : i < 8 ? '#f0b429' : '#552222', 6);
          led(W - 40, y + 12, '#38e06b', 5); x.fillStyle = '#999'; x.fillText('AMP', 30, y + h / 2 + 4);
        }); break;
        case 'ctrl2': unit(2, (y, h) => { x.fillStyle = '#3d444a'; x.fillRect(10, y + 1, W - 20, h - 2); x.fillStyle = '#0e3b52'; x.fillRect(20, y + 5, 70, h - 10); ex.fillStyle = '#1b6d94'; ex.fillRect(20, y + 5, 70, h - 10); for (let i = 0; i < 8; i++) led(110 + i * 14, y + 10, '#38e06b', 4); }); break;
        case 'monitor2': unit(2, (y, h) => { x.fillStyle = '#2f3438'; x.fillRect(10, y + 1, W - 20, h - 2); for (let i = 0; i < 16; i++) led(20 + i * 13, y + 12, r() > 0.1 ? '#38e06b' : '#e04545', 4); }); break;
        case 'psu3': unit(3, (y, h) => { x.fillStyle = '#3a3f44'; x.fillRect(10, y + 1, W - 20, h - 2); for (let i = 0; i < 6; i++) { x.fillStyle = '#26292c'; x.fillRect(20 + i * 36, y + 8, 30, h - 16); } led(W - 30, y + 10, '#38e06b', 4); }); break;
        case 'batt3': unit(3, (y, h) => { x.fillStyle = '#2b2e30'; x.fillRect(10, y + 1, W - 20, h - 2); x.fillStyle = '#474c50'; for (let i = 0; i < 4; i++) x.fillRect(18 + i * 56, y + 6, 50, h - 12); }); break;
        case 'shelf6': unit(6, (y, h) => {
          x.fillStyle = '#3a4046'; x.fillRect(10, y + 1, W - 20, h - 2);
          for (let i = 0; i < 14; i++) { x.fillStyle = '#25292d'; x.fillRect(16 + i * 16, y + 6, 13, h - 12); led(20 + i * 16, y + 12, '#38e06b', 3); if (r() > 0.6) led(20 + i * 16, y + 20, '#f0b429', 3); }
        }); break;
        case 'enc2': unit(2, (y, h) => { x.fillStyle = '#33393f'; x.fillRect(10, y + 1, W - 20, h - 2); x.fillStyle = '#0e2a3c'; x.fillRect(20, y + 6, 50, h - 12); ex.fillStyle = '#144b6b'; ex.fillRect(20, y + 6, 50, h - 12); for (let i = 0; i < 4; i++) led(90 + i * 30, y + 12, '#38e06b', 4); }); break;
        case 'mod2': unit(2, (y, h) => { x.fillStyle = '#2d3236'; x.fillRect(10, y + 1, W - 20, h - 2); for (let i = 0; i < 12; i++) led(24 + i * 18, y + 12, '#3aa0ff', 4); }); break;
        case 'disk3': unit(3, (y, h) => {
          x.fillStyle = '#26292d'; x.fillRect(10, y + 1, W - 20, h - 2);
          for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = '#121416'; x.fillRect(16 + i * 56, y + 5 + j * (h - 10) / 4, 52, (h - 10) / 4 - 2); led(60 + i * 56, y + 8 + j * (h - 10) / 4, '#38e06b', 3); }
        }); break;
        case 'pdu': unit(1, (y, h) => { x.fillStyle = '#1d1f21'; x.fillRect(10, y + 1, W - 20, h - 2); for (let i = 0; i < 10; i++) { x.fillStyle = '#000'; x.fillRect(30 + i * 20, y + 5, 12, h - 10); } led(16, y + 8, '#e04545'); }); break;
        default: unit(1 + Math.floor(r() * 2), (y, h) => { x.fillStyle = '#1f2224'; x.fillRect(10, y + 1, W - 20, h - 2); for (let i = 0; i < 20; i++) { x.fillStyle = '#151617'; x.fillRect(16 + i * 11, y + 3, 6, h - 6); } });
      }
    }
    // mounting rails
    x.fillStyle = '#4a4f54'; x.fillRect(0, 0, 10, H); x.fillRect(W - 10, 0, 10, H);
    x.fillStyle = '#777'; for (let i = 0; i < 42; i++) { x.fillRect(3, i * U + U / 2, 3, 3); x.fillRect(W - 6, i * U + U / 2, 3, 3); }
    return { map: toTex(c, { repeat: false }), emissive: toTex(e, { repeat: false }) };
  });
}

// MV / LV switchboard panel front (one cubicle). variant legacy|retrofit
export function switchboardFrontTextures(kind = 'mv', variant = 'retrofit', label = '', seed = 's', color = '#d7d9d6') {
  return once('swb' + kind + variant + label + seed + color, () => {
    const W = 256, H = 1024, c = canvas(W, H), x = c.getContext('2d');
    const e = canvas(W, H), ex = e.getContext('2d');
    ex.fillStyle = '#000'; ex.fillRect(0, 0, W, H);
    x.fillStyle = color; x.fillRect(0, 0, W, H);
    noise(x, W, H, 1200, seed, 0.025);
    const r = rng(seed + variant);
    const led = (px, py, col, rad = 5) => {
      x.fillStyle = col; x.beginPath(); x.arc(px, py, rad, 0, Math.PI * 2); x.fill();
      ex.fillStyle = col; ex.beginPath(); ex.arc(px, py, rad + 1, 0, Math.PI * 2); ex.fill();
    };
    // door gaps
    x.strokeStyle = 'rgba(40,40,40,0.75)'; x.lineWidth = 3;
    const lvTop = 8, lvBot = kind === 'mv' ? 380 : 330, cbBot = kind === 'mv' ? 760 : 1000;
    x.strokeRect(8, lvTop, W - 16, lvBot - lvTop);
    x.strokeRect(8, lvBot + 8, W - 16, cbBot - lvBot - 8);
    if (kind === 'mv') x.strokeRect(8, cbBot + 8, W - 16, H - cbBot - 16);
    // label strip
    x.fillStyle = '#f5f5f0'; x.fillRect(40, 18, W - 80, 30);
    x.strokeStyle = '#333'; x.lineWidth = 1; x.strokeRect(40, 18, W - 80, 30);
    x.fillStyle = '#111'; x.font = 'bold 20px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(label.slice(0, 16), W / 2, 34);
    if (variant === 'legacy') {
      // analogue meters (square, 96 mm) and lamp indicators, control switches
      for (let i = 0; i < 3; i++) {
        const mx = 26 + i * 72, my = 70;
        x.fillStyle = '#1b1b1b'; x.fillRect(mx, my, 62, 62);
        x.fillStyle = '#f2efe4'; x.fillRect(mx + 4, my + 4, 54, 54);
        x.strokeStyle = '#222'; x.lineWidth = 1;
        x.beginPath(); x.arc(mx + 31, my + 54, 40, -Math.PI * 0.85, -Math.PI * 0.15); x.stroke();
        for (let k = 0; k <= 8; k++) { const a = -Math.PI * 0.85 + k * Math.PI * 0.7 / 8; x.beginPath(); x.moveTo(mx + 31 + Math.cos(a) * 36, my + 54 + Math.sin(a) * 36); x.lineTo(mx + 31 + Math.cos(a) * 41, my + 54 + Math.sin(a) * 41); x.stroke(); }
        const a = -Math.PI * (0.65 - r() * 0.3); x.strokeStyle = '#111'; x.lineWidth = 2;
        x.beginPath(); x.moveTo(mx + 31, my + 54); x.lineTo(mx + 31 + Math.cos(a) * 38, my + 54 + Math.sin(a) * 38); x.stroke();
        x.fillStyle = '#333'; x.font = '9px Arial'; x.fillText(['A', 'kV', 'kW'][i], mx + 31, my + 44);
      }
      // second row: frequency / pf meters
      for (let i = 0; i < 2; i++) {
        const mx = 60 + i * 80, my = 145;
        x.fillStyle = '#1b1b1b'; x.fillRect(mx, my, 56, 56);
        x.fillStyle = '#f2efe4'; x.fillRect(mx + 4, my + 4, 48, 48);
        x.strokeStyle = '#111'; x.lineWidth = 2; x.beginPath(); x.moveTo(mx + 28, my + 46); x.lineTo(mx + 20 + r() * 16, my + 14); x.stroke();
      }
      // indicating lamps row
      const lamp = ['#2ecc40', '#e74c3c', '#f1c40f', '#ffffff', '#2ecc40', '#e74c3c'];
      for (let i = 0; i < 6; i++) { x.fillStyle = '#2a2a2a'; x.beginPath(); x.arc(32 + i * 38, 230, 14, 0, Math.PI * 2); x.fill(); led(32 + i * 38, 230, lamp[i], 9); }
      // rotary switches and electromechanical relays (flag type) behind window
      for (let i = 0; i < 3; i++) { x.fillStyle = '#111'; x.beginPath(); x.arc(50 + i * 78, 280, 16, 0, Math.PI * 2); x.fill(); x.fillStyle = '#ddd'; x.fillRect(46 + i * 78, 266, 8, 28); }
      x.fillStyle = '#3c3f3c'; x.fillRect(30, 310, W - 60, 56);
      for (let i = 0; i < 4; i++) { x.fillStyle = '#121212'; x.fillRect(38 + i * 48, 316, 40, 44); x.fillStyle = '#e8c33a'; x.fillRect(48 + i * 48, 340, 18, 6); }
    } else {
      // numerical IED window (the IED itself is a 3D component when present) + small HMI
      x.fillStyle = '#2c3135'; x.fillRect(40, 66, W - 80, 170);
      x.fillStyle = '#9fb7b0'; x.fillRect(58, 82, 110, 70);
      ex.fillStyle = '#41605a'; ex.fillRect(58, 82, 110, 70);
      x.fillStyle = 'rgba(31,42,40,0.55)';
      for (let k = 0; k < 4; k++) x.fillRect(66, 90 + k * 14, 50 + ((k * 37) % 40), 5);
      for (let i = 0; i < 8; i++) led(184, 86 + i * 16, i === 0 ? '#38e06b' : i === 3 ? '#f0b429' : '#3a3a3a', 4);
      for (let i = 0; i < 6; i++) { x.fillStyle = '#4a5157'; x.fillRect(60 + i * 24, 170, 18, 14); }
      x.fillStyle = '#d8dbd8'; x.fillRect(40, 250, W - 80, 60);
      // mimic line
      x.strokeStyle = '#d03a2a'; x.lineWidth = 6; x.textAlign = 'center';
      x.beginPath(); x.moveTo(W / 2, 252); x.lineTo(W / 2, 308); x.stroke();
      x.fillStyle = '#d03a2a'; x.fillRect(W / 2 - 12, 268, 24, 20);
      led(70, 280, '#e04545', 7); led(W - 70, 280, '#38e06b', 7);
      // control buttons
      x.fillStyle = '#1f9a4a'; x.beginPath(); x.arc(90, 340, 12, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#c0392b'; x.beginPath(); x.arc(W - 90, 340, 12, 0, Math.PI * 2); x.fill();
    }
    // breaker compartment: viewing window, racking slot, mimic bus line
    const by = lvBot + 30;
    x.fillStyle = '#d03a2a';
    if (kind === 'mv') {
      x.fillRect(W / 2 - 4, lvBot + 10, 8, cbBot - lvBot - 20);
      x.fillStyle = '#28323a'; x.fillRect(50, by + 80, W - 100, 160);
      x.fillStyle = 'rgba(120,160,180,0.35)'; x.fillRect(56, by + 86, W - 112, 148);
      x.fillStyle = '#111'; x.fillRect(W / 2 - 10, by + 280, 20, 20);
      x.fillStyle = '#e6b31e'; x.fillRect(46, by + 30, W - 92, 18);
      x.fillStyle = '#111'; x.font = 'bold 12px Arial'; x.fillText('DANGER HIGH VOLTAGE', W / 2, by + 39);
      // cable compartment warning
      x.fillStyle = '#e6b31e'; x.fillRect(80, cbBot + 70, W - 160, 50);
      x.fillStyle = '#111'; x.beginPath(); x.moveTo(W / 2, cbBot + 76); x.lineTo(W / 2 + 18, cbBot + 112); x.lineTo(W / 2 - 18, cbBot + 112); x.fill();
    } else {
      // LV: withdrawable feeder drawers
      for (let i = 0; i < 6; i++) {
        const yy = lvBot + 20 + i * 105;
        x.strokeStyle = 'rgba(40,40,40,0.6)'; x.lineWidth = 2; x.strokeRect(14, yy, W - 28, 98);
        x.fillStyle = '#2a2a2a'; x.fillRect(30, yy + 30, 40, 40);
        led(W - 40, yy + 30, r() > 0.2 ? '#38e06b' : '#e04545', 5);
        x.fillStyle = '#f5f5f0'; x.fillRect(90, yy + 12, 110, 18);
      }
    }
    return { map: toTex(c, { repeat: false }), emissive: toTex(e, { repeat: false }) };
  });
}

// Generic control cabinet front (doors with indicator, keypad, louvres) for VFDs, PMS, etc.
export function cabinetFrontTextures(kind = 'vfd', label = '', seed = 'c', color = '#d7d9d6', doors = 2) {
  return once('cab' + kind + label + seed + color + doors, () => {
    const W = 256 * Math.max(1, Math.min(doors, 4)), H = 1024, c = canvas(W, H), x = c.getContext('2d');
    const e = canvas(W, H), ex = e.getContext('2d');
    ex.fillStyle = '#000'; ex.fillRect(0, 0, W, H);
    x.fillStyle = color; x.fillRect(0, 0, W, H);
    noise(x, W, H, 1500 * doors, seed, 0.025);
    const led = (px, py, col, rad = 5) => {
      x.fillStyle = col; x.beginPath(); x.arc(px, py, rad, 0, Math.PI * 2); x.fill();
      ex.fillStyle = col; ex.beginPath(); ex.arc(px, py, rad + 1, 0, Math.PI * 2); ex.fill();
    };
    const dw = W / doors;
    for (let d = 0; d < doors; d++) {
      const x0 = d * dw;
      x.strokeStyle = 'rgba(40,40,40,0.7)'; x.lineWidth = 3; x.strokeRect(x0 + 6, 8, dw - 12, H - 16);
      // label
      x.fillStyle = '#f5f5f0'; x.fillRect(x0 + 40, 26, dw - 80, 26);
      x.fillStyle = '#111'; x.font = 'bold 16px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(d === 0 ? label.slice(0, 18) : kind.toUpperCase(), x0 + dw / 2, 39);
      if (kind === 'vfd') {
        if (d === 0) {
          // keypad
          x.fillStyle = '#26292c'; x.fillRect(x0 + 80, 120, 96, 130);
          x.fillStyle = '#7fb2a4'; x.fillRect(x0 + 88, 128, 80, 40); ex.fillStyle = '#3e7062'; ex.fillRect(x0 + 88, 128, 80, 40);
          x.fillStyle = '#16302a'; x.font = '10px monospace'; x.fillText('42.5 Hz', x0 + 128, 142); x.fillText('118 A', x0 + 128, 156);
          for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { x.fillStyle = '#555c61'; x.fillRect(x0 + 92 + i * 26, 178 + j * 22, 20, 16); }
          led(x0 + 70, 300, '#38e06b'); led(x0 + 110, 300, '#f0b429'); led(x0 + 150, 300, '#3a3a3a');
          x.fillStyle = '#111'; x.beginPath(); x.arc(x0 + 128, 360, 24, 0, Math.PI * 2); x.fill(); x.fillStyle = '#c0392b'; x.fillRect(x0 + 124, 336, 8, 48);
        }
        // louvre grilles bottom and top
        for (let i = 0; i < 10; i++) { x.fillStyle = 'rgba(30,30,30,0.6)'; x.fillRect(x0 + 50, 760 + i * 18, dw - 100, 8); }
        for (let i = 0; i < 4; i++) { x.fillStyle = 'rgba(30,30,30,0.5)'; x.fillRect(x0 + 50, 470 + i * 18, dw - 100, 8); }
      } else if (kind === 'pms' || kind === 'control' || kind === 'safety' || kind === 'marshalling' || kind === 'speed' || kind === 'igg' || kind === 'boiler' || kind === 'o2' || kind === 'avr' || kind === 'generic') {
        if (d === 0 && kind !== 'marshalling') {
          x.fillStyle = '#26292c'; x.fillRect(x0 + 40, 100, dw - 80, 120);
          x.fillStyle = '#20384a'; x.fillRect(x0 + 48, 108, dw - 96, 104); ex.fillStyle = '#1d5878'; ex.fillRect(x0 + 48, 108, dw - 96, 104);
        }
        const cols = ['#38e06b', '#f0b429', '#e04545', '#ffffff'];
        for (let i = 0; i < 4; i++) led(x0 + 60 + i * 40, 260, d === 0 && i === 0 ? cols[0] : '#3a3a3a', 7);
        led(x0 + 60, 260, '#38e06b', 7);
        if (kind === 'safety') led(x0 + 100, 260, '#f0b429', 7);
        for (let i = 0; i < 3; i++) { x.fillStyle = '#111'; x.beginPath(); x.arc(x0 + 70 + i * 58, 320, 13, 0, Math.PI * 2); x.fill(); x.fillStyle = '#ddd'; x.fillRect(x0 + 67 + i * 58, 308, 6, 24); }
        if (kind === 'safety' && d === 0) { x.fillStyle = '#e6b31e'; x.fillRect(x0 + 60, 360, dw - 120, 70); x.fillStyle = '#c0392b'; x.beginPath(); x.arc(x0 + dw / 2, 395, 24, 0, Math.PI * 2); x.fill(); }
        for (let i = 0; i < 4; i++) { x.fillStyle = 'rgba(30,30,30,0.45)'; x.fillRect(x0 + 60, 860 + i * 18, dw - 120, 8); }
      }
      // handle
      x.fillStyle = '#2a2a2a'; x.fillRect(x0 + dw - 28, 470, 10, 90);
    }
    return { map: toTex(c, { repeat: false }), emissive: toTex(e, { repeat: false }) };
  });
}

// Placeholder HMI screen (replaced at runtime by HMI renderMini textures).
export function screenTexture(kind = 'hmi', title = '', seed = 'x', w = 512, h = 320) {
  const c = canvas(w, h), x = c.getContext('2d');
  drawScreen(x, w, h, kind, title, seed);
  const t = toTex(c, { repeat: false });
  t.userData = { canvas: c };
  return t;
}

export function drawScreen(x, w, h, kind, title, seed) {
  const r = rng(seed + kind);
  x.fillStyle = '#c9ccce'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#3d4a57'; x.fillRect(0, 0, w, 22);
  x.fillStyle = '#ffffff'; x.font = 'bold 13px Arial'; x.textBaseline = 'middle'; x.textAlign = 'left';
  x.fillText((title || kind).toUpperCase().slice(0, 40), 8, 11);
  if (kind === 'cctv') {
    x.fillStyle = '#111'; x.fillRect(0, 22, w, h - 22);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const gx = i * w / 2 + 2, gy = 24 + j * (h - 24) / 2, gw = w / 2 - 4, gh = (h - 24) / 2 - 4;
      const g = x.createLinearGradient(0, gy, 0, gy + gh);
      g.addColorStop(0, '#6f8394'); g.addColorStop(0.5, '#4f5d66'); g.addColorStop(1, '#2d3134');
      x.fillStyle = g; x.fillRect(gx, gy, gw, gh);
      x.fillStyle = 'rgba(30,30,30,0.6)'; x.fillRect(gx + gw * 0.2, gy + gh * 0.45, gw * (0.2 + r() * 0.4), gh * 0.45);
      x.fillStyle = '#fff'; x.font = '10px monospace'; x.fillText('CAM ' + (i + j * 2 + 1), gx + 4, gy + 10);
    }
    return;
  }
  if (kind === 'tv') {
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#1d4f7a'); g.addColorStop(1, '#0e2236');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,255,255,0.85)'; x.font = 'bold 22px Arial'; x.fillText('IPTV  CH 1  NEWS', 16, h - 24);
    return;
  }
  // generic process / electrical overview
  x.strokeStyle = '#6d7780'; x.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const bx = 20 + i * (w - 40) / 4, by = 50;
    x.fillStyle = '#e3e5e6'; x.fillRect(bx, by, (w - 40) / 4 - 14, 60);
    x.strokeRect(bx, by, (w - 40) / 4 - 14, 60);
    x.fillStyle = '#26323d'; x.font = '11px Arial'; x.fillText('G' + (i + 1) + '  ' + Math.round(40 + r() * 40) + '%', bx + 6, by + 16);
    x.fillStyle = '#7d8a96'; x.fillRect(bx + 6, by + 30, ((w - 40) / 4 - 26) * (0.4 + r() * 0.5), 10);
  }
  x.strokeStyle = '#26323d'; x.lineWidth = 4;
  x.beginPath(); x.moveTo(20, 150); x.lineTo(w - 20, 150); x.stroke();
  for (let i = 0; i < 6; i++) { const fx = 40 + i * (w - 80) / 5; x.beginPath(); x.moveTo(fx, 150); x.lineTo(fx, 200); x.stroke(); x.strokeRect(fx - 10, 200, 20, 20); }
  x.fillStyle = '#7d8a96';
  for (let i = 0; i < 5; i++) x.fillRect(20, 240 + i * 14, w * (0.2 + r() * 0.6), 8);
}

// Analogue meter face for gauges
export function gaugeTexture(label = 'bar') {
  return once('gauge' + label, () => {
    const S = 128, c = canvas(S, S), x = c.getContext('2d');
    x.fillStyle = '#f4f2ea'; x.beginPath(); x.arc(64, 64, 62, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#222'; x.lineWidth = 2;
    for (let k = 0; k <= 10; k++) { const a = Math.PI * 0.75 + k * Math.PI * 1.5 / 10; x.beginPath(); x.moveTo(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46); x.lineTo(64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56); x.stroke(); }
    x.strokeStyle = '#c0392b'; x.lineWidth = 5; x.beginPath(); x.arc(64, 64, 52, Math.PI * 1.95, Math.PI * 2.25); x.stroke();
    x.strokeStyle = '#111'; x.lineWidth = 3; x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + Math.cos(-0.6) * 44, 64 + Math.sin(-0.6) * 44); x.stroke();
    x.fillStyle = '#111'; x.font = '14px Arial'; x.textAlign = 'center'; x.fillText(label, 64, 100);
    return toTex(c, { repeat: false });
  });
}

// Warning / safety sign plate
export function signTexture(text = 'DANGER', bg = '#e6b31e', fg = '#111') {
  return once('sign' + text + bg, () => {
    const W = 256, H = 128, c = canvas(W, H), x = c.getContext('2d');
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    x.strokeStyle = fg; x.lineWidth = 6; x.strokeRect(6, 6, W - 12, H - 12);
    x.fillStyle = fg; x.font = 'bold 34px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, W / 2, H / 2);
    return toTex(c, { repeat: false });
  });
}

export function clearTextureCache() {
  for (const v of texCache.values()) {
    if (v && v.isTexture) v.dispose();
    else if (v) for (const t of Object.values(v)) if (t && t.isTexture) t.dispose();
  }
  texCache.clear();
}
