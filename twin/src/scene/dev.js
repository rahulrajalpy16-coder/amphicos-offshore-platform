// Scene development harness (not part of the app): renders the world with OrbitControls,
// exposes window.__world / window.__dev for automated checks and screenshots.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createRenderer } from './renderer.js';
import { buildWorld } from './world.js';
import { shipToWorld } from '../core/coords.js';

const dbG = import.meta.glob('../data/fpso_db.json', { eager: true });
const fxG = import.meta.glob('./__fixture__/*.json', { eager: true });
const mod = Object.values(dbG)[0] || Object.values(fxG)[0];
const db = mod.default || mod;
const params = new URLSearchParams(location.search);
const hud = document.getElementById('hud');

const R = createRenderer({ container: document.getElementById('view'), quality: params.get('quality') || 'high', preserveDrawingBuffer: true });
const { renderer, scene, camera } = R;
const world = buildWorld(db, scene, { renderer, camera });
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
R.resize();

const V = (p) => shipToWorld(p);
function look(eye, target) {
  camera.position.copy(eye); controls.target.copy(target); camera.lookAt(target); controls.update();
}
const room = (id) => db.rooms.find((r) => r.id === id);
const comp = (id) => db.components.find((c) => c.id === id);
function roomView(id, eyeShip, targetShip) {
  const r = room(id);
  world.setCutaway(id, { animate: false });
  if (eyeShip) look(V(eyeShip), V(targetShip));
  else look(V(r.camera.overview_eye), V(r.camera.overview_target));
}
function compView(id, dist = 3, up = 0.6, side = 0) {
  const c = comp(id);
  const t = V([c.pos[0], c.pos[1], c.pos[2] + c.size[2] * 0.55]);
  const f = { '+x': [1, 0], '-x': [-1, 0], '+y': [0, 1], '-y': [0, -1] }[c.facing] || [0, -1];
  const e = V([c.pos[0] + f[0] * dist + side * f[1], c.pos[1] + f[1] * dist - side * f[0], c.pos[2] + c.size[2] * 0.55 + up]);
  world.setCutaway(c.room, { animate: false });
  look(e, t);
}
const views = {
  bow34: () => { world.setCutaway(null, { animate: false }); look(V([390, -150, 95]), V([170, 0, 30])); },
  stern: () => { world.setCutaway(null, { animate: false }); look(V([-70, -120, 70]), V([60, 0, 30])); },
  top: () => { world.setCutaway(null, { animate: false }); look(V([150, -1, 330]), V([150, 0, 28])); },
  flare: () => { world.setCutaway(null, { animate: false }); look(V([250, -70, 118]), V([287, 0, 116])); },
  fg: () => { world.setCutaway(null, { animate: false }); look(V([169.0, -10.0, 30.4]), V([166.0, -6.9, 29.3])); },
  smoke: () => roomView('R_HVSWBD', [26, 9, 21.0], [30, 12, 22.4]),
  side: () => { world.setCutaway(null, { animate: false }); look(V([150, -380, 40]), V([150, 0, 30])); },
  accom: () => { world.setCutaway(null, { animate: false }); look(V([95, -70, 60]), V([30, 0, 40])); },
  turret: () => { world.setCutaway(null, { animate: false }); look(V([330, -60, 60]), V([270, 0, 40])); },
  er: () => roomView('R_ER_GEN'),
  erOutside: () => roomView('R_ER_GEN', [36, -70, 40], [36, 0, 12]),
  msb: () => roomView('R_MSB'),
  hv: () => roomView('R_HVSWBD'),
  ccr: () => roomView('R_CCR'),
  ter: () => roomView('R_TER'),
  boiler: () => roomView('R_BOILER'),
  igg: () => roomView('R_IGG'),
  dg: () => roomView('R_ER_GEN', [31.0, -14.2, 12.8], [34.0, -9.0, 11.0]),
  lcp: () => roomView('R_ER_GEN', [32.6, -2.6, 11.4], [33.6, -5.3, 10.6]),
  hlS13: () => { roomView('R_ER_GEN'); world.setHighlight({ systemId: 'S13', mode: 'dim-others' }); },
  hlS15: () => { roomView('R_ER_GEN'); world.setHighlight({ systemId: 'S15', mode: 'dim-others' }); },
  hlS03: () => { roomView('R_HVSWBD'); world.setHighlight({ systemId: 'S03', mode: 'dim-others' }); },
  hlS13sel: () => { roomView('R_ER_GEN'); world.setHighlight({ systemId: 'S13', mode: 'select' }); },
  dgFar: () => roomView('R_ER_GEN', [26.0, -16.5, 15.5], [35.0, -6.0, 11.0]),
  swb: () => compView('C_MV_G1', 2.6, 0.3, 0.4),
  xray: () => { world.setCutaway(null, { animate: false }); world.setXRay(true); look(V([150, -260, 90]), V([110, 0, 18])); },
};
let frames = 0, last = performance.now(), fps = 0;
const clock = new THREE.Clock();
function loop() {
  const dt = Math.min(0.05, clock.getDelta());
  controls.update();
  world.update(dt, clock.elapsedTime);
  R.render();
  frames++;
  const now = performance.now();
  if (now - last > 1000) { fps = frames * 1000 / (now - last); frames = 0; last = now; const s = world.stats(renderer); hud.textContent = `fps ${fps.toFixed(1)}  calls ${s.calls}  tris ${(s.rendererTriangles / 1e6).toFixed(2)}M`; }
  if (!manual) requestAnimationFrame(loop);
}
const manual = params.has('manual');
if (!manual) loop();
window.__world = world;
window.__dev = {
  db, world, renderer, camera, controls, views, look, V,
  view(name) { world.setXRay(false); world.setHighlight({ mode: null }); views[name](); },
  // manual mode: advance the simulation clock then draw one frame, returns ms of the draw
  renderOnce(steps = 1, dt = 0.05) {
    for (let i = 0; i < steps; i++) { world.update(dt, (this._t = (this._t || 0) + dt)); }
    controls.update();
    const t0 = performance.now(); R.render(); renderer.getContext().finish(); return performance.now() - t0;
  },
  get fps() { return fps; },
  measure(ms = 3000) {
    return new Promise((res) => {
      let n = 0; const t0 = performance.now();
      const f = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else res({ fps: n * 1000 / (performance.now() - t0), ...world.stats(renderer) }); };
      requestAnimationFrame(f);
    });
  },
};
window.__ready = true;
