// Exterior-only build of the twin for the Amphicos 3D Platform (rig scene). It builds the same hull and
// topsides as the twin, from the same database, in the twin world frame (waterline at y = 0, bow at +x),
// so the vessel seen from the rig is the vessel the visitor enters. Rooms, equipment, environment and
// cutaway are left out: they are only visible inside the twin itself.
import * as THREE from 'three';
import db from '../data/fpso_db.json';
import { initCoords, T, boxToWorld } from '../core/coords.js';
import { initMaterials } from '../scene/materials.js';
import { buildHull } from '../scene/hull.js';
import { buildTopsides } from '../scene/topsides.js';
export { SHOWCASE } from './showcase.js';
// the 15 twin systems, for the FPSO menu in the host page (the host bundle trims the database to these fields)
export const SYSTEMS = (db.systems || []).map((s) => ({ id: s.id, number: s.number, name: s.name, group: s.commercial_group }));

export const info = () => ({
  loa: db.vessel.loa, beam: db.vessel.beam, depth: db.vessel.depth, draft: db.vessel.operating_draft,
  mainDeckY: db.vessel.depth - db.vessel.operating_draft, version: db.meta && db.meta.version,
});

export function buildExterior() {
  initCoords(db);
  initMaterials(T, db.vessel.depth || 28);
  const group = new THREE.Group();
  group.name = 'FPSO_TWIN_EXTERIOR';
  const hull = buildHull(db);
  const tops = buildTopsides(db);
  group.add(hull.group, tops.group);
  // the twin keeps its structure materials double sided for the cutaway; from outside the hull the
  // back faces are never seen, so front-side rendering halves the fill cost in the rig scene
  group.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m && m.side === THREE.DoubleSide && m.name === 'hull') m.side = THREE.FrontSide;
  });
  const bounds = new THREE.Box3().setFromObject(group);
  // solid topsides volumes as world boxes, for cheap picking in the host scene (open deck areas and lifeboats left out)
  const pickBoxes = (db.topsides || []).filter((t) => !['deck_area', 'lifeboat', 'laydown', 'davit'].includes(t.kind)).map((t) => boxToWorld(t.box));
  return { group, bounds, pickBoxes, update: (dt, t, camera) => { try { tops.update(dt, t, camera); } catch (e) { /* cosmetic */ } }, info: info() };
}
