// ICSS (S05): process control loops (PCS), ESD hierarchy and shutdown valves, F&G detection with voting,
// cause and effect matrix, alarm handling support and system health (redundant controllers, I/O, network).
// Effects act on the same simulation objects (PAGA, CCTV, IGG, boilers, drives), so every view stays consistent.
// Tags and limits follow db S05 measurements (PT-1001, LT-1002, TT-2001, GD-3001, GD-PR-01) where given.
// EDUCATIONAL SIMULATION: representative loops and cause and effect, not a project C&E or safety requirement spec.

import { approach, clamp, makePid, stepPid, allNumbers } from './util.js'

export const ESD_LEVELS = [
  { id: 'APS', name: 'APS: abandon platform shutdown', desc: 'Highest level, manual only (lifeboat stations, bridge, CCR). All ESD actions plus PAGA abandon signal. Main power shutdown is not simulated in this model.' },
  { id: 'ESD1', name: 'ESD-1: total process and utilities shutdown', desc: 'All production, fuel gas, IGG and boiler firing stopped, blowdown, PAGA general alarm. Essential power and safety systems remain.' },
  { id: 'ESD2', name: 'ESD-2: process shutdown', desc: 'Production isolated by the shutdown valves on confirmed gas in the process area or a manual ESD-2.' },
  { id: 'PSD3', name: 'PSD-3: unit shutdown', desc: 'One process unit stopped (for example separator high-high pressure or level), the rest keeps running.' },
]

function meas(db, re) { return ((db.systems || []).find((s) => s.id === 'S05')?.measurements || []).find((m) => re.test(`${m.tag} ${m.name}`)) }
const N = (m, k) => (m ? allNumbers(m[k]) : [])

