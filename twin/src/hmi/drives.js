// S04 Drives and pump controls: VFD keypad view, speed / pressure control, pump and system curves with the
// live operating point, legacy throttling comparison computed from the same pump model, fault log.
import { createFrame, h, s, btn, seg, kv, bar, text, f0, f1, f2, miniFrame, select } from './common/ui.js'
import { pumpPoint, valveForFlow } from '../sim/drives.js'

export const meta = { id: 'drives', title: 'Drives and pump controls', systems: ['S04'], kind: 'hmi' }
const driveFor = (ctx) => { const st = ctx.sim.state; return st.drives[ctx.componentId] ? ctx.componentId : Object.keys(st.drives)[0] }

export function mount(container, ctx) {
  const fr = createFrame(container, ctx, {
    moduleId: 'drives', systemId: 'S04', title: 'Variable speed drives and pump controls',
    help: 'A variable frequency drive (VFD) changes the motor speed so a pump delivers just the flow needed. Pump power falls steeply with speed, so slowing a pump saves energy compared with running at full speed and throttling a valve. Cargo pumps ask the PMS for permission before starting.',
    alarmSystems: ['S04'],
    init: (api) => { api.drive = driveFor(ctx) },
    status: (st, api) => { const d = st.drives[api.drive]; return [`${d.tag}: ${d.status}`, d.trip ? 'crit' : d.interlock ? 'high' : ''] },
    tabs: [
      { id: 'drive', label: 'Drive', build: (el, api) => buildDrive(el, ctx, api) },
      { id: 'curve', label: 'Pump curve', build: (el, api) => buildCurve(el, ctx, api) },
      { id: 'compare', label: 'Throttling vs speed', build: (el, api) => buildCompare(el, ctx, api) },
      { id: 'all', label: 'All drives', build: (el, api) => buildAll(el, ctx, api) },
    ],
  })
  return { unmount: () => fr.destroy(), setVariant: (v) => fr.setVariant(v), frame: fr }
}

const picker = (ctx, api) => select(Object.values(ctx.sim.state.drives).map((d) => [d.id, `${d.tag} ${d.name}`]), api.drive, (v) => { api.drive = v; api.select(api.tab()) })

