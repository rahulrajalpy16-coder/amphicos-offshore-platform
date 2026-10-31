#!/usr/bin/env node
// Validator for src/data/fpso_db.json (the single authoritative engineering database).
// Plain Node 22, no dependencies. Run from the project root: node tools/validate_db.mjs [path]
// Exits 1 on any error. Warnings do not fail the run.
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dbPath = resolve(process.argv[2] || join(here, '..', 'src', 'data', 'fpso_db.json'))
const raw = readFileSync(dbPath, 'utf8')
const db = JSON.parse(raw)

const errors = []
const warnings = []
const err = (m) => errors.push(m)
const warn = (m) => warnings.push(m)
const EPS = 1e-6

// ---------------- brief system names (em dash written as spaced hyphen, house style) ----------------
const BRIEF = [
  'DG Control Retrofit and Upgradation from Legacy / Obsolete Systems',
  'Power Management System Upgradation',
  'MV Relays - Testing, Calibration and Upgradation',
  'Drives and Pump Controls',
  'ICSS - Integrated Control and Safety System',
  'PAGA - Public Address and General Alarm System',
  'PABX System',
  'IPTV System',
  'CCTV System',
  'Boiler Control System Retrofits and Upgradations',
  'IGG - Inert Gas Generator Control System Retrofits and Upgradations',
  'DG Local Control Panels',
  'OMD - Oil Mist Detection Sensors',
  'DG AVR Controls Retrofit Solutions',
  'DG Governor Controls Retrofit Solutions',
]
const HMI_MODULES = ['pms', 'dgctrl', 'relay', 'drives', 'icss', 'paga', 'pabx', 'iptv', 'cctv', 'boiler', 'igg', 'dglocal', 'omd', 'avr', 'governor']
const TYPES = new Set(('diesel_generator_set alternator engine_local_panel oil_mist_detector_head oil_mist_detector_unit avr_unit governor_actuator speed_controller_cabinet ' +
  'mv_switchboard_panel lv_switchboard_panel protection_relay_ied generator_control_panel pms_cabinet synchroniser_panel ' +
  'vfd_cabinet mcc_lineup pump_motor transformer ups_cabinet battery_rack ' +
  'operator_console workstation_desk large_display_wall control_cabinet marshalling_cabinet safety_controller_cabinet field_junction_box ' +
  'telecom_rack_19in paga_amplifier_rack paga_access_panel loudspeaker_horn loudspeaker_ceiling alarm_beacon pabx_rack telephone_industrial telephone_desk ' +
  'iptv_headend_rack tv_display satellite_antenna_dome cctv_camera_fixed cctv_camera_ptz nvr_rack cctv_monitor_desk ' +
  'marine_boiler boiler_burner_unit boiler_control_panel flame_scanner drum_level_transmitter ' +
  'igg_generator_unit igg_scrubber_tower igg_blower igg_control_panel o2_analyser_cabinet deck_water_seal igg_deck_valve ' +
  'field_transmitter cable_tray ladder_stair generic_cabinet').split(/\s+/))
// types that have an operating face needing front access clearance (floor/wall standing only)
const CLEARANCE_TYPES = new Set(['engine_local_panel', 'oil_mist_detector_unit', 'speed_controller_cabinet', 'mv_switchboard_panel', 'lv_switchboard_panel', 'generator_control_panel', 'pms_cabinet',
  'synchroniser_panel', 'vfd_cabinet', 'mcc_lineup', 'transformer', 'ups_cabinet', 'battery_rack', 'operator_console', 'workstation_desk', 'large_display_wall', 'control_cabinet', 'marshalling_cabinet',
  'safety_controller_cabinet', 'field_junction_box', 'telecom_rack_19in', 'paga_amplifier_rack', 'paga_access_panel', 'pabx_rack', 'iptv_headend_rack', 'nvr_rack', 'cctv_monitor_desk',
  'boiler_control_panel', 'igg_control_panel', 'o2_analyser_cabinet', 'generic_cabinet'])
const CLEARANCE = 0.8
const FACINGS = new Set(['+x', '-x', '+y', '-y'])
const ABOVE_DECK_KINDS = new Set(['accommodation', 'bridge', 'deckhouse', 'deck_area', 'module', 'turret', 'offloading_reel', 'antenna_mast', 'helideck'])

// ---------------- helpers ----------------
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
function need(obj, fields, where) {
  for (const f of fields) if (!(f in obj) || obj[f] === undefined) err(`${where}: missing required field '${f}'`)
}
function isBox(b) { return Array.isArray(b) && b.length === 6 && b.every(isNum) && b[0] < b[1] && b[2] < b[3] && b[4] < b[5] }
function compBox(c) {
  const [x, y, z] = c.pos, [lx, wy, hz] = c.size
  return [x - lx / 2, x + lx / 2, y - wy / 2, y + wy / 2, z, z + hz]
}
function inside(inner, outer, tol = 1e-3) {
  return inner[0] >= outer[0] - tol && inner[1] <= outer[1] + tol && inner[2] >= outer[2] - tol && inner[3] <= outer[3] + tol && inner[4] >= outer[4] - tol && inner[5] <= outer[5] + tol
}
function overlap(a, b, tol = 1e-3) {
  return a[0] < b[1] - tol && b[0] < a[1] - tol && a[2] < b[3] - tol && b[2] < a[3] - tol && a[4] < b[5] - tol && b[4] < a[5] - tol
}
function ptInBox(p, b, tol = 1e-3) { return p[0] >= b[0] - tol && p[0] <= b[1] + tol && p[1] >= b[2] - tol && p[1] <= b[3] + tol && p[2] >= b[4] - tol && p[2] <= b[5] + tol }
function distPtBox(p, b) {
  const dx = Math.max(b[0] - p[0], 0, p[0] - b[1]), dy = Math.max(b[2] - p[1], 0, p[1] - b[3]), dz = Math.max(b[4] - p[2], 0, p[2] - b[5])
  return Math.hypot(dx, dy, dz)
}
function clearanceBox(c) {
  const b = compBox(c)
  switch (c.facing) {
    case '+x': return [b[1], b[1] + CLEARANCE, b[2], b[3], b[4], b[5]]
    case '-x': return [b[0] - CLEARANCE, b[0], b[2], b[3], b[4], b[5]]
    case '+y': return [b[0], b[1], b[3], b[3] + CLEARANCE, b[4], b[5]]
    case '-y': return [b[0], b[1], b[2] - CLEARANCE, b[2], b[4], b[5]]
  }
  return null
}

// ---------------- hull ----------------
const hull = db.vessel?.hull_offsets
function hullHalfBreadth(x, z) {
  const zl = hull.z_levels, st = hull.stations
  if (x < st[0].x || x > st[st.length - 1].x || z < 0 || z > zl[zl.length - 1] + 1e-6) return 0
  let i = 0
  while (i < st.length - 2 && x > st[i + 1].x) i++
  const a = st[i], b = st[i + 1]
  const t = (x - a.x) / (b.x - a.x)
  const hz = (s) => {
    if (z < (s.keel_z || 0) - 1e-9) return 0
    for (let j = 0; j < zl.length - 1; j++) if (z >= zl[j] && z <= zl[j + 1]) {
      const u = (z - zl[j]) / (zl[j + 1] - zl[j])
      return s.half_breadth[j] + u * (s.half_breadth[j + 1] - s.half_breadth[j])
    }
    return 0
  }
  const ha = hz(a), hb = hz(b)
  if (ha === 0 || hb === 0) return 0
  return ha + t * (hb - ha)
}
function boxInsideHull(b) {
  const zTop = Math.min(b[5], db.vessel.depth)
  const zs = [b[4], (b[4] + zTop) / 2, zTop]
  const yMax = Math.max(Math.abs(b[2]), Math.abs(b[3]))
  for (let x = b[0]; x <= b[1] + 1e-9; x += Math.max(0.25, (b[1] - b[0]) / 200)) {
    for (const z of zs) {
      const hbv = hullHalfBreadth(x, z)
      if (hbv + 1e-6 < yMax) return { ok: false, x, z, hb: hbv, yMax }
    }
  }
  return { ok: true }
}

