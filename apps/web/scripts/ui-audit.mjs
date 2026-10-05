import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const require = createRequire(import.meta.url)
const axeSource = require('axe-core').source
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../..')

const BASE_URL = process.env.BASE_URL || ''
const ARTIFACT_DIR = path.resolve(process.env.QA_ARTIFACT_DIR || path.join(REPO_ROOT, 'docs/audit-2026-10-04/final'))
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const routes = [
  { name: 'home', path: '/', tool: 'units' },
  { name: 'currency', path: '/currency', tool: 'currency' },
  { name: 'developer', path: '/developer', tool: 'developer' },
  { name: 'images', path: '/images', tool: 'images' },
  { name: 'about', path: '/about', tool: 'about' },
]
const widths = [320, 390, 768, 1440]
const themes = ['light', 'dark']

const results = {
  meta: {
    date: '2026-10-04',
    baseUrl: BASE_URL,
    browser: CHROME,
    playwright: '1.63.0',
    reducedMotion: 'reduce for baseline matrix captures',
    axe: 'axe-core 4.13.0 default ruleset injected in each matrix page',
    scope: 'Measured browser QA only; this report is not a WCAG certification or a real-user study.',
  },
  screenshots: [],
  textResizeScreenshots: [],
  functionalScreenshots: [],
  checks: [],
  findings: [],
  unverified: [
    'Firefox and WebKit were not available in the installed Playwright browser cache; no Safari or Firefox result is claimed.',
    '200% browser zoom was not available as a reliable Playwright context setting. A separately labeled 200% root-font-size reflow check is recorded; it is not a browser-zoom result.',
    'No external currency provider was called. Currency behavior below uses deterministic route mocks.',
  ],
}

function record(name, status, detail, extra = {}) {
  const normalizedStatus = status === true ? 'pass' : status === false ? 'fail' : status
  results.checks.push({ name, status: normalizedStatus, detail, ...extra })
}

function finding(id, severity, title, detail, evidence = {}) {
  if (results.findings.some((item) => item.id === id)) return
  results.findings.push({ id, severity, title, detail, evidence })
}

function maxCssDurationSeconds(value) {
  return String(value)
    .split(',')
    .map((duration) => {
      const amount = Number.parseFloat(duration)
      if (!Number.isFinite(amount)) return Number.POSITIVE_INFINITY
      return duration.trim().endsWith('ms') ? amount / 1000 : amount
    })
    .reduce((maximum, duration) => Math.max(maximum, duration), 0)
}

async function routeCurrency(page, { delay = 0, delayByQuote = {}, retryOnceForQuote = null } = {}) {
  const attempts = new Map()
  await page.route('**/api/v1/currency/rates*', async (route) => {
    const requestUrl = new URL(route.request().url())
    const base = (requestUrl.searchParams.get('base') || 'USD').toUpperCase()
    const quote = (requestUrl.searchParams.get('quote') || 'TND').toUpperCase()
    const key = `${base}:${quote}`
    const attempt = (attempts.get(key) ?? 0) + 1
    attempts.set(key, attempt)
    const responseDelay = delayByQuote[quote] ?? delay
    if (responseDelay) await new Promise((resolve) => setTimeout(resolve, responseDelay))
    if (route.request().failure()) return
    if (quote === 'GBP' || (quote === retryOnceForQuote && attempt === 1)) {
      await route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ code: 'provider_rate_limited', message: 'Rate provider is busy. Try again.' }) })
      return
    }
    if (quote === 'CAD') {
      await route.abort('timedout')
      return
    }
    const stale = quote === 'EUR'
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        base,
        quote,
        rate: base === quote ? '1' : quote === 'TND' ? '3.1250000000' : '0.9250000000',
        provider: 'Mock reference provider',
        sourceTimestamp: '2026-10-03T12:00:00.000Z',
        fetchedAt: '2026-10-04T09:00:00.000Z',
        stale,
      }),
    })
  })
  return attempts
}

async function newContext(browser, { width = 1440, height = 1000, theme = 'light', js = true } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    colorScheme: theme,
    reducedMotion: 'reduce',
    javaScriptEnabled: js,
    acceptDownloads: true,
  })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL }).catch(() => {})
  return context
}

async function openPage(context, routePath, { mockCurrency = true, currencyMockOptions = {} } = {}) {
  const page = await context.newPage()
  const currencyAttempts = mockCurrency ? await routeCurrency(page, currencyMockOptions) : null
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const externalRequests = []
  page.on('request', (request) => {
    try {
      const requestUrl = new URL(request.url())
      const baseUrl = new URL(BASE_URL)
      if (requestUrl.origin !== baseUrl.origin && !requestUrl.protocol.startsWith('data')) externalRequests.push(request.url())
    } catch {
      // Ignore malformed request URLs emitted by the browser.
    }
  })
  await page.goto(new URL(routePath, BASE_URL).toString(), { waitUntil: 'domcontentloaded', timeout: 15000 })
  await page.waitForTimeout(450)
  return { page, externalRequests, pageErrors, currencyAttempts }
}

async function pageMetrics(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector)
      if (!element) return null
      const box = element.getBoundingClientRect()
      return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) }
    }
    const root = document.documentElement
    const focusable = [...document.querySelectorAll('a,button,input,select,textarea,[tabindex]')]
      .filter((element) => {
        const style = getComputedStyle(element)
        return !element.hasAttribute('disabled') && style.display !== 'none' && style.visibility !== 'hidden'
      })
      .map((element) => ({ tag: element.tagName.toLowerCase(), text: (element.textContent || '').trim().slice(0, 80), aria: element.getAttribute('aria-label') }))
    const touchTargets = [...document.querySelectorAll('.top-nav a, .mobile-nav a, .about-link, .text-button, .history-remove, .image-mode-control button, input[type="range"], .category-chip span, .swap-button, .unit-table button')]
      .filter((element) => {
        const style = getComputedStyle(element)
        return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0
      })
      .map((element) => {
        const box = element.getBoundingClientRect()
        return { tag: element.tagName.toLowerCase(), text: (element.textContent || '').trim().slice(0, 60), aria: element.getAttribute('aria-label'), width: box.width, height: box.height }
      })
    return {
      title: document.title,
      htmlClass: root.className,
      colorScheme: getComputedStyle(root).colorScheme,
      innerWidth: window.innerWidth,
      scrollWidth: root.scrollWidth,
      bodyScrollWidth: document.body?.scrollWidth || 0,
      bodyHeight: document.body?.scrollHeight || 0,
      h1Count: document.querySelectorAll('h1').length,
      mainCount: document.querySelectorAll('main').length,
      skipLink: Boolean(document.querySelector('.skip-link')),
      header: rect('.app-header'),
      main: rect('main'),
      focusableCount: focusable.length,
      focusable: focusable.slice(0, 80),
      undersizedTouchTargets: touchTargets.filter((target) => target.width < 44 || target.height < 44),
      inputAudit: [...document.querySelectorAll('input,textarea,select')].map((element) => ({
        tag: element.tagName.toLowerCase(),
        id: element.id,
        type: element.getAttribute('type'),
        name: element.getAttribute('name'),
        autocomplete: element.getAttribute('autocomplete'),
        ariaLabel: element.getAttribute('aria-label'),
        labelled: Boolean(element.labels?.length),
      })),
      animations: document.getAnimations().map((animation) => ({ name: animation.animationName, playState: animation.playState })),
    }
  })
}

