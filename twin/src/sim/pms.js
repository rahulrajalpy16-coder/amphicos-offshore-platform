// Power management system model (S02). EDUCATIONAL SIMULATION, not OEM logic.
// Modes: auto (load dependent start/stop, blackout recovery), semi (operator starts/stops; PMS sequences,
// synchronises, shares load, sheds load), manual (operator does everything; protection and load shedding only).
// Architecture variant (state.variant.S02): 'retrofit' networked PMS, or 'legacy' hardwired relay logic
// (kW relay standby start, single preferential trip stage, dead bus start of one set, manual restart).
// Settings come from db.electrical.pms_settings (REPRESENTATIVE values).

import { firstNumber, clamp, allNumbers } from './util.js'
import { genAvailable, genStart, genStop, breakerClose, breakerOpen } from './electrical.js'

export function initPms(ctx) {
  const { db, state } = ctx
  const s = db.electrical?.pms_settings || {}
  const num = (v, d, name) => { const n = firstNumber(v, null); if (n == null) { ctx.gap(`pms_settings.${name} missing: REPRESENTATIVE ${d} used`); return d } return n }
  const stages = (s.load_shed_stages || []).map((x, i) => {
    const tr = String(x.trigger || '')
    const hz = tr.match(/(\d+(\.\d+)?)\s*Hz(\s*for\s*(\d+(\.\d+)?)\s*s)?/i)
    const ov = tr.match(/>\s*100\s*%[^,]*?for\s*(\d+(\.\d+)?)\s*s/i)
    return { stage: x.stage ?? i + 1, trigger: tr, sheds_priority: x.sheds_priority ?? 5 - i, delay_s: firstNumber(x.delay_s, i === 0 ? 2 : 3), fast_delay_s: firstNumber(x.fast_delay_s, 0.5), uf_hz: hz ? Number(hz[1]) : null, uf_s: hz && hz[4] ? Number(hz[4]) : 1, overload_s: ov ? Number(ov[1]) : firstNumber(x.delay_s, 2), onTrip: /generator (breaker )?trip/i.test(tr), isochOnly: /isochronous mode only/i.test(tr) }
  })
  if (!stages.length) { stages.push({ stage: 1, trigger: 'overload', sheds_priority: 5, delay_s: 0.5, uf_hz: null, uf_s: 1, overload_s: 2, onTrip: true }); ctx.gap('pms_settings.load_shed_stages missing: one REPRESENTATIVE stage used') }
  const br = String(s.blackout_restart || '')
  const deadPct = br.match(/<\s*(\d+)\s*%\s*for\s*(\d+(\.\d+)?)\s*s/)
  const apart = br.match(/(\d+(\.\d+)?)\s*s apart/)
  const needReset = br.match(/priority\s*([\d\s,and]+)\s*need operator reset/i)
  const stopCond = String(s.stop_condition || '').match(/below\s*(\d+(\.\d+)?)\s*%/)
  // priority order: sets whose breaker is normally closed (duty), then the database standby order
  const duty = state.genOrder.filter((id) => state.breakers[state.gens[id].breaker]?.normally === 'closed')
  const sOrder = (s.standby_order || []).filter((id) => state.gens[id] && !duty.includes(id))
  const prio = [...duty, ...sOrder, ...state.genOrder.filter((id) => !duty.includes(id) && !sOrder.includes(id))]
  state.pms = {
    mode: 'auto',
    priority: prio,
    settings: {
      start_pct: num(s.start_standby_load_pct, 85, 'start_standby_load_pct'),
      start_delay_s: num(s.start_delay_s, 10, 'start_delay_s'),
      stop_pct: num(s.stop_load_pct, 35, 'stop_load_pct'),
      stop_delay_s: num(s.stop_delay_s, 180, 'stop_delay_s'),
      stop_after_pct: stopCond ? Number(stopCond[1]) : 70,
      min_running: firstNumber(s.min_running, 2),
      hc_reserve_kw: firstNumber(s.heavy_consumer_reserve_kw, null),
      hc_margin_pct: firstNumber(s.heavy_consumer_margin_pct, 0),
      dead_pct: deadPct ? Number(deadPct[1]) : 30, dead_s: deadPct ? Number(deadPct[2]) : 1,
      restart_interval_s: apart ? Number(apart[1]) : 5,
      restart_max_priority: needReset ? Math.min(...allNumbers(needReset[1])) - 1 : 3,
      start_kva_ratio: firstNumber(s.motor_start_kva_ratio, 1.5),
      sync_timeout_s: firstNumber(s.sync_timeout_s, 45),
      governor_mode: /droop/i.test(s.governor_mode || '') && !/isoch/i.test(s.governor_mode || '') ? 'droop' : 'isoch',
      blackout_restart: br, basis: s.basis || 'REPRESENTATIVE',
    },
    stages,
    timers: { start: 0, stop: 0, overload: 0, restore: 0 },
    shed: { stage: 0, lastT: -999, stageT: -999 },
    hc: { requests: [] },
    blackout: { active: false, phase: 'normal', t: 0, queue: [], lastRestart: -999, count: 0 },
    controllers: { A: 'active', B: 'standby' },
    load_kw: 0, cap_kw: 0, load_pct: 0, available_kw: 0, online: 0, message: 'Normal', status: 'Automatic', persist: {}, prevGens: [], ufT: {},
  }
  for (const id of state.genOrder) state.gens[id].gov.mode = state.pms.settings.governor_mode
  if (s.heavy_consumer_reserve_kw == null) ctx.gap('pms_settings.heavy_consumer_reserve_kw missing: feeder rated kW used as required reserve')
  if (s.motor_start_kva_ratio == null) ctx.gap('Motor starting kVA limit not in db: REPRESENTATIVE 1.5 x online generator kVA used')
  if (s.sync_timeout_s == null) ctx.gap('Synchronising time-out not in db: REPRESENTATIVE 45 s used')
}

