// Electrical network model: generator sets (engine speed, governor, AVR), synchroniser, breakers,
// buses, bus tie, feeders (motor inrush, VFD load), transformers and islands.
// EDUCATIONAL SIMULATION: quasi steady state phasor-free model, not an EMT solver, not OEM logic.
//
// Physics summary
//  - Electrical power always equals connected load plus losses in every island (power balance holds every tick).
//  - Mechanical power from the governor differs from electrical power during transients; the difference
//    changes the common island frequency through the swing equation 2H/fn df/dt = (Pm - Pe)/Prated.
//  - Droop governor: Pm_ref = Prated (fref - f)/(R fn). Isochronous load sharing: one integrator per island
//    shared by all isochronous sets (load sharing lines), so per unit load is equal.
//  - AVR: island voltage from the kVA weighted voltage setpoints with reactive droop, plus a dip that
//    recovers with the AVR time constant. Reactive load shared by kVA rating plus setpoint mismatch.

import { clamp, approach, firstNumber } from './util.js'

const SUBSTEPS = 10
export const DEFAULTS = {
  // all REPRESENTATIVE educational values used when the database does not give them
  H_s: 1.5, gov_te_s: 0.35, gov_kp: 20, gov_ki: 8, avr_t_s: 0.45, xd_pu: 1.8, if_nl_a: 4.0,
  prelube_s: 2, crank_s: 3, accel_rate_pu_s: 0.12, cooldown_s: 20, softload_pu_s: 0.12,
  motor_inrush_x: 6, motor_start_s: 4, motor_start_pf: 0.3,
  sync_window: { slip_hz: 0.1, dv_pct: 5, angle_deg: 10 },
  uv_motor_trip_s: 0.5, loss_cable: 0.005, tr_noload: 0.002, tr_load: 0.01,
  oel_pu: 2.75, uel_q_pu: -0.3, oel_trip_s: 4,
}