export function initIcss(ctx) {
  const { db, state } = ctx
  const roomOf = (id) => (db.rooms || []).find((r) => r.id === id)
  const zoneDefs = [
    { id: 'FZ_PROC', room: 'R_PROC_DECK', kind: 'process', fallback: 'Topsides process deck' },
    { id: 'FZ_TURRET', room: 'R_TURRET', kind: 'process', fallback: 'Turret and swivel' },
    { id: 'FZ_PUMP', room: 'R_PUMP', kind: 'pump', fallback: 'Cargo pump room' },
    { id: 'FZ_ER', room: 'R_ER_GEN', kind: 'machinery', fallback: 'Engine room' },
    { id: 'FZ_HV', room: 'R_HVSWBD', kind: 'electrical', fallback: 'HV switchboard room' },
    { id: 'FZ_ACC', room: 'R_MESS', kind: 'accommodation', fallback: 'Accommodation' },
  ].map((z) => ({ ...z, room: roomOf(z.room) ? z.room : null, name: roomOf(z.room)?.name || z.fallback }))
  const gdP = meas(db, /GD-3001|gas detector process/i), gdR = meas(db, /GD-PR|pump room/i)
  const gasLim = (m, lo, hi) => ({ low: N(m, 'alarm')[0] ?? lo, high: N(m, 'trip')[0] ?? hi, basis: m?.basis || 'REPRESENTATIVE' })
  const SP = (db.systems || []).find((s) => s.id === 'S05')?.sim_params || {}
  const limP = { low: SP.gas_low_alarm_pct_lel ?? gasLim(gdP, 20, 60).low, high: SP.gas_high_alarm_pct_lel ?? gasLim(gdP, 20, 60).high, basis: SP.basis || 'REPRESENTATIVE' }
  const limR = { low: SP.pump_room_gas_low_alarm_pct_lel ?? gasLim(gdR, 10, 25).low, high: SP.pump_room_gas_high_alarm_pct_lel ?? gasLim(gdR, 10, 25).high, basis: SP.basis || 'REPRESENTATIVE' }
  const comps = db.components || []
  const realTag = (id, t) => comps.find((c) => c.id === id)?.tag || t
  const dets = []
  const add = (zone, type, ids, lim) => ids.forEach(([tag, comp]) => dets.push({ id: tag, comp: comp || null, zone, type, value: 0, state: 'normal', lim, fault: false }))
  const groups = SP.voting_groups || []
  if (groups.length) {
    for (const g of groups) {
      const type = g.detector_kind === 'gas' ? 'GD' : g.detector_kind === 'flame' ? 'FD' : 'SD'
      const need = Number((String(g.voting).match(/(\d)oo\d/) || [0, 2])[1])
      g.tags.forEach((tag, i) => dets.push({ id: tag, comp: g.components?.[i] || null, zone: g.fg_zone, group: g.id, voting: g.voting, need, type, value: 0, state: 'normal', lim: type === 'GD' ? (g.fg_zone === 'FZ_PUMP' ? limR : limP) : null, fault: false }))
    }
  } else {
  add('FZ_PROC', 'GD', [['GD-3001', 'C_GD_3001'], ['GD-3003'], ['GD-3004']], limP)
  add('FZ_PROC', 'FD', [['FD-3002', 'C_FD_3002'], ['FD-3005'], ['FD-3006']], null)
  add('FZ_TURRET', 'GD', [['GD-4001'], ['GD-4002'], ['GD-4003']], limP)
  add('FZ_TURRET', 'FD', [['FD-4004'], ['FD-4005']], null)
  add('FZ_PUMP', 'GD', [['GD-PR-01', 'C_GD_PR'], ['GD-PR-02'], ['GD-PR-03']], limR)
  add('FZ_ER', 'FD', [['FD-ER-01'], ['FD-ER-02'], ['FD-ER-03']], null)
  add('FZ_ER', 'SD', [['SD-ER-01'], ['SD-ER-02']], null)
  add('FZ_HV', 'SD', [['SD-HV-01'], ['SD-HV-02'], ['SD-HV-03']], null)
  add('FZ_ACC', 'SD', [['SD-AC-01'], ['SD-AC-02'], ['SD-AC-03']], null)
  ctx.gap('S05 sim_params.voting_groups missing: REPRESENTATIVE detectors used')
  }
  for (const d of dets) { if (d.comp) d.tagDb = realTag(d.comp, d.id); d.need = d.need || 2 }
  const mPT = meas(db, /PT-1001|separator inlet press/i), mLT = meas(db, /LT-1002|separator.*level/i), mTT = meas(db, /TT-2001|compressor discharge temp/i)
  const pN = N(mPT, 'normal'), lN = N(mLT, 'normal'), tN = N(mTT, 'normal')
  const mid = (a, d) => (a.length > 1 ? (a[0] + a[1]) / 2 : d)
  const loops = [
    { tag: 'PIC-1001', pvTag: 'PT-1001', name: 'Separator inlet pressure', unit: mPT?.unit || 'barg', sp: mid(pN, 10), pv: mid(pN, 10), range: [0, 20], hi: N(mPT, 'alarm')[0] ?? 14, hh: N(mPT, 'trip')[0] ?? 16, lo: null, ll: null, pid: makePid({ kp: 6, ki: 1, lo: 0, hi: 100, out: 50, direct: -1 }), dist: 0 },
    { tag: 'LIC-1002', pvTag: 'LT-1002', name: 'Separator liquid level', unit: mLT?.unit || '%', sp: mid(lN, 50), pv: mid(lN, 50), range: [0, 100], lo: N(mLT, 'alarm')[0] ?? 20, hi: N(mLT, 'alarm')[1] ?? 80, ll: N(mLT, 'trip')[0] ?? 10, hh: N(mLT, 'trip')[1] ?? 90, pid: makePid({ kp: 2, ki: 0.2, lo: 0, hi: 100, out: 60, direct: -1 }), dist: 0 },
    { tag: 'TIC-2001', pvTag: 'TT-2001', name: 'Compressor discharge temperature (after cooler)', unit: mTT?.unit || 'degC', sp: mid(tN, 110), pv: mid(tN, 110), range: [0, 200], hi: N(mTT, 'alarm')[0] ?? 150, hh: N(mTT, 'trip')[0] ?? 165, lo: null, ll: null, pid: makePid({ kp: 1.5, ki: 0.1, lo: 0, hi: 100, out: 50, direct: -1 }), dist: 0 },
    { tag: 'TIC-1201', pvTag: 'TT-1201', name: 'Crude heater outlet temperature (steam heated, REPRESENTATIVE)', unit: 'degC', sp: 70, pv: 70, range: [0, 120], hi: 90, hh: 100, lo: 50, ll: null, pid: makePid({ kp: 2.5, ki: 0.15, lo: 0, hi: 100, out: 57, direct: 1 }), dist: 0 },
  ]
  state.icss = {
    loops,
    esd: { level: null, active: {}, t: null },
    sdv: [
      { tag: 'SDV-1001', name: 'Separator inlet (riser to separator)', open: true, levels: ['APS', 'ESD1', 'ESD2', 'PSD3'] },
      { tag: 'SDV-1002', name: 'Oil export / offloading', open: true, levels: ['APS', 'ESD1', 'ESD2'] },
      { tag: 'SDV-1301', name: 'Separator liquid outlet', open: true, levels: ['APS', 'ESD1', 'ESD2'] },
      { tag: 'SDV-4001', name: 'Fuel gas to consumers', open: true, levels: ['APS', 'ESD1'] },
      { tag: 'BDV-1001', name: 'HP blowdown valve (opens on demand)', open: false, normalOpen: false, levels: ['APS', 'ESD1'] },
    ],
    fg: { zones: zoneDefs.map((z) => ({ ...z, state: 'normal', confirmed: false, voting: [...new Set(dets.filter((d) => d.zone === z.id).map((d) => d.voting || '2ooN'))].join(', '), inhibited: false, count: 0, high: 0 })), detectors: dets, groups },
    bilge: { level: 20, alarm: 70 },
    health: { items: healthItems(db) },
    ce: buildCE(),
    callup: null,
  }
}

