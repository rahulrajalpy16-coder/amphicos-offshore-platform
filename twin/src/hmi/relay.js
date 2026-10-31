// S03 MV protection relays: numerical IED front panel (measurements, LEDs, keys), settings from the database,
// IDMT curve plot with live operating point, secondary injection test, events and fault records, and the
// legacy electromechanical relay (induction disc) for comparison.
import { createFrame, h, s, btn, seg, kv, text, f0, f1, f2, f3, miniFrame, select } from './common/ui.js'
import { curveName, operateTime, TEST_TOL } from '../sim/relays.js'
import { idmtTime } from '../sim/util.js'

export const meta = { id: 'relay', title: 'MV protection relays', systems: ['S03'], kind: 'hmi' }

const relayFor = (ctx) => { const st = ctx.sim.state; return st.relays[ctx.componentId] ? ctx.componentId : Object.keys(st.relays)[0] }

export function mount(container, ctx) {
  const { sim } = ctx
  const fr = createFrame(container, ctx, {
    moduleId: 'relay', systemId: 'S03', title: 'MV protection relays (IEDs)',
    help: 'Each 6.6 kV circuit has a protection relay that measures current and voltage and trips its breaker within a set time when it sees a fault. Engineers test relays by injecting a known current and checking the trip time against the setting curve. Pick a relay, watch its live values, or put it in test mode.',
    alarmSystems: ['S03'],
    init: (api) => { api.relay = relayFor(ctx) },
    status: (st, api) => { const r = st.relays[api.relay]; return [`${r.tag}: ${r.status}`, r.leds.trip ? 'crit' : r.test.active ? 'low' : ''] },
    tabs: [
      { id: 'front', label: 'Front panel', build: (el, api) => buildFront(el, ctx, api) },
      { id: 'settings', label: 'Settings', build: (el, api) => buildSettings(el, ctx, api) },
      { id: 'curve', label: 'Curve', build: (el, api) => buildCurve(el, ctx, api) },
      { id: 'test', label: 'Injection test', build: (el, api) => buildTest(el, ctx, api) },
      { id: 'records', label: 'Events and faults', build: (el, api) => buildRecords(el, ctx, api) },
    ],
  })
  return { unmount: () => fr.destroy(), setVariant: (v) => fr.setVariant(v), frame: fr }
}

function relayPicker(ctx, api) {
  const st = ctx.sim.state
  return select(Object.values(st.relays).map((r) => [r.id, `${r.tag} (${r.protects})`]), api.relay, (v) => { api.relay = v; api.select(api.tab()) })
}

