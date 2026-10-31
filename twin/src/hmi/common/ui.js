// Shared HMI framework: high performance HMI styling (ISA-101 style greys, colour only for abnormal states),
// frame with banner, help line, tabs, legacy/retrofit toggle, scenario bar, alarm strip, widgets and charts.
// Every value shown comes from ctx.sim.state at render time (no copies of simulation values are kept).

export const BANNER = 'EDUCATIONAL SIMULATION: not live vessel control, not OEM logic'

const CSS = `
.hmi-root{--bg:#c8cbcf;--panel:#dcdee1;--panel2:#e8e9eb;--line:#8a8f96;--ink:#1f2328;--ink2:#4a5058;--dim:#6d737b;--live:#2b3036;--crit:#c62828;--high:#e0a100;--low:#3f7fd1;--ok:#2e7d32;--sel:#0b5cad;
  font-family:"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:clamp(16px,1.02vw,22px);color:var(--ink);background:var(--bg);display:flex;flex-direction:column;height:100%;min-height:0;box-sizing:border-box;line-height:1.3}
.hmi-root *{box-sizing:border-box}
.hmi-root .hmi-banner{background:#3a3f45;color:#f4f4f4;font-weight:600;letter-spacing:.02em;padding:.3em .8em;font-size:.875em;display:flex;gap:1em;align-items:center}
.hmi-root .hmi-banner b{color:#ffd54f}
.hmi-root .hmi-head{display:flex;align-items:center;gap:.8em;padding:.45em .8em;background:var(--panel);border-bottom:1px solid var(--line);flex-wrap:wrap}
.hmi-root .hmi-title{font-size:1.15em;font-weight:700}
.hmi-root .hmi-sub{color:var(--ink2);font-size:.9em}
.hmi-root .hmi-sp{flex:1}
.hmi-root .hmi-help{padding:.35em .8em;background:var(--panel2);border-bottom:1px solid var(--line);font-size:.9em;color:var(--ink2)}
.hmi-root .hmi-help b{color:var(--ink)}
.hmi-root .hmi-tabs{display:flex;gap:2px;padding:.3em .5em 0;background:var(--bg);flex-wrap:wrap}
.hmi-root .hmi-tab{border:1px solid var(--line);border-bottom:none;background:#b9bdc2;color:var(--ink);padding:.4em .9em;font:inherit;font-size:.95em;cursor:pointer;border-radius:4px 4px 0 0;min-height:2.3em}
.hmi-root .hmi-tab[aria-selected="true"]{background:var(--panel);font-weight:700}
.hmi-root .hmi-body{flex:1;min-height:0;overflow:auto;background:var(--panel);border-top:1px solid var(--line);padding:.7em}
.hmi-root .hmi-alarmstrip{display:flex;gap:.5em;align-items:center;padding:.3em .8em;background:var(--panel2);border-top:1px solid var(--line);font-size:.9em;min-height:2.2em;overflow:hidden;white-space:nowrap}
.hmi-root .hmi-btn{font:inherit;font-size:.95em;border:1px solid #6b7178;background:linear-gradient(#f3f4f5,#d9dbde);color:var(--ink);padding:.35em .8em;border-radius:4px;cursor:pointer;min-height:2.2em;min-width:2.4em}
.hmi-root .hmi-btn:hover{border-color:var(--sel)}
.hmi-root .hmi-btn:active{background:#cfd2d6}
.hmi-root .hmi-btn[disabled]{opacity:.45;cursor:not-allowed}
.hmi-root .hmi-btn.on{background:#43494f;color:#fff;border-color:#2b3036}
.hmi-root .hmi-btn.warn{border-color:var(--crit);color:var(--crit);font-weight:700}
.hmi-root .hmi-btn.estop{background:#c62828;color:#fff;border-radius:50%;width:3.6em;height:3.6em;font-weight:800;border:3px solid #ffd54f}
.hmi-root .hmi-seg{display:inline-flex;border:1px solid #6b7178;border-radius:4px;overflow:hidden}
.hmi-root .hmi-seg .hmi-btn{border:none;border-radius:0;border-right:1px solid #9aa0a6}
.hmi-root .hmi-seg .hmi-btn:last-child{border-right:none}
.hmi-root .grid{display:grid;gap:.7em}
.hmi-root .g2{grid-template-columns:repeat(2,minmax(0,1fr))}.hmi-root .g3{grid-template-columns:repeat(3,minmax(0,1fr))}.hmi-root .g4{grid-template-columns:repeat(4,minmax(0,1fr))}
.hmi-root .card{background:var(--panel2);border:1px solid var(--line);border-radius:4px;padding:.55em .7em;min-width:0}
.hmi-root .card h3{margin:0 0 .4em;font-size:1em;font-weight:700;display:flex;gap:.5em;align-items:center}
.hmi-root .card h4{margin:.5em 0 .3em;font-size:.95em;color:var(--ink2)}
.hmi-root .row{display:flex;gap:.5em;align-items:center;flex-wrap:wrap}
.hmi-root .kv{display:grid;grid-template-columns:auto 1fr auto;gap:.15em .6em;align-items:baseline}
.hmi-root .kv .k{color:var(--ink2);font-size:.92em}
.hmi-root .kv .v{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
.hmi-root .kv .u{color:var(--dim);font-size:.875em}
.hmi-root .big{font-size:1.6em;font-weight:700;font-variant-numeric:tabular-nums}
.hmi-root .muted{color:var(--dim)}
.hmi-root .small{font-size:.875em}
.hmi-root table.t{border-collapse:collapse;width:100%;font-size:.92em}
.hmi-root table.t th,.hmi-root table.t td{border-bottom:1px solid #b5b9be;padding:.25em .4em;text-align:left;vertical-align:top}
.hmi-root table.t th{background:#cfd2d6;font-weight:700;position:sticky;top:0}
.hmi-root table.t td.n{text-align:right;font-variant-numeric:tabular-nums}
.hmi-root .tag{display:inline-block;padding:.05em .45em;border-radius:3px;border:1px solid var(--line);background:#eceef0;font-size:.875em;white-space:nowrap}
.hmi-root .tag.crit,.hmi-root .crit{background:var(--crit);color:#fff;border-color:#8e1c1c}
.hmi-root .tag.high,.hmi-root .high{background:var(--high);color:#1d1d1d;border-color:#8a6400}
.hmi-root .tag.low{background:var(--low);color:#fff;border-color:#2a5895}
.hmi-root .tag.dark{background:#43494f;color:#fff;border-color:#2b3036}
.hmi-root .tag.ok{background:#eceef0}
.hmi-root .blink{animation:hmi-blink 1.2s ease-in-out infinite}
@keyframes hmi-blink{50%{opacity:.4}}
.hmi-root .bar{position:relative;height:1.05em;background:#f4f5f6;border:1px solid #9aa0a6;border-radius:2px;overflow:hidden}
.hmi-root .bar>i{position:absolute;left:0;top:0;bottom:0;background:#6b7178}
.hmi-root .bar>b{position:absolute;top:-2px;bottom:-2px;width:2px;background:var(--crit)}
.hmi-root .led{display:inline-block;width:1em;height:1em;border-radius:50%;border:1px solid #555;background:#9ea3a8;vertical-align:middle}
.hmi-root .led.on{background:#f4f4f4;box-shadow:0 0 0 2px #43494f inset}
.hmi-root .led.red{background:#e53935;box-shadow:0 0 6px #e53935}
.hmi-root .led.amber{background:#ffb300;box-shadow:0 0 6px #ffb300}
.hmi-root .led.green{background:#43a047;box-shadow:0 0 6px #43a047}
.hmi-root .led.blue{background:#1e88e5;box-shadow:0 0 6px #1e88e5}
.hmi-root svg{max-width:100%;height:auto;display:block;margin:0 auto}
.hmi-root .card>svg{max-height:62vh}
.hmi-root .card>svg.full{max-height:none}
@media (max-width:760px){.hmi-root .grid{grid-template-columns:minmax(0,1fr) !important}.hmi-root .hmi-help{font-size:.875em}}
.hmi-root svg text{font-family:inherit}
.hmi-root .clickable{cursor:pointer}
.hmi-root input[type=range]{width:100%;min-width:8em}
.hmi-root select{font:inherit;font-size:.95em;padding:.25em;min-height:2.1em}
.hmi-root .scen{display:flex;flex-direction:column;gap:.4em}
.hmi-root .scen .card{display:flex;gap:.8em;align-items:flex-start}
.hmi-root .note{background:#f2f0e6;border-left:4px solid #8a8f96;padding:.4em .6em;font-size:.9em}
.hmi-root.legacy{--bg:#9da3a8;--panel:#b6bbbf;--panel2:#c7cbce;font-family:"Courier New",Consolas,monospace}
.hmi-root.legacy .hmi-title::after{content:"  LEGACY VIEW";color:#7a2f00;font-size:.8em}
.hmi-root .lcd{background:#1d2a1f;color:#b9f6c2;font-family:Consolas,"Courier New",monospace;padding:.5em .7em;border-radius:4px;border:3px solid #3b3f44}
.hmi-root .lcd .kv .k,.hmi-root .lcd .kv .u{color:#7fcf8c}
.hmi-root .flex1{flex:1}
`

