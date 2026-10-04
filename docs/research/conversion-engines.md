# Universal converter research and capability plan

Research date: 2026-10-03 (web sources accessed 2026-10-03). This document is a bounded implementation plan for the current Next.js/TypeScript app. It separates deterministic local work from data that needs a provider or an isolated worker. It does not promise that every format, market, or measurement convention has one universally correct answer.

## Decision summary

The first release can be reliable without a paid conversion service:

1. Keep unit arithmetic in a small, dependency-light shared TypeScript package. Store units as a dimension vector plus a multiplicative factor and optional affine offset. Parse numeric input from strings and calculate with decimal arithmetic or an explicitly documented precision policy. Reject incompatible dimensions and temperatures below absolute zero.
2. Run the unit API on the server by reusing that package, while the browser calls the same core for instant feedback. The API should return a stable unit identifier, dimension, value, precision, and error code; it must not duplicate conversion tables.
3. Make currency an adapter. Use Frankfurter v2 as the no-key baseline and add a currencyapi adapter when a server key is configured. Frankfurter must be queried at runtime for the requested pair; the v2 `USD/TND` route has now returned a schema-valid quote in the production smoke check on 2026-10-03, while the smaller v1 currency list does not include TND. Coverage remains a runtime provider fact. currencyapi remains the stronger configured option when its published `TND` list and `meta.last_updated_at` metadata are required. Cache a provider response with its provider name, source timestamp, retrieval timestamp, base, and staleness threshold. Do not label a cached value “live”.
4. Ship deterministic developer transforms locally: URL encode/decode, Base64 encode/decode, JSON pretty/minify, hash/UUID helpers where semantics are clear, and text escape/unescape. Reject malformed input with a typed error. Do not call arbitrary remote URLs.
5. Ship image conversion only after a server or worker runtime is selected. Sharp/libvips is a sensible first implementation for raster images; validate bytes and decoded dimensions, set a pixel limit, stream/limit input, and return an artifact. Do not expose ImageMagick or a shell command to the request path.

PDF/office conversion, audio/video, archives, OCR, and remote URL conversion are roadmap capabilities. They need resource limits, isolation, format-specific security review, and usually a job queue. Do not present them as supported merely because a binary exists.

## Implemented first-release boundary

The current implementation follows the first-release choices above. `packages/conversion` is the browser/server pure core; `packages/contracts` owns TypeBox transport schemas; and `apps/api` exposes the catalog, conversion, currency, health, readiness, and bounded image routes. The image route accepts uploaded bytes only and uses Sharp in the trusted API process with byte, decoded-pixel, output-byte, dimension, quality, and operation-time limits. A future worker remains the isolation path for larger or hostile workloads. Currency responses include the provider, pair, source timestamp when supplied, retrieval timestamp, stale flag, and staleness threshold; a short in-process cache avoids provider calls for every repeated request but is not durable fallback storage.

## Capability matrix

