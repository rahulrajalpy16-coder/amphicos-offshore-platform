// Diesel engine auxiliaries and safety system (S12 DG local control panel view).
// Lube oil, HT cooling water, exhaust per cylinder, charge air, turbocharger, start air, shutdowns with
// first-out, local/remote and emergency stop. Speed, load and breaker come from the electrical model
// (the same generator object the PMS, governor and AVR views read).
// EDUCATIONAL SIMULATION: ranges and limits are read from db S12 measurements when given, otherwise REPRESENTATIVE.

import { approach, clamp, allNumbers } from './util.js'
import { genShutdown, genStart, genStop, genReset } from './electrical.js'

function findMeas(sys, re) { return (sys?.measurements || []).find((m) => re.test(`${m.tag || ''} ${m.name || ''}`)) }
function limitsFrom(m, d, ctx, label) {
  if (!m) { ctx.gap(`S12 measurement for ${label} not in db: REPRESENTATIVE normal ${d.normal.join(' to ')}, alarm ${d.alarm}, trip ${d.trip}`); return { ...d, basis: 'REPRESENTATIVE default' } }
  const n = allNumbers(m.normal), a = allNumbers(m.alarm), t = allNumbers(m.trip)
  return { normal: n.length >= 2 ? [n[0], n[1]] : n.length ? [n[0], n[0]] : d.normal, alarm: a.length ? a[0] : d.alarm, alarm2: a[1] ?? d.alarm2, trip: t.length ? t[0] : d.trip, basis: m.basis || 'db', unit: m.unit, tag: m.tag, nominal: n.length >= 2 ? (n[0] + n[1]) / 2 : n[0] }
}

export function initEngines(ctx) {
  const { db, state } = ctx
  const s12 = (db.systems || []).find((s) => s.id === 'S12')
  const L = {
    lo_p: limitsFrom(findMeas(s12, /lub|LO press|oil press/i), { normal: [4, 5], alarm: 3, trip: 2 }, ctx, 'lube oil pressure'),
    jw_t: limitsFrom(findMeas(s12, /jacket|HT.*water|cooling water.*temp|JW/i), { normal: [85, 92], alarm: 95, trip: 100 }, ctx, 'HT cooling water temperature'),
    exh: limitsFrom(findMeas(s12, /exhaust/i), { normal: [350, 450], alarm: 500, alarm2: 50, trip: null }, ctx, 'exhaust temperature'),
    speed: limitsFrom(findMeas(s12, /speed|overspeed|rpm/i), { normal: [720, 720], alarm: null, trip: 115 }, ctx, 'overspeed'),
    start_air: limitsFrom(findMeas(s12, /start(ing)? air/i), { normal: [25, 30], alarm: 15, trip: null }, ctx, 'starting air'),
  }
  state.engineLimits = L
  state.engines = {}
  for (const id of state.genOrder) {
    const g = state.gens[id]
    const comp = (db.components || []).find((c) => c.id === g.engine_component)
    const n = comp?.params?.cylinders || comp?.params?.cylinder_count || 12
    if (!comp?.params?.cylinders && !comp?.params?.cylinder_count) ctx.gap(`${g.engine_component} params.cylinders missing: 12 used`)
    const offs = Array.from({ length: n }, () => (ctx.rng() - 0.5) * 24)
    state.engines[id] = {
      id, cylinders: n, arrangement: comp?.params?.arrangement || (n >= 12 ? 'vee' : 'in-line'), lo_p: 0, lo_t: 45, jw_t: L.jw_t.normal[0] - 30, jw_p: 0.5, exh: offs.map(() => 60), exhOff: offs, exh_avg: 60, exh_dev: offs.map(() => 0),
      ca_p: 0, ca_t: 35, tc_rpm: 0, fo_p: 0, start_air: L.start_air.normal[1], batt_v: 24.4,
      inhibit: true, firstOut: null, lastShutdown: null, lampTestUntil: -1,
    }
  }
}

