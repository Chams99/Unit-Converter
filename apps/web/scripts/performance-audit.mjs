import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = process.env.BASE_URL ?? 'http://localhost:43212'
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const artifactPath = process.env.PERF_ARTIFACT ?? resolve(process.cwd(), '../../docs/research/artifacts/performance-latest.json')
const browser = await chromium.launch({ headless: true, executablePath: chromePath })
const samples = []

try {
  for (const width of [390, 1440]) {
    for (const route of ['/', '/currency', '/developer', '/images']) {
      const context = await browser.newContext({ viewport: { width, height: 900 } })
      const page = await context.newPage()
      await page.addInitScript(() => {
        window.__convertalAudit = { lcp: 0, cls: 0 }
        new PerformanceObserver((list) => {
          const last = list.getEntries().at(-1)
          if (last) window.__convertalAudit.lcp = last.startTime
        }).observe({ type: 'largest-contentful-paint', buffered: true })
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) window.__convertalAudit.cls += entry.value
          }
        }).observe({ type: 'layout-shift', buffered: true })
      })

      await page.goto(`${baseUrl}${route}`, { waitUntil: 'load' })
      await page.waitForTimeout(1500)
      const metrics = await page.evaluate(() => {
        const navigation = performance.getEntriesByType('navigation')[0]
        const paints = Object.fromEntries(performance.getEntriesByType('paint').map((entry) => [entry.name, entry.startTime]))
        return {
          ttfbMs: navigation.responseStart,
          fcpMs: paints['first-contentful-paint'] ?? null,
          lcpMs: window.__convertalAudit.lcp,
          cls: window.__convertalAudit.cls,
          loadMs: navigation.loadEventEnd,
        }
      })
      samples.push({ width, route, ...metrics })
      await context.close()
    }
  }
} finally {
  await browser.close()
}

await mkdir(resolve(artifactPath, '..'), { recursive: true })
await writeFile(artifactPath, `${JSON.stringify({ date: new Date().toISOString().slice(0, 10), baseUrl, browser: chromePath, conditions: 'headless Chrome, local target, no CPU or network throttling, one new context per route and viewport, 1500ms observation window', samples }, null, 2)}\n`)
console.log(`performance audit wrote ${artifactPath}`)
