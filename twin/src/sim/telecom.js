// Telecom and safety communication models: PAGA (S06), PABX (S07), IPTV (S08), CCTV (S09).
// Zones, extensions, set top boxes and cameras are built from the database components so that the 3D
// scene, 2D drawings and HMIs refer to the same equipment ids. EDUCATIONAL SIMULATION.

import { clamp, allNumbers } from './util.js'

const roomName = (db, id) => (db.rooms || []).find((r) => r.id === id)?.name || id || 'Unassigned'

// Tone patterns are REPRESENTATIVE: the project tone schedule and the vessel muster list govern the real signals.
export const TONES = {
  abandon: { name: 'Abandon platform', priority: 0, pattern: 'continuous tone (REPRESENTATIVE)', play: { kind: 'steady', f: 600 } },
  general: { name: 'General alarm', priority: 1, pattern: 'seven or more short signals then one long signal, as commonly used for the general emergency alarm (UNVERIFIED here: confirm against the tone schedule)', play: { kind: 'ga', f: 800 } },
  fire: { name: 'Fire alarm', priority: 2, pattern: 'intermittent tone (REPRESENTATIVE)', play: { kind: 'pulse', f: 1000, on: 0.5, off: 0.5 } },
  gas: { name: 'Gas alarm', priority: 3, pattern: 'warble tone (REPRESENTATIVE)', play: { kind: 'warble', f1: 600, f2: 900, rate: 4 } },
  allclear: { name: 'All clear', priority: 6, pattern: 'steady tone, short (REPRESENTATIVE)', play: { kind: 'steady', f: 440, dur: 4 } },
  test: { name: 'Test tone (reduced level)', priority: 7, pattern: 'periodic low level test tone', play: { kind: 'pulse', f: 700, on: 0.3, off: 1.2 } },
}

// ---------------- PAGA ----------------
export function initPaga(ctx) {
  const { db, state } = ctx
  const comps = db.components || []
  const spk = comps.filter((c) => /loudspeaker|alarm_beacon/.test(c.type))
  const byRoom = {}
  for (const s of spk) (byRoom[s.room || 'R_UNK'] ||= []).push(s)
  let zones = Object.entries(byRoom).map(([room, list], i) => ({
    id: `PZ${String(i + 1).padStart(2, '0')}`, room, name: roomName(db, room), devices: list.map((c) => ({ id: c.id, type: c.type, loop: c.params?.loop || (i % 2 ? 'B' : 'A') })),
  }))
  if (!zones.length) { zones = [{ id: 'PZ01', room: null, name: 'All areas', devices: [] }]; ctx.gap('No loudspeaker components in db: one PAGA zone assumed') }
  const racks = comps.filter((c) => c.type === 'paga_amplifier_rack')
  const sysOf = (c) => (c.params?.system || (/\bB\b|_B$/.test(c.id + ' ' + (c.name || '')) ? 'B' : 'A'))
  const amps = []
  for (const r of racks.length ? racks : [{ id: 'PAGA_A', params: { system: 'A' } }, { id: 'PAGA_B', params: { system: 'B' } }]) {
    const n = r.params?.amplifiers || 4
    for (let i = 1; i <= n; i++) amps.push({ id: `AMP-${sysOf(r)}${i}`, rack: r.id, system: sysOf(r), ok: true, load: 0, temp: 32 })
  }
  if (racks.some((r) => !r.params?.amplifiers)) ctx.gap('PAGA rack A amplifier count not in db: 4 amplifiers assumed')
  zones.forEach((z, i) => {
    z.loops = [...new Set(z.devices.map((d) => d.loop))].sort()
    if (!z.loops.length) z.loops = ['A', 'B']
    const aA = amps.filter((a) => a.system === 'A'), aB = amps.filter((a) => a.system === 'B')
    z.ampA = aA.length ? aA[i % aA.length].id : null; z.ampB = aB.length ? aB[i % aB.length].id : null
    z.loopA = 'ok'; z.loopB = 'ok'; z.active = false; z.impA = 100; z.impB = 100
  })
  const aps = comps.filter((c) => c.type === 'paga_access_panel').map((c) => ({ id: c.id, name: c.name || c.tag, room: c.room, roomName: roomName(db, c.room), keys: c.params?.keys || [] }))
  const mB = ((db.systems || []).find((s) => s.id === 'S06')?.measurements || []).find((m) => /batt/i.test(m.name))
  state.paga = {
    zones, amps, racks: racks.map((r) => ({ id: r.id, name: r.name || r.id, system: sysOf(r) })), accessPanels: aps,
    mode: 'idle', tone: null, source: null, page: null, zonesSel: zones.map((z) => z.id), lastTest: null, volume: 0.12,
    supply: { A: 'mains (UPS)', B: 'mains (ESB)' }, mainsB: true, batt_v: allNumbers(mB?.normal)[1] ?? 27, batt_alarm: allNumbers(mB?.alarm)[0] ?? 24, batt_normal: allNumbers(mB?.normal),
  }
}

