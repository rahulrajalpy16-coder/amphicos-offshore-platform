// S11 IGG control: start sequence, mimic (combustion, scrubber, blower, O2 analyser, vent, regulating valve,
// deck water seal, IG main), O2 control with automatic venting above the db limit, shutdowns, IG main pressure
// during offloading, legacy manual changeover versus automatic O2 based delivery.
import { createFrame, h, s, btn, kv, bar, text, f0, f1, drawTrend, miniFrame } from './common/ui.js'
import { IGG_STATES } from '../sim/process.js'

export const meta = { id: 'igg', title: 'IGG control', systems: ['S11'], kind: 'hmi' }

export function mount(container, ctx) {
  const fr = createFrame(container, ctx, {
    moduleId: 'igg', systemId: 'S11', title: 'IGG: inert gas generator control',
    help: 'Cargo tanks must be kept full of inert gas (low in oxygen) so that oil vapour can never burn. The inert gas generator burns fuel, cools and cleans the gas in a scrubber and blows it to the tanks. If the oxygen content rises above the limit the gas is vented to atmosphere instead of going to the tanks.',
    alarmSystems: ['S11'],
    init: (api) => { api.o2 = [] },
    status: (st, api) => [st.igg.label, st.igg.state === 'shutdown' ? 'crit' : st.igg.state === 'autovent' ? 'high' : ''],
    tabs: [
      { id: 'mimic', label: 'IGG mimic', build: (el, api) => buildMimic(el, ctx, api) },
      { id: 'trend', label: 'O2 and pressure', build: (el, api) => buildTrend(el, ctx, api) },
    ],
  })
  const unsub = ctx.sim.subscribe('tick', (_, st) => { if (st.tick % 5) return; fr.o2.push([st.igg.o2_reading, st.igg.deck_p]); if (fr.o2.length > 360) fr.o2.shift() })
  return { unmount: () => { unsub(); fr.destroy() }, setVariant: (v) => fr.setVariant(v), frame: fr }
}

