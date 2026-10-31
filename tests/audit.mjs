// Framing audit: select every rig system and measure how much of its equipment is inside the free view and unobstructed.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const only = process.argv[2] ? process.argv[2].split(',') : null;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 860 }, reducedMotion: 'reduce' }); const errs = [];
p.on('pageerror', e => errs.push('ERR ' + e.message));
await p.goto('http://127.0.0.1:8766/index.html#rig', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.getElementById('loading')?.hidden === true, null, { timeout: 240000 }); await p.waitForTimeout(1500);
const ids = only || await p.evaluate(() => window.__audit.pkgs());
const rows = [];
for (const id of ids) {
  await p.evaluate(i => window.__audit.select(i), id);
  await p.waitForFunction(() => !window.__nav.flying(), null, { timeout: 60000 }).catch(() => {}); await p.waitForTimeout(2200);
  const r = await p.evaluate(i => ({ name: window.__audit.name(i), ...window.__audit.score(i) }), id);
  rows.push({ id, ...r }); const top = Object.entries(r.blockers).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}:${v}`).join(' ');
  console.log(`${r.clear < 0.6 || r.inside < 0.8 ? 'WEAK' : 'ok  '} ${id.padEnd(16)} inside ${r.inside.toFixed(2)} clear ${r.clear.toFixed(2)} n${r.n} cut${await p.evaluate(() => window.__audit.cut())}  ${top}  ${r.name || ''}`);
  if (process.env.SHOTS) await p.screenshot({ path: `/tmp/fm/shots/audit/${id}.png`, timeout: 120000 });
}
console.log(errs.slice(0, 5).join('\n') || 'no page errors');
await b.close();
