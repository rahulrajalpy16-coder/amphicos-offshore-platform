// Topsides context builders, one per topsides[].kind. All built in world orientation
// (Y up) from the db box; static parts merged per material; animated parts returned.
import * as THREE from 'three';
import { boxToWorld, shipToWorld } from '../core/coords.js';
import { Batch, rng } from './kit.js';
import { M } from './materials.js';

const DECK_Y = () => shipToWorld([0, 0, 28]).y;

function frameOf(ts) {
  const wb = boxToWorld(ts.box);
  const c = wb.getCenter(new THREE.Vector3());
  const s = wb.getSize(new THREE.Vector3());
  return { wb, cx: c.x, cz: c.z, y0: wb.min.y, y1: wb.max.y, Lx: s.x, Lz: s.z, H: s.y };
}

// ---------- reusable pieces ----------
export function handrail(b, mat, pts, h = 1.1, post = 1.6) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], c = pts[i + 1];
    const len = Math.hypot(c[0] - a[0], c[2] - a[2]);
    const n = Math.max(1, Math.round(len / post));
    for (let k = 0; k <= n; k++) {
      if (k === n && i < pts.length - 2) continue;
      const t = k / n, x = a[0] + (c[0] - a[0]) * t, y = a[1] + (c[1] - a[1]) * t, z = a[2] + (c[2] - a[2]) * t;
      b.between(mat, [x, y, z], [x, y + h, z], 0.025, 5);
    }
    b.between(mat, [a[0], a[1] + h, a[2]], [c[0], c[1] + h, c[2]], 0.025, 5);
    b.between(mat, [a[0], a[1] + h * 0.5, a[2]], [c[0], c[1] + h * 0.5, c[2]], 0.018, 5);
  }
}

export function stairFlight(b, x, y, z, run, rise, width, dir = 'x', mat = M('yellow')) {
  // straight stair from (x,y,z) rising 'rise' over 'run' along +dir
  const steps = Math.max(3, Math.round(rise / 0.2));
  const sx = dir === 'x' ? 1 : 0, sz = dir === 'z' ? 1 : 0;
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    const px = x + sx * run * t, pz = z + sz * run * t, py = y + rise * (i + 1) / steps;
    b.box(M('grating'), px, py, pz, dir === 'x' ? run / steps : width, 0.04, dir === 'x' ? width : run / steps);
  }
  for (const o of [-width / 2, width / 2]) {
    const ox = dir === 'z' ? o : 0, oz = dir === 'x' ? o : 0;
    b.beam(mat, [x + ox, y, z + oz], [x + ox + sx * run, y + rise, z + oz + sz * run], 0.06, 0.2);
    b.between(mat, [x + ox, y + 1, z + oz], [x + ox + sx * run, y + rise + 1, z + oz + sz * run], 0.025, 5);
  }
}

// lattice between two points with square section, tapering (used by booms, flares)
export function lattice(b, mat, p0, p1, w0, w1, bays, up = [0, 1, 0], chord = 0.12, brace = 0.06) {
  const A = new THREE.Vector3(...p0), B = new THREE.Vector3(...p1);
  const ax = B.clone().sub(A); const len = ax.length(); ax.normalize();
  let u = new THREE.Vector3(...up); u.sub(ax.clone().multiplyScalar(u.dot(ax))).normalize();
  if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
  const v = new THREE.Vector3().crossVectors(ax, u).normalize();
  const corner = (t, i) => {
    const w = (w0 + (w1 - w0) * t) / 2;
    const su = i === 0 || i === 3 ? -1 : 1, sv = i < 2 ? -1 : 1;
    return A.clone().addScaledVector(ax, len * t).addScaledVector(u, su * w).addScaledVector(v, sv * w).toArray();
  };
  for (let i = 0; i < 4; i++) b.between(mat, corner(0, i), corner(1, i), chord, 6);
  for (let k = 0; k <= bays; k++) {
    const t = k / bays;
    for (let i = 0; i < 4; i++) b.between(mat, corner(t, i), corner(t, (i + 1) % 4), brace, 4);
    if (k < bays) {
      const t2 = (k + 1) / bays;
      for (let i = 0; i < 4; i++) b.between(mat, corner(k % 2 ? t : t2, i), corner(k % 2 ? t2 : t, (i + 1) % 4), brace, 4);
    }
  }
}

function hVessel(b, x, y, z, r, len, axis = 'x', mat = M('white')) {
  b.cyl(mat, x, y, z, r, len, axis, 24);
  const ax = axis === 'x' ? [1, 0, 0] : [0, 0, 1];
  b.head(mat, x + ax[0] * len / 2, y, z + ax[2] * len / 2, r, r * 0.5, axis, 1, 24);
  b.head(mat, x - ax[0] * len / 2, y, z - ax[2] * len / 2, r, r * 0.5, axis, -1, 24);
  // saddles
  for (const s of [-0.32, 0.32]) {
    const sx = x + ax[0] * len * s, sz = z + ax[2] * len * s;
    b.box(M('steelDark'), sx, y - r * 0.75, sz, axis === 'x' ? 0.4 : r * 1.6, r * 0.5 + 0.02, axis === 'x' ? r * 1.6 : 0.4);
  }
  // nozzles & manway
  b.cyl(mat, x + ax[0] * len * 0.15, y + r + 0.25, z + ax[2] * len * 0.15, r * 0.18, 0.6, 'y', 12);
  b.cyl(M('pipe'), x - ax[0] * len * 0.3, y + r + 0.35, z - ax[2] * len * 0.3, 0.22, 0.8, 'y', 10);
  b.cyl(M('steelDark'), x - ax[0] * len * 0.3, y + r + 0.78, z - ax[2] * len * 0.3, 0.36, 0.08, 'y', 12);
  b.cyl(M('pipe'), x + ax[0] * len * 0.4, y - r - 0.2, z + ax[2] * len * 0.4, 0.15, 0.5, 'y', 10);
  // ring stiffeners / welds
  for (let k = -2; k <= 2; k++) b.cyl(M('steel'), x + ax[0] * len * k / 5, y, z + ax[2] * len * k / 5, r * 1.01, 0.06, axis, 24);
}

function vVessel(b, x, y, z, r, h, mat = M('white'), platform = true) {
  b.cyl(mat, x, y + h / 2, z, r, h, 'y', 24);
  b.head(mat, x, y + h, z, r, r * 0.5, 'y', 1, 24);
  b.head(mat, x, y, z, r, r * 0.5, 'y', -1, 24);
  b.cyl(M('steelDark'), x, y - r * 0.5 - 0.4, z, r * 0.8, 0.8, 'y', 16);
  b.cyl(M('pipe'), x, y + h + r * 0.5 + 0.4, z, 0.2, 0.8, 'y', 10);
  for (let k = 1; k < 4; k++) b.cyl(M('pipe'), x + r + 0.25, y + h * k / 4, z, 0.14, 0.5, 'x', 8);
  if (platform && h > 6) {
    const py = y + h * 0.82;
    b.cyl(M('grating'), x, py, z, r + 1.0, 0.05, 'y', 24);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      b.between(M('yellow'), [x + Math.cos(a) * (r + 1), py, z + Math.sin(a) * (r + 1)], [x + Math.cos(a) * (r + 1), py + 1.1, z + Math.sin(a) * (r + 1)], 0.025, 4);
    }
    b.torus(M('yellow'), x, py + 1.1, z, r + 1, 0.03, Math.PI / 2, 0, 24);
    // cage ladder
    b.box(M('yellow'), x - r - 0.5, (y + py) / 2, z, 0.05, py - y, 0.5);
  }
}

function compressor(b, x, y, z, L, r) {
  b.box(M('steelDark'), x, y + 0.2, z, L, 0.4, 2.6);
  b.cyl(M('steelBlue'), x - L * 0.25, y + 0.4 + r, z, r, L * 0.42, 'x', 20); // motor
  for (let k = 0; k < 6; k++) b.cyl(M('steelBlue'), x - L * 0.25 + (k - 2.5) * L * 0.06, y + 0.4 + r, z, r * 1.08, 0.06, 'x', 20);
  b.box(M('steelDark'), x - L * 0.02, y + 0.4 + r, z, 0.6, r * 1.2, r * 1.2); // coupling guard
  b.cyl(M('steel'), x + L * 0.25, y + 0.4 + r * 0.9, z, r * 0.9, L * 0.35, 'x', 20); // compressor casing
  b.box(M('steel'), x + L * 0.25, y + 0.4 + r * 0.5, z, L * 0.3, r * 0.7, r * 2.0);
  b.cyl(M('pipe'), x + L * 0.18, y + 0.4 + r * 2.1, z, r * 0.35, r * 1.1, 'y', 14);
  b.cyl(M('pipe'), x + L * 0.34, y + 0.4 + r * 2.0, z, r * 0.28, r * 1.0, 'y', 14);
  b.box(M('cabGrey'), x - L * 0.45, y + 1.2, z + 1.0, 0.8, 1.6, 0.5); // local panel
}