| Capability | First-release status | Execution boundary | Recommended implementation | Source of truth / caveat |
|---|---|---|---|---|
| SI and common length, area, volume, mass, time, speed, pressure, energy, power, angle, data units | Implement locally | Browser and server shared package | Typed registry with dimension vectors; exact rational/decimal factors where practical | SI definitions and conversion factors must be traced to NIST SP 811/SP 330. Unit labels and aliases are product data, not proof of equivalence. |
| Affine temperature (°C, °F, K) | Implement locally | Browser and server shared package | `base = (x + offset) * scale`; validate K/°C/°F absolute-zero constraints before converting | Affine units cannot use a single multiplicative factor. Reject values below absolute zero unless an explicit delta-temperature mode is selected. |
| Compound units (`m/s`, `kg·m/s²`) | Implement in core phase 1 if parser scope is bounded | Browser and server shared package | UCUM-shaped parser or a curated grammar; multiply/divide dimension vectors and factors | UCUM grammar is designed for unambiguous machine communication and defines valid expressions; do not claim complete UCUM conformance until conformance tests exist. |
| Precision and formatting | Implement locally | Shared package | Parse strings, calculate in decimal/rational representation, format separately from calculation | JavaScript `Number` can silently lose significant digits. `decimal.js` documents string input and configurable significant-digit rounding; if adopted, record its MIT license. |
| Currency, including TND | Implement as provider adapter | Server only; browser receives normalized result | Frankfurter v2 no-key adapter by default; currencyapi adapter with server-held key when configured; cache + freshness metadata | Frankfurter v2 is a no-key baseline with provider attribution and daily/official-source caveats; query the exact pair and fail closed if it is unavailable. currencyapi docs list TND, expose `/v3/latest`, and return `last_updated_at`. Free-plan cadence is documented as daily while larger plans can update more frequently; do not assume minute-level freshness. |
| Offline currency fallback | Optional explicit fallback | Server/local static data | Bundled snapshot only with snapshot date/provider; label as stale/offline | Never silently substitute a stale FX rate for a live rate. A provider outage should produce “unavailable” or an explicitly selected cached result. |
| URL encode/decode, Base64, JSON, text escapes, hash/UUID helpers | Implement locally | Browser and server shared package | Web Platform APIs plus strict parser/error mapping; Node `crypto` only on server where needed | Deterministic transforms should not be outsourced to an API. Define UTF-8 and URL component semantics in tests. |
| Image metadata/resize/format conversion (JPEG, PNG, WebP, AVIF, TIFF; selected GIF handling) | Implement only with a Node worker/runtime in first release | Isolated server worker or trusted server process | Sharp/libvips; decode metadata first; enforce bytes, decoded pixels, output bytes, dimensions, and operation timeout | Sharp documents supported formats, `metadata()`, and `limitInputPixels`; output formats are not identical across builds. Preserve or strip metadata intentionally and return the actual output MIME/type. |
| PDF structural operations (merge, split, rotate, linearize) | Roadmap | Isolated worker | qpdf (Apache-2.0) or a PDF library; separate from rendering | qpdf is a content-preserving transformer, not a general Office renderer. Test encrypted, malformed, huge, and object-heavy PDFs. |
| PDF/Office to PDF | Roadmap | Sandboxed Gotenberg/LibreOffice service | Gotenberg HTTP API wrapping LibreOffice/Chromium; allow only fixed local file inputs in the first version | Gotenberg exposes LibreOffice routes for Office/OpenDocument and Chromium routes for HTML. Its URL route creates an SSRF boundary and must remain disabled until URL pinning/allowlisting is designed. |
| DOCX/OOXML text or spreadsheet transforms | Roadmap | Sandboxed worker or narrow local library | Prefer narrow deterministic transforms first; use LibreOffice only for rendering/conversion | OOXML may contain external relationships, macros, formulas, and embedded content. Never execute macros; inspect relationships and cap expanded output. |
| Audio/video transcode, trim, thumbnails | Roadmap | Sandboxed FFmpeg worker | FFmpeg binary with an allowlisted argument builder; no user-supplied flags | FFmpeg core is LGPL with optional GPL parts; enabling GPL codecs/filters changes obligations. Verify the exact build and publish notices/source obligations for what is shipped. |
| Browser media fallback | Roadmap/optional | User device | ffmpeg.wasm only for explicitly supported small files | Browser CPU/memory limits and package licensing/build provenance vary; the current `@ffmpeg/core` package metadata declares GPL-2.0-or-later. Treat it as a separate legal/runtime choice. |
| ZIP/TAR/GZIP/7z archive listing/extract/create | Roadmap | Sandboxed worker | libarchive for broad BSD-licensed coverage; 7-Zip/LZMA SDK only after license review | Archives are a decompression-bomb and path traversal boundary. Enforce compressed bytes, expanded bytes, entry count, nesting, path normalization, symlink policy, and CPU/time limits. libarchive documents streaming and broad format support under a New BSD license; 7-Zip includes LGPL/BSD and an unRAR restriction. |
| OCR and document text extraction | Roadmap | Isolated worker | Dedicated OCR/parser service selected per language and format | Treat extracted text as untrusted input. XML, PDF, and Office parsers require external entity/network controls and quotas. |
| Convert by remote URL | Out of first release | N/A until explicit safe-fetch subsystem | None initially | Arbitrary URL fetching creates SSRF, DNS rebinding, redirect, credential, and large-response risks. If added later, allowlist destinations, pin DNS/IP, restrict schemes/ports, cap redirects/body/time, and revalidate every hop. |

## Unit model and correctness

NIST’s Guide to the SI defines SI base units and publishes conversion-factor guidance. Its notes distinguish exact factors from rounded factors and warn that the precision of a conversion should match the unit’s warranted accuracy. Use NIST as the authority for SI-derived factors, then document customary/industry definitions where more than one convention exists (US liquid gallon versus Imperial gallon, international foot versus survey foot, therm definitions, and so on).

