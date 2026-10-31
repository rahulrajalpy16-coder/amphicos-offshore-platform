// Boiler, inert gas generator, field instruments and context items (trays, stairs).
import * as THREE from 'three';
import { M, faceMat } from '../materials.js';
import * as TX from '../textures.js';
import { cabinet, faceFrom, gaugeRow, pushButton, eStop, led } from './common.js';
import { handrail } from '../topsides.js';

// Vertical auxiliary boiler with lagged shell, uptake, mountings, gauge glasses and top platform.
export function marine_boiler(ctx) {
  const { W, H, D } = ctx;
  const B = ctx.b;
  const r = Math.min(W, D) * 0.45;
  const shellH = H * 0.86;
  B.cyl(M('steelDark'), 0, 0.25, 0, r * 1.02, 0.5, 'y', 32);                     // foundation ring
  B.cyl(M('laggingAlu'), 0, 0.5 + shellH / 2, 0, r, shellH, 'y', 40);
  for (let i = 1; i < 8; i++) B.cyl(M('steelBare'), 0, 0.5 + i * shellH / 8, 0, r * 1.008, 0.04, 'y', 40);
  B.head(M('laggingAlu'), 0, 0.5 + shellH, 0, r, r * 0.3, 'y', 1, 32);
  // uptake / exhaust to the casing above
  const top = Math.max(H + 0.5, ctx.ceilH - 0.05);
  B.cyl(M('laggingAlu'), -r * 0.3, (0.5 + shellH + top) / 2, -r * 0.2, r * 0.32, top - 0.5 - shellH, 'y', 24);
  // mountings: safety valves, main steam stop valve, feed check valve
  for (let i = 0; i < 2; i++) { B.cyl(M('eqRed'), r * 0.35 + i * 0.35, 0.5 + shellH + r * 0.32, r * 0.2, 0.09, 0.4, 'y', 12); B.cyl(M('steelDark'), r * 0.35 + i * 0.35, 0.5 + shellH + r * 0.55, r * 0.2, 0.06, 0.3, 'y', 10); }
  B.pipe(M('pipeSteam'), [[r * 0.1, 0.5 + shellH + r * 0.25, r * 0.4], [r * 0.1, 0.5 + shellH + r * 0.6, r * 0.4], [r * 1.4, 0.5 + shellH + r * 0.6, r * 0.4], [r * 1.4, top - 0.3, r * 0.4]], 0.11, 14);
  B.cyl(M('steelDark'), r * 0.1, 0.5 + shellH + r * 0.45, r * 0.4, 0.17, 0.2, 'y', 12);
  B.torus(M('eqRed'), r * 0.1, 0.5 + shellH + r * 0.62, r * 0.4, 0.14, 0.02, Math.PI / 2, 0, 14);
  // water level gauge glasses on the front
  for (const s of [-1, 1]) {
    const x = s * r * 0.35;
    B.box(M('steelDark'), x, 0.5 + shellH * 0.72, r + 0.08, 0.08, 0.8, 0.06);
    B.box(M('glass'), x, 0.5 + shellH * 0.72, r + 0.115, 0.03, 0.6, 0.01);
    B.box(M('ledGreen'), x, 0.5 + shellH * 0.7, r + 0.12, 0.02, 0.25, 0.004);
  }
  // pressure gauge, manhole, feed and blowdown lines
  gaugeRow(B, faceMat(TX.gaugeTexture('bar')), 0, 0.5 + shellH * 0.88, r + 0.03, 1, 0, 0.09);
  B.cyl(M('steelDark'), 0, 0.5 + shellH * 0.35, r * 0.98, 0.3, 0.12, 'z', 20);
  B.pipe(M('pipeFW'), [[-r * 1.05, 0.5 + shellH * 0.6, 0], [-r * 1.4, 0.5 + shellH * 0.6, 0], [-r * 1.4, 0.05, 0]], 0.06, 10);
  B.pipe(M('pipeSteam'), [[r * 0.6, 0.6, r * 0.75], [r * 1.3, 0.6, r * 0.75], [r * 1.3, 0.05, r * 0.75]], 0.05, 10);
  // top platform with ladder
  const py = 0.5 + shellH * 0.92;
  B.box(M('eqGrate'), 0, py, r + 0.6, r * 2.2, 0.04, 1.0);
  handrail(B, M('eqYellow'), [[-r * 1.1, py, r + 1.1], [r * 1.1, py, r + 1.1]], 1.0, 1.2);
  for (let k = 0; k < Math.round(py / 0.3); k++) B.box(M('eqYellow'), r * 1.15, 0.3 + k * 0.3, r + 0.6, 0.03, 0.03, 0.5);
  for (const o of [-0.25, 0.25]) B.box(M('eqYellow'), r * 1.15, py / 2, r + 0.6 + o, 0.05, py, 0.05);
  ctx.tag(0, 0.5 + shellH * 0.55, r + 0.02, 0.6, { style: 'dark' });
}