async function captureMatrix(browser) {
  for (const theme of themes) {
    for (const route of routes) {
      for (const width of widths) {
        const context = await newContext(browser, { width, theme })
        try {
          const { page, externalRequests, pageErrors } = await openPage(context, route.path)
          const metrics = await pageMetrics(page)
          await page.addScriptTag({ content: axeSource })
          const axeResult = await page.evaluate(async () => window.axe.run(document))
          const axeViolations = axeResult.violations || []
          record(`axe:${route.name}:${theme}:${width}`, axeViolations.length ? 'fail' : 'pass', axeViolations.length ? `${axeViolations.length} axe default-rule violation(s): ${axeViolations.map((item) => item.id).join(', ')}.` : 'No axe default-rule violations.', { route: route.path, theme, width, rules: 'axe-core defaults', violations: axeViolations.map((item) => ({ id: item.id, impact: item.impact, help: item.help, helpUrl: item.helpUrl, nodes: item.nodes.length, failureSummary: item.nodes.map((node) => node.failureSummary) })) })
          for (const violation of axeViolations) {
            finding(`axe-${route.name}-${violation.id}`, violation.impact === 'critical' || violation.impact === 'serious' ? 'P1' : 'P2', `Axe: ${violation.help}`, `${route.path} at ${width}px/${theme} reported ${violation.nodes.length} node(s) for ${violation.id}.`, { route: route.path, theme, width, helpUrl: violation.helpUrl, nodes: violation.nodes.map((node) => ({ target: node.target, html: node.html, failureSummary: node.failureSummary })) })
          }
          const screenshot = path.join(ARTIFACT_DIR, 'screenshots', theme, `${route.name}-${width}.png`)
          await page.screenshot({ path: screenshot, fullPage: true })
          results.screenshots.push({ route: route.path, routeName: route.name, theme, width, path: screenshot, metrics })
          const overflow = metrics.scrollWidth > metrics.innerWidth + 1 || metrics.bodyScrollWidth > metrics.innerWidth + 1
          record(`matrix:${route.name}:${theme}:${width}`, overflow ? 'fail' : 'pass', overflow ? `Horizontal overflow: root ${metrics.scrollWidth}px/body ${metrics.bodyScrollWidth}px for ${metrics.innerWidth}px viewport.` : `No horizontal overflow at ${metrics.innerWidth}px.`, { route: route.path, theme, width, screenshot, metrics })
          const themeMatches = metrics.htmlClass.split(/\s+/).includes(theme) && metrics.colorScheme === theme
          record(`theme-class:${route.name}:${theme}:${width}`, themeMatches ? 'pass' : 'fail', `html class=${metrics.htmlClass || '(empty)'}; computed color-scheme=${metrics.colorScheme}; requested theme=${theme}.`, { route: route.path, theme, width })
          const desktopShortcut = await page.locator('.desktop-shortcut').isVisible()
          const mobileShortcut = await page.locator('.mobile-shortcut').isVisible()
          const expectedShortcut = width <= 700 ? mobileShortcut && !desktopShortcut : desktopShortcut && !mobileShortcut
          if (route.name === 'about') {
            record(`footer-shortcut:${route.name}:${theme}:${width}`, 'skip', 'The standalone About route does not render the shared footer; this is tracked separately as a P2 consistency finding.', { route: route.path, theme, width })
          } else {
            record(`footer-shortcut:${route.name}:${theme}:${width}`, expectedShortcut ? 'pass' : 'fail', `Desktop shortcut visible=${desktopShortcut}; mobile shortcut visible=${mobileShortcut}; viewport=${width}px.`, { route: route.path, theme, width })
          }
          const undersized = metrics.undersizedTouchTargets
          record(`touch-targets:${route.name}:${theme}:${width}`, undersized.length ? 'fail' : 'pass', undersized.length ? `${undersized.length} listed touch target(s) are below 44px: ${JSON.stringify(undersized.slice(0, 8))}` : 'All visible audited navigation, text, image-mode, range, and history-remove targets are at least 44px.', { route: route.path, theme, width, undersized })
          if (undersized.length) finding('undersized-touch-targets', 'P2', 'Some audited controls are smaller than the project touch target', `${route.path} at ${width}px/${theme} has a visible audited target below 44px.`, { route: route.path, theme, width, undersized })
          record(`page-errors:${route.name}:${theme}:${width}`, pageErrors.length ? 'fail' : 'pass', pageErrors.length ? `Browser page errors before/during capture: ${pageErrors.join('; ')}` : 'No uncaught browser page errors observed from before navigation through capture.', { route: route.path, theme, width, pageErrors: [...pageErrors] })
          if (overflow && route.name === 'developer' && width === 320) finding('developer-mobile-overflow', 'P1', 'Developer route overflows at the smallest viewport', `/developer measured ${metrics.scrollWidth}px document width inside a ${metrics.innerWidth}px viewport in ${theme} mode.`, { route: route.path, theme, width, metrics })
          if (metrics.h1Count !== 1) finding(`h1-${route.name}`, 'P1', 'Heading structure has the wrong h1 count', `${route.path} rendered ${metrics.h1Count} h1 elements at ${width}px.`, { route: route.path, width, theme })
          if (!metrics.skipLink && route.name !== 'about') finding('missing-skip-link', 'P1', 'Global shell is missing the skip link on a route', `${route.path} did not render the shared skip link at ${width}px.`, { route: route.path, width, theme })
          if (route.name === 'about' && !metrics.skipLink) finding('about-shell', 'P2', 'About route omits the shared navigation shell', '/about has no skip link, primary navigation, theme control, or footer in the captured HTML.', { route: route.path, width, theme })
          if (externalRequests.length) record(`external-request:${route.name}:${theme}:${width}`, 'fail', `Unexpected cross-origin browser requests: ${externalRequests.join(', ')}`, { route: route.path, theme, width })
          else record(`external-request:${route.name}:${theme}:${width}`, 'pass', 'No cross-origin browser requests observed.', { route: route.path, theme, width })
          await page.close()
        } catch (error) {
          record(`matrix:${route.name}:${theme}:${width}`, 'error', error instanceof Error ? error.message : String(error), { route: route.path, theme, width })
        } finally {
          await context.close()
        }
      }
    }
  }
}

