// Electrical equipment: switchboards, relays, generator control, PMS, drives, MCC, UPS, cabinets.
import { M, faceMat } from '../materials.js';
import * as TX from '../textures.js';
import { cabinet, faceFrom, gaugeRow, pushButton, eStop, led, mat as rubberMat } from './common.js';

const clampI = (v, a, b) => Math.max(a, Math.min(b, Math.round(v)));

function sectionsOf(ctx, unit = 0.8) {
  const s = ctx.p.sections;
  if (Array.isArray(s)) return clampI(s.length, 1, 40);
  if (typeof s === 'number') return clampI(s, 1, 40);
  return clampI(ctx.W / unit, 1, 40);
}
function sectionLabel(ctx, i, n) {
  const l = ctx.p.section_labels || (Array.isArray(ctx.p.sections) ? ctx.p.sections : null);
  if (Array.isArray(l) && l[i]) return String(l[i]).toUpperCase().slice(0, 18);
  return n > 1 ? `${ctx.c.tag || ctx.c.id}.${i + 1}` : (ctx.c.tag || ctx.c.id);
}

// Lineup of cubicles with variant faces. kind 'mv' | 'lv'
function lineup(ctx, kind) {
  const { W, H, D } = ctx;
  const n = sectionsOf(ctx, kind === 'mv' ? 0.8 : 0.6);
  const sw = W / n;
  const B = ctx.b;
  const L = ctx.V('legacy'), R = ctx.V('retrofit');
  const legacyColor = ctx.p.legacy_color || '#c9c4b0';
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + (i + 0.5) * sw;
    cabinet(B, { x, w: sw - 0.004, h: H, d: D, mat: 'cab', handles: 0, roof: false });
    const y = 0.1 + (H - 0.1) / 2, z = D / 2 + 0.006;
    if (L) L.plane(faceFrom(TX.switchboardFrontTextures(kind, 'legacy', '', 'l' + (i % 3), legacyColor)), x, y, z, sw - 0.02, H - 0.12);
    if (R) R.plane(faceFrom(TX.switchboardFrontTextures(kind, 'retrofit', '', 'r' + (i % 3))), x, y, z, sw - 0.02, H - 0.12);
    // door handles (3D)
    for (const hy of kind === 'mv' ? [0.62, 0.3] : [0.75, 0.45, 0.2]) B.box(M('chrome'), x + sw * 0.38, H * hy, D / 2 + 0.03, 0.02, 0.12, 0.03);
    if (kind === 'mv') {
      // racking shutter handle and pressure relief flap on top
      B.cyl(M('black'), x, H * 0.37, D / 2 + 0.02, 0.025, 0.03, 'z', 10);
      B.box(M('cabGrey'), x, H + 0.02, -D * 0.1, sw * 0.8, 0.03, D * 0.5);
    }
    ctx.tag(x, H * (kind === 'mv' ? 0.965 : 0.97), D / 2 + 0.012, Math.min(0.22, sw * 0.6), { text: sectionLabel(ctx, i, n) });
  }
  // lineup roof: arc duct (MV) / cable entry box, end covers
  if (kind === 'mv') B.box(M('cabGrey'), 0, H + 0.2, -D * 0.25, W, 0.35, D * 0.45);
  B.box(M('cab'), -W / 2 - 0.01, H / 2, 0, 0.02, H, D);
  B.box(M('cab'), W / 2 + 0.01, H / 2, 0, 0.02, H, D);
  // busbar mimic band across the lineup (retrofit: blue accent trim)
  if (R) R.box(M('accent'), 0, H - 0.02, D / 2 + 0.01, W, 0.025, 0.006);
  rubberMat(B, W, 1.0, D / 2 + 0.55);
  // cables leaving the top into the trays
  for (let i = 0; i < n; i += 2) B.between(M(kind === 'mv' ? 'cableOrange' : 'cableBlack'), [-W / 2 + (i + 0.5) * sw, H + 0.02, -D * 0.35], [-W / 2 + (i + 0.5) * sw, Math.min(ctx.ceilH - 0.6, H + 1.2), -D * 0.35], 0.03, 6);
}

export function mv_switchboard_panel(ctx) { lineup(ctx, 'mv'); }
export function lv_switchboard_panel(ctx) { lineup(ctx, 'lv'); }

export function mcc_lineup(ctx) { lineup(ctx, 'lv'); }

