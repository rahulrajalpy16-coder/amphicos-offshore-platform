// S10 Boiler control: burner management sequence, boiler mimic with flame and drum level, three-element
// drum level control (drum level, steam flow, feedwater flow) versus legacy single element, trips and trends.
import { createFrame, h, s, btn, seg, kv, bar, text, f0, f1, f2, drawTrend, miniFrame, select } from './common/ui.js'
import { BMS_STATES } from '../sim/process.js'

export const meta = { id: 'boiler', title: 'Boiler control', systems: ['S10'], kind: 'hmi' }
const blrFor = (ctx) => { const st = ctx.sim.state; const c = (ctx.db.components || []).find((x) => x.id === ctx.componentId); const i = c && /2/.test(c.id) ? 1 : 0; return (st.boilers[i] || st.boilers[0]).id }

export function mount(container, ctx) {
  const fr = createFrame(container, ctx, {
    moduleId: 'boiler', systemId: 'S10', title: 'Auxiliary boiler control and burner management',
    help: 'The auxiliary boilers make steam for cargo and crude heating. The burner management system purges the furnace, lights the pilot, proves the flame and then lets the firing rate follow steam demand; it trips the burner at once if the flame is lost or the water level is too low. The feedwater control keeps the drum level steady.',
    alarmSystems: ['S10'],
    init: (api) => { api.blr = blrFor(ctx); api.hist = {} },
    status: (st, api) => { const b = st.boilers.find((x) => x.id === api.blr); return [`${b.tag}: ${b.status}`, b.bms === 'lockout' ? 'crit' : ''] },
    tabs: [
      { id: 'bms', label: 'Burner management', build: (el, api) => buildBms(el, ctx, api) },
      { id: 'level', label: 'Drum level control', build: (el, api) => buildLevel(el, ctx, api) },
    ],
  })
  // trend history kept in the view (sampled from sim state; not a copy used for control)
  const unsub = ctx.sim.subscribe('tick', (_, st) => { if (st.tick % 5) return; for (const b of st.boilers) { const H = (fr.hist[b.id] ||= { lvl: [], st: [], fw: [], p: [] }); H.lvl.push(b.level); H.st.push(b.steam); H.fw.push(b.feed); H.p.push(b.steam_p); for (const k of Object.keys(H)) if (H[k].length > 360) H[k].shift() } })
  return { unmount: () => { unsub(); fr.destroy() }, setVariant: (v) => fr.setVariant(v), frame: fr }
}

const picker = (ctx, api) => select(ctx.sim.state.boilers.map((b) => [b.id, `${b.tag} ${b.duty ? '(duty)' : '(standby)'}`]), api.blr, (v) => { api.blr = v; api.select(api.tab()) })

