// Equipment registry: one procedural builder per component TYPE (docs/DB_SCHEMA.md).
import * as THREE from 'three';
import { shipToWorld } from '../../core/coords.js';
import { EquipCtx, facingRotation } from './common.js';
import { screenMat } from '../materials.js';
import { canvas, drawScreen, toTex } from '../textures.js';
import * as engine from './engine.js';
import * as elec from './electrical.js';
import * as control from './control.js';
import * as tel from './telecom.js';
import * as proc from './process.js';

export const BUILDERS = {
  diesel_generator_set: engine.diesel_generator_set,
  alternator: engine.alternator,
  engine_local_panel: engine.engine_local_panel,
  oil_mist_detector_head: engine.oil_mist_detector_head,
  oil_mist_detector_unit: engine.oil_mist_detector_unit,
  avr_unit: engine.avr_unit,
  governor_actuator: engine.governor_actuator,
  speed_controller_cabinet: engine.speed_controller_cabinet,
  pump_motor: engine.pump_motor,
  mv_switchboard_panel: elec.mv_switchboard_panel,
  lv_switchboard_panel: elec.lv_switchboard_panel,
  protection_relay_ied: elec.protection_relay_ied,
  generator_control_panel: elec.generator_control_panel,
  pms_cabinet: elec.pms_cabinet,
  synchroniser_panel: elec.synchroniser_panel,
  vfd_cabinet: elec.vfd_cabinet,
  mcc_lineup: elec.mcc_lineup,
  transformer: elec.transformer,
  ups_cabinet: elec.ups_cabinet,
  battery_rack: elec.battery_rack,
  control_cabinet: elec.control_cabinet,
  marshalling_cabinet: elec.marshalling_cabinet,
  safety_controller_cabinet: elec.safety_controller_cabinet,
  field_junction_box: elec.field_junction_box,
  generic_cabinet: elec.generic_cabinet,
  operator_console: control.operator_console,
  workstation_desk: control.workstation_desk,
  large_display_wall: control.large_display_wall,
  cctv_monitor_desk: control.cctv_monitor_desk,
  telecom_rack_19in: tel.telecom_rack_19in,
  paga_amplifier_rack: tel.paga_amplifier_rack,
  paga_access_panel: tel.paga_access_panel,
  loudspeaker_horn: tel.loudspeaker_horn,
  loudspeaker_ceiling: tel.loudspeaker_ceiling,
  alarm_beacon: tel.alarm_beacon,
  pabx_rack: tel.pabx_rack,
  telephone_industrial: tel.telephone_industrial,
  telephone_desk: tel.telephone_desk,
  iptv_headend_rack: tel.iptv_headend_rack,
  tv_display: tel.tv_display,
  satellite_antenna_dome: tel.satellite_antenna_dome,
  cctv_camera_fixed: tel.cctv_camera_fixed,
  cctv_camera_ptz: tel.cctv_camera_ptz,
  nvr_rack: tel.nvr_rack,
  marine_boiler: proc.marine_boiler,
  boiler_burner_unit: proc.boiler_burner_unit,
  boiler_control_panel: proc.boiler_control_panel,
  flame_scanner: proc.flame_scanner,
  drum_level_transmitter: proc.drum_level_transmitter,
  igg_generator_unit: proc.igg_generator_unit,
  igg_scrubber_tower: proc.igg_scrubber_tower,
  igg_blower: proc.igg_blower,
  igg_control_panel: proc.igg_control_panel,
  o2_analyser_cabinet: proc.o2_analyser_cabinet,
  deck_water_seal: proc.deck_water_seal,
  igg_deck_valve: proc.igg_deck_valve,
  field_transmitter: proc.field_transmitter,
  cable_tray: proc.cable_tray,
  ladder_stair: proc.ladder_stair,
};

// shared placeholder screen textures by kind (HMI modules replace material.map at runtime)
const placeholder = new Map();
function placeholderTex(kind) {
  if (!placeholder.has(kind)) {
    const c = canvas(512, 320);
    drawScreen(c.getContext('2d'), 512, 320, kind, kind === 'cctv' ? 'CCTV' : kind === 'tv' ? 'IPTV' : 'HMI', 'p');
    placeholder.set(kind, toTex(c, { repeat: false }));
  }
  return placeholder.get(kind);
}

const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
proxyMat.name = 'pickProxy';

export function buildComponent(c, env) {
  const ctx = new EquipCtx(c, env);
  let fn = BUILDERS[c.type];
  let fallback = false;
  if (!fn) { fn = BUILDERS.generic_cabinet; fallback = true; }
  try { fn(ctx); }
  catch (err) {
    console.warn('[equipment] builder failed', c.id, c.type, err);
    ctx.b = new (ctx.b.constructor)();
    ctx.vb = { legacy: new (ctx.b.constructor)(), retrofit: new (ctx.b.constructor)() };
    ctx.screens = [];
    BUILDERS.generic_cabinet(ctx);
    fallback = true;
  }
  const group = new THREE.Group();
  group.name = c.id;
  const small = ctx.H < 0.6 && ctx.W < 0.8;
  group.add(ctx.b.toGroup(c.id + ':main', { cast: !small, receive: true }));
  let variants = null;
  if (ctx.vmode === 'both') {
    const lg = ctx.vb.legacy.toGroup(c.id + ':legacy', { cast: false });
    const rg = ctx.vb.retrofit.toGroup(c.id + ':retrofit', { cast: false });
    lg.userData.variant = 'legacy'; rg.userData.variant = 'retrofit';
    group.add(lg, rg);
    variants = { legacy: lg, retrofit: rg };
  }
  const screens = [];
  ctx.screens.forEach((s, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), screenMat(placeholderTex(s.kind)));
    m.position.set(s.x, s.y, s.z);
    m.rotation.set(s.rx, s.ry, 0, 'YXZ');
    m.name = c.id + ':screen' + i;
    m.userData = { componentId: c.id, systemId: c.system, isScreen: true, screenIndex: i, screenKind: s.kind, variant: s.variant, title: s.title };
    m.castShadow = false;
    const parent = variants && s.variant ? variants[s.variant] : group;
    parent.add(m);
    screens.push(m);
  });
  for (const o of ctx.extra) group.add(o);
  // pick proxy (cheap box, invisible material)
  const { W, H, D } = ctx;
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(Math.max(W, 0.12) + 0.04, Math.max(H, 0.12) + 0.04, Math.max(D, 0.12) + 0.04), proxyMat);
  proxy.position.y = H / 2;
  proxy.name = c.id + ':proxy';
  proxy.userData = { componentId: c.id, systemId: c.system, pickable: true, pickProxy: true, noCollide: true };
  group.add(proxy);
  // placement
  shipToWorld(c.pos, group.position);
  group.rotation.y = facingRotation(c.facing);
  group.userData = { componentId: c.id, systemId: c.system, alsoSystems: c.also_systems || [], pickable: true, type: c.type, variantMode: ctx.vmode, fallback, dims: { W, H, D } };
  group.updateMatrixWorld(true);
  return { group, screens, proxy, variants, fallback };
}
