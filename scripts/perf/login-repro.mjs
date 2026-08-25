// Standalone repro harness for "when you first login the app freezes for a bit".
//
// Not part of `npm test` / `npm run test:e2e` — a diagnostic tool, run on
// demand. See scripts/perf/README.md for setup and
// docs/login-performance.md for what it found.
//
// Usage:
//   node scripts/perf/login-repro.mjs --label=before --lists=25 --cpu=4 --podLatency=150
//
// What it answers: after the OIDC redirect lands the user back on the app,
// how long is it before anything is on screen, and is that wait the main
// thread being blocked or the app waiting on the pod?
//
//   --podLatency  round-trip delay injected on every request to the pod. A
//                 local CSS answers in ~2ms, which no real user ever sees.
//                 If the wait tracks this number, the app is waiting on
//                 network round trips it could have overlapped or skipped.
//   --cpu         CDP CPU throttle multiplier. If the wait tracks this
//                 instead, the cost is main-thread work (bundle parse, RDF
//                 deserialisation, PouchDB writes).
//
// The measured run always uses a fresh browser context, so it is a *first*
// login on that device: empty local database, full pod.
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

const label = args.label ?? 'login'
const listCount = Number(args.lists ?? 25)
const itemsPerList = Number(args.items ?? 40)
const cpuThrottle = Number(args.cpu ?? 4)
const podLatencyMs = Number(args.podLatency ?? 150)
// How long to keep recording after the lists are on screen, so the tail of the
// login sync (uploads, tombstone writes) lands inside the measured window.
const settleMs = Number(args.settleMs ?? 6000)
const skipSeed = args.skipSeed === true || args.skipSeed === 'true'

const outDir = path.resolve('scripts/perf/results')
fs.mkdirSync(outDir, { recursive: true })

const POD_URL = `${CSS_ORIGIN}/${POD_NAME}/`
const WEB_ID = `${CSS_ORIGIN}/${POD_NAME}/profile/card#me`

const PEOPLE = [
  { id: 'p1', name: 'Ada', ageRange: 'Adult', gender: 'female' },
  { id: 'p2', name: 'Bram', ageRange: 'Adult', gender: 'male' },
  { id: 'p3', name: 'Cleo', ageRange: 'Child', gender: 'female' },
  { id: 'p4', name: 'Dev', ageRange: 'Teenager', gender: 'male' },
]
const CATEGORIES = ['Day Bag', 'Documents & Money', 'Toiletries', 'Clothes', 'Sleep & Comfort', 'Kit & Gear']

/** A question set roughly the size a family that has used the app a while has. */
function buildQuestionSet() {
  const questions = []
  for (let q = 0; q < 12; q++) {
    const options = []
    for (let o = 0; o < 4; o++) {
      options.push({
        id: `q${q}-opt${o}`,
        text: `Option ${o}`,
        order: o,
        items: Array.from({ length: 4 }, (_, i) => ({
          text: `Q${q} option ${o} item ${i}`,
          category: CATEGORIES[i % CATEGORIES.length],
          personSelections: PEOPLE.map(p => ({ personId: p.id, selected: i % 2 === 0 })),
        })),
      })
    }
    questions.push({
      id: `q-${q}`,
      type: 'saved',
      text: `Question ${q}?`,
      questionType: 'single-choice',
      order: q,
      options,
    })
  }
  return {
    people: PEOPLE,
    alwaysNeededItems: Array.from({ length: 12 }, (_, i) => ({
      text: `Always needed ${i}`,
      category: CATEGORIES[i % CATEGORIES.length],
      personSelections: PEOPLE.map(p => ({ personId: p.id, selected: true })),
    })),
    questions,
    lastModified: new Date().toISOString(),
  }
}

function buildPackingList(index) {
  const items = []
  for (let i = 0; i < itemsPerList; i++) {
    const person = PEOPLE[i % PEOPLE.length]
    items.push({
      id: `perf-login-${index}-item-${i}`,
      itemText: `Item ${String(i).padStart(3, '0')}`,
      personId: person.id,
      personName: person.name,
      questionId: `q-${i % 12}`,
      optionId: `q${i % 12}-opt${i % 4}`,
      packed: i % 3 === 0,
      quantity: (i % 3) + 1,
      category: CATEGORIES[i % CATEGORIES.length],
      order: i,
    })
  }
  return {
    id: `perf-login-list-${index}`,
    name: `Trip ${index + 1}`,
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    nights: 7,
    destination: `Destination ${index + 1}`,
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
    questionSet: buildQuestionSet(),
    packingLists: Array.from({ length: listCount }, (_, i) => buildPackingList(i)),
  }
  const url = `${POD_URL}pack-me-up/backups/perf-login.json`
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(backup),
  })
  if (!res.ok) throw new Error(`Failed to seed backup: ${res.status} ${await res.text()}`)
  console.log(`[${label}] seeded a backup of ${listCount} lists × ${itemsPerList} items into ${url}`)
  return token
}

