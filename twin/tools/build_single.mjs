// Builds dist-single/Amphicos_FPSO_Digital_Twin.html: one self-contained HTML file (scripts, styles, logo,
// database inlined) that runs from file:// by double-click with no network access.
import { build } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist-single');
const NAME = 'Amphicos_FPSO_Digital_Twin.html';

await build({
  root,
  configFile: false,
  base: './',
  logLevel: 'warn',
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    outDir,
    emptyOutDir: true,
    target: 'es2020',
    assetsInlineLimit: 100 * 1024 * 1024,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 100000,
    reportCompressedSize: false,
  },
});

const src = path.join(outDir, 'index.html');
const dst = path.join(outDir, NAME);
fs.renameSync(src, dst);
for (const f of fs.readdirSync(outDir)) if (f !== NAME) fs.rmSync(path.join(outDir, f), { recursive: true, force: true });
const html = fs.readFileSync(dst, 'utf8');
// Guard: the single file must not reference any external resource.
const ext = html.match(/(?:src|href)\s*=\s*["'](?:https?:)?\/\/[^"']+/gi) || [];
if (ext.length) {
  console.error('External references found in single-file build:', ext.slice(0, 5));
  process.exit(1);
}
console.log(`single-file build: ${path.relative(root, dst)} ${(fs.statSync(dst).size / 1048576).toFixed(2)} MB`);
