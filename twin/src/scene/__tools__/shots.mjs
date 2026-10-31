// Usage: node src/scene/__tools__/shots.mjs <baseUrl> <outDir> [view,view,...] [WxH]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const { chromium } = pw;
const [base = 'http://localhost:5179', out = 'docs/screenshots', list = '', size = '1600x900'] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
const logs = [];
page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
await page.goto(base + '/src/scene/dev.html?manual=1&quality=' + (process.env.Q || 'high'), { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
const views = list ? list.split(',') : await page.evaluate(() => Object.keys(window.__dev.views));
for (const v of views) {
  const [name, variant] = v.split(':');
  await page.evaluate(([n, va]) => { window.__dev.view(n); if (va) window.__world.setVariant(va); else window.__world.setVariant('retrofit'); }, [name, variant]);
  const ms = await page.evaluate(() => { window.__dev.renderOnce(30); return window.__dev.renderOnce(1); });
  const buf = await page.evaluate(() => window.__dev.renderer.domElement.toDataURL('image/png'));
  (await import('fs')).writeFileSync(`${out}/${v.replace(':', '_')}.png`, Buffer.from(buf.split(',')[1], 'base64'));
  console.log('frame ms', Math.round(ms));
  console.log('shot', v);
}
const rep = await page.evaluate(() => ({ report: window.__world.report, stats: window.__world.stats(window.__dev.renderer) }));
console.log(JSON.stringify(rep.report.fallbackTypes), 'outside:', JSON.stringify(rep.report.outsideRoom), 'failed:', JSON.stringify(rep.report.failed), 'ms', rep.report.ms);
console.log(logs.filter((l) => !l.startsWith('debug')).slice(0, 40).join('\n'));
await browser.close();