/** How many .ttl packing lists are in the pod right now. */
async function countPodLists(token) {
  const res = await fetch(`${POD_URL}pack-me-up/packing-lists/`, {
    headers: { Accept: 'text/turtle', Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return 0
  const body = await res.text()
  return (body.match(/\.ttl>/g) ?? []).length
}

/**
 * Wait for the restore to finish pushing to the pod. Polling the pod itself
 * rather than a toast: the toast copy is deliberately varied (successToastCopy)
 * and what matters here is the pod actually being full.
 */
async function waitForPodLists(token, expected, timeoutMs = 240_000) {
  const deadline = Date.now() + timeoutMs
  let count = 0
  while (Date.now() < deadline) {
    count = await countPodLists(token)
    if (count >= expected) return count
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error(`Only ${count}/${expected} lists reached the pod before the timeout`)
}

/**
 * Watch the page from the first line of script it runs, so the measurement
 * covers everything the user sits through — bundle parse included — not just
 * what happens once React is up.
 *
 * Re-installed on every navigation, so the object read at the end belongs to
 * the final app load (the one the OIDC redirect lands on).
 */
async function installObservers(page) {
  await page.addInitScript(() => {
    localStorage.setItem('packMeUp.profiling', '1')
    window.__perf = {
      longTasks: [],
      maxFrameGapMs: 0,
      firstContentMs: null,
      firstNavMs: null,
      firstListMs: null,
      emptyStateMs: null,
    }
    try {
      const po = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          window.__perf.longTasks.push({ start: entry.startTime, duration: entry.duration })
        }
      })
      po.observe({ type: 'longtask', buffered: true })
    } catch { /* longtask unsupported */ }

    // A rAF loop doubles as the frozen-thread detector and the "what is on
    // screen" clock: a gap between frames is time the main thread never gave
    // back, and the DOM checks say when each milestone actually painted.
    let lastFrame = performance.now()
    const tick = () => {
      const now = performance.now()
      const perf = window.__perf
      if (perf.firstContentMs !== null) {
        // Only count freezes once something is on screen to freeze — before
        // that the gaps are the bundle loading, which the milestones cover.
        perf.maxFrameGapMs = Math.max(perf.maxFrameGapMs, now - lastFrame)
      }
      lastFrame = now

      const root = document.getElementById('root')
      if (perf.firstContentMs === null && root && root.childElementCount > 0) {
        perf.firstContentMs = now
      }
      if (perf.firstNavMs === null && document.querySelector('nav')) {
        perf.firstNavMs = now
      }
      if (perf.firstListMs === null && document.querySelector('[data-testid="packing-list-card"]')) {
        perf.firstListMs = now
      }
      if (perf.emptyStateMs === null && /no packing lists|create your first/i.test(document.body.innerText || '')) {
        perf.emptyStateMs = now
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

function summarisePhases(entries) {
  const byLabel = new Map()
  for (const entry of entries) {
    const current = byLabel.get(entry.label) ?? { count: 0, totalMs: 0, maxMs: 0 }
    current.count++
    current.totalMs += entry.durationMs
    current.maxMs = Math.max(current.maxMs, entry.durationMs)
    byLabel.set(entry.label, current)
  }
  return [...byLabel.entries()]
    .map(([name, v]) => ({ label: name, count: v.count, totalMs: Math.round(v.totalMs), maxMs: Math.round(v.maxMs) }))
    .sort((a, b) => b.totalMs - a.totalMs)
}

async function main() {
  const localChromium = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
  const executablePath = fs.existsSync(localChromium) ? localChromium : undefined
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })

  // ── Setup: get the pod into the state a returning user's pod is in ────────
  if (!skipSeed) {
    const token = await seedBackup()
    const setupContext = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const setupPage = await setupContext.newPage()
    console.log(`[${label}] logging in and restoring the seeded backup (this fills the pod)...`)
    await setupPage.goto(APP_ORIGIN)
    await loginToCss(setupPage, { appOrigin: APP_ORIGIN, cssOrigin: CSS_ORIGIN, email: EMAIL, password: PASSWORD })
    await setupPage.goto(`${APP_ORIGIN}/#/backups`)
    setupPage.once('dialog', dialog => dialog.accept())
    await setupPage.getByRole('button', { name: /Restore/i }).first().click()
    const seeded = await waitForPodLists(token, listCount)
    await setupPage.waitForTimeout(2000)
    await setupContext.close()
    console.log(`[${label}] pod seeded with ${seeded} lists`)
  }

  // ── Measurement: a first login on a device that has never seen this pod ───
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  })
  const page = await context.newPage()
  await installObservers(page)

  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })

  // Start from the lists page, so the OIDC redirect returns there and the
  // "when can I see my lists" milestone is the real one.
  await page.goto(`${APP_ORIGIN}/#/view-lists`)

  // Only now apply the conditions being measured, so the login form itself
  // isn't slowed by them.
  if (podLatencyMs > 0) {
    await context.route(`${CSS_ORIGIN}/**`, async route => {
      await new Promise(r => setTimeout(r, podLatencyMs))
      await route.continue()
    })
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle })

  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
  await cdp.send('Profiler.start')
  await context.tracing.start({ screenshots: true, snapshots: true })

  console.log(`[${label}] logging in (cpu=${cpuThrottle}x, podLatency=${podLatencyMs}ms)...`)
  await loginToCss(page, { appOrigin: APP_ORIGIN, cssOrigin: CSS_ORIGIN, email: EMAIL, password: PASSWORD })

  // Wait for the lists themselves, not just the shell: the sync is what the
  // complaint is about, and it lands after the nav bar does.
  await page.waitForFunction(
    () => window.__perf.firstListMs !== null || window.__perf.emptyStateMs !== null,
    { timeout: 120_000 }
  ).catch(() => console.warn(`[${label}] no list or empty state appeared before the timeout`))

  await page.waitForTimeout(settleMs)

  const { profile: cpuProfile } = await cdp.send('Profiler.stop')
  await context.tracing.stop({ path: path.join(outDir, `${label}.trace.zip`) })
  fs.writeFileSync(path.join(outDir, `${label}.cpuprofile`), JSON.stringify(cpuProfile))

  const hitsByFn = new Map()
  for (const node of cpuProfile.nodes) {
    const key = `${node.callFrame.functionName || '(anonymous)'} — ${node.callFrame.url.split('/').pop()}:${node.callFrame.lineNumber}`
    hitsByFn.set(key, (hitsByFn.get(key) ?? 0) + (node.hitCount ?? 0))
  }
  const topFunctions = [...hitsByFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([fn, hits]) => ({ fn, hits }))

  const perf = await page.evaluate(() => window.__perf)
  const entries = await page.evaluate(() => window.__packMeUpProfile__ ?? [])
  const navTiming = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0]
    if (!nav) return null
    return {
      responseEndMs: Math.round(nav.responseEnd),
      domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
      loadEventMs: Math.round(nav.loadEventEnd),
    }
  })

  const longTasks = (perf?.longTasks ?? []).map(t => ({ start: Math.round(t.start), duration: Math.round(t.duration) }))
  // Everything before the first paint: the blank-screen stretch the user reads
  // as a freeze.
  const blankScreenTasks = longTasks.filter(t => perf.firstContentMs !== null && t.start < perf.firstContentMs)
  const totalBlockingTimeMs = longTasks.reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0)

  const summary = {
    label,
    listCount,
    itemsPerList,
    cpuThrottle,
    podLatencyMs,
    // Milestones, measured from the start of the app load the OIDC redirect
    // lands on. Everything before firstContentMs is a blank page.
    firstContentMs: perf.firstContentMs === null ? null : Math.round(perf.firstContentMs),
    firstNavMs: perf.firstNavMs === null ? null : Math.round(perf.firstNavMs),
    firstListMs: perf.firstListMs === null ? null : Math.round(perf.firstListMs),
    emptyStateMs: perf.emptyStateMs === null ? null : Math.round(perf.emptyStateMs),
    navTiming,
    // Is the blank stretch CPU or waiting? Long tasks that land in it are CPU.
    blankScreenLongTaskMs: Math.round(blankScreenTasks.reduce((s, t) => s + t.duration, 0)),
    blankScreenLongTasks: blankScreenTasks,
    // Once there is something on screen, how long is it unresponsive for?
    maxFrameGapMs: Math.round(perf.maxFrameGapMs),
    longTaskCount: longTasks.length,
    longestTaskMs: longTasks.length ? Math.max(...longTasks.map(t => t.duration)) : 0,
    totalBlockingTimeMs: Math.round(totalBlockingTimeMs),
    longTasks,
    phases: summarisePhases(entries),
    marks: entries.map(e => ({
      label: e.label,
      atMs: Math.round(e.startMs),
      durationMs: Math.round(e.durationMs * 10) / 10,
      detail: e.detail,
    })),
    topFunctionsBySampleHits: topFunctions,
  }
  fs.writeFileSync(path.join(outDir, `${label}.summary.json`), JSON.stringify(summary, null, 2))

  console.log(`[${label}] blank screen until:            ${summary.firstContentMs}ms`)
  console.log(`[${label}]   ...of which long tasks:      ${summary.blankScreenLongTaskMs}ms (the rest is waiting)`)
  console.log(`[${label}] nav bar on screen at:          ${summary.firstNavMs}ms`)
  console.log(`[${label}] lists on screen at:            ${summary.firstListMs}ms`)
  console.log(`[${label}] longest frozen frame after 1st paint: ${summary.maxFrameGapMs}ms`)
  console.log(`[${label}] longest single long task:      ${summary.longestTaskMs}ms`)
  console.log(`[${label}] total blocking time:           ${summary.totalBlockingTimeMs}ms`)
  console.log(`[${label}] top phases:`, summary.phases.slice(0, 12))
  console.log(`[${label}] wrote ${path.join(outDir, `${label}.summary.json`)}`)

  await browser.close()
}

main().catch(err => { console.error(err); process.exit(1) })