async function captureTextResize(browser) {
  for (const route of routes) {
    const context = await newContext(browser, { width: 390, theme: 'light' })
    try {
      const { page, pageErrors } = await openPage(context, route.path)
      const beforeFontSize = await page.evaluate(() => {
        const root = document.documentElement
        const before = Number.parseFloat(getComputedStyle(root).fontSize)
        root.style.setProperty('font-size', `${before * 2}px`, 'important')
        return before
      })
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      await page.waitForTimeout(60)
      const afterFontSize = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize))
      const fontScale = { before: beforeFontSize, after: afterFontSize }
      const metrics = await pageMetrics(page)
      const screenshot = path.join(ARTIFACT_DIR, 'screenshots', 'text-resize-200', `${route.name}-390.png`)
      await page.screenshot({ path: screenshot, fullPage: true })
      results.textResizeScreenshots.push({ route: route.path, routeName: route.name, theme: 'light', width: 390, fontScale, path: screenshot, metrics })
      const overflow = metrics.scrollWidth > metrics.innerWidth + 1 || metrics.bodyScrollWidth > metrics.innerWidth + 1
      const doubled = fontScale.before > 0 && fontScale.after >= fontScale.before * 1.99
      record(`reflow:text-resize-200:${route.name}`, doubled && !overflow ? 'pass' : 'fail', `Root font size ${fontScale.before}px → ${fontScale.after}px; document/body width ${metrics.scrollWidth}/${metrics.bodyScrollWidth}px in ${metrics.innerWidth}px viewport.`, { route: route.path, theme: 'light', width: 390, fontScale, screenshot, metrics })
      record(`page-errors:text-resize:${route.name}`, pageErrors.length ? 'fail' : 'pass', pageErrors.length ? `Browser page errors during text resize: ${pageErrors.join('; ')}` : 'No uncaught browser page errors during text resize.', { route: route.path, pageErrors: [...pageErrors] })
      await page.close()
    } catch (error) {
      record(`reflow:text-resize-200:${route.name}`, 'error', error instanceof Error ? error.message : String(error), { route: route.path })
    } finally {
      await context.close()
    }
  }
}

async function keyboardAndUnits(browser) {
  const context = await newContext(browser, { width: 390, theme: 'light' })
  let auditPage
  let pageErrors = []
  try {
    const opened = await openPage(context, '/')
    const { page } = opened
    pageErrors = opened.pageErrors
    auditPage = page
    await page.keyboard.press('Tab')
    const skipFocused = await page.evaluate(() => document.activeElement?.classList.contains('skip-link'))
    record('keyboard:skip-link-focus', skipFocused ? 'pass' : 'fail', skipFocused ? 'First Tab focuses the skip link.' : `First Tab focused ${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120))}`)
    await page.keyboard.press('Enter')
    const activeAfterSkip = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName.toLowerCase())
    const skipPass = activeAfterSkip === 'main-content' || activeAfterSkip === 'main'
    record('keyboard:skip-link-activation', skipPass ? 'pass' : 'fail', `After activating skip link, active element is ${activeAfterSkip}.`)
    if (!skipPass) finding('skip-link-focus', 'P1', 'Skip-link activation does not move focus into main content', `Activating the skip link left document focus on ${activeAfterSkip} at 390px.`, { route: '/', width: 390, activeAfterSkip })

    const fromSelect = page.locator('#field-from')
    const toSelect = page.locator('#field-to')
    const amount = page.locator('#field-amount')
    await page.locator('.category-chip input').first().focus()
    await page.keyboard.press('ArrowRight')
    const keyboardCategory = await page.locator('.category-chip input:checked').inputValue()
    record('units:category-keyboard', keyboardCategory === 'mass' ? 'pass' : 'fail', `Arrow key from the first category chip selected ${keyboardCategory}.`)
    await page.locator('.category-chip input[value="length"]').check()
    await amount.fill('2.5')
    await fromSelect.selectOption('meter')
    await toSelect.selectOption('centimeter')
    const resultText = (await page.locator('#field-result').innerText()).trim()
    record('units:conversion-result', /250(?:\.0+)?\s*cm/.test(resultText) ? 'pass' : 'fail', `2.5 m → cm result text: ${resultText || '(empty)'}`)

    const beforeSwap = { from: await fromSelect.inputValue(), to: await toSelect.inputValue() }
    await page.locator('button[aria-label="Swap source and target units"]').press('Enter')
    const afterSwap = { from: await fromSelect.inputValue(), to: await toSelect.inputValue() }
    record('units:keyboard-swap', afterSwap.from === beforeSwap.to && afterSwap.to === beforeSwap.from ? 'pass' : 'fail', `Keyboard swap changed ${beforeSwap.from}/${beforeSwap.to} to ${afterSwap.from}/${afterSwap.to}.`)

    const copy = page.locator('button[aria-label="Copy result"]')
    let copied = ''
    if (await copy.count()) {
      await copy.press('Enter')
      await page.waitForTimeout(80)
      copied = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''))
    }
    record('units:copy-feedback', copied ? 'pass' : 'fail', copied ? `Clipboard contained ${copied.slice(0, 80)}.` : 'Copy did not expose clipboard text in the granted test context.')

    // Browsing, editing, swapping and copying leave history untouched.
    await page.waitForTimeout(1500)
    const beforeSave = await page.locator('.history-item').count()
    record('history:no-implicit-save', beforeSave === 0 ? 'pass' : 'fail', `History entries before explicit save: ${beforeSave}.`)
    await page.getByRole('button', { name: 'Save to history', exact: true }).press('Enter')
    await page.locator('.history-item').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
    const clear = page.getByRole('button', { name: 'Clear all' })
    const beforeClear = await page.locator('.history-item').count()
    if (await clear.count()) await clear.press('Enter')
    const afterClear = await page.locator('.history-item').count()
    const undo = page.getByRole('button', { name: 'Undo' })
    if (await undo.count()) await undo.press('Enter')
    const afterUndo = await page.locator('.history-item').count()
    record('history:explicit-save-clear-undo-keyboard', beforeClear > 0 && afterClear === 0 && afterUndo === beforeClear ? 'pass' : 'fail', `History entries before clear: ${beforeClear}; after clear: ${afterClear}; after undo: ${afterUndo}.`)

    await page.evaluate(() => localStorage.setItem('convertal-history-v1', JSON.stringify([null, {}, { id: 'bad', tool: 'units', title: 'Bad', detail: 'Bad', timestamp: 'not-a-number' }])))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(300)
    const malformedRendered = await page.locator('h1').count() === 1
    record('history:malformed-storage', malformedRendered ? 'pass' : 'fail', malformedRendered ? 'Malformed localStorage entries did not prevent the units route from rendering.' : 'Malformed localStorage entries broke the units route.')
    if (!malformedRendered) finding('malformed-history-storage', 'P1', 'Malformed history entries can break the workbench', 'A persisted history array containing null or incomplete records prevented the units route from rendering.', { route: '/', storage: '[null, {}, { timestamp: "not-a-number" }]' })
    await page.evaluate(() => localStorage.clear())
    await page.goto(new URL('/', BASE_URL).toString(), { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(250)

    const freshAmount = page.locator('#field-amount')
    await freshAmount.fill('9'.repeat(100))
    const longWidth = await page.evaluate(() => ({ body: document.body.scrollWidth, root: document.documentElement.scrollWidth, viewport: window.innerWidth }))
    const longScreenshot = path.join(ARTIFACT_DIR, 'screenshots', 'functional', 'units-long-number-390.png')
    await fs.mkdir(path.dirname(longScreenshot), { recursive: true })
    await page.screenshot({ path: longScreenshot, fullPage: true })
    results.functionalScreenshots.push({ route: '/', routeName: 'home', state: '100-digit amount', theme: 'light', width: 390, path: longScreenshot, metrics: longWidth })
    const longPass = longWidth.body <= longWidth.viewport + 1 && longWidth.root <= longWidth.viewport + 1
    record('units:long-number-reflow', longPass ? 'pass' : 'fail', `100-digit amount widths: body ${longWidth.body}, root ${longWidth.root}, viewport ${longWidth.viewport}.`, { screenshot: longScreenshot })
    if (!longPass) finding('units-long-number-overflow', 'P1', 'Long unit input creates horizontal overflow', `A 100-digit amount expanded the document to ${longWidth.body}px at a ${longWidth.viewport}px viewport.`, { route: '/', width: longWidth.viewport, longWidth })
    await page.close()

    const storageContext = await newContext(browser, { width: 390, theme: 'light' })
    await storageContext.addInitScript(() => {
      const blocked = { getItem() { throw new Error('storage blocked') }, setItem() { throw new Error('storage quota') }, removeItem() { throw new Error('storage blocked') }, clear() { throw new Error('storage blocked') }, key() { return null }, length: 0 }
      Object.defineProperty(window, 'localStorage', { configurable: true, get: () => blocked })
    })
    const storagePageErrors = []
    try {
      const storagePage = await storageContext.newPage()
      storagePage.on('pageerror', (error) => storagePageErrors.push(error.message))
      await storagePage.goto(new URL('/', BASE_URL).toString(), { waitUntil: 'domcontentloaded', timeout: 15000 })
      await storagePage.waitForTimeout(500)
      const storageHealthy = await storagePage.locator('h1').count() === 1 && storagePageErrors.length === 0
      record('history:blocked-storage', storageHealthy ? 'pass' : 'fail', storageHealthy ? 'Blocked localStorage did not break the workbench.' : `Blocked localStorage produced ${storagePageErrors.join('; ') || 'an incomplete render'}.`)
      if (!storageHealthy) finding('blocked-history-storage', 'P1', 'Blocked or quota localStorage can break the workbench', `A browser storage failure produced page errors or an incomplete route: ${storagePageErrors.join('; ') || 'incomplete render'}.`, { route: '/', errors: storagePageErrors })
      await storagePage.close()
    } finally {
      await storageContext.close()
    }
  } catch (error) {
    const diagnostics = auditPage ? ` url=${auditPage.url()} pageErrors=${pageErrors.join('; ') || '(none)'}` : ''
    if (auditPage) await auditPage.screenshot({ path: path.join(ARTIFACT_DIR, 'keyboard-and-units-error.png'), fullPage: true }).catch(() => {})
    record('keyboard-and-units', 'error', `${error instanceof Error ? error.message : String(error)}${diagnostics}`)
  } finally {
    await context.close()
  }
}