let styled = false
export function injectStyles(doc = document) {
  if (styled && doc.getElementById('hmi-style')) return
  const s = doc.createElement('style')
  s.id = 'hmi-style'
  s.textContent = CSS
  doc.head.appendChild(s)
  styled = true
}

// ---------- DOM helpers ----------
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag)
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue
    if (k === 'class') el.className = v
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v)
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v)
    else if (k === 'html') el.innerHTML = v
    else el.setAttribute(k, v === true ? '' : v)
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)))
  return el
}
const SVGNS = 'http://www.w3.org/2000/svg'
export function s(tag, attrs, ...kids) {
  const el = document.createElementNS(SVGNS, tag)
  if (attrs) for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v); else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v); else el.setAttribute(k, v) }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)))
  return el
}
export const btn = (label, onclick, cls = '', attrs = {}) => h('button', { class: `hmi-btn ${cls}`, type: 'button', onclick, ...attrs }, label)
export function seg(options, current, onPick, attrs = {}) {
  const wrap = h('span', { class: 'hmi-seg', ...attrs })
  const bs = options.map(([val, label]) => { const b = btn(label, () => onPick(val), '', { 'data-val': val }); wrap.append(b); return b })
  wrap.set = (v) => bs.forEach((b) => b.classList.toggle('on', b.dataset.val === String(v)))
  wrap.set(current)
  return wrap
}
export function select(options, current, onPick) {
  const el = h('select', { onchange: (e) => onPick(e.target.value) })
  for (const [v, l] of options) el.append(h('option', { value: v, selected: String(v) === String(current) ? true : null }, l))
  return el
}
export function kv(rows) {
  // rows: [label, unit, key] -> returns {el, set(key, text, cls)}
  const el = h('div', { class: 'kv' })
  const cells = {}
  for (const [label, unit, key] of rows) { const v = h('span', { class: 'v' }, '-'); el.append(h('span', { class: 'k' }, label), v, h('span', { class: 'u' }, unit || '')); cells[key || label] = v }
  return { el, set(key, text, cls) { const c = cells[key]; if (!c) return; if (c.textContent !== String(text)) c.textContent = text; c.className = 'v' + (cls ? ' ' + cls : '') } }
}
export function bar(maxVal, alarmAt) {
  const fill = h('i'), el = h('div', { class: 'bar' }, fill)
  let mark = null
  if (alarmAt != null) { mark = h('b'); el.append(mark); mark.style.left = `${Math.min(100, (100 * alarmAt) / maxVal)}%` }
  return { el, set(v, abnormal) { fill.style.width = `${Math.max(0, Math.min(100, (100 * v) / maxVal))}%`; fill.style.background = abnormal === 'crit' ? 'var(--crit)' : abnormal === 'high' ? 'var(--high)' : '#6b7178' } }
}
export const led = () => h('span', { class: 'led' })
export function setLed(el, color) { const c = 'led' + (color ? ' ' + color : ''); if (el.className !== c) el.className = c }
export function text(el, t) { const v = String(t); if (el.textContent !== v) el.textContent = v }

