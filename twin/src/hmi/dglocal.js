// S12 DG local control panel: engine values (lube oil, HT water, exhaust per cylinder, charge air, start air),
// start sequence, shutdowns with first-out, local / remote key, emergency stop, lamp test. Legacy view shows
// analogue gauges and a lamp annunciator. Same generator object as the PMS, governor and AVR views.
import { createFrame, h, s, btn, seg, kv, bar, text, f0, f1, f2, meter, miniFrame, select } from './common/ui.js'
import { genView } from './common/views.js'

export const meta = { id: 'dglocal', title: 'DG local control panel', systems: ['S12'], kind: 'hmi' }
export function snapshot(ctx, id) { return genView(ctx.sim.state, id || pickGen(ctx)) }
function pickGen(ctx) {
  const st = ctx.sim.state
  return st.genOrder.find((id) => st.gens[id].links?.lcp === ctx.componentId || st.gens[id].links?.speed_controller === ctx.componentId) || st.genOrder[0]
}

export function mount(container, ctx) {
  const fr = createFrame(container, ctx, {
    moduleId: 'dglocal', systemId: 'S12', title: 'Diesel generator local control panel',
    help: 'The local panel on each diesel generator shows the engine health (oil pressure, cooling water, exhaust temperature of every cylinder) and stops the engine automatically if a limit is exceeded. In LOCAL the set can only be started here; in REMOTE the PMS controls it. The emergency stop works in every mode.',
    alarmSystems: ['S12', 'S13'],
    init: (api) => { api.gen = pickGen(ctx) },
    status: (st, api) => [`${api.gen}: ${st.gens[api.gen].lcpState || st.gens[api.gen].status}`, st.gens[api.gen].engine === 'shutdown' ? 'crit' : st.gens[api.gen].control === 'local' ? 'high' : ''],
    tabs: [{ id: 'panel', label: 'Engine panel', build: (el, api) => buildPanel(el, ctx, api) }, { id: 'exhaust', label: 'Exhaust temperatures', build: (el, api) => buildExhaust(el, ctx, api) }],
  })
  return { unmount: () => fr.destroy(), setVariant: (v) => fr.setVariant(v), frame: fr }
}

const picker = (ctx, api) => select(ctx.sim.state.genOrder.map((id) => [id, `DG ${id.slice(1)} (${id})`]), api.gen, (v) => { api.gen = v; api.select(api.tab()) })

