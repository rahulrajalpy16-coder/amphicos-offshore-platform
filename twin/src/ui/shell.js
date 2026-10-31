// App shell: top bar (brand, breadcrumb, tools), toast. Breadcrumb: Vessel > Room > Equipment > HMI.
import { h, $ } from './dom.js';

export function createShell({ root, db, store, bus, nav, logoUrl, director }) {
  const roomById = new Map(db.rooms.map((r) => [r.id, r]));
  const compById = new Map(db.components.map((c) => [c.id, c]));
  const sysById = new Map(db.systems.map((s) => [s.id, s]));

  const crumbs = h('nav', { class: 'crumbs', id: 'crumbs', 'aria-label': 'Breadcrumb' });
  const viewsDrop = h('div', { class: 'drop hidden', id: 'views-drop' });
  for (const [key, p] of Object.entries(director.presets)) {
    viewsDrop.append(h('button', { 'data-preset': key, onclick: () => { viewsDrop.classList.add('hidden'); nav.preset(key); } }, p.label));
  }
  const btn = (id, label, title, onclick, cls = '') => h('button', { class: 'btn ' + cls, id, title, onclick }, label);
  const variantSeg = h('div', { class: 'seg', id: 'variant-seg', title: 'Show the representative legacy installation or the retrofit solution (V)' },
    h('button', { 'data-variant': 'legacy', onclick: () => bus.emit('request:variant', { variant: 'legacy' }) }, 'Legacy'),
    h('button', { 'data-variant': 'retrofit', onclick: () => bus.emit('request:variant', { variant: 'retrofit' }) }, 'Retrofit'));

  const bar = h('header', { class: 'topbar' },
    h('button', { class: 'btn mobile-only', id: 'btn-systems', onclick: () => document.body.classList.toggle('index-open') }, 'Systems'),
    h('div', { class: 'brand' }, h('img', { src: logoUrl, alt: 'Amphicos' }),
      h('div', { class: 'title' }, h('b', {}, 'FPSO Digital Twin'), h('span', {}, 'Electrical, automation and telecom retrofits'))),
    crumbs,
    h('div', { class: 'tools' },
      btn('btn-back', 'Back', 'Back one step (Esc)', () => nav.back(), 'wide'),
      btn('btn-home', 'Home', 'Vessel overview (H)', () => nav.home()),
      h('div', { class: 'menu wide' }, btn('btn-views', 'Views', 'Camera presets', (e) => { e.stopPropagation(); viewsDrop.classList.toggle('hidden'); }), viewsDrop),
      btn('btn-xray', 'X-ray', 'Translucent hull to see internal spaces (X)', () => bus.emit('request:xray', {}), 'wide'),
      variantSeg,
      btn('btn-2d', '2D', 'Engineering drawings generated from the same database (G)', () => bus.emit('request:2d', {})),
      btn('btn-walk', 'Walk', 'Walk inside the room: WASD or arrows, drag to look (F)', () => bus.emit('request:walk', {}), 'wide hidden'),
      btn('btn-tour', 'Guided tour', 'Automatic guided tour with captions (T)', () => bus.emit('request:tour', {}), 'wide'),
      btn('btn-presenter', 'Presenter', 'Quick-jump bar for exhibition presenting (P)', () => bus.emit('request:presenter', {}), 'wide'),
      btn('btn-about', 'About', 'About, disclaimer and keyboard shortcuts (?)', () => bus.emit('request:about', {}))));
  root.append(bar);
  document.addEventListener('click', () => viewsDrop.classList.add('hidden'));

  const toastEl = h('div', { id: 'toast', class: 'hidden' });
  root.append(toastEl);
  let toastTimer = null;
  function toast(msg, ms = 2200) {
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add('hidden'), ms);
  }

  function renderCrumbs(s) {
    crumbs.innerHTML = '';
    const items = [{ level: 'vessel', label: db.meta && db.meta.vessel_name ? db.meta.vessel_name : 'Vessel' }];
    if (s.level !== 'vessel' && s.roomId) items.push({ level: 'room', label: (roomById.get(s.roomId) || {}).name || s.roomId });
    if ((s.level === 'equipment' || s.level === 'hmi') && s.componentId) {
      const c = compById.get(s.componentId);
      items.push({ level: 'equipment', label: c ? (c.tag || c.name) : s.componentId });
    }
    if (s.level === 'hmi') {
      const sys = sysById.get(s.systemId);
      items.push({ level: 'hmi', label: sys ? (sys.hmi && sys.hmi.module ? 'HMI ' : '') + (sys.short || sys.name) : 'HMI' });
    }
    items.forEach((it, i) => {
      if (i) crumbs.append(h('span', { class: 'sep', 'aria-hidden': 'true' }, '>'));
      crumbs.append(h('button', { class: i === items.length - 1 ? 'cur' : '', 'data-level': it.level, onclick: () => nav.goToLevel(it.level) }, it.label));
    });
  }

  store.subscribe((s, prev) => {
    if (s.level !== prev.level || s.roomId !== prev.roomId || s.componentId !== prev.componentId || s.systemId !== prev.systemId) renderCrumbs(s);
    $('#btn-xray').classList.toggle('on', !!s.xray);
    $('#btn-2d').classList.toggle('on', !!s.panel2d);
    $('#btn-tour').classList.toggle('on', !!s.tour);
    $('#btn-presenter').classList.toggle('on', !!s.presenter);
    $('#btn-walk').classList.toggle('on', !!s.walk);
    $('#btn-walk').classList.toggle('hidden', !(s.level === 'room' || s.level === 'equipment'));
    for (const b of variantSeg.querySelectorAll('button')) {
      b.classList.toggle('on', b.dataset.variant === s.variant);
      b.classList.toggle('legacy', b.dataset.variant === 'legacy');
    }
  });
  renderCrumbs(store.get());
  for (const b of variantSeg.querySelectorAll('button')) { b.classList.toggle('on', b.dataset.variant === store.get().variant); b.classList.toggle('legacy', b.dataset.variant === 'legacy'); }
  return { toast, bar };
}