// ---------------- 1. top level and schema ----------------
need(db, ['meta', 'vessel', 'topsides', 'rooms', 'systems', 'components', 'cables', 'electrical', 'assumptions', 'deviations_from_reference'], 'root')
need(db.meta || {}, ['title', 'version', 'date', 'disclaimer', 'coordinate_system', 'units', 'basis_doc'], 'meta')
const v = db.vessel || {}
need(v, ['loa', 'lpp', 'beam', 'depth', 'design_draft', 'operating_draft', 'hull_offsets', 'bulwark_height', 'sheer', 'camber', 'decks', 'bulkheads', 'zones'], 'vessel')
if (v.loa !== 300 || v.beam !== 52 || v.depth !== 28) err(`vessel principal dimensions must be 300 x 52 x 28 (got ${v.loa} x ${v.beam} x ${v.depth})`)
if (v.sheer !== 0) err('vessel.sheer must be 0')
if (hull) {
  if (!Array.isArray(hull.z_levels) || hull.z_levels[0] !== 0 || hull.z_levels[hull.z_levels.length - 1] !== v.depth) err('hull_offsets.z_levels must run from 0 to depth')
  let px = -1
  for (const s of hull.stations || []) {
    need(s, ['x', 'half_breadth', 'keel_z'], `hull station x=${s.x}`)
    if (s.x <= px) err(`hull stations not strictly increasing at x=${s.x}`)
    px = s.x
    if (!Array.isArray(s.half_breadth) || s.half_breadth.length !== hull.z_levels.length) err(`hull station x=${s.x}: half_breadth length must equal z_levels length`)
    if (s.half_breadth.some((h) => h > v.beam / 2 + EPS)) err(`hull station x=${s.x}: half breadth exceeds beam/2`)
  }
  if (hull.stations[0].x !== 0 || hull.stations[hull.stations.length - 1].x !== v.loa) err('hull stations must start at x=0 and end at x=loa')
  const midHb = hullHalfBreadth(150, v.depth)
  if (Math.abs(midHb - v.beam / 2) > 0.01) err(`midship half breadth at deck ${midHb} != beam/2`)
} else err('vessel.hull_offsets missing')
for (const d of v.decks || []) need(d, ['id', 'name', 'z', 'x_range'], `deck ${d.id}`)
for (const b of v.bulkheads || []) need(b, ['id', 'name', 'x', 'kind'], `bulkhead ${b.id}`)
for (const z of v.zones || []) { need(z, ['id', 'name', 'kind', 'box'], `zone ${z.id}`); if (!isBox(z.box)) err(`zone ${z.id}: invalid box`) }
for (const t of db.topsides || []) { need(t, ['id', 'name', 'kind', 'box', 'details'], `topsides ${t.id}`); if (!isBox(t.box)) err(`topsides ${t.id}: invalid box`) }
const flare = (db.topsides || []).find((t) => t.kind === 'flare')
const accomTs = (db.topsides || []).find((t) => t.kind === 'accommodation')
if (flare && accomTs) {
  const sep = Math.max(flare.box[0] - accomTs.box[1], accomTs.box[0] - flare.box[1])
  if (sep < 150) err(`flare to accommodation horizontal separation only ${sep.toFixed(1)} m`)
}

// ---------------- 2. ids unique ----------------
const allIds = new Map()
function reg(id, where) {
  if (typeof id !== 'string' || !id) { err(`${where}: missing id`); return }
  if (allIds.has(id)) err(`duplicate id '${id}' (${where} and ${allIds.get(id)})`)
  else allIds.set(id, where)
}
for (const d of v.decks || []) reg(d.id, 'deck')
for (const b of v.bulkheads || []) reg(b.id, 'bulkhead')
for (const z of v.zones || []) reg(z.id, 'zone')
for (const t of db.topsides || []) reg(t.id, 'topsides')
for (const r of db.rooms || []) reg(r.id, 'room')
for (const s of db.systems || []) reg(s.id, 'system')
for (const c of db.components || []) reg(c.id, 'component')
for (const k of db.cables || []) reg(k.id, 'cable')
const el = db.electrical || {}
for (const g of el.generators || []) reg(g.id, 'generator')
for (const b of el.buses || []) reg(b.id, 'bus')
for (const b of el.breakers || []) reg(b.id, 'breaker')
for (const f of el.feeders || []) reg(f.id, 'feeder')
for (const a of db.assumptions || []) reg(a.id, 'assumption')
for (const d of db.deviations_from_reference || []) reg(d.id, 'deviation')

const deckMap = new Map((v.decks || []).map((d) => [d.id, d]))
const zoneMap = new Map((v.zones || []).map((z) => [z.id, z]))
const roomMap = new Map((db.rooms || []).map((r) => [r.id, r]))
const compMap = new Map((db.components || []).map((c) => [c.id, c]))
const sysMap = new Map((db.systems || []).map((s) => [s.id, s]))

// ---------------- 3. rooms ----------------
for (const r of db.rooms || []) {
  const w = `room ${r.id}`
  need(r, ['id', 'name', 'deck', 'box', 'zone', 'purpose', 'access', 'fire_zone', 'hazardous_area', 'camera'], w)
  if (!isBox(r.box)) { err(`${w}: invalid box`); continue }
  const dk = deckMap.get(r.deck)
  if (!dk) err(`${w}: deck '${r.deck}' not found`)
  else {
    if (Math.abs(dk.z - r.box[4]) > 0.01) err(`${w}: floor z ${r.box[4]} != deck ${dk.id} z ${dk.z}`)
    if (r.box[0] < dk.x_range[0] - 0.01 || r.box[1] > dk.x_range[1] + 0.01) err(`${w}: x extent outside deck ${dk.id} x_range`)
  }
  if (!zoneMap.has(r.zone)) err(`${w}: zone '${r.zone}' not found`)
  const deckZ = v.depth
  if (r.box[4] >= deckZ - 0.01) {
    const host = (db.topsides || []).find((t) => ABOVE_DECK_KINDS.has(t.kind) && inside(r.box, t.box))
    if (!host) err(`${w}: above main deck but not inside an accommodation/deckhouse/topsides box`)
    const foot = [r.box[0], r.box[1], r.box[2], r.box[3], deckZ - 0.001, deckZ]
    const hc = boxInsideHull(foot)
    if (!hc.ok) err(`${w}: footprint outside deck outline at x=${hc.x.toFixed(2)} (half breadth ${hc.hb.toFixed(2)} < ${hc.yMax})`)
  } else {
    if (r.box[5] > deckZ + 0.01) err(`${w}: hull room extends above main deck`)
    const hc = boxInsideHull(r.box)
    if (!hc.ok) err(`${w}: outside hull at x=${hc.x.toFixed(2)} z=${hc.z.toFixed(2)} (half breadth ${hc.hb.toFixed(2)} < ${hc.yMax})`)
  }
  if (!Array.isArray(r.access) || r.access.length === 0) err(`${w}: no access defined`)
  for (const a of r.access || []) {
    need(a, ['kind', 'pos', 'to'], `${w} access`)
    if (!['door', 'hatch', 'stair', 'ladder'].includes(a.kind)) err(`${w}: access kind '${a.kind}' invalid`)
    if (!Array.isArray(a.pos) || distPtBox(a.pos, r.box) > 0.5) err(`${w}: access position ${JSON.stringify(a.pos)} not on the room boundary`)
    if (!(roomMap.has(a.to) || deckMap.has(a.to) || a.to === 'corridor')) err(`${w}: access target '${a.to}' does not resolve`)
  }
  const cam = r.camera || {}
  if (!Array.isArray(cam.overview_eye) || !Array.isArray(cam.overview_target)) err(`${w}: camera eye/target missing`)
  else {
    if (!ptInBox(cam.overview_eye, r.box)) err(`${w}: camera eye outside the room`)
    if (!ptInBox(cam.overview_target, r.box)) err(`${w}: camera target outside the room`)
  }
}
const roomsArr = db.rooms || []
for (let i = 0; i < roomsArr.length; i++) for (let j = i + 1; j < roomsArr.length; j++) {
  if (isBox(roomsArr[i].box) && isBox(roomsArr[j].box) && overlap(roomsArr[i].box, roomsArr[j].box)) err(`rooms overlap: ${roomsArr[i].id} and ${roomsArr[j].id}`)
}
// machinery rooms must not overlap cargo/slop zones
for (const r of roomsArr) for (const z of v.zones || []) {
  if (['cargo', 'slop'].includes(z.kind) && overlap(r.box, z.box)) err(`room ${r.id} overlaps ${z.kind} zone ${z.id}`)
}

