// Exports the procedurally generated scene (world.root) to assets/Amphicos_FPSO_Twin.glb.
// Opens the built app (dist/) in headless Chromium via Playwright and runs three.js GLTFExporter in the page.
// Usage: npm run build && node tools/export_glb.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { serve } from './serve.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(APP, 'assets', 'Amphicos_FPSO_Twin.glb');

const srv = await serve(path.join(APP, 'dist'), 0);
const url = `http://127.0.0.1:${srv.address().port}/?idle=100000`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url);
  await page.waitForFunction(() => window.__twin && window.__twin.ready, null, { timeout: 120000 });
  const b64 = await page.evaluate(async () => {
    const blob = await window.__twin.exportGlb();
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const bin = Buffer.from(b64, 'base64');
  fs.writeFileSync(OUT, bin);
  const magic = bin.subarray(0, 4).toString('latin1');
  console.log(`GLB written: ${path.relative(APP, OUT)} ${(bin.length / 1048576).toFixed(2)} MB, magic ${magic}`);
  if (magic !== 'glTF') process.exitCode = 1;
} finally {
  await browser.close();
  srv.close();
}
