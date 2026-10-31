// S06 PAGA: access panel (alarm tones, zone selection, live announcement), zones with A/B loop coverage and
// line supervision, amplifier racks A and B, interfaces (ICSS F&G, PABX paging). Tones are generated with
// WebAudio in code (no audio files), muted by default with a low volume.
import { createFrame, h, btn, seg, kv, text, f1, miniFrame, eventList } from './common/ui.js'
import { TONES } from '../sim/telecom.js'

export const meta = { id: 'paga', title: 'PAGA', systems: ['S06'], kind: 'hmi' }

export function mount(container, ctx) {
  const audio = createTonePlayer()
  const fr = createFrame(container, ctx, {
    moduleId: 'paga', systemId: 'S06', title: 'PAGA: public address and general alarm',
    help: 'PAGA broadcasts alarm tones and announcements to every area of the vessel through two independent systems (A and B) with interleaved loudspeaker loops, so one fault never silences an area. The fire and gas system starts the right tone automatically. Sound is off until you press Listen.',
    alarmSystems: ['S06'],
    status: (st, api) => [st.paga.status, st.paga.mode === 'tone' ? 'crit' : st.paga.status.startsWith('Fault') || st.paga.status.startsWith('Battery') ? 'high' : ''],
    tabs: [
      { id: 'panel', label: 'Access panel', build: (el) => buildPanel(el, ctx, audio) },
      { id: 'zones', label: 'Zones and loops', build: (el) => buildZones(el, ctx) },
      { id: 'racks', label: 'Amplifier racks', build: (el) => buildRacks(el, ctx) },
    ],
  })
  const unsub = ctx.sim.subscribe('tick', (_, st) => audio.update(st))
  return { unmount: () => { unsub(); audio.stop(); fr.destroy() }, setVariant: (v) => fr.setVariant(v), frame: fr }
}

function buildPanel(el, ctx, audio) {
  const { sim } = ctx
  const st0 = sim.state
  let zones = st0.paga.zones.map((z) => z.id)
  const zoneBtns = h('div', { class: 'row' })
  const zb = st0.paga.zones.map((z) => { const b = btn(z.name, () => { zones = zones.includes(z.id) ? zones.filter((x) => x !== z.id) : [...zones, z.id]; mark() }, '', { 'data-zone': z.id, title: z.name }); zoneBtns.append(b); return [z.id, b] })
  const mark = () => zb.forEach(([id, b]) => b.classList.toggle('on', zones.includes(id)))
  mark()
  const allZ = btn('All zones', () => { zones = sim.state.paga.zones.map((z) => z.id); mark() })
  const now = h('div', { class: 'big' })
  const listen = btn('Listen (sound off)', () => { audio.toggle(); text(listen, audio.enabled ? 'Mute' : 'Listen (sound off)'); listen.classList.toggle('on', audio.enabled) }, '', { 'data-act': 'listen' })
  const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: audio.volume, oninput: (e) => audio.setVolume(Number(e.target.value)), 'aria-label': 'Volume' })
  const toneBtns = Object.entries(TONES).map(([id, T]) => btn(T.name, () => sim.command('paga.tone', { tone: id, source: 'CCR access panel', zones: id === 'test' || zones.length < sim.state.paga.zones.length ? zones : undefined }), ['general', 'abandon', 'fire', 'gas'].includes(id) ? 'warn' : '', { 'data-tone': id, title: T.pattern }))
  const ev = h('div', {})
  el.append(h('div', { class: 'grid g2' },
    h('div', { class: 'card' }, h('h3', {}, 'Access panel (CCR)'), h('div', { class: 'row' }, 'Broadcasting: ', now),
      h('h4', {}, 'Alarm tones (priority order: abandon, general, fire, gas)'), h('div', { class: 'row' }, ...toneBtns, btn('STOP', () => sim.command('paga.stop', { source: 'CCR access panel' }), 'on', { 'data-act': 'stop' })),
      h('h4', {}, 'Zones for announcements and test'), h('div', { class: 'row' }, allZ), zoneBtns,
      h('h4', {}, 'Live announcement'), h('div', { class: 'row' }, btn('Talk (8 s page)', () => sim.command('paga.page', { zones, from: 'CCR access panel' }), '', { 'data-act': 'page' }), h('span', { class: 'small muted' }, 'Alarm tones have priority over announcements.')),
      h('h4', {}, 'Sound'), h('div', { class: 'row' }, listen, h('span', { class: 'small' }, 'Volume'), vol),
      h('p', { class: 'small muted' }, 'Tone patterns are REPRESENTATIVE; the project tone schedule and muster list define the real signals.')),
    h('div', { class: 'card' }, h('h3', {}, 'PAGA events (including ICSS and PABX triggers)'), ev)))
  const ue = eventList(ev, (e) => ['S06', 'S07'].includes(e.systemId) || /PAGA/.test(e.text), 30)
  return (st) => {
    const P = st.paga
    text(now, P.mode === 'tone' ? `${TONES[P.tone].name} (${P.source})` : P.mode === 'page' ? `Announcement from ${P.page.from}` : 'Idle')
    now.className = 'big ' + (P.mode === 'tone' && P.tone !== 'test' ? 'crit' : '')
    ue(st)
  }
}

