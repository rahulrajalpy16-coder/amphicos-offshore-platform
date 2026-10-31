// Scenario library: normal, alarm, failure, recovery and legacy vs retrofit demonstrations per module.
// Every database demo scenario (systems[].demo_scenarios) is mapped to an executable scenario here
// (DB_MAP), with keyword matching as a fallback for scenarios added later.
// EDUCATIONAL SIMULATION: scenarios illustrate concepts, they are not operating procedures.

import { setTimeoutSim } from './relays.js'
import { breakerTrip } from './electrical.js'
import { pumpPoint, valveForFlow } from './drives.js'

const gensOn = (s) => s.pms.priority.map((id) => s.gens[id]).filter((g) => g.online)
const firstOnline = (s) => gensOn(s)[0]
const firstStopped = (s) => s.pms.priority.map((id) => s.gens[id]).find((g) => !g.online && g.engine === 'stopped')
const relayWith = (s, ansi, kind) => Object.values(s.relays).find((r) => (!kind || r.kind === kind) && r.functions.some((f) => f.ansi === ansi && f.supported))
const drive = (s, re) => Object.values(s.drives).find((d) => re.test(`${d.id} ${d.name}`))
const runningDrive = (s) => Object.values(s.drives).find((d) => d.run) || Object.values(s.drives)[0]
const at = (ctx, t, fn) => setTimeoutSim(ctx.state, t, fn)
const ev = (ctx, sys, text) => ctx.event(sys, `Scenario: ${text}`, 'low')
const genFromText = (s, text) => { const m = /\bD?G\s*-?(\d)\b/i.exec(text || ''); return m ? s.gens[`G${m[1]}`] : null }
// put the IGG on line delivering to deck (offloading needs inert gas); blower feeder closed directly
export function iggOnLine(ctx, load = 85) {
  const s = ctx.state, I = s.igg, C = s.iggCfg
  const f = s.feeders.F_IGG_BLW1
  if (f && s.breakers[f.breaker]) s.breakers[f.breaker].state = 'closed'
  Object.assign(I, { state: 'delivering', burner: true, blower: true, sw_pump: true, flame: 90, load, o2: C.o2_sp, o2_reading: C.o2_sp, sw_flow: C.sw_nom, vent: false, regValve: true, gasT: C.t_normal - 4, timer: 30 })
}

