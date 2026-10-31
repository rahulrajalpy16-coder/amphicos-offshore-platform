// Playwright smoke test of the 15 HMI / inspection modules (R7): mounts each module in src/hmi/dev.html
// against the real database and a running simulation, operates one control through the UI, checks that the
// simulation state changed, checks for page errors and minimum text size, and saves screenshots.
// Run: node tests/unit/hmi_smoke.playwright.mjs   (starts its own Vite dev server on port 5288)
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const repoRoot = join(appRoot, '..', '..', '..', '..', '..')
const OUT = process.env.HMI_SHOTS || join(repoRoot, 'quality', 'test-evidence', 'TASK-20261030-005949', 'hmi')
mkdirSync(OUT, { recursive: true })
const PORT = 5288
const BASE = `http://127.0.0.1:${PORT}/src/hmi/dev.html`

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(page, fn, arg, ms = 15000) { await page.waitForFunction(fn, arg, { timeout: ms }) }

// module, steps(page), check (runs in page, returns true when the control took effect), extra tabs to screenshot
const CASES = [
  ['pms', async (p) => { await p.click('[data-act="pms-mode"] [data-val="semi"]') }, () => window.__sim.state.pms.mode === 'semi', ['gens', 'load', 'sync', 'trends', 'alarms', 'retrofit', 'scenarios']],
  ['dgctrl', async (p) => { await p.click('[data-act="gcp-start-G3"]') }, () => window.__sim.state.gens.G3.engine !== 'stopped', ['logic', 'io']],
  ['relay', async (p) => { await p.click('.hmi-tab[data-tab="test"]'); await p.click('[data-act="test-on"]'); await p.click('[data-act="inject"]') }, () => Object.values(window.__sim.state.relays).some((r) => r.test.results.length > 0), ['curve', 'front', 'settings']],
  ['drives', async (p) => { await p.click('[data-act="drive-stop"]') }, () => Object.values(window.__sim.state.drives).every((d) => d.id !== window.__hmi.frame.drive || !d.run), ['curve', 'compare']],
  ['icss', async (p) => { await p.click('.hmi-tab[data-tab="fg"]'); await p.click('[data-act="gas-GD-3001"]') }, () => window.__sim.state.icss.fg.detectors.find((d) => d.id === 'GD-3001').value > 25, ['overview', 'loops', 'esd', 'ce', 'alarms', 'health']],
  ['paga', async (p) => { await p.click('[data-tone="general"]') }, () => window.__sim.state.paga.mode === 'tone', ['zones', 'racks']],
  ['pabx', async (p) => { await p.click('[data-act="dial"]') }, () => window.__sim.state.pabx.calls.length > 0 || window.__sim.state.events.some((e) => /Call .* connected/.test(e.text)), ['system']],
  ['iptv', async (p) => { await p.click('[data-ch="3"]') }, () => window.__sim.state.iptv.stbs[0].channel === 3, []],
  ['cctv', async (p) => { const tag = await p.evaluate(() => window.__sim.state.cctv.cameras.find((c) => c.ptz).tag); await p.click(`canvas[aria-label="${tag}"]`); await p.click('[data-preset="2"]') }, () => window.__sim.state.cctv.cameras.some((c) => c.ptz && c.preset === 2), ['cams']],
  ['boiler', async (p) => { await p.click('.hmi-tab[data-tab="level"]'); await p.click('[data-act="step"]') }, () => Math.abs(window.__sim.state.steamDemand - 0.75) < 1e-9, ['bms']],
  ['igg', async (p) => { await p.click('[data-act="igg-start"]') }, () => window.__sim.state.igg.state !== 'stopped', ['trend']],
  ['dglocal', async (p) => { await p.click('[data-act="estop"]') }, () => !!window.__sim.state.gens.G1.faults.estop, ['exhaust']],
  ['omd', async (p) => { await p.click('[data-act="hotspot"]') }, () => !!window.__sim.state.omd.G1.hotspot, ['repeater', 'test']],
  ['avr', async (p) => { await p.click('.hmi-tab[data-tab="step"]'); await p.click('[data-act="motor-step"]') }, () => Object.keys(window.__sim.state.testLoads).length > 0, ['live', 'pq']],
  ['governor', async (p) => { await p.click('.hmi-tab[data-tab="step"]'); await p.click('[data-act="load-step"]') }, () => Object.keys(window.__sim.state.testLoads).length > 0, ['live']],
]

