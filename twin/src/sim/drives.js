// Drives and pump controls (S04): VFD with DC link precharge, ramps, local/remote, speed or pressure control,
// pump and system curves (affinity laws with static head), motor current, DC link, heatsink, motor thermal
// image, trips and interlocks (PMS heavy consumer permission, pump room gas, IG main low pressure).
// Drive input power is the feeder load seen by the electrical network (same number in PMS and drive views).
// Legacy variant: direct on line motor at fixed speed with a throttling valve.
// EDUCATIONAL SIMULATION. Pump duty data from db feeders (REPRESENTATIVE) where given.

import { approach, clamp, makePid, stepPid, allNumbers } from './util.js'
import { breakerClose } from './electrical.js'

export function pumpPoint(P, n, valvePct = 100, jam = false) {
  const valve = valvePct / 100
  const cEff = P.c / Math.max(0.05, valve * valve)
  let Q = Math.sqrt(Math.max(0, (P.H0 * n * n - P.Hs) / (P.k + cEff)))
  if (jam) Q *= 0.2
  const H = Math.max(0, P.H0 * n * n - P.k * Q * Q)
  return { Q, H }
}

// throttling valve opening that gives flow Q at full speed (legacy comparison), by bisection
export function valveForFlow(P, Q) {
  let lo = 5, hi = 100
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (pumpPoint(P, 1, m).Q > Q) hi = m; else lo = m }
  return (lo + hi) / 2
}

export function initDrives(ctx) {
  const { db, state } = ctx
  state.drives = {}
  const s04 = (db.systems || []).find((s) => s.id === 'S04')
  const mSpd = (s04?.measurements || []).find((m) => /speed/i.test(m.name))
  const mI = (s04?.measurements || []).find((m) => /current/i.test(m.name))
  const mDc = (s04?.measurements || []).find((m) => /DC link/i.test(m.name))
  const mT = (s04?.measurements || []).find((m) => /heatsink|temperature/i.test(m.name))
  const mPd = (s04?.measurements || []).find((m) => /discharge pressure/i.test(m.name))
  const rpmMax = allNumbers(mSpd?.normal).slice(-1)[0] || 1790
  const SP = s04?.sim_params || {}
  state.driveCfg = {
    rpm_rated: rpmMax, rpm_alarm: allNumbers(mSpd?.alarm)[0] || null,
    i_alarm_pct: allNumbers(mI?.alarm)[0] ?? 110, i_alarm_s: allNumbers(mI?.alarm)[1] ?? 60, i_trip_pct: allNumbers(mI?.trip)[0] ?? 150,
    dc_alarm_lo: SP.dc_link_alarm_low_pct ?? allNumbers(mDc?.alarm)[0] ?? 85, dc_alarm_hi: SP.dc_link_alarm_high_pct ?? allNumbers(mDc?.alarm)[1] ?? 115, dc_trip_lo: SP.dc_link_undervoltage_trip_pct ?? 75, dc_trip_hi: SP.dc_link_overvoltage_trip_pct ?? 120,
    hs_alarm: allNumbers(mT?.alarm)[0] ?? 75, hs_trip: allNumbers(mT?.trip)[0] ?? 85,
    cp_pd_alarm: allNumbers(mPd?.alarm)[0] ?? null, precharge_s: SP.precharge_s ?? 1.5, basis: SP.basis || 'REPRESENTATIVE',
  }
  if (SP.dc_link_undervoltage_trip_pct == null) ctx.gap('S04 DC link undervoltage trip level not in db: REPRESENTATIVE 75 % used')
  const comps = (db.components || []).filter((c) => c.type === 'vfd_cabinet')
  for (const c of comps) {
    const f = Object.values(state.feeders).find((x) => x.drive === c.id)
    const pr = f ? f.rated_kw : c.params?.rating_kw || 500
    const pd = f?.pump
    const sg = pd && /SG\s*(\d+(\.\d+)?)/i.test(pd.fluid) ? Number(pd.fluid.match(/SG\s*(\d+(\.\d+)?)/i)[1]) : 1.025
    const Hr = pd?.head_m || 30
    const Qr = pd?.flow_m3h || Math.round(((pr * 1000 * 0.92 * 0.75) / (sg * 1000 * 9.81 * Hr)) * 3600)
    if (!pd) ctx.gap(`${c.id}: pump rated flow and head not in db: REPRESENTATIVE ${Qr} m3/h at ${Hr} m used`)
    const vn = f ? state.buses[f.bus]?.vn_kv || 0.44 : 0.44
    const name = c.name || f?.name || c.id
    state.drives[c.id] = {
      id: c.id, name, tag: c.tag || c.id, feeder: f?.id || null, rated_kw: pr, voltage_kv: vn,
      kind: /cargo/i.test(`${name} ${f?.name || ''}`) ? 'cargo' : /ballast/i.test(`${name} ${f?.name || ''}`) ? 'ballast' : 'utility',
      fluid: pd?.fluid || 'sea water (assumed)', sg,
      control: 'remote', mode: 'speed', run: false, status: 'Stopped', speed: 0, ref: 100, accel_s: f?.start_s && f.kind === 'vfd' ? f.start_s : 10, decel_s: 15,
      pump: { Qr, Hr, H0: 1.25 * Hr, k: (0.25 * Hr) / (Qr * Qr), Hs: 0.4 * Hr, c: (0.6 * Hr) / (Qr * Qr), valve: 100 },
      flow: 0, head: 0, p_bar: 0, kw: 0, i_a: 0, ir_a: (pr * 1000) / (Math.sqrt(3) * vn * 1000 * 0.86 * 0.95), v_motor: 0, f_out: 0, rpm: 0,
      dc_v: 0, dc_nom: 1.35 * vn * 1000, dc_pct: 0, precharge: 0, precharged: false, heatsink: 35, thermal: 0, trip: null, faults: {}, uvTimer: 0, iTimer: 0,
      pid: makePid({ kp: 0.6, ki: 0.15, lo: 20, hi: 100, out: 80 }), head_sp: Math.round(0.85 * Hr), interlock: null, permission: f?.heavy ? 'required' : 'not required', log: [],
    }
  }
}

