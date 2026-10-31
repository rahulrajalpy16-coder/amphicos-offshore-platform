// Scene API (docs/ARCHITECTURE.md): buildWorld(db, scene, { renderer, camera }) -> world
// Everything interactive is built from the authoritative db (src/data/fpso_db.json).
import * as THREE from 'three';
import { initCoords, shipToWorld, boxToWorld, T } from '../core/coords.js';
import { initMaterials, M, structureSet, highlightVariant, dimVariant, setXRayMaterials, updateBlink, disposeMaterials } from './materials.js';
import { buildEnvironment } from './environment.js';
import { buildHull } from './hull.js';
import { buildTopsides } from './topsides.js';
import { buildRoom } from './rooms.js';
import { buildComponent, BUILDERS } from './equipment/index.js';
import { TagAtlas } from './labels.js';
import { createCutaway, makeClipAwareRaycast } from './cutaway.js';
import { Batch } from './kit.js';
import { facingRotation } from './equipment/common.js';

const CABLE_MAT = { power_mv: 'cableOrange', power_lv: 'cableBlack', control: 'cableBlack', network_cu: 'cableBlue', fibre: 'fibreYellow', coax: 'cableBlack', bus: 'cableBlue' };
const NOOP_RAYCAST = () => {};
// large context or shared hosts: outline only when selected, never tinted
const OUTLINE_ONLY = new Set(['diesel_generator_set', 'alternator', 'mv_switchboard_panel', 'lv_switchboard_panel', 'mcc_lineup',
  'generator_control_panel', 'vfd_cabinet', 'transformer', 'marine_boiler', 'igg_generator_unit', 'igg_scrubber_tower',
  'operator_console', 'workstation_desk', 'cctv_monitor_desk', 'large_display_wall', 'pump_motor', 'battery_rack']);