function healthItems(db) {
  const comps = (db.components || []).filter((c) => c.system === 'S05' && ['control_cabinet', 'safety_controller_cabinet', 'operator_console', 'large_display_wall', 'workstation_desk', 'marshalling_cabinet'].includes(c.type))
  const items = []
  for (const c of comps) {
    if (c.params?.redundant_cpu) { items.push({ id: `${c.id}:A`, comp: c.id, name: `${c.name || c.tag} CPU A`, group: 'Controllers', state: 'primary', pair: `${c.id}:B` }); items.push({ id: `${c.id}:B`, comp: c.id, name: `${c.name || c.tag} CPU B`, group: 'Controllers', state: 'backup', pair: `${c.id}:A` }) }
    else items.push({ id: c.id, comp: c.id, name: c.name || c.tag, group: /console|display|workstation/.test(c.type) ? 'Stations' : c.type === 'marshalling_cabinet' ? 'I/O' : 'Controllers', state: 'ok' })
  }
  items.push({ id: 'NET-A', name: 'Control network ring A', group: 'Network', state: 'ok' }, { id: 'NET-B', name: 'Control network ring B', group: 'Network', state: 'ok' })
  items.push({ id: 'IF-PMS', name: 'Interface to PMS', group: 'Interfaces', state: 'ok' }, { id: 'IF-IGG', name: 'Interface to IGG', group: 'Interfaces', state: 'ok' })
  return items
}

