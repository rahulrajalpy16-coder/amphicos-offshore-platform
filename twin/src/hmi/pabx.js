// S07 PABX: IP-PBX management view: extension directory by area with live call states, place a call,
// hotlines, paging codes into PAGA, external trunk over VSAT, line cards and power supplies.
import { createFrame, h, btn, kv, text, f1, miniFrame, select, eventList } from './common/ui.js'

export const meta = { id: 'pabx', title: 'PABX', systems: ['S07'], kind: 'hmi' }

export function mount(container, ctx) {
  const fr = createFrame(container, ctx, {
    moduleId: 'pabx', systemId: 'S07', title: 'PABX: telephone exchange',
    help: 'The telephone exchange connects desk and industrial telephones all over the vessel, provides hotlines between the bridge, CCR and engine control room, lets any telephone make an announcement through PAGA with a paging code, and connects to shore through the satellite link.',
    alarmSystems: ['S07'],
    status: (st, api) => [st.pabx.status, st.pabx.status === 'Normal' ? '' : 'high'],
    tabs: [
      { id: 'calls', label: 'Extensions and calls', build: (el) => buildCalls(el, ctx) },
      { id: 'system', label: 'Trunks and hardware', build: (el) => buildSystem(el, ctx) },
    ],
  })
  return { unmount: () => fr.destroy(), setVariant: (v) => fr.setVariant(v), frame: fr }
}

