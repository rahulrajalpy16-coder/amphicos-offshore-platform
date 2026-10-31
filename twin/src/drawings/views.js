// 2D engineering drawings generated at runtime from fpso_db.json (pure functions returning SVG markup).
// Same identifiers as the 3D model: every room, component and system marker carries data-id and data-kind.
// Ship frame: x stern to bow, y port positive, z keel up. Plan views: x right, port up (svg y = -ship y).
// Profile views: x right, z up (svg y = -z).

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const f = (n) => (Math.round(n * 100) / 100).toString();

export const VIEW_TITLES = {
  ga: 'General arrangement, main deck plan',
  profile: 'Inboard profile, starboard elevation',
  deck: 'Deck plan',
  room: 'Room layout',
  distribution: 'System distribution',
};

// ---------- hull geometry ----------
export function halfBreadthAt(station, zLevels, z) {
  const hb = station.half_breadth;
  if (z <= zLevels[0]) return hb[0];
  for (let i = 1; i < zLevels.length; i++) {
    if (z <= zLevels[i]) {
      const t = (z - zLevels[i - 1]) / (zLevels[i] - zLevels[i - 1]);
      return hb[i - 1] + (hb[i] - hb[i - 1]) * t;
    }
  }
  return hb[hb.length - 1];
}

// Plan outline of the hull at height z: array of [x, y] (ship frame), closed polygon.
export function hullPlanOutline(vessel, z) {
  const ho = vessel.hull_offsets;
  if (!ho || !ho.stations || !ho.stations.length) {
    const b = (vessel.beam || 52) / 2, L = vessel.loa || 300;
    return [[0, -b], [L, -b], [L, b], [0, b]];
  }
  const st = [...ho.stations].sort((a, b) => a.x - b.x);
  const pts = st.map((s) => [s.x, Math.max(0, halfBreadthAt(s, ho.z_levels, z))]).filter((p, i, arr) => p[1] > 0.01 || (i > 0 && arr[i - 1][1] > 0.01) || (i < arr.length - 1 && arr[i + 1][1] > 0.01));
  const port = pts.map(([x, y]) => [x, y]);
  const stbd = pts.slice().reverse().map(([x, y]) => [x, -y]);
  return [...port, ...stbd];
}

// Profile outline: keel line from stations, deck line at depth (plus bulwark).
export function hullProfileOutline(vessel) {
  const ho = vessel.hull_offsets;
  const D = vessel.depth || 28;
  if (!ho || !ho.stations || !ho.stations.length) return [[0, 0], [vessel.loa || 300, 0], [vessel.loa || 300, D], [0, D]];
  const st = [...ho.stations].sort((a, b) => a.x - b.x).filter((s) => s.half_breadth.some((v) => v > 0.01));
  const bottom = st.map((s) => [s.x, s.keel_z != null ? s.keel_z : 0]);
  const top = st.slice().reverse().map((s) => [s.x, D]);
  return [...bottom, ...top];
}

const planPts = (pts) => pts.map(([x, y]) => `${f(x)},${f(-y)}`).join(' ');
const profPts = (pts) => pts.map(([x, z]) => `${f(x)},${f(-z)}`).join(' ');

// ---------- indexes ----------
export function indexDb(db) {
  const sysById = new Map(db.systems.map((s) => [s.id, s]));
  const roomById = new Map(db.rooms.map((r) => [r.id, r]));
  const compById = new Map(db.components.map((c) => [c.id, c]));
  const compsByRoom = new Map();
  for (const c of db.components) {
    if (!compsByRoom.has(c.room)) compsByRoom.set(c.room, []);
    compsByRoom.get(c.room).push(c);
  }
  const sysOfComp = (c) => [c.system, ...(c.also_systems || [])].filter((x) => x && x !== 'CTX');
  return { sysById, roomById, compById, compsByRoom, sysOfComp };
}