export function initElectrical(ctx) {
  const { db, state } = ctx
  const el = db.electrical || {}
  const fn = el.nominal?.frequency_hz || 60
  const vn = el.nominal?.voltage_kv || 6.6
  state.nominal = { f_hz: fn, v_kv: vn }
  const syncCfg = el.synchroniser || el.sync_settings || {}
  state.syncWindow = {
    slip_hz: firstNumber(syncCfg.slip_hz ?? syncCfg.max_slip_hz, DEFAULTS.sync_window.slip_hz),
    dv_pct: firstNumber(syncCfg.dv_pct ?? syncCfg.max_voltage_diff_pct, DEFAULTS.sync_window.dv_pct),
    angle_deg: firstNumber(syncCfg.angle_deg ?? syncCfg.max_phase_angle_deg, DEFAULTS.sync_window.angle_deg),
    basis: syncCfg.basis || (el.synchroniser ? 'db' : 'REPRESENTATIVE default'),
  }
  if (!el.synchroniser && !el.sync_settings) ctx.gap('electrical.synchroniser window (slip, dV, angle) not in db: REPRESENTATIVE defaults 0.1 Hz, 5 %, 10 deg used')
  const govCfg = el.governor || {}
  const avrCfg = el.avr || {}
  const busIds = new Set((el.buses || []).map((b) => b.id))
  state.gens = {}
  state.genOrder = []
  for (const g of el.generators || []) {
    const breaker = (el.breakers || []).find((b) => b.from === g.id || b.to === g.id)
    const bus = breaker ? (breaker.from === g.id ? breaker.to : breaker.from) : (el.buses?.[0]?.id)
    const vkv = g.voltage_kv || vn
    const droop = (firstNumber(g.droop_pct, null) ?? firstNumber(govCfg.droop_pct, 4)) / 100
    const qdroop = (firstNumber(g.reactive_droop_pct, null) ?? firstNumber(avrCfg.reactive_droop_pct, 4)) / 100
    const rkva = g.rating_kva || (g.rating_kw / (g.pf || 0.8))
    state.gens[g.id] = {
      id: g.id, name: g.name || `Generator ${g.id}`, component: g.component, engine_component: g.engine_component || g.component,
      links: { gcp: g.gcp || null, lcp: g.lcp || null, avr: g.avr_component || null, speed_controller: g.speed_controller || null, actuator: g.actuator || null, omd: g.omd_unit || null, relay: g.relay || null },
      rated_current_a: g.rated_current_a || null,
      rating_kw: g.rating_kw, rating_kva: rkva, pf_rated: g.pf || 0.8, rpm_rated: g.rpm || 720, poles: g.poles || Math.round((120 * fn) / (g.rpm || 720)),
      vn_kv: vkv, H: firstNumber(g.inertia_h_s, DEFAULTS.H_s), breaker: breaker?.id || null, bus,
      engine: 'stopped', engineTimer: 0, f_hz: 0, speed_rpm: 0, v_kv: 0, p_kw: 0, q_kvar: 0, i_a: 0, i_ph: [0, 0, 0], pf: 0,
      pm_kw: 0, act_pct: 0, rack_pct: 0, e_pu: 0, if_a: 0, phase_deg: 0, slip_hz: 0, dv_pct: 0,
      gov: { mode: 'isoch', droop, fref: fn, u: 0, kp: DEFAULTS.gov_kp, ki: DEFAULTS.gov_ki, te: DEFAULTS.gov_te_s, gain: 1, ramp: 1.1, unloading: false, rampTarget: 1.1 },
      avr: { mode: 'auto', v_set: firstNumber(avrCfg.setpoint_kv, vkv), droop_q: qdroop, gain: 1, sensing: 'ok', limit: '', fcr_v: null, oelTimer: 0, excitation: false },
      control: 'remote', online: false, ready: false, available: true, lockout: false, shutdownCause: null,
      running_hours: 0, starts: 0, faults: {}, status: 'Stopped', startRequestedBy: null,
    }
    state.genOrder.push(g.id)
  }
  // initial running hours: deterministic, varied per set (educational display only)
  state.genOrder.forEach((id, i) => { state.gens[id].running_hours = 18000 + i * 2350 + Math.floor(ctx.rng() * 900) })
  state.buses = {}
  for (const b of el.buses || []) state.buses[b.id] = { id: b.id, name: b.name || b.id, vn_kv: b.voltage_kv || vn, live: false, v_kv: 0, f_hz: 0, island: null, deadTime: 0, wasLive: false }
  state.breakers = {}
  for (const b of el.breakers || []) {
    const kind = b.kind || (state.gens[b.from] || state.gens[b.to] ? 'generator' : busIds.has(b.from) && busIds.has(b.to) ? 'tie' : 'feeder')
    state.breakers[b.id] = { id: b.id, name: b.name || b.id, from: b.from, to: b.to, kind, normally: b.normally || null, shedable: b.shed_by_pms !== false, component: b.component, relay: b.relay || null, state: 'open', tripped: false, racked: 'service', cause: '', ops: 0, closeBlockedReason: '' }
  }
  state.feeders = {}
  for (const f of el.feeders || []) {
    const br = (el.breakers || []).find((b) => b.to === f.id && b.kind !== 'incomer') || (el.breakers || []).find((b) => b.to === f.id || b.from === f.id)
    const toBus = f.to_bus || f.secondary_bus || f.feeds_bus || null
    const heavy = f.heavy_consumer != null ? !!f.heavy_consumer : (f.kind === 'motor' && f.load_kw >= 0.25 * Math.min(...(el.generators || [{ rating_kw: 4000 }]).map((g) => g.rating_kw)))
    state.feeders[f.id] = {
      id: f.id, name: f.name || f.id, bus: f.bus, kind: f.kind || 'process', priority: f.priority ?? 3, rated_kw: f.load_kw || 0, pf: f.pf || 0.85,
      breaker: br?.id || null, drive: f.drive_component || null, to_bus: toBus && busIds.has(toBus) ? toBus : null, heavy,
      essential: f.essential != null ? !!f.essential : (f.priority ?? 3) <= 2,
      start_x: firstNumber(f.start_current_x, DEFAULTS.motor_inrush_x), start_s: firstNumber(f.start_time_s, DEFAULTS.motor_start_s),
      demand_kw: f.load_kw || 0, noise: 1, p_kw: 0, q_kvar: 0, i_a: 0, energised: false, inrush: null, shedBy: null, uvTripped: false, fault: null,
      running_default: f.running_default != null ? !!f.running_default : true, duty: f.duty || '', rating_kva: f.rating_kva || null,
      motor_component: f.motor_component || null, starter_component: f.starter_component || null, panel_component: f.panel_component || null, load_component: f.load_component || null,
      pump: f.pump_rated_flow_m3h ? { flow_m3h: f.pump_rated_flow_m3h, head_m: f.pump_rated_head_m, fluid: f.fluid || '', basis: f.basis || 'REPRESENTATIVE' } : null,
    }
    if (toBus) state.feeders[f.id].in_rating_kva = f.rating_kva || f.load_kw / 0.85
  }
  // exciter field current scaling: rated field current = top of the db normal range of AVR-IF (S14), else REPRESENTATIVE
  const s14 = (db.systems || []).find((x) => x.id === 'S14')
  const mIf = (s14?.measurements || []).find((m) => /field current|IF\b/i.test(`${m.tag} ${m.name}`))
  const ifn = mIf ? (String(mIf.normal || '').match(/-?\d+(\.\d+)?/g) || []).map(Number) : []
  const ifRated = ifn.length ? ifn[ifn.length - 1] : 4
  state.excitation = { if_rated_a: ifRated, if_nl_a: ifRated / 2.53, if_alarm_a: mIf ? firstNumber(mIf.alarm, ifRated * 1.25) : ifRated * 1.25, basis: mIf ? 'db S14 AVR-IF normal range' : 'REPRESENTATIVE' }
  if (!mIf) ctx.gap('S14 exciter field current range not in db: REPRESENTATIVE 4 A rated used')
  const oel = String(avrCfg.limits || '').match(/(\d+(\.\d+)?)\s*x\s*rated field current for\s*(\d+)\s*s/i)
  state.excitation.oel_x = oel ? Number(oel[1]) : 1.6
  state.excitation.oel_s = oel ? Number(oel[3]) : 10
  for (const id of state.genOrder) state.gens[id]._ifnl = state.excitation.if_nl_a
  state.islands = []
  state.islandCtl = {}
  state.testLoads = {}
  state.sync = { gen: null, mode: 'auto', active: false, permissive: false, status: 'Idle', closeAt: null }
  state.lastPowerBalance = { gen_kw: 0, load_kw: 0, loss_kw: 0, error_kw: 0 }
}

// ---------- helpers ----------
export function genAvailable(g, state) {
  const br = state.breakers[g.breaker]
  return !g.faults.gcp_comm && !g.lockout && g.engine !== 'shutdown' && g.control === 'remote' && (!br || (br.racked === 'service' && !br.tripped)) && !g.faults.estop
}
export function busOfFeeder(state, f) { return state.buses[f.bus] }
export function islandOfBus(state, busId) { return state.islands.find((i) => i.buses.includes(busId)) || null }

function setStatus(g) {
  const map = { stopped: 'Stopped', prelube: 'Pre-lubrication', cranking: 'Cranking', accelerating: 'Accelerating', running: g.online ? 'On load' : g.ready ? 'Ready to sync' : 'Running, no load', cooldown: 'Cooling down', stopping: 'Stopping', shutdown: 'Shutdown', fail_start: 'Fail to start' }
  g.status = map[g.engine] || g.engine
}

