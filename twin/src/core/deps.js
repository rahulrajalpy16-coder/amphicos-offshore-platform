// Single place where the platform binds to the modules owned by the other teams (contract: docs/ARCHITECTURE.md).
// window.__twin.deps reports the bound modules so tests can assert the real implementations are in use.
import dbJson from '../data/fpso_db.json';
import { createRenderer as realCreateRenderer } from '../scene/renderer.js';
import { buildWorld as realBuildWorld } from '../scene/world.js';
import { createSim as realCreateSim } from '../sim/index.js';
import { getHmi as realGetHmi, hmiForComponent as realHmiForComponent } from '../hmi/index.js';

export const db = dbJson;
export const createRenderer = realCreateRenderer;
export const buildWorld = realBuildWorld;
export const createSim = realCreateSim;
export const getHmi = realGetHmi;
export const hmiForComponent = realHmiForComponent;

export const depsReport = {
  db: 'real:src/data/fpso_db.json ' + ((dbJson.meta && dbJson.meta.version) || ''),
  renderer: 'real:src/scene/renderer.js',
  world: 'real:src/scene/world.js',
  sim: 'real:src/sim/index.js',
  hmi: 'real:src/hmi/index.js',
};