// ---------- formatting ----------
export const f0 = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString('en-GB') : '-')
export const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '-')
export const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '-')
export const f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : '-')
export const sevCls = (s) => (s === 'critical' ? 'crit' : s === 'high' ? 'high' : 'low')

// ---------- charts ----------
// series: [{values:[...], label, color?, dash?}]; draws on a canvas sized to its CSS box
export function drawTrend(canvas, series, opts = {}) {
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1)
  const w = canvas.clientWidth || canvas.width, hh = canvas.clientHeight || canvas.height
  if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(hh * dpr) }
  const g = canvas.getContext('2d')
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.fillStyle = '#f4f5f6'; g.fillRect(0, 0, w, hh)
  const all = series.flatMap((s) => s.values).filter(Number.isFinite)
  let min = opts.min ?? Math.min(...all), max = opts.max ?? Math.max(...all)
  if (!all.length) { min = 0; max = 1 }
  if (max - min < (opts.minSpan || 1e-6)) { const m = (max + min) / 2; min = m - (opts.minSpan || 1) / 2; max = m + (opts.minSpan || 1) / 2 }
  const L = 56, R = 8, T = 10, B = 22
  const X = (i, n) => L + ((w - L - R) * i) / Math.max(1, n - 1)
  const Y = (v) => T + (hh - T - B) * (1 - (v - min) / (max - min))
  g.strokeStyle = '#c3c7cc'; g.lineWidth = 1; g.fillStyle = '#4a5058'; g.font = '14px Segoe UI, Arial'
  for (let k = 0; k <= 4; k++) { const v = min + ((max - min) * k) / 4; const y = Y(v); g.beginPath(); g.moveTo(L, y); g.lineTo(w - R, y); g.stroke(); g.fillText(fmtAxis(v), 4, y + 4) }
  for (const ln of opts.lines || []) { g.strokeStyle = ln.color || '#c62828'; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(L, Y(ln.v)); g.lineTo(w - R, Y(ln.v)); g.stroke(); g.setLineDash([]); g.fillStyle = ln.color || '#c62828'; g.fillText(ln.label || '', w - R - 120, Y(ln.v) - 3) }
  const cols = ['#1f2328', '#0b5cad', '#7a4b00', '#5b2c83', '#00796b']
  series.forEach((s, i) => {
    const vs = s.values; if (!vs.length) return
    g.strokeStyle = s.color || cols[i % cols.length]; g.lineWidth = 2; g.setLineDash(s.dash || [])
    g.beginPath(); vs.forEach((v, j) => { const x = X(j, vs.length), y = Y(v); j ? g.lineTo(x, y) : g.moveTo(x, y) }); g.stroke(); g.setLineDash([])
  })
  if (opts.xlabel) { g.fillStyle = '#4a5058'; g.fillText(opts.xlabel, L, hh - 5) }
  let lx = L + 6
  series.forEach((s, i) => { if (!s.label) return; g.fillStyle = s.color || cols[i % cols.length]; g.fillRect(lx, T + 2, 14, 4); g.fillStyle = '#1f2328'; g.fillText(s.label, lx + 18, T + 9); lx += g.measureText(s.label).width + 36 })
}
function fmtAxis(v) { const a = Math.abs(v); return a >= 1000 ? Math.round(v).toString() : a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2) }

