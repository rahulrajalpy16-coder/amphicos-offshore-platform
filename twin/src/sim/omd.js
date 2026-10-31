// Oil mist detection (S13). Per head (crankcase compartment) concentration, average and deviation alarms,
// sensor fault, slowdown / shutdown request into the DG safety system. Legacy variant: one sensor with
// a rotating sampling valve that scans the compartments in sequence; retrofit: one head per compartment.
// EDUCATIONAL SIMULATION. Concentration is shown as % of the high alarm level unless the db gives units.

import { approach, allNumbers } from './util.js'
import { genShutdown } from './electrical.js'

export function initOmd(ctx) {
  const { db, state } = ctx
  const s13 = (db.systems || []).find((s) => s.id === 'S13')
  const ms = s13?.measurements || []
  const conc = ms.find((m) => /concentration|mist|mg\/l|opacity|obscur/i.test(`${m.name} ${m.unit}`))
  const dev = ms.find((m) => /deviation|differen/i.test(`${m.name}`))
  const num = (m, k) => (m ? allNumbers(m[k])[0] : undefined)
  const hasNumbers = conc && allNumbers(conc.alarm).length > 0
  const unit = hasNumbers ? conc.unit : '% of alarm level'
  const alarm = num(conc, 'alarm') ?? 100
  const trip = num(conc, 'trip') ?? null
  const devAlarm = num(dev, 'alarm') ?? alarm * 0.5
  if (!conc) ctx.gap('S13 oil mist concentration measurement not found in db: values shown as % of high alarm level (no absolute mg/l numbers invented)')
  const normal = conc ? allNumbers(conc.normal) : []
  state.omdCfg = { unit, alarm, trip, devAlarm, normal: normal.length ? normal[normal.length - 1] : alarm * 0.05, basis: conc?.basis || 'REPRESENTATIVE', scanDwell_s: 6 }
  state.omd = {}
  for (const id of state.genOrder) {
    const g = state.gens[id]
    const heads = (db.components || []).filter((c) => c.type === 'oil_mist_detector_head' && (c.mounted_on === g.engine_component || c.mounted_on === g.component || (c.parent_group || '').includes(id)))
    const unitComp = (db.components || []).find((c) => c.id === g.links?.omd) || (db.components || []).find((c) => c.type === 'oil_mist_detector_unit' && (c.mounted_on === g.engine_component || c.mounted_on === g.component))
    const n = heads.length || Math.ceil((state.engines[id]?.cylinders || 12) / 2) + 1
    if (!heads.length) ctx.gap(`no oil_mist_detector_head components for ${id}: ${n} compartments assumed`)
    state.omd[id] = {
      gen: id, unit: unitComp?.id || null, heads: Array.from({ length: n }, (_, i) => ({ id: heads[i]?.id || `${id}_OMH${i + 1}`, label: heads[i]?.tag || (i === n - 1 && !heads[i] ? 'Gear case' : `Compartment ${i + 1}`), value: 0, fault: false, base: 0.6 + ctx.rng() * 0.8 })),
      avg: 0, maxDev: 0, alarm: false, devAlarm: false, prealarm: false, shutdownReq: false, slowdownReq: false, sensorFault: false,
      hotspot: null, scanIdx: 0, scanT: 0, legacyReading: 0, legacyReadingIdx: 0, testing: null, latched: false,
    }
  }
}

