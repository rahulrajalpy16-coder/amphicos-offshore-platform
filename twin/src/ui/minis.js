// Live mini textures on 3D screens: renderMini() of the HMI module drawn to a canvas, throttled to 4 Hz,
// only for screens that are in view and close to the camera.
import * as THREE from 'three';

export function createMinis({ db, world, camera, getSim, bus, store, resolveModule }) {
  const compById = new Map(db.components.map((c) => [c.id, c]));
  const entries = [];
  for (const [cid, meshes] of world.screens || []) {
    const c = compById.get(cid);
    if (!c || !meshes || !meshes.length) continue;
    const mod = resolveModule(cid, c.system);
    if (!mod || typeof mod.renderMini !== 'function') continue;
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 320;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    for (const m of meshes) {
      const mat = m.material.clone();
      mat.map = tex;
      if ('emissiveMap' in mat && mat.emissive) { mat.emissiveMap = tex; mat.emissive.set('#ffffff'); mat.emissiveIntensity = 0.85; }
      if (mat.color) mat.color.set('#ffffff');
      mat.needsUpdate = true;
      m.material = mat;
    }
    entries.push({ cid, c, meshes, canvas, tex, mod, last: 0 });
  }
  const frustum = new THREE.Frustum();
  const mtx = new THREE.Matrix4();
  const tmp = new THREE.Vector3();
  const sphere = new THREE.Sphere();
  let lastTick = 0;
  let drawn = 0;

  function update(now) {
    if (now - lastTick < 250) return; // 4 Hz
    lastTick = now;
    const s = store.get();
    if (s.level === 'vessel' || s.level === 'hmi') return;
    mtx.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(mtx);
    const sim = getSim();
    for (const e of entries) {
      const m = e.meshes[0];
      m.getWorldPosition(tmp);
      if (tmp.distanceTo(camera.position) > 45) continue;
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      sphere.copy(m.geometry.boundingSphere).applyMatrix4(m.matrixWorld);
      if (!frustum.intersectsSphere(sphere)) continue;
      try {
        e.mod.renderMini(e.canvas, { db, sim, bus, componentId: e.cid, systemId: e.c.system, variant: s.variant });
        e.tex.needsUpdate = true;
        drawn++;
      } catch (err) { if (!e.warned) { e.warned = true; console.warn('[minis] renderMini failed for', e.cid, err); } }
    }
  }
  return { update, get count() { return entries.length; }, get drawn() { return drawn; } };
}
