// Operator stations: consoles, desks, display walls, CCTV monitoring desk.
import * as THREE from 'three';
import { M } from '../materials.js';
import { pushButton, eStop, led } from './common.js';

function chair(B, x, z, ry = 0) {
  B.push(new THREE.Matrix4().makeRotationY(ry).setPosition(x, 0, z));
  B.cyl(M('black'), 0, 0.03, 0, 0.3, 0.04, 'y', 5);
  B.cyl(M('steelBare'), 0, 0.25, 0, 0.03, 0.4, 'y', 8);
  B.rbox(M('cabDark'), 0, 0.48, 0, 0.5, 0.09, 0.48, 0.03);
  B.rbox(M('cabDark'), 0, 0.82, -0.23, 0.48, 0.6, 0.07, 0.03);
  for (const s of [-1, 1]) B.box(M('black'), s * 0.26, 0.62, -0.02, 0.05, 0.04, 0.35);
  B.pop();
}

function monitor(ctx, B, x, y, z, w, h, opts = {}) {
  // slim bezel monitor with stand; screen recorded on ctx
  B.rbox(M('black'), x, y, z, w + 0.03, h + 0.03, 0.035, 0.006);
  if (!opts.noStand) {
    B.box(M('black'), x, y - h / 2 - 0.12, z - 0.04, 0.05, 0.25, 0.03);
    B.box(M('black'), x, opts.base ?? (y - h / 2 - 0.24), z - 0.02, 0.25, 0.015, 0.18);
  }
  ctx.screen(x, y, z + 0.019, w, h, { ry: opts.ry || 0, kind: opts.kind || 'hmi', variant: opts.variant || null, title: opts.title });
}

// Control room console: sloped desktop, monitor bank, keyboards, chairs.
export function operator_console(ctx) {
  const { W, H, D, c, p } = ctx;
  const B = ctx.b;
  const deskH = 0.74;
  const n = Math.max(1, (c.display && c.display.count) || p.monitors || Math.max(2, Math.round(W / 0.7)));
  // pedestal body
  B.rbox(M('cabGrey'), 0, deskH / 2, -D * 0.1, W, deskH, D * 0.6, 0.02);
  B.rbox(M('cabDark'), 0, deskH + 0.02, 0, W + 0.04, 0.04, D, 0.015);
  B.box(M('black'), 0, deskH + 0.045, D * 0.42, W, 0.01, 0.06); // arm rest edge
  // rear instrument riser
  const riseH = Math.max(0.3, H - deskH);  // riser top = envelope top (accessory shelf used by db items)
  B.rbox(M('cabGrey'), 0, deskH + riseH / 2, -D * 0.38, W, riseH, D * 0.22, 0.015);
  const L = ctx.V('legacy'), R = ctx.V('retrofit');
  const mw = Math.min(0.6, (W - 0.1) / n - 0.04), mh = mw * 0.6;
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + (i + 0.5) * W / n;
    const yy = deskH + 0.32 + mh / 2;
    if (R) monitor(ctx, R, x, yy, -D * 0.18, mw, mh, { base: deskH + 0.05, variant: 'retrofit', title: c.tag });
    if (L) {
      // legacy CRT style monitors (deep bodies)
      L.rbox(M('cabOld'), x, yy - 0.02, -D * 0.25, mw * 0.85, mh * 1.05, 0.45, 0.03);
      ctx.screen(x, yy - 0.02, -D * 0.25 + 0.23, mw * 0.72, mh * 0.85, { variant: 'legacy', title: c.tag });
    }
    B.box(M('black'), x, deskH + 0.05, D * 0.15, 0.44, 0.02, 0.15); // keyboard
    B.box(M('black'), x + 0.3, deskH + 0.05, D * 0.15, 0.06, 0.02, 0.1); // mouse / trackball
  }
  // console mimic keys / alarm accept and an e-stop or ESD push buttons on the desk (ICSS)
  for (let i = 0; i < 4; i++) pushButton(B, -W / 2 + 0.25 + i * 0.12, deskH + 0.06, D * 0.32, ['eqYellow', 'eqWhite', 'green', 'eqRed'][i], 0.014);
  if (p.esd_buttons || /icss|esd|ccr|control/i.test(c.name + ' ' + (c.tag || ''))) {
    ctx.b.push(new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(W / 2 - 0.25, deskH + 0.045, D * 0.3));
    eStop(ctx.b, 0, 0, 0);
    ctx.b.pop();
  }
  // telephone and PA microphone
  B.box(M('black'), W / 2 - 0.55, deskH + 0.07, D * 0.2, 0.2, 0.06, 0.18);
  B.cyl(M('black'), W / 2 - 0.85, deskH + 0.06, D * 0.25, 0.05, 0.03, 'y', 12);
  B.pipe(M('black'), [[W / 2 - 0.85, deskH + 0.07, D * 0.25], [W / 2 - 0.85, deskH + 0.3, D * 0.22], [W / 2 - 0.85, deskH + 0.36, D * 0.32]], 0.006, 6);
  // chairs
  const nc = Math.max(1, Math.round(W / 1.4));
  for (let i = 0; i < nc; i++) chair(B, -W / 2 + (i + 0.5) * W / nc, D / 2 + 0.55, Math.PI);
  ctx.tag(0, deskH * 0.75, D * 0.2 + 0.002, Math.min(0.3, W * 0.25));
  if (R) R.box(M('accent'), 0, deskH + 0.015, D / 2 + 0.005, W, 0.012, 0.004);
}