function buildBms(el, ctx, api) {
  const { sim } = ctx
  const legacy = api.variant === 'legacy'
  const seqKeys = ['off', 'prepurge', 'ignition', 'proving', 'lowfire', 'modulating', 'postpurge']
  const seqEl = h('div', { class: 'row' })
  const seqTags = seqKeys.map((k) => { const t = h('span', { class: 'tag' }, BMS_STATES[k]); seqEl.append(t); return t })
  const timer = h('span', { class: 'tag' })
  const svg = s('svg', { viewBox: '0 0 420 460', role: 'img', 'aria-label': 'Boiler mimic', style: { maxWidth: '26em' } })
  svg.append(s('rect', { x: 120, y: 40, width: 180, height: 380, rx: 30, fill: '#d4d6d9', stroke: '#2b3036', 'stroke-width': 3 }), s('rect', { x: 140, y: 60, width: 140, height: 90, rx: 10, fill: '#eceef0', stroke: '#2b3036', 'stroke-width': 2 }))
  const water = s('rect', { x: 142, y: 110, width: 136, height: 38, fill: '#9aa0a6' })
  const flame = s('path', { d: 'M210 400 C170 360 190 300 210 260 C230 300 250 360 210 400 Z', fill: '#ff9f1a' })
  svg.append(water, flame, s('text', { x: 210, y: 30, 'text-anchor': 'middle', 'font-size': 17, 'font-weight': 700 }, 'Steam drum'), s('text', { x: 210, y: 448, 'text-anchor': 'middle', 'font-size': 16 }, 'Burner and furnace'))
  const tP = s('text', { x: 310, y: 80, 'font-size': 16 }), tL = s('text', { x: 310, y: 110, 'font-size': 16 }), tF = s('text', { x: 310, y: 330, 'font-size': 16 }), tFo = s('text', { x: 10, y: 400, 'font-size': 16 }), tFi = s('text', { x: 310, y: 360, 'font-size': 16 })
  svg.append(tP, tL, tF, tFo, tFi)
  const K = kv([['Steam pressure', 'barg', 'p'], ['Firing rate', '%', 'fire'], ['Flame signal', '%', 'flame'], ['Fuel oil pressure', 'barg', 'fo'], ['Combustion air damper', '%', 'damper'], ['Flue gas O2', '%', 'o2'], ['Steam demand', '% capacity', 'dem'], ['First-out trip', '', 'fo1']])
  const pBar = bar(20, sim.state.boilerCfg.p_trip)
  const lamps = legacy ? h('div', { class: 'grid g4' }, ...['PURGE', 'IGNITION', 'FLAME ON', 'FLAME FAIL', 'LOW LEVEL', 'HIGH PRESS', 'LOW FO PRESS', 'LOCKOUT'].map((n) => h('div', { class: 'card', 'data-lamp': n, style: { textAlign: 'center', fontWeight: 700 } }, n))) : null
  const C = sim.state.boilerCfg
  el.append(h('div', { class: 'row', style: { marginBottom: '.5em' } }, 'Boiler ', picker(ctx, api), h('span', { class: 'small muted' }, `${C.timing_note}. Capacity ${C.max_tph} t/h each (REPRESENTATIVE).`)),
    h('div', { class: 'grid', style: { gridTemplateColumns: 'minmax(14em,0.9fr) minmax(0,1.6fr)' } },
      h('div', { class: 'card' }, svg),
      h('div', { class: 'grid' },
        h('div', { class: 'card' }, h('h3', {}, legacy ? 'Legacy relay sequencer: lamps and pushbuttons' : 'Burner management sequence', timer), legacy ? lamps : seqEl),
        h('div', { class: 'card' }, h('h3', {}, 'Measurements'), K.el, pBar.el,
          h('div', { class: 'row', style: { marginTop: '.5em' } }, btn('START', () => sim.command('boiler.start', { id: api.blr }), 'on', { 'data-act': 'blr-start' }), btn('STOP', () => sim.command('boiler.stop', { id: api.blr })), btn('RESET lockout', () => sim.command('boiler.reset', { id: api.blr }))),
          h('h4', {}, 'Steam demand (normally set by the ICSS crude heating loop)'), h('div', { class: 'row' }, btn('45 %', () => sim.command('boiler.demand', { pct: 45 })), btn('60 %', () => sim.command('boiler.demand', { pct: 60 })), btn('75 %', () => sim.command('boiler.demand', { pct: 75 }), '', { 'data-act': 'demand-75' })),
          h('h4', {}, 'Demonstration faults'), h('div', { class: 'row' }, btn('Flame scanner / flame loss', () => sim.command('fault.inject', { target: api.blr, kind: 'scanner' }), 'warn'), btn('Feed pump failure', () => sim.command('fault.inject', { target: api.blr, kind: 'feed_pump' })), btn('Fuel pump failure', () => sim.command('fault.inject', { target: api.blr, kind: 'fuel_pump' })), btn('Ignition failure', () => sim.command('fault.inject', { target: api.blr, kind: 'no_ignition' })), btn('Clear faults', () => ['scanner', 'feed_pump', 'fuel_pump', 'no_ignition', 'fuel_valve_stuck', 'fd_fan'].forEach((k) => sim.command('fault.clear', { target: api.blr, kind: k }))))))))
  return (st) => {
    const b = st.boilers.find((x) => x.id === api.blr), C2 = st.boilerCfg
    const i = seqKeys.indexOf(b.bms === 'lockout' ? 'postpurge' : b.bms)
    seqTags.forEach((t, k) => { t.className = 'tag' + (k === i ? (b.bms === 'lockout' ? ' crit' : ' dark') : '') })
    const dur = { prepurge: C2.t_prepurge, ignition: C2.t_ignition, proving: C2.t_proving, lowfire: C2.t_lowfire, postpurge: C2.t_postpurge, lockout: C2.t_postpurge }[b.bms]
    text(timer, dur ? `${b.status}: ${f0(Math.max(0, dur - b.timer))} s` : b.status); timer.className = 'tag ' + (b.bms === 'lockout' ? 'crit' : '')
    const fl = b.flame / 100; flame.setAttribute('opacity', fl.toFixed(2)); flame.setAttribute('transform', `translate(210 400) scale(${0.4 + fl * 0.7}) translate(-210 -400)`)
    const lvlY = 129 - (b.level / 200) * 19; water.setAttribute('y', lvlY); water.setAttribute('height', 148 - lvlY)
    text(tP, `${f1(b.steam_p)} barg`); text(tL, `level ${f0(b.level)} mm`); tL.setAttribute('fill', b.level < C2.l_low || b.level > C2.l_high ? '#c62828' : '#1f2328')
    text(tF, `flame ${f0(b.flame)} %`); text(tFi, `firing ${f0(b.firing)} %`); text(tFo, `FO ${f1(b.fo_p)} barg`)
    K.set('p', f2(b.steam_p), b.steam_p > C2.p_high ? 'high' : ''); K.set('fire', f0(b.firing)); K.set('flame', f0(b.flame), b.flame < C2.flame_alarm && ['modulating', 'lowfire'].includes(b.bms) ? 'crit' : ''); K.set('fo', f1(b.fo_p), b.fo_p < C2.fo_alarm && b.bms !== 'off' ? 'high' : '')
    K.set('damper', f0(b.damper)); K.set('o2', f1(b.o2)); K.set('dem', f0(st.steamDemand * 100)); K.set('fo1', b.firstOut || '-', b.firstOut ? 'crit' : '')
    pBar.set(b.steam_p, b.steam_p > C2.p_high ? 'high' : null)
    if (lamps) { const on = { PURGE: ['prepurge', 'postpurge'].includes(b.bms), IGNITION: b.bms === 'ignition', 'FLAME ON': b.flame > 40, 'FLAME FAIL': b.firstOut === 'flame failure', 'LOW LEVEL': b.level < C2.l_low, 'HIGH PRESS': b.steam_p > C2.p_high, 'LOW FO PRESS': b.fo_p < C2.fo_alarm && b.bms !== 'off', LOCKOUT: b.bms === 'lockout' }; for (const [n, v] of Object.entries(on)) { const e = lamps.querySelector(`[data-lamp="${n}"]`); e.style.background = v ? (/FAIL|LOW|HIGH|LOCK/.test(n) ? '#ffb300' : '#f4f4f4') : '#c7cbce' } }
  }
}

