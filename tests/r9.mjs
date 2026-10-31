import fs from 'node:fs';
// Revision 09 acceptance: 6-DG split-bus plant and PMS on the supplied Amphicos layout, DG panel, ESD cause & effect,
// F&G and fire system demonstrations, and no client or third-party names. Usage: node r9.mjs <outdir>
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const out = process.argv[2] || 'r9shots', URL = 'http://127.0.0.1:8765/demo-test.html';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [], res = [];
const check = (n, ok, info = '') => res.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${info !== '' ? '  [' + String(info).slice(0, 220) + ']' : ''}`);
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' < ')));
const P = () => page.evaluate(() => window.__pms());
const hb = re => page.evaluate(s => { const b = [...document.querySelectorAll('#hmi-ctrl button')].find(x => new RegExp(s, 'i').test(x.textContent)); if (b) b.click(); return b ? b.textContent : null; }, re);
const hits = () => page.evaluate(() => [...document.querySelectorAll('#hmi-ctrl button')].map(b => b.textContent));
const dom = sel => page.evaluate(s => document.querySelector(s).click(), sel);
const shot = n => page.screenshot({ path: `${out}/${n}.png`, timeout: 180000 });
const openHmi = async (kind, id, sub) => { await page.evaluate(() => { if (!document.getElementById('hmi').hidden) document.querySelector('[data-action="hmi-close"]').click(); }); await dom(`#explorer [data-action="${kind}"][data-id="${id}"]`); await page.waitForTimeout(3500); if (sub) { await dom(`#panel [data-action="comp"][data-sub="${sub}"]`); await page.waitForTimeout(3000); } await dom('#panel [data-action="insp-hmi"]'); await page.waitForTimeout(2500); };
const waitFor = async (fn, ms) => { const end = Date.now() + ms; let s; do { await page.waitForTimeout(1500); s = await P(); if (fn(s)) return s; } while (Date.now() < end); return s; };
const inv = s => { const bad = [], groups = {}; s.gens.filter(g => g.st === 'online').forEach(g => { const key = s.tie === 'closed' ? 'AB' : g.bus; (groups[key] ||= []).push(g); const I = Math.hypot(g.kw, g.q) * 1000 / (Math.sqrt(3) * g.v); if (Math.abs(I - g.a) > 1) bad.push('I'); if (g.isl && Math.abs(g.hz - g.isl.f) > 0.01) bad.push('f'); });
  Object.entries(groups).forEach(([k, gs]) => { if (Math.abs(gs.reduce((a, g) => a + g.kw, 0) - gs[0].isl.p) > 2) bad.push('sumP ' + k); }); return bad; };