export function genStart(ctx, g, by = 'operator') {
  if (g.lockout || g.engine === 'shutdown') { ctx.event('S12', `${g.id} start refused: shutdown or lockout active, reset required`, 'high'); return false }
  if (g.faults.estop) { ctx.event('S12', `${g.id} start refused: emergency stop active`, 'high'); return false }
  if (['prelube', 'cranking', 'accelerating', 'running'].includes(g.engine)) { g.gov.unloading = false; return true }
  g.engine = 'prelube'; g.engineTimer = 0; g.startRequestedBy = by; g.starts++
  g.gov.fref = ctx.state.nominal.f_hz; g.gov.u = 0; g.avr.excitation = false; g.gov.unloading = false; g.gov.ramp = 0
  ctx.event('S12', `${g.id} start sequence initiated by ${by}`)
  return true
}
export function genStop(ctx, g, by = 'operator') {
  if (g.online) { g.gov.unloading = true; ctx.event('S02', `${g.id} unloading before stop (${by})`); g.stopAfterUnload = true; return true }
  if (['prelube', 'cranking', 'accelerating', 'running'].includes(g.engine)) { g.engine = 'cooldown'; g.engineTimer = 0; ctx.event('S12', `${g.id} cooldown then stop (${by})`); return true }
  return false
}
export function genShutdown(ctx, g, cause) {
  if (g.engine === 'shutdown') return
  g.engine = 'shutdown'; g.shutdownCause = cause; g.ready = false; g.avr.excitation = false; g.gov.unloading = false
  ctx.event('S12', `${g.id} SHUTDOWN: ${cause}`, 'critical')
  if (g.breaker) breakerTrip(ctx, g.breaker, `engine shutdown (${cause})`)
}
export function genReset(ctx, g) {
  const f = g.faults
  if (f.estop) { ctx.event('S12', `${g.id} reset refused: emergency stop still active`, 'high'); return false }
  if (g.engine === 'shutdown' && g.speed_rpm > 5) { ctx.event('S12', `${g.id} reset refused: engine still running down`); return false }
  if (g.engine === 'shutdown' || g.engine === 'fail_start') { g.engine = 'stopped'; g.shutdownCause = null }
  g.lockout = false
  const br = ctx.state.breakers[g.breaker]
  if (br && br.tripped) { br.tripped = false; br.cause = 'reset' }
  ctx.event('S12', `${g.id} shutdown and lockout reset`)
  return true
}

export function breakerTrip(ctx, id, cause, latch = true) {
  const b = ctx.state.breakers[id]
  if (!b) return
  const was = b.state
  b.state = 'open'; b.tripped = b.tripped || latch; b.cause = cause
  if (was === 'closed') { b.ops++; ctx.event(systemForBreaker(b), `${b.name} TRIPPED: ${cause}`, 'high') }
  const g = ctx.state.gens[b.from] || ctx.state.gens[b.to]
  if (g) { g.online = false; g.gov.unloading = false; g.stopAfterUnload = false }
}
export function breakerOpen(ctx, id, cause = 'operator') {
  const b = ctx.state.breakers[id]
  if (!b || b.state !== 'closed') return false
  b.state = 'open'; b.cause = cause; b.ops++
  const g = ctx.state.gens[b.from] || ctx.state.gens[b.to]
  if (g) { g.online = false; g.gov.unloading = false }
  const f = ctx.state.feeders[b.to] || ctx.state.feeders[b.from]
  if (f) f.inrush = null
  ctx.event(systemForBreaker(b), `${b.name} opened (${cause})`)
  return true
}
function systemForBreaker(b) { return b.kind === 'generator' || b.kind === 'tie' ? 'S02' : 'S02' }

// Check whether a breaker may close now; returns {ok, reason, mode}
export function closePermissive(state, b) {
  if (!b) return { ok: false, reason: 'unknown breaker' }
  if (b.state === 'closed') return { ok: false, reason: 'already closed' }
  if (b.tripped) return { ok: false, reason: 'tripped: reset lockout first' }
  if (b.racked !== 'service') return { ok: false, reason: `racked to ${b.racked}` }
  if (b.kind === 'generator') {
    const g = state.gens[b.from] || state.gens[b.to]
    const bus = state.buses[g.bus]
    if (!g.ready) return { ok: false, reason: `${g.id} not ready (speed or voltage outside band)` }
    if (!bus.live) {
      const other = Object.values(state.gens).find((o) => o !== g && o.closingDeadBus && o.bus === g.bus)
      if (other) return { ok: false, reason: 'dead bus interlock: another set is closing' }
      return { ok: true, mode: 'dead bus' }
    }
    const w = state.syncWindow
    const okSlip = Math.abs(g.slip_hz) <= w.slip_hz, okV = Math.abs(g.dv_pct) <= w.dv_pct, okA = Math.abs(g.phase_deg) <= w.angle_deg
    if (okSlip && okV && okA) return { ok: true, mode: 'check-sync' }
    return { ok: false, reason: `check-sync (25) blocks: slip ${g.slip_hz.toFixed(2)} Hz, dV ${g.dv_pct.toFixed(1)} %, angle ${g.phase_deg.toFixed(0)} deg` }
  }
  // incomer / bus tie interlock (two out of three): never parallel two transformers through the LV tie
  if (b.kind === 'tie' || b.kind === 'incomer') {
    const inc = (bus) => Object.values(state.breakers).find((x) => x.kind === 'incomer' && x.to === bus)
    if (b.kind === 'tie') {
      const i1 = inc(b.from), i2 = inc(b.to)
      if (i1 && i2 && i1.state === 'closed' && i2.state === 'closed') return { ok: false, reason: 'interlock: both incomers closed (2 out of 3 interlock)' }
    } else {
      const tie = Object.values(state.breakers).find((x) => x.kind === 'tie' && (x.from === b.to || x.to === b.to) && x.state === 'closed')
      if (tie) { const other = inc(tie.from === b.to ? tie.to : tie.from); if (other && other.state === 'closed') return { ok: false, reason: 'interlock: bus tie and other incomer closed (2 out of 3 interlock)' } }
      return { ok: true, mode: 'incomer' }
    }
  }
  if (b.kind === 'tie') {
    const A = state.buses[b.from], B = state.buses[b.to]
    if (!A.live || !B.live) return { ok: true, mode: 'one side dead' }
    if (A.island === B.island) return { ok: true, mode: 'same island' }
    const df = Math.abs(A.f_hz - B.f_hz), dv = (Math.abs(A.v_kv - B.v_kv) / A.vn_kv) * 100
    if (df <= 0.05 && dv <= state.syncWindow.dv_pct) return { ok: true, mode: 'check-sync (simplified)' }
    return { ok: false, reason: `check-sync across bus tie blocks: dF ${df.toFixed(2)} Hz, dV ${dv.toFixed(1)} %` }
  }
  return { ok: true, mode: 'feeder' }
}

