# First-release verification

Checked 2026-10-03 in `D:\1_DEV\1_NEXT_JS\simple-units` after the workspace
migration. The repository is configured for Node.js 24 and pnpm 11.25.0. This
is the verified host and CI toolchain baseline; the lockfile was installed and
frozen-checked with that exact version.

## Resolved implementation baseline

`pnpm list --depth 0 -r` resolved these direct versions:

| Area | Resolved versions |
| --- | --- |
| Web | Next 16.3.8, React/ReactDOM 19.3.0, TypeScript 6.0.3, ESLint 9.39.5 |
| API | Fastify 5.12.5, `@fastify/cors` 11.3.0, `@fastify/multipart` 9.4.0, `@fastify/swagger` 9.9.1, Sharp 0.35.5 |
| Shared | Decimal.js 10.6.0, TypeBox 0.34.52, TypeScript 5.9.3 |
| Tooling | Turbo 2.11.7, tsx 4.23.15, pnpm manifest pin 11.25.0 |

The registry research table in [architecture.md](architecture.md) records the
current 2026 observations and alternatives. The lockfile, rather than a
floating `latest` tag, is the implementation source of truth.

## Baseline commands (2026-10-03)

All of these completed successfully:

- `pnpm install --frozen-lockfile`
- `pnpm run typecheck` — 4 workspace tasks
- `pnpm run lint` — no errors; one non-blocking Next warning remains for the
  intentional raw image preview tag
- `pnpm run test` — 23 tests passed across conversion and API suites
- `$env:CONVERTAL_API_URL='http://127.0.0.2:48787'; pnpm run build` (PowerShell)
  — serialized Turbo build passed for contracts, conversion, API, and web; the
  web package hashes this build-time rewrite input through its package-local
  Turbo configuration
- `pnpm audit --prod` — no known production dependency vulnerabilities in the
  2026-10-03 registry advisory response
- `git diff --check`

The historical migration-day `pnpm --filter @universal-convertal/web qa:browser`
run passed against the
production preview with system Chrome. The run covered 320/390/768/1440px
layouts, no horizontal overflow, skip-link focus, Ctrl/Cmd+K search focus,
light/dark contrast assertions, reduced motion, history persistence, malformed
developer input, live and mocked currency quote loading (including stale
response rejection when the selected pair changes), Decimal amount validation,
same-origin Sharp image upload and download, invalid image feedback, and
back/forward navigation. Screenshots and the runner note are in
[artifacts](artifacts/).

## Historical production smoke (2026-10-03)

This temporary smoke run predates the final isolated build and preview below.

- API started with `node dist/server.js` after the workspace build and answered
  `GET /healthz`, `GET /v1/units` (73 units across 12 dimensions), and `POST /v1/convert` on an
  isolated local port (`127.0.0.2:48787`). This exercises the built
  `@simple-units/conversion` and `@universal-convertal/contracts` package
  exports, rather than the `tsx` source runner.
- Web started with `next start -p 43211` and returned `200` for `/` and
  `/currency` on `127.0.0.2:43211`; the generated HTML contained the expected
  Universal Convertal route shell.
- The same-origin rewrite was exercised with `POST
  http://127.0.0.2:43211/api/v1/convert`; Next forwarded it to the API and
  returned the expected `1 meter → 100 centimeter` JSON response.
