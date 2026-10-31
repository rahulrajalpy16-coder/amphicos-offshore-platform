// Embedded mode (?embed=1): the twin runs inside the Amphicos 3D Platform as its FPSO, in a full-screen
// frame above the rig scene. Standalone use is unchanged: nothing here runs without the flag.
// Messages (window.postMessage, all prefixed 'twin:'):
//   to the host:   twin:ready { pose, showcase }   twin:exit { pose }   twin:asset { id }
//   from the host: twin:enter   twin:pause   twin:resume   twin:ping
// Poses are in the twin world frame (metres, waterline y = 0, bow +x); the host maps them into its scene.
import * as THREE from 'three';
import { shipToWorld } from '../core/coords.js';
import { h } from '../ui/dom.js';

export const EMBED = new URLSearchParams(location.search).get('embed') === '1';

import { SHOWCASE } from './showcase.js';
export { SHOWCASE };

const pose3 = (p) => p && { eye: p.eye.toArray(), target: p.target.toArray(), fov: p.fov };

export function initEmbed({ app, tagLayer, bus, store, nav, director, scene, camera, world, getShift = () => 0, snapShift = () => 0, R = null }) {
  const state = { paused: false };
  if (!EMBED) return state;
  document.body.classList.add('embedded');
  const host = window.parent && window.parent !== window ? window.parent : null;
  const post = (type, data = {}) => { try { host && host.postMessage({ type, ...data }, '*'); } catch (e) { console.warn('[embed] post failed', e); } };

  // ---------- showcase containers on deck ----------
  const grp = new THREE.Group(); grp.name = 'showcase-containers'; scene.add(grp);
  const box = (w, hh, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; grp.add(m); return m; };
  const dark = new THREE.MeshStandardMaterial({ color: '#2a2f35', roughness: 0.7, metalness: 0.2 });
  const anchors = [];
  for (const s of SHOWCASE) {
    const c = shipToWorld([s.pos[0], s.pos[1], s.pos[2]]);
    const [lx, ly, hz] = s.size; // ship axes: lx along the vessel, ly across it
    if (s.id === 'spc') {
      // AMP-SPC: two dark corrugated containers with a walkway between, roof deck, condensers and HVAC units (simplified
      // from the CAD-based model in the host platform)
      const wall = new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.7, metalness: 0.3 });
      const roof = new THREE.MeshStandardMaterial({ color: '#c9d2d4', roughness: 0.6, metalness: 0.2 });
      const unit = new THREE.MeshStandardMaterial({ color: '#5a6066', roughness: 0.6, metalness: 0.3 });
      const hvac = new THREE.MeshStandardMaterial({ color: '#d4d8da', roughness: 0.6, metalness: 0.2 });
      const H = 2.9, cw = 4.2, gap = 1.2, L = ly - 0.6;
      for (const sx of [-1, 1]) {
        box(cw, H, L, wall, c.x + sx * (gap / 2 + cw / 2), c.y + H / 2, c.z);
        for (let i = 0; i < 20; i++) box(0.06, H - 0.4, 0.06, dark, c.x + sx * (gap / 2 + cw + 0.03), c.y + H / 2, c.z - L / 2 + 0.4 + i * (L - 0.8) / 19);
      }
      box(gap + 2 * cw + 0.2, 0.18, L + 0.2, roof, c.x, c.y + H + 0.09, c.z);
      for (const [dx, dz] of [[-2.7, -3.9], [2.7, -3.9], [-2.7, 3.9], [2.7, 3.9]]) box(2.2, 2.4, 3.6, unit, c.x + dx, c.y + H + 0.18 + 1.2, c.z + dz);
      for (const dx of [-1.6, 1.6]) box(2.0, 1.7, 2.6, hvac, c.x + dx, c.y + H + 0.18 + 0.85, c.z);
      box(gap + 2 * cw - 2, 0.9, 1.0, new THREE.MeshStandardMaterial({ color: '#2f4f7d', roughness: 0.6 }), c.x, c.y + H + 2.4, c.z);
    } else {
      const body = new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.55, metalness: 0.25 });
      box(lx, hz, ly, body, c.x, c.y + hz / 2, c.z);
      for (let i = 0; i < 24; i++) box(lx + 0.06, hz - 0.3, 0.08, body, c.x, c.y + hz / 2, c.z - ly / 2 + 0.3 + i * (ly - 0.6) / 23);
      box(lx + 0.1, 0.18, ly + 0.1, dark, c.x, c.y + 0.09, c.z); box(lx + 0.1, 0.18, ly + 0.1, dark, c.x, c.y + hz - 0.09, c.z);
      for (const sx of [-1, 1]) box(0.06, hz * 0.22, ly * 0.62, new THREE.MeshStandardMaterial({ color: s.band, roughness: 0.6 }), c.x + sx * (lx / 2 + 0.04), c.y + hz * 0.6, c.z);
    }
    anchors.push({ s, p: new THREE.Vector3(c.x, c.y + hz + 2.5, c.z) });
  }
  // one tag for both containers (they stand side by side), with a button for each
  const tagEl = h('div', { class: 'embed-tag', role: 'group', 'aria-label': 'Amphicos converters on deck (showcase)' },
    h('span', {}, 'Showcase'),
    ...SHOWCASE.map((s) => h('button', { type: 'button', 'data-asset': s.id, title: `${s.label}: open in the Amphicos 3D Platform`, onclick: (e) => { e.stopPropagation(); goAsset(s.id); } }, s.id === 'spc' ? 'AMP-SPC' : 'AMP-HI')));
  tagLayer.append(tagEl);
  const mid = anchors.reduce((m, a) => m.add(a.p), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, anchors.length));
  const v = new THREE.Vector3();
  function placeTags() {
    const lv = store.get().level, show = lv === 'vessel' && !store.get().attract;
    const r = (tagLayer.getBoundingClientRect && tagLayer.getBoundingClientRect()) || { width: innerWidth, height: innerHeight };
    v.copy(mid).project(camera);
    const vis = show && v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
    tagEl.style.display = vis ? '' : 'none';
    if (vis) tagEl.style.transform = `translate(${((v.x + 1) / 2) * r.width}px, ${((1 - v.y) / 2) * r.height}px) translate(-50%, -100%)`;
  }

  // ---------- back to the rig ----------
  let leaving = false;
  async function exit({ asset, keepPose = false } = {}) {
    if (leaving) return; leaving = true;
    try {
      if (keepPose) throw 0; // the camera is already on the containers: hand over from here
      if (bus.closeTopModal) while (bus.closeTopModal()) { /* close every open window */ }
      if (store.get().walk) bus.emit('request:walk', {});
      bus.emit('request:reset-ui', {});
      if (store.get().level !== 'vessel' || nav.history.length) await nav.home();
    } catch (e) { if (e !== 0) console.warn('[embed] home before exit', e); }
    leaving = false;
    post(asset ? 'twin:asset' : 'twin:exit', { id: asset, pose: pose3(director.currentPose()), shift: getShift() });
  }
  // ---------- the Amphicos converters as FPSO systems: fly to them on deck, then the host shows the detailed model ----------
  const waitFlight = () => new Promise((r) => { const k = () => (director.isFlying() ? setTimeout(k, 120) : r()); k(); });
  async function goAsset(id) {
    if (leaving) return;
    try {
      if (bus.closeTopModal) while (bus.closeTopModal()) { /* close windows */ }
      if (store.get().level !== 'vessel' || nav.history.length) { await nav.home(); await waitFlight(); }
      const a = anchors.find((x) => x.s.id === id) || anchors[0];
      const t = a.p.clone(); t.y -= 2.5;
      const eye = t.clone().add(new THREE.Vector3(0, 0.45, a.p.z < 0 ? -0.89 : 0.89).normalize().multiplyScalar(44)); // from its own side of the ship
      director.flyTo({ eye, target: t, fov: director.baseFov }, { duration: 2.2 });
      await waitFlight();
    } catch (e) { console.warn('[embed] converter flight', e); }
    exit({ asset: id, keepPose: true });
  }
  const list = app.querySelector('#index .list');
  if (list) {
    list.append(h('div', { class: 'group' }, 'Amphicos converters (on deck)'));
    for (const [id, n, name, where] of [['spc', 'FC', 'Frequency Converter', 'AMP-SPC shore-to-ship converter'], ['hi', 'HI', 'Hybrid Inverter', 'AMP-HI solar and battery hybrid']]) {
      list.append(h('button', { class: 'sys', role: 'listitem', 'data-asset': id, title: name, onclick: () => { document.body.classList.remove('index-open'); goAsset(id); } },
        h('span', { class: 'n' }, n), h('span', { class: 't' }, h('b', {}, name), h('span', {}, where))));
    }
  }
  const back = h('button', { class: 'btn embed-back', id: 'btn-rig', title: 'Back to the rig (Esc on the vessel overview)', onclick: () => exit() }, '◂ Rig');
  const bar = app.querySelector('.topbar');
  if (bar) bar.prepend(back);
  // one View menu for the secondary tools, as in the host platform; Back, Home, Legacy/Retrofit and 2D stay in the bar
  const tools = app.querySelector('.topbar .tools');
  if (tools) {
    const menu = h('details', { class: 'embed-view' }, h('summary', { class: 'btn' }, 'View'));
    const body = h('div', { class: 'ev-body' });
    for (const sel of ['.menu.wide', '#btn-xray', '#btn-walk', '#btn-tour', '#btn-presenter', '#btn-about']) { const el = tools.querySelector(sel); if (el) body.append(el); }
    menu.append(body); tools.append(menu);
    document.addEventListener('click', (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
  }

  // ---------- host messages ----------
  window.addEventListener('message', (e) => {
    if (host && e.source !== host) return;
    const d = e.data || {};
    if (d.type === 'twin:pause') state.paused = true;
    if (d.type === 'twin:resume' || d.type === 'twin:enter') state.paused = false;
    if (d.type === 'twin:enter') {
      // show exactly the overview the host flew to, with the picture shift settled, and report both back
      try { director.setPose(director.vesselPose()); } catch (er) { /* keep */ }
      const shift = snapShift();
      // reply only once the overview has been drawn, so the host never fades in an empty frame
      state.drawn = 0; state.onDrawn = () => post('twin:entered', { pose: pose3(director.currentPose()), shift });
      try { app.querySelector('canvas')?.focus({ preventScroll: true }); } catch (er) { /* optional */ }
    }
    if (d.type === 'twin:quality' && R) { try { if (d.quality && d.quality !== R.quality) R.setQuality(d.quality); R.setExhibition && R.setExhibition(!!d.exhibition); } catch (er) { console.warn('[embed] quality', er); } }
    if (d.type === 'twin:fps') {
      if (d.on && !state.meter) { state.meter = h('div', { id: 'fps', style: 'position:fixed;right:12px;bottom:12px;z-index:99;font:600 12px monospace;padding:4px 8px;border-radius:6px;background:rgba(0,0,0,.6);color:#7ee2a8;pointer-events:none' }); app.append(state.meter); state.meterT = setInterval(() => { if (state.meter) state.meter.textContent = `${(window.__twin && window.__twin.fps || 0).toFixed(0)} fps · FPSO`; }, 1000); }
      if (!d.on && state.meter) { clearInterval(state.meterT); state.meter.remove(); state.meter = null; }
    }
    if (d.type === 'twin:select' && d.systemId) bus.emit('select:system', { systemId: d.systemId, source: 'host' });
    if (d.type === 'twin:asset' && d.id) goAsset(d.id);
    if (d.type === 'twin:ping') post('twin:ready', { pose: pose3(director.vesselPose()), shift: getShift(), showcase: SHOWCASE });
  });
  // prepare every room's shaders while the twin is still hidden, so the first flight into a room does not stall
  bus.on('app:ready', () => setTimeout(async () => {
    try {
      const r = window.__twin && window.__twin.renderer, rooms = world && world.rooms ? [...world.rooms.values()] : [];
      if (!r || !r.compileAsync) return;
      const was = rooms.map((R) => R.group.visible); rooms.forEach((R) => { R.group.visible = true; });
      await r.compileAsync(scene, camera);
      rooms.forEach((R, i) => { R.group.visible = was[i]; });
    } catch (e) { console.warn('[embed] shader warm-up', e); }
  }, 300));
  bus.on('app:ready', () => post('twin:ready', { pose: pose3(director.vesselPose()), shift: getShift(), showcase: SHOWCASE }));

  state.exit = exit;
  state.update = placeTags;
  // called by the render loop after each drawn frame
  state.afterRender = () => { if (state.onDrawn && ++state.drawn >= 2) { const f = state.onDrawn; state.onDrawn = null; f(); } };
  state.atVesselEsc = () => { exit(); return true; };
  return state;
}
