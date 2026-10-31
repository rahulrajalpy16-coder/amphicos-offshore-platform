// Geometry kit: primitive helpers and a merging Batch so that every builder
// produces one mesh per material (few draw calls, shared materials).
// Local frame convention for builders: Y up, front face looks to +Z, width along X.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const KEEP = new Set(['position', 'normal', 'uv']);

export function normGeom(g) {
  for (const k of Object.keys(g.attributes)) if (!KEEP.has(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  }
  if (!g.index) {
    const n = g.attributes.position.count;
    const idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

// ---------- cached unit primitives ----------
const cache = new Map();
function cached(key, make) {
  let g = cache.get(key);
  if (!g) { g = normGeom(make()); cache.set(key, g); }
  return g;
}
export const unitBox = () => cached('box', () => new THREE.BoxGeometry(1, 1, 1));
export const unitCyl = (seg = 16, open = false) =>
  cached('cyl' + seg + open, () => new THREE.CylinderGeometry(1, 1, 1, seg, 1, open));
export const unitCone = (seg = 16, r2 = 0) =>
  cached('cone' + seg + ':' + r2, () => new THREE.CylinderGeometry(r2, 1, 1, seg, 1, false));
export const unitSphere = (seg = 16) =>
  cached('sph' + seg, () => new THREE.SphereGeometry(1, seg, Math.max(6, seg >> 1)));
export const unitHemi = (seg = 16) =>
  cached('hemi' + seg, () => new THREE.SphereGeometry(1, seg, Math.max(4, seg >> 2), 0, Math.PI * 2, 0, Math.PI / 2));
export const unitPlane = () => cached('plane', () => new THREE.PlaneGeometry(1, 1));
export const unitTorus = (seg = 24, tube = 0.1, arc = Math.PI * 2) =>
  cached('tor' + seg + ':' + tube + ':' + arc.toFixed(3), () => new THREE.TorusGeometry(1, tube, 6, seg, arc));

export function roundedBox(w, h, d, r) {
  const k = `rb:${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}:${r.toFixed(3)}`;
  return cached(k, () => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.01, h / 2.01, d / 2.01)));
}

// Box with UVs scaled to metres / tile so textures do not stretch.
export function tiledBox(w, h, d, tile = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z, 4 verts each
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const j = f * 4 + i;
      if (tile <= 0.5 && h < 0.1 && f !== 2 && f !== 3) uv.setXY(j, uv.getX(j) * dims[f][0] / tile, 0.004); // thin grating edges sample the solid bearing bar row
      else uv.setXY(j, uv.getX(j) * dims[f][0] / tile, uv.getY(j) * dims[f][1] / tile);
    }
  }
  return normGeom(g);
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export function trs(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, target = new THREE.Matrix4()) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return target.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
}

// ---------- Batch ----------
export class Batch {
  constructor() {
    this.lists = new Map(); // material -> geometry[]
    this.stack = [new THREE.Matrix4()];
  }
  get top() { return this.stack[this.stack.length - 1]; }
  push(m) { this.stack.push(this.top.clone().multiply(m)); return this; }
  pushT(x, y, z, ry = 0, rx = 0, rz = 0) { return this.push(trs(x, y, z, rx, ry, rz)); }
  pop() { if (this.stack.length > 1) this.stack.pop(); return this; }
  with(m, fn) { this.push(m); try { fn(this); } finally { this.pop(); } return this; }

  add(mat, geom, local) {
    if (!mat) throw new Error('Batch.add: missing material');
    const g = geom.clone();
    const m = local ? this.top.clone().multiply(local) : this.top;
    g.applyMatrix4(m);
    let list = this.lists.get(mat);
    if (!list) { list = []; this.lists.set(mat, list); }
    list.push(g);
    return this;
  }