// ---------- shared pieces ----------
function titleBlock(db, title, no, x, y, u) {
  const w = 62 * u, hgt = 17 * u;
  const meta = db.meta || {};
  const fs = (k) => f(k * u);
  return `<g class="tb" transform="translate(${f(x - w)},${f(y - hgt)})">
<rect x="0" y="0" width="${f(w)}" height="${f(hgt)}" />
<line x1="0" y1="${f(5 * u)}" x2="${f(w)}" y2="${f(5 * u)}" class="dim" />
<text x="${f(1.2 * u)}" y="${f(3.4 * u)}" font-size="${fs(2.3)}" font-weight="700">AMPHICOS FPSO DIGITAL TWIN</text>
<text x="${f(1.2 * u)}" y="${f(8 * u)}" font-size="${fs(2.0)}" font-weight="600">${esc(title)}</text>
<text x="${f(1.2 * u)}" y="${f(10.8 * u)}" font-size="${fs(1.45)}">Dwg ${esc(no)}  Units: metres, ship frame (x from stern, y port +, z from keel)</text>
<text x="${f(1.2 * u)}" y="${f(13.1 * u)}" font-size="${fs(1.45)}">Generated from fpso_db.json ${esc(meta.version || '')} ${esc(meta.date || '')}</text>
<text x="${f(1.2 * u)}" y="${f(15.7 * u)}" font-size="${fs(1.7)}" class="warn">Representative arrangement, not for construction</text>
</g>`;
}

function marker(s, x, y, r, extraClass = '') {
  return `<g class="marker ${extraClass}" data-id="${esc(s.id)}" data-kind="system" transform="translate(${f(x)},${f(y)})"><title>${esc(s.number + '. ' + s.name)}</title><circle r="${f(r)}" /><text font-size="${f(r * 1.05)}">${s.number}</text></g>`;
}

// De-clutter numbered markers: markers closer than 2.4 r are laid out in a row above their common location,
// with a leader line and a dot at the true position. pts: [{ s, x, y }] in svg units.
export function layoutMarkers(pts, r) {
  const used = new Set();
  const groups = [];
  const sorted = [...pts].sort((a, b) => a.s.number - b.s.number);
  for (const a of sorted) {
    if (used.has(a)) continue;
    const g = [a]; used.add(a);
    let grew = true;
    while (grew) {
      grew = false;
      for (const b of sorted) {
        if (used.has(b)) continue;
        if (g.some((m) => Math.hypot(m.x - b.x, m.y - b.y) < 2.4 * r)) { g.push(b); used.add(b); grew = true; }
      }
    }
    groups.push(g);
  }
  const out = [];
  for (const g of groups) {
    if (g.length === 1) { out.push({ ...g[0], mx: g[0].x, my: g[0].y, leader: false }); continue; }
    const cx = g.reduce((t, m) => t + m.x, 0) / g.length;
    const cy = Math.min(...g.map((m) => m.y));
    const perRow = 8;
    g.forEach((m, i) => {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, g.length - row * perRow);
      const col = i % perRow;
      out.push({ ...m, mx: cx + (col - (inRow - 1) / 2) * 2.3 * r, my: cy - 3.2 * r - row * 2.3 * r, leader: true });
    });
  }
  return out;
}

function markersSvg(pts, r) {
  let s = '';
  for (const m of layoutMarkers(pts, r)) {
    if (m.leader) s += `<line class="dim" x1="${f(m.x)}" y1="${f(m.y)}" x2="${f(m.mx)}" y2="${f(m.my)}" /><circle cx="${f(m.x)}" cy="${f(m.y)}" r="${f(r * 0.28)}" fill="#0f2a44" />`;
  }
  for (const m of layoutMarkers(pts, r)) s += marker(m.s, m.mx, m.my, r);
  return s;
}

