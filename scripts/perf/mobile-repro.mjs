// Reusable mobile-perf reproduction harness for the "My Questions & Items" page.
//
// Not part of `npm test` / `npm run test:e2e` — this is a standalone diagnostic
// tool, run on demand, not a CI gate. See docs/questions-page-mobile-performance.md
// for how it was used and what it found.
//
// Usage:
//   node scripts/perf/mobile-repro.mjs --scenario=logged-in  --cpu=6 --label=run-a
//   node scripts/perf/mobile-repro.mjs --scenario=logged-out --cpu=6 --label=run-b
//
// Requires: a CSS pod running at CSS_ORIGIN with the seeded test account below,
// and the app served (production build) at APP_ORIGIN. See scripts/perf/README.md.

import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { loginToCss } from './lib/css.mjs'

const APP_ORIGIN = process.env.PERF_APP_ORIGIN ?? 'http://localhost:4173'
const CSS_ORIGIN = process.env.PERF_CSS_ORIGIN ?? 'http://localhost:4000'
const EMAIL = process.env.PERF_CSS_EMAIL ?? 'test@example.com'
const PASSWORD = process.env.PERF_CSS_PASSWORD ?? 'test1234'

const args = Object.fromEntries(
  process.argv.slice(2).map(arg => {
    const [key, value] = arg.replace(/^--/, '').split('=')
    return [key, value ?? true]
  })
)

const scenario = args.scenario ?? 'logged-in' // 'logged-in' | 'logged-out'
const cpuThrottle = Number(args.cpu ?? 6) // CDP CPU slowdown multiplier; a mid-range Android phone vs a dev laptop is roughly in this range
const label = args.label ?? scenario
const outDir = path.resolve('scripts/perf/results')
fs.mkdirSync(outDir, { recursive: true })

// Moto/Fairphone-class viewport (Fairphone 4: 1080x2340 @ ~2.75x dpr -> ~393x851 CSS px)
const MOBILE_VIEWPORT = { width: 393, height: 851 }

async function restoreSeededBackup(page) {
  await page.goto(`${APP_ORIGIN}/#/backups`)
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: /Restore/i }).first().click()
  await page.getByText(/restored successfully/i).waitFor({ timeout: 30_000 })
}

async function installLongTaskObserver(page) {
  await page.addInitScript(() => {
    window.__perf = { longTasks: [], marks: [] }
    try {
      const po = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          window.__perf.longTasks.push({ start: entry.startTime, duration: entry.duration })
        }
      })
      po.observe({ type: 'longtask', buffered: true })
    } catch { /* longtask not supported */ }
  })
}