async function clipboardFailureCheck(browser) {
  const context = await newContext(browser, { width: 390, theme: 'light' })
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { throw new DOMException('Clipboard permission denied', 'NotAllowedError') } },
    })
  })
  try {
    const { page, pageErrors } = await openPage(context, '/')
    const copy = page.getByRole('button', { name: 'Copy result' })
    await copy.click()
    const status = page.locator('.copy-status')
    const message = await status.innerText().catch(() => '')
    const recovered = /Copy failed|copy manually/i.test(message) && await status.getAttribute('role') === 'status' && pageErrors.length === 0
    record('clipboard:write-failure-recovery', recovered ? 'pass' : 'fail', recovered ? `Blocked clipboard write exposed an announced manual-copy fallback: ${message}` : `Clipboard failure message=${message || '(missing)'}; role=${await status.getAttribute('role')}; page errors=${pageErrors.length}.`, { route: '/', pageErrors: [...pageErrors] })
    if (!recovered) finding('clipboard-write-failure', 'P2', 'Clipboard failure has no announced recovery path', 'A denied clipboard write did not display a polite manual-copy fallback.', { route: '/', message, pageErrors })
    await page.close()
  } catch (error) {
    record('clipboard:write-failure-recovery', 'error', error instanceof Error ? error.message : String(error))
  } finally {
    await context.close()
  }
}

async function developerChecks(browser) {
  const context = await newContext(browser, { width: 1440, theme: 'dark' })
  try {
    const { page } = await openPage(context, '/developer')
    const input = page.locator('textarea').first()
    // Transformations are a radio group of icon chips.
    const transformation = { selectOption: (value) => page.locator(`input[name="developer-mode"][value="${value}"]`).check() }
    await input.fill('{"hello":"world","n":2}')
    await page.getByRole('button', { name: 'Run transform' }).press('Enter')
    record('developer:json-success', (await page.locator('.output-box').innerText()).includes('hello') ? 'pass' : 'fail', 'Valid JSON was formatted.')
    await input.fill('{bad')
    await page.getByRole('button', { name: 'Run transform' }).press('Enter')
    const malformed = await page.locator('.output-box').innerText()
    const invalidAnnounced = await page.locator('[role="alert"]').count()
    record('developer:json-error', invalidAnnounced > 0 || /invalid|unexpected|malformed|json/i.test(malformed) ? 'pass' : 'fail', `Malformed JSON response: ${malformed.slice(0, 160)}.`)
    await transformation.selectOption('base64')
    await input.fill('hello')
    await page.getByRole('button', { name: 'Run transform' }).press('Enter')
    const encoded = await page.locator('.output-box').innerText()
    await input.fill(encoded.trim())
    await page.getByRole('button', { name: 'Decode instead' }).press('Enter')
    record('developer:base64-roundtrip', (await page.locator('.output-box').innerText()).trim() === 'hello' && encoded.trim() === 'aGVsbG8=', 'Base64 encode/decode round trip completed.')
    await transformation.selectOption('url')
    await input.fill('a value & more')
    await page.getByRole('button', { name: 'Run transform' }).press('Enter')
    const urlEncoded = await page.locator('.output-box').innerText()
    await input.fill(urlEncoded.trim())
    await page.getByRole('button', { name: 'Decode instead' }).press('Enter')
    record('developer:url-roundtrip', (await page.locator('.output-box').innerText()).trim() === 'a value & more' && /%20|%26/.test(urlEncoded), 'URL encode/decode round trip completed.')
    await transformation.selectOption('timestamp')
    await input.fill('not a date')
    await page.getByRole('button', { name: 'Run transform' }).press('Enter')
    record('developer:timestamp-error', /enter an iso|timestamp/i.test(await page.locator('.output-box').innerText()), 'Invalid timestamp has an actionable error.')
    await transformation.selectOption('uuid')
    await page.getByRole('button', { name: 'Generate UUID' }).press('Enter')
    record('developer:uuid', /^[0-9a-f-]{36}$/i.test((await page.locator('.output-box').innerText()).trim()), 'UUID mode returned a UUID-shaped value.')
    await input.fill('x'.repeat(20000))
    const widthsAfterLong = await page.evaluate(() => ({ root: document.documentElement.scrollWidth, body: document.body.scrollWidth, viewport: innerWidth }))
    record('developer:long-input-reflow', widthsAfterLong.root <= widthsAfterLong.viewport + 1 && widthsAfterLong.body <= widthsAfterLong.viewport + 1 ? 'pass' : 'fail', `Long input widths: body ${widthsAfterLong.body}, root ${widthsAfterLong.root}, viewport ${widthsAfterLong.viewport}.`)
    await page.close()
  } catch (error) {
    record('developer-checks', 'error', error instanceof Error ? error.message : String(error))
  } finally {
    await context.close()
  }
}