// Numerical protection relay (retrofit) vs electromechanical relay case (legacy), flush on a door.
export function protection_relay_ied(ctx) {
  const { W, H, D } = ctx;
  const w = Math.min(W, 0.4), h = Math.min(H, 0.32), d = Math.min(D, 0.25);
  const L = ctx.V('legacy'), R = ctx.V('retrofit');
  if (L) {
    // induction disc relay cases: glass front, disc and flag
    const n = Math.max(1, Math.round(w / 0.13));
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (i + 0.5) * w / n;
      L.box(M('black'), x, h / 2, 0, w / n - 0.01, h, d);
      L.box(M('glass'), x, h / 2, d / 2 + 0.002, w / n - 0.025, h - 0.02, 0.004);
      L.cyl(M('chrome'), x, h * 0.55, d / 2 - 0.02, (w / n) * 0.3, 0.004, 'z', 20);
      L.box(M('eqOrange'), x, h * 0.2, d / 2 - 0.01, 0.02, 0.012, 0.004);
    }
  }
  if (R) {
    R.rbox(M('cabDark'), 0, h / 2, 0, w, h, d, 0.008);
    R.box(M('cabGrey'), 0, h / 2, d / 2 + 0.002, w * 0.96, h * 0.96, 0.004);
    R.box(M('black'), -w * 0.12, h * 0.62, d / 2 + 0.005, w * 0.55, h * 0.4, 0.004);
    ctx.screen(-w * 0.12, h * 0.62, d / 2 + 0.008, w * 0.5, h * 0.34, { variant: 'retrofit', title: 'IED' });
    for (let i = 0; i < 8; i++) led(R, w * 0.32, h * 0.88 - i * h * 0.075, d / 2 + 0.006, i === 0 ? 'ledGreen' : i === 2 ? 'ledAmber' : 'ledRed', 0.004);
    for (let i = 0; i < 5; i++) R.box(M('black'), -w * 0.32 + i * w * 0.11, h * 0.2, d / 2 + 0.008, 0.035, 0.025, 0.008);
    R.box(M('accent'), 0, h * 0.06, d / 2 + 0.006, w * 0.9, 0.01, 0.003);
  }
  ctx.tag(0, h + 0.03, d / 2, Math.min(0.16, w * 0.7));
}

// Generator control section(s): legacy analogue meters + synchroscope / retrofit genset controller HMI.
export function generator_control_panel(ctx) {
  const { W, H, D } = ctx;
  const n = sectionsOf(ctx, 0.8);
  const sw = W / n;
  const B = ctx.b;
  const L = ctx.V('legacy'), R = ctx.V('retrofit');
  const gA = faceMat(TX.gaugeTexture('A')), gV = faceMat(TX.gaugeTexture('kV')), gW = faceMat(TX.gaugeTexture('kW')), gH = faceMat(TX.gaugeTexture('Hz')), gS = faceMat(TX.gaugeTexture('SYNC'));
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + (i + 0.5) * sw;
    const z = D / 2 + 0.006;
    cabinet(B, { x, w: sw - 0.004, h: H, d: D, mat: 'cab', handles: 1, roof: false });
    if (L) {
      L.plane(M('cabOld'), x, H * 0.55, z, sw - 0.02, H * 0.9);
      gaugeRow(L, gA, x - sw * 0.3, H * 0.84, z, 3, sw * 0.3, sw * 0.1);
      gaugeRow(L, gW, x - sw * 0.15, H * 0.72, z, 2, sw * 0.3, sw * 0.1);
      if (i === Math.floor(n / 2)) gaugeRow(L, gS, x, H * 0.58, z, 1, 0, sw * 0.16);
      else gaugeRow(L, i % 2 ? gH : gV, x - sw * 0.15, H * 0.58, z, 2, sw * 0.3, sw * 0.09);
      for (let k = 0; k < 4; k++) L.sphere(M(['ledGreen', 'ledRed', 'ledAmber', 'ledWhite'][k]), x - sw * 0.3 + k * sw * 0.2, H * 0.46, z + 0.01, 0.014, 8);
      for (let k = 0; k < 3; k++) { L.cyl(M('black'), x - sw * 0.25 + k * sw * 0.25, H * 0.38, z + 0.015, 0.025, 0.03, 'z', 12); L.box(M('eqWhite'), x - sw * 0.25 + k * sw * 0.25, H * 0.38, z + 0.035, 0.012, 0.05, 0.01); }
    }
    if (R) {
      R.plane(M('cab'), x, H * 0.55, z, sw - 0.02, H * 0.9);
      R.box(M('black'), x, H * 0.72, z + 0.008, sw * 0.62, sw * 0.46, 0.016);
      ctx.screen(x, H * 0.72, z + 0.018, sw * 0.56, sw * 0.4, { variant: 'retrofit', title: 'GEN ' + (i + 1) });
      for (let k = 0; k < 4; k++) pushButton(R, x - sw * 0.27 + k * sw * 0.18, H * 0.52, z, ['green', 'eqRed', 'eqWhite', 'eqYellow'][k], 0.015);
      for (let k = 0; k < 6; k++) led(R, x - sw * 0.3 + k * sw * 0.12, H * 0.45, z + 0.004, k === 0 ? 'ledGreen' : 'ledWhite', 0.006);
      R.box(M('accent'), x, H - 0.03, z + 0.004, sw - 0.04, 0.02, 0.004);
    }
    ctx.tag(x, H * 0.95, D / 2 + 0.012, Math.min(0.22, sw * 0.6), { text: sectionLabel(ctx, i, n) });
  }
  rubberMat(B, W, 1.0, D / 2 + 0.55);
}

