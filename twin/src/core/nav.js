// Navigation state machine (brief section 6, stages 1 to 6).
// Levels: vessel -> room -> equipment -> hmi. Every forward step pushes the previous context (including the
// camera pose) on a history stack; back() pops it and flies back smoothly. home() returns to the vessel.
// Selection requests arrive as bus events from any view (index, tags, 3D picks, 2D drawings, tour, keys).
import * as THREE from 'three';
import { componentCentreWorld, facingToWorld } from './coords.js';
import { focusPose } from '../camera/path.js';

export function createNav({ db, world, director, store, bus, walk, hmiHost }) {
  const sysById = new Map(db.systems.map((s) => [s.id, s]));
  const compById = new Map(db.components.map((c) => [c.id, c]));
  const roomById = new Map(db.rooms.map((r) => [r.id, r]));
  const history = [];
  let seq = 0; // navigation sequence; stale async completions are ignored

  const snapshot = () => {
    const s = store.get();
    return { level: s.level, systemId: s.systemId, roomId: s.roomId, componentId: s.componentId, pose: director.currentPose() };
  };

  function setLevel(level, ids) {
    store.set({ level, ...ids });
    const s = store.get();
    bus.emit('nav:level', { level, systemId: s.systemId, roomId: s.roomId, componentId: s.componentId });
  }

  function applyHighlight() {
    const s = store.get();
    if (s.level === 'vessel') world.setHighlight({ mode: s.systemId ? 'select' : null, systemId: s.systemId || undefined });
    else if (s.level === 'room') world.setHighlight({ systemId: s.systemId || undefined, mode: s.systemId ? 'dim-others' : null });
    else world.setHighlight({ systemId: s.systemId || undefined, componentIds: s.componentId ? [s.componentId] : [], mode: 'select' });
  }

  function exitWalk() {
    if (walk && walk.active) { walk.disable(); store.set({ walk: false }); }
  }

  // Fly between rooms (or the exterior) and manage the cutaway during the approach.
  function travel({ toRoomId, pose, kind = 'system', label }) {
    const fromRoomId = currentCutaway; // the room the camera is in (or null when outside)
    const my = ++seq;
    exitWalk();
    const crossing = fromRoomId !== toRoomId;
    const p = director.travel({
      fromRoomId: fromRoomId || null,
      toRoomId: toRoomId || null,
      pose,
      kind,
      label,
      onProgress(u, fired) {
        if (!crossing) return;
        if (toRoomId && u >= 0.3 && !fired.has('cut')) { fired.add('cut'); setCutaway(toRoomId); }
        if (!toRoomId && u >= 0.5 && !fired.has('close')) { fired.add('close'); setCutaway(null); }
      },
    });
    return p.then((res) => {
      if (my !== seq) return { stale: true, ...res };
      if (toRoomId) { setCutaway(toRoomId); director.setLimits('room', toRoomId); } else { setCutaway(null); director.setLimits('vessel'); }
      return res;
    });
  }

  let currentCutaway = null;
  function setCutaway(roomId) {
    if (currentCutaway === roomId) return;
    currentCutaway = roomId;
    world.setCutaway(roomId, { animate: true });
  }

  function componentPose(c) {
    const obj = world.components.get(c.id);
    let centre;
    let size = c.size || [1, 1, 1];
    if (obj) {
      const b = new THREE.Box3().setFromObject(obj);
      if (!b.isEmpty()) {
        centre = b.getCenter(new THREE.Vector3());
        const s = b.getSize(new THREE.Vector3());
        // world size back to ship axes (x, y, z) = (x, z, y)
        size = [s.x, s.z, s.y];
      }
    }
    if (!centre) centre = componentCentreWorld(c);
    const roomBox = director.roomBox(c.room);
    const pose = focusPose(centre, size, facingToWorld(c.facing), roomBox);
    pose.fov = director.roomFov(c.room);
    return pose;
  }

  const nav = {
    history,
    get busy() { return director.isFlying(); },

    selectSystem(systemId, source = 'index') {
      const sys = sysById.get(systemId);
      if (!sys) return Promise.resolve(null);
      const s = store.get();
      if (s.level === 'hmi') hmiHost.close();
      const arrival = director.systemArrival(systemId);
      const roomId = arrival.roomId;
      if (!(s.level === 'room' && s.systemId === systemId && s.roomId === roomId)) history.push(snapshot());
      setLevel('room', { systemId, roomId, componentId: null });
      applyHighlight();
      bus.emit('nav:selected-system', { systemId, source });
      return travel({ toRoomId: roomId, pose: arrival.pose, label: 'system ' + systemId }).then((res) => {
        if (res && !res.stale && !res.interrupted) bus.emit('nav:arrived', { kind: 'system', systemId, roomId, source: arrival.source, primary: arrival.primary });
        return res;
      });
    },

    selectRoom(roomId, { systemId, source = 'ui' } = {}) {
      if (!roomById.has(roomId)) return Promise.resolve(null);
      const s = store.get();
      if (s.level === 'hmi') hmiHost.close();
      history.push(snapshot());
      const sid = systemId !== undefined ? systemId : s.systemId;
      setLevel('room', { roomId, systemId: sid, componentId: null });
      applyHighlight();
      return travel({ toRoomId: roomId, pose: director.roomOverview(roomId), label: 'room ' + roomId, source });
    },

    selectComponent(componentId, source = '3d') {
      const c = compById.get(componentId);
      if (!c) return Promise.resolve(null);
      const s = store.get();
      if (s.level === 'hmi') hmiHost.close();
      if (s.level === 'equipment' && s.componentId === componentId) return Promise.resolve(null);
      if (s.level === 'vessel' || s.roomId !== c.room) {
        // keep the staged context: Back from this equipment returns to its room overview first
        history.push(snapshot());
        history.push({ level: 'room', systemId: c.system !== 'CTX' ? c.system : s.systemId, roomId: c.room, componentId: null, pose: director.roomOverview(c.room) });
      } else if (s.level === 'equipment') {
        // equipment to equipment in the same room replaces the focus: Back still returns to the room overview
      } else {
        history.push(snapshot());
      }
      const systemId = c.system && c.system !== 'CTX' ? c.system : s.systemId;
      setLevel('equipment', { componentId, roomId: c.room, systemId });
      applyHighlight();
      const crossing = currentCutaway !== c.room;
      return travel({ toRoomId: c.room, pose: componentPose(c), kind: crossing ? 'system' : 'focus', label: 'component ' + componentId, source });
    },

    openHmi(componentId) {
      const s = store.get();
      const cid = componentId || s.componentId;
      const c = compById.get(cid);
      if (!c) return false;
      if (s.level !== 'equipment' || s.componentId !== cid) {
        // HMI is only opened from an equipment focus; make sure the context exists first
        return nav.selectComponent(cid, 'hmi').then(() => nav.openHmi(cid));
      }
      history.push(snapshot());
      const also = c.also_systems || [];
      const systemId = c.system !== 'CTX' ? c.system : (also.includes(s.systemId) ? s.systemId : also[0] || s.systemId);
      const ok = hmiHost.open({ componentId: cid, systemId });
      if (!ok) { history.pop(); return false; }
      setLevel('hmi', { componentId: cid, systemId });
      bus.emit('open:hmi', { componentId: cid, systemId });
      return true;
    },

    back() {
      const s = store.get();
      if (s.level === 'vessel' && !history.length) return Promise.resolve(null);
      const prev = history.pop();
      if (!prev) return nav.home();
      if (s.level === 'hmi') {
        hmiHost.close();
        bus.emit('close:hmi', {});
        setLevel(prev.level, { systemId: prev.systemId, roomId: prev.roomId, componentId: prev.componentId });
        applyHighlight();
        return Promise.resolve({ closedHmi: true });
      }
      setLevel(prev.level, { systemId: prev.systemId, roomId: prev.roomId, componentId: prev.componentId });
      applyHighlight();
      const toRoomId = prev.level === 'vessel' ? null : prev.roomId;
      return travel({ toRoomId, pose: prev.pose, kind: toRoomId && toRoomId === s.roomId ? 'focus' : 'system', label: 'back' });
    },

    home() {
      const s = store.get();
      if (s.level === 'hmi') { hmiHost.close(); bus.emit('close:hmi', {}); }
      history.length = 0;
      setLevel('vessel', { systemId: null, roomId: null, componentId: null });
      applyHighlight();
      return travel({ toRoomId: null, pose: director.vesselPose(), label: 'home' });
    },

    // Breadcrumb jump: pop until the requested level is on top.
    goToLevel(level) {
      const order = ['vessel', 'room', 'equipment', 'hmi'];
      const target = order.indexOf(level);
      if (level === 'vessel') return nav.home();
      let s = store.get();
      if (order.indexOf(s.level) <= target) return Promise.resolve(null);
      // drop entries above the target level, then do one smooth back()
      while (history.length > 1 && order.indexOf(history[history.length - 1].level) > target) history.pop();
      if (s.level === 'hmi' && target < order.indexOf('equipment')) { hmiHost.close(); bus.emit('close:hmi', {}); store.set({ level: 'equipment' }); s = store.get(); }
      return nav.back();
    },

    preset(name) {
      const p = director.presets[name];
      if (!p) return Promise.resolve(null);
      const s = store.get();
      if (s.level !== 'vessel') { history.length = 0; if (s.level === 'hmi') hmiHost.close(); setLevel('vessel', { systemId: null, roomId: null, componentId: null }); applyHighlight(); }
      return travel({ toRoomId: null, pose: { eye: p.eye.clone(), target: p.target.clone(), fov: director.baseFov }, label: 'preset ' + name });
    },

    get cutaway() { return currentCutaway; },
  };

  // Bus wiring: any view can request navigation.
  bus.on('select:system', ({ systemId, source }) => nav.selectSystem(systemId, source));
  bus.on('select:room', ({ roomId, systemId, source }) => nav.selectRoom(roomId, { systemId, source }));
  bus.on('select:component', ({ componentId, source }) => nav.selectComponent(componentId, source));
  bus.on('request:hmi', ({ componentId }) => nav.openHmi(componentId));
  bus.on('request:back', () => nav.back());
  bus.on('request:home', () => nav.home());
  return nav;
}