export function stepEngines(ctx, dt) {
  const { state } = ctx
  const L = state.engineLimits
  for (const id of state.genOrder) {
    const g = state.gens[id]
    const e = state.engines[id]
    const sp = g.rpm_rated ? g.speed_rpm / g.rpm_rated : 0
    const load = clamp(g.pm_kw / g.rating_kw, 0, 1.2)
    const firing = ['accelerating', 'running', 'cooldown'].includes(g.engine)
    // lube oil: electric pre-lube pump then engine driven pump
    let loT = g.engine === 'prelube' ? 1.2 : (L.lo_p.nominal ?? 4.5) * Math.pow(Math.max(sp, 0), 1.3)
    if (g.faults.lo_pressure) loT = Math.min(loT, L.lo_p.trip * 0.7)
    e.lo_p = approach(e.lo_p, loT, g.faults.lo_pressure ? 0.12 : 1.5, dt)
    e.lo_t = approach(e.lo_t, firing ? 62 + 14 * load : 45, 0.03, dt)
    // HT cooling water: preheated when stopped, rises with load inside the db normal band
    const [jlo, jhi] = L.jw_t.normal
    const jwTarget = g.faults.jw_high ? (L.jw_t.trip ?? jhi + 10) + 6 : firing ? jlo + (jhi - jlo) * Math.min(1, load) : jlo - 30
    e.jw_t = approach(e.jw_t, jwTarget, g.faults.jw_high ? 0.05 : 0.04, dt)
    e.jw_p = approach(e.jw_p, firing ? 2.8 * Math.min(1, sp) + 0.4 : 0.5, 1, dt)
    // exhaust per cylinder: db normal band spans no load to full load
    const [xlo, xhi] = L.exh.normal
    e.exh = e.exh.map((t, i) => {
      let tgt = firing ? xlo - 40 + (xhi - xlo + 40) * Math.min(1, load) + e.exhOff[i] : 60
      if (g.faults.misfire && i === (g.faults.misfire_cyl ?? 2)) tgt = firing ? xlo - 150 + 40 * load : 60
      return approach(t, tgt, 0.15, dt)
    })
    e.exh_avg = e.exh.reduce((a, b) => a + b, 0) / e.exh.length
    e.exh_dev = e.exh.map((t) => t - e.exh_avg)
    e.ca_p = approach(e.ca_p, firing ? 0.1 + 2.6 * Math.pow(load, 1.2) : 0, 0.5, dt)
    e.ca_t = approach(e.ca_t, firing ? 38 + 12 * load : 35, 0.1, dt)
    e.tc_rpm = approach(e.tc_rpm, firing ? 9000 + 21000 * load : 0, 0.4, dt)
    e.fo_p = approach(e.fo_p, firing || g.engine === 'cranking' ? 7.5 : 0.3, 2, dt)
    if (g.engine === 'cranking') e.start_air = Math.max(8, e.start_air - 0.7 * dt)
    else e.start_air = Math.min(L.start_air.normal[1], e.start_air + 0.05 * dt)
    // shutdown inhibit during start until rated speed plus 10 s
    if (g.engine === 'running' && g.engineTimer > 10) e.inhibit = false
    if (!firing) e.inhibit = true
    // ---- alarms ----
    const comp = g.links?.lcp || g.engine_component
    const A = (code, text, sev, on) => ctx.alarm('S12', `${code}_${id}`, `${id} ${text}`, sev, on, { componentId: comp })
    A('LO_P_LOW', 'lube oil pressure low', 'high', !e.inhibit && e.lo_p < L.lo_p.alarm)
    A('JW_T_HIGH', 'HT cooling water temperature high', 'high', e.jw_t > L.jw_t.alarm)
    A('EXH_DEV', 'exhaust temperature deviation', 'low', firing && load > 0.2 && e.exh_dev.some((d) => Math.abs(d) > (L.exh.alarm2 ?? 50)))
    A('EXH_HIGH', 'exhaust temperature high', 'high', e.exh.some((t) => t > L.exh.alarm))
    A('START_AIR_LOW', 'starting air pressure low', 'low', e.start_air < (L.start_air.alarm ?? 15))
    A('ESTOP', 'emergency stop activated', 'critical', !!g.faults.estop)
    A('LOCAL', 'in LOCAL control (not available to PMS)', 'low', g.control === 'local')
    A('SHUTDOWN', `shutdown: ${g.shutdownCause || ''}`, 'critical', g.engine === 'shutdown')
    A('FTS', 'start failure', 'high', g.engine === 'fail_start')
    // ---- shutdowns ----
    const ovs = L.speed.trip > 200 ? L.speed.trip / g.rpm_rated : L.speed.trip / 100
    if (firing && sp > ovs) trip(ctx, g, e, 'overspeed')
    if (!e.inhibit && e.lo_p < L.lo_p.trip) trip(ctx, g, e, 'low lube oil pressure')
    if (firing && L.jw_t.trip && e.jw_t > L.jw_t.trip) trip(ctx, g, e, 'high HT cooling water temperature')
    if (g.engine === 'running' && !e.inhibit && sp < 0.85) { e.uTimer = (e.uTimer || 0) + dt; if (e.uTimer > 3) trip(ctx, g, e, 'underspeed (governor or fuel fault)') } else e.uTimer = 0
    if (g.faults.estop && g.engine !== 'shutdown' && g.engine !== 'stopped') trip(ctx, g, e, 'emergency stop')
    // governor, AVR and generator controller supervision (S15, S14, S01 alarms on the same set)
    const legacyGov = state.variant?.S15 === 'legacy'
    ctx.alarm('S15', `GOV_PICKUP_${id}`, `${id} speed pickup failure${legacyGov ? ' (single pickup: fail-safe shutdown)' : ' (switched to redundant pickup)'}`, 'critical', !!g.faults.pickup, { componentId: g.links?.speed_controller })
    if (g.faults.pickup && legacyGov && firing) trip(ctx, g, e, 'speed pickup failure (governor fail-safe)')
    ctx.alarm('S15', `GOV_ACT_${id}`, `${id} governor actuator fault`, 'high', !!g.faults.gov_actuator, { componentId: g.links?.actuator })
    ctx.alarm('S15', `GOV_FUEL_${id}`, `${id} fuel limit active`, 'high', firing && g.act_pct > 95, { componentId: g.links?.speed_controller })
    ctx.alarm('S14', `AVR_SENS_${id}`, `${id} AVR loss of sensing`, 'high', g.avr.sensing === 'lost', { componentId: g.links?.avr })
    ctx.alarm('S14', `AVR_OEL_${id}`, `${id} over-excitation limiter active`, 'high', g.online && g.avr.limit === 'OEL', { componentId: g.links?.avr })
    ctx.alarm('S14', `AVR_UEL_${id}`, `${id} under-excitation / loss of field`, 'critical', g.online && g.avr.limit === 'UEL', { componentId: g.links?.avr })
    ctx.alarm('S01', `DGC_COMM_${id}`, `${id} generator controller communication loss to PMS`, 'high', !!g.faults.gcp_comm, { componentId: g.links?.gcp })
    ctx.alarm('S01', `DGC_RP_${id}`, `${id} reverse power trip`, 'critical', !!g.rpTrip, { componentId: g.links?.gcp })
    g.lcpState = g.faults.estop ? 'Emergency stop' : g.engine === 'shutdown' ? 'Shutdown (latched)' : g.engine === 'stopped' || g.engine === 'fail_start' ? (g.control === 'local' ? 'Stopped, local' : 'Stopped, remote') : g.engine === 'prelube' ? 'Pre-lubrication' : g.engine === 'cranking' ? 'Cranking' : 'Running'
  }
}