export function breakerClose(ctx, id, by = 'operator') {
  const { state } = ctx
  const b = state.breakers[id]
  const p = closePermissive(state, b)
  if (!p.ok) {
    const cls = String(p.reason).split(':')[0]
    if (!b || (b.closeBlockedClass !== cls || state.t - (b.closeBlockedT ?? -99) > 30)) { ctx.event('S02', `${b ? b.name : id} close blocked: ${p.reason}`, 'low'); if (b) { b.closeBlockedClass = cls; b.closeBlockedT = state.t } }
    if (b) b.closeBlockedReason = p.reason
    return false
  }
  b.state = 'closed'; b.ops++; b.cause = by; b.closeBlockedReason = ''
  const g = state.gens[b.from] || state.gens[b.to]
  if (g) {
    g.online = true; g.gov.ramp = 0.02; g.gov.unloading = false; g.phase_deg = 0
    const bus = state.buses[g.bus]
    if (!bus.live) { g.closingDeadBus = true; g.gov.ramp = 1.1 }
    ctx.event('S02', `${g.id} breaker closed (${p.mode}, ${by})`)
  }
  const f = state.feeders[b.to] || state.feeders[b.from]
  if (f) {
    f.shedBy = null; f.uvTripped = false
    if (f.kind === 'motor') f.inrush = { t: 0, T: f.start_s }
    ctx.event('S02', `${f.name} connected (${by})`)
  }
  if (b.kind === 'tie') ctx.event('S02', `Bus tie closed (${p.mode})`)
  return true
}

// ---------- step ----------
export function stepElectrical(ctx, dt) {
  const { state } = ctx
  const fn = state.nominal.f_hz
  const gens = state.genOrder.map((id) => state.gens[id])

  // aggregated additional consumers (scenario 'rising load'): spread over the live buses, not seen by feeder relays
  if (state.loadRamp) { const R = state.loadRamp; const k = clamp((state.t - R.t0) / R.T, 0, 1); state.extraLoad_kw = R.kw * k } else state.extraLoad_kw = 0
  // 1. engine sequences (speed handled below)
  for (const g of gens) engineSequence(ctx, g, dt)

  // 2. feeder demand (noise is a slow bounded random walk, VFD feeders are set by the drives model)
  if (Math.floor(state.t * 10) % 10 === 0) {
    for (const f of Object.values(state.feeders)) f.noise = clamp(f.noise + (ctx.rng() - 0.5) * 0.012, 0.97, 1.03)
  }
  // 3. islands
  buildIslands(state)

  // 4. loads per island and losses
  for (const isl of state.islands) computeIslandLoad(state, isl, dt)

  // 5. governor and swing equation, substepped
  const h = dt / SUBSTEPS
  for (let s = 0; s < SUBSTEPS; s++) {
    for (const isl of state.islands) {
      const on = isl.gens.map((id) => state.gens[id])
      if (!on.length) continue
      const ctl = islandCtl(state, isl, on)
      let sumPm = 0, sumM = 0
      const f = isl.f
      ctl.u = clamp(ctl.u + (DEFAULTS.gov_ki * ctl.ki * (fn - f) / fn) * h, -0.1, 1.15)
      for (const g of on) {
        const pmRef = governorRef(g, f, fn, ctl)
        g.pmRef = pmRef
        g.pm_kw += (pmRef - g.pm_kw) * (1 - Math.exp(-h / (g.gov.te / Math.max(0.2, g.gov.gain))))
        sumPm += g.pm_kw
        sumM += 2 * g.H * g.rating_kw
      }
      const pl = isl.load_kw + isl.loss_kw
      isl.f = clamp(f + (fn * (sumPm - pl) / sumM) * h, 0, fn * 1.25)
      for (const g of on) g.p_kw = g.pm_kw - (sumPm - pl) * ((2 * g.H * g.rating_kw) / sumM)
    }
    // isolated running sets (breaker open) accelerate on their own governor
    for (const g of gens) {
      if (g.online) continue
      freeSpeed(g, h, fn)
    }
  }
  // 6. electrical outputs per island
  for (const isl of state.islands) islandOutputs(ctx, state, isl, dt)
  for (const g of gens) if (!g.online) isolatedOutputs(g, state, fn)
  // 7. buses
  for (const b of Object.values(state.buses)) {
    const isl = islandOfBus(state, b.id)
    const live = !!isl && isl.gens.length > 0
    b.island = isl ? isl.id : null
    b.live = live
    b.f_hz = live ? isl.f : 0
    b.v_kv = live ? isl.v_pu * b.vn_kv : 0
    if (!live) b.deadTime += dt; else b.deadTime = 0
  }
  // 8. undervoltage release of motor feeders on dead bus
  for (const f of Object.values(state.feeders)) {
    const b = state.buses[f.bus]
    const br = state.breakers[f.breaker]
    if (br && br.state === 'closed' && b && b.deadTime > DEFAULTS.uv_motor_trip_s && f.kind === 'motor') {
      br.state = 'open'; br.cause = 'undervoltage release (dead bus)'; br.ops++; f.uvTripped = true; f.inrush = null
      ctx.event('S02', `${f.name} released on undervoltage (dead bus)`, 'high')
    }
  }
  // power flow through bus ties (net injection of the 'from' side bus)
  state.busFlow = {}
  for (const br of Object.values(state.breakers)) {
    if (br.kind !== 'tie' || br.state !== 'closed') continue
    let p = 0, q = 0
    for (const g of gens) if (g.online && g.bus === br.from) { p += g.p_kw; q += g.q_kvar }
    for (const f of Object.values(state.feeders)) if (f.bus === br.from && f.energised) { p -= f.p_kw; q -= f.q_kvar }
    state.busFlow[br.id] = { p, q }
  }
  // feeder currents from bus voltage
  for (const f of Object.values(state.feeders)) {
    const b = state.buses[f.bus]
    const s = Math.hypot(f.p_kw, f.q_kvar)
    f.i_a = f.energised && b && b.v_kv > 0.05 ? s / (Math.sqrt(3) * b.v_kv) : 0
    f.in_a = (f.in_rating_kva || f.rated_kw / f.pf) / (Math.sqrt(3) * (b ? b.vn_kv : 1))
  }
  // 9. synchroniser: phase, slip, auto sync
  stepSync(ctx, dt)
  // 10. power balance record
  let gk = 0, lk = 0, lo = 0
  for (const isl of state.islands) { if (!isl.gens.length) continue; gk += isl.gens.reduce((a, id) => a + state.gens[id].p_kw, 0); lk += isl.load_kw; lo += isl.loss_kw }
  state.lastPowerBalance = { gen_kw: gk, load_kw: lk, loss_kw: lo, error_kw: gk - lk - lo }
  for (const g of gens) { setStatus(g); if (['running', 'accelerating'].includes(g.engine)) g.running_hours += dt / 3600 }
}

