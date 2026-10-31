// System index S01..S15 grouped by commercial grouping, with the physical installation room shown per system.
import { h, pad2 } from './dom.js';

export function createSystemIndex({ root, db, store, bus }) {
  const roomById = new Map(db.rooms.map((r) => [r.id, r]));
  const groups = new Map();
  for (const s of [...db.systems].sort((a, b) => a.number - b.number)) {
    const g = s.commercial_group || 'Systems';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(s);
  }
  const list = h('div', { class: 'list', role: 'list' });
  for (const [g, systems] of groups) {
    list.append(h('div', { class: 'group' }, g));
    for (const s of systems) {
      const room = roomById.get(s.primary_room);
      const extra = (s.rooms || []).filter((r) => r !== s.primary_room).length;
      const where = (room ? room.name : s.primary_room) + (extra ? ` + ${extra} more` : '');
      list.append(h('button', {
        class: 'sys', role: 'listitem', 'data-system': s.id, title: s.name,
        onclick: () => { document.body.classList.remove('index-open'); bus.emit('select:system', { systemId: s.id, source: 'index' }); },
      }, h('span', { class: 'n' }, pad2(s.number)), h('span', { class: 't' }, h('b', {}, s.short || s.name), h('span', {}, where))));
    }
  }
  const panel = h('aside', { class: 'panel', id: 'index', 'aria-label': 'System index' },
    h('header', {}, h('h2', {}, h('span', {}, `Systems in scope (${db.systems.length})`),
      h('button', { class: 'btn ghost mobile-only', onclick: () => document.body.classList.remove('index-open') }, 'Close')),
    h('p', { class: 'note' }, 'Grouped by commercial heading. The physical installation room is shown under each system and may differ from the heading, for example generator-mounted equipment sits on the diesel generators.')),
    list,
    h('div', { class: 'foot' }, 'Select a system to fly to its installation area. Keys 1 to 9 and 0 jump to systems 1 to 10, Shift+1 to 5 to systems 11 to 15.'));
  root.append(panel);
  store.subscribe((s, prev) => {
    if (s.systemId === prev.systemId) return;
    for (const b of list.querySelectorAll('.sys')) b.classList.toggle('sel', b.dataset.system === s.systemId);
    const cur = list.querySelector('.sys.sel');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
  });
  return { panel };
}