// ---------------- 4. systems ----------------
const systems = db.systems || []
if (systems.length !== 15) err(`expected exactly 15 systems, found ${systems.length}`)
systems.forEach((s, i) => {
  const w = `system ${s.id}`
  need(s, ['id', 'number', 'name', 'short', 'commercial_group', 'color', 'summary', 'function', 'operating_principle', 'primary_room', 'rooms', 'components', 'primary_component', 'hmi',
    'measurements', 'alarms', 'states', 'interfaces', 'legacy', 'retrofit', 'demo_scenarios', 'references'], w)
  const expId = `S${String(i + 1).padStart(2, '0')}`
  if (s.id !== expId) err(`${w}: expected id ${expId} at position ${i + 1}`)
  if (s.number !== i + 1) err(`${w}: number ${s.number} != ${i + 1}`)
  if (s.name !== BRIEF[i]) err(`${w}: name '${s.name}' does not match brief '${BRIEF[i]}'`)
  if (!Array.isArray(s.components) || s.components.length < 1) err(`${w}: needs at least one component`)
  if (!s.hmi || !HMI_MODULES.includes(s.hmi.module)) err(`${w}: hmi.module missing or invalid`)
  else if (HMI_MODULES.indexOf(s.hmi.module) !== [1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14][i]) warn(`${w}: hmi.module '${s.hmi.module}' not the conventional module for this system`)
  for (const h of s.hmi?.host_components || []) if (!compMap.has(h)) err(`${w}: hmi host '${h}' not found`)
  if (!roomMap.has(s.primary_room)) err(`${w}: primary_room '${s.primary_room}' not found`)
  for (const r of s.rooms || []) if (!roomMap.has(r)) err(`${w}: room '${r}' not found`)
  if (!s.components.includes(s.primary_component)) err(`${w}: primary_component not in components list`)
  for (const cid of s.components || []) {
    const c = compMap.get(cid)
    if (!c) { err(`${w}: component '${cid}' not found`); continue }
    if (c.system !== s.id && !(c.also_systems || []).includes(s.id)) err(`${w}: component ${cid} lists neither system nor also_systems = ${s.id}`)
    if (!(s.rooms || []).includes(c.room)) err(`${w}: component ${cid} room ${c.room} missing from system rooms`)
  }
  const pc = compMap.get(s.primary_component)
  if (pc && pc.room !== s.primary_room) err(`${w}: primary_component is not in primary_room`)
  for (const m of s.measurements || []) need(m, ['tag', 'name', 'unit', 'normal', 'alarm', 'trip', 'basis'], `${w} measurement ${m.tag}`)
  for (const a of s.alarms || []) need(a, ['code', 'text', 'severity', 'cause', 'response'], `${w} alarm ${a.code}`)
  for (const it of s.interfaces || []) need(it, ['to', 'signal', 'medium'], `${w} interface`)
  need(s.legacy || {}, ['typical_condition', 'limitations', 'obsolescence_note'], `${w} legacy`)
  need(s.retrofit || {}, ['scope', 'upgraded_equipment', 'functional_improvements', 'integration', 'post_upgrade_operation', 'typical_sequence'], `${w} retrofit`)
  if (!(s.legacy?.limitations?.length > 0)) err(`${w}: legacy.limitations empty`)
  if (!(s.retrofit?.scope?.length > 0)) err(`${w}: retrofit.scope empty`)
  if (!(s.demo_scenarios?.length > 0)) err(`${w}: no demo scenarios`)
  for (const r of s.references || []) if (!/^(VERIFIED|UNVERIFIED)( \(.+\))?$/.test(r.status || '')) err(`${w}: reference status must be VERIFIED or UNVERIFIED, optionally with a qualifier in brackets`)
  // unsupported performance claims: no percentages in improvements
  for (const t of s.retrofit?.functional_improvements || []) if (/\d+\s*%/.test(t)) err(`${w}: numeric performance claim in functional_improvements: '${t}'`)
})
for (const c of db.components || []) {
  if (c.system !== 'CTX' && !sysMap.has(c.system)) err(`component ${c.id}: system '${c.system}' not found`)
  for (const a of c.also_systems || []) if (!sysMap.has(a)) err(`component ${c.id}: also_systems '${a}' not found`)
  const listed = systems.filter((s) => s.components.includes(c.id)).map((s) => s.id)
  const expect = [c.system, ...(c.also_systems || [])].filter((x) => x !== 'CTX')
  for (const e of expect) if (!listed.includes(e)) err(`component ${c.id} not listed in system ${e}.components`)
}

// ---------------- 5. components ----------------
for (const c of db.components || []) {
  const w = `component ${c.id}`
  need(c, ['id', 'system', 'also_systems', 'name', 'tag', 'type', 'room', 'pos', 'size', 'facing', 'mounted_on', 'parent_group', 'description', 'inspection', 'hmi', 'display', 'variant', 'params'], w)
  if (!TYPES.has(c.type)) err(`${w}: unknown type '${c.type}'`)
  if (!FACINGS.has(c.facing)) err(`${w}: invalid facing '${c.facing}'`)
  if (!['legacy', 'retrofit', 'both'].includes(c.variant)) err(`${w}: invalid variant`)
  if (!Array.isArray(c.pos) || c.pos.length !== 3 || !c.pos.every(isNum)) { err(`${w}: invalid pos`); continue }
  if (!Array.isArray(c.size) || c.size.length !== 3 || !c.size.every((s) => isNum(s) && s > 0)) { err(`${w}: invalid size`); continue }
  const r = roomMap.get(c.room)
  if (!r) { err(`${w}: room '${c.room}' not found`); continue }
  const b = compBox(c)
  if (!inside(b, r.box)) err(`${w}: outside room ${r.id} (box ${b.map((x) => x.toFixed(2)).join(',')})`)
  if (c.mounted_on) {
    const h = compMap.get(c.mounted_on)
    if (!h) err(`${w}: mounted_on '${c.mounted_on}' not found`)
    else {
      if (h.room !== c.room) err(`${w}: mounted_on host in a different room`)
      const hb = compBox(h)
      // mounted item must touch or overlap its host (gap <= 0.05 m on every axis)
      const gap = Math.max(hb[0] - b[1], b[0] - hb[1], hb[2] - b[3], b[2] - hb[3], hb[4] - b[5], b[4] - hb[5])
      if (gap > 0.05) err(`${w}: not on its host ${h.id} (gap ${gap.toFixed(2)} m)`)
    }
  }
  if (c.hmi !== true && c.hmi !== false) err(`${w}: hmi must be boolean`)
}
// intersections within rooms
const byRoom = new Map()
for (const c of db.components || []) { if (!byRoom.has(c.room)) byRoom.set(c.room, []); byRoom.get(c.room).push(c) }
const related = (a, b) => a.mounted_on === b.id || b.mounted_on === a.id || (a.mounted_on && a.mounted_on === b.mounted_on) ||
  (a.mounted_on && compMap.get(a.mounted_on)?.mounted_on === b.id) || (b.mounted_on && compMap.get(b.mounted_on)?.mounted_on === a.id)
for (const [rid, list] of byRoom) {
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j]
    if (related(a, b)) continue
    if (a.mounted_on && b.mounted_on && overlap(compBox(a), compBox(b))) { err(`components intersect: ${a.id} and ${b.id} (both mounted)`); continue }
    if (overlap(compBox(a), compBox(b))) err(`components intersect in ${rid}: ${a.id} and ${b.id}`)
  }
  // front access clearance
  for (const c of list) {
    if (!CLEARANCE_TYPES.has(c.type) || c.mounted_on) continue
    const cb = clearanceBox(c)
    const r = roomMap.get(rid)
    if (!inside(cb, r.box)) { err(`clearance: ${c.id} front (${c.facing}) has less than ${CLEARANCE} m inside room ${rid}`); continue }
    for (const o of list) {
      if (o.id === c.id || o.mounted_on === c.id) continue
      if (overlap(cb, compBox(o))) err(`clearance: ${o.id} obstructs the ${CLEARANCE} m front access of ${c.id}`)
    }
  }
}
// camera: eye high in the room, clear of equipment, clear sight line to the target
function segHitsBox(p, q, b) {
  let t0 = 0, t1 = 1
  for (let i = 0; i < 3; i++) {
    const d = q[i] - p[i], lo = b[2 * i], hi = b[2 * i + 1]
    if (Math.abs(d) < 1e-9) { if (p[i] <= lo || p[i] >= hi) return false; continue }
    let a = (lo - p[i]) / d, c = (hi - p[i]) / d
    if (a > c) [a, c] = [c, a]
    t0 = Math.max(t0, a); t1 = Math.min(t1, c)
    if (t0 >= t1) return false
  }
  return true
}
for (const r of roomsArr) {
  const cam = r.camera || {}
  if (!Array.isArray(cam.overview_eye) || !Array.isArray(cam.overview_target)) continue
  const H = r.box[5] - r.box[4], below = r.box[5] - cam.overview_eye[2]
  const maxBelow = H < 12 ? 0.8 : 1.0
  if (below < 0.3 - 1e-6 || below > maxBelow + 1e-6) err(`room ${r.id}: camera eye ${below.toFixed(2)} m below deckhead (expected 0.3 to ${maxBelow} m)`)
  for (const c of byRoom.get(r.id) || []) {
    const b = compBox(c)
    if (distPtBox(cam.overview_eye, b) < 0.3) err(`room ${r.id}: camera eye within 0.3 m of ${c.id}`)
    if (segHitsBox(cam.overview_eye, cam.overview_target, b)) err(`room ${r.id}: camera sight line to target passes through ${c.id}`)
  }
}
// camera eye not inside equipment
for (const r of roomsArr) for (const c of byRoom.get(r.id) || []) if (r.camera?.overview_eye && ptInBox(r.camera.overview_eye, compBox(c), -1e-3)) err(`room ${r.id}: camera eye inside component ${c.id}`)