function islandCtl(state, isl, on) {
  const key = isl.gens.slice().sort().join('+')
  let c = state.islandCtl[key]
  if (!c) {
    const iso = on.filter((g) => g.gov.mode === 'isoch')
    // continuity: the shared load sharing integrator starts at the highest current per unit load
    const u0 = iso.length ? Math.max(...iso.map((g) => g.pm_kw / g.rating_kw)) : 0
    c = state.islandCtl[key] = { u: u0, ki: 1 }
    for (const k of Object.keys(state.islandCtl)) if (k !== key && !state.islands.some((i) => i.gens.slice().sort().join('+') === k)) delete state.islandCtl[k]
  }
  c.ki = on.reduce((a, g) => a + g.gov.gain, 0) / on.length
  return c
}

function governorRef(g, f, fn, ctl) {
  const gv = g.gov
  if (g.faults.gov_actuator) return -0.1 * g.rating_kw // actuator failed to zero fuel: the set motors (friction and compression, REPRESENTATIVE 10 % of rating)
  if (['shutdown', 'stopped', 'stopping', 'fail_start'].includes(g.engine)) return -0.04 * g.rating_kw
  let pu
  if (gv.mode === 'isoch') pu = ctl.u + (gv.kp * gv.gain * (fn - f)) / fn
  else pu = (gv.fref - f) / (gv.droop * fn)
  // soft loading / unloading ramp
  const lim = gv.ramp
  pu = clamp(pu, -0.05, Math.min(1.1, lim))
  return pu * g.rating_kw
}

function freeSpeed(g, h, fn) {
  const gv = g.gov
  const run = ['accelerating', 'running', 'cooldown'].includes(g.engine)
  if (g.engine === 'cranking') { g.f_hz = approach(g.f_hz, 0.14 * fn, 2, h); g.pm_kw = 0; return }
  if (!run) { g.f_hz = Math.max(0, g.f_hz - fn * 0.08 * h); g.pm_kw = 0; return }
  // reference ramps (accelerating) then governs on its own
  const target = g.faults.overspeed ? fn * 1.2 : gv.fref + (g.faults.gov_bias ? 0.45 : 0)
  if (g.engine === 'accelerating') gv.ref = Math.min(target, (gv.ref || g.f_hz) + DEFAULTS.accel_rate_pu_s * fn * h)
  else gv.ref = target
  const err = (gv.ref - g.f_hz) / fn
  gv.u = clamp(gv.u + gv.ki * gv.gain * err * h, -0.05, 0.3)
  // isolated set: speed control towards the reference in both modes (droop only matters in parallel)
  const pmRef = g.faults.gov_actuator ? 0 : clamp(gv.u + gv.kp * gv.gain * err, -0.05, 0.3) * g.rating_kw
  g.pm_kw += (pmRef - g.pm_kw) * (1 - Math.exp(-h / gv.te))
  // no-load: small friction load 1 % rated keeps the model damped
  const friction = 0.01 * g.rating_kw * (g.f_hz / fn)
  g.f_hz = clamp(g.f_hz + (fn * (g.pm_kw - friction) / (2 * g.H * g.rating_kw)) * h, 0, fn * 1.3)
  g.p_kw = 0
}

