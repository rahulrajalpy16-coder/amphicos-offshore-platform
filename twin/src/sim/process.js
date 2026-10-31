// Auxiliary boilers (S10) and inert gas generator (S11). EDUCATIONAL SIMULATION, not OEM burner logic,
// not a validated safety sequence. Limits and timings come from the database (systems[].measurements and
// S10 bms); otherwise a REPRESENTATIVE value is used and listed in sim.state.dataGaps.
//
// Boiler drum level control
//  - three-element (retrofit): outer drum level PID -> trim; feedwater flow setpoint = steam flow + trim;
//    inner feedwater flow PID drives the feed valve. Measurements: drum level, steam flow, feedwater flow.
//  - single-element (legacy): drum level PID drives the feed valve directly.
//  - shrink and swell: a steam demand increase lowers drum pressure and makes the level swell
//    temporarily (the reverse on a decrease), on top of the true mass balance.

import { approach, clamp, allNumbers, makePid, stepPid } from './util.js'

function meas(db, sid, re) { return ((db.systems || []).find((s) => s.id === sid)?.measurements || []).find((m) => re.test(`${m.tag || ''} ${m.name || ''}`)) }
const nums = (m, k) => (m ? allNumbers(m[k]) : [])
function pick(ctx, m, k, idx, dflt, label) {
  const v = nums(m, k)[idx]
  if (v == null) { ctx.gap(`${label} not in db: REPRESENTATIVE ${dflt} used`); return dflt }
  return v
}

// ---------------- Boilers ----------------
export const BMS_STATES = { off: 'Off', prepurge: 'Pre-purge', ignition: 'Ignition', proving: 'Flame proving', lowfire: 'Low fire', modulating: 'Modulating', postpurge: 'Post-purge', lockout: 'Lockout' }
export const bmsLabel = (s) => BMS_STATES[s] || s