// Burner unit on the boiler front: windbox, fan motor, FO train, ignition, flame eye port.
export function boiler_burner_unit(ctx) {
  const { W, H, D } = ctx;
  const B = ctx.b;
  B.cyl(M('steelDark'), 0, H * 0.5, -D * 0.3, Math.min(W, H) * 0.42, D * 0.35, 'z', 24);   // windbox / mounting flange
  B.rbox(M('eqRed'), 0, H * 0.5, D * 0.05, W * 0.8, H * 0.75, D * 0.45, 0.04);             // burner housing
  B.cyl(M('steelBlue'), -W * 0.2, H * 0.85, D * 0.05, H * 0.15, W * 0.45, 'x', 18);        // fan motor on top
  B.cyl(M('eqRed'), W * 0.25, H * 0.85, D * 0.05, H * 0.2, W * 0.15, 'x', 18);            // fan scroll
  B.box(M('cabDark'), W * 0.3, H * 0.4, D * 0.32, W * 0.25, H * 0.25, 0.1);                // ignition transformer
  B.pipe(M('pipeFO'), [[-W * 0.4, H * 0.3, D * 0.2], [-W * 0.55, H * 0.3, D * 0.2], [-W * 0.55, 0.02, D * 0.2]], 0.025, 8);
  for (let i = 0; i < 2; i++) B.cyl(M('cabGrey'), -W * 0.45, H * 0.45 + i * 0.12, D * 0.2, 0.04, 0.12, 'x', 10); // solenoid valves
  ctx.tag(0, H * 0.2, D * 0.28, 0.2);
}