export const LIBRARY = [
  // ---------- S01 DG control retrofit ----------
  { id: 'dgctrl_start_sync', sys: ['S01', 'S02', 'S15', 'S14'], name: 'Start and synchronise the standby set', re: /start.*sync|synchron/i,
    run: (ctx, d) => { const s = ctx.state; s.pms.mode = 'semi'; const g = (genFromText(s, d?.name) && !genFromText(s, d?.name).online ? genFromText(s, d?.name) : null) || firstStopped(s); if (g) { ev(ctx, 'S01', `${g.id} start from its generator control panel; PMS in SEMI-AUTO synchronises and shares load`); ctx.command('gen.start', { id: g.id, by: `GCP ${g.id}` }); g.syncPending = true; g.gov.fref = s.nominal.f_hz * 1.004 } } },
  { id: 'dgctrl_sharing_drift', sys: ['S01', 'S15'], name: 'Load sharing drift (legacy analogue) vs digital sharing (retrofit)', re: /shar.*drift|drift/i,
    run: (ctx) => { const s = ctx.state; ctx.command('variant.set', { systemId: 'S01', variant: 'legacy' }); const on = gensOn(s); on.forEach((g) => ctx.command('gov.mode', { id: g.id, mode: 'droop' })); if (on[0]) at(ctx, 2, () => { on[0].gov.fref += 0.35; ev(ctx, 'S01', `${on[0].id} analogue load sharing module drifts: speed bias offset (legacy view). Switch to RETROFIT to see digital sharing restore equal kW`) }) } },
  { id: 'dgctrl_sync_fail', sys: ['S01', 'S02', 'S15'], name: 'Synchronising failure: governor not responding to speed bias', re: /sync.*fail|time.?out/i,
    run: (ctx) => { const s = ctx.state; const g = firstStopped(s); if (!g) return; g.faults.gov_bias = true; ev(ctx, 'S01', `${g.id} governor speed bias input faulty; set started for synchronising`); ctx.command('gen.start', { id: g.id, by: 'PMS' }); g.syncPending = true } },
  { id: 'dgctrl_comm', sys: ['S01', 'S02'], name: 'Generator controller communication loss to PMS', re: /communication|comm/i,
    run: (ctx) => { const g = firstStopped(ctx.state); if (g) at(ctx, 2, () => ctx.command('fault.inject', { target: g.id, kind: 'gcp_comm' })) } },
  // ---------- S02 PMS ----------
  { id: 'pms_normal', sys: ['S02', 'S01'], name: 'Normal production: two sets in isochronous load sharing', re: /^normal/i, run: () => {} },
  { id: 'pms_offload', sys: ['S02', 'S04'], name: 'Offloading load increase: cargo pumps request permission, PMS starts the standby set', re: /offload|load increase|rising/i,
    run: (ctx) => { const s = ctx.state; iggOnLine(ctx); const cps = Object.values(s.feeders).filter((f) => f.heavy && f.drive); at(ctx, 2, () => { ev(ctx, 'S02', 'CCR requests cargo pump 1 start'); if (cps[0]) ctx.command('drive.start', { id: cps[0].drive, by: 'CCR' }) }); at(ctx, 5, () => { ev(ctx, 'S02', 'CCR requests cargo pump 2 start'); if (cps[1]) ctx.command('drive.start', { id: cps[1].drive, by: 'CCR' }) }) } },
  { id: 'pms_gen_trip', sys: ['S02', 'S03'], name: 'Generator trip during offloading and load shedding', re: /trip.*shed|generator trip|shed/i, loadCase: 'LC_OFFLOAD',
    run: (ctx, d) => { const s = ctx.state; const kw = Math.max(0, 0.7 * s.pms.cap_kw - s.pms.load_kw); s.loadRamp = { kw, t0: s.t - 10, T: 1 }; ev(ctx, 'S02', `offloading at high rate: additional aggregated consumers ${Math.round(kw)} kW bring the plant to about 70 % of three sets (educational)`); at(ctx, 8, () => { const g = genFromText(s, (d?.steps || []).join(' ')) || firstOnline(s); if (g && g.online) { g.faults.winding = true; ev(ctx, 'S02', `internal fault on ${g.id}: generator differential protection trips the set`) } }) } },
  { id: 'pms_blackout', sys: ['S02'], name: 'Blackout and automatic recovery', re: /black|dead bus/i,
    run: (ctx) => { at(ctx, 3, () => { ev(ctx, 'S02', 'simulated blackout: all generator breakers trip (common trip signal, educational)'); for (const g of gensOn(ctx.state)) breakerTrip(ctx, g.breaker, 'simulated common trip (blackout scenario)', false) }) } },
  { id: 'pms_sync_manual', sys: ['S02', 'S01'], name: 'Manual synchronising with the check-sync relay', re: /manual sync/i,
    run: (ctx) => { const s = ctx.state; s.pms.mode = 'manual'; const g = firstStopped(s); if (g) { ctx.command('gen.start', { id: g.id }); g.gov.fref = s.nominal.f_hz * 1.006; at(ctx, 16, () => ctx.command('sync.select', { gen: g.id, mode: 'manual' })) } } },
  { id: 'pms_legacy', sys: ['S02', 'S01'], name: 'Legacy hardwired PMS vs retrofit: generator trip during offloading', re: /legacy|retrofit|compar/i, loadCase: 'LC_OFFLOAD',
    run: (ctx) => { const s = ctx.state; ctx.command('variant.set', { systemId: 'S02', variant: 'legacy' }); s.loadRamp = { kw: Math.max(0, 0.7 * s.pms.cap_kw - s.pms.load_kw), t0: s.t - 10, T: 1 }; at(ctx, 8, () => { const g = firstOnline(s); if (g) g.faults.winding = true }) } },
  { id: 'pms_controller', sys: ['S02'], name: 'PMS controller failure: hot standby takes over', re: /controller|redundan/i, run: (ctx) => at(ctx, 2, () => ctx.command('pms.controller', { id: 'A', ok: false })) },
  // ---------- S03 relays ----------
  { id: 'relay_injection', sys: ['S03'], name: 'Secondary injection test of the IDMT overcurrent element', re: /inject|calibrat/i,
    run: (ctx, d) => { const s = ctx.state; const g = genFromText(s, d?.description) ; const r = (g && Object.values(s.relays).find((x) => x.protects === g.id)) || relayWith(s, '51'); if (!r) return; const fn = r.functions.find((f) => f.curve.kind === 'idmt'); ctx.command('relay.test', { relay: r.id, on: true }); at(ctx, 1, () => ctx.command('relay.inject', { relay: r.id, ansi: fn.ansi, multiple: 2 })) } },
  { id: 'relay_reverse_power', sys: ['S03', 'S15', 'S01'], name: 'Reverse power: loss of engine power makes the set motor', re: /reverse|motor/i,
    run: (ctx) => { const g = firstOnline(ctx.state); if (g) at(ctx, 2, () => { ev(ctx, 'S03', `fuel limit / actuator failure on ${g.id}`); ctx.command('fault.inject', { target: g.id, kind: 'gov_actuator' }) }) } },
  { id: 'relay_discrimination', sys: ['S03', 'S02'], name: 'Feeder fault and discrimination: feeder relay trips before generator relays', re: /discrimin|feeder fault/i,
    run: (ctx) => { const s = ctx.state; const r = Object.values(s.relays).find((x) => x.kind === 'feeder' && s.feeders[x.protects]?.to_bus && s.breakers[x.breaker]?.state === 'closed') || Object.values(s.relays).find((x) => x.kind === 'feeder'); if (r) at(ctx, 2, () => { ev(ctx, 'S03', `phase fault applied on ${s.feeders[r.protects].name}`); ctx.command('fault.inject', { target: r.protects, kind: 'overcurrent', multiple: 4 }) }) } },
  { id: 'relay_earth_fault', sys: ['S03'], name: 'Earth fault on a feeder with a high resistance earthed system', re: /earth/i,
    run: (ctx) => { const s = ctx.state; const r = Object.values(s.relays).find((x) => x.kind === 'feeder' && !s.feeders[x.protects].to_bus && s.breakers[x.breaker]?.state === 'closed') || Object.values(s.relays).find((x) => x.kind === 'feeder'); if (r) at(ctx, 2, () => ctx.command('fault.inject', { target: r.protects, kind: 'earth' })) } },
  { id: 'relay_legacy', sys: ['S03'], name: 'Legacy electromechanical relay calibration check', re: /legacy|electromech|retrofit/i,
    run: (ctx) => { ctx.command('variant.set', { systemId: 'S03', variant: 'legacy' }); const r = relayWith(ctx.state, '51'); if (!r) return; ctx.command('relay.test', { relay: r.id, on: true }); at(ctx, 1, () => ctx.command('relay.inject', { relay: r.id, ansi: '51', multiple: 3 })) } },
  { id: 'relay_watchdog', sys: ['S03'], name: 'Relay internal fault (watchdog) and trip circuit supervision', re: /watchdog|internal|supervision/i,
    run: (ctx) => { const r = Object.values(ctx.state.relays)[0]; at(ctx, 2, () => ctx.command('relay.fault', { relay: r.id, kind: 'tcs', on: true })) } },
  // ---------- S04 drives ----------
  { id: 'drive_cp_start', sys: ['S04', 'S02'], name: 'Cargo pump start with PMS permission and speed ramp', re: /permission|cargo pump start/i,
    run: (ctx) => { iggOnLine(ctx); const d = drive(ctx.state, /CP1|cargo/i); if (d) at(ctx, 2, () => { ev(ctx, 'S04', `start request for ${d.tag} from the CCR`); ctx.command('drive.start', { id: d.id, by: 'CCR' }) }) } },
  { id: 'drive_jam', sys: ['S04'], name: 'Drive trip on overcurrent and fault log', re: /overcurrent|jam/i,
    run: (ctx) => { const d = runningDrive(ctx.state); at(ctx, 2, () => ctx.command('fault.inject', { target: d.id, kind: 'jam' })); at(ctx, 8, () => ctx.command('fault.clear', { target: d.id, kind: 'jam' })) } },
  { id: 'drive_legacy', sys: ['S04'], name: 'Throttling (legacy) vs speed control (retrofit) for the same flow', re: /throttl|legacy/i,
    run: (ctx) => { const d = runningDrive(ctx.state); ctx.command('drive.ref', { id: d.id, ref: 80 }); at(ctx, 10, () => { ctx.command('variant.set', { systemId: 'S04', variant: 'legacy' }); const q = pumpPoint(d.pump, 0.8).Q; ctx.command('drive.valve', { id: d.id, pct: valveForFlow(d.pump, q) }); ev(ctx, 'S04', `legacy view: full speed, discharge valve throttled to the same flow (${Math.round(q)} m3/h)`) }) } },
  { id: 'drive_fan', sys: ['S04'], name: 'Cooling fan failure: heatsink overtemperature', re: /fan|temperature/i, run: (ctx) => ctx.command('fault.inject', { target: runningDrive(ctx.state).id, kind: 'fan' }) },
  { id: 'drive_dcuv', sys: ['S04'], name: 'Supply dip: DC link undervoltage trip', re: /undervolt|dc link/i, run: (ctx) => at(ctx, 2, () => ctx.command('fault.inject', { target: runningDrive(ctx.state).id, kind: 'dc_uv' })) },
  // ---------- S05 ICSS ----------
  { id: 'icss_gas', sys: ['S05', 'S06', 'S09'], name: 'Gas detection on the process deck: low, high, confirmed 2oo3', re: /gas detect|gas/i,
    run: (ctx) => { at(ctx, 1, () => ctx.command('icss.detector', { id: 'GD-3001', ramp: 4 })); at(ctx, 14, () => ctx.command('icss.detector', { id: 'GD-3003', ramp: 5 })) } },
  { id: 'icss_pahh', sys: ['S05'], name: 'Separator high pressure: PAH alarm then PAHH unit shutdown', re: /pressure trip|PAHH|high pressure/i,
    run: (ctx) => { at(ctx, 1, () => ctx.command('icss.mode', { tag: 'PIC-1001', mode: 'MAN' })); at(ctx, 1.2, () => ctx.command('icss.out', { tag: 'PIC-1001', out: 10 })) } },
  { id: 'icss_legacy', sys: ['S05'], name: 'Legacy console vs migrated high performance HMI', re: /legacy|console|migrat/i, run: (ctx) => ctx.command('variant.set', { systemId: 'S05', variant: 'legacy' }) },
  { id: 'icss_fire_er', sys: ['S05', 'S06'], name: 'Engine room fire confirmed: dampers and PAGA fire tone', re: /fire/i,
    run: (ctx) => { at(ctx, 2, () => ctx.command('icss.detector', { id: 'FD-ER-01', value: 100 })); at(ctx, 6, () => ctx.command('icss.detector', { id: 'FD-ER-02', value: 100 })) } },
  { id: 'icss_ctrl_fail', sys: ['S05'], name: 'Controller failure and redundancy switchover', re: /redund|controller/i,
    run: (ctx) => { const h = ctx.state.icss.health.items.find((x) => x.pair && x.state === 'primary'); if (h) at(ctx, 2, () => ctx.command('icss.health', { id: h.id, state: 'failed' })) } },
  { id: 'icss_esd1', sys: ['S05'], name: 'Manual ESD-1 from the CCR', re: /ESD-?1|manual ESD/i, run: (ctx) => at(ctx, 2, () => ctx.command('icss.manual', { cause: 'C_MAN_ESD1' })) },
  { id: 'icss_field_fault', sys: ['S05'], name: 'Field device fault (open loop) on LT-1002', re: /field|open loop/i, run: (ctx) => at(ctx, 2, () => ctx.command('icss.field_fault', { tag: 'LT-1002', on: true })) },
  // ---------- S06 PAGA ----------
  { id: 'paga_general', sys: ['S06'], name: 'General alarm from the CCR access panel', re: /general alarm|GA/i, run: (ctx) => at(ctx, 1, () => ctx.command('paga.tone', { tone: 'general', source: 'CCR access panel' })) },
  { id: 'paga_loop', sys: ['S06'], name: 'Loop A line fault in the engine room: loop B keeps coverage', re: /loop|line fault/i, run: (ctx) => at(ctx, 1, () => ctx.command('paga.fault', { room: 'R_ER_GEN', loop: 'A', kind: 'open' })) },
  { id: 'paga_gas', sys: ['S06', 'S05'], name: 'Gas alarm automatic tone from ICSS F&G', re: /gas alarm|automatic tone/i,
    run: (ctx) => { at(ctx, 1, () => ctx.command('icss.detector', { id: 'GD-3001', value: 70 })); at(ctx, 3, () => ctx.command('icss.detector', { id: 'GD-3004', value: 70 })) } },
  { id: 'paga_amp', sys: ['S06'], name: 'Amplifier failure: A/B redundancy keeps coverage', re: /amplif/i, run: (ctx) => ctx.command('paga.amp', { id: ctx.state.paga.amps[0].id, ok: false }) },
  { id: 'paga_mains', sys: ['S06'], name: 'Mains failure on system B: battery operation', re: /mains|battery/i, run: (ctx) => ctx.command('paga.mains', { ok: false }) },
  // ---------- S07 PABX ----------
  { id: 'pabx_call', sys: ['S07'], name: 'Call from the engine room to the CCR', re: /call/i,
    run: (ctx) => { const X = ctx.state.pabx.extensions; const a = X.find((e) => e.room === 'R_ER_GEN') || X[0]; const b = X.find((e) => e.room === 'R_CCR') || X[1]; at(ctx, 1, () => ctx.command('pabx.dial', { from: a.ext, to: b.ext })) } },
  { id: 'pabx_page', sys: ['S07', 'S06'], name: 'Paging through PAGA with a paging code', re: /pag/i,
    run: (ctx) => { const X = ctx.state.pabx.extensions; const a = X.find((e) => e.room === 'R_CCR') || X[0]; const zi = ctx.state.paga.zones.findIndex((z) => z.room === 'R_ER_GEN'); at(ctx, 1, () => ctx.command('pabx.dial', { from: a.ext, to: `8${zi >= 0 && zi < 9 ? zi + 1 : 0}` })) } },
  { id: 'pabx_hotline', sys: ['S07'], name: 'Hotline: off-hook automatic ring', re: /hotline/i, run: (ctx) => at(ctx, 1, () => ctx.command('pabx.hotline', { index: 0 })) },
  { id: 'pabx_vsat', sys: ['S07'], name: 'External link down (VSAT)', re: /vsat|external|trunk/i, run: (ctx) => at(ctx, 1, () => ctx.command('pabx.vsat', { link: 'down' })) },
  { id: 'pabx_card', sys: ['S07'], name: 'Line card failure: Ex phones off-line', re: /card/i, run: (ctx) => at(ctx, 1, () => ctx.command('pabx.card', { id: 'LC-1', ok: false })) },
  // ---------- S08 IPTV ----------
  { id: 'iptv_dome', sys: ['S08'], name: 'Channel change and TVRO dome loss', re: /channel|dome/i,
    run: (ctx) => { const s = ctx.state.iptv.stbs[0]; if (s) at(ctx, 1, () => ctx.command('iptv.channel', { stb: s.id, ch: 2 })); at(ctx, 5, () => ctx.command('iptv.dome', { id: ctx.state.iptv.domes[0].id, locked: false })) } },
  { id: 'iptv_encoder', sys: ['S08'], name: 'Encoder failure: streams down', re: /encoder/i, run: (ctx) => at(ctx, 1, () => ctx.command('iptv.encoder', { id: 'ENC-2', ok: false })) },
  // ---------- S09 CCTV ----------
  { id: 'cctv_callup', sys: ['S09', 'S05'], name: 'Gas alarm camera call-up', re: /call-?up/i, run: (ctx) => at(ctx, 1, () => ctx.command('icss.detector', { id: 'GD-3001', value: 70 })) },
  { id: 'cctv_ptz_flare', sys: ['S09'], name: 'PTZ: turret camera to the flare tips', re: /ptz|flare/i,
    run: (ctx) => { const c = ctx.state.cctv.cameras.find((x) => x.room === 'R_TURRET' && x.ptz) || ctx.state.cctv.cameras.find((x) => x.ptz); if (!c) return; ctx.command('cctv.select', { cam: c.id }); at(ctx, 1, () => ctx.command('cctv.preset', { cam: c.id, n: 2 })) } },
  { id: 'cctv_vloss', sys: ['S09'], name: 'Camera video loss', re: /video loss/i, run: (ctx) => at(ctx, 1, () => ctx.command('cctv.fault', { cam: ctx.state.cctv.cameras[0].id, kind: 'video loss' })) },
  { id: 'cctv_nvr', sys: ['S09'], name: 'Recorder disk failure (degraded array)', re: /disk|recorder/i, run: (ctx) => at(ctx, 1, () => ctx.command('cctv.nvr', { raid: 'degraded' })) },
  // ---------- S10 boilers ----------
  { id: 'boiler_start', sys: ['S10'], name: 'Burner start sequence on the standby boiler', re: /start|sequence|purge/i,
    run: (ctx) => { const b = ctx.state.boilers.find((x) => x.bms === 'off') || ctx.state.boilers[0]; at(ctx, 1, () => ctx.command('boiler.start', { id: b.id })) } },
  { id: 'boiler_flame_failure', sys: ['S10'], name: 'Flame failure trip and post-purge', re: /flame/i, run: (ctx) => at(ctx, 3, () => ctx.command('fault.inject', { target: ctx.state.boilers[0].id, kind: 'scanner' })) },
  { id: 'boiler_low_level', sys: ['S10'], name: 'Feed pump failure: drum level low-low trip', re: /level|feed/i, run: (ctx) => at(ctx, 2, () => ctx.command('fault.inject', { target: ctx.state.boilers[0].id, kind: 'feed_pump' })) },
  { id: 'boiler_steam_step', sys: ['S10'], name: 'Steam demand step: three-element level control with shrink and swell', re: /step|swell|three/i, run: (ctx) => at(ctx, 3, () => ctx.command('boiler.demand', { pct: 75 })) },
  { id: 'boiler_legacy', sys: ['S10'], name: 'Legacy single element vs three-element level control', re: /legacy|single/i,
    run: (ctx) => { ctx.command('variant.set', { systemId: 'S10', variant: 'legacy' }); at(ctx, 3, () => ctx.command('boiler.demand', { pct: 75 })) } },
  // ---------- S11 IGG ----------
  { id: 'igg_start', sys: ['S11'], name: 'IGG start, venting until O2 is low, then delivery to deck', re: /start|deliver/i, run: (ctx) => at(ctx, 1, () => ctx.command('igg.start')) },
  { id: 'igg_high_o2', sys: ['S11'], name: 'High oxygen: automatic venting and delivery stopped', re: /oxygen|O2/i,
    run: (ctx) => { iggOnLine(ctx, 40); at(ctx, 4, () => ctx.command('fault.inject', { target: 'igg', kind: 'lean' })) } },
  { id: 'igg_low_pressure', sys: ['S11', 'S04'], name: 'Low IG main pressure during offloading: cargo pump interlock', re: /low.*pressure|IG main/i, loadCase: 'LC_OFFLOAD',
    run: (ctx) => { const I = ctx.state.igg, C = ctx.state.iggCfg; iggOnLine(ctx, 45); I.deck_p = C.dp_low * 2.2; I.faults.derate = true; ev(ctx, 'S11', 'IGG output limited (burner derated), cargo pump rate increased'); for (const d of Object.values(ctx.state.drives)) if (d.kind === 'cargo' && d.run) ctx.command('drive.ref', { id: d.id, ref: 100 }) } },
  { id: 'igg_scrubber', sys: ['S11'], name: 'Scrubber water low: IGG shutdown, regulating valve closes', re: /scrub/i,
    run: (ctx) => { iggOnLine(ctx, 40); at(ctx, 3, () => ctx.command('fault.inject', { target: 'igg', kind: 'sw_low' })) } },
  { id: 'igg_legacy', sys: ['S11'], name: 'Legacy manual changeover vs automatic O2 based delivery', re: /legacy|retrofit|compar/i, run: (ctx) => { ctx.command('variant.set', { systemId: 'S11', variant: 'legacy' }); at(ctx, 1, () => ctx.command('igg.start')) } },
  // ---------- S12 DG local ----------
  { id: 'dg_local_start', sys: ['S12', 'S01'], name: 'Local start from the local control panel', re: /local start/i,
    run: (ctx, d) => { const s = ctx.state; const named = genFromText(s, d?.description); const g = named && named.engine === 'stopped' ? named : firstStopped(s); if (!g) return; if (named && named !== g) ev(ctx, 'S12', `${named.id} is on load, so the standby set ${g.id} is used for the local start`); at(ctx, 1, () => ctx.command('gen.control', { id: g.id, location: 'local' })); at(ctx, 3, () => ctx.command('gen.start', { id: g.id, by: 'local' })) } },
  { id: 'dg_lo_pressure', sys: ['S12', 'S02'], name: 'Low lube oil pressure: alarm, shutdown, first-out', re: /lube|oil press/i, run: (ctx) => { const g = firstOnline(ctx.state); at(ctx, 2, () => ctx.command('fault.inject', { target: g.id, kind: 'lo_pressure' })) } },
  { id: 'dg_jw_high', sys: ['S12'], name: 'High HT cooling water temperature', re: /water temp|HT/i, run: (ctx) => ctx.command('fault.inject', { target: firstOnline(ctx.state).id, kind: 'jw_high' }) },
  { id: 'dg_estop', sys: ['S12'], name: 'Emergency stop at the local panel', re: /emergency/i, run: (ctx) => at(ctx, 2, () => ctx.command('gen.estop', { id: firstOnline(ctx.state).id, on: true })) },
  { id: 'dg_fail_start', sys: ['S12', 'S02'], name: 'Start failure: PMS raises the alarm', re: /fail.*start|start fail/i, run: (ctx) => { const g = firstStopped(ctx.state); if (g) { g.faults.fail_to_start = true; at(ctx, 1, () => ctx.command('gen.start', { id: g.id })) } } },
  { id: 'dg_misfire', sys: ['S12'], name: 'Cylinder exhaust temperature deviation', re: /exhaust|cylinder/i, run: (ctx) => ctx.command('fault.inject', { target: firstOnline(ctx.state).id, kind: 'misfire', cyl: 3 }) },
  // ---------- S13 OMD ----------
  { id: 'omd_hotspot', sys: ['S13', 'S12', 'S02'], name: 'Bearing overheating: deviation, high alarm, shutdown, standby start', re: /bearing|hot ?spot|overheat/i,
    run: (ctx, d) => { const s = ctx.state; const g = genFromText(s, d?.name) || firstOnline(s); const m = /compartment\s*(\d+)|head\s*(\d+)/i.exec(`${d?.name || ''} ${(d?.steps || []).join(' ')}`); const idx = m ? Number(m[1] || m[2]) - 1 : 3; at(ctx, 1, () => ctx.command('omd.hotspot', { gen: g.id, idx, rate: 0.05 })) } },
  { id: 'omd_sensor_fault', sys: ['S13'], name: 'OMD head sensor fault', re: /sensor|fault/i, run: (ctx) => ctx.command('omd.sensor_fault', { gen: firstOnline(ctx.state).id, idx: 1, on: true }) },
  { id: 'omd_test', sys: ['S13'], name: 'Functional test with test fluid (shutdown output inhibited)', re: /test|smoke|fluid/i, run: (ctx) => ctx.command('omd.test', { gen: firstOnline(ctx.state).id, idx: 0, inhibit: true }) },
  { id: 'omd_legacy', sys: ['S13'], name: 'Legacy single sensor scanning vs one head per compartment', re: /legacy|scan|retrofit/i,
    run: (ctx) => { ctx.command('variant.set', { systemId: 'S13', variant: 'legacy' }); ctx.command('omd.hotspot', { gen: firstOnline(ctx.state).id, idx: 4, rate: 0.05 }) } },
  // ---------- S14 AVR ----------
  { id: 'avr_load_step', sys: ['S14'], name: 'Large motor start: voltage dip and AVR recovery', re: /load step|dip|motor start/i,
    run: (ctx) => { const g = firstOnline(ctx.state); at(ctx, 2, () => { ev(ctx, 'S14', 'large DOL motor start represented as a 1200 kW motor load on the bus (the real cargo pumps are VFD driven and limit the dip)'); ctx.command('test.load_step', { bus: g.bus, kw: 1200, motor: true }) }); at(ctx, 14, () => ctx.command('test.load_clear')) } },
  { id: 'avr_reactive', sys: ['S14'], name: 'kvar sharing: unequal droop, imbalance, restore', re: /kvar|reactive|droop/i,
    run: (ctx) => { const s = ctx.state; s.pms.mode = 'manual'; const on = gensOn(s); at(ctx, 2, () => { if (on[0]) { ctx.command('avr.droop', { id: on[0].id, pct: 1 }); ctx.command('avr.setpoint', { id: on[0].id, delta: on[0].vn_kv * 0.012 }) } }); at(ctx, 25, () => { if (on[0]) { ctx.command('avr.droop', { id: on[0].id, pct: 4 }); ctx.command('avr.setpoint', { id: on[0].id, value: on[0].vn_kv }); ctx.command('pms.mode', { mode: 'auto' }) } }) } },
  { id: 'avr_sensing_loss', sys: ['S14'], name: 'Loss of voltage sensing: legacy over-excitation vs digital FCR transfer', re: /sens/i, run: (ctx) => at(ctx, 2, () => ctx.command('fault.inject', { target: firstOnline(ctx.state).id, kind: 'avr_sensing' })) },
  { id: 'avr_legacy', sys: ['S14'], name: 'Legacy analogue AVR card vs digital AVR', re: /legacy|analog|retrofit/i, run: (ctx) => ctx.command('variant.set', { systemId: 'S14', variant: 'legacy' }) },
  // ---------- S15 governor ----------
  { id: 'gov_droop', sys: ['S15'], name: 'Load step: droop vs isochronous', re: /droop|isoch/i,
    run: (ctx) => { const s = ctx.state; s.pms.mode = 'manual'; const on = gensOn(s); at(ctx, 1, () => on.forEach((g) => ctx.command('gov.mode', { id: g.id, mode: 'droop' }))); at(ctx, 4, () => ctx.command('test.load_step', { bus: on[0].bus, kw: 1500 })); at(ctx, 22, () => { ev(ctx, 'S15', 'governors switched to isochronous load sharing'); on.forEach((g) => ctx.command('gov.mode', { id: g.id, mode: 'isoch' })) }); at(ctx, 40, () => { ctx.command('test.load_clear'); ctx.command('pms.mode', { mode: 'auto' }) }) } },
  { id: 'gov_load_step', sys: ['S15'], name: 'Load step: frequency dip and recovery (isochronous)', re: /frequency dip/i, run: (ctx) => { const g = firstOnline(ctx.state); at(ctx, 2, () => ctx.command('test.load_step', { bus: g.bus, kw: 1500 })); at(ctx, 20, () => ctx.command('test.load_clear')) } },
  { id: 'gov_pickup', sys: ['S15', 'S12'], name: 'Speed pickup failure', re: /pickup|MPU/i, run: (ctx) => at(ctx, 2, () => ctx.command('fault.inject', { target: firstOnline(ctx.state).id, kind: 'pickup' })) },
  { id: 'gov_actuator', sys: ['S15', 'S03'], name: 'Actuator failure to minimum fuel', re: /actuator/i, run: (ctx) => at(ctx, 2, () => ctx.command('fault.inject', { target: firstOnline(ctx.state).id, kind: 'gov_actuator' })) },
  { id: 'gov_legacy', sys: ['S15'], name: 'Legacy mechanical-hydraulic governor vs digital speed controller', re: /legacy|mechanical|retrofit/i, run: (ctx) => ctx.command('variant.set', { systemId: 'S15', variant: 'legacy' }) },
]