export function stepPaga(ctx, dt) {
  const { state } = ctx
  const P = state.paga
  if (P.page && state.t >= P.page.until) { P.page = null; if (P.mode === 'page') P.mode = P.tone ? 'tone' : 'idle' }
  if (P.mode === 'tone' && TONES[P.tone]?.play?.dur && state.t - P.toneT > TONES[P.tone].play.dur) { P.mode = 'idle'; P.tone = null }
  // system B supplied from the emergency switchboard; on mains failure it runs on battery
  P.batt_v = clamp(P.batt_v + (P.mainsB ? 0.05 : -0.01) * dt, 22, P.batt_normal[1] ?? 27.5)
  for (const z of P.zones) {
    const sel = P.zonesSel.includes(z.id)
    z.active = (P.mode === 'tone' && sel) || (P.mode === 'page' && !!P.page && P.page.zones.includes(z.id))
    const has = (l) => z.loops.includes(l)
    const aOk = !has('A') || (z.loopA === 'ok' && P.amps.find((a) => a.id === z.ampA)?.ok !== false)
    const bOk = !has('B') || (z.loopB === 'ok' && P.amps.find((a) => a.id === z.ampB)?.ok !== false && (P.mainsB || P.batt_v > P.batt_alarm))
    z.impA = z.loopA === 'open' ? 999 : z.loopA === 'short' ? 3 : 100
    z.impB = z.loopB === 'open' ? 999 : z.loopB === 'short' ? 3 : 100
    z.coverage = aOk && bOk ? 'full (A and B)' : (has('A') && aOk) || (has('B') && bOk) ? `reduced (loop ${aOk && has('A') ? 'A' : 'B'} only)` : 'NONE'
    for (const l of ['A', 'B']) ctx.alarm('S06', `PAGA_LOOP${l}_${z.id}`, `PAGA loudspeaker line fault, loop ${l}, ${z.name} (${z[`loop${l}`]} circuit)`, z.coverage === 'NONE' ? 'critical' : 'high', z[`loop${l}`] !== 'ok')
  }
  for (const a of P.amps) {
    const zs = P.zones.filter((z) => z.ampA === a.id || z.ampB === a.id)
    a.load = a.ok ? (zs.filter((z) => z.active).length / Math.max(1, zs.length)) * 70 : 0
    a.temp = a.temp + (32 + a.load * 0.3 - a.temp) * Math.min(1, dt * 0.05)
    ctx.alarm('S06', `PAGA_AMP_${a.id}`, `PAGA amplifier ${a.id} failure (system ${a.system}); the other system keeps coverage`, 'high', !a.ok)
  }
  ctx.alarm('S06', 'PAGA_MAINS_B', 'PAGA mains failure, system B (on battery)', 'high', !P.mainsB)
  ctx.alarm('S06', 'PAGA_GA', `${TONES[P.tone]?.name || 'Alarm'} activated (${P.source || ''})`, 'critical', P.mode === 'tone' && ['general', 'abandon', 'fire', 'gas'].includes(P.tone))
  P.status = P.mode === 'tone' ? 'Alarm tone broadcasting' : P.mode === 'page' ? 'Announcement in progress' : P.zones.some((z) => z.coverage !== 'full (A and B)') || P.amps.some((a) => !a.ok) ? 'Fault (degraded, one system)' : !P.mainsB ? 'Battery operation' : 'Idle (supervising)'
}

