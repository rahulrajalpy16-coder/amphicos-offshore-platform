// Usage: node src/scene/__tools__/perf.mjs <baseUrl> [quality] [WxH]  (headless numbers are indicative only)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const [base = 'http://127.0.0.1:5179', q = 'medium', size = '1920x1080'] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
const t0 = Date.now();
await page.goto(base + '/src/scene/dev.html?quality=' + q, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
console.log('load to ready ms', Date.now() - t0, 'build ms', await page.evaluate(() => window.__world.report.ms));
for (const v of ['bow34', 'er', 'hv', 'ccr']) {
  await page.evaluate((n) => window.__dev.view(n), v);
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => window.__dev.measure(4000));
  console.log(v, JSON.stringify({ fps: +r.fps.toFixed(1), drawCalls: r.calls, trianglesRendered: r.rendererTriangles, visibleMeshes: r.meshes, sceneTrianglesVisible: r.triangles, textures: r.textures, geometries: r.geometries }));
}
const gl = await page.evaluate(() => { const g = window.__dev.renderer.getContext(); const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; });
console.log('GL renderer:', gl);
await browser.close();
