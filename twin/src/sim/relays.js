// MV protection relays (S03): numerical IED model with live measurements, protection functions from
// db.electrical.relay_settings, IEC 60255-151 inverse time curves, start/trip LEDs, lockout 86, reset,
// event and fault records, and an educational secondary injection test mode.
// EDUCATIONAL SIMULATION: settings are those in the database (REPRESENTATIVE), not a protection study.

import { parsePickup, parseCurve, idmtTime, IEC_CURVES } from './util.js'
import { breakerTrip, genShutdown } from './electrical.js'

// functions that latch the lockout relay 86 when they trip (protection of plant against internal faults)
const LOCKOUT = /^(87|50|51|46|49|50N|51N|50G|51G|64|40)/
export const SIMULATED = /^(87[A-Z]?|51V|50N|51N|50G|51G|50N\/51N|50|51|27|59|81U|81O|32|46|40|49)$/
export const TEST_TOL = { pct: 5, min_s: 0.04, basis: 'REPRESENTATIVE educational acceptance band: max(5 %, 40 ms) of the theoretical operate time (no project tolerance in the database)' }
// earth fault current with high resistance earthing: db electrical.earthing (per online generator NER), REPRESENTATIVE
export function earthFaultA(state) { const E = state.earthing || {}; const n = Object.values(state.gens).filter((g) => g.online).length || 1; return E.per_gen ? E.per_gen * n : E.total ?? 10 }

function normAnsi(a) { return String(a || '').toUpperCase().replace(/\s+/g, '') }

export function initRelays(ctx) {
  const { db, state } = ctx
  state.relays = {}
  let efGap = false
  for (const rs of db.electrical?.relay_settings || []) {
    const id = rs.relay
    const comp = (db.components || []).find((c) => c.id === id)
    const protects = rs.protects
    const kind = state.gens[protects] ? 'gen' : state.feeders[protects] ? 'feeder' : state.breakers[protects] ? 'breaker' : state.buses[protects] ? 'bus' : 'unknown'
    if (kind === 'unknown') ctx.gap(`relay_settings ${id} protects ${protects}: not a generator, feeder, breaker or bus id`)
    const ct = String(rs.ct_ratio || '').match(/(\d+)\s*\/\s*(\d+)/)
    const fns = []
    for (const f of rs.functions || []) {
      const ansi = normAnsi(f.ansi)
      const pk = parsePickup(f.pickup_value ?? f.pickup)
      const cv = parseCurve(f.curve ?? f.curve_or_delay)
      const base = { name: f.name || ansi, pickupText: String(f.pickup ?? ''), curveText: String(f.curve_or_delay ?? f.curve ?? ''), basis: f.basis || 'REPRESENTATIVE' }
      const stages = pk.stages && cv.stages && pk.stages.length === cv.stages.length ? pk.stages.map((p, i) => [p, cv.stages[i]]) : [[pk, cv]]
      stages.forEach(([p, c], i) => {
        const a = i === 0 ? ansi : `${ansi}-${i + 1}`
        fns.push({ ...base, ansi: a, base: ansi, stage: i + 1, pickup: p, curve: c, supported: SIMULATED.test(ansi), enabled: true, started: false, operated: false, tripActive: false, alarm: false, acc: 0, startT: null, value: 0, ratio: 0, lockout: LOCKOUT.test(ansi), thermal: 0 })
      })
      if (/^(50N|51N|50N\/51N|51G|50G)/.test(ansi)) efGap = true
    }
    state.relays[id] = {
      id, name: comp?.name || id, tag: comp?.tag || id, protects, kind, functions: fns, ct_primary: ct ? Number(ct[1]) : null, ct_ratio: rs.ct_ratio || null, vt_ratio: rs.vt_ratio || null,
      breaker: findBreaker(state, protects, id),
      leds: { healthy: true, start: false, trip: false, lockout: false, alarm: false },
      meas: { ia: 0, ib: 0, ic: 0, in: 0, i2: 0, v: 0, f: 0, p: 0, q: 0, pf: 0, in_a: 1, vn: 1, pn: 1 },
      events: [], faults: [], lockout: false, tripFn: null, failed: false, tcsFault: false, status: 'In service',
      test: { active: false, inj: null, results: [] },
      drift: 0.08 + ctx.rng() * 0.09, // REPRESENTATIVE ageing error of a legacy electromechanical relay (demonstration only)
      calibrated: false, startSupervision: false,
    }
  }
  const E = db.electrical?.earthing || {}
  state.earthing = { per_gen: E.earth_fault_current_a_per_online_generator ?? null, total: E.earth_fault_current_a ?? null, note: E.earth_fault_current_note || '', basis: E.basis || 'REPRESENTATIVE' }
  if (efGap && state.earthing.per_gen == null && state.earthing.total == null) ctx.gap('Earth fault current not in db: REPRESENTATIVE 10 A primary used')
}

