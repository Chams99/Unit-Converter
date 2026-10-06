// Captures the unit workspace from a running build and composes the social
// preview (app/opengraph-image.png) and 16:9 portfolio covers (docs/portfolio).
// Rebuild the web app after running this so Next.js serves the new preview.
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const WEB_DIR = path.resolve(SCRIPT_DIR, '..')
const REPO_ROOT = path.resolve(WEB_DIR, '../..')

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3230'
const COVER_DIR = path.resolve(process.env.COVER_DIR || path.join(REPO_ROOT, 'docs/portfolio'))
const OG_IMAGE = path.join(WEB_DIR, 'app/opengraph-image.png')
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const SITE_LABEL = process.env.COVER_SITE_LABEL || 'units.chames.tn'

// A recognizable conversion with an exact decimal result: marathon distance.
const showcase = { category: 'length', from: 'mile', to: 'kilometer', amount: '26.2' }
// At 700px the panel keeps two columns while its text stays large relative to its width.
const CAPTURE_WIDTH = 700

const browser = await chromium.launch({ headless: true, executablePath: CHROME })

async function capturePanel(theme) {
  const context = await browser.newContext({ viewport: { width: CAPTURE_WIDTH, height: 1100 }, deviceScaleFactor: 2, colorScheme: theme, reducedMotion: 'reduce' })
  // The unit tool is local; blocking the API keeps the capture deterministic.
  await context.route('**/api/**', (route) => route.abort())
  const page = await context.newPage()
  await page.goto(`${BASE_URL}/?${new URLSearchParams(showcase)}`, { waitUntil: 'networkidle' })
  await page.locator('.result-ready').waitFor()
  await page.evaluate(() => document.fonts.ready)
  const shot = await page.locator('.unit-panel').screenshot({ animations: 'disabled' })
  await context.close()
  return shot.toString('base64')
}

const coverCss = `
  html, body { overflow: hidden !important; }
  .cover { position: fixed; inset: 0; z-index: 2147483647; display: grid; grid-template-columns: 31rem minmax(0, 1fr); overflow: hidden;
    background: radial-gradient(60rem 40rem at 105% 110%, hsl(var(--primary) / 0.16), transparent 60%), radial-gradient(40rem 30rem at -10% -20%, hsl(var(--primary) / 0.12), transparent 60%), hsl(var(--background));
    color: hsl(var(--foreground)); font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif; }
  .cover-copy { display: flex; flex-direction: column; padding: 4rem 0 3.5rem 4rem; }
  .cover-mark { display: grid; width: 3.5rem; height: 3.5rem; place-items: center; border-radius: 0.9rem; background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); font-size: 1.25rem; font-weight: 800; letter-spacing: -0.06em; }
  .cover-copy h1 { margin: 2.25rem 0 0; font-size: 4.25rem; font-weight: 700; line-height: 0.98; letter-spacing: -0.045em; }
  .cover-copy p { max-width: 25rem; margin: 1.4rem 0 0; color: hsl(var(--muted-foreground)); font-size: 1.75rem; line-height: 1.28; letter-spacing: -0.015em; }
  .cover-site { margin-top: auto; color: hsl(var(--muted-foreground)); font-size: 1.25rem; font-weight: 600; }
  .cover-shot { display: flex; align-items: center; padding: 3rem 4rem 3rem 0.5rem; }
  .cover-shot img { width: 100%; border-radius: 0.85rem; box-shadow: 0 2rem 5rem rgb(0 0 0 / 0.35), 0 0 0 1px hsl(var(--border)); }
`

const coverMarkup = (panel) => `
  <div class="cover-copy">
    <span class="cover-mark">UC</span>
    <h1>Universal Convertal</h1>
    <p>Precise conversions for units, currency, code, and images.</p>
    <span class="cover-site">${SITE_LABEL}</span>
  </div>
  <div class="cover-shot"><img alt="" src="data:image/png;base64,${panel}"></div>
`

async function compose(panel, theme, { width, height, scale, file }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, colorScheme: theme, reducedMotion: 'reduce' })
  await context.route('**/api/**', (route) => route.abort())
  const page = await context.newPage()
  // Draw over a real route so the cover uses the app's self-hosted fonts and theme tokens.
  await page.goto(`${BASE_URL}/about`, { waitUntil: 'networkidle' })
  await page.evaluate(({ css, markup }) => {
    const style = document.createElement('style')
    style.textContent = css
    document.head.append(style)
    const cover = document.createElement('div')
    cover.className = 'cover'
    cover.innerHTML = markup
    document.body.append(cover)
  }, { css: coverCss, markup: coverMarkup(panel) })
  await page.locator('.cover-shot img').evaluate((image) => image.decode())
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: file, animations: 'disabled' })
  await context.close()
  console.log(`wrote ${path.relative(REPO_ROOT, file)} (${width * scale}x${height * scale})`)
}

try {
  await mkdir(COVER_DIR, { recursive: true })
  for (const theme of ['dark', 'light']) {
    const panel = await capturePanel(theme)
    await compose(panel, theme, { width: 1200, height: 675, scale: 2, file: path.join(COVER_DIR, `cover-${theme}.png`) })
    if (theme === 'dark') await compose(panel, theme, { width: 1200, height: 630, scale: 1, file: OG_IMAGE })
  }
} finally {
  await browser.close()
}
