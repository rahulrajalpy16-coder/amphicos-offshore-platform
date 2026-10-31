// S15 Governor: speed control of each engine, droop versus isochronous load sharing, actuator and fuel limit,
// load step response (frequency dip and recovery), parameters, pickup and actuator faults, legacy
// mechanical-hydraulic governor versus digital speed controller.
import { createFrame, h, s, btn, seg, kv, bar, text, f0, f1, f2, drawTrend, miniFrame, select, eventList } from './common/ui.js'
import { genView } from './common/views.js'

export const meta = { id: 'governor', title: 'Governor', systems: ['S15'], kind: 'hmi' }
export function snapshot(ctx, id) { return genView(ctx.sim.state, id || pickGen(ctx)) }
function pickGen(ctx) { const st = ctx.sim.state; return st.genOrder.find((id) => st.gens[id].links?.speed_controller === ctx.componentId || st.gens[id].links?.actuator === ctx.componentId) || st.genOrder[0] }

export function mount(container, ctx) {
  const fr = createFrame(container, ctx, {
    moduleId: 'governor', systemId: 'S15', title: 'Governor and speed control',
    help: 'The governor keeps the engine at its rated speed (here 720 rpm, which gives 60 Hz) by moving the fuel rack. When load is added the speed dips and the governor adds fuel. In droop mode the frequency settles a little lower at higher load; in isochronous load sharing the sets share load equally and frequency returns to 60 Hz.',
    alarmSystems: ['S15'],
    init: (api) => { api.gen = pickGen(ctx) },
    status: (st, api) => { const g = st.gens[api.gen]; return [`${api.gen}: ${govState(g)}`, g.faults.pickup || g.faults.gov_actuator ? 'crit' : ''] },
    tabs: [{ id: 'live', label: 'Speed controller', build: (el, api) => buildLive(el, ctx, api) }, { id: 'step', label: 'Step response', build: (el, api) => buildStep(el, ctx, api) }],
  })
  return { unmount: () => fr.destroy(), setVariant: (v) => fr.setVariant(v), frame: fr }
}

function govState(g) { return g.faults.pickup || g.faults.gov_actuator ? 'Fault' : ['stopped', 'stopping', 'shutdown', 'prelube', 'cranking', 'fail_start'].includes(g.engine) ? (g.engine === 'cranking' ? 'Start fuel limit' : 'Stopped') : !g.online ? 'Speed control (no load)' : g.gov.mode === 'isoch' ? 'Isochronous load sharing' : 'Droop' }
const picker = (ctx, api) => select(ctx.sim.state.genOrder.map((id) => [id, `${id} speed controller`]), api.gen, (v) => { api.gen = v; api.select(api.tab()) })

function buildLive(el, ctx, api) {
  const { sim } = ctx
  const legacy = api.variant === 'legacy'
  const K = kv([['State', '', 'st'], ['Engine speed', 'rpm', 'rpm'], ['Frequency', 'Hz', 'f'], ['Speed reference', 'Hz', 'ref'], ['Actuator position', '%', 'act'], ['Load', 'kW', 'kw'], ['kW share', '% of rating', 'share'], ['Droop', '%', 'dr'], ['Gain (concept)', 'x', 'gain']])
  const actBar = bar(100, 95)
  const ev = h('div', {})
  el.append(h('div', { class: 'row', style: { marginBottom: '.5em' } }, 'Generator ', picker(ctx, api)),
    h('div', { class: 'grid g2' },
      h('div', { class: 'card' }, h('h3', {}, legacy ? 'Legacy mechanical-hydraulic governor' : 'Digital speed controller'), legacy ? legacyGov() : null, h('div', { class: legacy ? '' : 'lcd' }, K.el), h('div', { class: 'small muted' }, 'Actuator (fuel limit mark)'), actBar.el),
      h('div', { class: 'card' }, h('h3', {}, 'Settings and tests'),
        h('h4', {}, 'Mode'), seg([['isoch', 'Isochronous load sharing'], ['droop', 'Droop']], sim.state.gens[api.gen].gov.mode, (m) => sim.command('gov.mode', { id: api.gen, mode: m }), { 'data-seg': 'mode' }),
        h('h4', {}, 'Speed reference'), h('div', { class: 'row' }, btn('Lower', () => sim.command('gov.fref', { id: api.gen, delta: -0.1 })), btn('Raise', () => sim.command('gov.fref', { id: api.gen, delta: 0.1 }))),
        h('h4', {}, 'Droop'), seg([['2', '2 %'], ['4', '4 %'], ['6', '6 %']], String(Math.round(sim.state.gens[api.gen].gov.droop * 100)), (v) => sim.command('gov.droop', { id: api.gen, pct: Number(v) })),
        h('h4', {}, legacy ? 'Compensation (needle valve)' : 'Gain (parameter)'), seg([['0.5', 'slow'], ['1', 'normal'], ['2', 'fast']], String(sim.state.gens[api.gen].gov.gain), (v) => sim.command('gov.gain', { id: api.gen, gain: Number(v) })),
        h('h4', {}, 'Faults'), h('div', { class: 'row' }, btn('Speed pickup failure', () => sim.command('fault.inject', { target: api.gen, kind: 'pickup' }), 'warn', { 'data-act': 'pickup' }), btn('Actuator failure', () => sim.command('fault.inject', { target: api.gen, kind: 'gov_actuator' })), btn('Clear', () => ['pickup', 'gov_actuator', 'gov_bias'].forEach((k) => sim.command('fault.clear', { target: api.gen, kind: k })))),
        h('p', { class: 'note' }, legacy ? 'Legacy: settings by knobs and needle valve, no diagnostics; a lost speed signal leads to a fail-safe shutdown of the set.' : 'Digital: parameters, diagnostics and events; with redundant speed pickups configured the controller switches to the healthy pickup and raises an alarm.'),
        legacy ? null : h('div', {}, h('h4', {}, 'Events'), ev))))
  const ue = legacy ? null : eventList(ev, (e) => e.systemId === 'S15', 10)
  return (st) => {
    const g = st.gens[api.gen], v = genView(st, api.gen)
    K.set('st', govState(g), govState(g) === 'Fault' ? 'crit' : ''); K.set('rpm', f0(v.rpm)); K.set('f', f2(v.hz)); K.set('ref', f2(v.fref)); K.set('act', f0(v.actPct), v.actPct > 95 ? 'high' : ''); K.set('kw', f0(v.kw)); K.set('share', f0(v.loadPct), g.kwShareDev ? 'high' : ''); K.set('dr', f1(v.droopPct)); K.set('gain', f1(v.govGain))
    actBar.set(v.actPct, v.actPct > 95 ? 'high' : null)
    ue && ue(st)
  }
}