function engineSequence(ctx, g, dt) {
  const fn = ctx.state.nominal.f_hz
  g.engineTimer += dt
  switch (g.engine) {
    case 'prelube': if (g.engineTimer >= DEFAULTS.prelube_s) { g.engine = 'cranking'; g.engineTimer = 0 } break
    case 'cranking':
      if (g.engineTimer >= DEFAULTS.crank_s) {
        if (g.faults.fail_to_start) { g.engine = 'fail_start'; g.engineTimer = 0; ctx.event('S12', `${g.id} FAIL TO START (no firing after crank)`, 'high') } else { g.engine = 'accelerating'; g.engineTimer = 0; g.gov.ref = g.f_hz; g.gov.u = 0.02 }
      }
      break
    case 'accelerating':
      if (g.f_hz > 0.9 * fn) g.avr.excitation = true
      if (g.f_hz >= 0.985 * fn && g.engineTimer > 2) { g.engine = 'running'; g.engineTimer = 0; ctx.event('S12', `${g.id} at rated speed`) }
      break
    case 'running':
      if (g.stopAfterUnload && !g.online) { g.stopAfterUnload = false; g.engine = 'cooldown'; g.engineTimer = 0 }
      break
    case 'cooldown': if (g.engineTimer >= DEFAULTS.cooldown_s) { g.engine = 'stopping'; g.engineTimer = 0; g.avr.excitation = false } break
    case 'stopping': if (g.f_hz <= 0.5) { g.engine = 'stopped'; g.engineTimer = 0; ctx.event('S12', `${g.id} stopped`) } break
    default: break
  }
  if (['stopped', 'stopping', 'shutdown', 'fail_start', 'prelube', 'cranking'].includes(g.engine)) g.avr.excitation = false
  if (g.engine === 'running') g.avr.excitation = true
  // unloading ramp
  const gv = g.gov
  if (g.online) {
    if (gv.unloading) {
      gv.ramp = Math.max(0.03, Math.min(gv.ramp, g.p_kw / g.rating_kw) - DEFAULTS.softload_pu_s * dt)
      if (g.p_kw / g.rating_kw <= 0.06) {
        const br = ctx.state.breakers[g.breaker]
        if (br) breakerOpen(ctx, br.id, 'unloaded by PMS')
        gv.unloading = false; gv.ramp = 1.1
      }
    } else gv.ramp = Math.min(1.1, gv.ramp + DEFAULTS.softload_pu_s * dt)
  }
  g.speed_rpm = (g.f_hz / fn) * g.rpm_rated
}

function buildIslands(state) {
  const parent = {}
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])))
  const unite = (a, b) => { parent[find(a)] = find(b) }
  for (const id of Object.keys(state.buses)) parent[id] = id
  for (const b of Object.values(state.breakers)) if (b.kind === 'tie' && b.state === 'closed') unite(b.from, b.to)
  for (const f of Object.values(state.feeders)) {
    if (!f.to_bus) continue
    const br = state.breakers[f.breaker]
    const sec = Object.values(state.breakers).find((x) => (x.from === f.id && x.to === f.to_bus) || (x.to === f.id && x.from === f.to_bus))
    if (br && br.state === 'closed' && (!sec || sec.state === 'closed')) unite(f.bus, f.to_bus)
  }
  const groups = {}
  for (const id of Object.keys(state.buses)) (groups[find(id)] ||= []).push(id)
  const prev = state.islands
  state.islands = Object.values(groups).map((buses, i) => {
    const gens = state.genOrder.filter((gid) => { const g = state.gens[gid]; return g.online && buses.includes(g.bus) })
    const old = prev.find((p) => p.buses.some((b) => buses.includes(b)) && p.gens.length && gens.some((x) => p.gens.includes(x)))
    const f0 = old ? old.f : gens.length ? state.gens[gens[0]].f_hz : 0
    return { id: `I${i + 1}`, buses, gens, f: f0, v_pu: old ? old.v_pu : 0, dip: old ? old.dip : 0, prevQ: old ? old.prevQ : 0, load_kw: 0, loss_kw: 0, q_kvar: 0, cap_kw: 0, load_pct: 0 }
  })
}