function findBreaker(state, protects, relayId) {
  const byRelay = Object.values(state.breakers).find((b) => b.relay === relayId)
  if (byRelay) return byRelay.id
  if (state.breakers[protects]) return protects
  if (state.gens[protects]) return state.gens[protects].breaker
  if (state.feeders[protects]) return state.feeders[protects].breaker
  return null
}

function relayLog(r, state, text, kind = 'event') {
  r.events.unshift({ t: state.t, text, kind })
  if (r.events.length > 60) r.events.pop()
}

function measure(state, r) {
  const m = r.meas
  m.closed = false
  if (r.kind === 'gen') {
    const g = state.gens[r.protects]
    m.ia = g.i_ph[0]; m.ib = g.i_ph[1]; m.ic = g.i_ph[2]
    m.v = g.v_kv; m.f = g.f_hz; m.p = g.p_kw; m.q = g.q_kvar; m.pf = g.pf
    m.in_a = g.rated_current_a || g.rating_kva / (Math.sqrt(3) * g.vn_kv); m.vn = g.vn_kv; m.pn = g.rating_kw
    m.in = g.faults.earth ? earthFaultA(state) : 0.05
    m.diff = g.faults.winding ? 0.6 * m.in_a : 0.004 * m.ia
    m.e_pu = g.e_pu; m.qpu = g.q_kvar / g.rating_kva
    m.closed = state.breakers[g.breaker]?.state === 'closed'
  } else if (r.kind === 'feeder') {
    const f = state.feeders[r.protects]
    const b = state.buses[f.bus]
    const u = f.fault?.kind === 'unbalance' ? 0.3 : 0
    m.ia = f.i_a * (1 + u); m.ib = f.i_a * (1 - u * 0.5); m.ic = f.i_a * (1 - u * 0.5)
    m.v = b ? b.v_kv : 0; m.f = b ? b.f_hz : 0; m.p = f.p_kw; m.q = f.q_kvar
    const s = Math.hypot(f.p_kw, f.q_kvar); m.pf = s > 1 ? f.p_kw / s : 0
    m.in_a = f.in_a || 1; m.vn = b ? b.vn_kv : 1; m.pn = f.rated_kw
    m.in = f.fault?.kind === 'earth' ? earthFaultA(state) : 0.02
    m.diff = f.fault?.kind === 'internal' ? 0.8 * m.in_a : 0.004 * m.ia
    m.closed = state.breakers[f.breaker]?.state === 'closed'
  } else if (r.kind === 'breaker') {
    const br = state.breakers[r.protects]
    const A = state.buses[br.from]
    const flow = br.state === 'closed' ? (state.busFlow?.[br.id] || { p: 0, q: 0 }) : { p: 0, q: 0 }
    const v = A ? A.v_kv : 0
    m.ia = m.ib = m.ic = v > 0.05 ? Math.hypot(flow.p, flow.q) / (Math.sqrt(3) * v) : 0
    m.p = flow.p; m.q = flow.q; m.v = v; m.f = A ? A.f_hz : 0; m.vn = A ? A.vn_kv : 1
    m.in_a = r.ct_primary || 1000; m.pn = 1; m.in = 0.02; m.diff = 0
    const s = Math.hypot(m.p, m.q); m.pf = s > 1 ? m.p / s : 0
    m.closed = br.state === 'closed'
  } else {
    const b = state.buses[r.protects] || Object.values(state.buses)[0]
    m.v = b ? b.v_kv : 0; m.f = b ? b.f_hz : 0; m.vn = b ? b.vn_kv : 1
  }
  m.imax = Math.max(m.ia || 0, m.ib || 0, m.ic || 0)
  m.i2 = ((Math.max(m.ia, m.ib, m.ic) - Math.min(m.ia, m.ib, m.ic)) / 2) || 0
}