// ---------------- 5b. per-system arrival viewpoints (systems[].arrival) ----------------
// Every system has an arrival viewpoint in its primary installation room, so that on arrival the visitor sees the
// system's own key items (primary_components) from the front. Checks per arrival: eye inside the room box (0.3 m
// wall margin), 0.3 to 0.8 m below the deckhead (1.0 m in open areas) or, in rooms 8 m or more high, anywhere from
// 2.0 m above the floor to 0.3 m below the deckhead; eye at least
// 0.3 m from every component box and 0.25 m from every room fitting; for each primary component: in the room and
// belonging to the system (system or also_systems), operating face toward the eye (at most 75 deg from the face normal; 75 to 85 deg only with
// "GRAZING ACCEPTED: <reason>" in the note),
// sight lines from the eye to the box centre and to the front-face centre not blocked by any other component box
// or room fitting (the component's own host and mounted items excepted), and all 8 box corners inside the central
// 80 % of a 1.05 aspect frame at 70 deg vertical FOV (the free area between the app's side panels); target at least
// 0.2 m inside the room box (src/camera/director.js clamps the orbit target to that box). The visible
// fraction is the share of a 5 x 5 grid on the front face that is both unblocked and inside that safe frame.
// >>> arrival-geometry (shared with the arrival viewpoint check below)
// Room fittings model: a plain port of the fittings built by src/scene/rooms.js (luminaires and hangers, cable
// trays and hangers, HVAC duct and diffusers, ER crane rails, girder and hoist, wall pipes, brackets and flanges,
// corner vent trunks, skirting, doors, hatches, stairs, ladders, extinguisher). The scene works in the Three.js
// world frame (x = ship.x - 150, y = ship.z - T, z = -ship.y); boxes are built in that frame exactly as in
// rooms.js, including the keep-out rule that drops fittings within 0.35 m of a database component, and are then
// converted back to the ship frame. Cylinders between two points are kept as capsules (segment + radius).
// If rooms.js changes, this port must be updated with it.
const AX_OFF = 150
const AT = Number(v.operating_draft) || 16
function roomKindPort(r, zone) {
  const s = `${r.id} ${r.name} ${r.purpose || ''} ${r.kind || ''}`.toLowerCase()
  const name = `${r.name}`.toLowerCase()
  const openZone = zone && ['open_deck', 'topsides', 'turret'].includes(zone.kind) && r.box[4] >= 27.9
  if (r.open || /open area|open deck|weather deck|platform|offloading station|cargo deck|turret deck/.test(name) || (openZone && !/\broom\b/.test(name))) return 'open'
  if (/boiler|igg|inert gas|purifier|workshop/.test(s)) return 'plant'
  if (/wheelhouse|navigation bridge/.test(name)) return 'bridge'
  if (/engine room|emergency generator|pump room|steering/.test(name)) return 'er'
  if (/control room|ccr|ecr/.test(s)) return 'control'
  if (/mess|recreation|cabin|office|galley|hospital/.test(name)) return 'accom'
  if (/switchboard|msb|electrical|telecom|ups|battery|server|equipment room|instrument|cctv|radio|transformer|vfd|drive/.test(s)) return 'elec'
  if (zone && zone.kind === 'machinery') return 'er'
  return 'elec'
}
const fittingsCache = new Map()
function roomFittings(r) {
  if (fittingsCache.has(r.id)) return fittingsCache.get(r.id)
  const zone = (v.zones || []).find((z) => z.id === r.zone)
  const kind = roomKindPort(r, zone)
  const min = { x: r.box[0] - AX_OFF, y: r.box[4] - AT, z: -r.box[3] }, max = { x: r.box[1] - AX_OFF, y: r.box[5] - AT, z: -r.box[2] }
  const keep = (byRoom.get(r.id) || []).map((c) => {
    const b = compBox(c)
    return { min: [b[0] - AX_OFF - 0.35, b[4] - AT - 0.35, -b[3] - 0.35], max: [b[1] - AX_OFF + 0.35, b[5] - AT + 0.35, -b[2] + 0.35] }
  })
  const hitsKeep = (lo, hi) => keep.some((k) => !(hi[0] < k.min[0] || lo[0] > k.max[0] || hi[1] < k.min[1] || lo[1] > k.max[1] || hi[2] < k.min[2] || lo[2] > k.max[2]))
  const wb = [], wc = []
  const box = (x, y, z, w, h, d, filtered = true) => {
    const lo = [x - w / 2, y - h / 2, z - d / 2], hi = [x + w / 2, y + h / 2, z + d / 2]
    if (filtered && hitsKeep(lo, hi)) return
    wb.push([lo, hi])
  }
  const between = (a, b, rad, filtered = true) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    const n = filtered ? Math.max(1, Math.ceil(len / 3)) : 1
    for (let i = 0; i < n; i++) {
      const p0 = a.map((q, j) => q + (b[j] - q) * i / n), p1 = a.map((q, j) => q + (b[j] - q) * (i + 1) / n)
      const lo = [0, 1, 2].map((j) => Math.min(p0[j], p1[j]) - rad), hi = [0, 1, 2].map((j) => Math.max(p0[j], p1[j]) + rad)
      if (filtered && hitsKeep(lo, hi)) continue
      wc.push([p0, p1, rad])
    }
  }
  const cyl = (x, y, z, rad, len, axis) => box(x, y, z, axis === 'x' ? len : 2 * rad, axis === 'y' ? len : 2 * rad, axis === 'z' ? len : 2 * rad, false)
  const sx = max.x - min.x, sy = max.y - min.y, sz = max.z - min.z
  const cx = (min.x + max.x) / 2, cz = (min.z + max.z) / 2
  const along = sx >= sz ? 'x' : 'z'
  const len = along === 'x' ? sx : sz, wid = along === 'x' ? sz : sx
  const P = (a, y, b) => along === 'x' ? [cx + a, y, cz + b] : [cx + b, y, cz + a]
  const dimsAB = (a, b) => along === 'x' ? [a, b] : [b, a]
  const clamp = (q, lo, hi) => Math.max(lo, Math.min(hi, q))
  const TW = 0.12
  if (kind !== 'open') {
    for (const [x, z, w, d] of [[cx, min.z + 0.02, sx, 0.04], [cx, max.z - 0.02, sx, 0.04], [min.x + 0.02, cz, 0.04, sz], [max.x - 0.02, cz, 0.04, sz]]) box(x, min.y + 0.075, z, w, 0.15, d)
    const ly = max.y - (kind === 'er' ? 0.45 : 0.06)
    const nl = Math.max(1, Math.round(len / (kind === 'er' ? 4.5 : 3)))
    const nw = Math.max(1, Math.round(wid / (kind === 'er' ? 5 : 3)))
    for (let i = 0; i < nl; i++) for (let j = 0; j < nw; j++) {
      const a = -len / 2 + (i + 0.5) * len / nl, b = -wid / 2 + (j + 0.5) * wid / nw
      const [w, d] = dimsAB(1.25, 0.22)
      box(...P(a, ly, b), w, 0.08, d)
      box(...P(a, ly - 0.045, b), w * 0.92, 0.01, d * 0.7)
      if (kind === 'er') between(P(a, ly, b), P(a, max.y, b), 0.012)
    }
    const ty = max.y - (kind === 'er' ? 0.9 : 0.35)
    for (const off of [-wid * 0.22, wid * 0.22]) {
      const [w, d] = dimsAB(len - 0.4, 0.6)
      const p0 = P(0, ty, off)
      box(p0[0], p0[1] - 0.05, p0[2], w, 0.01, d)
      for (const e of [-0.3, 0.3]) { const pe = P(0, ty, off + e); const [ew, ed] = dimsAB(len - 0.4, 0.02); box(pe[0], pe[1], pe[2], ew, 0.1, ed) }
      const pc = P(0, ty, off)
      const [cw, cd] = dimsAB(len - 0.5, 0.48)
      box(pc[0], pc[1] - 0.025, pc[2], cw, 0.04, cd)
      for (let a = -len / 2 + 1; a < len / 2; a += 1.8) { const h0 = P(a, ty + 0.05, off); between([h0[0], ty - 0.05, h0[2]], [h0[0], max.y, h0[2]], 0.015) }
    }
    {
      const b = wid / 2 - 0.45
      const [w, d] = dimsAB(len - 0.3, 0.6)
      const p = P(0, max.y - 0.35, b)
      box(p[0], p[1], p[2], w, 0.4, d)
      for (let a = -len / 2 + 1.5; a < len / 2; a += 3) { const q = P(a, max.y - 0.56, b); box(q[0], q[1], q[2], 0.4, 0.02, 0.4) }
    }
    const acc0 = (r.access || [])[0]
    if (acc0) {
      const ap = { x: acc0.pos[0] - AX_OFF, y: acc0.pos[2] - AT, z: -acc0.pos[1] }
      const ex = clamp(ap.x + 1.2, min.x + 0.3, max.x - 0.3), ez = clamp(ap.z, min.z + 0.2, max.z - 0.2)
      cyl(ex, min.y + 0.35, ez, 0.09, 0.6, 'y'); cyl(ex, min.y + 0.7, ez, 0.03, 0.1, 'y')
    }
  }
  if (kind === 'er' || kind === 'plant') {
    const ry = max.y - 0.25
    for (const s of [-1, 1]) { const p = P(0, ry, s * (wid / 2 - 0.4)); const [rw, rd] = dimsAB(len - 0.2, 0.3); box(p[0], p[1], p[2], rw, 0.25, rd) }
    if (kind === 'er') {
      const g = P(len * 0.15, ry - 0.3, 0)
      const [gw, gd] = dimsAB(0.5, wid - 0.8)
      box(g[0], g[1], g[2], gw, 0.5, gd)
      const hst = P(len * 0.15, ry - 0.7, wid * 0.1)
      box(hst[0], hst[1], hst[2], 0.6, 0.5, 0.6)
      between([hst[0], hst[1] - 0.25, hst[2]], [hst[0], min.y + 3.5, hst[2]], 0.02)
      box(hst[0], min.y + 3.4, hst[2], 0.25, 0.3, 0.15)
    }
    const runs = [[0.12, 1.4], [0.09, 1.75], [0.06, 2.05], [0.07, 2.3], [0.1, 2.65], [0.05, 2.95], [0.08, 3.25]]
    for (const s of [-1, 1]) runs.forEach(([rr, h], k) => {
      if (min.y + h > max.y - 1.2) return
      const off = s * (wid / 2 - 0.18 - (k % 2) * 0.22)
      between(P(-len / 2 + 0.2, min.y + h, off), P(len / 2 - 0.2, min.y + h, off), rr)
      for (let a = -len / 2 + 1; a < len / 2; a += 3) box(...P(a, min.y + h - rr - 0.03, off), 0.06, 0.04, 0.3)
      for (let a = -len / 2 + 2.5; a < len / 2; a += 7) cyl(...P(a, min.y + h, off), rr * 1.7, 0.05, along === 'x' ? 'x' : 'z')
    })
    for (const [a, b] of [[-len / 2 + 0.7, -wid / 2 + 0.7], [len / 2 - 0.7, wid / 2 - 0.7]]) {
      const p = P(a, 0, b)
      box(p[0], (min.y + max.y) / 2 + 0.5, p[2], 0.9, sy - 1, 0.9)
      box(p[0] + 0.46, min.y + 1.5, p[2], 0.02, 0.6, 0.6)
    }
  }
  for (const acc of r.access || []) {
    const ap = { x: acc.pos[0] - AX_OFF, y: acc.pos[2] - AT, z: -acc.pos[1] }
    const kindA = acc.kind || 'door'
    if (kindA === 'door') {
      const d = [[Math.abs(ap.x - min.x), 'x0'], [Math.abs(ap.x - max.x), 'x1'], [Math.abs(ap.z - min.z), 'z0'], [Math.abs(ap.z - max.z), 'z1']].sort((p, q) => p[0] - q[0])[0]
      const wall = d[1], dw = 0.9, dh = Math.min(2.0, sy - 0.2), y = min.y + dh / 2
      for (const side of [-1, 1]) {
        const o = side * (TW / 2 + 0.012)
        if (wall === 'x0' || wall === 'x1') {
          const x = (wall === 'x0' ? min.x - TW / 2 : max.x + TW / 2) + o, z = clamp(ap.z, min.z + 0.6, max.z - 0.6)
          box(x, y, z, 0.03, dh, dw); box(x, y, z, 0.035, dh + 0.1, dw + 0.12); box(x + side * 0.03, y, z + dw * 0.35, 0.03, 0.03, 0.14)
        } else {
          const z = (wall === 'z0' ? min.z - TW / 2 : max.z + TW / 2) + o, x = clamp(ap.x, min.x + 0.6, max.x - 0.6)
          box(x, y, z, dw + 0.12, dh + 0.1, 0.035); box(x, y, z + side * 0.01, dw, dh, 0.03); box(x + dw * 0.35, y, z + side * 0.03, 0.14, 0.03, 0.03)
        }
      }
    } else if (kindA === 'hatch') {
      const y = Math.abs(ap.y - max.y) < Math.abs(ap.y - min.y) ? max.y - 0.02 : min.y + 0.02
      box(ap.x, y, ap.z, 1.0, 0.06, 1.0); box(ap.x, y, ap.z, 0.85, 0.07, 0.85)
    } else if (kindA === 'stair' || kindA === 'ladder') {
      const floorY = min.y, topY = max.y
      const x = clamp(ap.x, min.x + 0.5, max.x - 0.5), z = clamp(ap.z, min.z + 0.5, max.z - 0.5)
      if (kindA === 'ladder') {
        for (let k = 0; k < Math.round((topY - floorY) / 0.3); k++) box(x, floorY + 0.3 + k * 0.3, z, 0.5, 0.03, 0.03)
        for (const o of [-0.25, 0.25]) box(x + o, (floorY + topY) / 2, z, 0.05, topY - floorY, 0.05)
      } else {
        const rise = topY - floorY, run0 = Math.min(rise * 1.0, len * 0.4), dir = x + run0 < max.x - 0.3 ? 1 : -1, run = dir * run0
        const steps = Math.max(3, Math.round(rise / 0.2)), width = 0.8
        for (let i = 0; i < steps; i++) { const t = (i + 0.5) / steps; box(x + run * t, floorY + rise * (i + 1) / steps, z, run / steps, 0.04, width) }
        for (const o of [-width / 2, width / 2]) {
          between([x, floorY, z + o], [x + run, floorY + rise, z + o], 0.1, false)
          between([x, floorY + 1, z + o], [x + run, floorY + rise + 1, z + o], 0.025)
        }
      }
    }
  }
  const toShip = (p) => [p[0] + AX_OFF, -p[2], p[1] + AT]
  const out = {
    kind,
    boxes: wb.map(([lo, hi]) => [lo[0] + AX_OFF, hi[0] + AX_OFF, -hi[2], -lo[2], lo[1] + AT, hi[1] + AT]),
    caps: wc.map(([a, b, rad]) => [toShip(a), toShip(b), rad]),
  }
  fittingsCache.set(r.id, out)
  return out
}
// distance between segments p0-p1 and q0-q1
function segSegDist(p0, p1, q0, q1) {
  const d1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], d2 = [q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]], r0 = [p0[0] - q0[0], p0[1] - q0[1], p0[2] - q0[2]]
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r0)
  let s, t
  if (a <= 1e-12 && e <= 1e-12) return Math.sqrt(dot(r0, r0))
  if (a <= 1e-12) { s = 0; t = Math.max(0, Math.min(1, f / e)) } else {
    const c = dot(d1, r0)
    if (e <= 1e-12) { t = 0; s = Math.max(0, Math.min(1, -c / a)) } else {
      const b = dot(d1, d2), den = a * e - b * b
      s = den > 1e-12 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0
      t = (b * s + f) / e
      if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)) } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)) }
    }
  }
  const cp = [r0[0] + d1[0] * s - d2[0] * t, r0[1] + d1[1] * s - d2[1] * t, r0[2] + d1[2] * s - d2[2] * t]
  return Math.sqrt(dot(cp, cp))
}
function distPtSeg(p, a, b) { return segSegDist(p, p, a, b) }
// first blocker on the segment p-q (component boxes not in 'skip', then fittings); null when clear
function sightBlocker(p, q, roomId, skip) {
  for (const c of byRoom.get(roomId) || []) if (!skip.has(c.id) && segHitsBox(p, q, compBox(c))) return c.id
  const F = roomFittings(roomMap.get(roomId))
  for (const b of F.boxes) if (segHitsBox(p, q, b)) return 'fitting box ' + b.map((x) => x.toFixed(2)).join(',')
  for (const [a, b, rad] of F.caps) if (segSegDist(p, q, a, b) < rad) return 'fitting pipe/rod at ' + a.map((x) => x.toFixed(2)).join(',')
  return null
}
// a component, its hosts (mounted_on chain) and everything mounted on it are one assembly for sight lines
function assembly(id) {
  const s = new Set([id])
  let h = compMap.get(id)?.mounted_on
  while (h && !s.has(h)) { s.add(h); h = compMap.get(h)?.mounted_on }
  let grew = true
  while (grew) { grew = false; for (const c of db.components || []) if (c.mounted_on && s.has(c.mounted_on) && !s.has(c.id) && isDescendant(c.id, id)) { s.add(c.id); grew = true } }
  return s
}
function isDescendant(cid, root) { let h = compMap.get(cid)?.mounted_on; const seen = new Set(); while (h && !seen.has(h)) { if (h === root) return true; seen.add(h); h = compMap.get(h)?.mounted_on } return false }
const FACE_N = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+y': [0, 1, 0], '-y': [0, -1, 0] }
// front face of a component: centre, normal, two in-plane axes with half extents. When the face lies inside a host
// box (an item fitted inside a glazed panel or on an engine envelope), the face centre is pushed out along the
// facing to the host surface, so the sight line must reach the host face in front of it.
function frontFace(c) {
  const b = compBox(c), n = FACE_N[c.facing]
  const ctr = [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2]
  const ax = Math.abs(n[0]) ? 0 : 1, sgn = n[ax]
  const face = ctr.slice(); face[ax] = sgn > 0 ? b[2 * ax + 1] : b[2 * ax]
  let embedded = null
  let h = c.mounted_on ? compMap.get(c.mounted_on) : null
  while (h) {
    const hb = compBox(h)
    if (ptInBox(face, hb, -1e-3)) { embedded = h.id; face[ax] = sgn > 0 ? hb[2 * ax + 1] : hb[2 * ax] }
    h = h.mounted_on ? compMap.get(h.mounted_on) : null
  }
  const u = ax === 0 ? [0, 1, 0] : [1, 0, 0], w = [0, 0, 1]
  const hu = ax === 0 ? (b[3] - b[2]) / 2 : (b[1] - b[0]) / 2, hw = (b[5] - b[4]) / 2
  return { ctr, face, n, u, w, hu, hw, embedded }
}
// camera frame from eye and target; tangent-space projection (x right, y up, both divided by depth)
function camFrame(eye, target) {
  const f = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]
  const fl = Math.hypot(...f); f[0] /= fl; f[1] /= fl; f[2] /= fl
  let r = [f[1] * 1 - f[2] * 0, f[2] * 0 - f[0] * 1, 0]
  const rl = Math.hypot(...r) || 1; r = r.map((x) => x / rl)
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]]
  return { eye, f, r, u }
}
function project(F, p) {
  const d = [p[0] - F.eye[0], p[1] - F.eye[1], p[2] - F.eye[2]]
  const z = d[0] * F.f[0] + d[1] * F.f[1] + d[2] * F.f[2]
  return { z, x: (d[0] * F.r[0] + d[1] * F.r[1] + d[2] * F.r[2]) / z, y: (d[0] * F.u[0] + d[1] * F.u[1] + d[2] * F.u[2]) / z }
}
// safe frame: central 80 % of a 1.05 aspect frame at 70 deg vertical FOV (side panels open, FOV widened, see director.js)
const SAFE_V = 0.8 * Math.tan(35 * Math.PI / 180), SAFE_H = SAFE_V * 1.05
function boxCorners(b) { const o = []; for (const x of [b[0], b[1]]) for (const y of [b[2], b[3]]) for (const z of [b[4], b[5]]) o.push([x, y, z]); return o }
function evalArrival(s, a) {
  const res = { errors: [], warnings: [], comps: [] }
  const room = roomMap.get(a.room)
  if (!room) { res.errors.push(`room '${a.room}' not found`); return res }
  const e = a.eye, t = a.target
  if (!ptInBox(e, [room.box[0] + 0.3, room.box[1] - 0.3, room.box[2] + 0.3, room.box[3] - 0.3, room.box[4], room.box[5]], 1e-6)) res.errors.push('eye not inside the room box (0.3 m wall margin)')
  // the director clamps the orbit target to the room box shrunk by 0.2 m, so the target must lie inside it
  if (!ptInBox(t, [room.box[0] + 0.2, room.box[1] - 0.2, room.box[2] + 0.2, room.box[3] - 0.2, room.box[4] + 0.2, room.box[5] - 0.2], 1e-6)) res.errors.push('target not at least 0.2 m inside the room box (the app would clamp it)')
  // arrivals are panel-facing views, not room overviews: in rooms 8 m or more high the eye may be anywhere from 2.0 m
  // above the floor up to 0.3 m below the deckhead (no platform or walkway levels are defined in the database for
  // these rooms, so the floor is the reference); other rooms keep the deckhead band of rooms[].camera
  const H = room.box[5] - room.box[4], below = room.box[5] - e[2], above = e[2] - room.box[4]
  res.below = below
  if (H >= 8) {
    if (below < 0.3 - 1e-6 || above < 2.0 - 1e-6) res.errors.push(`eye ${above.toFixed(2)} m above the floor, ${below.toFixed(2)} m below the deckhead (tall room: expected 2.0 m above the floor to 0.3 m below the deckhead)`)
  } else {
    const maxBelow = roomFittings(room).kind === 'open' ? 1.0 : 0.8
    if (below < 0.3 - 1e-6 || below > maxBelow + 1e-6) res.errors.push(`eye ${below.toFixed(2)} m below deckhead (expected 0.3 to ${maxBelow} m)`)
  }
  let dmin = Infinity, dminId = null
  for (const c of byRoom.get(a.room) || []) { const d = distPtBox(e, compBox(c)); if (d < dmin) { dmin = d; dminId = c.id } }
  res.eqClear = dmin
  if (dmin < 0.3) res.errors.push(`eye ${dmin.toFixed(2)} m from ${dminId} (min 0.3 m)`)
  const FT = roomFittings(room)
  let fmin = Infinity
  for (const b of FT.boxes) fmin = Math.min(fmin, distPtBox(e, b))
  for (const [p, q, rad] of FT.caps) fmin = Math.min(fmin, distPtSeg(e, p, q) - rad)
  res.fitClear = fmin
  if (fmin < 0.25) res.errors.push(`eye ${fmin.toFixed(2)} m from a room fitting (min 0.25 m)`)
  if (!Array.isArray(a.primary_components) || !a.primary_components.length) { res.errors.push('primary_components empty'); return res }
  const F = camFrame(e, t)
  for (const id of a.primary_components) {
    const c = compMap.get(id)
    if (!c) { res.errors.push(`primary component ${id} not found`); continue }
    const m = { id, errors: [] }
    if (c.room !== a.room) m.errors.push(`not in arrival room ${a.room}`)
    if (!(s.components || []).includes(id)) m.errors.push('not in the system components list')
    if (c.system !== s.id && !(c.also_systems || []).includes(s.id)) m.errors.push(`belongs to ${c.system} and does not list ${s.id} in also_systems (primary components must belong to the system)`)
    const ff = frontFace(c)
    const toEye = [e[0] - ff.face[0], e[1] - ff.face[1], e[2] - ff.face[2]]
    const dl = Math.hypot(...toEye)
    m.faceAngle = Math.acos(Math.max(-1, Math.min(1, (toEye[0] * ff.n[0] + toEye[1] * ff.n[1] + toEye[2] * ff.n[2]) / dl))) * 180 / Math.PI
    m.dist = dl
    m.embedded = ff.embedded
    // above 75 deg the front is too foreshortened to read: an error unless the note records why no viewpoint works
    // ("GRAZING ACCEPTED: <reason>"); above 85 deg always an error
    const grazingOk = /GRAZING ACCEPTED: \S/.test(a.note || '')
    if (m.faceAngle > 85) m.errors.push(`operating face (${c.facing}) not toward the eye (${m.faceAngle.toFixed(0)} deg from the face normal, max 85)`)
    else if (m.faceAngle > 75 && !grazingOk) m.errors.push(`operating face seen at a grazing angle (${m.faceAngle.toFixed(0)} deg from the face normal, max 75 unless the note says GRAZING ACCEPTED: <reason>)`)
    else if (m.faceAngle > 75) res.warnings.push(`${id}: operating face seen at a grazing angle (${m.faceAngle.toFixed(0)} deg), GRAZING ACCEPTED in the note`)
    const skip = assembly(id)
    const pull = (p) => [p[0] + ff.n[0] * 0.01, p[1] + ff.n[1] * 0.01, p[2] + ff.n[2] * 0.01]
    m.centreBlock = sightBlocker(e, ff.ctr, a.room, skip)
    m.faceBlock = sightBlocker(e, pull(ff.face), a.room, skip)
    if (m.centreBlock) m.errors.push(`sight line to centre blocked by ${m.centreBlock}`)
    if (m.faceBlock) m.errors.push(`sight line to front-face centre blocked by ${m.faceBlock}`)
    let vis = 0, n = 0
    for (const i of [-0.8, -0.4, 0, 0.4, 0.8]) for (const j of [-0.8, -0.4, 0, 0.4, 0.8]) {
      const p = [0, 1, 2].map((k) => ff.face[k] + ff.u[k] * ff.hu * i + ff.w[k] * ff.hw * j)
      n++
      const pr = project(F, p)
      if (pr.z > 0.05 && Math.abs(pr.x) <= SAFE_H && Math.abs(pr.y) <= SAFE_V && !sightBlocker(e, pull(p), a.room, skip)) vis++
    }
    m.visible = vis / n
    let worst = 0, behind = false
    for (const p of boxCorners(compBox(c))) {
      const pr = project(F, p)
      if (pr.z <= 0.05) { behind = true; continue }
      worst = Math.max(worst, Math.abs(pr.x) / SAFE_H, Math.abs(pr.y) / SAFE_V)
    }
    m.frame = behind ? Infinity : worst
    if (behind || worst > 1 + 1e-6) m.errors.push(`outside the safe frame (corner at ${behind ? 'behind the camera' : (worst * 80).toFixed(0) + ' % of the half frame, max 80 %'})`)
    if (m.visible < 0.6 && !m.errors.length) res.warnings.push(`${id}: only ${(m.visible * 100).toFixed(0)} % of the front face samples visible`)
    for (const x of m.errors) res.errors.push(`${id}: ${x}`)
    res.comps.push(m)
  }
  return res
}
// Installation coverage: how many of the system's own components in the room (systems[].components located there)
// have their box centre inside the safe frame with an unblocked centre sight line. Used to compare an arrival with
// the room camera so that an arrival never shows less of the installation without a recorded reason.
// startOffset: the database room-camera eyes were placed before the fittings model existed and some sit inside or
// against a duct or tray (the app moves them at run time, see arrivalFix in src/camera/director.js); for the room
// camera the sight line therefore starts 1.0 m from the eye so that fitting does not zero the count.
function coverageCount(s, roomId, eye, target, startOffset = 0) {
  const F = camFrame(eye, target)
  const ids = (s.components || []).filter((id) => compMap.get(id)?.room === roomId)
  let n = 0
  for (const id of ids) {
    const c = compMap.get(id), b = compBox(c)
    const ctr = [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2]
    const pr = project(F, ctr)
    const L = Math.hypot(ctr[0] - eye[0], ctr[1] - eye[1], ctr[2] - eye[2]), k = Math.min(0.9, startOffset / L)
    const from = [0, 1, 2].map((i) => eye[i] + (ctr[i] - eye[i]) * k)
    if (pr.z > 0.05 && Math.abs(pr.x) <= SAFE_H && Math.abs(pr.y) <= SAFE_V && !sightBlocker(from, ctr, roomId, assembly(id))) n++
  }
  return { n, total: ids.length }
}
// <<< arrival-geometry
const ARR_FIELDS = ['room', 'eye', 'target', 'vfov_deg', 'primary_components', 'note']
const arrivalReport = []
for (const s of systems) {
  const a = s.arrival
  const w = `system ${s.id} arrival`
  if (!a) { err(`${w}: missing`); continue }
  need(a, ARR_FIELDS, w)
  if (!roomMap.has(a.room)) { err(`${w}: room '${a.room}' not found`); continue }
  if (a.room !== s.primary_room) warn(`${w}: room ${a.room} differs from primary_room ${s.primary_room}`)
  if (!Array.isArray(a.eye) || a.eye.length !== 3 || !a.eye.every(isNum) || !Array.isArray(a.target) || a.target.length !== 3 || !a.target.every(isNum)) { err(`${w}: eye/target must be [x, y, z]`); continue }
  if (!isNum(a.vfov_deg) || a.vfov_deg < 20 || a.vfov_deg > 70) err(`${w}: vfov_deg must be 20 to 70`)
  const r = evalArrival(s, a)
  for (const e of r.errors) err(`${w}: ${e}`)
  for (const x of r.warnings) warn(`${w}: ${x}`)
  // context components: optional, partly visible items named in the note; reported, not required to pass
  const ctxRows = []
  if (a.context_components !== undefined) {
    if (!Array.isArray(a.context_components)) err(`${w}: context_components must be an array`)
    else {
      const F = camFrame(a.eye, a.target), fullV = Math.tan(35 * Math.PI / 180), fullH = fullV * 1.05
      for (const id of a.context_components) {
        const c = compMap.get(id)
        if (!c) { err(`${w}: context component ${id} not found`); continue }
        if (c.room !== a.room) err(`${w}: context component ${id} not in room ${a.room}`)
        const b = compBox(c)
        let n = 0, tot = 0
        for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) for (let k = 0; k <= 4; k++) {
          const p = [b[0] + (b[1] - b[0]) * i / 4, b[2] + (b[3] - b[2]) * j / 4, b[4] + (b[5] - b[4]) * k / 4]
          const pr = project(F, p); tot++
          if (pr.z > 0.05 && Math.abs(pr.x) <= fullH && Math.abs(pr.y) <= fullV) n++
        }
        if (n === 0) warn(`${w}: context component ${id} is not in the frame at all`)
        ctxRows.push(`${id} ${Math.round(100 * n / tot)} % in frame`)
      }
    }
  }
  // coverage against the room camera of the same room
  const cam = roomMap.get(a.room).camera
  const cov = coverageCount(s, a.room, a.eye, a.target)
  const covRoom = cam && Array.isArray(cam.overview_eye) ? coverageCount(s, a.room, cam.overview_eye, cam.overview_target, 1.0) : null
  if (covRoom && cov.n < covRoom.n && !/NARROWER VIEW ACCEPTED: \S/.test(a.note || '')) warn(`${w}: shows ${cov.n} of ${cov.total} own components in the safe frame, fewer than the room camera (${covRoom.n}); widen the view or record "NARROWER VIEW ACCEPTED: <reason>" in the note`)
  arrivalReport.push({ s, a, r, ctxRows, cov, covRoom })
}