export function initBoiler(ctx) {
  const { db, state } = ctx
  const s10 = (db.systems || []).find((s) => s.id === 'S10')
  const mp = meas(db, 'S10', /steam.*press|drum press/i)
  const ml = meas(db, 'S10', /drum.*level|water level/i)
  const mf = meas(db, 'S10', /fuel.*press|FO press|fuel oil/i)
  const mfl = meas(db, 'S10', /flame/i)
  const mo = meas(db, 'S10', /oxygen|O2/i)
  const pN = nums(mp, 'normal')
  const lA = nums(ml, 'alarm')
  const bms = s10?.bms || {}
  if (!s10?.bms) ctx.gap('S10 bms timings not in db: REPRESENTATIVE 60/10/10/30/1 s used')
  const demo = 0.5 // purge timers shortened for the exhibition demonstration (db basis allows shortening)
  const cfg = {
    p_unit: mp?.unit || 'barg', p_sp: pN.length > 1 ? (pN[0] + pN[1]) / 2 : pN[0] ?? (ctx.gap('S10 steam pressure normal range not in db: REPRESENTATIVE 7 barg'), 7), p_normal: pN,
    p_high: pick(ctx, mp, 'alarm', 0, 8, 'S10 steam pressure high alarm'), p_trip: pick(ctx, mp, 'trip', 0, 8.5, 'S10 steam pressure high-high trip'),
    l_unit: ml?.unit || 'mm', l_low: lA.length ? -Math.abs(lA[0]) : -100, l_high: lA.length > 1 ? Math.abs(lA[1]) : 100, l_lowlow: -Math.abs(pick(ctx, ml, 'trip', 0, 150, 'S10 drum level low-low trip')),
    fo_unit: mf?.unit || 'barg', fo_nom: nums(mf, 'normal').length > 1 ? (nums(mf, 'normal')[0] + nums(mf, 'normal')[1]) / 2 : 22, fo_alarm: nums(mf, 'alarm')[0] ?? 18, fo_trip: pick(ctx, mf, 'trip', 0, 15, 'S10 fuel oil pressure low trip'),
    flame_alarm: nums(mfl, 'alarm')[0] ?? 40, flame_normal: nums(mfl, 'normal')[0] ?? 60,
    o2_normal: nums(mo, 'normal'), o2_alarm: nums(mo, 'alarm')[0] ?? null,
    t_prepurge: (bms.prepurge_s ?? 60) * demo, t_ignition: bms.pilot_trial_s ?? 10, t_proving: bms.main_flame_trial_s ?? 10, t_lowfire: 8, t_postpurge: (bms.postpurge_s ?? 30) * demo, t_ffr: bms.flame_failure_response_s ?? 1,
    timing_note: `db timings ${bms.prepurge_s ?? '?'}/${bms.pilot_trial_s ?? '?'}/${bms.main_flame_trial_s ?? '?'}/${bms.postpurge_s ?? '?'} s; purge times halved for the demonstration`,
    max_tph: s10?.sim_params?.steam_capacity_tph_per_boiler ?? 30, design_barg: s10?.sim_params?.design_pressure_barg ?? null, working_barg: s10?.sim_params?.working_pressure_barg ?? null, fw_temp_c: s10?.sim_params?.feedwater_temp_degc ?? null,
  }
  if (!s10?.sim_params?.steam_capacity_tph_per_boiler) ctx.gap('Boiler steam capacity not in db: REPRESENTATIVE 30 t/h per boiler used')
  state.boilerCfg = cfg
  const blrs = (db.components || []).filter((c) => c.type === 'marine_boiler')
  const panels = (db.components || []).filter((c) => c.type === 'boiler_control_panel' && !/remote/i.test(c.params?.role || ''))
  const list = (blrs.length ? blrs : [{ id: 'BLR', name: 'Boiler', tag: 'BLR' }]).map((c, i) => ({
    id: c.id, name: c.name || c.id, tag: c.tag || c.id, panel: panels[i]?.id || null, duty: i === 0, cfg,
    bms: 'off', timer: 0, firstOut: null, lockout: false, flame: 0, pilot: false, mainValve: false, fanOn: false, ignition: false,
    firing: 0, steam_p: cfg.p_sp * 0.97, level: 0, levelTrue: 0, swell: 0, feed: 0, steam: 0, fw_sp: 0, fw_valve: 0, damper: 10, fo_p: 0, o2: 20.9,
    control: 'three-element', autoMode: true,
    pidP: makePid({ kp: 18, ki: 0.8, lo: 15, hi: 100, out: 40 }),
    pidL: makePid({ kp: 0.06, ki: 0.004, lo: -8, hi: 8, out: 0 }), // outer: level (mm) -> flow trim (t/h)
    pidF: makePid({ kp: 2.5, ki: 1.2, lo: 0, hi: 100, out: 45 }), // inner: feedwater flow (t/h) -> valve (%)
    pidL1: makePid({ kp: 0.35, ki: 0.02, lo: 0, hi: 100, out: 45 }), // legacy single element
    faults: {}, demandShare: 0,
  }))
  state.boilers = list
  state.boiler = list[0]
  state.steamDemand = 0.45 // pu of one boiler capacity, set by the ICSS crude heating loop
}