export function pickupA(fn, m, dflt) {
  if (fn.pickup.absA != null) return fn.pickup.absA
  return (fn.pickup.pu ?? dflt) * m.in_a
}

// Returns {value, ratio, start}; ratio is measured / setting (> 1 means beyond the setting)
export function evalFunction(fn, m, fnNom) {
  const a = fn.base || fn.ansi
  const pu = fn.pickup.pu
  if (/^87/.test(a)) { const s = (pu ?? 0.1) * m.in_a; return { value: m.diff, ratio: m.diff / s, start: m.diff > s } }
  if (/^(50N|51N|50G|51G|50N\/51N|64)/.test(a)) { const s = fn.pickup.absA ?? (pu ?? 0.2) * m.in_a; return { value: m.in, ratio: m.in / s, start: m.in > s } }
  if (/^51V/.test(a)) { const k = Math.max(0.25, Math.min(1, m.v / m.vn)); const s = pickupA(fn, m, 1.2) * k; return { value: m.imax, ratio: m.imax / s, start: m.closed && m.imax > s } }
  if (/^(50|51)/.test(a)) { const s = pickupA(fn, m, 1.1); return { value: m.imax, ratio: m.imax / s, start: m.imax > s } }
  if (/^46/.test(a)) { const s = (pu ?? 0.1) * m.in_a; const al = (fn.pickup.alarmPu ?? (pu ?? 0.1) * 0.8) * m.in_a; fn.alarm = m.i2 > al && m.imax > 0.1 * m.in_a; return { value: m.i2, ratio: m.i2 / s, start: m.i2 > s && m.imax > 0.1 * m.in_a, i2pu: m.i2 / m.in_a } }
  if (/^49/.test(a)) { const s = pu ?? 1.15; const th = Math.sqrt(Math.max(0, fn.thermal)); fn.alarm = th > (fn.pickup.alarmPu ?? s * 0.9); return { value: th, ratio: th / s, start: th > s } }
  if (/^40/.test(a)) { const lost = m.closed && (m.e_pu < 0.35 || m.qpu < -0.45); return { value: m.qpu ?? 0, ratio: lost ? 2 : 0, start: lost } }
  if (/^27/.test(a)) { const s = (pu ?? 0.8) * m.vn; return { value: m.v, ratio: s / Math.max(m.v, 1e-6), start: m.closed && m.v < s } }
  if (/^59/.test(a)) { const s = (pu ?? 1.1) * m.vn; return { value: m.v, ratio: m.v / s, start: m.v > s } }
  if (/^81U/.test(a)) { const s = fn.pickup.abs ?? (pu ?? 0.95) * fnNom; return { value: m.f, ratio: s / Math.max(m.f, 1e-6), start: m.closed && m.v > 0.5 * m.vn && m.f < s } }
  if (/^81O/.test(a)) { const s = fn.pickup.abs ?? (pu ?? 1.05) * fnNom; return { value: m.f, ratio: m.f / s, start: m.closed && m.f > s } }
  if (/^32/.test(a)) { const s = Math.abs(pu ?? 0.05) * m.pn; return { value: m.p, ratio: -m.p / s, start: m.closed && m.p < -s } }
  return { value: 0, ratio: 0, start: false }
}