function trip(ctx, g, e, cause) {
  if (g.engine === 'shutdown') return
  e.firstOut = cause
  e.lastShutdown = { t: ctx.state.t, cause }
  genShutdown(ctx, g, cause)
}

export function engineCommands(ctx) {
  const { state } = ctx
  const G = (id) => state.gens[id]
  return {
    'gen.start': ({ id, by }) => { const g = G(id); if (!g) return false; if (g.control === 'local' && by !== 'local') { ctx.event('S12', `${id} remote start refused: panel in LOCAL`, 'low'); return false } const ok = genStart(ctx, g, by || 'operator'); if (ok && state.pms.mode !== 'manual' && by !== 'local') g.syncPending = true; return ok },
    'gen.stop': ({ id, by }) => { const g = G(id); if (!g) return false; if (g.control === 'local' && by !== 'local') return false; return genStop(ctx, g, by || 'operator') },
    'gen.reset': ({ id }) => { const g = G(id); if (!g) return false; const ok = genReset(ctx, g); if (ok && state.engines[id]) state.engines[id].firstOut = null; return ok },
    'gen.control': ({ id, location }) => { const g = G(id); if (!g || !['local', 'remote'].includes(location)) return false; g.control = location; ctx.event('S12', `${id} control location ${location.toUpperCase()}`); return true },
    'gen.estop': ({ id, on }) => { const g = G(id); if (!g) return false; g.faults.estop = !!on; ctx.event('S12', `${id} emergency stop ${on ? 'PRESSED' : 'released'}`, on ? 'critical' : 'low'); return true },
    'gen.lamptest': ({ id }) => { const e = state.engines[id]; if (!e) return false; e.lampTestUntil = state.t + 3; return true },
  }
}