function buildZones(el, ctx) {
  const { sim } = ctx
  const body = h('tbody')
  const st0 = sim.state
  const rows = st0.paga.zones.map((z) => {
    const tds = [h('td', {}, z.id), h('td', {}, z.name), h('td', { class: 'small' }, `${z.devices.length} (${z.devices.map((d) => d.type.replace('loudspeaker_', '').replace('alarm_', '')).join(', ')})`), h('td', {}), h('td', {}), h('td', {}), h('td', {}), h('td', {})]
    body.append(h('tr', { 'data-zone': z.id }, ...tds, h('td', {}, btn('Loop A open', () => sim.command('paga.fault', { zone: z.id, loop: 'A', kind: 'open' })), btn('Loop B short', () => sim.command('paga.fault', { zone: z.id, loop: 'B', kind: 'short' })))))
    return tds
  })
  el.append(h('div', { class: 'card', style: { overflow: 'auto' } }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', {}, 'Zone'), h('th', {}, 'Area'), h('th', {}, 'Devices'), h('th', {}, 'Loops'), h('th', {}, 'Loop A'), h('th', {}, 'Loop B'), h('th', {}, 'Coverage'), h('th', {}, 'Active'), h('th', {}, 'Test faults'))), body)),
    h('div', { class: 'row' }, btn('Clear all faults', () => sim.command('paga.clear_faults'), 'on')),
    h('p', { class: 'note' }, 'Line supervision measures each loudspeaker line (impedance against a reference): an open or short circuit is alarmed. Interleaving loops A and B in each area keeps coverage when one loop or amplifier fails.'))
  return (st) => st.paga.zones.forEach((z, i) => {
    const t = rows[i]
    text(t[3], z.loops.join(' + ')); text(t[4], z.loops.includes('A') ? `${z.loopA} (${z.impA === 999 ? 'open' : z.impA + ' %'})` : '-'); text(t[5], z.loops.includes('B') ? `${z.loopB} (${z.impB === 999 ? 'open' : z.impB + ' %'})` : '-')
    t[4].className = z.loopA !== 'ok' ? 'high' : ''; t[5].className = z.loopB !== 'ok' ? 'high' : ''
    text(t[6], z.coverage); t[6].className = z.coverage === 'NONE' ? 'crit' : z.coverage.startsWith('reduced') ? 'high' : ''
    text(t[7], z.active ? 'BROADCASTING' : ''); t[7].className = z.active ? 'tag dark' : ''
  })
}

function buildRacks(el, ctx) {
  const { sim } = ctx
  const st0 = sim.state
  const grid = h('div', { class: 'grid g2' })
  const K = kv([['System A supply', '', 'a'], ['System B supply', '', 'b'], ['Battery (system B)', 'VDC', 'batt']])
  el.append(grid, h('div', { class: 'card', style: { marginTop: '.6em' } }, h('h3', {}, 'Power supplies'), K.el, h('div', { class: 'row' }, btn('Mains failure system B', () => sim.command('paga.mains', { ok: false }), 'warn'), btn('Mains restored', () => sim.command('paga.mains', { ok: true })))))
  const amps = {}
  for (const sysId of ['A', 'B']) {
    const rack = st0.paga.racks.find((r) => r.system === sysId)
    const list = st0.paga.amps.filter((a) => a.system === sysId)
    const card = h('div', { class: 'card' }, h('h3', {}, `System ${sysId} rack ${rack ? rack.name : ''}`))
    for (const a of list) {
      const l = h('span', { class: 'led' }), info = h('span', { class: 'small' })
      card.append(h('div', { class: 'row' }, l, h('b', {}, a.id), info, btn('Fail', () => sim.command('paga.amp', { id: a.id, ok: false })), btn('Repair', () => sim.command('paga.amp', { id: a.id, ok: true }))))
      amps[a.id] = [l, info]
    }
    grid.append(card)
  }
  return (st) => {
    for (const a of st.paga.amps) { const [l, info] = amps[a.id]; l.className = 'led ' + (a.ok ? (a.load > 0 ? 'green' : 'on') : 'red'); text(info, a.ok ? `load ${Math.round(a.load)} %, ${f1(a.temp)} degC` : 'FAILED') }
    K.set('a', st.paga.supply.A); K.set('b', st.paga.mainsB ? st.paga.supply.B : 'MAINS FAILED: on battery', st.paga.mainsB ? '' : 'high'); K.set('batt', f1(st.paga.batt_v), st.paga.batt_v < st.paga.batt_alarm ? 'high' : '')
  }
}

// WebAudio tone generator (patterns in code)
function createTonePlayer() {
  let ac = null, osc = null, gain = null, enabled = false, volume = 0.12, current = null, t0 = 0
  const ensure = () => {
    if (ac) return
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext
    if (!AC) return
    ac = new AC(); osc = ac.createOscillator(); gain = ac.createGain(); gain.gain.value = 0
    osc.type = 'square'; osc.connect(gain); gain.connect(ac.destination); osc.start()
  }
  const level = (on) => { if (gain) gain.gain.setTargetAtTime(on && enabled ? volume * 0.25 : 0, ac.currentTime, 0.01) }
  return {
    get enabled() { return enabled }, get volume() { return volume },
    toggle() { enabled = !enabled; if (enabled) { ensure(); ac && ac.resume && ac.resume() } else level(false) },
    setVolume(v) { volume = v },
    stop() { enabled = false; level(false); try { ac && ac.close() } catch (e) { /* ignore */ } ac = null },
    update(st) {
      if (!enabled || !ac) return
      const P = st.paga
      const tone = P.mode === 'tone' ? P.tone : P.mode === 'page' ? 'page' : null
      if (tone !== current) { current = tone; t0 = ac.currentTime }
      if (!tone) { level(false); return }
      const t = ac.currentTime - t0
      if (tone === 'page') { osc.frequency.setTargetAtTime(300 + 120 * Math.sin(t * 9), ac.currentTime, 0.02); level(true); return }
      const pl = TONES[tone].play
      let on = true, f = pl.f || 800
      if (pl.kind === 'ga') { const c = t % 12; on = c < 7 ? c % 1 < 0.5 : c < 10 } // short signals then one long signal
      else if (pl.kind === 'pulse') on = t % (pl.on + pl.off) < pl.on
      else if (pl.kind === 'warble') f = Math.floor(t * pl.rate) % 2 ? pl.f1 : pl.f2
      osc.frequency.setTargetAtTime(f, ac.currentTime, 0.005)
      level(on)
    },
  }
}

export function renderMini(canvas, ctx) {
  const st = ctx.sim.state
  const P = st.paga
  miniFrame(canvas, 'PAGA', [{ k: 'Status', v: P.status, alarm: P.mode === 'tone' ? 'critical' : null }, { k: 'Tone', v: P.tone ? TONES[P.tone].name : '-' }, { k: 'Zones', v: String(P.zones.length) }, { k: 'Faults', v: String(P.zones.filter((z) => z.coverage !== 'full (A and B)').length + P.amps.filter((a) => !a.ok).length), alarm: P.amps.some((a) => !a.ok) ? 'high' : null }])
}