function airCooler(b, x, y, z, L, W) {
  b.box(M('steel'), x, y + 0.6, z, L, 1.2, W);           // bundle
  b.box(M('steelDark'), x, y + 1.25, z, L + 0.2, 0.1, W + 0.2);
  const n = Math.max(1, Math.round(L / 4));
  for (let i = 0; i < n; i++) {
    const fx = x - L / 2 + (i + 0.5) * L / n;
    b.cyl(M('steelDark'), fx, y + 1.6, z, Math.min(W, L / n) * 0.42, 0.7, 'y', 24, true);
    b.cyl(M('black'), fx, y + 1.5, z, Math.min(W, L / n) * 0.4, 0.05, 'y', 24);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(M('steel'), x + sx * L / 2, y - 1, z + sz * W / 2, 0.25, 2, 0.25);
}

function shellTube(b, x, y, z, r, L, n = 2) {
  for (let i = 0; i < n; i++) {
    const yy = y + r + i * (2 * r + 0.25);
    b.cyl(M('white'), x, yy, z, r, L, 'x', 18);
    b.cyl(M('steel'), x - L / 2 - 0.25, yy, z, r * 1.08, 0.5, 'x', 18);
    b.head(M('steel'), x - L / 2 - 0.5, yy, z, r * 1.08, r * 0.5, 'x', -1, 18);
    b.cyl(M('pipe'), x + L * 0.3, yy + r + 0.3, z, r * 0.25, 0.6, 'y', 10);
  }
  b.box(M('steelDark'), x - L * 0.3, y + r * 0.4, z, 0.3, r * 0.8, r * 1.8);
  b.box(M('steelDark'), x + L * 0.3, y + r * 0.4, z, 0.3, r * 0.8, r * 1.8);
}

function turbinePackage(b, x, y, z, L, W, H, stackTop) {
  b.box(M('steelDark'), x, y + 0.25, z, L + 0.6, 0.5, W + 0.6);
  b.tbox(M('white'), x, y + 0.5 + H / 2, z, L, H, W, 2);
  // panel seams on enclosure
  for (let i = 1; i < 6; i++) b.box(M('steel'), x - L / 2 + i * L / 6, y + 0.5 + H / 2, z, 0.05, H, W + 0.02);
  // air intake filter house
  b.box(M('steel'), x - L * 0.3, y + 0.5 + H + 1.3, z, L * 0.3, 2.6, W * 1.1);
  b.box(M('steelDark'), x - L * 0.3, y + 0.5 + H + 1.3, z + W * 0.56, L * 0.28, 2.3, 0.1);
  // exhaust duct + stack (with WHRU)
  b.box(M('insul'), x + L * 0.35, y + 0.5 + H + 1.5, z, L * 0.22, 3.0, W * 0.7);
  b.cyl(M('insul'), x + L * 0.35, (y + 0.5 + H + 3 + stackTop) / 2, z, 1.0, stackTop - (y + 0.5 + H + 3), 'y', 20);
  b.cyl(M('sooty'), x + L * 0.35, stackTop + 0.1, z, 1.02, 0.25, 'y', 20);
  b.box(M('cabGrey'), x - L / 2 - 0.6, y + 1.3, z, 0.6, 1.8, 1.4);
}

function pumpSkid(b, x, y, z, L = 4, r = 0.4) {
  b.box(M('steelDark'), x, y + 0.15, z, L, 0.3, 1.2);
  b.cyl(M('steelBlue'), x - L * 0.2, y + 0.3 + r, z, r, L * 0.4, 'x', 16);
  b.cyl(M('red'), x + L * 0.25, y + 0.3 + r, z, r * 0.9, L * 0.25, 'x', 16);
  b.cyl(M('pipe'), x + L * 0.25, y + 0.3 + r * 2.2, z, r * 0.4, r * 1.4, 'y', 10);
}

function valve(b, x, y, z, r, axis = 'x') {
  b.cyl(M('steelDark'), x, y, z, r * 1.6, r * 1.2, axis, 10);
  b.cyl(M('steelDark'), x, y + r * 2, z, r * 0.25, r * 2, 'y', 6);
  b.torus(M('red'), x, y + r * 3, z, r * 1.2, r * 0.18, Math.PI / 2, 0, 12);
}

function profileOf(ts) {
  const s = ((ts.details && ts.details.profile) || ts.name + ' ' + ts.id).toLowerCase();
  if (/separ/.test(s)) return 'separation';
  if (/compress/.test(s)) return 'compression';
  if (/dehyd|glycol|teg/.test(s)) return 'dehydration';
  if (/power|turbine|gtg/.test(s)) return 'power';
  if (/water.?inj|inject|sulphate|deaer/.test(s)) return 'water';
  if (/oil.?treat|crude|coalesc|heat/.test(s)) return 'oil';
  if (/gas.?treat|sweet|amine|co2|membrane/.test(s)) return 'gastreat';
  if (/util|chem|air|nitrogen/.test(s)) return 'utilities';
  if (/metering|pig|manifold|riser|fluid/.test(s)) return 'manifold';
  if (/flare.?ko|knock/.test(s)) return 'flareko';
  return 'generic';
}

// ---------- module ----------
function buildModule(ts, b) {
  const f = frameOf(ts);
  const d = ts.details || {};
  const r = rng(ts.id);
  const deckY = DECK_Y();
  const levels = d.levels || Math.max(2, Math.min(4, Math.round(f.H / 6)));
  const lh = f.H / levels;
  const { cx, cz, y0, Lx, Lz } = f;
  b.pushT(cx, y0, cz);
  const hx = Lx / 2, hz = Lz / 2;
  // stools from main deck to module base
  const stoolH = y0 - deckY;
  if (stoolH > 0.3) {
    for (const sx of [-hx + 1, -hx / 3, hx / 3, hx - 1]) for (const sz of [-hz + 1, hz - 1]) {
      b.box(M('steelDark'), sx, -stoolH / 2, sz, 1.0, stoolH, 1.0);
      b.box(M('steelDark'), sx, -stoolH + 0.05, sz, 1.6, 0.1, 1.6);
    }
  }
  // columns grid
  const nbx = Math.max(2, Math.round(Lx / 7)), nbz = Math.max(1, Math.round(Lz / 7));
  const gx = (i) => -hx + i * Lx / nbx, gz = (j) => -hz + j * Lz / nbz;
  for (let i = 0; i <= nbx; i++) for (let j = 0; j <= nbz; j++) {
    const edge = i === 0 || i === nbx || j === 0 || j === nbz;
    if (!edge) continue;
    b.box(M('steel'), gx(i), f.H / 2, gz(j), 0.45, f.H, 0.45);
  }
  // levels: beams + floors
  for (let l = 0; l <= levels; l++) {
    const y = l * lh;
    for (let j = 0; j <= nbz; j++) b.box(M('steel'), 0, y - 0.3, gz(j), Lx, 0.6, 0.35);
    for (let i = 0; i <= nbx; i++) b.box(M('steel'), gx(i), y - 0.3, 0, 0.35, 0.6, Lz);
    if (l === 0) b.tbox(M('steelDark'), 0, y - 0.62, 0, Lx, 0.04, Lz, 4);
    else if (l < levels || d.roof_grating !== false) b.tbox(M('grating'), 0, y + 0.01, 0, Lx - 0.2, 0.04, Lz - 0.2, 0.5);
    if (l > 0) {
      handrail(b, M('yellow'), [[-hx, y, -hz], [hx, y, -hz], [hx, y, hz], [-hx, y, hz], [-hx, y, -hz]], 1.1, 2.0);
    }
  }
  // bracing on long faces (alternating bays)
  for (const z of [-hz, hz]) for (let i = 0; i < nbx; i += 2) for (let l = 0; l < levels; l++) {
    b.beam(M('steel'), [gx(i), l * lh, z], [gx(i + 1), (l + 1) * lh - 0.6, z], 0.22, 0.22);
  }
  for (const x of [-hx, hx]) for (let l = 0; l < levels; l++) {
    b.beam(M('steel'), [x, l * lh, -hz], [x, (l + 1) * lh - 0.6, hz], 0.22, 0.22);
  }
  // stair tower at a corner
  for (let l = 0; l < levels; l++) {
    const zz = -hz + 1.2;
    const xs = l % 2 === 0 ? -hx + 1.2 : -hx + 1.2 + Math.min(6, lh * 1.2);
    stairFlight(b, l % 2 === 0 ? -hx + 1.2 : -hx + 1.2 + Math.min(6, lh * 1.2), l * lh, zz, l % 2 === 0 ? Math.min(6, lh * 1.2) : -Math.min(6, lh * 1.2), lh, 1.0, 'x');
    void xs;
  }
  // equipment by profile
  const p = profileOf(ts);
  const lev = (l) => l * lh;
  const R = (a, b2) => a + r() * (b2 - a);
  const rows = Lz > 14 ? [-hz * 0.45, hz * 0.45] : [0];
  const runPipes = [];
  switch (p) {
    case 'separation': {
      for (const zr of rows) { const rad = Math.min(2.3, lh * 0.38, Lz / (rows.length * 2.4)); hVessel(b, R(-1, 1), lev(0) + rad + 0.6, zr, rad, Lx * 0.62); runPipes.push([zr, lev(0) + rad * 2 + 0.6]); }
      if (levels > 1) for (const zr of rows) shellTube(b, -hx * 0.4, lev(1) + 0.1, zr, Math.min(0.7, lh * 0.18), Lx * 0.35, 2);
      if (levels > 1) vVessel(b, hx * 0.55, lev(1) + 0.6, rows[rows.length - 1], Math.min(1.2, Lz * 0.1), lh * 0.9);
      if (levels > 2) for (const zr of rows) hVessel(b, hx * 0.2, lev(2) + 1.3, zr, 1.0, Lx * 0.3);
      break;
    }
    case 'compression': {
      for (const zr of rows) { compressor(b, -hx * 0.2, lev(0), zr, Math.min(14, Lx * 0.55), 1.0); vVessel(b, hx * 0.62, lev(0) + 1.2, zr, Math.min(1.3, Lz * 0.1), Math.min(f.H * 0.75, lh * 1.7), M('white'), true); }
      if (levels > 1) for (const zr of rows) shellTube(b, -hx * 0.3, lev(1) + 0.1, zr, 0.6, Lx * 0.4, 2);
      airCooler(b, 0, f.H + 1.2, 0, Lx * 0.8, Lz * 0.7);
      break;
    }
    case 'dehydration': {
      const rad = Math.min(1.8, Lz * 0.12);
      vVessel(b, hx * 0.45, lev(0) + 1.4, 0, rad, f.H + 8, M('white'), true);
      vVessel(b, -hx * 0.55, lev(0) + 1.2, rows[0], 0.9, f.H * 0.8);
      hVessel(b, -hx * 0.1, lev(0) + 1.4, rows[rows.length - 1], 1.1, Lx * 0.4);
      if (levels > 1) shellTube(b, -hx * 0.2, lev(1) + 0.1, rows[0], 0.5, Lx * 0.35, 2);
      if (levels > 1) vVessel(b, -hx * 0.2, lev(1) + 0.6, rows[rows.length - 1], 0.6, lh * 1.3, M('insul'));
      break;
    }
    case 'power': {
      const n = Math.max(1, Math.min(3, Math.round(Lz / 9)));
      for (let i = 0; i < n; i++) {
        const zz = -hz + (i + 0.5) * Lz / n;
        turbinePackage(b, -hx * 0.1, lev(levels - 1), zz, Math.min(18, Lx * 0.75), Math.min(5, Lz / n * 0.6), Math.min(5.5, lh * 0.85), f.H + 14);
      }
      if (levels > 1) for (const zr of rows) shellTube(b, 0, lev(0) + 0.1, zr, 0.6, Lx * 0.4, 2);
      break;
    }
    case 'water': {
      vVessel(b, hx * 0.6, lev(0) + 1.4, 0, Math.min(1.7, Lz * 0.12), f.H + 4, M('white'), true);
      for (let i = 0; i < 4; i++) pumpSkid(b, -hx * 0.6 + i * Lx * 0.18, lev(0), rows[0], 4, 0.45);
      for (let i = 0; i < 5; i++) vVessel(b, -hx * 0.6 + i * Lx * 0.12, lev(0) + 0.6, rows[rows.length - 1], 0.55, lh * 0.75, M('steelBlue'), false);
      if (levels > 1) hVessel(b, -hx * 0.2, lev(1) + 1.4, 0, 1.2, Lx * 0.45);
      break;
    }
    case 'oil': {
      for (const zr of rows) shellTube(b, -hx * 0.35, lev(0) + 0.1, zr, 0.75, Lx * 0.4, 2);
      hVessel(b, hx * 0.3, lev(0) + 2.0, 0, Math.min(2.0, lh * 0.33), Lx * 0.42, M('white'));
      if (levels > 1) for (const zr of rows) hVessel(b, 0, lev(1) + 1.3, zr, 1.1, Lx * 0.5);
      if (levels > 2) vVessel(b, hx * 0.6, lev(2) + 0.5, 0, 0.9, lh * 0.9);
      break;
    }
    case 'gastreat': {
      vVessel(b, hx * 0.5, lev(0) + 1.4, rows[0], 1.4, f.H + 4, M('white'), true);
      vVessel(b, hx * 0.15, lev(0) + 1.4, rows[rows.length - 1], 1.2, f.H + 1, M('white'), true);
      for (const zr of rows) shellTube(b, -hx * 0.45, lev(0) + 0.1, zr, 0.6, Lx * 0.3, 2);
      if (levels > 1) hVessel(b, -hx * 0.3, lev(1) + 1.2, 0, 1.0, Lx * 0.4);
      airCooler(b, -hx * 0.4, f.H + 1.2, 0, Lx * 0.4, Lz * 0.6);
      break;
    }
    case 'utilities': {
      for (let i = 0; i < 4; i++) vVessel(b, -hx * 0.7 + i * Lx * 0.15, lev(0) + 0.6, rows[0], 0.9, lh * 0.75, M(i % 2 ? 'white' : 'blue'), false);
      for (let i = 0; i < 3; i++) pumpSkid(b, -hx * 0.2 + i * Lx * 0.2, lev(0), rows[rows.length - 1], 3.5, 0.4);
      for (let i = 0; i < 6; i++) b.box(M('eqWhite'), hx * 0.55 + (i % 3) * 1.4, lev(0) + 0.65, rows[0] + Math.floor(i / 3) * 1.4, 1.2, 1.3, 1.2);
      if (levels > 1) { compressor(b, 0, lev(1), 0, Math.min(8, Lx * 0.4), 0.6); hVessel(b, hx * 0.45, lev(1) + 1.2, 0, 1.0, Lx * 0.3); }
      break;
    }
    case 'manifold': {
      for (let i = 0; i < 8; i++) { const zz = -hz + 1.5 + i * (Lz - 3) / 7; b.between(M('pipe'), [-hx + 1, lev(0) + 1.2, zz], [hx - 1, lev(0) + 1.2, zz], 0.3, 12); valve(b, -hx * 0.2, lev(0) + 1.2, zz, 0.3); valve(b, hx * 0.3, lev(0) + 1.2, zz, 0.3); }
      hVessel(b, 0, lev(0) + 2.6, 0, 0.9, Lx * 0.5);
      break;
    }
    case 'flareko': {
      hVessel(b, 0, lev(0) + 2.2, 0, Math.min(2.2, lh * 0.36), Lx * 0.7);
      pumpSkid(b, -hx * 0.5, lev(0), hz * 0.7, 3, 0.35);
      break;
    }
    default: {
      for (const zr of rows) hVessel(b, -hx * 0.2, lev(0) + 1.6, zr, 1.4, Lx * 0.5);
      vVessel(b, hx * 0.6, lev(0) + 1.2, 0, 1.1, f.H * 0.8);
      if (levels > 1) for (const zr of rows) shellTube(b, 0, lev(1) + 0.1, zr, 0.55, Lx * 0.35, 2);
    }
  }
  // piping runs along both long sides under each floor + risers, colour coded
  const pipeMats = [M('pipe'), M('pipe'), M('insul'), M('pipe'), M('yellow'), M('pipeDark'), M('insul'), M('red')];
  for (let l = 0; l < levels; l++) {
    for (const s of [-1, 1]) {
      const n = 4 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const pr = 0.12 + r() * 0.22;
        const yy = lev(l + 1) - 0.9 - k * 0.42;
        const zz = s * (hz - 0.6 - (k % 3) * 0.55);
        const mat = pipeMats[(k + l * 3 + (s > 0 ? 1 : 0)) % pipeMats.length];
        b.between(mat, [-hx + 0.3, yy, zz], [hx - 0.3, yy, zz], pr, 10);
        // drop to equipment at a random point
        if (r() > 0.4) {
          const xd = -hx * 0.8 + r() * Lx * 0.8, yb = lev(l) + 0.8 + r() * 1.5;
          const zIn = zz - s * (1.2 + r() * 2.5);
          b.pipe(mat, [[xd, yy, zz], [xd, yb, zz], [xd, yb, zIn]], pr * 0.8, 10);
          valve(b, xd, (yy + yb) / 2, zz, pr * 0.9, 'y');
        }
      }
    }
    // cable tray along one side
    b.box(M('steel'), 0, lev(l + 1) - 0.7, -hz + 0.25, Lx - 0.6, 0.12, 0.6);
  }
  // risers between levels
  for (let k = 0; k < 4; k++) {
    const xx = -hx + 1.5 + k * 1.0, zz = hz - 1.2;
    b.between(pipeMats[k], [xx, 0.2, zz], [xx, f.H - 0.5, zz], 0.18, 10);
  }
  // fire water ring main and deluge headers (red)
  b.pipe(M('red'), [[-hx + 0.4, 0.5, -hz + 0.4], [hx - 0.4, 0.5, -hz + 0.4], [hx - 0.4, 0.5, hz - 0.4], [-hx + 0.4, 0.5, hz - 0.4], [-hx + 0.4, 0.5, -hz + 0.4]], 0.12, 8);
  void runPipes;
  b.pop();
}

