// Telecom racks and field devices: PAGA, PABX, IPTV, CCTV.
import * as THREE from 'three';
import { M, faceMat } from '../materials.js';
import * as TX from '../textures.js';
import { pushButton, led, wallBracket } from './common.js';

function rack(ctx, kind) {
  const { W, H, D, c, p } = ctx;
  const B = ctx.b;
  const n = Math.max(1, Math.round(p.racks || W / 0.6));
  const rw = W / n;
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + (i + 0.5) * rw;
    B.box(M('black'), x, 0.05, 0, rw - 0.01, 0.1, D - 0.02);
    B.rbox(M('cabDark'), x, H / 2 + 0.05, 0, rw - 0.006, H - 0.1, D, 0.008);
    // front: rack equipment texture behind a perforated door frame
    const tex = TX.rackFrontTextures(kind, 's' + (i % 3));
    B.plane(faceMat(tex.map, tex.emissive, { roughness: 0.4, emissiveIntensity: 1.6 }), x, H / 2 + 0.05, D / 2 + 0.004, rw - 0.07, H - 0.2);
    B.box(M('black'), x - rw / 2 + 0.02, H / 2 + 0.05, D / 2 + 0.01, 0.03, H - 0.12, 0.02);
    B.box(M('black'), x + rw / 2 - 0.02, H / 2 + 0.05, D / 2 + 0.01, 0.03, H - 0.12, 0.02);
    B.box(M('black'), x, H - 0.03, D / 2 + 0.01, rw - 0.02, 0.05, 0.02);
    B.box(M('chrome'), x + rw / 2 - 0.05, H * 0.5, D / 2 + 0.025, 0.015, 0.2, 0.02);
    // roof fans and cable entry
    B.cyl(M('black'), x - rw * 0.2, H + 0.002, 0, 0.06, 0.004, 'y', 16);
    B.cyl(M('black'), x + rw * 0.2, H + 0.002, 0, 0.06, 0.004, 'y', 16);
    B.box(M('black'), x, H + 0.01, -D * 0.35, rw * 0.6, 0.02, 0.1);
    for (let k = 0; k < 3; k++) B.between(M(k === 1 ? 'fibreYellow' : 'cableBlue'), [x - 0.1 + k * 0.1, H, -D * 0.35], [x - 0.1 + k * 0.1, Math.min(ctx.ceilH - 0.5, H + 0.8), -D * 0.35], 0.012, 6);
    ctx.tag(x, H - 0.12, D / 2 + 0.022, Math.min(0.2, rw * 0.6), { text: n > 1 ? `${c.tag || c.id}.${i + 1}` : (c.tag || c.id) });
  }
  if (c.hmi || c.display) {
    // rack mounted monitor or management screen (e.g. NVR / PAGA controller)
    ctx.screen(-W / 2 + rw / 2, H * 0.6, D / 2 + 0.03, rw * 0.6, rw * 0.36, { kind: kind === 'nvr' ? 'cctv' : 'hmi', title: c.tag });
  }
}

export function telecom_rack_19in(ctx) { rack(ctx, ctx.p.rack_kind || 'telecom'); }
export function paga_amplifier_rack(ctx) { rack(ctx, 'paga'); }
export function pabx_rack(ctx) { rack(ctx, 'pabx'); }
export function iptv_headend_rack(ctx) { rack(ctx, 'iptv'); }
export function nvr_rack(ctx) { rack(ctx, 'nvr'); }