function buildCalls(el, ctx) {
  const { sim } = ctx
  const st0 = sim.state
  const ext = st0.pabx.extensions
  let from = ext[0].ext, to = (ext.find((e) => e.room === 'R_CCR') || ext[1]).ext
  const dirBody = h('tbody')
  const rows = ext.map((e) => { const stt = h('td', {}); dirBody.append(h('tr', { 'data-ext': e.ext }, h('td', {}, e.ext), h('td', {}, e.name), h('td', { class: 'small' }, e.area), h('td', { class: 'small' }, e.type), stt, h('td', {}, btn('Answer', () => sim.command('pabx.answer', { ext: e.ext })), btn('Hang up', () => sim.command('pabx.hangup', { ext: e.ext }))))); return [e.ext, stt] })
  const opts = ext.map((e) => [e.ext, `${e.ext} ${e.name}`])
  const callBody = h('div', {})
  const zoneOpts = [['80', '80 all call'], ...st0.paga.zones.slice(0, 9).map((z, i) => [`8${i + 1}`, `8${i + 1} ${z.name}`])]
  let pageCode = '80'
  const ev = h('div', {})
  el.append(h('div', { class: 'grid', style: { gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.5fr)' } },
    h('div', { class: 'grid' },
      h('div', { class: 'card' }, h('h3', {}, 'Place a call'), h('div', { class: 'row' }, 'From', select(opts, from, (v) => { from = v })), h('div', { class: 'row' }, 'To', select(opts, to, (v) => { to = v })),
        h('div', { class: 'row' }, btn('Dial', () => sim.command('pabx.dial', { from, to }), 'on', { 'data-act': 'dial' }), btn('Hang up caller', () => sim.command('pabx.hangup', { ext: from })), btn('External call (9...)', () => sim.command('pabx.dial', { from, to: '900971' }))),
        h('h4', {}, 'Active calls'), callBody),
      h('div', { class: 'card' }, h('h3', {}, 'Hotlines'), ...st0.pabx.hotlines.map((hl, i) => h('div', { class: 'row' }, btn(hl.name, () => sim.command('pabx.hotline', { index: i }), '', { 'data-act': `hotline-${i}` }), h('span', { class: 'small muted' }, `${hl.a} to ${hl.b}`)))),
      h('div', { class: 'card' }, h('h3', {}, 'Paging into PAGA'), h('div', { class: 'small' }, st0.pabx.pageCodes), h('div', { class: 'row' }, select(zoneOpts, pageCode, (v) => { pageCode = v }), btn('Dial paging code', () => sim.command('pabx.dial', { from, to: pageCode }), '', { 'data-act': 'page' })), ev)),
    h('div', { class: 'card', style: { overflow: 'auto' } }, h('h3', {}, 'Extension directory'), h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', {}, 'Ext'), h('th', {}, 'Telephone'), h('th', {}, 'Area'), h('th', {}, 'Type'), h('th', {}, 'State'), h('th', {}, ''))), dirBody))))
  const ue = eventList(ev, (e) => e.systemId === 'S07' || /PABX/.test(e.text), 8)
  return (st) => {
    for (const [x, td] of rows) { const e = st.pabx.extensions.find((q) => q.ext === x); const s2 = e.fault || e.cardFault ? 'OFF-LINE' : e.state + (e.peer && e.state !== 'idle' ? ` (${e.peer})` : ''); text(td, s2); td.className = e.fault || e.cardFault ? 'high' : e.state !== 'idle' ? 'tag dark' : '' }
    const key = st.pabx.calls.map((c) => c.id + c.state).join()
    if (callBody.dataset.key !== key) { callBody.dataset.key = key; callBody.textContent = ''; if (!st.pabx.calls.length) callBody.append(h('div', { class: 'muted' }, 'No calls')); for (const c of st.pabx.calls) callBody.append(h('div', { class: 'row' }, h('span', { class: 'tag dark' }, c.state), `${c.from} to ${c.to}${c.hotline ? ' (hotline)' : ''}${c.trunk ? ' via ' + c.trunk : ''}${c.reason ? ': ' + c.reason : ''}`)) }
    ue(st)
  }
}

function buildSystem(el, ctx) {
  const { sim } = ctx
  const K = kv([['VSAT link', '', 'v'], ['Eb/No (indicative)', 'dB', 'eb'], ['SIP trunk', '', 'tr'], ['Channels in use', '', 'ch'], ['PSU A / B', '', 'psu']])
  const cards = h('tbody')
  const rows = sim.state.pabx.cards.map((c) => { const td = h('td', {}); cards.append(h('tr', {}, h('td', {}, c.id), h('td', {}, c.name), td, h('td', {}, btn('Fail', () => sim.command('pabx.card', { id: c.id, ok: false })), btn('Replace', () => sim.command('pabx.card', { id: c.id, ok: true }))))); return td })
  el.append(h('div', { class: 'grid g2' },
    h('div', { class: 'card' }, h('h3', {}, 'External connection'), K.el, h('div', { class: 'row' }, btn('VSAT degraded', () => sim.command('pabx.vsat', { link: 'degraded' })), btn('VSAT down', () => sim.command('pabx.vsat', { link: 'down' }), 'warn'), btn('VSAT up', () => sim.command('pabx.vsat', { link: 'up' }))),
      h('div', { class: 'row' }, btn('PSU A fail', () => sim.command('pabx.psu', { which: 'A', ok: false })), btn('PSU A ok', () => sim.command('pabx.psu', { which: 'A', ok: true })))),
    h('div', { class: 'card' }, h('h3', {}, 'Line cards and interfaces'), h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', {}, 'Card'), h('th', {}, 'Function'), h('th', {}, 'State'), h('th', {}, ''))), cards),
      h('p', { class: 'note' }, 'Legacy exchanges use analogue line cards for every phone; IP-PBX retrofits keep analogue cards only where industrial or Ex telephones need them and use IP phones elsewhere.'))))
  return (st) => {
    const X = st.pabx
    K.set('v', X.vsat.link, X.vsat.link !== 'up' ? 'high' : ''); K.set('eb', f1(X.vsat.ebno_db)); K.set('tr', X.trunks[0].status, X.trunks[0].status !== 'registered' ? 'crit' : ''); K.set('ch', `${X.trunks[0].used} / ${X.trunks[0].channels}`); K.set('psu', `${X.psuA ? 'ok' : 'FAIL'} / ${X.psuB ? 'ok' : 'FAIL'}`, X.psuA && X.psuB ? '' : 'high')
    X.cards.forEach((c, i) => { text(rows[i], c.ok ? 'ok' : 'FAILED'); rows[i].className = c.ok ? '' : 'crit' })
  }
}

export function renderMini(canvas, ctx) {
  const X = ctx.sim.state.pabx
  miniFrame(canvas, 'PABX', [{ k: 'Status', v: X.status, alarm: X.status !== 'Normal' ? 'high' : null }, { k: 'Calls', v: String(X.calls.length) }, { k: 'Extensions', v: String(X.extensions.length) }, { k: 'Trunk', v: X.trunks[0].status }])
}
