// HMI module registry. One module per systems[].hmi.module id. Each exports meta, mount(container, ctx) and renderMini(canvas2d, ctx).
import * as pms from './pms.js'
import * as dgctrl from './dgctrl.js'
import * as relay from './relay.js'
import * as drives from './drives.js'
import * as icss from './icss.js'
import * as paga from './paga.js'
import * as pabx from './pabx.js'
import * as iptv from './iptv.js'
import * as cctv from './cctv.js'
import * as boiler from './boiler.js'
import * as igg from './igg.js'
import * as dglocal from './dglocal.js'
import * as omd from './omd.js'
import * as avr from './avr.js'
import * as governor from './governor.js'

export const MODULES = { pms, dgctrl, relay, drives, icss, paga, pabx, iptv, cctv, boiler, igg, dglocal, omd, avr, governor }
export const MODULE_IDS = Object.keys(MODULES)

export function getHmi(moduleId) { return MODULES[moduleId] || null }

// The module for a component: its own system's module (components of other systems that host an HMI use the host system)
export function hmiForComponent(db, componentId) {
  const c = (db.components || []).find((x) => x.id === componentId)
  if (!c) return null
  const host = (db.systems || []).find((s) => (s.hmi?.host_components || []).includes(componentId))
  const sys = host || (db.systems || []).find((s) => s.id === c.system)
  return sys && sys.hmi ? getHmi(sys.hmi.module) : null
}