export function workstation_desk(ctx) {
  const { W, D, c } = ctx;
  const B = ctx.b;
  const deskH = 0.74;
  B.box(M('cabGrey'), 0, deskH, 0, W, 0.04, D);
  for (const s of [-1, 1]) B.box(M('cabGrey'), s * (W / 2 - 0.03), deskH / 2, 0, 0.04, deskH, D - 0.06);
  B.box(M('cabGrey'), 0, deskH * 0.55, -D / 2 + 0.03, W - 0.1, deskH * 0.6, 0.02);
  const n = Math.max(1, (c.display && c.display.count) || 2);
  const mw = Math.min(0.56, W / n - 0.06), mh = mw * 0.58;
  for (let i = 0; i < n; i++) {
    const x = -((n - 1) / 2) * (mw + 0.04) + i * (mw + 0.04);
    monitor(ctx, B, x, deskH + 0.3 + mh / 2, -D * 0.2, mw, mh, { base: deskH + 0.03, ry: n > 1 ? (i - (n - 1) / 2) * -0.25 : 0, title: c.tag });
  }
  B.box(M('black'), 0, deskH + 0.03, D * 0.15, 0.44, 0.02, 0.15);
  B.rbox(M('black'), W / 2 - 0.25, 0.25, -D * 0.1, 0.2, 0.45, 0.45, 0.01); // PC tower
  led(B, W / 2 - 0.25, 0.42, -D * 0.1 + 0.23, 'ledBlue', 0.005);
  chair(B, 0, D / 2 + 0.45, Math.PI);
  ctx.tag(0, deskH - 0.06, D / 2 + 0.002, 0.25);
}

export function large_display_wall(ctx) {
  const { W, H, D, c, p } = ctx;
  const B = ctx.b;
  const tiles = p.tiles || (c.display && c.display.count) || 0;
  let rows = p.rows || (tiles ? (tiles >= 4 && H >= 1.6 ? 2 : 1) : Math.max(1, Math.round((H - 0.9) / 0.75)));
  let cols = p.cols || (tiles ? Math.ceil(tiles / rows) : Math.max(1, Math.round(W / 1.25)));
  const tw = Math.min(1.22, W / cols), th = tw * 0.5625;
  const sw = tw, sh = Math.min(th, (H - 0.2) / rows);
  const y0 = p.bottom ?? Math.max(0.1, H - rows * sh - 0.15);
  const W0 = W; void W0;
  B.box(M('black'), 0, y0 + rows * sh / 2, -D / 2 + 0.05, cols * sw + 0.06, rows * sh + 0.06, 0.1);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    ctx.screen(-cols * sw / 2 + (i + 0.5) * sw, y0 + (j + 0.5) * sh, -D / 2 + 0.105, sw - 0.012, sh - 0.012, { kind: p.screen_kind || (/cctv/i.test(c.name) ? 'cctv' : 'hmi'), title: c.tag });
  }
  ctx.tag(0, y0 - 0.08, -D / 2 + 0.11, 0.3);
}

export function cctv_monitor_desk(ctx) {
  const { W, D, c } = ctx;
  const B = ctx.b;
  const deskH = 0.74;
  B.rbox(M('cabGrey'), 0, deskH / 2, 0, W, deskH, D * 0.8, 0.02);
  B.box(M('cabDark'), 0, deskH + 0.02, 0, W + 0.04, 0.04, D);
  const n = Math.max(2, (c.display && c.display.count) || 3);
  const mw = Math.min(0.6, W / n - 0.05), mh = mw * 0.58;
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + (i + 0.5) * W / n;
    monitor(ctx, B, x, deskH + 0.32 + mh / 2, -D * 0.25, mw, mh, { base: deskH + 0.05, kind: 'cctv', title: 'CCTV ' + (i + 1) });
  }
  // PTZ joystick keyboard
  B.box(M('black'), 0.2, deskH + 0.06, D * 0.2, 0.4, 0.04, 0.18);
  B.cyl(M('black'), 0.32, deskH + 0.12, D * 0.2, 0.012, 0.08, 'y', 8);
  B.sphere(M('black'), 0.32, deskH + 0.17, D * 0.2, 0.022, 8);
  B.box(M('black'), -0.3, deskH + 0.05, D * 0.2, 0.44, 0.02, 0.15);
  chair(B, 0, D / 2 + 0.5, Math.PI);
  ctx.tag(0, deskH * 0.7, D * 0.4 + 0.002, 0.25);
}