// explicit mapping of the database demo scenarios to executable scenarios
export const DB_MAP = {
  'S01-D1': 'dgctrl_start_sync', 'S01-D2': 'dgctrl_sharing_drift', 'S01-D3': 'dgctrl_sync_fail',
  'S02-D1': 'pms_offload', 'S02-D2': 'pms_gen_trip', 'S02-D3': 'pms_blackout',
  'S03-D1': 'relay_injection', 'S03-D2': 'relay_reverse_power', 'S03-D3': 'relay_discrimination',
  'S04-D1': 'drive_cp_start', 'S04-D2': 'drive_jam', 'S04-D3': 'drive_legacy',
  'S05-D1': 'icss_gas', 'S05-D2': 'icss_pahh', 'S05-D3': 'icss_legacy',
  'S06-D1': 'paga_general', 'S06-D2': 'paga_loop', 'S06-D3': 'paga_gas',
  'S07-D1': 'pabx_call', 'S07-D2': 'pabx_page', 'S08-D1': 'iptv_dome', 'S09-D1': 'cctv_callup', 'S09-D2': 'cctv_ptz_flare',
  'S10-D1': 'boiler_start', 'S10-D2': 'boiler_flame_failure', 'S11-D1': 'igg_start', 'S11-D2': 'igg_high_o2', 'S11-D3': 'igg_low_pressure',
  'S12-D1': 'dg_local_start', 'S12-D2': 'dg_lo_pressure', 'S13-D1': 'omd_hotspot', 'S14-D1': 'avr_load_step', 'S14-D2': 'avr_reactive',
  'S15-D1': 'gov_droop', 'S15-D2': 'gov_pickup',
}

