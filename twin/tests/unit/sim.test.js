// Unit tests for the educational simulation engine (R8), run against the real database.
import { describe, it, expect } from 'vitest'
import { db, newSim, active, runSteps, ev } from './helpers.mjs'
import { idmtTime, IEC_CURVES } from '../../src/sim/util.js'
import { closePermissive } from '../../src/sim/electrical.js'
import { listScenarios, LIBRARY } from '../../src/sim/scenarios.js'

const sim = newSim()
const fresh = (lc) => { sim.reset(); if (lc) sim.command('loadcase.set', { id: lc }); return sim }

describe('normal state from the database', () => {
  it('total generator kW is within 5 % of load case LC_PROD and two sets are on load', () => {
    fresh()
    const lc = db.electrical.load_cases.find((l) => l.id === 'LC_PROD')
    const gkw = Object.values(sim.state.gens).reduce((a, g) => a + g.p_kw, 0)
    expect(Math.abs(gkw - lc.total_kw) / lc.total_kw).toBeLessThan(0.05)
    expect(Object.values(sim.state.gens).filter((g) => g.online).length).toBe(lc.generators_online_expected)
  })
  it('has zero active alarms and zero data gaps in the normal scenario, also after 2 minutes', () => {
    fresh()
    expect(sim.gaps()).toEqual([])
    expect(active(sim).map((a) => a.id)).toEqual([])
    runSteps(sim, 120)
    expect(active(sim).map((a) => a.id)).toEqual([])
  })
})

describe('power balance', () => {
  it('sum of generator kW equals connected load plus losses at every tick through trip, blackout and motor start', () => {
    let worst = 0
    const check = (s) => { worst = Math.max(worst, Math.abs(s.lastPowerBalance.error_kw)) }
    for (const id of ['pms_gen_trip', 'pms_blackout', 'avr_load_step', 'pms_offload', 'relay_discrimination']) { sim.command('scenario.run', { id }); runSteps(sim, 40, check) }
    expect(worst).toBeLessThan(1e-6)
  })
})

describe('load sharing', () => {
  it('isochronous: equal per unit load and frequency restored to nominal after a load step', () => {
    fresh()
    const on = Object.values(sim.state.gens).filter((g) => g.online)
    sim.command('test.load_step', { bus: on[0].bus, kw: 1200 })
    let minF = 99
    runSteps(sim, 30, (s) => { minF = Math.min(minF, on[0].f_hz) })
    expect(minF).toBeLessThan(59.9) // transient dip
    expect(Math.abs(on[0].f_hz - 60)).toBeLessThan(0.02)
    expect(Math.abs(on[0].p_kw / on[0].rating_kw - on[1].p_kw / on[1].rating_kw)).toBeLessThan(0.01)
  })
  it('droop: frequency settles below nominal by droop x per unit load and unequal droop shares inversely', () => {
    fresh()
    sim.command('pms.mode', { mode: 'manual' })
    const [g1, g2] = Object.values(sim.state.gens).filter((g) => g.online)
    sim.command('gov.mode', { id: g1.id, mode: 'droop' }); sim.command('gov.mode', { id: g2.id, mode: 'droop' })
    sim.command('gov.droop', { id: g1.id, pct: 2 }); sim.command('gov.droop', { id: g2.id, pct: 4 })
    runSteps(sim, 20)
    const f0 = g1.f_hz, p10 = g1.p_kw, p20 = g2.p_kw
    sim.command('test.load_step', { bus: g1.bus, kw: 900 })
    runSteps(sim, 30)
    const d1 = g1.p_kw - p10, d2 = g2.p_kw - p20
    expect(d1 / d2).toBeGreaterThan(1.8); expect(d1 / d2).toBeLessThan(2.2) // 4 % / 2 % droop
    // frequency drop = droop x per unit load change of each set
    const expectedDf = 0.02 * 60 * (d1 / g1.rating_kw)
    expect(Math.abs(f0 - g1.f_hz - expectedDf)).toBeLessThan(0.05)
    expect(f0 - g1.f_hz).toBeGreaterThan(0.15) // frequency does not return without secondary control
  })
})

