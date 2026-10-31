// Simulation engine entry point. createSim(db) -> sim
// Single source of truth for every HMI and 3D screen value. Fixed step 10 Hz, deterministic for a seed.
// EDUCATIONAL SIMULATION: not live vessel control, not OEM logic.

import { mulberry32, getPath, Ring, clamp, fmtClock } from './util.js'
import { initElectrical, stepElectrical, breakerClose, breakerOpen, breakerTrip, genAvailable } from './electrical.js'
import { initPms, stepPms, pmsCommands } from './pms.js'
import { initRelays, stepRelays, relayCommands, runSimTimers } from './relays.js'
import { initEngines, stepEngines, engineCommands } from './engine.js'
import { initOmd, stepOmd, omdCommands } from './omd.js'
import { initDrives, stepDrives, driveCommands } from './drives.js'
import { initBoiler, stepBoiler, boilerCommands, initIgg, stepIgg, iggCommands } from './process.js'
import { initIcss, stepIcss, icssCommands } from './icss.js'
import { initPaga, stepPaga, pagaCommands, initPabx, stepPabx, pabxCommands, initIptv, stepIptv, iptvCommands, initCctv, stepCctv, cctvCommands } from './telecom.js'
import { scenarioCommands, listScenarios, establishNormal } from './scenarios.js'
import { resolveAlarm } from './alarmmap.js'

export const DT = 0.1
export const SIM_DISCLAIMER = 'EDUCATIONAL SIMULATION: not live vessel control, not OEM logic'

