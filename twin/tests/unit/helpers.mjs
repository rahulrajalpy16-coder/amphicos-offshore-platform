// Test helpers: always run against the real engineering database (src/data/fpso_db.json).
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSim } from '../../src/sim/index.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DB_PATH = join(root, 'src', 'data', 'fpso_db.json')
if (!existsSync(DB_PATH)) throw new Error('src/data/fpso_db.json missing: unit tests must run against the real database')
export const db = JSON.parse(readFileSync(DB_PATH, 'utf8'))
export const newSim = (opts) => createSim(db, opts)
export const active = (sim) => sim.state.alarms.filter((a) => a.active)
export function runSteps(sim, seconds, each) { const n = Math.round(seconds / sim.dt); for (let i = 0; i < n; i++) { sim.step(); if (each) each(sim.state) } }
export const ev = (sim, re) => sim.state.events.filter((e) => re.test(e.text))
