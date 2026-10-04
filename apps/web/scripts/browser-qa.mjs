import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const baseUrl = process.env.BASE_URL ?? 'http://localhost:3220'
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const artifactDir = process.env.QA_ARTIFACT_DIR ?? resolve(process.cwd(), '../../docs/research/artifacts')
await mkdir(artifactDir, { recursive: true })

const browser = await chromium.launch({ headless: true, executablePath: chromePath })
const fixture = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')

async function contextAt(width, height) {
  return browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', acceptDownloads: true })
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  assert.equal(overflow, false, `${label} has horizontal overflow`)
}

function parseRgb(value) {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  assert.ok(match, `Expected an RGB color, received ${value}`)
  return match.slice(1, 4).map(Number)
}

function relativeLuminance(value) {
  return parseRgb(value).map((channel) => channel / 255).map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
}

function contrastRatio(first, second) {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

try {
  for (const width of [320, 390, 768, 1440]) {
    const context = await contextAt(width, 900)
    const page = await context.newPage()
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' })
    await assertNoHorizontalOverflow(page, `home-${width}`)
    if (width === 320) {
      await page.keyboard.press('Tab')
      assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('skip-link')), true)
    }
    await page.screenshot({ path: `${artifactDir}/home-${width}.png`, fullPage: true })
    await context.close()
  }

  const context = await contextAt(1440, 900)
  const page = await context.newPage()
  await page.goto(`${baseUrl}/?category=length&from=meter&to=kilometer&amount=2`, { waitUntil: 'networkidle' })
  assert.equal(await page.locator('#field-from').inputValue(), 'meter')
  assert.equal(await page.locator('#field-to').inputValue(), 'kilometer')
  assert.equal(await page.locator('#field-amount').inputValue(), '2')
  await page.locator('#field-amount').fill('2.5')
  await page.locator('#field-amount').blur()
  const amountColors = await page.locator('#field-amount').evaluate((element) => {
    const styles = getComputedStyle(element)
    return { color: styles.color, background: styles.backgroundColor, border: styles.borderTopColor, className: element.className }
  })
  assert.equal(amountColors.className.includes('text-input'), false)
  assert.ok(contrastRatio(amountColors.color, amountColors.background) >= 4.5, `Amount text contrast is ${contrastRatio(amountColors.color, amountColors.background).toFixed(2)}`)
  assert.ok(contrastRatio(amountColors.border, amountColors.background) >= 3, `Amount border contrast is ${contrastRatio(amountColors.border, amountColors.background).toFixed(2)}`)
  assert.match(await page.locator('#field-result').innerText(), /0\.0025[\s\S]*km/)
  assert.match(await page.locator('.converter-meta .result-meta').innerText(), /calculated to 40/i)
  // Conversions save automatically after a short pause; there is no save button.
  await page.locator('.history-item').first().waitFor({ state: 'visible', timeout: 5_000 })
  assert.equal(await page.locator('.history-item').count(), 1)
  await page.waitForFunction(() => window.location.search.includes('amount=2.5'))
  await page.reload({ waitUntil: 'networkidle' })
  assert.equal(await page.locator('.history-item').count(), 1)
  assert.equal(await page.locator('#field-amount').inputValue(), '2.5')
  await page.locator('.header-search input').fill('image')
  assert.equal(await page.getByRole('link', { name: /Images/ }).count() > 0, true)
  await page.keyboard.press('Control+K')
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Search tools')
  const themeBefore = await page.locator('html').getAttribute('class')
  // The theme control cycles System → Light → Dark.
  const themeButton = page.getByRole('button', { name: /^Theme: / })
  await themeButton.click()
  await themeButton.click()
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'))
  assert.notEqual(await page.locator('html').getAttribute('class'), themeBefore)
  const darkAmountColors = await page.locator('#field-amount').evaluate((element) => {
    const styles = getComputedStyle(element)
    return { color: styles.color, background: styles.backgroundColor, border: styles.borderTopColor }
  })
  assert.ok(contrastRatio(darkAmountColors.color, darkAmountColors.background) >= 4.5, `Dark amount text contrast is ${contrastRatio(darkAmountColors.color, darkAmountColors.background).toFixed(2)}`)
  assert.ok(contrastRatio(darkAmountColors.border, darkAmountColors.background) >= 3, `Dark amount border contrast is ${contrastRatio(darkAmountColors.border, darkAmountColors.background).toFixed(2)}`)
  await page.goto(`${baseUrl}/developer`, { waitUntil: 'networkidle' })
  await page.locator('textarea').fill('{bad')
  await page.getByRole('button', { name: 'Run transform' }).click()
  assert.match(await page.locator('.output-box').innerText(), /not valid JSON/i)
  await page.goto(`${baseUrl}/currency`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Get reference rate' }).click()
  await page.locator('.currency-result').waitFor({ state: 'visible', timeout: 15_000 })
  assert.match(await page.locator('.currency-result').innerText(), /frankfurter|reference/i)
  const mockedCurrency = await context.newPage()
  await mockedCurrency.route('**/api/v1/currency/rates*', async (route) => {
    const url = new URL(route.request().url())
    const pair = { base: url.searchParams.get('base'), quote: url.searchParams.get('quote') }
    await new Promise((resolve) => setTimeout(resolve, pair.quote === 'TND' ? 250 : 20))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...pair, rate: pair.quote === 'EUR' ? '0.9' : '3', provider: 'mock-provider', sourceTimestamp: '2026-10-03T00:00:00.000Z', fetchedAt: '2026-10-03T00:00:00.000Z', stale: true, staleAfterSeconds: 60 }) })
  })
  await mockedCurrency.goto(`${baseUrl}/currency`, { waitUntil: 'networkidle' })
  await mockedCurrency.getByRole('button', { name: 'Get reference rate' }).click()
  await mockedCurrency.locator('.currency-grid select').nth(1).selectOption('EUR')
  await mockedCurrency.waitForTimeout(350)
  assert.equal(await mockedCurrency.locator('.currency-result').count(), 0)
  await mockedCurrency.getByRole('button', { name: 'Get reference rate' }).click()
  await mockedCurrency.locator('.currency-result').waitFor({ state: 'visible' })
  assert.match(await mockedCurrency.locator('.currency-result').innerText(), /EUR/)
  assert.equal(await mockedCurrency.locator('.status-warning').innerText(), 'Stale cached rate')
  await mockedCurrency.locator('.currency-grid input').fill('-1')
  await mockedCurrency.getByRole('button', { name: 'Get reference rate' }).click()
  assert.match(await mockedCurrency.locator('.field-error').innerText(), /non-negative decimal/i)
  await mockedCurrency.locator('.currency-grid input').fill('1000000000001')
  await mockedCurrency.getByRole('button', { name: 'Get reference rate' }).click()
  assert.match(await mockedCurrency.locator('.field-error').innerText(), /1,000,000,000,000/i)
  assert.equal(await mockedCurrency.getByRole('button', { name: 'Save quote' }).count(), 0)
  await mockedCurrency.close()
  await page.goto(`${baseUrl}/images`, { waitUntil: 'networkidle' })
  await page.locator('#image-file-input').setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: fixture })
  await page.getByRole('button', { name: 'Convert to WebP' }).click()
  await page.locator('.image-output-note').waitFor({ state: 'visible', timeout: 15_000 })
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('link', { name: /Download converted\.webp/i }).click()
  const download = await downloadPromise
  assert.equal(download.suggestedFilename(), 'converted.webp')
  await page.getByLabel('Output format').selectOption('png')
  await page.getByRole('button', { name: 'Convert to PNG' }).click()
  await page.locator('.image-output-note').waitFor({ state: 'visible', timeout: 15_000 })
  assert.match(await page.locator('.image-output-note').innerText(), /converted\.png/i)
  await page.screenshot({ path: `${artifactDir}/image-1440.png`, fullPage: true })
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  assert.equal(await page.locator('.image-output-note').count(), 0)
  const mockedImage = await context.newPage()
  await mockedImage.route('**/api/v1/image/convert', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250))
    await route.fulfill({ status: 200, contentType: 'image/webp', headers: { 'content-disposition': 'attachment; filename="converted.webp"', 'x-image-width': '1', 'x-image-height': '1' }, body: fixture })
  })
  await mockedImage.goto(`${baseUrl}/images`, { waitUntil: 'networkidle' })
  await mockedImage.locator('#image-file-input').setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: fixture })
  await mockedImage.getByRole('button', { name: 'Convert to WebP' }).click()
  await mockedImage.getByRole('button', { name: 'Clear', exact: true }).click()
  await mockedImage.waitForTimeout(350)
  assert.equal(await mockedImage.locator('.image-output-note').count(), 0)
  await mockedImage.close()
  await page.goto(`${baseUrl}/images`, { waitUntil: 'networkidle' })
  await page.locator('#image-file-input').setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') })
  assert.match(await page.locator('.inline-note[role="alert"]').innerText(), /Choose an image/i)
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' })
  await page.goto(`${baseUrl}/developer`, { waitUntil: 'networkidle' })
  await page.goBack({ waitUntil: 'networkidle' })
  assert.equal(await page.getByRole('heading', { name: 'Unit converter', exact: true }).count(), 1)
  await page.goForward({ waitUntil: 'networkidle' })
  assert.equal(await page.getByRole('heading', { name: 'Developer tools', exact: true }).count(), 1)
  assert.equal(await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches), true)
  await page.screenshot({ path: `${artifactDir}/developer-1440.png`, fullPage: true })
  await context.close()
  await writeFile(`${artifactDir}/README.txt`, 'Headless Playwright QA ran against the production Next server with system Chrome. Screenshots cover 320, 390, 768, and 1440px home layouts plus developer and image workflows.\n')
  console.log('browser QA passed')
} finally {
  await browser.close()
}