function computeIslandLoad(state, isl, dt) {
  let p = 0, q = 0, through = 0, trRating = 0
  const live = isl.gens.length > 0
  for (const f of Object.values(state.feeders)) {
    if (!isl.buses.includes(f.bus)) continue
    const br = state.breakers[f.breaker]
    const closed = br ? br.state === 'closed' : true
    f.energised = live && closed
    if (!f.energised) { f.p_kw = 0; f.q_kvar = 0; continue }
    if (f.to_bus) { trRating += f.rated_kw; continue } // transformer: load is the downstream bus, accounted there
    let pk = f.kind === 'vfd' ? f.demand_kw : f.rated_kw * f.noise * (state.loadScale ?? 1)
    let qk = pk * Math.tan(Math.acos(f.pf))
    if (f.inrush) {
      f.inrush.t += dt
      const k = f.inrush.t / f.inrush.T
      if (k >= 1) f.inrush = null
      else {
        const sRated = f.rated_kw / f.pf
        const s = sRated * (f.start_x - (f.start_x - 1) * k * k)
        const pfS = DEFAULTS.motor_start_pf + (f.pf - DEFAULTS.motor_start_pf) * k
        pk = Math.max(pk * k, s * pfS * 0.6)
        qk = Math.sqrt(Math.max(0, s * s - pk * pk))
      }
    }
    if (f.fault && f.fault.kind === 'overcurrent') { const s = f.fault.x * (f.rated_kw / f.pf); pk = s * 0.15; qk = s * 0.989 }
    f.p_kw = pk; f.q_kvar = qk
    p += pk; q += qk
  }
  // transformer throughput and test load
  for (const f of Object.values(state.feeders)) {
    if (!f.to_bus || !isl.buses.includes(f.bus) || !f.energised) continue
    const dn = Object.values(state.feeders).filter((x) => x.bus === f.to_bus && x.energised && !x.to_bus)
    const tp = dn.reduce((a, x) => a + x.p_kw, 0)
    const tq = dn.reduce((a, x) => a + x.q_kvar, 0)
    f.p_kw = tp + DEFAULTS.tr_noload * f.rated_kw + DEFAULTS.tr_load * tp
    f.q_kvar = tq + 0.04 * f.rated_kw
    if (f.fault && f.fault.kind === 'overcurrent') { const sF = f.fault.x * (f.in_rating_kva || f.rated_kw / f.pf); f.p_kw += sF * 0.15; f.q_kvar += sF * 0.989; p += sF * 0.15; q += sF * 0.989 }
    through += tp
    q += 0.04 * f.rated_kw
  }
  for (const b of isl.buses) if (state.testLoads[b] && live) {
    const kw = state.testLoads[b]
    const M = state.testMotor && state.testMotor.bus === b ? state.testMotor : null
    if (M && M.t < M.T) { M.t += dt; const k = M.t / M.T; const sk = (kw / 0.85) * (M.x - (M.x - 1) * k * k); const pk = Math.max(kw * k, sk * 0.3 * 0.6); p += pk; q += Math.sqrt(Math.max(0, sk * sk - pk * pk)) }
    else { p += kw; q += M ? kw * 0.62 : 0 }
  }
  if (live && state.extraLoad_kw) { const nb = Object.values(state.buses).filter((b) => !Object.values(state.feeders).some((f) => f.to_bus === b.id)).length || 1; const mine = isl.buses.filter((b) => !Object.values(state.feeders).some((f) => f.to_bus === b)).length; p += (state.extraLoad_kw * mine) / nb; q += (0.6 * state.extraLoad_kw * mine) / nb }
  isl.load_kw = p
  isl.q_kvar = q
  isl.loss_kw = live ? DEFAULTS.loss_cable * p + DEFAULTS.tr_noload * trRating + DEFAULTS.tr_load * through : 0
  isl.cap_kw = isl.gens.reduce((a, id) => a + state.gens[id].rating_kw, 0)
  isl.load_pct = isl.cap_kw ? (100 * (isl.load_kw + isl.loss_kw)) / isl.cap_kw : 0
}

function islandOutputs(ctx, state, isl, dt) {
  const fn = state.nominal.f_hz
  const on = isl.gens.map((id) => state.gens[id])
  if (!on.length) { isl.v_pu = 0; isl.f = 0; return }
  const sumS = on.reduce((a, g) => a + g.rating_kva, 0)
  // AVR effective setpoints (pu)
  const vsetPu = on.map((g) => avrEffectiveSet(ctx, g))
  const vavg = on.reduce((a, g, i) => a + g.rating_kva * vsetPu[i], 0) / sumS
  const dq = on.map((g, i) => g.rating_kva * clamp((vsetPu[i] - vavg) / g.avr.droop_q, -1.2, 1.2))
  const dqMean = dq.reduce((a, x) => a + x, 0) / sumS
  const qL = isl.q_kvar
  on.forEach((g, i) => { g.q_kvar = (qL * g.rating_kva) / sumS + dq[i] - dqMean * g.rating_kva })
  const qpu = qL / sumS
  const droopAvg = on.reduce((a, g) => a + g.avr.droop_q * g.rating_kva, 0) / sumS
  const target = vavg * (1 - droopAvg * qpu * 0.25) * Math.min(1, isl.f / fn)
  // dynamic dip on reactive steps, recovering with the AVR time constant
  const dQ = qpu - isl.prevQ
  isl.prevQ = qpu
  isl.dip += 0.22 * dQ
  const gainAvg = on.reduce((a, g) => a + g.avr.gain, 0) / on.length
  isl.dip *= Math.exp(-dt / (DEFAULTS.avr_t_s / Math.max(0.2, gainAvg)))
  isl.v_pu = clamp(target - isl.dip, 0, 1.4)
  for (const g of on) {
    g.f_hz = isl.f
    g.v_kv = isl.v_pu * g.vn_kv
    genCurrents(g)
    avrLimits(ctx, g, dt)
    g.phase_deg = 0; g.slip_hz = 0; g.dv_pct = 0
    if (g.closingDeadBus) g.closingDeadBus = false
  }
}

function avrEffectiveSet(ctx, g) {
  const a = g.avr
  if (!a.excitation && !['running', 'accelerating', 'cooldown'].includes(g.engine)) return 0.02
  if (a.sensing === 'lost') {
    const v = ctx.state.variant?.S14 || 'retrofit'
    if (v === 'legacy') return 1.3 // analogue AVR sees zero feedback: excitation drives to ceiling
    if (a.mode !== 'fcr') { a.mode = 'fcr'; a.fcr_v = g.v_kv / g.vn_kv || 1; ctx.event('S14', `${g.id} AVR sensing loss detected: transferred to field current regulation (FCR)`, 'high') }
    return a.fcr_v
  }
  if (a.mode === 'fcr' && a.fcr_v != null) return a.fcr_v
  return a.v_set / g.vn_kv
}