- That preview was available at [web](http://127.0.0.2:43211), with the API
  at [health](http://127.0.0.2:48787/healthz). The host's shared `127.0.0.1`
  ports 3001/4100 were already owned by a VS Code process, so they were not
  used as evidence for this smoke check.

## Interactive development smoke (2026-10-04)

The exact user pnpm executable (`C:\Users\Jecft\AppData\Roaming\npm\pnpm.cmd`,
11.25.0) was run from an attached PowerShell terminal with `pnpm dev`. The
previous Turbo console crash (`0xC0000409`) did not recur: the Node supervisor
started the same four-package graph and streamed the task output. An unrelated
process already owned `127.0.0.1:8787`, so the runner selected
`http://127.0.0.2:8787` and printed that choice. The following requests returned
successfully:

- `GET http://127.0.0.1:3000/` — 200;
- `GET http://127.0.0.2:8787/healthz` — 200 with `{"status":"ok"}`;
- `POST http://127.0.0.1:3000/api/v1/convert` for `1 m → cm` — 200 with `100`.

Ctrl+C followed by the Windows batch termination prompt stopped the owned web
and API watchers. A listener check afterwards showed only the pre-existing
process on `127.0.0.1:8787`; the runner did not stop that unrelated process.
Focused web commands still use Next's environment files; the API start command
receives its process environment explicitly. The raw
`pnpm run dev:turbo` command remains available for Turbo diagnostics, while
`pnpm dev` is the supported root entrypoint on Windows.

## Correctness and safety coverage

The conversion suite covers decimal factors, typed dimensions, volume's exact
litre/cubic-metre relationship, affine temperature boundaries and round trips,
case-sensitive `b`/`B` data symbols, malformed values, compound dimensions,
and bounded developer transforms. API tests cover stable errors, provider
freshness metadata, provider response/time limits, quote caching, multipart
image conversion, malformed JSON/media, byte limits, decoded-pixel limits,
and real output artifacts.

The first image path is synchronous and bounded: one multipart file, byte and
pixel limits, allowlisted formats, multi-page rejection, output-size limits,
an operation timeout, and a two-request process-local concurrency cap. A queue,
object storage, and larger server-side jobs remain outside this release.

## Baseline verification limits (2026-10-03)

The browser run used system Chrome because downloading a Playwright-managed
Chromium binary timed out; the committed runner remains reproducible when a
compatible Chrome executable is available. Screen-reader semantics, a full
WCAG audit, 200% zoom, field performance percentiles, production load/memory
isolation, and a published deployment were not measured. Live provider
availability and quotas can change after this point-in-time audit.

## Final production UI integration audit (2026-10-04)

The final frozen production web build used `NEXT_DIST_DIR=.next-audit-final` and
`CONVERTAL_API_URL=http://127.0.0.3:48789` with
`pnpm exec turbo run build --concurrency=1 --force`. The build passed for all
four workspace tasks. The generated Next build is
`apps/web/.next-audit-final`, build ID `oc7WH7RDYukmS7iIwKtx4`. The production
web server at `http://127.0.0.1:3000` served this output for UI and performance
checks. Its API rewrite pointed at the local `tsx watch` API on
`127.0.0.3:48789`; the browser audit's image conversions therefore exercised
that source-runner API through the production web rewrite.

Final workspace checks completed successfully:

- `pnpm install --frozen-lockfile`
- `pnpm run typecheck` — four workspace tasks
- `pnpm run lint` — no errors; one non-blocking Next warning remains for the
  intentional raw image preview element
- `pnpm run test` — 23 tests passed
- Forced serialized production build above — four workspace tasks passed

The separate built API smoke used Node 24 to run `node apps/api/dist/server.js`
at `127.0.0.3:48790`. `GET /healthz` returned 200, `GET /v1/units` returned 73
units, and `POST /v1/convert` returned the expected `1 meter → 100 centimeter`
result. A synthetic 1×1 PNG multipart request returned a 44-byte WebP with a
valid RIFF signature. This validates the built API path separately from the
browser audit's `tsx` API target.

The final [`qa:ui` report](../audit-2026-10-04/final/README.md) covers five
routes, two themes, and 320/390/768/1440px widths: 343 checks, 335 passed, eight
skipped, zero failed, zero errors, and 46 screenshots. The eight skips are
shared-footer assertions on standalone `/about`; one P2 finding remains
because `/about` omits the shared skip link, navigation, theme control, and
footer. Five 390px root-font-size checks changed 16px to 32px without document
overflow; this is a text-resize proxy, not a browser-zoom measurement. The
full machine-readable evidence is in
[`results.json`](../audit-2026-10-04/final/results.json). No live currency
provider was called; currency behavior used deterministic route mocks.

The one final local performance scan ran on the production web preview after
the UI browser closed. Headless Chrome used loopback without CPU or network
throttling, one new context per route/viewport, and a 1500ms observation
window. At 390×900, the four routes measured FCP/LCP 240–508ms, CLS 0, and TTFB
6.0–6.7ms. At 1440×900 they measured FCP/LCP 280–316ms, CLS 0, and TTFB
5.4–6.4ms. Raw samples are in
[`performance-final.json`](artifacts/audit-final-2026-10-04/performance-final.json).
These are local lab diagnostics, not field percentiles; INP and p75 field
performance were not measured. The prior `performance.json` is baseline data,
not the final scan.

Firefox/WebKit, actual 200% browser zoom, screen-reader behavior, complete
WCAG 2.2 conformance, field performance, sustained load/memory behavior, CDN
behavior, and a deployed service remain unverified. See the
[central audit report](audit-2026-10-04.md) for conditions, findings, and
primary references.
