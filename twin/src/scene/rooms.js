// Room shells (floor, walls, ceiling) from rooms[].box plus fittings:
// luminaires, cable trays, ducts, doors at access points, stairs and ladders, ER specifics.
import * as THREE from 'three';
import { boxToWorld, shipToWorld } from '../core/coords.js';
import { Batch } from './kit.js';
import { M } from './materials.js';
import { handrail, stairFlight } from './topsides.js';

export function roomKind(r, zone) {
  const s = `${r.id} ${r.name} ${r.purpose || ''} ${r.kind || ''}`.toLowerCase();
  const name = `${r.name}`.toLowerCase();
  const openZone = zone && ['open_deck', 'topsides', 'turret'].includes(zone.kind) && r.box[4] >= 27.9;
  if (r.open || /open area|open deck|weather deck|platform|offloading station|cargo deck|turret deck/.test(name) || (openZone && !/\broom\b/.test(name))) return 'open';
  if (/boiler|igg|inert gas|purifier|workshop/.test(s)) return 'plant';
  if (/wheelhouse|navigation bridge/.test(name)) return 'bridge';
  if (/engine room|emergency generator|pump room|steering/.test(name)) return 'er';
  if (/control room|ccr|ecr/.test(s)) return 'control';
  if (/mess|recreation|cabin|office|galley|hospital/.test(name)) return 'accom';
  if (/switchboard|msb|electrical|telecom|ups|battery|server|equipment room|instrument|cctv|radio|transformer|vfd|drive/.test(s)) return 'elec';
  if (zone && zone.kind === 'machinery') return 'er';
  return 'elec';
}

const T_WALL = 0.12;