describe('PMS', () => {
  it('offloading: first cargo pump permitted, second waits while PMS starts and synchronises the standby set', () => {
    sim.command('scenario.run', { id: 'S02-D1' })
    runSteps(sim, 12)
    const cp2 = sim.state.drives.C_VFD_CP2
    expect(sim.state.drives.C_VFD_CP1.run).toBe(true)
    expect(cp2.run).toBe(false)
    expect(ev(sim, /started before permitting/).length).toBe(1)
    runSteps(sim, 60)
    expect(Object.values(sim.state.gens).filter((g) => g.online).length).toBe(3)
    expect(cp2.run).toBe(true)
  })
  it('rising load above the start threshold starts the standby set after the start delay', () => {
    fresh()
    const S = sim.state.pms.settings
    sim.state.loadRamp = { kw: (S.start_pct + 5) / 100 * sim.state.pms.cap_kw - sim.state.pms.load_kw, t0: sim.state.t, T: 2 }
    let tCross = null, tStart = null
    runSteps(sim, S.start_delay_s + 8, (s) => { if (tCross == null && s.pms.load_pct > S.start_pct) tCross = s.t; if (tStart == null && s.gens.G3.engine !== 'stopped') tStart = s.t })
    expect(tCross).not.toBeNull()
    expect(tStart - tCross).toBeGreaterThan(S.start_delay_s - 0.3)
    expect(tStart - tCross).toBeLessThan(S.start_delay_s + 0.3)
    expect(ev(sim, /standby G\d start/).length).toBe(1)
  })
  it('generator trip with load above remaining capacity: fast stage 1 sheds priority 5 consumers, no blackout', () => {
    sim.command('scenario.run', { id: 'S02-D2' })
    runSteps(sim, 20)
    const shed = Object.values(sim.state.feeders).filter((f) => f.shedBy)
    expect(shed.length).toBeGreaterThan(0)
    expect(shed.every((f) => f.priority === 5)).toBe(true)
    expect(Object.values(sim.state.buses).filter((b) => b.vn_kv > 1).every((b) => b.live)).toBe(true)
    expect(ev(sim, /BLACKOUT/).length).toBe(0)
  })
  it('blackout: detection, dead bus closing by one set, synchronising, restart groups by priority, P4 and P5 wait for reset', () => {
    sim.command('scenario.run', { id: 'S02-D3' })
    runSteps(sim, 60)
    const t = sim.state.events.slice().reverse().map((e) => e.text)
    const i = (re) => t.findIndex((x) => re.test(x))
    expect(i(/BLACKOUT detected/)).toBeGreaterThan(-1)
    expect(i(/Dead bus closed by/)).toBeGreaterThan(i(/BLACKOUT detected/))
    expect(i(/Restart group priority 2/)).toBeGreaterThan(i(/Dead bus closed/))
    expect(i(/Restart group priority 3/)).toBeGreaterThan(i(/Restart group priority 2/))
    expect(i(/Blackout recovery complete/)).toBeGreaterThan(-1)
    expect(Object.values(sim.state.buses).every((b) => b.live)).toBe(true)
    expect(Object.values(sim.state.feeders).filter((f) => f.awaitReset).every((f) => f.priority >= 4 || f.heavy)).toBe(true)
    expect(Object.values(sim.state.gens).filter((g) => g.online).length).toBeGreaterThanOrEqual(2)
  })
})

describe('protection relays', () => {
  it('IDMT operate time follows t = TMS k / ((I/Is)^a - 1) of IEC 60255-151', () => {
    const k = { SI: [0.14, 0.02], VI: [13.5, 1], EI: [80, 2], LTI: [120, 1] }
    for (const [c, [kk, a]] of Object.entries(k)) for (const m of [1.5, 2, 5, 10, 20]) for (const tms of [0.05, 0.1, 0.25, 1]) expect(idmtTime(c, tms, m)).toBeCloseTo((tms * kk) / (Math.pow(m, a) - 1), 10)
    expect(idmtTime('SI', 1, 10)).toBeCloseTo(2.971, 3) // published reference value
    expect(idmtTime('VI', 1, 10)).toBeCloseTo(1.5, 6)
    expect(idmtTime('EI', 1, 10)).toBeCloseTo(0.808, 3)
    expect(idmtTime('SI', 1, 1)).toBe(Infinity)
    expect(Object.keys(IEC_CURVES)).toEqual(['SI', 'VI', 'EI', 'LTI'])
  })
  it('secondary injection: numerical IED operate time within tolerance of the curve; legacy relay fails until recalibrated', () => {
    fresh()
    const r = sim.state.relays.C_IED_G1
    const fn = r.functions.find((f) => f.curve.kind === 'idmt')
    sim.command('relay.test', { relay: r.id, on: true })
    for (const m of [2, 5]) {
      sim.command('relay.inject', { relay: r.id, ansi: fn.ansi, multiple: m })
      runSteps(sim, idmtTime(fn.curve.curve, fn.curve.tms, m) + 2)
      const res = r.test.results[0]
      expect(res.multiple).toBe(m)
      expect(Math.abs(res.measured - idmtTime(fn.curve.curve, fn.curve.tms, m)) / res.expected).toBeLessThan(0.01)
      expect(res.pass).toBe(true)
    }
    expect(sim.state.gens.G1.online).toBe(true) // outputs isolated in test mode
    sim.command('variant.set', { systemId: 'S03', variant: 'legacy' })
    sim.command('relay.inject', { relay: r.id, ansi: fn.ansi, multiple: 3 }); runSteps(sim, 12)
    expect(r.test.results[0].pass).toBe(false)
    sim.command('relay.calibrate', { relay: r.id })
    sim.command('relay.inject', { relay: r.id, ansi: fn.ansi, multiple: 3 }); runSteps(sim, 12)
    expect(r.test.results[0].pass).toBe(true)
  })
  it('feeder fault: feeder relay trips first with lockout 86, generators stay online; reset only after the fault clears', () => {
    sim.command('scenario.run', { id: 'S03-D3' })
    runSteps(sim, 8)
    const r = sim.state.relays.C_IED_TR1
    expect(r.leds.trip).toBe(true); expect(r.lockout).toBe(true)
    expect(sim.state.breakers.CB_TR1.state).toBe('open'); expect(sim.state.breakers.CB_TR1.tripped).toBe(true)
    expect(sim.state.relays.C_IED_G1.leds.trip).toBe(false)
    expect(Object.values(sim.state.gens).filter((g) => g.online).length).toBe(2)
    expect(sim.command('breaker.close', { id: 'CB_TR1' })).toBe(false) // lockout blocks closing
    sim.command('fault.clear', { target: 'F_TR1', kind: 'overcurrent' })
    expect(sim.command('relay.reset', { relay: 'C_IED_TR1' })).toBe(true)
    expect(r.lockout).toBe(false)
    expect(sim.command('breaker.close', { id: 'CB_TR1' })).toBe(true)
  })
  it('reverse power (32) trips the motoring generator after its definite time delay', () => {
    sim.command('scenario.run', { id: 'S03-D2' })
    runSteps(sim, 12)
    expect(sim.state.relays.C_IED_G1.tripFn).toBe('32')
    expect(sim.state.gens.G1.online).toBe(false)
  })
})