// ---------------- 6. cables ----------------
const CABLE_KINDS = new Set(['power_mv', 'power_lv', 'control', 'network_cu', 'fibre', 'coax', 'bus'])
for (const k of db.cables || []) {
  const w = `cable ${k.id}`
  need(k, ['id', 'from', 'to', 'kind', 'protocol', 'systems', 'route'], w)
  if (!CABLE_KINDS.has(k.kind)) err(`${w}: invalid kind '${k.kind}'`)
  const a = compMap.get(k.from), b = compMap.get(k.to)
  if (!a) err(`${w}: from '${k.from}' not found`)
  if (!b) err(`${w}: to '${k.to}' not found`)
  for (const s of k.systems || []) if (!sysMap.has(s)) err(`${w}: system '${s}' not found`)
  if (!Array.isArray(k.route) || k.route.length < 2) { err(`${w}: route needs at least 2 points`); continue }
  if (a && distPtBox(k.route[0], compBox(a)) > 1.0) err(`${w}: route start not near ${k.from}`)
  if (b && distPtBox(k.route[k.route.length - 1], compBox(b)) > 1.0) err(`${w}: route end not near ${k.to}`)
  for (const p of k.route) if (!Array.isArray(p) || p.length !== 3 || !p.every(isNum)) err(`${w}: invalid route point`)
  for (let i = 1; i < k.route.length; i++) {
    const p = k.route[i - 1], q = k.route[i]
    const axes = [0, 1, 2].filter((ax) => Math.abs(p[ax] - q[ax]) > 1e-6).length
    if (axes > 1) warn(`${w}: segment ${i} is diagonal (routes should be orthogonal along trays)`)
  }
}