async function collectPerf(page) {
  return page.evaluate(() => window.__perf)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Linux; Android 12; Fairphone 4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
    deviceScaleFactor: 2.75,
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  await installLongTaskObserver(page)

  const cdp = await context.newCDPSession(page)
  // CPU throttling only (no network throttling — we want to isolate main-thread cost)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })

  // Login/restore at a desktop-width viewport — the nav's login control is
  // hidden behind a hamburger menu below the md breakpoint, and there's no
  // need to pay mobile-viewport cost for one-time setup.
  console.log(`[${label}] logging in / preparing data...`)
  await page.goto(APP_ORIGIN)
  if (scenario === 'logged-in') {
    await loginToCss(page, { appOrigin: APP_ORIGIN, cssOrigin: CSS_ORIGIN, email: EMAIL, password: PASSWORD })
    await restoreSeededBackup(page)
  } else {
    // logged-out scenario still needs the data locally: log in once, restore,
    // then log out so PouchDB keeps the data but pod polling is disabled.
    await loginToCss(page, { appOrigin: APP_ORIGIN, cssOrigin: CSS_ORIGIN, email: EMAIL, password: PASSWORD })
    await restoreSeededBackup(page)
    await page.getByRole('button', { name: 'Logout' }).first().click()
    await page.getByRole('button', { name: 'Login with Solid Pod' }).first().waitFor({ timeout: 10_000 })
  }

  await page.setViewportSize(MOBILE_VIEWPORT)
  await page.goto(`${APP_ORIGIN}/#/manage-questions`)
  await page.getByRole('heading', { name: /My Questions/i }).waitFor({ timeout: 20_000 }).catch(() => {})
  await page.waitForTimeout(1000)

  console.log(`[${label}] applying ${cpuThrottle}x CPU throttle and starting trace...`)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle })
  await context.tracing.start({ screenshots: true, snapshots: true, title: label })
  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
  await cdp.send('Profiler.start')

  const t0 = Date.now()
  const mark = async (name) => page.evaluate((n) => window.__perf.marks.push({ label: n, t: performance.now() }), name)

  await mark('phase:expand-start')
  // Expand every question section (each mounts an OptionSection tree)
  const questionToggles = await page.locator('main button:has(svg)').all()
  for (const [i, toggle] of questionToggles.slice(0, 8).entries()) {
    await mark(`expand:${i}:before`)
    await toggle.click().catch(() => {})
    await mark(`expand:${i}:after`)
    await page.waitForTimeout(150)
  }

  await mark('phase:scroll-start')
  // Scroll through the list, as a user would while looking for a question
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(120)
  }
  await mark('phase:scroll-end')

  // Type into an "add item" composer, character by character — the closest
  // proxy to INP (input latency) on a real keyboard
  const addItemButton = page.getByRole('button', { name: /Add item/i }).first()
  if (await addItemButton.isVisible().catch(() => false)) {
    await mark('phase:type-start')
    await addItemButton.click()
    const input = page.locator('input[placeholder*="Add"]').first()
    await input.click().catch(() => {})
    for (const ch of 'Sunscreen') {
      await page.keyboard.type(ch, { delay: 80 })
    }
    await mark('phase:type-end')
  }

  // Let pod poll cycles land (polling is every 5s when logged in) — default
  // covers one, --settleMs overrides for a longer multi-cycle observation.
  await page.waitForTimeout(Number(args.settleMs ?? 6000))

  const totalDuration = Date.now() - t0
  const { profile } = await cdp.send('Profiler.stop')
  await context.tracing.stop({ path: path.join(outDir, `${label}.trace.zip`) })
  fs.writeFileSync(path.join(outDir, `${label}.cpuprofile`), JSON.stringify(profile))

  // Aggregate sample hit-counts per function so the hottest call site is
  // nameable without opening the .cpuprofile in DevTools.
  const hitsByFn = new Map()
  for (const node of profile.nodes) {
    const key = `${node.callFrame.functionName || '(anonymous)'} — ${node.callFrame.url.split('/').pop()}:${node.callFrame.lineNumber}`
    hitsByFn.set(key, (hitsByFn.get(key) ?? 0) + (node.hitCount ?? 0))
  }
  const topFunctions = [...hitsByFn.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([fn, hits]) => ({ fn, hits }))

  const perf = await collectPerf(page)
  const longTasks = perf?.longTasks ?? []
  const marks = perf?.marks ?? []
  const totalBlockingTime = longTasks.reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0)

  // Which action-phase mark each long task's start time falls closest after,
  // so a 9s block can be pinned to "scroll" vs "typing" vs "expand".
  const longTasksWithPhase = longTasks.map(t => {
    const precedingMarks = marks.filter(m => m.t <= t.start)
    const phase = precedingMarks.length ? precedingMarks[precedingMarks.length - 1].label : 'before-first-mark'
    return { ...t, nearestPrecedingMark: phase }
  })

  const summary = {
    label,
    scenario,
    cpuThrottle,
    totalDurationMs: totalDuration,
    longTaskCount: longTasks.length,
    longTaskTotalMs: Math.round(longTasks.reduce((s, t) => s + t.duration, 0)),
    totalBlockingTimeMs: Math.round(totalBlockingTime),
    longestTaskMs: longTasks.length ? Math.round(Math.max(...longTasks.map(t => t.duration))) : 0,
    longTasks: longTasksWithPhase.map(t => ({ ...t, duration: Math.round(t.duration), start: Math.round(t.start) })),
    marks: marks.map(m => ({ ...m, t: Math.round(m.t) })),
    topFunctionsBySampleHits: topFunctions,
  }

  fs.writeFileSync(path.join(outDir, `${label}.summary.json`), JSON.stringify(summary, null, 2))
  console.log(`[${label}] done:`, { ...summary, longTasks: undefined, marks: undefined, topFunctionsBySampleHits: undefined })
  console.log(`[${label}] long tasks by phase:`, longTasksWithPhase.map(t => `${t.nearestPrecedingMark} +${Math.round(t.duration)}ms`))
  console.log(`[${label}] top functions by sample hits:`, topFunctions.slice(0, 10))

  await browser.close()
}

main().catch(err => { console.error(err); process.exit(1) })