export function synchroniser_panel(ctx) {
  const { W, H, D } = ctx;
  const B = ctx.b;
  cabinet(B, { w: W, h: H, d: D, mat: 'cab', handles: 1 });
  const z = D / 2 + 0.006;
  const L = ctx.V('legacy'), R = ctx.V('retrofit');
  if (L) {
    L.plane(M('cabOld'), 0, H * 0.55, z, W - 0.02, H * 0.9);
    gaugeRow(L, faceMat(TX.gaugeTexture('SYNC')), 0, H * 0.78, z, 1, 0, W * 0.16);
    gaugeRow(L, faceMat(TX.gaugeTexture('V')), -W * 0.22, H * 0.6, z, 2, W * 0.44, W * 0.1);
    gaugeRow(L, faceMat(TX.gaugeTexture('Hz')), -W * 0.22, H * 0.46, z, 2, W * 0.44, W * 0.1);
    for (let k = 0; k < 3; k++) L.sphere(M('ledWhite'), -W * 0.2 + k * W * 0.2, H * 0.36, z + 0.01, 0.015, 8);
    pushButton(L, 0, H * 0.28, z, 'green');
  }
  if (R) {
    R.plane(M('cab'), 0, H * 0.55, z, W - 0.02, H * 0.9);
    R.box(M('black'), 0, H * 0.7, z + 0.006, W * 0.5, W * 0.36, 0.012);
    ctx.screen(0, H * 0.7, z + 0.013, W * 0.45, W * 0.3, { variant: 'retrofit', title: 'AUTO SYNC' });
    for (let k = 0; k < 3; k++) led(R, -W * 0.2 + k * W * 0.2, H * 0.5, z + 0.004, k ? 'ledWhite' : 'ledGreen', 0.007);
    R.box(M('accent'), 0, H - 0.03, z + 0.004, W - 0.04, 0.02, 0.004);
  }
  ctx.tag(0, H * 0.95, z + 0.006, Math.min(0.25, W * 0.5));
}

function genericCab(ctx, kind, { color = '#d4d6d2', legacyKind = 'generic', legacyColor = '#c9c4b0', screen = false, screenTitle = '', accent = true } = {}) {
  const { W, H, D } = ctx;
  const doors = clampI(ctx.p.doors || W / 0.8, 1, 4);
  const B = ctx.b;
  cabinet(B, { w: W, h: H, d: D, mat: 'cab', handles: doors, seams: doors });
  const z = D / 2 + 0.006, y = 0.1 + (H - 0.1) / 2;
  const L = ctx.V('legacy'), R = ctx.V('retrofit');
  if (L) L.plane(faceFrom(TX.cabinetFrontTextures(legacyKind, '', 'l', legacyColor, doors)), 0, y, z, W - 0.02, H - 0.12);
  if (R) {
    R.plane(faceFrom(TX.cabinetFrontTextures(kind, '', 'r', color, doors)), 0, y, z, W - 0.02, H - 0.12);
    if (screen) {
      const dw = W / doors;
      const sx = -W / 2 + dw / 2;
      R.box(M('black'), sx, H * 0.75, z + 0.008, dw * 0.66, dw * 0.44, 0.016);
      ctx.screen(sx, H * 0.75, z + 0.018, dw * 0.6, dw * 0.38, { variant: 'retrofit', title: screenTitle || ctx.c.tag });
    }
    if (accent) R.box(M('accent'), 0, H - 0.05, z + 0.003, W - 0.04, 0.025, 0.004);
  }
  ctx.tag(-W / 2 + Math.min(0.8, W) / 2, H - 0.12, z + 0.008, Math.min(0.32, W * 0.4));
  return { doors, z, L, R };
}