UCUM is a useful interchange model. Its specification says that unit expressions have precisely defined semantics and that a compact grammar generates compound units. It also states that the terminal-unit table is fixed per revision. A product-facing registry can use friendly labels and aliases while storing a canonical code and dimension vector. A full UCUM parser is a separate milestone; do not call a curated registry “UCUM-compliant”.

The current compound parser returns a bounded expression’s dimension and scale; it is not a general expression input to `convertValue`. The curated registry keeps `volume` as a product dimension, so the registered `m³`/`m^3` cubic-meter alias converts to liters, while `parseUnitExpression('m^3')` intentionally reports the raw `{ length: 3 }` vector. Likewise, `kg*m/s^2` reports `{ mass: 1, length: 1, time: -2 }`; there is no Newton registry entry in this release, so it must not be presented as a named-unit conversion. Data support currently covers storage units only; bits-per-second and other data-rate dimensions are not claimed.

Represent a unit as:

```ts
type Dimension = Readonly<Record<string, number>>;

type UnitDefinition = {
  id: string;
  dimension: Dimension;
  scale: string;       // decimal/rational string to canonical base
  offset?: string;     // affine units only; canonical = (value + offset) * scale
  aliases: readonly string[];
  kind: 'absolute' | 'delta';
};
```

The arithmetic path is `input -> parsed decimal -> canonical value -> target unit -> formatted string`. Formatting must never be fed back into arithmetic. Affine units use a dedicated branch, and delta temperatures use scale-only conversion. Check the input against the absolute-zero bound in the source unit before applying the affine equation. Reject a temperature input such as `-1 K`, `-300 °C`, or `-500 °F` with a stable `below_absolute_zero` error.

Do not use falsy checks for factors (`0` is a valid offset or result). Reject unknown identifiers, non-finite values, empty numeric strings, incompatible dimensions, exponents outside the supported parser, and results that exceed a configured magnitude. Keep the API response explicit about the precision mode and rounding policy.

`decimal.js` is a practical optional dependency for a shared TypeScript package: it is dependency-free, includes TypeScript declarations, supports configurable significant-digit precision/rounding, and recommends passing long values as strings. A rational implementation can avoid a dependency for the finite registry, but decimal input and output still require a deliberate policy.

## Currency provider contract

The provider boundary should normalize all vendors to one internal shape:

```ts
type FxQuote = {
  provider: string;
  base: string;
  quote: string;
  rate: string;
  sourceTimestamp: string | null;
  fetchedAt: string;
  stale: boolean;
  staleAfterSeconds: number;
};
```

The backend must hold provider keys, request only the requested symbols, use an abort timeout, validate the JSON shape and numeric bounds, and cache by `(provider, base, quote, source date)`. Show provider, source timestamp/date, and “updated at” in the UI; preserve date-only provider precision instead of manufacturing an intraday time. A cache may serve during a transient failure only if the response says it is cached/stale; it must not silently become the new timestamp.

currencyapi’s published list includes both `TND` and its currency metadata, and its latest endpoint returns `meta.last_updated_at` plus rate values. The provider documentation says its free plan is updated daily and larger plans may update as often as every minute. Its quota documentation states that successful calls count toward monthly quotas and excessive use returns HTTP 429. These are provider terms as observed on the research date; keep the adapter configurable and do not hard-code a future plan or quota.

Frankfurter is the first-release no-key baseline: its v2 site documents official-source/provider attribution, historical data, and a public API without an API key. Its v1 currencies endpoint observed on 2026-10-03 listed 31 currencies and did not include TND, so v1 is not a TND promise. The current v2 `/rate/usd/tnd` route has returned a valid USD/TND quote in the production smoke check; the adapter still validates the exact requested response and refuses to expose a pair when the provider does not return it. Provider coverage and freshness are runtime facts, not marketing assumptions. currencyapi remains the configured-provider path when explicit published TND coverage and its `last_updated_at` metadata are required.

## Developer data tools

These tools are deterministic and should run in the shared package. Each operation gets a bounded input length and returns `{ ok: true, value }` or a stable error code. JSON parsing should reject trailing garbage; Base64 should specify standard versus URL-safe alphabet; URL decoding should report malformed percent escapes; hashing should restrict algorithms to an allowlist and never accept arbitrary OpenSSL names from a user. For browser use, prefer Web Crypto and native `TextEncoder`/`TextDecoder`; server-only cryptography stays in server modules.