function compRectPlan(c, I, u, showTag) {
  const [x, y] = c.pos;
  const [L, W] = c.size || [1, 1];
  const sys = I.sysOfComp(c).join(' ');
  const face = facePlan(c);
  return `<g class="cg" data-id="${esc(c.id)}" data-kind="component" data-sys="${esc(sys)}"><title>${esc((c.tag || c.id) + ' ' + c.name)}</title>
<rect class="comp" data-id="${esc(c.id)}" data-kind="component" data-sys="${esc(sys)}" x="${f(x - L / 2)}" y="${f(-(y + W / 2))}" width="${f(Math.max(L, 0.05))}" height="${f(Math.max(W, 0.05))}" />
${face}${showTag ? `<text class="ctag" x="${f(x)}" y="${f(-y)}" font-size="${f(Math.min(0.42 * u, Math.max(0.16, Math.min(L, W) * 0.38)))}" text-anchor="middle" dominant-baseline="central">${esc(c.tag || '')}</text>` : ''}</g>`;
}

function facePlan(c) {
  const [x, y] = c.pos;
  const [L, W] = c.size || [1, 1];
  let x1, y1, x2, y2;
  switch (c.facing) {
    case '+x': x1 = x2 = x + L / 2; y1 = y - W / 2; y2 = y + W / 2; break;
    case '-x': x1 = x2 = x - L / 2; y1 = y - W / 2; y2 = y + W / 2; break;
    case '+y': y1 = y2 = y + W / 2; x1 = x - L / 2; x2 = x + L / 2; break;
    case '-y': y1 = y2 = y - W / 2; x1 = x - L / 2; x2 = x + L / 2; break;
    default: return '';
  }
  return `<line class="face" x1="${f(x1)}" y1="${f(-y1)}" x2="${f(x2)}" y2="${f(-y2)}" />`;
}

// Room label only where it fits (shortened to the part before a bracket if needed).
function fitLabel(text, x, y, fs, width, height) {
  if (height < fs * 1.6) return '';
  let t = String(text || '');
  const w = (str) => str.length * 0.53 * fs;
  if (w(t) > width) t = t.replace(/\s*\(.*\)\s*/, '');
  if (w(t) > width) { const k = Math.floor(width / (0.53 * fs)); if (k < 4) return ''; t = t.slice(0, k - 1) + '.'; }
  return `<text class="rlabel" x="${f(x)}" y="${f(y)}" font-size="${f(fs)}">${esc(t)}</text>`;
}

function roomRectPlan(r, I, u, label = true) {
  const [x0, x1, y0, y1] = r.box;
  const sys = [...new Set((I.compsByRoom.get(r.id) || []).flatMap(I.sysOfComp))].join(' ');
  return `<g><rect class="room${sys ? ' has-sys' : ''}" data-id="${esc(r.id)}" data-kind="room" data-sys="${esc(sys)}" x="${f(x0)}" y="${f(-y1)}" width="${f(x1 - x0)}" height="${f(y1 - y0)}"><title>${esc(r.name)}</title></rect>
${label ? fitLabel(r.short || r.name, x0 + 0.6 * u, -y1 + 2.0 * u, 1.5 * u, x1 - x0 - 1.2 * u, y1 - y0) : ''}</g>`;
}

function roomRectProfile(r, I, u) {
  const [x0, x1, , , z0, z1] = r.box;
  const sys = [...new Set((I.compsByRoom.get(r.id) || []).flatMap(I.sysOfComp))].join(' ');
  return `<g><rect class="room${sys ? ' has-sys' : ''}" data-id="${esc(r.id)}" data-kind="room" data-sys="${esc(sys)}" x="${f(x0)}" y="${f(-z1)}" width="${f(x1 - x0)}" height="${f(z1 - z0)}"><title>${esc(r.name)}</title></rect>
${fitLabel(r.short || r.name, x0 + 0.4 * u, -z1 + 1.5 * u, 1.15 * u, x1 - x0 - 0.8 * u, z1 - z0)}</g>`;
}

function compRectProfile(c, I) {
  const [x, , z] = c.pos;
  const [L, , H] = c.size || [1, 1, 1];
  const sys = I.sysOfComp(c).join(' ');
  return `<rect class="comp" data-id="${esc(c.id)}" data-kind="component" data-sys="${esc(sys)}" x="${f(x - L / 2)}" y="${f(-(z + H))}" width="${f(Math.max(L, 0.05))}" height="${f(Math.max(H, 0.05))}"><title>${esc((c.tag || c.id) + ' ' + c.name)}</title></rect>`;
}