function buildMimic(el, ctx, api) {
  const { sim } = ctx
  const legacy = api.variant === 'legacy'
  const C = sim.state.iggCfg
  const svg = s('svg', { viewBox: '0 0 1100 430', role: 'img', 'aria-label': 'IGG mimic', style: { background: '#eceef0', border: '1px solid #8a8f96' } })
  const T = (x, y, t, o = {}) => { const e = s('text', { x, y, 'font-size': o.fs || 16, 'font-weight': o.w || 400, 'text-anchor': o.a || 'start', fill: '#1f2328' }, t); svg.append(e); return e }
  const pipe = (p) => svg.append(s('polyline', { points: p, fill: 'none', stroke: '#6b7178', 'stroke-width': 6 }))
  pipe('190,250 260,250'); pipe('360,170 360,110 470,110'); pipe('560,110 650,110'); pipe('730,110 800,110 800,250 860,250'); pipe('760,110 760,40'); pipe('960,250 1060,250')
  svg.append(s('rect', { x: 60, y: 190, width: 130, height: 120, rx: 10, fill: '#d4d6d9', stroke: '#2b3036', 'stroke-width': 2.5 })); T(125, 180, 'Combustion', { a: 'middle', w: 700 })
  const flame = s('path', { d: 'M125 290 C105 270 115 240 125 220 C135 240 145 270 125 290 Z', fill: '#ff9f1a' }); svg.append(flame)
  svg.append(s('rect', { x: 260, y: 170, width: 200, height: 200, rx: 10, fill: '#d4d6d9', stroke: '#2b3036', 'stroke-width': 2.5 })); T(360, 160, 'Scrubber and demister', { a: 'middle', w: 700 })
  const sw = T(280, 300, ''), gt = T(280, 325, '')
  svg.append(s('circle', { cx: 515, cy: 110, r: 42, fill: '#d4d6d9', stroke: '#2b3036', 'stroke-width': 2.5 })); T(515, 55, 'Blower', { a: 'middle', w: 700 })
  const blw = T(515, 116, '', { a: 'middle' })
  svg.append(s('rect', { x: 560, y: 170, width: 110, height: 70, rx: 6, fill: '#f4f5f6', stroke: '#2b3036', 'stroke-width': 2 })); T(615, 192, 'O2 analyser', { a: 'middle', fs: 15 })
  const o2 = T(615, 225, '', { a: 'middle', fs: 22, w: 700 })
  const valve = (x, y, tag, vertical) => { const d = vertical ? `M${x - 14} ${y - 18} L${x + 14} ${y + 18} L${x - 14} ${y + 18} L${x + 14} ${y - 18} Z` : `M${x - 18} ${y - 14} L${x + 18} ${y + 14} L${x + 18} ${y - 14} L${x - 18} ${y + 14} Z`; const v = s('path', { d, stroke: '#2b3036', 'stroke-width': 2 }); svg.append(v); if (tag) T(x + 22, y - 10, tag, { fs: 15 }); return v }
  const vVent = valve(760, 70, 'Vent (to atmosphere)', true), vReg = valve(690, 110, '')
  T(640, 145, 'Regulating valve', { fs: 15 })
  svg.append(s('rect', { x: 860, y: 210, width: 100, height: 90, rx: 6, fill: '#d4d6d9', stroke: '#2b3036', 'stroke-width': 2.5 })); T(910, 200, 'Deck water seal', { a: 'middle', w: 700 })
  const seal = s('rect', { x: 862, y: 255, width: 96, height: 43, fill: '#9aa0a6' }); svg.append(seal)
  const sealT = T(870, 320, '')
  T(860, 350, 'IG main to tanks', { w: 700 }); const dp = T(860, 380, '', { fs: 20, w: 700 }); const cargo = T(860, 405, '')
  const K = kv([['State', '', 'st'], ['O2 (analyser)', C.o2_unit, 'o2'], ['O2 high alarm and venting (db)', C.o2_unit, 'lim'], ['IG main pressure', C.dp_unit, 'dp'], ['Low pressure alarm (db)', C.dp_unit, 'dpl'], ['Scrubber water', 'm3/h', 'sw'], ['IG temperature', 'degC', 't'], ['Deck seal level', '%', 'seal'], ['IGG room O2', '%', 'room'], ['Output', '%', 'load'], ['Shutdown first-out', '', 'fo']])
  el.append(h('div', { class: 'grid', style: { gridTemplateColumns: 'minmax(0,2.6fr) minmax(15em,1fr)' } },
    h('div', { class: 'card' }, svg,
      h('div', { class: 'row', style: { marginTop: '.5em' } }, btn('START', () => sim.command('igg.start'), 'on', { 'data-act': 'igg-start' }), btn('STOP', () => sim.command('igg.stop')), btn(legacy ? 'Changeover: deliver to deck (manual)' : 'Deliver to deck', () => sim.command('igg.deliver', { on: true }), '', { 'data-act': 'deliver' }), btn('Vent', () => sim.command('igg.deliver', { on: false })), btn('RESET', () => sim.command('igg.reset'))),
      h('div', { class: 'row', style: { marginTop: '.4em' } }, h('b', {}, 'Faults:'), btn('Poor combustion (O2 rises)', () => sim.command('fault.inject', { target: 'igg', kind: 'lean' }), 'warn', { 'data-act': 'lean' }), btn('Scrubber water low', () => sim.command('fault.inject', { target: 'igg', kind: 'sw_low' })), btn('Deck seal low', () => sim.command('fault.inject', { target: 'igg', kind: 'seal_low' })), btn('Blower failure', () => sim.command('fault.inject', { target: 'igg', kind: 'blower' })), btn('Room O2 leak', () => sim.command('fault.inject', { target: 'igg', kind: 'room_leak' })), btn('Clear faults', () => ['lean', 'sw_low', 'seal_low', 'blower', 'room_leak', 'derate', 'analyser_drift', 'fuel'].forEach((k) => sim.command('fault.clear', { target: 'igg', kind: k })))),
      h('p', { class: 'note' }, legacy ? 'Legacy: after start the operator watches the O2 recorder and changes over from vent to deck by hand; high O2 still trips delivery but restart is manual.' : `Retrofit: delivery opens automatically after O2 has been below the limit for ${C.stabilise_s} s (db value ${C.stabilise_db_s} s, time compressed x ${C.timeCompression} for the demonstration). Above ${C.o2_alarm} ${C.o2_unit} the gas is vented and delivery to the tanks stops. Shutdown limits close the regulating valve.`)),
    h('div', { class: 'card' }, h('h3', {}, 'Values'), K.el, h('p', { class: 'small muted' }, `${C.capacity_note || ''}`))))
  return (st) => {
    const I = st.igg
    flame.setAttribute('opacity', (I.flame / 100).toFixed(2))
    text(sw, `water ${f0(I.sw_flow)} m3/h`); text(gt, `gas ${f0(I.gasT)} degC`)
    text(blw, I.blower ? 'ON' : 'off')
    text(o2, `${f1(I.o2_reading)} %`); o2.setAttribute('fill', I.o2_reading >= C.o2_alarm && I.burner ? '#c62828' : '#1f2328')
    vVent.setAttribute('fill', I.vent ? '#ffffff' : '#43494f'); vReg.setAttribute('fill', I.regValve ? '#ffffff' : '#43494f')
    const sl = Math.max(0, Math.min(100, I.seal_level)); seal.setAttribute('y', 298 - 0.86 * sl); seal.setAttribute('height', 0.86 * sl)
    text(sealT, `${f0(I.seal_level)} %`); text(dp, `${f0(I.deck_p)} ${C.dp_unit}`); dp.setAttribute('fill', I.deck_p < C.dp_low || I.deck_p > C.dp_high ? '#c62828' : '#1f2328'); text(cargo, `cargo discharge ${f0((st.cargoFlowPu || 0) * 100)} %`)
    K.set('st', I.label, I.state === 'shutdown' ? 'crit' : I.state === 'autovent' ? 'high' : ''); K.set('o2', f1(I.o2_reading), I.o2_reading >= C.o2_alarm && I.burner ? 'crit' : ''); K.set('lim', `> ${C.o2_alarm}`)
    K.set('dp', f0(I.deck_p), I.deck_p < C.dp_low ? 'crit' : I.deck_p > C.dp_high ? 'high' : ''); K.set('dpl', `< ${C.dp_low}`); K.set('sw', f0(I.sw_flow), I.sw_pump && I.sw_flow < C.sw_low ? 'high' : ''); K.set('t', f0(I.gasT), I.gasT > C.t_high ? 'high' : '')
    K.set('seal', f0(I.seal_level), I.seal_level < C.seal_low ? 'high' : ''); K.set('room', f1(I.room_o2), I.room_o2 < C.room_o2_alarm ? 'crit' : ''); K.set('load', f0(I.load)); K.set('fo', I.firstOut || '-', I.firstOut ? 'crit' : '')
  }
}

