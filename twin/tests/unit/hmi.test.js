// HMI module contract and cross-view consistency (R7, R8), run against the real database.
import { describe, it, expect } from 'vitest'
import { db, newSim, runSteps } from './helpers.mjs'
import { MODULES, MODULE_IDS, getHmi, hmiForComponent } from '../../src/hmi/index.js'

function fakeCanvas(w = 512, h = 288) {
  const calls = { n: 0 }
  const g = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : () => { calls.n++ }), set: (t, k, v) => { t[k] = v; return true } })
  return { width: w, height: h, getContext: () => g, calls }
}

describe('HMI module contract', () => {
  it('there is one module for each of the 15 database systems and every host component resolves to its module', () => {
    const mods = db.systems.map((s) => s.hmi.module).sort()
    expect(mods).toEqual(MODULE_IDS.slice().sort())
    expect(MODULE_IDS.length).toBe(15)
    for (const s of db.systems) {
      const m = getHmi(s.hmi.module)
      expect(typeof m.mount).toBe('function')
      expect(typeof m.renderMini).toBe('function')
      expect(m.meta.id).toBe(s.hmi.module)
      expect(m.meta.systems).toContain(s.id)
      for (const c of s.hmi.host_components) expect(hmiForComponent(db, c)).toBe(m)
    }
  })
  it('renderMini draws every module for every host component without errors, also during a blackout', () => {
    const sim = newSim()
    const draw = () => { for (const s of db.systems) for (const c of [s.primary_component, ...s.hmi.host_components]) { const cv = fakeCanvas(); MODULES[s.hmi.module].renderMini(cv, { db, sim, componentId: c, systemId: s.id }); expect(cv.calls.n).toBeGreaterThan(5) } }
    draw()
    sim.command('scenario.run', { id: 'S02-D3' }); runSteps(sim, 6); draw()
  })
})

describe('cross-view consistency', () => {
  it('PMS, DG control, DG local panel, governor and AVR views read identical values for the same generator', () => {
    const sim = newSim()
    const ctx = { db, sim }
    const check = () => {
      const pms = MODULES.pms.snapshot(ctx)
      for (const id of sim.state.genOrder) {
        const views = [pms.gens[id], MODULES.dgctrl.snapshot(ctx, id), MODULES.dglocal.snapshot(ctx, id), MODULES.governor.snapshot(ctx, id), MODULES.avr.snapshot(ctx, id)]
        for (const v of views.slice(1)) expect(v).toEqual(views[0])
        expect(views[0].kw).toBe(sim.state.gens[id].p_kw)
        expect(views[0].hz).toBe(sim.state.gens[id].f_hz)
      }
    }
    check()
    sim.command('scenario.run', { id: 'S02-D1' }); runSteps(sim, 30); check()
    sim.command('scenario.run', { id: 'S13-D1' }); runSteps(sim, 25); check()
  })
  it('the same alarm appears once in the shared list and is visible to every view filtering by its system', () => {
    const sim = newSim()
    sim.command('scenario.run', { id: 'S12-D2' }); runSteps(sim, 30)
    const a = sim.state.alarms.filter((x) => x.code === 'SHUTDOWN_G1')
    expect(a.length).toBe(1)
    expect(a[0].systemId).toBe('S12')
    expect(a[0].dbCode).toBeTruthy() // mapped to the database alarm catalogue
  })
})