function buildCE() {
  const effects = [
    { id: 'E_PSD3', name: 'PSD-3 separator unit (close SDV-1001)' }, { id: 'E_ESD2', name: 'ESD-2 process shutdown' }, { id: 'E_ESD1', name: 'ESD-1 total shutdown' },
    { id: 'E_BDV', name: 'Open blowdown BDV-1001' }, { id: 'E_CARGO', name: 'Stop cargo and ballast pumps' }, { id: 'E_IGG', name: 'Stop IGG' }, { id: 'E_BLR', name: 'Boiler fuel trip' },
    { id: 'E_CAM', name: 'CCTV camera call-up' }, { id: 'E_PAGA_GAS', name: 'PAGA gas tone (affected zones)' }, { id: 'E_PAGA_GA', name: 'PAGA general alarm' }, { id: 'E_PAGA_FIRE', name: 'PAGA fire alarm' }, { id: 'E_PAGA_ABN', name: 'PAGA abandon' }, { id: 'E_DAMP', name: 'Close fire dampers, stop ventilation' },
  ]
  const causes = [
    { id: 'C_PAHH', name: 'PAHH PT-1001 separator inlet pressure high-high', effects: ['E_PSD3'] },
    { id: 'C_LAHH', name: 'LAHH LT-1002 separator level high-high', effects: ['E_PSD3'] },
    { id: 'C_TAHH', name: 'TAHH TT-2001 compressor discharge temperature high-high', effects: ['E_PSD3'] },
    { id: 'C_GAS1_PROC', name: 'Gas high, single detector, process deck', effects: ['E_CAM'] },
    { id: 'C_GAS_PROC', name: 'Gas confirmed (2ooN) process deck / turret', effects: ['E_ESD2', 'E_CAM', 'E_PAGA_GAS'] },
    { id: 'C_GAS_PUMP', name: 'Gas confirmed (2ooN) cargo pump room', effects: ['E_CARGO', 'E_DAMP', 'E_CAM', 'E_PAGA_GAS'] },
    { id: 'C_FIRE_PROC', name: 'Fire confirmed (2ooN) process deck / turret', effects: ['E_ESD1', 'E_BDV', 'E_IGG', 'E_BLR', 'E_CAM', 'E_PAGA_FIRE'] },
    { id: 'C_FIRE_ER', name: 'Fire or smoke confirmed (2ooN) engine room', effects: ['E_DAMP', 'E_PAGA_FIRE'] },
    { id: 'C_MAN_ESD2', name: 'Manual ESD-2 push button (CCR)', effects: ['E_ESD2'] },
    { id: 'C_MAN_ESD1', name: 'Manual ESD-1 push button (CCR / bridge)', effects: ['E_ESD1', 'E_CARGO', 'E_IGG', 'E_BLR', 'E_PAGA_GA'] },
    { id: 'C_MAN_APS', name: 'Manual APS (lifeboat station / bridge)', effects: ['E_ESD1', 'E_BDV', 'E_CARGO', 'E_IGG', 'E_BLR', 'E_PAGA_ABN'] },
  ]
  return { effects, causes, active: {}, fired: {} }
}

