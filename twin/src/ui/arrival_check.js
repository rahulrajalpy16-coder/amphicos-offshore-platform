// Occlusion-aware arrival check. After a system flight arrives, each of the system's primary components is
// sampled at its centre and at points on its operating (front) face. A sample counts as visible only if
//   (1) it projects inside the free screen area (not under the top bar, the system index or the context panel),
//   (2) picking at that screen point returns exactly that component, so it is the first thing hit along the
//       view ray (hits on items mounted on it are counted separately as mountedHits).
// Results are stored in director.framing['arrival:<systemId>'] and returned by run(); a component with no
// visible sample produces a console warning (database arrival viewpoints are never moved automatically).
import * as THREE from 'three';
import { facingToWorld } from '../core/coords.js';

export function createArrivalCheck({ db, world, camera, dom, picking, director, bus, freeRect }) {
  const compById = new Map(db.components.map((c) => [c.id, c]));

  function samplesFor(cid) {
    const c = compById.get(cid);
    // sample on the pick proxy (the equipment body) rather than the whole component group, whose bounding box
    // can include fittings such as the floor mat in front of a panel and would put the face samples in mid air
    let obj = null;
    for (const p of world.pickables) {
      let id = null;
      for (let q = p; q && !id; q = q.parent) if (q.userData && q.userData.componentId) id = q.userData.componentId;
      if (id === cid) { obj = p; break; }
    }
    if (!obj) obj = world.components.get(cid);
    if (!obj || !c) return [];
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return [];
    const ctr = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const n = facingToWorld(c.facing).clone();
    const pts = [ctr.clone()];
    // front face: plane through the box face the component looks at, inset grid 3 x 3
    const half = size.clone().multiplyScalar(0.5);
    const faceCentre = ctr.clone().add(new THREE.Vector3(n.x * half.x, 0, n.z * half.z)).addScaledVector(n, 0.02);
    const u = new THREE.Vector3(-n.z, 0, n.x); // horizontal along the face
    const along = Math.abs(u.x) * size.x + Math.abs(u.z) * size.z;
    for (const a of [-0.3, 0, 0.3]) for (const b of [-0.3, 0, 0.3]) {
      pts.push(faceCentre.clone().addScaledVector(u, a * along).add(new THREE.Vector3(0, b * size.y, 0)));
    }
    return pts;
  }

  function hitBelongs(hitId, cid) {
    if (!hitId) return false;
    if (hitId === cid) return true;
    const h = compById.get(hitId);
    return !!(h && h.mounted_on === cid);
  }

  function checkComponent(cid) {
    const r = dom.getBoundingClientRect();
    const fr = freeRect();
    const out = { id: cid, samples: 0, inFree: 0, visible: 0, point: null };
    for (const p of samplesFor(cid)) {
      out.samples++;
      const v = p.clone().project(camera);
      if (v.z > 1 || v.z < -1) continue;
      const x = r.left + (v.x * 0.5 + 0.5) * r.width;
      const y = r.top + (-v.y * 0.5 + 0.5) * r.height;
      if (x < fr.left + 2 || x > fr.right - 2 || y < fr.top + 2 || y > fr.bottom - 2) continue;
      out.inFree++;
      const el = document.elementFromPoint(x, y);
      if (el !== dom) continue; // covered by a UI element (panel, numbered tag, tooltip): a click would not reach the 3D view
      const hit = picking.pickAt(x, y);
      // strict: a sample counts only if the pick returns exactly this component; hits on an item mounted on it
      // (a relay on a panel door, a controller behind a glazed door) are reported separately and do not count
      if (hit === cid) {
        out.visible++;
        if (!out.point) out.point = { x: Math.round(x), y: Math.round(y) };
      } else if (hitBelongs(hit, cid)) out.mountedHits = (out.mountedHits || 0) + 1;
    }
    return out;
  }

  function run(systemId, primary) {
    const arrival = director.systemArrival(systemId);
    const ids = primary && primary.length ? primary : arrival ? arrival.primary : [];
    const comps = ids.map(checkComponent);
    const visibleCount = comps.filter((c) => c.visible > 0).length;
    const rep = {
      systemId, source: arrival ? arrival.source : null, roomId: arrival ? arrival.roomId : null,
      primary: comps, visibleCount, total: comps.length,
      score: comps.length ? visibleCount / comps.length : 1,
      allVisible: visibleCount === comps.length,
      at: Date.now(),
    };
    director.framing['arrival:' + systemId] = rep;
    if (!rep.allVisible) {
      const hidden = comps.filter((c) => !c.visible).map((c) => c.id);
      console.warn(`[framing] ${systemId} arrival (${rep.source}): primary components not visible in the free screen area: ${hidden.join(', ')}`);
    }
    return rep;
  }

  bus.on('nav:arrived', (e) => {
    if (e.kind !== 'system') return;
    // after the frame that applies the final pose and the room visibility
    requestAnimationFrame(() => { try { run(e.systemId, e.primary); } catch (err) { console.warn('[framing] check failed', err); } });
  });

  return { run, checkComponent, samplesFor };
}