export function stepBoiler(ctx, dt) {
  const { state } = ctx
  const C = state.boilerCfg
  const running = state.boilers.filter((b) => ['modulating', 'lowfire', 'proving'].includes(b.bms))
  for (const B of state.boilers) {
    const legacy = state.variant?.S10 === 'legacy'
    B.timer += dt
    const trip = (why) => { if (B.bms === 'lockout') return; B.firstOut = why; B.lockout = true; B.bms = 'lockout'; B.timer = 0; B.mainValve = false; B.pilot = false; B.ignition = false; ctx.event('S10', `${B.tag} BOILER TRIP: ${why}, post-purge`, 'critical') }
    const auxOk = state.feeders.F_BLR_AUX ? state.feeders.F_BLR_AUX.energised : true
    B.fo_p = approach(B.fo_p, B.faults.fuel_pump || !auxOk ? C.fo_trip * 0.6 : B.bms === 'off' ? C.fo_nom * 0.9 : C.fo_nom, 1.5, dt)
    switch (B.bms) {
      case 'prepurge': B.fanOn = true; B.damper = 100; if (B.timer >= C.t_prepurge) { B.bms = 'ignition'; B.timer = 0; B.damper = 25; B.ignition = true; B.pilot = true } break
      case 'ignition': if (B.timer > 1.5 && !B.faults.no_ignition && !B.faults.scanner) B.flame = approach(B.flame, 55, 3, dt); if (B.timer >= C.t_ignition) { if (B.flame >= C.flame_alarm) { B.bms = 'proving'; B.timer = 0; B.mainValve = true; B.ignition = false } else trip('ignition failure (pilot flame not proven)') } break
      case 'proving': B.flame = approach(B.flame, 85, 2, dt); if (B.timer >= C.t_proving) { if (B.flame >= C.flame_alarm) { B.bms = 'lowfire'; B.timer = 0; B.pilot = false; ctx.event('S10', `${B.tag} main flame proven, low fire hold`) } else trip('main flame not proven') } break
      case 'lowfire': if (B.timer >= C.t_lowfire) { B.bms = 'modulating'; B.timer = 0; B.pidP.i = 30; B.pidP.out = 30; ctx.event('S10', `${B.tag} modulating on steam pressure`) } break
      case 'postpurge': B.fanOn = true; B.damper = 100; if (B.timer >= C.t_postpurge) { B.bms = 'off'; B.timer = 0; B.fanOn = false; B.damper = 10 } break
      case 'lockout': B.fanOn = B.timer < C.t_postpurge; B.damper = B.fanOn ? 100 : 10; break
      default: B.fanOn = false
    }
    const burning = ['proving', 'lowfire', 'modulating'].includes(B.bms)
    if (!burning && B.bms !== 'ignition') B.flame = approach(B.flame, 0, 6, dt)
    if (B.faults.scanner && (burning || B.bms === 'ignition')) B.flame = approach(B.flame, 0, 12, dt)
    // firing rate: steam pressure control
    if (B.bms === 'modulating') {
      B.pidP.sp = C.p_sp
      B.firing = B.autoMode ? stepPid(B.pidP, B.steam_p, dt) : B.pidP.out
      if (B.faults.fuel_valve_stuck) B.firing = 100
      B.damper = clamp(B.firing * 0.9 + 10, 10, 100)
    } else B.firing = B.bms === 'lowfire' ? 25 : B.bms === 'proving' ? 20 : B.bms === 'ignition' ? 3 : 0
    B.o2 = approach(B.o2, burning ? (C.o2_normal.length > 1 ? (C.o2_normal[0] + C.o2_normal[1]) / 2 : 3) + (B.faults.air ? 4 : 0) : 20.9, 0.3, dt)
    // steam generation vs demand (t/h); demand is shared between running boilers
    const share = burning ? state.steamDemand / Math.max(1, running.length) : 0
    const gen = (B.firing / 100) * C.max_tph * (burning ? 1 : 0)
    const steamTarget = share * C.max_tph * clamp(B.steam_p / C.p_sp, 0, 1.1)
    const prevSteam = B.steam
    B.steam = approach(B.steam, B.bms === 'off' || B.bms === 'lockout' ? 0 : steamTarget, 1.5, dt)
    B.steam_p = clamp(B.steam_p + ((gen - B.steam) / C.max_tph) * 0.4 * dt, 0, C.p_trip * 1.3)
    // shrink and swell: a steam increase swells the apparent level, decays as pressure recovers
    B.swell = B.swell * Math.exp(-dt / 10) + (B.steam - prevSteam) * 4
    // drum level control
    const feedMax = C.max_tph * 1.3
    if (legacy || B.control === 'single-element') {
      B.pidL1.sp = 0
      B.fw_valve = approach(B.fw_valve, stepPid(B.pidL1, B.level, dt), 3, dt)
      B.fw_sp = null
    } else {
      B.pidL.sp = 0
      const trim = stepPid(B.pidL, B.level, dt)
      B.fw_sp = clamp(B.steam + trim, 0, feedMax)
      B.pidF.sp = B.fw_sp
      B.fw_valve = approach(B.fw_valve, stepPid(B.pidF, B.feed, dt), 3, dt)
    }
    if (B.faults.feed_pump) B.fw_valve = Math.min(B.fw_valve, 100)
    B.feed = approach(B.feed, B.faults.feed_pump || !auxOk ? 0 : (B.fw_valve / 100) * feedMax, 2, dt)
    B.levelTrue = clamp(B.levelTrue + (B.feed - B.steam) * 0.8 * dt, -400, 400)
    B.level = B.levelTrue + B.swell
    // trips
    if (burning || B.bms === 'ignition') {
      if (B.level < C.l_lowlow) trip('drum level low-low')
      if (burning && B.flame < C.flame_alarm) { B.ffTimer = (B.ffTimer || 0) + dt; if (B.ffTimer >= C.t_ffr) trip('flame failure') } else B.ffTimer = 0
      if (B.steam_p > C.p_trip) trip('steam pressure high-high')
      if (B.fo_p < C.fo_trip) trip('fuel oil pressure low')
      if (B.faults.fd_fan) trip('combustion air fan failure')
    }
    B.status = bmsLabel(B.bms)
    const A = (code, text, sev, on) => ctx.alarm('S10', `${code}_${B.id}`, `${B.tag} ${text}`, sev, on, { componentId: B.panel || B.id })
    A('BLR_TRIP', `trip: ${B.firstOut || ''}`, 'critical', B.bms === 'lockout')
    A('BLR_LVL_LO', 'drum level low', 'high', B.level < C.l_low && B.bms !== 'off')
    A('BLR_LVL_HI', 'drum level high', 'high', B.level > C.l_high)
    A('BLR_P_HI', 'steam pressure high', 'high', B.steam_p > C.p_high)
    A('BLR_FO_LO', 'fuel oil pressure low', 'high', B.fo_p < C.fo_alarm && B.bms !== 'off')
    A('BLR_SCANNER', 'flame signal weak', 'low', burning && B.flame < C.flame_normal && B.flame >= C.flame_alarm)
  }
}