async function currencyChecks(browser) {
  const context = await newContext(browser, { width: 768, theme: 'light' })
  try {
    const { page } = await openPage(context, '/currency')
    const amount = page.locator('main input').first()
    const selects = page.locator('main select')
    await amount.fill('100')
    await selects.nth(0).selectOption('USD')
    await selects.nth(1).selectOption('TND')
    await page.getByRole('button', { name: 'Get reference rate' }).click()
    await page.waitForTimeout(200)
    const freshText = await page.locator('.currency-result').innerText()
    const freshPass = /312[.,]500/.test(freshText) && /TND/.test(freshText) && /USD/.test(freshText)
    record('currency:mock-fresh', freshPass ? 'pass' : 'fail', `Mock USD/TND expected 100 × 3.125 = 312.500 TND; rendered: ${freshText.slice(0, 180)}.`)
    record('currency:timestamp-provider', /Mock reference provider/.test(await page.locator('.currency-result').innerText()) && /Source updated|fetched/i.test(await page.locator('.currency-result').innerText()), 'Provider and source/fetched timestamps were visible.')

    await selects.nth(1).selectOption('EUR')
    await page.getByRole('button', { name: 'Get reference rate' }).click()
    await page.waitForTimeout(200)
    const staleStatus = await page.getByText('Stale cached rate', { exact: true }).count()
    record('currency:mock-stale', staleStatus === 1 ? 'pass' : 'fail', `Expected explicit “Stale cached rate” status; found ${staleStatus}.`)

    await selects.nth(1).selectOption('GBP')
    await page.getByRole('button', { name: 'Get reference rate' }).click()
    await page.waitForTimeout(200)
    const limitedText = await page.locator('.note-danger').innerText().catch(() => '')
    const retry = page.getByRole('button', { name: 'Retry' })
    const preservedAfterLimit = await amount.inputValue() === '100' && await selects.nth(0).inputValue() === 'USD' && await selects.nth(1).inputValue() === 'GBP'
    const limitedPass = /Rate provider is busy/i.test(limitedText) && await retry.isVisible() && await retry.isEnabled() && preservedAfterLimit && await amount.getAttribute('aria-invalid') !== 'true'
    record('currency:mock-429', limitedPass ? 'pass' : 'fail', `429 alert=${limitedText || '(missing)'}; Retry visible/enabled=${await retry.isVisible()}/${await retry.isEnabled()}; amount/pair preserved=${preservedAfterLimit}.`)

    await selects.nth(1).selectOption('CAD')
    await page.getByRole('button', { name: /Get reference rate|Retry/i }).first().click()
    await page.waitForTimeout(250)
    const timeoutError = page.locator('.note-danger')
    const timeoutRetry = page.getByRole('button', { name: 'Retry' })
    const timeoutRecovered = await timeoutError.isVisible() && await timeoutRetry.isVisible() && await timeoutRetry.isEnabled() && !await page.getByRole('button', { name: 'Requesting rate' }).count()
    record('currency:mock-timeout', timeoutRecovered ? 'pass' : 'fail', `Timed-out mock returned to an actionable error state: alert=${await timeoutError.isVisible()}, retry=${await timeoutRetry.isVisible()}/${await timeoutRetry.isEnabled()}.`)

    await amount.fill('-1')
    await page.getByRole('button', { name: /Get reference rate|Retry/i }).first().click()
    await page.waitForTimeout(100)
    record('currency:negative-validation', /non-negative|between|amount/i.test(await page.locator('main').innerText()), 'Negative amount was rejected with an explanatory validation message.')
    await amount.fill('1'.repeat(20))
    await page.getByRole('button', { name: /Get reference rate|Retry/i }).first().click()
    await page.waitForTimeout(100)
    record('currency:amount-limit', /between|amount/i.test(await page.locator('main').innerText()), 'Over-limit amount was rejected with an explanatory validation message.')
    await page.close()

    const retryContext = await newContext(browser, { width: 390, theme: 'light' })
    try {
      const { page: retryPage, currencyAttempts, pageErrors: retryPageErrors } = await openPage(retryContext, '/currency', { currencyMockOptions: { retryOnceForQuote: 'AUD' } })
      const retryAmount = retryPage.locator('main input').first()
      const retrySelects = retryPage.locator('main select')
      await retryAmount.fill('42.5')
      await retrySelects.nth(1).selectOption('AUD')
      await retryPage.getByRole('button', { name: 'Get reference rate' }).click()
      await retryPage.locator('.note-danger').waitFor({ state: 'visible' })
      const beforeRetry = { amount: await retryAmount.inputValue(), base: await retrySelects.nth(0).inputValue(), quote: await retrySelects.nth(1).inputValue() }
      await retryPage.getByRole('button', { name: 'Retry' }).click()
      await retryPage.locator('.currency-result').waitFor({ state: 'visible' })
      const retryResult = await retryPage.locator('.currency-result').innerText()
      const retryPreserved = beforeRetry.amount === '42.5' && beforeRetry.base === 'USD' && beforeRetry.quote === 'AUD' && await retryAmount.inputValue() === beforeRetry.amount && await retrySelects.nth(0).inputValue() === beforeRetry.base && await retrySelects.nth(1).inputValue() === beforeRetry.quote
      const retryPassed = retryPreserved && /AUD/.test(retryResult) && currencyAttempts?.get('USD:AUD') === 2
      record('currency:429-retry-preserves-input', retryPassed ? 'pass' : 'fail', `First attempt returned 429; retry count=${currencyAttempts?.get('USD:AUD') ?? 0}; preserved=${JSON.stringify(beforeRetry)}; result=${retryResult.slice(0, 160)}.`)
      record('currency:retry-page-errors', retryPageErrors.length ? 'fail' : 'pass', retryPageErrors.length ? `Retry interaction produced: ${retryPageErrors.join('; ')}` : 'Retry interaction completed without uncaught page errors.', { pageErrors: [...retryPageErrors] })
      await retryPage.close()
    } catch (error) {
      record('currency:429-retry-preserves-input', 'error', error instanceof Error ? error.message : String(error))
    } finally {
      await retryContext.close()
    }

    const raceContext = await newContext(browser, { width: 390, theme: 'light' })
    try {
      const { page: racePage } = await openPage(raceContext, '/currency', { mockCurrency: false })
      await routeCurrency(racePage, { delayByQuote: { EUR: 650 } })
      const raceAmount = racePage.locator('main input').first()
      const raceSelects = racePage.locator('main select')
      await raceSelects.nth(1).selectOption('EUR')
      const eurRequest = racePage.waitForRequest((request) => new URL(request.url()).searchParams.get('quote') === 'EUR')
      await racePage.getByRole('button', { name: 'Get reference rate' }).click()
      await eurRequest
      await raceSelects.nth(1).selectOption('GBP')
      await racePage.getByRole('button', { name: 'Get reference rate' }).click()
      await racePage.locator('.note-danger').waitFor({ state: 'visible' })
      await racePage.waitForTimeout(700)
      const staleResultCount = await racePage.locator('.currency-result').count()
      const currentQuote = await raceSelects.nth(1).inputValue()
      const raceAlert = await racePage.locator('.note-danger').innerText().catch(() => '')
      const racePassed = staleResultCount === 0 && currentQuote === 'GBP' && /Rate provider is busy/i.test(raceAlert) && await raceAmount.inputValue() === '100'
      record('currency:stale-response-race', racePassed ? 'pass' : 'fail', `Delayed EUR response did not replace the later GBP 429 state: quote=${currentQuote}, result-count=${staleResultCount}, alert=${raceAlert || '(missing)'}.`)
      await racePage.close()
    } catch (error) {
      record('currency:stale-response-race', 'error', error instanceof Error ? error.message : String(error))
    } finally {
      await raceContext.close()
    }
  } catch (error) {
    record('currency-checks', 'error', error instanceof Error ? error.message : String(error))
  } finally {
    await context.close()
  }
}

