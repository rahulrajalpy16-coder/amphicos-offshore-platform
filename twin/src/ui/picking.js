// 3D picking: click and hover on equipment. Proxies in world.pickables are tested first, then the scene is
// tested for anything solid in front of the hit (so equipment behind the closed hull is not pickable).
import * as THREE from 'three';
import { h } from './dom.js';
import { isSolidHit } from '../camera/collide.js';
import { facingToWorld } from '../core/coords.js';

export function createPicking({ dom, layer, camera, world, store, bus, db }) {
  const compById = new Map(db.components.map((c) => [c.id, c]));
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tip = h('div', { class: 'hovertip hidden' });
  layer.parentElement.append(tip);
  let hoverId = null;

  const pickableSet = new Set();
  function refreshPickables() {
    pickableSet.clear();
    for (const p of world.pickables) p.traverse((o) => pickableSet.add(o));
  }
  refreshPickables();

  function compIdOf(o) {
    for (let p = o; p; p = p.parent) if (p.userData && p.userData.componentId) return p.userData.componentId;
    return null;
  }
  const solid = (hit) => isSolidHit(hit, { ignore: (o) => pickableSet.has(o) });
  function visibleChain(o) {
    for (let p = o; p; p = p.parent) if (p.visible === false && !(p.userData && p.userData.pickProxy)) return false;
    return true;
  }

  // Returns componentId under client coordinates (or null).
  function pickAt(clientX, clientY) {
    const r = dom.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    ray.far = 2500;
    const hits = ray.intersectObjects(world.pickables, true).filter((hh) => visibleChain(hh.object) || (hh.object.userData && hh.object.userData.pickProxy));
    if (!hits.length) return null;
    // mounted items (relays on panel doors, heads on engines) carry pickPriority on their proxy: when two hits
    // are within 0.1 m, the higher priority wins
    const prio = (hh) => { for (let p = hh.object; p; p = p.parent) if (p.userData && p.userData.pickPriority != null) return p.userData.pickPriority; return 0; };
    let hit = hits[0];
    for (const hh of hits) {
      if (hh.distance - hits[0].distance > 0.1) break;
      if (prio(hh) > prio(hit)) hit = hh;
    }
    let id = compIdOf(hit.object);
    if (!id) return null;
    // A mounted item can sit inside its host's pick box (a governor actuator on the engine free end). If the
    // ray also passes through the proxy of an item mounted on the first-hit host, compare the real geometry:
    // the item whose visible meshes the ray meets first wins.
    const kids = hits.filter((hh) => { const k = compIdOf(hh.object); const c = k && compById.get(k); return c && c.mounted_on === id; });
    if (kids.length) {
      const rayAt = ray.ray.clone();
      const realDist = (cid) => {
        const g = world.components.get(cid);
        if (!g) return Infinity;
        const rc = new THREE.Raycaster(rayAt.origin, rayAt.direction, 0, 2500);
        const hh = rc.intersectObject(g, true).find((x) => !(x.object.userData && x.object.userData.pickProxy) && !x.object.isLine && !x.object.isLineSegments && visibleChain(x.object));
        return hh ? hh.distance : Infinity;
      };
      const hostD = realDist(id);
      let best = null;
      for (const k of kids) {
        const kid = compIdOf(k.object);
        const d = realDist(kid);
        // hosts built as merged static meshes are not ray-testable (hostD infinite): then accept the mounted item
        // only when the ray looks at its operating face, so it is never picked through the far side of the host
        const kc = compById.get(kid);
        const facesViewer = facingToWorld(kc.facing).dot(rayAt.direction) < -0.1;
        const ok = d < Infinity && (hostD < Infinity ? d <= hostD + 0.02 : facesViewer);
        if (ok && (!best || d < best.d)) best = { kid, d, proxy: k };
      }
      if (best) { id = best.kid; hit = best.proxy; }
    }
    if (store.get().xray) return id; // x-ray: internal equipment is visible through the hull
    ray.far = hit.distance - 0.05;
    const blockTargets = world.colliders && world.colliders.length ? world.colliders : [world.root];
    const blockers = ray.intersectObjects(blockTargets, true).filter(solid);
    if (blockers.length) {
      // a blocker that belongs to the same component (detail mesh) does not count
      const b = blockers.find((bb) => compIdOf(bb.object) !== id);
      if (b) return null;
    }
    return id;
  }

  let down = null;
  dom.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  dom.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const dt = performance.now() - down.t;
    down = null;
    if (moved > 6 || dt > 600) return;
    const s = store.get();
    if (s.level === 'hmi' || s.walk && moved > 2) return;
    const id = pickAt(e.clientX, e.clientY);
    if (!id) return;
    const c = compById.get(id);
    if (!c) return;
    if (s.level === 'vessel') {
      if (c.system && c.system !== 'CTX') bus.emit('select:system', { systemId: c.system, source: '3d' });
      else bus.emit('select:room', { roomId: c.room, source: '3d' });
    } else {
      bus.emit('select:component', { componentId: id, source: '3d' });
    }
  });

  let lastMove = 0;
  dom.addEventListener('pointermove', (e) => {
    const now = performance.now();
    if (now - lastMove < 90 || e.buttons) return;
    lastMove = now;
    const s = store.get();
    const id = s.level === 'hmi' ? null : pickAt(e.clientX, e.clientY);
    if (id !== hoverId) {
      hoverId = id;
      bus.emit('hover:component', { componentId: id });
      dom.style.cursor = id ? 'pointer' : '';
    }
    if (id) {
      const c = compById.get(id);
      tip.replaceChildren(h('b', {}, c.tag || c.id), c.name);
      tip.style.left = e.clientX + 'px';
      tip.style.top = e.clientY + 'px';
      tip.classList.remove('hidden');
    } else tip.classList.add('hidden');
  });
  dom.addEventListener('pointerleave', () => { tip.classList.add('hidden'); hoverId = null; });

  return { pickAt, refreshPickables };
}
