// Engine room machinery: diesel generator sets and generator-mounted equipment.
import * as THREE from 'three';
import { M, faceMat } from '../materials.js';
import * as TX from '../textures.js';
import { cabinet, faceFrom, gaugeRow, pushButton, eStop, led, wallBracket } from './common.js';
import { handrail } from '../topsides.js';

// Alternator (synchronous generator) along X, drive end at -X. Used by DG set and standalone type.
export function alternatorBody(B, x0, x1, y0, W, D, H, opts = {}) {
  const L = x1 - x0, xc = (x0 + x1) / 2;
  const R = Math.min(D, H) * 0.46;
  const yc = y0 + R + 0.05;
  // feet and base
  B.box(M('alternator'), xc, y0 + 0.15, 0, L * 0.85, 0.3, D * 0.95);
  // stator frame
  B.cyl(M('alternator'), xc, yc, 0, R, L * 0.82, 'x', 40);
  // cooling ribs
  const nr = Math.max(6, Math.round(L / 0.22));
  for (let i = 0; i < nr; i++) B.cyl(M('alternator'), x0 + L * 0.12 + i * L * 0.76 / nr, yc, 0, R * 1.04, 0.05, 'x', 40);
  // end shields and bearing pedestal
  B.cyl(M('alternator'), x1 - L * 0.06, yc, 0, R * 0.92, L * 0.1, 'x', 36);
  B.cyl(M('steelBare'), x1 - 0.01, yc, 0, R * 0.25, 0.12, 'x', 20);
  B.box(M('alternator'), x1 - L * 0.06, y0 + (yc - y0) / 2, 0, L * 0.1, yc - y0, R * 0.9);
  // air inlet louvres at NDE, exhaust at DE sides
  for (let i = 0; i < 5; i++) B.box(M('black'), x1 - L * 0.16, yc - R * 0.4 + i * R * 0.18, R * 0.95, L * 0.1, 0.03, 0.02);
  for (let i = 0; i < 5; i++) B.box(M('black'), x0 + L * 0.15, yc - R * 0.4 + i * R * 0.18, R * 0.95, L * 0.1, 0.03, 0.02);
  // main terminal box on top
  const tbW = Math.min(L * 0.4, 1.4);
  B.rbox(M('alternator'), xc + L * 0.1, yc + R + 0.32, 0, tbW, 0.6, R * 1.1, 0.02);
  // MV cable glands into terminal box
  for (let i = 0; i < 3; i++) {
    B.cyl(M('steelBare'), xc + L * 0.1 - tbW * 0.25 + i * tbW * 0.25, yc + R + 0.7, -R * 0.2, 0.07, 0.12, 'y', 12);
    B.pipe(M('cableBlack'), [[xc + L * 0.1 - tbW * 0.25 + i * tbW * 0.25, yc + R + 0.75, -R * 0.2], [xc + L * 0.1 - tbW * 0.25 + i * tbW * 0.25, yc + R + 1.2, -R * 0.2], [xc + L * 0.1 - tbW * 0.25 + i * tbW * 0.25, opts.ceilY ?? yc + R + 2.5, -R * 0.2]], 0.045, 8);
  }
  // auxiliary terminal box (AVR sensing / excitation) on the front
  B.rbox(M('alternator'), xc - L * 0.15, yc + R * 0.55, R * 0.88, 0.5, 0.4, 0.25, 0.02);
  B.box(M('steelBare'), xc - L * 0.15, yc + R * 0.55, R * 0.88 + 0.13, 0.3, 0.12, 0.01); // nameplate
  // lifting lugs
  for (const s of [-1, 1]) B.box(M('alternator'), xc + s * L * 0.3, yc + R + 0.08, 0, 0.1, 0.2, 0.35);
  return { yc, R };
}

