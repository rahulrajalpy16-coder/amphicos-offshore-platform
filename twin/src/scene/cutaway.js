// Cutaway: a world-space box carved out of every STRUCTURE material via 6 clipping planes
// (clipIntersection), animated top-down, plus hatched section caps where the hull is cut.
import * as THREE from 'three';
import { shipToWorld, worldToShip } from '../core/coords.js';
import { M, setClipping } from './materials.js';

const FAR = 5000;

export function createCutaway({ form, deckZ = 28, root, sea }) {
  const planes = [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0), new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), 0), new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
  ];
  const box = new THREE.Box3();            // current carved box (world)
  const target = new THREE.Box3();         // fully open box for the active room
  let active = null;                       // { roomId, side }
  let anim = null;                         // { t, dur, from, to, closing }
  const capGroup = new THREE.Group();
  capGroup.name = 'cutaway-caps';
  root.add(capGroup);

  function setBox(b) {
    box.copy(b);
    planes[0].constant = b.min.x; planes[1].constant = -b.max.x;
    planes[2].constant = b.min.y; planes[3].constant = -b.max.y;
    planes[4].constant = b.min.z; planes[5].constant = -b.max.z;
  }
  const EMPTY = new THREE.Box3(new THREE.Vector3(FAR, FAR, FAR), new THREE.Vector3(FAR + 1, FAR + 1, FAR + 1));
  setBox(EMPTY);
  setClipping(planes);   // installed once so shaders compile with the planes from the start

  function sideOf(room) {
    if (room.def && room.def.cutaway_side) return room.def.cutaway_side === 'port' ? -1 : 1;
    const c = room.box.getCenter(new THREE.Vector3());
    if (Math.abs(c.z) < 0.5) return 1;   // centreline rooms open to starboard (world +z)
    return Math.sign(c.z);               // world z sign: + starboard, - port
  }

  function openBoxFor(room) {
    const rb = room.box;
    const s = sideOf(room);
    const b = new THREE.Box3();
    b.min.set(rb.min.x + 0.25, rb.min.y + 0.03, s > 0 ? rb.min.z + 0.25 : -FAR);
    // rooms in the superstructure (floor above the main deck): open only the outboard side over the
    // room height (dollhouse view at room level); rooms inside the hull: open the side and everything above
    const [, , zf] = worldToShip(rb.min);
    const top = zf >= deckZ - 0.05 ? rb.max.y - 0.04 : FAR;
    b.max.set(rb.max.x - 0.25, top, s > 0 ? FAR : rb.max.z - 0.25);
    return { b, s };
  }

  function buildCaps(room, s) {
    for (const c of [...capGroup.children]) { capGroup.remove(c); c.geometry.dispose(); }
    const rb = room.box;
    const [sx0, , sz0] = worldToShip(new THREE.Vector3(rb.min.x + 0.25, rb.min.y, 0));
    const [sx1] = worldToShip(new THREE.Vector3(rb.max.x - 0.25, rb.min.y, 0));
    const zFloor = sz0;
    if (zFloor >= deckZ - 0.2) return;   // room above the main deck: no hull section
    // ship y of the inboard cut boundary
    const inZ = s > 0 ? rb.min.z + 0.25 : rb.max.z - 0.25;
    const yIn = -inZ;           // ship y = -world z (inboard cut boundary)
    const outZ = s > 0 ? rb.max.z + 0.15 : rb.min.z - 0.15;
    const yOut = -outZ;         // ship y just outside the room's outboard wall
    const sideSign = -s;        // ship y sign of the open side
    const mat = M('cutCap');
    const addStrip = (pts, idx) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
      const uv = [];
      for (const p of pts) uv.push((p[0] + p[2]) / 2, p[1] / 2);
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.userData.noCollide = true;
      m.renderOrder = 0;
      capGroup.add(m);
    };
    const W = (x, y, z) => shipToWorld([x, y, z]).toArray();
    // horizontal cap at the floor level between the inboard boundary and the hull side
    {
      const pts = [], idx = [];
      const n = Math.max(2, Math.ceil((sx1 - sx0) / 2));
      for (let i = 0; i <= n; i++) {
        const x = sx0 + (sx1 - sx0) * i / n;
        const hb = form.hb(x, zFloor);
        pts.push(W(x, yOut, zFloor - 0.01), W(x, sideSign * Math.max(hb, Math.abs(yOut)), zFloor - 0.01));
        if (i < n) { const a = 2 * i; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      addStrip(pts, idx);
    }
    const [, , zTopR] = worldToShip(new THREE.Vector3(0, rb.max.y, 0));
    // transverse caps at both ends, floor to main deck
    for (const x of [sx0, sx1]) {
      const pts = [], idx = [];
      const n = 16;
      for (let k = 0; k <= n; k++) {
        const z = zFloor + (deckZ - zFloor) * k / n;
        const hb = form.hb(x, z);
        const zInRoom = z < zTopR - 0.05;
        const y0 = zInRoom ? yOut : yIn;   // beside the room: from its outboard wall; above it: from the inboard boundary
        pts.push(W(x, y0, z), W(x, sideSign * Math.max(hb, Math.abs(y0)), z));
        if (k < n) { const a = 2 * k; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      addStrip(pts, idx);
    }
    // longitudinal cap above the room ceiling at the inboard boundary (if the room is below the main deck)
    const zTop = zTopR;
    if (zTop < deckZ - 0.4) {
      const pts = [W(sx0, yIn, zTop + 0.2), W(sx1, yIn, zTop + 0.2), W(sx0, yIn, deckZ), W(sx1, yIn, deckZ)];
      addStrip(pts, [0, 1, 2, 1, 3, 2]);
    }
    // sea hole outboard of the cut (lets the camera see the underwater part of the opening)
    if (sea && rb.min.y < 0) {
      sea.setHole(new THREE.Vector2(rb.min.x - 1, s > 0 ? rb.min.z : -400), new THREE.Vector2(rb.max.x + 1, s > 0 ? 400 : rb.max.z), 0.1);
    }
  }

  function clearCaps() {
    for (const c of [...capGroup.children]) { capGroup.remove(c); c.geometry.dispose(); }
    if (sea) sea.setHole(null);
  }

  const api = {
    planes, box, capGroup,
    get activeRoom() { return active ? active.roomId : null; },
    info(room) { const { b, s } = openBoxFor(room); return { side: s > 0 ? 'starboard' : 'port', normal: new THREE.Vector3(0, 0, s), openBox: b }; },
    open(room, animate = true) {
      const { b, s } = openBoxFor(room);
      target.copy(b);
      active = { roomId: room.def.id, side: s };
      buildCaps(room, s);
      capGroup.visible = true;
      if (!animate) { setBox(b); anim = null; return; }
      const from = b.clone();
      if (b.max.y < FAR) { if (s > 0) from.min.z = room.box.max.z + 25; else from.max.z = room.box.min.z - 25; }
      else from.min.y = Math.max(b.min.y, room.box.max.y + 45);
      anim = { t: 0, dur: 0.9, from, to: b.clone(), closing: false };
      setBox(from);
    },
    close(animate = true) {
      if (!active) return;
      active = null;
      if (!animate) { setBox(EMPTY); clearCaps(); anim = null; return; }
      const to = box.clone();
      if (box.max.y < FAR) { if (box.max.z >= FAR) to.min.z = box.min.z + 40; else to.max.z = box.max.z - 40; }
      else to.min.y = box.min.y + 45;
      anim = { t: 0, dur: 0.6, from: box.clone(), to, closing: true };
    },
    update(dt) {
      if (!anim) return;
      anim.t += dt;
      const u = Math.min(1, anim.t / anim.dur);
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      const b = new THREE.Box3(anim.from.min.clone().lerp(anim.to.min, e), anim.from.max.clone().lerp(anim.to.max, e));
      setBox(b);
      if (u >= 1) {
        if (anim.closing) { setBox(EMPTY); clearCaps(); }
        anim = null;
      }
    },
    // true if a world point is inside the currently carved region (used to filter raycasts)
    carved(p) { return box.containsPoint(p); },
  };
  return api;
}

// Raycast wrapper: ignore intersections whose point lies in the carved box (what the user sees).
export function makeClipAwareRaycast(cut) {
  const base = THREE.Mesh.prototype.raycast;
  return function (raycaster, intersects) {
    const start = intersects.length;
    base.call(this, raycaster, intersects);
    for (let i = intersects.length - 1; i >= start; i--) if (cut.carved(intersects[i].point)) intersects.splice(i, 1);
  };
}