describe('synchronising', () => {
  it('check-sync permissive blocks outside the window and permits inside; auto synchroniser closes inside the window', () => {
    fresh()
    sim.command('pms.mode', { mode: 'manual' })
    const g = sim.state.gens.G3
    sim.command('gen.start', { id: 'G3' })
    runSteps(sim, 20)
    expect(g.ready).toBe(true)
    g.gov.fref = 60.5; runSteps(sim, 5)
    const w = sim.state.syncWindow
    let blocked = false, permitted = false
    runSteps(sim, 6, (s) => { const p = closePermissive(s, s.breakers[g.breaker]); if (!p.ok && Math.abs(g.phase_deg) > w.angle_deg) blocked = true })
    expect(blocked).toBe(true)
    expect(Math.abs(g.slip_hz)).toBeGreaterThan(w.slip_hz)
    g.gov.fref = 60.05
    runSteps(sim, 60, (s) => { const p = closePermissive(s, s.breakers[g.breaker]); if (p.ok) permitted = true })
    expect(permitted).toBe(true)
    sim.command('sync.select', { gen: 'G3', mode: 'auto' })
    let closeAngle = null
    runSteps(sim, 40, (s) => { if (closeAngle == null && g.online) closeAngle = s.syncLastClose ?? 0 })
    expect(g.online).toBe(true)
    const e = ev(sim, /G3 breaker closed \(check-sync, auto synchroniser\)/)
    expect(e.length).toBe(1)
  })
})