export function paga_access_panel(ctx) {
  const { W, H, D } = ctx;
  const B = ctx.b;
  const desk = H < 0.4;
  const w = Math.min(W, 0.4), h = Math.min(H, desk ? 0.12 : 0.45), d = Math.min(D, 0.2);
  const y0 = desk ? 0 : Math.max(0, H - h);
  if (!desk && y0 > 0.3) wallBracket(B, 0, y0 + h / 2, -d / 2, 0.05);
  B.rbox(M('cabDark'), 0, y0 + h / 2, 0, w, h, d, 0.01);
  B.box(M('black'), 0, y0 + h * 0.72, d / 2 + 0.002, w * 0.6, h * 0.18, 0.004);
  ctx.screen(0, y0 + h * 0.72, d / 2 + 0.005, w * 0.55, h * 0.14, { title: 'PAGA' });
  for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) B.box(M('cabGrey'), -w * 0.3 + k * w * 0.2, y0 + h * 0.45 - r * h * 0.12, d / 2 + 0.006, w * 0.14, h * 0.08, 0.012);
  pushButton(B, w * 0.38, y0 + h * 0.2, d / 2, 'eqRed', 0.02);
  // gooseneck microphone
  B.cyl(M('black'), -w * 0.35, y0 + h + 0.01, 0, 0.03, 0.02, 'y', 10);
  B.pipe(M('black'), [[-w * 0.35, y0 + h, 0], [-w * 0.35, y0 + h + 0.22, 0.02], [-w * 0.3, y0 + h + 0.32, 0.12]], 0.006, 6);
  B.sphere(M('black'), -w * 0.3, y0 + h + 0.33, 0.13, 0.02, 8);
  ctx.tag(0, y0 - 0.04, d / 2, 0.14);
}

export function loudspeaker_horn(ctx) {
  const { H, D } = ctx;
  const B = ctx.b;
  const r = Math.max(0.12, Math.min(ctx.W, H) * 0.45);
  const y = H * 0.55;
  wallBracket(B, 0, y, -D / 2 + 0.02, 0.06);
  B.box(M('steelBare'), 0, y, -D * 0.2, 0.04, r * 1.2, 0.04);
  B.cyl(M('cabGrey'), 0, y, -D * 0.1, r * 0.35, D * 0.3, 'z', 16);     // driver
  B.cone(M('cabGrey'), 0, y, D * 0.2, r * 0.3, r, D * 0.5, 'z', 20);    // flare opens forward
  B.add(M('black'), new THREE.CircleGeometry(r * 0.95, 20), new THREE.Matrix4().makeTranslation(0, y, D * 0.45 + 0.002));
  ctx.tag(0, y - r - 0.05, 0, 0.12, { style: 'dark' });
}

export function loudspeaker_ceiling(ctx) {
  const { W } = ctx;
  const B = ctx.b;
  const r = Math.max(0.1, W * 0.45);
  B.cyl(M('eqWhite'), 0, 0.03, 0, r, 0.06, 'y', 24);
  B.cyl(M('cabGrey'), 0, 0.001, 0, r * 0.8, 0.004, 'y', 24);
}

export function alarm_beacon(ctx) {
  const { W, H, D, p } = ctx;
  const B = ctx.b;
  const r = Math.max(0.05, Math.min(W, D) * 0.4);
  const col = { red: 'beaconRed', amber: 'beaconAmber', yellow: 'beaconAmber', blue: 'beaconBlue' }[(p.colour || p.color || 'red').toLowerCase()] || 'beaconRed';
  const wall = !!p.wall_mounted || H > r * 4;
  const y0 = wall ? H * 0.4 : 0;
  if (wall) wallBracket(B, 0, y0, -D / 2 + 0.02, 0.05);
  B.cyl(M('eqRed'), 0, y0 + 0.04, 0, r * 1.1, 0.08, 'y', 16);
  B.cyl(M(col), 0, y0 + 0.08 + r * 0.7, 0, r * 0.85, r * 1.4, 'y', 16);
  B.head(M(col), 0, y0 + 0.08 + r * 1.4, 0, r * 0.85, r * 0.6, 'y', 1, 16);
  for (let k = 0; k < 4; k++) B.box(M('steelBare'), 0, y0 + 0.08 + r * 0.7, 0, r * 1.75, r * 1.3, 0.01, k * Math.PI / 4);
  if (p.sounder !== false) B.cyl(M('eqRed'), 0, y0 - 0.06, 0, r * 0.9, 0.12, 'y', 16);
}

