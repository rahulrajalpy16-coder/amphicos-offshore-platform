// Builds dist-embed/fpso-exterior.js: the twin's hull and topsides as one ES module for the Amphicos 3D
// Platform. 'three' stays external (the host page maps it with an import map to the same three r169).
// Only the parts of the database the exterior uses (meta, vessel, topsides) are bundled.
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const full = JSON.parse(fs.readFileSync(path.join(root, 'src/data/fpso_db.json'), 'utf8'));
const trimmed = { meta: full.meta, vessel: full.vessel, topsides: full.topsides };
const trimDb = {
  name: 'trim-db',
  enforce: 'pre',
  load(id) { return id.endsWith('fpso_db.json') ? JSON.stringify(trimmed) : null; },
};
await build({
  root, configFile: false, logLevel: 'warn',
  plugins: [trimDb],
  build: {
    outDir: path.join(root, 'dist-embed'), emptyOutDir: false, target: 'es2020', minify: true, reportCompressedSize: false,
    lib: { entry: path.join(root, 'src/embed/exterior.js'), formats: ['es'], fileName: () => 'fpso-exterior.js' },
    rollupOptions: { external: (id) => id === 'three' || id.startsWith('three/') },
  },
});
const out = path.join(root, 'dist-embed/fpso-exterior.js');
let js = fs.readFileSync(out, 'utf8');
// the host import map provides three/addons/; map the twin's examples/jsm imports onto it
js = js.replace(/(["'])three\/examples\/jsm\//g, '$1three/addons/');
fs.writeFileSync(out, js);
console.log('exterior module:', path.relative(root, out), (fs.statSync(out).size / 1024).toFixed(0), 'KB');