// ---------------- 7. electrical ----------------
need(el, ['nominal', 'generators', 'buses', 'breakers', 'feeders', 'pms_settings', 'relay_settings', 'avr', 'governor'], 'electrical')
const genMap = new Map((el.generators || []).map((g) => [g.id, g]))
const busMap = new Map((el.buses || []).map((b) => [b.id, b]))
const fdrMap = new Map((el.feeders || []).map((f) => [f.id, f]))
const brkMap = new Map((el.breakers || []).map((b) => [b.id, b]))
for (const g of el.generators || []) {
  const w = `generator ${g.id}`
  need(g, ['id', 'component', 'engine_component', 'rating_kw', 'rating_kva', 'pf', 'rpm', 'poles', 'voltage_kv', 'droop_pct', 'basis'], w)
  if (!compMap.has(g.component)) err(`${w}: component not found`)
  if (!compMap.has(g.engine_component)) err(`${w}: engine_component not found`)
  if (Math.abs(g.rating_kw - g.rating_kva * g.pf) > 1) err(`${w}: rating_kw != rating_kva x pf`)
  const f = (el.nominal?.frequency_hz || 60)
  if (Math.abs((120 * f) / g.poles - g.rpm) > 0.5) err(`${w}: rpm ${g.rpm} inconsistent with ${g.poles} poles at ${f} Hz`)
}
for (const b of el.breakers || []) {
  const w = `breaker ${b.id}`
  need(b, ['id', 'name', 'from', 'to', 'component', 'relay'], w)
  const okFrom = genMap.has(b.from) || busMap.has(b.from) || fdrMap.has(b.from)
  const okTo = busMap.has(b.to) || fdrMap.has(b.to)
  if (!okFrom) err(`${w}: from '${b.from}' not a generator/bus/feeder`)
  if (!okTo) err(`${w}: to '${b.to}' not a bus/feeder`)
  if (!compMap.has(b.component)) err(`${w}: component '${b.component}' not found`)
  if (b.relay !== null && !compMap.has(b.relay)) err(`${w}: relay '${b.relay}' not found`)
  if (b.relay && compMap.get(b.relay)?.type !== 'protection_relay_ied') err(`${w}: relay is not a protection_relay_ied`)
}
for (const g of el.generators || []) if (!(el.breakers || []).some((b) => b.from === g.id)) err(`generator ${g.id}: no breaker`)
for (const f of el.feeders || []) {
  const w = `feeder ${f.id}`
  need(f, ['id', 'name', 'bus', 'load_kw', 'pf', 'priority', 'kind', 'drive_component'], w)
  if (!busMap.has(f.bus)) err(`${w}: bus '${f.bus}' not found`)
  if (!(Number.isInteger(f.priority) && f.priority >= 1 && f.priority <= 5)) err(`${w}: priority must be 1..5`)
  if (f.drive_component !== null && !compMap.has(f.drive_component)) err(`${w}: drive_component not found`)
  if (f.motor_component && !compMap.has(f.motor_component)) err(`${w}: motor_component not found`)
  if (f.to_bus && !busMap.has(f.to_bus)) err(`${w}: to_bus not found`)
  if (!(el.breakers || []).some((b) => b.to === f.id)) err(`${w}: no breaker feeds this feeder`)
}
for (const rs of el.relay_settings || []) {
  if (!compMap.has(rs.relay) || compMap.get(rs.relay).type !== 'protection_relay_ied') err(`relay_settings: relay '${rs.relay}' not an IED component`)
  if (!(genMap.has(rs.protects) || fdrMap.has(rs.protects) || brkMap.has(rs.protects) || busMap.has(rs.protects))) err(`relay_settings ${rs.relay}: protects '${rs.protects}' does not resolve`)
  for (const fn of rs.functions || []) { need(fn, ['ansi', 'name', 'pickup', 'curve_or_delay', 'basis'], `relay_settings ${rs.relay} ${fn.ansi}`); if (!/REPRESENTATIVE/.test(fn.basis || '')) err(`relay_settings ${rs.relay} ${fn.ansi}: basis must be REPRESENTATIVE`) }
}
for (const c of db.components || []) if (c.type === 'protection_relay_ied' && !(el.relay_settings || []).some((r) => r.relay === c.id)) err(`IED ${c.id} has no relay_settings`)
const ps = el.pms_settings || {}
need(ps, ['start_standby_load_pct', 'start_delay_s', 'stop_load_pct', 'stop_delay_s', 'load_shed_stages', 'blackout_restart', 'basis'], 'pms_settings')
if (ps.stop_load_pct >= ps.start_standby_load_pct) err('pms_settings: stop threshold must be below start threshold')
for (const st of ps.load_shed_stages || []) if (!(el.feeders || []).some((f) => f.priority === st.sheds_priority)) warn(`load shed stage ${st.stage}: no feeder with priority ${st.sheds_priority}`)
// load balance
const totalGen = (el.generators || []).reduce((s, g) => s + g.rating_kw, 0)
const loadFeeders = (el.feeders || []).filter((f) => !f.to_bus && f.kind !== 'transformer')
const connected = loadFeeders.reduce((s, f) => s + f.load_kw, 0)
const cases = el.load_cases || []
for (const lc of cases) {
  const kw = lc.running_feeders.reduce((s, id) => s + (fdrMap.get(id)?.load_kw ?? (err(`load case ${lc.id}: feeder ${id} not found`), 0)), 0)
  if (Math.abs(kw - lc.total_kw) > 0.5) err(`load case ${lc.id}: total_kw ${lc.total_kw} != sum ${kw}`)
}
const maxNormal = el.max_normal_load_kw ?? Math.max(0, ...cases.map((c) => c.total_kw))
if (!(totalGen > maxNormal)) err(`sum of generator ratings ${totalGen} kW does not exceed max normal load ${maxNormal} kW`)
const largest = Math.max(...(el.generators || []).map((g) => g.rating_kw))
const nMinus1 = totalGen - largest
if (nMinus1 < maxNormal) warn(`N-1 capacity ${nMinus1} kW below max normal load ${maxNormal} kW (load shedding relied upon)`)
// transformer loading
for (const f of el.feeders || []) if (f.to_bus) {
  const dn = loadFeeders.filter((x) => x.bus === f.to_bus)
  const maxkVA = dn.reduce((s, x) => s + x.load_kw / (x.pf || 0.85), 0)
  if (f.rating_kva && maxkVA > f.rating_kva) warn(`transformer ${f.id}: all connected loads ${maxkVA.toFixed(0)} kVA exceed rating ${f.rating_kva} kVA (diversity applies)`)
}