function buildTrend(el, ctx, api) {
  const { sim } = ctx
  const c1 = h('canvas', { style: { width: '100%', height: '14em' } }), c2 = h('canvas', { style: { width: '100%', height: '14em' } })
  el.append(h('div', { class: 'grid g2' }, h('div', { class: 'card' }, h('h3', {}, 'O2 content of inert gas, % vol (recorder)'), c1), h('div', { class: 'card' }, h('h3', {}, 'IG main pressure, mmWG'), c2)),
    h('div', { class: 'row' }, btn('Offloading: run both cargo pumps at full rate', () => { for (const d of Object.values(sim.state.drives)) if (d.kind === 'cargo') { sim.command('drive.ref', { id: d.id, ref: 100 }); sim.command('drive.start', { id: d.id, by: 'CCR' }) } }), btn('Stop cargo pumps', () => { for (const d of Object.values(sim.state.drives)) if (d.kind === 'cargo') sim.command('drive.stop', { id: d.id }) })))
  return (st) => {
    const C = st.iggCfg
    drawTrend(c1, [{ values: api.o2.map((x) => x[0]), label: 'O2' }], { min: 0, max: 21, lines: [{ v: C.o2_alarm, label: `alarm and venting ${C.o2_alarm} %` }] })
    drawTrend(c2, [{ values: api.o2.map((x) => x[1]), label: 'IG main' }], { min: 0, max: C.dp_high * 1.1, lines: [{ v: C.dp_low, label: `low ${C.dp_low}` }, { v: C.dp_high, label: `high ${C.dp_high}`, color: '#8a6400' }] })
  }
}

export function renderMini(canvas, ctx) {
  const st = ctx.sim.state
  const I = st.igg, C = st.iggCfg
  miniFrame(canvas, 'IGG', [{ k: 'State', v: I.label, alarm: I.state === 'shutdown' ? 'critical' : I.state === 'autovent' ? 'high' : null }, { k: 'O2', v: `${f1(I.o2_reading)} %`, alarm: I.o2_reading >= C.o2_alarm && I.burner ? 'critical' : null }, { k: 'IG main', v: `${f0(I.deck_p)} mmWG`, alarm: I.deck_p < C.dp_low ? 'critical' : null }, { k: 'Output', v: `${f0(I.load)} %` }], { legacy: st.variant.S11 === 'legacy' })
}