export function telephone_industrial(ctx) {
  const { W, H, D, p } = ctx;
  const B = ctx.b;
  const hood = p.acoustic_hood !== false && H > 1.0;
  const y = Math.min(H - 0.3, 1.4);
  if (hood) {
    // acoustic hood for noisy spaces
    B.rbox(M('eqYellow'), 0, y, 0, Math.max(0.5, W), 0.7, Math.max(0.4, D), 0.05);
    B.box(M('black'), 0, y, Math.max(0.4, D) / 2 - 0.01, Math.max(0.5, W) - 0.08, 0.62, 0.02);
  }
  B.rbox(M('eqOrange'), 0, y, -0.05, 0.22, 0.3, 0.12, 0.015);
  B.box(M('black'), 0.0, y + 0.02, 0.015, 0.06, 0.24, 0.05); // handset
  for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) B.box(M('cabGrey'), -0.07 + k * 0.035, y - 0.05 - r * 0.025, 0.012, 0.025, 0.018, 0.005);
  led(B, 0.08, y + 0.12, 0.012, 'ledGreen', 0.005);
  B.pipe(M('black'), [[0, y - 0.1, 0.03], [0.05, y - 0.2, 0.05], [0, y - 0.1, 0.01]], 0.006, 5);
  ctx.tag(0, y + 0.4, 0.05, 0.14);
}

export function telephone_desk(ctx) {
  const B = ctx.b;
  B.rbox(M('black'), 0, 0.04, 0, 0.22, 0.06, 0.2, 0.015);
  B.rbox(M('black'), -0.07, 0.09, 0, 0.05, 0.04, 0.2, 0.015);
  B.box(M('cabGrey'), 0.04, 0.072, 0.02, 0.1, 0.004, 0.12);
  ctx.screen(0.04, 0.08, -0.06, 0.08, 0.04, { rx: -Math.PI / 3, title: 'EXT' });
}

export function tv_display(ctx) {
  const { W, H, D } = ctx;
  const B = ctx.b;
  const w = Math.max(0.4, W), h = Math.min(H, w * 0.58);
  const y = Math.max(h / 2, H - h / 2);
  if (y > h) wallBracket(B, 0, y, -D / 2 + 0.02, 0.05);
  B.rbox(M('black'), 0, y, 0, w, h, 0.05, 0.008);
  ctx.screen(0, y, 0.027, w - 0.03, h - 0.03, { kind: 'tv', title: 'IPTV' });
  led(B, w / 2 - 0.03, y - h / 2 + 0.01, 0.026, 'ledRed', 0.003);
}

export function satellite_antenna_dome(ctx) {
  const { W, H } = ctx;
  const B = ctx.b;
  const r = Math.max(0.3, W * 0.5);
  const ped = Math.max(0.4, H - r * 1.9);
  B.cyl(M('steelBare'), 0, ped / 2, 0, r * 0.18, ped, 'y', 12);
  B.cyl(M('steelBare'), 0, 0.02, 0, r * 0.4, 0.04, 'y', 12);
  B.cyl(M('eqWhite'), 0, ped + 0.05, 0, r * 0.95, 0.1, 'y', 24);
  B.sphere(M('eqWhite'), 0, ped + 0.1 + r * 0.92, 0, r, 24, 1, 0.95, 1);
  ctx.tag(0, ped * 0.6, r * 0.19, 0.14, { style: 'dark' });
}

export function cctv_camera_fixed(ctx) {
  const { W, H, D } = ctx;
  const B = ctx.b;
  const y = Math.max(0.15, H * 0.6);
  wallBracket(B, 0, y, -Math.max(D, 0.3) / 2, 0.15);
  B.box(M('steelBare'), 0, y + 0.06, -0.05, 0.05, 0.1, 0.05);
  B.push(new THREE.Matrix4().makeRotationX(0.25).setPosition(0, y + 0.13, 0.05));
  B.rbox(M('eqWhite'), 0, 0, 0, 0.11, 0.1, 0.32, 0.02);
  B.box(M('eqWhite'), 0, 0.065, 0.02, 0.15, 0.01, 0.38); // sunshield
  B.cyl(M('glass'), 0, 0, 0.161, 0.035, 0.004, 'z', 16);
  B.pop();
  void W;
}

export function cctv_camera_ptz(ctx) {
  const { H, D } = ctx;
  const B = ctx.b;
  const y = Math.max(0.3, H * 0.75);
  wallBracket(B, 0, y, -Math.max(D, 0.3) / 2, 0.25);
  B.box(M('steelBare'), 0, y, -0.02, 0.06, 0.06, 0.08);
  B.cyl(M('eqWhite'), 0, y - 0.05, 0.05, 0.08, 0.1, 'y', 20);
  B.head(M('glass'), 0, y - 0.1, 0.05, 0.075, 0.075, 'y', -1, 20);
}

export { wallBracket };
