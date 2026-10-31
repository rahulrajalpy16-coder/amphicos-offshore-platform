// Minimal observable store for navigation and view state.
const initial = () => ({
  level: 'vessel',        // 'vessel' | 'room' | 'equipment' | 'hmi'
  systemId: null,
  roomId: null,
  componentId: null,
  variant: 'retrofit',    // 'legacy' | 'retrofit'
  tour: false,
  panel2d: false,
  xray: false,
  walk: false,
  presenter: false,
  attract: false,
});

let state = initial();
const subs = new Set();

export const store = {
  get() { return state; },
  set(partial) {
    const prev = state;
    let changed = false;
    for (const k of Object.keys(partial)) if (prev[k] !== partial[k]) { changed = true; break; }
    if (!changed) return;
    state = { ...prev, ...partial };
    for (const fn of [...subs]) {
      try { fn(state, prev); } catch (err) { console.warn('[store] subscriber failed', err); }
    }
  },
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  reset() { state = initial(); },
};
export default store;