function panelWithVariants(ctx, retrofitKind, title) {
  const { W, H, D } = ctx;
  const doors = Math.max(1, Math.min(3, Math.round(W / 0.8)));
  cabinet(ctx.b, { w: W, h: H, d: D, mat: 'cab', handles: doors, seams: doors });
  const L = ctx.V('legacy'), R = ctx.V('retrofit');
  const z = D / 2 + 0.006, y = 0.1 + (H - 0.1) / 2;
  if (L) {
    L.plane(faceFrom(TX.cabinetFrontTextures('generic', '', 'l', '#c9c4b0', doors)), 0, y, z, W - 0.02, H - 0.12);
    // relay-logic sequence lamps and flame relay window
    for (let r = 0; r < 3; r++) for (let k = 0; k < 5; k++) L.sphere(M(['ledGreen', 'ledAmber', 'ledRed', 'ledWhite', 'ledGreen'][k]), -W * 0.3 + k * W * 0.15, H * 0.82 - r * 0.07, z + 0.01, 0.012, 8);
    gaugeRow(L, faceMat(TX.gaugeTexture(retrofitKind === 'boiler' ? 'bar' : '% O2')), -W * 0.2, H * 0.62, z, 2, W * 0.4, Math.min(0.07, W * 0.08));
    pushButton(L, -W * 0.2, H * 0.48, z, 'green'); pushButton(L, 0, H * 0.48, z, 'eqRed'); pushButton(L, W * 0.2, H * 0.48, z, 'eqWhite');
  }
  if (R) {
    R.plane(faceFrom(TX.cabinetFrontTextures(retrofitKind, '', 'r', '#d4d6d2', doors)), 0, y, z, W - 0.02, H - 0.12);
    const dw = W / doors;
    R.box(M('black'), -W / 2 + dw / 2, H * 0.75, z + 0.008, dw * 0.66, dw * 0.44, 0.016);
    ctx.screen(-W / 2 + dw / 2, H * 0.75, z + 0.018, dw * 0.6, dw * 0.38, { variant: 'retrofit', title });
    R.box(M('accent'), 0, H - 0.05, z + 0.003, W - 0.04, 0.025, 0.004);
  }
  ctx.b.push(new THREE.Matrix4().makeTranslation(W * 0.32, H * 0.3, z));
  eStop(ctx.b, 0, 0, 0);
  ctx.b.pop();
  ctx.tag(-W / 2 + Math.min(0.8, W) / 2, H - 0.12, z + 0.008, Math.min(0.32, W * 0.4));
}

export function boiler_control_panel(ctx) { panelWithVariants(ctx, 'boiler', 'BMS'); }
export function igg_control_panel(ctx) { panelWithVariants(ctx, 'igg', 'IGG'); }

export function o2_analyser_cabinet(ctx) {
  const { W, H, D } = ctx;
  const B = ctx.b;
  cabinet(B, { w: W, h: H, d: D, mat: 'cab', handles: 1 });
  const z = D / 2 + 0.006;
  B.plane(faceFrom(TX.cabinetFrontTextures('o2', '', 'o', '#d4d6d2', 1)), 0, 0.1 + (H - 0.1) / 2, z, W - 0.02, H - 0.12);
  B.box(M('black'), 0, H * 0.7, z + 0.006, W * 0.5, W * 0.3, 0.012);
  ctx.screen(0, H * 0.7, z + 0.013, W * 0.45, W * 0.25, { title: 'O2 %' });
  // sample line and calibration gas bottle beside
  B.pipe(M('steelBare'), [[W / 2, H * 0.5, 0], [W / 2 + 0.15, H * 0.5, 0], [W / 2 + 0.15, Math.min(ctx.ceilH - 0.4, H + 1), 0]], 0.008, 6);
  B.cyl(M('green'), W / 2 + 0.3, 0.5, 0, 0.1, 1.0, 'y', 16);
  B.head(M('green'), W / 2 + 0.3, 1.0, 0, 0.1, 0.06, 'y', 1, 12);
  ctx.tag(0, H - 0.12, z + 0.008, Math.min(0.3, W * 0.6));
}

export function flame_scanner(ctx) {
  const B = ctx.b;
  const { H } = ctx;
  const h = Math.max(0.15, Math.min(H, 0.3));
  B.cyl(M('steelBare'), 0, h * 0.5, 0, 0.035, h * 0.6, 'z', 12);
  B.cyl(M('eqYellow'), 0, h * 0.5, h * 0.35, 0.05, h * 0.4, 'z', 14);
  led(B, 0, h * 0.5 + 0.03, h * 0.56, 'ledGreen', 0.006);
  B.between(M('cableBlack'), [0, h * 0.5, h * 0.55], [0, -0.3, h * 0.7], 0.008, 6);
}

function transmitter(B, y, z, withDP = false) {
  B.cyl(M('steelBare'), 0, y, z, 0.05, 0.12, 'z', 14);          // electronics housing
  B.cyl(M('eqWhite'), 0, y, z + 0.07, 0.045, 0.02, 'z', 14);    // display cover
  B.box(M('steelBare'), 0, y - 0.11, z, withDP ? 0.12 : 0.05, 0.1, 0.08); // sensor / flange
  if (withDP) for (const s of [-1, 1]) B.between(M('steelBare'), [s * 0.05, y - 0.16, z], [s * 0.05, y - 0.6, z - 0.3], 0.008, 6);
}

