// S13 Oil mist detection: bar graph per crankcase head, average and deviation, alarm and shutdown request,
// sensor fault, functional test with test fluid (educational), ECR repeater, legacy single sensor scanning.
import { createFrame, h, s, btn, kv, text, f0, f1, miniFrame, select } from './common/ui.js'

export const meta = { id: 'omd', title: 'Oil mist detection', systems: ['S13'], kind: 'inspection' }
function pickGen(ctx) { const st = ctx.sim.state; return st.genOrder.find((id) => st.omd[id].unit === ctx.componentId || st.gens[id].links?.omd === ctx.componentId) || st.genOrder[0] }

export function mount(container, ctx) {
  const fr = createFrame(container, ctx, {
    moduleId: 'omd', systemId: 'S13', title: 'Oil mist detection (OMD)',
    help: 'A hot spot in an engine crankcase (for example an overheating bearing) evaporates lube oil into a mist that could explode. Oil mist heads on every crankcase compartment measure the mist and stop the engine before the mist reaches a dangerous level. Values are shown as a percentage of the high alarm level.',
    alarmSystems: ['S13', 'S12'],
    init: (api) => { api.gen = pickGen(ctx) },
    status: (st, api) => { const o = st.omd[api.gen]; return [`${api.gen}: ${omdState(st, o)}`, o.alarm ? 'crit' : o.prealarm || o.devAlarm ? 'high' : ''] },
    tabs: [{ id: 'heads', label: 'Detector', build: (el, api) => buildHeads(el, ctx, api) }, { id: 'repeater', label: 'ECR repeater', build: (el) => buildRepeater(el, ctx) }, { id: 'test', label: 'Testing', build: (el, api) => buildTest(el, ctx, api) }],
  })
  return { unmount: () => fr.destroy(), setVariant: (v) => fr.setVariant(v), frame: fr }
}

function omdState(st, o) { return o.testing ? 'Self-test' : o.sensorFault && !o.alarm ? 'Fault' : o.alarm ? (o.shutdownReq ? 'Shutdown requested' : 'Alarm') : o.prealarm || o.devAlarm ? 'Pre-alarm' : 'Normal' }
const picker = (ctx, api) => select(ctx.sim.state.genOrder.map((id) => [id, `DG ${id.slice(1)}`]), api.gen, (v) => { api.gen = v; api.select(api.tab()) })

