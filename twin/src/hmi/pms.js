// S02 Power Management System HMI: live single-line diagram, generators, load management (priority,
// heavy consumers, load shedding), synchroniser, trends, alarms and event log, legacy hardwired view.
import { createFrame, h, s, btn, seg, kv, bar, text, f0, f1, f2, drawTrend, meter, alarmTable, eventList, miniFrame, sevCls } from './common/ui.js'
import { genView, plantView, shortName } from './common/views.js'

export const meta = { id: 'pms', title: 'Power Management System', systems: ['S02'], kind: 'hmi' }

export function snapshot(ctx) {
  const st = ctx.sim.state
  return { gens: Object.fromEntries(st.genOrder.map((id) => [id, genView(st, id)])), plant: plantView(st) }
}

export function mount(container, ctx) {
  const { sim } = ctx
  const fr = createFrame(container, ctx, {
    moduleId: 'pms', systemId: 'S02', title: 'Power Management System (PMS)',
    help: 'The PMS decides how many diesel generators run, shares the load between them, starts a standby set when load rises, sheds unimportant consumers if a set trips and restores power after a blackout. Dark lines are energised, dashed lines are dead. Filled squares are closed breakers.',
    alarmSystems: ['S02', 'S01', 'S03'],
    status: (st, api) => [st.pms.status + (st.pms.message !== 'Normal' ? `: ${st.pms.message}` : ''), st.pms.blackout.active ? 'crit' : st.pms.message !== 'Normal' ? 'high' : ''],
    tabs: [
      { id: 'overview', label: 'Single line', build: (el, api) => buildOverview(el, ctx, api) },
      { id: 'gens', label: 'Generators', build: (el, api) => buildGens(el, ctx, api) },
      { id: 'load', label: 'Load management', build: (el) => buildLoad(el, ctx) },
      { id: 'sync', label: 'Synchroniser', build: (el, api) => buildSync(el, ctx, api) },
      { id: 'trends', label: 'Trends', build: (el) => buildTrends(el, ctx) },
      { id: 'alarms', label: 'Alarms and events', build: (el, api) => buildAlarms(el, ctx, api) },
    ],
  })
  return { unmount: () => fr.destroy(), setVariant: (v) => fr.setVariant(v), frame: fr }
}

// ---------------- single line diagram ----------------
function layout(st, db) {
  const buses = Object.values(st.buses)
  const mv = buses.filter((b) => b.vn_kv >= 1)
  const lv = buses.filter((b) => b.vn_kv < 1)
  const W = 1300, pos = {}
  const mvW = (W - 120) / Math.max(1, mv.length)
  mv.forEach((b, i) => { pos[b.id] = { x0: 40 + i * (mvW + 40), x1: 40 + i * (mvW + 40) + mvW - 40, y: 210 } })
  const feeders = Object.values(st.feeders)
  lv.forEach((b) => {
    const tr = feeders.find((f) => f.to_bus === b.id)
    const up = tr ? pos[tr.bus] : pos[mv[0].id]
    pos[b.id] = { x0: up.x0, x1: up.x1, y: 470, tr: tr?.id }
  })
  return { W, H: 720, pos, mv, lv }
}

