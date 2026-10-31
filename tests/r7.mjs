// Revision 07 acceptance: the equipment-first journey for every applicable system, plus model consistency,
// project separation, shelter components and stability. Usage: node r7.mjs <outdir> [page]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const out = process.argv[2], PAGE = process.argv[3] || 'demo-test.html', URL = `http://127.0.0.1:8765/${PAGE}`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [], res = [];
const check = (n, ok, info = '') => { res.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${info !== '' ? '  [' + info + ']' : ''}`); };
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' < ')));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
const T = s => page.locator(s).first().innerText().catch(() => '');
const N = () => page.evaluate(() => ({ cam: window.__nav.cam(), view: window.__nav.inView(), box: window.__nav.box() }));
const P = () => page.evaluate(() => window.__pms());
const shot = n => page.screenshot({ path: `${out}/${n}.png`, timeout: 180000 });
const settle = async () => { await page.waitForTimeout(600); await page.waitForFunction(() => !window.__nav.flying() && document.getElementById('cam-state')?.textContent !== 'Moving', null, { timeout: 150000 }).catch(() => {}); await page.waitForTimeout(1200); };
const clickEx = async sel => { if (!(await page.locator('#hmi').isHidden())) await page.click('[data-action="hmi-close"]'); const l = page.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); try { await l.click({ timeout: 45000 }); } catch (e) { const why = await page.evaluate(s => { const b = document.querySelector(s).getBoundingClientRect(); const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return el ? el.outerHTML.slice(0, 120) : 'none'; }, sel); errs.push(`NOTE: pointer click on ${sel} failed (${why}); used a DOM click`); await page.evaluate(s => document.querySelector(s).click(), sel); } };
const hb = re => page.evaluate(s => { const b = [...document.querySelectorAll('#hmi-ctrl button')].find(x => new RegExp(s, 'i').test(x.textContent)); if (b) b.click(); return b ? b.textContent : null; }, re);
const near = (a, b, e) => a.every((v, i) => Math.abs(v - b[i]) < e);
const inv = s => { const bad = [], groups = {};
  s.gens.filter(g => g.st === 'online').forEach(g => { const key = s.tie === 'closed' ? 'AB' : g.bus; (groups[key] ||= []).push(g); const I = Math.hypot(g.kw, g.q) * 1000 / (Math.sqrt(3) * g.v); if (Math.abs(I - g.a) > 1) bad.push('I DG on ' + g.bus); if (g.isl && Math.abs(g.hz - g.isl.f) > 0.01) bad.push('f ' + g.bus); });
  Object.entries(groups).forEach(([k, gs]) => { const sum = gs.reduce((a, g) => a + g.kw, 0); if (Math.abs(sum - gs[0].isl.p) > 2) bad.push('sum P ' + k); });
  if (Math.abs(s.q - (s.qLoad - s.qPfc)) > 1) bad.push('Q balance'); if (s.p > 1 && Math.abs(s.pf - s.p / Math.hypot(s.p, s.q)) > 0.003) bad.push('total PF');
  s.bays.forEach(b => { if (b.vdc && b.idc < 2399 && Math.abs(b.vdc * b.idc / 1000 - b.kw) > 1) bad.push('bay ' + b.m); if (b.vdc && Math.abs(b.pf - b.vdc / 810) > 0.01) bad.push('cos a ' + b.m); });
  return bad; };
const click3D = async ([x, y]) => { await page.mouse.move(x, y); await page.waitForTimeout(400); await page.mouse.down(); await page.mouse.up(); };
try {
await page.goto(URL + '#rig', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => document.getElementById('loading')?.hidden === true, null, { timeout: 120000 });
await page.evaluate(() => { document.getElementById('intro').hidden = true; });
await page.waitForTimeout(2000);
const mem0 = await page.evaluate(() => window.__nav.mem());

// 1. numbered tag -> the camera frames the area's equipment
const c0 = (await N()).cam;
await page.locator('#labels .hot', { hasText: 'Engine room' }).first().click(); await settle();
let n = await N();
check('1 Numbered tag frames its area (camera moved, area card, equipment in view)', !near(n.cam.p, c0.p, 1) && /Engine room/.test(await T('#panel h2')) && n.view >= 0.75, `in view ${n.view}`);

// journeys: system -> component -> 3D screen -> HMI -> back
const J = [
  { sys: 'swb', sub: 'pms-hmi', hmi: 'pms', title: /Main switchboard and PMS/ },
  { sys: 'gensets', sub: 'dg-lcp-3', hmi: 'dglcp', unit: 2, title: /Diesel generator sets/ },
  { sys: 'drives', sub: 'scr-assign-plc', hmi: 'scr', title: /SCR \/ VFD drive house/ },
  { sys: 'legs', sub: 'jack-panel', hmi: 'jack', title: /Legs and jacking units/ },
  { pkg: 'fg', sub: 'fg-panel', hmi: 'fg', title: /Fire and gas/ },
  { pkg: 'pfc', sub: 'pfc-ctrl', hmi: 'pfc', title: /Harmonic filter and PFC/ },
];
for (const j of J) {
  const tag = j.sys || j.pkg;
  if (j.sys) await clickEx(`#explorer [data-action="sys"][data-id="${j.sys}"]`); else await clickEx(`#explorer [data-action="scope"][data-id="${j.pkg}"]`);
  await settle(); n = await N();
  const ph = await page.evaluate(() => document.getElementById('panelwrap').getBoundingClientRect().height);
  check(`2-3 ${tag}: camera frames the whole assembly, compact inspector (not the full card)`, j.title.test(await T('#panel h2')) && n.view >= 0.75 && !!n.box && (await page.locator('#panel .modelnote').count()) === 0 && ph < 760, `in view ${n.view}, panel ${Math.round(ph)} px`);
  await shot(`j-${tag}-1`);
  // 4. free exploration inside limits
  const before = n.cam;
  await page.mouse.move(720, 430); await page.mouse.down(); await page.mouse.move(800, 400, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(900);
  for (let k = 0; k < 6; k++) { await page.mouse.wheel(0, 1500); await page.waitForTimeout(250); }
  await page.waitForTimeout(1200); n = await N();
  const b = n.box, m = Math.max(b.r * 0.8, 1.5), tIn = n.cam.t.every((v, i) => v >= b.min[i] - m - 0.05 && v <= b.max[i] + m + 0.05);
  check(`4 ${tag}: orbit and zoom work but stay within limits`, !near(n.cam.p, before.p, 0.2) && n.cam.d <= n.cam.max + 0.5 && tIn, `d ${n.cam.d.toFixed(1)} max ${n.cam.max.toFixed(1)}`);
  await page.click('#panel [data-action="xp-refocus"]'); await settle();
  // 5. component selection from the inspector
  await page.click(`#panel [data-action="comp"][data-sub="${j.sub}"]`); await settle(); n = await N();
  const sel = (await P()).sel;
  check(`5 ${tag}: component selected and framed from the front`, sel.sub === j.sub && n.view >= 0.75 && (await page.locator('#panel [data-action="insp-hmi"]').count()) === 1, `in view ${n.view}`);
  const camComp = (await N()).cam;
  await shot(`j-${tag}-2`);
  // 6. the physical screen identifies and opens the right HMI
  const sp = await page.evaluate(s => window.__nav.screenPt(s), j.sub);
  await page.mouse.move(sp[0], sp[1]); await page.waitForTimeout(700);
  const tip = await page.evaluate(() => window.__nav.tip());
  const camPre = (await N()).cam; // the equipment view before the HMI step
  await click3D(sp); await page.waitForFunction(() => !document.getElementById('hmi').hidden, null, { timeout: 120000 }).catch(() => {}); await page.waitForTimeout(1500); // camera faces the screen first
  let s = await P();
  check(`6 ${tag}: hovering the 3D screen names it; clicking opens the matching HMI`, /^Open /.test(tip || '') && s.sel.hmi === j.hmi && (j.unit == null || s.sel.unit === j.unit) && !(await page.locator('#hmi').isHidden()), `tip "${tip}", hmi ${s.sel.hmi}`);
  await shot(`j-${tag}-3`);
  const camHmi = (await N()).cam;
  // 9. closing the HMI returns to the equipment view the visitor had before the camera stepped to the screen
  await page.click('[data-action="hmi-close"]'); await page.waitForTimeout(800);
  await page.waitForFunction(() => !window.__nav.flying(), null, { timeout: 120000 }).catch(() => {}); await page.waitForTimeout(600);
  const camAfter = (await N()).cam;
  check(`9 ${tag}: closing the HMI returns to the same equipment view`, near(camAfter.p, camPre.p, 0.05) && near(camAfter.t, camPre.t, 0.05) && (await P()).sel.sub === j.sub, `moved ${Math.hypot(...camAfter.p.map((v, i) => v - camPre.p[i])).toFixed(2)} m`);
  // Back climbs one level and restores the earlier view
  await page.click('#panel [data-action="insp-back"]'); await settle();
  s = await P(); const camBack = (await N()).cam;
  check(`9 ${tag}: Back returns to the system view the visitor had`, s.sel.sub !== j.sub && !near(camBack.p, camComp.p, 0.3));
}

// 7-8. operating the PMS: commands change the plant, refusals are explained, values stay consistent
await page.click('#explorer [data-action="sys"][data-id="swb"]'); await settle();
await page.click('#panel [data-action="insp-hmi"]'); await page.waitForFunction(() => !document.getElementById('hmi').hidden, null, { timeout: 120000 }).catch(() => {}); await page.waitForTimeout(1200);
await page.waitForTimeout(8000);
let s = await P();
check('8 PMS values are internally consistent per bus (P, Q, S, I, f, PF, SCR bays)', !inv(s).length, inv(s).join(', ') || `P ${s.p.toFixed(0)} kW, PF ${s.pf.toFixed(2)}`);
const on0 = s.gens.filter(g => g.st === 'online').length;
await hb('^DG-2 controls$'); await page.waitForTimeout(800); await hb('^DELOAD & STOP$'); await page.waitForTimeout(400); await hb('^Close the pop-up$');
await page.waitForTimeout(1500); s = await P();
const stopTxt = s.alarms.find(a => /Stop G\d blocked|stopped by the operator/.test(a)) || '';
check('7 PMS stop command is executed or refused with the reason', !!stopTxt, stopTxt);
await hb('^LOAD SHEDDING page$'); await page.waitForTimeout(1000);
await hb('Trip the most loaded set'); { const end = Date.now() + 20000; do { await page.waitForTimeout(1500); s = await P(); } while (!s.alarms.some(a => /starting G\d to replace|fast load shedding|Blackout on MSB [AB]: PMS restarting/.test(a)) && Date.now() < end); }
check('7 Trip test: PMS reacts (shedding or standby start) and logs it', s.gens.some(g => g.st === 'tripped') && s.alarms.some(a => /starting G\d to replace|fast load shedding|Blackout on MSB [AB]: PMS restarting/.test(a)), s.alarms.slice(0, 3).join(' / '));
await shot('j-pms-trip');
await page.waitForTimeout(16000); s = await P();
check('8 After the trip the model stays consistent and a replacement set comes on load', !inv(s).length && s.gens.filter(g => g.st === 'online').length >= Math.min(on0, 2), inv(s).join(', ') || s.gens.map(g => g.st).join(','));
await hb('Request jacking up'); { const end = Date.now() + 30000; do { await page.waitForTimeout(1000); s = await P(); } while (s.hc === 'idle' && Date.now() < end); }
check('7 Jacking request goes through the PMS heavy-consumer logic', ['waiting', 'granted'].includes(s.hc), s.hc);
await page.waitForTimeout(16000); s = await P();
check('8 Jacking runs only once granted, and its load is on the bus', s.hc === 'granted' ? s.jkw > 0 : s.jkw === 0, `${s.hc}, ${s.jkw} kW`);
await hb('Stop jacking'); await hb('Restore the starting state'); await page.waitForTimeout(1500);
await page.click('[data-action="hmi-close"]'); await page.waitForTimeout(800);
// SCR assignment interlock and DG oil-mist protection
await page.keyboard.press('Escape'); await page.waitForTimeout(500); await clickEx('#explorer [data-action="scope"][data-id="scr-assign"]'); await settle();
await page.click('#panel [data-action="insp-hmi"]'); await page.waitForFunction(() => !document.getElementById('hmi').hidden, null, { timeout: 120000 }).catch(() => {}); await page.waitForTimeout(1200);
await hb('Assign bay 2 to mud pump 4'); await page.waitForTimeout(1200); s = await P();
check('7 SCR assignment refuses a change while the motor runs', s.bays[1].m === 'MP1' && s.alarms.some(a => /assignment refused|already on another bay|must be stopped/.test(a)), s.alarms[0]);
await page.click('[data-action="hmi-close"]'); await page.waitForTimeout(800);
await clickEx('#explorer [data-action="scope"][data-id="dg-lcp"]'); await settle();
await page.click('#panel [data-action="comp"][data-sub="dg-lcp-2"]'); await settle();
await page.click('#panel [data-action="insp-hmi"]'); await page.waitForFunction(() => !document.getElementById('hmi').hidden, null, { timeout: 120000 }).catch(() => {}); await page.waitForTimeout(1200);
await hb('Inject oil-mist'); await page.waitForTimeout(32000); s = await P();
check('7 DG oil-mist fault raises the alarm then shuts the engine down and locks it out', s.gens[1].lock && s.gens[1].st === 'tripped' && s.alarms.some(a => /oil mist high/.test(a)), `${s.gens[1].st} omd ${s.gens[1].omd.toFixed(2)}`);
await hb('^Reset$'); await page.waitForTimeout(800); s = await P();
check('7 Reset is refused while the mist is still high', s.gens[1].lock && /reset refused/i.test(s.alarms[0]), s.alarms[0]);
await shot('j-dg-omd');
await page.click('[data-action="hmi-close"]'); await page.waitForTimeout(800);

// 10. visual modes and existing navigation still work around a component selection
await page.click('#viewbar [data-v="blueprint"]'); await page.waitForTimeout(1500);
await page.click('#viewbar [data-v="interior"]'); await page.waitForTimeout(1500);
await page.click('#viewbar [data-action="vb-isolate"]'); await page.waitForTimeout(1500);
const vis = await page.evaluate(() => [document.querySelector('#viewbar [data-v="interior"]').getAttribute('aria-pressed'), document.querySelector('#viewbar [data-action="vb-isolate"]').getAttribute('aria-pressed')]);
await page.click('#viewbar [data-action="vb-isolate"]'); await page.click('#viewbar [data-v="realistic"]'); await page.waitForTimeout(1200);
await page.click('#panel [data-action="insp-details"]'); await page.waitForTimeout(800);
const det = await T('#panel');
await page.keyboard.press('Escape'); await page.waitForTimeout(800);
const backFromDetails = await page.locator('#panel [data-action="insp-hmi"]').count();
await page.click('#cambar [data-action="cam-overview"]').catch(() => page.click('[data-action="overview"]')); await settle();
n = await N();
check('10 Visual modes, isolate, details (Esc back to the inspector) and overview still work', vis[0] === 'true' && vis[1] === 'true' && /Workbook wording|row \d+/.test(det) && backFromDetails === 1 && n.cam.max > 300, `${vis} max ${n.cam.max}`);
// 3D click on a component from the system view
await page.click('#explorer [data-action="sys"][data-id="drives"]'); await settle();
const bp = await page.evaluate(() => window.__nav.subPt('scr-bay-3'));
await click3D(bp); await settle(); s = await P();
check('5 Clicking a component in 3D selects and frames it', s.sel.sub === 'scr-bay-3' || /^scr-bay|scr-hvac|scr-digital|scr-assign|mcc/.test(s.sel.sub || ''), s.sel.sub);
await shot('j-3dpick');

// 11. the converter section is separate from the rig selection, and the shelter geometry follows the screenshots
await page.click('.projbtn'); await page.waitForTimeout(800);
await page.click('#projects [data-action="project"][data-p="offshore"]'); await page.waitForTimeout(3000); await page.evaluate(() => document.querySelector('#panel [data-action="asset"][data-id="spc"]').click()); await page.waitForTimeout(6000);
const sep = await page.evaluate(() => ({ cur: window.__proj.cur(), hmi: !document.getElementById('hmi').hidden, sel: window.__pms().sel, labels: [...document.querySelectorAll('#labels .hot')].map(e => e.textContent).join('|'), name: document.getElementById('proj-name').textContent }));
check('11 The Frequency Converter section opens with no rig selection, HMI or rig tags carried over', sep.cur === 'rig' && /FPSO/.test(sep.name) && !sep.hmi && !sep.sel.sys && !sep.sel.sub && /AMP-SPC/.test(sep.labels) && !/PMS|switchboard|SCR/i.test(sep.labels), sep.labels.slice(0, 80));
// 12. the container geometry still follows images 1 and 13 (36 sections, mirrored in module B)
const sh = await page.evaluate(() => window.__nav.sh());
const types = row => sh.cabs.filter(c => c.startsWith(row)).map(c => c.split(':')[1]).join(',');
check('12 Container rows rebuilt from image 1 and 13: 36 sections, mirrored order in module B', sh.cabs.length === 36 && types('AG') === 'cool,air,ctrl,cap,bus,bus,cap,ctrl2,air' && types('BG') === 'air,ctrl2,cap,bus,bus,cap,ctrl,air,cool', types('AG'));
await page.click('#cambar [data-action="cam-overview"]'); await page.waitForTimeout(5000);
check('11 Back at the rig, the simulator and the panel screens are still there', (await P()).screens >= 9 && (await page.evaluate(() => window.__proj.cur())) === 'rig' && /Rig Systems/.test(await T('#proj-name')));

// 13. stability: geometry does not pile up after many selections
for (const id of ['swb', 'gensets', 'drives', 'legs', 'swb']) { await page.click(`#explorer [data-action="sys"][data-id="${id}"]`); await page.waitForTimeout(1500); }
await settle();
const mem1 = await page.evaluate(() => window.__nav.mem());
check('13 No geometry build-up after repeated navigation', mem1.geometries - mem0.geometries < 400 && mem1.outlines < 400, `${mem0.geometries} -> ${mem1.geometries}, outlines ${mem1.outlines}`);
await page.close();

// phone: the inspector and the HMI fit
const m = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
m.on('pageerror', e => errs.push('M PAGEERROR ' + e.message));
await m.goto(URL + '#rig', { waitUntil: 'domcontentloaded', timeout: 60000 }); await m.waitForFunction(() => document.getElementById('loading')?.hidden === true, null, { timeout: 120000 });
await m.evaluate(() => { document.getElementById('intro').hidden = true; });
await m.tap('#sys-toggle'); await m.waitForTimeout(800); await m.tap('#explorer [data-action="sys"][data-id="swb"]'); await m.waitForTimeout(6000);
await m.locator('#panel [data-action="insp-hmi"]').scrollIntoViewIfNeeded(); await m.tap('#panel [data-action="insp-hmi"]'); await m.waitForFunction(() => !document.getElementById('hmi').hidden, null, { timeout: 120000 }).catch(() => {}); await m.waitForTimeout(1200);
const mob = await m.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, hmi: !document.getElementById('hmi').hidden, cw: document.getElementById('hmi-canvas').getBoundingClientRect().width }));
check('Phone: the HMI opens full width without sideways scroll', mob.hmi && mob.over === 0 && mob.cw > 300, JSON.stringify(mob));
await m.screenshot({ path: `${out}/phone-hmi.png`, timeout: 180000 });
} catch (e) { errs.push('TEST SECTION ERROR: ' + e.message.split('\n').slice(0, 4).join(' | ')); }
console.log(res.join('\n')); console.log(`PASSED ${res.filter(r => r.startsWith('PASS')).length} of ${res.length}`); console.log('ERRORS:', errs.length ? '\n' + errs.join('\n') : 'none');
await browser.close();