function legacyGov() {
  const svg = s('svg', { viewBox: '0 0 420 160', role: 'img', 'aria-label': 'Mechanical hydraulic governor', style: { maxWidth: '26em' } })
  svg.append(s('rect', { x: 120, y: 10, width: 180, height: 140, rx: 10, fill: '#3c3c3c', stroke: '#111' }))
  ;[['SPEED', 160], ['DROOP', 260]].forEach(([n, x]) => svg.append(s('circle', { cx: x, cy: 60, r: 24, fill: '#bfbfbf', stroke: '#111' }), s('line', { x1: x, y1: 60, x2: x + 10, y2: 40, stroke: '#111', 'stroke-width': 3 }), s('text', { x, y: 112, 'text-anchor': 'middle', 'font-size': 16, fill: '#fff' }, n)))
  svg.append(s('text', { x: 210, y: 140, 'text-anchor': 'middle', 'font-size': 15, fill: '#fff' }, 'LOAD LIMIT  COMPENSATION'), s('line', { x1: 300, y1: 80, x2: 400, y2: 80, stroke: '#9a9a9a', 'stroke-width': 6 }), s('text', { x: 404, y: 70, 'font-size': 15, 'text-anchor': 'end' }, 'to fuel rack'))
  return svg
}

function buildStep(el, ctx, api) {
  const { sim } = ctx
  const c = h('canvas', { style: { width: '100%', height: '15em' }, 'aria-label': 'Frequency step response' })
  const c2 = h('canvas', { style: { width: '100%', height: '11em' }, 'aria-label': 'Power step response' })
  const res = h('div', { class: 'small' })
  el.append(h('div', { class: 'row', style: { marginBottom: '.5em' } }, 'Generator ', picker(ctx, api),
    btn('Load step +1500 kW', () => sim.command('test.load_step', { bus: sim.state.gens[api.gen].bus, kw: 1500 }), 'on', { 'data-act': 'load-step' }), btn('Remove load', () => sim.command('test.load_clear')),
    btn('PMS MANUAL (no frequency correction)', () => sim.command('pms.mode', { mode: 'manual' })), btn('PMS AUTO', () => sim.command('pms.mode', { mode: 'auto' }))),
  h('div', { class: 'grid' }, h('div', { class: 'card' }, h('h3', {}, 'Frequency, last 60 s'), c, res), h('div', { class: 'card' }, h('h3', {}, 'kW of each set'), c2)),
  h('p', { class: 'note' }, 'In droop mode with the PMS in MANUAL the frequency stays lower after the step (droop x load change). In isochronous load sharing it returns to 60 Hz. Educational model with REPRESENTATIVE engine response.'))
  return (st) => {
    const F = st.fast[api.gen]
    drawTrend(c, [{ values: F.hz.values.filter((v) => v > 1), label: `${api.gen} Hz` }], { minSpan: 1, lines: [{ v: 60, color: '#6d737b', label: '60 Hz' }] })
    drawTrend(c2, st.genOrder.map((id) => ({ values: st.fast[id].kw.values, label: id })), { min: 0 })
    const vs = F.hz.values.filter((v) => v > 1)
    if (vs.length) text(res, `Lowest frequency in the window ${f2(Math.min(...vs))} Hz, present ${f2(vs[vs.length - 1])} Hz`)
  }
}

export function renderMini(canvas, ctx) {
  const st = ctx.sim.state
  const id = pickGen(ctx), g = st.gens[id]
  miniFrame(canvas, `Governor ${id}`, [{ k: 'State', v: govState(g), alarm: govState(g) === 'Fault' ? 'critical' : null }, { k: 'Speed', v: `${f0(g.speed_rpm)} rpm` }, { k: 'Frequency', v: `${f2(g.f_hz)} Hz` }, { k: 'Actuator', v: `${f0(g.act_pct)} %` }], { legacy: st.variant.S15 === 'legacy' })
}