export function diesel_generator_set(ctx) {
  const { W: L, H, D, p } = ctx;
  const B = ctx.b;
  const cyl = p.cylinders || 8;
  const vee = p.layout === 'V' || p.arrangement === 'V' || (!p.arrangement && cyl >= 12);
  const ownAlt = !ctx.has('alternator') && p.alternator !== false;
  // builder draws the free end at local -X; mirror by a half turn when the db puts it at +X
  const freeSign = ctx.localXSign(p.free_end || p.turbocharger_end);
  const flip = freeSign === 1;
  if (flip) B.push(new THREE.Matrix4().makeRotationY(Math.PI));
  // crankcase door plane from mounted OMD heads (they sit on the doors)
  const heads = ctx.children.filter((k) => k.type === 'oil_mist_detector_head');
  let doorPlane = null;
  if (heads.length) doorPlane = Math.max(...heads.map((k) => Math.abs(ctx.toLocal(k.pos).z)));
  const xA = L * (ownAlt ? 0.16 : 0.5);            // engine / alternator split (alternator at +X)
  const xE0 = -L / 2, xE1 = ownAlt ? xA : L / 2;
  const Le = xE1 - xE0 - 0.5;
  const ex = xE0 + 0.5 + Le / 2;
  // --- common base frame on resilient mounts ---
  const baseH = 0.38;
  for (const s of [-1, 1]) {
    B.box(M('engineDark'), 0, baseH / 2, s * D * 0.38, L, baseH, 0.22);
    B.box(M('engineDark'), 0, baseH - 0.02, s * D * 0.38, L, 0.04, 0.4);
    B.box(M('engineDark'), 0, 0.02, s * D * 0.38, L, 0.04, 0.4);
    for (let i = 0; i < 6; i++) B.box(M('rubber'), -L / 2 + 0.4 + i * (L - 0.8) / 5, -0.0, s * D * 0.45, 0.3, 0.12, 0.25);
  }
  for (let i = 0; i < 6; i++) B.box(M('engineDark'), -L / 2 + 0.3 + i * (L - 0.6) / 5, baseH / 2, 0, 0.16, baseH * 0.8, D * 0.76);
  // --- engine ---
  const blockH = H * 0.42;
  const blockD = doorPlane ? Math.min(D, Math.max(D * 0.5, 2 * (doorPlane - 0.06))) : D * (vee ? 0.62 : 0.5);
  const yB = baseH + 0.45;   // block bottom (oil pan below)
  B.box(M('engine'), ex, baseH + 0.25, 0, Le, 0.5, blockD * 0.8);  // oil sump
  B.rbox(M('engine'), ex, yB + blockH / 2, 0, Le, blockH, blockD, 0.05);
  // crankcase doors (front and back) with relief valves
  const nThrows = vee ? cyl / 2 : cyl;
  const pitch = (Le - 0.8) / nThrows;
  for (let i = 0; i < nThrows; i++) {
    const x = ex - Le / 2 + 0.6 + (i + 0.5) * pitch;
    for (const s of [-1, 1]) {
      B.rbox(M('engine'), x, yB + blockH * 0.32, s * (blockD / 2 + 0.02), pitch * 0.72, blockH * 0.38, 0.05, 0.02);
      B.cyl(M('engineDark'), x, yB + blockH * 0.32, s * (blockD / 2 + 0.06), 0.09, 0.05, 'z', 16);
      for (const dx of [-1, 1]) for (const dy of [-1, 1]) B.cyl(M('steelBare'), x + dx * pitch * 0.3, yB + blockH * (0.32 + dy * 0.16), s * (blockD / 2 + 0.05), 0.012, 0.02, 'z', 6);
    }
  }
  // block frame: vertical ribs between doors, top and bottom flanges
  for (const s of [-1, 1]) {
    for (let i = 0; i <= nThrows; i++) B.box(M('engine'), ex - Le / 2 + 0.6 + i * pitch, yB + blockH * 0.5, s * (blockD / 2 + 0.025), 0.07, blockH * 0.95, 0.06);
    B.box(M('engine'), ex, yB + blockH * 0.62, s * (blockD / 2 + 0.03), Le, 0.06, 0.07);
    B.box(M('engineDark'), ex, yB + 0.04, s * (blockD / 2 + 0.03), Le, 0.08, 0.08);
  }
  // cylinder heads, rocker covers, indicator cocks and injection pumps
  const rows = vee ? [-1, 1] : [0];
  const headY = yB + blockH;
  const cp = (Le - 0.8) / (vee ? cyl / 2 : cyl);
  for (const row of rows) {
    const zr = row * blockD * 0.26;
    for (let i = 0; i < (vee ? cyl / 2 : cyl); i++) {
      const x = ex - Le / 2 + 0.6 + (i + 0.5) * cp;
      B.rbox(M('engine'), x, headY + 0.22, zr, cp * 0.86, 0.44, blockD * (vee ? 0.42 : 0.7), 0.04);
      B.rbox(M('engineDark'), x, headY + 0.6, zr, cp * 0.7, 0.3, blockD * (vee ? 0.32 : 0.52), 0.06);
      for (let k = 0; k < 4; k++) B.cyl(M('steelBare'), x - cp * 0.28 + k * cp * 0.19, headY + 0.75, zr, 0.02, 0.04, 'y', 6);
      B.cyl(M('steelBare'), x + cp * 0.3, headY + 0.5, zr + (row || 1) * blockD * 0.2, 0.025, 0.25, 'y', 8);
      // injection pump on the side of the block + HP pipe
      const zp = (row || 1) * (blockD / 2 + 0.08);
      B.box(M('engineDark'), x, headY - 0.25, zp, cp * 0.4, 0.4, 0.18);
      B.pipe(M('steelBare'), [[x, headY - 0.05, zp], [x, headY + 0.2, zp * 0.85], [x, headY + 0.3, zr + (row || 1) * blockD * 0.12]], 0.012, 6, false);
    }
    // fuel rack / camshaft cover along the side
    B.box(M('engineDark'), ex, headY - 0.55, (row || 1) * (blockD / 2 + 0.07), Le * 0.94, 0.16, 0.1);
  }
  // charge air receiver (between banks or along the back) and exhaust manifold (lagged)
  const exY = headY + 0.65, exZ = vee ? 0 : -blockD * 0.42;
  B.box(M('engine'), ex, headY - 0.1, vee ? 0 : -blockD * 0.55, Le * 0.92, 0.45, vee ? 0.4 : 0.3);
  B.cyl(M('laggingAlu'), ex - 0.3, exY + 0.25, exZ, 0.32, Le * 0.86, 'x', 20);
  const nb = Math.round(Le / 0.5);
  for (let i = 0; i < nb; i++) B.cyl(M('steelBare'), ex - Le * 0.43 + i * Le * 0.86 / nb, exY + 0.25, exZ, 0.335, 0.03, 'x', 20);
  for (let i = 0; i < (vee ? cyl / 2 : cyl); i++) {
    const x = ex - Le / 2 + 0.6 + (i + 0.5) * cp;
    for (const row of rows) B.between(M('laggingAlu'), [x, headY + 0.5, row * blockD * 0.26 + (vee ? 0 : -blockD * 0.25)], [x, exY + 0.2, exZ], 0.14, 10);
  }
  // turbocharger at the free end (-X)
  const tx = xE0 + 0.55, ty = exY + 0.3;
  B.cyl(M('laggingAlu'), tx + 0.25, ty, exZ * 0.5, 0.5, 0.55, 'x', 24);          // turbine casing
  B.cyl(M('engineDark'), tx - 0.2, ty, exZ * 0.5, 0.38, 0.35, 'x', 24);          // bearing housing
  B.cyl(M('steelBare'), tx - 0.55, ty, exZ * 0.5, 0.55, 0.32, 'x', 28);           // compressor volute
  B.cyl(M('steelBare'), tx - 0.95, ty, exZ * 0.5, 0.6, 0.45, 'x', 28);            // air filter silencer
  for (let i = 0; i < 6; i++) B.cyl(M('black'), tx - 0.8 - i * 0.06, ty, exZ * 0.5, 0.62, 0.02, 'x', 28);
  // charge air cooler under the turbo
  B.box(M('engine'), tx - 0.1, headY - 0.3, exZ * 0.4, 0.8, 0.9, blockD * 0.75);
  B.pipe(M('pipeSW'), [[tx - 0.1, headY - 0.4, blockD * 0.4], [tx - 0.1, headY - 0.4, D * 0.5], [tx - 0.1, baseH, D * 0.5]], 0.07, 10);
  // exhaust uptake from turbo to ceiling (lagged, with expansion bellows)
  const ceil = Math.max(H + 0.8, ctx.ceilH - 0.1);
  const mz = /z\s*([0-9.]+)/.exec(p.exhaust_route || '');
  if (mz && ctx.env.roomShipBox) {
    // db route: rise to the stated level, then run aft (ship -x) to the room boundary toward the casing
    const exY0 = ctx.toLocal([0, 0, parseFloat(mz[1])]).y;
    const exLevel = Math.min(Math.max(exY0, ty + 0.9), ceil - 0.5);
    const aft = ctx.toLocal([ctx.env.roomShipBox[0], 0, 0]).x * (flip ? -1 : 1);
    B.pipe(M('laggingAlu'), [[tx + 0.25, ty + 0.4, exZ * 0.5], [tx + 0.25, exLevel, exZ * 0.5], [aft, exLevel, exZ * 0.5]], 0.38, 20);
    B.cyl(M('steelBare'), tx + 0.25, ty + 1.0, exZ * 0.5, 0.44, 0.3, 'y', 20);
    const xa = Math.min(aft, tx), xb = Math.max(aft, tx);
    for (let xx = xa + 1; xx < xb - 0.5; xx += 2.5) {
      B.cyl(M('steelBare'), xx, exLevel, exZ * 0.5, 0.41, 0.06, 'x', 20);
      B.between(M('steelBare'), [xx, exLevel + 0.4, exZ * 0.5], [xx, ceil, exZ * 0.5], 0.03, 5);
    }
  } else {
    B.pipe(M('laggingAlu'), [[tx + 0.25, ty + 0.4, exZ * 0.5], [tx + 0.25, ty + 1.2, exZ * 0.5], [tx + 0.25, ceil, exZ * 0.5 - 0.3]], 0.42, 20);
    B.cyl(M('steelBare'), tx + 0.25, ty + 1.6, exZ * 0.5, 0.48, 0.3, 'y', 20);
  }
  // free-end: vibration damper cover, engine driven pumps, LO filters, LO cooler
  B.cyl(M('engine'), xE0 + 0.2, yB + blockH * 0.25, 0, blockH * 0.32, 0.35, 'x', 28);
  for (const s of [-1, 1]) B.cyl(M('engineDark'), xE0 + 0.25, yB + 0.2, s * blockD * 0.3, 0.2, 0.4, 'x', 16);
  for (let i = 0; i < 2; i++) { B.cyl(M('engine'), ex - Le * 0.25 + i * 0.4, yB + 0.5, blockD / 2 + 0.35, 0.16, 0.9, 'y', 16); B.cyl(M('steelBare'), ex - Le * 0.25 + i * 0.4, yB + 0.98, blockD / 2 + 0.35, 0.17, 0.06, 'y', 16); }
  B.cyl(M('engine'), ex + Le * 0.1, yB + 0.3, blockD / 2 + 0.3, 0.22, Le * 0.35, 'x', 20);
  // service piping along the front: LO (yellow-brown), FW (blue), FO (brown), start air (light blue)
  const pz = blockD / 2 + 0.55;
  const runs = [['pipeLO', 0.06, baseH + 0.15], ['pipeFW', 0.07, baseH + 0.3], ['pipeFO', 0.035, baseH + 0.42], ['pipeAir', 0.03, baseH + 0.5]];
  for (const [m, r, y] of runs) {
    B.pipe(M(m), [[ex - Le * 0.45, y, pz], [ex + Le * 0.4, y, pz], [ex + Le * 0.4, y, D / 2 + 0.05], [ex + Le * 0.4, 0.02, D / 2 + 0.05]], r, 10);
    for (let k = 0; k < 3; k++) B.cyl(M(m), ex - Le * 0.4 + k * Le * 0.35, y, pz, r * 1.7, 0.04, 'x', 12);
  }
  B.pipe(M('pipeFW'), [[xE0 + 0.4, yB + blockH * 0.8, blockD / 2], [xE0 + 0.4, ceil * 0.85, blockD / 2], [xE0 + 0.4, ceil * 0.85, D / 2 + 0.2]], 0.09, 12);
  // flywheel housing + coupling guard
  if (ownAlt) {
    B.cyl(M('engine'), xE1 - 0.25, yB + blockH * 0.32, 0, blockH * 0.5, 0.5, 'x', 32);
    B.cyl(M('eqYellow'), xE1 + 0.15, yB + blockH * 0.3, 0, blockH * 0.38, 0.35, 'x', 24);
    // alternator
    alternatorBody(B, xE1 + 0.35, L / 2, baseH, L - xE1, D * 0.95, H * 0.85, { ceilY: ceil });
  }
  // platforms along both sides at cylinder head level with handrails
  if (p.platforms !== false && H > 2.5) {
    const py = headY - 0.1;
    for (const s of [-1, 1]) {
      const zc = s * (D / 2 + 0.55);
      B.box(M('eqGrate'), ex, py, zc, Le + 0.6, 0.04, 0.8);
      B.box(M('eqYellow'), ex, py - 0.08, zc + s * 0.4, Le + 0.6, 0.12, 0.03);
      for (let i = 0; i < 5; i++) B.box(M('eqYellow'), ex - Le / 2 + i * Le / 4, py / 2, zc + s * 0.35, 0.06, py, 0.06);
      handrail(B, M('eqYellow'), [[ex - Le / 2 - 0.3, py, zc + s * 0.38], [ex + Le / 2 + 0.3, py, zc + s * 0.38]], 1.0, 1.2);
    }
    // ladder up to the front platform
    const lx = ex + Le / 2 + 0.25;
    for (let k = 0; k < Math.round(py / 0.3); k++) B.box(M('eqYellow'), lx, 0.3 + k * 0.3, D / 2 + 0.55, 0.03, 0.03, 0.5);
    for (const o of [-0.25, 0.25]) B.box(M('eqYellow'), lx, py / 2, D / 2 + 0.55 + o, 0.05, py, 0.05);
  }
  // ID plate on block
  ctx.tag(ex + Le * 0.3, yB + blockH * 0.8, blockD / 2 + 0.03, 0.7, { style: 'dark' });
  ctx.tag(ex - Le * 0.3, yB + blockH * 0.8, -blockD / 2 - 0.03, 0.7, { style: 'dark', ry: Math.PI });
  if (flip) B.pop();
}