// ---------- pipe rack ----------
function buildPipeRack(ts, b) {
  const f = frameOf(ts);
  const d = ts.details || {};
  const deckY = DECK_Y();
  const along = f.Lx >= f.Lz ? 'x' : 'z';
  const L = along === 'x' ? f.Lx : f.Lz, W = along === 'x' ? f.Lz : f.Lx;
  const tiers = d.tiers || 3;
  const top = f.y1, bottom = Math.max(deckY + 1, f.y0);
  const P = (s, y, t) => along === 'x' ? [f.cx + s, y, f.cz + t] : [f.cx + t, y, f.cz + s];
  const spacing = d.bay || 6;
  const n = Math.max(2, Math.round(L / spacing));
  const tierY = (k) => bottom + (top - bottom) * (k + 1) / tiers - 0.3;
  for (let i = 0; i <= n; i++) {
    const s = -L / 2 + i * L / n;
    for (const t of [-W / 2 + 0.2, W / 2 - 0.2]) b.between(M('steel'), P(s, deckY, t), P(s, top, t), 0.22, 6);
    for (let k = 0; k < tiers; k++) b.beam(M('steel'), P(s, tierY(k), -W / 2), P(s, tierY(k), W / 2), 0.3, 0.45);
    if (i % 2 === 0) for (const t of [-W / 2 + 0.2, W / 2 - 0.2]) b.box(M('steelDark'), ...P(s, deckY + 0.05, t), 1.0, 0.1, 1.0);
  }
  for (let k = 0; k < tiers; k++) {
    for (const t of [-W / 2 + 0.2, W / 2 - 0.2]) b.beam(M('steel'), P(-L / 2, tierY(k), t), P(L / 2, tierY(k), t), 0.25, 0.3);
  }
  // pipes
  const r = rng(ts.id + 'p');
  const mats = [M('pipe'), M('insul'), M('pipe'), M('yellow'), M('pipeDark'), M('red'), M('green'), M('pipe'), M('insul')];
  for (let k = 0; k < tiers - (d.cable_tier === false ? 0 : 1); k++) {
    let t = -W / 2 + 0.5;
    let idx = 0;
    while (t < W / 2 - 0.5) {
      const pr = 0.12 + r() * (k === 0 ? 0.5 : 0.3);
      if (t + pr * 2 > W / 2 - 0.4) break;
      const y = tierY(k) + 0.23 + pr;
      const mat = mats[(idx + k * 2) % mats.length];
      b.between(mat, P(-L / 2 + 0.3, y, t + pr), P(L / 2 - 0.3, y, t + pr), pr, pr > 0.3 ? 16 : 10);
      // pipe shoes and expansion loop markers
      for (let s = -L / 2 + 3; s < L / 2; s += spacing * 2) b.box(M('steelDark'), ...P(s, tierY(k) + 0.23 + 0.06, t + pr), 0.3, 0.12, pr * 1.4);
      t += pr * 2 + 0.25 + r() * 0.3;
      idx++;
    }
  }
  // top tier: cable trays (several) with cables
  if (d.cable_tier !== false) {
    const y = tierY(tiers - 1) + 0.25;
    for (let i = 0; i < 3; i++) {
      const t = -W / 2 + 0.8 + i * (W - 1.6) / 2.5;
      b.box(M('steel'), ...P(0, y, t), along === 'x' ? L : 0.9, 0.12, along === 'x' ? 0.9 : L);
      b.box(i === 1 ? M('orange') : M('pipeDark'), ...P(0, y + 0.1, t), along === 'x' ? L : 0.75, 0.08, along === 'x' ? 0.75 : L);
    }
  }
  // walkway on lowest tier
  b.box(M('grating'), ...P(0, tierY(0) + 0.23, 0), along === 'x' ? L : 0.9, 0.04, along === 'x' ? 0.9 : L);
}

