// Development harness: mounts one HMI module against the real database and a running simulation.
import db from '../data/fpso_db.json'
import { createSim } from '../sim/index.js'
import { MODULES, MODULE_IDS } from './index.js'

const q = new URLSearchParams(location.search)
const modId = q.get('module') || 'pms'
const sim = createSim(db, { seed: Number(q.get('seed') || 20261030) })
window.__sim = sim
const sel = document.getElementById('mod')
for (const id of MODULE_IDS) sel.append(new Option(id, id, false, id === modId))
sel.onchange = () => { q.set('module', sel.value); location.search = q.toString() }
const sys = db.systems.find((s) => s.hmi?.module === modId)
const componentId = q.get('component') || sys?.primary_component
const host = document.getElementById('host')
const ctx = { db, sim, bus: null, componentId, systemId: sys?.id, variant: q.get('variant') || 'retrofit' }
if (q.get('scenario')) sim.command('scenario.run', { id: q.get('scenario') })
if (q.get('variant')) sim.command('variant.set', { systemId: sys?.id, variant: q.get('variant') })
const inst = MODULES[modId].mount(host, ctx)
window.__hmi = inst
if (q.get('variant')) inst.setVariant(q.get('variant'))
if (q.get('paused') !== '1') sim.start()
const runBtn = document.getElementById('run')
runBtn.onclick = () => { if (sim.running) { sim.stop(); runBtn.textContent = 'Run' } else { sim.start(); runBtn.textContent = 'Pause' } }
document.getElementById('info').textContent = `${sys?.id} ${componentId}`
const mini = document.getElementById('mini')
setInterval(() => { try { MODULES[modId].renderMini(mini, ctx) } catch (e) { console.error(e) } }, 500)
window.__ready = true