export function listScenarios(db) {
  const out = {}
  for (const s of db.systems || []) {
    const own = LIBRARY.filter((x) => x.sys.includes(s.id))
    const fromDb = (s.demo_scenarios || []).map((d) => {
      const m = (DB_MAP[d.id] && LIBRARY.find((x) => x.id === DB_MAP[d.id])) || own.find((x) => x.re.test(`${d.name || ''}`)) || own.find((x) => x.re.test(`${d.description || ''}`))
      return { id: d.id, name: d.name, description: d.description, steps: d.steps || [], runs: m ? m.id : null, source: 'db' }
    })
    const used = new Set(fromDb.map((d) => d.runs))
    out[s.id] = { db: fromDb, library: own.filter((x) => !used.has(x.id) && x.sys[0] === s.id).map((x) => ({ id: x.id, name: x.name })) }
  }
  return out
}

export function establishNormal(ctx, loadCaseId) {
  const { state, db } = ctx
  const fn = state.nominal.f_hz
  const el = db.electrical || {}
  const lc = (el.load_cases || []).find((l) => l.id === loadCaseId) || (el.load_cases || [])[0] || null
  const running = lc ? new Set(lc.running_feeders) : null
  state.loadCase = lc ? { id: lc.id, name: lc.name, total_kw: lc.total_kw, generators_online_expected: lc.generators_online_expected } : null
  for (const b of Object.values(state.breakers)) {
    if (b.kind === 'generator') continue
    if (b.kind === 'tie' || b.kind === 'incomer') { b.state = b.normally === 'open' ? 'open' : 'closed'; continue }
    const f = state.feeders[b.to] || state.feeders[b.from]
    if (!f) { b.state = b.normally === 'open' ? 'open' : 'closed'; continue }
    const run = running ? running.has(f.id) : f.running_default
    if (f.to_bus) b.state = 'closed'
    else if (f.kind === 'vfd') b.state = run || b.normally === 'closed' ? 'closed' : 'open'
    else b.state = run ? 'closed' : 'open'
  }
  for (const d of Object.values(state.drives)) {
    const f = state.feeders[d.feeder]
    const run = f ? (running ? running.has(f.id) : f.running_default) : false
    d.run = run; d.ref = run ? 100 : d.ref; d.speed = run ? 100 : 0; d.dc_v = d.dc_nom; d.precharged = true
  }
  const gens = state.genOrder.map((id) => state.gens[id])
  let online = gens.filter((g) => state.breakers[g.breaker]?.normally === 'closed')
  const want = lc?.generators_online_expected || state.pms.settings.min_running
  if (online.length !== want) {
    const order = state.pms.priority.map((id) => state.gens[id])
    online = order.slice(0, Math.max(1, Math.min(want, gens.length)))
  }
  const est = lc?.total_kw || Object.values(state.feeders).reduce((a, f) => a + (state.breakers[f.breaker]?.state === 'closed' && !f.to_bus ? f.rated_kw : 0), 0)
  const share = Math.min(1, est / online.reduce((a, g) => a + g.rating_kw, 0))
  online.forEach((g) => {
    Object.assign(g, { engine: 'running', engineTimer: 60, f_hz: fn, speed_rpm: g.rpm_rated, v_kv: g.vn_kv, online: true, ready: true, pm_kw: share * g.rating_kw })
    g.avr.excitation = true; g.gov.ramp = 1.1; g.gov.fref = fn
    const br = state.breakers[g.breaker]; if (br) br.state = 'closed'
    const e = state.engines[g.id]
    if (e) normalEngine(state, e, share)
  })
  for (const g of gens) if (!online.includes(g)) { const br = state.breakers[g.breaker]; if (br) br.state = 'open' }
  for (const B of state.boilers || []) if (B.duty) {
    const C = B.cfg
    const steam = (state.steamDemand ?? 0.45) * C.max_tph
    const valve = (100 * steam) / (C.max_tph * 1.3)
    Object.assign(B, { bms: 'modulating', flame: 85, firing: 45, fanOn: true, mainValve: true, fo_p: C.fo_nom, steam_p: C.p_sp, steam, feed: steam, fw_sp: steam, fw_valve: valve, o2: 3 })
    B.pidP.out = 45; B.pidP.i = 45; B.pidF.out = valve; B.pidF.i = valve; B.pidL1.out = valve; B.pidL1.i = valve
  }
  if (running && running.has('F_IGG_BLW1')) iggOnLine(ctx)
  state.loadScale = 1
}

