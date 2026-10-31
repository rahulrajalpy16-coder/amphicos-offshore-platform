// S05 ICSS: process overview, PCS loop faceplates, ESD hierarchy and shutdown valves, F&G zones with
// voting, cause and effect matrix, plant wide alarm list (acknowledge, shelve) and system health.
import { createFrame, h, s, btn, seg, kv, bar, text, f0, f1, f2, miniFrame, alarmTable, sevCls } from './common/ui.js'
import { ESD_LEVELS } from '../sim/icss.js'

export const meta = { id: 'icss', title: 'ICSS operator station', systems: ['S05'], kind: 'hmi' }

export function mount(container, ctx) {
  const fr = createFrame(container, ctx, {
    moduleId: 'icss', systemId: 'S05', title: 'ICSS: integrated control and safety system',
    help: 'The ICSS is the main control system of the FPSO: the process control system keeps pressures, levels and temperatures at their set points, the emergency shutdown system closes valves when limits are exceeded, and the fire and gas system watches detectors and starts alarms. Everything here is linked to the other simulated systems.',
    alarmSystems: ['S05'],
    status: (st, api) => [st.icss.esd.level ? `${st.icss.esd.level} ACTIVE` : st.icss.degraded ? 'Degraded redundancy' : 'Normal operation', st.icss.esd.level ? 'crit' : st.icss.degraded ? 'high' : ''],
    tabs: [
      { id: 'overview', label: 'Overview', build: (el, api) => buildOverview(el, ctx, api) },
      { id: 'loops', label: 'Process loops', build: (el) => buildLoops(el, ctx) },
      { id: 'esd', label: 'ESD', build: (el) => buildEsd(el, ctx) },
      { id: 'fg', label: 'Fire and gas', build: (el) => buildFg(el, ctx) },
      { id: 'ce', label: 'Cause and effect', build: (el) => buildCe(el, ctx) },
      { id: 'alarms', label: 'Alarm list', build: (el) => buildAlarms(el, ctx) },
      { id: 'health', label: 'System health', build: (el) => buildHealth(el, ctx) },
    ],
  })
  return { unmount: () => fr.destroy(), setVariant: (v) => fr.setVariant(v), frame: fr }
}