// analogue meter (legacy views): returns svg with set(value)
export function meter(label, unit, min, max, alarm) {
  const g = s('g')
  const svg = s('svg', { viewBox: '0 0 120 84', width: '100%', role: 'img', 'aria-label': `${label} meter` }, s('rect', { x: 1, y: 1, width: 118, height: 82, rx: 6, fill: '#f1ede2', stroke: '#5a5a5a' }), g)
  const ang = (v) => Math.PI * (1.15 - 1.3 * ((v - min) / (max - min)))
  for (let k = 0; k <= 10; k++) { const a = ang(min + ((max - min) * k) / 10); const r1 = 44, r2 = k % 5 ? 39 : 35; g.append(s('line', { x1: 60 + r1 * Math.cos(a), y1: 66 - r1 * Math.sin(a), x2: 60 + r2 * Math.cos(a), y2: 66 - r2 * Math.sin(a), stroke: '#333', 'stroke-width': 1 })) }
  if (alarm != null) { const a = ang(alarm); g.append(s('circle', { cx: 60 + 44 * Math.cos(a), cy: 66 - 44 * Math.sin(a), r: 2.5, fill: '#c62828' })) }
  g.append(s('text', { x: 60, y: 80, 'text-anchor': 'middle', 'font-size': 9, fill: '#222' }, `${label} ${unit}`))
  g.append(s('text', { x: 14, y: 62, 'font-size': 8, fill: '#444' }, String(min)), s('text', { x: 106, y: 62, 'font-size': 8, fill: '#444', 'text-anchor': 'end' }, String(max)))
  const needle = s('line', { x1: 60, y1: 66, x2: 60, y2: 24, stroke: '#111', 'stroke-width': 2 })
  g.append(needle, s('circle', { cx: 60, cy: 66, r: 3, fill: '#111' }))
  svg.set = (v) => { const a = ang(Math.max(min, Math.min(max, v))); needle.setAttribute('x2', 60 + 42 * Math.cos(a)); needle.setAttribute('y2', 66 - 42 * Math.sin(a)) }
  return svg
}