function frameScale(x0, x1, yBase, u, step = 10) {
  let s = '';
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
    s += `<line class="grid" x1="${f(x)}" y1="${f(yBase)}" x2="${f(x)}" y2="${f(yBase + 1.2 * u)}" />`;
    if (x % (step * 5) === 0) s += `<text x="${f(x)}" y="${f(yBase + 3.0 * u)}" font-size="${f(1.4 * u)}" text-anchor="middle">x ${x}</text>`;
  }
  return s;
}

function svgWrap(vb, body, view, extra = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="dw" data-view="${view}" ${extra} viewBox="${vb.map(f).join(' ')}" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
}

function primaryPos(db, I, s) {
  const c = I.compById.get(s.primary_component);
  if (c) return [c.pos[0], c.pos[1], c.pos[2] + ((c.size && c.size[2]) || 1)];
  const r = I.roomById.get(s.primary_room);
  if (r) return [(r.box[0] + r.box[1]) / 2, (r.box[2] + r.box[3]) / 2, r.box[5]];
  return [0, 0, 0];
}

// ---------- views ----------
export function gaPlan(db, I = indexDb(db)) {
  const v = db.vessel; const L = v.loa || 300; const B = v.beam || 52; const D = v.depth || 28;
  const u = L / 300 * 1.2;
  const pad = 14 * u;
  const vb = [-pad, -B / 2 - pad - 4 * u, L + 2 * pad, B + 2 * pad + 26 * u];
  let s = `<rect x="${f(vb[0])}" y="${f(vb[1])}" width="${f(vb[2])}" height="${f(vb[3])}" fill="#f3f1ea" />`;
  s += `<polygon class="hull" points="${planPts(hullPlanOutline(v, D))}" />`;
  s += `<line class="dim" x1="0" y1="0" x2="${f(L)}" y2="0" stroke-dasharray="2 1" />`;
  for (const b of v.bulkheads || []) if (b.kind !== 'longitudinal') s += `<line class="bhd" x1="${f(b.x)}" y1="${f(-B / 2)}" x2="${f(b.x)}" y2="${f(B / 2)}"><title>${esc(b.name)}</title></line>`;
  for (const t of db.topsides || []) {
    const [x0, x1, y0, y1] = t.box;
    s += `<rect class="ts" x="${f(x0)}" y="${f(-y1)}" width="${f(x1 - x0)}" height="${f(y1 - y0)}"><title>${esc(t.name)}</title></rect>`;
    if (x1 - x0 > 10 * u) s += `<text class="rlabel" x="${f((x0 + x1) / 2)}" y="${f(-(y0 + y1) / 2)}" font-size="${f(1.3 * u)}" text-anchor="middle">${esc(t.name)}</text>`;
  }
  // rooms at or above the main deck are drawn solid, below deck rooms dashed (for location reference)
  for (const r of db.rooms) {
    const onMain = Math.abs(r.box[4] - D) < 0.6;
    if (r.box[4] > D + 0.6) continue; // upper-deck rooms are shown on their deck plans
    s += onMain ? roomRectPlan(r, I, u) : `<rect class="zone" data-id="${esc(r.id)}" data-kind="room" x="${f(r.box[0])}" y="${f(-r.box[3])}" width="${f(r.box[1] - r.box[0])}" height="${f(r.box[3] - r.box[2])}" style="cursor:pointer;pointer-events:all"><title>${esc(r.name)} (below main deck)</title></rect>`;
  }
  s += markersSvg(db.systems.map((sy) => { const p = primaryPos(db, I, sy); return { s: sy, x: p[0], y: -p[1] }; }), 2.1 * u);
  s += `<text x="0" y="${f(-B / 2 - 6 * u)}" font-size="${f(1.6 * u)}">PORT</text><text x="0" y="${f(B / 2 + 7 * u)}" font-size="${f(1.6 * u)}">STARBOARD</text>`;
  s += `<text x="${f(L)}" y="${f(-B / 2 - 6 * u)}" font-size="${f(1.6 * u)}" text-anchor="end">BOW (FWD)</text><text x="${f(L * 0.5)}" y="${f(-B / 2 - 6 * u)}" font-size="${f(1.4 * u)}" text-anchor="middle">Numbered markers: systems 1 to ${db.systems.length} (primary equipment); dashed outlines: rooms below the main deck</text>`;
  s += frameScale(0, L, B / 2 + 2 * u, u);
  s += titleBlock(db, VIEW_TITLES.ga, 'ADT-2D-001', vb[0] + vb[2] - 1 * u, vb[1] + vb[3] - 1 * u, u);
  return svgWrap(vb, s, 'ga');
}