async function smallText(page) {
  return page.evaluate(() => {
    const r = []
    for (const e of document.querySelectorAll('.hmi-root *')) {
      if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue
      const box = e.getBoundingClientRect(); if (!box.width || !box.height) continue
      let px = parseFloat(getComputedStyle(e).fontSize)
      const svg = e.closest('svg')
      if (svg && svg.viewBox.baseVal && svg.viewBox.baseVal.width) { const R = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal; px *= Math.min(R.width / vb.width, R.height / vb.height) }
      if (px < 13.5) r.push(`${e.tagName} ${px.toFixed(1)}px "${e.textContent.trim().slice(0, 30)}"`)
    }
    return r
  })
}

async function main() {
  const vite = spawn(process.execPath, [join(appRoot, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(PORT), '--strictPort'], { cwd: appRoot, stdio: ['ignore', 'pipe', 'pipe'] })
  let up = false
  vite.stdout.on('data', (d) => { if (/ready|Local/.test(String(d))) up = true })
  for (let i = 0; i < 100 && !up; i++) await wait(200)
  const browser = await chromium.launch()
  const results = []
  try {
    for (const [mod, act, check, tabs] of CASES) {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
      const errors = []
      page.on('pageerror', (e) => errors.push(e.message))
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
      const res = { module: mod, mounted: false, operated: false, errors, small: [], shots: [] }
      try {
        await page.goto(`${BASE}?module=${mod}`)
        await until(page, () => window.__ready === true)
        res.mounted = await page.evaluate(() => !!document.querySelector('.hmi-root .hmi-body') && /EDUCATIONAL SIMULATION/.test(document.body.innerText))
        await wait(800)
        await act(page)
        await until(page, check, null, 15000).then(() => { res.operated = true }).catch(() => {})
        await wait(1200)
        const shot = join(OUT, `${mod}.png`); await page.screenshot({ path: shot }); res.shots.push(shot)
        res.small.push(...await smallText(page))
        for (const t of tabs) {
          await page.click(`.hmi-tab[data-tab="${t}"]`); await wait(900)
          const sp = join(OUT, `${mod}_${t}.png`); await page.screenshot({ path: sp }); res.shots.push(sp)
          res.small.push(...(await smallText(page)).map((x) => `[${t}] ${x}`))
        }
        // legacy variant of the main tab
        if (await page.$('[data-act="variant"] [data-val="legacy"]')) { await page.click('[data-act="variant"] [data-val="legacy"]'); await page.click('.hmi-tab'); await wait(900); const lp = join(OUT, `${mod}_legacy.png`); await page.screenshot({ path: lp }); res.shots.push(lp) }
        // the harness calls renderMini() every 500 ms into the toolbar canvas: errors there are captured above
      } catch (e) { errors.push(String(e && e.message || e)) }
      results.push(res)
      await page.close()
    }
    // narrow viewport check (390 px): modules must mount without errors
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } })
    const perr = []
    phone.on('pageerror', (e) => perr.push(e.message))
    for (const mod of ['pms', 'icss']) { await phone.goto(`${BASE}?module=${mod}`); await until(phone, () => window.__ready === true); await wait(800); await phone.screenshot({ path: join(OUT, `${mod}_390px.png`) }) }
    results.push({ module: 'viewport-390', mounted: true, operated: true, errors: perr, small: [], shots: [join(OUT, 'pms_390px.png'), join(OUT, 'icss_390px.png')] })
  } finally {
    await browser.close()
    vite.kill()
  }
  let fail = 0
  for (const r of results) {
    const ok = r.mounted && r.operated && r.errors.length === 0 && r.small.length === 0
    if (!ok) fail++
    console.log(`${ok ? 'PASS' : 'FAIL'} ${r.module.padEnd(12)} mounted=${r.mounted} operated=${r.operated} errors=${r.errors.length} smallText=${r.small.length} screenshots=${r.shots.length}`)
    for (const e of r.errors.slice(0, 3)) console.log('   error:', e)
    for (const e of r.small.slice(0, 3)) console.log('   small:', e)
  }
  writeFileSync(join(OUT, 'smoke_results.json'), JSON.stringify(results, null, 1))
  console.log(`\n${results.length - fail} passed, ${fail} failed. Screenshots in ${OUT}`)
  process.exit(fail ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