export function operateTime(fn, ratio, ev) {
  const c = fn.curve
  if (c.kind === 'idmt') return idmtTime(c.curve, c.tms, ratio)
  if (c.kind === 'i2t') { const i2 = ev?.i2pu ?? (fn.pickup.pu ?? 0.1) * ratio; return c.K / Math.max(1e-4, i2 * i2) }
  if (c.kind === 'thermal') return 0.04
  if (c.kind === 'none') return Infinity
  return c.delay
}

export function stepRelays(ctx, dt) {
  const { state } = ctx
  const fnNom = state.nominal.f_hz
  const legacy = state.variant?.S03 === 'legacy'
  for (const r of Object.values(state.relays)) {
    measure(state, r)
    const m = r.meas
    let anyStart = false
    for (const fn of r.functions) {
      if (!fn.enabled || !fn.supported || r.failed) { fn.started = false; continue }
      if (/^49/.test(fn.base)) { const tau = fn.curve.tau_s || 600; fn.thermal += ((m.imax / m.in_a) ** 2 - fn.thermal) * (dt / Math.max(10, tau)) }
      let ev
      if (r.test.active) {
        if (!r.test.inj || r.test.inj.ansi !== fn.ansi) { fn.started = false; fn.acc = 0; continue }
        ev = { value: r.test.inj.multiple, ratio: r.test.inj.multiple, start: r.test.inj.multiple > 1, i2pu: (fn.pickup.pu ?? 0.1) * r.test.inj.multiple }
      } else {
        ev = evalFunction(fn, m, fnNom)
        // motor start-up supervision (start setting group): normal motor starting current is not a fault
        const fd = r.kind === 'feeder' ? state.feeders[r.protects] : null
        if (fd && fd.inrush && /^(50|51)$/.test(fn.base)) {
          const k = Math.max(pickupA(fn, m, 1.1), fd.start_x * 1.2 * m.in_a)
          ev = { value: m.imax, ratio: m.imax / k, start: m.imax > k }
          r.startSupervision = true
        } else if (fd) r.startSupervision = false
      }
      fn.value = ev.value; fn.ratio = ev.ratio
      if (ev.start && !fn.tripActive) {
        if (!fn.started) { fn.started = true; fn.startT = state.t; fn.acc = 0; relayLog(r, state, `${fn.ansi} ${fn.name} START (${ev.ratio.toFixed(2)} x setting)`) }
        anyStart = true
        let top = operateTime(fn, ev.ratio, ev)
        if (r.test.active) top *= legacy ? (r.calibrated ? 1.02 : 1 + r.drift) : 1.004
        const before = fn.acc
        fn.acc += dt / Math.max(top, 1e-6)
        if (fn.acc >= 1) {
          const frac = (1 - before) / (fn.acc - before) // crossing point interpolated inside the step
          operate(ctx, r, fn, state.t + frac * dt - fn.startT)
        }
      } else if (!ev.start && (fn.started || fn.tripActive)) {
        fn.started = false; fn.tripActive = false
        if (!legacy) fn.acc = 0 // numerical relays reset at once; an electromechanical disc resets slowly
        relayLog(r, state, `${fn.ansi} drop off`)
      } else if (!fn.started && legacy && fn.acc > 0) fn.acc = Math.max(0, fn.acc - dt / 6)
    }
    r.leds.start = anyStart
    r.leds.trip = r.functions.some((f) => f.operated)
    r.leds.lockout = r.lockout
    r.leds.healthy = !r.failed
    r.leds.alarm = r.functions.some((f) => f.alarm)
    r.status = r.failed ? 'Internal fault' : r.test.active ? 'Test mode (blocked outputs)' : r.leds.trip ? 'Tripped' : anyStart ? 'Started (pickup)' : 'In service'
    ctx.alarm('S03', `RLY_START_${r.id}`, `${r.tag} protection start (pickup)`, 'low', anyStart && !r.test.active, { componentId: r.id })
    ctx.alarm('S03', `RLY_TRIP_${r.id}`, `${r.tag} protection trip ${r.tripFn || ''}`.trim(), 'critical', r.leds.trip && !r.test.active, { componentId: r.id })
    ctx.alarm('S03', `RLY_86_${r.id}`, `${r.tag} lockout 86 operated`, 'critical', r.lockout, { componentId: r.id })
    ctx.alarm('S03', `RLY_TEST_${r.id}`, `${r.tag} in test mode (trip outputs isolated)`, 'low', r.test.active, { componentId: r.id })
    ctx.alarm('S03', `RLY_WD_${r.id}`, `${r.tag} relay internal fault (watchdog): protection out of service`, 'high', r.failed, { componentId: r.id })
    ctx.alarm('S03', `RLY_TCS_${r.id}`, `${r.tag} trip circuit supervision alarm`, 'high', r.tcsFault, { componentId: r.id })
    const g = state.gens[r.protects]
    if (g && r.lockout) g.lockout = true
  }
}

