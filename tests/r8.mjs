// Revision 08 acceptance (updated for Revision 10): the Frequency Converter section (AMP-SPC and AMP-HI from the brochures), the FPSO and
// port quay beside the rig, rig-to-FPSO navigation, the container interior and the concept HMIs.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const out = process.argv[2] || 'r8shots', BASE = `http://127.0.0.1:8765/${process.argv[3] || 'demo-test.html'}`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [], res = [];
const check = (n, ok, info = '') => { res.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${info !== '' ? '  [' + String(info).slice(0, 220) + ']' : ''}`); };
const hook = (p, tag) => { p.on('pageerror', e => errs.push(`${tag} PAGEERROR ${e.message}`)); p.on('console', m => { if (m.type() === 'error') errs.push(`${tag} console: ${m.text()}`); }); };
const ready = p => p.waitForFunction(() => document.getElementById('loading')?.hidden === true, null, { timeout: 180000 });
const until = async (p, fn, ms = 30000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await p.waitForTimeout(400); } return false; };
const T = (p, sel) => p.locator(sel).first().innerText().catch(() => '');
const settle = async p => { await p.waitForTimeout(600); await p.waitForFunction(() => !window.__nav.flying() && document.getElementById('cam-state')?.textContent !== 'Moving', null, { timeout: 150000 }).catch(() => {}); await p.waitForTimeout(1200); };
const hb = (p, re) => p.evaluate(s => { const b = [...document.querySelectorAll('#hmi-ctrl button')].find(x => new RegExp(s, 'i').test(x.textContent)); if (b) b.click(); return b ? b.textContent : null; }, re);
// ratings the brochures do not state must never appear as product data
const INVENTED = /\b\d[\d,.]*\s?(kW|MW|kVA|MVA|kWh|MWh|kg|tonnes)\b|\befficiency\s+\d|\b\d+\s?%\s+efficien/i;
try {
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } }); hook(page, 'desktop');
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 }); await ready(page); await page.waitForTimeout(2500);
check('Home offers the three experiences with rendered previews', (await page.locator('.pjcard').count()) === 3 && await page.evaluate(() => ['pv-rig', 'pv-fpso', 'pv-offshore'].every(id => document.getElementById(id).src.startsWith('data:image'))));
await page.click('.pjcard[data-p="rig"]'); await until(page, () => page.evaluate(() => window.__proj.cur() === 'rig' && document.getElementById('ptrans').hidden));
await page.evaluate(() => { document.getElementById('intro').hidden = true; }); await page.waitForTimeout(1500);
const labels = await page.evaluate(() => window.__proj.labels());
check('Rig overview shows tags for the FPSO and the port quay, and a Go to FPSO action', labels.some(l => /FPSO/.test(l)) && labels.some(l => /Port quay/.test(l)) && (await page.locator('#panel [data-action="asset"][data-id="fpso"]').count()) === 1, labels.slice(-2).join(' | '));
await page.screenshot({ timeout: 180000, path: `${out}/f01-rig-overview.png` });
// one move from the rig to the FPSO
await page.click('#panel [data-action="asset"][data-id="fpso"]'); await settle(page);
const st = await page.evaluate(() => ({ h: location.hash, proj: document.getElementById('proj-name').textContent, cam: window.__nav.cam(), view: window.__nav.inView() }));
check('Go to FPSO flies to the vessel about 600 m from the rig and switches the section name', /Amphicos FPSO Digital Twin/.test(await T(page, '#panel h2')) && st.h === '#converter' && /FPSO/.test(st.proj) && Math.hypot(st.cam.t[0], st.cam.t[2]) > 500 && st.view >= 0.25, `${st.proj} target ${st.cam.t.map(v => v.toFixed(0))} view ${st.view}`);
const fp = await T(page, '#panel');
check('FPSO card presents the Amphicos FPSO digital twin with an entry action, and the two converters as a showcase', /representative 300 m FPSO/i.test(fp) && (await page.locator('#panel [data-action="twin-enter"]').count()) === 1 && /Showcase only/i.test(fp) && /AMP-SPC/.test(fp) && /AMP-HI/.test(fp));
await page.screenshot({ timeout: 180000, path: `${out}/f02-fpso.png` });
// AMP-SPC: brochure features and specifications only
await page.click('#panel [data-action="asset"][data-id="spc"]'); await settle(page);
const spc = await T(page, '#panel');
check('AMP-SPC card carries the brochure specifications', ['MV / LV', '230 V to 700 V+', '50 Hz / 60 Hz', 'IEC 80005-3', 'C5-H', 'Junction boxes'].every(s => spc.includes(s)));
check('AMP-SPC card lists the brochure features', ['De-coupled transformer with two secondary windings', 'LV IGBT PWM', 'Ripple filter choke', 'HMI operating and monitoring panel', 'Seamless transfer function', 'Supervisor system'].every(s => spc.includes(s)));
check('AMP-SPC card marks its source and verification, and invents no ratings', /Source: AMP-SPC brochure/.test(spc) && /Engineering verification required/i.test(spc) && /Not stated in the brochure/i.test(spc) && !INVENTED.test(spc.replace(/Power rating \(kVA \/ kW\)/, '')), (spc.match(INVENTED) || [''])[0]);
check('No mechanical part descriptions remain in the converter section', !/cladding|base frame|railings|pipe stubs|HVAC ROOF|cabinet section|duct-like/i.test(spc + fp));
await page.click('#panel [data-action="hmi-open"][data-sys="spc"]'); await page.waitForTimeout(1800);
await hb(page, '^50 Hz$'); await hb(page, '^690 V$'); await hb(page, 'Start and transfer'); await page.waitForTimeout(9000);
const spcSum = await page.getAttribute('#hmi-canvas', 'aria-label');
await hb(page, '^60 Hz$'); await page.waitForTimeout(500);
const spcSum2 = await page.getAttribute('#hmi-canvas', 'aria-label');
check('AMP-SPC concept HMI: settings, then the seamless-transfer sequence moves load to shore power', /50 hertz, 690 volts/.test(spcSum) && /(transfer|shore|sync)/i.test(spcSum) && /50 hertz/.test(spcSum2), spcSum);
check('AMP-SPC HMI is labelled simulated and uses percent, not ratings', /simulated|SIMULATION/i.test(await T(page, '#hmi')) && /percent/.test(spcSum));
await page.screenshot({ timeout: 180000, path: `${out}/f03-spc-hmi.png` });
await page.click('[data-action="hmi-close"]'); await page.waitForTimeout(800);
// AMP-HI
await page.click('#explorer [data-action="asset"][data-id="hi"]:visible'); await settle(page);
const hi = await T(page, '#panel');
check('AMP-HI card carries the brochure features and flags the diesel claim', ['Black start capability', 'Grid forming, grid firming and grid following', 'Four-quadrant', 'Drawworks brake energy recycling', 'DC-coupled batteries', '-40 °C to 55 °C'].every(s => hi.includes(s)) && /Up to 15 % less diesel consumption" is a brochure claim/.test(hi) && !INVENTED.test(hi.replace(/\(kW, kWh\)/, '')));
await page.click('#panel [data-action="hmi-open"][data-sys="hi"]'); await page.waitForTimeout(1500);
await hb(page, 'Black start'); await page.waitForTimeout(5000);
const hiSum = await page.getAttribute('#hmi-canvas', 'aria-label');
check('AMP-HI concept HMI: black start switches to grid forming and logs the steps', /forming/.test(hiSum), hiSum);
await page.screenshot({ timeout: 180000, path: `${out}/f04-hi-hmi.png` });
await page.click('[data-action="hmi-close"]'); await page.waitForTimeout(800);
// port quay
await page.click('#explorer [data-action="asset"][data-id="quay"]:visible'); await settle(page);
const qy = await T(page, '#panel');
check('Port quay shows the brochure application: grid, port converter, IEC 80005-3 connection, ship', ['National grid', 'Port terminal converter', 'IEC 80005-3', 'Ship electrical system'].every(s => qy.includes(s)) && /not a real port/i.test(qy));
await page.screenshot({ timeout: 180000, path: `${out}/f05-quay.png` });
// enter the container (separate scene) and come back
await page.click('#explorer [data-action="asset"][data-id="spc"]:visible'); await settle(page);
await page.click('#panel [data-action="enter-container"]'); await until(page, () => page.evaluate(() => window.__proj.cur() === 'shelter' && document.getElementById('ptrans').hidden));
await page.waitForTimeout(2000);
const inn = await T(page, '#panel'), il = await page.evaluate(() => window.__proj.labels());
check('Inside the container: brochure conversion chain (7 steps) and control features (4) as conceptual tags', /Inside the AMP-SPC container/.test(inn) && il.length === 11 && /conceptual/i.test(inn) && /not mapped to the cabinets/i.test(inn), il.join(' | '));
check('Inside the container: no mechanical part cards remain', !/cladding|railings|pipe stubs|Roof units with top fans|Internal cabinet rows/i.test(inn + (await T(page, '#explorer'))));
await page.screenshot({ timeout: 180000, path: `${out}/f06-interior.png` });
await page.locator('#labels .hot', { hasText: 'IGBT inverter' }).first().click(); await settle(page);
const ft = await T(page, '#panel');
check('A chain tag opens its brochure feature with a plain explanation and step navigation', /Double-stage LV IGBT PWM inverter/.test(ft) && /step 3 of 7/i.test(ft) && /In plain words/i.test(ft) && /not product data/i.test(ft) && (await page.locator('#panel [data-action="spc-feat"]').count()) === 2);
await page.keyboard.press('Escape'); await page.waitForTimeout(1500);
check('Esc returns from a feature to the container overview', /Inside the AMP-SPC container/.test(await T(page, '#panel h2')));
await page.click('#panel [data-action="walk-toggle"]'); await page.waitForTimeout(3000);
check('Walk inside the container works', await page.evaluate(() => window.__walkLevel() === 'shelter' && window.__walkOK()));
await page.keyboard.press('Escape'); await page.waitForTimeout(2000);
await page.click('#panel [data-action="sh-img"][data-n="13"]'); await page.waitForTimeout(1500);
check('Container design source images still open', await page.isVisible('#shlight'));
await page.keyboard.press('Escape'); await page.waitForTimeout(600);
await page.click('#panel [data-action="to-fpso"]'); await until(page, () => page.evaluate(() => window.__proj.cur() === 'rig' && document.getElementById('ptrans').hidden)); await settle(page);
check('Back to the FPSO deck lands on the AMP-SPC container in the sea scene', /Frequency Power Converter/.test(await T(page, '#panel h2')) && await page.evaluate(() => location.hash) === '#converter');
// back to the rig in one move
await page.click('#cambar [data-action="cam-overview"]'); await settle(page);
const back = await page.evaluate(() => ({ h: location.hash, proj: document.getElementById('proj-name').textContent, cam: window.__nav.cam() }));
check('Overview returns to the rig and the section name follows', /Approved rig systems/.test(await T(page, '#panel h2')) && back.h === '#rig' && /3D Rig/.test(back.proj) && Math.hypot(back.cam.t[0], back.cam.t[2]) < 60, `${back.h} ${back.proj}`);
// the rig selection and the converter selection do not leak into each other
await page.click('#explorer [data-action="sys"][data-id="swb"]'); await settle(page);
check('Selecting a rig system leaves the converter section', /Main switchboard and PMS/.test(await T(page, '#panel h2')) && /3D Rig/.test(await page.evaluate(() => document.getElementById("proj-name").textContent)) && !(await page.evaluate(() => window.__proj.labels())).some(l => /AMP-SPC/.test(l)));
await page.close();
// deep links, reduced motion, phone, no-WebGL
const d = await browser.newPage({ viewport: { width: 1280, height: 800 } }); hook(d, 'deeplink');
await d.goto(BASE + '#converter', { waitUntil: 'domcontentloaded', timeout: 120000 }); await ready(d); await d.waitForTimeout(3000);
check('Deep link #converter opens straight at the AMP-SPC container', !(await d.isVisible('#projects')) && /Frequency Power Converter/.test(await T(d, '#panel h2')));
await d.close(); const d2 = await browser.newPage({ viewport: { width: 1280, height: 800 } }); hook(d2, 'deeplink2');
await d2.goto(BASE + '#shelter', { waitUntil: 'domcontentloaded', timeout: 120000 }); await ready(d2); await d2.waitForTimeout(3000);
check('Deep link #shelter opens inside the container', await d2.evaluate(() => window.__proj.cur()) === 'shelter' && /Inside the AMP-SPC container/.test(await T(d2, '#panel h2')));
await d2.close();
const rctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }); const r = await rctx.newPage(); hook(r, 'reduced');
await r.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 }); await ready(r); await r.waitForTimeout(1500);
await r.click('.pjcard[data-p="offshore"]'); await r.waitForTimeout(800); await r.evaluate(() => document.querySelector('#panel [data-action="asset"][data-id="spc"]').click()); await r.waitForTimeout(800);
check('Reduced motion: the converter opens without the fade or a flight', await r.evaluate(() => document.getElementById('ptrans').hidden && document.getElementById('cam-state').textContent !== 'Moving') && /Frequency Power Converter/.test(await T(r, '#panel h2')));
await rctx.close();
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const m = await mctx.newPage(); hook(m, 'mobile');
await m.goto(BASE + '#converter', { waitUntil: 'domcontentloaded', timeout: 120000 }); await ready(m); await m.waitForTimeout(3000);
check('Phone: the converter card fits with no sideways scroll', (await m.evaluate(() => document.documentElement.scrollWidth - innerWidth)) === 0 && /Frequency Power Converter/.test(await T(m, '#panel h2')));
await m.screenshot({ timeout: 180000, path: `${out}/f07-phone.png` });
await mctx.close();
const fctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
await fctx.addInitScript(() => { const o = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : o.call(this, t, ...a); }; });
const f = await fctx.newPage(); f.on('pageerror', () => {});
await f.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 }); await f.waitForSelector('.fb', { timeout: 60000 }).catch(() => {});
const fb = await f.locator('.fb').innerText().catch(() => '');
check('No-WebGL text covers the converter section from the brochures', /Frequency Converter \(beside the rig\)/.test(fb) && /AMP-SPC/.test(fb) && /AMP-HI/.test(fb) && /IEC 80005-3/.test(fb) && !/cladding|railings/i.test(fb));
await fctx.close();
} catch (e) { errs.push('TEST SECTION ERROR: ' + e.message.split('\n').slice(0, 4).join(' | ')); }
console.log(res.join('\n')); console.log('PASSED', res.filter(x => x.startsWith('PASS')).length, 'of', res.length); console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
await browser.close();