function buildOverview(el, ctx, api) {
  const { sim, db } = ctx
  const st0 = sim.state
  const L = layout(st0, db)
  const svg = s('svg', { viewBox: `0 0 ${L.W} ${L.H}`, role: 'img', class: 'full', 'aria-label': 'Live single line diagram', style: { background: api.variant === 'legacy' ? '#a9aeb3' : '#eceef0', border: '1px solid #8a8f96' } })
  const upd = []
  const legacy = api.variant === 'legacy'
  const busLine = (id) => { const p = L.pos[id]; const ln = s('line', { x1: p.x0, y1: p.y, x2: p.x1, y2: p.y, 'stroke-width': 7 }); svg.append(ln, s('text', { x: p.x1, y: p.y - 12, 'font-size': 16, 'font-weight': 700, fill: '#1f2328', 'text-anchor': 'end' }, st0.buses[id].name)); upd.push((st) => { const live = st.buses[id].live; ln.setAttribute('stroke', live ? '#2b3036' : '#9aa0a6'); ln.setAttribute('stroke-dasharray', live ? '' : '10 8') }) }
  const breaker = (bid, x, y) => {
    const r = s('rect', { x: x - 12, y: y - 12, width: 24, height: 24, 'stroke-width': 2.5, class: 'clickable', 'data-breaker': bid })
    r.addEventListener('click', () => onBreaker(ctx, api, bid))
    const t = s('title', {}, '')
    r.append(t)
    svg.append(r)
    upd.push((st) => {
      const b = st.breakers[bid]; if (!b) return
      const closed = b.state === 'closed'
      r.setAttribute('fill', b.tripped ? '#e0a100' : closed ? '#2b3036' : '#ffffff')
      r.setAttribute('stroke', b.tripped ? '#8a6400' : '#2b3036')
      r.setAttribute('stroke-dasharray', b.racked !== 'service' ? '4 3' : '')
      r.classList.toggle('blink', !!b.tripped)
      t.textContent = `${b.name}: ${b.tripped ? 'TRIPPED' : b.state}${b.cause ? ' (' + b.cause + ')' : ''}. Click to ${closed ? 'open' : 'close'}.`
    })
    return r
  }
  const wire = (x1, y1, x2, y2, liveFn) => { const ln = s('line', { x1, y1, x2, y2, 'stroke-width': 3.5 }); svg.insertBefore(ln, svg.firstChild); upd.push((st) => { const lv = liveFn(st); ln.setAttribute('stroke', lv ? '#2b3036' : '#9aa0a6'); ln.setAttribute('stroke-dasharray', lv ? '' : '6 6') }) }
  L.mv.forEach((b) => busLine(b.id)); L.lv.forEach((b) => busLine(b.id))
  // generators
  for (const bus of L.mv) {
    const gens = st0.genOrder.filter((id) => st0.gens[id].bus === bus.id)
    const p = L.pos[bus.id]
    gens.forEach((gid, i) => {
      const x = p.x0 + 60 + i * 250
      const g = st0.gens[gid]
      const circ = s('circle', { cx: x, cy: 70, r: 36, 'stroke-width': 3, class: 'clickable' })
      circ.addEventListener('click', () => api.select('gens'))
      svg.append(circ, s('text', { x, y: 77, 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 700, 'pointer-events': 'none' }, gid))
      const val = s('text', { x: x + 46, y: 58, 'font-size': 16, fill: '#1f2328' }), val2 = s('text', { x: x + 46, y: 78, 'font-size': 16, fill: '#1f2328' }), val3 = s('text', { x: x + 46, y: 98, 'font-size': 16, fill: '#4a5058' })
      svg.append(val, val2, val3)
      wire(x, 106, x, 138, (st) => st.gens[gid].v_kv > 0.5 * st.gens[gid].vn_kv)
      breaker(g.breaker, x, 150)
      wire(x, 162, x, p.y, (st) => st.breakers[g.breaker]?.state === 'closed' && st.buses[bus.id].live)
      upd.push((st) => {
        const G = st.gens[gid]
        circ.setAttribute('fill', G.online ? '#43494f' : ['running', 'accelerating'].includes(G.engine) ? '#ffffff' : '#d4d6d9')
        circ.setAttribute('stroke', G.engine === 'shutdown' || G.engine === 'fail_start' ? '#c62828' : '#2b3036')
        const t = circ.nextSibling; t.setAttribute('fill', G.online ? '#ffffff' : '#1f2328')
        text(val, `${f0(G.p_kw)} kW  ${f0(G.q_kvar)} kvar`)
        text(val2, `${f2(G.f_hz)} Hz  ${f2(G.v_kv)} kV`)
        text(val3, G.status)
        val3.setAttribute('fill', G.engine === 'shutdown' ? '#c62828' : '#4a5058')
      })
    })
  }
  // bus ties
  for (const b of Object.values(st0.breakers).filter((x) => x.kind === 'tie')) {
    const A = L.pos[b.from], B = L.pos[b.to]
    if (!A || !B) continue
    const x = (A.x1 + B.x0) / 2, y = A.y
    wire(A.x1, y, x - 12, y, (st) => st.buses[b.from].live); wire(x + 12, y, B.x0, y, (st) => st.buses[b.to].live)
    breaker(b.id, x, y)
    svg.append(s('text', { x, y: y + 34, 'text-anchor': 'middle', 'font-size': 15, fill: '#4a5058' }, 'Bus tie'))
  }
  // MV feeders (transformers and VFD feeders)
  for (const bus of L.mv) {
    const p = L.pos[bus.id]
    const fs = Object.values(st0.feeders).filter((f) => f.bus === bus.id)
    fs.forEach((f, i) => {
      const x = p.x1 - 70 - i * 200
      wire(x, p.y, x, 238, (st) => st.buses[bus.id].live)
      breaker(f.breaker, x, 250)
      const lab = s('text', { x: x + 18, y: 256, 'font-size': 16, 'font-weight': 600 }, shortName(f.id))
      const val = s('text', { x: x + 18, y: 276, 'font-size': 16, fill: '#4a5058' })
      svg.append(lab, val)
      if (f.to_bus) {
        wire(x, 262, x, 318, (st) => st.feeders[f.id].energised)
        svg.append(s('circle', { cx: x, cy: 330, r: 14, fill: 'none', stroke: '#2b3036', 'stroke-width': 2.5 }), s('circle', { cx: x, cy: 350, r: 14, fill: 'none', stroke: '#2b3036', 'stroke-width': 2.5 }))
        const inc = Object.values(st0.breakers).find((x2) => x2.kind === 'incomer' && x2.to === f.to_bus)
        wire(x, 364, x, inc ? 398 : L.pos[f.to_bus].y, (st) => st.feeders[f.id].energised)
        if (inc) { breaker(inc.id, x, 410); wire(x, 422, x, L.pos[f.to_bus].y, (st) => st.buses[f.to_bus].live) }
        upd.push((st) => text(val, `${f0(st.feeders[f.id].p_kw)} kW`))
      } else {
        wire(x, 262, x, 300, (st) => st.feeders[f.id].energised)
        const m = s('circle', { cx: x, cy: 314, r: 14, 'stroke-width': 2.5, stroke: '#2b3036' })
        svg.append(m, s('text', { x, y: 320, 'text-anchor': 'middle', 'font-size': 15, 'pointer-events': 'none' }, 'M'))
        upd.push((st) => { const F = st.feeders[f.id]; const d = F.drive ? st.drives[F.drive] : null; m.setAttribute('fill', d && d.run ? '#9aa0a6' : '#ffffff'); text(val, `${f0(F.p_kw)} kW${d ? ` ${d.status}` : ''}`) })
      }
    })
  }
  // LV feeders
  for (const bus of L.lv) {
    const p = L.pos[bus.id]
    const fs = Object.values(st0.feeders).filter((f) => f.bus === bus.id)
    const step = (p.x1 - p.x0 - 20) / Math.max(1, fs.length)
    fs.forEach((f, i) => {
      const x = p.x0 + 20 + step * (i + 0.5)
      wire(x, p.y, x, p.y + 28, (st) => st.buses[bus.id].live)
      breaker(f.breaker, x, p.y + 40)
      const lab = s('text', { x: x - 5, y: p.y + 62, 'font-size': 15, transform: `rotate(70 ${x - 5} ${p.y + 62})` }, `${shortName(f.id)} P${f.priority}`)
      const val = s('text', { x: x, y: p.y + 185, 'font-size': 15, 'text-anchor': 'middle', fill: '#4a5058' })
      svg.append(lab, val)
      upd.push((st) => { const F = st.feeders[f.id]; text(val, F.energised ? f0(F.p_kw) : F.shedBy ? 'SHED' : '0'); val.setAttribute('fill', F.shedBy ? '#8a6400' : '#4a5058'); val.setAttribute('font-weight', F.shedBy ? 700 : 400) })
    })
  }
  svg.append(s('text', { x: 10, y: L.H - 10, 'font-size': 15, fill: '#4a5058' }, 'Click a breaker to open or close it (generator breakers open the synchroniser). LV feeder values in kW, P = load shedding priority (5 shed first).'))
  // side panel
  const sum = kv([['Plant load', 'kW', 'load'], ['Online capacity', 'kW', 'cap'], ['Load of online sets', '%', 'pct'], ['Spinning reserve', 'kW', 'avail'], ['Sets online', '', 'on'], ['Busbar frequency', 'Hz', 'f'], ['Busbar voltage', 'kV', 'v'], ['Load case basis', '', 'lc']])
  const loadBar = bar(100, sim.state.pms.settings.start_pct)
  const mode = seg([['auto', 'AUTO'], ['semi', 'SEMI'], ['manual', 'MANUAL']], sim.state.pms.mode, (m) => sim.command('pms.mode', { mode: m }), { 'data-act': 'pms-mode' })
  const pr = h('div', { class: 'small' })
  const ctrl = h('div', { class: 'small' })
  el.append(h('div', { class: 'grid', style: { gridTemplateColumns: 'minmax(0,3.2fr) minmax(16em,1fr)' } },
    h('div', { class: 'card' }, svg),
    h('div', { class: 'card' }, h('h3', {}, 'Plant summary'), sum.el, h('div', { style: { margin: '.4em 0' } }, loadBar.el), h('div', { class: 'small muted' }, `Standby start above ${sim.state.pms.settings.start_pct} % for ${sim.state.pms.settings.start_delay_s} s (red mark)`),
      h('h4', {}, 'PMS mode'), mode, h('h4', {}, 'Start priority'), pr, h('h4', {}, 'PMS controllers'), ctrl,
      api.variant === 'legacy' ? h('p', { class: 'note' }, 'Legacy view: hardwired kW relays start the standby set, one preferential trip stage, no automatic restart of consumers after a blackout, lamp annunciator only.') : null)))
  return (st) => {
    upd.forEach((u) => u(st))
    const P = plantView(st)
    sum.set('load', f0(P.load_kw)); sum.set('cap', f0(P.cap_kw)); sum.set('pct', f1(P.load_pct), P.load_pct > 100 ? 'crit' : P.load_pct > st.pms.settings.start_pct ? 'high' : '')
    sum.set('avail', f0(P.avail_kw)); sum.set('on', P.online)
    const live = Object.values(st.buses).find((b) => b.live && b.vn_kv >= 1)
    sum.set('f', live ? f2(live.f_hz) : '0.00', live && Math.abs(live.f_hz - 60) > 1 ? 'high' : ''); sum.set('v', live ? f2(live.v_kv) : '0.00')
    sum.set('lc', st.loadCase ? st.loadCase.id : '-')
    loadBar.set(P.load_pct, P.load_pct > 100 ? 'crit' : P.load_pct > st.pms.settings.start_pct ? 'high' : null)
    mode.set(st.pms.mode)
    text(pr, st.pms.priority.map((id, i) => `${i + 1}. ${id}${st.gens[id].online ? ' (on load)' : ''}`).join('   '))
    text(ctrl, `A: ${st.pms.controllers.A}, B: ${st.pms.controllers.B}`)
  }
}