function operate(ctx, r, fn, tOp) {
  const { state } = ctx
  fn.operated = true; fn.started = false; fn.tripActive = true
  r.tripFn = `${fn.ansi}`
  relayLog(r, state, `${fn.ansi} ${fn.name} OPERATED after ${tOp.toFixed(3)} s`, 'trip')
  if (r.test.active) {
    const inj = r.test.inj
    const exp = operateTime(fn, inj.multiple, { i2pu: (fn.pickup.pu ?? 0.1) * inj.multiple })
    const err = tOp - exp
    const tol = Math.max((TEST_TOL.pct / 100) * exp, TEST_TOL.min_s)
    const res = { t: state.t, ansi: fn.ansi, multiple: inj.multiple, expected: exp, measured: tOp, error_s: err, error_pct: (100 * err) / exp, tol_s: tol, pass: Math.abs(err) <= tol, relayType: state.variant?.S03 === 'legacy' ? 'electromechanical (legacy)' : 'numerical IED' }
    r.test.results.unshift(res)
    if (r.test.results.length > 12) r.test.results.pop()
    r.test.inj = null
    relayLog(r, state, `Secondary injection ${fn.ansi} at ${inj.multiple} x: measured ${tOp.toFixed(3)} s, expected ${exp.toFixed(3)} s, ${res.pass ? 'PASS' : 'FAIL'}`, 'test')
    ctx.event('S03', `${r.tag} injection test ${fn.ansi} ${res.pass ? 'PASS' : 'FAIL'} (${res.error_pct.toFixed(1)} %)`)
    setTimeoutSim(state, 1.0, () => { fn.operated = false; fn.tripActive = false; fn.acc = 0 })
    return
  }
  const m = r.meas
  r.faults.unshift({ t: state.t, ansi: fn.ansi, name: fn.name, ia: m.ia, ib: m.ib, ic: m.ic, in: m.in, v: m.v, f: m.f, p: m.p, q: m.q, top: tOp })
  if (r.faults.length > 10) r.faults.pop()
  if (fn.lockout) r.lockout = true
  if (r.tcsFault) { relayLog(r, state, 'Trip command issued but the trip circuit is faulty: breaker did not open (TCS alarm)', 'trip'); ctx.event('S03', `${r.tag}: trip issued, breaker failed to open (trip circuit fault)`, 'critical'); return }
  if (r.breaker) breakerTrip(ctx, r.breaker, `relay ${r.tag} ${fn.ansi} ${fn.name}`, fn.lockout)
  const g = state.gens[r.protects]
  if (g && /^87/.test(fn.ansi)) genShutdown(ctx, g, `generator differential ${fn.ansi} (class A trip)`)
  if (g && /^32/.test(fn.ansi)) { g.rpTrip = true }
  ctx.event('S03', `${r.tag}: ${fn.ansi} ${fn.name}${/trip$/i.test(fn.name) ? '' : ' trip'}${fn.lockout ? ', lockout 86' : ''}`, 'high')
}

