// Ship frame <-> world frame mapping (fixed contract, see docs/ARCHITECTURE.md).
// Ship frame: metres, X stern(0) to bow, Y port positive, Z keel up.
// World frame (Three.js, Y up): x = ship.x - 150, y = ship.z - T, z = -ship.y.
import * as THREE from 'three';

import initialDb from '../data/fpso_db.json';

export const X_OFFSET = 150;
// Operating draft. Live binding: scene and UI read T after initCoords().
export let T = (initialDb && initialDb.vessel && Number(initialDb.vessel.operating_draft)) || 16;

export function initCoords(db) {
  const t = db && db.vessel && Number(db.vessel.operating_draft);
  if (Number.isFinite(t)) T = t;
  return T;
}

export function shipToWorld(p, target = new THREE.Vector3()) {
  return target.set(p[0] - X_OFFSET, p[2] - T, -p[1]);
}

export function worldToShip(v) {
  return [v.x + X_OFFSET, -v.z, v.y + T];
}

export function boxToWorld(b, target = new THREE.Box3()) {
  const [x0, x1, y0, y1, z0, z1] = b;
  target.min.set(x0 - X_OFFSET, z0 - T, -y1);
  target.max.set(x1 - X_OFFSET, z1 - T, -y0);
  return target;
}

// Ship facing string to a world unit direction.
export function facingToWorld(facing, target = new THREE.Vector3()) {
  switch (facing) {
    case '+x': return target.set(1, 0, 0);
    case '-x': return target.set(-1, 0, 0);
    case '+y': return target.set(0, 0, -1);
    case '-y': return target.set(0, 0, 1);
    default: return target.set(0, 0, 1);
  }
}

// Centre of a component in world space (pos is the footprint centre at the floor).
export function componentCentreWorld(c, target = new THREE.Vector3()) {
  const h = (c.size && c.size[2]) || 1;
  return shipToWorld([c.pos[0], c.pos[1], c.pos[2] + h / 2], target);
}
