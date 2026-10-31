// Shared helpers for the educational simulation engine. Deterministic: no Math.random, no Date.

export function mulberry32(seed) {
  let a = seed >>> 0
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
export const lerp = (a, b, k) => a + (b - a) * k
export const approach = (v, target, rate, dt) => v + (target - v) * (1 - Math.exp(-dt * rate))
export const round = (v, n = 1) => { const p = 10 ** n; return Math.round(v * p) / p }

// first number in a string, e.g. "1.1 x In" -> 1.1, "< 2.5 bar" -> 2.5, "-5 % Pn" -> -5
export function firstNumber(s, fallback = null) {
  if (typeof s === 'number') return s
  if (typeof s !== 'string') return fallback
  const m = s.replace(/,/g, '').match(/-?\d+(\.\d+)?/)
  return m ? parseFloat(m[0]) : fallback
}
export function allNumbers(s) {
  if (typeof s === 'number') return [s]
  if (typeof s !== 'string') return []
  return (s.replace(/,/g, '').match(/-?\d+(\.\d+)?/g) || []).map(parseFloat)
}

// Parse a relay pickup text. Handles the database wording, for example:
// "1.2 x In (394 A)" -> {pu:1.2, absA:394}; "Id > 0.10 x In, slope 20 %" -> {pu:0.1}; "-8 % Pn (-240 kW)" -> {pu:-0.08}
// "85 % Un" -> {pu:0.85}; "57.0 Hz" -> {abs:57, unit:'Hz'}; "5 A primary" -> {absA:5}
// "alarm I2 > 8 % In, trip I2 > 10 % In" -> trip part {pu:0.1, alarmPu:0.08}; "1.05 x In alarm, 1.15 x In trip" -> {pu:1.15, alarmPu:1.05}
// "110 % Un / 120 % Un" -> {pu:1.1, stages:[1.1, 1.2]}
export function parsePickup(text) {
  if (text && typeof text === 'object') return text
  if (typeof text === 'number') return { pu: text }
  const s = String(text || '')
  if (/\btrip\b/i.test(s) && /,/.test(s)) {
    const parts = s.split(',')
    const tp = parts.find((x) => /\btrip\b/i.test(x)), ap = parts.find((x) => /\balarm\b/i.test(x))
    const t = parsePickup(tp.replace(/\btrip\b/i, '')), a = ap ? parsePickup(ap.replace(/\balarm\b/i, '')) : null
    return { ...t, alarmPu: a ? a.pu : undefined }
  }
  if (s.includes('/') && !/\d\s*\/\s*\d+\s*A\b/.test(s)) {
    const st = s.split('/').map((x) => parsePickup(x)).filter((x) => x.pu != null || x.abs != null)
    if (st.length > 1) return { ...st[0], stages: st }
  }
  const out = {}
  const mA = s.match(/\((-?\d+(\.\d+)?)\s*A\)/)
  if (mA) out.absA = Math.abs(parseFloat(mA[1]))
  const mx = s.match(/(-?\d+(\.\d+)?)\s*x\s*(In|Ir|Ib|CT|In_tr)/i)
  if (mx) { out.pu = parseFloat(mx[1]); if (/CT/i.test(mx[3])) out.ref = 'CT'; return out }
  const mp = s.match(/(-?\d+(\.\d+)?)\s*%\s*(In|Un|Pn|Vn|fn|Sn)?/i)
  if (mp) { out.pu = parseFloat(mp[1]) / 100; return out }
  const mh = s.match(/(-?\d+(\.\d+)?)\s*Hz/i)
  if (mh) return { abs: parseFloat(mh[1]), unit: 'Hz' }
  const ma = s.match(/(-?\d+(\.\d+)?)\s*A\b/)
  if (ma) return { absA: parseFloat(ma[1]) }
  const n = firstNumber(s)
  return n == null ? { pu: null } : { pu: n }
}

// Parse curve / delay text: "IEC standard inverse, TMS 0.2", "IEC SI TMS 0.1", "definite time 0.25 s", "instantaneous",
// "2 s", "2 s / 0.2 s" (stages), "I2^2 t, K = 20", "thermal model, tau 30 min", "via temperature monitor", "permissive"
export function parseCurve(text) {
  if (text && typeof text === 'object') return text
  const raw = String(text || '')
  const s = raw.toLowerCase()
  if (/i2\^?2\s*t|k\s*=/.test(s)) { const k = s.match(/k\s*=\s*(\d+(\.\d+)?)/); return { kind: 'i2t', K: k ? parseFloat(k[1]) : 20 } }
  if (/thermal/.test(s)) { const m = s.match(/tau\s*(\d+(\.\d+)?)\s*(min|s)?/); const tau = m ? parseFloat(m[1]) * (m[3] === 's' ? 1 : 60) : 600; return { kind: 'thermal', tau_s: tau } }
  if (/monitor|permissive|optional/.test(s) && !/\d+(\.\d+)?\s*s\b/.test(s)) return { kind: 'none' }
  if (s.includes('/') && !/tms/.test(s)) {
    const st = s.split('/').map((x) => parseCurve(x))
    if (st.length > 1) return { ...st[0], stages: st }
  }
  let curve = null
  if (/extremely|\bei\b/.test(s)) curve = 'EI'
  else if (/very|\bvi\b/.test(s)) curve = 'VI'
  else if (/long time|\blti\b/.test(s)) curve = 'LTI'
  else if (/standard inverse|normal inverse|\bsi\b|\bni\b|idmt|inverse/.test(s)) curve = 'SI'
  const tmsM = s.match(/(tms|tm|td|time multiplier)\s*[=:]?\s*(\d+(\.\d+)?)/)
  if (curve) return { kind: 'idmt', curve, tms: tmsM ? parseFloat(tmsM[2]) : 0.1 }
  if (/inst/.test(s)) return { kind: 'dt', delay: 0.04 }
  const d = s.match(/(\d+(\.\d+)?)\s*(ms|s\b|sec)/)
  if (d) return { kind: 'dt', delay: d[3] === 'ms' ? parseFloat(d[1]) / 1000 : parseFloat(d[1]) }
  const n = firstNumber(s)
  return { kind: 'dt', delay: n != null ? n : 0.1 }
}

// IEC 60255-151 / IEC 60255-3 inverse time characteristics: t = TMS * k / ((I/Is)^a - 1)
export const IEC_CURVES = {
  SI: { k: 0.14, a: 0.02, name: 'IEC standard inverse' },
  VI: { k: 13.5, a: 1, name: 'IEC very inverse' },
  EI: { k: 80, a: 2, name: 'IEC extremely inverse' },
  LTI: { k: 120, a: 1, name: 'IEC long time inverse' },
}
export function idmtTime(curve, tms, multiple) {
  const c = IEC_CURVES[curve] || IEC_CURVES.SI
  if (!(multiple > 1)) return Infinity
  return (tms * c.k) / (Math.pow(multiple, c.a) - 1)
}

export function getPath(obj, path) {
  if (!path || path === '*' || path === 'tick') return obj
  let o = obj
  for (const k of path.split('.')) { if (o == null) return undefined; o = o[k] }
  return o
}

// Ring buffer of numbers for trends
export class Ring {
  constructor(n) { this.n = n; this.a = []; }
  push(v) { this.a.push(v); if (this.a.length > this.n) this.a.shift() }
  get values() { return this.a }
  get last() { return this.a[this.a.length - 1] }
}

// Simple PID with output clamp and anti windup, direct = +1 (output rises when PV below SP) or -1
export function makePid({ kp = 1, ki = 0.1, kd = 0, lo = 0, hi = 100, direct = 1, out = 50 } = {}) {
  return { kp, ki, kd, lo, hi, direct, out, i: out, prevErr: 0, mode: 'AUTO', sp: 0 }
}
export function stepPid(p, pv, dt) {
  if (p.mode !== 'AUTO') { p.i = p.out; return p.out }
  const e = p.direct * (p.sp - pv)
  const d = (e - p.prevErr) / dt
  p.prevErr = e
  let iNew = p.i + p.ki * e * dt
  let out = p.kp * e + iNew + p.kd * d
  if (out > p.hi) { out = p.hi; if (e < 0) p.i = iNew } else if (out < p.lo) { out = p.lo; if (e > 0) p.i = iNew } else p.i = iNew
  p.out = out
  return out
}

export function fmtClock(t, base = 6 * 3600) {
  const s = Math.floor(base + t) % 86400
  const h = String(Math.floor(s / 3600)).padStart(2, '0')
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${h}:${m}:${ss}`
}
