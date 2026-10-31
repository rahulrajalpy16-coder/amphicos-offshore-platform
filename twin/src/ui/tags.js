// Numbered system tags projected from 3D to the DOM. De-clutter rules:
// - vessel level: all 15 tags, tags closer than a pixel threshold merge into a room cluster pill whose numbers
//   stay individually clickable; tags hidden by geometry are drawn dashed and slightly faded;
// - room / equipment level: only systems with equipment in the current room, anchored on that equipment;
// - HMI level: none.
import * as THREE from 'three';
import { h, pad2 } from './dom.js';

export function createTags({ layer, db, world, camera, store, bus, director, renderer }) {
  const sysById = new Map(db.systems.map((s) => [s.id, s]));
  const roomById = new Map(db.rooms.map((r) => [r.id, r]));
  const compById = new Map(db.components.map((c) => [c.id, c]));
  const tagEls = new Map();
  const clusterEls = new Map();
  const occluded = new Map();
  let lastOcc = 0;
  let occIdx = 0;
  let enabled = true;

  for (const s of db.systems) {
    const el = h('button', { class: 'tag', 'data-system': s.id, title: s.name, 'aria-label': `System ${s.number}: ${s.name}`,
      onclick: (e) => { e.stopPropagation(); bus.emit('select:system', { systemId: s.id, source: 'tag' }); } },
    h('span', { class: 'pin' }, pad2(s.number)), h('span', { class: 'lbl' }, s.short || s.name));
    el.style.display = 'none';
    layer.append(el);
    tagEls.set(s.id, el);
  }

  // Room-level anchors: centroid of that system's equipment in the room, just above the tallest item.
  const roomAnchorCache = new Map();
  function roomAnchors(roomId) {
    if (roomAnchorCache.has(roomId)) return roomAnchorCache.get(roomId);
    const m = new Map();
    for (const s of db.systems) {
      const ids = db.components.filter((c) => c.room === roomId && (c.system === s.id || (c.also_systems || []).includes(s.id))).map((c) => c.id);
      if (!ids.length) continue;
      const b = new THREE.Box3();
      for (const id of ids) {
        const o = world.components.get(id);
        if (o) b.expandByObject(o);
      }
      if (b.isEmpty()) continue;
      const c = b.getCenter(new THREE.Vector3());
      c.y = b.max.y + 0.35;
      m.set(s.id, c);
    }
    roomAnchorCache.set(roomId, m);
    return m;
  }

  const v = new THREE.Vector3();
  function project(p, w, hgt) {
    v.copy(p).project(camera);
    if (v.z > 1 || v.z < -1) return null;
    const x = (v.x * 0.5 + 0.5) * w;
    const y = (-v.y * 0.5 + 0.5) * hgt;
    if (x < -40 || y < -40 || x > w + 40 || y > hgt + 40) return null;
    return { x, y };
  }

  function clusterEl(key, members, label) {
    let el = clusterEls.get(key);
    if (!el) {
      el = h('div', { class: 'cluster', 'data-cluster': key },
        h('span', { class: 'cl-name' }, label),
        ...members.map((id) => h('button', { 'data-system': id, title: sysById.get(id).name,
          onclick: (e) => { e.stopPropagation(); bus.emit('select:system', { systemId: id, source: 'tag' }); } }, pad2(sysById.get(id).number))));
      layer.append(el);
      clusterEls.set(key, el);
    }
    el.dataset.live = '1';
    return el;
  }

  function update(now) {
    const s = store.get();
    const w = layer.clientWidth, hgt = layer.clientHeight;
    for (const el of tagEls.values()) el.dataset.live = '';
    for (const el of clusterEls.values()) el.dataset.live = '';
    if (enabled && s.level !== 'hmi' && !s.attract) {
      const anchors = s.level === 'vessel' ? world.tagAnchors : roomAnchors(s.roomId);
      const pts = [];
      for (const [sid, p] of anchors) {
        if (!sysById.has(sid)) continue;
        const sp = project(p, w, hgt);
        if (!sp) continue;
        pts.push({ sid, p, ...sp, dist: camera.position.distanceTo(p) });
      }
      // occlusion test against the scene colliders, one tag per frame (round robin) to keep frames cheap
      if (s.level !== 'vessel') occluded.clear();
      else if (pts.length && director && director.segmentClear && now - lastOcc > 30) {
        lastOcc = now;
        const q = pts[occIdx++ % pts.length];
        const dir = q.p.clone().sub(camera.position);
        const len = dir.length();
        const end = camera.position.clone().addScaledVector(dir.normalize(), Math.max(0, len - 1.2));
        occluded.set(q.sid, !director.segmentClear(camera.position, end));
      }
      const threshold = (s.level === 'vessel' ? 2.6 : 1.9) * rem();
      const used = new Set();
      pts.sort((a, b) => sysById.get(a.sid).number - sysById.get(b.sid).number);
      // screen-space collision avoidance: an item that would overlap one already placed moves up
      const placed = [];
      const R = rem();
      // At room level the selected system's primary components are obstacles: tags never cover them.
      const obstacles = s.level === 'vessel' ? [] : primaryRects(s.systemId, w, hgt);
      const place = (x, y, w) => {
        const hh = 2.1 * R;
        let yy = y;
        for (let k = 0; k < 16; k++) {
          const hit = placed.find((p) => Math.abs(p.x - x) < (p.w + w) / 2 + 4 && Math.abs(p.y - yy) < hh);
          if (hit) { yy = hit.y - hh - 2; continue; }
          const ob = obstacles.find((o) => x + w / 2 > o.x0 - 4 && x - w / 2 < o.x1 + 4 && yy > o.y0 - 4 && yy - hh < o.y1 + 4);
          if (ob) { yy = ob.y0 - 6; continue; }
          break;
        }
        placed.push({ x, y: yy, w });
        return yy;
      };
      for (const a of pts) {
        if (used.has(a.sid)) continue;
        const group = [a];
        if (threshold) for (const b of pts) if (b !== a && !used.has(b.sid) && Math.hypot(a.x - b.x, a.y - b.y) < threshold) group.push(b);
        group.forEach((g) => used.add(g.sid));
        const behind = group.every((g) => occluded.get(g.sid));
        const fade = Math.max(0.6, Math.min(1, 1.25 - a.dist / 1400));
        if (group.length === 1) {
          const el = tagEls.get(a.sid);
          el.dataset.live = '1';
          el.style.display = '';
          const w1 = (s.level === 'vessel' && s.systemId !== a.sid ? 2.0 : 2.2 + 0.45 * ((sysById.get(a.sid).short || '').length)) * R;
          const y1 = place(a.x, a.y, w1);
          el.style.transform = `translate(${a.x.toFixed(1)}px, ${y1.toFixed(1)}px) translate(-50%, -100%)`;
          el.style.opacity = String(behind ? fade * 0.85 : fade);
          el.classList.toggle('behind', !!behind);
          el.classList.toggle('sel', s.systemId === a.sid);
          el.classList.toggle('showlbl', s.level !== 'vessel');
        } else {
          const ids = group.map((g) => g.sid).sort();
          const rooms = new Set(ids.map((id) => sysById.get(id).primary_room));
          const label = s.level !== 'vessel' ? '' : rooms.size === 1 ? shortRoom(roomById.get([...rooms][0])) : `${ids.length} systems`;
          const el = clusterEl(ids.join('|'), ids, label);
          const cx = group.reduce((t, g) => t + g.x, 0) / group.length;
          const cy = Math.min(...group.map((g) => g.y));
          const wc = (1.2 + 0.42 * label.length + 1.85 * ids.length) * R;
          const yc = place(cx, cy, wc);
          el.style.transform = `translate(${cx.toFixed(1)}px, ${yc.toFixed(1)}px) translate(-50%, -100%)`;
          el.style.opacity = String(fade);
          el.classList.toggle('behind', !!behind);
          for (const b of el.querySelectorAll('button')) b.classList.toggle('sel', b.dataset.system === s.systemId);
        }
      }
    }
    for (const el of tagEls.values()) if (!el.dataset.live) el.style.display = 'none';
    for (const [k, el] of clusterEls) if (!el.dataset.live) { el.remove(); clusterEls.delete(k); }
  }

  // Screen rectangles of the selected system's arrival primary components (projected bounding boxes).
  const _corner = new THREE.Vector3();
  function primaryRects(systemId, w, hgt) {
    if (!systemId || !director || !director.systemArrival) return [];
    const a = director.systemArrival(systemId);
    const out = [];
    for (const cid of (a && a.primary) || []) {
      const o = world.components.get(cid);
      if (!o) continue;
      const b = new THREE.Box3().setFromObject(o);
      if (b.isEmpty()) continue;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, front = false;
      for (let i = 0; i < 8; i++) {
        _corner.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(camera);
        if (_corner.z > 1) continue;
        front = true;
        const x = (_corner.x * 0.5 + 0.5) * w, y = (-_corner.y * 0.5 + 0.5) * hgt;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      if (front && x1 - x0 < w * 0.6) out.push({ x0, x1, y0, y1 });
    }
    return out;
  }

  let remCache = 0;
  window.addEventListener('resize', () => { remCache = 0; });
  function rem() {
    if (!remCache) remCache = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return remCache;
  }

  function shortRoom(r) {
    if (!r) return '';
    return r.short || r.name.replace(/\s*\(.*\)\s*/, '').slice(0, 22);
  }

  return { update, setEnabled(on) { enabled = on; }, roomAnchors };
}
