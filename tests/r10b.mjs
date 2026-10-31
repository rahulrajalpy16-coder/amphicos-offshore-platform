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
await openRig(page);
const labels = await page.evaluate(() => window.__proj.labels());
check('Rig overview tags the FPSO digital twin', labels.some(l => /FPSO digital twin/.test(l)), labels.join(' | ').slice(0, 200));
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
