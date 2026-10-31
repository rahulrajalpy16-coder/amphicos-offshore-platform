// S01 DG control retrofit: generator control panels (live view of the same DGs as the PMS), legacy hardwired
// relay logic ladder versus modern generator controller, I/O list concept and migration steps.
import { createFrame, h, s, btn, seg, kv, bar, text, f0, f1, f2, meter, miniFrame, eventList } from './common/ui.js'
import { genView } from './common/views.js'

export const meta = { id: 'dgctrl', title: 'DG Control Retrofit', systems: ['S01'], kind: 'hmi' }
export function snapshot(ctx, id) { return genView(ctx.sim.state, id || ctx.sim.state.genOrder[0]) }

const pickGen = (ctx) => {
  const st = ctx.sim.state
  const c = (ctx.db.components || []).find((x) => x.id === ctx.componentId)
  const byLink = st.genOrder.find((id) => st.gens[id].links?.gcp === ctx.componentId)
  const byTag = c && /(\d)/.exec(c.tag || c.id) ? `G${/(\d)/.exec(c.tag || c.id)[1]}` : null
  return byLink || (st.gens[byTag] ? byTag : st.genOrder[0])
}

export function mount(container, ctx) {
  const { sim } = ctx
  const fr = createFrame(container, ctx, {
    moduleId: 'dgctrl', systemId: 'S01', title: 'Generator control panels (DG control retrofit)',
    help: 'Each diesel generator has a control panel that starts and stops the set, synchronises it and shares load with the others. Older ships use relay logic and analogue modules; a retrofit uses a digital generator controller networked to the PMS. The live values are the same generators shown on the PMS screens.',
    alarmSystems: ['S01', 'S12', 'S15', 'S14'],
    init: (api) => { api.gen = pickGen(ctx) },
    status: (st, api) => { const n = st.genOrder.filter((id) => st.gens[id].online).length; return [`${n} sets on load`, ''] },
    tabs: [
      { id: 'panels', label: 'Generator panels', build: (el, api) => buildPanels(el, ctx, api) },
      { id: 'logic', label: 'Start logic', build: (el, api) => buildLogic(el, ctx, api) },
      { id: 'io', label: 'I/O list concept', build: (el, api) => buildIO(el, ctx, api) },
      { id: 'migration', label: 'Migration steps', build: (el) => buildMigration(el, ctx) },
    ],
  })
  return { unmount: () => fr.destroy(), setVariant: (v) => fr.setVariant(v), frame: fr }
}

const SEQ = [['stopped', 'Stopped'], ['prelube', 'Pre-lube'], ['cranking', 'Cranking'], ['accelerating', 'Accelerating'], ['ready', 'Ready to sync'], ['sync', 'Synchronising'], ['online', 'On load'], ['cooldown', 'Cooling down']]
function seqIndex(st, g) {
  if (g.online) return 6
  if (st.sync.active && st.sync.gen === g.id) return 5
  if (g.engine === 'running') return 4
  const i = SEQ.findIndex(([k]) => k === g.engine)
  return i < 0 ? 0 : i
}