function buildDrive(el, ctx, api) {
  const { sim } = ctx
  const legacy = api.variant === 'legacy'
  const d0 = sim.state.drives[api.drive]
  const K = kv([['Motor speed', 'rpm', 'rpm'], ['Speed', '%', 'spd'], ['Output frequency', 'Hz', 'hz'], ['Motor current', 'A', 'a'], ['Motor current', '% rated', 'ipct'], ['Input power', 'kW', 'kw'], ['DC link', '% nominal', 'dc'], ['Heatsink', 'degC', 'hs'], ['Motor thermal image', '%', 'th'], ['Flow', 'm3/h', 'q'], ['Discharge pressure', 'barg', 'pb'], ['Head', 'm', 'hd']])
  const refIn = h('input', { type: 'range', min: 0, max: 100, step: 1, value: d0.ref, 'aria-label': 'Speed reference', oninput: (e) => sim.command('drive.ref', { id: api.drive, ref: Number(e.target.value) }) })
  const refTxt = h('span', { class: 'big' })
  const valveIn = h('input', { type: 'range', min: 5, max: 100, step: 1, value: d0.pump.valve, 'aria-label': 'Throttle valve', oninput: (e) => sim.command('drive.valve', { id: api.drive, pct: Number(e.target.value) }) })
  const perm = h('span', { class: 'tag' }), inter = h('span', { class: 'tag' })
  const log = h('div', { class: 'small', style: { maxHeight: '12em', overflow: 'auto' } })
  const spdBar = bar(100), iBar = bar(160, 150)
  el.append(h('div', { class: 'row', style: { marginBottom: '.5em' } }, 'Drive ', picker(ctx, api), h('span', { class: 'small muted' }, `${d0.rated_kw} kW, ${d0.voltage_kv * 1000} V, ${d0.fluid}, rated ${f0(d0.pump.Qr)} m3/h at ${f0(d0.pump.Hr)} m (REPRESENTATIVE)`)),
    h('div', { class: 'grid', style: { gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' } },
      h('div', { class: 'card' }, h('h3', {}, legacy ? 'Legacy: direct on line starter, fixed speed' : 'Drive keypad / panel'), h('div', { class: 'lcd' }, K.el), h('div', { class: 'small muted', style: { marginTop: '.3em' } }, 'Speed'), spdBar.el, h('div', { class: 'small muted' }, 'Current (trip mark at db limit)'), iBar.el),
      h('div', { class: 'card' }, h('h3', {}, 'Control'),
        h('div', { class: 'row' }, btn('START', () => sim.command('drive.start', { id: api.drive, by: sim.state.drives[api.drive].control === 'local' ? 'local' : 'CCR' }), 'on', { 'data-act': 'drive-start' }), btn('STOP', () => sim.command('drive.stop', { id: api.drive }), '', { 'data-act': 'drive-stop' }), btn('RESET', () => sim.command('drive.reset', { id: api.drive }))),
        h('h4', {}, 'Control location'), seg([['remote', 'REMOTE (CCR / ICSS)'], ['local', 'LOCAL station']], d0.control, (v) => sim.command('drive.control', { id: api.drive, location: v }), { 'data-seg': 'loc' }),
        legacy ? h('div', {}, h('h4', {}, 'Throttling valve opening, %'), valveIn) : h('div', {}, h('h4', {}, 'Control mode'), seg([['speed', 'Speed reference'], ['pressure', 'Pressure control (PID)']], d0.mode, (v) => sim.command('drive.mode', { id: api.drive, mode: v })), h('h4', {}, 'Speed reference ', refTxt), refIn),
        h('h4', {}, 'PMS permission and interlocks'), h('div', { class: 'row' }, perm, inter),
        h('h4', {}, 'Demonstration faults'), h('div', { class: 'row' }, btn('Pump jam', () => sim.command('fault.inject', { target: api.drive, kind: 'jam' }), 'warn'), btn('Cooling fan fail', () => sim.command('fault.inject', { target: api.drive, kind: 'fan' })), btn('Supply dip', () => sim.command('fault.inject', { target: api.drive, kind: 'dc_uv' })), btn('Clear faults', () => ['jam', 'fan', 'dc_uv'].forEach((k) => sim.command('fault.clear', { target: api.drive, kind: k })))),
        h('h4', {}, legacy ? 'Fault indication (legacy: overload relay flag only)' : 'Drive fault log'), log)))
  return (st) => {
    const d = st.drives[api.drive]
    K.set('rpm', f0(d.rpm)); K.set('spd', f1(d.speed)); K.set('hz', f1(d.f_out)); K.set('a', f0(d.i_a)); K.set('ipct', f0(d.i_pct), d.i_pct > st.driveCfg.i_alarm_pct ? 'high' : ''); K.set('kw', f1(d.kw))
    K.set('dc', f0(d.dc_pct), d.dc_pct < st.driveCfg.dc_alarm_lo && d.precharged ? 'high' : ''); K.set('hs', f0(d.heatsink), d.heatsink > st.driveCfg.hs_alarm ? 'high' : ''); K.set('th', f0(d.thermal), d.thermal > 100 ? 'high' : '')
    K.set('q', f0(d.flow)); K.set('pb', f2(d.p_bar)); K.set('hd', f0(d.head))
    spdBar.set(d.speed); iBar.set(d.i_pct, d.i_pct > st.driveCfg.i_trip_pct ? 'crit' : d.i_pct > st.driveCfg.i_alarm_pct ? 'high' : null)
    text(refTxt, `${f0(d.ref)} %`)
    if (document.activeElement !== refIn) refIn.value = d.ref
    text(perm, `PMS permission: ${d.permission}`); perm.className = 'tag ' + (d.permission === 'waiting' ? 'high' : '')
    text(inter, d.interlock ? `INTERLOCK: ${d.interlock}` : 'No interlock'); inter.className = 'tag ' + (d.interlock ? 'crit' : '')
    const k = d.log.length + ':' + (d.log[0]?.t ?? '')
    if (log.dataset.key !== k) { log.dataset.key = k; log.textContent = ''; for (const x of legacy ? d.log.filter((e) => /TRIP/.test(e.text)).slice(0, 1) : d.log) log.append(h('div', { class: /TRIP/.test(x.text) ? 'crit' : '' }, h('span', { class: 'muted' }, `t+${f0(x.t)} s `), legacy ? 'OVERLOAD RELAY TRIPPED' : x.text)) }
  }
}

function buildCurve(el, ctx, api) {
  const { sim } = ctx
  const d0 = sim.state.drives[api.drive]
  const P = d0.pump
  const W = 900, H = 520, L = 70, B = 56, T = 20, R = 20
  const qMax = P.Qr * 1.5, hMax = P.H0 * 1.05
  const X = (q) => L + ((W - L - R) * q) / qMax, Y = (hh) => T + (H - T - B) * (1 - hh / hMax)
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Pump and system curves' })
  for (let k = 0; k <= 6; k++) { const q = (qMax * k) / 6; svg.append(s('line', { x1: X(q), y1: T, x2: X(q), y2: H - B, stroke: '#d2d5d9' }), s('text', { x: X(q), y: H - B + 22, 'text-anchor': 'middle', 'font-size': 16 }, f0(q))) }
  for (let k = 0; k <= 5; k++) { const hh = (hMax * k) / 5; svg.append(s('line', { x1: L, y1: Y(hh), x2: W - R, y2: Y(hh), stroke: '#d2d5d9' }), s('text', { x: L - 8, y: Y(hh) + 5, 'text-anchor': 'end', 'font-size': 16 }, f0(hh))) }
  svg.append(s('text', { x: (W + L) / 2, y: H - 10, 'text-anchor': 'middle', 'font-size': 16 }, 'Flow, m3/h'), s('text', { x: 16, y: H / 2, transform: `rotate(-90 16 ${H / 2})`, 'text-anchor': 'middle', 'font-size': 16 }, 'Head, m'))
  const pumpPath = (n) => { let d = ''; for (let q = 0; q <= qMax; q += qMax / 60) { const hh = P.H0 * n * n - P.k * q * q; if (hh < 0) break; d += `${d ? 'L' : 'M'}${X(q).toFixed(1)} ${Y(hh).toFixed(1)} ` } return d }
  for (const n of [1, 0.8, 0.6]) svg.append(s('path', { d: pumpPath(n), fill: 'none', stroke: '#9aa0a6', 'stroke-width': 2, 'stroke-dasharray': n === 1 ? '' : '6 5' }), s('text', { x: X(0) + 6, y: Y(P.H0 * n * n) - 6, 'font-size': 15, fill: '#4a5058' }, `${n * 100} % speed`))
  const live = s('path', { fill: 'none', stroke: '#1f2328', 'stroke-width': 3 })
  const sys = s('path', { fill: 'none', stroke: '#0b5cad', 'stroke-width': 2.5 })
  const pt = s('circle', { r: 9, fill: '#c62828', stroke: '#fff', 'stroke-width': 2 })
  svg.append(sys, live, pt)
  el.append(h('div', { class: 'row', style: { marginBottom: '.5em' } }, 'Drive ', picker(ctx, api)), h('div', { class: 'card' }, h('h3', {}, 'Pump curve at the present speed (black), system curve (blue), operating point (red)'), svg,
    h('p', { class: 'small' }, 'Affinity laws: flow is proportional to speed, head to speed squared, power to speed cubed (with static head the saving is smaller). The system curve includes a static head and friction losses; a throttled valve makes it steeper. REPRESENTATIVE pump data from the database.')))
  return (st) => {
    const d = st.drives[api.drive]
    const n = d.speed / 100
    live.setAttribute('d', pumpPath(Math.max(0.05, n)))
    const valve = st.variant.S04 === 'legacy' ? d.pump.valve / 100 : 1
    const cEff = P.c / Math.max(0.05, valve * valve)
    let ds = ''; for (let q = 0; q <= qMax; q += qMax / 60) { const hh = P.Hs + cEff * q * q; if (hh > hMax) break; ds += `${ds ? 'L' : 'M'}${X(q).toFixed(1)} ${Y(hh).toFixed(1)} ` }
    sys.setAttribute('d', ds)
    pt.setAttribute('cx', X(d.flow)); pt.setAttribute('cy', Y(d.head))
  }
}

function buildCompare(el, ctx, api) {
  const { sim } = ctx
  const d0 = sim.state.drives[api.drive]
  let flowPct = 70
  const out = h('tbody')
  const slider = h('input', { type: 'range', min: 30, max: 100, value: flowPct, oninput: (e) => { flowPct = Number(e.target.value); render() }, 'aria-label': 'Required flow' })
  const lab = h('span', { class: 'big' })
  const barV = bar(110), barT = bar(110)
  const shaft = (P, pt, n) => d0.rated_kw * 0.92 * ((pt.Q * pt.H) / (P.Qr * P.Hr)) + 0.02 * d0.rated_kw * n
  function render() {
    const P = sim.state.drives[api.drive].pump
    const q = (P.Qr * flowPct) / 100
    let n = 1; { let lo = 0.2, hi = 1; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (pumpPoint(P, m).Q > q) hi = m; else lo = m } n = (lo + hi) / 2 }
    const ptV = pumpPoint(P, n), kwV = shaft(P, ptV, n) / (0.95 * 0.97)
    const valve = valveForFlow(P, q), ptT = pumpPoint(P, 1, valve), kwT = shaft(P, ptT, 1) / 0.95
    text(lab, `${flowPct} % of rated flow (${f0(q)} m3/h)`)
    out.textContent = ''
    out.append(h('tr', {}, h('td', {}, 'Speed control (VFD), valve open'), h('td', { class: 'n' }, `${f0(n * 100)} %`), h('td', { class: 'n' }, '100 %'), h('td', { class: 'n' }, f0(ptV.H)), h('td', { class: 'n' }, f1(kwV))),
      h('tr', {}, h('td', {}, 'Fixed speed, throttling valve'), h('td', { class: 'n' }, '100 %'), h('td', { class: 'n' }, `${f0(valve)} %`), h('td', { class: 'n' }, f0(ptT.H)), h('td', { class: 'n' }, f1(kwT))))
    barV.set((100 * kwV) / d0.rated_kw); barT.set((100 * kwT) / d0.rated_kw)
  }
  el.append(h('div', { class: 'row', style: { marginBottom: '.5em' } }, 'Drive ', picker(ctx, api)), h('div', { class: 'card' }, h('h3', {}, 'Same flow, two ways (calculated with the same pump model)'), h('div', { class: 'row' }, 'Required flow ', lab), slider,
    h('table', { class: 't', style: { marginTop: '.6em' } }, h('thead', {}, h('tr', {}, h('th', {}, 'Method'), h('th', {}, 'Speed'), h('th', {}, 'Valve'), h('th', {}, 'Head m'), h('th', {}, 'Electrical kW'))), out),
    h('div', { class: 'grid g2', style: { marginTop: '.6em' } }, h('div', {}, h('div', { class: 'small' }, 'VFD electrical power, % of motor rating'), barV.el), h('div', {}, h('div', { class: 'small' }, 'Throttling electrical power, % of motor rating'), barT.el)),
    h('p', { class: 'note' }, 'Qualitative comparison from the educational pump model with REPRESENTATIVE data. Real savings depend on the pump, the system curve and the duty profile; no saving figure is claimed.')))
  render()
  return null
}

function buildAll(el, ctx) {
  const body = h('tbody')
  el.append(h('div', { class: 'card' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', {}, 'Drive'), h('th', {}, 'Feeder'), h('th', {}, 'Status'), h('th', {}, 'Speed %'), h('th', {}, 'kW'), h('th', {}, 'Flow m3/h'), h('th', {}, 'Control'))), body)))
  const ids = Object.keys(ctx.sim.state.drives)
  const rows = ids.map((id) => { const tds = Array.from({ length: 7 }, (_, i) => h('td', { class: i >= 3 && i <= 5 ? 'n' : '' })); body.append(h('tr', {}, ...tds)); return tds })
  return (st) => ids.forEach((id, i) => { const d = st.drives[id], t = rows[i]; text(t[0], d.tag); text(t[1], d.feeder || '-'); text(t[2], d.status); t[2].className = d.trip ? 'crit' : ''; text(t[3], f0(d.speed)); text(t[4], f0(d.kw)); text(t[5], f0(d.flow)); text(t[6], d.control) })
}

export function renderMini(canvas, ctx) {
  const st = ctx.sim.state
  const d = st.drives[driveFor(ctx)]
  miniFrame(canvas, d.tag, [{ k: 'Status', v: d.status, alarm: d.trip ? 'critical' : null }, { k: 'Speed', v: `${f0(d.rpm)} rpm` }, { k: 'Current', v: `${f0(d.i_a)} A` }, { k: 'Power', v: `${f0(d.kw)} kW` }, { k: 'DC link', v: `${f0(d.dc_pct)} %` }], { legacy: st.variant.S04 === 'legacy' })
}