// sim parameters and their consistency
if (el.synchroniser && ps.sync_timeout_s != null && el.synchroniser.timeout_s !== ps.sync_timeout_s) err('synchroniser.timeout_s differs from pms_settings.sync_timeout_s')
if (ps.motor_start_kva_ratio != null && !(ps.motor_start_kva_ratio > 0)) err('pms_settings.motor_start_kva_ratio must be > 0')
const ea = el.earthing
if (ea) {
  if (!isNum(ea.ner_rating_a) || !isNum(ea.earth_fault_current_a)) err('electrical.earthing: ner_rating_a and earth_fault_current_a must be numbers')
  const normalOnline = (el.breakers || []).filter((b) => genMap.has(b.from) && b.normally === 'closed').length
  if (ea.ner_per_generator && Math.abs(ea.earth_fault_current_a - ea.ner_rating_a * normalOnline) > 0.5) err(`electrical.earthing: earth_fault_current_a ${ea.earth_fault_current_a} != ${normalOnline} online x NER ${ea.ner_rating_a} A`)
  for (const rs of el.relay_settings || []) for (const fn of rs.functions || []) {
    if (!/^5[01]N|^51G/.test(fn.ansi)) continue
    const a = Number((String(fn.pickup).match(/(\d+(\.\d+)?)\s*A primary/) || [])[1])
    if (isNum(a) && a >= ea.earth_fault_current_a) err(`relay ${rs.relay} ${fn.ansi}: earth fault pickup ${a} A not below the available earth fault current ${ea.earth_fault_current_a} A`)
  }
  if (!/REPRESENTATIVE|VERIFIED/.test(ea.basis || '')) err('electrical.earthing: basis tag missing')
}
for (const s of systems) if (s.sim_params) {
  if (!/REPRESENTATIVE|VERIFIED/.test(s.sim_params.basis || '')) err(`system ${s.id}: sim_params.basis tag missing`)
  for (const [k, val] of Object.entries(s.sim_params)) if (!/basis|note|voting_groups|channels/.test(k) && !isNum(val)) err(`system ${s.id}: sim_params.${k} must be a number`)
  for (const g of s.sim_params.voting_groups || []) {
    need(g, ['id', 'fg_zone', 'room', 'detector_kind', 'voting', 'tags', 'components'], `voting group ${g.id}`)
    if (!roomMap.has(g.room)) err(`voting group ${g.id}: room ${g.room} not found`)
    if ((g.tags || []).length !== (g.components || []).length || g.components.length < 2) err(`voting group ${g.id}: needs at least 2 detectors and one component per tag`)
    ;(g.components || []).forEach((cid, i) => {
      const c = compMap.get(cid)
      if (!c) { err(`voting group ${g.id}: component ${cid} not found`); return }
      if (c.tag !== g.tags[i]) err(`voting group ${g.id}: tag ${g.tags[i]} does not match component ${cid} tag ${c.tag}`)
      if (c.room !== g.room) err(`voting group ${g.id}: ${cid} is not in room ${g.room}`)
      if (c.params?.fg_zone !== g.fg_zone) err(`voting group ${g.id}: ${cid} fg_zone mismatch`)
    })
  }
}