export function stepOmd(ctx, dt) {
  const { state } = ctx
  const C = state.omdCfg
  const legacy = state.variant?.S13 === 'legacy'
  for (const id of state.genOrder) {
    const o = state.omd[id]
    const g = state.gens[id]
    const run = ['accelerating', 'running', 'cooldown'].includes(g.engine)
    const load = Math.max(0, g.pm_kw / g.rating_kw)
    for (let i = 0; i < o.heads.length; i++) {
      const h = o.heads[i]
      let target = run ? (C.normal * h.base * (0.5 + 0.6 * load)) : C.normal * 0.2
      if (o.hotspot && o.hotspot.idx === i) { o.hotspot.level = Math.min(o.hotspot.level + o.hotspot.rate * dt, 3); target += C.alarm * o.hotspot.level }
      if (o.testing && o.testing.idx === i) target = C.alarm * 1.3 // test fluid / smoke in the test port
      h.value = h.fault ? 0 : approach(h.value, target, o.testing?.idx === i ? 1.5 : 0.6, dt)
    }
    const ok = o.heads.filter((h) => !h.fault)
    o.avg = ok.length ? ok.reduce((a, h) => a + h.value, 0) / ok.length : 0
    o.maxDev = ok.length ? Math.max(...ok.map((h) => h.value - o.avg)) : 0
    o.sensorFault = o.heads.some((h) => h.fault)
    let detected
    if (legacy) {
      // one sensor, rotating valve: only the compartment being sampled is seen; reading lags the scan
      o.scanT += dt
      if (o.scanT >= C.scanDwell_s) { o.scanT = 0; o.scanIdx = (o.scanIdx + 1) % o.heads.length }
      o.legacyReading = approach(o.legacyReading, o.heads[o.scanIdx].value, 0.8, dt)
      o.legacyReadingIdx = o.scanIdx
      detected = o.legacyReading
      o.alarm = o.alarm || detected >= C.alarm
      o.devAlarm = false
    } else {
      detected = Math.max(...ok.map((h) => h.value), 0)
      o.alarm = o.alarm || detected >= C.alarm
      o.devAlarm = o.maxDev >= C.devAlarm
    }
    o.prealarm = detected >= 0.7 * C.alarm
    o.shutdownReq = o.alarm
    o.slowdownReq = o.prealarm || o.devAlarm
    const A = (code, text, sev, on) => ctx.alarm('S13', `${code}_${id}`, `${id} ${text}`, sev, on, { componentId: o.unit })
    A('OMD_HIGH', 'oil mist HIGH: shutdown request to DG safety system', 'critical', o.alarm)
    A('OMD_DEV', 'oil mist deviation from average', 'high', o.devAlarm)
    A('OMD_PRE', 'oil mist pre-alarm (slowdown or load reduction request)', 'high', o.prealarm && !o.alarm)
    A('OMD_FAULT', 'OMD sensor fault (head failure or fouled optics)', 'low', o.sensorFault)
    if (o.alarm && !o.testing && run) genShutdown(ctx, g, 'oil mist detector high')
    if (o.alarm && o.testing && run && !o.testInhibit) genShutdown(ctx, g, 'oil mist detector high (test without inhibit)')
  }
}

export function omdCommands(ctx) {
  const { state } = ctx
  return {
    'omd.hotspot': ({ gen, idx = 2, rate = 0.08 }) => { const o = state.omd[gen]; if (!o) return false; o.hotspot = { idx, level: 0, rate }; ctx.event('S13', `${gen}: developing crankcase hot spot simulated at ${o.heads[idx]?.label} (educational)`, 'high'); return true },
    'omd.clear': ({ gen }) => { const o = state.omd[gen]; if (!o) return false; o.hotspot = null; o.testing = null; return true },
    'omd.sensor_fault': ({ gen, idx = 0, on = true }) => { const o = state.omd[gen]; if (!o || !o.heads[idx]) return false; o.heads[idx].fault = !!on; return true },
    'omd.test': ({ gen, idx = 0, inhibit = true }) => { const o = state.omd[gen]; if (!o) return false; o.testing = { idx, t: state.t }; o.testInhibit = !!inhibit; ctx.event('S13', `${gen}: functional test with test fluid at ${o.heads[idx]?.label}, shutdown output ${inhibit ? 'inhibited' : 'LIVE'}`); return true },
    'omd.test_end': ({ gen }) => { const o = state.omd[gen]; if (!o) return false; o.testing = null; return true },
    'omd.reset': ({ gen }) => {
      const o = state.omd[gen]; if (!o) return false
      const peak = Math.max(...o.heads.map((h) => h.value))
      if (peak >= state.omdCfg.alarm * 0.7) { ctx.event('S13', `${gen} OMD reset refused: concentration still high`, 'low'); return false }
      o.alarm = false; ctx.event('S13', `${gen} OMD alarm reset`); return true
    },
  }
}