function buildPanel(el, ctx, api) {
  const { sim } = ctx
  const legacy = api.variant === 'legacy'
  const L = sim.state.engineLimits
  const id0 = api.gen
  const seqK = [['stopped', 'Stopped'], ['prelube', 'Pre-lubrication'], ['cranking', 'Cranking'], ['accelerating', 'Accelerating'], ['running', 'Running'], ['shutdown', 'Shutdown (latched)']]
  const seqEl = h('div', { class: 'row' }); const seqT = seqK.map(([, l]) => { const t = h('span', { class: 'tag' }, l); seqEl.append(t); return t })
  const K = kv([['Engine speed', 'rpm', 'rpm'], ['Lube oil pressure', 'bar', 'lo'], ['Lube oil temperature', 'degC', 'lot'], ['HT water outlet', 'degC', 'jw'], ['HT water pressure', 'bar', 'jwp'], ['Charge air pressure', 'bar', 'ca'], ['Turbocharger', 'rpm', 'tc'], ['Exhaust mean', 'degC', 'exh'], ['Starting air', 'bar', 'sa'], ['Fuel oil pressure', 'bar', 'fo'], ['Load', 'kW', 'kw'], ['Running hours', 'h', 'hrs'], ['Starts', '', 'starts']])
  const meters = legacy ? [meter('LO', 'bar', 0, 8, L.lo_p.alarm), meter('HT', 'degC', 40, 120, L.jw_t.alarm), meter('Speed', 'rpm', 0, 900, L.speed.trip > 200 ? L.speed.trip : 828), meter('Start air', 'bar', 0, 35, L.start_air.alarm)] : null
  const ann = h('div', { class: 'grid g4' })
  const annDefs = [['LO PRESS LOW', (st, g, e) => !e.inhibit && e.lo_p < L.lo_p.alarm], ['HT TEMP HIGH', (st, g, e) => e.jw_t > L.jw_t.alarm], ['OVERSPEED', (st, g, e) => e.firstOut === 'overspeed'], ['EXH DEVIATION', (st, g, e) => e.exh_dev.some((d) => Math.abs(d) > (L.exh.alarm2 ?? 50)) && g.p_kw > 0.2 * g.rating_kw], ['START FAIL', (st, g) => g.engine === 'fail_start'], ['OMD SHUTDOWN', (st, g) => /oil mist/.test(g.shutdownCause || '')], ['EMERGENCY STOP', (st, g) => !!g.faults.estop], ['START AIR LOW', (st, g, e) => e.start_air < (L.start_air.alarm ?? 15)]]
  const annEls = annDefs.map(([n]) => { const e = h('div', { class: 'card', style: { textAlign: 'center', fontWeight: 700, padding: '.4em' } }, n); ann.append(e); return e })
  const fo = h('div', { class: 'big' })
  const loc = seg([['remote', 'REMOTE'], ['local', 'LOCAL']], sim.state.gens[id0].control, (v) => sim.command('gen.control', { id: api.gen, location: v }), { 'data-seg': 'loc' })
  const limits = h('table', { class: 't small' }, h('thead', {}, h('tr', {}, h('th', {}, 'Signal'), h('th', {}, 'Normal'), h('th', {}, 'Alarm'), h('th', {}, 'Shutdown'), h('th', {}, 'Basis'))),
    h('tbody', {}, ...[['Lube oil pressure (bar)', L.lo_p], ['HT water (degC)', L.jw_t], ['Engine speed', L.speed], ['Exhaust (degC)', L.exh], ['Starting air (bar)', L.start_air]].map(([n, x]) => h('tr', {}, h('td', {}, n), h('td', {}, x.normal ? x.normal.join(' to ') : '-'), h('td', {}, x.alarm ?? '-'), h('td', {}, x.trip ?? '-'), h('td', {}, x.basis)))))
  el.append(h('div', { class: 'row', style: { marginBottom: '.5em' } }, 'Engine ', picker(ctx, api)),
    h('div', { class: 'grid', style: { gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)' } },
      h('div', { class: 'card' }, h('h3', {}, legacy ? 'Legacy panel: gauges and lamps' : 'Touch display: engine'), legacy ? h('div', { class: 'grid g4' }, ...meters) : h('div', {}, seqEl), legacy ? null : K.el, h('h4', {}, 'Alarm and shutdown annunciator'), ann),
      h('div', { class: 'card' }, h('h3', {}, 'Controls'), h('div', { class: 'row' }, 'Key switch', loc),
        h('div', { class: 'row', style: { marginTop: '.5em' } }, btn('START', () => sim.command('gen.start', { id: api.gen, by: 'local' }), 'on', { 'data-act': 'local-start' }), btn('STOP', () => sim.command('gen.stop', { id: api.gen, by: 'local' })), btn('RESET', () => sim.command('gen.reset', { id: api.gen })), btn('Lamp test', () => sim.command('gen.lamptest', { id: api.gen }))),
        h('div', { class: 'row', style: { marginTop: '.6em' } }, btn('E-STOP', () => sim.command('gen.estop', { id: api.gen, on: true }), 'estop', { 'data-act': 'estop', title: 'Emergency stop' }), btn('Release E-stop', () => sim.command('gen.estop', { id: api.gen, on: false }))),
        h('h4', {}, 'First-out (cause of the last shutdown)'), fo,
        h('h4', {}, 'Demonstration faults'), h('div', { class: 'row' }, btn('Low LO pressure', () => sim.command('fault.inject', { target: api.gen, kind: 'lo_pressure' }), 'warn'), btn('HT water high', () => sim.command('fault.inject', { target: api.gen, kind: 'jw_high' })), btn('Misfire cyl 3', () => sim.command('fault.inject', { target: api.gen, kind: 'misfire', cyl: 2 })), btn('Fail to start', () => sim.command('fault.inject', { target: api.gen, kind: 'fail_to_start' })), btn('Clear faults', () => ['lo_pressure', 'jw_high', 'misfire', 'fail_to_start', 'overspeed'].forEach((k) => sim.command('fault.clear', { target: api.gen, kind: k })))),
        h('h4', {}, 'Limits (database S12)'), limits)))
  return (st) => {
    const g = st.gens[api.gen], e = st.engines[api.gen], v = genView(st, api.gen)
    const lampTest = e.lampTestUntil > st.t
    const si = g.engine === 'cooldown' || g.engine === 'stopping' ? 4 : seqK.findIndex(([k]) => k === g.engine)
    seqT.forEach((t, k) => { t.className = 'tag' + (k === si ? (g.engine === 'shutdown' ? ' crit' : ' dark') : '') })
    K.set('rpm', f0(v.rpm)); K.set('lo', f2(e.lo_p), !e.inhibit && e.lo_p < L.lo_p.alarm ? 'crit' : ''); K.set('lot', f0(e.lo_t)); K.set('jw', f0(e.jw_t), e.jw_t > L.jw_t.alarm ? 'high' : ''); K.set('jwp', f1(e.jw_p))
    K.set('ca', f2(e.ca_p)); K.set('tc', f0(e.tc_rpm)); K.set('exh', f0(e.exh_avg)); K.set('sa', f1(e.start_air), e.start_air < (L.start_air.alarm ?? 15) ? 'high' : ''); K.set('fo', f1(e.fo_p)); K.set('kw', f0(v.kw)); K.set('hrs', f0(v.hours)); K.set('starts', v.starts)
    if (meters) { meters[0].set(e.lo_p); meters[1].set(e.jw_t); meters[2].set(v.rpm); meters[3].set(e.start_air) }
    annDefs.forEach(([, fn], i) => { const on = lampTest || fn(st, g, e); annEls[i].style.background = on ? (i === 6 || /SHUT|OVERSPEED|PRESS LOW/.test(annDefs[i][0]) ? '#e53935' : '#ffb300') : ''; annEls[i].style.color = on ? '#fff' : '' })
    text(fo, e.firstOut || 'none'); fo.className = 'big ' + (e.firstOut ? 'crit' : '')
    loc.set(g.control)
  }
}

function buildExhaust(el, ctx, api) {
  const { sim } = ctx
  const L = sim.state.engineLimits
  const e0 = sim.state.engines[api.gen]
  const n = e0.cylinders
  const W = 900, H = 380, B = 50, T = 20
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Exhaust temperature per cylinder' })
  const maxT = 600, Y = (t) => T + (H - T - B) * (1 - t / maxT)
  for (let t = 0; t <= maxT; t += 100) svg.append(s('line', { x1: 60, y1: Y(t), x2: W - 10, y2: Y(t), stroke: '#d2d5d9' }), s('text', { x: 52, y: Y(t) + 5, 'text-anchor': 'end', 'font-size': 16 }, t))
  svg.append(s('line', { x1: 60, y1: Y(L.exh.alarm), x2: W - 10, y2: Y(L.exh.alarm), stroke: '#c62828', 'stroke-dasharray': '6 4', 'stroke-width': 2 }), s('text', { x: W - 14, y: Y(L.exh.alarm) - 6, 'text-anchor': 'end', 'font-size': 16, fill: '#c62828' }, `alarm ${L.exh.alarm} degC`))
  const bw = (W - 80) / n
  const bars = Array.from({ length: n }, (_, i) => { const r = s('rect', { x: 70 + i * bw + 6, width: bw - 12, fill: '#6b7178' }); const t = s('text', { x: 70 + i * bw + bw / 2, y: H - 22, 'text-anchor': 'middle', 'font-size': 16 }, `${i + 1}`); const v = s('text', { 'text-anchor': 'middle', 'font-size': 15, x: 70 + i * bw + bw / 2 }); svg.append(r, t, v); return [r, v] })
  const avg = s('line', { x1: 60, x2: W - 10, stroke: '#0b5cad', 'stroke-width': 2 }); svg.append(avg)
  el.append(h('div', { class: 'row', style: { marginBottom: '.5em' } }, 'Engine ', picker(ctx, api), h('span', { class: 'small muted' }, `${n} cylinders, ${e0.arrangement}`)), h('div', { class: 'card' }, h('h3', {}, 'Exhaust gas temperature per cylinder (blue line: mean)'), svg,
    h('p', { class: 'small' }, `Deviation alarm when a cylinder differs from the mean by more than ${L.exh.alarm2 ?? 50} degC (database). A cold cylinder usually means poor combustion, for example a faulty injector.`)))
  return (st) => {
    const e = st.engines[api.gen]
    e.exh.forEach((t, i) => { const [r, v] = bars[i]; r.setAttribute('y', Y(t)); r.setAttribute('height', Y(0) - Y(t)); r.setAttribute('fill', Math.abs(e.exh_dev[i]) > (L.exh.alarm2 ?? 50) && st.gens[api.gen].p_kw > 0.2 * st.gens[api.gen].rating_kw ? '#e0a100' : '#6b7178'); v.setAttribute('y', Y(t) - 6); text(v, f0(t)) })
    avg.setAttribute('y1', Y(e.exh_avg)); avg.setAttribute('y2', Y(e.exh_avg))
  }
}

export function renderMini(canvas, ctx) {
  const st = ctx.sim.state
  const id = pickGen(ctx)
  const g = st.gens[id], e = st.engines[id]
  miniFrame(canvas, `DG ${id.slice(1)} local panel`, [{ k: 'State', v: g.lcpState || g.status, alarm: g.engine === 'shutdown' ? 'critical' : null }, { k: 'Speed', v: `${f0(g.speed_rpm)} rpm` }, { k: 'LO pressure', v: `${f2(e.lo_p)} bar` }, { k: 'HT water', v: `${f0(e.jw_t)} degC` }, { k: 'Load', v: `${f0(g.p_kw)} kW` }], { legacy: st.variant.S12 === 'legacy' })
}