export function boilerCommands(ctx) {
  const { state } = ctx
  const B = (id) => state.boilers.find((b) => b.id === id) || state.boilers[0]
  return {
    'boiler.start': ({ id } = {}) => { const b = B(id); if (b.lockout || b.bms !== 'off') return false; b.bms = 'prepurge'; b.timer = 0; ctx.event('S10', `${b.tag} start request: pre-purge`); return true },
    'boiler.stop': ({ id } = {}) => { const b = B(id); if (['off', 'lockout', 'postpurge'].includes(b.bms)) return false; b.bms = 'postpurge'; b.timer = 0; b.mainValve = false; b.pilot = false; ctx.event('S10', `${b.tag} normal stop: post-purge`); return true },
    'boiler.reset': ({ id } = {}) => { const b = B(id); if (b.bms !== 'lockout') return false; if (Object.values(b.faults).some(Boolean)) { ctx.event('S10', `${b.tag} BMS reset refused: fault still present`, 'low'); return false } if (b.timer < state.boilerCfg.t_postpurge) { ctx.event('S10', `${b.tag} reset refused: post-purge in progress`, 'low'); return false } b.bms = 'off'; b.lockout = false; b.firstOut = null; ctx.event('S10', `${b.tag} BMS lockout reset`); return true },
    'boiler.demand': ({ pct }) => { state.steamDemand = clamp(Number(pct) / 100, 0, 2); state.steamDemandManual = state.t; return true },
    'boiler.setpoint': ({ p }) => { state.boilerCfg.p_sp = Number(p); return true },
    'boiler.control': ({ id, mode } = {}) => { const b = B(id); b.control = mode === 'single-element' ? 'single-element' : 'three-element'; return true },
  }
}

// ---------------- IGG ----------------
export const IGG_STATES = { stopped: 'Stopped', prepurge: 'Pre-purge', ignition: 'Ignition', venting: 'Venting (O2 settling)', delivering: 'Delivering to deck', topping: 'Topping-up', autovent: 'Automatic venting (high O2)', shutdown: 'Shutdown' }