async function imageChecks(browser) {
  const context = await newContext(browser, { width: 1440, theme: 'light' })
  try {
    const { page, pageErrors } = await openPage(context, '/images')
    const png1x1 = {
      name: 'fixture.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
    }
    const chooseFile = page.getByRole('button', { name: 'Choose file' })
    const chooserPromise = page.waitForEvent('filechooser')
    await chooseFile.press('Enter')
    const chooser = await chooserPromise
    await chooser.setFiles(png1x1)
    await page.waitForTimeout(300)
    const fixturePreview = await page.locator('img[alt="Preview of fixture.png"]').count() === 1
    record('images:file-control-accept', fixturePreview ? 'pass' : 'fail', fixturePreview ? 'The selected PNG fixture produced its named image preview.' : 'The selected PNG fixture did not produce its named image preview.')
    const fileKeyboardPass = await chooseFile.evaluate((element) => element.tabIndex) >= 0 && !chooser.isMultiple()
    record('images:keyboard-file-picker', fileKeyboardPass ? 'pass' : 'fail', fileKeyboardPass ? 'Enter on the keyboard-focusable Choose file button emitted a single-file filechooser event.' : `The keyboard picker had tabIndex=${await chooseFile.evaluate((element) => element.tabIndex)} or unexpectedly allowed multiple files.`)
    if (!fileKeyboardPass) finding('image-keyboard-upload', 'P1', 'Image upload control is not keyboard focusable', 'The visible choose-file control has no tab stop.', { route: '/images', width: 1440 })
    const serverConvert = page.getByRole('button', { name: /Convert to/i })
    await serverConvert.click()
    const serverArtifact = page.getByRole('link', { name: /Download/i })
    try {
      await Promise.race([serverArtifact.waitFor({ state: 'visible', timeout: 10000 }), page.locator('.note-danger').waitFor({ state: 'visible', timeout: 10000 })])
    } catch {
      // Record the missing artifact as a failed functional check below.
    }
    let serverArtifactEvidence = { name: '', bytes: 0, riff: false, webp: false }
    if (await serverArtifact.count() === 1) {
      const serverDownloadPromise = page.waitForEvent('download', { timeout: 10000 })
      await serverArtifact.click()
      const serverDownload = await serverDownloadPromise
      const serverPath = await serverDownload.path()
      const serverBytes = serverPath ? await fs.readFile(serverPath) : Buffer.alloc(0)
      serverArtifactEvidence = {
        name: serverDownload.suggestedFilename(),
        bytes: serverBytes.length,
        riff: serverBytes.toString('ascii', 0, 4) === 'RIFF',
        webp: serverBytes.toString('ascii', 8, 12) === 'WEBP',
      }
    }
    const serverSignaturePass = serverArtifactEvidence.riff && serverArtifactEvidence.webp && serverArtifactEvidence.bytes > 12 && /\.webp$/i.test(serverArtifactEvidence.name)
    record('images:server-sharp-download-signature', serverSignaturePass ? 'pass' : 'fail', serverSignaturePass ? `Local server conversion downloaded ${serverArtifactEvidence.name} (${serverArtifactEvidence.bytes} bytes) with RIFF/WEBP signature.` : `Expected a real WebP download from local Sharp; evidence: ${JSON.stringify(serverArtifactEvidence)}; error=${(await page.locator('.note-danger').innerText().catch(() => '')).slice(0, 180)}.`, { artifact: serverArtifactEvidence })
    if (!serverSignaturePass) finding('server-image-artifact', 'P1', 'Server image conversion did not return a valid downloadable artifact', 'The local Sharp path must yield a WebP artifact with a RIFF/WEBP signature; an error message alone does not satisfy the image workflow.', { route: '/images', artifact: serverArtifactEvidence })
    const local = page.getByRole('button', { name: /On this device|Browser local/ })
    await local.click()
    await page.getByRole('button', { name: /Convert to/i }).click()
    await page.getByRole('link', { name: /Download/i }).waitFor({ state: 'visible', timeout: 10000 })
    const outputLink = page.getByRole('link', { name: /Download/i })
    let localArtifactEvidence = { name: '', bytes: 0, riff: false, webp: false }
    if (await outputLink.count() === 1) {
      const localDownloadPromise = page.waitForEvent('download', { timeout: 10000 })
      await outputLink.click()
      const localDownload = await localDownloadPromise
      const localPath = await localDownload.path()
      const localBytes = localPath ? await fs.readFile(localPath) : Buffer.alloc(0)
      localArtifactEvidence = { name: localDownload.suggestedFilename(), bytes: localBytes.length, riff: localBytes.toString('ascii', 0, 4) === 'RIFF', webp: localBytes.toString('ascii', 8, 12) === 'WEBP' }
    }
    const localSignaturePass = localArtifactEvidence.riff && localArtifactEvidence.webp && localArtifactEvidence.bytes > 12 && /\.webp$/i.test(localArtifactEvidence.name)
    record('images:local-convert-download-signature', localSignaturePass ? 'pass' : 'fail', localSignaturePass ? `On-device conversion downloaded ${localArtifactEvidence.name} (${localArtifactEvidence.bytes} bytes) with RIFF/WEBP signature.` : `Expected a valid local WebP download; evidence: ${JSON.stringify(localArtifactEvidence)}.`, { artifact: localArtifactEvidence })
    const clear = page.getByRole('button', { name: 'Clear', exact: true })
    await clear.press('Enter')
    record('images:clear-keyboard', await page.locator('#image-file-input').inputValue() === '' && await page.getByText('Drop, paste, or choose an image').count() === 1, 'Clear removed the selected image and returned to the empty state.')

    const bad = { name: 'not-image.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') }
    await page.locator('#image-file-input').setInputFiles(bad)
    await page.waitForTimeout(120)
    const invalidAlert = page.locator('[role="alert"], .note-danger').first()
    record('images:invalid-type', await invalidAlert.count() === 1 && /image|type|choose/i.test(await invalidAlert.innerText()), 'Invalid image type produced a visible alert.')
    record('images:page-errors', pageErrors.length ? 'fail' : 'pass', pageErrors.length ? `Image workflow produced browser errors: ${pageErrors.join('; ')}` : 'No uncaught browser page errors during image conversion.', { pageErrors: [...pageErrors] })
    await page.close()
  } catch (error) {
    record('image-checks', 'error', error instanceof Error ? error.message : String(error))
  } finally {
    await context.close()
  }

  const mockContext = await newContext(browser, { width: 390, theme: 'light' })
  let mockAttempts = 0
  try {
    const { page: mockPage, pageErrors } = await openPage(mockContext, '/images')
    await mockPage.route('**/api/v1/image/convert', async (route) => {
      mockAttempts += 1
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'image_unavailable', message: 'Mock image service unavailable. Try again.' }) })
    })
    await mockPage.locator('#image-file-input').setInputFiles({
      name: 'retry-fixture.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
    })
    await mockPage.getByRole('button', { name: /Convert to/i }).click()
    await mockPage.locator('.note-danger').waitFor({ state: 'visible' })
    const mockRetry = mockPage.getByRole('button', { name: 'Retry' })
    const localFallback = mockPage.getByRole('button', { name: 'Use on-device mode' })
    const retainedBeforeRetry = await mockPage.locator('.dropzone strong').innerText() === 'retry-fixture.png'
    const recoverableError = /Mock image service unavailable/i.test(await mockPage.locator('.note-danger').innerText()) && await mockRetry.isVisible() && await localFallback.isVisible() && retainedBeforeRetry
    record('images:mock-error-recovery', recoverableError ? 'pass' : 'fail', `Mock 503 exposed retry and local fallback; selected file retained=${retainedBeforeRetry}.`)
    await mockRetry.click()
    await mockPage.waitForFunction(() => document.querySelector('.note-danger')?.textContent?.includes('Mock image service unavailable'))
    await mockPage.waitForTimeout(80)
    const retryPreserved = mockAttempts === 2 && await mockPage.locator('.dropzone strong').innerText() === 'retry-fixture.png' && await mockPage.locator('.note-danger').isVisible()
    record('images:mock-retry-preserves-file', retryPreserved ? 'pass' : 'fail', `Mock retry attempts=${mockAttempts}; selected file retained=${retryPreserved}.`)
    await localFallback.click()
    await mockPage.getByRole('button', { name: /Convert to/i }).click()
    await mockPage.getByRole('link', { name: /Download/i }).waitFor({ state: 'visible', timeout: 10000 })
    const fallbackSucceeded = await mockPage.locator('.dropzone strong').innerText() === 'retry-fixture.png' && pageErrors.length === 0
    record('images:mock-error-local-fallback', fallbackSucceeded ? 'pass' : 'fail', 'On-device fallback completed after a mocked API failure and retained the selected image.', { pageErrors: [...pageErrors] })
    await mockPage.close()
  } catch (error) {
    record('images:mock-error-recovery', 'error', error instanceof Error ? error.message : String(error))
  } finally {
    await mockContext.close()
  }
}