export function drum_level_transmitter(ctx) {
  const B = ctx.b;
  const H = Math.max(1.0, ctx.H);
  B.between(M('steelBare'), [0, 0, -0.05], [0, H * 0.75, -0.05], 0.03, 8);   // 2 inch stand
  B.box(M('steelBare'), 0, 0.01, -0.05, 0.25, 0.02, 0.25);
  transmitter(B, H * 0.6, 0.05, true);
  ctx.tag(0, H * 0.45, 0.05, 0.12);
}

// F&G detectors (field_transmitter with params.detector)
function gasPoint(ctx) {
  const B = ctx.b, H = Math.max(0.3, ctx.H);
  const pole = H > 0.6;
  const y = pole ? H * 0.72 : H * 0.6;
  if (pole) { B.between(M('steelBare'), [0, 0, -0.06], [0, H * 0.95, -0.06], 0.03, 8); B.box(M('steelBare'), 0, 0.01, -0.06, 0.25, 0.02, 0.25); }
  else B.box(M('steelBare'), 0, y, -0.09, 0.14, 0.18, 0.012);
  B.box(M('steelBare'), 0, y + 0.06, -0.035, 0.05, 0.05, 0.05);              // clamp
  B.rbox(M('chrome'), 0, y + 0.1, 0.02, 0.12, 0.12, 0.1, 0.02);             // Ex d junction head
  B.cyl(M('chrome'), 0, y - 0.04, 0.02, 0.035, 0.18, 'y', 16);              // sensor body pointing down
  B.cyl(M('eqYellow'), 0, y - 0.16, 0.02, 0.055, 0.09, 'y', 16);            // weather baffle / splash guard
  B.cyl(M('black'), 0, y - 0.21, 0.02, 0.045, 0.012, 'y', 16);
  led(B, 0.04, y + 0.12, 0.072, 'ledGreenBlink', 0.006);
  B.between(M('cableBlack'), [0, y + 0.16, 0.02], [0, Math.max(0, y - 0.6), -0.06], 0.008, 6);
  ctx.tag(0, y + 0.24, 0.02, 0.1, { style: 'warn' });
}
function flameIR3(ctx) {
  const B = ctx.b, H = Math.max(0.25, ctx.H);
  const pole = H > 0.8;
  const y = pole ? H - 0.2 : H * 0.6;
  if (pole) { B.between(M('steelBare'), [0, 0, -0.08], [0, y + 0.1, -0.08], 0.035, 8); B.box(M('steelBare'), 0, 0.01, -0.08, 0.3, 0.02, 0.3); }
  else B.box(M('steelBare'), 0, y, -0.12, 0.16, 0.2, 0.012);
  B.box(M('steelBare'), 0, y, -0.04, 0.06, 0.06, 0.1);                         // swivel bracket
  B.push(new THREE.Matrix4().makeRotationX(0.5).setPosition(0, y, 0.04));      // tilted down toward the protected area
  B.rbox(M('eqRed'), 0, 0, 0, 0.14, 0.12, 0.12, 0.02);                          // housing
  B.box(M('black'), 0, 0, 0.062, 0.12, 0.1, 0.004);
  for (let i = 0; i < 3; i++) B.cyl(M('glass'), -0.035 + i * 0.035, 0.012, 0.066, 0.013, 0.006, 'z', 12); // three IR windows
  led(B, 0, -0.035, 0.066, 'ledGreenBlink', 0.005);
  B.pop();
  B.between(M('cableBlack'), [0, y - 0.06, -0.04], [0, Math.max(0, y - 0.7), -0.08], 0.008, 6);
  ctx.tag(0, y + 0.14, 0, 0.1, { style: 'warn' });
}
function smokePoint(ctx) {
  const B = ctx.b, h = Math.max(0.06, Math.min(0.12, ctx.H));
  B.cyl(M('eqWhite'), 0, h - 0.01, 0, 0.065, 0.02, 'y', 20);                   // ceiling base
  B.cyl(M('eqWhite'), 0, h - 0.04, 0, 0.055, 0.04, 'y', 20);                   // detector head
  for (let i = 0; i < 8; i++) B.box(M('cabGrey'), 0, h - 0.045, 0, 0.11, 0.01, 0.006, i * Math.PI / 8); // smoke entry slots
  B.head(M('eqWhite'), 0, h - 0.06, 0, 0.04, 0.015, 'y', -1, 16);
  led(B, 0.045, h - 0.05, 0.02, 'ledRed', 0.004);
}