function onBreaker(ctx, api, bid) {
  const { sim } = ctx
  const st = sim.state
  const b = st.breakers[bid]
  if (!b) return
  if (b.kind === 'generator' && b.state !== 'closed') { const g = st.gens[b.from] || st.gens[b.to]; api._syncGen = g.id; api.select('sync'); return }
  if (b.state === 'closed') sim.command('breaker.open', { id: bid })
  else if (b.tripped) {
    const r = Object.values(st.relays).find((x) => x.breaker === bid)
    if (r) { sim.command('relay.reset', { relay: r.id }) }
    else sim.command('breaker.close', { id: bid })
  } else {
    const f = st.feeders[b.to] || st.feeders[b.from]
    if (f && f.heavy) sim.command('feeder.start', { feeder: f.id }); else sim.command('breaker.close', { id: bid })
  }
}

// ---------------- generators ----------------
function buildGens(el, ctx, api) {
  const { sim } = ctx
  const legacy = api.variant === 'legacy'
  const ids = sim.state.genOrder
  const grid = h('div', { class: `grid g${Math.min(3, ids.length)}` })
  el.append(grid)
  const ups = ids.map((id) => {
    const card = h('div', { class: 'card', 'data-gen': id })
    const st0 = sim.state
    const title = h('h3', {}, id, h('span', { class: 'tag' }, ''))
    const K = kv([['Active power', 'kW', 'kw'], ['Reactive power', 'kvar', 'kvar'], ['Current', 'A', 'a'], ['Power factor', '', 'pf'], ['Frequency', 'Hz', 'hz'], ['Voltage', 'kV', 'kv'], ['Engine speed', 'rpm', 'rpm'], ['Governor', '', 'gov'], ['AVR', '', 'avr'], ['Control', '', 'ctl'], ['Running hours', 'h', 'hrs']])
    const lbar = bar(110, 100)
    const meters = legacy ? [meter('kW', '', 0, st0.gens[id].rating_kw * 1.2, st0.gens[id].rating_kw), meter('Hz', '', 55, 65, null), meter('kV', '', 5.5, 7.5, null)] : []
    const btns = h('div', { class: 'row' },
      btn('Start', () => sim.command('gen.start', { id }), '', { 'data-act': `start-${id}` }), btn('Stop', () => sim.command('gen.stop', { id }), '', { 'data-act': `stop-${id}` }),
      btn('Reset', () => sim.command('gen.reset', { id })), btn('Synchronise', () => { api._syncGen = id; api.select('sync') }), btn('First priority', () => sim.command('pms.priority', { first: id })))
    card.append(title, legacy ? h('div', { class: 'grid g3' }, ...meters) : h('div', {}, lbar.el), K.el, btns)
    grid.append(card)
    return (st) => {
      const v = genView(st, id)
      const tag = title.querySelector('.tag'); text(tag, v.status); tag.className = 'tag ' + (v.engine === 'shutdown' || v.engine === 'fail_start' ? 'crit' : v.online ? 'dark' : '')
      K.set('kw', f0(v.kw), v.loadPct > 100 ? 'crit' : ''); K.set('kvar', f0(v.kvar)); K.set('a', f0(v.a)); K.set('pf', f2(v.pf)); K.set('hz', f2(v.hz)); K.set('kv', f2(v.kv)); K.set('rpm', f0(v.rpm))
      K.set('gov', v.govMode === 'isoch' ? 'isochronous load sharing' : `droop ${f1(v.droopPct)} %`); K.set('avr', `${v.avrMode === 'auto' ? 'AUTO' : 'FCR'}${v.avrLimit ? ' ' + v.avrLimit : ''}`, v.avrLimit ? 'high' : '')
      K.set('ctl', v.control.toUpperCase(), v.control === 'local' ? 'high' : ''); K.set('hrs', f0(v.hours))
      lbar.set(v.loadPct, v.loadPct > 100 ? 'crit' : null)
      if (meters.length) { meters[0].set(v.kw); meters[1].set(v.hz); meters[2].set(v.kv) }
    }
  })
  return (st) => ups.forEach((u) => u(st))
}

