// Amphicos 3D Platform build.
// Produces fully self-contained pages (no CDN, no network, no external fonts):
//   dist/web/                 online edition (GitHub Pages, Claude preview): no CAD screenshots
//   dist/offline/Amphicos_Platform/   offline edition with launchers for Windows and macOS, CAD screenshots included
// Usage: node tools/build.mjs [--skip-twin]
import { build as esbuild } from '../twin/node_modules/esbuild/lib/main.js';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (...p) => path.join(root, ...p);
const args = new Set(process.argv.slice(2));
const fonts = fs.readFileSync(R('src/shared/fonts.css'), 'utf8');

// ---------- 1. FPSO twin: single-file page (Vite + vite-plugin-singlefile, the twin's own tool) ----------
if (!args.has('--skip-twin')) execSync('npm run build', { cwd: R('twin'), stdio: 'inherit' });
let twinHtml = fs.readFileSync(R('twin/dist-single/Amphicos_FPSO_Digital_Twin.html'), 'utf8');
twinHtml = twinHtml.replace('</head>', `<style>${fonts}</style></head>`);

// ---------- 2. Rig page: bundle its module script with three.js and the FPSO exterior into one inline script ----------
const src = fs.readFileSync(R('src/rig/rig.html'), 'utf8');
const mStart = src.indexOf('<script type="module">'), mEnd = src.indexOf('</script>', mStart);
const iStart = src.indexOf('<script type="importmap">'), iEnd = src.indexOf('</script>', iStart) + 9;
if (mStart < 0 || iStart < 0) throw new Error('rig page: module or import map script not found');
const moduleCode = src.slice(mStart + '<script type="module">'.length, mEnd);
const db = JSON.parse(fs.readFileSync(R('twin/src/data/fpso_db.json'), 'utf8'));
// the exterior uses only these parts of the twin database; the system list feeds the FPSO menus in the rig page
const trimmedDb = { meta: db.meta, vessel: db.vessel, topsides: db.topsides,
  systems: db.systems.map((s) => ({ id: s.id, number: s.number, name: s.name, commercial_group: s.commercial_group })) };

async function bundleRig(cadImages) {
  const entry = R('tools/.rig-entry.js');
  let code = moduleCode.replace("import('./fpso/exterior.js')", "import('@twin-exterior')");
  if (!cadImages) code = code.replace('const CAD_IMAGES = true;', 'const CAD_IMAGES = false;');
  fs.writeFileSync(entry, code);
  const out = await esbuild({
    entryPoints: [entry], bundle: true, write: false, format: 'esm', minify: process.env.MINIFY !== '0', target: 'es2020', splitting: false,
    legalComments: 'none', logLevel: 'warning', nodePaths: [R('twin/node_modules')],
    alias: { '@twin-exterior': R('twin/src/embed/exterior.js') },
    plugins: [{ name: 'trim-db', setup(b) { b.onLoad({ filter: /fpso_db\.json$/ }, () => ({ contents: JSON.stringify(trimmedDb), loader: 'json' })); } }],
  });
  fs.rmSync(entry);
  return out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
}
function rigPage(js) {
  let html = src.slice(0, iStart) + src.slice(iEnd, mStart) + '<script type="module">\n' + js + '\n</script>' + src.slice(mEnd + 9);
  // web fonts are embedded instead of loaded from Google Fonts
  html = html.replace(/<link rel="preconnect"[^>]*>\n?/g, '').replace(/<script>\s*\/\/ fonts load without blocking[\s\S]*?<\/script>\n?/, '');
  html = html.replace('<style>', `<style>${fonts}</style>\n<style>`);
  if (/cdn\.jsdelivr|unpkg\.com|fonts\.googleapis|fonts\.gstatic/.test(html)) throw new Error('rig page still references a CDN or web font');
  return '<!DOCTYPE html>\n' + html;
}

// ---------- 3. write editions ----------
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
fs.rmSync(R('dist'), { recursive: true, force: true });
const web = R('dist/web'), off = R('dist/offline/Amphicos_Platform');
write(path.join(web, 'index.html'), rigPage(await bundleRig(false)));
write(path.join(web, 'fpso/index.html'), twinHtml);
write(path.join(web, '.nojekyll'), '');
write(path.join(off, 'index.html'), rigPage(await bundleRig(true)));
write(path.join(off, 'fpso/index.html'), twinHtml);
fs.mkdirSync(path.join(off, 'shelter'), { recursive: true });
const shots = fs.existsSync(R('private/shelter')) ? fs.readdirSync(R('private/shelter')).filter((f) => f.endsWith('.jpg')) : [];
for (const f of shots) fs.copyFileSync(R('private/shelter', f), path.join(off, 'shelter', f));
for (const f of fs.readdirSync(R('launchers'))) fs.copyFileSync(R('launchers', f), path.join(off, f));
fs.chmodSync(path.join(off, 'Start Amphicos (Mac).command'), 0o755);

const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0) + ' KB';
console.log(`web:     index ${kb(path.join(web, 'index.html'))}, fpso ${kb(path.join(web, 'fpso/index.html'))}`);
console.log(`offline: index ${kb(path.join(off, 'index.html'))}, ${shots.length} CAD screenshots${shots.length ? '' : ' (private/shelter missing: offline edition built without them)'}`);