function buildOverview(el, ctx, api) {
  const { sim } = ctx
  const legacy = api.variant === 'legacy'
  const C = legacy ? { bg: '#000000', ink: '#00ff66', line: '#00ccff', vessel: '#ff00ff', valveOpen: '#00ff00', valveShut: '#ff0000' } : { bg: '#eceef0', ink: '#1f2328', line: '#6b7178', vessel: '#9aa0a6', valveOpen: '#ffffff', valveShut: '#43494f' }
  const svg = s('svg', { viewBox: '0 0 1200 520', role: 'img', 'aria-label': 'Process overview', style: { background: C.bg, border: '1px solid #8a8f96' } })
  const T = (x, y, t, o = {}) => { const e = s('text', { x, y, 'font-size': o.fs || 17, fill: o.fill || C.ink, 'text-anchor': o.a || 'start', 'font-weight': o.w || 400 }, t); svg.append(e); return e }
  const pipe = (pts) => svg.append(s('polyline', { points: pts, fill: 'none', stroke: C.line, 'stroke-width': 5 }))
  pipe('40,200 300,200'); pipe('520,200 640,200 640,120 760,120'); pipe('520,260 640,260 640,360 760,360'); pipe('860,120 1000,120'); pipe('860,360 1000,360')
  T(40, 180, 'Riser / turret', { w: 700 })
  const valve = (x, y, tag) => { const g = s('g', {}, s('path', { d: `M${x - 18} ${y - 14} L${x + 18} ${y + 14} L${x + 18} ${y - 14} L${x - 18} ${y + 14} Z`, stroke: C.ink, 'stroke-width': 2 })); svg.append(g); T(x, y - 22, tag, { a: 'middle', fs: 15 }); return g.firstChild }
  const vIn = valve(220, 200, 'SDV-1001'), vExp = valve(940, 360, 'SDV-1002'), vLiq = valve(700, 360, 'SDV-1301')
  svg.append(s('rect', { x: 300, y: 150, width: 220, height: 140, rx: 60, fill: C.vessel, stroke: C.ink, 'stroke-width': 3 }))
  const lvl = s('rect', { x: 302, y: 220, width: 216, height: 68, fill: legacy ? '#ffff00' : '#6b7178', opacity: 0.7 })
  svg.append(lvl)
  T(410, 140, 'HP separator', { a: 'middle', w: 700 })
  const tPT = T(330, 320, ''), tLT = T(330, 345, '')
  svg.append(s('rect', { x: 760, y: 80, width: 100, height: 80, fill: C.vessel, stroke: C.ink, 'stroke-width': 3 })); T(810, 70, 'Gas compression', { a: 'middle', w: 700 }); const tTT = T(770, 190, '')
  svg.append(s('rect', { x: 760, y: 320, width: 100, height: 80, fill: C.vessel, stroke: C.ink, 'stroke-width': 3 })); T(810, 312, 'Crude heater', { a: 'middle', w: 700 }); const tTIC = T(770, 425, '')
  T(1010, 125, 'to gas treatment'); T(1010, 365, 'to cargo tanks')
  // utility status panel
  const util = kv([['Power (PMS)', '', 'pms'], ['Boilers (steam)', '', 'blr'], ['IGG', '', 'igg'], ['Cargo pumps', '', 'cp'], ['PAGA', '', 'paga'], ['OMD', '', 'omd']])
  const esd = h('div', { class: 'big' })
  el.append(h('div', { class: 'grid', style: { gridTemplateColumns: 'minmax(0,3fr) minmax(15em,1fr)' } },
    h('div', { class: 'card' }, svg, legacy ? h('p', { class: 'note' }, 'Legacy console style: saturated colours everywhere, so a real abnormal state does not stand out. The migrated high performance display uses grey and keeps colour for abnormal conditions only.') : null),
    h('div', { class: 'card' }, h('h3', {}, 'ESD level'), esd, h('h3', {}, 'Interfaced systems'), util.el)))
  return (st) => {
    const X = st.icss
    const sdv = (t) => X.sdv.find((v) => v.tag === t)
    for (const [e, t] of [[vIn, 'SDV-1001'], [vExp, 'SDV-1002'], [vLiq, 'SDV-1301']]) e.setAttribute('fill', sdv(t).open ? C.valveOpen : C.valveShut)
    const L = X.loops
    const pic = L.find((l) => l.tag === 'PIC-1001'), lic = L.find((l) => l.tag === 'LIC-1002'), tic = L.find((l) => l.tag === 'TIC-2001'), tic2 = L.find((l) => l.tag === 'TIC-1201')
    lvl.setAttribute('y', 290 - (136 * lic.pv) / 100); lvl.setAttribute('height', (136 * lic.pv) / 100)
    text(tPT, `PT-1001 ${f1(pic.pv)} ${pic.unit}`); tPT.setAttribute('fill', pic.alarm ? '#c62828' : C.ink)
    text(tLT, `LT-1002 ${f0(lic.pv)} ${lic.unit}`); tLT.setAttribute('fill', lic.alarm ? '#c62828' : C.ink)
    text(tTT, `TT-2001 ${f0(tic.pv)} ${tic.unit}`); text(tTIC, `TT-1201 ${f0(tic2.pv)} ${tic2.unit}`)
    text(esd, X.esd.level ? ESD_LEVELS.find((e) => e.id === X.esd.level).name : 'None active'); esd.className = 'big ' + (X.esd.level ? 'crit' : '')
    util.set('pms', `${st.pms.online} sets, ${f0(st.pms.load_pct)} %`, st.pms.blackout.active ? 'crit' : '')
    util.set('blr', st.boilers.map((b) => `${b.tag} ${b.status}`).join(', '), st.boilers.some((b) => b.bms === 'lockout') ? 'high' : '')
    util.set('igg', `${st.igg.label}, O2 ${f1(st.igg.o2_reading)} %`, st.igg.state === 'shutdown' ? 'high' : '')
    util.set('cp', Object.values(st.drives).filter((d) => d.kind === 'cargo').map((d) => `${d.tag} ${f0(d.speed)} %`).join(', '))
    util.set('paga', st.paga.status, st.paga.mode === 'tone' ? 'high' : ''); util.set('omd', Object.values(st.omd).some((o) => o.alarm) ? 'ALARM' : 'normal', Object.values(st.omd).some((o) => o.alarm) ? 'crit' : '')
  }
}