export function initIgg(ctx) {
  const { db, state } = ctx
  const mo = meas(db, 'S11', /\bO2\b|oxygen content/i)
  const mp = meas(db, 'S11', /IG main press|deck.*press|mmWG|IG press/i)
  const mt = meas(db, 'S11', /temperature/i)
  const mro = meas(db, 'S11', /room oxygen|AT-RO2/i)
  const oN = nums(mo, 'normal')
  const pN = nums(mp, 'normal')
  const pA = nums(mp, 'alarm')
  const SP = (db.systems || []).find((s) => s.id === 'S11')?.sim_params || {}
  const demoIgg = 0.25 // purge and stabilising times compressed for the demonstration (db basis allows shortening)
  state.iggCfg = {
    o2_unit: mo?.unit || '% vol', o2_sp: oN.length > 1 ? (oN[0] + oN[1]) / 2 : oN[0] ?? 3, o2_normal: oN,
    o2_alarm: SP.o2_high_alarm_pct ?? pick(ctx, mo, 'alarm', 0, 5, 'S11 O2 high alarm'), o2_basis: mo?.basis || 'REPRESENTATIVE', o2_trip_text: mo?.trip || '',
    dp_unit: mp?.unit || 'mmWG', dp_normal: pN.length > 1 ? pN : [300, 1000], dp_low: SP.ig_main_low_pressure_alarm_mmwg ?? pA[0] ?? 100,
    dp_high: SP.ig_main_high_pressure_alarm_mmwg ?? (ctx.gap('S11 IG main high pressure alarm not in db: REPRESENTATIVE 1200 mmWG'), 1200),
    t_normal: nums(mt, 'normal')[0] ?? 40, t_high: SP.ig_high_temperature_alarm_degc ?? (ctx.gap('S11 IG high temperature alarm not in db: REPRESENTATIVE 65 degC'), 65),
    room_o2_alarm: SP.room_o2_low_alarm_pct ?? nums(mro, 'alarm')[0] ?? 19,
    sw_nom: SP.scrubber_water_flow_nominal_m3h ?? 150, sw_low: SP.scrubber_water_flow_low_alarm_m3h ?? 100,
    seal_normal: SP.deck_seal_level_normal_pct ?? 60, seal_low: SP.deck_seal_level_low_alarm_pct ?? 30,
    capacity_nm3h: SP.ig_capacity_nm3h ?? null, capacity_note: SP.ig_capacity_note || '',
    prepurge_db_s: SP.prepurge_s ?? 60, ignition_s: SP.ignition_trial_s ?? 10, stabilise_db_s: SP.venting_stabilise_s ?? 120,
    prepurge_s: (SP.prepurge_s ?? 60) * demoIgg, stabilise_s: (SP.venting_stabilise_s ?? 120) * demoIgg, timeCompression: demoIgg,
    basis: SP.basis || 'REPRESENTATIVE',
  }
  if (!SP.scrubber_water_flow_nominal_m3h) ctx.gap('S11 sim_params missing: REPRESENTATIVE IGG values used')
  state.igg = {
    state: 'stopped', timer: 0, blower: false, sw_pump: false, burner: false, flame: 0, load: 0, o2: 20.9, o2_reading: 20.9, gasT: 30, sw_flow: 0,
    seal_level: state.iggCfg.seal_normal, vent: true, regValve: false, deckValve: true, delivery_p: 0, deck_p: (state.iggCfg.dp_normal[0] + state.iggCfg.dp_normal[1]) / 2 * 0.7, discharge: false, room_o2: 20.9,
    firstOut: null, lockout: false, pidO2: makePid({ kp: 2, ki: 0.6, lo: -15, hi: 15, out: 0, direct: 1 }), lowO2T: 0, faults: {}, label: 'Stopped',
  }
}