export function createSim(db, opts = {}) {
  const seed = opts.seed ?? 20261030
  const bus = opts.bus || null
  let rng = mulberry32(seed)
  let state
  let timer = null
  const subs = new Map() // path -> Set(fn)
  let commands = {}
  const gaps = new Set()

  const ctx = {
    db,
    get state() { return state },
    rng: () => rng(),
    gap: (text) => { if (!gaps.has(text)) { gaps.add(text); state && state.dataGaps.push(text) } },
    event: (systemId, text, severity = 'info') => {
      const e = { t: state.t, clock: fmtClock(state.t), systemId, text, severity }
      state.events.unshift(e)
      if (state.events.length > 400) state.events.pop()
    },
    alarm: (systemId, code, text, severity, active, extra = {}) => setAlarm(systemId, code, text, severity, active, extra),
    command: (name, args) => command(name, args),
  }

  function setAlarm(systemId, code, text, severity, active, extra) {
    const id = `${systemId}:${code}`
    const ex = state.alarmIndex[id]
    if (active) {
      if (!ex || !ex.active) {
        const meta = resolveAlarm(db, systemId, code, text, severity)
        const a = ex || { id, systemId, code, dbCode: meta.dbCode, text: meta.text, severity: meta.severity, acked: false, shelvedUntil: 0, componentId: extra.componentId || null }
        a.active = true; a.tOn = state.t; a.clock = fmtClock(state.t); a.tOff = null; a.acked = false; a.liveText = text
        if (!ex) { state.alarmIndex[id] = a; state.alarms.unshift(a) }
        ctx.event(systemId, `ALARM ${a.text}`, a.severity)
        bus && bus.emit('sim:alarm', { systemId, code, text: a.text, severity: a.severity, active: true, componentId: a.componentId })
      } else ex.liveText = text
    } else if (ex && ex.active) {
      ex.active = false; ex.tOff = state.t
      bus && bus.emit('sim:alarm', { systemId, code, text: ex.text, severity: ex.severity, active: false })
      if (ex.acked) removeAlarm(id)
    }
  }
  function removeAlarm(id) {
    const a = state.alarmIndex[id]
    if (!a) return
    delete state.alarmIndex[id]
    const i = state.alarms.indexOf(a)
    if (i >= 0) state.alarms.splice(i, 1)
  }

  function init(loadCase) {
    rng = mulberry32(seed)
    gaps.clear()
    state = { t: 0, tick: 0, seed, disclaimer: SIM_DISCLAIMER, alarms: [], alarmIndex: {}, events: [], dataGaps: [], variant: {}, trends: {}, fast: {}, scenario: null, running: false }
    for (const s of db.systems || []) state.variant[s.id] = 'retrofit'
    initElectrical(ctx)
    initPms(ctx)
    initRelays(ctx)
    initEngines(ctx)
    initOmd(ctx)
    initDrives(ctx)
    initBoiler(ctx)
    initIgg(ctx)
    initIcss(ctx)
    initPaga(ctx)
    initPabx(ctx)
    initIptv(ctx)
    initCctv(ctx)
    for (const id of state.genOrder) {
      state.trends[id] = { kw: new Ring(300), hz: new Ring(300), kv: new Ring(300), kvar: new Ring(300) }
      state.fast[id] = { kw: new Ring(600), hz: new Ring(600), kv: new Ring(600), t: new Ring(600) }
    }
    state.trends.t = new Ring(300)
    state.trends.load = new Ring(300)
    commands = {
      ...baseCommands(), ...pmsCommands(ctx), ...relayCommands(ctx), ...engineCommands(ctx), ...omdCommands(ctx), ...driveCommands(ctx),
      ...boilerCommands(ctx), ...iggCommands(ctx), ...icssCommands(ctx), ...pagaCommands(ctx), ...pabxCommands(ctx), ...iptvCommands(ctx), ...cctvCommands(ctx),
      ...scenarioCommands(ctx, { reset: (lc) => { init(lc) }, settle }),
    }
    if (!opts.cold) { establishNormal(ctx, loadCase); settle(opts.settle_s ?? 60) }
  }

  // run silently to steady state, then clear the logs so the visitor starts from a clean normal state
  function settle(seconds) {
    const n = Math.round(seconds / DT)
    for (let i = 0; i < n; i++) step(true)
    state.events.length = 0
    for (const a of state.alarms.slice()) if (!a.active) removeAlarm(a.id); else a.acked = false
    state.t = 0; state.tick = 0
    for (const k of Object.keys(state.trends)) { const v = state.trends[k]; if (v instanceof Ring) v.a.length = 0; else for (const r of Object.values(v)) r.a.length = 0 }
    for (const v of Object.values(state.fast)) for (const r of Object.values(v)) r.a.length = 0
    if (state.pms) state.pms.timers.start = 0
  }

  function baseCommands() {
    const G = (id) => state.gens[id]
    return {
      'breaker.close': ({ id, by }) => breakerClose(ctx, id, by || 'operator'),
      'breaker.open': ({ id, by }) => breakerOpen(ctx, id, by || 'operator'),
      'breaker.trip': ({ id }) => { breakerTrip(ctx, id, 'manual trip push button'); return true },
      'breaker.rack': ({ id, pos }) => { const b = state.breakers[id]; if (!b || b.state === 'closed' || !['service', 'test', 'disconnected'].includes(pos)) return false; b.racked = pos; ctx.event('S02', `${b.name} racked to ${pos}`); return true },
      'gov.mode': ({ id, mode }) => { const g = G(id); if (!g || !['droop', 'isoch'].includes(mode)) return false; g.gov.mode = mode; if (mode === 'droop') g.gov.fref = g.f_hz + (g.gov.droop * state.nominal.f_hz * g.p_kw) / g.rating_kw; ctx.event('S15', `${id} governor mode ${mode === 'isoch' ? 'isochronous load sharing' : 'droop'}`); return true },
      'gov.fref': ({ id, delta, value }) => { const g = G(id); if (!g) return false; g.gov.fref = clamp(value != null ? Number(value) : g.gov.fref + Number(delta || 0), state.nominal.f_hz * 0.9, state.nominal.f_hz * 1.1); return true },
      'gov.gain': ({ id, gain }) => { const g = G(id); if (!g) return false; g.gov.gain = clamp(Number(gain), 0.3, 3); return true },
      'gov.droop': ({ id, pct }) => { const g = G(id); if (!g) return false; g.gov.droop = clamp(Number(pct), 1, 8) / 100; return true },
      'avr.setpoint': ({ id, delta, value }) => { const g = G(id); if (!g) return false; g.avr.v_set = clamp(value != null ? Number(value) : g.avr.v_set + Number(delta || 0), g.vn_kv * 0.9, g.vn_kv * 1.1); return true },
      'avr.gain': ({ id, gain }) => { const g = G(id); if (!g) return false; g.avr.gain = clamp(Number(gain), 0.3, 3); return true },
      'avr.droop': ({ id, pct }) => { const g = G(id); if (!g) return false; g.avr.droop_q = clamp(Number(pct), 1, 8) / 100; return true },
      'avr.mode': ({ id, mode }) => { const g = G(id); if (!g || !['auto', 'fcr'].includes(mode)) return false; g.avr.mode = mode; g.avr.fcr_v = mode === 'fcr' ? g.v_kv / g.vn_kv : null; ctx.event('S14', `${id} AVR mode ${mode === 'auto' ? 'AUTO (voltage regulation)' : 'FCR (field current regulation)'}`); return true },
      'sync.select': ({ gen, mode = 'auto' }) => { const g = G(gen); if (!g || g.online) return false; state.sync = { ...state.sync, gen, mode, active: true, t0: state.t, status: 'Selected' }; ctx.event('S02', `Synchroniser selected ${gen} (${mode})`); return true },
      'sync.cancel': () => { state.sync.active = false; state.sync.status = 'Cancelled'; return true },
      'sync.close': () => { const g = G(state.sync.gen); if (!g) return false; const ok = breakerClose(ctx, g.breaker, state.sync.mode === 'manual' ? 'manual sync with check-sync' : 'synchroniser'); if (ok) state.sync.active = false; return ok },
      'test.load_step': ({ bus: b, kw, motor }) => { const id = b || Object.keys(state.buses)[0]; state.testLoads[id] = Math.max(0, Number(kw) || 0); state.testMotor = motor ? { bus: id, t: 0, T: 4, x: 6 } : null; ctx.event(motor ? 'S14' : 'S15', `${motor ? 'Motor start' : 'Load bank step'} on ${id}: ${Math.round(state.testLoads[id])} kW (educational step response test)`); return true },
      'test.load_clear': () => { state.testLoads = {}; state.testMotor = null; ctx.event('S15', 'Test load removed'); return true },
      'fault.inject': (a) => injectFault(a),
      'fault.clear': (a) => injectFault({ ...a, clear: true }),
      'variant.set': ({ systemId, variant }) => {
        if (!['legacy', 'retrofit'].includes(variant)) return false
        const ids = systemId ? [systemId] : Object.keys(state.variant)
        for (const id of ids) state.variant[id] = variant
        ctx.event(systemId || 'ALL', `${systemId || 'All systems'} view: ${variant.toUpperCase()}`)
        return true
      },
      'alarm.ack': ({ id, systemId } = {}) => {
        const list = state.alarms.filter((a) => (id ? a.id === id : systemId ? a.systemId === systemId : true))
        for (const a of list) { a.acked = true; if (!a.active) removeAlarm(a.id) }
        return list.length > 0
      },
      'alarm.shelve': ({ id, seconds = 600 }) => { const a = state.alarmIndex[id]; if (!a) return false; a.shelvedUntil = state.t + seconds; ctx.event(a.systemId, `Alarm shelved: ${a.text}`); return true },
      'alarm.unshelve': ({ id }) => { const a = state.alarmIndex[id]; if (!a) return false; a.shelvedUntil = 0; return true },
      'gen.available': () => state.genOrder.filter((id) => genAvailable(state.gens[id], state)),
    }
  }

  function injectFault({ target, kind, clear, ...rest }) {
    const on = !clear
    const g = state.gens[target]
    if (g && ['unbalance', 'winding', 'gov_actuator', 'gov_bias', 'pickup', 'gcp_comm', 'avr_sensing', 'fail_to_start', 'lo_pressure', 'jw_high', 'overspeed', 'misfire', 'earth'].includes(kind)) {
      if (kind === 'avr_sensing') { g.avr.sensing = on ? 'lost' : 'ok'; if (!on) { g.avr.mode = 'auto'; g.avr.fcr_v = null } }
      else g.faults[kind] = on
      if (kind === 'misfire') g.faults.misfire_cyl = rest.cyl ?? 2
      ctx.event(kind === 'avr_sensing' ? 'S14' : kind === 'gov_actuator' || kind === 'overspeed' ? 'S15' : 'S12', `FAULT ${on ? 'injected' : 'cleared'}: ${target} ${kind.replace(/_/g, ' ')} (educational)`, on ? 'high' : 'low')
      return true
    }
    const f = state.feeders[target]
    if (f && ['overcurrent', 'earth', 'unbalance', 'internal'].includes(kind)) {
      f.fault = on ? { kind, x: rest.multiple ?? 3 } : null
      ctx.event('S03', `FAULT ${on ? 'injected' : 'cleared'}: ${f.name} ${kind} (educational)`, on ? 'high' : 'low')
      return true
    }
    const d = state.drives[target]
    if (d && ['jam', 'fan', 'dc_uv'].includes(kind)) { d.faults[kind] = on; ctx.event('S04', `FAULT ${on ? 'injected' : 'cleared'}: ${d.tag} ${kind}`, on ? 'high' : 'low'); return true }
    const blr = (state.boilers || []).find((b) => b.id === target) || (target === 'boiler' ? state.boiler : null)
    if (blr && ['scanner', 'feed_pump', 'fuel_pump', 'fuel_valve_stuck', 'fd_fan', 'no_ignition', 'air'].includes(kind)) { blr.faults[kind] = on; ctx.event('S10', `FAULT ${on ? 'injected' : 'cleared'}: ${blr.tag} ${kind.replace(/_/g, ' ')}`, on ? 'high' : 'low'); return true }
    if (target === 'igg' && ['lean', 'sw_low', 'seal_low', 'blower', 'analyser_drift', 'fuel', 'room_leak', 'derate'].includes(kind)) { state.igg.faults[kind] = on; ctx.event('S11', `FAULT ${on ? 'injected' : 'cleared'}: IGG ${kind.replace(/_/g, ' ')}`, on ? 'high' : 'low'); return true }
    return false
  }

  function command(name, args = {}) {
    const fn = commands[name]
    if (!fn) { if (state) ctx.event('SIM', `Unknown command ${name}`, 'low'); return false }
    try { return fn(args || {}) } catch (e) { ctx.event('SIM', `Command ${name} failed: ${e.message}`, 'low'); return false }
  }

  function step(silent = false) {
    runSimTimers(state)
    stepEngines(ctx, DT)
    stepDrives(ctx, DT)
    stepElectrical(ctx, DT)
    stepRelays(ctx, DT)
    stepPms(ctx, DT)
    stepOmd(ctx, DT)
    stepBoiler(ctx, DT)
    stepIgg(ctx, DT)
    stepIcss(ctx, DT)
    stepPaga(ctx, DT)
    stepPabx(ctx, DT)
    stepIptv(ctx, DT)
    stepCctv(ctx, DT)
    if (state.scenario && state.scenario.step) state.scenario.step(state.t)
    state.t = Math.round((state.t + DT) * 1000) / 1000
    state.tick++
    for (const id of state.genOrder) {
      const g = state.gens[id], f = state.fast[id]
      f.kw.push(g.p_kw); f.hz.push(g.f_hz); f.kv.push(g.v_kv); f.t.push(state.t)
    }
    if (state.tick % 10 === 0) {
      state.trends.t.push(state.t)
      state.trends.load.push(state.pms.load_kw)
      for (const id of state.genOrder) { const g = state.gens[id], T = state.trends[id]; T.kw.push(g.p_kw); T.hz.push(g.f_hz); T.kv.push(g.v_kv); T.kvar.push(g.q_kvar) }
    }
    state.clock = fmtClock(state.t)
    if (!silent) notify()
  }

  function notify() {
    for (const [path, set] of subs) {
      const v = getPath(state, path)
      for (const fn of set) { try { fn(v, state) } catch (e) { /* a broken view must not stop the sim */ } }
    }
    bus && bus.emit('sim:tick', { t: state.t })
  }

  init()

  const sim = {
    get state() { return state },
    db,
    dt: DT,
    start() { if (timer) return; state.running = true; timer = setInterval(() => step(), DT * 1000) },
    stop() { if (timer) clearInterval(timer); timer = null; if (state) state.running = false },
    get running() { return !!timer },
    step: () => step(),
    advance(seconds) { const n = Math.round(seconds / DT); for (let i = 0; i < n; i++) step(true); notify() },
    command,
    subscribe(path, fn) { if (!subs.has(path)) subs.set(path, new Set()); subs.get(path).add(fn); return () => subs.get(path)?.delete(fn) },
    scenarios: () => listScenarios(db),
    reset() { init(); notify() },
    gaps: () => state.dataGaps.slice(),
  }
  return sim
}
