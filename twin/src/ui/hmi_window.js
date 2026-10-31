// HMI / inspection window host (stage 5). Opens only on explicit request, about 88% of the viewport,
// the 3D scene stays visible and dimmed behind it.
import { h, pad2 } from './dom.js';

export function createHmiHost({ root, db, store, bus, getSim, getHmi, hmiForComponent, cameraViews }) {
  const sysById = new Map(db.systems.map((s) => [s.id, s]));
  const compById = new Map(db.components.map((c) => [c.id, c]));
  let current = null;

  function resolveModule(componentId, systemId) {
    let m = null;
    try { m = hmiForComponent(db, componentId); } catch (e) { m = null; }
    if (typeof m === 'string') m = getHmi(m);
    if (m && m.module && typeof m.module.mount === 'function') m = m.module;
    if (!m || typeof m.mount !== 'function') {
      const sys = sysById.get(systemId);
      if (sys && sys.hmi && sys.hmi.module) m = getHmi(sys.hmi.module);
    }
    return m && typeof m.mount === 'function' ? m : null;
  }

  function hasHmi(componentId) {
    const c = compById.get(componentId);
    if (!c) return false;
    const sys = sysById.get(c.system);
    const hosts = (sys && sys.hmi && sys.hmi.host_components) || [];
    return !!(c.hmi || hosts.includes(componentId));
  }

  function open({ componentId, systemId }) {
    close();
    const m = resolveModule(componentId, systemId);
    if (!m) return false;
    const sys = sysById.get(systemId);
    const c = compById.get(componentId);
    const body = h('div', { class: 'body', id: 'hmi-body', 'data-module': (m.meta && m.meta.id) || '' });
    const kind = (m.meta && m.meta.kind) || (hasHmi(componentId) ? 'hmi' : 'inspection');
    const wrap = h('div', { id: 'hmiwin', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'HMI',
      onclick: (e) => { if (e.target === wrap) bus.emit('request:back', {}); } },
    h('div', { class: 'win' },
      h('div', { class: 'hd' },
        h('span', { class: 'n' }, sys ? pad2(sys.number) : ''),
        h('div', { class: 't' }, (m.meta && m.meta.title) || (sys ? sys.name : 'HMI'), h('span', {}, c ? `${c.tag || c.id} ${kind === 'inspection' ? 'inspection' : 'HMI'}` : '')),
        h('button', { class: 'btn', id: 'hmi-close', title: 'Close (Esc)', onclick: () => bus.emit('request:back', {}) }, 'Close')),
      h('div', { class: 'banner' }, 'EDUCATIONAL SIMULATION, not live vessel control, not OEM logic. Representative arrangement and values, no engineering validation claimed.'),
      body));
    root.append(wrap);
    const ctx = { db, sim: getSim(), bus, componentId, systemId, variant: store.get().variant };
    if (cameraViews) { cameraViews.setActive(true); ctx.renderCameraView = cameraViews.renderCameraView; }
    let inst = null;
    try {
      inst = m.mount(body, ctx) || null;
    } catch (err) {
      console.error('[hmi] mount failed', err);
      body.append(h('p', { style: 'padding:1rem;color:#f99' }, 'This module could not be started.'));
    }
    current = { wrap, inst, module: m, componentId, systemId };
    setTimeout(() => { const b = wrap.querySelector('#hmi-close'); if (b) b.focus({ preventScroll: true }); }, 0);
    return true;
  }

  function close() {
    if (!current) return;
    try { current.inst && current.inst.unmount && current.inst.unmount(); } catch (err) { console.error('[hmi] unmount failed', err); }
    current.wrap.remove();
    current = null;
    if (cameraViews) cameraViews.setActive(false);
  }

  store.subscribe((s, prev) => {
    if (s.variant !== prev.variant && current && current.inst && current.inst.setVariant) {
      try { current.inst.setVariant(s.variant); } catch (err) { console.error(err); }
    }
  });

  return { open, close, hasHmi, resolveModule, get current() { return current; } };
}
