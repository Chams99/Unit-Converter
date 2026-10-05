import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import axe from 'axe-core'

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:3220'
const artifactDir = resolve(process.env.QA_ARTIFACT_DIR ?? '../../docs/audit-2026-10-05/history')
const key = 'convertal-history-v1'
const results = []
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' })

await mkdir(artifactDir, { recursive: true })

async function stored(page) {
  return page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey) ?? '[]'), key)
}

async function unchangedAfterPause(page, expected) {
  // Wait beyond the removed autosave delay to catch unintended delayed writes.
  await page.waitForTimeout(1500)
  assert.deepEqual(await stored(page), expected)
  assert.equal(await page.locator('.history-item').count(), expected.filter(entry => entry.tool === 'units').length)
}

async function freshContext(width, theme, options = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', colorScheme: theme, permissions: ['clipboard-read', 'clipboard-write'], ...options })
  const requests = []
  await context.route('**/api/**', route => { requests.push(route.request().url()); return route.abort() })
  return { context, requests }
}

try {
  for (const width of [320, 390, 768, 1440]) {
    for (const theme of ['light', 'dark']) {
      const { context, requests } = await freshContext(width, theme)
      const page = await context.newPage()
      await page.goto(baseUrl, { waitUntil: 'networkidle' })
      const save = page.getByRole('button', { name: 'Save to history', exact: true })
      assert.equal(await save.isEnabled(), true)
      assert.equal(await page.locator('.history-item').count(), 0)

      for (const category of ['mass', 'temperature', 'volume', 'data', 'length']) {
        await page.locator(`.category-chip input[value="${category}"]`).check()
      }
      await page.locator('#field-amount').fill('12.5')
      await page.locator('#field-from').selectOption('meter')
      await page.locator('#field-to').selectOption('centimeter')
      await page.getByRole('button', { name: 'Swap source and target units', exact: true }).click()
      await page.locator('.unit-table button').first().click()
      await unchangedAfterPause(page, [])

      await page.getByRole('button', { name: 'Copy result', exact: true }).press('Enter')
      assert.ok(await page.evaluate(() => navigator.clipboard.readText()))
      await page.getByRole('button', { name: 'Copy link', exact: true }).press('Enter')
      assert.ok((await page.evaluate(() => navigator.clipboard.readText())).startsWith(baseUrl))
      await unchangedAfterPause(page, [])

      await save.press('Enter')
      await page.locator('.history-item').waitFor()
      await page.waitForFunction((storageKey) => JSON.parse(localStorage.getItem(storageKey) ?? '[]').length === 1, key)
      assert.equal(await page.getByRole('status').filter({ hasText: 'Saved to history:' }).count(), 1)
      await save.click()
      assert.equal(await page.locator('.history-item').count(), 1, 'Repeated explicit save stays deduplicated')

      await page.locator('.category-chip input[value="mass"]').check()
      const saved = await stored(page)
      await page.getByRole('button', { name: /^Restore / }).click()
      const payload = saved[0].payload
      assert.equal(await page.locator('#field-amount').inputValue(), payload.amount)
      assert.equal(await page.locator('#field-from').inputValue(), payload.from)
      assert.equal(await page.locator('#field-to').inputValue(), payload.to)
      await unchangedAfterPause(page, saved)

      for (const invalid of ['', '-', '.', '2e', 'not-a-number']) {
        await page.locator('#field-amount').fill(invalid)
        assert.equal(await save.isDisabled(), true, `Save disabled for ${JSON.stringify(invalid)}`)
      }
      assert.deepEqual(await stored(page), saved)
      await page.getByRole('button', { name: /^Restore / }).click()

      await page.getByRole('button', { name: 'Clear all', exact: true }).press('Enter')
      assert.equal(await page.locator('.history-item').count(), 0)
      await page.getByRole('button', { name: 'Undo', exact: true }).press('Enter')
      assert.equal(await page.locator('.history-item').count(), 1)
      await page.reload({ waitUntil: 'networkidle' })
      assert.deepEqual(await stored(page), saved)
      assert.equal(await page.locator('.history-item').count(), 1)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      const bounds = await save.boundingBox()
      assert.ok(bounds.width >= 44 && bounds.height >= 44)
      await page.addScriptTag({ content: axe.source })
      const violations = await page.evaluate(async () => (await window.axe.run({ include: ['.unit-panel', '.context-panel'] })).violations.map(v => v.id))
      assert.deepEqual(violations, [])
      assert.deepEqual(requests, [], 'Unit history must not call an API')
      if ((width === 390 && theme === 'light') || (width === 1440 && theme === 'dark')) {
        await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0) })
        await page.screenshot({ path: `${artifactDir}/units-${width}-${theme}.png`, fullPage: true })
      }
      results.push({ width, theme, status: 'pass', checks: ['no implicit saves', 'copy only copies', 'explicit keyboard save', 'deduplication', 'restore without rewriting history', 'invalid input disabled', 'clear/undo', 'persistence', 'overflow', 'touch target', 'axe', 'no API calls'] })
      console.log(`PASS ${width}px ${theme}`)
      await context.close()
    }
  }

  const { context: legacyContext, requests: legacyRequests } = await freshContext(390, 'light')
  const legacyPage = await legacyContext.newPage()
  await legacyPage.goto(baseUrl, { waitUntil: 'networkidle' })
  const existing = [
    { id: 'existing-unit', tool: 'units', title: 'Length', detail: '2 m → 200 cm', timestamp: 1700000000000, payload: { amount: '2', from: 'meter', to: 'centimeter', category: 'length' } },
    { id: 'existing-developer', tool: 'developer', title: 'JSON', detail: 'JSON formatted', timestamp: 1700000000001 },
  ]
  await legacyPage.evaluate(({ storageKey, entries }) => localStorage.setItem(storageKey, JSON.stringify(entries)), { storageKey: key, entries: existing })
  await legacyPage.goto(`${baseUrl}/?category=temperature&from=celsius&to=fahrenheit&amount=20`, { waitUntil: 'networkidle' })
  await unchangedAfterPause(legacyPage, existing)
  await legacyPage.locator('#field-amount').fill('-274')
  assert.equal(await legacyPage.getByRole('button', { name: 'Save to history', exact: true }).isDisabled(), true, 'Impossible absolute temperature cannot be saved')
  await legacyPage.locator('.category-chip input[value="mass"]').check()
  await unchangedAfterPause(legacyPage, existing)
  await legacyPage.getByRole('button', { name: 'Clear all', exact: true }).click()
  await legacyPage.waitForFunction((storageKey) => JSON.parse(localStorage.getItem(storageKey) ?? '[]').every(entry => entry.tool !== 'units'), key)
  assert.deepEqual(await stored(legacyPage), [existing[1]])
  await legacyPage.getByRole('button', { name: 'Undo', exact: true }).click()
  await legacyPage.waitForFunction((storageKey) => JSON.parse(localStorage.getItem(storageKey) ?? '[]').length === 2, key)
  assert.deepEqual((await stored(legacyPage)).map(entry => entry.id).sort(), existing.map(entry => entry.id).sort())
  assert.deepEqual(legacyRequests, [])
  results.push({ name: 'existing history and shared URL', status: 'pass' })
  await legacyContext.close()

  const { context: blockedContext, requests: blockedRequests } = await freshContext(390, 'light')
  await blockedContext.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError') }
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError') }
  })
  const blockedPage = await blockedContext.newPage()
  await blockedPage.goto(baseUrl, { waitUntil: 'networkidle' })
  await blockedPage.locator('#field-amount').fill('2')
  await blockedPage.getByRole('button', { name: 'Save to history', exact: true }).click()
  assert.equal(await blockedPage.locator('.history-item').count(), 1)
  assert.deepEqual(blockedRequests, [])
  results.push({ name: 'blocked storage retains working conversion and session history', status: 'pass' })
  await blockedContext.close()

  const { context: navigationContext, requests: navigationRequests } = await freshContext(390, 'light', { reducedMotion: 'no-preference' })
  const navigationPage = await navigationContext.newPage()
  await navigationPage.goto(baseUrl, { waitUntil: 'networkidle' })
  await navigationPage.locator('.category-chip input[value="mass"]').check()
  await unchangedAfterPause(navigationPage, [])
  await navigationPage.getByRole('link', { name: 'Developer', exact: true }).click()
  await navigationPage.waitForURL('**/developer')
  await navigationPage.goBack({ waitUntil: 'networkidle' })
  await navigationPage.getByRole('button', { name: 'Save to history', exact: true }).waitFor()
  await unchangedAfterPause(navigationPage, [])
  await navigationPage.emulateMedia({ reducedMotion: 'reduce' })
  await navigationPage.getByRole('button', { name: 'Save to history', exact: true }).press('Enter')
  await navigationPage.locator('.history-item').waitFor()
  assert.deepEqual(navigationRequests, [])
  results.push({ name: 'normal motion, client navigation, back, and changed motion preference', status: 'pass' })
  await navigationContext.close()

  const { context: zoomContext, requests: zoomRequests } = await freshContext(720, 'light', { viewport: { width: 720, height: 450 }, deviceScaleFactor: 2 })
  const zoomPage = await zoomContext.newPage()
  await zoomPage.goto(baseUrl, { waitUntil: 'networkidle' })
  await zoomPage.locator('.category-chip input[value="temperature"]').check()
  await unchangedAfterPause(zoomPage, [])
  await zoomPage.getByRole('button', { name: 'Save to history', exact: true }).click()
  await zoomPage.locator('.history-item').waitFor()
  assert.ok(await zoomPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  assert.deepEqual(zoomRequests, [])
  results.push({ name: '200% zoom reflow equivalent: 720×450 CSS pixels at device scale 2', status: 'pass' })
  await zoomContext.close()

  const { context: malformedContext, requests: malformedRequests } = await freshContext(390, 'light')
  const malformedPage = await malformedContext.newPage()
  await malformedPage.goto(baseUrl, { waitUntil: 'networkidle' })
  await malformedPage.evaluate((storageKey) => localStorage.setItem(storageKey, '{broken'), key)
  await malformedPage.reload({ waitUntil: 'networkidle' })
  await unchangedAfterPause(malformedPage, [])
  await malformedPage.getByRole('button', { name: 'Save to history', exact: true }).click()
  await malformedPage.locator('.history-item').waitFor()
  assert.deepEqual(malformedRequests, [])
  results.push({ name: 'malformed stored history does not break explicit save', status: 'pass' })
  await malformedContext.close()

  await writeFile(`${artifactDir}/results.json`, JSON.stringify({ date: '2026-10-05', baseUrl, conditions: 'Node 24 / Next.js production build / headless Chrome / reduced motion / mocked-off API routes', results }, null, 2))
  console.log(`Unit history regression checks passed (${results.length} cases).`)
} finally {
  await browser.close()
}