async function reducedMotionAndSemantics(browser) {
  const context = await newContext(browser, { width: 390, theme: 'dark' })
  try {
    const { page, pageErrors } = await openPage(context, '/currency', { mockCurrency: false })
    await routeCurrency(page, { delay: 1000 })
    await page.locator('main select').nth(1).selectOption('EUR')
    await page.getByRole('button', { name: 'Get reference rate' }).click()
    await page.locator('.spin').waitFor({ state: 'visible' })
    const reduced = await page.evaluate(() => {
      const control = document.querySelector('.control-input')
      const spinner = document.querySelector('.spin')
      return {
        media: matchMedia('(prefers-reduced-motion: reduce)').matches,
        scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
        transitionDuration: control ? getComputedStyle(control).transitionDuration : '',
        animationDuration: spinner ? getComputedStyle(spinner).animationDuration : '',
        animationIterationCount: spinner ? getComputedStyle(spinner).animationIterationCount : '',
      }
    })
    const reducedPass = reduced.media && reduced.scrollBehavior === 'auto' && maxCssDurationSeconds(reduced.transitionDuration) <= 0.001 && maxCssDurationSeconds(reduced.animationDuration) <= 0.001 && reduced.animationIterationCount === '1'
    record('motion:reduced-baseline', reducedPass ? 'pass' : 'fail', `Reduced media=${reduced.media}; scroll=${reduced.scrollBehavior}; transition=${reduced.transitionDuration}; active spinner animation=${reduced.animationDuration} × ${reduced.animationIterationCount}.`)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const afterMedia = await page.evaluate(() => {
      const control = document.querySelector('.control-input')
      const spinner = document.querySelector('.spin')
      return {
        media: matchMedia('(prefers-reduced-motion: reduce)').matches,
        transitionDuration: control ? getComputedStyle(control).transitionDuration : '',
        animationDuration: spinner ? getComputedStyle(spinner).animationDuration : '',
        animationIterationCount: spinner ? getComputedStyle(spinner).animationIterationCount : '',
      }
    })
    const motionChanged = !afterMedia.media && maxCssDurationSeconds(afterMedia.transitionDuration) > 0.001 && maxCssDurationSeconds(afterMedia.animationDuration) >= 0.9 && afterMedia.animationIterationCount === 'infinite'
    record('motion:preference-change', motionChanged ? 'pass' : 'fail', `emulateMedia now reduce=${afterMedia.media}; transition=${reduced.transitionDuration} → ${afterMedia.transitionDuration}; spinner=${reduced.animationDuration} × ${reduced.animationIterationCount} → ${afterMedia.animationDuration} × ${afterMedia.animationIterationCount}.`)
    await page.locator('.currency-result').waitFor({ state: 'visible', timeout: 5000 })
    const controlAudit = await page.evaluate(() => [...document.querySelectorAll('button')].map((button) => ({ text: (button.textContent || '').trim(), label: button.getAttribute('aria-label'), title: button.getAttribute('title') })).filter((button) => !button.text && !button.label))
    record('semantics:icon-buttons', controlAudit.length === 0 ? 'pass' : 'fail', controlAudit.length ? `Unlabelled button controls: ${JSON.stringify(controlAudit.slice(0, 5))}` : 'All textless buttons have an accessible label.')
    const inputs = await page.evaluate(() => [...document.querySelectorAll('input,textarea,select')].map((element) => ({ tag: element.tagName.toLowerCase(), name: element.getAttribute('name'), autocomplete: element.getAttribute('autocomplete'), labelled: Boolean(element.labels?.length), aria: element.getAttribute('aria-label') })))
    const missingNames = inputs.filter((input) => !input.name && !input.aria)
    if (missingNames.length) finding('form-field-metadata', 'P2', 'Form controls omit name/autocomplete metadata', `${missingNames.length} inputs/selects/textareas lack a name or aria label in the currency workflow; add stable names and appropriate autocomplete where applicable.`, { route: '/currency', controls: missingNames })
    const labelledCount = inputs.filter((input) => input.labelled || input.aria).length
    record('semantics:form-labels', labelledCount === inputs.length ? 'pass' : 'fail', `${labelledCount}/${inputs.length} controls have a label or aria-label.`)
    record('motion:page-errors', pageErrors.length ? 'fail' : 'pass', pageErrors.length ? `Motion checks produced browser errors: ${pageErrors.join('; ')}` : 'No uncaught browser page errors during motion checks.', { pageErrors: [...pageErrors] })
    await page.close()
  } catch (error) {
    record('reduced-motion-and-semantics', 'error', error instanceof Error ? error.message : String(error))
  } finally {
    await context.close()
  }
}

