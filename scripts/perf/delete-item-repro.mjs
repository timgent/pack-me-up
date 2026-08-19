// Standalone repro harness for "deleting an item from a packing list is slow
// and the UI locks up for a moment".
//
// Not part of `npm test` / `npm run test:e2e` — a diagnostic tool, run on
// demand. See scripts/perf/README.md for setup and
// docs/packing-list-delete-performance.md for what it found.
//
// Usage:
//   node scripts/perf/delete-item-repro.mjs --label=before --items=150 --deletes=4 --cpu=4 --podLatency=150
//
// The two levers that matter:
//   --podLatency  round-trip delay injected on every request to the pod. A
//                 local CSS answers in ~2ms, which no real user ever sees; a
//                 phone on mobile data sees 100-300ms. If delete latency
//                 tracks this number, the UI is waiting on the network.
//   --cpu         CDP CPU throttle multiplier. If delete latency tracks this
//                 instead, the cost is main-thread work.
//
// Requires a local CSS (the `solid-dev` skill) and the app's production build
// being served (npm run build && npm run preview -- --port 4173).

import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { authenticateForPod, loginToCss } from './lib/css.mjs'

const APP_ORIGIN = process.env.PERF_APP_ORIGIN ?? 'http://localhost:4173'
const CSS_ORIGIN = process.env.PERF_CSS_ORIGIN ?? 'http://localhost:4000'
const EMAIL = process.env.PERF_CSS_EMAIL ?? 'test@example.com'
const PASSWORD = process.env.PERF_CSS_PASSWORD ?? 'test1234'
const POD_NAME = process.env.PERF_POD_NAME ?? 'test'

const args = Object.fromEntries(
  process.argv.slice(2).map(arg => {
    const [key, value] = arg.replace(/^--/, '').split('=')
    return [key, value ?? true]
  })
)

const label = args.label ?? 'delete-item'
const itemCount = Number(args.items ?? 150)
const deleteCount = Number(args.deletes ?? 4)
const cpuThrottle = Number(args.cpu ?? 4)
const podLatencyMs = Number(args.podLatency ?? 150)
// How long to keep watching after the row disappears, so the debounced
// auto-save that follows a delete lands inside the measured window.
const settleMs = Number(args.settleMs ?? 4000)

const outDir = path.resolve('scripts/perf/results')
fs.mkdirSync(outDir, { recursive: true })

const POD_URL = `${CSS_ORIGIN}/${POD_NAME}/`
const WEB_ID = `${CSS_ORIGIN}/${POD_NAME}/profile/card#me`
const LIST_ID = 'perf-delete-list'
const MOBILE_VIEWPORT = { width: 393, height: 851 }

const PEOPLE = [
  { id: 'p1', name: 'Ada' },
  { id: 'p2', name: 'Bram' },
  { id: 'p3', name: 'Cleo' },
  { id: 'p4', name: 'Dev' },
]
const CATEGORIES = ['Day Bag', 'Documents & Money', 'Toiletries', 'Clothes', 'Sleep & Comfort', 'Kit & Gear']

/** A list big enough to be realistic for a family trip, deterministic run to run. */
function buildPackingList() {
  const items = []
  for (let i = 0; i < itemCount; i++) {
    const person = PEOPLE[i % PEOPLE.length]
    items.push({
      id: `perf-item-${i}`,
      itemText: `Item ${String(i).padStart(3, '0')}`,
      personId: person.id,
      personName: person.name,
      questionId: `q-${i % 12}`,
      optionId: `o-${i % 5}`,
      packed: false,
      quantity: (i % 3) + 1,
      category: CATEGORIES[i % CATEGORIES.length],
      order: i,
    })
  }
  return {
    id: LIST_ID,
    name: 'Perf: delete item',
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    nights: 7,
    destination: 'Perfland',
    items,
    deletedItems: [],
    guests: PEOPLE.map(p => ({ id: p.id, name: p.name })),
    questionAnswers: [],
    selectedPeopleIds: PEOPLE.map(p => p.id),
  }
}

/** Put a restorable backup in the pod — the app's own Restore flow loads it. */
async function seedBackup() {
  const token = await authenticateForPod(CSS_ORIGIN, { email: EMAIL, password: PASSWORD, webId: WEB_ID })
  const backup = {
    createdAt: new Date().toISOString(),
    version: 1,
    questionSet: null,
    packingLists: [buildPackingList()],
  }
  const url = `${POD_URL}pack-me-up/backups/perf-delete-item.json`
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(backup),
  })
  if (!res.ok) throw new Error(`Failed to seed backup: ${res.status} ${await res.text()}`)
  console.log(`[${label}] seeded a ${itemCount}-item list into ${url}`)
}

