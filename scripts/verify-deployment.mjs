import assert from 'node:assert/strict'

const baseUrl = new URL(process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000')
const timeoutMs = 10_000

function appUrl(path) {
  return new URL(path, baseUrl)
}

async function fetchApp(path, options = {}) {
  return fetch(appUrl(path), {
    ...options,
    redirect: 'manual',
    signal: AbortSignal.timeout(options.timeoutMs ?? timeoutMs),
  })
}

function expectStatus(response, expected, description) {
  assert.equal(response.status, expected, `${description}: expected HTTP ${expected}, received ${response.status}`)
}

function visibleText(markup) {
  return markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([\da-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/\s+/g, ' ')
    .trim()
}

console.log(`Checking production deployment at ${baseUrl.origin}`)

const routes = [
  ['/', 'Convert with confidence'],
  ['/currency', 'Currency, with context'],
  ['/developer', 'Small tools, clear output'],
  ['/images', 'Convert images with control'],
  ['/about', 'Tools with visible boundaries.'],
]

let homeMarkup
for (const [path, heading] of routes) {
  const response = await fetchApp(path)
  expectStatus(response, 200, `GET ${path}`)
  const markup = await response.text()
  const h1s = [...markup.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)]
    .map((match) => visibleText(match[1]))
  assert.ok(h1s.includes(heading), `GET ${path}: expected an h1 named "${heading}", found ${JSON.stringify(h1s)}`)
  if (path === '/') homeMarkup = markup
  console.log(`  OK ${path} · ${heading}`)
}

const iconResponse = await fetchApp('/icon.svg')
expectStatus(iconResponse, 200, 'GET /icon.svg')
assert.match(iconResponse.headers.get('content-type') ?? '', /image\/svg\+xml/i, 'GET /icon.svg: expected an SVG content type')
assert.ok((await iconResponse.arrayBuffer()).byteLength > 0, 'GET /icon.svg: asset was empty')
console.log('  OK /icon.svg · public asset')

const bundlePaths = [...homeMarkup.matchAll(/(?:src|href)="([^"]*\/_next\/static\/[^"]+\.js(?:\?[^"]*)?)"/g)]
  .map((match) => match[1].replaceAll('&amp;', '&'))
const bundlePath = bundlePaths.find((candidate) => candidate.startsWith('/'))
assert.ok(bundlePath, 'Home page did not reference a Next.js JavaScript bundle')
const bundleResponse = await fetchApp(bundlePath)
expectStatus(bundleResponse, 200, `GET ${bundlePath}`)
assert.ok((await bundleResponse.arrayBuffer()).byteLength > 0, `GET ${bundlePath}: bundle was empty`)
console.log(`  OK ${bundlePath} · production bundle`)

const healthResponse = await fetchApp('/api/healthz')
expectStatus(healthResponse, 200, 'GET /api/healthz')
const health = await healthResponse.json()
assert.equal(health.status, 'ok', 'GET /api/healthz: unexpected health response')
console.log('  OK /api/healthz')

const readinessResponse = await fetchApp('/api/readyz')
expectStatus(readinessResponse, 200, 'GET /api/readyz')
const readiness = await readinessResponse.json()
assert.equal(readiness.status, 'ok', 'GET /api/readyz: unexpected readiness response')
console.log('  OK /api/readyz')

const catalogResponse = await fetchApp('/api/v1/units')
expectStatus(catalogResponse, 200, 'GET /api/v1/units')
const catalog = await catalogResponse.json()
assert.ok(Array.isArray(catalog.units), 'GET /api/v1/units: expected a units array')
assert.equal(catalog.units.length, 73, `GET /api/v1/units: expected 73 units, received ${catalog.units.length}`)
console.log('  OK /api/v1/units · 73 units')

const conversionResponse = await fetchApp('/api/v1/convert', {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json' },
  body: JSON.stringify({ value: '1', from: 'meter', to: 'centimeter' }),
})
expectStatus(conversionResponse, 200, 'POST /api/v1/convert')
const conversion = await conversionResponse.json()
assert.ok(Number.isFinite(Number(conversion.value)), 'POST /api/v1/convert: result was not numeric')
assert.ok(Math.abs(Number(conversion.value) - 100) < 1e-10, `POST /api/v1/convert: expected 100 cm, received ${conversion.value}`)
assert.equal(conversion.from.id, 'meter', 'POST /api/v1/convert: wrong source unit')
assert.equal(conversion.to.id, 'centimeter', 'POST /api/v1/convert: wrong target unit')
console.log('  OK /api/v1/convert · 1 m = 100 cm')

const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
const imageForm = new FormData()
imageForm.set('outputFormat', 'webp')
imageForm.set('file', new Blob([image], { type: 'image/png' }), 'pixel.png')
const imageResponse = await fetchApp('/api/v1/image/convert', {
  method: 'POST',
  headers: { accept: 'image/webp, application/json' },
  body: imageForm,
})
expectStatus(imageResponse, 200, 'POST /api/v1/image/convert')
assert.match(imageResponse.headers.get('content-type') ?? '', /^image\/webp(?:\s*;|$)/i, 'POST /api/v1/image/convert: expected WebP output')
assert.equal(imageResponse.headers.get('x-image-width'), '1', 'POST /api/v1/image/convert: expected width 1')
assert.equal(imageResponse.headers.get('x-image-height'), '1', 'POST /api/v1/image/convert: expected height 1')
const imageOutput = Buffer.from(await imageResponse.arrayBuffer())
assert.equal(imageOutput.toString('ascii', 0, 4), 'RIFF', 'POST /api/v1/image/convert: missing RIFF signature')
assert.equal(imageOutput.toString('ascii', 8, 12), 'WEBP', 'POST /api/v1/image/convert: missing WEBP signature')
console.log('  OK /api/v1/image/convert · 1×1 PNG to WebP')

console.log('Production deployment smoke check passed.')