function buildPanels(el, ctx, api) {
  const { sim } = ctx
  const legacy = api.variant === 'legacy'
  const st0 = sim.state
  const grid = h('div', { class: `grid g${Math.min(3, st0.genOrder.length)}` })
  el.append(grid)
  const ups = st0.genOrder.map((id) => {
    const seqEl = h('div', { class: 'row small' })
    const steps = SEQ.map(([, l]) => { const t = h('span', { class: 'tag' }, l); seqEl.append(t); return t })
    const K = kv([['kW (share)', '', 'kw'], ['kvar (share)', '', 'kvar'], ['Frequency', 'Hz', 'hz'], ['Voltage', 'kV', 'kv'], ['Speed control', '', 'gov'], ['Voltage control', '', 'avr'], ['PMS link', '', 'link'], ['Control location', '', 'loc']])
    const kwBar = bar(110, 100), kvBar = bar(110, 100)
    const meters = legacy ? [meter('kW', '', 0, 3600, 3000), meter('Hz', '', 55, 65), meter('A', '', 0, 400, 328)] : null
    const lamps = legacy ? h('div', { class: 'row' }, ...['RUNNING', 'BRK CLOSED', 'ALARM', 'SHUTDOWN'].map((n) => h('span', { class: 'row small' }, h('span', { class: 'led', 'data-lamp': n }), n))) : null
    const card = h('div', { class: 'card', 'data-gen': id },
      h('h3', {}, `${id} generator control panel`, h('span', { class: 'tag' }, legacy ? 'relay logic and meters' : 'digital controller')),
      legacy ? h('div', { class: 'grid g3' }, ...meters) : h('div', {}, h('div', { class: 'small muted' }, 'kW share'), kwBar.el, h('div', { class: 'small muted' }, 'kvar share'), kvBar.el),
      legacy ? lamps : seqEl, K.el,
      h('div', { class: 'row' }, btn('START', () => sim.command('gen.start', { id, by: `GCP ${id}` }), '', { 'data-act': `gcp-start-${id}` }), btn('STOP', () => sim.command('gen.stop', { id, by: `GCP ${id}` })), btn('RESET', () => sim.command('gen.reset', { id })),
        legacy ? null : btn('Auto sync', () => sim.command('sync.select', { gen: id, mode: 'auto' })),
        legacy ? null : seg([['isoch', 'ISOCH'], ['droop', 'DROOP']], st0.gens[id].gov.mode, (m) => sim.command('gov.mode', { id, mode: m }), { 'data-seg': `gov-${id}` })))
    grid.append(card)
    return (st) => {
      const g = st.gens[id], v = genView(st, id)
      const on = st.genOrder.filter((x) => st.gens[x].online)
      const avg = on.length ? on.reduce((a, x) => a + st.gens[x].p_kw / st.gens[x].rating_kw, 0) / on.length : 0
      K.set('kw', `${f0(v.kw)} kW (${f0(v.loadPct)} %)`, g.kwShareDev ? 'high' : ''); K.set('kvar', `${f0(v.kvar)} kvar`, g.kvarShareDev ? 'high' : '')
      K.set('hz', f2(v.hz)); K.set('kv', f2(v.kv)); K.set('gov', v.govMode === 'isoch' ? 'isochronous load sharing' : `droop ${f1(v.droopPct)} %`); K.set('avr', v.avrMode === 'auto' ? `AVR auto, droop ${f1(v.qDroopPct)} %` : 'field current (FCR)')
      K.set('link', legacy ? 'hardwired signals only' : g.faults.gcp_comm ? 'COMMUNICATION LOST' : 'networked (status, kW, commands)', g.faults.gcp_comm ? 'crit' : '')
      K.set('loc', v.control.toUpperCase(), v.control === 'local' ? 'high' : '')
      kwBar.set(v.loadPct, g.kwShareDev ? 'high' : null); kvBar.set((100 * v.kvar) / g.rating_kva / 0.75, g.kvarShareDev ? 'high' : null)
      if (meters) { meters[0].set(v.kw); meters[1].set(v.hz); meters[2].set(v.a); const L = (n, c) => { const e = lamps.querySelector(`[data-lamp="${n}"]`); e.className = 'led' + (c ? ' ' + c : '') }; L('RUNNING', ['running', 'accelerating', 'cooldown'].includes(g.engine) ? 'green' : ''); L('BRK CLOSED', g.online ? 'red' : ''); L('ALARM', g.kwShareDev || g.lockout ? 'amber' : ''); L('SHUTDOWN', g.engine === 'shutdown' ? 'red' : '') }
      else { const i = seqIndex(st, g); steps.forEach((t, k) => { t.className = 'tag' + (k === i ? ' dark' : '') }) }
      void avg
    }
  })
  const ev = h('div', { class: 'card' }, h('h3', {}, legacy ? 'Indication (legacy: lamps only, no log)' : 'Controller event log'))
  el.append(ev)
  const ue = legacy ? null : eventList(ev, (e) => ['S01', 'S12'].includes(e.systemId), 20)
  return (st) => { ups.forEach((u) => u(st)); ue && ue(st) }
}