function buildHeads(el, ctx, api) {
  const { sim } = ctx
  const legacy = api.variant === 'legacy'
  const C = sim.state.omdCfg
  const o0 = sim.state.omd[api.gen]
  const n = o0.heads.length
  const W = 900, H = 400, T = 20, B = 60, maxV = 140
  const Y = (v) => T + (H - T - B) * (1 - Math.min(maxV, v) / maxV)
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Oil mist per head' })
  for (let v = 0; v <= maxV; v += 20) svg.append(s('line', { x1: 60, y1: Y(v), x2: W - 10, y2: Y(v), stroke: '#d2d5d9' }), s('text', { x: 52, y: Y(v) + 5, 'text-anchor': 'end', 'font-size': 16 }, v))
  svg.append(s('line', { x1: 60, x2: W - 10, y1: Y(C.alarm), y2: Y(C.alarm), stroke: '#c62828', 'stroke-width': 2.5, 'stroke-dasharray': '7 4' }), s('text', { x: W - 14, y: Y(C.alarm) - 6, 'text-anchor': 'end', 'font-size': 16, fill: '#c62828' }, 'high alarm: shutdown request'))
  svg.append(s('line', { x1: 60, x2: W - 10, y1: Y(0.7 * C.alarm), y2: Y(0.7 * C.alarm), stroke: '#8a6400', 'stroke-width': 2, 'stroke-dasharray': '4 4' }), s('text', { x: W - 14, y: Y(0.7 * C.alarm) - 6, 'text-anchor': 'end', 'font-size': 16, fill: '#8a6400' }, 'pre-alarm'))
  const bw = (W - 80) / n
  const bars = o0.heads.map((hd, i) => { const r = s('rect', { x: 70 + i * bw + 10, width: bw - 20 }); const v = s('text', { x: 70 + i * bw + bw / 2, 'text-anchor': 'middle', 'font-size': 16 }); svg.append(r, v, s('text', { x: 70 + i * bw + bw / 2, y: H - 30, 'text-anchor': 'middle', 'font-size': 16 }, `Head ${i + 1}`)); return [r, v] })
  const avgL = s('line', { x1: 60, x2: W - 10, stroke: '#0b5cad', 'stroke-width': 2 }); svg.append(avgL)
  const scan = legacy ? s('path', { fill: '#0b5cad' }) : null; if (scan) svg.append(scan)
  const K = kv([['State', '', 'st'], ['Average', '% of alarm', 'avg'], ['Max deviation from average', '% of alarm', 'dev'], ['Deviation alarm level', '% of alarm', 'dl'], ['Output to DG safety system', '', 'out'], ['Engine', '', 'eng']])
  el.append(h('div', { class: 'row', style: { marginBottom: '.5em' } }, 'Engine ', picker(ctx, api), h('span', { class: 'small muted' }, `${n} heads, one per crankcase compartment (database components). Unit: ${C.unit}, basis ${C.basis}.`)),
    h('div', { class: 'grid', style: { gridTemplateColumns: 'minmax(0,2fr) minmax(15em,1fr)' } },
      h('div', { class: 'card' }, h('h3', {}, legacy ? 'Legacy: one sensor, rotating sampling valve (blue arrow = compartment sampled now)' : 'Oil mist per head (blue line: average)'), svg),
      h('div', { class: 'card' }, h('h3', {}, 'Status'), K.el, h('div', { class: 'row', style: { marginTop: '.5em' } }, btn('RESET', () => sim.command('omd.reset', { gen: api.gen }), 'on')),
        h('h4', {}, 'Demonstration'), h('div', { class: 'row' }, btn('Bearing overheating (head 4)', () => sim.command('omd.hotspot', { gen: api.gen, idx: 3, rate: 0.05 }), 'warn', { 'data-act': 'hotspot' }), btn('Head 2 sensor fault', () => sim.command('omd.sensor_fault', { gen: api.gen, idx: 1, on: true })), btn('Clear', () => { sim.command('omd.clear', { gen: api.gen }); sim.state.omd[api.gen].heads.forEach((_, i) => sim.command('omd.sensor_fault', { gen: api.gen, idx: i, on: false })) })),
        legacy ? h('p', { class: 'note' }, `The single sensor sees each compartment for about ${C.scanDwell_s} s in turn, so a hot spot in one compartment is detected later and cannot be located as easily.`) : h('p', { class: 'note' }, 'Every compartment is measured continuously; the deviation alarm compares each head with the average of the others, which catches a local hot spot early.'))))
  return (st) => {
    const o = st.omd[api.gen], g = st.gens[api.gen]
    o.heads.forEach((hd, i) => { const [r, v] = bars[i]; const val = legacy ? (i === o.scanIdx ? o.legacyReading : null) : hd.value; if (val == null) { r.setAttribute('y', Y(0)); r.setAttribute('height', 0); text(v, hd.fault ? 'FAULT' : '-'); v.setAttribute('y', Y(0) - 8); return } r.setAttribute('y', Y(val)); r.setAttribute('height', Y(0) - Y(val)); r.setAttribute('fill', hd.fault ? '#9aa0a6' : val >= C.alarm ? '#c62828' : val >= 0.7 * C.alarm ? '#e0a100' : '#6b7178'); v.setAttribute('y', Y(val) - 8); text(v, hd.fault ? 'FAULT' : f0(val)) })
    avgL.setAttribute('y1', Y(o.avg)); avgL.setAttribute('y2', Y(o.avg)); avgL.style.display = legacy ? 'none' : ''
    if (scan) { const x = 70 + o.scanIdx * bw + bw / 2; scan.setAttribute('d', `M${x - 14} ${H - 8} L${x + 14} ${H - 8} L${x} ${H - 24} Z`) }
    K.set('st', omdState(st, o), o.alarm ? 'crit' : o.prealarm || o.devAlarm ? 'high' : ''); K.set('avg', f1(o.avg)); K.set('dev', legacy ? 'not available' : f1(o.maxDev), o.devAlarm ? 'high' : ''); K.set('dl', legacy ? '-' : f0(C.devAlarm))
    K.set('out', o.shutdownReq ? 'SHUTDOWN REQUEST' : o.slowdownReq ? 'slowdown / load reduction request' : 'none', o.shutdownReq ? 'crit' : o.slowdownReq ? 'high' : ''); K.set('eng', g.lcpState || g.status, g.engine === 'shutdown' ? 'crit' : '')
  }
}