export function pagaCommands(ctx) {
  const { state } = ctx
  const P = () => state.paga
  return {
    'paga.tone': ({ tone, source = 'CCR access panel', zones }) => {
      const p = P(); const T = TONES[tone]; if (!T) return false
      if (p.mode === 'tone' && TONES[p.tone] && TONES[p.tone].priority < T.priority) { ctx.event('S06', `${T.name} request from ${source} ignored: higher priority ${TONES[p.tone].name} active`, 'low'); return false }
      p.mode = 'tone'; p.tone = tone; p.source = source; p.toneT = state.t
      p.zonesSel = zones && zones.length ? zones.slice() : p.zones.map((z) => z.id)
      if (tone === 'test') p.lastTest = state.t
      ctx.event('S06', `PAGA ${T.name} started (${source}) in ${p.zonesSel.length === p.zones.length ? 'all zones' : p.zonesSel.length + ' zone(s)'}`, tone === 'test' || tone === 'allclear' ? 'low' : 'high')
      return true
    },
    'paga.stop': ({ source = 'operator' } = {}) => { const p = P(); if (p.mode === 'idle') return false; ctx.event('S06', `PAGA ${p.tone ? TONES[p.tone].name : 'page'} stopped (${source})`); p.mode = 'idle'; p.tone = null; p.page = null; p.zonesSel = p.zones.map((z) => z.id); return true },
    'paga.page': ({ zones, from = 'CCR access panel', duration = 8 }) => {
      const p = P()
      if (p.mode === 'tone' && !['test', 'allclear'].includes(p.tone)) { ctx.event('S06', `Page from ${from} blocked: alarm tone has priority`, 'low'); return false }
      const zs = zones && zones.length ? zones : p.zones.map((z) => z.id)
      p.page = { zones: zs, from, until: state.t + duration }; p.mode = 'page'
      ctx.event('S06', `Announcement from ${from} to ${zs.length === p.zones.length ? 'all zones' : zs.map((z) => p.zones.find((q) => q.id === z)?.name || z).join(', ')}`)
      return true
    },
    'paga.zones': ({ zones }) => { P().zonesSel = zones.slice(); return true },
    'paga.fault': ({ zone, room, loop = 'A', kind = 'open' }) => { const p = P(); const z = p.zones.find((x) => x.id === zone || (room && x.room === room)) || p.zones[0]; z[`loop${loop}`] = kind; ctx.event('S06', `Line supervision: ${z.name} loop ${loop} ${kind} circuit`, kind === 'ok' ? 'low' : 'high'); return true },
    'paga.amp': ({ id, ok }) => { const a = P().amps.find((x) => x.id === id); if (!a) return false; a.ok = !!ok; return true },
    'paga.mains': ({ ok }) => { P().mainsB = !!ok; return true },
    'paga.clear_faults': () => { const p = P(); p.zones.forEach((z) => { z.loopA = 'ok'; z.loopB = 'ok' }); p.amps.forEach((a) => { a.ok = true }); p.mainsB = true; return true },
    'paga.volume': ({ v }) => { P().volume = clamp(Number(v), 0, 1); return true },
  }
}

