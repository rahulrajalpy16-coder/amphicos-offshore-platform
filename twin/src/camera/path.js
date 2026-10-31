// Pure path-planning helpers for the camera director (no DOM, unit tested).
// All inputs are THREE.Vector3 / THREE.Box3 in WORLD coordinates.
import * as THREE from 'three';

export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Vessel envelope in world space, derived from the db.
export function vesselEnvelope(db, T) {
  const v = db.vessel;
  const loa = v.loa || 300;
  const halfB = (v.beam || 52) / 2;
  let top = (v.depth || 28) - T + 30; // topsides and accommodation above the main deck
  for (const t of db.topsides || []) top = Math.max(top, t.box[5] - T);
  return {
    hull: new THREE.Box3(new THREE.Vector3(-150, -T, -halfB), new THREE.Vector3(loa - 150, (v.depth || 28) - T, halfB)),
    top,
    mainDeckY: (v.depth || 28) - T,
    halfB,
    loa,
  };
}

// Route points used to enter or leave a room. The scene's cutaway carves a box from the room floor up to the
// sky and from the room's inboard edge out through the shell on the open side (port or starboard), so a portal
// outboard of the hull and above the room, inside that carved box, gives a straight, unobstructed final leg
// into the room (the carved box is convex). Open deck areas (no cutaway) use only the exterior standoff.
// side: +1 starboard (world +z), -1 port. open: true for open deck areas.
export function roomPortal(roomBox, env, { side, open = false } = {}) {
  const c = roomBox.getCenter(new THREE.Vector3());
  const sd = side || (c.z >= 0 ? 1 : -1);
  const standoff = new THREE.Vector3(c.x - 12, Math.max(env.mainDeckY + 45, roomBox.max.y + 30), sd * (env.halfB + 70));
  if (open) return { portal: null, standoff, mode: 'open', side: sd };
  const portal = new THREE.Vector3(c.x, Math.max(roomBox.max.y + 5, env.mainDeckY + 5), sd * (env.halfB + 6));
  return { portal, standoff, mode: 'side', side: sd };
}

// Clamp a point into a box shrunk by margin (margin may be negative to expand).
export function clampToBox(p, box, margin = 0) {
  p.x = clamp(p.x, box.min.x + margin, box.max.x - margin);
  p.y = clamp(p.y, box.min.y + margin, box.max.y - margin);
  p.z = clamp(p.z, box.min.z + margin, box.max.z - margin);
  return p;
}

// Close viewpoint in front of a component's operating face, clamped inside its room.
export function focusPose(centre, size, facingDir, roomBox) {
  const maxDim = Math.max(size[0], size[1], size[2]);
  const dist = clamp(maxDim * 1.3 + 1.2, 1.4, 14);
  const eye = centre.clone().addScaledVector(facingDir, dist);
  eye.y = centre.y + clamp(size[2] * 0.25, 0.2, 2.5);
  // small lateral offset for a three-quarter view that reads as 3D
  const lateral = new THREE.Vector3(-facingDir.z, 0, facingDir.x).multiplyScalar(dist * 0.25);
  eye.add(lateral);
  if (roomBox) {
    const inner = roomBox.clone();
    const s = inner.getSize(new THREE.Vector3());
    const m = Math.min(0.4, s.x * 0.2, s.z * 0.2, s.y * 0.2);
    clampToBox(eye, inner, m);
  }
  return { eye, target: centre.clone() };
}

// Remove consecutive points closer than eps.
export function dedupe(points, eps = 0.5) {
  const out = [];
  for (const p of points) if (!out.length || out[out.length - 1].distanceTo(p) > eps) out.push(p);
  return out;
}

export function polylineLength(points) {
  let L = 0;
  for (let i = 1; i < points.length; i++) L += points[i].distanceTo(points[i - 1]);
  return L;
}

// Flight duration from path length: system flights 2 to 4 s, short focus flights 1.2 to 2.2 s.
export function durationFor(length, kind = 'system') {
  if (kind === 'focus') return clamp(1.0 + length / 10, 1.2, 2.2);
  return clamp(1.8 + length / 180, 2.0, 4.0);
}

// Insert lift waypoints wherever a segment is obstructed. isClear(a,b) is injected (raycast in the app,
// a pure function in tests). Returns a new array of points.
export function liftObstructed(points, isClear, { lift = 20, maxTries = 4, ceiling = Infinity } = {}) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    if (isClear(a, b)) { out.push(b); continue; }
    let solved = false;
    for (let k = 1; k <= maxTries && !solved; k++) {
      const h = Math.min(Math.max(a.y, b.y) + lift * k, ceiling);
      const pa = new THREE.Vector3(a.x, h, a.z);
      const pb = new THREE.Vector3(b.x, h, b.z);
      if (isClear(a, pa) && isClear(pa, pb) && isClear(pb, b)) {
        out.push(pa, pb, b);
        solved = true;
      }
    }
    if (!solved) out.push(b); // keep going; reported via route.obstructed
  }
  return dedupe(out);
}
