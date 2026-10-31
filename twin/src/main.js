// Amphicos FPSO Digital Twin: application entry. Wires the database, scene, simulation, HMI modules,
// camera director, navigation state machine, UI and 2D drawings. Fully offline: no network access.
import './styles/app.css';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import logoUrl from './assets/amphicos_logo.png';
import { db, createRenderer, buildWorld, createSim, getHmi, hmiForComponent, depsReport } from './core/deps.js';
import { initCoords } from './core/coords.js';
import { bus } from './core/bus.js';
import { store } from './core/store.js';
import { createNav } from './core/nav.js';
import { createDirector } from './camera/director.js';
import { createWalk } from './camera/walk.js';
import { createShell } from './ui/shell.js';
import { createSystemIndex } from './ui/system_index.js';
import { createContextPanel } from './ui/context_panel.js';
import { createTags } from './ui/tags.js';
import { createPicking } from './ui/picking.js';
import { createMinis } from './ui/minis.js';
import { createHmiHost } from './ui/hmi_window.js';
import { createCameraViews } from './ui/camera_view.js';
import { createArrivalCheck } from './ui/arrival_check.js';
import { createPresenter } from './ui/presenter.js';
import { createAbout } from './ui/about.js';
import { createDrawingsPanel } from './drawings/panel.js';
import { h } from './ui/dom.js';
import { EMBED, initEmbed } from './embed/embed.js';

const params = new URLSearchParams(location.search);
const num = (k, d) => (params.has(k) && Number.isFinite(Number(params.get(k))) ? Number(params.get(k)) : d);

