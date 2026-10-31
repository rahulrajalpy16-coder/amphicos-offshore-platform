// Unit tests for the platform (coordinates, path planning, 2D drawing generation, store and bus).
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { shipToWorld, worldToShip, boxToWorld, facingToWorld, initCoords, T } from '../coords.js';
import { vesselEnvelope, roomPortal, focusPose, liftObstructed, durationFor, easeInOutCubic, clampToBox } from '../../camera/path.js';
import { renderView, hullPlanOutline, halfBreadthAt, layoutMarkers, indexDb } from '../../drawings/views.js';
import { store } from '../store.js';
import { bus } from '../bus.js';
import { db } from '../deps.js';

describe('coordinates (fixed contract)', () => {
  it('maps ship to world and back', () => {
    initCoords(db);
    const p = [120, -8, 31];
    const w = shipToWorld(p);
    expect(w.x).toBeCloseTo(-30);
    expect(w.y).toBeCloseTo(31 - T);
    expect(w.z).toBeCloseTo(8);
    const back = worldToShip(w);
    back.forEach((v, i) => expect(v).toBeCloseTo(p[i]));
  });
  it('maps boxes with port to world -z', () => {
    const b = boxToWorld([10, 20, 2, 6, 0, 4]);
    expect(b.min.z).toBeCloseTo(-6);
    expect(b.max.z).toBeCloseTo(-2);
    expect(b.min.x).toBeCloseTo(-140);
  });
  it('facing vectors', () => {
    expect(facingToWorld('+y').z).toBe(-1);
    expect(facingToWorld('-y').z).toBe(1);
    expect(facingToWorld('+x').x).toBe(1);
  });
});

describe('camera path planning', () => {
  const env = vesselEnvelope(db, T);
  it('every room has a portal and standoff outside the hull', () => {
    for (const r of db.rooms) {
      const box = boxToWorld(r.box);
      const P = roomPortal(box, env);
      expect(env.hull.containsPoint(P.standoff)).toBe(false);
      expect(box.containsPoint(P.standoff)).toBe(false);
      expect(Math.abs(P.portal.z)).toBeGreaterThan(env.halfB);
      expect(P.portal.y).toBeGreaterThan(box.max.y);
      expect(P.portal.x).toBeGreaterThanOrEqual(box.min.x);
      expect(P.portal.x).toBeLessThanOrEqual(box.max.x);
    }
  });
  it('focus pose stays inside the room and looks at the component', () => {
    const c = db.components.find((x) => x.room === db.rooms[0].id);
    const room = boxToWorld(db.rooms.find((r) => r.id === c.room).box);
    const centre = shipToWorld([c.pos[0], c.pos[1], c.pos[2] + c.size[2] / 2]);
    const p = focusPose(centre, c.size, facingToWorld(c.facing), room);
    expect(room.containsPoint(p.eye)).toBe(true);
    expect(p.target.distanceTo(centre)).toBeLessThan(1e-6);
  });
  it('adds lift waypoints around an obstacle', () => {
    const wall = new THREE.Box3(new THREE.Vector3(-5, 0, -50), new THREE.Vector3(5, 30, 50));
    const isClear = (a, b) => {
      const ray = new THREE.Ray(a, b.clone().sub(a).normalize());
      const hit = ray.intersectBox(wall, new THREE.Vector3());
      return !hit || hit.distanceTo(a) > a.distanceTo(b);
    };
    const pts = liftObstructed([new THREE.Vector3(-50, 10, 0), new THREE.Vector3(50, 10, 0)], isClear, { lift: 15 });
    expect(pts.length).toBeGreaterThan(2);
    for (let i = 1; i < pts.length; i++) expect(isClear(pts[i - 1], pts[i])).toBe(true);
  });
  it('flight durations are 2 to 4 s for system flights and at least 1.2 s for focus', () => {
    expect(durationFor(10)).toBeGreaterThanOrEqual(2);
    expect(durationFor(5000)).toBeLessThanOrEqual(4);
    expect(durationFor(1, 'focus')).toBeGreaterThanOrEqual(1.2);
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
  });
  it('clampToBox', () => {
    const b = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1));
    const p = clampToBox(new THREE.Vector3(5, -2, 0.5), b);
    expect(p.toArray()).toEqual([1, 0, 0.5]);
  });
});