export function stepDrives(ctx, dt) {
  const { state } = ctx
  const C = state.driveCfg
  const legacy = state.variant?.S04 === 'legacy'
  const fnHz = state.nominal.f_hz
  let cargoQ = 0, cargoQr = 0
  for (const d of Object.values(state.drives)) {
    const f = d.feeder ? state.feeders[d.feeder] : null
    const bus = f ? state.buses[f.bus] : null
    const br = f ? state.breakers[f.breaker] : null
    const supply = !f || (bus && bus.live && (!br || br.state === 'closed'))
    const vpu = bus && bus.vn_kv ? bus.v_kv / bus.vn_kv : 1
    // DC link: precharge through resistors when supply returns, then follows the supply
    if (supply && !d.precharged) { d.precharge += dt; d.dc_v = approach(d.dc_v, d.dc_nom * vpu * 0.9, 3, dt); if (d.precharge >= C.precharge_s) { d.precharged = true; log(d, state, 'DC link precharged, drive ready') } }
    else if (supply) d.dc_v = approach(d.dc_v, d.dc_nom * vpu * (d.faults.dc_uv ? 0.6 : 1), 6, dt)
    else { d.dc_v = approach(d.dc_v, 0, 2, dt); if (d.dc_v < 0.5 * d.dc_nom) { d.precharged = false; d.precharge = 0 } }
    d.dc_pct = (100 * d.dc_v) / d.dc_nom
    if (d.run && d.precharged && d.dc_pct < C.dc_trip_lo) { d.uvTimer += dt; if (d.uvTimer > 0.3) doTrip(ctx, d, 'DC bus undervoltage') } else d.uvTimer = 0
    // interlocks
    const pumpRoomGas = state.icss?.fg?.zones?.some((z) => /pump/i.test(z.name) && z.state !== 'normal' && z.count > 0)
    const igLow = d.kind === 'cargo' && state.igg && state.igg.deck_p < state.iggCfg.dp_low
    d.interlock = (d.kind === 'cargo' || d.kind === 'ballast') && pumpRoomGas ? 'Pump room gas detected (start interlock)' : igLow ? 'IG main pressure low (cargo pump interlock)' : null
    if (d.interlock && d.run) { d.run = false; log(d, state, `Stopped by interlock: ${d.interlock}`); ctx.event('S04', `${d.tag} stopped by interlock: ${d.interlock}`, 'high') }
    // reference and ramp
    let ref = d.run && d.precharged ? d.ref : 0
    if (legacy) ref = d.run ? 100 : 0
    else if (d.run && d.mode === 'pressure') { d.pid.sp = d.head_sp; ref = stepPid(d.pid, d.head, dt) }
    const rate = ref > d.speed ? 100 / (legacy ? 3 : d.accel_s) : 100 / (legacy ? 6 : d.decel_s)
    d.speed = d.speed + clamp(ref - d.speed, -rate * dt, rate * dt)
    if (d.trip || !supply) d.speed = Math.max(0, d.speed - (100 / 4) * dt) // coast down
    const n = d.speed / 100
    const pt = pumpPoint(d.pump, n, legacy ? d.pump.valve : 100, !!d.faults.jam)
    d.flow = pt.Q; d.head = pt.H
    d.p_bar = (d.sg * 1000 * 9.81 * d.head) / 1e5
    let shaft = d.rated_kw * 0.92 * ((d.flow * d.head) / (d.pump.Qr * d.pump.Hr)) + 0.02 * d.rated_kw * n
    if (d.faults.jam) shaft = d.rated_kw * 1.9 * n
    d.kw = d.speed > 0.5 && supply ? shaft / (legacy ? 0.95 : 0.95 * 0.97) : 0
    d.f_out = legacy ? (d.speed > 0 ? fnHz : 0) : fnHz * n
    d.rpm = n * C.rpm_rated
    d.v_motor = (legacy ? 1 : Math.min(1, n * 1.02)) * d.voltage_kv * 1000
    const torquePu = n > 0.05 ? d.kw / d.rated_kw / n : 0
    d.i_a = d.speed > 0.5 && supply ? d.ir_a * Math.sqrt(0.1 + 0.9 * torquePu * torquePu) : 0
    d.i_pct = (100 * d.i_a) / d.ir_a
    d.heatsink = approach(d.heatsink, 35 + 22 * (d.i_a / d.ir_a) ** 2 + (d.faults.fan ? 55 : 0), 0.05, dt)
    d.thermal = approach(d.thermal, 100 * (d.i_a / d.ir_a) ** 2, 1 / 90, dt)
    if (d.i_pct > C.i_alarm_pct) d.iTimer += dt; else d.iTimer = 0
    if (!d.trip && d.i_pct > C.i_trip_pct) doTrip(ctx, d, 'Overcurrent')
    if (!d.trip && d.heatsink > C.hs_trip) doTrip(ctx, d, 'Drive overtemperature (heatsink)')
    if (!d.trip && d.thermal > 115) doTrip(ctx, d, 'Motor thermal overload')
    d.status = d.trip ? 'Fault' : !supply ? 'No supply' : !d.precharged ? 'Precharging' : d.run ? (Math.abs(d.speed - ref) > 1 ? (ref > d.speed ? 'Starting (ramp)' : 'Stopping') : 'Running (speed control)') : d.speed > 0.5 ? 'Stopping' : 'Ready'
    if (f) f.demand_kw = supply ? d.kw + (d.precharged ? 0.005 * d.rated_kw : 0) : 0
    if (d.kind === 'cargo') { cargoQ += d.flow; cargoQr += d.pump.Qr }
    const A = (code, text, sev, on) => ctx.alarm('S04', `${code}_${d.id}`, `${d.tag} ${text}`, sev, on, { componentId: d.id })
    A('VFD_TRIP', `drive fault trip: ${d.trip || ''}`, 'high', !!d.trip)
    A('VFD_HS', 'heatsink temperature high', 'low', d.heatsink > C.hs_alarm && !d.trip)
    A('VFD_TH', 'motor winding high temperature (thermal image)', 'high', d.thermal > 100 && !d.trip)
    A('VFD_FAN', 'cooling fan failure', 'high', !!d.faults.fan)
    A('VFD_I', `motor current above ${C.i_alarm_pct} % for ${C.i_alarm_s} s`, 'low', d.iTimer > C.i_alarm_s)
    A('VFD_DC', 'DC link voltage out of range', 'low', d.precharged && supply && (d.dc_pct < C.dc_alarm_lo || d.dc_pct > C.dc_alarm_hi))
    A('VFD_PERM', 'PMS start permission denied (waiting for capacity)', 'low', d.permission === 'waiting')
    A('VFD_GAS', 'pump room gas detected: start interlock', 'critical', !!d.interlock && /gas/.test(d.interlock))
    A('VFD_LOCAL', 'in LOCAL control', 'low', d.control === 'local')
    if (d.kind === 'cargo' && C.cp_pd_alarm) A('CP_PD', 'cargo pump discharge pressure high', 'high', d.p_bar > C.cp_pd_alarm)
  }
  state.cargoFlowPu = cargoQr ? cargoQ / cargoQr : 0
  // IG capacity relative to the combined cargo pump rated flow (db S11 ig_capacity_nm3h), used by the IG main pressure model
  if (state.iggCfg?.capacity_nm3h && cargoQr) state.iggToCargo = state.iggCfg.capacity_nm3h / cargoQr
}