// ---------------- load management ----------------
function buildLoad(el, ctx) {
  const { sim } = ctx
  const st0 = sim.state
  const S = st0.pms.settings
  const prio = h('div', {})
  const hcBody = h('tbody'), fdBody = h('tbody'), stBody = h('tbody')
  const heavy = Object.values(st0.feeders).filter((f) => f.heavy)
  el.append(h('div', { class: 'grid g2' },
    h('div', { class: 'card' }, h('h3', {}, 'Generator start priority (duty / standby)'), prio,
      h('h4', {}, 'Settings (database, REPRESENTATIVE)'), h('div', { class: 'small' },
        `Standby start above ${S.start_pct} % for ${S.start_delay_s} s. Stop below ${S.stop_pct} % for ${S.stop_delay_s} s if the remaining sets stay below ${S.stop_after_pct} %. Minimum ${S.min_running} sets. Heavy consumer reserve ${S.hc_reserve_kw ?? '-'} kW. Motor start limit ${S.start_kva_ratio} x online kVA.`)),
    h('div', { class: 'card' }, h('h3', {}, 'Heavy consumers (start request and permission)'),
      h('div', { class: 'row' }, ...heavy.map((f) => btn(`Request ${shortName(f.id)}`, () => sim.command('feeder.start', { feeder: f.id }), '', { 'data-act': `hc-${f.id}` })), ...heavy.map((f) => btn(`Stop ${shortName(f.id)}`, () => sim.command('feeder.stop', { feeder: f.id })))),
      h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', {}, 'Consumer'), h('th', {}, 'Status'), h('th', {}, 'Available kW'), h('th', {}, 'Required kW'))), hcBody)),
    h('div', { class: 'card' }, h('h3', {}, 'Load shedding stages (database)'), h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', {}, 'Stage'), h('th', {}, 'Sheds priority'), h('th', {}, 'Trigger'), h('th', {}, 'State'))), stBody),
      h('div', { class: 'row', style: { marginTop: '.4em' } }, btn('Reset shedding and reconnect', () => sim.command('pms.shed_reset'), '', { 'data-act': 'shed-reset' }), h('span', { class: 'small muted' }, 'Priority 4 and 5 consumers reconnect only after this operator reset.'))),
    h('div', { class: 'card' }, h('h3', {}, 'Consumers'), h('div', { style: { maxHeight: '24em', overflow: 'auto' } }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', {}, 'Feeder'), h('th', {}, 'Bus'), h('th', {}, 'P'), h('th', {}, 'kW'), h('th', {}, 'State'))), fdBody)))))
  for (const stg of st0.pms.stages) stBody.append(h('tr', { 'data-stage': stg.stage }, h('td', {}, stg.stage), h('td', {}, stg.sheds_priority), h('td', { class: 'small' }, stg.trigger), h('td', {}, '')))
  const rows = Object.values(st0.feeders).filter((f) => !f.to_bus).map((f) => { const tds = [h('td', {}, f.name), h('td', {}, f.bus), h('td', {}, f.priority), h('td', { class: 'n' }), h('td', {})]; fdBody.append(h('tr', {}, ...tds)); return [f.id, tds] })
  return (st) => {
    const key = st.pms.priority.join()
    if (prio.dataset.key !== key) {
      prio.dataset.key = key; prio.textContent = ''
      st.pms.priority.forEach((id, i) => prio.append(h('div', { class: 'row' }, h('b', {}, `${i + 1}.`), id, i > 0 ? btn('Up', () => { const o = st.pms.priority.slice(); [o[i - 1], o[i]] = [o[i], o[i - 1]]; sim.command('pms.priority', { order: o }) }) : null)))
    }
    hcBody.textContent = ''
    for (const f of heavy) {
      const r = st.pms.hc.requests.find((x) => x.feeder === f.id)
      const d = f.drive ? st.drives[f.drive] : null
      const stt = r ? r.status : d && d.run ? `running ${f0(d.kw)} kW` : 'stopped'
      hcBody.append(h('tr', {}, h('td', {}, f.name), h('td', { class: r && /waiting|blocked/.test(r.status) ? 'high' : '' }, stt), h('td', { class: 'n' }, r?.check ? f0(r.check.avail_kw) : '-'), h('td', { class: 'n' }, r?.check ? f0(r.check.need_kw) : '-')))
    }
    st.pms.stages.forEach((stg, i) => { const td = stBody.children[i].lastChild; const on = st.pms.shed.stage > i; text(td, on ? 'OPERATED' : 'armed'); td.className = on ? 'high' : '' })
    for (const [id, tds] of rows) {
      const F = st.feeders[id]; const b = st.breakers[F.breaker]
      text(tds[3], f0(F.p_kw)); text(tds[4], F.shedBy ? `shed (${F.awaitReset ? 'awaits reset' : 'auto reconnect'})` : F.awaitReset ? 'awaits reset' : b ? (b.tripped ? 'TRIPPED' : b.state) : '-')
      tds[4].className = F.shedBy || F.awaitReset ? 'high' : ''
    }
  }
}

// ---------------- synchroniser ----------------
function buildSync(el, ctx, api) {
  const { sim } = ctx
  const fr = api
  const st0 = sim.state
  let gen = fr && fr._syncGen || st0.sync.gen || st0.pms.priority.find((id) => !st0.gens[id].online) || st0.genOrder[0]
  const pick = seg(st0.genOrder.map((id) => [id, id]), gen, (v) => { gen = v; pick.set(v) })
  const scope = s('svg', { viewBox: '0 0 240 240', width: '100%', style: { maxWidth: '22em' }, role: 'img', 'aria-label': 'Synchroscope' })
  scope.append(s('circle', { cx: 120, cy: 120, r: 110, fill: '#f1ede2', stroke: '#333', 'stroke-width': 3 }))
  for (let k = 0; k < 12; k++) { const a = (k * Math.PI) / 6; scope.append(s('line', { x1: 120 + 95 * Math.sin(a), y1: 120 - 95 * Math.cos(a), x2: 120 + 106 * Math.sin(a), y2: 120 - 106 * Math.cos(a), stroke: '#333', 'stroke-width': 2 })) }
  const win = st0.syncWindow.angle_deg
  const arc = (a1, a2) => { const r = 100, p = (a) => [120 + r * Math.sin((a * Math.PI) / 180), 120 - r * Math.cos((a * Math.PI) / 180)]; const [x1, y1] = p(a1), [x2, y2] = p(a2); return `M120 120 L${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2} Z` }
  scope.append(s('path', { d: arc(-win, win), fill: '#bdbdbd', stroke: '#2b3036' }))
  scope.append(s('text', { x: 120, y: 168, 'text-anchor': 'middle', 'font-size': 15 }, 'window at top = in phase'), s('text', { x: 36, y: 125, 'font-size': 15 }, 'SLOW'), s('text', { x: 204, y: 125, 'font-size': 15, 'text-anchor': 'end' }, 'FAST'))
  const needle = s('line', { x1: 120, y1: 120, x2: 120, y2: 24, stroke: '#111', 'stroke-width': 5, 'stroke-linecap': 'round' })
  scope.append(needle, s('circle', { cx: 120, cy: 120, r: 8, fill: '#111' }))
  const K = kv([['Incoming frequency', 'Hz', 'fg'], ['Bus frequency', 'Hz', 'fb'], ['Slip', 'Hz', 'slip'], ['Incoming voltage', 'kV', 'vg'], ['Bus voltage', 'kV', 'vb'], ['Voltage difference', '%', 'dv'], ['Phase angle', 'deg', 'ang'], ['Check-sync (25) permissive', '', 'perm'], ['Synchroniser', '', 'stat']])
  const winTxt = h('div', { class: 'small muted' }, `Window (database): slip <= ${st0.syncWindow.slip_hz} Hz, dV <= ${st0.syncWindow.dv_pct} %, angle <= ${st0.syncWindow.angle_deg} deg`)
  el.append(h('div', { class: 'grid', style: { gridTemplateColumns: 'minmax(14em,1fr) minmax(0,1.4fr)' } },
    h('div', { class: 'card' }, h('h3', {}, 'Synchroscope'), scope, winTxt),
    h('div', { class: 'card' }, h('h3', {}, 'Incoming set ', pick), K.el,
      h('h4', {}, 'Commands'),
      h('div', { class: 'row' }, btn('Start set', () => sim.command('gen.start', { id: gen })), btn('AUTO synchronise', () => sim.command('sync.select', { gen, mode: 'auto' }), 'on', { 'data-act': 'sync-auto' }), btn('MANUAL', () => sim.command('sync.select', { gen, mode: 'manual' }), '', { 'data-act': 'sync-manual' }), btn('Cancel', () => sim.command('sync.cancel'))),
      h('div', { class: 'row', style: { marginTop: '.4em' } }, btn('Speed lower', () => sim.command('gov.fref', { id: gen, delta: -0.05 })), btn('Speed raise', () => sim.command('gov.fref', { id: gen, delta: 0.05 })), btn('Volt lower', () => sim.command('avr.setpoint', { id: gen, delta: -0.02 })), btn('Volt raise', () => sim.command('avr.setpoint', { id: gen, delta: 0.02 })), btn('CLOSE breaker', () => { if (sim.state.sync.gen !== gen) sim.command('sync.select', { gen, mode: 'manual' }); sim.command('sync.close') }, 'warn', { 'data-act': 'sync-close' })),
      h('p', { class: 'note' }, 'In MANUAL the operator matches speed and voltage and presses CLOSE; the check-sync relay (25) refuses the close outside the window. AUTO matches speed with a small positive slip and closes as the angle approaches zero.'))))
  return (st) => {
    const g = st.gens[gen]; const bus = st.buses[g.bus]
    const ang = g.online ? 0 : g.phase_deg
    needle.setAttribute('x2', 120 + 96 * Math.sin((ang * Math.PI) / 180)); needle.setAttribute('y2', 120 - 96 * Math.cos((ang * Math.PI) / 180))
    K.set('fg', f2(g.f_hz)); K.set('fb', f2(bus.f_hz)); K.set('slip', g.online ? '0.00' : f2(g.slip_hz), Math.abs(g.slip_hz) > st.syncWindow.slip_hz && !g.online ? 'high' : '')
    K.set('vg', f2(g.v_kv)); K.set('vb', f2(bus.v_kv)); K.set('dv', f1(g.dv_pct)); K.set('ang', f0(ang))
    const permitted = !g.online && g.ready && bus.live && Math.abs(g.slip_hz) <= st.syncWindow.slip_hz && Math.abs(g.dv_pct) <= st.syncWindow.dv_pct && Math.abs(g.phase_deg) <= st.syncWindow.angle_deg
    K.set('perm', g.online ? 'breaker closed' : !bus.live ? 'dead bus (dead bus closing)' : permitted ? 'PERMITTED' : 'blocked', permitted ? 'high' : '')
    K.set('stat', st.sync.gen === gen ? `${st.sync.mode.toUpperCase()}: ${st.sync.status}` : g.status)
  }
}

// ---------------- trends ----------------
function buildTrends(el, ctx) {
  const { sim } = ctx
  const c1 = h('canvas', { style: { width: '100%', height: '15em' }, 'aria-label': 'Generator kW trend' })
  const c2 = h('canvas', { style: { width: '100%', height: '11em' }, 'aria-label': 'Frequency trend' })
  const c3 = h('canvas', { style: { width: '100%', height: '11em' }, 'aria-label': 'Voltage trend' })
  el.append(h('div', { class: 'grid' }, h('div', { class: 'card' }, h('h3', {}, 'Active power per generator, kW (last 5 min)'), c1), h('div', { class: 'grid g2' }, h('div', { class: 'card' }, h('h3', {}, 'Frequency, Hz'), c2), h('div', { class: 'card' }, h('h3', {}, 'Voltage, kV'), c3))))
  return (st) => {
    const ids = st.genOrder
    drawTrend(c1, [...ids.map((id) => ({ values: st.trends[id].kw.values, label: id })), { values: st.trends.load.values, label: 'plant load', dash: [6, 4] }], { min: 0, xlabel: '1 sample per second' })
    drawTrend(c2, ids.map((id) => ({ values: st.trends[id].hz.values.filter((v) => v > 1), label: id })), { minSpan: 1, lines: [{ v: 60, color: '#6d737b', label: '60 Hz' }] })
    drawTrend(c3, ids.map((id) => ({ values: st.trends[id].kv.values.filter((v) => v > 0.5), label: id })), { minSpan: 0.4 })
  }
}

// ---------------- alarms ----------------
function buildAlarms(el, ctx, api) {
  const { sim } = ctx
  if (api.variant === 'legacy') {
    const lamps = h('div', { class: 'grid g4' })
    el.append(h('p', { class: 'note' }, 'Legacy hardwired PMS: a lamp annunciator shows a few common alarms with no time stamps and no event log. Compare with the retrofit view.'), lamps)
    const defs = [['Blackout', (st) => st.pms.blackout.active], ['Preferential trip', (st) => Object.values(st.feeders).some((f) => f.shedBy)], ['Gen trip', (st) => Object.values(st.breakers).some((b) => b.kind === 'generator' && b.tripped)], ['Overload', (st) => st.pms.load_pct > 100], ['Standby start', (st) => Object.values(st.gens).some((g) => ['prelube', 'cranking', 'accelerating'].includes(g.engine))], ['Fail to start', (st) => Object.values(st.gens).some((g) => g.engine === 'fail_start')], ['Low frequency', (st) => Object.values(st.buses).some((b) => b.live && b.f_hz < 58.8)], ['Engine shutdown', (st) => Object.values(st.gens).some((g) => g.engine === 'shutdown')]]
    const L = defs.map(([n, fn]) => { const l = h('div', { class: 'card', style: { textAlign: 'center', fontWeight: 700 } }, n); lamps.append(l); return [l, fn] })
    return (st) => L.forEach(([l, fn]) => { const on = fn(st); l.style.background = on ? '#ffb300' : '#c7cbce' })
  }
  const a = h('div', {}), e = h('div', {})
  el.append(h('div', { class: 'grid g2' }, h('div', { class: 'card' }, h('h3', {}, 'Alarm list (PMS, generator control, relays)'), a), h('div', { class: 'card' }, h('h3', {}, 'Event log (time stamped)'), e)))
  const ua = alarmTable(a, ctx, (x) => ['S02', 'S01', 'S03'].includes(x.systemId), { shelve: true })
  const ue = eventList(e, (x) => ['S02', 'S01', 'S03', 'S12'].includes(x.systemId), 60)
  return (st) => { ua(st); ue(st) }
}

export function renderMini(canvas, ctx) {
  const st = ctx.sim.state
  const P = plantView(st)
  const lines = st.genOrder.map((id) => { const g = st.gens[id]; return { k: id + ' ' + (g.online ? 'ON' : g.status), v: `${f0(g.p_kw)} kW`, alarm: g.engine === 'shutdown' ? 'critical' : null } })
  lines.unshift({ k: 'Plant load', v: `${f0(P.load_kw)} kW ${f0(P.load_pct)} %`, alarm: P.load_pct > 100 ? 'critical' : null })
  const live = Object.values(st.buses).find((b) => b.live)
  lines.push({ k: 'Bus', v: live ? `${f2(live.f_hz)} Hz ${f2(live.v_kv)} kV` : 'DEAD', alarm: live ? null : 'critical' })
  lines.push({ k: 'PMS', v: st.pms.mode.toUpperCase() + ' ' + (st.pms.message === 'Normal' ? '' : st.pms.message.slice(0, 22)), alarm: st.pms.message !== 'Normal' ? 'high' : null })
  miniFrame(canvas, 'PMS', lines, { legacy: st.variant.S02 === 'legacy' })
}