export function alternator(ctx) {
  const { W, H, D } = ctx;
  alternatorBody(ctx.b, -W / 2, W / 2, 0, W, D, H, { ceilY: ctx.ceilH - 0.1 });
  ctx.tag(0, H * 0.35, D / 2 + 0.02, 0.4);
}

// Engine local control panel: freestanding or engine mounted, legacy gauges vs retrofit HMI.
export function engine_local_panel(ctx) {
  const { W, H, D, c } = ctx;
  const B = ctx.b;
  // host of a door-mounted speed controller: full-height cabinet with a glazed middle door (SPD visible inside)
  const spd = ctx.children.find((k) => k.type === 'speed_controller_cabinet');
  if (spd) return lcpGlazed(ctx, spd);
  const standH = c.mounted_on ? 0 : Math.max(0, Math.min(0.9, H - 1.0));
  const ph = H - standH;
  if (standH > 0) for (const s of [-1, 1]) { B.box(M('steelBare'), s * W * 0.35, standH / 2, -D * 0.2, 0.06, standH, 0.06); B.box(M('steelBare'), s * W * 0.35, 0.01, -D * 0.1, 0.25, 0.02, 0.4); }
  B.push(new THREE.Matrix4().makeTranslation(0, standH, 0));
  B.rbox(M('cabDark'), 0, ph / 2, 0, W, ph, D, 0.015);
  B.box(M('cabDark'), 0, ph + 0.05, 0.05, W + 0.06, 0.04, D + 0.1); // rain hood
  B.pop();
  const zf = D / 2 + 0.003;
  const L = ctx.V('legacy'), R = ctx.V('retrofit');
  const y0 = standH;
  if (L) {
    L.plane(M('cabOld'), 0, y0 + ph * 0.5, zf + 0.001, W * 0.96, ph * 0.96);
    const g = faceMat(TX.gaugeTexture('bar'));
    gaugeRow(L, g, -W * 0.33, y0 + ph * 0.78, zf, 4, W * 0.22, Math.min(0.06, W * 0.08));
    gaugeRow(L, faceMat(TX.gaugeTexture('rpm')), -W * 0.2, y0 + ph * 0.58, zf, 3, W * 0.2, Math.min(0.055, W * 0.07));
    for (let i = 0; i < 6; i++) L.sphere(M(['ledGreen', 'ledRed', 'ledAmber', 'ledWhite', 'ledGreen', 'ledRed'][i]), -W * 0.35 + i * W * 0.14, y0 + ph * 0.4, zf + 0.01, 0.012, 8);
    pushButton(L, -W * 0.2, y0 + ph * 0.26, zf, 'eqWhite'); pushButton(L, 0, y0 + ph * 0.26, zf, 'green'); pushButton(L, W * 0.2, y0 + ph * 0.26, zf, 'eqRed');
    L.cyl(M('black'), W * 0.33, y0 + ph * 0.26, zf + 0.015, 0.03, 0.03, 'z', 12);
    eStop(L, -W * 0.36, y0 + ph * 0.12, zf);
  }
  if (R) {
    R.plane(M('cab'), 0, y0 + ph * 0.5, zf + 0.001, W * 0.96, ph * 0.96);
    R.box(M('black'), 0, y0 + ph * 0.68, zf + 0.008, W * 0.62, ph * 0.36, 0.016);
    ctx.screen(0, y0 + ph * 0.68, zf + 0.018, W * 0.56, ph * 0.3, { variant: 'retrofit', kind: 'hmi', title: 'DG LOCAL' });
    for (let i = 0; i < 4; i++) pushButton(R, -W * 0.3 + i * W * 0.2, y0 + ph * 0.36, zf, ['green', 'eqRed', 'eqWhite', 'eqYellow'][i], 0.016);
    eStop(R, W * 0.3, y0 + ph * 0.18, zf);
    R.box(M('accent'), 0, y0 + ph - 0.03, zf + 0.004, W * 0.96, 0.02, 0.004);
  }
  ctx.tag(0, y0 + ph * 0.93, zf + 0.004, Math.min(0.3, W * 0.6));
  // cable gland plate and cables down to the tray
  B.box(M('steelBare'), 0, y0 + 0.02, 0, W * 0.8, 0.03, D * 0.7);
  for (let i = 0; i < 3; i++) B.between(M('cableBlack'), [-W * 0.2 + i * W * 0.2, y0, 0], [-W * 0.2 + i * W * 0.2, 0, -D * 0.3], 0.012, 6);
}