export function stepIgg(ctx, dt) {
  const { state } = ctx
  const I = state.igg, C = state.iggCfg
  const legacy = state.variant?.S11 === 'legacy'
  I.timer += dt
  // predetermined shutdown limits: IGG shuts down, burner off, regulating valve closes, vent opens
  const shutdown = (why) => { if (I.state === 'shutdown') return; I.state = 'shutdown'; I.timer = 0; I.firstOut = why; I.lockout = true; I.burner = false; I.vent = true; I.regValve = false; ctx.event('S11', `IGG SHUTDOWN: ${why}; regulating valve closed`, 'critical') }
  const blowerFeeder = state.feeders.F_IGG_BLW1
  const blowerSupply = blowerFeeder ? state.breakers[blowerFeeder.breaker]?.state === 'closed' && blowerFeeder.energised : true
  I.sw_flow = approach(I.sw_flow, I.sw_pump ? (I.faults.sw_low ? C.sw_low * 0.6 : C.sw_nom) : 0, 0.8, dt)
  switch (I.state) {
    case 'prepurge':
      I.sw_pump = true; I.blower = true
      if (I.timer >= C.prepurge_s) { I.state = 'ignition'; I.timer = 0 }
      break
    case 'ignition':
      I.burner = true
      if (I.timer >= C.ignition_s) { if (I.flame > 50) { I.state = 'venting'; I.timer = 0; ctx.event('S11', 'IGG flame established: venting until O2 settles') } else shutdown('flame failure on ignition') }
      break
    case 'venting': case 'autovent':
      I.vent = true; I.regValve = false
      if (I.o2_reading < C.o2_alarm * 0.85 && I.seal_level > C.seal_low) I.lowO2T += dt; else I.lowO2T = 0
      if (I.lowO2T > C.stabilise_s && !legacy) { I.state = 'delivering'; I.timer = 0; ctx.event('S11', 'O2 within limit: regulating valve opened, delivering to deck, vent closed') }
      break
    case 'delivering': case 'topping':
      I.vent = false; I.regValve = true
      I.state = state.cargoFlowPu > 0.05 ? 'delivering' : 'topping'
      if (I.o2_reading >= C.o2_alarm) { I.state = 'autovent'; I.timer = 0; I.lowO2T = 0; ctx.event('S11', `O2 above ${C.o2_alarm} ${C.o2_unit} (${I.o2_reading.toFixed(1)}): inert gas vented to atmosphere, delivery to tanks stopped`, 'high') }
      if (I.seal_level < C.seal_low) { I.state = 'venting'; ctx.event('S11', 'Deck water seal level low: delivery stopped', 'high') }
      break
    case 'stopped': I.burner = false; I.blower = false; I.sw_pump = false; I.vent = true; I.regValve = false; break
    case 'shutdown': I.burner = false; I.blower = I.timer < 10; I.vent = true; I.regValve = false; break
  }
  I.flame = approach(I.flame, I.burner ? 90 : 0, 2, dt)
  I.load = approach(I.load, I.burner ? Math.min(I.state === 'topping' ? 40 : 85, I.faults.derate ? 45 : 100) : 0, 0.3, dt)
  let o2target = 20.9
  if (I.burner && I.flame > 40) {
    I.pidO2.sp = C.o2_sp
    const trim = stepPid(I.pidO2, I.o2, dt)
    o2target = clamp(C.o2_sp + trim * 0.12 + (I.faults.lean ? C.o2_alarm * 0.9 : 0), 0.5, 20.9)
  }
  I.o2 = approach(I.o2, o2target, I.burner ? 0.25 : 0.1, dt)
  I.o2_reading = I.faults.analyser_drift ? I.o2 + 1.5 : I.o2
  I.gasT = approach(I.gasT, I.burner ? (I.sw_flow > C.sw_low ? C.t_normal - 4 : C.t_high + 30) : 30, 0.1, dt)
  I.seal_level = approach(I.seal_level, I.faults.seal_low ? C.seal_low * 0.5 : C.seal_normal, 0.05, dt)
  I.room_o2 = approach(I.room_o2, I.faults.room_leak ? C.room_o2_alarm - 1.5 : 20.9, 0.05, dt)
  // IG main pressure: inflow when delivering, outflow with cargo discharge (cargo pump flow), small leakage
  // REPRESENTATIVE illustrative sizing: IGG at full output matches about 1.1 x one cargo pump rated flow pair at 85 % speed
  const inflow = I.regValve ? (I.load / 100) * (state.iggToCargo || 1.25) : 0
  const outflow = (state.cargoFlowPu || 0) * 0.95 + (I.discharge ? 0.5 : 0)
  I.deck_p = clamp(I.deck_p + (inflow - outflow) * 25 * dt - 0.4 * dt - (I.deck_p > C.dp_normal[1] ? 30 * dt : 0), 0, C.dp_high * 1.3)
  I.delivery_p = approach(I.delivery_p, I.blower ? (I.regValve ? I.deck_p + 150 : 250) : 0, 1, dt)
  if (I.burner || ['prepurge', 'ignition'].includes(I.state)) {
    if (I.sw_flow < C.sw_low * 0.8 && I.timer > 4) shutdown('scrubber cooling water low pressure or flow')
    if (I.gasT > C.t_high) shutdown('IG temperature high at discharge')
    if (I.faults.blower || !blowerSupply) shutdown('IG blower failure')
    if (I.faults.fuel) shutdown('insufficient fuel oil supply')
  }
  I.label = IGG_STATES[I.state] || I.state
  const A = (code, text, sev, on) => ctx.alarm('S11', code, text, sev, on)
  A('IGG_O2_HIGH', `Oxygen content above ${C.o2_alarm} ${C.o2_unit}`, 'critical', I.burner && I.o2_reading >= C.o2_alarm)
  A('IGG_TRIP', `IGG shutdown: ${I.firstOut || ''}`, 'critical', I.state === 'shutdown')
  A('IGG_SEAL_LO', 'Deck water seal low water level', 'high', I.seal_level < C.seal_low)
  A('IGG_DP_HI', 'IG main pressure high', 'high', I.deck_p > C.dp_high)
  A('IGG_DP_LO', `IG main pressure low (below ${C.dp_low} ${C.dp_unit})`, 'critical', I.deck_p < C.dp_low)
  A('IGG_SW_LO', 'Scrubber cooling water low pressure or flow', 'high', I.sw_pump && I.sw_flow < C.sw_low && I.timer > 6)
  A('IGG_ROOM_O2', `IG room oxygen below ${C.room_o2_alarm} %`, 'critical', I.room_o2 < C.room_o2_alarm)
}

