// S08 IPTV: headend (TVRO domes, encoders), channel line-up with multicast groups, set top boxes by area,
// channel change on a selected TV with a procedural preview.
import { createFrame, h, btn, text, f1, miniFrame, select } from './common/ui.js'

export const meta = { id: 'iptv', title: 'IPTV', systems: ['S08'], kind: 'hmi' }

export function mount(container, ctx) {
  const fr = createFrame(container, ctx, {
    moduleId: 'iptv', systemId: 'S08', title: 'IPTV: television distribution',
    help: 'Satellite TV and local channels (for example safety information) are encoded into network streams. Each television joins only the stream it shows (multicast), so the network carries each channel once. Two satellite domes avoid loss of picture when one is blocked by the masts.',
    alarmSystems: ['S08'],
    legacyToggle: false,
    status: (st, api) => [st.iptv.status, st.iptv.status === 'Normal' ? '' : 'high'],
    tabs: [{ id: 'head', label: 'Headend and TVs', build: (el) => build(el, ctx) }],
  })
  return { unmount: () => fr.destroy(), setVariant: (v) => fr.setVariant(v), frame: fr }
}

function build(el, ctx) {
  const { sim } = ctx
  const st0 = sim.state
  let stb = st0.iptv.stbs[0]?.id
  const chBody = h('tbody'), stbBody = h('tbody'), domes = h('div', {}), encs = h('div', {})
  const chRows = st0.iptv.channels.map((c) => { const td = h('td', {}); chBody.append(h('tr', {}, h('td', {}, c.no), h('td', {}, c.name), h('td', { class: 'small' }, c.source), h('td', { class: 'small' }, c.mcast), h('td', {}, c.enc), td)); return td })
  const stbRows = st0.iptv.stbs.map((sb) => { const td = h('td', {}), ch = h('td', {}); stbBody.append(h('tr', { 'data-stb': sb.id }, h('td', {}, sb.tag), h('td', { class: 'small' }, sb.area), ch, td)); return [ch, td] })
  const canvas = h('canvas', { style: { width: '100%', height: '14em', background: '#111' }, 'aria-label': 'TV preview' })
  const chBtns = h('div', { class: 'row' }, ...st0.iptv.channels.map((c) => btn(`${c.no}`, () => sim.command('iptv.channel', { stb, ch: c.no }), '', { 'data-ch': c.no, title: c.name })))
  const domeRows = st0.iptv.domes.map((d) => { const t = h('span', { class: 'tag' }); domes.append(h('div', { class: 'row' }, h('b', {}, d.tag), t, btn('Block (loss of lock)', () => sim.command('iptv.dome', { id: d.id, locked: false })), btn('Restore', () => sim.command('iptv.dome', { id: d.id, locked: true })))); return [d.id, t] })
  const encRows = st0.iptv.encoders.map((e) => { const t = h('span', { class: 'tag' }); encs.append(h('div', { class: 'row' }, h('b', {}, e.id), h('span', { class: 'small' }, e.name), t, btn('Fail', () => sim.command('iptv.encoder', { id: e.id, ok: false })), btn('Repair', () => sim.command('iptv.encoder', { id: e.id, ok: true })))); return [e.id, t] })
  el.append(h('div', { class: 'grid g2' },
    h('div', { class: 'grid' }, h('div', { class: 'card' }, h('h3', {}, 'Satellite domes (TVRO)'), domes), h('div', { class: 'card' }, h('h3', {}, 'Encoders / streamers'), encs),
      h('div', { class: 'card' }, h('h3', {}, 'Channels'), h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', {}, 'No'), h('th', {}, 'Channel'), h('th', {}, 'Source'), h('th', {}, 'Multicast'), h('th', {}, 'Encoder'), h('th', {}, 'Status'))), chBody))),
    h('div', { class: 'grid' }, h('div', { class: 'card' }, h('h3', {}, 'Selected TV ', select(st0.iptv.stbs.map((x) => [x.id, `${x.tag} (${x.area})`]), stb, (v) => { stb = v })), canvas, h('div', { class: 'small muted' }, 'Channel'), chBtns),
      h('div', { class: 'card' }, h('h3', {}, 'Televisions'), h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', {}, 'TV'), h('th', {}, 'Area'), h('th', {}, 'Channel'), h('th', {}, 'State'))), stbBody)))))
  return (st) => {
    const X = st.iptv
    X.channels.forEach((c, i) => { text(chRows[i], c.status); chRows[i].className = c.status === 'ok' ? '' : 'high' })
    X.stbs.forEach((sb, i) => { text(stbRows[i][0], `${sb.channel}`); text(stbRows[i][1], sb.viewing); stbRows[i][1].className = sb.viewing === 'playing' ? '' : 'high' })
    for (const [id, t] of domeRows) { const d = X.domes.find((q) => q.id === id); text(t, d.locked ? `locked ${f1(d.signal_db)} dB${X.domes[X.activeDome].id === id ? ' (active)' : ''}` : 'LOSS OF LOCK'); t.className = 'tag ' + (d.locked ? (X.domes[X.activeDome].id === id ? 'dark' : '') : 'high') }
    for (const [id, t] of encRows) { const e = X.encoders.find((q) => q.id === id); text(t, e.ok ? 'streaming' : 'FAILED'); t.className = 'tag ' + (e.ok ? '' : 'high') }
    const s = X.stbs.find((q) => q.id === stb)
    if (s) drawTv(canvas, s, X.channels.find((c) => c.no === s.channel), st.t)
  }
}

function drawTv(canvas, s, ch, t) {
  const w = canvas.clientWidth || 400, hh = canvas.clientHeight || 220
  if (canvas.width !== w) { canvas.width = w; canvas.height = hh }
  const g = canvas.getContext('2d')
  if (s.viewing !== 'playing') {
    g.fillStyle = '#202020'; g.fillRect(0, 0, w, hh); g.fillStyle = '#e0e0e0'; g.font = '20px Segoe UI, Arial'; g.fillText(s.viewing === 'joining multicast group' ? 'Joining stream...' : `No signal: ${s.viewing}`, 20, hh / 2); return
  }
  const hue = (ch.no * 53) % 360
  const grd = g.createLinearGradient(0, 0, w, hh); grd.addColorStop(0, `hsl(${hue},35%,30%)`); grd.addColorStop(1, `hsl(${(hue + 40) % 360},35%,18%)`)
  g.fillStyle = grd; g.fillRect(0, 0, w, hh)
  g.fillStyle = 'rgba(255,255,255,0.12)'
  for (let i = 0; i < 6; i++) { const x = ((t * 20 + i * 90) % (w + 120)) - 60; g.beginPath(); g.arc(x, hh * 0.6 + Math.sin(t + i) * 20, 30 + i * 6, 0, Math.PI * 2); g.fill() }
  g.fillStyle = '#ffffff'; g.font = 'bold 22px Segoe UI, Arial'; g.fillText(`${ch.no}  ${ch.name}`, 16, 32)
  g.font = '16px Segoe UI, Arial'; g.fillText(`${s.tag}  ${s.area}  stream ${ch.mcast}`, 16, hh - 14)
}

export function renderMini(canvas, ctx) {
  const X = ctx.sim.state.iptv
  miniFrame(canvas, 'IPTV headend', [{ k: 'Status', v: X.status, alarm: X.status !== 'Normal' ? 'high' : null }, { k: 'Channels', v: `${X.channels.filter((c) => c.status === 'ok').length} / ${X.channels.length}` }, { k: 'Active dome', v: X.domes[X.activeDome].tag }, { k: 'TVs online', v: `${X.stbs.filter((s) => s.online).length}` }])
}
