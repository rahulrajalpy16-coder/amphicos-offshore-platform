// Shared test for "does this raycast hit count as solid geometry?". Respects visibility, x-ray transparency
// and the cutaway clipping planes of the scene materials (raycasts ignore clipping, so we apply it here).
export function isClippedAt(material, point) {
  const planes = material && material.clippingPlanes;
  if (!planes || !planes.length) return false;
  return material.clipIntersection
    ? planes.every((p) => p.distanceToPoint(point) < 0)
    : planes.some((p) => p.distanceToPoint(point) < 0);
}

export function isSolidHit(hit, { ignore } = {}) {
  const o = hit.object;
  if (ignore && ignore(o)) return false;
  if (o.isLine || o.isLineSegments || o.isPoints || o.isSprite) return false;
  if (o.name === 'sea' || (o.userData && (o.userData.isSea || o.userData.noCollide || o.userData.isTag || o.userData.isHelper))) return false;
  // invisible low-cost colliders from the scene; their raycast already honours the cutaway clipping
  if (o.userData && o.userData.collider) return true;
  for (let p = o; p; p = p.parent) if (p.visible === false) return false;
  let m = o.material;
  if (Array.isArray(m)) m = (hit.face && m[hit.face.materialIndex]) || m[0];
  if (!m || m.visible === false) return false;
  if (m.transparent && m.opacity < 0.35) return false;
  if (m.colorWrite === false) return false;
  if (isClippedAt(m, hit.point)) return false;
  return true;
}