export function iggCommands(ctx) {
  const { state } = ctx
  const I = () => state.igg
  return {
    'igg.start': () => {
      const i = I(); if (i.lockout || i.state !== 'stopped') return false
      const f = state.feeders.F_IGG_BLW1
      if (f && state.breakers[f.breaker]?.state !== 'closed') ctx.command('feeder.start', { feeder: f.id })
      i.state = 'prepurge'; i.timer = 0; ctx.event('S11', 'IGG start: scrubber water, blower, pre-purge'); return true
    },
    'igg.stop': () => { const i = I(); if (i.state === 'stopped') return false; i.state = 'stopped'; i.timer = 0; ctx.event('S11', 'IGG stop'); return true },
    'igg.deliver': ({ on }) => {
      const i = I(); const C = state.iggCfg
      if (on) { if (!['venting', 'autovent'].includes(i.state) || i.o2_reading >= C.o2_alarm || i.seal_level < C.seal_low) { ctx.event('S11', 'Delivery refused: O2 or deck seal not within limits', 'low'); return false } i.state = 'delivering'; ctx.event('S11', 'Delivery to deck opened (operator changeover)'); return true }
      if (['delivering', 'topping'].includes(i.state)) { i.state = 'venting'; return true }
      return false
    },
    'igg.reset': () => { const i = I(); if (i.state !== 'shutdown') return false; if (Object.values(i.faults).some(Boolean)) return false; i.state = 'stopped'; i.lockout = false; i.firstOut = null; return true },
    'igg.discharge': ({ on }) => { I().discharge = !!on; ctx.event('S11', on ? 'Additional cargo discharge demand (context)' : 'Additional discharge demand removed'); return true },
  }
}
