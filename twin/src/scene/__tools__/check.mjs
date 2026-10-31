// Scene API and coverage checks against the real db. Usage: node src/scene/__tools__/check.mjs <baseUrl>
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const base = process.argv[2] || 'http://127.0.0.1:5179';
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(base + '/src/scene/dev.html?manual=1&quality=low');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
const res = await page.evaluate(async () => {
  const { world, db, camera, V } = window.__dev;
  const THREE = await import('/node_modules/.vite/deps/three.js').catch(() => null);
  const out = {};
  out.components = { db: db.components.length, built: world.components.size, missing: db.components.filter((c) => !world.components.get(c.id)).map((c) => c.id) };
  out.userData = [...world.components.values()].every((g) => g.userData.componentId && g.userData.systemId && g.userData.pickable === true);
  out.rooms = { db: db.rooms.length, built: world.rooms.size };
  out.tagAnchors = world.tagAnchors.size;
  out.screens = { components: world.screens.size, meshes: [...world.screens.values()].reduce((a, l) => a + l.length, 0) };
  out.hmiHostsWithScreens = db.systems.flatMap((s) => s.hmi.host_components).filter((id) => !world.screens.get(id));
  out.report = { fallbackTypes: world.report.fallbackTypes, outsideRoom: world.report.outsideRoom, failed: world.report.failed, unknownRoom: world.report.unknownRoom };
  out.pickablesVessel = world.pickables.length;
  // reachability: for each component in a closed room, open the cutaway, cast a ray from the room overview eye
  // to the component centre and test that the first proxy hit is that component and nothing solid blocks it.
  const ray = new THREE.Raycaster();
  const FACING = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+y': [0, 0, -1], '-y': [0, 0, 1] };
  const unreachable = [];
  const clearFrom = (eye, t, c) => {
    ray.set(eye, t.clone().sub(eye).normalize()); ray.far = eye.distanceTo(t) + 0.5;
    const hits = ray.intersectObjects(world.pickables, true);
    const mine = hits.find((h) => h.object.userData.componentId === c.id);
    if (!mine) return false;
    if (hits[0].object.userData.componentId !== c.id && hits[0].distance < mine.distance - 0.05) {
      // a different component in front: allowed only if it is mounted on / hosts this one
      const o = db.components.find((k) => k.id === hits[0].object.userData.componentId);
      if (!(o && (o.mounted_on === c.id || c.mounted_on === o.id))) return false;
    }
    ray.far = mine.distance;
    const solid = ray.intersectObject(world.root, true).filter((h) => { if (h.object.userData.pickProxy || h.object.userData.noCollide) return false; for (let p = h.object; p; p = p.parent) if (!p.visible) return false; return true; });
    return !solid.some((h) => { let p = h.object; while (p && !p.userData.componentId) p = p.parent; if (!p) return true; const o = db.components.find((k) => k.id === p.userData.componentId); return p.userData.componentId !== c.id && !(o && (o.mounted_on === c.id || c.mounted_on === o.id)); });
  };
  for (const r of db.rooms) {
    const R = world.rooms.get(r.id);
    if (!R.open) world.setCutaway(r.id, { animate: false }); else world.setCutaway(null, { animate: false });
    const inner = R.box.clone().expandByScalar(-0.15);
    for (const c of db.components.filter((k) => k.room === r.id)) {
      const g = world.components.get(c.id);
      const d = g.userData.dims;
      const t = new THREE.Vector3(0, d.H / 2, 0).applyMatrix4(g.matrixWorld);
      const f = new THREE.Vector3(...FACING[c.facing]);
      const side = new THREE.Vector3(-f.z, 0, f.x);
      let ok = false;
      for (const dist of [0.9, 1.6, 2.5]) for (const lat of [0, 0.6, -0.6]) for (const up of [0, 0.5, -0.4]) {
        if (ok) break;
        const e = t.clone().addScaledVector(f, d.D / 2 + dist).addScaledVector(side, lat).add(new THREE.Vector3(0, up, 0));
        if (!R.open) e.clamp(inner.min, inner.max);
        if (clearFrom(e, t, c)) ok = true;
      }
      if (!ok) unreachable.push(c.id);
    }
  }
  out.reach = { checked: db.components.length, unreachableFromFront: unreachable.length, unreachable };
  // pick priority: ray from in front of each LCP toward its SPD must hit the SPD proxy first
  world.setCutaway('R_ER_GEN', { animate: false });
  out.spdPick = ['C_DG1_SPD', 'C_DG2_SPD', 'C_DG3_SPD'].map((id) => {
    const g = world.components.get(id);
    const t = new THREE.Vector3(0, g.userData.dims.H / 2, 0).applyMatrix4(g.matrixWorld);
    const e = t.clone().add(new THREE.Vector3(0, 0, -1.5)); // SPD faces ship +y = world -z
    ray.set(e, t.clone().sub(e).normalize()); ray.far = 3;
    const h = ray.intersectObjects(world.pickables, true)[0];
    return id + ':' + (h ? h.object.userData.componentId + ' prio ' + h.object.userData.pickPriority : 'none');
  });
  // API calls
  world.setCutaway('R_MSB', { animate: true }); for (let i = 0; i < 30; i++) world.update(0.05, i * 0.05);
  out.cutBox = world.cut.box.min.toArray().map((v) => +v.toFixed(2));
  world.setHighlight({ systemId: 'S02', mode: 'dim-others' });
  world.setHighlight({ componentIds: ['C_PMS_CAB'], mode: 'hover' });
  world.setHighlight({ systemId: 'S03', componentIds: ['C_IED_G1'], mode: 'select' });
  world.setVariant('legacy'); world.setVariant('retrofit');
  world.setXRay(true); out.pickablesXray = world.pickables.length; world.setXRay(false);
  world.setCutaway(null, { animate: false });
  out.info = world.cutawayInfo('R_HVSWBD').side + '/' + world.cutawayInfo('R_MSB').side;
  return out;
});
console.log(JSON.stringify(res, null, 1));
console.log('errors:', errors.slice(0, 10));
await browser.close();