function log(d, state, text) { d.log.unshift({ t: state.t, text }); if (d.log.length > 30) d.log.pop() }
function doTrip(ctx, d, why) {
  if (d.trip) return
  d.trip = why; d.run = false
  log(d, ctx.state, `TRIP: ${why} (speed ${d.speed.toFixed(0)} %, current ${d.i_pct?.toFixed(0)} %, DC link ${d.dc_pct.toFixed(0)} %, heatsink ${d.heatsink.toFixed(0)} degC)`)
  ctx.event('S04', `${d.tag} TRIP: ${why}`, 'high')
}

export function driveCommands(ctx) {
  const { state } = ctx
  const D = (id) => state.drives[id]
  return {
    'drive.start': ({ id, by }) => {
      const d = D(id); if (!d) return false
      if (d.control === 'local' && by !== 'local') { ctx.event('S04', `${d.tag} remote start refused: LOCAL`, 'low'); return false }
      if (d.trip) { ctx.event('S04', `${d.tag} start refused: fault active, reset first`, 'low'); return false }
      if (d.interlock) { ctx.event('S04', `${d.tag} start refused: ${d.interlock}`, 'high'); return false }
      const f = d.feeder ? state.feeders[d.feeder] : null
      if (f && f.heavy && state.pms.mode !== 'manual' && state.variant?.S02 !== 'legacy') { log(d, state, 'Start requested: waiting for PMS permission'); return ctx.command('pms.hc_request', { feeder: f.id }) }
      if (f && state.breakers[f.breaker]?.state !== 'closed') { if (!breakerClose(ctx, f.breaker, 'drive start')) return false }
      d.run = true; log(d, state, `Start (${by || 'operator'})`); ctx.event('S04', `${d.tag} start (${by || 'operator'})`); return true
    },
    'drive.stop': ({ id }) => { const d = D(id); if (!d) return false; d.run = false; log(d, state, 'Stop'); ctx.event('S04', `${d.tag} stop`); return true },
    'drive.ref': ({ id, ref }) => { const d = D(id); if (!d) return false; d.ref = clamp(Number(ref), 0, 100); return true },
    'drive.mode': ({ id, mode }) => { const d = D(id); if (!d || !['speed', 'pressure'].includes(mode)) return false; d.mode = mode; d.pid.i = d.speed; d.pid.out = d.speed; return true },
    'drive.head_sp': ({ id, sp }) => { const d = D(id); if (!d) return false; d.head_sp = Number(sp); return true },
    'drive.control': ({ id, location }) => { const d = D(id); if (!d || !['local', 'remote'].includes(location)) return false; d.control = location; log(d, state, `Control ${location.toUpperCase()}`); return true },
    'drive.valve': ({ id, pct }) => { const d = D(id); if (!d) return false; d.pump.valve = clamp(Number(pct), 5, 100); return true },
    'drive.reset': ({ id }) => {
      const d = D(id); if (!d) return false
      if (d.faults.jam || d.faults.fan || d.faults.dc_uv) { ctx.event('S04', `${d.tag} reset refused: fault still present`, 'low'); return false }
      if (d.heatsink > state.driveCfg.hs_alarm || d.thermal > 95) { ctx.event('S04', `${d.tag} reset refused: cooling down`, 'low'); return false }
      d.trip = null; log(d, state, 'Fault reset'); ctx.event('S04', `${d.tag} fault reset`); return true
    },
  }
}