export function stepIcss(ctx, dt) {
  const { state } = ctx
  const X = state.icss
  const t = state.t
  const sdv = (tag) => X.sdv.find((v) => v.tag === tag)
  const inletOpen = sdv('SDV-1001').open
  for (const L of X.loops) {
    L.pid.sp = L.sp
    const bad = !!L.fieldFault
    if (bad && L.pid.mode === 'AUTO') { L.pid.mode = 'MAN'; ctx.event('S05', `${L.pvTag} field device fault (open loop): ${L.tag} forced to MANUAL`, 'high') }
    const out = stepPid(L.pid, L.pv, dt)
    if (L.tag === 'PIC-1001') L.pv = clamp(L.pv + ((inletOpen ? 50 - out : -30) * 0.02 + L.dist * 0.05 + 0.04 * Math.sin(t / 30)) * dt * 2, 0, 20)
    else if (L.tag === 'LIC-1002') L.pv = clamp(L.pv + ((inletOpen ? 0.6 * (60 - out) : -0.6 * out) + L.dist + 1.5 * Math.sin(t / 40)) * 0.08 * dt * 10, 0, 100)
    else if (L.tag === 'TIC-2001') L.pv = approach(L.pv, 160 - out * 1.0 + L.dist, 0.1, dt)
    else { const steamOk = (state.boilers || []).some((b) => b.bms === 'modulating' && b.steam_p > b.cfg.p_sp * 0.6); L.pv = approach(L.pv, 30 + (steamOk ? out * 0.7 : 0) + L.dist, 0.08, dt) }
    L.out = out
    L.alarm = L.hh != null && L.pv >= L.hh ? 'HH' : L.hi != null && L.pv >= L.hi ? 'H' : L.ll != null && L.pv <= L.ll ? 'LL' : L.lo != null && L.pv <= L.lo ? 'L' : null
    if (bad) L.alarm = 'BAD PV'
    ctx.alarm('S05', `PCS_${L.tag}`, `${L.pvTag} ${L.name} ${L.alarm || ''}`.trim(), L.alarm === 'HH' || L.alarm === 'LL' ? 'critical' : 'high', !!L.alarm)
  }
  // steam demand from the crude heater valve -> boiler load (ICSS to S10 interface)
  const tic = X.loops.find((l) => l.tag === 'TIC-1201')
  if (tic && !(state.steamDemandManual != null && state.t - state.steamDemandManual < 120)) state.steamDemand = clamp(0.25 + (tic.out / 100) * 0.35, 0, 1.2)
  // bilge
  X.bilge.level = approach(X.bilge.level, X.bilgeFault ? 90 : 20, 0.05, dt)
  ctx.alarm('S05', 'BILGE_PR', 'Pump room bilge high', 'high', X.bilge.level > X.bilge.alarm)
  // detectors and F&G voting
  for (const d of X.fg.detectors) {
    if (d.ramp) d.value = clamp(d.value + d.ramp * dt, 0, 100)
    if (d.fault) d.state = 'fault'
    else if (d.type === 'GD') d.state = d.value >= d.lim.high ? 'high' : d.value >= d.lim.low ? 'low' : 'normal'
    else d.state = d.value >= 50 ? 'alarm' : 'normal'
  }
  for (const z of X.fg.zones) {
    const ds = X.fg.detectors.filter((d) => d.zone === z.id)
    const high = ds.filter((d) => d.state === 'high' || d.state === 'alarm').length
    const low = ds.filter((d) => d.state === 'low').length
    const faulted = ds.filter((d) => d.state === 'fault').length
    z.count = high + low; z.high = high
    // confirmation by voting group (for example 2oo3): a group reaching its vote count confirms the zone
    const grp = {}
    for (const d of ds) if (d.state === 'high' || d.state === 'alarm') grp[d.group || d.type] = (grp[d.group || d.type] || 0) + 1
    z.confirmed = !z.inhibited && Object.entries(grp).some(([k, n]) => n >= (ds.find((d) => (d.group || d.type) === k)?.need || 2))
    z.state = z.inhibited && high + low ? 'inhibited' : z.confirmed ? 'confirmed (2ooN)' : high ? 'high (1ooN)' : low ? 'low alarm' : faulted ? 'fault' : 'normal'
    ctx.alarm('S05', `FG_${z.id}`, `F&G ${z.name}: ${z.confirmed ? 'CONFIRMED (2ooN)' : high ? 'detector high' : 'detector low alarm'}`, z.confirmed || high ? 'critical' : 'high', high + low > 0)
    ctx.alarm('S05', `FGF_${z.id}`, `F&G ${z.name}: field device fault (open loop)`, 'high', faulted > 0)
    ctx.alarm('S05', `FGI_${z.id}`, `F&G ${z.name}: zone inhibited (override / maintenance bypass)`, 'low', z.inhibited)
  }
  const C = X.ce
  const zone = (id) => X.fg.zones.find((q) => q.id === id)
  const L = (tag) => X.loops.find((l) => l.tag === tag)
  const procGasHigh = X.fg.detectors.filter((d) => d.type === 'GD' && d.state === 'high' && ['FZ_PROC', 'FZ_TURRET'].includes(d.zone) && !zone(d.zone).inhibited).length
  const fireProc = X.fg.detectors.filter((d) => d.type === 'FD' && d.state === 'alarm' && ['FZ_PROC', 'FZ_TURRET'].includes(d.zone) && !zone(d.zone).inhibited).length >= 2
  const cause = {
    C_PAHH: L('PIC-1001').pv >= L('PIC-1001').hh, C_LAHH: L('LIC-1002').pv >= L('LIC-1002').hh, C_TAHH: L('TIC-2001').pv >= L('TIC-2001').hh,
    C_GAS1_PROC: procGasHigh >= 1, C_GAS_PROC: procGasHigh >= 2, C_GAS_PUMP: zone('FZ_PUMP').confirmed, C_FIRE_PROC: fireProc, C_FIRE_ER: zone('FZ_ER').confirmed,
  }
  for (const k of Object.keys(cause)) if (cause[k]) C.active[k] = true // latched until ESD reset
  C.live = cause
  for (const c of C.causes) if (C.active[c.id]) for (const e of c.effects) applyEffect(ctx, e, c)
  X.esd.level = X.esd.active.APS ? 'APS' : X.esd.active.ESD1 ? 'ESD1' : X.esd.active.ESD2 ? 'ESD2' : X.esd.active.PSD3 ? 'PSD3' : null
  for (const v of X.sdv) { const trip = v.levels.some((l) => X.esd.active[l]); v.open = v.normalOpen === false ? trip : !trip }
  ctx.alarm('S05', 'ESD_ACTIVE', `${X.esd.level ? ESD_LEVELS.find((e) => e.id === X.esd.level).name : ''} active`, 'critical', !!X.esd.level)
  // health and redundancy
  for (const h of X.health.items) {
    ctx.alarm('S05', `HLT_${h.id}`, `ICSS health: ${h.name} failed`, h.group === 'Controllers' || h.group === 'Network' ? 'high' : 'low', h.state === 'failed')
    if (h.pair && h.state === 'failed') { const o = X.health.items.find((x) => x.id === h.pair); if (o && o.state === 'backup') { o.state = 'primary'; ctx.event('S05', `${o.name} took over (redundancy switchover)`, 'high') } }
  }
  const lost = X.health.items.some((h) => h.state === 'failed' && (h.pair || h.group === 'Network'))
  ctx.alarm('S05', 'ICSS_RED', 'Controller or network redundancy lost', 'high', lost)
  X.degraded = lost
}