// ---------------- PABX ----------------
export function initPabx(ctx) {
  const { db, state } = ctx
  const phones = (db.components || []).filter((c) => /^telephone_/.test(c.type))
  const ext = phones.map((c, i) => ({ ext: String(c.params?.extension || 201 + i), comp: c.id, tag: c.tag || c.id, name: c.name || c.tag, area: roomName(db, c.room), room: c.room, type: c.type === 'telephone_industrial' ? (c.params?.ex ? `Industrial ${c.params.ex}` : 'Industrial (weatherproof)') : 'Desk IP phone', state: 'idle', peer: null, fault: false }))
  if (ext.length < 2) { ctx.gap('Fewer than 2 telephone components in db: placeholder extensions added'); ext.push({ ext: '290', comp: null, name: 'Placeholder 1', area: '-', state: 'idle', type: 'Desk IP phone' }, { ext: '291', comp: null, name: 'Placeholder 2', area: '-', state: 'idle', type: 'Desk IP phone' }) }
  const find = (room) => ext.find((e) => e.room === room)
  const hot = []
  const br = find('R_BRIDGE'), ccr = find('R_CCR'), ecr = find('R_ECR')
  if (br && ccr) hot.push({ a: br.ext, b: ccr.ext, name: 'Bridge to CCR hotline' })
  if (ccr && ecr) hot.push({ a: ccr.ext, b: ecr.ext, name: 'CCR to ECR hotline' })
  if (!hot.length) hot.push({ a: ext[0].ext, b: ext[1].ext, name: 'Hotline (representative pairing)' })
  const vsat = (db.components || []).find((c) => /vsat/i.test(c.id + ' ' + (c.name || '')))
  state.pabx = {
    extensions: ext, hotlines: hot, calls: [], nextCall: 1, cards: [{ id: 'LC-1', name: 'Analogue line card 1 (Ex phones)', ok: true }, { id: 'LC-2', name: 'Analogue line card 2', ok: true }, { id: 'SIP', name: 'SIP / IP phone interface', ok: true }],
    trunks: [{ id: 'SIP-VSAT', name: `SIP trunk over VSAT${vsat ? ` (${vsat.tag || vsat.id})` : ''}`, status: 'registered', channels: 8, used: 0 }],
    vsat: { link: 'up', ebno_db: 11.5 }, psuA: true, psuB: true, pageCodes: '80 = all call, 81 to 89 = PAGA zone 1 to 9 (REPRESENTATIVE numbering plan)',
  }
  // analogue Ex phones on line cards, desk phones on SIP
  ext.forEach((e, i) => { e.card = /Industrial/.test(e.type) ? (i % 2 ? 'LC-2' : 'LC-1') : 'SIP' })
}

export function stepPabx(ctx, dt) {
  const { state } = ctx
  const X = state.pabx
  for (const e of X.extensions) e.cardFault = X.cards.find((c) => c.id === e.card)?.ok === false
  for (const call of X.calls.slice()) {
    call.t += dt
    const from = X.extensions.find((e) => e.ext === call.from), to = X.extensions.find((e) => e.ext === call.to)
    if (call.state === 'dialing' && call.t > 1) {
      if (call.ext) { const tr = X.trunks.find((t) => t.status === 'registered' && t.used < t.channels); if (!tr) { call.state = 'failed'; call.reason = 'no external trunk available'; if (from) from.state = 'busy' } else { tr.used++; call.trunk = tr.id; call.state = 'ringing'; call.t = 0 } }
      else if (!to || to.fault || to.cardFault) { call.state = 'failed'; call.reason = 'number unobtainable (extension off-line)'; if (from) from.state = 'busy' }
      else if (to.state !== 'idle') { call.state = 'busy'; if (from) from.state = 'busy' }
      else { call.state = 'ringing'; call.t = 0; to.state = 'ringing'; to.peer = call.from }
    }
    if (call.state === 'ringing' && (call.autoAnswer || call.hotline) && call.t > (call.hotline ? 1.5 : 3)) answer(ctx, call)
    if (['busy', 'failed', 'ended'].includes(call.state) && call.t > 4) endCall(ctx, call)
  }
  for (const e of X.extensions) if (!X.calls.some((c) => c.from === e.ext || c.to === e.ext) && e.state !== 'idle' && !e.fault) { e.state = 'idle'; e.peer = null }
  X.vsat.ebno_db = X.vsat.link === 'up' ? 11.5 + Math.sin(state.t / 25) * 0.6 : X.vsat.link === 'degraded' ? 5.2 : 0
  const vs = X.trunks[0]
  vs.status = X.vsat.link === 'down' ? 'unregistered' : 'registered'
  X.status = X.vsat.link === 'down' ? 'External link down' : X.cards.some((c) => !c.ok) ? 'Degraded (card fault)' : X.calls.some((c) => c.emergency) ? 'Emergency call priority' : 'Normal'
  ctx.alarm('S07', 'PABX_TRUNK', 'PABX external link down (SIP trunk over VSAT unregistered)', 'high', vs.status !== 'registered')
  ctx.alarm('S07', 'PABX_PSU', 'PABX power supply A or B failed', 'low', !X.psuA || !X.psuB)
  for (const c of X.cards) ctx.alarm('S07', `PABX_CARD_${c.id}`, `PABX ${c.name} failure`, 'high', !c.ok)
  for (const e of X.extensions) ctx.alarm('S07', `PABX_EXT_${e.ext}`, `Extension ${e.ext} ${e.name} off-line`, 'low', !!e.fault || !!e.cardFault)
}