function buildLoops(el, ctx) {
  const { sim } = ctx
  const grid = h('div', { class: 'grid g4' })
  el.append(grid, h('p', { class: 'note' }, 'Faceplates: PV is the measured value, SP the set point, OUT the controller output to the valve. In MANUAL the operator sets the output directly. Set points and limits follow the database measurements (REPRESENTATIVE).'))
  const ups = sim.state.icss.loops.map((L0) => {
    const tag = L0.tag
    const pv = h('div', { class: 'big' }), alarm = h('span', { class: 'tag' })
    const pvBar = bar(L0.range[1], L0.hh ?? null), outBar = bar(100)
    const K = kv([['SP', L0.unit, 'sp'], ['OUT', '%', 'out'], ['Mode', '', 'mode'], ['Limits', '', 'lim']])
    const mode = seg([['AUTO', 'AUTO'], ['MAN', 'MAN']], L0.pid.mode, (m) => sim.command('icss.mode', { tag, mode: m }))
    grid.append(h('div', { class: 'card', 'data-loop': tag }, h('h3', {}, tag, alarm), h('div', { class: 'small' }, L0.name), pv, pvBar.el, K.el, h('div', { class: 'small muted' }, 'Output'), outBar.el,
      h('div', { class: 'row' }, mode), h('div', { class: 'row' }, btn('SP -', () => sim.command('icss.sp', { tag, sp: sim.state.icss.loops.find((l) => l.tag === tag).sp - (L0.range[1] / 50) })), btn('SP +', () => sim.command('icss.sp', { tag, sp: sim.state.icss.loops.find((l) => l.tag === tag).sp + (L0.range[1] / 50) }), '', { 'data-act': `sp-up-${tag}` }), btn('OUT -', () => sim.command('icss.out', { tag, out: sim.state.icss.loops.find((l) => l.tag === tag).pid.out - 5 })), btn('OUT +', () => sim.command('icss.out', { tag, out: sim.state.icss.loops.find((l) => l.tag === tag).pid.out + 5 }))),
      h('div', { class: 'row' }, btn('Field fault', () => sim.command('icss.field_fault', { tag, on: true })), btn('Clear', () => sim.command('icss.field_fault', { tag, on: false })))))
    return (st) => {
      const L = st.icss.loops.find((l) => l.tag === tag)
      text(pv, `${L.pvTag} ${L.fieldFault ? 'BAD' : f1(L.pv)} ${L.unit}`); pv.className = 'big ' + (L.alarm ? (L.alarm.length === 2 || L.alarm === 'BAD PV' ? 'crit' : 'high') : '')
      text(alarm, L.alarm || 'normal'); alarm.className = 'tag ' + (L.alarm ? 'high' : '')
      pvBar.set(L.pv, L.alarm ? 'high' : null); outBar.set(L.out)
      K.set('sp', f1(L.sp)); K.set('out', f0(L.out)); K.set('mode', L.pid.mode, L.pid.mode !== 'AUTO' ? 'high' : ''); K.set('lim', [L.ll != null ? `LL ${L.ll}` : '', L.lo != null ? `L ${L.lo}` : '', L.hi != null ? `H ${L.hi}` : '', L.hh != null ? `HH ${L.hh}` : ''].filter(Boolean).join(' '))
      mode.set(L.pid.mode)
    }
  })
  return (st) => ups.forEach((u) => u(st))
}