function lcpGlazed(ctx, spd) {
  const { W, H, D } = ctx;
  const B = ctx.b;
  const t = 0.02;
  // hollow cabinet: back, sides, roof, bottom, plinth
  B.box(M('black'), 0, 0.05, 0, W - 0.02, 0.1, D - 0.04);
  B.box(M('cabDark'), 0, H / 2 + 0.05, -D / 2 + t / 2, W, H - 0.1, t);
  for (const sx of [-1, 1]) B.box(M('cabDark'), sx * (W / 2 - t / 2), H / 2 + 0.05, 0, t, H - 0.1, D);
  B.box(M('cabDark'), 0, H - t / 2, 0, W, t, D);
  B.box(M('cabDark'), 0, 0.1 + t / 2, 0, W, t, D);
  B.box(M('cabDark'), 0, H + 0.05, 0.05, W + 0.06, 0.04, D + 0.1); // rain hood
  B.box(M('steelBare'), 0, H / 2, -D / 2 + t + 0.01, W - 0.1, H - 0.3, 0.01); // mounting plate
  // window band covers the SPD height (from the db pos) with a margin
  const sy0 = ctx.toLocal(spd.pos).y, sy1 = sy0 + ((spd.size && spd.size[2]) || 0.6);
  const w0 = Math.max(0.15, sy0 - 0.08), w1 = Math.min(H - 0.5, sy1 + 0.08);
  const zf = D / 2 - t / 2;
  B.box(M('cabDark'), 0, (0.1 + w0) / 2, zf, W, w0 - 0.1, t);                 // lower door
  B.box(M('cabDark'), 0, (w1 + H) / 2, zf, W, H - w1, t);                    // upper door (operator face)
  for (const sx of [-1, 1]) B.box(M('cabDark'), sx * (W / 2 - 0.03), (w0 + w1) / 2, zf, 0.06, w1 - w0, t);
  B.box(M('glassClear'), 0, (w0 + w1) / 2, zf, W - 0.12, w1 - w0, 0.006);    // glazed inspection window
  B.box(M('chrome'), W / 2 - 0.08, (w1 + H) / 2 - 0.1, zf + 0.02, 0.02, 0.14, 0.03);
  // terminal rails and wiring duct around the module (inside)
  for (const y of [w0 + 0.03, w1 - 0.03]) B.box(M('cabGrey'), 0, y, -D / 2 + 0.06, W - 0.15, 0.04, 0.05);
  const zfo = D / 2 + 0.003;
  const L = ctx.V('legacy'), R = ctx.V('retrofit');
  const uh = H - w1, uy = w1;
  if (L) {
    L.plane(M('cabOld'), 0, uy + uh / 2, zfo, W * 0.96, uh * 0.94);
    gaugeRow(L, faceMat(TX.gaugeTexture('bar')), -W * 0.33, uy + uh * 0.68, zfo, 4, W * 0.22, Math.min(0.055, W * 0.07));
    for (let i = 0; i < 6; i++) L.sphere(M(['ledGreen', 'ledRed', 'ledAmber', 'ledWhite', 'ledGreen', 'ledRed'][i]), -W * 0.35 + i * W * 0.14, uy + uh * 0.32, zfo + 0.01, 0.012, 8);
    pushButton(L, -W * 0.2, uy + uh * 0.14, zfo, 'green'); pushButton(L, 0, uy + uh * 0.14, zfo, 'eqRed');
    eStop(L, W * 0.32, uy + uh * 0.14, zfo);
  }
  if (R) {
    R.plane(M('cab'), 0, uy + uh / 2, zfo, W * 0.96, uh * 0.94);
    R.box(M('black'), -W * 0.12, uy + uh * 0.55, zfo + 0.008, W * 0.5, uh * 0.62, 0.016);
    ctx.screen(-W * 0.12, uy + uh * 0.55, zfo + 0.018, W * 0.45, uh * 0.52, { variant: 'retrofit', kind: 'hmi', title: 'DG LOCAL' });
    pushButton(R, W * 0.3, uy + uh * 0.7, zfo, 'green', 0.016); pushButton(R, W * 0.3, uy + uh * 0.45, zfo, 'eqRed', 0.016);
    eStop(R, W * 0.3, uy + uh * 0.2, zfo);
    R.box(M('accent'), 0, H - 0.03, zfo + 0.004, W * 0.96, 0.02, 0.004);
  }
  ctx.tag(0, uy + uh * 0.93, zfo + 0.004, Math.min(0.3, W * 0.6));
}