describe('engine, OMD, boiler, IGG', () => {
  it('OMD bearing hot spot: deviation, high alarm, shutdown request stops the DG and PMS starts the standby', () => {
    sim.command('scenario.run', { id: 'S13-D1' })
    runSteps(sim, 40)
    const ids = sim.state.alarms.map((a) => a.code)
    expect(ids).toContain('OMD_HIGH_G1')
    expect(ids).toContain('OMD_DEV_G1')
    expect(sim.state.gens.G1.engine).toBe('shutdown')
    expect(ev(sim, /standby G3 start/).length).toBe(1)
  })
  it('OMD legacy single sampling detects the same hot spot later than per compartment heads', () => {
    const tDetect = (variant) => { sim.reset(); sim.command('variant.set', { systemId: 'S13', variant }); sim.command('omd.hotspot', { gen: 'G1', idx: 4, rate: 0.05 }); let t = null; runSteps(sim, 80, (s) => { if (t == null && s.omd.G1.alarm) t = s.t }); return t }
    const tr = tDetect('retrofit'), tl = tDetect('legacy')
    expect(tr).not.toBeNull(); expect(tl).not.toBeNull()
    expect(tl).toBeGreaterThan(tr)
  })
  it('low lube oil pressure gives alarm before shutdown and a first-out indication', () => {
    sim.command('scenario.run', { id: 'S12-D2' })
    let alarmT = null
    runSteps(sim, 30, (s) => { if (alarmT == null && s.alarmIndex['S12:LO_P_LOW_G1']?.active) alarmT = s.t })
    expect(alarmT).not.toBeNull()
    expect(sim.state.gens.G1.engine).toBe('shutdown')
    expect(sim.state.engines.G1.firstOut).toBe('low lube oil pressure')
    expect(sim.state.engines.G1.lastShutdown.t).toBeGreaterThan(alarmT)
  })
  it('boiler flame failure trips within the db flame failure response time and locks out until the fault is cleared', () => {
    fresh()
    const b = sim.state.boilers[0]
    sim.command('fault.inject', { target: b.id, kind: 'scanner' })
    const t0 = sim.state.t
    let tripT = null
    runSteps(sim, 5, (s) => { if (tripT == null && b.bms === 'lockout') tripT = s.t })
    expect(b.firstOut).toBe('flame failure')
    expect(tripT - t0).toBeLessThan(b.cfg.t_ffr + 1.0)
    runSteps(sim, b.cfg.t_postpurge + 1)
    expect(sim.command('boiler.reset', { id: b.id })).toBe(false)
    sim.command('fault.clear', { target: b.id, kind: 'scanner' })
    expect(sim.command('boiler.reset', { id: b.id })).toBe(true)
    expect(b.bms).toBe('off')
  })
  it('three-element drum level control: level recovers after a steam step and feedwater flow tracks steam flow', () => {
    fresh()
    const b = sim.state.boilers[0]
    sim.command('boiler.demand', { pct: 75 })
    let maxDev = 0
    runSteps(sim, 240, () => { maxDev = Math.max(maxDev, Math.abs(b.level)) })
    expect(Math.abs(b.level)).toBeLessThan(10)
    expect(Math.abs(b.feed - b.steam) / b.steam).toBeLessThan(0.03)
    expect(b.fw_sp).not.toBeNull()
    expect(maxDev).toBeLessThan(Math.abs(b.cfg.l_low))
    // legacy single element control deviates more for the same step
    fresh(); sim.command('variant.set', { systemId: 'S10', variant: 'legacy' }); sim.command('boiler.demand', { pct: 75 })
    let maxDevL = 0
    runSteps(sim, 240, () => { maxDevL = Math.max(maxDevL, Math.abs(sim.state.boilers[0].level)) })
    expect(maxDevL).toBeGreaterThan(maxDev)
  })
  it('IGG high O2 above the db limit vents to atmosphere and stops delivery to the tanks', () => {
    sim.command('scenario.run', { id: 'S11-D2' })
    const I = sim.state.igg, lim = sim.state.iggCfg.o2_alarm
    let crossT = null, stopT = null
    runSteps(sim, 30, (s) => { if (crossT == null && I.o2_reading >= lim) crossT = s.t; if (crossT != null && stopT == null && !I.regValve && I.vent) stopT = s.t })
    expect(lim).toBe(5)
    expect(crossT).not.toBeNull()
    expect(stopT - crossT).toBeLessThanOrEqual(0.3) // within three 100 ms control cycles
    expect(I.state).toBe('autovent')
    expect(active(sim).map((a) => a.code)).toContain('IGG_O2_HIGH')
  })
  it('IGG shutdown limit (scrubber water low) closes the regulating valve', () => {
    sim.command('scenario.run', { id: 'igg_scrubber' })
    runSteps(sim, 15)
    expect(sim.state.igg.state).toBe('shutdown'); expect(sim.state.igg.regValve).toBe(false); expect(sim.state.igg.burner).toBe(false)
  })
})

describe('determinism and scenarios', () => {
  it('same seed gives identical results, a different seed gives different noise', () => {
    const run = (seed) => { const s = newSim({ seed }); s.command('scenario.run', { id: 'S02-D1' }); runSteps(s, 30); return JSON.stringify({ g: Object.values(s.state.gens).map((g) => [g.p_kw, g.f_hz, g.v_kv]), e: s.state.events.map((e) => e.text) }) }
    expect(run(7)).toBe(run(7))
    expect(run(7)).not.toBe(run(8))
  })
  it('every database demo scenario maps to an executable scenario that runs without errors', () => {
    const map = listScenarios(db)
    const all = Object.values(map).flatMap((m) => m.db)
    expect(all.length).toBe(db.systems.reduce((a, s) => a + s.demo_scenarios.length, 0))
    for (const d of all) {
      expect(d.runs, d.id).toBeTruthy()
      expect(sim.command('scenario.run', { id: d.id })).toBe(true)
      runSteps(sim, 20)
      expect(sim.state.events.some((e) => /^Command .* failed/.test(e.text))).toBe(false)
    }
    for (const L of LIBRARY) { expect(sim.command('scenario.run', { id: L.id }), L.id).toBe(true); runSteps(sim, 5) }
  })
})