function buildLevel(el, ctx, api) {
  const { sim } = ctx
  const legacy = api.variant === 'legacy'
  const svg = s('svg', { viewBox: '0 0 900 300', role: 'img', 'aria-label': 'Drum level control diagram' })
  const box = (x, y, w, t) => { svg.append(s('rect', { x, y, width: w, height: 56, rx: 6, fill: '#f4f5f6', stroke: '#2b3036', 'stroke-width': 2 }), s('text', { x: x + w / 2, y: y + 22, 'text-anchor': 'middle', 'font-size': 17, 'font-weight': 700 }, t)); const v = s('text', { x: x + w / 2, y: y + 45, 'text-anchor': 'middle', 'font-size': 16 }); svg.append(v); return v }
  const arrow = (x1, y1, x2, y2) => svg.append(s('line', { x1, y1, x2, y2, stroke: '#2b3036', 'stroke-width': 2.5, 'marker-end': 'url(#ar)' }))
  svg.append(s('defs', {}, s('marker', { id: 'ar', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' }, s('path', { d: 'M0 0 L10 5 L0 10 z', fill: '#2b3036' }))))
  const vLT = box(20, 20, 200, 'LT drum level'), vLIC = box(300, 20, 220, legacy ? 'LIC (single element)' : 'LIC outer loop')
  const vFT = legacy ? null : box(20, 120, 200, 'FT steam flow'), vSum = legacy ? null : box(300, 120, 220, 'Sum: FW setpoint')
  const vFW = legacy ? null : box(20, 220, 200, 'FT feedwater flow'), vFIC = legacy ? null : box(300, 220, 220, 'FIC inner loop')
  const vV = box(640, legacy ? 20 : 220, 220, 'Feed valve')
  arrow(220, 48, 300, 48)
  if (legacy) arrow(520, 48, 640, 48)
  else { arrow(410, 76, 410, 120); arrow(220, 148, 300, 148); arrow(410, 176, 410, 220); arrow(220, 248, 300, 248); arrow(520, 248, 640, 248) }
  const c1 = h('canvas', { style: { width: '100%', height: '13em' }, 'aria-label': 'Level trend' }), c2 = h('canvas', { style: { width: '100%', height: '13em' }, 'aria-label': 'Flow trend' })
  el.append(h('div', { class: 'row', style: { marginBottom: '.5em' } }, 'Boiler ', picker(ctx, api), btn('Steam demand step to 75 %', () => sim.command('boiler.demand', { pct: 75 }), 'on', { 'data-act': 'step' }), btn('Back to 45 %', () => sim.command('boiler.demand', { pct: 45 }))),
    h('div', { class: 'card' }, h('h3', {}, legacy ? 'Legacy single element control: level only' : 'Three-element control: drum level, steam flow and feedwater flow'), svg,
      h('p', { class: 'small' }, legacy ? 'With level only, a steam demand increase first makes the level swell (bubbles expand as pressure falls), so the controller wrongly closes the feed valve and the level then drops further.' : 'Steam flow feeds forward to the feedwater setpoint, the outer level loop trims it, and the inner flow loop holds the actual feedwater flow, so the swell after a steam step does not mislead the control.')),
    h('div', { class: 'grid g2' }, h('div', { class: 'card' }, h('h3', {}, 'Drum level, mm'), c1), h('div', { class: 'card' }, h('h3', {}, 'Steam flow and feedwater flow, t/h'), c2)))
  return (st) => {
    const b = st.boilers.find((x) => x.id === api.blr)
    text(vLT, `${f0(b.level)} mm (SP 0)`); text(vLIC, legacy ? `output ${f0(b.fw_valve)} %` : `trim ${f1(b.pidL.out)} t/h`); text(vV, `${f0(b.fw_valve)} %`)
    if (!legacy) { text(vFT, `${f1(b.steam)} t/h`); text(vSum, `${f1(b.fw_sp ?? 0)} t/h`); text(vFW, `${f1(b.feed)} t/h`); text(vFIC, `valve ${f0(b.fw_valve)} %`) }
    const H = api.hist[b.id] || { lvl: [], st: [], fw: [] }
    drawTrend(c1, [{ values: H.lvl, label: 'level' }], { minSpan: 60, lines: [{ v: st.boilerCfg.l_low, label: 'low alarm' }, { v: st.boilerCfg.l_high, label: 'high alarm' }] })
    drawTrend(c2, [{ values: H.st, label: 'steam' }, { values: H.fw, label: 'feedwater' }], { minSpan: 4 })
  }
}

export function renderMini(canvas, ctx) {
  const st = ctx.sim.state
  const b = st.boilers.find((x) => x.id === blrFor(ctx))
  miniFrame(canvas, b.tag, [{ k: 'BMS', v: b.status, alarm: b.bms === 'lockout' ? 'critical' : null }, { k: 'Steam', v: `${f1(b.steam_p)} barg` }, { k: 'Drum level', v: `${f0(b.level)} mm` }, { k: 'Flame', v: `${f0(b.flame)} %` }, { k: 'Firing', v: `${f0(b.firing)} %` }], { legacy: st.variant.S10 === 'legacy' })
}