function buildFront(el, ctx, api) {
  const { sim } = ctx
  const legacy = api.variant === 'legacy'
  const st0 = sim.state
  const r0 = st0.relays[api.relay]
  if (legacy) return buildLegacyFront(el, ctx, api)
  const lcd = kv([['IA', 'A', 'ia'], ['IB', 'A', 'ib'], ['IC', 'A', 'ic'], ['IN (residual)', 'A', 'in'], ['I2 (negative sequence)', 'A', 'i2'], ['V (line)', 'kV', 'v'], ['f', 'Hz', 'f'], ['P', 'kW', 'p'], ['Q', 'kvar', 'q'], ['PF', '', 'pf']])
  const leds = [['healthy', 'Healthy', 'green'], ['start', 'Start / pickup', 'amber'], ['alarm', 'Alarm stage', 'amber'], ['trip', 'Trip', 'red'], ['lockout', 'Lockout 86', 'red'], ['test', 'Test mode', 'amber'], ['sup', 'Start-up supervision', 'blue']]
  const ledEls = leds.map(([k, l]) => { const e = h('span', { class: 'led' }); return [k, e, h('div', { class: 'row' }, e, l)] })
  const fnBody = h('tbody')
  const brk = h('span', { class: 'tag' }, '')
  el.append(h('div', { class: 'row', style: { marginBottom: '.5em' } }, 'Relay ', relayPicker(ctx, api), h('span', { class: 'muted small' }, `${r0.name}. CT ${r0.ct_ratio || '-'}, VT ${r0.vt_ratio || '-'}`)),
    h('div', { class: 'grid', style: { gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,0.6fr) minmax(0,1.3fr)' } },
      h('div', { class: 'card' }, h('h3', {}, 'Measurements (primary values)'), h('div', { class: 'lcd' }, lcd.el)),
      h('div', { class: 'card' }, h('h3', {}, 'LEDs'), ...ledEls.map((x) => x[2]), h('h4', {}, 'Breaker'), brk,
        h('div', { class: 'row', style: { marginTop: '.5em' } }, btn('RESET', () => sim.command('relay.reset', { relay: api.relay }), 'on', { 'data-act': 'relay-reset' }), btn(st0.relays[api.relay].test.active ? 'Test mode OFF' : 'Test mode ON', () => { sim.command('relay.test', { relay: api.relay, on: !sim.state.relays[api.relay].test.active }); api.select('front') }))),
      h('div', { class: 'card' }, h('h3', {}, 'Protection functions (live ratio to setting)'), h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', {}, 'ANSI'), h('th', {}, 'Function'), h('th', {}, 'Ratio'), h('th', {}, 'Timer'), h('th', {}, 'State'))), fnBody))),
    h('div', { class: 'card', style: { marginTop: '.6em' } }, h('h3', {}, 'Demonstration faults (educational)'), h('div', { class: 'row' },
      ...(r0.kind === 'feeder' ? [btn('Phase fault 4 x', () => sim.command('fault.inject', { target: r0.protects, kind: 'overcurrent', multiple: 4 }), 'warn', { 'data-act': 'fault-oc' }), btn('Earth fault', () => sim.command('fault.inject', { target: r0.protects, kind: 'earth' })), btn('Clear fault', () => { sim.command('fault.clear', { target: r0.protects, kind: 'overcurrent' }); sim.command('fault.clear', { target: r0.protects, kind: 'earth' }) })] : []),
      ...(r0.kind === 'gen' ? [btn('Stator winding fault (87)', () => sim.command('fault.inject', { target: r0.protects, kind: 'winding' }), 'warn'), btn('Unbalance (46)', () => sim.command('fault.inject', { target: r0.protects, kind: 'unbalance' })), btn('Loss of fuel (32)', () => sim.command('fault.inject', { target: r0.protects, kind: 'gov_actuator' })), btn('Clear faults', () => ['winding', 'unbalance', 'gov_actuator', 'earth'].forEach((k) => sim.command('fault.clear', { target: r0.protects, kind: k })))] : []),
      btn('Trip circuit fault', () => sim.command('relay.fault', { relay: api.relay, kind: 'tcs', on: true })), btn('Clear relay faults', () => { sim.command('relay.fault', { relay: api.relay, kind: 'tcs', on: false }); sim.command('relay.fault', { relay: api.relay, kind: 'watchdog', on: false }) }))))
  const rows = r0.functions.map((fn) => { const tds = [h('td', {}, fn.ansi), h('td', {}, fn.name), h('td', { class: 'n' }), h('td', { class: 'n' }), h('td', {})]; fnBody.append(h('tr', {}, ...tds)); return tds })
  return (st) => {
    const r = st.relays[api.relay], m = r.meas
    lcd.set('ia', f0(m.ia)); lcd.set('ib', f0(m.ib)); lcd.set('ic', f0(m.ic)); lcd.set('in', f1(m.in)); lcd.set('i2', f1(m.i2)); lcd.set('v', f2(m.v)); lcd.set('f', f2(m.f)); lcd.set('p', f0(m.p)); lcd.set('q', f0(m.q)); lcd.set('pf', f2(m.pf))
    const L = { healthy: r.leds.healthy, start: r.leds.start, alarm: r.leds.alarm, trip: r.leds.trip, lockout: r.lockout, test: r.test.active, sup: r.startSupervision }
    for (const [k, e] of ledEls) { const c = leds.find((x) => x[0] === k)[2]; e.className = 'led' + (L[k] ? ' ' + c : '') }
    const b = st.breakers[r.breaker]; text(brk, b ? `${b.name}: ${b.tripped ? 'TRIPPED' : b.state}` : 'none'); brk.className = 'tag ' + (b?.tripped ? 'high' : b?.state === 'closed' ? 'dark' : '')
    r.functions.forEach((fn, i) => {
      const tds = rows[i]
      text(tds[2], fn.supported ? f2(fn.ratio) : '-'); text(tds[3], fn.started ? `${Math.round(Math.min(1, fn.acc) * 100)} %` : '')
      text(tds[4], !fn.supported ? 'configured (not simulated)' : !fn.enabled ? 'disabled' : fn.operated ? 'TRIPPED' : fn.started ? 'started' : fn.alarm ? 'alarm' : 'normal')
      tds[4].className = fn.operated ? 'crit' : fn.started || fn.alarm ? 'high' : ''
    })
  }
}

function buildLegacyFront(el, ctx, api) {
  const { sim } = ctx
  const st0 = sim.state
  const r0 = st0.relays[api.relay]
  const fns = r0.functions.filter((f) => f.supported && /^(51|51V|50|50N\/51N|51N|27|59|32|81U)$/.test(f.ansi)).slice(0, 4)
  const grid = h('div', { class: 'grid g4' })
  const ups = fns.map((fn) => {
    const svg = s('svg', { viewBox: '0 0 160 200', role: 'img', 'aria-label': `${fn.ansi} electromechanical relay` })
    svg.append(s('rect', { x: 4, y: 4, width: 152, height: 192, rx: 6, fill: '#2f2a24', stroke: '#111' }), s('rect', { x: 16, y: 16, width: 128, height: 120, rx: 4, fill: '#cfd6d9', opacity: 0.6 }))
    const disc = s('g', {}, s('ellipse', { cx: 80, cy: 78, rx: 52, ry: 14, fill: '#b08d57', stroke: '#5c4a2a' }), s('line', { x1: 28, y1: 78, x2: 132, y2: 78, stroke: '#5c4a2a', 'stroke-width': 3 }))
    const flag = s('rect', { x: 56, y: 146, width: 48, height: 22, fill: '#2f2a24', stroke: '#888' })
    svg.append(disc, flag, s('text', { x: 80, y: 188, 'text-anchor': 'middle', fill: '#fff', 'font-size': 18 }, fn.ansi), s('text', { x: 80, y: 122, 'text-anchor': 'middle', 'font-size': 15 }, 'disc travel'))
    const travel = s('text', { x: 80, y: 105, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700 })
    svg.append(travel)
    grid.append(h('div', { class: 'card' }, h('h3', {}, fn.name), svg, h('div', { class: 'small' }, `${fn.pickupText}, ${fn.curveText}`)))
    let rot = 0
    return (st) => {
      const f = st.relays[api.relay].functions.find((x) => x.ansi === fn.ansi)
      rot = (rot + (f.started ? 25 : 0)) % 360
      disc.setAttribute('transform', `rotate(${f.started ? Math.sin((rot * Math.PI) / 180) * 3 : 0} 80 78)`)
      text(travel, `${Math.round(Math.min(1, f.acc) * 100)} %`)
      flag.setAttribute('fill', f.operated ? '#ffb300' : '#2f2a24')
    }
  })
  el.append(h('div', { class: 'row', style: { marginBottom: '.5em' } }, 'Relay ', relayPicker(ctx, api)),
    h('p', { class: 'note' }, 'Legacy view: a row of single function electromechanical relays. The disc turns while current is above the plug setting and closes the trip contact at full travel; a mechanical flag drops on trip and is reset by hand. No measurements, no event record, no self supervision.'),
    grid, h('div', { class: 'row' }, btn('Reset flags (by hand)', () => sim.command('relay.reset', { relay: api.relay }), 'on')))
  return (st) => ups.forEach((u) => u(st))
}

function buildSettings(el, ctx, api) {
  const { sim } = ctx
  const r = sim.state.relays[api.relay]
  const body = h('tbody')
  for (const fn of r.functions) {
    body.append(h('tr', {}, h('td', {}, fn.ansi), h('td', {}, fn.name), h('td', {}, fn.pickupText), h('td', {}, fn.curveText), h('td', { class: 'small' }, fn.supported ? curveName(fn.curve) : 'shown, not simulated'), h('td', { class: 'small' }, fn.basis),
      h('td', {}, fn.supported ? btn(fn.enabled ? 'Disable' : 'Enable', () => { sim.command('relay.enable', { relay: api.relay, ansi: fn.ansi, enabled: !fn.enabled }); api.select('settings') }) : null)))
  }
  el.append(h('div', { class: 'row', style: { marginBottom: '.5em' } }, 'Relay ', relayPicker(ctx, api), h('span', { class: 'small muted' }, `Protects ${r.protects}. CT ${r.ct_ratio || '-'}, VT ${r.vt_ratio || '-'}`)),
    h('div', { class: 'card' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', {}, 'ANSI'), h('th', {}, 'Function'), h('th', {}, 'Pickup (database)'), h('th', {}, 'Curve or delay (database)'), h('th', {}, 'As simulated'), h('th', {}, 'Basis'), h('th', {}, ''))), body)),
    h('p', { class: 'note' }, 'Settings are REPRESENTATIVE educational values from the project database, not a protection coordination study. Disabling a function shows why settings changes need control and a record (an event is logged).'))
}

function buildCurve(el, ctx, api) {
  const { sim } = ctx
  const r = sim.state.relays[api.relay]
  const fn = r.functions.find((f) => f.curve.kind === 'idmt')
  el.append(h('div', { class: 'row', style: { marginBottom: '.5em' } }, 'Relay ', relayPicker(ctx, api)))
  if (!fn) { el.append(h('p', {}, 'This relay has no inverse time element.')); return null }
  const W = 900, H = 520, L = 80, B = 60, T = 20, R = 20
  const lx = (m) => L + ((W - L - R) * Math.log10(m)) / Math.log10(20)
  const ly = (t) => T + ((H - T - B) * (Math.log10(100) - Math.log10(t))) / (Math.log10(100) - Math.log10(0.01))
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'IDMT curve' })
  for (const m of [1, 1.5, 2, 3, 5, 7, 10, 20]) svg.append(s('line', { x1: lx(m), y1: T, x2: lx(m), y2: H - B, stroke: '#c3c7cc' }), s('text', { x: lx(m), y: H - B + 22, 'text-anchor': 'middle', 'font-size': 16 }, m))
  for (const t of [0.01, 0.1, 1, 10, 100]) svg.append(s('line', { x1: L, y1: ly(t), x2: W - R, y2: ly(t), stroke: '#c3c7cc' }), s('text', { x: L - 8, y: ly(t) + 5, 'text-anchor': 'end', 'font-size': 16 }, t))
  svg.append(s('text', { x: (W + L) / 2, y: H - 12, 'text-anchor': 'middle', 'font-size': 16 }, 'Current as a multiple of the pickup setting (log)'), s('text', { x: 18, y: H / 2, 'font-size': 16, transform: `rotate(-90 18 ${H / 2})`, 'text-anchor': 'middle' }, 'Operate time, s (log)'))
  let d = ''
  for (let m = 1.05; m <= 20; m *= 1.03) { const t = idmtTime(fn.curve.curve, fn.curve.tms, m); if (t > 100 || t < 0.01) continue; d += `${d ? 'L' : 'M'}${lx(m).toFixed(1)} ${ly(t).toFixed(1)} ` }
  svg.append(s('path', { d, fill: 'none', stroke: '#1f2328', 'stroke-width': 3 }))
  const pt = s('circle', { r: 9, fill: '#0b5cad', stroke: '#fff', 'stroke-width': 2 })
  const ptl = s('text', { 'font-size': 16, fill: '#0b5cad', 'font-weight': 700 })
  const results = s('g')
  svg.append(results, pt, ptl)
  el.append(h('div', { class: 'card' }, h('h3', {}, `${fn.ansi} ${fn.name}: ${curveName(fn.curve)}, pickup ${fn.pickupText}`), svg,
    h('p', { class: 'small' }, 'Formula (IEC 60255-151): t = TMS x k / ((I / Is)^a - 1); standard inverse k = 0.14, a = 0.02; very inverse k = 13.5, a = 1; extremely inverse k = 80, a = 2. Blue dot: present load. Squares: injection test results.')))
  return (st) => {
    const R2 = st.relays[api.relay]
    const f = R2.functions.find((x) => x.ansi === fn.ansi)
    const m = Math.max(1.01, Math.min(20, f.ratio || 0.01))
    const live = (f.ratio || 0) > 1
    const t = live ? idmtTime(fn.curve.curve, fn.curve.tms, m) : 100
    pt.setAttribute('cx', lx(Math.max(1, Math.min(20, f.ratio || 1)))); pt.setAttribute('cy', ly(Math.min(100, t)))
    ptl.setAttribute('x', lx(Math.max(1, Math.min(20, f.ratio || 1))) + 14); ptl.setAttribute('y', ly(Math.min(100, t)) - 10)
    text(ptl, live ? `${f2(f.ratio)} x: ${f2(t)} s` : `load ${f2(f.ratio)} x pickup (below setting)`)
    const key = R2.test.results.length + ':' + (R2.test.results[0]?.t || '')
    if (results.getAttribute('data-key') !== key) {
      results.setAttribute('data-key', key)
      while (results.firstChild) results.firstChild.remove()
      for (const res of R2.test.results.filter((x) => x.ansi === fn.ansi)) results.append(s('rect', { x: lx(res.multiple) - 8, y: ly(res.measured) - 8, width: 16, height: 16, fill: res.pass ? '#43494f' : '#c62828' }))
    }
  }
}

function buildTest(el, ctx, api) {
  const { sim } = ctx
  const legacy = api.variant === 'legacy'
  const r0 = sim.state.relays[api.relay]
  const fns = r0.functions.filter((f) => f.supported && f.curve.kind !== 'none' && f.curve.kind !== 'thermal')
  let fnId = (fns.find((f) => f.curve.kind === 'idmt') || fns[0])?.ansi
  let mult = 2
  const exp = h('span', { class: 'big' })
  const body = h('tbody')
  const tm = h('span', { class: 'tag' })
  el.append(h('div', { class: 'row', style: { marginBottom: '.5em' } }, 'Relay ', relayPicker(ctx, api), tm),
    h('div', { class: 'grid g2' },
      h('div', { class: 'card' }, h('h3', {}, 'Secondary injection (educational)'),
        h('p', { class: 'small' }, 'The test block isolates the trip outputs, a test set injects current into the relay and times the trip. The result is compared with the theoretical curve time. ', TEST_TOL.basis),
        h('div', { class: 'row' }, btn('1. Test mode ON', () => sim.command('relay.test', { relay: api.relay, on: true }), 'on', { 'data-act': 'test-on' }), btn('Test mode OFF', () => sim.command('relay.test', { relay: api.relay, on: false }))),
        h('h4', {}, '2. Element'), select(fns.map((f) => [f.ansi, `${f.ansi} ${f.name}`]), fnId, (v) => { fnId = v }),
        h('h4', {}, '3. Injection, multiple of setting'), seg([[1.5, '1.5 x'], [2, '2 x'], [3, '3 x'], [5, '5 x'], [10, '10 x']].map(([a, b]) => [String(a), b]), String(mult), (v) => { mult = Number(v); this_set(v) }, { 'data-seg': 'mult' }),
        h('div', { class: 'row', style: { marginTop: '.5em' } }, btn('4. INJECT', () => sim.command('relay.inject', { relay: api.relay, ansi: fnId, multiple: mult }), 'warn', { 'data-act': 'inject' }), legacy ? btn('Recalibrate disc (legacy)', () => sim.command('relay.calibrate', { relay: api.relay })) : null),
        h('div', { class: 'row', style: { marginTop: '.5em' } }, 'Theoretical operate time ', exp)),
      h('div', { class: 'card' }, h('h3', {}, 'Results'), h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', {}, 'Element'), h('th', {}, 'x'), h('th', {}, 'Expected s'), h('th', {}, 'Measured s'), h('th', {}, 'Error'), h('th', {}, 'Result'), h('th', {}, 'Relay'))), body))))
  const segEl = el.querySelector('[data-seg="mult"]')
  function this_set(v) { segEl && segEl.set && segEl.set(v) }
  return (st) => {
    const r = st.relays[api.relay]
    const fn = r.functions.find((f) => f.ansi === fnId)
    text(tm, r.test.active ? (r.test.inj ? `TEST MODE: injecting ${r.test.inj.multiple} x` : 'TEST MODE: outputs isolated') : 'In service (enable test mode first)'); tm.className = 'tag ' + (r.test.active ? 'high' : '')
    if (fn) text(exp, `${f3(operateTime(fn, mult, { i2pu: (fn.pickup.pu ?? 0.1) * mult }))} s`)
    const key = r.test.results.map((x) => x.t).join()
    if (body.dataset.key !== key) {
      body.dataset.key = key; body.textContent = ''
      for (const x of r.test.results) body.append(h('tr', {}, h('td', {}, x.ansi), h('td', { class: 'n' }, x.multiple), h('td', { class: 'n' }, f3(x.expected)), h('td', { class: 'n' }, f3(x.measured)), h('td', { class: 'n' }, `${f1(x.error_pct)} %`), h('td', {}, h('span', { class: 'tag ' + (x.pass ? 'dark' : 'crit') }, x.pass ? 'PASS' : 'FAIL')), h('td', { class: 'small' }, x.relayType)))
    }
  }
}

function buildRecords(el, ctx, api) {
  const { sim } = ctx
  const legacy = api.variant === 'legacy'
  if (legacy) { el.append(h('p', { class: 'note' }, 'Legacy electromechanical relays keep no event or fault record: only the dropped flag shows that the relay operated.')); return null }
  const ev = h('div', { class: 'small', style: { maxHeight: '24em', overflow: 'auto' } }), fb = h('tbody')
  el.append(h('div', { class: 'row', style: { marginBottom: '.5em' } }, 'Relay ', relayPicker(ctx, api)),
    h('div', { class: 'grid g2' }, h('div', { class: 'card' }, h('h3', {}, 'Event record'), ev), h('div', { class: 'card' }, h('h3', {}, 'Fault records'), h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', {}, 'Time'), h('th', {}, 'Element'), h('th', {}, 'IA A'), h('th', {}, 'IN A'), h('th', {}, 'V kV'), h('th', {}, 'f Hz'), h('th', {}, 'Operate s'))), fb))))
  return (st) => {
    const r = st.relays[api.relay]
    const k1 = r.events.length + ':' + (r.events[0]?.t ?? '')
    if (ev.dataset.key !== k1) { ev.dataset.key = k1; ev.textContent = ''; for (const e of r.events) ev.append(h('div', { class: e.kind === 'trip' ? 'crit' : '' }, h('span', { class: 'muted' }, `t+${f1(e.t)} s `), e.text)) }
    const k2 = r.faults.length + ':' + (r.faults[0]?.t ?? '')
    if (fb.dataset.key !== k2) { fb.dataset.key = k2; fb.textContent = ''; for (const x of r.faults) fb.append(h('tr', {}, h('td', {}, `t+${f1(x.t)}`), h('td', {}, x.ansi), h('td', { class: 'n' }, f0(x.ia)), h('td', { class: 'n' }, f1(x.in)), h('td', { class: 'n' }, f2(x.v)), h('td', { class: 'n' }, f2(x.f)), h('td', { class: 'n' }, f3(x.top)))) }
  }
}

export function renderMini(canvas, ctx) {
  const st = ctx.sim.state
  const r = st.relays[relayFor(ctx)]
  const m = r.meas
  miniFrame(canvas, r.tag, [{ k: 'IA / IB / IC', v: `${f0(m.ia)} / ${f0(m.ib)} / ${f0(m.ic)} A` }, { k: 'V  f', v: `${f2(m.v)} kV  ${f2(m.f)} Hz` }, { k: 'P  Q', v: `${f0(m.p)} kW  ${f0(m.q)} kvar` }, { k: 'Status', v: r.status, alarm: r.leds.trip ? 'critical' : r.leds.start ? 'high' : null }], { legacy: st.variant.S03 === 'legacy' })
}
