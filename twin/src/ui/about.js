// About panel: disclaimer, how to use, keyboard shortcuts, data provenance, display quality, GLB export.
import { h } from './dom.js';

export const DISCLAIMER = 'Educational simulation and representative arrangement. This model is not vessel-specific and is not a shipyard or construction drawing. HMI behaviour is a generic educational simulation, not live vessel control and not OEM logic. No engineering validation, class approval, certification or OEM compatibility is claimed. Equipment is shown as generic types without brand claims.';

export const SHORTCUTS = [
  ['1 to 9, 0', 'Fly to systems 1 to 10'],
  ['Shift+1 to 5', 'Fly to systems 11 to 15'],
  ['PageDown / N', 'Next system (presenter clickers)'],
  ['PageUp / B', 'Previous system'],
  ['Esc', 'Back one step: HMI, equipment, room, vessel'],
  ['H / Home', 'Vessel overview, closes the hull'],
  ['I / Enter', 'Open HMI or inspection of the focused equipment'],
  ['G', '2D engineering drawings'],
  ['X', 'X-ray hull'],
  ['V', 'Toggle legacy and retrofit'],
  ['F', 'Walk mode inside a room (WASD or arrows, Shift to go faster, drag to look)'],
  ['T', 'Guided tour, Space pauses'],
  ['P', 'Presenter quick-jump bar'],
  ['?', 'This panel'],
];

export function createAbout({ root, db, bus, store, depsReport, onQuality, onExportGlb, getStats }) {
  let el = null;
  function close() { if (el) { el.remove(); el = null; return true; } return false; }
  function open() {
    close();
    const meta = db.meta || {};
    const stats = getStats ? getStats() : {};
    const qualBtns = ['high', 'medium', 'low'].map((q) => h('button', { class: 'btn' + (stats.quality === q ? ' on' : ''), 'data-quality': q, onclick: () => { onQuality(q); open(); } }, q));
    el = h('div', { class: 'modal', id: 'about', role: 'dialog', 'aria-modal': 'true', onclick: (e) => { if (e.target === el) close(); } },
      h('div', { class: 'box' },
        h('button', { class: 'btn ghost', style: 'position:absolute;right:0.8rem;top:0.8rem', onclick: close }, 'Close'),
        h('h2', {}, 'About this digital twin'),
        h('div', { class: 'disclaimer', id: 'disclaimer' }, DISCLAIMER, meta.disclaimer ? h('div', { style: 'margin-top:0.4rem' }, meta.disclaimer) : null),
        h('h3', {}, 'What it shows'),
        h('p', {}, `A representative FPSO with ${db.systems.length} electrical, automation, control and telecom systems in their physical installation areas, ${db.rooms.length} rooms and ${db.components.length} equipment items, all generated from one equipment-location database (${meta.version ? 'version ' + meta.version : 'fpso_db.json'}). The 3D model, the 2D drawings, the tags and the HMI simulations read the same data, so identifiers match everywhere.`),
        h('h3', {}, 'How to explore'),
        h('ol', {},
          h('li', {}, 'Vessel: orbit freely, use Views for presets, X-ray to see the internal spaces.'),
          h('li', {}, 'System: pick one in the index, a numbered tag or the presenter bar. The camera flies to the installation room and opens the hull on that side.'),
          h('li', {}, 'Room: look around (or Walk), then click any equipment to focus it.'),
          h('li', {}, 'Equipment: read the card, then Open HMI or Inspect for the interactive demonstration.'),
          h('li', {}, 'Return with Esc, the breadcrumb or Home.')),
        h('h3', {}, 'Keyboard shortcuts'),
        h('table', {}, ...SHORTCUTS.map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', {}, v)))),
        h('h3', {}, 'Display quality'),
        h('div', { class: 'actions', style: 'margin-top:0.2rem' }, ...qualBtns),
        h('h3', {}, 'Data and assumptions'),
        h('p', {}, `${(db.assumptions || []).length} documented engineering assumptions and ${(db.deviations_from_reference || []).length} recorded deviations from the supplied concept references are held in the database and in docs/ENGINEERING_BASIS.md.`),
        onExportGlb ? h('div', { class: 'actions' }, h('button', { class: 'btn', id: 'btn-export-glb', onclick: () => onExportGlb() }, 'Download 3D model (GLB)')) : null,
        h('p', { style: 'color:var(--dim);font-size:0.72rem;margin-top:1rem' }, 'Runs fully offline. Modules: ' + Object.entries(depsReport).map(([k, v]) => `${k} ${String(v).split(':')[0]}`).join(', ') + '.')));
    root.append(el);
  }
  bus.on('request:about', open);
  const prevClose = bus.closeTopModal;
  bus.closeTopModal = () => close() || (prevClose ? prevClose() : false);
  return { open, close };
}