  // centre-anchored box
  box(mat, x, y, z, w, h, d, ry = 0, rx = 0, rz = 0) {
    const tile = mat.userData && mat.userData.tile;
    if (tile) return this.add(mat, tiledBox(Math.max(w, 1e-4), Math.max(h, 1e-4), Math.max(d, 1e-4), tile), trs(x, y, z, rx, ry, rz));
    return this.add(mat, unitBox(), trs(x, y, z, rx, ry, rz, Math.max(w, 1e-4), Math.max(h, 1e-4), Math.max(d, 1e-4)));
  }
  // box whose base sits at y
  boxB(mat, x, y, z, w, h, d, ry = 0) { return this.box(mat, x, y + h / 2, z, w, h, d, ry); }
  rbox(mat, x, y, z, w, h, d, r = 0.02, ry = 0, rx = 0, rz = 0) {
    return this.add(mat, roundedBox(w, h, d, r), trs(x, y, z, rx, ry, rz));
  }
  tbox(mat, x, y, z, w, h, d, tile = 1, ry = 0) {
    return this.add(mat, tiledBox(w, h, d, tile), trs(x, y, z, 0, ry, 0));
  }
  // cylinder centred at (x,y,z), axis 'x' | 'y' | 'z'
  cyl(mat, x, y, z, r, len, axis = 'y', seg = 16, open = false) {
    const rx = axis === 'z' ? Math.PI / 2 : 0;
    const rz = axis === 'x' ? Math.PI / 2 : 0;
    return this.add(mat, unitCyl(seg, open), trs(x, y, z, rx, 0, rz, r, len, r));
  }
  cone(mat, x, y, z, r1, r2, len, axis = 'y', seg = 16) {
    const rx = axis === 'z' ? Math.PI / 2 : 0;
    const rz = axis === 'x' ? -Math.PI / 2 : 0;
    return this.add(mat, unitCone(seg, r2 / Math.max(r1, 1e-6)), trs(x, y, z, rx, 0, rz, r1, len, r1));
  }
  sphere(mat, x, y, z, r, seg = 16, sx = 1, sy = 1, sz = 1) {
    return this.add(mat, unitSphere(seg), trs(x, y, z, 0, 0, 0, r * sx, r * sy, r * sz));
  }
  // elliptical vessel head: hemisphere oriented along axis dir sign
  head(mat, x, y, z, r, depth, axis = 'x', sign = 1, seg = 16) {
    let rx = 0, rz = 0;
    if (axis === 'x') rz = -sign * Math.PI / 2;
    else if (axis === 'z') rx = sign * Math.PI / 2;
    else if (sign < 0) rx = Math.PI;
    return this.add(mat, unitHemi(seg), trs(x, y, z, rx, 0, rz, r, depth, r));
  }
  plane(mat, x, y, z, w, h, ry = 0, rx = 0) {
    return this.add(mat, unitPlane(), trs(x, y, z, rx, ry, 0, w, h, 1));
  }
  // cylinder between two points
  between(mat, a, b, r, seg = 10) {
    const dir = _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = dir.length();
    if (len < 1e-4) return this;
    dir.divideScalar(len);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new THREE.Vector3(r, len, r));
    return this.add(mat, unitCyl(seg), m);
  }
  // beam (square section) between two points
  beam(mat, a, b, w, h = w) {
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = dir.length();
    if (len < 1e-4) return this;
    dir.divideScalar(len);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new THREE.Vector3(w, len, h));
    return this.add(mat, unitBox(), m);
  }
  // pipe along a polyline with spherical elbows
  pipe(mat, pts, r, seg = 10, elbows = true) {
    for (let i = 0; i < pts.length - 1; i++) this.between(mat, pts[i], pts[i + 1], r, seg);
    if (elbows) for (let i = 1; i < pts.length - 1; i++) this.sphere(mat, pts[i][0], pts[i][1], pts[i][2], r * 1.04, seg);
    return this;
  }
  // flange pair / valve body markers along an axis
  flange(mat, x, y, z, r, axis = 'x') { return this.cyl(mat, x, y, z, r * 1.6, r * 0.5, axis, 12); }
  torus(mat, x, y, z, R, tube, rx = 0, ry = 0, seg = 24) {
    return this.add(mat, unitTorus(seg, tube / R), trs(x, y, z, rx, ry, 0, R, R, R));
  }
  geom(mat, g, local) { return this.add(mat, normGeom(g), local || new THREE.Matrix4()); }

  isEmpty() { return this.lists.size === 0; }

  // Merge into meshes, one per material.
  toGroup(name = 'batch', { cast = true, receive = true } = {}) {
    const group = new THREE.Group();
    group.name = name;
    for (const [mat, list] of this.lists) {
      if (!list.length) continue;
      const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!merged) { console.warn('[kit] merge failed for', name, mat.name); continue; }
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = name + ':' + (mat.name || 'mat');
      mesh.castShadow = cast && !mat.transparent && !mat.userData.noShadow;
      mesh.receiveShadow = receive;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
    }
    this.lists.clear();
    return group;
  }
}

// ---------- deterministic random ----------
export function rng(seedStr = 'x') {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  return function () {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- monotone cubic interpolation (Fritsch-Carlson) ----------
export function monotone(xs, ys) {
  const n = xs.length;
  if (n === 1) return () => ys[0];
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return function (x) {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