export function profile(db, I = indexDb(db)) {
  const v = db.vessel; const L = v.loa || 300; const D = v.depth || 28;
  let top = D + 20;
  for (const t of db.topsides || []) top = Math.max(top, t.box[5]);
  for (const r of db.rooms) top = Math.max(top, r.box[5]);
  const u = L / 300 * 1.2;
  const pad = 14 * u;
  const vb = [-pad, -top - pad, L + 2 * pad, top + 2 * pad + 26 * u];
  let s = `<rect x="${f(vb[0])}" y="${f(vb[1])}" width="${f(vb[2])}" height="${f(vb[3])}" fill="#f3f1ea" />`;
  s += `<polygon class="hull" points="${profPts(hullProfileOutline(v))}" />`;
  const Tw = v.operating_draft || 16;
  s += `<line x1="${f(-pad * 0.6)}" y1="${f(-Tw)}" x2="${f(L + pad * 0.6)}" y2="${f(-Tw)}" stroke="#2a78b5" stroke-width="1" vector-effect="non-scaling-stroke" stroke-dasharray="4 3" /><text x="${f(L + pad * 0.6)}" y="${f(-Tw - 0.8 * u)}" font-size="${f(1.3 * u)}" text-anchor="end" fill="#2a78b5">Operating waterline T ${f(Tw)} m</text>`;
  for (const z of v.zones || []) s += `<rect class="zone" x="${f(z.box[0])}" y="${f(-z.box[5])}" width="${f(z.box[1] - z.box[0])}" height="${f(z.box[5] - z.box[4])}"><title>${esc(z.name)}</title></rect>`;
  for (const d of v.decks || []) {
    const [a, b] = d.x_range || [0, L];
    s += `<line class="deckline" x1="${f(a)}" y1="${f(-d.z)}" x2="${f(b)}" y2="${f(-d.z)}"><title>${esc(d.name)} z ${d.z}</title></line>`;
  }
  for (const b of v.bulkheads || []) if (b.kind !== 'longitudinal') s += `<line class="bhd" x1="${f(b.x)}" y1="${f(-D)}" x2="${f(b.x)}" y2="0"><title>${esc(b.name)}</title></line>`;
  for (const t of db.topsides || []) {
    const [x0, x1, , , z0, z1] = t.box;
    s += `<rect class="ts" x="${f(x0)}" y="${f(-z1)}" width="${f(x1 - x0)}" height="${f(z1 - z0)}"><title>${esc(t.name)}</title></rect>`;
  }
  for (const r of db.rooms) s += roomRectProfile(r, I, u);
  for (const c of db.components) if (c.system !== 'CTX') s += compRectProfile(c, I);
  s += markersSvg(db.systems.map((sy) => { const p = primaryPos(db, I, sy); return { s: sy, x: p[0], y: -(p[2] + 1.0 * u) }; }), 1.6 * u);
  // deck labels at the aft end
  let lastZ = -1e9;
  for (const d of [...(v.decks || [])].sort((a, b) => a.z - b.z)) {
    if (d.z - lastZ < 1.4 * u) continue;
    lastZ = d.z;
    s += `<text x="${f(vb[0] + 0.5 * u)}" y="${f(-d.z + 0.4 * u)}" font-size="${f(1.0 * u)}" fill="#4b5866">${esc(d.name.replace(/\s*\(.*\)\s*/, ''))}</text>`;
  }
  s += frameScale(0, L, 1.5 * u, u);
  s += titleBlock(db, VIEW_TITLES.profile, 'ADT-2D-002', vb[0] + vb[2] - 1 * u, vb[1] + vb[3] - 1 * u, u);
  return svgWrap(vb, s, 'profile');
}

