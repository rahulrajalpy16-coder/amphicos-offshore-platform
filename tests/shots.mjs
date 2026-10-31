// quick visual pass: home, offshore, rig, FPSO card. node tests/shots.mjs <outdir> [width height]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const out = process.argv[2] || '/tmp/fm/shots/ui', W = +(process.argv[3] || 1440), H = +(process.argv[4] || 860);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: W, height: H } }); const errs = [];
p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const settle = async () => { await p.waitForTimeout(600); await p.waitForFunction(() => !window.__nav.flying(), null, { timeout: 200000 }).catch(() => {}); await p.waitForTimeout(1200); };
await p.goto('http://127.0.0.1:8766/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.getElementById('loading')?.hidden === true, null, { timeout: 240000 }); await p.waitForTimeout(3000);
await p.screenshot({ path: `${out}/01-home.png`, timeout: 120000 });
await p.click('.pjcard[data-p="offshore"]'); await settle(); await p.screenshot({ path: `${out}/02-offshore.png`, timeout: 120000 });
console.log('offshore', await p.evaluate(() => [location.hash, document.querySelector('#panel h2')?.textContent, window.__twin.rigPose().eye.map(v => Math.round(v))].join(' | ')));
await p.click('#panel [data-action="overview"]'); await settle(); await p.screenshot({ path: `${out}/03-rig.png`, timeout: 120000 });
console.log(errs.slice(0, 8).join('\n') || 'no errors');
await b.close();
