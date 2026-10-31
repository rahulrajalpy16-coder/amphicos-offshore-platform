// Revision 10 acceptance: the Amphicos FPSO digital twin replaces the FPSO beside the rig. Exterior from the twin's own
// database, containers seated on its deck, preloading, the handover in and out (picture alignment checked numerically),
// Esc, return from inside a room, the showcase tag, deep link, project card 3, reduced motion, phone and offline fallback.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const out = process.argv[2] || '/tmp/fm/shots/r10', BASE = `http://127.0.0.1:8765/${process.argv[3] || 'demo-test.html'}`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [], res = [];
const check = (n, ok, info = '') => { res.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${info !== '' ? '  [' + String(info).slice(0, 240) + ']' : ''}`); console.log(res[res.length - 1]); };
const hook = (p, tag) => { p.on('pageerror', e => errs.push(`${tag} PAGEERROR ${e.message}`)); p.on('console', m => { if (m.type() === 'error') errs.push(`${tag} console: ${m.text()}`); }); };
const ready = p => p.waitForFunction(() => document.getElementById('loading')?.hidden === true, null, { timeout: 240000 });
const until = async (p, fn, ms = 300000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch (e) { /* page busy */ } await p.waitForTimeout(400); } return false; };
const settle = async p => { await p.waitForTimeout(600); await p.waitForFunction(() => !window.__nav.flying(), null, { timeout: 200000 }).catch(() => {}); await p.waitForTimeout(1500); };
const st = p => p.evaluate(() => window.__twin.state());
const tw = p => p.evaluate(() => { const T = window.__twin.frameWin().__twin; return { level: T.state.level, paused: T.embed.paused, cam: T.camera.position.toArray(), tgt: T.director.controls.target.toArray(), fov: T.camera.fov, offX: T.camera.view && T.camera.view.enabled ? T.camera.view.offsetX : 0 }; });
const inside = p => until(p, async () => { const s = await st(p); return s.inside && !s.busy; });
const outside = p => until(p, async () => { const s = await st(p); return !s.inside && !s.busy && !s.on; });
const shot = (p, n) => p.screenshot({ path: `${out}/${n}.png`, timeout: 180000 }).catch(e => console.log('shot failed', n));
const T = (p, sel) => p.locator(sel).first().innerText().catch(() => '');
const openRig = async p => { await p.click('.pjcard[data-p="rig"]'); await until(p, () => p.evaluate(() => window.__proj.cur() === 'rig' && document.getElementById('ptrans').hidden)); await p.evaluate(() => { document.getElementById('intro').hidden = true; }); await p.waitForTimeout(1000); };
try {
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } }); hook(page, 'desktop');
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 }); await ready(page); await page.waitForTimeout(1500);
// 1. project screen
check('Home offers the FPSO experience card, with a rendered preview', /3D FPSO Experience/.test(await T(page, '.pjcard[data-p="fpso"]')) && await page.evaluate(() => document.getElementById('pv-fpso').src.startsWith('data:image')) && (await page.locator('.pjcard').count()) === 3);
await shot(page, 'r10-01-projects');
await openRig(page);
// 2. exterior from the twin and the containers on its deck
const ex = await page.evaluate(() => { const s = window.__twin.state(), i = window.__twin.info(); const sp = window.__twin.bounds('spc'), hi = window.__twin.bounds('hi'); return { s, i, gen: window.__twin.generic(), prox: window.__twin.proxies(), sp, hi }; });
check('The FPSO beside the rig is the twin exterior (300 m, from its database); the simplified stand-in is gone', ex.s.mod && ex.s.ext && ex.gen === 0 && ex.i.loa === 300 && ex.i.beam === 52 && ex.prox > 10, JSON.stringify(ex.i));
const onDeck = b => Math.abs(b[0][1] - ex.i.mainDeckY) < 0.05;
const clear = await page.evaluate(() => { const r = []; for (const id of ['spc', 'hi']) { const [a, b] = window.__twin.bounds(id); r.push({ id, a, b }); } return r; });
const mods = await page.evaluate(() => window.__twin.pickBoxes());
const hits = clear.map(c => mods.filter(([a, b]) => !(c.b[0] <= a[0] || c.a[0] >= b[0] || c.b[2] <= a[2] || c.a[2] >= b[2] || c.b[1] <= a[1] || c.a[1] >= b[1])).length);
check('AMP-SPC and AMP-HI stand on the main deck in the open gap between modules, clear of every topsides volume', onDeck(ex.sp) && onDeck(ex.hi) && hits[0] === 0 && hits[1] === 0 && ex.sp[1][0] < ex.hi[0][0], `spc ${ex.sp.map(v => v.map(x => x.toFixed(1)))} hi ${ex.hi.map(v => v.map(x => x.toFixed(1)))} hits ${hits}`);
const sc = await page.evaluate(() => window.__twin.showcase());
const ctr = b => [(b[0][0] + b[1][0]) / 2, (b[0][2] + b[1][2]) / 2];
check('The rig places the containers at the twin\'s showcase positions (shared constants)', sc.every(c => { const b = c.id === 'spc' ? ex.sp : ex.hi, m = ctr(b); return Math.abs(m[0] - (c.pos[0] - 150)) < 0.05 && Math.abs(m[1] + c.pos[1]) < 0.05; }), JSON.stringify(sc.map(c => c.pos)));
const labels = await page.evaluate(() => window.__proj.labels());
check('Rig overview tags the FPSO digital twin', labels.some(l => /FPSO digital twin/.test(l)), labels.join(' | ').slice(0, 200));
// 3. go to the FPSO: card, preloading
await page.click('#panel [data-action="asset"][data-id="fpso"]'); await settle(page);
const card = await T(page, '#panel');
check('FPSO card: twin name, representative arrangement, entry action and the showcase containers', /Amphicos FPSO Digital Twin/.test(card) && /Representative arrangement/i.test(card) && /15 electrical, automation and telecom systems/.test(card) && /Showcase only/.test(card) && (await page.locator('#panel [data-action="twin-enter"]').count()) === 1 && !/placeholder/i.test(card));
check('The FPSO view frames the whole vessel', (await page.evaluate(() => window.__nav.inView())) >= 0.25 && (await page.evaluate(() => location.hash)) === '#converter');
await shot(page, 'r10-02-fpso');
const pre = await until(page, async () => (await st(page)).ready, 240000);
const s1 = await st(page);
check('Reaching the FPSO loads the twin in the background; it reports ready and is paused while hidden', pre && s1.frame && !s1.on && (await tw(page)).paused === true && !!s1.pose);
// 4. enter
const f0 = (await st(page)).frames;
await page.click('#panel [data-action="twin-enter"]'); const inOk = await inside(page); await page.waitForTimeout(3000);
const s2 = await st(page), t2 = await tw(page);
const rigInTwin = await page.evaluate(() => { const p = window.__twin.rigPose(); return { e: window.__twin.toTwin(p.eye), t: window.__twin.toTwin(p.target) }; });
const dE = Math.hypot(...rigInTwin.e.map((v, i) => v - t2.cam[i])), dT = Math.hypot(...rigInTwin.t.map((v, i) => v - t2.tgt[i]));
check('Enter: the twin fades in over the rig at the vessel overview; address #fpso', inOk && s2.on && s2.inside && t2.level === 'vessel' && !t2.paused && s2.hash === '#fpso');
check('Handover alignment: rig and twin cameras share eye, target, field of view and picture shift', dE < 0.05 && dT < 0.05 && Math.abs(s2.fov - t2.fov) < 1e-6 && Math.abs(s2.offX - t2.offX) < 0.01, `dEye ${dE.toFixed(4)} dTarget ${dT.toFixed(4)} fov ${s2.fov}/${t2.fov} off ${s2.offX}/${t2.offX}`);
const f1 = (await st(page)).frames; await page.waitForTimeout(3000); const f2 = (await st(page)).frames;
check('While the twin is shown the rig stops drawing', f2 === f1 && f1 > f0, `${f0} ${f1} ${f2}`);
await shot(page, 'r10-03-twin');
check('The twin shows the Rig button and the showcase tag on deck', await page.frameLocator('#twin-frame').locator('#btn-rig').isVisible() && await page.frameLocator('#twin-frame').locator('.embed-tag button[data-asset="spc"]').isVisible());
// 5. back with the Rig button
await page.frameLocator('#twin-frame').locator('#btn-rig').click(); const outOk = await outside(page); await page.waitForTimeout(5000);
const s3 = await st(page);
check('Rig button: back beside the rig on the FPSO card, address #converter, twin paused', outOk && /Amphicos FPSO Digital Twin/.test(await T(page, '#panel h2')) && s3.hash === '#converter' && (await tw(page)).paused === true);
await until(page, async () => { const s = await st(page); return Math.abs(s.fov - 38) < 1e-6; }, 120000);
const s4 = await st(page);
check('After the return the rig lens eases back to its own field of view and panel shift', Math.abs(s4.fov - 38) < 1e-6 && Math.abs(s4.offX - 62) < 1, `${s4.fov} ${s4.offX}`);
// 6. Esc on the vessel overview
await page.click('#panel [data-action="twin-enter"]'); await inside(page);
await page.frameLocator('#twin-frame').locator('canvas').first().focus().catch(() => {}); await page.keyboard.press('Escape');
check('Esc on the twin\'s vessel overview returns to the rig', await outside(page) && (await st(page)).hash === '#converter');
// 7. from inside a room
await page.click('#panel [data-action="twin-enter"]'); await inside(page);
await page.evaluate(() => window.__twin.frameWin().__twin.bus.emit('select:system', { systemId: 'S02', source: 'test' }));
const inRoom = await until(page, () => page.evaluate(() => { const T = window.__twin.frameWin().__twin; return T.state.level === 'room' && !T.director.isFlying(); }), 300000);
await shot(page, 'r10-04-room');
await page.frameLocator('#twin-frame').locator('#btn-rig').click(); const back2 = await outside(page);
check('From inside a twin room, Rig flies the twin home first and hands back at the overview', inRoom && back2 && (await tw(page)).level === 'vessel' && /Amphicos FPSO Digital Twin/.test(await T(page, '#panel h2')));
// 8. showcase tag, then the container flow still works
await page.click('#panel [data-action="twin-enter"]'); await inside(page); await page.waitForTimeout(1500);
await page.frameLocator('#twin-frame').locator('.embed-tag button[data-asset="spc"]').click(); await outside(page); await settle(page);
check('Showcase tag in the twin opens the AMP-SPC card beside the rig', /Frequency Power Converter/.test(await T(page, '#panel h2')) && (await page.evaluate(() => location.hash)) === '#converter');
await shot(page, 'r10-05-spc');
await page.click('#panel [data-action="enter-container"]'); await until(page, () => page.evaluate(() => window.__proj.cur() === 'shelter' && document.getElementById('ptrans').hidden));
check('Enter the container still opens the AMP-SPC interior', /Inside the AMP-SPC container/.test(await T(page, '#panel h2')));
await page.click('#panel [data-action="to-fpso"]'); await until(page, () => page.evaluate(() => window.__proj.cur() === 'rig' && document.getElementById('ptrans').hidden)); await settle(page);
check('Back to the FPSO deck returns to the AMP-SPC on the twin deck', /Frequency Power Converter/.test(await T(page, '#panel h2')));
await page.click('#explorer [data-action="asset"][data-id="hi"]'); await settle(page); await shot(page, 'r10-06-hi');
check('AMP-HI card opens on the twin deck', /Hybrid Inverter/.test(await T(page, '#panel h2')));
// hover text on the vessel when it is selected
await page.click('#panel [data-action="asset"][data-id="fpso"]'); await settle(page);
const hov = await page.evaluate(() => { const r = window.__twin; return document.querySelector('#panel [data-action="twin-enter"] b')?.textContent; });
check('FPSO card entry action is labelled Enter the FPSO digital twin', hov === 'Enter the FPSO digital twin');
await page.close();
// 9. deep link
const p2 = await browser.newPage({ viewport: { width: 1440, height: 860 } }); hook(p2, 'deeplink');
await p2.goto(BASE + '#fpso', { waitUntil: 'domcontentloaded' }); await ready(p2);
const dl = await inside(p2);
check('Deep link #fpso opens the rig at the FPSO and hands over into the twin', dl && (await st(p2)).hash === '#fpso' && (await tw(p2)).level === 'vessel');
await shot(p2, 'r10-07-deeplink');
await p2.close();
// 10. project card 3, reduced motion
const p3 = await browser.newPage({ viewport: { width: 1440, height: 860 }, reducedMotion: 'reduce' }); hook(p3, 'card3');
await p3.goto(BASE, { waitUntil: 'domcontentloaded' }); await ready(p3);
const tc = Date.now(); await p3.click('.pjcard[data-p="fpso"]'); const c3 = await inside(p3);
check('Project card 3 opens the twin directly (reduced motion: no flight)', c3 && (await tw(p3)).level === 'vessel', ((Date.now() - tc) / 1000).toFixed(0) + ' s');
await p3.frameLocator('#twin-frame').locator('#btn-rig').click();
check('From project card 3, Rig returns to the FPSO beside the rig', await outside(p3) && /Amphicos FPSO Digital Twin/.test(await T(p3, '#panel h2')));
await p3.close();
// 11. phone
const p4 = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); hook(p4, 'phone');
await p4.goto(BASE + '#fpso', { waitUntil: 'domcontentloaded' }); await ready(p4);
const ph = await inside(p4); const tph = await tw(p4), sph = await st(p4);
check('Phone: deep link enters the twin with matching picture shift', ph && Math.abs(sph.offX - tph.offX) < 0.01, `${sph.offX} ${tph.offX}`);
await shot(p4, 'r10-08-phone');
await p4.frameLocator('#twin-frame').locator('#btn-rig').click();
check('Phone: Rig returns to the rig scene', await outside(p4));
await p4.close();
} catch (e) { res.push('FAIL  suite aborted: ' + e.message); console.log(e); }
await browser.close();
const pass = res.filter(r => r.startsWith('PASS')).length;
console.log('\n' + res.join('\n') + `\n\n${pass}/${res.length} passed`);
console.log(errs.length ? 'ERRORS:\n' + errs.slice(0, 20).join('\n') : 'no page errors');