const arch = (state) => (state.variant?.S02 === 'legacy' ? 'legacy' : 'retrofit')
const pmsHealthy = (state) => state.pms.controllers.A !== 'failed' || state.pms.controllers.B !== 'failed'

export function pmsCommands(ctx) {
  const { state } = ctx
  return {
    'pms.mode': ({ mode }) => { if (!['auto', 'semi', 'manual'].includes(mode)) return false; state.pms.mode = mode; ctx.event('S02', `PMS mode set to ${mode.toUpperCase()}`); return true },
    'pms.priority': ({ order, first }) => {
      const p = state.pms
      if (Array.isArray(order) && order.length === p.priority.length) p.priority = order.slice()
      else if (first && p.priority.includes(first)) p.priority = [first, ...p.priority.filter((x) => x !== first)]
      ctx.event('S02', `Generator priority order: ${p.priority.join(' > ')}`)
      return true
    },
    'pms.hc_request': ({ feeder }) => requestHeavy(ctx, feeder, 'operator'),
    'pms.shed_reset': () => {
      const list = Object.values(state.feeders).filter((f) => f.shedBy || f.awaitReset)
      for (const f of list) { f.awaitReset = false; f.shedBy = f.shedBy || 'awaiting operator reset'; f.resetOk = true }
      state.pms.shed.stage = 0
      ctx.event('S02', 'Load shedding / blackout restart reset by operator: consumers reconnect when capacity allows')
      return true
    },
    'pms.settings': (args) => { Object.assign(state.pms.settings, args); ctx.event('S02', 'PMS settings changed'); return true },
    'pms.controller': ({ id = 'A', ok }) => {
      const c = state.pms.controllers
      if (ok) c[id] = Object.values(c).includes('active') ? 'standby' : 'active'
      else { c[id] = 'failed'; const other = id === 'A' ? 'B' : 'A'; if (c[other] === 'standby') c[other] = 'active' }
      ctx.event('S02', `PMS controller ${id} ${ok ? 'restored' : 'FAILED: hot standby controller took over'}`, ok ? 'low' : 'high')
      return true
    },
    'feeder.start': ({ feeder }) => {
      const f = state.feeders[feeder]
      if (!f) return false
      if (f.heavy && state.pms.mode !== 'manual' && arch(state) === 'retrofit') return requestHeavy(ctx, feeder, 'operator')
      const ok = state.breakers[f.breaker]?.state === 'closed' || breakerClose(ctx, f.breaker, 'operator')
      if (ok && f.drive && state.drives[f.drive]) state.drives[f.drive].run = true
      return ok
    },
    'feeder.stop': ({ feeder }) => { const f = state.feeders[feeder]; if (!f) return false; if (f.drive && state.drives[f.drive]) { state.drives[f.drive].run = false; return true } return breakerOpen(ctx, f.breaker, 'operator') },
  }
}

