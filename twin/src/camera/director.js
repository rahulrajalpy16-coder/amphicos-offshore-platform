// Camera director: damped orbit, eased multi-waypoint flights with obstruction checks, room constraints,
// view presets and history-friendly pose capture. Owner: software-automation A.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { T, boxToWorld, shipToWorld } from '../core/coords.js';
import { isSolidHit } from './collide.js';
import {
  easeInOutCubic, vesselEnvelope, roomPortal, dedupe, polylineLength, durationFor, liftObstructed, clampToBox,
} from './path.js';

export function createDirector({ camera, dom, world, db, bus }) {
  const env = vesselEnvelope(db, T);
  const controls = new OrbitControls(camera, dom);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.9;
  controls.panSpeed = 0.7;
  controls.screenSpacePanning = true;
  controls.autoRotateSpeed = 0.35;

  let flight = null;
  let constraint = null; // { targetBox, cameraBox }
  let limits = 'vessel';
  const raycaster = new THREE.Raycaster();
  const api = {};

  // ---------- poses ----------
  const centre = new THREE.Vector3((env.loa / 2) - 150, env.mainDeckY - 4, 0);
  const R = env.loa * 0.95;
  const presets = {
    overview: { eye: new THREE.Vector3(-R * 0.62, R * 0.62, R * 1.12), target: new THREE.Vector3(centre.x - 25, env.mainDeckY, 0), label: 'Overview' },
    starboard: { eye: new THREE.Vector3(0, env.mainDeckY + 30, R * 1.05), target: centre.clone(), label: 'Starboard' },
    port: { eye: new THREE.Vector3(0, env.mainDeckY + 30, -R * 1.05), target: centre.clone(), label: 'Port' },
    bow: { eye: new THREE.Vector3(R * 0.85, env.mainDeckY + 45, R * 0.28), target: centre.clone(), label: 'Bow' },
    stern: { eye: new THREE.Vector3(-R * 0.85, env.mainDeckY + 40, -R * 0.25), target: centre.clone(), label: 'Stern' },
    top: { eye: new THREE.Vector3(centre.x, R * 1.25, R * 0.06), target: centre.clone(), label: 'Plan' },
    accommodation: { eye: new THREE.Vector3(-R * 0.48, env.mainDeckY + 45, R * 0.32), target: new THREE.Vector3(-110, env.mainDeckY + 10, 0), label: 'Aft quarter' },
  };

  const baseFov = camera.fov;
  function currentPose() {
    return { eye: camera.position.clone(), target: controls.target.clone(), fov: camera.fov };
  }
  function setFov(v) {
    if (Math.abs(camera.fov - v) < 1e-3) return;
    camera.fov = v;
    camera.updateProjectionMatrix();
  }
  // Room views honour rooms[].camera.vfov_deg, which was framed for a full 16:9 picture. The side panels leave a
  // narrower free area (the optical centre is shifted into it), so the vertical FOV is widened until that
  // 16:9 frame fits horizontally in the free area, capped at 70 degrees to limit perspective distortion.
  api.freeAspect = null;
  function roomFov(roomId, vfovOverride) {
    const r = roomById.get(roomId);
    const v = Number(vfovOverride) || (r && r.camera && Number(r.camera.vfov_deg)) || 50;
    const fa = api.freeAspect;
    if (!fa || fa >= 16 / 9) return v;
    const need = 2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(v / 2)) * (16 / 9) / fa));
    return Math.min(70, Math.max(v, need));
  }
  api.roomFov = roomFov;

  // Per-system arrival viewpoint (systems[].arrival, ship frame) authored by engineering so the system's own
  // primary components are visible on arrival. It is used as is (never moved by the framing check); without it
  // the room camera (rooms[].camera) is the fallback. Returns { roomId, pose, source, primary }.
  const sysById = new Map((db.systems || []).map((x) => [x.id, x]));
  function systemArrival(systemId) {
    const sys = sysById.get(systemId);
    if (!sys) return null;
    const a = sys.arrival;
    if (a && Array.isArray(a.eye) && Array.isArray(a.target)) {
      const roomId = a.room && roomById.has(a.room) ? a.room : sys.primary_room;
      return {
        roomId, source: 'systems.arrival',
        primary: (a.primary_components && a.primary_components.length ? a.primary_components : [sys.primary_component]).filter(Boolean),
        pose: { eye: shipToWorld(a.eye), target: shipToWorld(a.target), fov: roomFov(roomId, a.vfov_deg) },
      };
    }
    return { roomId: sys.primary_room, source: 'rooms.camera', primary: [sys.primary_component].filter(Boolean), pose: roomOverview(sys.primary_room) };
  }
  api.systemArrival = systemArrival;

  // Clear OrbitControls' residual damping so a finished flight does not drift.
  function resetDeltas() {
    if (controls._sphericalDelta) controls._sphericalDelta.set(0, 0, 0);
    if (controls._panOffset) controls._panOffset.set(0, 0, 0);
    if ('_scale' in controls) controls._scale = 1;
  }

  function setPose(p) {
    resetDeltas();
    camera.position.copy(p.eye);
    controls.target.copy(p.target);
    if (p.fov) setFov(p.fov);
    camera.lookAt(p.target);
    controls.update();
  }

  // ---------- room data ----------
  const roomBoxes = new Map();
  for (const r of db.rooms) roomBoxes.set(r.id, (world.rooms.get(r.id) && world.rooms.get(r.id).box) || boxToWorld(r.box));
  const roomById = new Map(db.rooms.map((r) => [r.id, r]));

  function roomOverview(roomId) {
    const r = roomById.get(roomId);
    const box = roomBoxes.get(roomId);
    let pose;
    if (r && r.camera && r.camera.overview_eye) {
      pose = { eye: shipToWorld(r.camera.overview_eye), target: shipToWorld(r.camera.overview_target), fov: roomFov(roomId) };
    } else {
      const c = box.getCenter(new THREE.Vector3());
      const s = box.getSize(new THREE.Vector3());
      pose = { eye: new THREE.Vector3(box.min.x + s.x * 0.1, box.max.y - 0.6, c.z + Math.sign(c.z || 1) * s.z * 0.4), target: c, fov: roomFov(roomId) };
    }
    const fix = arrivalFix(roomId, pose);
    if (fix) {
      pose.eye.copy(fix);
      // the database target was chosen for the database eye; from the moved eye, re-centre the view between
      // that target and the centroid of the room's equipment so both ends of the installation stay in frame
      const ct = equipmentCentroid(roomId);
      if (ct) pose.target.lerp(new THREE.Vector3(ct.x, pose.target.y, ct.z), 0.6);
      framing[roomId].target = pose.target.clone();
    }
    return pose;
  }

  function equipmentCentroid(roomId) {
    const list = db.components.filter((c) => c.room === roomId && !c.mounted_on && c.size && Math.max(c.size[0], c.size[1]) > 0.3);
    if (!list.length) return null;
    const v = new THREE.Vector3();
    for (const c of list) v.add(shipToWorld([c.pos[0], c.pos[1], c.pos[2] + c.size[2] / 2]));
    return v.multiplyScalar(1 / list.length);
  }

  // ---------- arrival framing check ----------
  // The database viewpoints are computed from equipment boxes only; room fittings built by the scene (ducts,
  // trays, pipes, uptakes) are not in the database. On the first visit to a room the view from the database eye
  // is sampled with a cone of rays against the real room geometry. If the eye sits against a fitting or the
  // view is mostly blocked within a short distance, the eye is moved along the sight line toward the target
  // and/or lowered (staying inside the room box) to the nearest clear position. Results: api.framing[roomId].
  const framing = {};
  api.framing = framing;
  const fray = new THREE.Raycaster();
  function roomHitFilter(h) {
    const o = h.object;
    const u = o.userData || {};
    if (u.pickProxy || u.noCollide || u.collider || u.isTag || o.isLine || o.isLineSegments || o.isPoints || o.isSprite) return false;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || m.visible === false || (m.transparent && m.opacity < 0.35)) return false;
    // structure (shell walls, ceiling, decks) carries the cutaway clipping planes; it is ignored so the check is
    // independent of which room is currently cut open: only fittings and equipment can block an arrival view
    if (m.clippingPlanes && m.clippingPlanes.length) return false;
    return true;
  }
  function firstHit(objs, from, dir, far) {
    fray.set(from, dir);
    fray.near = 0;
    fray.far = far;
    const hits = fray.intersectObjects(objs, true);
    const h = hits.find(roomHitFilter);
    return h ? h.distance : Infinity;
  }
  // Share of a 5 x 3 grid of rays inside the arrival frustum that travel at least 35 % of the way to the
  // target (max 4 m) before hitting anything, halved when the eye touches geometry (0.22 m) and reduced when
  // equipment sits right under the eye (a downward ray hits within 1.4 m: the view would be its roof).
  function viewScore(objs, eye, target, fov) {
    const fwd = target.clone().sub(eye);
    const dist = fwd.length();
    fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const tv = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * 0.7;
    const th = tv * Math.min(1.6, api.freeAspect || 1.6);
    const need = Math.min(4, dist * 0.35);
    let clear = 0, n = 0;
    for (const a of [-1, -0.5, 0, 0.5, 1]) for (const b of [-1, 0, 1]) {
      const d = fwd.clone().addScaledVector(right, a * th).addScaledVector(up, b * tv).normalize();
      n++;
      if (firstHit(objs, eye, d, need) === Infinity) clear++;
    }
    let score = clear / n;
    for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      if (firstHit(objs, eye, new THREE.Vector3(...d), 0.22) !== Infinity) { score *= 0.5; break; }
    }
    if (firstHit(objs, eye, new THREE.Vector3(0, -1, 0), 1.4) !== Infinity) score *= 0.75;
    return score;
  }
  function arrivalFix(roomId, pose) {
    if (framing[roomId]) return framing[roomId].eye ? framing[roomId].eye.clone() : null;
    const R = world.rooms && world.rooms.get(roomId);
    const box = roomBoxes.get(roomId);
    if (!R || !R.group || !box || (R.open)) { framing[roomId] = { checked: false }; return null; }
    const objs = [R.group];
    const GOOD = 0.8;
    try {
      const s0 = viewScore(objs, pose.eye, pose.target, pose.fov);
      if (s0 >= GOOD) { framing[roomId] = { checked: true, score: +s0.toFixed(2), moved: 0 }; return null; }
      const inner = box.clone().expandByScalar(-0.35);
      const c = box.getCenter(new THREE.Vector3());
      const toCentre = new THREE.Vector3(c.x - pose.eye.x, 0, c.z - pose.eye.z);
      let best = { score: s0, eye: null, moved: 0 };
      for (const drop of [0, 0.4, 0.8, 1.2]) for (const k of [0, 0.15, 0.3, 0.45]) for (const t of [0, 0.1, 0.2, 0.3, 0.4]) {
        if (!drop && !k && !t) continue;
        const e = pose.eye.clone().lerp(pose.target, t).addScaledVector(toCentre, k);
        e.y -= drop;
        if (e.y < box.min.y + 1.6) continue;
        clampToBox(e, inner);
        const moved = e.distanceTo(pose.eye);
        // prefer the smallest move among clearly good views
        const sc = viewScore(objs, e, pose.target, pose.fov) - moved * 0.01;
        if (sc > best.score + 0.02) best = { score: sc, eye: e, moved };
      }
      framing[roomId] = { checked: true, score0: +s0.toFixed(2), score: +best.score.toFixed(2), moved: +best.moved.toFixed(2), eye: best.eye, ship: best.eye ? worldToShipArr(best.eye) : null };
      return best.eye ? best.eye.clone() : null;
    } catch (e) {
      framing[roomId] = { checked: false, error: String(e) };
      return null;
    }
  }
  function worldToShipArr(v) { return [+(v.x + 150).toFixed(2), +(-v.z).toFixed(2), +(v.y + T).toFixed(2)]; }

  // ---------- obstruction tests ----------
  const ignoreSet = new WeakSet();
  function isBlockingHit(h) { return isSolidHit(h, { ignore: (o) => ignoreSet.has(o) }); }
  function segmentClear(a, b, objects) {
    const dir = b.clone().sub(a);
    const len = dir.length();
    if (len < 0.01) return true;
    raycaster.set(a, dir.normalize());
    raycaster.near = 0;
    raycaster.far = len;
    const hits = raycaster.intersectObjects(objects || colliders(), true);
    return !hits.some(isBlockingHit);
  }
  api.segmentClear = segmentClear;
  // Low-cost collision proxies from the scene (hull, decks, topsides boxes); falls back to the full scene.
  function colliders() { return world.colliders && world.colliders.length ? world.colliders : [world.root]; }
  api.colliders = colliders;
  api.ignoreForCollision = (obj) => obj && obj.traverse((o) => ignoreSet.add(o));

  // ---------- route planning ----------
  function portalFor(roomId) {
    const R = world.rooms.get(roomId);
    let side;
    try { const info = world.cutawayInfo && world.cutawayInfo(roomId); if (info) side = info.side === 'port' ? -1 : 1; } catch (e) { /* optional */ }
    return roomPortal(roomBoxes.get(roomId), env, { side, open: !!(R && R.open) });
  }
  api.portalFor = portalFor;
  // from/to: { pose, roomId|null }. Returns { points, targets, cutawayAt, obstructed }.
  function planRoute(from, to) {
    const pts = [from.pose.eye.clone()];
    const exterior = [];
    if (from.roomId && from.roomId !== to.roomId) {
      const P = portalFor(from.roomId);
      if (P.portal) pts.push(P.portal.clone());
      pts.push(P.standoff.clone());
    }
    if (to.roomId && to.roomId !== from.roomId) {
      const P = portalFor(to.roomId);
      // exterior legs are validated against the colliders, then the portal leg enters through the cutaway
      exterior.push(P.standoff.clone());
      pts.push(P.standoff.clone());
      if (P.portal) pts.push(P.portal.clone());
    }
    pts.push(to.pose.eye.clone());
    let points = dedupe(pts, 0.6);

    // Exterior validation: only between points that are both outside every room box.
    const closedBoxes = [...roomBoxes.entries()].filter(([id]) => !(world.rooms.get(id) && world.rooms.get(id).open)).map(([, b]) => b);
    const insideAnyRoom = (p) => closedBoxes.some((b) => b.containsPoint(p));
    const outside = (p) => !insideAnyRoom(p) && !env.hull.containsPoint(p);
    let obstructed = false;
    const isClear = (a, b) => {
      if (!(outside(a) && outside(b))) {
        // inside or at a room: check equipment only (hull and decks are opened by the cutaway)
        return segmentClear(a, b, world.pickables);
      }
      return segmentClear(a, b);
    };
    try {
      points = liftObstructed(points, isClear, { lift: 25, ceiling: env.top + 120 });
      for (let i = 1; i < points.length; i++) if (!isClear(points[i - 1], points[i])) obstructed = true;
    } catch (e) {
      obstructed = true;
    }
    return { points, obstructed, exterior };
  }
  api.planRoute = planRoute;

  // ---------- flight ----------
  function cancelFlight(reason = 'interrupted') {
    if (!flight) return;
    const f = flight;
    flight = null;
    controls.enabled = true;
    api.lastFlight = { ...f.stats, endedAt: performance.now(), duration: (performance.now() - f.t0) / 1000, interrupted: reason };
    f.resolve({ interrupted: true, reason });
  }
  api.cancelFlight = cancelFlight;

  // flyTo(pose, { duration, waypoints, kind, onProgress })
  api.flyTo = function flyTo(pose, opts = {}) {
    cancelFlight('superseded');
    const start = currentPose();
    const pts = dedupe([start.eye, ...(opts.waypoints || []), pose.eye.clone()], 0.05);
    if (pts.length === 1) pts.push(pose.eye.clone().add(new THREE.Vector3(0.001, 0, 0)));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    const length = Math.max(polylineLength(pts), start.target.distanceTo(pose.target) * 0.5);
    const duration = opts.duration || durationFor(length, opts.kind || 'system');
    controls.enabled = false;
    controls.autoRotate = false;
    resetDeltas();
    return new Promise((resolve) => {
      flight = {
        curve, start, pose: { eye: pose.eye.clone(), target: pose.target.clone() }, t0: performance.now(), duration,
        fov0: camera.fov, fov1: pose.fov || camera.fov, clock: 0, last: 0,
        onProgress: opts.onProgress, resolve, fired: new Set(), limits: opts.limits || null,
        stats: { startedAt: performance.now(), plannedDuration: duration, length, waypoints: pts.length - 2, kind: opts.kind || 'system', label: opts.label || '' },
      };
      bus && bus.emit('camera:flight', { phase: 'start', duration });
    });
  };

  // High level: fly between navigation contexts with planning. ctx: { fromRoomId, toRoomId, pose, kind, onProgress }
  api.travel = function travel({ fromRoomId = null, toRoomId = null, pose, kind = 'system', onProgress, label }) {
    const route = planRoute({ pose: currentPose(), roomId: fromRoomId }, { pose, roomId: toRoomId });
    api.lastRoute = { points: route.points.map((p) => p.toArray()), obstructed: route.obstructed, fromRoomId, toRoomId };
    const waypoints = route.points.slice(1, -1);
    return api.flyTo(pose, { waypoints, kind, onProgress, label, limits: toRoomId ? ['room', toRoomId] : ['vessel'] });
  };

  api.isFlying = () => !!flight;

  function stepFlight() {
    if (!flight) return;
    const f = flight;
    const now = performance.now();
    // Flight clock with stall protection: a frame gap far longer than the recent typical frame (a shader compile
    // or first draw of a room) advances the flight by one typical frame only, so a stall pauses the flight
    // instead of making it jump. Normal frames advance by their real duration. The protection applies only when
    // the machine normally renders at interactive rates (typical frame under 50 ms); on very slow software
    // rendering every frame is long and the flight simply follows wall-clock time.
    const gap = f.last ? now - f.last : 0;
    f.last = now;
    const typical = typicalFrame();
    const stalled = typical < 50 && gap > Math.max(100, 3 * typical);
    f.clock += stalled ? typical : gap;
    if (stalled) f.stalls = (f.stalls || 0) + 1;
    const u = Math.min(1, f.clock / 1000 / f.duration);
    const e = easeInOutCubic(u);
    f.curve.getPointAt(e, camera.position);
    // look target: blend from start to end with its own slightly earlier easing so the destination is framed early
    const te = easeInOutCubic(Math.min(1, u * 1.15));
    controls.target.lerpVectors(f.start.target, f.pose.target, te);
    setFov(f.fov0 + (f.fov1 - f.fov0) * e);
    camera.lookAt(controls.target);
    if (f.onProgress) { try { f.onProgress(u, f.fired); } catch (err) { console.warn(err); } }
    if (u >= 1) {
      flight = null;
      camera.position.copy(f.pose.eye);
      controls.target.copy(f.pose.target);
      setFov(f.fov1);
      camera.lookAt(f.pose.target);
      controls.enabled = true;
      resetDeltas();
      // apply the destination's orbit limits BEFORE the first orbit update, otherwise the vessel-level
      // minimum distance would push a room viewpoint back out of the room
      if (f.limits) api.setLimits(...f.limits);
      controls.update();
      api.lastFlight = { ...f.stats, endedAt: now, duration: (now - f.t0) / 1000, flightClock: f.clock / 1000, stalls: f.stalls || 0, interrupted: false };
      api.flightCount = (api.flightCount || 0) + 1;
      bus && bus.emit('camera:flight', { phase: 'end', duration: api.lastFlight.duration });
      f.resolve({ interrupted: false });
    }
  }

  // User input interrupts a flight cleanly (camera stays where it is, orbit resumes from there).
  const interrupt = () => { if (flight && !flight.noInterrupt) cancelFlight('user'); };
  dom.addEventListener('pointerdown', interrupt);
  dom.addEventListener('wheel', interrupt, { passive: true });

  // ---------- constraints ----------
  api.setLimits = function setLimits(kind, roomId = null) {
    limits = kind;
    if (kind === 'vessel') {
      constraint = {
        targetBox: env.hull.clone().expandByVector(new THREE.Vector3(60, 60, 60)),
        cameraBox: new THREE.Box3(new THREE.Vector3(-900, 2, -900), new THREE.Vector3(900, 700, 900)),
      };
      controls.minDistance = 12;
      controls.maxDistance = 820;
      controls.maxPolarAngle = Math.PI * 0.49;
      controls.minPolarAngle = 0.02;
      controls.enablePan = true;
    } else {
      const box = roomBoxes.get(roomId);
      if (!box) return;
      const ov = roomOverview(roomId);
      const camBox = box.clone().expandByPoint(ov.eye).expandByScalar(0.4);
      constraint = { targetBox: box.clone().expandByScalar(-0.2), cameraBox: camBox };
      const s = box.getSize(new THREE.Vector3());
      controls.minDistance = 0.6;
      controls.maxDistance = Math.max(6, s.length() * 0.9);
      controls.maxPolarAngle = Math.PI * 0.92;
      controls.minPolarAngle = 0.05;
      controls.enablePan = true;
    }
  };
  api.getLimits = () => limits;

  function applyConstraint() {
    if (!constraint || flight) return;
    clampToBox(controls.target, constraint.targetBox);
    clampToBox(camera.position, constraint.cameraBox);
  }

  // ---------- walk mode hook (set by walk.js) ----------
  api.walk = null;

  const gaps = [];
  let lastUpdate = 0;
  function typicalFrame() {
    if (!gaps.length) return 16;
    const sorted = [...gaps].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }
  api.update = function update(dt) {
    const now = performance.now();
    if (lastUpdate) { gaps.push(now - lastUpdate); if (gaps.length > 30) gaps.shift(); }
    lastUpdate = now;
    if (flight) { stepFlight(); return; }
    if (api.walk && api.walk.active) { api.walk.update(dt); return; }
    controls.update();
    applyConstraint();
  };

  api.presets = presets;
  api.roomOverview = roomOverview;
  api.roomBox = (id) => roomBoxes.get(id);
  api.vesselPose = () => ({ eye: presets.overview.eye.clone(), target: presets.overview.target.clone(), fov: baseFov });
  api.baseFov = baseFov;
  api.currentPose = currentPose;
  api.setPose = setPose;
  api.controls = controls;
  api.env = env;
  api.setAutoRotate = (on) => { controls.autoRotate = !!on; };
  api.setLimits('vessel');
  setPose(presets.overview);
  return api;
}