export function field_transmitter(ctx) {
  const det = ctx.p.detector;
  if (det === 'gas_ir_point' || /gas/.test(det || '')) return gasPoint(ctx);
  if (det === 'flame_ir3' || /flame/.test(det || '')) return flameIR3(ctx);
  if (det === 'smoke_point' || /smoke|heat/.test(det || '')) return smokePoint(ctx);
  const B = ctx.b;
  const H = Math.max(0.3, ctx.H);
  if (H > 0.6) { B.between(M('steelBare'), [0, 0, -0.05], [0, H * 0.8, -0.05], 0.03, 8); B.box(M('steelBare'), 0, 0.01, -0.05, 0.25, 0.02, 0.25); }
  transmitter(B, H * 0.7, 0.05, !!ctx.p.dp);
  ctx.tag(0, H * 0.5, 0.05, 0.1);
}

// Inert gas generator: combustion chamber with burner, cooling section, sight glasses
export function igg_generator_unit(ctx) {
  const { W: L, H, D } = ctx;
  const B = ctx.b;
  const r = Math.min(H, D) * 0.4;
  B.box(M('steelDark'), 0, 0.15, 0, L, 0.3, D * 0.9);
  for (const s of [-0.3, 0.3]) B.box(M('steelDark'), s * L, 0.3 + r * 0.4, 0, 0.3, r * 0.8, r * 1.6);
  B.cyl(M('laggingAlu'), -L * 0.1, 0.3 + r, 0, r, L * 0.62, 'x', 32);                 // combustion chamber
  B.head(M('laggingAlu'), L * 0.21, 0.3 + r, 0, r, r * 0.4, 'x', 1, 24);
  B.cyl(M('steelDark'), -L * 0.42, 0.3 + r, 0, r * 1.05, 0.12, 'x', 32);               // burner flange
  B.rbox(M('eqRed'), -L * 0.47, 0.3 + r, 0, 0.35, r * 1.3, r * 1.2, 0.04);             // burner
  B.cyl(M('steelBlue'), -L * 0.47, 0.3 + r * 2.0, 0, r * 0.25, 0.6, 'z', 14);           // combustion air fan motor
  for (let i = 0; i < 3; i++) B.cyl(M('glass'), -L * 0.3 + i * L * 0.18, 0.3 + r, r + 0.02, 0.05, 0.04, 'z', 12); // sight glasses
  for (let i = 0; i < 3; i++) B.cyl(M('steelDark'), -L * 0.3 + i * L * 0.18, 0.3 + r, r, 0.08, 0.06, 'z', 12);
  // water cooled section and outlet duct to scrubber
  B.cyl(M('pipeIG'), L * 0.35, 0.3 + r, 0, r * 0.6, L * 0.25, 'x', 24);
  B.pipe(M('pipeSW'), [[-L * 0.2, 0.3 + r * 2, 0], [-L * 0.2, 0.3 + r * 2.4, 0], [L * 0.45, 0.3 + r * 2.4, 0]], 0.06, 10);
  B.pipe(M('pipeIG'), [[L * 0.47, 0.3 + r, 0], [L / 2, 0.3 + r, 0], [L / 2, Math.min(ctx.ceilH - 0.5, H + 1.2), 0]], r * 0.3, 16);
  gaugeRow(B, faceMat(TX.gaugeTexture('mbar')), -L * 0.05, 0.3 + r * 1.5, r * 0.9, 2, 0.3, 0.06);
  ctx.tag(-L * 0.1, 0.3 + r * 0.4, r + 0.02, 0.4, { style: 'dark' });
}