function applyEffect(ctx, e, cause) {
  const { state } = ctx
  const X = state.icss
  const mark = (lvl) => { if (!X.esd.active[lvl]) { X.esd.active[lvl] = true; X.esd.t = state.t; ctx.event('S05', `${lvl} initiated by ${cause.name}`, 'critical') } }
  const first = !X.ce.fired[e]
  X.ce.fired[e] = true
  switch (e) {
    case 'E_PSD3': mark('PSD3'); break
    case 'E_ESD2': mark('ESD2'); break
    case 'E_ESD1': mark('ESD1'); mark('ESD2'); break
    case 'E_BDV': break
    case 'E_CARGO': if (first) for (const d of Object.values(state.drives)) if ((d.kind === 'cargo' || d.kind === 'ballast') && d.run) { d.run = false; ctx.event('S04', `${d.tag} stopped by ICSS (${cause.name})`, 'high') } break
    case 'E_IGG': if (first && state.igg && !['stopped', 'shutdown'].includes(state.igg.state)) { state.igg.state = 'stopped'; ctx.event('S11', 'IGG stopped by ICSS ESD', 'high') } break
    case 'E_BLR': if (first) for (const b of state.boilers || []) if (!['off', 'lockout'].includes(b.bms)) { b.bms = 'lockout'; b.timer = 0; b.lockout = true; b.firstOut = 'ESD fuel trip (ICSS)'; b.mainValve = false; ctx.event('S10', `${b.tag} fuel tripped by ICSS ESD`, 'critical') } break
    case 'E_CAM': if (first) { const zoneIds = cause.id.includes('PUMP') ? ['R_PUMP'] : ['R_PROC_DECK', 'R_TURRET']; ctx.command('cctv.callup', { rooms: zoneIds, reason: cause.name }) } break
    case 'E_PAGA_GAS': if (first) { const rooms = cause.id.includes('PUMP') ? ['R_PUMP'] : ['R_PROC_DECK', 'R_TURRET']; const zones = state.paga.zones.filter((z) => rooms.includes(z.room)).map((z) => z.id); ctx.command('paga.tone', { tone: 'gas', source: 'ICSS F&G', zones: zones.length ? zones : undefined }) } break
    case 'E_PAGA_GA': if (first) ctx.command('paga.tone', { tone: 'general', source: 'ICSS ESD' }); break
    case 'E_PAGA_FIRE': if (first) ctx.command('paga.tone', { tone: 'fire', source: 'ICSS F&G' }); break
    case 'E_PAGA_ABN': if (first) { mark('APS'); ctx.command('paga.tone', { tone: 'abandon', source: 'ICSS APS' }) } break
    case 'E_DAMP': if (first) ctx.event('S05', `Fire dampers closed and ventilation stopped (${cause.name})`, 'high'); break
  }
}