export function buildRoom(r, db, ctx = {}) {
  const zone = (db.vessel.zones || []).find((z) => z.id === r.zone);
  const kind = roomKind(r, zone);
  const box = boxToWorld(r.box);
  const group = new THREE.Group();
  group.name = 'room:' + r.id;
  group.userData.roomId = r.id;
  const shell = new Batch();
  const fit0 = new Batch();
  // room fittings are representative context: never let them hide a db component
  const keepOut = (ctx.keepOut || []).map((b) => b.clone().expandByScalar(0.35));
  const _bb = new THREE.Box3(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
  const blocked = (a, b2, r) => {
    _bb.makeEmpty().expandByPoint(_v1.set(...a)).expandByPoint(_v2.set(...b2)).expandByScalar(r);
    return keepOut.some((k) => k.intersectsBox(_bb));
  };
  const fit = new Proxy(fit0, {
    get(t, k) {
      if (k === 'between') return (m, a, b2, r, seg) => {
        // split long runs into 3 m pieces and drop the pieces that would cover a component
        const len = Math.hypot(b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]);
        const n = Math.max(1, Math.ceil(len / 3));
        for (let i = 0; i < n; i++) {
          const p0 = a.map((v, j) => v + (b2[j] - v) * i / n), p1 = a.map((v, j) => v + (b2[j] - v) * (i + 1) / n);
          if (!blocked(p0, p1, r)) t.between(m, p0, p1, r, seg);
        }
        return fit;
      };
      if (k === 'box') return (m, x, y, z, w, h, d, ...rest) => {
        if (!blocked([x - w / 2, y - h / 2, z - d / 2], [x + w / 2, y + h / 2, z + d / 2], 0)) t.box(m, x, y, z, w, h, d, ...rest);
        return fit;
      };
      const v = t[k];
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
  const min = box.min, max = box.max;
  const sx = max.x - min.x, sy = max.y - min.y, sz = max.z - min.z;
  const cx = (min.x + max.x) / 2, cz = (min.z + max.z) / 2;
  if (kind !== 'open') {
    const wallMat = kind === 'er' || kind === 'plant' ? M('wallER') : M('wallPanel');
    const floorMat = kind === 'er' || kind === 'plant' ? M('floorER') : (r.floor === 'steel' || kind === 'accom' || kind === 'bridge' ? M('floorPlain') : M('floorRaised'));
    const tile = kind === 'er' || kind === 'plant' ? 2.4 : 1.2;
    shell.tbox(floorMat, cx, min.y - 0.1, cz, sx + 2 * T_WALL, 0.2, sz + 2 * T_WALL, kind === 'er' || kind === 'plant' ? 2.0 : 1.2);
    shell.tbox(kind === 'er' || kind === 'plant' ? wallMat : M('ceiling'), cx, max.y + 0.1, cz, sx + 2 * T_WALL, 0.2, sz + 2 * T_WALL, kind === 'er' || kind === 'plant' ? 2.4 : 1.2);
    const walls = [[cx, min.z - T_WALL / 2, sx + 2 * T_WALL, T_WALL], [cx, max.z + T_WALL / 2, sx + 2 * T_WALL, T_WALL], [min.x - T_WALL / 2, cz, T_WALL, sz], [max.x + T_WALL / 2, cz, T_WALL, sz]];
    for (const [wx, wz, ww, wd] of walls) {
      if (kind === 'bridge') {
        // wheelhouse: console-height bulkhead, window band, header
        const low = 1.1, head = 0.45;
        shell.tbox(wallMat, wx, min.y + low / 2, wz, ww, low, wd, tile);
        shell.box(M('bridgeGlass'), wx, min.y + low + (sy - low - head) / 2, wz, ww, sy - low - head, wd * 0.4);
        shell.tbox(wallMat, wx, max.y - head / 2, wz, ww, head, wd, tile);
      } else shell.tbox(wallMat, wx, min.y + sy / 2, wz, ww, sy, wd, tile);
    }
    if (kind === 'bridge') for (const [wx, wz, ww, wd] of walls) {
      const n = Math.max(1, Math.round(Math.max(ww, wd) / 1.6));
      for (let i = 0; i <= n; i++) {
        const t = -0.5 + i / n;
        fit.box(M('cabDark'), wx + (ww > wd ? t * ww : 0), min.y + sy / 2, wz + (ww > wd ? 0 : t * wd), ww > wd ? 0.08 : wd + 0.02, sy - 0.2, ww > wd ? wd + 0.02 : 0.08);
      }
    }
    // skirting / coaming
    for (const [x, z, w, d] of [[cx, min.z + 0.02, sx, 0.04], [cx, max.z - 0.02, sx, 0.04], [min.x + 0.02, cz, 0.04, sz], [max.x - 0.02, cz, 0.04, sz]]) {
      fit.box(M(kind === 'er' || kind === 'plant' ? 'eqYellow' : 'cabDark'), x, min.y + 0.075, z, w, 0.15, d);
    }
  }

  const along = sx >= sz ? 'x' : 'z';
  const len = along === 'x' ? sx : sz, wid = along === 'x' ? sz : sx;
  const P = (a, y, b) => along === 'x' ? [cx + a, y, cz + b] : [cx + b, y, cz + a];
  const dimsAB = (a, b) => along === 'x' ? [a, b] : [b, a];

  if (kind !== 'open') {
    // luminaires
    const ly = max.y - (kind === 'er' ? 0.45 : 0.06);
    const nl = Math.max(1, Math.round(len / (kind === 'er' ? 4.5 : 3)));
    const nw = Math.max(1, Math.round(wid / (kind === 'er' ? 5 : 3)));
    for (let i = 0; i < nl; i++) for (let j = 0; j < nw; j++) {
      const a = -len / 2 + (i + 0.5) * len / nl, b = -wid / 2 + (j + 0.5) * wid / nw;
      const [w, d] = dimsAB(1.25, 0.22);
      fit.box(M('eqWhite'), ...P(a, ly, b), w, 0.08, d);
      fit.box(M('lampWhite'), ...P(a, ly - 0.045, b), w * 0.92, 0.01, d * 0.7);
      if (kind === 'er') fit.between(M('steelBare'), P(a, ly, b), P(a, max.y, b), 0.012, 4);
    }
    // cable trays along the long axis near the ceiling (two runs)
    const ty = max.y - (kind === 'er' ? 0.9 : 0.35);
    for (const off of [-wid * 0.22, wid * 0.22]) {
      const [w, d] = dimsAB(len - 0.4, 0.6);
      const p0 = P(0, ty, off);
      fit.box(M('tray'), p0[0], p0[1] - 0.05, p0[2], w, 0.01, d);
      for (const e of [-0.3, 0.3]) { const pe = P(0, ty, off + e); const [ew, ed] = dimsAB(len - 0.4, 0.02); fit.box(M('tray'), pe[0], pe[1], pe[2], ew, 0.1, ed); }
      const pc = P(0, ty, off);
      const [cw, cd] = dimsAB(len - 0.5, 0.48);
      fit.box(M('cableBlack'), pc[0], pc[1] - 0.025, pc[2], cw, 0.04, cd);
      for (let a = -len / 2 + 1; a < len / 2; a += 1.8) {
        const h0 = P(a, ty + 0.05, off);
        fit.between(M('steelBare'), [h0[0], ty - 0.05, h0[2]], [h0[0], max.y, h0[2]], 0.015, 4);
      }
    }
    // HVAC duct along one wall with diffusers
    {
      const b = wid / 2 - 0.45;
      const [w, d] = dimsAB(len - 0.3, 0.6);
      const p = P(0, max.y - 0.35, b);
      fit.box(M('duct'), p[0], p[1], p[2], w, 0.4, d);
      for (let a = -len / 2 + 1.5; a < len / 2; a += 3) { const q = P(a, max.y - 0.56, b); fit.box(M('black'), q[0], q[1], q[2], 0.4, 0.02, 0.4); }
    }
    // (fire detectors come from the db as field_transmitter components, none are invented here)
    // fire extinguisher and sign near the first access
    const acc0 = (r.access || [])[0];
    if (acc0) {
      const ap = shipToWorld(acc0.pos);
      const ex = THREE.MathUtils.clamp(ap.x + 1.2, min.x + 0.3, max.x - 0.3), ez = THREE.MathUtils.clamp(ap.z, min.z + 0.2, max.z - 0.2);
      fit.cyl(M('eqRed'), ex, min.y + 0.35, ez, 0.09, 0.6, 'y', 12);
      fit.cyl(M('black'), ex, min.y + 0.7, ez, 0.03, 0.1, 'y', 8);
    }
  }

  // ER specifics: overhead crane rails and girder, wall piping, vent trunk, floor plate seams
  if (kind === 'er' || kind === 'plant') {
    const ry = max.y - 0.25;
    for (const s of [-1, 1]) {
      const p = P(0, ry, s * (wid / 2 - 0.4));
      { const [rw, rd] = dimsAB(len - 0.2, 0.3); fit.box(M('eqYellow'), p[0], p[1], p[2], rw, 0.25, rd); }
    }
    if (kind === 'er') {
      const g = P(len * 0.15, ry - 0.3, 0);
      const [gw, gd] = dimsAB(0.5, wid - 0.8);
      fit.box(M('eqYellow'), g[0], g[1], g[2], gw, 0.5, gd);
      const hst = P(len * 0.15, ry - 0.7, wid * 0.1);
      fit.box(M('cabDark'), hst[0], hst[1], hst[2], 0.6, 0.5, 0.6);
      fit.between(M('black'), [hst[0], hst[1] - 0.25, hst[2]], [hst[0], min.y + 3.5, hst[2]], 0.02, 4);
      fit.box(M('eqYellow'), hst[0], min.y + 3.4, hst[2], 0.25, 0.3, 0.15);
    }
    // wall pipe runs (colour coded) on both long walls
    const runs = [['pipeSW', 0.12, 1.4], ['pipeFW', 0.09, 1.75], ['pipeFO', 0.06, 2.05], ['pipeLO', 0.07, 2.3], ['pipeFire', 0.1, 2.65], ['pipeAir', 0.05, 2.95], ['pipeSteam', 0.08, 3.25]];
    for (const s of [-1, 1]) {
      runs.forEach(([m, rr, h], k) => {
        if (min.y + h > max.y - 1.2) return;
        const off = s * (wid / 2 - 0.18 - (k % 2) * 0.22);
        fit.between(M(m), P(-len / 2 + 0.2, min.y + h, off), P(len / 2 - 0.2, min.y + h, off), rr, 10);
        for (let a = -len / 2 + 1; a < len / 2; a += 3) fit.box(M('steelBare'), ...P(a, min.y + h - rr - 0.03, off), 0.06, 0.04, 0.3);
        for (let a = -len / 2 + 2.5; a < len / 2; a += 7) fit.cyl(M(m), ...P(a, min.y + h, off), rr * 1.7, 0.05, along === 'x' ? 'x' : 'z', 12);
      });
    }
    // vertical ventilation trunks in corners
    for (const [a, b] of [[-len / 2 + 0.7, -wid / 2 + 0.7], [len / 2 - 0.7, wid / 2 - 0.7]]) {
      const p = P(a, 0, b);
      fit.box(M('duct'), p[0], (min.y + max.y) / 2 + 0.5, p[2], 0.9, sy - 1, 0.9);
      fit.box(M('black'), p[0] + 0.46, min.y + 1.5, p[2], 0.02, 0.6, 0.6);
    }
  }

  // doors / hatches / stairs / ladders at access points
  for (const acc of r.access || []) {
    const ap = shipToWorld(acc.pos);
    const kindA = acc.kind || 'door';
    if (kindA === 'door') {
      const d = [[Math.abs(ap.x - min.x), 'x0'], [Math.abs(ap.x - max.x), 'x1'], [Math.abs(ap.z - min.z), 'z0'], [Math.abs(ap.z - max.z), 'z1']].sort((a, b) => a[0] - b[0])[0];
      const wall = d[1];
      const dw = 0.9, dh = Math.min(2.0, sy - 0.2);
      const y = min.y + dh / 2;
      for (const side of [-1, 1]) {
        const o = side * (T_WALL / 2 + 0.012);
        if (wall === 'x0' || wall === 'x1') {
          const x = (wall === 'x0' ? min.x - T_WALL / 2 : max.x + T_WALL / 2) + o;
          const z = THREE.MathUtils.clamp(ap.z, min.z + 0.6, max.z - 0.6);
          fit.box(M('doorSteel'), x, y, z, 0.03, dh, dw);
          fit.box(M('cabDark'), x, y, z, 0.035, dh + 0.1, dw + 0.12);
          fit.box(M('chrome'), x + side * 0.03, y, z + dw * 0.35, 0.03, 0.03, 0.14);
        } else {
          const z = (wall === 'z0' ? min.z - T_WALL / 2 : max.z + T_WALL / 2) + o;
          const x = THREE.MathUtils.clamp(ap.x, min.x + 0.6, max.x - 0.6);
          fit.box(M('cabDark'), x, y, z, dw + 0.12, dh + 0.1, 0.035);
          fit.box(M('doorSteel'), x, y, z + side * 0.01, dw, dh, 0.03);
          fit.box(M('chrome'), x + dw * 0.35, y, z + side * 0.03, 0.14, 0.03, 0.03);
        }
      }
    } else if (kindA === 'hatch') {
      const y = Math.abs(ap.y - max.y) < Math.abs(ap.y - min.y) ? max.y - 0.02 : min.y + 0.02;
      fit.box(M('eqYellow'), ap.x, y, ap.z, 1.0, 0.06, 1.0);
      fit.box(M('doorSteel'), ap.x, y, ap.z, 0.85, 0.07, 0.85);
    } else if (kindA === 'stair' || kindA === 'ladder') {
      const floorY = min.y;
      const topY = max.y;
      const x = THREE.MathUtils.clamp(ap.x, min.x + 0.5, max.x - 0.5), z = THREE.MathUtils.clamp(ap.z, min.z + 0.5, max.z - 0.5);
      if (kindA === 'ladder') {
        for (let k = 0; k < Math.round((topY - floorY) / 0.3); k++) fit.box(M('eqYellow'), x, floorY + 0.3 + k * 0.3, z, 0.5, 0.03, 0.03);
        for (const o of [-0.25, 0.25]) fit.box(M('eqYellow'), x + o, (floorY + topY) / 2, z, 0.05, topY - floorY, 0.05);
      } else {
        const rise = topY - floorY;
        const run = Math.min(rise * 1.0, len * 0.4);
        const dir = x + run < max.x - 0.3 ? 1 : -1;
        stairFlight(fit, x, floorY, z, dir * run, rise, 0.8, 'x', M('eqYellow'));
      }
    }
  }

  const shellG = shell.toGroup('shell:' + r.id, { cast: true, receive: true });
  shellG.userData.isShell = true;
  const fitG = fit0.toGroup('fit:' + r.id, { cast: false, receive: true });
  group.add(shellG, fitG);
  const contents = new THREE.Group();
  contents.name = 'contents:' + r.id;
  group.add(contents);
  // name plate outside the first door for orientation (on the door itself)
  return { group, box, kind, contents, def: r };
}

// Engine room platforms: grating platforms along long walls at an intermediate level when the room is tall.
export function erPlatforms(room, b) {
  void room; void b; void handrail;
}