export function igg_scrubber_tower(ctx) {
  const { W, H, D } = ctx;
  const B = ctx.b;
  const r = Math.min(W, D) * 0.42;
  B.cyl(M('steelDark'), 0, 0.2, 0, r * 1.1, 0.4, 'y', 28);
  B.cyl(M('pipeIG'), 0, 0.4 + (H - 0.8) / 2, 0, r, H - 0.8, 'y', 32);
  B.head(M('pipeIG'), 0, H - 0.4, 0, r, r * 0.45, 'y', 1, 24);
  for (let i = 1; i < 5; i++) B.cyl(M('steelDark'), 0, 0.4 + i * (H - 0.8) / 5, 0, r * 1.01, 0.05, 'y', 32);
  // spray water inlet (sea water, green), IG outlet at top, drain at bottom
  B.pipe(M('pipeSW'), [[r, H * 0.7, 0], [r + 0.5, H * 0.7, 0], [r + 0.5, 0.05, 0]], 0.08, 10);
  B.pipe(M('pipeSW'), [[0, 0.5, r], [0, 0.5, r + 0.4], [0, 0.02, r + 0.4]], 0.1, 10);
  B.pipe(M('pipeIG'), [[0, H - 0.2, 0], [0, Math.min(ctx.ceilH - 0.3, H + 0.6), 0], [-r - 1, Math.min(ctx.ceilH - 0.3, H + 0.6), 0]], r * 0.3, 16);
  // level glass and manhole
  B.box(M('glass'), -r * 0.6, H * 0.25, r * 0.82, 0.04, 0.5, 0.04);
  B.cyl(M('steelDark'), 0, H * 0.4, r, 0.25, 0.1, 'z', 18);
  ctx.tag(0, H * 0.55, r + 0.02, 0.35, { style: 'dark' });
}

export function igg_blower(ctx) {
  const { W: L, H, D } = ctx;
  const B = ctx.b;
  const r = Math.min(H, D) * 0.4;
  B.box(M('steelDark'), 0, 0.12, 0, L, 0.24, D * 0.9);
  B.cyl(M('steelBlue'), -L * 0.22, 0.24 + r * 0.7, 0, r * 0.7, L * 0.4, 'x', 24); // motor
  for (let i = 0; i < 8; i++) B.cyl(M('steelBlue'), -L * 0.38 + i * L * 0.04, 0.24 + r * 0.7, 0, r * 0.74, 0.015, 'x', 24);
  B.box(M('eqYellow'), L * 0.02, 0.24 + r * 0.7, 0, 0.2, r * 0.8, r * 0.8);
  B.cyl(M('pipeIG'), L * 0.25, 0.24 + r, 0, r, L * 0.22, 'x', 32);                 // volute
  B.cyl(M('pipeIG'), L * 0.4, 0.24 + r, 0, r * 0.45, L * 0.15, 'x', 16);            // suction
  B.box(M('pipeIG'), L * 0.25, 0.24 + r * 2.1, 0, r * 0.6, r * 0.6, r * 0.6);        // discharge
  B.pipe(M('pipeIG'), [[L * 0.25, 0.24 + r * 2.4, 0], [L * 0.25, Math.min(ctx.ceilH - 0.4, H + 1), 0]], r * 0.28, 14);
  ctx.tag(-L * 0.22, 0.24 + r * 0.7, r * 0.75, 0.2);
}