// ---------- flare ----------
function buildFlare(ts, b, anim, group) {
  const f = frameOf(ts);
  const d = ts.details || {};
  const deckY = DECK_Y();
  const base = Math.max(deckY, f.y0);
  const top = f.y1;
  const H = top - base;
  const w0 = d.tower_base ? Math.min(...d.tower_base) : Math.max(3, Math.min(f.Lx, f.Lz) * 0.9), w1 = Math.max(1.6, w0 * 0.3);
  const lean = d.lean_deg ? THREE.MathUtils.degToRad(d.lean_deg) : 0;
  const tipX = f.cx + Math.sin(lean) * H * (d.lean_dir === '+x' ? 1 : -1) * 0;
  const p0 = [f.cx, base, f.cz], p1 = [tipX, top - 1.5, f.cz];
  const bays = Math.max(6, Math.round(H / 6));
  // lower part grey, upper part red/white obstruction banding
  lattice(b, M('steel'), p0, [p1[0], base + H * 0.66, p1[2]], w0, w0 + (w1 - w0) * 0.66, Math.round(bays * 0.66), [1, 0, 0], 0.18, 0.08);
  const segs = 4;
  for (let i = 0; i < segs; i++) {
    const t0 = 0.66 + 0.34 * i / segs, t1 = 0.66 + 0.34 * (i + 1) / segs;
    lattice(b, M(i % 2 ? 'white' : 'red'), [f.cx, base + H * t0, f.cz], [f.cx, base + H * t1 - 0.05, f.cz], w0 + (w1 - w0) * t0, w0 + (w1 - w0) * t1, 2, [1, 0, 0], 0.16, 0.07);
  }
  // flare header riser
  b.between(M('pipe'), [f.cx + 0.3, base, f.cz + 0.3], [f.cx + 0.3, top - 1.2, f.cz + 0.3], 0.55, 14);
  b.between(M('insul'), [f.cx - 0.5, base, f.cz - 0.3], [f.cx - 0.5, top - 1.6, f.cz - 0.3], 0.35, 12);
  // platforms
  for (const t of [0.35, 0.7, 0.98]) {
    const w = w0 + (w1 - w0) * t + 1.6, y = base + H * t;
    b.box(M('grating'), f.cx, y, f.cz, w, 0.05, w);
    handrail(b, M('yellow'), [[f.cx - w / 2, y, f.cz - w / 2], [f.cx + w / 2, y, f.cz - w / 2], [f.cx + w / 2, y, f.cz + w / 2], [f.cx - w / 2, y, f.cz + w / 2], [f.cx - w / 2, y, f.cz - w / 2]], 1.1, 1.5);
  }
  // tips (HP / LP) with flames; the LP tip burns smaller
  const nt = d.tip_count || 1;
  for (let k = 0; k < nt; k++) {
    const oz = nt > 1 ? (k - (nt - 1) / 2) * 1.6 : 0.3;
    b.cyl(M('steelDark'), f.cx + 0.3, top - 0.6, f.cz + oz, k ? 0.5 : 0.75, 1.4, 'y', 16);
    b.cyl(M('sooty'), f.cx + 0.3, top + 0.2, f.cz + oz, k ? 0.55 : 0.8, 0.3, 'y', 16);
    const flame = makeFlame((d.flame_scale || 1) * (k ? 0.55 : 1));
    flame.position.set(f.cx + 0.3, top + 0.3, f.cz + oz);
    group.add(flame);
    anim.push({ kind: 'flame', obj: flame });
  }
}