// ---------- frame ----------
// opts: { systemId, title, help, tabs: [{id, label, build(el, api) -> update()}], legacyToggle: true }
export function createFrame(container, ctx, opts) {
  injectStyles(container.ownerDocument || document)
  const { sim, db } = ctx
  const sys = (db.systems || []).find((x) => x.id === opts.systemId)
  const inHost = !!(container.closest && container.closest('#hmiwin'))
  const root = h('div', { class: 'hmi-root', 'data-module': opts.moduleId || '' })
  if (!inHost) root.append(h('div', { class: 'hmi-banner', role: 'note' }, h('b', {}, 'EDUCATIONAL SIMULATION'), 'not live vessel control, not OEM logic. Representative values from the project database.'))
  const variantSeg = opts.legacyToggle === false ? null : seg([['legacy', 'Legacy'], ['retrofit', 'Retrofit']], sim.state.variant?.[opts.systemId] || ctx.variant || 'retrofit', (v) => api.setVariant(v, true), { title: 'Compare the legacy installation with the retrofit', 'data-act': 'variant' })
  const clock = h('span', { class: 'tag dark', title: 'Simulation clock' }, '')
  const status = h('span', { class: 'tag' }, '')
  const head = h('div', { class: 'hmi-head' },
    h('span', { class: 'tag dark' }, sys ? String(sys.number).padStart(2, '0') : ''),
    h('div', {}, h('div', { class: 'hmi-title' }, opts.title || sys?.name || ''), h('div', { class: 'hmi-sub' }, opts.subtitle || sys?.short || '')),
    h('span', { class: 'hmi-sp' }), status, variantSeg, clock)
  const help = h('div', { class: 'hmi-help' }, h('b', {}, 'What am I looking at? '), opts.help || sys?.summary || '')
  const tabsEl = h('div', { class: 'hmi-tabs', role: 'tablist' })
  const body = h('div', { class: 'hmi-body', role: 'tabpanel' })
  const strip = h('div', { class: 'hmi-alarmstrip', 'aria-live': 'polite' })
  root.append(head, help, tabsEl, body, strip)
  container.append(root)
  const tabs = [...opts.tabs]
  if (opts.retrofitTab !== false && sys) tabs.push({ id: 'retrofit', label: 'Legacy vs retrofit', build: (el) => buildRetrofitTab(el, sys) })
  if (opts.scenarioTab !== false && sys) tabs.push({ id: 'scenarios', label: 'Scenarios', build: (el) => buildScenarioTab(el, ctx, opts.systemId, () => api.select(tabs[0].id)) })
  let current = null, updater = null
  const tabBtns = tabs.map((t) => { const b = h('button', { class: 'hmi-tab', role: 'tab', 'data-tab': t.id, onclick: () => api.select(t.id) }, t.label); tabsEl.append(b); return b })
  const api = {
    root, body, sys,
    select(id) {
      const t = tabs.find((x) => x.id === id) || tabs[0]
      current = t.id
      tabBtns.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === current)))
      body.textContent = ''
      const el = h('div', {})
      body.append(el)
      try { updater = t.build(el, api) || null } catch (e) { console.error('[hmi] tab build failed', e); el.append(h('p', {}, 'This page could not be built.')); updater = null }
      api.refresh()
    },
    refresh() {
      const st = sim.state
      text(clock, st.clock || '')
      if (opts.status) { const [t, c] = opts.status(st, api); text(status, t); status.className = 'tag ' + (c || '') } else status.style.display = 'none'
      updateStrip(strip, st, opts.alarmSystems || [opts.systemId])
      try { updater && updater(st) } catch (e) { console.error('[hmi] update failed', e); updater = null }
    },
    setVariant(v, fromUser) {
      if (!['legacy', 'retrofit'].includes(v)) return
      if (fromUser || sim.state.variant?.[opts.systemId] !== v) sim.command('variant.set', { systemId: opts.systemId, variant: v })
      variantSeg && variantSeg.set(v)
      root.classList.toggle('legacy', v === 'legacy')
      if (opts.onVariant) opts.onVariant(v)
      if (current) api.select(current)
    },
    get variant() { return sim.state.variant?.[opts.systemId] || 'retrofit' },
    tab: () => current,
  }
  root.classList.toggle('legacy', api.variant === 'legacy')
  if (opts.init) opts.init(api)
  api.select(opts.initialTab || tabs[0].id)
  let last = 0
  const unsub = sim.subscribe('tick', () => { const now = Date.now(); if (now - last < 240) return; last = now; api.refresh() })
  const timer = sim.running ? null : setInterval(() => api.refresh(), 500) // keeps the page alive when the sim is paused
  api.destroy = () => { unsub && unsub(); timer && clearInterval(timer); root.remove() }
  return api
}