export function roomsOnDeck(db, deckId) {
  const d = (db.vessel.decks || []).find((x) => x.id === deckId);
  return db.rooms.filter((r) => r.deck === deckId || (d && Math.abs(r.box[4] - d.z) < 0.8));
}

export function deckPlan(db, deckId, I = indexDb(db)) {
  const v = db.vessel; const L = v.loa || 300; const B = v.beam || 52;
  const d = (v.decks || []).find((x) => x.id === deckId) || { id: deckId, name: deckId, z: v.depth };
  const rooms = roomsOnDeck(db, d.id);
  // frame the extent of the rooms on this deck (or the deck's x range), with the hull outline for context
  let x0 = (d.x_range || [0, L])[0], x1 = (d.x_range || [0, L])[1];
  if (rooms.length) { x0 = Math.min(...rooms.map((r) => r.box[0])) - 8; x1 = Math.max(...rooms.map((r) => r.box[1])) + 8; }
  const span = Math.max(40, x1 - x0);
  const u = span / 300 * 1.6 + 0.12;
  const pad = 8 * u;
  const vb = [x0 - pad, -B / 2 - pad - 3 * u, span + 2 * pad, B + 2 * pad + 26 * u];
  const zc = Math.min(d.z, v.depth || 28);
  let s = `<rect x="${f(vb[0])}" y="${f(vb[1])}" width="${f(vb[2])}" height="${f(vb[3])}" fill="#f3f1ea" />`;
  s += `<polygon class="hull" points="${planPts(hullPlanOutline(v, zc))}" />`;
  s += `<line class="dim" x1="${f(x0 - pad)}" y1="0" x2="${f(x0 + span + pad)}" y2="0" stroke-dasharray="2 1" />`;
  for (const b of v.bulkheads || []) if (b.kind !== 'longitudinal' && b.x > x0 - pad && b.x < x0 + span + pad) s += `<line class="bhd" x1="${f(b.x)}" y1="${f(-B / 2)}" x2="${f(b.x)}" y2="${f(B / 2)}" />`;
  for (const r of rooms) s += roomRectPlan(r, I, u);
  for (const r of rooms) for (const c of I.compsByRoom.get(r.id) || []) s += compRectPlan(c, I, u, false);
  s += frameScale(x0 - pad, x0 + span + pad, B / 2 + 1.5 * u, u, 5);
  s += titleBlock(db, `${VIEW_TITLES.deck}: ${d.name} (z ${d.z} m)`, 'ADT-2D-1' + String((v.decks || []).indexOf(d) + 1).padStart(2, '0'), vb[0] + vb[2] - 1 * u, vb[1] + vb[3] - 1 * u, u);
  return svgWrap(vb, s, 'deck', `data-deck="${esc(d.id)}"`);
}