async function themeToggleChecks(browser) {
  const context = await newContext(browser, { width: 390, theme: 'dark' })
  try {
    const { page, pageErrors } = await openPage(context, '/')
    // The control cycles System → Light → Dark → System.
    const toggle = page.getByRole('button', { name: /^Theme: / })
    const initial = await page.evaluate(() => document.documentElement.className)
    await toggle.click()
    await page.waitForTimeout(120)
    const afterFirst = await page.evaluate(() => document.documentElement.className)
    await toggle.click()
    await page.waitForTimeout(120)
    const afterSecond = await page.evaluate(() => document.documentElement.className)
    await toggle.click()
    await page.waitForTimeout(120)
    const afterThird = await page.evaluate(() => document.documentElement.className)
    const thirdLabel = await toggle.getAttribute('aria-label')
    const togglePass = /\blight\b/.test(afterFirst) && /\bdark\b/.test(afterSecond) && /\bdark\b/.test(afterThird) && /^Theme: System/.test(thirdLabel || '') && pageErrors.length === 0
    record('theme:system-toggle', togglePass ? 'pass' : 'fail', `Initial=${initial || '(empty)'}, first click=${afterFirst || '(empty)'}, second click=${afterSecond || '(empty)'}, third click=${afterThird || '(empty)'} (${thirdLabel}), page errors=${pageErrors.length}.`)
    if (!togglePass) finding('theme-system-toggle', 'P1', 'Dark system theme does not toggle predictably', `Starting in dark system mode then clicking the theme control yielded ${afterFirst || '(empty)'} before the second click yielded ${afterSecond || '(empty)'}.`, { route: '/', width: 390, initial, afterFirst, afterSecond, pageErrors })
    await page.close()
  } catch (error) {
    record('theme:system-toggle', 'error', error instanceof Error ? error.message : String(error))
  } finally {
    await context.close()
  }
}

async function noJsChecks(browser) {
  for (const theme of themes) {
    for (const route of routes) {
      const context = await newContext(browser, { width: 390, theme, js: false })
      try {
        const { page } = await openPage(context, route.path, { mockCurrency: false })
        const metrics = await pageMetrics(page)
        record(`no-js:${route.name}:${theme}`, metrics.h1Count === 1 ? 'pass' : 'fail', `No-JS HTML rendered ${metrics.h1Count} h1 and ${metrics.focusableCount} focusable controls.`, { route: route.path, theme, metrics })
        if (route.name !== 'about' && metrics.focusableCount < 3) finding('no-js-workbench-controls', 'P2', 'No-JS route renders too little usable content', `${route.path} rendered only ${metrics.focusableCount} focusable controls without JavaScript.`, { route: route.path, theme, metrics })
        await page.close()
      } catch (error) {
        record(`no-js:${route.name}:${theme}`, 'error', error instanceof Error ? error.message : String(error), { route: route.path, theme })
      } finally {
        await context.close()
      }
    }
  }
}

async function writeReport() {
  await fs.mkdir(path.join(ARTIFACT_DIR, 'screenshots'), { recursive: true })
  const pass = results.checks.filter((check) => check.status === 'pass').length
  const fail = results.checks.filter((check) => check.status === 'fail').length
  const errors = results.checks.filter((check) => check.status === 'error').length
  const skipped = results.checks.filter((check) => check.status === 'skip').length
  results.summary = { pass, fail, errors, skipped, checks: results.checks.length, findings: results.findings.length, screenshots: results.screenshots.length + results.textResizeScreenshots.length + results.functionalScreenshots.length, matrixScreenshots: results.screenshots.length, textResizeScreenshots: results.textResizeScreenshots.length, functionalScreenshots: results.functionalScreenshots.length }
  await fs.writeFile(path.join(ARTIFACT_DIR, 'results.json'), JSON.stringify(results, null, 2))
  const findingLines = results.findings.length ? results.findings.map((item) => `- **${item.severity} ${item.id}: ${item.title}.** ${item.detail}`).join('\n') : '- No measured findings.'
  const failedChecks = results.checks.filter((check) => check.status === 'fail' || check.status === 'error').slice(0, 60).map((check) => `- **${check.status}** ${check.name}: ${check.detail}`).join('\n') || '- None.'
  const markdown = `# UI audit · 2026-10-04\n\nMeasured against **${BASE_URL}** with system Chrome through Playwright 1.63.0. The script did not start, stop, or rebuild the application server. The baseline matrix covers ${routes.length} routes × ${themes.length} themes × ${widths.length} viewport widths. Separate checks captured ${results.textResizeScreenshots.length} routes at 200% root font size and ${results.functionalScreenshots.length} interaction state(s); root font scaling is not browser zoom.\n\n## Results\n\n- Checks: ${results.summary.checks}\n- Passed: ${pass}\n- Failed: ${fail}\n- Errors: ${errors}\n- Skipped: ${skipped}\n- Screenshots: ${results.summary.screenshots} (${results.summary.matrixScreenshots} matrix, ${results.summary.textResizeScreenshots} text resize, ${results.summary.functionalScreenshots} interaction)\n- Findings: ${results.summary.findings}\n\n## Findings for design review\n\n${findingLines}\n\n## Failed or incomplete checks\n\n${failedChecks}\n\n## Limits\n\n${results.unverified.map((item) => `- ${item}`).join('\n')}\n\nMachine-readable evidence is in [results.json](./results.json); screenshots are in [screenshots](./screenshots).\n`
  await fs.writeFile(path.join(ARTIFACT_DIR, 'README.md'), markdown)
}

async function main() {
  if (!BASE_URL) throw new Error('Set BASE_URL to the running Universal Convertal web app; this audit has no localhost default.')
  await fs.mkdir(ARTIFACT_DIR, { recursive: true })
  await Promise.all(['light', 'dark', 'text-resize-200', 'functional'].map((folder) => fs.mkdir(path.join(ARTIFACT_DIR, 'screenshots', folder), { recursive: true })))
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--disable-gpu'] })
  try {
    await captureMatrix(browser)
    await captureTextResize(browser)
    await keyboardAndUnits(browser)
    await clipboardFailureCheck(browser)
    await developerChecks(browser)
    await currencyChecks(browser)
    await imageChecks(browser)
    await reducedMotionAndSemantics(browser)
    await themeToggleChecks(browser)
    await noJsChecks(browser)
  } finally {
    await browser.close()
  }
  await writeReport()
  const { pass, fail, errors, skipped, screenshots } = results.summary || {}
  console.log(JSON.stringify({ pass, fail, errors, skipped, screenshots, artifactDir: ARTIFACT_DIR }, null, 2))
  if (fail || errors) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