function buildEsd(el, ctx) {
  const { sim } = ctx
  const lv = h('div', { class: 'grid' }), sdvBody = h('tbody')
  el.append(h('div', { class: 'grid g2' },
    h('div', { class: 'card' }, h('h3', {}, 'ESD hierarchy (concept)'), lv,
      h('div', { class: 'row', style: { marginTop: '.5em' } }, btn('Manual ESD-2', () => sim.command('icss.manual', { cause: 'C_MAN_ESD2' }), 'warn'), btn('Manual ESD-1', () => sim.command('icss.manual', { cause: 'C_MAN_ESD1' }), 'warn', { 'data-act': 'esd1' }), btn('Manual APS', () => sim.command('icss.manual', { cause: 'C_MAN_APS' }), 'warn'), btn('ESD reset', () => sim.command('icss.esd_reset'), 'on'))),
    h('div', { class: 'card' }, h('h3', {}, 'Shutdown and blowdown valves'), h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', {}, 'Tag'), h('th', {}, 'Service'), h('th', {}, 'Closed by'), h('th', {}, 'Position'))), sdvBody))),
  h('p', { class: 'note' }, 'Representative hierarchy for education. A higher level includes the actions of the lower levels. The real ESD philosophy, levels and valve lists come from the project safety documents.'))
  const lvEls = ESD_LEVELS.map((L) => { const e = h('div', { class: 'card' }, h('b', {}, L.name), h('div', { class: 'small' }, L.desc)); lv.append(e); return [L.id, e] })
  const rows = sim.state.icss.sdv.map((v) => { const pos = h('td', {}); sdvBody.append(h('tr', {}, h('td', {}, v.tag), h('td', {}, v.name), h('td', { class: 'small' }, v.levels.join(', ')), pos)); return pos })
  return (st) => {
    for (const [id, e] of lvEls) { const on = !!st.icss.esd.active[id]; e.style.background = on ? '#c62828' : ''; e.style.color = on ? '#fff' : '' }
    st.icss.sdv.forEach((v, i) => { const shut = v.normalOpen === false ? v.open : !v.open; text(rows[i], v.normalOpen === false ? (v.open ? 'OPEN (blowdown)' : 'closed') : v.open ? 'open' : 'CLOSED'); rows[i].className = shut ? 'high' : '' })
  }
}

function buildFg(el, ctx) {
  const { sim } = ctx
  const grid = h('div', { class: 'grid g3' })
  el.append(grid, h('p', { class: 'note' }, 'Voting: one detector in alarm warns the operator; two in the same voting group (for example 2oo3) confirm the event and start the executive actions in the cause and effect matrix. Gas detectors read % LEL with low and high levels from the database. Inhibiting a zone blocks its actions: a bypass must be controlled.'))
  const st0 = sim.state
  const ups = st0.icss.fg.zones.map((z) => {
    const dets = st0.icss.fg.detectors.filter((d) => d.zone === z.id)
    const stt = h('span', { class: 'tag' })
    const rows = dets.map((d) => {
      const b = bar(100, d.lim ? d.lim.high : 50)
      const val = h('span', { class: 'small' })
      const row = h('div', { class: 'row', 'data-det': d.id }, h('span', { style: { minWidth: '6.5em' } }, d.id), h('div', { class: 'flex1' }, b.el), val,
        d.type === 'GD' ? btn('Gas', () => sim.command('icss.detector', { id: d.id, ramp: 6 }), '', { 'data-act': `gas-${d.id}` }) : btn('Alarm', () => sim.command('icss.detector', { id: d.id, value: 100 })),
        btn('Clear', () => sim.command('icss.detector', { id: d.id, value: 0, ramp: 0, fault: false })))
      return [d.id, b, val, row]
    })
    const inh = btn('Inhibit zone', () => sim.command('icss.inhibit', { zone: z.id, on: !sim.state.icss.fg.zones.find((x) => x.id === z.id).inhibited }))
    grid.append(h('div', { class: 'card' }, h('h3', {}, z.name, stt), h('div', { class: 'small muted' }, `Voting ${z.voting}`), ...rows.map((r) => r[3]), h('div', { class: 'row' }, inh)))
    return (st) => {
      const Z = st.icss.fg.zones.find((x) => x.id === z.id)
      text(stt, Z.state); stt.className = 'tag ' + (Z.confirmed ? 'crit' : Z.count ? 'high' : Z.inhibited ? 'low' : '')
      text(inh, Z.inhibited ? 'Remove inhibit' : 'Inhibit zone')
      for (const [id, b, val] of rows) { const d = st.icss.fg.detectors.find((x) => x.id === id); b.set(d.value, d.state === 'high' || d.state === 'alarm' ? 'crit' : d.state === 'low' ? 'high' : null); text(val, d.fault ? 'FAULT' : d.type === 'GD' ? `${f0(d.value)} % LEL` : d.state) }
    }
  })
  return (st) => ups.forEach((u) => u(st))
}

function buildCe(el, ctx) {
  const { sim } = ctx
  const ce = sim.state.icss.ce
  const head = h('tr', {}, h('th', {}, 'Cause'), ...ce.effects.map((e) => h('th', { class: 'small', style: { writingMode: 'vertical-rl', transform: 'rotate(180deg)', maxHeight: '11em' } }, e.name)))
  const body = h('tbody')
  const cells = ce.causes.map((c) => { const tds = ce.effects.map((e) => h('td', { style: { textAlign: 'center', fontWeight: 700 } }, c.effects.includes(e.id) ? 'X' : '')); const name = h('td', {}, c.name); body.append(h('tr', {}, name, ...tds)); return [c, name, tds] })
  el.append(h('div', { class: 'card', style: { overflow: 'auto' } }, h('table', { class: 't' }, h('thead', {}, head), body)), h('p', { class: 'note' }, 'Representative cause and effect matrix for the simulation. Highlighted rows are active causes (latched until ESD reset); highlighted cells are effects that have been executed.'))
  return (st) => {
    const C = st.icss.ce
    for (const [c, name, tds] of cells) {
      const act = !!C.active[c.id]
      name.className = act ? 'crit' : ''
      c.effects.forEach(() => {})
      tds.forEach((td, i) => { const e = C.effects[i]; td.className = act && c.effects.includes(e.id) && C.fired[e.id] ? 'crit' : '' })
    }
  }
}

function buildAlarms(el, ctx) {
  const { sim } = ctx
  let filt = 'all'
  const sysIds = sim.state.alarms.length ? null : null
  void sysIds
  const f = seg([['all', 'All systems'], ['crit', 'Critical'], ['S05', 'ICSS only']], filt, (v) => { filt = v; f.set(v) })
  const box = h('div', {})
  el.append(h('div', { class: 'row', style: { marginBottom: '.4em' } }, f, h('span', { class: 'small muted' }, 'Plant wide alarm list: every simulated system reports here. Shelving removes a nuisance alarm from view for 10 minutes and is logged.')), box)
  const up = alarmTable(box, ctx, (a) => (filt === 'all' ? true : filt === 'crit' ? a.severity === 'critical' : a.systemId === filt), { shelve: true, max: 80 })
  return (st) => up(st)
}

function buildHealth(el, ctx) {
  const { sim } = ctx
  const body = h('tbody')
  const items = sim.state.icss.health.items
  const rows = items.map((it) => { const stt = h('td', {}); body.append(h('tr', {}, h('td', {}, it.group), h('td', {}, it.name), stt, h('td', {}, btn('Fail', () => sim.command('icss.health', { id: it.id, state: 'failed' })), btn('Restore', () => sim.command('icss.health', { id: it.id, state: 'ok' }))))); return stt })
  el.append(h('div', { class: 'card' }, h('h3', {}, 'Controllers, I/O, network and stations'), h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', {}, 'Group'), h('th', {}, 'Item'), h('th', {}, 'State'), h('th', {}, 'Test'))), body)),
    h('p', { class: 'note' }, 'Redundant controller pairs switch over automatically when the primary fails; the system keeps running but redundancy is lost until repair.'))
  return (st) => st.icss.health.items.forEach((it, i) => { text(rows[i], it.state); rows[i].className = it.state === 'failed' ? 'crit' : it.state === 'backup' ? 'muted' : '' })
}

export function renderMini(canvas, ctx) {
  const st = ctx.sim.state
  const L = st.icss.loops
  const n = st.alarms.filter((a) => a.active).length
  miniFrame(canvas, 'ICSS', [{ k: 'ESD', v: st.icss.esd.level || 'none', alarm: st.icss.esd.level ? 'critical' : null }, ...L.slice(0, 3).map((l) => ({ k: l.pvTag, v: `${f1(l.pv)} ${l.unit}`, alarm: l.alarm ? 'high' : null })), { k: 'Active alarms', v: String(n), alarm: n ? 'high' : null }], { legacy: st.variant.S05 === 'legacy' })
}