function answer(ctx, call) {
  const X = ctx.state.pabx
  call.state = 'connected'; call.t = 0
  for (const x of [call.from, call.to]) { const e = X.extensions.find((q) => q.ext === x); if (e) { e.state = 'connected'; e.peer = x === call.from ? call.to : call.from } }
  ctx.event('S07', `Call ${call.from} to ${call.to} connected`)
}
function endCall(ctx, call) {
  const X = ctx.state.pabx
  const i = X.calls.indexOf(call)
  if (i >= 0) X.calls.splice(i, 1)
  if (call.trunk) { const tr = X.trunks.find((t) => t.id === call.trunk); if (tr) tr.used = Math.max(0, tr.used - 1) }
  for (const x of [call.from, call.to]) { const e = X.extensions.find((q) => q.ext === x); if (e && !X.calls.some((c) => c.from === x || c.to === x)) { e.state = 'idle'; e.peer = null } }
}

export function pabxCommands(ctx) {
  const { state } = ctx
  const X = () => state.pabx
  return {
    'pabx.dial': ({ from, to, autoAnswer = true }) => {
      const x = X(); const e = x.extensions.find((q) => q.ext === String(from)); if (!e || e.state !== 'idle' || e.fault || e.cardFault) return false
      const num = String(to)
      if (/^8\d$/.test(num)) { // page code into PAGA: 80 all call, 81.. zone
        const zi = Number(num[1]); const zones = zi === 0 ? null : [state.paga.zones[zi - 1]?.id].filter(Boolean)
        const ok = ctx.command('paga.page', { zones, from: `PABX ext ${from} (${e.name})` })
        ctx.event('S07', `Ext ${from} dialled paging code ${num}: ${ok ? 'routed into PAGA' : 'blocked by PAGA alarm priority'}`)
        return ok
      }
      const call = { id: x.nextCall++, from: String(from), to: num, state: 'dialing', t: 0, autoAnswer, ext: /^9\d+/.test(num) }
      x.calls.push(call); e.state = 'dialing'; e.peer = num
      return true
    },
    'pabx.answer': ({ ext }) => { const c = X().calls.find((q) => q.to === String(ext) && q.state === 'ringing'); if (!c) return false; answer(ctx, c); return true },
    'pabx.hangup': ({ ext }) => { const c = X().calls.find((q) => q.from === String(ext) || q.to === String(ext)); if (!c) return false; c.state = 'ended'; endCall(ctx, c); ctx.event('S07', `Call ${c.from} to ${c.to} ended`); return true },
    'pabx.hotline': ({ index = 0 }) => {
      const x = X(); const h = x.hotlines[index]; if (!h) return false
      const e = x.extensions.find((q) => q.ext === h.a); if (!e || e.state !== 'idle') return false
      x.calls.push({ id: x.nextCall++, from: h.a, to: h.b, state: 'dialing', t: 0.9, hotline: true }); e.state = 'dialing'
      ctx.event('S07', `Hotline ${h.name}: off-hook, automatic ring`)
      return true
    },
    'pabx.vsat': ({ link }) => { if (!['up', 'degraded', 'down'].includes(link)) return false; X().vsat.link = link; ctx.event('S07', `VSAT link ${link}`, link === 'up' ? 'low' : 'high'); return true },
    'pabx.ext_fault': ({ ext, on }) => { const e = X().extensions.find((q) => q.ext === String(ext)); if (!e) return false; e.fault = !!on; e.state = on ? 'fault' : 'idle'; return true },
    'pabx.card': ({ id, ok }) => { const c = X().cards.find((q) => q.id === id); if (!c) return false; c.ok = !!ok; ctx.event('S07', `${c.name} ${ok ? 'restored' : 'FAILED'}`, ok ? 'low' : 'high'); return true },
    'pabx.psu': ({ which = 'A', ok }) => { X()[`psu${which}`] = !!ok; return true },
  }
}

