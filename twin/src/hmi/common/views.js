// Shared read-only selectors. Several HMIs show the same generator; they all read it through genView so the
// numbers are identical by construction (cross-view consistency, unit tested).

export function genView(st, id) {
  const g = st.gens[id]
  if (!g) return null
  const e = st.engines?.[id] || {}
  return {
    id, name: g.name, status: g.status, engine: g.engine, online: g.online, ready: g.ready, control: g.control,
    kw: g.p_kw, kvar: g.q_kvar, kva: Math.hypot(g.p_kw, g.q_kvar), a: g.i_a, pf: g.pf, hz: g.f_hz, kv: g.v_kv, rpm: g.speed_rpm,
    loadPct: (100 * g.p_kw) / g.rating_kw, rating_kw: g.rating_kw, rating_kva: g.rating_kva,
    govMode: g.gov.mode, fref: g.gov.fref, droopPct: g.gov.droop * 100, actPct: g.act_pct, govGain: g.gov.gain,
    avrMode: g.avr.mode, vset: g.avr.v_set, ifA: g.if_a, avrLimit: g.avr.limit, sensing: g.avr.sensing, qDroopPct: g.avr.droop_q * 100, avrGain: g.avr.gain,
    lo_p: e.lo_p, jw_t: e.jw_t, exh_avg: e.exh_avg, hours: g.running_hours, starts: g.starts, shutdownCause: g.shutdownCause, lockout: g.lockout,
    breaker: st.breakers[g.breaker]?.state, slip: g.slip_hz, dv: g.dv_pct, angle: g.phase_deg,
  }
}

export const genIds = (st) => st.genOrder.slice()
export const busLive = (st, id) => !!st.buses[id]?.live
export function plantView(st) {
  const p = st.pms
  return { load_kw: p.load_kw, cap_kw: p.cap_kw, load_pct: p.load_pct, avail_kw: p.available_kw, online: p.online, mode: p.mode, status: p.status, message: p.message }
}
export const shortName = (id) => String(id).replace(/^F_|^CB_|^C_/, '').replace(/_/g, ' ')