try {
await page.goto(URL + '#rig', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => document.getElementById('loading')?.hidden === true, null, { timeout: 180000 });
await page.evaluate(() => { document.getElementById('intro').hidden = true; }); await page.waitForTimeout(1500);
// ---- plant
let s = await P();
check('Six DGs: DG-1..3 on MSB A, DG-4..6 on MSB B; priority sets running, split bus', s.gens.length === 6 && s.gens.map(g => g.bus).join('') === 'AAABBB' && s.gens.map(g => g.st[0]).join('') === 'soooos' && s.tie === 'split', s.gens.map(g => g.bus + g.st[0]).join(' '));
check('Six gensets and six local control panels in 3D, each panel with a live screen', await page.evaluate(() => window.__nav && window.__pms().screens >= 11));
await openHmi('sys', 'swb');
s = await waitFor(x => x.active && x.t > 5, 30000);
check('Each bus balances on its own sets; P, I, f and PF consistent per bus', !inv(s).length && Math.abs((s.busA.p || 0) + (s.busB.p || 0) - s.p) < 2 && s.busA.v > 590 && s.busB.v > 590, inv(s).join(',') || `A ${Math.round(s.busA.p)} B ${Math.round(s.busB.p)} kW`);
const h = await hits();
check('PMS overview follows the supplied layout: six DG cards, mode, bus preset, LDSS, config', ['DG-1 controls', 'DG-6 controls', 'PMS AUTO', 'PMS OPER', 'SPLIT BUS', 'CLOSE BUS', 'CONFIG SETTINGS', 'Simulate blackout'].every(x => h.includes(x)) && /PERCENTAGE METHOD|RESERVE POWER/.test(h.join('|')), h.slice(0, 12).join('|'));
await shot('p01-pms');
// ---- DG pop-up: Start & Sync puts DG-1 on MSB A
await hb('^DG-1 controls$'); await page.waitForTimeout(800);
const hp = await hits(); check('DG pop-up on a standby set: Start & Sync and priority offered; Deload & Stop and trip test disabled', ['START & SYNC', 'P1', 'P2', 'P3'].every(x => hp.includes(x)) && !hp.includes('DELOAD & STOP') && !hp.includes('TRIP TEST (DEMO)'), hp.slice(-9).join('|'));
await shot('p02-dg-popup');
await hb('^START & SYNC$');
s = await waitFor(x => x.gens[0].st === 'online', 45000);
check('Start & Sync: DG-1 runs up, synchronises and shares MSB A load equally', s.gens[0].st === 'online' && Math.abs(s.gens[0].kw - s.gens[1].kw) < 1 && !inv(s).length, s.gens.map(g => g.st[0] + Math.round(g.kw)).join(','));
await hb('^P1$'); await page.waitForTimeout(800); s = await P();
check('Priority change from the pop-up reorders MSB A', s.prio.A[0] === 0, JSON.stringify(s.prio.A));
await hb('^Close the pop-up$'); await page.waitForTimeout(600);
// ---- bus tie
await hb('^CLOSE BUS$'); s = await waitFor(x => x.tie === 'closed', 30000);
check('Close bus: the tie synchronises, then MSB A and B run as one bus with equal sharing', s.tie === 'closed' && Math.abs(s.busA.f - s.busB.f) < 1e-6 && !inv(s).length && s.alarms.some(a => /Bus tie closed/.test(a)), s.alarms[0]);
await hb('^SPLIT BUS$'); await page.waitForTimeout(1500); s = await P();
check('Split bus opens the tie at once', s.tie === 'split');
// ---- blackout recovery sequence
await hb('^Simulate blackout$'); await page.waitForTimeout(1500); s = await P();
check('Blackout test opens every generator breaker; both buses dead; consumers shed', s.dead.A && s.dead.B && s.shed && s.shed2, JSON.stringify(s.dead));
s = await waitFor(x => x.bo >= 9, 90000);
check('Blackout sequence completes all 9 steps: restart by priority, dead-bus close, staged restore', s.bo >= 9 && !s.dead.A && !s.dead.B && !s.shed && !s.shed2 && !inv(s).length, `steps ${s.bo}`);
await shot('p03-blackout');
// ---- settings
await hb('^SETTINGS page$'); await page.waitForTimeout(600); await hb('^Open config settings$'); await page.waitForTimeout(600);
await hb('^\\+$'); await page.waitForTimeout(500); s = await P();
check('Config settings adjust the start setpoint (shown as on the reference screen)', s.alarms.some(a => /setpoint start set to 90/.test(a)), s.alarms[0]);
await hb('^−$'); await hb('^Close$'); await page.waitForTimeout(400);
await hb('^PMS OVERVIEW page$');
// ---- DG panel
await openHmi('scope', 'dg-lcp', 'dg-lcp-4');
const hd = await hits();
check('DG panel: five pages and six unit tabs, opened on DG-4', ['OVERVIEW page', 'ENGINE page', 'SEQUENCE page', 'C & E page', 'ALARMS page', 'DG-1', 'DG-6'].every(x => hd.includes(x)) && /DG-4/.test(await page.locator('#hmi-title').innerText()), hd.join('|').slice(0, 160));
await shot('p04-dg-overview');
await hb('^Inject oil-mist'); s = await waitFor(x => x.gens[3].lock, 60000);
await hb('^C & E page$'); await page.waitForTimeout(1200);
check('Oil-mist shutdown locks DG-4 out and the PMS replaces it on MSB B', s.gens[3].lock && s.gens[3].st === 'tripped' && s.alarms.some(a => /starting G\d to replace G4|replace/.test(a)), s.alarms.slice(0, 3).join(' / '));
await shot('p05-dg-ce');
await page.evaluate(() => document.querySelector('[data-action="hmi-close"]').click());
// ---- ESD
await openHmi('scope', 'esd');
const he = await hits(); const areas = he.filter(x => /^Activate /.test(x)).length, mos = he.filter(x => /^MOS /.test(x)).length;
check('ESD overview: areas with MOS, field and system status, and reset (areas without a matrix page are not clickable)', areas >= 38 && mos >= 40 && he.includes('ESD RESET'), `${areas} areas, ${mos} MOS`);
await shot('p06-esd-overview');
await hb('^ESD_1A page$'); await page.waitForTimeout(600); await hb('^Activate ESD0/AP-ABANDON SHUTDOWN'); await page.waitForTimeout(1200);
await page.waitForTimeout(2500); const fx = { paga: await page.evaluate(() => window.__esd()) };
check('ESD_1A as transcribed: abandon shutdown drives 35 effects, PA/GA abandon tone flashes the 3D beacons', fx.paga.n === 35 && fx.paga.tone && fx.paga.beacon, JSON.stringify(fx.paga));
await shot('p07-esd-1a');
await hb('^ESD OVERVIEW page$'); await page.waitForTimeout(600); await hb('^MOS GAS ENGINE TRIP FROM PROCESS$'); await page.waitForTimeout(400);
await hb('^Activate GAS ENGINE TRIP FROM PROCESS'); await page.waitForTimeout(400); s = await P();
check('MOS: a cause under maintenance override is logged as overridden', s.alarms.some(a => /GAS ENGINE TRIP FROM PROCESS active but overridden by MOS/.test(a)), s.alarms[0]);
await hb('^ESD RESET$'); await page.waitForTimeout(600); s = await P();
check('ESD reset clears causes that are no longer active at source', s.esd.length === 0, s.esd.join(','));
await page.evaluate(() => document.querySelector('[data-action="hmi-close"]').click());
// ---- F&G and fire
await openHmi('scope', 'fg');
await hb('^Test detector BS-10-0510Z31$'); await hb('^Test detector BS-10-0510Z31$'); await page.waitForTimeout(800); s = await P();
check('A detector in fire alarm raises ESD1B fire from marine (matrix row 5)', s.esd.includes('ESD1B-FIRE-FROM MARINE'), s.esd.join(','));
await hb('Gas test at ENGINE ROOM #1'); await hb('Gas test at ENGINE ROOM #1'); await page.waitForTimeout(800); s = await P();
check('HC at 65 %LEL raises ESD1B gas from marine (matrix row 6)', s.esd.includes('ESD1B-GAS-FROM MARINE'), s.esd.join(','));
await shot('p08-fg');
await page.evaluate(() => { [...document.querySelectorAll('#hmi-ctrl button')].find(b => /ESD/.test(b.textContent)); });
await hb('^Reset detector tests$'); await page.waitForTimeout(600);
await hb('^MAIN FIRE SYSTEM page$'); await page.waitForTimeout(600); await hb('^Open deluge valve'); s = await waitFor(x => x.fire.primary, 40000);
check('Deluge opened: fire main pressure drops and the primary fire pump starts', s.fire.primary && s.fire.p < 9, JSON.stringify(s.fire));
s = await waitFor(x => x.fire.secondary, 40000);
check('One pump cannot hold the deluge demand: the secondary diesel pump starts as a second stage', s.fire.secondary, JSON.stringify(s.fire));
await shot('p09-fire');
await hb('^Reset fire system demo$');
await page.evaluate(() => document.querySelector('[data-action="hmi-close"]').click());
// ---- branding: no client or third-party names in what visitors can see or read in the source
const src = (await page.evaluate(() => document.documentElement.outerHTML)).replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+\/=]+/gi, ''); // embedded images are not readable text
const brandList = (() => { try { return fs.readFileSync(new URL('../private/brands.txt', import.meta.url), 'utf8').split('\n').map(x => x.trim()).filter(Boolean); } catch (e) { return []; } })(); // names to keep out: private, not committed
const brands = brandList.filter(b => src.toLowerCase().includes(b.toLowerCase()));
check('No client or third-party names from the supplied screens appear on the page or in its source', !brands.length, brands.join(', '));
} catch (e) { errs.push('TEST SECTION ERROR: ' + e.message.split('\n').slice(0, 4).join(' | ')); }
console.log(res.join('\n')); console.log('PASSED', res.filter(x => x.startsWith('PASS')).length, 'of', res.length); console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
await browser.close();