export function buildWorld(db, scene, opts = {}) {
  const t0 = performance.now();
  initCoords(db);
  const depth = db.vessel.depth || 28;
  initMaterials(T, depth);
  const renderer = opts.renderer || null;
  let camera = opts.camera || null;

  const root = new THREE.Group();
  root.name = 'FPSO_TWIN';
  scene.add(root);
  const env = buildEnvironment(scene, renderer);

  // ---------- hull, topsides ----------
  const hull = buildHull(db);
  root.add(hull.group);
  env.sea.setHullMask((x) => hull.form.hb(x, T), hull.form.X0, hull.form.X1, (x) => shipToWorld([x, 0, 0]).x);
  const tops = buildTopsides(db);
  root.add(tops.group);
  // static merged meshes are not raycast in full detail; low cost colliders stand in
  const colliderMat = new THREE.MeshBasicMaterial({ visible: false });
  colliderMat.name = 'collider';
  const colliders = [...hull.colliders];
  const colliderGroup = new THREE.Group();
  colliderGroup.name = 'colliders';
  root.add(colliderGroup);
  tops.group.traverse((o) => { if (o.isMesh) o.raycast = NOOP_RAYCAST; });
  hull.group.traverse((o) => { if (o.isMesh && !o.userData.collider) o.raycast = NOOP_RAYCAST; });
  for (const ts of db.topsides || []) {
    if (['lifeboat', 'davit', 'laydown', 'deck_area'].includes(ts.kind)) continue;
    const b = boxToWorld(ts.box);
    const s = b.getSize(new THREE.Vector3());
    if (s.x < 0.1 || s.y < 0.1 || s.z < 0.1) continue;
    const m = new THREE.Mesh(new THREE.BoxGeometry(s.x, s.y, s.z), colliderMat);
    b.getCenter(m.position);
    m.name = 'collider:' + ts.id;
    m.userData = { collider: true, topsideId: ts.id, clipAware: true };
    m.updateMatrixWorld();
    colliderGroup.add(m);
    colliders.push(m);
  }

  // ---------- rooms ----------
  const atlas = new TagAtlas();
  const rooms = new Map();
  const roomsGroup = new THREE.Group();
  roomsGroup.name = 'rooms';
  root.add(roomsGroup);
  for (const r of db.rooms || []) {
    try {
      const keepOut = (db.components || []).filter((c) => c.room === r.id).map((c) => {
        const h = (c.size && c.size[2]) || 1, sz = c.size || [1, 1, 1];
        return boxToWorld([c.pos[0] - sz[0] / 2, c.pos[0] + sz[0] / 2, c.pos[1] - sz[1] / 2, c.pos[1] + sz[1] / 2, c.pos[2], c.pos[2] + h]);
      });
      const R = buildRoom(r, db, { keepOut });
      R.open = R.kind === 'open';
      roomsGroup.add(R.group);
      rooms.set(r.id, R);
    } catch (err) { console.warn('[world] room failed', r.id, err); }
  }

  // ---------- components ----------
  const exterior = new THREE.Group();
  exterior.name = 'exterior-equipment';
  root.add(exterior);
  const components = new Map();
  const screens = new Map();
  const proxies = new Map();
  const variantGroups = [];
  const childrenOf = new Map();
  for (const c of db.components || []) if (c.mounted_on) { if (!childrenOf.has(c.mounted_on)) childrenOf.set(c.mounted_on, []); childrenOf.get(c.mounted_on).push(c); }
  const groupOf = new Map();
  for (const c of db.components || []) if (c.parent_group) { if (!groupOf.has(c.parent_group)) groupOf.set(c.parent_group, []); groupOf.get(c.parent_group).push(c); }
  const report = { built: 0, fallbackTypes: new Set(), failed: [], outsideRoom: [], unknownRoom: [] };
  const compRoom = new Map();
  for (const c of db.components || []) {
    try {
      const room = rooms.get(c.room);
      let ceilH = 4;
      if (room) ceilH = room.box.max.y - shipToWorld(c.pos).y;
      const inv = new THREE.Matrix4().compose(shipToWorld(c.pos), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), facingRotation(c.facing)), new THREE.Vector3(1, 1, 1)).invert();
      const toLocal = (p) => shipToWorld(p).applyMatrix4(inv);
      const siblings = c.parent_group ? groupOf.get(c.parent_group).filter((k) => k.id !== c.id) : [];
      const built = buildComponent(c, { atlas, ceilH, children: childrenOf.get(c.id) || [], siblings, toLocal, roomShipBox: room ? room.def.box : null });
      if (built.fallback) report.fallbackTypes.add(c.type);
      const parent = room && !room.open ? room.contents : exterior;
      parent.add(built.group);
      if (!room) report.unknownRoom.push(c.id);
      else {
        const p = shipToWorld([c.pos[0], c.pos[1], c.pos[2] + Math.min(0.1, (c.size && c.size[2]) || 0)]);
        if (!room.box.clone().expandByScalar(0.3).containsPoint(p)) report.outsideRoom.push(c.id);
      }
      compRoom.set(c.id, room && !room.open ? c.room : null);
      if (c.mounted_on) {
        // pick convention: mounted items get userData.pickPriority = 1 and, when their front lies behind
        // the host's front face, the proxy is extended forward to just past the host face so it wins the ray
        built.proxy.userData.pickPriority = 1;
        const host = (db.components || []).find((k) => k.id === c.mounted_on);
        if (host && host.facing === c.facing) {
          const hs = host.size || [1, 1, 1];
          const f = { '+x': [1, 0], '-x': [-1, 0], '+y': [0, 1], '-y': [0, -1] }[host.facing] || [0, -1];
          const half = Math.abs(f[0]) ? hs[0] / 2 : hs[1] / 2;
          const front = [host.pos[0] + f[0] * half, host.pos[1] + f[1] * half, c.pos[2]];
          const zFront = toLocal(front).z;
          const d = built.group.userData.dims;
          if (zFront > d.D / 2 - 0.01) {
            const z0 = -d.D / 2 - 0.02, z1 = zFront + 0.03;
            built.proxy.geometry.dispose();
            built.proxy.geometry = new THREE.BoxGeometry(Math.max(d.W, 0.12) + 0.04, Math.max(d.H, 0.12) + 0.04, z1 - z0);
            built.proxy.position.z = (z0 + z1) / 2;
            built.proxy.updateMatrixWorld();
          }
        }
      }
      components.set(c.id, built.group);
      proxies.set(c.id, built.proxy);
      if (built.screens.length) screens.set(c.id, built.screens);
      if (built.variants || built.group.userData.variantMode !== 'both') variantGroups.push(built.group);
      report.built++;
    } catch (err) {
      console.warn('[world] component failed', c.id, c.type, err);
      report.failed.push(c.id);
    }
  }

  // ---------- cables (routes from the db, assigned to the room containing each segment) ----------
  {
    const batches = new Map();
    const bfor = (key) => { if (!batches.has(key)) batches.set(key, new Batch()); return batches.get(key); };
    const roomAt = (p) => { for (const [id, R] of rooms) if (!R.open && R.box.containsPoint(p)) return id; return null; };
    for (const k of db.cables || []) {
      const pts = (k.route || []).map((p) => shipToWorld(p));
      if (pts.length < 2) continue;
      const mat = M(CABLE_MAT[k.kind] || 'cableBlack');
      const r = k.kind === 'power_mv' ? 0.035 : k.kind === 'fibre' ? 0.008 : 0.015;
      for (let i = 0; i < pts.length - 1; i++) {
        const mid = pts[i].clone().add(pts[i + 1]).multiplyScalar(0.5);
        let rid = roomAt(mid);
        if (!rid && hull.form && mid.y < shipToWorld([0, 0, depth]).y) {
          // inside the hull but between rooms: attach to the nearest room so it only shows with that room
          let best = 1e9;
          for (const [id, R] of rooms) { if (R.open) continue; const d = R.box.distanceToPoint(mid); if (d < best) { best = d; rid = id; } }
        }
        bfor(rid || '_ext').between(mat, pts[i].toArray(), pts[i + 1].toArray(), r, 6);
      }
    }
    for (const [rid, b] of batches) {
      const g = b.toGroup('cables:' + rid, { cast: false });
      g.traverse((o) => { if (o.isMesh) { o.userData.noCollide = true; o.raycast = NOOP_RAYCAST; } });
      if (rid === '_ext') exterior.add(g); else rooms.get(rid).group.add(g);
    }
  }

  // ---------- tag anchors ----------
  const tagAnchors = new Map();
  for (const s of db.systems || []) {
    const c = (db.components || []).find((k) => k.id === s.primary_component);
    if (!c) continue;
    const h = (c.size && c.size[2]) || 1;
    tagAnchors.set(s.id, shipToWorld([c.pos[0], c.pos[1], c.pos[2] + h + 1.0]));
  }

  // ---------- cutaway, clip aware raycasting ----------
  const cut = createCutaway({ form: hull.form, deckZ: depth, root, sea: env.sea });
  const clipRay = makeClipAwareRaycast(cut);
  const structureMats = structureSet;
  root.traverse((o) => {
    if (!o.isMesh || o.raycast === NOOP_RAYCAST) return;
    if (o.material === colliderMat || structureMats.has(o.material)) o.raycast = clipRay;
  });

  // ---------- visibility, pickables ----------
  const pickables = [];
  const state = { cutRoom: null, xray: false, variant: 'retrofit', camRoom: null, focusRooms: new Set() };
  function compVisibleByVariant(g) {
    const m = g.userData.variantMode;
    return m === 'both' || !m || m === state.variant;
  }
  function roomVisible(id) {
    if (state.xray) return true;
    return id === state.cutRoom || id === state.camRoom || state.focusRooms.has(id);
  }
  function refresh() {
    for (const [id, R] of rooms) R.group.visible = R.open || roomVisible(id);
    pickables.length = 0;
    for (const [id, g] of components) {
      const rid = compRoom.get(id);
      const vis = compVisibleByVariant(g);
      g.visible = vis;
      if (!vis) continue;
      if (rid && !roomVisible(rid)) continue;
      pickables.push(proxies.get(id));
    }
  }
  function applyVariant() {
    for (const g of variantGroups) {
      for (const ch of g.children) if (ch.userData.variant) ch.visible = ch.userData.variant === state.variant;
    }
    refresh();
  }

  // ---------- highlight ----------
  const sysColor = new Map((db.systems || []).map((s) => [s.id, s.color || '#3baee6']));
  const outlineGroup = new THREE.Group();
  outlineGroup.name = 'highlight-outlines';
  root.add(outlineGroup);
  const touched = new Set();
  const hl = { sel: { ids: new Set(), mode: null, systemId: null }, hover: null };
  function restoreAll() {
    for (const mesh of touched) { if (mesh.userData.baseMat) mesh.material = mesh.userData.baseMat; }
    touched.clear();
    for (const c of [...outlineGroup.children]) { outlineGroup.remove(c); c.geometry.dispose(); c.material.dispose(); }
  }
  function swap(group, fn) {
    group.traverse((o) => {
      if (!o.isMesh || o.userData.pickProxy) return;
      if (!o.userData.baseMat) o.userData.baseMat = o.material;
      o.material = fn(o.userData.baseMat);
      touched.add(o);
    });
  }
  function outline(id, color, opacity = 0.95) {
    const g = components.get(id);
    if (!g || !g.visible) return;
    const d = g.userData.dims;
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(d.W + 0.08, d.H + 0.08, d.D + 0.08));
    const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: true }));
    line.position.copy(g.position); line.position.y += d.H / 2;
    line.rotation.copy(g.rotation);
    line.userData.noCollide = true;
    line.raycast = NOOP_RAYCAST;
    outlineGroup.add(line);
  }
  function applyHighlight() {
    restoreAll();
    const { ids, mode, systemId } = hl.sel;
    const color = sysColor.get(systemId) || '#3baee6';
    if (mode) {
      for (const [id, g] of components) {
        if (ids.has(id)) {
          const col = sysColor.get(systemId) || sysColor.get(g.userData.systemId) || color;
          // restrained: large hosts get an outline only; smaller items a subtle emissive lift plus outline
          if (!OUTLINE_ONLY.has(g.userData.type)) swap(g, (m) => highlightVariant(m, col, 0.12));
          outline(id, col);
        }
        else if (mode === 'dim-others' && g.visible) swap(g, (m) => (m.userData.isScreen ? m : dimVariant(m)));
      }
    }
    if (hl.hover && !ids.has(hl.hover) && components.get(hl.hover)) {
      const g = components.get(hl.hover);
      const col = sysColor.get(g.userData.systemId) || '#3baee6';
      if (!OUTLINE_ONLY.has(g.userData.type)) swap(g, (m) => highlightVariant(m, col, 0.08));
      outline(hl.hover, col, 0.55);
    }
  }
  function idsFor({ systemId, componentIds }) {
    const ids = new Set(componentIds || []);
    if (systemId && !(componentIds && componentIds.length)) {
      for (const c of db.components || []) if (c.system === systemId || (c.also_systems || []).includes(systemId)) ids.add(c.id);
    }
    return ids;
  }

  // ---------- interior lights follow the active room ----------
  function placeInteriorLights(roomId) {
    const R = roomId && rooms.get(roomId);
    env.interior.forEach((l, i) => {
      if (!R || R.open) { l.intensity = 0; return; }
      const c = R.box.getCenter(new THREE.Vector3()), s = R.box.getSize(new THREE.Vector3());
      const n = env.interior.length;
      const along = s.x >= s.z;
      const t = (i + 0.5) / n - 0.5;
      l.position.set(c.x + (along ? t * s.x * 0.8 : 0), R.box.max.y - 0.6, c.z + (along ? 0 : t * s.z * 0.8));
      l.distance = Math.max(s.x, s.z) * 0.9 + 6;
      l.intensity = R.kind === 'er' || R.kind === 'plant' ? 30 : 10;
    });
  }

  const _cp = new THREE.Vector3();
  const world = {
    root, components, rooms, pickables, screens, tagAnchors, colliders,
    atlas, report, env, hull, topsides: tops, cut,
    get state() { return { ...state, focusRooms: [...state.focusRooms] }; },
    setCamera(cam) { camera = cam; },
    setCutaway(roomId, o = {}) {
      const animate = o.animate !== false;
      const R = roomId ? rooms.get(roomId) : null;
      if (roomId && !R) { console.warn('[world] setCutaway: unknown room', roomId); return; }
      state.cutRoom = R && !R.open ? roomId : null;
      if (state.cutRoom) { cut.open(R, animate); env.setShadowFocus(R.box.clone().expandByScalar(4)); }
      else { cut.close(animate); env.setShadowFocus(null); }
      placeInteriorLights(state.cutRoom);
      refresh();
      applyHighlight();
    },
    cutawayInfo(roomId) { const R = rooms.get(roomId); return R ? cut.info(R) : null; },
    setXRay(on) {
      state.xray = !!on;
      setXRayMaterials(state.xray, 0.13);
      env.sea.setAlpha(state.xray ? 0.45 : 1);
      refresh();
      applyHighlight();
    },
    // optional: keep extra rooms visible (e.g. all rooms of a system at room level)
    setFocusRooms(ids = []) { state.focusRooms = new Set(ids || []); refresh(); },
    setHighlight(h = {}) {
      const mode = h.mode || null;
      if (mode === 'hover') { hl.hover = (h.componentIds && h.componentIds[0]) || null; applyHighlight(); return; }
      if (mode === null && h.hoverClear) { hl.hover = null; applyHighlight(); return; }
      hl.sel = { ids: mode ? idsFor(h) : new Set(), mode, systemId: h.systemId || null };
      applyHighlight();
    },
    setHover(componentId) { hl.hover = componentId || null; applyHighlight(); },
    setVariant(v) { state.variant = v === 'legacy' ? 'legacy' : 'retrofit'; applyVariant(); applyHighlight(); },
    roomAt(p) { for (const [id, R] of rooms) if (!R.open && R.box.containsPoint(p)) return id; return null; },
    update(dt, elapsed) {
      env.update(dt, elapsed);
      tops.update(dt, elapsed, camera);
      updateBlink(elapsed);
      cut.update(dt);
      if (camera) {
        _cp.copy(camera.position);
        let inside = null;
        for (const [id, R] of rooms) if (!R.open && R.box.containsPoint(_cp)) { inside = id; break; }
        if (inside !== state.camRoom) {
          state.camRoom = inside;
          if (!state.cutRoom) placeInteriorLights(inside);
          refresh();
        }
      }
    },
    stats(rendererArg) {
      const r = rendererArg || renderer;
      let tris = 0, meshes = 0;
      root.traverseVisible((o) => { if (o.isMesh && o.material && o.material.visible !== false) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
      return { meshes, triangles: Math.round(tris), calls: r ? r.info.render.calls : null, rendererTriangles: r ? r.info.render.triangles : null, textures: r ? r.info.memory.textures : null, geometries: r ? r.info.memory.geometries : null };
    },
    dispose() {
      scene.remove(root);
      root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.userData && o.material.userData.isScreen) o.material.dispose(); });
      env.dispose();
      scene.remove(env.group);
      atlas.dispose();
      disposeMaterials();
    },
  };
  applyVariant();
  report.ms = Math.round(performance.now() - t0);
  report.fallbackTypes = [...report.fallbackTypes];
  report.knownTypes = Object.keys(BUILDERS);
  if (report.fallbackTypes.length) console.warn('[world] component types without a dedicated builder (generic cabinet used):', report.fallbackTypes);
  if (report.outsideRoom.length) console.warn('[world] components outside their room box:', report.outsideRoom);
  console.info(`[world] built ${report.built} components, ${rooms.size} rooms, ${(db.topsides || []).length} topsides in ${report.ms} ms`);
  return world;
}
