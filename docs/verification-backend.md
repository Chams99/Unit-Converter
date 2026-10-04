# Backend verification

Verification date: 2026-10-03. This review covered `packages/conversion`, `packages/contracts`, and `apps/api` after checking the implementation against [conversion-engine research](./research/conversion-engines.md). The workspace used Node `v24.11.1` and the pinned, runnable pnpm `v11.25.0`.

## Commands run

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed: all five workspace projects already up to date. |
| `pnpm exec turbo run test typecheck build --filter=@simple-units/conversion` | Passed: 3/3 tasks; 9/9 Node tests; package typecheck and build passed. |
| `pnpm exec turbo run test typecheck build --filter=@universal-convertal/api` | Passed: 5/5 tasks; 14/14 Node tests; API typecheck and build passed. |
| `pnpm exec turbo run typecheck build --filter=@universal-convertal/contracts` | Passed: 2/2 tasks. |
| `pnpm --filter @universal-convertal/api lint` | Passed: ESLint completed with no diagnostics. |
| `node --input-type=module -e "import('./apps/api/dist/app.js').then(async ({buildApp})=>{const app=await buildApp(); const health=await app.inject({method:'GET',url:'/healthz'}); const media=await app.inject({method:'POST',url:'/v1/convert',headers:{'content-type':'text/plain'},payload:'value'}); console.log(JSON.stringify({health:[health.statusCode,health.body],unsupportedMedia:[media.statusCode,media.body]})); await app.close()})"` | Passed: liveness returned 200; non-JSON conversion returned 415 with the stable `invalid_request` envelope. |

The conversion regression cases cover `m³`/liter through the curated cubic-meter alias, the raw `parseUnitExpression('m^3')` length vector, `kg*m/s²` dimensional scale, B/bit/kB aliases, data-versus-time rejection, `0 °C = 273.15 K`, `0 K = -273.15 °C`, absolute-zero bounds, decimal limits, and malformed compound terms. The compound parser is intentionally bounded and does not claim complete UCUM conformance or automatically map every derived vector to a named unit.

Currency tests cover Frankfurter TND normalization, currencyapi freshness metadata, 429 mapping, bounded streamed responses, request timeouts, canonical source dates, malformed provider data, and the short-lived in-process cache. A stale or missing provider timestamp is surfaced through the `stale` field; provider failures return stable unavailable/rate-limited/invalid-response errors and are not silently substituted with an old quote. An integrator runtime smoke also observed a valid USD/TND quote from the configured Frankfurter v2 route; the deterministic tests use mocks and do not depend on that live response.

Image tests cover an actual PNG-to-WebP artifact, input-byte limits, decoded-pixel limits, encoded-output limits, multiple-file rejection, and API multipart responses. The route accepts uploaded bytes only, with `file`, `outputFormat`, `width`, `height`, and `quality` fields. It returns raw image bytes and `Content-Type`, `Content-Disposition`, `Content-Length`, and `X-Image-*` headers. Input/pixel/output limit errors map to 413; unsupported formats and invalid options map to 422; busy image requests map to 429; malformed JSON maps to 400; non-JSON conversion requests map to 415. No arbitrary URL fetch is accepted. A two-request process-local cap keeps Sharp work bounded; larger scale remains a worker concern.

The web image screen defaults to the Sharp route, sends `FormData`, and reads
the binary response with `response.blob()`. Browser Canvas remains an explicit
local fallback. The current currency screen expects the normalized
`/v1/currency/rates?base=...&quote=...` response fields `rate`, `provider`,
`sourceTimestamp`, `fetchedAt`, and `stale`.

## Unverified or intentionally deferred

- The central [verification report](./research/verification.md) records the
  completed system-Chrome browser run. Screen-reader semantics, a full WCAG
  audit, 200% zoom, and field performance percentiles remain unmeasured.
- No production deployment, load test, p75 latency measurement, concurrency test, or memory/CPU isolation test was run. Sharp is bounded and synchronous in the API process; a disposable worker remains the roadmap boundary for larger or hostile workloads.
- Live provider availability, quotas, licensing terms, and network failure behavior can change. Provider tests use local mocks; the live USD/TND smoke was an integration observation, not a repeatable test fixture.
- The registry does not claim full UCUM coverage, Newton/derived-unit name resolution, data-rate units, PDF/Office/media/archive conversion, OCR, or remote-URL conversion. Those capabilities remain documented roadmap items.

`pnpm audit --prod` reported no known vulnerabilities on 2026-10-03. This is a
point-in-time registry advisory result, not a substitute for repeating the
audit in CI or before deployment.