// ---------------- IPTV ----------------
export function initIptv(ctx) {
  const { db, state } = ctx
  const tvs = (db.components || []).filter((c) => c.type === 'tv_display')
  const domes = (db.components || []).filter((c) => c.type === 'satellite_antenna_dome' && c.system === 'S08')
  const SP = (db.systems || []).find((s) => s.id === 'S08')?.sim_params || {}
  const nEnc = SP.encoders || 3
  const dbCh = (SP.channels || []).map((c) => ({ no: c.no, name: c.name, source: c.source }))
  const srcs = [...new Set(dbCh.map((c) => c.source))]
  dbCh.forEach((c) => { c.enc = `ENC-${(srcs.indexOf(c.source) % nEnc) + 1}` })
  const chDefault = [
    { no: 1, name: 'Vessel information and safety', source: 'local playout', enc: 'ENC-1' },
    { no: 2, name: 'Weather and operations', source: 'local playout', enc: 'ENC-1' },
    { no: 3, name: 'News (satellite TVRO)', source: 'satellite', enc: 'ENC-2' },
    { no: 4, name: 'Sport (satellite TVRO)', source: 'satellite', enc: 'ENC-2' },
    { no: 5, name: 'Films (local media server)', source: 'media server', enc: 'ENC-3' },
    { no: 6, name: 'Muster and safety video', source: 'media server', enc: 'ENC-3' },
  ]
  if (!dbCh.length) ctx.gap('IPTV channel line-up not in db: REPRESENTATIVE channels used')
  const ch = (dbCh.length ? dbCh : chDefault).map((c) => ({ ...c, mcast: `239.10.1.${c.no}`, bitrate: SP.stream_bitrate_mbps ?? 6, status: 'ok' }))
  const encNames = dbCh.length ? srcs.map((s, i) => ({ id: `ENC-${i + 1}`, name: `Encoder / streamer ${i + 1} (${s})`, ok: true })) : null
  state.iptv = {
    channels: ch,
    stbs: tvs.map((c, i) => ({ id: `STB-${String(i + 1).padStart(2, '0')}`, comp: c.id, tag: c.tag || c.id, name: c.name || c.tag, area: roomName(db, c.room), room: c.room, size: c.params?.size_in || null, online: true, power: true, channel: 1 + (i % 4), state: 'playing', joinT: 0 })),
    domes: (domes.length ? domes : [{ id: 'TVRO1' }, { id: 'TVRO2' }]).map((d, i) => ({ id: d.id, tag: d.tag || d.id, locked: true, signal_db: 9 - i * 0.5 })),
    activeDome: 0, switchT: -99,
    encoders: Array.from({ length: nEnc }, (_, i) => encNames?.[i] || { id: `ENC-${i + 1}`, name: `Encoder / streamer ${i + 1}`, ok: true }),
    headend: { igmp: true },
  }
}