export function requestHeavy(ctx, feederId, by) {
  const { state } = ctx
  const f = state.feeders[feederId]
  if (!f) return false
  const br = state.breakers[f.breaker]
  const d = f.drive ? state.drives[f.drive] : null
  if (br && br.state === 'closed' && (!d || d.run)) return true
  if (state.pms.hc.requests.find((r) => r.feeder === feederId)) return true
  state.pms.hc.requests.push({ feeder: feederId, t: state.t, by, status: 'requested' })
  ctx.event('S02', `Heavy consumer start request: ${f.name} (${Math.round(f.rated_kw)} kW)`)
  return true
}

function onlineIn(gens, isl) { return gens.filter((g) => g.online && isl && isl.buses.includes(g.bus)) }
function persist(p, key, cond, dt, delay) { p.persist[key] = cond ? (p.persist[key] || 0) + dt : 0; return p.persist[key] >= delay }

export function stepPms(ctx, dt) {
  const { state } = ctx
  const p = state.pms
  const S = p.settings
  const fn = state.nominal.f_hz
  const legacy = arch(state) === 'legacy'
  const healthy = pmsHealthy(state)
  const gens = state.genOrder.map((id) => state.gens[id])
  const live = state.islands.filter((i) => gens.some((g) => g.online && i.buses.includes(g.bus)))
  for (const isl of live) { const on = onlineIn(gens, isl); isl.cap_kw = on.reduce((a, g) => a + g.rating_kw, 0); isl.load_pct = isl.cap_kw ? (100 * (isl.load_kw + isl.loss_kw)) / isl.cap_kw : 0 }
  p.load_kw = live.reduce((a, i) => a + i.load_kw + i.loss_kw, 0)
  p.cap_kw = live.reduce((a, i) => a + i.cap_kw, 0)
  p.load_pct = p.cap_kw ? (100 * p.load_kw) / p.cap_kw : 0
  p.online = gens.filter((g) => g.online).length
  p.available_kw = Math.max(0, p.cap_kw - p.load_kw)
  const starting = gens.filter((g) => !g.online && ['prelube', 'cranking', 'accelerating', 'running'].includes(g.engine) && (g.syncPending || (state.sync.gen === g.id && state.sync.active)))
  const standby = () => p.priority.map((id) => state.gens[id]).filter((g) => !g.online && genAvailable(g, state) && ['stopped', 'cooldown'].includes(g.engine) && !g.faults.gcp_comm)
  const avail = (isl) => isl.cap_kw * (1 - S.hc_margin_pct / 100) - isl.load_kw - isl.loss_kw

  // ---- blackout detection: all main buses below dead_pct for dead_s ----
  const mainBuses = Object.values(state.buses)
  const allDead = mainBuses.length > 0 && mainBuses.every((b) => b.v_kv < (S.dead_pct / 100) * b.vn_kv)
  p.deadT = allDead ? (p.deadT || 0) + dt : 0
  if (allDead && !p.blackout.active && mainBuses.some((b) => b.wasLive) && p.deadT >= S.dead_s) {
    p.blackout = { active: true, phase: 'detected', t: 0, queue: [], lastRestart: -999, count: p.blackout.count + 1 }
    ctx.event('S02', 'BLACKOUT detected: all main bus voltages below limit', 'critical')
    p.hc.requests = []
    // heavy consumers blocked and consumers of priority 3 to 5 opened (db blackout_restart)
    for (const f of Object.values(state.feeders)) {
      const b = state.breakers[f.breaker]
      if (!b || f.to_bus) continue
      const was = f.wasOnBeforeBlackout
      if (f.heavy || f.priority >= 3 || f.uvTripped) {
        if (b.state === 'closed') { b.state = 'open'; b.cause = 'PMS blackout: opened before restoration'; b.ops++ }
        if (f.drive && state.drives[f.drive]) state.drives[f.drive].run = false
        if (was) { if (f.priority <= S.restart_max_priority && !f.heavy) f.restart = true; else f.awaitReset = true }
      }
    }
  }
  if (!allDead) for (const f of Object.values(state.feeders)) f.wasOnBeforeBlackout = state.breakers[f.breaker]?.state === 'closed' && (!f.drive || !state.drives[f.drive] || state.drives[f.drive].run)
  for (const b of mainBuses) if (b.live) b.wasLive = true

  if (p.blackout.active) {
    const B = p.blackout
    B.t += dt
    const toRestore = () => {
      if (legacy) { B.phase = 'manual_restore'; return }
      B.phase = 'restoring'
      B.queue = [...new Set(Object.values(state.feeders).filter((f) => f.restart).map((f) => f.priority))].sort((a, b) => a - b)
      B.lastRestart = state.t
    }
    if (B.phase === 'detected') {
      if (p.mode !== 'manual' && healthy) {
        const runningNotOn = p.priority.map((id) => state.gens[id]).filter((g) => !g.online && genAvailable(g, state) && ['running', 'accelerating', 'cranking', 'prelube'].includes(g.engine))
        const sb = standby()
        const toStart = legacy ? sb.slice(0, runningNotOn.length ? 0 : 1) : sb
        toStart.forEach((g) => { genStart(ctx, g, legacy ? 'dead bus start relay' : 'PMS blackout recovery'); g.syncPending = true })
        runningNotOn.forEach((g) => { g.syncPending = true })
        B.phase = 'starting'
        ctx.event('S02', legacy ? 'Hardwired dead bus start of one standby set' : `PMS blackout recovery: ${toStart.length} standby set(s) started, ${runningNotOn.length} running set(s) available`, 'high')
      } else B.phase = 'manual'
    }
    if (B.phase === 'starting') {
      const anyLive = gens.some((g) => g.online)
      const ready = p.priority.map((id) => state.gens[id]).find((g) => g.ready && !g.online && genAvailable(g, state))
      if (anyLive) toRestore()
      else if (ready && breakerClose(ctx, ready.breaker, legacy ? 'dead bus closing relay' : 'PMS dead bus closing')) {
        ready.syncPending = false
        ctx.event('S02', `Dead bus closed by ${ready.id} (only one set may close on a dead bus)`, 'high')
        toRestore()
      }
      ctx.alarm('S02', 'PMS_BO_FAIL', 'Blackout recovery failed: no set ready', 'critical', B.t > 60 && !ready && !anyLive)
    }
    if (B.phase === 'restoring') {
      if (state.t - B.lastRestart >= S.restart_interval_s && B.queue.length) {
        const prio = B.queue[0]
        const group = Object.values(state.feeders).filter((f) => f.restart && f.priority === prio)
        for (const f of group) {
          f.restart = false; f.uvTripped = false; f.shedBy = null
          breakerClose(ctx, f.breaker, `PMS sequential restart (priority ${prio} group)`)
          if (f.drive && state.drives[f.drive]) state.drives[f.drive].run = true
        }
        if (group.length) ctx.event('S02', `Restart group priority ${prio}: ${group.map((f) => f.name).join(', ')}`)
        B.queue.shift(); B.lastRestart = state.t
      }
      if (!B.queue.length && state.t - B.lastRestart >= 1) {
        B.phase = 'complete'; B.active = false
        const waiting = Object.values(state.feeders).filter((f) => f.awaitReset)
        ctx.event('S02', `Blackout recovery complete${waiting.length ? `: ${waiting.length} consumers (priority 4 and 5 or heavy) await operator reset` : ''}`, 'high')
      }
      if (!gens.some((g) => g.online)) { B.phase = 'detected'; B.t = 0; ctx.event('S02', 'Bus lost again during recovery: restarting recovery sequence', 'critical') }
    }
    if ((B.phase === 'manual_restore' || B.phase === 'manual') && gens.some((g) => g.online)) {
      for (const f of Object.values(state.feeders)) if (f.restart) { f.restart = false; f.awaitReset = true }
      B.active = false; B.phase = 'complete'
      ctx.event('S02', 'Bus restored. Consumers must be restarted by the operator (legacy or manual mode)', 'high')
    }
  }
  ctx.alarm('S02', 'PMS_BLACKOUT', 'Blackout detected', 'critical', !!allDead && mainBuses.some((b) => b.wasLive))

  // ---- automatic synchronising of sets started by PMS or operator (auto and semi) ----
  if (p.mode !== 'manual' && healthy && !state.sync.active) {
    const cand = p.priority.map((id) => state.gens[id]).find((g) => g.syncPending && g.ready && !g.online && state.buses[g.bus]?.live)
    if (cand) { state.sync = { ...state.sync, gen: cand.id, mode: 'auto', active: true, status: 'Synchronising', t0: state.t }; cand.syncPending = false; ctx.event('S02', `Auto synchronising ${cand.id}`) }
  }
  if (state.sync.active && state.sync.mode === 'auto' && state.t - (state.sync.t0 ?? state.t) > S.sync_timeout_s) {
    const g = state.gens[state.sync.gen]
    ctx.event('S01', `${g.id} synchronising time-out (${S.sync_timeout_s} s): set stopped, next standby requested`, 'high')
    g.syncFailed = true
    state.sync.active = false; state.sync.status = 'Synchronising failed (time-out)'
    genStop(ctx, g, 'PMS after sync failure')
    if (p.mode === 'auto') { const sb = standby().filter((x) => x !== g); if (sb.length) { genStart(ctx, sb[0], 'PMS after sync failure'); sb[0].syncPending = true } else ctx.event('S02', 'No further standby set available', 'high') }
  }
  for (const g of gens) { if (g.online) g.syncFailed = false; ctx.alarm('S01', `DGC_SYNC_${g.id}`, `${g.id} synchronising failure (time-out)`, 'high', !!g.syncFailed) }

  // ---- per island automatic functions ----
  let noStandby = false
  for (const isl of live) {
    const on = onlineIn(gens, isl)
    const capNow = isl.cap_kw
    const pct = isl.load_pct
    const lost = (p.prevGens || []).filter((id) => !state.gens[id].online && isl.buses.includes(state.gens[id].bus) && !state.gens[id].unloadedOK)
    if (p.mode === 'auto' && !p.blackout.active && healthy) {
      const sb = standby()
      if (starting.length) p.timers.start = 0
      else if (pct > S.start_pct) p.timers.start += dt
      else p.timers.start = 0
      const need = p.timers.start >= (legacy ? S.start_delay_s * 1.5 : S.start_delay_s) || on.length < S.min_running || (lost.length && pct > S.start_pct)
      if (need && !starting.length) {
        if (sb.length) { genStart(ctx, sb[0], 'PMS'); sb[0].syncPending = true; p.timers.start = 0; ctx.event('S02', `PMS: standby ${sb[0].id} start (load ${pct.toFixed(0)} % of online capacity, ${on.length} online)`) }
        else noStandby = true
      }
      // load dependent stop (retrofit only; legacy hardwired logic has no automatic stop)
      if (!legacy && on.length > S.min_running && !starting.length) {
        const last = p.priority.slice().reverse().map((id) => state.gens[id]).find((g) => g.online)
        const after = (100 * (isl.load_kw + isl.loss_kw)) / (capNow - last.rating_kw)
        if (pct < S.stop_pct && after < S.stop_after_pct && !p.hc.requests.length) p.timers.stop += dt; else p.timers.stop = 0
        if (p.timers.stop >= S.stop_delay_s) { genStop(ctx, last, 'PMS load dependent stop'); last.unloadedOK = true; p.timers.stop = 0; ctx.event('S02', `PMS: ${last.id} stop, load after stop ${after.toFixed(0)} %`) }
      } else p.timers.stop = 0
    }
    // ---- load shedding (protection: active in every PMS mode) ----
    if (lost.length && pct > 100) p.fastPending = { t: state.t, isl: isl.buses.join('+') }
    if (p.fastPending && p.fastPending.isl === isl.buses.join('+') && state.t - p.fastPending.t >= (p.stages[0].fast_delay_s ?? 0.5) - 1e-9) {
      p.fastPending = null
      if (pct > 100) {
        if (legacy) shedPriority(ctx, isl, p.stages[0].sheds_priority, 'preferential trip relay (generator breaker trip)')
        else shedTo(ctx, isl, 0.95, 'stage 1: generator trip with remaining capacity below load', capNow)
        p.shed.stage = Math.max(p.shed.stage, 1); p.shed.stageT = state.t
      }
    }
    if (pct > 100) p.timers.overload += dt; else p.timers.overload = 0
    const isoch = on.every((g) => g.gov.mode === 'isoch')
    for (const stg of p.stages) p.ufT[stg.stage] = stg.uf_hz != null && (isoch || !stg.isochOnly) && isl.f < stg.uf_hz ? (p.ufT[stg.stage] || 0) + dt : 0
    const nextIdx = p.shed.stage
    if (!legacy && nextIdx < p.stages.length) {
      const stg = p.stages[nextIdx]
      const ufTrig = stg.uf_hz != null && p.ufT[stg.stage] >= (stg.uf_s || 1)
      const ovTrig = nextIdx === 0 ? p.timers.overload >= (stg.overload_s ?? 2) : pct > 100 && state.t - p.shed.stageT >= stg.delay_s
      if (ufTrig || ovTrig) {
        shedPriority(ctx, isl, stg.sheds_priority, `stage ${stg.stage}${ufTrig ? ` (frequency below ${stg.uf_hz} Hz)` : ' (overload)'}`)
        p.shed.stage = nextIdx + 1; p.shed.stageT = state.t
      }
    } else if (legacy) {
      const st1 = p.stages[0]
      if ((p.timers.overload >= 5 || (st1.uf_hz != null && p.ufT[st1.stage] >= 2)) && state.t - p.shed.lastT > 3) {
        shedPriority(ctx, isl, st1.sheds_priority, 'preferential trip relay (overcurrent / underfrequency)')
        p.shed.stage = 1; p.shed.stageT = state.t
      }
    }
    // reactive load sharing and voltage restoration by AVR setpoint pulses (auto and semi, retrofit)
    if (p.mode !== 'manual' && !legacy && healthy && on.length) {
      const sumS = on.reduce((a, g) => a + g.rating_kva, 0)
      const qavg = on.reduce((a, g) => a + g.q_kvar, 0) / sumS
      for (const g of on) { if (g.avr.mode !== 'auto' || g.avr.sensing !== 'ok') continue; g.avr.v_set = clamp(g.avr.v_set + (0.6 * (qavg - g.q_kvar / g.rating_kva) * g.avr.droop_q * g.vn_kv + 0.1 * (g.vn_kv - g.v_kv)) * dt, g.vn_kv * 0.95, g.vn_kv * 1.05) }
    }
    // droop secondary control: frequency restoration and kW balancing by speed setpoint pulses
    const digitalSharing = state.variant?.S01 !== 'legacy'
    if (p.mode !== 'manual' && healthy && digitalSharing) {
      const droops = on.filter((g) => g.gov.mode === 'droop' && !g.faults.gov_bias)
      if (droops.length) {
        const avg = on.reduce((a, g) => a + g.p_kw, 0) / on.reduce((a, g) => a + g.rating_kw, 0)
        for (const g of droops) {
          if (g.gov.unloading) continue
          const pu = g.p_kw / g.rating_kw
          g.gov.fref = clamp(g.gov.fref + (0.15 * (fn - isl.f) + 0.6 * g.gov.droop * fn * (avg - pu)) * dt, fn * 0.9, fn * 1.1)
        }
      }
    }
    // kW and kvar sharing deviation (db S01 DGC-003, S14 AVR-004)
    if (on.length > 1) {
      const avg = on.reduce((a, g) => a + g.p_kw / g.rating_kw, 0) / on.length
      const qavg = on.reduce((a, g) => a + g.q_kvar / g.rating_kva, 0) / on.length
      for (const g of on) {
        g.kwShareDev = persist(p, `kw${g.id}`, Math.abs(g.p_kw / g.rating_kw - avg) > 0.1 && g.gov.ramp >= 1.05 && !g.gov.unloading, dt, 5)
        g.kvarShareDev = persist(p, `kv${g.id}`, Math.abs(g.q_kvar / g.rating_kva - qavg) > 0.1 && g.gov.ramp >= 1.05, dt, 5)
      }
    }
  }
  ctx.alarm('S02', 'PMS_NO_STBY', 'No standby generator available', 'high', noStandby)
  for (const g of gens) {
    if (!g.online) { g.kwShareDev = false; g.kvarShareDev = false }
    ctx.alarm('S01', `DGC_KW_${g.id}`, `${g.id} kW load sharing deviation`, 'low', !!g.kwShareDev)
    ctx.alarm('S14', `AVR_KVAR_${g.id}`, `${g.id} kvar sharing imbalance`, 'low', !!g.kvarShareDev)
  }
  // ---- reconnect shed consumers when capacity is back (auto retrofit up to restart_max_priority; others after operator reset) ----
  if (!p.blackout.active && healthy) {
    for (const f of Object.values(state.feeders)) if (f.shedBy && f.priority > S.restart_max_priority && !f.resetOk) f.awaitReset = true
    const shed = Object.values(state.feeders).filter((f) => f.shedBy && (f.resetOk || (p.mode === 'auto' && !legacy && f.priority <= S.restart_max_priority))).sort((a, b) => a.priority - b.priority)
    if (shed.length && state.t - p.shed.lastT > 10 && state.t - p.timers.restore > 5) {
      const f = shed[0]
      const isl = state.islands.find((i) => i.buses.includes(f.bus))
      const onG = onlineIn(gens, isl)
      const settled = onG.length && onG.every((g) => g.gov.ramp >= 1.05)
      const onKva = onG.reduce((a, g) => a + g.rating_kva, 0)
      const kvaOk = f.kind !== 'motor' || (f.start_x * f.rated_kw) / f.pf <= S.start_kva_ratio * onKva
      if (isl && settled && kvaOk && avail(isl) >= f.rated_kw * 1.1) {
        f.shedBy = null; f.awaitReset = false; f.resetOk = false
        breakerClose(ctx, f.breaker, 'PMS reconnect after load shedding')
        if (f.drive && state.drives[f.drive]) state.drives[f.drive].run = true
        p.timers.restore = state.t
      }
    }
    if (!Object.values(state.feeders).some((x) => x.shedBy)) p.shed.stage = 0
  }
  // ---- heavy consumer requests ----
  for (const r of p.hc.requests.slice()) {
    const f = state.feeders[r.feeder]
    const isl = state.islands.find((i) => i.buses.includes(f.bus))
    const onG = onlineIn(gens, isl)
    const a = onG.length ? avail(isl) : 0
    // permission when the spinning reserve left after this start (and after consumers already permitted but still ramping) stays above the reserve
    const committed = Object.values(state.drives).filter((x) => x.permission === 'granted' && x.run && x.kw < x.rated_kw * 0.95 && x.id !== f.drive).reduce((acc, x) => acc + (x.rated_kw - x.kw), 0)
    const need = f.rated_kw + (S.hc_reserve_kw || 0) + committed
    const br = state.breakers[f.breaker]
    const d = f.drive ? state.drives[f.drive] : null
    const onKva = onG.reduce((x, g) => x + g.rating_kva, 0)
    const startKva = f.kind === 'motor' ? (f.start_x * f.rated_kw) / f.pf : 0
    const kvaOk = startKva <= S.start_kva_ratio * onKva
    r.check = { avail_kw: Math.round(a), need_kw: Math.round(need), start_kva: Math.round(startKva), online_kva: Math.round(onKva), kvaOk }
    if (br && br.state === 'closed' && d && d.run) { p.hc.requests.splice(p.hc.requests.indexOf(r), 1); continue }
    if (!healthy) { r.status = 'blocked: PMS controllers failed'; continue }
    if (a >= need && kvaOk && !(r.standbyCalled && starting.length)) {
      const ok = br.state === 'closed' || breakerClose(ctx, f.breaker, 'PMS heavy consumer permission')
      if (ok) {
        if (d) { d.run = true; d.permission = 'granted' }
        ctx.event('S02', `Heavy consumer ${f.name}: start permitted (${Math.round(a)} kW available, ${Math.round(need)} kW required = consumer + ${S.hc_reserve_kw || 0} kW reserve${committed ? ` + ${Math.round(committed)} kW already permitted` : ''})`)
        p.hc.requests.splice(p.hc.requests.indexOf(r), 1)
      } else r.status = 'blocked: ' + (br?.closeBlockedReason || '')
    } else {
      r.status = !kvaOk ? `waiting: starting ${Math.round(startKva)} kVA exceeds ${S.start_kva_ratio} x online ${Math.round(onKva)} kVA` : `waiting: needs ${Math.round(need)} kW, available ${Math.round(Math.max(0, a))} kW`
      if (d) d.permission = 'waiting'
      if (p.mode === 'auto' && !starting.length && !r.standbyCalled) {
        const sb = standby()
        if (sb.length) { genStart(ctx, sb[0], 'PMS heavy consumer'); sb[0].syncPending = true; r.standbyCalled = true; ctx.event('S02', `PMS: ${sb[0].id} started before permitting ${f.name}`) }
      }
      if (r.standbyCalled && !starting.length && a < need) r.standbyCalled = false
      if (state.t - r.t > 150) { p.hc.requests.splice(p.hc.requests.indexOf(r), 1); ctx.event('S02', `Heavy consumer request ${f.name} timed out`, 'low') }
    }
  }
  ctx.alarm('S02', 'PMS_HC_BLOCK', 'Heavy consumer start blocked (waiting for capacity)', 'low', p.hc.requests.some((r) => /blocked|waiting/.test(r.status || '') && state.t - r.t > 3))
  ctx.alarm('S02', 'PMS_LOADSHED', 'Load shedding operated', 'high', Object.values(state.feeders).some((f) => f.shedBy))
  ctx.alarm('S02', 'PMS_CTRL', 'PMS controller redundancy lost', 'high', Object.values(p.controllers).includes('failed'))
  for (const isl of live) {
    const k = isl.buses.join('_')
    ctx.alarm('S02', `PMS_OVERLOAD_${k}`, `Overload ${isl.buses.join('+')}: load above online capacity`, 'high', persist(p, `o${k}`, isl.load_pct > 100, dt, 2))
    ctx.alarm('S02', `PMS_FREQ_${k}`, `Busbar frequency deviation ${isl.buses.join('+')}`, 'high', persist(p, `f${k}`, Math.abs(isl.f - fn) > 0.025 * fn, dt, 2))
    ctx.alarm('S02', `PMS_VOLT_${k}`, `Busbar voltage deviation ${isl.buses.join('+')}`, 'high', persist(p, `v${k}`, Math.abs(isl.v_pu - 1) > 0.06, dt, 2))
  }
  for (const g of gens) {
    ctx.alarm('S02', `PMS_FTS_${g.id}`, `${g.id} standby generator start failure`, 'high', g.engine === 'fail_start')
    if (g.unloadedOK && !g.online && g.engine === 'stopped') g.unloadedOK = false
  }
  p.prevGens = gens.filter((g) => g.online).map((g) => g.id)
  const shedding = Object.values(state.feeders).some((f) => f.shedBy)
  p.status = p.blackout.active ? 'Blackout recovery' : shedding ? 'Load shedding active' : Object.values(p.controllers).includes('failed') ? 'Degraded (single controller)' : { auto: 'Automatic', semi: 'Semi-automatic', manual: 'Manual' }[p.mode]
  p.message = p.blackout.active ? `Blackout recovery: ${p.blackout.phase}` : shedding ? `Load shedding stage ${p.shed.stage || 1}` : starting.length ? `Starting ${starting.map((g) => g.id).join(', ')}` : 'Normal'
}