async function installObservers(page) {
  await page.addInitScript(() => {
    localStorage.setItem('packMeUp.profiling', '1')
    window.__perf = { longTasks: [], podRequests: [] }
    try {
      const po = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          window.__perf.longTasks.push({ start: entry.startTime, duration: entry.duration })
        }
      })
      po.observe({ type: 'longtask', buffered: true })
    } catch { /* longtask unsupported */ }
  })
}

/** Expand every collapsed section so item rows are actually in the DOM. */
async function expandSections(page) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const expanders = await page.getByRole('button', { name: /^Expand / }).all()
    if (expanders.length === 0) break
    for (const expander of expanders) await expander.click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(200)
  }
}

/**
 * Delete one item and time it from the app's own point of view.
 *
 * `perceivedMs` is measured from the `delete.click` mark the app records inside
 * its delete handler to the frame in which the row actually left the DOM — the
 * wait the user sits through. `maxFrameGapMs` is the longest gap between
 * animation frames over that window: how long the UI was frozen, as opposed to
 * merely slow.
 */
async function measureDelete(page, itemId) {
  await page.evaluate(() => { window.__packMeUpProfile__ = [] })

  const row = page.locator(`[data-testid="item-row-${itemId}"]`)
  await row.scrollIntoViewIfNeeded()
  await row.getByTitle('Delete item').click()

  const dialogConfirm = page.getByRole('button', { name: 'Remove', exact: true })
  await dialogConfirm.waitFor({ timeout: 10_000 })

  // Arm the watcher before the click that starts the work.
  await page.evaluate((id) => {
    // Fallback origin for perceivedMs when the build has no profiling marks.
    window.__perf.armedAt = performance.now()
    window.__perf.rowWatch = new Promise(resolve => {
      let lastFrame = performance.now()
      let maxFrameGap = 0
      const tick = () => {
        const now = performance.now()
        maxFrameGap = Math.max(maxFrameGap, now - lastFrame)
        lastFrame = now
        if (!document.querySelector(`[data-testid="item-row-${id}"]`)) {
          resolve({ goneAt: now, maxFrameGap })
        } else {
          requestAnimationFrame(tick)
        }
      }
      requestAnimationFrame(tick)
    })
  }, itemId)

  await dialogConfirm.click()
  const { goneAt, maxFrameGap } = await page.evaluate(() => window.__perf.rowWatch)
  const armedAt = await page.evaluate(() => window.__perf.armedAt)

  // Keep watching long enough for the debounced follow-up save to land.
  await page.waitForTimeout(settleMs)

  const entries = await page.evaluate(() => window.__packMeUpProfile__ ?? [])
  // Prefer the app's own mark (exact); fall back to when the click was armed,
  // so an uninstrumented build still yields a comparable number.
  const clickMark = entries.find(e => e.label === 'delete.click')
  const clickedAt = clickMark ? clickMark.startMs : armedAt

  const phase = (name) => {
    const found = entries.filter(e => e.label === name)
    return found.length ? Math.round(found.reduce((sum, e) => sum + e.durationMs, 0)) : 0
  }

  return {
    itemId,
    perceivedMs: Math.round(goneAt - clickedAt),
    maxFrameGapMs: Math.round(maxFrameGap),
    breakdown: {
      persistTotal: phase('delete.persist'),
      localDb: phase('save.localDb'),
      podSaveTotal: phase('save.pod'),
      podGetPodUrl: phase('pod.getPrimaryPodUrl'),
      podEnsureContainer: phase('pod.save.ensureContainer'),
      podSerialize: phase('pod.save.serialize'),
      podTurtle: phase('pod.save.turtle'),
      podPut: phase('pod.save.put'),
      podLoadFetch: phase('pod.load.fetch'),
      podLoadDeserialize: phase('pod.load.deserialize'),
      syncMerge: phase('sync.merge'),
      syncStringify: phase('sync.stringify'),
    },
    // Everything recorded in the window, including the follow-up saves that
    // happen after the row is already gone.
    entries: entries.map(e => ({
      label: e.label,
      atMs: Math.round(e.startMs - clickedAt),
      durationMs: Math.round(e.durationMs * 10) / 10,
    })),
  }
}