function buildRepeater(el, ctx) {
  const { sim } = ctx
  const grid = h('div', { class: 'grid g3' })
  const ups = sim.state.genOrder.map((id) => { const leds = ['Normal', 'Pre-alarm', 'Alarm', 'Fault'].map((n) => { const l = h('span', { class: 'led' }); return [n, l, h('div', { class: 'row' }, l, n)] }); grid.append(h('div', { class: 'card' }, h('h3', {}, `DG ${id.slice(1)}`), ...leds.map((x) => x[2]))); return (st) => { const o = st.omd[id]; const S = { Normal: !o.alarm && !o.prealarm && !o.sensorFault, 'Pre-alarm': o.prealarm || o.devAlarm, Alarm: o.alarm, Fault: o.sensorFault }; const col = { Normal: 'green', 'Pre-alarm': 'amber', Alarm: 'red', Fault: 'amber' }; for (const [n, l] of leds) l.className = 'led' + (S[n] ? ' ' + col[n] : '') } })
  el.append(h('p', { class: 'small' }, 'Repeater panel in the engine control room: one row of LEDs per engine.'), grid)
  return (st) => ups.forEach((u) => u(st))
}

function buildTest(el, ctx, api) {
  const { sim } = ctx
  const o0 = sim.state.omd[api.gen]
  let head = 0
  el.append(h('div', { class: 'row', style: { marginBottom: '.5em' } }, 'Engine ', picker(ctx, api)),
    h('div', { class: 'card' }, h('h3', {}, 'Functional test (educational concept)'),
      h('p', {}, 'Heads are tested by introducing a test medium (test fluid or smoke, as specified by the detector maker) into the test port of a head and checking that the head responds and the alarm and shutdown outputs operate. During routine tests the shutdown output to the engine is normally inhibited so that a running engine is not stopped; the inhibit must be removed after the test.'),
      h('div', { class: 'row' }, 'Head', select(o0.heads.map((x, i) => [i, `Head ${i + 1}`]), head, (v) => { head = Number(v) }),
        btn('Test with shutdown inhibited', () => sim.command('omd.test', { gen: api.gen, idx: head, inhibit: true }), 'on', { 'data-act': 'omd-test' }), btn('End test', () => sim.command('omd.test_end', { gen: api.gen })), btn('Reset', () => sim.command('omd.reset', { gen: api.gen }))),
      h('p', { class: 'note' }, 'This is not a test procedure. Follow the maker instructions and the vessel safety management system.')))
  return null
}

export function renderMini(canvas, ctx) {
  const st = ctx.sim.state
  const id = pickGen(ctx)
  const o = st.omd[id]
  miniFrame(canvas, `OMD DG ${id.slice(1)}`, [{ k: 'State', v: omdState(st, o), alarm: o.alarm ? 'critical' : o.prealarm ? 'high' : null }, ...o.heads.slice(0, 6).map((hd, i) => ({ k: `Head ${i + 1}`, v: hd.fault ? 'FAULT' : `${f0(hd.value)} %`, alarm: hd.value >= st.omdCfg.alarm ? 'critical' : null }))], { legacy: st.variant.S13 === 'legacy' })
}