export function roomLayout(db, roomId, I = indexDb(db)) {
  const r = I.roomById.get(roomId);
  if (!r) return svgWrap([0, 0, 10, 10], '', 'room');
  const [x0, x1, y0, y1, z0, z1] = r.box;
  const w = x1 - x0, hh = y1 - y0;
  const u = Math.max(w, hh) / 120 + 0.02;
  const pad = 6 * u;
  const vb = [x0 - pad, -y1 - pad - 4 * u, w + 2 * pad, hh + 2 * pad + 22 * u];
  let s = `<rect x="${f(vb[0])}" y="${f(vb[1])}" width="${f(vb[2])}" height="${f(vb[3])}" fill="#f3f1ea" />`;
  // 1 m grid
  for (let x = Math.ceil(x0); x <= x1; x++) s += `<line class="grid" x1="${f(x)}" y1="${f(-y1)}" x2="${f(x)}" y2="${f(-y0)}" />`;
  for (let y = Math.ceil(y0); y <= y1; y++) s += `<line class="grid" x1="${f(x0)}" y1="${f(-y)}" x2="${f(x1)}" y2="${f(-y)}" />`;
  s += `<rect class="room" data-id="${esc(r.id)}" data-kind="room" x="${f(x0)}" y="${f(-y1)}" width="${f(w)}" height="${f(hh)}" style="fill:none"><title>${esc(r.name)}</title></rect>`;
  const comps = I.compsByRoom.get(r.id) || [];
  for (const c of comps) s += compRectPlan(c, I, u, true);
  // cable route segments that run inside this room (both ends inside the room volume)
  const inRoom = (p) => p[0] >= x0 - 0.3 && p[0] <= x1 + 0.3 && p[1] >= y0 - 0.3 && p[1] <= y1 + 0.3 && p[2] >= z0 - 0.3 && p[2] <= z1 + 0.3;
  for (const k of db.cables || []) {
    const rt = k.route || [];
    let segs = '';
    for (let i = 1; i < rt.length; i++) if (inRoom(rt[i - 1]) && inRoom(rt[i])) segs += `M${f(rt[i - 1][0])},${f(-rt[i - 1][1])}L${f(rt[i][0])},${f(-rt[i][1])}`;
    if (segs) s += `<path class="cable" data-cable="${esc(k.id)}" data-sys="${esc((k.systems || []).join(' '))}" d="${segs}"><title>${esc(k.id + ' ' + (k.kind || '') + ' ' + (k.protocol || ''))}</title></path>`;
  }
  for (const a of r.access || []) {
    const [ax, ay] = a.pos;
    s += `<g class="access-g"><rect class="access" x="${f(ax - 0.45)}" y="${f(-ay - 0.45)}" width="0.9" height="0.9"><title>${esc(a.kind + ' to ' + (a.to || ''))}</title></rect><text x="${f(ax)}" y="${f(-ay - 0.7)}" font-size="${f(Math.max(0.3, 1.2 * u))}" text-anchor="middle" fill="#2f6e46">${esc(a.kind)}</text></g>`;
  }
  // dimensions
  s += `<line class="dim" x1="${f(x0)}" y1="${f(-y0 + 1.8 * u)}" x2="${f(x1)}" y2="${f(-y0 + 1.8 * u)}" /><text x="${f((x0 + x1) / 2)}" y="${f(-y0 + 3.6 * u)}" font-size="${f(1.5 * u)}" text-anchor="middle">${f(w)} m (x ${f(x0)} to ${f(x1)})</text>`;
  s += `<text x="${f(x0 - 1.2 * u)}" y="${f(-(y0 + y1) / 2)}" font-size="${f(1.5 * u)}" text-anchor="middle" transform="rotate(-90 ${f(x0 - 1.2 * u)} ${f(-(y0 + y1) / 2)})">${f(hh)} m</text>`;
  s += `<text x="${f(x0)}" y="${f(-y1 - 1.6 * u)}" font-size="${f(1.9 * u)}" font-weight="600">${esc(r.name)}  (deck z ${f(z0)} m, clear height ${f(z1 - z0)} m)</text>`;
  s += `<text x="${f(x1)}" y="${f(-y1 - 1.6 * u)}" font-size="${f(1.3 * u)}" text-anchor="end">Port up, bow right. Blue edge: operating face. Green: access.</text>`;
  s += titleBlock(db, `${VIEW_TITLES.room}: ${r.name}`, 'ADT-2D-R-' + r.id.replace(/^R_/, ''), vb[0] + vb[2] - 1 * u, vb[1] + vb[3] - 1 * u, u);
  return svgWrap(vb, s, 'room', `data-room="${esc(r.id)}"`);
}

