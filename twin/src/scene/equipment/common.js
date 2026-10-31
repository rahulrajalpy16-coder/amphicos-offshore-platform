// Shared equipment builder context and helpers.
// Local frame: origin at the footprint centre on the floor, Y up, operating face looks to +Z,
// width W along X, depth D along Z, height H.
import * as THREE from 'three';
import { Batch, rng } from '../kit.js';
import { M, faceMat } from '../materials.js';

export function dimsOf(c) {
  const s = c.size || [1, 1, 1];
  const f = c.facing || '-y';
  const alongX = f === '+y' || f === '-y';
  return { W: alongX ? s[0] : s[1], D: alongX ? s[1] : s[0], H: s[2] };
}

export function facingRotation(f) {
  switch (f) {
    case '+x': return Math.PI / 2;
    case '-x': return -Math.PI / 2;
    case '+y': return Math.PI;
    case '-y': default: return 0;
  }
}

export class EquipCtx {
  constructor(c, env) {
    this.c = c;
    this.p = c.params || {};
    Object.assign(this, dimsOf(c));
    this.env = env;
    this.atlas = env.atlas;
    this.r = rng(c.id);
    this.b = new Batch();
    this.vmode = c.variant || 'both';
    this.vb = { legacy: new Batch(), retrofit: new Batch() };
    this.screens = [];
    this.ceilH = env.ceilH ?? 4;     // free height from component floor to the room ceiling
    this.children = env.children || []; // components mounted on this one
    this.siblings = env.siblings || [];  // components in the same parent_group
    this.toLocal = env.toLocal || ((p) => new THREE.Vector3(...p)); // ship point -> local frame
    this.extra = [];                // extra Object3D (animated parts)
  }
  has(type) { return this.children.some((k) => k.type === type) || this.siblings.some((k) => k.type === type); }
  // local X sign of a ship axis direction string such as '+x' (null if it is not along local X)
  localXSign(dir) {
    if (!dir) return null;
    const v = this.toLocal([1, 0, 0]).sub(this.toLocal([0, 0, 0]));
    const w = this.toLocal([0, 1, 0]).sub(this.toLocal([0, 0, 0]));
    const axis = dir[1] === 'x' ? v : w;
    const sign = dir[0] === '-' ? -1 : 1;
    if (Math.abs(axis.x) < 0.5) return null;
    return Math.sign(axis.x) * sign;
  }
  // Batch for a given variant, or null if this component never shows that variant.
  V(v) {
    if (this.vmode === 'both') return this.vb[v];
    return this.vmode === v ? this.b : null;
  }
  get retrofitShown() { return this.vmode !== 'legacy'; }
  // display screen (plane facing +Z in local frame, after ry/rx)
  screen(x, y, z, w, h, opts = {}) {
    this.screens.push({ x, y, z, w, h, ry: opts.ry || 0, rx: opts.rx || 0, kind: opts.kind || 'hmi', variant: opts.variant || null, title: opts.title || this.c.tag || this.c.name });
  }
  tag(x, y, z, w = 0.3, opts = {}) {
    const slot = this.atlas.get(opts.text || this.c.tag || this.c.id, opts.style || 'plate');
    const g = this.atlas.plateGeometry(slot, w);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(opts.rx || 0, opts.ry || 0, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
    (opts.batch || this.b).add(slot.mat, g, m);
  }
}

// Steel cabinet body with plinth, roof trim and optional textured front.
export function cabinet(B, { x = 0, z = 0, w, h, d, mat = 'cab', face = null, plinth = 0.1, handles = 1, roof = true, seams = 0 }) {
  B.box(M('black'), x, plinth / 2, z, w - 0.02, plinth, d - 0.04);
  B.rbox(M(mat), x, plinth + (h - plinth) / 2, z, w, h - plinth, d, 0.012);
  if (roof) B.box(M(mat), x, h + 0.015, z, w + 0.02, 0.03, d + 0.02);
  if (face) B.plane(face, x, plinth + (h - plinth) / 2, z + d / 2 + 0.004, w - 0.02, h - plinth - 0.02);
  for (let i = 1; i < seams; i++) B.box(M('black'), x - w / 2 + i * w / seams, plinth + (h - plinth) / 2, z + d / 2 + 0.002, 0.006, h - plinth - 0.02, 0.006);
  const n = handles === true ? 1 : handles;
  for (let i = 0; i < n; i++) {
    const hx = x - w / 2 + (i + 1) * w / n - 0.07;
    B.box(M('chrome'), hx, plinth + (h - plinth) * 0.5, z + d / 2 + 0.025, 0.025, 0.16, 0.03);
  }
}

export function faceFrom(texPair) { return faceMat(texPair.map, texPair.emissive); }

// Rubber insulating mat in front of a switchboard
export function mat(B, w, depth, z) { B.box(M('rubber'), 0, 0.006, z, w, 0.012, depth); }

export function led(B, x, y, z, color = 'ledGreen', r = 0.006) { B.sphere(M(color), x, y, z, r, 6); }

// mounting bracket to a wall behind (local -Z) or a pole
export function wallBracket(B, x, y, z, len = 0.25, mat = 'steelBare') {
  B.box(M(mat), x, y, z - len / 2, 0.06, 0.06, len);
  B.box(M(mat), x, y, z - len, 0.16, 0.2, 0.012);
}

export function gaugeRow(B, tex, x0, y, z, n, spacing, r = 0.05) {
  for (let i = 0; i < n; i++) {
    const x = x0 + i * spacing;
    B.cyl(M('black'), x, y, z + 0.01, r * 1.15, 0.02, 'z', 20);
    B.add(tex, new THREE.CircleGeometry(r, 24), new THREE.Matrix4().makeTranslation(x, y, z + 0.021));
  }
}

export function pushButton(B, x, y, z, color = 'eqRed', r = 0.018) {
  B.cyl(M('black'), x, y, z + 0.005, r * 1.4, 0.01, 'z', 12);
  B.cyl(M(color), x, y, z + 0.018, r, 0.018, 'z', 12);
}

export function eStop(B, x, y, z) {
  B.box(M('eqYellow'), x, y, z + 0.005, 0.09, 0.09, 0.01);
  B.cyl(M('eqRed'), x, y, z + 0.03, 0.032, 0.035, 'z', 16);
}

export function newBatch() { return new Batch(); }