// Deck water seal: vertical vessel on the main deck with IG inlet and outlet, water supply.
export function deck_water_seal(ctx) {
  const { W, H, D } = ctx;
  const B = ctx.b;
  const r = Math.min(W, D) * 0.42;
  B.cyl(M('steelDark'), 0, 0.15, 0, r * 1.05, 0.3, 'y', 24);
  B.cyl(M('pipeIG'), 0, 0.3 + (H - 0.6) / 2, 0, r, H - 0.6, 'y', 28);
  B.head(M('pipeIG'), 0, H - 0.3, 0, r, r * 0.4, 'y', 1, 20);
  B.pipe(M('pipeIG'), [[-r, H * 0.75, 0], [-r - 1.5, H * 0.75, 0]], r * 0.3, 14);
  B.pipe(M('pipeIG'), [[r, H * 0.85, 0], [r + 1.5, H * 0.85, 0]], r * 0.3, 14);
  B.pipe(M('pipeSW'), [[0, H * 0.3, r], [0, H * 0.3, r + 0.5], [0, 0.05, r + 0.5]], 0.05, 10);
  B.box(M('glass'), r * 0.6, H * 0.45, r * 0.8, 0.04, H * 0.3, 0.04);
  ctx.tag(0, H * 0.55, r + 0.02, 0.3, { style: 'dark' });
}

export function igg_deck_valve(ctx) {
  const { W: L, H, D } = ctx;
  const B = ctx.b;
  const r = Math.min(H, D) * 0.25;
  const y = Math.max(r + 0.3, H * 0.35);
  B.cyl(M('pipeIG'), 0, y, 0, r, L, 'x', 20);
  for (const s of [-1, 1]) B.cyl(M('steelDark'), s * L * 0.2, y, 0, r * 1.5, 0.08, 'x', 20);
  B.cyl(M('steelDark'), 0, y, 0, r * 1.3, L * 0.25, 'x', 18);          // valve body
  B.box(M('cabGrey'), 0, y + r * 1.8, 0, r * 1.6, r * 1.2, r * 1.2);    // pneumatic actuator
  B.box(M('eqYellow'), 0, y + r * 2.6, 0, r * 0.8, r * 0.4, r * 0.4);    // position indicator
  for (const s of [-1, 1]) B.box(M('steelDark'), s * L * 0.35, y / 2, 0, 0.12, y, 0.3);
  ctx.tag(0, y - r - 0.1, r + 0.05, 0.2);
}

export function cable_tray(ctx) {
  const { W, H, D } = ctx;
  const B = ctx.b;
  const y = H - 0.06;
  B.box(M('tray'), 0, y - 0.05, -D / 2, W, 0.1, 0.02);
  B.box(M('tray'), 0, y - 0.05, D / 2, W, 0.1, 0.02);
  for (let x = -W / 2; x <= W / 2; x += 0.3) B.box(M('tray'), x, y - 0.1, 0, 0.03, 0.01, D);
  B.box(M('cableBlack'), 0, y - 0.07, 0, W, 0.04, D * 0.85);
  for (let x = -W / 2 + 0.6; x < W / 2; x += 1.8) B.box(M('steelBare'), x, y + 0.2, 0, 0.04, 0.5, 0.04);
}

export function ladder_stair(ctx) {
  const { W, H, D } = ctx;
  const B = ctx.b;
  const steps = Math.max(3, Math.round(H / 0.22));
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    B.box(M('eqGrate'), -W / 2 + W * t, H * (i + 1) / steps, 0, W / steps + 0.02, 0.03, D);
  }
  for (const s of [-1, 1]) {
    B.beam(M('eqYellow'), [-W / 2, 0, s * D / 2], [W / 2, H, s * D / 2], 0.05, 0.18);
    B.between(M('eqYellow'), [-W / 2, 1, s * D / 2], [W / 2, H + 1, s * D / 2], 0.02, 5);
  }
}