## Image conversion boundary

Sharp uses libvips and supports metadata inspection without decoding all pixels. Its constructor documents `limitInputPixels` (with a default limit) and a `failOn` policy for malformed/truncated pixel data; output APIs document JPEG, PNG, WebP, AVIF, TIFF, GIF and raw output options. Set a lower product-specific pixel limit than the library default, validate content signatures instead of trusting the filename or `Content-Type`, disable unsafe SVG/external resource behavior where applicable, and cap input/output bytes. Measure decoded width × height and transformed output bytes before returning an artifact. Return a generated filename, MIME type, dimensions, byte size, and checksum; preserve metadata only when explicitly requested.

## PDF, office, and media options

Gotenberg provides a Docker API with Chromium and LibreOffice routes. Its LibreOffice route accepts Office/OpenDocument/plain-text formats and its Chromium URL route can fetch a page. The latter is a network boundary; a converter must use local uploaded files or a fixed allowlist and must not accept arbitrary user URLs. LibreOffice can process complex active content and linked resources, so run it in a disposable container with a read-only base filesystem, no secrets, no network by default, strict CPU/memory/time limits, and per-job temporary storage.

For PDF structural work, qpdf is Apache-2.0 and is a good narrow worker. It is not an Office renderer. For media, FFmpeg is the established engine, but the FFmpeg project says the main code is LGPL and optional components are GPL. A binary built with `--enable-gpl` or GPL libraries such as x264/x265 carries different distribution obligations. Keep the worker image and notices reproducible; avoid unreviewed “all codecs” images. ffmpeg.wasm is not a licensing shortcut: the published `@ffmpeg/core` package currently declares GPL-2.0-or-later and its upstream core repository history has licensing/build caveats.

For archives, libarchive offers broad read/write support, streaming, automatic format detection, and a New BSD license. 7-Zip offers broad 7z/ZIP/etc. support, but its official page calls out LGPL/BSD components and an unRAR restriction. Whichever path is selected, archive extraction must reject absolute paths, `..` traversal, unsafe symlinks/hardlinks, duplicate destinations, excessive entries, excessive expanded bytes, and excessive nesting. Apply limits to both compressed and expanded sizes; this is necessary even when the archive is uploaded by an authenticated user.

## Upload, worker, and provider safety requirements

OWASP’s File Upload guidance recommends an allowlist of required extensions, content/signature checks rather than trusting `Content-Type`, generated storage names, size and filename limits, storage outside the web root, malware/sandbox/CDR where appropriate, and defense against ZIP/XML bombs. Use an object key generated by the server, keep the original name as display metadata only, and serve results through an authorization check or short-lived signed download. For object storage, a presigned URL must be short-lived and scoped to one object/method; AWS documents that such URLs are bearer tokens and can be used repeatedly until expiry.

No first-release endpoint accepts a remote URL. If a remote-fetch feature is later approved, OWASP SSRF guidance requires an explicit destination allowlist, fixed scheme/port/path, DNS A/AAAA resolution and IP validation to address DNS pinning, redirect revalidation, blocked private/link-local/loopback/metadata ranges, body-size and response-time limits, and no ambient credentials. Resolve and connect through a controlled egress proxy where possible.

Every worker job needs an immutable operation allowlist, a generated job ID, idempotency behavior, maximum input and output bytes, decompressed/decoded limits, wall-clock deadline, CPU and memory budget, concurrent-job cap, cancellation/cleanup, bounded retries, and sanitized logs. Do not pass a user string to a shell; use `execFile` with fixed executable paths and argument arrays. For CPU-heavy work, BullMQ documents sandboxed processors in a separate process to keep event-loop bookkeeping responsive; this still is not a security boundary by itself, so container isolation and OS limits remain necessary.

Provider calls need an `AbortSignal` timeout, response-size cap, schema validation, 429/backoff handling, circuit breaking or stale-cache policy, and no provider key in browser code or logs. Return stable user-facing codes (`provider_unavailable`, `provider_rate_limited`, `provider_invalid_response`, `stale_rate`) rather than vendor internals.

## Release sequence

### Release 1: useful and honest