// ---------------- 8. text checks ----------------
if (/\u2014/.test(raw)) err('em dash (U+2014) found in database text')
if (/\u2013/.test(raw)) err('en dash (U+2013) found in database text')
for (const d of db.deviations_from_reference || []) need(d, ['id', 'reference', 'issue', 'decision'], `deviation ${d.id}`)
for (const a of db.assumptions || []) need(a, ['id', 'text', 'basis', 'affects'], `assumption ${a.id}`)

// ---------------- summary ----------------
const pad = (s, n) => String(s).padEnd(n)
console.log(`FPSO database validation: ${dbPath}`)
console.log(`  version ${db.meta?.version}  rooms ${roomsArr.length}  systems ${systems.length}  components ${(db.components || []).length}  cables ${(db.cables || []).length}  topsides ${(db.topsides || []).length}`)
console.log('  Components per system (own / incl. shared via also_systems):')
for (const s of systems) {
  const own = (db.components || []).filter((c) => c.system === s.id).length
  console.log(`    ${s.id} ${pad(s.short, 20)} ${pad(own, 4)} / ${pad(s.components.length, 4)} rooms: ${s.rooms.join(', ')}`)
}
console.log(`    CTX context equipment   ${(db.components || []).filter((c) => c.system === 'CTX').length}`)
console.log('  Components per room:')
for (const r of roomsArr) console.log(`    ${pad(r.id, 14)} ${pad((byRoom.get(r.id) || []).length, 4)} ${r.name}`)
console.log(`  Electrical: ${(el.generators || []).length} generators, total ${totalGen} kW; N-1 ${nMinus1} kW; connected load ${connected} kW; load cases ${cases.map((c) => `${c.id}=${c.total_kw} kW`).join(', ')}; max normal ${maxNormal} kW`)
console.log('  Installation coverage (own components in the room with the centre in the safe frame and an unblocked centre sight line):')
console.log('    system  room        arrival  room camera  total')
for (const { s, a, cov, covRoom } of arrivalReport) console.log(`    ${pad(s.id, 7)} ${pad(a.room, 11)} ${pad(cov.n, 8)} ${pad(covRoom ? covRoom.n : '-', 12)} ${cov.total}${covRoom && cov.n < covRoom.n ? (/NARROWER VIEW ACCEPTED: \S/.test(a.note || '') ? '  narrower, accepted in note' : '  NARROWER') : ''}`)
console.log('  System arrival viewpoints (ship frame; vis = front-face samples unblocked and in the safe frame; frame = worst box corner as % of the half frame, limit 80 %):')
for (const { s, a, r, ctxRows } of arrivalReport) {
  console.log(`    ${s.id} ${pad(a.room, 10)} eye [${a.eye.join(', ')}] below deckhead ${r.below?.toFixed(2)} m, clear of equipment ${r.eqClear?.toFixed(2)} m, of fittings ${r.fitClear?.toFixed(2)} m`)
  for (const m of r.comps) console.log(`       ${pad(m.id, 13)} face ${pad(m.faceAngle.toFixed(0) + ' deg', 7)} vis ${pad(Math.round(m.visible * 100) + ' %', 6)} frame ${pad(isFinite(m.frame) ? Math.round(m.frame * 80) + ' %' : 'behind', 7)} ${m.errors.length ? 'FAIL' : 'ok'}${m.embedded ? ` (front taken on host ${m.embedded})` : ''}`)
  if (ctxRows.length) console.log(`       context: ${ctxRows.join('; ')}`)
}
for (const w of warnings) console.log(`  WARNING: ${w}`)
if (errors.length) {
  for (const e of errors) console.log(`  ERROR: ${e}`)
  console.log(`FAIL: ${errors.length} error(s), ${warnings.length} warning(s)`)
  process.exit(1)
}
console.log(`PASS: 0 errors, ${warnings.length} warning(s)`)