function genCurrents(g) {
  const s = Math.hypot(g.p_kw, g.q_kvar)
  g.i_a = g.v_kv > 0.05 ? s / (Math.sqrt(3) * g.v_kv) : 0
  g.pf = s > 1 ? g.p_kw / s : 0
  const u = g.faults.unbalance ? 0.25 : 0
  g.i_ph = [g.i_a * (1 + u), g.i_a * (1 - u * 0.6), g.i_a * (1 - u * 0.4)]
  const vpu = g.v_kv / g.vn_kv || 0
  const ppu = g.p_kw / g.rating_kva, qpu = g.q_kvar / g.rating_kva
  g.e_pu = vpu > 0.05 ? Math.hypot(vpu + (DEFAULTS.xd_pu * qpu) / vpu, (DEFAULTS.xd_pu * ppu) / vpu) : 0
  g.if_a = g.avr.excitation ? (g._ifnl || 1.58) * g.e_pu : 0
  // actuator position: about 15 % at no load, 85 % at rated load (db S15 normal 20 to 85 %)
  const dem = g.pmRef != null ? g.pmRef : g.pm_kw
  g.act_pct = clamp(15 + (70 * Math.max(g.pm_kw, dem * 0.98)) / g.rating_kw, 0, 100)
  if (['stopped', 'shutdown', 'stopping', 'fail_start'].includes(g.engine) || g.faults.gov_actuator) g.act_pct = g.faults.gov_actuator ? 0 : 0
  g.rack_pct = g.act_pct
}

function avrLimits(ctx, g, dt) {
  const qpu = g.q_kvar / g.rating_kva
  const a = g.avr
  const X = ctx.state.excitation
  // over-excitation: field forcing up to oel_x x rated is allowed for oel_s seconds (db), then the limiter acts
  if (g.if_a > 1.05 * X.if_rated_a) a.oelTimer += dt; else a.oelTimer = 0
  a.limit = g.if_a > X.oel_x * X.if_rated_a || a.oelTimer > X.oel_s ? 'OEL' : qpu < DEFAULTS.uel_q_pu ? 'UEL' : ''
  const legacy = (ctx.state.variant?.S14 || 'retrofit') === 'legacy'
  if (legacy && a.oelTimer > X.oel_s) { a.oelTimer = 0; ctx.event('S14', `${g.id} legacy AVR field over-current protection operated`, 'critical'); breakerTrip(ctx, g.breaker, 'field over-current (legacy AVR)'); g.lockout = true }
}

function isolatedOutputs(g, state, fn) {
  const run = ['accelerating', 'running', 'cooldown'].includes(g.engine)
  const a = g.avr
  let vpu = 0
  if (run && a.excitation) {
    const set = a.sensing === 'lost' ? ((state.variant?.S14 || 'retrofit') === 'legacy' ? 1.3 : (a.fcr_v ?? 1)) : a.mode === 'fcr' && a.fcr_v != null ? a.fcr_v : a.v_set / g.vn_kv
    vpu = set * Math.min(1, g.f_hz / fn)
  } else if (g.f_hz > 1) vpu = 0.02
  g.v_kv = approach(g.v_kv, vpu * g.vn_kv, 3, 0.1)
  g.p_kw = 0; g.q_kvar = 0
  genCurrents(g)
  const bus = state.buses[g.bus]
  g.ready = run && g.engine === 'running' && Math.abs(g.f_hz - fn) < 0.02 * fn && Math.abs(g.v_kv / g.vn_kv - 1) < 0.06 && !g.lockout
  if (g.engine !== 'running') g.ready = false
  if (!bus) g.ready = false
}

function stepSync(ctx, dt) {
  const { state } = ctx
  const w = state.syncWindow
  for (const g of Object.values(state.gens)) {
    if (g.online) continue
    const bus = state.buses[g.bus]
    if (!bus || !bus.live || !['running', 'accelerating'].includes(g.engine)) { g.slip_hz = 0; g.dv_pct = 0; continue }
    g.slip_hz = g.f_hz - bus.f_hz
    g.dv_pct = ((g.v_kv - bus.v_kv) / g.vn_kv) * 100
    g.phase_deg = ((((g.phase_deg + 360 * g.slip_hz * dt) % 360) + 540) % 360) - 180
  }
  const s = state.sync
  if (!s.active || !s.gen) { s.permissive = false; return }
  const g = state.gens[s.gen]
  if (!g || g.online) { s.active = false; s.status = g && g.online ? 'Synchronised, breaker closed' : 'Idle'; return }
  const bus = state.buses[g.bus]
  if (!g.ready && g.engine !== 'running') { s.status = 'Waiting for set to reach rated speed'; return }
  if (!bus.live) {
    s.status = 'Bus dead: dead bus closing'
    if (s.mode === 'auto' && g.ready) { breakerClose(ctx, g.breaker, 'synchroniser (dead bus)'); s.active = false }
    return
  }
  const okSlip = Math.abs(g.slip_hz) <= w.slip_hz, okV = Math.abs(g.dv_pct) <= w.dv_pct, okA = Math.abs(g.phase_deg) <= w.angle_deg
  s.permissive = okSlip && okV && okA && g.ready
  if (s.mode === 'auto') {
    // speed matching: aim for a small positive slip so the angle sweeps slowly through zero
    const targetSlip = 0.06
    if (!g.faults.gov_bias) g.gov.fref += clamp((bus.f_hz + targetSlip - g.f_hz) * 0.8, -0.2, 0.2) * dt
    g.avr.v_set += clamp((bus.v_kv - g.v_kv) * 0.8, -0.1, 0.1) * dt
    s.status = s.permissive ? 'In window: closing' : `Matching: slip ${g.slip_hz.toFixed(2)} Hz, dV ${g.dv_pct.toFixed(1)} %, angle ${g.phase_deg.toFixed(0)} deg`
    // close when inside window and the angle is approaching zero (advance angle concept)
    if (s.permissive && Math.abs(g.phase_deg) < w.angle_deg * 0.6) {
      breakerClose(ctx, g.breaker, 'auto synchroniser')
      s.active = false; s.status = 'Synchronised, breaker closed'
    }
  } else {
    s.status = s.permissive ? 'Manual: check-sync permissive, operator may close' : 'Manual: adjust speed and voltage'
  }
}