export function oil_mist_detector_head(ctx) {
  const { W, H, D } = ctx;
  const B = ctx.b;
  const w = Math.max(0.1, Math.min(W, 0.16)), h = Math.max(0.12, Math.min(H, 0.2)), d = Math.max(0.08, Math.min(D, 0.14));
  B.box(M('steelBare'), 0, h * 0.5, -d * 0.2, w * 1.3, h * 1.1, 0.02);       // mounting flange on crankcase door
  B.rbox(M('eqYellow'), 0, h * 0.5, d * 0.25, w, h, d * 0.7, 0.012);         // sensor housing
  B.box(M('black'), 0, h * 0.72, d * 0.61, w * 0.6, h * 0.18, 0.004);
  led(B, -w * 0.2, h * 0.3, d * 0.61, 'ledGreenBlink', 0.006);
  led(B, w * 0.2, h * 0.3, d * 0.61, 'ledAmber', 0.005);
  // cable gland and cable going down
  B.cyl(M('steelBare'), 0, -0.01, d * 0.25, 0.012, 0.04, 'y', 8);
  B.between(M('cableBlue'), [0, -0.02, d * 0.25], [0, -0.35, d * 0.4], 0.006, 5);
  ctx.tag(0, h * 1.2, d * 0.3, 0.09, { style: 'dark' });
}