async function main() {
  await seedBackup()

  // Use a locally-installed Chromium when there is one, matching playwright.config.ts
  const localChromium = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
  const executablePath = fs.existsSync(localChromium) ? localChromium : undefined
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Linux; Android 12; Fairphone 4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
    deviceScaleFactor: 2.75,
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  await installObservers(page)

  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })

  // Desktop width for the one-time setup: the login control hides behind a
  // hamburger below the md breakpoint.
  console.log(`[${label}] logging in and restoring the seeded list...`)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(APP_ORIGIN)
  await loginToCss(page, { appOrigin: APP_ORIGIN, cssOrigin: CSS_ORIGIN, email: EMAIL, password: PASSWORD })

  await page.goto(`${APP_ORIGIN}/#/backups`)
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: /Restore/i }).first().click()
  await page.getByText(/restored successfully/i).waitFor({ timeout: 60_000 })

  await page.setViewportSize(MOBILE_VIEWPORT)
  await page.goto(`${APP_ORIGIN}/#/view-lists/${LIST_ID}`)
  await page.getByRole('heading', { name: /Perf: delete item/i }).waitFor({ timeout: 30_000 })
  await expandSections(page)
  await page.locator('[data-testid^="item-row-"]').first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(1500)

  // Only now apply the conditions being measured, so setup isn't slowed by them.
  if (podLatencyMs > 0) {
    await context.route(`${CSS_ORIGIN}/**`, async route => {
      await new Promise(r => setTimeout(r, podLatencyMs))
      await route.continue()
    })
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle })
  console.log(`[${label}] measuring ${deleteCount} deletes (cpu=${cpuThrottle}x, podLatency=${podLatencyMs}ms)...`)

  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
  await cdp.send('Profiler.start')

  const results = []
  for (let i = 0; i < deleteCount; i++) {
    const itemId = await page.evaluate(() => {
      const el = document.querySelector('[data-testid^="item-row-"]')
      return el ? el.getAttribute('data-testid').replace('item-row-', '') : null
    })
    if (!itemId) break
    const result = await measureDelete(page, itemId)
    results.push(result)
    console.log(
      `[${label}] delete ${i + 1}/${deleteCount}: perceived ${result.perceivedMs}ms, ` +
      `longest frozen frame ${result.maxFrameGapMs}ms`,
      result.breakdown
    )
  }

  const { profile: cpuProfile } = await cdp.send('Profiler.stop')
  fs.writeFileSync(path.join(outDir, `${label}.cpuprofile`), JSON.stringify(cpuProfile))

  const hitsByFn = new Map()
  for (const node of cpuProfile.nodes) {
    const key = `${node.callFrame.functionName || '(anonymous)'} — ${node.callFrame.url.split('/').pop()}:${node.callFrame.lineNumber}`
    hitsByFn.set(key, (hitsByFn.get(key) ?? 0) + (node.hitCount ?? 0))
  }
  const topFunctions = [...hitsByFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([fn, hits]) => ({ fn, hits }))

  const perf = await page.evaluate(() => window.__perf)
  const longTasks = (perf?.longTasks ?? []).map(t => ({ start: Math.round(t.start), duration: Math.round(t.duration) }))
  const median = (values) => {
    if (values.length === 0) return null
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]
  }

  const summary = {
    label,
    itemCount,
    cpuThrottle,
    podLatencyMs,
    medianPerceivedMs: median(results.map(r => r.perceivedMs)),
    medianMaxFrameGapMs: median(results.map(r => r.maxFrameGapMs)),
    deletes: results,
    longTaskCount: longTasks.length,
    longestTaskMs: longTasks.length ? Math.max(...longTasks.map(t => t.duration)) : 0,
    longTasks,
    topFunctionsBySampleHits: topFunctions,
  }
  fs.writeFileSync(path.join(outDir, `${label}.summary.json`), JSON.stringify(summary, null, 2))

  console.log(`[${label}] median perceived delete latency: ${summary.medianPerceivedMs}ms`)
  console.log(`[${label}] median longest frozen frame:     ${summary.medianMaxFrameGapMs}ms`)
  console.log(`[${label}] longest long task:               ${summary.longestTaskMs}ms`)
  console.log(`[${label}] wrote ${path.join(outDir, `${label}.summary.json`)}`)

  await browser.close()
}

main().catch(err => { console.error(err); process.exit(1) })