export function stepIptv(ctx, dt) {
  const { state } = ctx
  const X = state.iptv
  const act = X.domes[X.activeDome]
  if (!act.locked) { const alt = X.domes.findIndex((d) => d.locked); if (alt >= 0) { X.activeDome = alt; X.switchT = state.t; ctx.event('S08', `TVRO ${act.tag} loss of lock: satellite channels moved to ${X.domes[alt].tag}`, 'low') } }
  for (const d of X.domes) d.signal_db = d.locked ? 9 + Math.sin(state.t / 20 + d.signal_db) * 0.3 : 0
  const satOk = X.domes[X.activeDome].locked && state.t - X.switchT > 2
  for (const c of X.channels) {
    const enc = X.encoders.find((e) => e.id === c.enc)
    c.status = !enc.ok ? 'stream down (encoder failure)' : c.source === 'satellite' && !satOk ? (X.domes.some((d) => d.locked) ? 'switching dome' : 'signal loss (no dome locked)') : 'ok'
  }
  for (const s of X.stbs) {
    if (s.state === 'joining') { s.joinT += dt; if (s.joinT > 0.8) s.state = 'playing' }
    const c = X.channels.find((q) => q.no === s.channel)
    s.viewing = !s.online ? 'offline' : !s.power ? 'standby' : s.state === 'joining' ? 'joining multicast group' : !X.headend.igmp ? 'no stream (multicast fault)' : c.status === 'ok' ? 'playing' : c.status
  }
  X.status = X.channels.some((c) => c.status !== 'ok') ? 'Signal loss' : 'Normal'
  for (const d of X.domes) ctx.alarm('S08', `IPTV_DOME_${d.id}`, `TVRO dome ${d.tag} loss of lock`, 'low', !d.locked)
  for (const e of X.encoders) ctx.alarm('S08', `IPTV_ENC_${e.id}`, `IPTV ${e.name} failure`, 'low', !e.ok)
  for (const s of X.stbs) ctx.alarm('S08', `IPTV_STB_${s.id}`, `Display ${s.tag} (${s.area}) offline`, 'low', !s.online)
}

export function iptvCommands(ctx) {
  const { state } = ctx
  const X = () => state.iptv
  return {
    'iptv.channel': ({ stb, ch }) => { const s = X().stbs.find((q) => q.id === stb || q.comp === stb); if (!s || !s.online) return false; const c = X().channels.find((q) => q.no === Number(ch)); if (!c) return false; s.channel = c.no; s.state = 'joining'; s.joinT = 0; s.power = true; return true },
    'iptv.power': ({ stb, on }) => { const s = X().stbs.find((q) => q.id === stb); if (!s) return false; s.power = !!on; return true },
    'iptv.encoder': ({ id, ok }) => { const e = X().encoders.find((q) => q.id === id); if (!e) return false; e.ok = !!ok; return true },
    'iptv.dome': ({ id, locked }) => { const d = X().domes.find((q) => q.id === id) || X().domes[0]; d.locked = !!locked; return true },
    'iptv.igmp': ({ ok }) => { X().headend.igmp = !!ok; return true },
    'iptv.stb_online': ({ stb, on }) => { const s = X().stbs.find((q) => q.id === stb); if (!s) return false; s.online = !!on; return true },
  }
}

// ---------------- CCTV ----------------
export function initCctv(ctx) {
  const { db, state } = ctx
  const cams = (db.components || []).filter((c) => /^cctv_camera/.test(c.type))
  const SPc = (db.systems || []).find((s) => s.id === 'S09')?.sim_params || {}
  state.cctv = {
    cameras: cams.map((c, i) => ({ id: c.id, tag: c.tag || c.id, name: c.name || c.tag, area: roomName(db, c.room), room: c.room, view: c.params?.view || '', ex: c.params?.ex || null, ptz: c.type === 'cctv_camera_ptz', status: 'ok', recording: true, pan: 0, tilt: -10, zoom: 1, preset: 1, seed: i })),
    nvr: { storage_pct: SPc.storage_used_pct ?? 63, retention_days: SPc.retention_days ?? 30, storage_tb: SPc.storage_tb ?? null, fps: SPc.recording_fps ?? null, raid_level: SPc.raid_level ?? null, recording: true, raid: 'healthy', bitrate_mbps: 0, net_pct: 0 },
    selected: cams[0]?.id || null, callup: null,
  }
  const S = (db.systems || []).find((s) => s.id === 'S09')
  const mRec = (S?.measurements || []).find((m) => /storage/i.test(m.name)), mBw = (S?.measurements || []).find((m) => /network/i.test(m.name))
  state.cctvCfg = { rec_alarm: allNumbers(mRec?.alarm)[0] ?? 90, bw_alarm: allNumbers(mBw?.alarm)[0] ?? 80 }
  if (SPc.retention_days == null) ctx.gap('CCTV recorder figures not in db: REPRESENTATIVE values used')
  if (!cams.length) ctx.gap('No CCTV camera components in db')
}

