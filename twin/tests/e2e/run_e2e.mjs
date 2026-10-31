// End-to-end visitor journey tests (plain Node + Playwright, no test framework).
// Usage: node tests/e2e/run_e2e.mjs [--no-build] [--allow-stubs] [--only=S01,S02] [--headed]
// Builds the app, serves dist/ with tools/serve.mjs, drives Chromium and saves logs and screenshots to
// quality/test-evidence/TASK-20261030-005949/e2e/ at the repository root (override with EVIDENCE_DIR).
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { serve } from '../../tools/serve.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO = path.resolve(APP, '..', '..', '..', '..', '..');
const EVID = process.env.EVIDENCE_DIR || path.join(REPO, 'quality', 'test-evidence', 'TASK-20261030-005949', 'e2e');
const args = new Set(process.argv.slice(2));
const only = [...args].find((a) => a.startsWith('--only='));
const ONLY = only ? only.slice(7).split(',') : null;
const ALLOW_STUBS = args.has('--allow-stubs');
fs.mkdirSync(EVID, { recursive: true });
fs.mkdirSync(path.join(EVID, 'shots'), { recursive: true });

// Headless Chromium renders with SwiftShader (CPU): use the low quality preset to keep frame times bearable.
const QS = process.env.E2E_QS || 'quality=low';
const BRIEF_KEYWORDS = ['DG Control', 'Power Management', 'MV Relay', 'Drives', 'ICSS', 'PAGA', 'PABX', 'IPTV', 'CCTV', 'Boiler', 'IGG', 'DG Local Control', 'OMD', 'AVR', 'Governor'];
const CHROME_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'];