function updateStrip(strip, st, systems) {
  const list = st.alarms.filter((a) => a.active && systems.includes(a.systemId) && !(a.shelvedUntil > st.t))
  const key = list.map((a) => a.id + a.acked).join('|')
  if (strip.dataset.key === key) return
  strip.dataset.key = key
  strip.textContent = ''
  if (!list.length) { strip.append(h('span', { class: 'muted' }, 'No active alarms for this system')); return }
  strip.append(h('b', {}, `${list.length} active alarm${list.length > 1 ? 's' : ''}:`))
  for (const a of list.slice(0, 4)) strip.append(h('span', { class: `tag ${sevCls(a.severity)}${a.acked ? '' : ' blink'}` }, `${a.dbCode ? a.dbCode + ' ' : ''}${a.liveText || a.text}`))
}

export function buildRetrofitTab(el, sys) {
  const L = sys.legacy || {}, R = sys.retrofit || {}
  const list = (arr) => h('ul', {}, ...(arr || []).map((x) => h('li', {}, x)))
  el.append(h('div', { class: 'grid g2' },
    h('div', { class: 'card' }, h('h3', {}, 'Legacy installation (typical)'), h('p', {}, L.typical_condition || ''), h('h4', {}, 'Limitations'), list(L.limitations), L.obsolescence_note ? h('p', { class: 'note' }, L.obsolescence_note) : null),
    h('div', { class: 'card' }, h('h3', {}, 'Retrofit / modernisation'), h('h4', {}, 'Scope'), list(R.scope), h('h4', {}, 'Upgraded equipment (generic, no brand claims)'), list(R.upgraded_equipment)),
    h('div', { class: 'card' }, h('h3', {}, 'Functional improvements (qualitative)'), list(R.functional_improvements), h('h4', {}, 'Integration with existing vessel systems'), list(R.integration)),
    h('div', { class: 'card' }, h('h3', {}, 'Post-upgrade operation'), h('p', {}, R.post_upgrade_operation || ''), h('h4', {}, 'Typical project sequence'), h('ol', {}, ...(R.typical_sequence || []).map((x) => h('li', {}, x))))),
  h('p', { class: 'note' }, 'Content from the project database. Representative scope descriptions: no performance, certification or OEM compatibility claims are made.'))
}

export function buildScenarioTab(el, ctx, systemId, gotoMain) {
  const { sim } = ctx
  const all = sim.scenarios()[systemId] || { db: [], library: [] }
  const wrap = h('div', { class: 'scen' })
  el.append(h('p', { class: 'note' }, 'Scenarios restart the simulation from the normal production state and then apply the steps below. They demonstrate concepts; they are not operating procedures for any vessel.'), wrap)
  const row = (name, desc, steps, id, src) => h('div', { class: 'card' },
    btn('Run', () => { sim.command('scenario.run', { id }); gotoMain && gotoMain() }, 'on', { 'data-scenario': id }),
    h('div', { class: 'flex1' }, h('b', {}, name), src ? h('span', { class: 'tag', style: { marginLeft: '.5em' } }, src) : null, desc ? h('div', { class: 'small' }, desc) : null, steps && steps.length ? h('ol', { class: 'small' }, ...steps.map((s) => h('li', {}, s))) : null))
  for (const d of all.db) wrap.append(row(d.name, d.description, d.steps, d.id, 'database scenario'))
  for (const d of all.library) wrap.append(row(d.name, '', null, d.id, 'additional'))
  const stop = h('div', { class: 'row' }, btn('Reset to normal', () => { sim.command('sim.reset'); gotoMain && gotoMain() }), h('span', { class: 'muted small' }, 'Restores the normal production state (load case LC_PROD).'))
  el.append(stop)
}