// relay ladder (legacy) vs controller sequence (retrofit) driven by the live state of one set
function buildLogic(el, ctx, api) {
  const { sim } = ctx
  const legacy = api.variant === 'legacy'
  let id = api.gen || sim.state.genOrder[0]
  const pick = seg(sim.state.genOrder.map((g) => [g, g]), id, (v) => { id = v; pick.set(v) })
  const rungs = [
    ['K1 START', 'Start push button or PMS start contact, AND no shutdown, AND remote selected', (g) => ['prelube', 'cranking', 'accelerating', 'running'].includes(g.engine)],
    ['K2 PRELUBE', 'K1 AND lube oil pressure below start level', (g) => g.engine === 'prelube'],
    ['K3 CRANK (air start valve)', 'K1 AND prelube complete AND speed below firing speed', (g) => g.engine === 'cranking'],
    ['K4 FUEL ON', 'K1 AND no shutdown relay K9', (g) => ['cranking', 'accelerating', 'running', 'cooldown'].includes(g.engine) && !g.faults.gov_actuator],
    ['K5 RUNNING', 'Speed relay above 90 % rated', (g) => g.speed_rpm > 0.9 * g.rpm_rated],
    ['K6 EXCITATION', 'K5 (field flashing then AVR)', (g) => g.avr.excitation],
    ['K7 READY TO SYNC', 'K5 AND voltage and frequency inside band', (g) => g.ready],
    ['K8 BREAKER CLOSE', 'K7 AND check-sync 25 OR dead bus', (g) => g.online],
    ['K9 SHUTDOWN (latched)', 'Overspeed OR low LO pressure OR high HT temperature OR OMD high OR emergency stop', (g) => g.engine === 'shutdown'],
  ]
  const svg = s('svg', { viewBox: `0 0 1100 ${rungs.length * 62 + 20}`, role: 'img', 'aria-label': legacy ? 'Relay ladder logic' : 'Controller sequence', style: { maxWidth: '1250px' } })
  const rows = rungs.map(([coil, cond], i) => {
    const y = 30 + i * 62
    svg.append(s('line', { x1: 20, y1: 0, x2: 20, y2: rungs.length * 62 + 20, stroke: '#2b3036', 'stroke-width': 4 }), s('line', { x1: 1080, y1: 0, x2: 1080, y2: rungs.length * 62 + 20, stroke: '#2b3036', 'stroke-width': 4 }))
    const ln = s('line', { x1: 20, y1: y, x2: 1080, y2: y, 'stroke-width': 3 })
    const contact = s('g', {}, s('line', { x1: 120, y1: y - 16, x2: 120, y2: y + 16, stroke: '#2b3036', 'stroke-width': 3 }), s('line', { x1: 150, y1: y - 16, x2: 150, y2: y + 16, stroke: '#2b3036', 'stroke-width': 3 }))
    const coilC = s('circle', { cx: 960, cy: y, r: 20, 'stroke-width': 3, stroke: '#2b3036' })
    svg.append(ln, s('rect', { x: 110, y: y - 18, width: 50, height: 36, fill: '#eceef0', stroke: 'none' }), contact, coilC,
      s('text', { x: 180, y: y - 9, 'font-size': 16 }, cond), s('text', { x: 925, y: y - 9, 'font-size': 16, 'font-weight': 700, 'text-anchor': 'end' }, legacy ? coil : coil.replace(/^K\d+ /, '')))
    return { ln, coilC }
  })
  el.append(h('div', { class: 'card' }, h('h3', {}, legacy ? 'Legacy hardwired start and stop logic (relay ladder)' : 'Retrofit: same functions as configurable controller logic', pick), svg,
    h('p', { class: 'note' }, legacy ? 'Every function is a relay and a wire: fault finding means tracing contacts with a meter, and changes mean rewiring. A dark rung is energised for the selected set right now.' : 'In a digital generator controller the same permissives are configured logic with time stamped events, diagnostics and a network link to the PMS. Dark steps are active now.')))
  return (st) => {
    const g = st.gens[id]
    rows.forEach((r, i) => { const on = rungs[i][2](g); r.ln.setAttribute('stroke', on ? '#2b3036' : '#b5b9be'); r.coilC.setAttribute('fill', on ? (i === 8 ? '#c62828' : '#43494f') : '#ffffff') })
  }
}