const results = [];
const logLines = [];
const consoleErrors = [];
const log = (...a) => { const line = a.join(' '); logLines.push(line); console.log(line); };
let current = null;
async function test(name, fn) {
  const t0 = Date.now();
  current = { name, checks: [] };
  try {
    await fn(current);
    results.push({ name, pass: true, ms: Date.now() - t0, checks: current.checks });
    log(`PASS  ${name}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (err) {
    results.push({ name, pass: false, ms: Date.now() - t0, error: String(err && err.stack || err), checks: current.checks });
    log(`FAIL  ${name}: ${err && err.message ? err.message : err}`);
  }
}
function assert(cond, msg, detail) {
  if (current) current.checks.push({ ok: !!cond, msg, detail: detail === undefined ? undefined : detail });
  if (!cond) throw new Error(msg + (detail !== undefined ? ' ' + JSON.stringify(detail) : ''));
}

const shot = async (page, name) => {
  const file = path.join(EVID, 'shots', name.replace(/[^a-z0-9_.-]/gi, '_') + '.jpg');
  await page.screenshot({ path: file, type: 'jpeg', quality: 72, timeout: 180000 });
  return path.relative(REPO, file);
};
const twin = (page, fn, arg) => page.evaluate(fn, arg);
async function waitIdle(page, timeout = 90000) {
  await page.waitForTimeout(120);
  await page.waitForFunction(() => window.__twin && !window.__twin.director.isFlying(), null, { timeout });
  await page.waitForTimeout(150);
}
function attachConsole(page, label) {
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push({ page: label, text: m.text() }); });
  page.on('pageerror', (e) => consoleErrors.push({ page: label, text: 'pageerror: ' + e.message }));
}
async function openApp(browser, url, viewport = { width: 1600, height: 900 }, label = 'main') {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  attachConsole(page, label);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__twin && window.__twin.ready, null, { timeout: 180000 });
  await page.waitForTimeout(800);
  return { ctx, page };
}

// Finds a screen point that picks the wanted component (projected from its world bounding box).
async function findPickPoint(page, componentId) {
  return twin(page, (cid) => {
    const T = window.__twin; const THREE = T.THREE;
    const obj = T.world.components.get(cid);
    if (!obj) return null;
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return null;
    const r = T.renderer.domElement.getBoundingClientRect();
    const c = box.getCenter(new THREE.Vector3()); const s = box.getSize(new THREE.Vector3());
    const samples = [[0, 0, 0]];
    const g = [-0.36, -0.18, 0, 0.18, 0.36];
    for (const fy of [0, 0.25, -0.25, 0.4]) for (const fx of g) for (const fz of g) if (fx || fz || fy) samples.push([fx, fy, fz]);
    for (const [fx, fy, fz] of samples) {
      const p = new THREE.Vector3(c.x + s.x * fx, c.y + s.y * fy, c.z + s.z * fz).project(T.camera);
      if (p.z > 1 || Math.abs(p.x) > 0.98 || Math.abs(p.y) > 0.98) continue;
      const x = r.left + (p.x * 0.5 + 0.5) * r.width; const y = r.top + (-p.y * 0.5 + 0.5) * r.height;
      const el = document.elementFromPoint(x, y);
      if (el !== T.renderer.domElement) continue; // covered by a UI panel
      if (T.picking.pickAt(x, y) === cid) return { x, y };
    }
    return null;
  }, componentId);
}

async function main() {
  const t0 = Date.now();
  if (!args.has('--no-build')) {
    log('Building: npm run build');
    execSync('npm run build', { cwd: APP, stdio: 'inherit' });
  }
  const srv = await serve(process.env.E2E_DIST || path.join(APP, 'dist'), 0);
  const port = srv.address().port;
  const URL0 = `http://127.0.0.1:${port}/`;
  log(`Serving dist on ${URL0}`);
  const browser = await chromium.launch({ headless: !args.has('--headed'), args: CHROME_ARGS });
  const { page } = await openApp(browser, URL0 + '?idle=100000&' + QS);
  const mainPage = page;
  const db = await twin(page, () => window.__twin.db);
  const sysIds = db.systems.map((s) => s.id).filter((id) => !ONLY || ONLY.includes(id));
  const summary = { perSystem: [] };

  await test('boot: real modules loaded, 15 systems listed and tagged (R3)', async () => {
    const deps = await twin(page, () => window.__twin.deps);
    log('  deps ' + JSON.stringify(deps));
    if (!ALLOW_STUBS) for (const [k, v] of Object.entries(deps)) assert(String(v).startsWith('real'), `module ${k} is the real implementation`, v);
    assert(db.systems.length === 15, '15 systems in database', db.systems.length);
    const names = await page.$$eval('#index .sys', (els) => els.map((e) => e.getAttribute('title')));
    assert(names.length === 15, '15 entries in the system index', names.length);
    db.systems.forEach((s, i) => {
      assert(s.id === 'S' + String(i + 1).padStart(2, '0'), `system id order ${s.id}`);
      assert(s.name.toLowerCase().includes(BRIEF_KEYWORDS[i].toLowerCase()), `system ${s.id} matches brief item ${i + 1} (${BRIEF_KEYWORDS[i]})`, s.name);
    });
    const tagged = await twin(page, () => {
      const vis = [...document.querySelectorAll('#tags .tag')].filter((e) => e.style.display !== 'none').map((e) => e.dataset.system);
      const cl = [...document.querySelectorAll('#tags .cluster button')].map((e) => e.dataset.system);
      return [...new Set([...vis, ...cl])].sort();
    });
    assert(tagged.length === 15, '15 numbered tags reachable at vessel level (single or clustered)', tagged);
    await shot(page, '00_vessel_overview');
  });

  await test('free exploration: orbit, zoom and view presets (R2)', async () => {
    const before = await twin(page, () => window.__twin.camera.position.toArray());
    const box = await page.locator('#viewport canvas').boundingBox();
    const cx = box.x + box.width * 0.5, cy = box.y + box.height * 0.55;
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 220, cy - 40, { steps: 12 }); await page.mouse.up();
    await page.waitForTimeout(700);
    const after = await twin(page, () => window.__twin.camera.position.toArray());
    const moved = Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]);
    assert(moved > 5, 'drag orbits the camera', moved);
    const d0 = await twin(page, () => window.__twin.camera.position.distanceTo(window.__twin.director.controls.target));
    await page.mouse.move(cx, cy); await page.mouse.wheel(0, -600); await page.waitForTimeout(800);
    const d1 = await twin(page, () => window.__twin.camera.position.distanceTo(window.__twin.director.controls.target));
    assert(d1 < d0, 'wheel zooms in', { d0, d1 });
    for (const p of ['bow', 'port', 'stern', 'top', 'starboard', 'overview']) {
      await page.click('#btn-views'); await page.click(`[data-preset="${p}"]`);
      await waitIdle(page);
      const err = await twin(page, (k) => window.__twin.camera.position.distanceTo(window.__twin.director.presets[k].eye), p);
      assert(err < 1, `preset ${p} reached`, err);
      if (p === 'bow' || p === 'port') await shot(page, '01_preset_' + p);
    }
    await page.click('#btn-xray'); await page.waitForTimeout(600);
    assert((await twin(page, () => window.__twin.state.xray)) === true, 'x-ray on');
    await shot(page, '01_xray');
    await page.click('#btn-xray'); await page.waitForTimeout(300);
  });

  for (const sid of sysIds) {
    const sys = db.systems.find((s) => s.id === sid);
    await test(`journey ${sid} ${sys.short || sys.name}: vessel > room > equipment > HMI > back (R4 R5 R6 R7 R11)`, async () => {
      const arr = await twin(page, (sid) => { const a = window.__twin.director.systemArrival(sid); return { roomId: a.roomId, source: a.source, primary: a.primary }; }, sid);
      const ROOM = arr.roomId;
      const rec = { system: sid, room: ROOM, arrivalSource: arr.source };
      await twin(page, () => window.__twin.nav.home()); await waitIdle(page);
      await twin(page, () => { window.__flights = []; if (!window.__flightHook) window.__flightHook = window.__twin.bus.on('camera:flight', (e) => window.__flights && window.__flights.push(e)); });
      await page.click(`#index .sys[data-system="${sid}"]`);
      await page.waitForTimeout(250);
      await waitIdle(page);
      const fl = await twin(page, () => window.__flights);
      const started = fl.find((e) => e.phase === 'start');
      assert(started && started.duration >= 2 && fl.some((e) => e.phase === 'end'), 'a planned camera flight of 2 s or more started and ended (no teleport)', fl);
      const f = await twin(page, () => ({ f: window.__twin.director.lastFlight, r: window.__twin.director.lastRoute, s: window.__twin.state }));
      rec.flight = { duration: +f.f.duration.toFixed(2), waypoints: f.f.waypoints, obstructed: f.r && f.r.obstructed };
      assert(f.f.duration > 0.8 && !f.f.interrupted, 'flight to the system lasted more than 0.8 s', f.f.duration);
      assert(f.s.level === 'room', 'level is room', f.s.level);
      assert(f.s.roomId === ROOM, `arrived at the system arrival room (${arr.source})`, f.s.roomId);
      assert(!(await page.$('#hmiwin')), 'no HMI opened automatically');
      const view = await twin(page, (rid) => {
        const T = window.__twin; const THREE = T.THREE;
        const b = T.director.roomBox(rid);
        const inside = b.clone().expandByScalar(3).containsPoint(T.camera.position);
        const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(T.camera.projectionMatrix, T.camera.matrixWorldInverse));
        const ov = T.director.systemArrival(T.state.systemId).pose;
        return { inside, centreVisible: fr.containsPoint(b.getCenter(new THREE.Vector3())), cutaway: T.nav.cutaway, eyeErr: +T.camera.position.distanceTo(ov.eye).toFixed(3), fov: +T.camera.fov.toFixed(1), framing: T.director.framing[rid] ? { score0: T.director.framing[rid].score0, score: T.director.framing[rid].score, moved: T.director.framing[rid].moved } : null };
      }, ROOM);
      assert(view.inside || view.centreVisible, 'camera is in or viewing the room', view);
      const openRoom = await twin(page, (rid) => !!(window.__twin.world.rooms.get(rid) || {}).open, ROOM);
      assert(openRoom ? view.cutaway === null || view.cutaway === ROOM : view.cutaway === ROOM, 'cutaway opened for the room (none for open deck areas)', view.cutaway);
      assert(view.eyeErr < 0.3, 'camera settled at the arrival viewpoint (not pushed away by orbit limits)', view);
      rec.arrival = { eyeErr: view.eyeErr, fov: view.fov, framing: view.framing };
      rec.shots = [await shot(page, `${sid}_1_room`)];

      // R5: every primary component of the system is visible at arrival (occlusion and side panels considered).
      const vis = await twin(page, ({ sid, primary }) => window.__twin.arrivalCheck.run(sid, primary), { sid, primary: arr.primary });
      rec.visibility = { source: vis.source, visible: vis.visibleCount, total: vis.total, components: vis.primary.map((c) => ({ id: c.id, samples: c.samples, inFreeArea: c.inFree, unoccluded: c.visible, mountedHits: c.mountedHits || 0 })) };
      assert(vis.allVisible, `all ${vis.total} primary components visible at arrival (unoccluded sample inside the free screen area)`, rec.visibility.components);

      // Stage 4: click the first primary component at its projected, unoccluded point.
      const first = vis.primary[0];
      const picked = first.id;
      const pt = first.point;
      assert(pt, 'first primary component has a clickable point', first);
      rec.clicked = picked; rec.clickPoint = pt;
      await page.mouse.click(pt.x, pt.y);
      await page.waitForTimeout(200);
      await waitIdle(page);
      let st = await twin(page, () => window.__twin.state);
      assert(st.level === 'equipment' && st.componentId === picked, 'clicking the first primary component selects it', st);
      const ff = await twin(page, () => window.__twin.director.lastFlight);
      assert(ff.duration > 0.8, 'focus flight is smooth (> 0.8 s)', ff.duration);
      assert(await page.isVisible('#ctx-eq-name'), 'equipment card visible');
      if (['S01', 'S02', 'S12'].includes(sid)) rec.shots.push(await shot(page, `${sid}_2_equipment`));

      // Stage 5: open the HMI or inspection on the system's own host equipment. Prefer a host in the room we
      // are in; a host elsewhere is reached from the vessel so the expected Back sequence stays room > vessel.
      const host = await twin(page, ({ sid, rid, picked }) => {
        const d = window.__twin.db; const s = d.systems.find((x) => x.id === sid);
        const hosts = [...((s.hmi && s.hmi.host_components) || []), s.primary_component];
        const room = (id) => (d.components.find((c) => c.id === id) || {}).room;
        if (hosts.includes(picked)) return { id: picked, room: rid };
        const here = hosts.find((h) => room(h) === rid);
        const id = here || hosts[0];
        return { id, room: room(id) };
      }, { sid, rid: ROOM, picked });
      let backRoom = ROOM;
      if (host.id !== picked) {
        if (host.room !== ROOM) { await twin(page, () => window.__twin.nav.home()); await waitIdle(page); }
        await twin(page, (cid) => window.__twin.bus.emit('select:component', { componentId: cid, source: 'test' }), host.id);
        await page.waitForTimeout(200);
        await waitIdle(page);
        backRoom = host.room;
      }
      rec.hmiHost = host.id;
      await page.click('#btn-open-hmi');
      await page.waitForSelector('#hmiwin #hmi-body', { timeout: 10000 });
      await page.waitForTimeout(700);
      st = await twin(page, () => window.__twin.state);
      assert(st.level === 'hmi', 'level is hmi', st.level);
      const mounted = await twin(page, () => { const b = document.querySelector('#hmi-body'); return { kids: b.children.length, text: b.innerText.length, module: b.dataset.module }; });
      assert(mounted.kids > 0 && mounted.text > 20, 'HMI module mounted with content', mounted);
      rec.module = mounted.module;
      const banner = await twin(page, () => document.querySelector('#hmiwin').innerText.includes('EDUCATIONAL SIMULATION'));
      assert(banner, 'educational simulation banner shown');
      if (sid === 'S09') {
        // CCTV tiles show the actual twin: ctx.renderCameraView renders the scene from the camera component
        await page.waitForFunction(() => window.__twin.cameraViews.renders > 0, null, { timeout: 120000 });
        await page.waitForTimeout(1500);
        const tile = await twin(page, () => {
          const cs = [...document.querySelectorAll('#hmi-body canvas')].sort((a, b) => b.width * b.height - a.width * a.height);
          const c = cs[0]; if (!c) return null;
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          let sum = 0, sum2 = 0, n = 0;
          for (let i = 0; i < d.length; i += 16) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += v; sum2 += v * v; n++; }
          const mean = sum / n;
          return { w: c.width, h: c.height, mean, std: Math.sqrt(Math.max(0, sum2 / n - mean * mean)), renders: window.__twin.cameraViews.renders };
        });
        rec.cctvTile = tile;
        assert(tile && tile.renders > 0 && tile.std > 4, 'CCTV tile shows a rendered, non-blank picture of the twin', tile);
      }
      // interact with one control and check that the module or the simulation reacts
      const ctl = await twin(page, () => {
        const b = document.querySelector('#hmi-body');
        const els = [...b.querySelectorAll('button:not([disabled]), [role="button"], select, input[type="range"], input[type="checkbox"]')]
          .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(e).visibility !== 'hidden'; });
        const pick = els.find((e) => /start|close|open|test|run|reset|ack|select|mode|call|play|tone|auto|manual|trip|inject/i.test(e.innerText || e.getAttribute('aria-label') || '')) || els[0];
        if (!pick) return null;
        pick.setAttribute('data-e2e-ctl', '1');
        const r = pick.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, tag: pick.tagName, label: (pick.innerText || pick.getAttribute('aria-label') || '').trim().slice(0, 40) };
      });
      assert(ctl, 'HMI exposes at least one interactive control');
      const snap = () => twin(page, () => ({ html: document.querySelector('#hmi-body').innerHTML.length + ':' + document.querySelector('#hmi-body').innerText, sim: (() => { try { return JSON.stringify(window.__twin.sim.state).length + ':' + JSON.stringify(window.__twin.sim.state).slice(0, 20000); } catch (e) { return ''; } })() }));
      const before = await snap();
      if (ctl.tag === 'SELECT') {
        await page.selectOption('[data-e2e-ctl="1"]', { index: 1 }).catch(() => {});
      } else await page.mouse.click(ctl.x, ctl.y);
      await page.waitForTimeout(900);
      const after = await snap();
      rec.control = ctl.label;
      assert(before.html !== after.html || before.sim !== after.sim, 'control changed the HMI or the simulation state', ctl);
      rec.shots.push(await shot(page, `${sid}_3_hmi`));
      await page.click('#hmi-close');
      await page.waitForTimeout(300);
      st = await twin(page, () => window.__twin.state);
      assert(!(await page.$('#hmiwin')) && st.level === 'equipment', 'HMI closed, back at equipment', st.level);

      // Stage 6: Escape twice returns to room, then vessel.
      await page.keyboard.press('Escape');
      await waitIdle(page);
      st = await twin(page, () => window.__twin.state);
      assert(st.level === 'room' && st.roomId === backRoom, 'Escape returns to the room', { st, backRoom });
      const fb = await twin(page, () => window.__twin.director.lastFlight);
      assert(fb.duration > 0.8, 'return flight to the room is smooth', fb.duration);
      await page.keyboard.press('Escape');
      await waitIdle(page);
      st = await twin(page, () => ({ s: window.__twin.state, cut: window.__twin.nav.cutaway, f: window.__twin.director.lastFlight }));
      assert(st.s.level === 'vessel', 'second Escape returns to the vessel overview', st.s.level);
      assert(st.cut === null, 'hull restored (cutaway closed)', st.cut);
      assert(st.f.duration > 0.8, 'return flight to the vessel is smooth', st.f.duration);
      summary.perSystem.push(rec);
    });
  }

  await test('2D to 3D and 3D to 2D cross-selection (R10)', async () => {
    const sys = db.systems.find((s) => s.id === 'S02') || db.systems[0];
    const sysRoom = await twin(page, (id) => window.__twin.director.systemArrival(id).roomId, sys.id);
    await twin(page, () => window.__twin.nav.home()); await waitIdle(page);
    await page.keyboard.press('KeyG');
    await page.waitForSelector('#dock2d:not(.hidden) svg');
    // GA marker click selects the system in 3D
    await page.selectOption('#dw-view', 'ga');
    await page.waitForTimeout(200);
    const m = await page.locator(`#dock2d svg [data-kind="system"][data-id="${sys.id}"]`).first().boundingBox();
    assert(m, 'system marker present in the GA plan');
    await page.mouse.click(m.x + m.width / 2, m.y + m.height / 2);
    await page.waitForTimeout(200); await waitIdle(page);
    let st = await twin(page, () => window.__twin.state);
    assert(st.systemId === sys.id && st.level === 'room' && st.roomId === sysRoom, 'GA marker click flies to the system room in 3D', st);
    await shot(page, '2d_1_ga_marker_to_3d');
    // Room layout: click a component footprint
    await page.selectOption('#dw-view', 'room');
    await page.waitForTimeout(300);
    const comp = await twin(page, (rid) => {
      const els = [...document.querySelectorAll('#dock2d svg rect.comp[data-kind="component"]')];
      const d = window.__twin.db; const sid = window.__twin.state.systemId;
      const e = els.find((x) => (x.dataset.sys || '').split(' ').includes(sid)) || els[0];
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { id: e.dataset.id, x: r.left + r.width / 2, y: r.top + r.height / 2, room: d.components.find((c) => c.id === e.dataset.id).room };
    }, sysRoom);
    assert(comp, 'room layout shows component footprints');
    const dataRoom = await page.getAttribute('#dock2d svg', 'data-room');
    assert(dataRoom === sysRoom, 'room layout follows the 3D room', dataRoom);
    await page.mouse.click(comp.x, comp.y);
    await page.waitForTimeout(200); await waitIdle(page);
    st = await twin(page, () => window.__twin.state);
    assert(st.level === 'equipment' && st.componentId === comp.id, '2D click selects and focuses the same id in 3D', { st, comp });
    const hl3d = await twin(page, (id) => window.__twin.state.componentId === id, comp.id);
    assert(hl3d, '3D selection equals 2D id');
    await shot(page, '2d_2_room_click_to_3d');
    // 3D selection highlights in 2D
    const other = await twin(page, ({ rid, not }) => window.__twin.db.components.find((c) => c.room === rid && c.id !== not).id, { rid: sysRoom, not: comp.id });
    const pt = await findPickPoint(page, other);
    if (pt) await page.mouse.click(pt.x, pt.y);
    else await twin(page, (id) => window.__twin.bus.emit('select:component', { componentId: id, source: '3d' }), other);
    await page.waitForTimeout(200); await waitIdle(page);
    const sel = await twin(page, (id) => [...document.querySelectorAll(`#dock2d svg [data-kind="component"][data-id="${id}"]`)].some((e) => e.classList.contains('sel')), other);
    assert(sel, '3D selection highlights the same id in the 2D room layout', { other, viaClick: !!pt });
    for (const v of ['profile', 'deck', 'distribution']) {
      await page.selectOption('#dw-view', v); await page.waitForTimeout(300);
      const n = await page.$$eval('#dock2d svg [data-id]', (els) => els.length);
      assert(n > 5, `2D ${v} view has selectable elements`, n);
      const tb = await page.$eval('#dock2d svg', (s) => s.textContent.includes('Representative arrangement, not for construction'));
      assert(tb, `2D ${v} title block carries the representative disclaimer`);
      await shot(page, '2d_3_' + v);
    }
    await page.click('#dw-max'); await page.waitForTimeout(200); await shot(page, '2d_4_enlarged'); await page.click('#dw-max');
    await page.keyboard.press('KeyG'); await page.waitForTimeout(200);
    await twin(page, () => window.__twin.nav.home()); await waitIdle(page);
  });

  await test('presenter keys, quick-jump bar, guided tour, legacy and retrofit, walk mode (R11 presenter)', async () => {
    await page.keyboard.press('Digit3'); await page.waitForTimeout(200); await waitIdle(page);
    assert((await twin(page, () => window.__twin.state.systemId)) === 'S03', 'key 3 jumps to system 3');
    await page.keyboard.press('PageDown'); await page.waitForTimeout(200); await waitIdle(page);
    assert((await twin(page, () => window.__twin.state.systemId)) === 'S04', 'PageDown goes to the next system');
    await page.keyboard.press('Shift+Digit2'); await page.waitForTimeout(200); await waitIdle(page);
    assert((await twin(page, () => window.__twin.state.systemId)) === 'S12', 'Shift+2 jumps to system 12');
    await page.keyboard.press('KeyP');
    await page.waitForSelector('#presenter:not(.hidden)');
    await page.click('#presenter [data-system="S09"]'); await page.waitForTimeout(200); await waitIdle(page);
    assert((await twin(page, () => window.__twin.state.systemId)) === 'S09', 'quick-jump bar selects system 9');
    await shot(page, 'p_1_presenter_bar');
    // walk mode in the room
    await page.keyboard.press('KeyF'); await page.waitForTimeout(200);
    assert((await twin(page, () => window.__twin.state.walk)) === true, 'walk mode on');
    await page.keyboard.down('KeyW'); await page.waitForTimeout(900); await page.keyboard.up('KeyW');
    const w = await twin(page, () => { const T = window.__twin; const b = T.director.roomBox(T.state.roomId); return { y: T.camera.position.y, floor: b.min.y, inside: b.containsPoint(T.camera.position) }; });
    assert(Math.abs(w.y - w.floor - 1.7) < 0.05 && w.inside, 'walk eye height 1.7 m inside the room', w);
    await shot(page, 'p_2_walk');
    await page.keyboard.press('KeyF');
    // legacy / retrofit
    await page.click('#variant-seg [data-variant="legacy"]'); await page.waitForTimeout(400);
    assert((await twin(page, () => window.__twin.state.variant)) === 'legacy', 'legacy variant selected');
    await shot(page, 'p_3_legacy');
    await page.click('#variant-seg [data-variant="retrofit"]'); await page.waitForTimeout(300);
    // tour
    await twin(page, () => window.__twin.nav.home()); await waitIdle(page);
    await page.keyboard.press('KeyT'); await page.waitForTimeout(400);
    assert(await page.isVisible('#caption'), 'tour caption visible');
    await waitIdle(page);
    const ts = await twin(page, () => ({ tour: window.__twin.state.tour, sys: window.__twin.state.systemId }));
    assert(ts.tour && ts.sys === 'S01', 'tour starts at system 1', ts);
    await shot(page, 'p_4_tour_caption');
    const box = await page.locator('#viewport canvas').boundingBox();
    await page.mouse.click(box.x + box.width * 0.5, box.y + 30);
    await page.waitForTimeout(300);
    assert((await twin(page, () => window.__twin.presenter.tour && window.__twin.presenter.tour.paused)) === true, 'tour pauses on user input');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    assert((await twin(page, () => window.__twin.state.tour)) === false, 'Escape ends the tour');
    await page.keyboard.press('KeyP');
    // about panel and disclaimer
    await page.click('#btn-about'); await page.waitForSelector('#about #disclaimer');
    const disc = await page.$eval('#disclaimer', (e) => e.innerText);
    assert(/educational simulation/i.test(disc) && /not vessel-specific/i.test(disc) && /no engineering validation/i.test(disc), 'About shows the disclaimer');
    await shot(page, 'p_5_about');
    await page.keyboard.press('Escape');
    await twin(page, () => window.__twin.nav.home()); await waitIdle(page);
  });

  await test('performance indication (headless software rendering, not representative of a GPU)', async () => {
    await twin(page, () => window.__twin.nav.home()); await waitIdle(page);
    await page.waitForTimeout(2500);
    const fps = await twin(page, () => ({ fps: window.__twin.fps, info: window.__twin.renderer.info.render, mem: window.__twin.renderer.info.memory }));
    summary.fps = fps;
    log('  headless fps ' + JSON.stringify(fps));
    assert(fps.fps > 0, 'renders frames', fps);
  });

  // free the CPU for the following pages (software rendering is CPU bound)
  await page.context().close().catch((e) => log('  note: main context close: ' + e.message));

  await test('attract mode after idle, any input exits (exhibition)', async () => {
    const { ctx, page: p2 } = await openApp(browser, URL0 + '?idle=2&' + QS, { width: 1280, height: 720 }, 'attract');
    await p2.waitForFunction(() => window.__twin.state.attract === true, null, { timeout: 15000 });
    // the slow orbit starts once the return flight to the vessel overview has finished
    const ar = await p2.waitForFunction(() => window.__twin.director.controls.autoRotate === true, null, { timeout: 120000 }).then(() => true, () => false);
    const st = await p2.evaluate(() => ({ level: window.__twin.state.level, panel2d: window.__twin.state.panel2d, hmi: !!document.querySelector('#hmiwin') }));
    assert(ar, 'slow orbit active in attract mode');
    assert(st.level === 'vessel' && !st.panel2d && !st.hmi, 'attract mode resets the UI to the vessel overview', st);
    await shot(p2, 'p_6_attract');
    await p2.keyboard.press('KeyA');
    await p2.waitForTimeout(200);
    assert((await p2.evaluate(() => window.__twin.state.attract)) === false, 'input leaves attract mode');
    await ctx.close();
  });

  await test('phone viewport 390 px: no horizontal scroll, index drawer works', async () => {
    const { ctx, page: p3 } = await openApp(browser, URL0 + '?idle=100000&' + QS, { width: 390, height: 844 }, 'phone');
    const sw = await p3.evaluate(() => ({ sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth }));
    assert(sw.sw <= 390 && sw.bw <= 390, 'no horizontal overflow', sw);
    await shot(p3, 'm_1_phone_vessel');
    await p3.click('#btn-systems'); await p3.waitForTimeout(400);
    await shot(p3, 'm_2_phone_index');
    await p3.click('#index .sys[data-system="S05"]');
    await p3.waitForTimeout(200);
    await p3.waitForFunction(() => !window.__twin.director.isFlying(), null, { timeout: 90000 });
    const st = await p3.evaluate(() => window.__twin.state);
    assert(st.level === 'room' && st.systemId === 'S05', 'system selectable on a phone', st);
    await shot(p3, 'm_3_phone_room');
    await ctx.close();
  });

  await test('offline: single-file build from file:// with zero network requests (R12)', async () => {
    const file = process.env.E2E_SINGLE || path.join(APP, 'dist-single', 'Amphicos_FPSO_Digital_Twin.html');
    assert(fs.existsSync(file), 'single-file build exists', file);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 }, offline: true });
    const requests = [];
    await ctx.route('**/*', (route) => {
      const u = route.request().url();
      requests.push(u);
      if (u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) route.continue(); else route.abort();
    });
    const p4 = await ctx.newPage();
    attachConsole(p4, 'offline');
    p4.on('request', (r) => { if (!requests.includes(r.url())) requests.push(r.url()); });
    await p4.goto(pathToFileURL(file).href + '?idle=100000&' + QS, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await p4.waitForFunction(() => window.__twin && window.__twin.ready, null, { timeout: 120000 });
    const deps = await p4.evaluate(() => window.__twin.deps);
    if (!ALLOW_STUBS) for (const [k, v] of Object.entries(deps)) assert(String(v).startsWith('real'), `offline build uses real ${k}`, v);
    await p4.click('#index .sys[data-system="S02"]');
    await p4.waitForTimeout(200);
    await p4.waitForFunction(() => !window.__twin.director.isFlying(), null, { timeout: 90000 });
    const hostId = await p4.evaluate(() => { const s = window.__twin.db.systems.find((x) => x.id === 'S02'); return s.hmi.host_components[0] || s.primary_component; });
    await p4.evaluate((id) => window.__twin.bus.emit('select:component', { componentId: id, source: 'test' }), hostId);
    await p4.waitForTimeout(200);
    await p4.waitForFunction(() => !window.__twin.director.isFlying(), null, { timeout: 90000 });
    await p4.click('#btn-open-hmi');
    await p4.waitForSelector('#hmi-body');
    await p4.waitForTimeout(1200);
    await shot(p4, 'o_1_offline_file_hmi');
    const external = requests.filter((u) => !(u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')));
    fs.writeFileSync(path.join(EVID, 'offline_requests.json'), JSON.stringify({ file: path.relative(REPO, file), total: requests.length, external, all: requests.map((u) => u.slice(0, 120)) }, null, 2));
    assert(external.length === 0, 'zero non-file network requests', external);
    await ctx.close();
  });

  await test('console: zero errors across all pages', async () => {
    assert(consoleErrors.length === 0, 'no console errors', consoleErrors.slice(0, 10));
  });

  await browser.close();
  srv.close();
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  const report = { date: new Date().toISOString(), durationS: Math.round((Date.now() - t0) / 1000), passed, failed, total: results.length, results, summary, consoleErrors };
  fs.writeFileSync(path.join(EVID, 'e2e_results.json'), JSON.stringify(report, null, 2));
  log(`\n${passed} passed, ${failed} failed, ${results.length} tests in ${report.durationS} s`);
  fs.writeFileSync(path.join(EVID, 'e2e_log.txt'), logLines.join('\n') + '\n');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