// alarm list widget shared by several modules
export function alarmTable(el, ctx, filter, opts = {}) {
  const { sim } = ctx
  const tbody = h('tbody')
  const table = h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', {}, 'Time'), h('th', {}, 'Sys'), h('th', {}, 'Code'), h('th', {}, 'Alarm'), h('th', {}, 'Priority'), h('th', {}, 'State'), h('th', {}, ''))), tbody)
  const tools = h('div', { class: 'row', style: { marginBottom: '.4em' } }, btn('Acknowledge all shown', () => { for (const a of sim.state.alarms.filter(filter)) sim.command('alarm.ack', { id: a.id }) }, '', { 'data-act': 'ack-all' }))
  el.append(tools, table)
  return (st) => {
    const list = st.alarms.filter(filter).slice(0, opts.max || 60)
    const key = list.map((a) => `${a.id}${a.active}${a.acked}${a.shelvedUntil > st.t}`).join('|')
    if (tbody.dataset.key === key) return
    tbody.dataset.key = key
    tbody.textContent = ''
    if (!list.length) tbody.append(h('tr', {}, h('td', { colspan: 7, class: 'muted' }, 'No alarms')))
    for (const a of list) {
      const shelved = a.shelvedUntil > st.t
      tbody.append(h('tr', {}, h('td', {}, a.clock), h('td', {}, a.systemId), h('td', {}, a.dbCode || a.code.replace(/_/g, ' ').slice(0, 18)), h('td', {}, a.liveText || a.text),
        h('td', {}, h('span', { class: `tag ${sevCls(a.severity)}` }, a.severity)), h('td', {}, shelved ? 'shelved' : `${a.active ? 'active' : 'cleared'}${a.acked ? ', acked' : ', unacked'}`),
        h('td', {}, a.acked ? null : btn('Ack', () => sim.command('alarm.ack', { id: a.id })), opts.shelve && a.active ? btn(shelved ? 'Unshelve' : 'Shelve', () => sim.command(shelved ? 'alarm.unshelve' : 'alarm.shelve', { id: a.id, seconds: 600 })) : null)))
    }
  }
}

export function eventList(el, filter, max = 40) {
  const ul = h('div', { class: 'small', style: { maxHeight: '22em', overflow: 'auto', fontVariantNumeric: 'tabular-nums' } })
  el.append(ul)
  return (st) => {
    const list = st.events.filter(filter).slice(0, max)
    const key = list.length + (list[0] ? list[0].t + list[0].text : '')
    if (ul.dataset.key === key) return
    ul.dataset.key = key
    ul.textContent = ''
    for (const e of list) ul.append(h('div', { class: e.severity === 'critical' ? 'crit' : e.severity === 'high' ? '' : '' }, h('span', { class: 'muted' }, e.clock + ' '), h('span', { class: 'tag' }, e.systemId), ' ', e.text))
  }
}

// cheap mini screen helper for 3D monitors
export function miniFrame(canvas, title, lines, opts = {}) {
  const g = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height
  g.fillStyle = opts.legacy ? '#9da3a8' : '#c8cbcf'; g.fillRect(0, 0, W, H)
  g.fillStyle = '#3a3f45'; g.fillRect(0, 0, W, H * 0.16)
  g.fillStyle = '#f4f4f4'; g.font = `bold ${Math.round(H * 0.09)}px Segoe UI, Arial`; g.textBaseline = 'middle'
  g.fillText(title, W * 0.03, H * 0.08)
  const lh = (H * 0.8) / Math.max(4, lines.length)
  g.font = `${Math.round(lh * 0.62)}px Segoe UI, Arial`
  lines.forEach((ln, i) => {
    const y = H * 0.2 + lh * (i + 0.5)
    if (ln.alarm) { g.fillStyle = ln.alarm === 'critical' ? '#c62828' : '#e0a100'; g.fillRect(0, y - lh / 2, W, lh) }
    g.fillStyle = ln.alarm === 'critical' ? '#fff' : '#1f2328'
    g.fillText(ln.k, W * 0.03, y)
    g.textAlign = 'right'; g.fillText(ln.v, W * 0.97, y); g.textAlign = 'left'
  })
  g.fillStyle = '#3a3f45'; g.font = `${Math.round(H * 0.05)}px Segoe UI, Arial`; g.fillText('EDUCATIONAL SIMULATION', W * 0.03, H * 0.965)
}