export function icssCommands(ctx) {
  const { state } = ctx
  const X = () => state.icss
  const Lp = (tag) => X().loops.find((l) => l.tag === tag || l.pvTag === tag)
  return {
    'icss.sp': ({ tag, sp }) => { const L = Lp(tag); if (!L) return false; L.sp = Number(sp); return true },
    'icss.mode': ({ tag, mode }) => { const L = Lp(tag); if (!L || !['AUTO', 'MAN'].includes(mode)) return false; if (mode === 'AUTO' && L.fieldFault) return false; L.pid.mode = mode; return true },
    'icss.out': ({ tag, out }) => { const L = Lp(tag); if (!L || L.pid.mode !== 'MAN') return false; L.pid.out = clamp(Number(out), 0, 100); return true },
    'icss.disturb': ({ tag, value }) => { const L = Lp(tag); if (!L) return false; L.dist = Number(value); return true },
    'icss.field_fault': ({ tag, on = true }) => { const L = Lp(tag); if (!L) return false; L.fieldFault = !!on; return true },
    'icss.manual': ({ cause }) => { const c = X().ce.causes.find((x) => x.id === cause); if (!c) return false; X().ce.active[cause] = true; ctx.event('S05', `Manual initiation: ${c.name}`, 'critical'); return true },
    'icss.detector': ({ id, value, ramp, fault }) => {
      const d = X().fg.detectors.find((x) => x.id === id); if (!d) return false
      if (value != null) d.value = clamp(Number(value), 0, 100)
      if (ramp != null) d.ramp = Number(ramp)
      if (fault != null) d.fault = !!fault
      ctx.event('S05', `Detector ${id}: ${fault ? 'fault' : `${d.type === 'GD' ? `${d.value.toFixed(0)} % LEL` : d.value >= 50 ? 'alarm' : 'normal'}${d.ramp ? ' rising' : ''}`}`)
      return true
    },
    'icss.inhibit': ({ zone, on }) => { const z = X().fg.zones.find((x) => x.id === zone); if (!z) return false; z.inhibited = !!on; ctx.event('S05', `F&G zone ${z.name} ${on ? 'INHIBITED (override)' : 'override removed'}`, 'high'); return true },
    'icss.esd_reset': () => {
      const x = X()
      const still = x.fg.detectors.some((d) => ['high', 'alarm'].includes(d.state)) || Object.values(x.ce.live || {}).some(Boolean)
      if (still) { ctx.event('S05', 'ESD reset refused: initiating cause still present', 'low'); return false }
      x.esd.active = {}; x.ce.active = {}; x.ce.fired = {}; x.esd.level = null
      ctx.event('S05', 'ESD reset by operator (valves reopened per procedure)')
      return true
    },
    'icss.health': ({ id, state: st }) => { const h = X().health.items.find((x) => x.id === id); if (!h) return false; h.state = st === 'ok' && h.pair ? 'backup' : st; ctx.event('S05', `${h.name}: ${st}`, st === 'failed' ? 'high' : 'low'); return true },
    'icss.bilge': ({ on }) => { X().bilgeFault = !!on; return true },
  }
}
