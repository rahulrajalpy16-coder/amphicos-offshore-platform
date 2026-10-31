// S14 AVR: voltage regulation of each alternator, field current, reactive sharing, limiters, capability
// chart with the live operating point, load step response (voltage dip and recovery), parameters,
// loss of sensing fault, legacy analogue card versus digital AVR with diagnostics.
import { createFrame, h, s, btn, seg, kv, text, f0, f1, f2, f3, drawTrend, miniFrame, select, eventList } from './common/ui.js'
import { genView } from './common/views.js'

export const meta = { id: 'avr', title: 'AVR', systems: ['S14'], kind: 'hmi' }
export function snapshot(ctx, id) { return genView(ctx.sim.state, id || pickGen(ctx)) }
function pickGen(ctx) { const st = ctx.sim.state; return st.genOrder.find((id) => st.gens[id].links?.avr === ctx.componentId) || st.genOrder[0] }

export function mount(container, ctx) {
  const fr = createFrame(container, ctx, {
    moduleId: 'avr', systemId: 'S14', title: 'Automatic voltage regulator (AVR)',
    help: 'The AVR keeps the generator voltage steady by adjusting the current in the exciter field. When a large motor starts, the voltage dips and the AVR brings it back in a fraction of a second. With several generators in parallel the AVRs also share the reactive load (kvar) between them.',
    alarmSystems: ['S14'],
    init: (api) => { api.gen = pickGen(ctx) },
    status: (st, api) => { const g = st.gens[api.gen]; return [`${api.gen}: ${avrState(g)}`, g.avr.sensing === 'lost' ? 'crit' : g.avr.limit ? 'high' : ''] },
    tabs: [{ id: 'live', label: 'AVR', build: (el, api) => buildLive(el, ctx, api) }, { id: 'step', label: 'Step response', build: (el, api) => buildStep(el, ctx, api) }, { id: 'pq', label: 'Capability chart', build: (el, api) => buildPQ(el, ctx, api) }],
  })
  return { unmount: () => fr.destroy(), setVariant: (v) => fr.setVariant(v), frame: fr }
}

function avrState(g) { return !g.avr.excitation ? (g.engine === 'accelerating' ? 'Build-up' : 'Off') : g.avr.sensing === 'lost' && g.avr.mode !== 'fcr' ? 'Fault (sensing lost)' : g.avr.mode === 'fcr' ? 'Manual (field current) mode' : g.avr.limit ? `Limiter active (${g.avr.limit})` : 'Auto voltage control' }
const picker = (ctx, api) => select(ctx.sim.state.genOrder.map((id) => [id, `${id} AVR`]), api.gen, (v) => { api.gen = v; api.select(api.tab()) })