export function pms_cabinet(ctx) {
  const { L } = genericCab(ctx, 'pms', { screen: true, screenTitle: 'PMS' });
  if (L) {
    // relay logic panel: lamp matrix and selector switches
    const { W, H, D } = ctx;
    const z = D / 2 + 0.01;
    for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) L.sphere(M(['ledGreen', 'ledAmber', 'ledRed', 'ledWhite'][(r + k) % 4]), -W * 0.38 + k * W * 0.15, H * 0.8 - r * 0.08, z, 0.012, 8);
  }
}
export function control_cabinet(ctx) { genericCab(ctx, 'control', { screen: !!(ctx.c.hmi || ctx.c.display) }); }
export function marshalling_cabinet(ctx) { genericCab(ctx, 'marshalling', { accent: false }); }
export function safety_controller_cabinet(ctx) { genericCab(ctx, 'safety', { color: '#d4d6d2', screen: !!(ctx.c.hmi || ctx.c.display) }); }
export function generic_cabinet(ctx) { genericCab(ctx, 'generic', { screen: !!(ctx.c.hmi || ctx.c.display) }); }
export function ups_cabinet(ctx) {
  const { W, H, D } = ctx;
  genericCab(ctx, 'control', { screen: true, screenTitle: 'UPS' });
  for (let i = 0; i < 6; i++) ctx.b.box(M('black'), 0, H * 0.2 + i * 0.04, D / 2 + 0.008, W * 0.7, 0.015, 0.004);
}

export function vfd_cabinet(ctx) {
  const { W, H, D } = ctx;
  const n = sectionsOf(ctx, 0.8);
  const sw = W / n;
  const B = ctx.b;
  const L = ctx.V('legacy'), R = ctx.V('retrofit');
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + (i + 0.5) * sw;
    cabinet(B, { x, w: sw - 0.004, h: H, d: D, mat: 'cab', handles: 1, roof: false });
    const z = D / 2 + 0.006, y = 0.1 + (H - 0.1) / 2;
    if (R) {
      R.plane(faceFrom(TX.cabinetFrontTextures('vfd', '', 'v' + (i % 2), '#d4d6d2', 1)), x, y, z, sw - 0.02, H - 0.12);
      // drive keypad display on the control section (last section, or the only one)
      if (i === n - 1 && (ctx.c.hmi || ctx.c.display)) {
        const ky = 0.1 + (H - 0.1) * (1 - 148 / 1024);
        R.box(M('black'), x, ky, z + 0.006, sw * 0.42, sw * 0.24, 0.012);
        ctx.screen(x, ky, z + 0.013, sw * 0.36, sw * 0.18, { variant: 'retrofit', title: 'VFD' });
      }
    }
    if (L) {
      // legacy starter: contactor panel with ammeter, lamps and start/stop
      L.plane(faceFrom(TX.cabinetFrontTextures('generic', '', 'l', '#c9c4b0', 1)), x, y, z, sw - 0.02, H - 0.12);
      gaugeRow(L, faceMat(TX.gaugeTexture('A')), x, H * 0.74, z, 1, 0, sw * 0.12);
      pushButton(L, x - sw * 0.15, H * 0.6, z, 'green'); pushButton(L, x + sw * 0.15, H * 0.6, z, 'eqRed');
    }
    // roof fan units
    B.box(M('cab'), x, H + 0.08, 0, sw * 0.8, 0.16, D * 0.7);
    B.cyl(M('black'), x, H + 0.165, 0, sw * 0.28, 0.01, 'y', 20);
    for (let k = 0; k < 4; k++) B.box(M('steelBare'), x, H + 0.17, 0, sw * 0.56, 0.004, 0.01, k * Math.PI / 4);
    ctx.tag(x, H * 0.96, D / 2 + 0.012, Math.min(0.22, sw * 0.6), { text: sectionLabel(ctx, i, n) });
  }
  if (R) R.box(M('accent'), 0, H - 0.05, D / 2 + 0.01, W - 0.04, 0.025, 0.004);
}