// Distribution of one system: profile (top) and main-deck plan (bottom) with its rooms, equipment and cables.
export function distribution(db, systemId, I = indexDb(db)) {
  const sys = I.sysById.get(systemId) || db.systems[0];
  const v = db.vessel; const L = v.loa || 300; const B = v.beam || 52; const D = v.depth || 28;
  let top = D + 20;
  for (const t of db.topsides || []) top = Math.max(top, t.box[5]);
  const u = L / 300 * 1.2;
  const pad = 12 * u;
  const gap = 14 * u;
  const planY = 0 + gap + B / 2; // plan centreline offset below the profile baseline
  const vb = [-pad, -top - pad, L + 2 * pad, top + gap + B + 2 * pad + 26 * u];
  const comps = db.components.filter((c) => I.sysOfComp(c).includes(sys.id));
  const rooms = new Set([...(sys.rooms || []), ...comps.map((c) => c.room)]);
  let s = `<rect x="${f(vb[0])}" y="${f(vb[1])}" width="${f(vb[2])}" height="${f(vb[3])}" fill="#f3f1ea" />`;
  s += `<polygon class="hull" points="${profPts(hullProfileOutline(v))}" />`;
  for (const d of v.decks || []) { const [a, b] = d.x_range || [0, L]; s += `<line class="deckline" x1="${f(a)}" y1="${f(-d.z)}" x2="${f(b)}" y2="${f(-d.z)}" />`; }
  for (const t of db.topsides || []) s += `<rect class="ts" x="${f(t.box[0])}" y="${f(-t.box[5])}" width="${f(t.box[1] - t.box[0])}" height="${f(t.box[5] - t.box[4])}" />`;
  for (const r of db.rooms) if (rooms.has(r.id)) s += roomRectProfile(r, I, u);
  for (const c of comps) s += compRectProfile(c, I);
  // plan below
  s += `<g transform="translate(0,${f(planY)})"><polygon class="hull" points="${planPts(hullPlanOutline(v, D))}" />`;
  for (const r of db.rooms) if (rooms.has(r.id)) s += roomRectPlan(r, I, u, false);
  for (const c of comps) s += compRectPlan(c, I, u, false);
  for (const k of db.cables || []) {
    if (!(k.systems || []).includes(sys.id) || !(k.route || []).length) continue;
    s += `<polyline class="cable" data-cable="${esc(k.id)}" points="${k.route.map((p) => `${f(p[0])},${f(-p[1])}`).join(' ')}"><title>${esc(k.id)}</title></polyline>`;
  }
  s += '</g>';
  for (const k of db.cables || []) {
    if (!(k.systems || []).includes(sys.id) || !(k.route || []).length) continue;
    s += `<polyline class="cable" data-cable="${esc(k.id)}" points="${k.route.map((p) => `${f(p[0])},${f(-p[2])}`).join(' ')}" />`;
  }
  const p = primaryPos(db, I, sys);
  s += marker(sys, p[0], -(p[2] + 2.2 * u), 1.9 * u, 'sel');
  s += `<text x="0" y="${f(-top - 4 * u)}" font-size="${f(2.1 * u)}" font-weight="600">${esc(sys.number + '. ' + sys.name)}</text>`;
  s += `<text x="0" y="${f(-top - 1.4 * u)}" font-size="${f(1.4 * u)}">${comps.length} equipment items in ${rooms.size} room(s): ${esc([...rooms].map((id) => (I.roomById.get(id) || {}).name || id).join(', '))}. Top: profile. Bottom: plan. Dashed red: cable routes.</text>`;
  s += titleBlock(db, `${VIEW_TITLES.distribution}: ${sys.short || sys.name}`, 'ADT-2D-S' + String(sys.number).padStart(2, '0'), vb[0] + vb[2] - 1 * u, vb[1] + vb[3] - 1 * u, u);
  return svgWrap(vb, s, 'distribution', `data-system="${esc(sys.id)}"`);
}

export function renderView(db, view, { deckId, roomId, systemId } = {}, I = indexDb(db)) {
  switch (view) {
    case 'ga': return gaPlan(db, I);
    case 'profile': return profile(db, I);
    case 'deck': return deckPlan(db, deckId || (db.vessel.decks || [])[0].id, I);
    case 'room': return roomLayout(db, roomId || db.rooms[0].id, I);
    case 'distribution': return distribution(db, systemId || db.systems[0].id, I);
    default: return gaPlan(db, I);
  }
}