function buildLive(el, ctx, api) {
  const { sim } = ctx
  const legacy = api.variant === 'legacy'
  const X = sim.state.excitation
  const K = kv([['State', '', 'st'], ['Voltage', 'kV', 'v'], ['Setpoint', 'kV', 'sp'], ['Field current', 'A', 'if'], ['Reactive power', 'kvar', 'q'], ['Power factor', '', 'pf'], ['Reactive droop', '%', 'dr'], ['Response gain (concept)', 'x', 'gain'], ['Sensing', '', 'sens']])
  const ev = h('div', {})
  el.append(h('div', { class: 'row', style: { marginBottom: '.5em' } }, 'Generator ', picker(ctx, api), h('span', { class: 'small muted' }, `Rated field current about ${f1(X.if_rated_a)} A (${X.basis}); over-excitation limiter ${X.oel_x} x for ${X.oel_s} s (database).`)),
    h('div', { class: 'grid g2' },
      h('div', { class: 'card' }, h('h3', {}, legacy ? 'Legacy analogue AVR card' : 'Digital AVR'), legacy ? legacyCard() : null, h('div', { class: legacy ? '' : 'lcd' }, K.el)),
      h('div', { class: 'card' }, h('h3', {}, 'Settings and tests'),
        h('div', { class: 'row' }, btn('Voltage lower', () => sim.command('avr.setpoint', { id: api.gen, delta: -0.033 })), btn('Voltage raise', () => sim.command('avr.setpoint', { id: api.gen, delta: 0.033 })), btn('Reset to 6.6 kV', () => sim.command('avr.setpoint', { id: api.gen, value: sim.state.gens[api.gen].vn_kv }))),
        h('h4', {}, 'Reactive droop'), seg([['2', '2 %'], ['4', '4 %'], ['6', '6 %']], String(Math.round(sim.state.gens[api.gen].avr.droop_q * 100)), (v) => sim.command('avr.droop', { id: api.gen, pct: Number(v) })),
        h('h4', {}, legacy ? 'Gain (potentiometer on the card)' : 'Gain (parameter)'), seg([['0.5', 'slow'], ['1', 'normal'], ['2', 'fast']], String(sim.state.gens[api.gen].avr.gain), (v) => sim.command('avr.gain', { id: api.gen, gain: Number(v) })),
        h('h4', {}, 'Mode'), seg([['auto', 'AUTO (voltage)'], ['fcr', 'MANUAL (field current)']], sim.state.gens[api.gen].avr.mode, (v) => sim.command('avr.mode', { id: api.gen, mode: v })),
        h('h4', {}, 'Fault'), h('div', { class: 'row' }, btn('Loss of voltage sensing (PT fuse)', () => sim.command('fault.inject', { target: api.gen, kind: 'avr_sensing' }), 'warn', { 'data-act': 'sensing' }), btn('Restore sensing', () => sim.command('fault.clear', { target: api.gen, kind: 'avr_sensing' }))),
        h('p', { class: 'note' }, legacy ? 'Legacy card: with the sensing lost it sees zero voltage and drives the excitation to its ceiling; only the field over-current protection stops it, with a trip of the set.' : 'Digital AVR: detects the loss of sensing and transfers to field current regulation, keeping the set on line, with an alarm and an event record.'),
        legacy ? null : h('div', {}, h('h4', {}, 'Diagnostics and events'), ev))))
  const ue = legacy ? null : eventList(ev, (e) => e.systemId === 'S14', 10)
  return (st) => {
    const g = st.gens[api.gen], v = genView(st, api.gen)
    K.set('st', avrState(g), g.avr.sensing === 'lost' ? 'crit' : g.avr.limit ? 'high' : ''); K.set('v', f3(v.kv), Math.abs(v.kv / g.vn_kv - 1) > 0.05 && g.online ? 'high' : ''); K.set('sp', f3(v.vset)); K.set('if', f2(v.ifA), v.ifA > st.excitation.if_alarm_a ? 'high' : ''); K.set('q', f0(v.kvar), g.kvarShareDev ? 'high' : ''); K.set('pf', f2(v.pf)); K.set('dr', f1(v.qDroopPct)); K.set('gain', f1(v.avrGain)); K.set('sens', g.avr.sensing === 'ok' ? 'ok (3 phase PT)' : 'LOST', g.avr.sensing === 'ok' ? '' : 'crit')
    ue && ue(st)
  }
}

function legacyCard() {
  const svg = s('svg', { viewBox: '0 0 420 150', role: 'img', 'aria-label': 'Analogue AVR card', style: { maxWidth: '26em' } })
  svg.append(s('rect', { x: 4, y: 4, width: 412, height: 142, rx: 6, fill: '#2f5d3a', stroke: '#1b3322' }))
  ;['VOLT', 'STAB', 'DROOP', 'U/F'].forEach((n, i) => { const x = 60 + i * 95; svg.append(s('circle', { cx: x, cy: 70, r: 22, fill: '#d8c48a', stroke: '#222' }), s('line', { x1: x, y1: 70, x2: x + 12, y2: 52, stroke: '#222', 'stroke-width': 3 }), s('text', { x, y: 118, 'text-anchor': 'middle', 'font-size': 16, fill: '#fff' }, n)) })
  svg.append(s('text', { x: 12, y: 26, 'font-size': 15, fill: '#fff' }, 'Settings by potentiometer, no display, no event record'))
  return svg
}

function buildStep(el, ctx, api) {
  const { sim } = ctx
  const c = h('canvas', { style: { width: '100%', height: '16em' }, 'aria-label': 'Voltage step response' })
  const res = h('div', { class: 'small' })
  el.append(h('div', { class: 'row', style: { marginBottom: '.5em' } }, 'Generator ', picker(ctx, api),
    btn('Motor start (1200 kW DOL equivalent)', () => sim.command('test.load_step', { bus: sim.state.gens[api.gen].bus, kw: 1200, motor: true }), 'on', { 'data-act': 'motor-step' }), btn('Remove test load', () => sim.command('test.load_clear'))),
  h('div', { class: 'card' }, h('h3', {}, 'Voltage, last 60 s (10 samples per second)'), c, res,
    h('p', { class: 'note' }, 'Educational step response from the simulation model (simplified exciter, REPRESENTATIVE time constants). Compare gain settings and legacy versus retrofit qualitatively; no performance figure is claimed for any product.')))
  return (st) => {
    const F = st.fast[api.gen]
    drawTrend(c, [{ values: F.kv.values, label: `${api.gen} kV` }], { minSpan: 0.6, lines: [{ v: st.gens[api.gen].avr.v_set, color: '#6d737b', label: 'setpoint' }] })
    const vs = F.kv.values.filter((v) => v > 0.5)
    if (vs.length) { const min = Math.min(...vs); text(res, `Lowest voltage in the window: ${f2(min)} kV (${f1((100 * (min - st.gens[api.gen].vn_kv)) / st.gens[api.gen].vn_kv)} % of nominal)`) }
  }
}

