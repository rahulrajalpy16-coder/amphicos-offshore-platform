// Right-hand context panel: vessel welcome, room panel (stage 3) and equipment card (stage 4).
import { h, esc, pad2 } from './dom.js';

const TYPE_LABEL = (t) => String(t || '').replace(/_/g, ' ');

export function createContextPanel({ root, db, store, bus, nav, hasHmi }) {
  const sysById = new Map(db.systems.map((s) => [s.id, s]));
  const roomById = new Map(db.rooms.map((r) => [r.id, r]));
  const compById = new Map(db.components.map((c) => [c.id, c]));
  const deckById = new Map(((db.vessel && db.vessel.decks) || []).map((d) => [d.id, d]));
  const cablesByComp = new Map();
  for (const k of db.cables || []) {
    for (const end of [k.from, k.to]) {
      if (!cablesByComp.has(end)) cablesByComp.set(end, []);
      cablesByComp.get(end).push(k);
    }
  }
  const scroll = h('div', { class: 'scroll' });
  const fill = (...kids) => scroll.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
  const panel = h('aside', { class: 'panel', id: 'context', 'aria-live': 'polite' }, scroll);
  root.append(panel);
  let dismissedWelcome = false;

  const sysRef = (sid) => {
    const s = sysById.get(sid);
    if (!s) return h('span', {}, sid);
    return h('button', { class: 'linkbtn', 'data-system': sid, onclick: () => bus.emit('select:system', { systemId: sid, source: 'panel' }) }, `${pad2(s.number)} ${s.short || s.name}`);
  };
  const compRef = (cid) => {
    const c = compById.get(cid);
    if (!c) return h('span', {}, cid);
    return h('button', { class: 'linkbtn', 'data-component': cid, onclick: () => bus.emit('select:component', { componentId: cid, source: 'panel' }) }, `${c.tag || c.id} ${c.name}`);
  };
  const list = (items) => h('ul', {}, ...(items || []).map((t) => h('li', {}, t)));
  const sec = (title, ...body) => h('div', { class: 'ctx-sec' }, h('h3', {}, title), ...body);

  function retrofitCompare(sys, variant) {
    if (!sys || !sys.legacy || !sys.retrofit) return null;
    return sec('Legacy installation and retrofit',
      h('div', { class: 'compare' },
        h('div', { class: 'lg' + (variant === 'legacy' ? ' active' : '') }, h('h4', {}, 'Legacy'),
          sys.legacy.typical_condition ? h('p', {}, sys.legacy.typical_condition) : null,
          list(sys.legacy.limitations)),
        h('div', { class: 'rf' + (variant === 'retrofit' ? ' active' : '') }, h('h4', {}, 'Retrofit scope'),
          list(sys.retrofit.scope))),
      sys.retrofit.functional_improvements && sys.retrofit.functional_improvements.length ? h('div', {}, h('p', {}, h('b', {}, 'Functional improvements (qualitative)')), list(sys.retrofit.functional_improvements)) : null,
      sys.retrofit.integration && sys.retrofit.integration.length ? h('div', {}, h('p', {}, h('b', {}, 'Integration with existing vessel infrastructure')), list(sys.retrofit.integration)) : null,
      sys.retrofit.post_upgrade_operation ? h('p', {}, h('b', {}, 'After the upgrade: '), sys.retrofit.post_upgrade_operation) : null);
  }

  function renderVessel() {
    if (dismissedWelcome) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    const v = db.vessel || {};
    fill(
      h('button', { class: 'btn ghost close', 'aria-label': 'Close', onclick: () => { dismissedWelcome = true; panel.classList.add('hidden'); } }, 'Close'),
      h('div', { class: 'ctx-kicker' }, 'Vessel overview'),
      h('div', { class: 'ctx-title' }, (db.meta && (db.meta.visitor_title || db.meta.vessel_name)) || 'Amphicos FPSO Digital Twin'),
      h('div', { class: 'ctx-sub' }, `Representative ${v.loa || ''} m FPSO, beam ${v.beam || ''} m, depth ${v.depth || ''} m. Arrangement is representative, not vessel-specific.`),
      sec('Explore', h('p', {}, 'Choose one of the 15 systems in the index or click a numbered tag. The camera flies to the installation area so you can see the whole room first. Then click any cabinet, panel or sensor to focus it and open its HMI or inspection view.')),
      sec('Controls', h('ul', {},
        h('li', {}, 'Drag to orbit, right-drag or two fingers to pan, wheel or pinch to zoom.'),
        h('li', {}, 'Esc goes back one step, H returns to the vessel, G opens the 2D drawings.'),
        h('li', {}, 'X-ray shows internal spaces. Legacy and Retrofit switch the equipment generation.'))),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', onclick: () => bus.emit('request:tour', {}) }, 'Start guided tour'),
        h('button', { class: 'btn', onclick: () => bus.emit('request:2d', {}) }, 'Open 2D drawings')));
  }

  function renderRoom(s) {
    const room = roomById.get(s.roomId);
    if (!room) return;
    panel.classList.remove('hidden');
    const sys = sysById.get(s.systemId);
    const inRoom = db.components.filter((c) => c.room === room.id);
    const order = (c) => (sys && (c.system === sys.id || (c.also_systems || []).includes(sys.id)) ? 0 : c.system === 'CTX' ? 2 : 1);
    inRoom.sort((a, b) => order(a) - order(b) || String(a.system).localeCompare(String(b.system)) || String(a.tag).localeCompare(String(b.tag)));
    const systemsHere = [...new Set(inRoom.flatMap((c) => [c.system, ...(c.also_systems || [])]).filter((x) => sysById.has(x)))].sort();
    const elsewhere = sys ? (sys.rooms || []).filter((r) => r !== room.id) : [];
    const deck = deckById.get(room.deck);
    fill(
      h('div', { class: 'ctx-kicker' }, sys ? `System ${pad2(sys.number)} installation area` : 'Room'),
      h('div', { class: 'ctx-title', id: 'ctx-room-name' }, room.name),
      h('div', { class: 'ctx-sub' }, [deck ? deck.name : room.deck, room.hazardous_area].filter(Boolean).join(', ')),
      sys ? sec(sys.name, h('p', {}, sys.summary || '')) : null,
      room.purpose ? sec('Purpose', h('p', {}, room.purpose)) : null,
      sec(`Equipment in this room (${inRoom.length})`, h('div', { id: 'room-eq' }, ...inRoom.map((c) => h('button', {
        class: 'eq' + (order(c) === 0 ? ' of-sel' : ''), 'data-component': c.id, title: c.description || c.name,
        onclick: () => bus.emit('select:component', { componentId: c.id, source: 'panel' }),
      }, h('span', { class: 'tg' }, c.tag || c.id), h('span', { class: 'nm' }, c.name), h('span', { class: 'sn' }, c.system === 'CTX' ? 'ctx' : c.system))))),
      elsewhere.length ? sec(`${sys.short || sys.name} is also located in`, h('div', {}, ...elsewhere.map((rid) => h('div', {}, h('button', {
        class: 'linkbtn', 'data-room': rid, onclick: () => bus.emit('select:room', { roomId: rid, systemId: sys.id, source: 'panel' }),
      }, 'Fly to ' + ((roomById.get(rid) || {}).name || rid)))))) : null,
      systemsHere.length > 1 ? sec('Systems with equipment here', h('div', { class: 'chips' }, ...systemsHere.map((sid) => sysRef(sid)))) : null,
      room.fire_zone ? sec('Boundaries (representative)', h('p', {}, room.fire_zone)) : null,
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: () => bus.emit('request:walk', {}) }, 'Walk mode'),
        h('button', { class: 'btn', onclick: () => bus.emit('request:2d', { view: 'room' }) }, 'Room layout (2D)'),
        sys && (sys.rooms || []).length > 1 ? h('button', { class: 'btn', onclick: () => bus.emit('request:2d', { view: 'distribution' }) }, 'System distribution (2D)') : null),
      sys ? retrofitCompare(sys, s.variant) : null);
  }

  function renderEquipment(s) {
    const c = compById.get(s.componentId);
    if (!c) return;
    panel.classList.remove('hidden');
    const sys = sysById.get(c.system);
    const demoSys = sys || sysById.get((c.also_systems || [])[0]);
    const room = roomById.get(c.room);
    const cables = cablesByComp.get(c.id) || [];
    const insp = c.inspection || {};
    const showHmi = hasHmi(c.id);
    fill(
      h('div', { class: 'ctx-kicker' }, sys ? `System ${pad2(sys.number)} ${sys.short || ''}` : 'Context equipment'),
      h('div', { class: 'ctx-title', id: 'ctx-eq-name' }, c.name),
      h('div', { class: 'ctx-sub' }, h('span', { style: 'font-family:var(--mono);color:var(--accent)' }, c.tag || c.id), '  ', TYPE_LABEL(c.type)),
      h('div', { class: 'actions', style: 'margin-top:0.3rem' },
        demoSys ? h('button', { class: 'btn primary', id: 'btn-open-hmi', onclick: () => bus.emit('request:hmi', { componentId: c.id }) }, showHmi ? 'Open HMI' : 'Inspect') : null,
        h('button', { class: 'btn', onclick: () => bus.emit('request:2d', { view: 'room' }) }, 'Show in 2D'),
        h('button', { class: 'btn', onclick: () => nav.back() }, 'Back to room')),
      c.description ? sec('Description', h('p', {}, c.description)) : null,
      sec('Location', h('dl', { class: 'kv' },
        h('dt', {}, 'Room'), h('dd', {}, room ? h('button', { class: 'linkbtn', onclick: () => bus.emit('select:room', { roomId: room.id, source: 'panel' }) }, room.name) : c.room),
        h('dt', {}, 'Frame position'), h('dd', {}, `x ${fmt(c.pos[0])} m, y ${fmt(c.pos[1])} m, z ${fmt(c.pos[2])} m`),
        h('dt', {}, 'Size'), h('dd', {}, c.size ? `${c.size.map(fmt).join(' x ')} m` : 'n/a'),
        c.mounted_on ? h('dt', {}, 'Mounted on') : null, c.mounted_on ? h('dd', {}, compRef(c.mounted_on)) : null,
        c.display ? h('dt', {}, 'Display') : null, c.display ? h('dd', {}, c.display.kind || '') : null)),
      insp.what_to_look_at && insp.what_to_look_at.length ? sec('Inspection points', list(insp.what_to_look_at)) : null,
      insp.legacy_vs_retrofit ? sec('Legacy versus retrofit', h('p', {}, insp.legacy_vs_retrofit)) : null,
      cables.length ? sec(`Connections (${cables.length})`, h('div', {}, ...cables.map((k) => {
        const other = k.from === c.id ? k.to : k.from;
        return h('div', { style: 'margin:0.15rem 0;font-size:0.8rem' }, h('span', { class: 'chip' }, [k.kind, k.protocol].filter(Boolean).join(', ')), ' ', compRef(other));
      }))) : null,
      sys && sys.interfaces && sys.interfaces.length ? sec('System interfaces', h('div', {}, ...sys.interfaces.map((i) => h('div', { style: 'margin:0.15rem 0;font-size:0.8rem' },
        sysById.has(i.to) ? sysRef(i.to) : h('b', {}, i.to), ': ', [i.signal, i.medium].filter(Boolean).join(', '))))) : null,
      (c.also_systems || []).length ? sec('Also serves', h('div', { class: 'chips' }, ...c.also_systems.map(sysRef))) : null,
      sys ? retrofitCompare(sys, s.variant) : null);
  }

  function fmt(n) { return Number(n).toFixed(Math.abs(n) < 10 ? 2 : 1).replace(/\.?0+$/, ''); }

  function render(s) {
    if (s.level === 'vessel') renderVessel();
    else if (s.level === 'room') renderRoom(s);
    else if (s.level === 'equipment' || s.level === 'hmi') renderEquipment(s);
  }
  store.subscribe((s, prev) => {
    if (s.level !== prev.level || s.roomId !== prev.roomId || s.componentId !== prev.componentId || s.systemId !== prev.systemId || s.variant !== prev.variant) render(s);
  });
  render(store.get());
  return { panel, render: () => render(store.get()) };
}
export { esc };
