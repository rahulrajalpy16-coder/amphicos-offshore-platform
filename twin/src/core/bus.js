// Tiny synchronous event bus shared by every module.
const handlers = new Map();

export const bus = {
  on(evt, fn) {
    if (!handlers.has(evt)) handlers.set(evt, new Set());
    handlers.get(evt).add(fn);
    return () => handlers.get(evt) && handlers.get(evt).delete(fn);
  },
  once(evt, fn) {
    const off = bus.on(evt, (p) => { off(); fn(p); });
    return off;
  },
  emit(evt, payload) {
    const set = handlers.get(evt);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(payload); } catch (err) { console.warn('[bus] handler failed for', evt, err); }
    }
  },
  clear() { handlers.clear(); },
};
export default bus;
