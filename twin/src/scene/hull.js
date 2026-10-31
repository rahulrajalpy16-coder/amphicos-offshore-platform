// Hull lofted from vessel.hull_offsets, main deck, bulwark, railings, deck markings,
// draft marks and waterline foam.
import * as THREE from 'three';
import { shipToWorld, T as T0 } from '../core/coords.js';
import * as C from '../core/coords.js';
import { Batch, monotone, normGeom } from './kit.js';
import { M } from './materials.js';
import { draftMarkTexture } from './textures.js';

// ---------- hull form function ----------
export function makeHullForm(vessel) {
  const off = vessel.hull_offsets;
  const D = vessel.depth || 28;
  const zl = off.z_levels.slice();
  const st = off.stations.slice().sort((a, b) => a.x - b.x);
  const xs = st.map((s) => s.x);
  const keelFn = st.length > 1 ? monotone(xs, st.map((s) => s.keel_z ?? 0)) : () => 0;
  const zFns = st.map((s) => monotone(zl, s.half_breadth));
  const X0 = xs[0], X1 = xs[xs.length - 1];
  const dx = 0.5, dz = 0.25;
  const nx = Math.round((X1 - X0) / dx) + 1, nz = Math.round(D / dz) + 1;
  const table = new Float32Array(nx * nz);
  for (let k = 0; k < nz; k++) {
    const z = k * dz;
    const vals = zFns.map((f) => Math.max(0, f(z)));
    const fx = monotone(xs, vals);
    for (let i = 0; i < nx; i++) table[k * nx + i] = Math.max(0, fx(X0 + i * dx));
  }
  function hb(x, z) {
    const zc = Math.min(Math.max(z, 0), D);
    const fx = (Math.min(Math.max(x, X0), X1) - X0) / dx, fz = zc / dz;
    const i = Math.min(nx - 2, Math.floor(fx)), k = Math.min(nz - 2, Math.floor(fz));
    const tx = fx - i, tz = fz - k;
    const a = table[k * nx + i], b = table[k * nx + i + 1], c = table[(k + 1) * nx + i], d = table[(k + 1) * nx + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }
  function keel(x) { return Math.max(0, Math.min(D - 1, keelFn(Math.min(Math.max(x, X0), X1)))); }
  return { hb, keel, X0, X1, D, xs };
}

function xSamples(X0, X1) {
  const out = [];
  let x = X0;
  while (x < X1 - 1e-6) {
    out.push(x);
    const dEnd = Math.min(x - X0, X1 - x);
    x += dEnd < 25 ? 0.6 : dEnd < 50 ? 1.5 : 3;
  }
  out.push(X1);
  return out;
}

// Converts ship coordinate arrays into world positions (via core/coords mapping).
const _w = new THREE.Vector3();
function W(x, y, z) { shipToWorld([x, y, z], _w); return [_w.x, _w.y, _w.z]; }
// direction (no translation) ship -> world
function Wd(x, y, z) {
  const o = shipToWorld([0, 0, 0], new THREE.Vector3());
  const p = shipToWorld([x, y, z], new THREE.Vector3());
  return p.sub(o);
}

export function buildHull(db) {
  const vessel = db.vessel;
  const T = C.T || T0;
  const form = makeHullForm(vessel);
  const { hb, keel, X0, X1, D } = form;
  const group = new THREE.Group();
  group.name = 'hull';
  const colliders = [];
  const XS = xSamples(X0, X1);
  const NZ = 40;
  const zRow = (k, x) => { const kz = keel(x); const s = k / NZ; return kz + (D - kz) * Math.pow(s, 1.35); };

  // ----- side shells -----
  for (const side of [-1, 1]) {
    const pos = [], uv = [], idx = [];
    const cols = XS.length, rows = NZ + 2;
    for (let i = 0; i < cols; i++) {
      const x = XS[i];
      // row 0: centreline at keel
      const kz = keel(x);
      pos.push(...W(x, 0, kz)); uv.push(x / 24, kz / D);
      for (let k = 0; k <= NZ; k++) {
        const z = zRow(k, x);
        const y = side * hb(x, z);
        pos.push(...W(x, y, z));
        uv.push((side > 0 ? -x : x) / 24, z / D);
      }
    }
    for (let i = 0; i < cols - 1; i++) {
      for (let j = 0; j < rows - 1; j++) {
        const a = i * rows + j, b = (i + 1) * rows + j, c = i * rows + j + 1, d = (i + 1) * rows + j + 1;
        if (side < 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, M('hull'));
    mesh.name = side < 0 ? 'hull:starboard' : 'hull:port';
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.collider = true;
    group.add(mesh); colliders.push(mesh);
  }

  // ----- transom and bow caps -----
  const cap = (x, dir) => {
    const kz = keel(x);
    const pos = [], uv = [], idx = [];
    const zs = [kz]; for (let k = 0; k <= NZ; k++) zs.push(zRow(k, x));
    const ys = [0, ...zs.slice(1).map((z) => hb(x, z))];
    for (let j = 0; j < zs.length; j++) {
      pos.push(...W(x, -ys[j], zs[j]), ...W(x, ys[j], zs[j]));
      uv.push(-ys[j] / 24, zs[j] / D, ys[j] / 24, zs[j] / D);
    }
    for (let j = 0; j < zs.length - 1; j++) {
      const sb = 2 * j, pt = 2 * j + 1, sb2 = 2 * (j + 1), pt2 = 2 * (j + 1) + 1;
      if (dir < 0) idx.push(sb, sb2, pt, pt, sb2, pt2); else idx.push(sb, pt, sb2, pt, pt2, sb2);
    }
    if (Math.max(...ys) < 0.05) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, M('hull'));
    mesh.name = dir < 0 ? 'hull:transom' : 'hull:bowcap';
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.collider = true;
    group.add(mesh); colliders.push(mesh);
  };
  cap(X0, -1); cap(X1, 1);

  // ----- main deck (flat at D, camber shown through normals) -----
  {
    const camber = (vessel.camber ?? 0.6) * 2.5;
    const pos = [], nor = [], uv = [], idx = [];
    const NY = 16;
    const DX = xSamples(X0, X1);
    for (let i = 0; i < DX.length; i++) {
      const x = DX[i], B = Math.max(0.01, hb(x, D));
      for (let j = 0; j <= NY; j++) {
        const y = -B + (2 * B * j) / NY;
        pos.push(...W(x, y, D));
        const slope = -2 * camber * y / ((vessel.beam / 2) ** 2);
        const n = Wd(0, -slope, 1).normalize();
        nor.push(n.x, n.y, n.z);
        uv.push(x / 12, y / 12);
      }
    }
    for (let i = 0; i < DX.length - 1; i++) for (let j = 0; j < NY; j++) {
      const a = i * (NY + 1) + j, b = (i + 1) * (NY + 1) + j, c = a + 1, d = b + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    // make sure faces look up (world +y)
    const tmpN = new THREE.Vector3();
    {
      const p = g.attributes.position;
      const a = new THREE.Vector3().fromBufferAttribute(p, idx[0]), b = new THREE.Vector3().fromBufferAttribute(p, idx[1]), c = new THREE.Vector3().fromBufferAttribute(p, idx[2]);
      tmpN.subVectors(b, a).cross(c.clone().sub(a));
      if (tmpN.y < 0) { for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; } g.setIndex(idx); }
    }
    const mesh = new THREE.Mesh(g, M('deck'));
    mesh.name = 'deck:main';
    mesh.receiveShadow = true; mesh.castShadow = false;
    mesh.userData.collider = true;
    group.add(mesh); colliders.push(mesh);
  }

  // ----- bulwark (forward), deck edge railing (elsewhere), markings, fittings -----
  const b = new Batch();
  const bwH = vessel.bulwark_height ?? 1.2;
  const bwStart = X1 - 55;
  const edge = XS.filter((x) => x >= X0 + 0.5 && x <= X1 - 0.3);
  for (const side of [-1, 1]) {
    // bulwark plate as a strip
    const pos = [], idx = [], uv = [];
    const bx = edge.filter((x) => x >= bwStart);
    bx.forEach((x, i) => {
      const y = side * hb(x, D);
      pos.push(...W(x, y, D), ...W(x, y, D + bwH));
      uv.push(x / 24, 0, x / 24, 0.05);
      if (i < bx.length - 1) { const a = 2 * i; if (side < 0) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    b.geom(M('hullTop'), g);
    // bulwark stays and capping rail
    for (let x = bwStart + 1; x < X1 - 1.5; x += 2.4) {
      const y = side * (hb(x, D) - 0.35);
      const p = W(x, y, D + bwH / 2);
      b.box(M('hullTop'), p[0], p[1], p[2], 0.04, bwH, 0.6);
    }
    for (let i = 0; i < bx.length - 1; i++) {
      const x0 = bx[i], x1 = bx[i + 1];
      b.between(M('hullTop'), W(x0, side * hb(x0, D), D + bwH), W(x1, side * hb(x1, D), D + bwH), 0.09, 6);
    }
    // railing posts and rails
    const rx = edge.filter((x) => x < bwStart + 0.5);
    let last = -1e9;
    for (const x of rx) {
      if (x - last < 1.8) continue;
      last = x;
      const y = side * (hb(x, D) - 0.08);
      const p0 = W(x, y, D), p1 = W(x, y, D + 1.1);
      b.between(M('white'), p0, p1, 0.03, 5);
    }
    for (const hgt of [0.38, 0.74, 1.1]) {
      const pts = [];
      let lx = -1e9;
      for (const x of rx) { if (x - lx < 3 && x !== rx[rx.length - 1]) continue; lx = x; pts.push(W(x, side * (hb(x, D) - 0.08), D + hgt)); }
      for (let i = 0; i < pts.length - 1; i++) b.between(M('white'), pts[i], pts[i + 1], hgt > 1 ? 0.03 : 0.018, 5);
    }
  }
  // stern railing across the transom
  {
    const x = X0 + 0.25, B = hb(x, D) - 0.1;
    for (let y = -B; y <= B; y += 1.8) b.between(M('white'), W(x, y, D), W(x, y, D + 1.1), 0.03, 5);
    for (const hgt of [0.38, 0.74, 1.1]) b.between(M('white'), W(x, -B, D + hgt), W(x, B, D + hgt), 0.025, 5);
  }

  // deck markings: green walkways with yellow edge lines along both sides
  const zM = D + 0.012;
  const wx0 = X0 + 22, wx1 = bwStart - 4;
  for (const side of [-1, 1]) {
    for (let x = wx0; x < wx1; x += 6) {
      const xe = Math.min(wx1, x + 6), xm = (x + xe) / 2;
      const Bm = hb(xm, D);
      const yc = side * (Bm - 3.2);
      const p = W(xm, yc, zM);
      b.box(M('deckGreen'), p[0], p[1], p[2], xe - x, 0.01, 1.4);
      for (const off of [-0.78, 0.78]) {
        const q = W(xm, yc + off, zM + 0.002);
        b.box(M('deckYellow'), q[0], q[1], q[2], xe - x, 0.01, 0.12);
      }
    }
  }
  // transverse yellow hatch lines at the crane and laydown areas omitted; centreline cargo piping
  {
    const px0 = X0 + 40, px1 = X1 - 45;
    const pipes = [[-1.6, 0.35, 'steel'], [-0.8, 0.3, 'steel'], [0, 0.42, 'steel'], [0.8, 0.3, 'red'], [1.6, 0.25, 'yellow'], [2.3, 0.2, 'steel']];
    for (const [yy, r, mat] of pipes) {
      const a = W(px0, yy, D + 0.9), c = W(px1, yy, D + 0.9);
      b.between(M(mat), a, c, r, 10);
    }
    for (let x = px0; x <= px1; x += 6) {
      const p = W(x, 0.35, D + 0.35);
      b.box(M('steelDark'), p[0], p[1], p[2], 0.3, 0.7, 5.6);
      const q = W(x, 0.35, D + 0.45);
      b.box(M('steelDark'), q[0], q[1] + 0.0, q[2], 0.4, 0.12, 5.8);
    }
    // cargo valves / manifolds at the midship crossover (both sides)
    for (const side of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const x = 150 + k * 3;
        const y = side * (hb(x, D) - 2.5);
        b.between(M('steel'), W(x, 0, D + 0.9), W(x, y, D + 0.9), 0.22, 10);
        const v = W(x, y * 0.92, D + 0.9);
        b.box(M('red'), v[0], v[1] + 0.35, v[2], 0.5, 0.25, 0.5);
      }
    }
  }
  // bollards and fairleads: stern and bow
  const bollard = (x, y) => {
    const p = W(x, y, D);
    for (const o of [-0.45, 0.45]) {
      b.cyl(M('steelDark'), p[0] + o, p[1] + 0.4, p[2], 0.2, 0.8, 'y', 12);
      b.cyl(M('steelDark'), p[0] + o, p[1] + 0.82, p[2], 0.28, 0.06, 'y', 12);
    }
    b.box(M('steelDark'), p[0], p[1] + 0.05, p[2], 1.6, 0.1, 0.7);
  };
  for (const side of [-1, 1]) {
    for (const x of [X0 + 4, X0 + 12, X1 - 18, X1 - 30]) bollard(x, side * (hb(x, D) - 1.4));
  }
  // mooring winches near stern (context)
  for (const side of [-1, 1]) {
    const p = W(X0 + 8, side * 9, D);
    b.box(M('steelDark'), p[0], p[1] + 0.4, p[2], 3.2, 0.8, 2.2);
    b.cyl(M('steelBlue'), p[0], p[1] + 1.4, p[2], 0.9, 2.4, 'z', 20);
    b.cyl(M('steelDark'), p[0], p[1] + 1.4, p[2], 1.25, 0.12, 'z', 20);
    b.box(M('steelBlue'), p[0] + 1.9, p[1] + 1.0, p[2], 1.0, 1.4, 1.2);
  }
  const fittings = b.toGroup('deckfittings');
  group.add(fittings);

  // ----- draft marks (conformal strips, both sides) -----
  const z0 = Math.max(1, T - 6), z1 = Math.min(D - 2, T + 5);
  const markTex = draftMarkTexture(z0, z1);
  const markMat = new THREE.MeshBasicMaterial({ map: markTex, transparent: true, depthWrite: false, toneMapped: true, color: '#e8e8e0' });
  markMat.name = 'draftmarks';
  for (const x of [X0 + 3.5, (X0 + X1) / 2, X1 - 12]) {
    for (const side of [-1, 1]) {
      const pos = [], uv = [], idx = [];
      const rows = 24, w = 0.9;
      for (let k = 0; k <= rows; k++) {
        const z = z0 + (z1 - z0) * k / rows;
        const xa = side < 0 ? x : x + w, xb = side < 0 ? x + w : x;
        pos.push(...W(xa, side * (hb(xa, z) + 0.04), z), ...W(xb, side * (hb(xb, z) + 0.04), z));
        uv.push(0, k / rows, 1, k / rows);
        if (k < rows) { const a = 2 * k; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, markMat);
      m.material.side = THREE.DoubleSide;
      m.name = 'draftmarks';
      m.renderOrder = 2;
      group.add(m);
    }
  }

  // ----- waterline foam ring -----
  {
    const pos = [], uv = [], idx = [];
    const zw = T;
    const FX = xSamples(X0, X1);
    const ring = [];
    for (const x of FX) ring.push([x, -hb(x, zw)]);
    for (let i = FX.length - 1; i >= 0; i--) ring.push([FX[i], hb(FX[i], zw)]);
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const [x, y] = ring[i];
      const [xp, yp] = ring[(i - 1 + n) % n], [xn, yn] = ring[(i + 1) % n];
      let tx = xn - xp, ty = yn - yp; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      let nxv = ty, nyv = -tx;
      if (nxv * (x - 150) + nyv * y < 0) { nxv = -nxv; nyv = -nyv; }
      pos.push(...W(x, y, zw + 0.05), ...W(x + nxv * 4, y + nyv * 4, zw + 0.05));
      uv.push(i / 8, 0, i / 8, 1);
      const a = 2 * i, c = 2 * ((i + 1) % n);
      idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const x2 = c.getContext('2d');
    const grd = x2.createLinearGradient(0, 0, 0, 64);
    grd.addColorStop(0, 'rgba(255,255,255,0.85)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.25)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    x2.fillStyle = grd; x2.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 60; i++) { x2.fillStyle = 'rgba(0,0,0,0.25)'; x2.fillRect(Math.random() * 64, Math.random() * 30, 3, 2); }
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping;
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.6 }));
    m.name = 'foam'; m.renderOrder = 3;
    group.add(m);
  }

  return { group, colliders, form };
}