export function transformer(ctx) {
  const { W, H, D } = ctx;
  const B = ctx.b;
  // dry type in ventilated enclosure: louvred sides, cable boxes on top
  B.box(M('black'), 0, 0.05, 0, W - 0.04, 0.1, D - 0.04);
  B.rbox(M('cabGrey'), 0, H / 2 + 0.05, 0, W, H - 0.1, D, 0.015);
  for (const s of [-1, 1]) for (let i = 0; i < 12; i++) B.box(M('black'), 0, H * 0.15 + i * H * 0.06, s * (D / 2 + 0.003), W * 0.8, 0.02, 0.004);
  for (let i = 0; i < 12; i++) B.box(M('black'), W / 2 + 0.003, H * 0.15 + i * H * 0.06, 0, 0.004, 0.02, D * 0.8);
  B.box(M('cabGrey'), -W * 0.25, H + 0.2, 0, W * 0.35, 0.4, D * 0.5);
  B.box(M('cabGrey'), W * 0.25, H + 0.2, 0, W * 0.35, 0.4, D * 0.5);
  B.box(M('eqYellow'), 0, H * 0.75, D / 2 + 0.006, 0.3, 0.2, 0.004);
  for (let i = 0; i < 3; i++) B.between(M('cableOrange'), [-W * 0.3 + i * 0.1, H + 0.4, 0], [-W * 0.3 + i * 0.1, Math.min(ctx.ceilH - 0.6, H + 1.4), 0], 0.035, 6);
  ctx.tag(0, H * 0.88, D / 2 + 0.008, Math.min(0.35, W * 0.4));
}

export function battery_rack(ctx) {
  const { W, H, D } = ctx;
  const B = ctx.b;
  const tiers = clampI(ctx.p.tiers || H / 0.45, 1, 6);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(M('steelDark'), sx * (W / 2 - 0.02), H / 2, sz * (D / 2 - 0.02), 0.04, H, 0.04);
  const nb = Math.max(2, Math.round(W / 0.22));
  for (let t = 0; t < tiers; t++) {
    const y = 0.1 + t * (H - 0.1) / tiers;
    B.box(M('steelDark'), 0, y, 0, W, 0.03, D);
    for (let i = 0; i < nb; i++) {
      const x = -W / 2 + (i + 0.5) * W / nb;
      B.rbox(M('black'), x, y + 0.17, 0, W / nb - 0.02, 0.3, D * 0.8, 0.01);
      B.cyl(M('eqRed'), x - 0.04, y + 0.33, D * 0.2, 0.012, 0.03, 'y', 8);
      B.cyl(M('black'), x + 0.04, y + 0.33, D * 0.2, 0.012, 0.03, 'y', 8);
    }
    B.box(M('copper'), 0, y + 0.345, D * 0.2, W * 0.95, 0.01, 0.02);
  }
  ctx.tag(0, H + 0.05, D / 2, 0.25);
}

export function field_junction_box(ctx) {
  const { W, H, D } = ctx;
  const B = ctx.b;
  const w = Math.min(W, 0.6), h = Math.min(H, 0.6), d = Math.min(D, 0.25);
  const stand = H > 0.9;
  const y0 = stand ? H - h : 0;
  if (stand) { B.box(M('steelBare'), 0, y0 / 2, -d * 0.3, 0.06, y0, 0.06); B.box(M('steelBare'), 0, 0.01, -d * 0.3, 0.3, 0.02, 0.3); }
  B.rbox(M('chrome'), 0, y0 + h / 2, 0, w, h, d, 0.01);
  B.box(M('steelBare'), 0, y0 + h / 2, d / 2 + 0.004, w * 0.9, h * 0.9, 0.006);
  for (let i = 0; i < 4; i++) {
    const x = -w * 0.3 + i * w * 0.2;
    B.cyl(M('steelBare'), x, y0 - 0.02, 0, 0.018, 0.04, 'y', 10);
    B.between(M('cableBlack'), [x, y0 - 0.04, 0], [x, y0 - 0.3, -d * 0.4], 0.01, 6);
  }
  ctx.tag(0, y0 + h * 0.8, d / 2 + 0.01, Math.min(0.16, w * 0.6), { style: 'warn' });
}