export function oil_mist_detector_unit(ctx) {
  const { W, H, D } = ctx;
  const B = ctx.b;
  const wall = H < 1.4;
  const y0 = wall ? 0 : 0;
  cabinet(B, { w: W, h: H, d: D, mat: 'cab', plinth: wall ? 0.01 : 0.1, handles: 1 });
  const zf = D / 2 + 0.005;
  const L = ctx.V('legacy'), R = ctx.V('retrofit');
  const n = ctx.p.heads || 8;
  if (L) {
    // analogue bargraph per head with alarm lamps
    L.box(M('cabOld'), 0, H * 0.55, zf, W * 0.9, H * 0.7, 0.004);
    for (let i = 0; i < n; i++) {
      const x = -W * 0.38 + i * (W * 0.76) / Math.max(1, n - 1);
      L.box(M('black'), x, H * 0.62, zf + 0.004, W * 0.05, H * 0.35, 0.004);
      L.box(M('ledGreen'), x, H * 0.55, zf + 0.007, W * 0.03, H * 0.2, 0.002);
      L.sphere(M('ledRed'), x, H * 0.36, zf + 0.008, 0.01, 6);
    }
    pushButton(L, -W * 0.3, H * 0.22, zf, 'eqWhite'); pushButton(L, 0, H * 0.22, zf, 'eqYellow');
  }
  if (R) {
    R.box(M('black'), 0, H * 0.62, zf + 0.006, W * 0.6, H * 0.34, 0.012);
    ctx.screen(0, H * 0.62, zf + 0.013, W * 0.55, H * 0.3, { variant: 'retrofit', title: 'OMD' });
    for (let i = 0; i < Math.min(n, 12); i++) R.sphere(M(i === 3 ? 'ledAmber' : 'ledGreen'), -W * 0.35 + i * W * 0.7 / 11, H * 0.38, zf + 0.008, 0.008, 6);
    pushButton(R, -W * 0.2, H * 0.24, zf, 'eqWhite'); pushButton(R, W * 0.2, H * 0.24, zf, 'eqRed');
    R.box(M('accent'), 0, H - 0.03, zf, W * 0.96, 0.02, 0.004);
  }
  ctx.tag(0, H * 0.9, zf + 0.004, Math.min(0.3, W * 0.6));
  B.between(M('cableBlue'), [0, 0.02, -D * 0.2], [0, -0.2, -D * 0.2], 0.012, 6);
}