function boot() {
  initCoords(db);
  const app = document.getElementById('app');
  const viewport = document.getElementById('viewport');
  const tagLayer = document.getElementById('tags');
  const loadLogo = document.getElementById('loadlogo');
  if (loadLogo) loadLogo.src = logoUrl;

  // ---------- scene ----------
  const R = createRenderer({ container: viewport, canvas: undefined, quality: params.get('quality') || undefined });
  const { renderer, scene, camera } = R;
  if (renderer.domElement && !renderer.domElement.parentElement) viewport.appendChild(renderer.domElement);
  const dom = renderer.domElement;
  dom.setAttribute('tabindex', '0');
  dom.setAttribute('aria-label', '3D view of the FPSO');
  const world = buildWorld(db, scene, { renderer, camera });
  let quality = params.get('quality') || 'medium';
  try { R.setQuality && R.setQuality(quality); } catch (e) { /* optional */ }

  // ---------- simulation ----------
  const sim = createSim(db, { bus, seed: num('seed', 1) });
  try { sim.start(bus); } catch (e) { console.error('[sim] start failed', e); }
  const getSim = () => sim;

  // ---------- camera and navigation ----------
  const director = createDirector({ camera, dom, world, db, bus });
  const walk = createWalk({ camera, dom, director });
  const cameraViews = createCameraViews({ renderer, scene, world, db });
  const hmiHost = createHmiHost({ root: app, db, store, bus, getSim, getHmi, hmiForComponent, cameraViews });
  const nav = createNav({ db, world, director, store, bus, walk, hmiHost });

  // ---------- UI ----------
  const shell = createShell({ root: app, db, store, bus, nav, logoUrl, director });
  createSystemIndex({ root: app, db, store, bus });
  const context = createContextPanel({ root: app, db, store, bus, nav, hasHmi: hmiHost.hasHmi });
  const drawings = createDrawingsPanel({ root: app, db, store, bus });
  const tags = createTags({ layer: tagLayer, db, world, camera, store, bus, director, renderer });
  const picking = createPicking({ dom, layer: tagLayer, camera, world, store, bus, db });
  // Free screen area for the 3D picture: below the top bar, between the side panels, above bottom panels.
  function freeRect() {
    const vr = viewport.getBoundingClientRect();
    const vis = (el) => el && !el.classList.contains('hidden') && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden';
    const rect = { left: vr.left, right: vr.right, top: vr.top, bottom: vr.bottom };
    const bar = app.querySelector('.topbar');
    if (bar) rect.top = Math.max(rect.top, bar.getBoundingClientRect().bottom);
    const idx = document.getElementById('index');
    const ctxp = document.getElementById('context');
    const wide = vr.width >= 760;
    if (wide && vis(idx)) rect.left = Math.max(rect.left, idx.getBoundingClientRect().right);
    if (wide && vis(ctxp)) rect.right = Math.min(rect.right, ctxp.getBoundingClientRect().left);
    if (!wide && vis(ctxp)) rect.bottom = Math.min(rect.bottom, ctxp.getBoundingClientRect().top);
    for (const id of ['presenter', 'dock2d', 'caption']) {
      const el = document.getElementById(id);
      if (vis(el)) rect.bottom = Math.min(rect.bottom, el.getBoundingClientRect().top);
    }
    return rect;
  }
  const minis = createMinis({ db, world, camera, getSim, bus, store, resolveModule: hmiHost.resolveModule });
  const arrivalCheck = createArrivalCheck({ db, world, camera, dom, picking, director, bus, freeRect });
  const presenter = createPresenter({ root: app, db, store, bus, nav, director,
    opts: { tourDwell: num('tourDwell', 9), idleSeconds: num('idle', EMBED ? 1e7 : 180), presenter: params.get('presenter') === '1',
      onEscAtVessel: () => embed.atVesselEsc && embed.atVesselEsc() } });
  // embedded in the Amphicos 3D Platform (?embed=1): back to the rig, host messages, showcase containers
  const embed = initEmbed({ app, tagLayer, bus, store, nav, director, scene, camera, world, R,
    getShift: () => { measureFreeArea(); return viewShiftTarget; },
    snapShift: () => { measureFreeArea(); viewShift = viewShiftTarget; applyViewShift(); return viewShift; } });

  const walkpad = h('div', { id: 'walkpad', class: 'hidden' });
  const padBtn = (label, f, s) => h('button', { 'aria-label': label,
    onpointerdown: (e) => { e.preventDefault(); walk.setPad(f, s); }, onpointerup: () => walk.setPad(0, 0), onpointerleave: () => walk.setPad(0, 0) }, label);
  walkpad.append(h('span'), padBtn('Fwd', 1, 0), h('span'), padBtn('Left', 0, -1), padBtn('Back', -1, 0), padBtn('Right', 0, 1));
  app.append(walkpad);

  function exportGlb() {
    return new Promise((resolve, reject) => {
      // Export the visible model with every room shown; collision and picking proxies and highlight
      // outlines are left out. Visibility is restored afterwards.
      const changed = [];
      const setVis = (o, v) => { if (o.visible !== v) { changed.push([o, o.visible]); o.visible = v; } };
      for (const R of world.rooms.values()) setVis(R.group, true);
      world.root.traverse((o) => {
        const u = o.userData || {};
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (u.collider || u.pickProxy || o.isLineSegments || o.name === 'highlight-outlines' || (m && m.visible === false)) setVis(o, false);
      });
      const restore = () => { for (const [o, v] of changed.reverse()) o.visible = v; };
      const exporter = new GLTFExporter();
      exporter.parse(world.root, (result) => {
        restore();
        resolve(new Blob([result], { type: 'model/gltf-binary' }));
      }, (err) => { restore(); reject(err); }, { binary: true, onlyVisible: true, maxTextureSize: 1024 });
    });
  }
  async function downloadGlb() {
    shell.toast('Exporting 3D model, please wait');
    try {
      const blob = await exportGlb();
      const a = h('a', { href: URL.createObjectURL(blob), download: 'Amphicos_FPSO_Twin.glb' });
      document.body.append(a); a.click(); a.remove();
      shell.toast(`GLB exported (${(blob.size / 1048576).toFixed(1)} MB)`);
    } catch (e) { console.error(e); shell.toast('Export failed'); }
  }
  createAbout({ root: app, db, bus, store, depsReport,
    onQuality: (q) => { quality = q; try { R.setQuality && R.setQuality(q); } catch (e) { console.warn(e); } shell.toast('Quality: ' + q); },
    onExportGlb: downloadGlb, getStats: () => ({ quality }) });

  // ---------- requests ----------
  bus.on('hover:component', ({ componentId }) => { try { world.setHover && world.setHover(componentId); } catch (e) { console.warn(e); } });
  bus.on('request:xray', () => {
    const on = !store.get().xray;
    store.set({ xray: on });
    try { world.setXRay && world.setXRay(on); } catch (e) { console.warn(e); }
  });
  bus.on('request:variant', ({ variant }) => {
    if (variant !== 'legacy' && variant !== 'retrofit') return;
    store.set({ variant });
    try { world.setVariant && world.setVariant(variant); } catch (e) { console.warn(e); }
    try { sim.command('variant.set', { variant }); } catch (e) { console.warn(e); }
    bus.emit('view:variant', { variant });
    shell.toast(variant === 'legacy' ? 'Showing representative legacy installation' : 'Showing retrofit solution');
  });
  bus.on('request:walk', () => {
    const s = store.get();
    if (walk.active) { walk.disable(); store.set({ walk: false }); return; }
    if (!(s.level === 'room' || s.level === 'equipment') || !s.roomId || director.isFlying()) return;
    walk.enable(director.roomBox(s.roomId));
    store.set({ walk: true });
    shell.toast('Walk mode: WASD or arrows to move, drag to look, F or Esc to leave');
  });
  bus.on('request:reset-ui', () => {
    if (store.get().panel2d) drawings.setOpen(false);
    if (store.get().xray) bus.emit('request:xray', {});
    document.body.classList.remove('index-open');
    bus.closeTopModal && bus.closeTopModal();
  });
  store.subscribe((s, prev) => {
    walkpad.classList.toggle('hidden', !s.walk);
    if (s.level !== prev.level && s.walk && !(s.level === 'room' || s.level === 'equipment')) { walk.disable(); store.set({ walk: false }); }
  });
  if (store.get().variant) { try { world.setVariant && world.setVariant(store.get().variant); } catch (e) { console.warn(e); } }

  // ---------- loop ----------
  const clock = new THREE.Clock();
  let frames = 0; let fpsT = performance.now(); let fps = 0;
  const fpsEl = params.get('fps') === '1' ? h('div', { id: 'fps' }) : null;
  if (fpsEl) app.append(fpsEl);
  function onResize() { R.resize ? R.resize() : null; }
  window.addEventListener('resize', onResize);
  onResize();
  // Optical centre follows the free area between the side panels (camera view offset, eased), so the
  // vessel or room is framed in the visible part of the screen rather than behind a panel.
  let viewShift = 0; let viewShiftTarget = 0;
  function measureFreeArea() {
    const W = viewport.clientWidth;
    if (W < 760) { viewShiftTarget = 0; director.freeAspect = W / Math.max(1, viewport.clientHeight); return; }
    const idx = document.getElementById('index');
    const ctxp = document.getElementById('context');
    const left = idx && !idx.classList.contains('hidden') ? idx.getBoundingClientRect().right : 0;
    const right = ctxp && !ctxp.classList.contains('hidden') ? W - ctxp.getBoundingClientRect().left : 0;
    viewShiftTarget = (left - right) / 2;
    director.freeAspect = Math.max(0.5, (W - left - right) / Math.max(1, viewport.clientHeight));
  }
  store.subscribe(() => { measureFreeArea(); setTimeout(measureFreeArea, 0); });
  window.addEventListener('resize', () => setTimeout(measureFreeArea, 0));
  setTimeout(measureFreeArea, 0);
  function applyViewShift() {
    if (Math.abs(viewShift - viewShiftTarget) < 0.5) viewShift = viewShiftTarget;
    else viewShift += (viewShiftTarget - viewShift) * 0.12;
    const w = viewport.clientWidth, hh = viewport.clientHeight;
    if (Math.abs(viewShift) < 0.5) { if (camera.view && camera.view.enabled) camera.clearViewOffset(); return; }
    // shifting the frustum left moves the picture right: offset by -shift
    if (!camera.view || camera.view.offsetX !== -viewShift || camera.view.fullWidth !== w) camera.setViewOffset(w, hh, -viewShift, 0, w, hh);
  }
  function frame() {
    // hidden behind the host page: keep the loop alive but skip the work
    if (embed.paused) { clock.getDelta(); requestAnimationFrame(frame); return; }
    const dt = Math.min(clock.getDelta(), 0.1);
    const now = performance.now();
    applyViewShift();
    director.update(dt);
    try { world.update && world.update(dt, clock.elapsedTime); } catch (e) { console.error(e); }
    tags.update(now);
    minis.update(now);
    if (embed.update) embed.update();
    R.render ? R.render() : renderer.render(scene, camera);
    if (embed.afterRender) embed.afterRender();
    frames++;
    if (now - fpsT > 1000) { fps = (frames * 1000) / (now - fpsT); frames = 0; fpsT = now; if (fpsEl) fpsEl.textContent = fps.toFixed(0) + ' fps'; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- test and automation hook ----------
  window.__twin = {
    get state() { return store.get(); },
    get fps() { return fps; },
    store, bus, db, world, sim, director, nav, hmiHost, picking, drawings, presenter, tags, minis, camera, renderer, scene,
    deps: depsReport, exportGlb, THREE, embed, context, cameraViews, arrivalCheck, freeRect,
    ready: true,
  };
  const loading = document.getElementById('loading');
  if (loading) { loading.style.opacity = '0'; setTimeout(() => loading.remove(), 600); }
  bus.emit('app:ready', {});
}

try {
  boot();
} catch (err) {
  console.error('[boot] failed', err);
  const l = document.getElementById('loading');
  if (l) l.querySelector('p').textContent = 'Start-up failed: ' + (err && err.message ? err.message : err);
}