function makeFlame(scale = 1) {
  const g = new THREE.Group();
  g.name = 'flare-flame';
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uSeed: { value: 0 } },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv; uniform float uTime;
      void main() {
        vUv = uv;
        vec3 p = position;
        float sway = sin(uTime * 2.3 + p.y * 0.4) * 0.35 * uv.y + sin(uTime * 5.1 + p.y) * 0.12 * uv.y;
        p.x += sway - uv.y * uv.y * 2.2;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      varying vec2 vUv; uniform float uTime; uniform float uSeed;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main() {
        #include <logdepthbuf_fragment>
        vec2 uv = vUv;
        float x = (uv.x - 0.5) * 2.0;
        float width = mix(0.55, 0.05, pow(uv.y, 0.8));
        float body = 1.0 - smoothstep(width * 0.5, width, abs(x));
        float turb = n(vec2(uv.x * 4.0 + uSeed, uv.y * 6.0 - uTime * 3.0)) * 0.6 + n(vec2(uv.x * 9.0, uv.y * 12.0 - uTime * 5.0)) * 0.4;
        float a = body * smoothstep(1.0, 0.25, uv.y + turb * 0.35) * smoothstep(0.0, 0.06, uv.y);
        vec3 core = vec3(1.0, 0.86, 0.45), mid = vec3(1.0, 0.45, 0.08), edge = vec3(0.75, 0.18, 0.04);
        vec3 col = mix(core, mid, smoothstep(0.1, 0.5, uv.y + abs(x) * 0.6));
        col = mix(col, edge, smoothstep(0.35, 0.9, uv.y + turb * 0.25));
        gl_FragColor = vec4(col, a * 0.9);
      }`,
  });
  mat.toneMapped = false;
  const geo = new THREE.PlaneGeometry(6 * scale, 14 * scale, 1, 12);
  geo.translate(0, 7 * scale, 0);
  for (let i = 0; i < 2; i++) {
    const m = new THREE.Mesh(geo, i === 0 ? mat : mat.clone());
    m.rotation.y = i * Math.PI / 2;
    if (i) m.material.uniforms.uSeed.value = 3.7;
    m.renderOrder = 5;
    m.frustumCulled = false;
    g.add(m);
  }
  g.userData.mats = g.children.filter((c) => c.isMesh).map((c) => c.material);
  return g;
}

// ---------- crane ----------
function buildCrane(ts, b, anim, group) {
  const f = frameOf(ts);
  const d = ts.details || {};
  const deckY = DECK_Y();
  const pedTop = f.y1;
  const pr = Math.min(2.2, Math.max(1.2, Math.min(f.Lx, f.Lz) * 0.4));
  // pedestal
  b.cyl(M('yellow'), f.cx, (deckY + pedTop) / 2, f.cz, pr, pedTop - deckY, 'y', 24);
  b.cyl(M('yellow'), f.cx, deckY + 0.4, f.cz, pr * 1.4, 0.8, 'y', 24);
  b.cyl(M('steelDark'), f.cx, pedTop + 0.25, f.cz, pr * 1.15, 0.5, 'y', 28);
  // access ladder platform
  b.cyl(M('grating'), f.cx, pedTop - 3, f.cz, pr + 1.0, 0.05, 'y', 24);
  // slewing part in its own group (static here)
  let slew = THREE.MathUtils.degToRad(d.slew_deg ?? (f.cz > 0 ? 200 : 160));
  let boomLen = d.boom_length || 40;
  let luff = THREE.MathUtils.degToRad(d.boom_angle_deg ?? 38);
  let restTip = null;
  if (d.boom_box) {
    // boom in its rest, from the db boom envelope
    const bb = boxToWorld(d.boom_box);
    const bc = bb.getCenter(new THREE.Vector3());
    const far = Math.abs(bb.max.x - f.cx) > Math.abs(bb.min.x - f.cx) ? bb.max.x : bb.min.x;
    slew = far > f.cx ? 0 : Math.PI;
    boomLen = d.boom_length || Math.abs(far - f.cx);
    luff = Math.atan2(bc.y - (pedTop + 4.1), Math.max(1, Math.abs(far - f.cx) - 2.6));
    restTip = new THREE.Vector3(far, bc.y, bc.z);
  } else if (/forward|aft/.test(d.boom_rest_heading || '')) slew = /forward/.test(d.boom_rest_heading) ? 0 : Math.PI;
  const cs = new Batch();
  // machinery house
  cs.box(M('white'), 0, 2.2, 0, 7.5, 3.4, 4.2);
  cs.box(M('steelDark'), -0.5, 0.45, 0, 8, 0.5, 4.6);
  cs.box(M('white'), -2.6, 4.3, 0, 2.2, 0.8, 4.0);
  // operator cab
  cs.box(M('yellow'), 3.0, 2.5, 2.6, 2.2, 2.6, 1.8);
  cs.box(M('bridgeGlass'), 4.12, 2.8, 2.6, 0.05, 1.6, 1.6);
  cs.box(M('bridgeGlass'), 3.0, 2.8, 3.52, 2.0, 1.6, 0.05);
  // A-frame gantry
  for (const z of [-1.8, 1.8]) {
    cs.between(M('yellow'), [-3.2, 3.9, z], [-0.8, 10, z * 0.4], 0.22, 8);
    cs.between(M('yellow'), [1.8, 3.9, z], [-0.8, 10, z * 0.4], 0.22, 8);
  }
  cs.between(M('yellow'), [-0.8, 10, -0.8], [-0.8, 10, 0.8], 0.25, 8);
  // boom heel and lattice boom
  const heel = [2.6, 3.6, 0];
  const tip = [heel[0] + Math.cos(luff) * boomLen, heel[1] + Math.sin(luff) * boomLen, 0];
  lattice(cs, M('yellow'), heel, tip, 2.2, 0.8, Math.round(boomLen / 3), [0, 1, 0], 0.13, 0.055);
  cs.box(M('yellow'), tip[0], tip[1], 0, 1.4, 1.0, 1.2);
  cs.cyl(M('steelDark'), tip[0] + 0.5, tip[1], 0, 0.6, 1.0, 'z', 16);
  // luffing wires and hook
  cs.between(M('black'), [-0.8, 10, 0], tip, 0.04, 4);
  cs.between(M('black'), [-0.8, 10, 0.3], [tip[0] - 0.3, tip[1], 0.3], 0.04, 4);
  const hookY = tip[1] - Math.min(tip[1] - 4, 18);
  cs.between(M('black'), [tip[0] + 0.6, tip[1] - 0.5, 0], [tip[0] + 0.6, hookY + 1, 0], 0.03, 4);
  cs.box(M('eqOrange'), tip[0] + 0.6, hookY + 0.5, 0, 0.8, 1.2, 0.5);
  cs.torus(M('steelDark'), tip[0] + 0.6, hookY - 0.2, 0, 0.35, 0.08, 0, 0, 12);
  const g = cs.toGroup('crane-slew:' + ts.id);
  g.position.set(f.cx, pedTop + 0.5, f.cz);
  g.rotation.y = slew;
  group.add(g);
  // boom rest support under the boom tip
  if (restTip) {
    const rx = restTip.x - Math.sign(restTip.x - f.cx) * 1.5, rz = restTip.z;
    b.between(M('yellow'), [rx, deckY, rz], [rx, restTip.y - 1.0, rz], 0.25, 10);
    b.box(M('yellow'), rx, restTip.y - 0.95, rz, 0.6, 0.2, 2.6);
    for (const s2 of [-1, 1]) b.box(M('yellow'), rx, restTip.y - 0.55, rz + s2 * 1.2, 0.2, 0.8, 0.12);
    b.box(M('steelDark'), rx, deckY + 0.05, rz, 1.4, 0.1, 1.4);
  }
}

// ---------- turret ----------
function buildTurret(ts, b, anim, group, ctx) {
  const f = frameOf(ts);
  const d = ts.details || {};
  const deckY = DECK_Y();
  const dia = d.turret_diameter || d.diameter;
  const R = (dia ? dia / 2 : Math.min(f.Lx, f.Lz) / 2) || 7;
  const external = d.type === 'external';
  const tc = d.turret_centre ? shipToWorld([d.turret_centre[0], d.turret_centre[1], 28]) : null;
  const cx = tc ? tc.x : f.cx, cz = tc ? tc.z : f.cz;
  // turret casing above deck with structural rings
  const topY = Math.max(f.y1, deckY + 10);
  b.cyl(M('steel'), cx, deckY + 1.0, cz, R + 1.2, 2.0, 'y', 40);
  b.cyl(M('steelDark'), cx, deckY + 2.1, cz, R + 1.6, 0.2, 'y', 40);
  // gantry tower: 4 legs + 3 decks
  const gw = R * 1.3;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.between(M('yellow'), [cx + sx * gw / 2, deckY + 2.2, cz + sz * gw / 2], [cx + sx * gw * 0.35, topY, cz + sz * gw * 0.35], 0.3, 8);
  for (const t of [0.35, 0.68, 1.0]) {
    const y = deckY + 2.2 + (topY - deckY - 2.2) * t, w = gw * (1 - 0.3 * t);
    b.box(M('grating'), cx, y, cz, w + 1, 0.06, w + 1);
    for (const s of [-1, 1]) {
      b.beam(M('yellow'), [cx - w / 2, y - 0.2, cz + s * w / 2], [cx + w / 2, y - 0.2, cz + s * w / 2], 0.25, 0.35);
      b.beam(M('yellow'), [cx + s * w / 2, y - 0.2, cz - w / 2], [cx + s * w / 2, y - 0.2, cz + w / 2], 0.25, 0.35);
    }
    handrail(b, M('yellow'), [[cx - (w + 1) / 2, y, cz - (w + 1) / 2], [cx + (w + 1) / 2, y, cz - (w + 1) / 2], [cx + (w + 1) / 2, y, cz + (w + 1) / 2], [cx - (w + 1) / 2, y, cz + (w + 1) / 2], [cx - (w + 1) / 2, y, cz - (w + 1) / 2]], 1.1, 1.8);
  }
  // swivel stack
  const swTop = d.swivel_stack_top_z ? shipToWorld([0, 0, d.swivel_stack_top_z]).y : topY;
  for (let i = 0; i < 5; i++) {
    const y = deckY + 2.4 + i * (swTop - deckY - 3) / 5;
    b.cyl(M('white'), cx, y + 0.9, cz, 1.6 - i * 0.12, 1.6, 'y', 24);
    b.cyl(M('steelDark'), cx, y + 1.75, cz, 1.75 - i * 0.12, 0.12, 'y', 24);
  }
  // risers from turret into manifold (pipes rising and turning aft)
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    const px = cx + Math.cos(a) * (R * 0.6), pz = cz + Math.sin(a) * (R * 0.6);
    b.pipe(M(i % 2 ? 'pipe' : 'insul'), [[px, deckY + 2, pz], [px, deckY + 6 + i * 0.4, pz], [cx - R - 6, deckY + 6 + i * 0.4, cz + (i - 2.5) * 0.9]], 0.25, 10);
  }
  // chain table / mooring lines
  const chainY = external ? deckY - 4 : (d.chain_table_z != null ? shipToWorld([0, 0, d.chain_table_z]).y : shipToWorld([0, 0, 0]).y + 1);
  if (external) {
    b.cyl(M('steelDark'), cx, chainY, cz, R + 0.5, 2, 'y', 32);
    b.box(M('steelDark'), cx - R - 3, chainY + 2, cz, 6, 3, R * 1.6);
  }
  const bundles = d.mooring_groups || d.mooring_bundles || 3;
  const per = d.lines_per_bundle || Math.max(1, Math.round((d.mooring_lines || 9) / bundles));
  const lineMat = M('chain');
  const lines = [];
  for (let k = 0; k < bundles; k++) {
    const base = (d.bundle_heading_deg || 0) * Math.PI / 180 + k * Math.PI * 2 / bundles;
    for (let j = 0; j < per; j++) {
      const a = base + (j - (per - 1) / 2) * 0.09;
      const dir = [Math.cos(a), Math.sin(a)];
      const pts = [];
      const start = [cx + dir[0] * (R + 0.4), chainY - 0.5, cz + dir[1] * (R + 0.4)];
      const reach = 650, depth = 900;
      for (let s = 0; s <= 40; s++) {
        const t = s / 40;
        const rr = reach * t;
        const yy = start[1] - (depth * (Math.cosh(2.2 * t) - 1) / (Math.cosh(2.2) - 1)) * 0.25 - t * 60;
        pts.push([start[0] + dir[0] * rr, yy, start[2] + dir[1] * rr]);
      }
      lines.push(pts);
      for (let s = 0; s < pts.length - 1; s++) b.between(lineMat, pts[s], pts[s + 1], s < 4 ? 0.14 : 0.1, 5);
    }
  }
  if (!external) {
    // turret moonpool shaft visible through x-ray (simple cylinder inside the hull)
    const kY = shipToWorld([0, 0, 0]).y;
    b.cyl(M('steelDark'), cx, (kY + deckY) / 2, cz, R, deckY - kY, 'y', 32, true);
  }
  void anim; void group; void ctx;
}

// ---------- riser balcony ----------
function buildRiserBalcony(ts, b) {
  const f = frameOf(ts);
  const deckY = DECK_Y();
  const y = Math.max(deckY, f.y0);
  const out = f.cz > 0 ? 1 : -1; // outboard direction in world z
  b.box(M('grating'), f.cx, y, f.cz, f.Lx, 0.08, f.Lz);
  for (let x = -f.Lx / 2; x <= f.Lx / 2; x += 4) {
    b.beam(M('steel'), [f.cx + x, y - 0.4, f.cz - out * f.Lz / 2], [f.cx + x, y - 0.4, f.cz + out * f.Lz / 2], 0.3, 0.5);
    b.beam(M('steel'), [f.cx + x, y - 0.6, f.cz + out * f.Lz / 2], [f.cx + x, y - 4, f.cz - out * f.Lz / 2], 0.25, 0.25);
  }
  const zo = f.cz + out * f.Lz / 2;
  handrail(b, M('yellow'), [[f.cx - f.Lx / 2, y, zo], [f.cx + f.Lx / 2, y, zo]], 1.1, 1.8);
  // risers and bend stiffeners down the hull side into the sea
  const n = Math.max(4, Math.round(f.Lx / 3));
  for (let i = 0; i < n; i++) {
    const x = f.cx - f.Lx / 2 + (i + 0.5) * f.Lx / n;
    const z = f.cz + out * (f.Lz / 2 - 1);
    b.between(M(i % 3 === 0 ? 'yellow' : 'hose'), [x, y + 1.5, z], [x, -60, z], 0.22, 10);
    b.cone(M('yellow'), x, -2, z, 0.5, 0.25, 4, 'y', 12);
    b.cyl(M('steelDark'), x, y + 1.6, z, 0.4, 0.5, 'y', 12);
    b.pipe(M('pipe'), [[x, y + 1.8, z], [x, y + 3, z], [x, y + 3, f.cz - out * f.Lz]], 0.2, 8);
  }
}

// ---------- helideck ----------
function buildHelideck(ts, b) {
  const f = frameOf(ts);
  const D = Math.min(f.Lx, f.Lz);
  const y = f.y1;
  const geo = new THREE.CylinderGeometry(D / 2, D / 2, 0.4, 8, 1);
  geo.rotateY(Math.PI / 8);
  // re-map top cap UVs to deck texture
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getY(i) - 0.2) < 1e-4) uv.setXY(i, pos.getX(i) / D + 0.5, -pos.getZ(i) / D + 0.5);
  }
  const m = new THREE.Matrix4().makeTranslation(f.cx, y - 0.2, f.cz);
  b.add(M('heli'), geo, m);
  // perimeter net (angled outward) and lights
  for (let i = 0; i < 8; i++) {
    const a0 = Math.PI / 8 + i * Math.PI / 4, a1 = a0 + Math.PI / 4;
    const r0 = D / 2 * Math.cos(Math.PI / 8);
    const am = (a0 + a1) / 2;
    const len = D * Math.sin(Math.PI / 8);
    const cx2 = f.cx + Math.cos(am) * (r0 + 0.75), cz2 = f.cz - Math.sin(am) * (r0 + 0.75);
    b.box(M('net'), cx2, y - 0.05, cz2, len, 0.03, 1.5, am - Math.PI / 2 + Math.PI, 0.08 * 0, 0);
    for (let k = 0; k < 3; k++) {
      const t = (k + 0.5) / 3;
      const ax = f.cx + Math.cos(a0) * D / 2 + (Math.cos(a1) - Math.cos(a0)) * D / 2 * t;
      const az = f.cz - Math.sin(a0) * D / 2 - (Math.sin(a1) - Math.sin(a0)) * D / 2 * t;
      b.sphere(M(k === 1 ? 'ledAmber' : 'ledGreen'), ax, y + 0.08, az, 0.12, 6);
    }
  }
  // support truss down to the structure below
  const sm = /z\s*([0-9.]+)/.exec((ts.details && ts.details.support) || '');
  const base = sm ? shipToWorld([0, 0, parseFloat(sm[1])]).y : f.y0;
  if (y - base > 1) {
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + i * Math.PI / 4;
      const px = f.cx + Math.cos(a) * D * 0.4, pz = f.cz - Math.sin(a) * D * 0.4;
      b.between(M('steel'), [px, y - 0.4, pz], [f.cx + Math.cos(a) * D * 0.2, base, f.cz - Math.sin(a) * D * 0.2], 0.25, 6);
    }
    b.cyl(M('steel'), f.cx, (y + base) / 2, f.cz, 1.0, y - base, 'y', 12);
  }
  // windsock pole
  b.between(M('steel'), [f.cx + D / 2 * 0.9, y, f.cz + D * 0.25], [f.cx + D / 2 * 0.9, y + 4, f.cz + D * 0.25], 0.05, 6);
  b.cone(M('orange'), f.cx + D / 2 * 0.9 - 0.9, y + 3.8, f.cz + D * 0.25, 0.3, 0.12, 1.8, 'x', 10);
}

// ---------- lifeboat & davit ----------
function lifeboat(b, x, y, z, L = 8.5, along = 'x') {
  const W = L * 0.36;
  const g = new THREE.SphereGeometry(1, 24, 12);
  const m1 = new THREE.Matrix4().compose(new THREE.Vector3(x, y + W * 0.35, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, along === 'x' ? 0 : Math.PI / 2, 0)), new THREE.Vector3(L / 2, W * 0.55, W / 2));
  b.add(M('orange'), g, m1);
  const m2 = new THREE.Matrix4().compose(new THREE.Vector3(x, y + W * 0.62, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, along === 'x' ? 0 : Math.PI / 2, 0)), new THREE.Vector3(L * 0.42, W * 0.42, W * 0.44));
  b.add(M('orange'), g, m2);
  b.box(M('white'), x, y + W * 0.95, z, along === 'x' ? L * 0.18 : W * 0.4, 0.4, along === 'x' ? W * 0.4 : L * 0.18);
  // windows band
  b.box(M('glass'), x, y + W * 0.78, z, along === 'x' ? L * 0.5 : W * 0.86, 0.18, along === 'x' ? W * 0.86 : L * 0.5);
}

function davit(b, x, y, z, L, out) {
  // gravity davit frames at both ends of the boat, out = world z dir to the sea
  for (const s of [-1, 1]) {
    const xx = x + s * L * 0.38;
    b.beam(M('white'), [xx, y, z - out * 1.5], [xx, y + 4.8, z + out * 0.6], 0.3, 0.45);
    b.beam(M('white'), [xx, y + 4.8, z + out * 0.6], [xx, y + 4.2, z + out * 2.2], 0.25, 0.4);
    b.between(M('black'), [xx, y + 4.2, z + out * 2.2], [xx, y + 2.2, z + out * 2.2], 0.025, 4);
  }
  b.box(M('steelDark'), x, y + 0.3, z - out * 1.5, L * 0.85, 0.6, 1.2);
  b.box(M('cabGrey'), x - L * 0.5, y + 0.8, z - out * 1.6, 1.0, 1.6, 0.8); // winch
}

function buildLifeboat(ts, b) {
  const f = frameOf(ts);
  const d = ts.details || {};
  const n = d.count || 1;
  const along = f.Lx >= f.Lz ? 'x' : 'z';
  const out = f.cz > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const L = d.length || Math.min(9, (along === 'x' ? f.Lx : f.Lz) / n * 0.85);
    const cx = along === 'x' ? f.cx - f.Lx / 2 + (i + 0.5) * f.Lx / n : f.cx;
    const cz = along === 'x' ? f.cz : f.cz - f.Lz / 2 + (i + 0.5) * f.Lz / n;
    const by = f.y0 + 1.8;
    lifeboat(b, cx, by, cz + out * 1.2, L, along);
    if (ts.kind === 'lifeboat' && d.davit !== false) davit(b, cx, f.y0, cz, L, out);
  }
  if (ts.kind === 'davit') davit(b, f.cx, f.y0, f.cz, f.Lx, out);
}

// ---------- offloading reel ----------
function buildOffloading(ts, b) {
  const f = frameOf(ts);
  const y = f.y0;
  const Rr = (ts.details && ts.details.reel_diameter) ? ts.details.reel_diameter / 2 : Math.min(f.H * 0.42, 3.2);
  const len = Math.min(f.Lz * 0.8, 8);
  b.box(M('steelBlue'), f.cx, y + 0.3, f.cz, f.Lx * 0.9, 0.6, f.Lz * 0.9);
  for (const s of [-1, 1]) {
    b.box(M('steelBlue'), f.cx, y + Rr + 0.7, f.cz + s * (len / 2 + 0.3), Rr * 1.2, Rr * 2 + 0.6, 0.4);
    b.cyl(M('steelBlue'), f.cx, y + Rr + 0.9, f.cz + s * (len / 2 + 0.1), Rr * 1.15, 0.2, 'z', 32);
  }
  b.cyl(M('steelDark'), f.cx, y + Rr + 0.9, f.cz, Rr * 0.5, len, 'z', 24);
  for (let l = 0; l < 6; l++) b.cyl(M('hose'), f.cx, y + Rr + 0.9, f.cz, Rr * (0.58 + l * 0.08), len * 0.96, 'z', 32);
  for (let k = 0; k < 10; k++) b.cyl(M('red'), f.cx, y + Rr + 0.9, f.cz - len / 2 + (k + 0.5) * len / 10, Rr * 1.0, 0.08, 'z', 32);
  // hose tail over the stern into the sea
  const sx = f.wb.min.x - 2;
  b.pipe(M('hose'), [[f.cx - Rr, y + Rr * 1.7, f.cz], [sx, y + 1.0, f.cz], [sx - 3, y - 8, f.cz], [sx - 6, -1.5, f.cz], [sx - 30, -1.0, f.cz]], 0.28, 12);
  for (let k = 0; k < 6; k++) b.cyl(M('orange'), sx - 6 - k * 4, -0.8, f.cz, 0.55, 0.9, 'x', 12); // floats
  // hawser winch
  b.cyl(M('steelBlue'), f.cx + f.Lx * 0.3, y + 1.3, f.cz + f.Lz * 0.3, 0.8, 2.2, 'z', 20);
}

// ---------- laydown ----------
function buildLaydown(ts, b) {
  const f = frameOf(ts);
  const y = Math.max(DECK_Y(), f.y0) + 0.015;
  for (const [x, z, w, d] of [[f.cx, f.cz - f.Lz / 2, f.Lx, 0.2], [f.cx, f.cz + f.Lz / 2, f.Lx, 0.2], [f.cx - f.Lx / 2, f.cz, 0.2, f.Lz], [f.cx + f.Lx / 2, f.cz, 0.2, f.Lz]]) b.box(M('deckYellow'), x, y, z, w, 0.01, d);
  const r = rng(ts.id);
  const mats = ['container1', 'container2', 'container3', 'eqOrange'];
  for (let i = 0; i < 4; i++) {
    const L = r() > 0.5 ? 6 : 3, W = 2.4, H = 2.5;
    const x = f.cx - f.Lx / 2 + 2 + (i % 2) * (f.Lx / 2), z = f.cz - f.Lz / 2 + 2 + Math.floor(i / 2) * (f.Lz / 2);
    if (x + L / 2 > f.cx + f.Lx / 2 || z + W > f.cz + f.Lz / 2) continue;
    b.box(M(mats[i % 4]), x + L / 2, y + H / 2, z + W / 2, L, H, W);
    for (let k = 0; k < Math.floor(L / 0.4); k++) b.box(M(mats[i % 4]), x + 0.2 + k * 0.4, y + H / 2, z + W + 0.02, 0.15, H * 0.92, 0.05);
  }
}

// ---------- vent mast ----------
function buildVentMast(ts, b) {
  const f = frameOf(ts);
  const base = Math.max(DECK_Y(), f.y0);
  b.cyl(M('pipe'), f.cx, (base + f.y1) / 2, f.cz, 0.5, f.y1 - base, 'y', 14);
  lattice(b, M('steel'), [f.cx, base, f.cz], [f.cx, f.y1 - 2, f.cz], 2.5, 1.0, Math.round((f.y1 - base) / 5), [1, 0, 0], 0.1, 0.05);
  b.cyl(M('sooty'), f.cx, f.y1 + 0.2, f.cz, 0.55, 0.4, 'y', 14);
}

// ---------- accommodation ----------
function facadeBlock(b, cx, y0, cz, w, h, d, opts = {}) {
  const wall = opts.wall || M('accom');
  const tile = 3;
  const mk = (W, H) => {
    const g = new THREE.PlaneGeometry(W, H);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * W / tile, uv.getY(i) * H / tile);
    return g;
  };
  const yc = y0 + h / 2;
  b.add(wall, mk(w, h), new THREE.Matrix4().makeTranslation(cx, yc, cz + d / 2));
  b.add(wall, mk(w, h), new THREE.Matrix4().makeRotationY(Math.PI).setPosition(cx, yc, cz - d / 2));
  b.add(wall, mk(d, h), new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(cx + w / 2, yc, cz));
  b.add(wall, mk(d, h), new THREE.Matrix4().makeRotationY(-Math.PI / 2).setPosition(cx - w / 2, yc, cz));
  b.box(M('accomPlain'), cx, y0 + h + 0.15, cz, w + 0.3, 0.3, d + 0.3);
  // internal deck plates every 3 m (seen in cutaway)
  for (let y = y0 + 3; y < y0 + h - 0.5; y += 3) b.box(M('accomTrim'), cx, y, cz, w - 0.1, 0.25, d - 0.1);
}

function buildAccommodation(ts, b) {
  const f = frameOf(ts);
  const d = ts.details || {};
  const decks = d.decks || Math.max(2, Math.round(f.H / 3));
  const dh = f.H / decks;
  // main block with stepped upper decks (slightly narrower)
  facadeBlock(b, f.cx, f.y0, f.cz, f.Lx, dh * decks, f.Lz);
  // external walkways and stair towers on both sides, deck edge railings at each level
  for (const s of [-1, 1]) {
    const z = f.cz + s * (f.Lz / 2 + 0.9);
    for (let k = 1; k <= decks; k++) {
      const y = f.y0 + k * dh;
      b.box(M('grating'), f.cx, y - 0.02, z, f.Lx, 0.06, 1.8);
      b.box(M('steel'), f.cx, y - 0.2, z + s * 0.85, f.Lx, 0.3, 0.12);
      handrail(b, M('white'), [[f.cx - f.Lx / 2, y, z + s * 0.9], [f.cx + f.Lx / 2, y, z + s * 0.9]], 1.1, 1.6);
      if (k < decks) stairFlight(b, f.cx - f.Lx / 2 + 1 + (k % 2) * 4, y - dh, z, 4, dh, 0.9, 'x', M('white'));
    }
  }
  // roof equipment: HVAC units, vents, life rafts canisters
  const r = rng(ts.id);
  const top = f.y0 + dh * decks + 0.3;
  for (let i = 0; i < 3; i++) {
    const x = f.cx - f.Lx * 0.3 + i * f.Lx * 0.25, z = f.cz + (r() - 0.5) * f.Lz * 0.4;
    b.box(M('superGrey'), x, top + 1, z, 4, 2, 2.5);
    b.cyl(M('steelDark'), x, top + 2.1, z, 0.7, 0.2, 'y', 16);
  }
  for (let i = 0; i < 6; i++) b.cyl(M('white'), f.cx - f.Lx / 2 + 1.5 + i * 1.2, f.y0 + dh * 2 + 0.6, f.cz + f.Lz / 2 + 0.6, 0.35, 1.2, 'x', 12);
}

// ---------- bridge ----------
function buildBridge(ts, b) {
  const f = frameOf(ts);
  const d = ts.details || {};
  const H = f.H;
  const fwd = d.facing === '-x' ? -1 : 1;
  const coreW = f.Lx, coreD = d.wing_span_y ? f.Lz : Math.min(f.Lz, d.house_width || f.Lz * 0.7);
  facadeBlock(b, f.cx, f.y0, f.cz, coreW, H * 0.98, coreD, { wall: M('accomPlain') });
  // inclined window band on the forward face
  const fx = f.cx + fwd * coreW / 2;
  const wy0 = f.y0 + H * 0.38, wy1 = f.y0 + H * 0.9;
  const tilt = 0.18 * fwd;
  b.box(M('bridgeGlass'), fx + fwd * 0.25, (wy0 + wy1) / 2, f.cz, 0.08, wy1 - wy0, coreD - 0.6, 0, 0, tilt);
  for (let i = 0; i <= 10; i++) b.box(M('accomTrim'), fx + fwd * 0.3, (wy0 + wy1) / 2, f.cz - coreD / 2 + 0.3 + i * (coreD - 0.6) / 10, 0.12, wy1 - wy0, 0.12, 0, 0, tilt);
  // side and aft windows
  for (const s of [-1, 1]) b.box(M('bridgeGlass'), f.cx, (wy0 + wy1) / 2, f.cz + s * (coreD / 2 + 0.03), coreW * 0.8, wy1 - wy0 - 0.4, 0.05);
  // sun visor overhang
  b.box(M('accomPlain'), fx + fwd * 0.8, f.y0 + H * 0.97, f.cz, 1.6, 0.2, coreD + 0.4);
  // bridge wings across the full box width
  const wingW = d.wing_span_y ? d.wing_span_y * 2 : f.Lz;
  if (wingW > coreD + 1) {
    for (const s of [-1, 1]) {
      const zc = f.cz + s * (coreD / 2 + (wingW - coreD) / 4);
      const zw = (wingW - coreD) / 2;
      b.box(M('accomPlain'), fx - fwd * 2, f.y0 + H * 0.36, zc, 4, 0.3, zw);
      b.box(M('accomPlain'), fx - fwd * 2, f.y0 + H * 0.36 + 0.55, f.cz + s * (wingW / 2), 4, 1.1, 0.12);
      b.box(M('accomPlain'), fx + fwd * 0.05, f.y0 + H * 0.36 + 0.55, zc, 0.12, 1.1, zw);
      b.box(M('cabGrey'), fx - fwd * 1.2, f.y0 + H * 0.36 + 0.7, f.cz + s * (wingW / 2 - 0.9), 0.8, 1.1, 0.7); // wing console
      for (let k = 0; k < 3; k++) b.beam(M('steel'), [fx - fwd * (0.5 + k * 1.5), f.y0 + H * 0.36 - 0.15, f.cz + s * coreD / 2], [fx - fwd * (0.5 + k * 1.5), f.y0 + H * 0.36 - 1.6, f.cz + s * coreD / 2 * 0.7], 0.15, 0.15);
    }
  }
  // roof (monkey island) railing
  const ry = f.y0 + H * 0.98 + 0.3;
  handrail(b, M('white'), [[f.cx - coreW / 2, ry, f.cz - coreD / 2], [f.cx + coreW / 2, ry, f.cz - coreD / 2], [f.cx + coreW / 2, ry, f.cz + coreD / 2], [f.cx - coreW / 2, ry, f.cz + coreD / 2], [f.cx - coreW / 2, ry, f.cz - coreD / 2]], 1.0, 1.6);
}

// ---------- funnel ----------
function buildFunnel(ts, b) {
  const f = frameOf(ts);
  const d = ts.details || {};
  const n = d.exhaust_pipes || d.exhausts || 4;
  const g = new THREE.CylinderGeometry(1, 1.15, 1, 4, 1);
  g.rotateY(Math.PI / 4);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(f.cx, f.y0 + f.H * 0.45, f.cz), new THREE.Quaternion(), new THREE.Vector3(f.Lx / 1.414, f.H * 0.9, f.Lz / 1.414));
  b.add(M('funnel'), g, m);
  b.box(M('funnelBand'), f.cx, f.y0 + f.H * 0.78, f.cz, f.Lx * 0.83, f.H * 0.06, f.Lz * 0.83);
  b.box(M('sooty'), f.cx, f.y0 + f.H * 0.9 + 0.05, f.cz, f.Lx * 0.8, 0.1, f.Lz * 0.8);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = f.cx - f.Lx * 0.3 + t * f.Lx * 0.6, z = f.cz + (i % 2 ? 0.25 : -0.25) * f.Lz * 0.4;
    const r = Math.min(0.55, f.Lx / (n * 3));
    b.cyl(M('steelDark'), x, f.y0 + f.H * 0.9 + 1.2, z, r, 2.4, 'y', 14);
    b.cyl(M('sooty'), x, f.y0 + f.H * 0.9 + 2.45, z, r * 1.08, 0.12, 'y', 14);
  }
  // grills on the casing
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) b.box(M('steelDark'), f.cx - f.Lx * 0.25 + k * f.Lx * 0.17, f.y0 + f.H * 0.55, f.cz + s * f.Lz * 0.42, f.Lx * 0.12, 1.4, 0.06);
}

// ---------- antenna mast ----------
function buildAntennaMast(ts, b, anim, group) {
  const f = frameOf(ts);
  const d = ts.details || {};
  const base = f.y0, top = f.y1;
  b.cyl(M('white'), f.cx, (base + top) / 2, f.cz, 0.45, top - base, 'y', 16);
  for (const s of [-1, 1]) b.between(M('white'), [f.cx, base, f.cz + s * 2.2], [f.cx, base + (top - base) * 0.6, f.cz], 0.18, 8);
  // yard arm with nav lights
  const ya = base + (top - base) * 0.72;
  b.box(M('white'), f.cx, ya, f.cz, 0.3, 0.3, Math.max(4, f.Lz));
  b.sphere(M('ledRed'), f.cx, ya + 0.3, f.cz - Math.max(2, f.Lz / 2), 0.15, 8);
  b.sphere(M('ledGreen'), f.cx, ya + 0.3, f.cz + Math.max(2, f.Lz / 2), 0.15, 8);
  b.sphere(M('ledWhite'), f.cx, top + 0.3, f.cz, 0.18, 8);
  // radar platforms + rotating scanners
  const radars = d.radars || 2;
  for (let i = 0; i < radars; i++) {
    const py = base + (top - base) * (0.45 + i * 0.25);
    const px = f.cx + (i % 2 ? -1 : 1) * 1.8;
    b.box(M('grating'), px, py, f.cz, 2.4, 0.05, 2.4);
    b.cyl(M('white'), px, py + 0.4, f.cz, 0.35, 0.8, 'y', 12);
    const rg = new THREE.Group();
    const rb = new Batch();
    rb.box(M('white'), 0, 0, 0, i === 0 ? 5.5 : 3.6, 0.35, 0.4);
    rb.box(M('steelDark'), 0, -0.3, 0, 0.6, 0.3, 0.6);
    rg.add(rb.toGroup('radar'));
    rg.position.set(px, py + 1.05, f.cz);
    group.add(rg);
    anim.push({ kind: 'rotate', obj: rg, speed: i === 0 ? 2.5 : 4.2 });
  }
  // satellite domes
  const domes = d.domes || 3;
  for (let i = 0; i < domes; i++) {
    const px = f.cx - 3 - i * 2.6, pz = f.cz + (i % 2 ? 1.6 : -1.6), r = i === 0 ? 1.4 : 0.8;
    b.cyl(M('steel'), px, base + 1, pz, 0.25, 2, 'y', 10);
    b.cyl(M('white'), px, base + 2.05, pz, r * 0.9, 0.1, 'y', 20);
    b.head(M('white'), px, base + 2.1, pz, r, r * 1.15, 'y', 1, 20);
  }
  // whip antennas
  for (let i = 0; i < 5; i++) b.between(M('black'), [f.cx + 1 - i * 0.8, top - 1, f.cz + 0.6], [f.cx + 1 - i * 0.8, top + 3.5, f.cz + 0.6], 0.03, 4);
}

function buildDeckhouse(ts, b) {
  const f = frameOf(ts);
  facadeBlock(b, f.cx, f.y0, f.cz, f.Lx, f.H, f.Lz, { wall: M('accomPlain') });
  // doors and louvres on the long sides, roof vents
  for (const s of [-1, 1]) {
    b.box(M('doorSteel'), f.cx + f.Lx * 0.3, f.y0 + 1.0, f.cz + s * (f.Lz / 2 + 0.03), 0.9, 2.0, 0.05);
    for (let i = 0; i < 3; i++) b.box(M('steelDark'), f.cx - f.Lx * 0.3 + i * 1.6, f.y0 + 2.2, f.cz + s * (f.Lz / 2 + 0.03), 1.2, 0.8, 0.05);
  }
  b.cyl(M('steelDark'), f.cx - f.Lx * 0.25, f.y1 + 0.9, f.cz, 0.35, 1.5, 'y', 14);
  b.cyl(M('sooty'), f.cx - f.Lx * 0.25, f.y1 + 1.7, f.cz, 0.37, 0.12, 'y', 14);
}

// open deck areas: painted boundary only (no structure, nothing to cut away)
function buildDeckArea(ts, b) {
  const f = frameOf(ts);
  if (f.Lx > 60) return;
  const y = DECK_Y() + 0.014;
  for (const [x, z, w, dd] of [[f.cx, f.cz - f.Lz / 2, f.Lx, 0.15], [f.cx, f.cz + f.Lz / 2, f.Lx, 0.15], [f.cx - f.Lx / 2, f.cz, 0.15, f.Lz], [f.cx + f.Lx / 2, f.cz, 0.15, f.Lz]]) b.box(M('deckYellow'), x, y, z, w, 0.01, dd);
}

const BUILDERS = {
  deckhouse: buildDeckhouse, deck_area: buildDeckArea,
  module: buildModule, pipe_rack: buildPipeRack, flare: buildFlare, crane: buildCrane, turret: buildTurret,
  helideck: buildHelideck, lifeboat: buildLifeboat, davit: buildLifeboat, offloading_reel: buildOffloading,
  laydown: buildLaydown, riser_balcony: buildRiserBalcony, vent_mast: buildVentMast,
  accommodation: buildAccommodation, bridge: buildBridge, funnel: buildFunnel, antenna_mast: buildAntennaMast,
};

export function buildTopsides(db, ctx = {}) {
  const group = new THREE.Group();
  group.name = 'topsides';
  const anim = [];
  const missing = [];
  const b = new Batch();
  for (const ts of db.topsides || []) {
    const fn = BUILDERS[ts.kind];
    if (!fn) { missing.push(ts.kind); continue; }
    try { fn(ts, b, anim, group, ctx); }
    catch (err) { console.warn('[topsides] builder failed', ts.id, err); }
  }
  group.add(b.toGroup('topsides-static'));
  if (missing.length) console.warn('[topsides] no builder for kinds', [...new Set(missing)]);
  return {
    group, anim, missing,
    update(dt, t, camera) {
      for (const a of anim) {
        if (a.kind === 'rotate') a.obj.rotation.y += dt * a.speed;
        else if (a.kind === 'flame') {
          for (const m of a.obj.userData.mats) m.uniforms.uTime.value = t;
          if (camera) {
            const dx = camera.position.x - a.obj.position.x, dz = camera.position.z - a.obj.position.z;
            a.obj.rotation.y = Math.atan2(dx, dz) + Math.PI / 4;
          }
          const l = a.obj.children.find((c) => c.isPointLight);
          if (l) l.intensity = 0;
        }
      }
    },
  };
}