export function avr_unit(ctx) {
  const { W, H, D } = ctx;
  const B = ctx.b;
  B.box(M('steelBare'), 0, H / 2, -D / 2 + 0.01, W * 1.1, H * 1.1, 0.02); // back plate
  const L = ctx.V('legacy'), R = ctx.V('retrofit');
  if (L) {
    // analogue AVR: open chassis with transformer, heatsink, potentiometers
    L.box(M('cabOld'), 0, H / 2, 0, W, H, D * 0.9);
    L.box(M('black'), -W * 0.25, H * 0.4, D * 0.46, W * 0.3, H * 0.4, 0.01);
    for (let i = 0; i < 8; i++) L.box(M('steelBare'), W * 0.2, H * 0.2 + i * H * 0.08, D * 0.46, W * 0.35, 0.01, 0.04);
    for (let i = 0; i < 3; i++) L.cyl(M('black'), -W * 0.3 + i * W * 0.2, H * 0.82, D * 0.47, 0.012, 0.02, 'z', 10);
    led(L, W * 0.3, H * 0.85, D * 0.46, 'ledRed', 0.006);
  }
  if (R) {
    R.rbox(M('cabDark'), 0, H / 2, 0, W, H, D * 0.9, 0.01);
    for (let i = 0; i < 10; i++) R.box(M('steelBare'), 0, H * 0.1 + i * H * 0.03, -D * 0.2, W * 0.9, 0.006, D * 0.5); // heatsink fins
    R.box(M('black'), 0, H * 0.65, D * 0.455, W * 0.6, H * 0.3, 0.004);
    ctx.screen(0, H * 0.65, D * 0.46, W * 0.55, H * 0.25, { variant: 'retrofit', title: 'AVR' });
    for (let i = 0; i < 4; i++) led(R, -W * 0.3 + i * W * 0.2, H * 0.35, D * 0.46, i === 0 ? 'ledGreen' : 'ledWhite', 0.005);
    R.box(M('accent'), 0, H * 0.95, D * 0.455, W * 0.9, 0.01, 0.003);
  }
  // terminal strip bottom
  B.box(M('eqOrange'), 0, H * 0.06, D * 0.3, W * 0.8, H * 0.08, D * 0.3);
  ctx.tag(0, H * 1.08, D * 0.2, Math.min(0.2, W * 0.8));
}

export function governor_actuator(ctx) {
  const { W, H, D } = ctx;
  const B = ctx.b;
  const L = ctx.V('legacy'), R = ctx.V('retrofit');
  B.box(M('engineDark'), 0, 0.03, 0, W, 0.06, D); // mounting pad on the engine
  B.box(M('engineDark'), 0, -0.3, 0, W * 0.5, 0.6, D * 0.5); // bracket down to the fuel rack
  if (L) {
    // mechanical-hydraulic governor: tall housing with speed setting knob, load limit dial, drive
    L.rbox(M('black'), 0, H * 0.45, 0, W * 0.8, H * 0.78, D * 0.8, 0.03);
    L.cyl(M('black'), 0, H * 0.92, 0, W * 0.3, H * 0.12, 'y', 16);
    L.cyl(M('steelBare'), W * 0.25, H * 0.6, D * 0.42, W * 0.12, 0.03, 'z', 16);
    L.cyl(M('plateWhite'), -W * 0.2, H * 0.65, D * 0.41, W * 0.15, 0.01, 'z', 20);
    L.box(M('steelBare'), W * 0.45, H * 0.5, 0, 0.2, 0.04, 0.03);   // terminal shaft lever
  }
  if (R) {
    // electric actuator: cylindrical body with connector, linkage to fuel rack
    R.cyl(M('cabDark'), 0, H * 0.5, 0, Math.min(W, D) * 0.4, H * 0.75, 'y', 24);
    R.cyl(M('steelBare'), 0, H * 0.9, 0, Math.min(W, D) * 0.42, 0.04, 'y', 24);
    R.cyl(M('black'), Math.min(W, D) * 0.42, H * 0.7, 0, 0.03, 0.08, 'x', 10);
    R.between(M('cableBlack'), [Math.min(W, D) * 0.46, H * 0.7, 0], [Math.min(W, D) * 0.46, -0.3, 0], 0.012, 6);
    R.box(M('accent'), 0, H * 0.82, Math.min(W, D) * 0.4, 0.06, 0.02, 0.01);
  }
  // linkage to the fuel rack
  B.box(M('steelBare'), W * 0.45, H * 0.35, 0, 0.04, 0.04, D * 0.9);
  B.between(M('steelBare'), [W * 0.45, H * 0.35, D * 0.4], [W * 0.45, 0.05, D * 0.6], 0.015, 6);
  ctx.tag(0, H * 1.05, 0, 0.14, { style: 'dark' });
}

