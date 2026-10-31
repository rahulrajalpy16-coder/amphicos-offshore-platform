// 2D drawings dock: view tabs, pan and zoom, two-way cross-selection with the 3D view.
import { renderView, indexDb, VIEW_TITLES } from './views.js';
import { h } from '../ui/dom.js';

export function createDrawingsPanel({ root, db, store, bus }) {
  const I = indexDb(db);
  const decks = (db.vessel.decks || []).filter((d) => db.rooms.some((r) => r.deck === d.id || Math.abs(r.box[4] - d.z) < 0.8));
  let view = 'ga';
  let deckId = decks[0] ? decks[0].id : null;
  let roomId = db.rooms[0].id;
  let systemId = db.systems[0].id;
  let follow = true;
  let vb0 = null; let vb = null;

  const viewSel = h('select', { id: 'dw-view', 'aria-label': 'Drawing', onchange: () => { view = viewSel.value; render(); } },
    ...Object.entries(VIEW_TITLES).map(([k, t]) => h('option', { value: k }, t)));
  const deckSel = h('select', { id: 'dw-deck', 'aria-label': 'Deck', onchange: () => { deckId = deckSel.value; render(); } },
    ...decks.map((d) => h('option', { value: d.id }, `${d.name} (z ${d.z})`)));
  const roomSel = h('select', { id: 'dw-room', 'aria-label': 'Room', onchange: () => { roomId = roomSel.value; render(); } },
    ...db.rooms.map((r) => h('option', { value: r.id }, r.name)));
  const sysSel = h('select', { id: 'dw-sys', 'aria-label': 'System', onchange: () => { systemId = sysSel.value; render(); } },
    ...db.systems.map((s) => h('option', { value: s.id }, `${s.number}. ${s.short || s.name}`)));
  const followBtn = h('button', { class: 'btn on', title: 'Follow the 3D selection', onclick: () => { follow = !follow; followBtn.classList.toggle('on', follow); } }, 'Follow 3D');
  const wrap = h('div', { class: 'svgwrap', id: 'dw-wrap' });
  const dock = h('section', { class: 'panel hidden', id: 'dock2d', 'aria-label': '2D engineering drawings' },
    h('div', { class: 'bar' }, h('span', { class: 'ttl' }, '2D'), viewSel, deckSel, roomSel, sysSel, h('span', { class: 'grow' }), followBtn,
      h('button', { class: 'btn', title: 'Fit drawing', onclick: () => fit() }, 'Fit'),
      h('button', { class: 'btn', id: 'dw-max', title: 'Enlarge', onclick: () => { dock.classList.toggle('max'); } }, 'Enlarge'),
      h('button', { class: 'btn', title: 'Close 2D (G)', onclick: () => setOpen(false) }, 'Close')),
    wrap);
  root.append(dock);

  function syncControls() {
    viewSel.value = view;
    deckSel.classList.toggle('hidden', view !== 'deck');
    roomSel.classList.toggle('hidden', view !== 'room');
    sysSel.classList.toggle('hidden', view !== 'distribution');
    if (deckId) deckSel.value = deckId;
    roomSel.value = roomId;
    sysSel.value = systemId;
  }

  function svg() { return wrap.querySelector('svg'); }
  function render() {
    syncControls();
    wrap.innerHTML = renderView(db, view, { deckId, roomId, systemId }, I);
    const el = svg();
    vb0 = el.getAttribute('viewBox').split(/\s+/).map(Number);
    vb = vb0.slice();
    highlight();
  }
  function fit() { if (!vb0) return; vb = vb0.slice(); svg().setAttribute('viewBox', vb.join(' ')); }

  function highlight() {
    const el = svg();
    if (!el) return;
    const s = store.get();
    for (const n of el.querySelectorAll('.sel, .of-sys')) n.classList.remove('sel', 'of-sys');
    if (s.systemId) {
      for (const n of el.querySelectorAll('[data-sys]')) if (n.dataset.sys.split(' ').includes(s.systemId)) n.classList.add('of-sys');
      for (const n of el.querySelectorAll(`[data-kind="system"][data-id="${s.systemId}"]`)) n.classList.add('sel');
    }
    if (s.roomId && s.level !== 'vessel') for (const n of el.querySelectorAll(`[data-kind="room"][data-id="${s.roomId}"]`)) n.classList.add('sel');
    if (s.componentId && (s.level === 'equipment' || s.level === 'hmi')) for (const n of el.querySelectorAll(`[data-kind="component"][data-id="${s.componentId}"]`)) n.classList.add('sel');
  }

  // ---------- pan / zoom / click ----------
  let drag = null;
  wrap.addEventListener('pointerdown', (e) => {
    const el = svg(); if (!el) return;
    drag = { x: e.clientX, y: e.clientY, vb: vb.slice(), moved: 0, id: e.pointerId };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const el = svg(); const r = el.getBoundingClientRect();
    const k = Math.max(drag.vb[2] / r.width, drag.vb[3] / r.height);
    const dx = (e.clientX - drag.x) * k, dy = (e.clientY - drag.y) * k;
    drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.x, e.clientY - drag.y));
    if (drag.moved > 4) { vb = [drag.vb[0] - dx, drag.vb[1] - dy, drag.vb[2], drag.vb[3]]; el.setAttribute('viewBox', vb.join(' ')); }
  });
  window.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved; drag = null;
    if (moved > 4) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const hit = target && target.closest && target.closest('[data-id][data-kind]');
    if (!hit || !wrap.contains(hit)) return;
    const id = hit.dataset.id;
    if (hit.dataset.kind === 'component') bus.emit('select:component', { componentId: id, source: '2d' });
    else if (hit.dataset.kind === 'room') bus.emit('select:room', { roomId: id, source: '2d' });
    else if (hit.dataset.kind === 'system') bus.emit('select:system', { systemId: id, source: '2d' });
  });
  wrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    const el = svg(); if (!el) return;
    const r = el.getBoundingClientRect();
    const scale = Math.exp(e.deltaY * 0.0015);
    // keep the point under the cursor fixed (meet aspect: compute the drawn area)
    const k = Math.max(vb[2] / r.width, vb[3] / r.height);
    const cx = vb[0] + vb[2] / 2 + (e.clientX - (r.left + r.width / 2)) * k;
    const cy = vb[1] + vb[3] / 2 + (e.clientY - (r.top + r.height / 2)) * k;
    const nw = Math.min(vb0[2] * 3, Math.max(vb0[2] / 60, vb[2] * scale));
    const s2 = nw / vb[2];
    vb = [cx - (cx - vb[0]) * s2, cy - (cy - vb[1]) * s2, vb[2] * s2, vb[3] * s2];
    el.setAttribute('viewBox', vb.join(' '));
  }, { passive: false });
  wrap.addEventListener('dblclick', fit);

  function setOpen(on, opts = {}) {
    if (opts.view) {
      view = opts.view;
      const s = store.get();
      if (view === 'room' && s.roomId) roomId = s.roomId;
      if (view === 'distribution' && s.systemId) systemId = s.systemId;
    }
    store.set({ panel2d: !!on });
    dock.classList.toggle('hidden', !on);
    document.body.classList.toggle('dock-open', !!on && !dock.classList.contains('max'));
    if (on) render();
  }

  // Follow the 3D selection: room view tracks the room, deck view tracks its deck, distribution tracks the system.
  store.subscribe((s, prev) => {
    if (!s.panel2d) return;
    let rerender = false;
    if (follow) {
      if (s.roomId && s.roomId !== roomId && s.level !== 'vessel') {
        roomId = s.roomId; if (view === 'room') rerender = true;
        const r = I.roomById.get(s.roomId);
        if (r && view === 'deck') { const d = decks.find((dd) => dd.id === r.deck); if (d && d.id !== deckId) { deckId = d.id; rerender = true; } }
      }
      if (s.systemId && s.systemId !== systemId) { systemId = s.systemId; if (view === 'distribution') rerender = true; }
    }
    if (rerender) render();
    else if (s.systemId !== prev.systemId || s.roomId !== prev.roomId || s.componentId !== prev.componentId || s.level !== prev.level) highlight();
  });

  bus.on('request:2d', (p = {}) => {
    const open = store.get().panel2d;
    if (p.view) setOpen(true, p);
    else setOpen(!open);
  });

  return { setOpen, render, get view() { return view; }, setView(v) { view = v; render(); }, highlight, dock };
}