function buildIO(el, ctx, api) {
  const legacy = api.variant === 'legacy'
  const rows = [
    ['Start / stop command', 'DI from PMS relay contact', 'network command from PMS (plus hardwired emergency stop)'],
    ['Running, ready, shutdown status', '3 DO lamps and relay contacts', 'network status word'],
    ['kW, kvar, current', 'transducers 4-20 mA to analogue meters', 'controller measurement, sent on the network'],
    ['Speed bias to governor', 'raise / lower relay pulses', 'analogue or network bias, closed loop kW sharing'],
    ['Voltage bias to AVR', 'raise / lower relay pulses', 'analogue or network bias, kvar sharing'],
    ['Synchronising', 'separate synchroniser and check-sync relay', 'integrated auto synchroniser plus check-sync relay kept'],
    ['Breaker close / trip', 'hardwired', 'hardwired (kept for safety), status also on the network'],
    ['Alarms', 'individual lamps per alarm', 'time stamped alarm and event log'],
    ['Engine safety shutdowns', 'hardwired to the shutdown relay', 'kept hardwired and independent (no change in principle)'],
  ]
  el.append(h('div', { class: 'card' }, h('h3', {}, 'I/O list concept: what changes in a retrofit'),
    h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', {}, 'Signal'), h('th', {}, 'Legacy'), h('th', {}, 'Retrofit'))), h('tbody', {}, ...rows.map((r) => h('tr', {}, h('td', {}, r[0]), h('td', { style: { fontWeight: legacy ? 700 : 400 } }, r[1]), h('td', { style: { fontWeight: legacy ? 400 : 700 } }, r[2]))))),
    h('p', { class: 'note' }, 'Concept only, not a project I/O schedule. Safety related trips stay hardwired; the actual split is defined in the project design and class approval.')))
}

function buildMigration(el, ctx) {
  const sys = (ctx.db.systems || []).find((x) => x.id === 'S01')
  const seq = sys?.retrofit?.typical_sequence || []
  el.append(h('div', { class: 'grid g2' },
    h('div', { class: 'card' }, h('h3', {}, 'Typical migration sequence (database)'), h('ol', {}, ...seq.map((x) => h('li', {}, x)))),
    h('div', { class: 'card' }, h('h3', {}, 'One set at a time'), h('p', {}, 'Sets are normally converted one at a time while the others keep the plant on line. During the change the PMS treats the set under conversion as not available, so the remaining sets and standby cover the load.'),
      h('div', { class: 'row' }, btn('Show the PMS reaction: take G3 out of service', () => ctx.sim.command('fault.inject', { target: 'G3', kind: 'gcp_comm' })), btn('Return G3', () => ctx.sim.command('fault.clear', { target: 'G3', kind: 'gcp_comm' }))))))
}

export function renderMini(canvas, ctx) {
  const st = ctx.sim.state
  const id = pickGen(ctx)
  const v = genView(st, id)
  miniFrame(canvas, `GCP ${id}`, [{ k: 'Status', v: v.status, alarm: v.engine === 'shutdown' ? 'critical' : null }, { k: 'Power', v: `${f0(v.kw)} kW` }, { k: 'Frequency', v: `${f2(v.hz)} Hz` }, { k: 'Voltage', v: `${f2(v.kv)} kV` }, { k: 'Sharing', v: st.gens[id].kwShareDev ? 'DEVIATION' : 'OK', alarm: st.gens[id].kwShareDev ? 'high' : null }], { legacy: st.variant.S01 === 'legacy' })
}