- Replace the current five hard-coded groups with the shared typed unit registry and arithmetic core.
- Cover a reviewed set of dimensions and aliases, including absolute/delta temperatures and absolute-zero tests.
- Expose one server unit-conversion route that delegates to the core; keep browser conversion instant with the same package.
- Add the no-key Frankfurter adapter and use the currencyapi adapter only when its server key is configured; include TND only after the selected adapter confirms it. Display source/fetched timestamps and stale state.
- Add deterministic developer transforms with bounded inputs and typed errors.
- Add image conversion only in a Node-capable deployment with Sharp and the limits above; otherwise keep the capability visibly unavailable rather than silently routing to a third party.
- Add tests for dimension mismatch, affine temperature, decimal boundaries, provider schema/staleness, malformed developer input, and image size/pixel limits. Use provider mocks; never send production API calls in tests.

### Broader roadmap

- Publish a versioned UCUM-compatible registry and conformance vectors; add derived/compound units and locale-aware labels.
- Add historical FX queries and explicit provider comparison; persist rate snapshots only with licensing/retention review.
- Move heavy image/PDF/office/media/archive work to a disposable worker service with object storage and signed artifact downloads. Add a queue only when job duration or scale makes request/response unsuitable; SQLite + in-process execution is enough for an initial single-instance deployment.
- Add qpdf structural PDF operations, then Gotenberg/LibreOffice rendering with network disabled by default.
- Add FFmpeg operations through an allowlisted worker image and publish exact build/license notices; evaluate ffmpeg.wasm separately.
- Add archive listing/extraction with libarchive, explicit expanded-size quotas, and symlink/path tests.
- Add OCR and specialized parsers only after language, privacy, and retention requirements are defined.

## Primary sources

- [NIST SP 811, Guide for the Use of the SI](https://www.nist.gov/pml/special-publication-811) and [SP 330, The International System of Units](https://www.nist.gov/pml/special-publication-330), accessed 2026-10-03.
- [UCUM specification](https://ucum.org/ucum), [UCUM release artifacts](https://ucum.org/docs/artifacts), and [UCUM license](https://ucum.org/license), accessed 2026-10-03.
- [decimal.js README and implementation notes](https://github.com/MikeMcl/decimal.js), accessed 2026-10-03.
- [Frankfurter API documentation](https://frankfurter.dev/) and [provider coverage](https://frankfurter.dev/providers/), accessed 2026-10-03; [observed v1 currency endpoint](https://api.frankfurter.dev/v1/currencies), accessed 2026-10-03; [v2 USD/TND rate route](https://api.frankfurter.dev/v2/rate/usd/tnd), smoke-checked 2026-10-03.
- [currencyapi currency list](https://currencyapi.com/docs/currency-list), [currencies endpoint](https://currencyapi.com/docs/currencies/), [latest rates](https://currencyapi.com/docs/latest/), and [rate limits/quotas](https://currencyapi.com/docs/rate-limit/), accessed 2026-10-03.
- [Sharp input metadata and limits](https://sharp.pixelplumbing.com/api-input/), [Sharp resize](https://sharp.pixelplumbing.com/api-resize/), and [Sharp output formats](https://sharp.pixelplumbing.com/api-output/), accessed 2026-10-03.
- [Gotenberg routes](https://gotenberg.dev/docs/getting-started/routes), [LibreOffice conversion](https://gotenberg.dev/docs/convert-with-libreoffice/convert-to-pdf), [Chromium URL conversion](https://gotenberg.dev/docs/convert-with-chromium/convert-url-to-pdf), and [configuration](https://gotenberg.dev/docs/configuration), accessed 2026-10-03.
- [qpdf repository/license](https://github.com/qpdf/qpdf), accessed 2026-10-03.
- [FFmpeg legal information](https://ffmpeg.org/legal.html), [FFmpeg license](https://www.ffmpeg.org/doxygen/3.4/md_LICENSE.html), and [ffmpeg.wasm core license/build options](https://github.com/ffmpegwasm/ffmpeg.wasm-core/blob/n4.3.1-wasm/LICENSE.md), accessed 2026-10-03.
- [libarchive official site](https://libarchive.org/), [7-Zip license and formats](https://www.7-zip.org/), and [7-Zip FAQ/license obligations](https://www.7-zip.org/faq.html), accessed 2026-10-03.
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html), [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html), accessed 2026-10-03.
- [AWS S3 presigned upload/download guidance](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html), accessed 2026-10-03.
- [BullMQ sandboxed processors](https://docs.bullmq.io/guide/workers/sandboxed-processors), accessed 2026-10-03.