export const PTZ_PRESETS = [
  { n: 1, name: 'Home (overview)', pan: 0, tilt: -10, zoom: 1 },
  { n: 2, name: 'Flare tips', pan: 120, tilt: 25, zoom: 6 },
  { n: 3, name: 'Hose reel / tanker', pan: -150, tilt: -5, zoom: 3 },
  { n: 4, name: 'Laydown area', pan: 60, tilt: -20, zoom: 2 },
]

export function stepCctv(ctx, dt) {
  const { state } = ctx
  const X = state.cctv
  let br = 0
  for (const c of X.cameras) {
    c.recording = X.nvr.recording && c.status === 'ok' && X.nvr.raid !== 'failed'
    if (c.status === 'ok') br += c.ptz ? 8 : 4
    ctx.alarm('S09', `CCTV_${c.status === 'tamper' ? 'TAMPER' : 'VLOSS'}_${c.id}`, `Camera ${c.tag} ${c.status === 'tamper' ? 'tamper (view obstructed or moved)' : 'video loss'}`, 'low', c.status !== 'ok')
  }
  X.nvr.bitrate_mbps = br
  X.nvr.net_pct = Math.min(100, (br / 100) * 100 * 0.6)
  X.nvr.storage_pct = clamp(X.nvr.storage_pct + (X.nvr.recording ? br * dt * 1e-5 : 0), 0, 99)
  ctx.alarm('S09', 'CCTV_NVR_RAID', `Recorder disk failure (array ${X.nvr.raid})`, 'high', X.nvr.raid !== 'healthy')
  ctx.alarm('S09', 'CCTV_NVR_REC', 'NVR recording stopped', 'high', !X.nvr.recording)
  ctx.alarm('S09', 'CCTV_STORE', `Recording storage above ${state.cctvCfg.rec_alarm} %`, 'low', X.nvr.storage_pct > state.cctvCfg.rec_alarm)
  ctx.alarm('S09', 'CCTV_CALLUP', `Alarm call-up: ${X.callup?.reason || ''}`, 'low', !!X.callup && state.t - X.callup.t < 60)
  X.status = X.callup && state.t - X.callup.t < 60 ? 'Alarm call-up' : X.cameras.some((c) => c.status !== 'ok') || X.nvr.raid !== 'healthy' ? 'Degraded' : 'Live view'
}

export function cctvCommands(ctx) {
  const { state } = ctx
  const X = () => state.cctv
  const C = (id) => X().cameras.find((q) => q.id === id || q.tag === id)
  return {
    'cctv.select': ({ cam }) => { const c = C(cam); if (!c) return false; X().selected = c.id; return true },
    'cctv.ptz': ({ cam, dp = 0, dt: dtl = 0, dz = 0 }) => { const c = C(cam); if (!c || !c.ptz || c.status !== 'ok') return false; c.pan = ((c.pan + dp + 540) % 360) - 180; c.tilt = clamp(c.tilt + dtl, -90, 30); c.zoom = clamp(c.zoom * (dz ? Math.pow(1.25, dz) : 1), 1, 20); c.preset = null; return true },
    'cctv.preset': ({ cam, n }) => { const c = C(cam); const P = PTZ_PRESETS.find((p) => p.n === Number(n)); if (!c || !c.ptz || !P) return false; Object.assign(c, { pan: P.pan, tilt: P.tilt, zoom: P.zoom, preset: P.n }); return true },
    'cctv.fault': ({ cam, kind }) => { const c = C(cam); if (!c || !['ok', 'video loss', 'tamper'].includes(kind)) return false; c.status = kind; return true },
    'cctv.nvr': ({ recording, raid }) => { if (recording != null) X().nvr.recording = !!recording; if (raid) X().nvr.raid = raid; return true },
    'cctv.callup': ({ rooms, cam, reason = 'alarm' }) => {
      const x = X()
      const c = cam ? C(cam) : x.cameras.find((q) => rooms?.includes(q.room) && q.ptz) || x.cameras.find((q) => rooms?.includes(q.room))
      if (!c) return false
      x.selected = c.id; x.callup = { cam: c.id, reason, t: state.t }
      ctx.event('S09', `Alarm call-up: camera ${c.tag} to the CCTV desk (${reason})`)
      return true
    },
  }
}