describe('2D drawings generated from the database', () => {
  const I = indexDb(db);
  it('GA plan carries one marker per system with the same ids', () => {
    const svg = renderView(db, 'ga', {}, I);
    for (const s of db.systems) expect(svg).toContain(`data-id="${s.id}" data-kind="system"`);
    expect(svg).toContain('Representative arrangement, not for construction');
  });
  it('profile contains every room and every system component', () => {
    const svg = renderView(db, 'profile', {}, I);
    for (const r of db.rooms) expect(svg).toContain(`data-id="${r.id}" data-kind="room"`);
    for (const c of db.components.filter((x) => x.system !== 'CTX')) expect(svg).toContain(`data-id="${c.id}"`);
  });
  it('room layouts contain all equipment of the room at the database position', () => {
    for (const r of db.rooms) {
      const svg = renderView(db, 'room', { roomId: r.id }, I);
      for (const c of db.components.filter((x) => x.room === r.id)) {
        expect(svg).toContain(`data-id="${c.id}"`);
        const x = Math.round((c.pos[0] - c.size[0] / 2) * 100) / 100;
        expect(svg).toContain(`x="${x}"`);
      }
    }
  });
  it('distribution view for every system lists its rooms', () => {
    for (const s of db.systems) {
      const svg = renderView(db, 'distribution', { systemId: s.id }, I);
      for (const rid of s.rooms || []) expect(svg).toContain(`data-id="${rid}"`);
    }
  });
  it('deck plans render for every deck that has rooms', () => {
    for (const d of db.vessel.decks) {
      const svg = renderView(db, 'deck', { deckId: d.id }, I);
      expect(svg.startsWith('<svg')).toBe(true);
    }
  });
  it('hull outline is symmetric and within the beam', () => {
    const pts = hullPlanOutline(db.vessel, db.vessel.depth);
    const maxY = Math.max(...pts.map((p) => p[1]));
    const minY = Math.min(...pts.map((p) => p[1]));
    expect(maxY).toBeCloseTo(-minY);
    expect(maxY).toBeLessThanOrEqual(db.vessel.beam / 2 + 1e-6);
    const st = db.vessel.hull_offsets.stations[1];
    expect(halfBreadthAt(st, db.vessel.hull_offsets.z_levels, 0)).toBeCloseTo(st.half_breadth[0]);
  });
  it('marker layout separates overlapping markers', () => {
    const s = (n) => ({ number: n, id: 'S' + n, name: 'x' });
    const out = layoutMarkers([{ s: s(1), x: 0, y: 0 }, { s: s(2), x: 0.5, y: 0 }, { s: s(3), x: 100, y: 0 }], 2);
    const a = out.find((m) => m.s.number === 1), b = out.find((m) => m.s.number === 2);
    expect(Math.hypot(a.mx - b.mx, a.my - b.my)).toBeGreaterThanOrEqual(4.5);
    expect(out.find((m) => m.s.number === 3).leader).toBe(false);
  });
});

describe('store and bus', () => {
  it('store notifies only on change', () => {
    let n = 0;
    const off = store.subscribe(() => n++);
    store.set({ level: 'room' });
    store.set({ level: 'room' });
    off();
    expect(n).toBe(1);
    store.reset();
  });
  it('bus delivers and unsubscribes', () => {
    let got = null;
    const off = bus.on('x', (p) => { got = p; });
    bus.emit('x', 5);
    off();
    bus.emit('x', 6);
    expect(got).toBe(5);
  });
});

describe('system arrival viewpoints (systems[].arrival, when present)', () => {
  it('reference existing rooms and components; closed-room eyes lie inside the room box', () => {
    const roomById = new Map(db.rooms.map((r) => [r.id, r]));
    const compIds = new Set(db.components.map((c) => c.id));
    for (const s of db.systems) {
      const a = s.arrival;
      if (!a) continue;
      const rid = a.room || s.primary_room;
      expect(roomById.has(rid)).toBe(true);
      expect(Array.isArray(a.eye) && a.eye.length === 3).toBe(true);
      expect(Array.isArray(a.target) && a.target.length === 3).toBe(true);
      for (const id of a.primary_components || []) expect(compIds.has(id)).toBe(true);
      const r = roomById.get(rid);
      const [x0, x1, y0, y1, z0, z1] = r.box;
      const open = /deck|open|turret|offload|mast/i.test(r.name) && r.box[5] - r.box[4] > 5;
      if (!open) {
        expect(a.eye[0] >= x0 - 0.5 && a.eye[0] <= x1 + 0.5 && a.eye[1] >= y0 - 0.5 && a.eye[1] <= y1 + 0.5 && a.eye[2] >= z0 - 0.5 && a.eye[2] <= z1 + 0.5).toBe(true);
      }
    }
  });
});