function normalEngine(state, e, load) {
  const L = state.engineLimits
  Object.assign(e, { lo_p: L.lo_p.nominal ?? 4.5, lo_t: 72, jw_t: L.jw_t.nominal ?? 88, jw_p: 3.1, ca_p: 0.1 + 2.6 * Math.pow(load, 1.2), ca_t: 44, tc_rpm: 9000 + 21000 * load, fo_p: 7.5, inhibit: false })
  const [xlo, xhi] = L.exh.normal
  e.exh = e.exh.map((t, i) => xlo - 40 + (xhi - xlo + 40) * Math.min(1, load) + e.exhOff[i])
  e.jw_t = L.jw_t.normal[0] + (L.jw_t.normal[1] - L.jw_t.normal[0]) * Math.min(1, load)
}

export function scenarioCommands(ctx, api) {
  return {
    'scenario.run': ({ id, keepState = false }) => {
      let def = LIBRARY.find((x) => x.id === id)
      let dbScen = null
      if (!def) {
        for (const s of ctx.db.systems || []) {
          const d = (s.demo_scenarios || []).find((q) => q.id === id)
          if (d) { dbScen = d; const L = listScenarios(ctx.db)[s.id].db.find((q) => q.id === id); def = LIBRARY.find((x) => x.id === L?.runs); break }
        }
      }
      if (!def) return false
      if (!keepState) api.reset(def.loadCase)
      const s = ctx.state
      s.scenario = { id: def.id, dbId: dbScen ? dbScen.id : null, name: dbScen ? dbScen.name : def.name, t0: s.t, systems: def.sys, steps: dbScen?.steps || [], loadCase: def.loadCase || null }
      ctx.event(def.sys[0], `SCENARIO started: ${s.scenario.name} (educational simulation, not an operating procedure)`, 'low')
      def.run(ctx, dbScen)
      return true
    },
    'scenario.stop': () => { const s = ctx.state; s.scenario = null; s.loadRamp = null; return true },
    'sim.reset': ({ loadCase } = {}) => { api.reset(loadCase); return true },
    'loadcase.set': ({ id }) => { api.reset(id); return true },
  }
}