function shedPriority(ctx, isl, prio, why) {
  const { state } = ctx
  const list = Object.values(state.feeders).filter((f) => isl.buses.includes(f.bus) && f.priority === prio && !f.to_bus && state.breakers[f.breaker]?.state === 'closed' && state.breakers[f.breaker]?.shedable !== false && (f.kind !== 'vfd' || state.drives[f.drive]?.run))
  state.pms.shed.lastT = state.t
  if (!list.length) { ctx.event('S02', `Load shedding ${why}: no consumers at priority ${prio} connected`, 'low'); return }
  for (const f of list) { breakerOpen(ctx, f.breaker, `PMS load shedding ${why}`); f.shedBy = why; if (f.drive && state.drives[f.drive]) state.drives[f.drive].run = false }
  ctx.event('S02', `LOAD SHEDDING ${why}: priority ${prio} consumers tripped (${list.map((f) => f.name).join(', ')})`, 'high')
}

// predictive shedding: trip the least important consumers until load <= target x capacity
function shedTo(ctx, isl, target, why, capNow) {
  const { state } = ctx
  let load = isl.load_kw + isl.loss_kw
  const cap = capNow ?? isl.cap_kw
  const cands = Object.values(state.feeders).filter((f) => isl.buses.includes(f.bus) && state.breakers[f.breaker]?.state === 'closed' && state.breakers[f.breaker]?.shedable !== false && !f.essential && !f.to_bus && f.p_kw > 1).sort((a, b) => b.priority - a.priority || b.p_kw - a.p_kw)
  const shedList = []
  for (const f of cands) {
    if (load <= target * cap) break
    breakerOpen(ctx, f.breaker, `PMS ${why}`); f.shedBy = why; load -= f.p_kw; shedList.push(`${f.name} (P${f.priority})`)
    if (f.drive && state.drives[f.drive]) state.drives[f.drive].run = false
  }
  state.pms.shed.lastT = state.t
  if (shedList.length) ctx.event('S02', `LOAD SHEDDING ${why}: ${shedList.join(', ')}`, 'high')
}