// tiny deterministic sim-time scheduler used by the models
export function setTimeoutSim(state, delay, fn) { (state._timers ||= []).push({ at: state.t + delay, fn }) }
export function runSimTimers(state) {
  if (!state._timers || !state._timers.length) return
  const due = state._timers.filter((x) => x.at <= state.t + 1e-9)
  if (!due.length) return
  state._timers = state._timers.filter((x) => x.at > state.t + 1e-9)
  for (const d of due) d.fn()
}

export function relayCommands(ctx) {
  const { state } = ctx
  const R = (id) => state.relays[id] || Object.values(state.relays).find((r) => r.protects === id)
  return {
    'relay.reset': ({ relay }) => {
      const r = R(relay); if (!r) return false
      if (r.functions.some((f) => f.started) && !r.test.active) { relayLog(r, state, 'Reset refused: a protection function is still picked up'); return false }
      r.functions.forEach((f) => { f.operated = false; f.tripActive = false; f.acc = 0 })
      r.lockout = false; r.tripFn = null
      const br = state.breakers[r.breaker]
      if (br) br.tripped = false
      const g = state.gens[r.protects]
      if (g) { g.lockout = false; g.rpTrip = false }
      relayLog(r, state, 'LEDs and lockout 86 reset by operator')
      ctx.event('S03', `${r.tag} reset`)
      return true
    },
    'relay.test': ({ relay, on }) => {
      const r = R(relay); if (!r) return false
      r.test.active = !!on; r.test.inj = null
      r.functions.forEach((f) => { f.started = false; f.acc = 0; if (on) { f.operated = false; f.tripActive = false } })
      relayLog(r, state, on ? 'TEST MODE: trip outputs isolated by the test block (educational)' : 'Test mode off, relay back in service')
      return true
    },
    'relay.inject': ({ relay, ansi, multiple }) => {
      const r = R(relay); if (!r || !r.test.active) return false
      const fn = r.functions.find((f) => f.ansi === ansi && f.supported) || r.functions.find((f) => f.curve.kind === 'idmt')
      if (!fn) return false
      fn.operated = false; fn.tripActive = false; fn.acc = 0; fn.started = false
      r.test.inj = { ansi: fn.ansi, multiple: Number(multiple) || 2, t0: state.t }
      relayLog(r, state, `Injecting ${fn.ansi} at ${r.test.inj.multiple} x setting`, 'test')
      return true
    },
    'relay.calibrate': ({ relay }) => { const r = R(relay); if (!r) return false; r.calibrated = true; relayLog(r, state, 'Legacy relay recalibrated (time multiplier adjusted on the disc), retest required'); return true },
    'relay.enable': ({ relay, ansi, enabled }) => { const r = R(relay); const f = r && r.functions.find((x) => x.ansi === ansi); if (!f) return false; f.enabled = !!enabled; relayLog(r, state, `${ansi} ${enabled ? 'enabled' : 'disabled'} (setting change)`); ctx.event('S03', `${r.tag} settings changed: ${ansi} ${enabled ? 'enabled' : 'disabled'}`); return true },
    'relay.fault': ({ relay, kind, on = true }) => { const r = R(relay); if (!r) return false; if (kind === 'watchdog') r.failed = !!on; else if (kind === 'tcs') r.tcsFault = !!on; else return false; relayLog(r, state, `${kind} fault ${on ? 'present' : 'cleared'}`); return true },
  }
}

export function curveName(c) {
  if (!c) return ''
  if (c.kind === 'idmt') return `${IEC_CURVES[c.curve]?.name || c.curve}, TMS ${c.tms}`
  if (c.kind === 'i2t') return `I2 squared t, K = ${c.K}`
  if (c.kind === 'thermal') return `thermal image, tau ${Math.round(c.tau_s / 60)} min`
  if (c.kind === 'none') return 'indication only'
  return `definite time ${c.delay} s`
}
