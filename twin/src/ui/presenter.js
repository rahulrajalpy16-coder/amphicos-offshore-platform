// Presenter tools: keyboard shortcuts, quick-jump bar, guided tour with captions (pauses on user input),
// idle attract mode for unattended exhibition use (slow orbit, UI reset).
import { h, pad2 } from './dom.js';

export function createPresenter({ root, db, store, bus, nav, director, opts = {} }) {
  const systems = [...db.systems].sort((a, b) => a.number - b.number);
  const sysById = new Map(systems.map((s) => [s.id, s]));
  const roomById = new Map(db.rooms.map((r) => [r.id, r]));
  const compById = new Map(db.components.map((c) => [c.id, c]));
  const dwellSystem = (opts.tourDwell || 9) * 1000;
  const dwellComp = Math.max(3000, dwellSystem * 0.65);
  const idleMs = (opts.idleSeconds || 180) * 1000;

  // ---------- quick-jump bar ----------
  const bar = h('div', { class: 'panel hidden', id: 'presenter', role: 'toolbar', 'aria-label': 'Presenter quick-jump bar' },
    h('button', { class: 'q', title: 'Vessel overview (H)', onclick: () => nav.home() }, 'H'),
    h('button', { class: 'q', title: 'Previous system (PageUp)', onclick: () => step(-1) }, '<'),
    ...systems.map((s) => h('button', { class: 'q', 'data-system': s.id, title: `${s.number}. ${s.name}`, onclick: () => bus.emit('select:system', { systemId: s.id, source: 'key' }) }, pad2(s.number))),
    h('button', { class: 'q', title: 'Next system (PageDown)', onclick: () => step(1) }, '>'),
    h('span', { class: 'sep' }),
    h('button', { class: 'q', style: 'min-width:4.5rem', title: 'Guided tour (T)', onclick: () => toggleTour() }, 'Tour'));
  root.append(bar);

  function step(d) {
    const s = store.get();
    const i = systems.findIndex((x) => x.id === s.systemId);
    const n = i < 0 ? (d > 0 ? 0 : systems.length - 1) : (i + d + systems.length) % systems.length;
    bus.emit('select:system', { systemId: systems[n].id, source: 'key' });
  }

  // ---------- caption ----------
  const cap = h('div', { class: 'panel hidden', id: 'caption', 'aria-live': 'polite' });
  root.append(cap);
  function caption({ kicker, title, text, progress, paused }) {
    cap.classList.remove('hidden');
    cap.replaceChildren(
      h('div', { class: 'k' }, kicker || ''),
      h('h3', {}, title || ''),
      h('p', {}, text || ''),
      h('div', { class: 'row' },
        h('div', { class: 'prog' }, h('i', { style: `width:${Math.round((progress || 0) * 100)}%` })),
        h('button', { class: 'btn', onclick: () => tourSkip(-1) }, 'Previous'),
        h('button', { class: 'btn', id: 'tour-pause', onclick: () => (paused ? resume() : pause()) }, paused ? 'Resume' : 'Pause'),
        h('button', { class: 'btn', onclick: () => tourSkip(1) }, 'Next'),
        h('button', { class: 'btn', onclick: () => stopTour() }, 'End tour')));
  }

  // ---------- tour ----------
  let tour = null; // { token, index, paused }
  function toggleTour() { if (tour) stopTour(); else startTour(); }
  function startTour(from = 0) {
    stopAttract();
    tour = { token: {}, index: from, paused: false };
    store.set({ tour: true });
    runTour(tour.token);
  }
  function stopTour() {
    if (!tour) return;
    tour = null;
    cap.classList.add('hidden');
    store.set({ tour: false });
  }
  function pause() { if (tour && !tour.paused) { tour.paused = true; refreshCaption(); } }
  function resume() { if (tour && tour.paused) { tour.paused = false; refreshCaption(); } }
  let lastCaption = null;
  function refreshCaption() { if (lastCaption && tour) caption({ ...lastCaption, paused: tour.paused }); }
  function tourSkip(d) {
    if (!tour) return;
    tour.index = Math.max(0, Math.min(systems.length - 1, tour.index + d));
    tour.paused = false;
    tour.token = {};
    runTour(tour.token);
  }
  async function wait(ms, token, onTick) {
    let left = ms;
    let last = performance.now();
    while (left > 0) {
      await new Promise((r) => setTimeout(r, 100));
      if (!tour || tour.token !== token) return false;
      const now = performance.now();
      if (!tour.paused) left -= now - last;
      last = now;
      onTick && onTick(1 - left / ms);
    }
    return true;
  }
  async function waitFlight(token) {
    while (director.isFlying()) {
      await new Promise((r) => setTimeout(r, 100));
      if (!tour || tour.token !== token) return false;
    }
    return true;
  }
  async function runTour(token) {
    while (tour && tour.token === token && tour.index < systems.length) {
      const s = systems[tour.index];
      const room = roomById.get(s.primary_room);
      const base = { kicker: `Guided tour, system ${tour.index + 1} of ${systems.length}`, title: `${pad2(s.number)} ${s.name}` };
      lastCaption = { ...base, text: `${s.summary || ''} Installed in: ${room ? room.name : s.primary_room}.`, progress: 0 };
      caption({ ...lastCaption, paused: tour.paused });
      tourDriving = true;
      nav.selectSystem(s.id, 'tour');
      tourDriving = false;
      if (!(await waitFlight(token))) return;
      if (!(await wait(dwellSystem, token, (p) => setProg(p * 0.6)))) return;
      const c = compById.get(s.primary_component);
      if (c) {
        lastCaption = { ...base, text: `${c.tag || ''} ${c.name}. ${c.description || ''}`.trim(), progress: 0.6 };
        caption({ ...lastCaption, paused: tour.paused });
        tourDriving = true;
        nav.selectComponent(c.id, 'tour');
        tourDriving = false;
        if (!(await waitFlight(token))) return;
        if (!(await wait(dwellComp, token, (p) => setProg(0.6 + p * 0.4)))) return;
      }
      tour.index++;
    }
    if (tour && tour.token === token) {
      stopTour();
      nav.home();
    }
  }
  function setProg(p) { const i = cap.querySelector('.prog i'); if (i) i.style.width = Math.round(p * 100) + '%'; }
  let tourDriving = false;

  // ---------- attract mode ----------
  const attractEl = h('div', { class: 'panel hidden', id: 'attract' }, h('b', {}, 'Amphicos FPSO Digital Twin'), h('span', {}, 'Touch, click or press any key to explore the 15 systems'));
  root.append(attractEl);
  let lastInput = performance.now();
  function startAttract() {
    if (store.get().attract) return;
    stopTour();
    bus.emit('request:reset-ui', {});
    nav.home().then(() => { if (store.get().attract) director.setAutoRotate(true); });
    store.set({ attract: true });
    attractEl.classList.remove('hidden');
  }
  function stopAttract() {
    if (!store.get().attract) return;
    director.setAutoRotate(false);
    store.set({ attract: false });
    attractEl.classList.add('hidden');
  }
  function onInput(e) {
    lastInput = performance.now();
    if (store.get().attract) { stopAttract(); return; }
    if (tour && !tourDriving && e && e.type === 'pointerdown' && !(e.target.closest && e.target.closest('#caption, #presenter'))) pause();
  }
  for (const ev of ['pointerdown', 'wheel', 'touchstart']) window.addEventListener(ev, onInput, { passive: true, capture: true });
  setInterval(() => {
    if (!store.get().attract && !tour && performance.now() - lastInput > idleMs) startAttract();
  }, 1000);

  // ---------- keyboard ----------
  window.addEventListener('keydown', (e) => {
    lastInput = performance.now();
    if (store.get().attract) { stopAttract(); e.preventDefault(); return; }
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const s = store.get();
    const inHmi = s.level === 'hmi' && t && t.closest && t.closest('#hmi-body');
    if (e.key === 'Escape') {
      e.preventDefault();
      if (bus.closeTopModal && bus.closeTopModal()) return;
      if (tour) { stopTour(); return; }
      if (s.walk) { bus.emit('request:walk', {}); return; }
      if (opts.onEscAtVessel && s.level === 'vessel' && !(nav.history && nav.history.length) && opts.onEscAtVessel()) return;
      nav.back();
      return;
    }
    if (inHmi) return; // keys inside an HMI belong to the HMI
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const code = e.code;
    if (tour && !['KeyT', 'Space'].includes(code)) pause();
    if (/^Digit[0-9]$/.test(code)) {
      const d = Number(code.slice(5));
      let n = d === 0 ? 10 : d;
      if (e.shiftKey) n = d >= 1 && d <= 5 ? 10 + d : -1;
      const sys = systems.find((x) => x.number === n);
      if (sys) { e.preventDefault(); bus.emit('select:system', { systemId: sys.id, source: 'key' }); }
      return;
    }
    if (s.walk && ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(code)) return;
    switch (code) {
      case 'KeyH': case 'Home': nav.home(); break;
      case 'KeyG': bus.emit('request:2d', {}); break;
      case 'KeyX': bus.emit('request:xray', {}); break;
      case 'KeyV': bus.emit('request:variant', { variant: s.variant === 'legacy' ? 'retrofit' : 'legacy' }); break;
      case 'KeyT': toggleTour(); break;
      case 'Space': if (tour) { e.preventDefault(); tour.paused ? resume() : pause(); } break;
      case 'KeyP': bus.emit('request:presenter', {}); break;
      case 'KeyF': bus.emit('request:walk', {}); break;
      case 'KeyI': case 'Enter': if (s.level === 'equipment') bus.emit('request:hmi', { componentId: s.componentId }); break;
      case 'PageDown': case 'KeyN': case 'BracketRight': e.preventDefault(); step(1); break;
      case 'PageUp': case 'KeyB': case 'BracketLeft': e.preventDefault(); step(-1); break;
      case 'Slash': if (e.shiftKey) bus.emit('request:about', { tab: 'keys' }); break;
      default: break;
    }
  });

  bus.on('request:tour', () => toggleTour());
  bus.on('request:presenter', () => store.set({ presenter: !store.get().presenter }));
  store.subscribe((s, prev) => {
    if (s.presenter !== prev.presenter) bar.classList.toggle('hidden', !s.presenter);
    if (s.systemId !== prev.systemId) for (const b of bar.querySelectorAll('[data-system]')) b.classList.toggle('sel', b.dataset.system === s.systemId);
  });
  if (opts.presenter) store.set({ presenter: true });

  return { startTour, stopTour, pause, resume, startAttract, stopAttract, get tour() { return tour; }, step, sysById };
}