export function speed_controller_cabinet(ctx) {
  const { W, H, D, c } = ctx;
  const L = ctx.V('legacy'), R = ctx.V('retrofit');
  cabinet(ctx.b, { w: W, h: H, d: D, mat: 'cab', handles: Math.max(1, Math.round(W / 0.8)) });
  if (L) L.plane(faceFrom(TX.cabinetFrontTextures('generic', '', 'l', '#c9c4b0', Math.max(1, Math.round(W / 0.8)))), 0, 0.1 + (H - 0.1) / 2, D / 2 + 0.006, W - 0.02, H - 0.12);
  if (R) {
    R.plane(faceFrom(TX.cabinetFrontTextures('speed', '', 's', '#d4d6d2', Math.max(1, Math.round(W / 0.8)))), 0, 0.1 + (H - 0.1) / 2, D / 2 + 0.006, W - 0.02, H - 0.12);
    R.box(M('accent'), 0, H - 0.05, D / 2 + 0.008, W - 0.04, 0.025, 0.004);
    if (c.hmi || c.display) {
      const sy = H < 1 ? H * 0.45 : H * 0.6, sh = H < 1 ? H * 0.34 : H * 0.3;
      R.box(M('black'), -W * 0.15, sy, D / 2 + 0.012, W * 0.4, sh, 0.012);
      ctx.screen(-W * 0.15, sy, D / 2 + 0.019, W * 0.35, sh * 0.84, { variant: 'retrofit', title: 'SPEED CTRL' });
    }
  }
  ctx.tag(H < 1 ? W * 0.25 : 0, H < 1 ? H * 0.82 : H - 0.15, D / 2 + 0.01, Math.min(H < 1 ? 0.22 : 0.35, W * 0.4));
}

export function pump_motor(ctx) {
  const { W: L, H, D, p } = ctx;
  const B = ctx.b;
  const r = Math.min(H * 0.38, D * 0.4);
  B.box(M('steelDark'), 0, 0.08, 0, L, 0.16, D * 0.9);
  // motor at -X
  const mx0 = -L / 2 + 0.05, mx1 = mx0 + L * 0.5;
  B.cyl(M(p.motor_color || 'steelBlue'), (mx0 + mx1) / 2, 0.16 + r, 0, r, L * 0.42, 'x', 24);
  for (let i = 0; i < 10; i++) B.cyl(M(p.motor_color || 'steelBlue'), mx0 + 0.1 + i * L * 0.04, 0.16 + r, 0, r * 1.06, 0.015, 'x', 24);
  B.cyl(M('steelBlue'), mx0 + 0.02, 0.16 + r, 0, r * 0.95, 0.1, 'x', 24); // fan cowl
  B.box(M('steelBlue'), (mx0 + mx1) / 2, 0.16 + r * 2 + 0.08, 0, r * 0.8, r * 0.4, r * 0.8); // terminal box
  // coupling guard
  B.box(M('eqYellow'), mx1 + 0.1, 0.16 + r * 0.9, 0, 0.25, r * 1.2, r * 1.1);
  // centrifugal pump volute at +X with suction and discharge
  const px = mx1 + 0.35 + r * 0.6;
  B.cyl(M(p.pump_color || 'eqRed'), px, 0.16 + r, 0, r * 1.05, r * 0.7, 'x', 24);
  B.cyl(M(p.pump_color || 'eqRed'), px + r * 0.5, 0.16 + r, 0, r * 0.45, r * 0.8, 'x', 16);
  B.cyl(M(p.pump_color || 'eqRed'), px, 0.16 + r * 2.2, 0, r * 0.35, r * 0.8, 'y', 16);
  B.cyl(M('steelBare'), px, 0.16 + r * 2.65, 0, r * 0.55, 0.05, 'y', 16);
  const pipeMat = M(p.pipe || 'pipeSW');
  B.pipe(pipeMat, [[px, 0.16 + r * 2.7, 0], [px, Math.max(H, ctx.ceilH * 0.7), 0]], r * 0.33, 12);
  B.pipe(pipeMat, [[px + r * 0.9, 0.16 + r, 0], [px + r * 0.9 + 0.3, 0.16 + r, 0], [px + r * 0.9 + 0.3, 0.05, 0]], r * 0.4, 12);
  ctx.tag((mx0 + mx1) / 2, 0.16 + r, r + 0.01, Math.min(0.3, L * 0.2));
}

export { wallBracket };