function buildPQ(el, ctx, api) {
  const { sim } = ctx
  const g0 = sim.state.gens[api.gen]
  const W = 700, H = 520, cx = 200, cy = 470, sc = 360
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Generator capability chart', style: { maxWidth: '40em' } })
  const X = (q) => cx + q * sc, Y = (p) => cy - p * sc
  svg.append(s('line', { x1: 20, y1: cy, x2: W - 10, y2: cy, stroke: '#6b7178' }), s('line', { x1: cx, y1: cy, x2: cx, y2: 20, stroke: '#6b7178' }))
  svg.append(s('text', { x: W - 14, y: cy - 8, 'text-anchor': 'end', 'font-size': 16 }, 'Q (kvar) lagging'), s('text', { x: 24, y: cy - 8, 'font-size': 16 }, 'leading'), s('text', { x: cx + 8, y: 34, 'font-size': 16 }, 'P (kW)'))
  // stator current limit (1.0 pu kVA), prime mover limit (kW rating), under-excitation limit (simplified)
  let d = ''; for (let a = -90; a <= 90; a += 3) { const r = 1; const q = r * Math.sin((a * Math.PI) / 180), p = r * Math.cos((a * Math.PI) / 180); d += `${d ? 'L' : 'M'}${X(q)} ${Y(p)} ` }
  svg.append(s('path', { d, fill: 'none', stroke: '#1f2328', 'stroke-width': 2.5 }), s('text', { x: X(0.72), y: Y(0.78), 'font-size': 16 }, 'stator current limit'))
  const pmax = g0.rating_kw / g0.rating_kva
  svg.append(s('line', { x1: X(-0.6), y1: Y(pmax), x2: X(0.6), y2: Y(pmax), stroke: '#0b5cad', 'stroke-width': 2.5, 'stroke-dasharray': '6 4' }), s('text', { x: X(-0.58), y: Y(pmax) - 8, 'font-size': 16, fill: '#0b5cad' }, 'engine kW rating'))
  svg.append(s('line', { x1: X(-0.3), y1: Y(0), x2: X(-0.45), y2: Y(0.9), stroke: '#8a6400', 'stroke-width': 2.5, 'stroke-dasharray': '6 4' }), s('text', { x: X(-0.55), y: Y(0.95), 'font-size': 16, fill: '#8a6400' }, 'UEL (simplified)'))
  const pt = s('circle', { r: 10, fill: '#c62828', stroke: '#fff', 'stroke-width': 2 }); svg.append(pt)
  el.append(h('div', { class: 'row', style: { marginBottom: '.5em' } }, 'Generator ', picker(ctx, api)), h('div', { class: 'card' }, h('h3', {}, 'Operating point on a simplified capability chart (per unit of kVA rating)'), svg, h('p', { class: 'small muted' }, 'Simplified educational chart; the real capability curve comes from the alternator maker.')))
  return (st) => { const g = st.gens[api.gen]; pt.setAttribute('cx', X(g.q_kvar / g.rating_kva)); pt.setAttribute('cy', Y(g.p_kw / g.rating_kva)) }
}

export function renderMini(canvas, ctx) {
  const st = ctx.sim.state
  const id = pickGen(ctx), g = st.gens[id]
  miniFrame(canvas, `AVR ${id}`, [{ k: 'State', v: avrState(g), alarm: g.avr.sensing === 'lost' ? 'critical' : g.avr.limit ? 'high' : null }, { k: 'Voltage', v: `${f3(g.v_kv)} kV` }, { k: 'Field', v: `${f2(g.if_a)} A` }, { k: 'kvar', v: f0(g.q_kvar) }], { legacy: st.variant.S14 === 'legacy' })
}
