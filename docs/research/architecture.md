# Universal Convertal architecture research

**Research date:** 2026-10-03  
**Repository:** `D:\1_DEV\1_NEXT_JS\simple-units`  
**Status:** research decision and first-release implementation record; see the
verification report for the checked workspace and runtime evidence.

This document separates facts observed in the initial repository snapshot from
evidence, recommendations, and migration work. Versions below are observations
made on 2026-10-03 and must be rechecked before future dependency updates. The
initial snapshot contained no local `AGENTS.md` or `system design.md`; the
repository now has both normative files at the root.

Any proposed 2027 timing or compatibility horizon in planning notes is a
roadmap decision, not a verified future release schedule. Recheck primary
release sources before making version or deployment commitments.

## Executive decision and implemented shape

Keep React and move the existing Next.js application forward to the current supported App Router line, then place it in a pnpm/Turborepo workspace with a separate Node API. The selected first-release shape is:

```text
apps/
  web/       Next.js 16 + React 19, public UI and browser-local state
  api/       Fastify 5 on Node.js 24 LTS, versioned HTTP API, OpenAPI, and bounded Sharp conversion
packages/
  conversion/       `@simple-units/conversion`, pure unit, currency, developer-unit, and image metadata domain logic
  contracts/        TypeBox/JSON Schema contracts; generated client types later
```

Create `packages/ui`, `packages/config`, or `packages/test-fixtures` only when a second consumer makes the boundary real. The existing shadcn components can remain under `apps/web` until they are actually shared. Use **pnpm 11.25.0** as the one workspace package manager and **Turborepo 2** for task graph and cache orchestration. Run production JavaScript on **Node.js 24 LTS**. Bun remains an optional developer tool and compatibility target for experiments; it is not the production runtime or the second lockfile.

The API should not sit in the critical path for ordinary conversions. `packages/conversion` is deterministic and runs in the browser for instant feedback. The API is for shared catalogs, currency rates, external clients, bounded synchronous image conversion, and later persisted preferences or asynchronous jobs. Do not add PostgreSQL, Redis, or a queue to the first conversion screen merely because the repository is becoming a monorepo.

## Facts observed in the initial repository snapshot

The initial Git status was clean at commit `1453e35` (`Update .gitignore for Next.js and remove build files`). The recent history shows a Vite-to-Next migration (`200239f`) followed by the current Next.js implementation. There is one private package at the repository root, no `apps/` or `packages/` directory, no `turbo.json`, no `pnpm-workspace.yaml`, and no backend.

The current `package.json` declares Next `^14.2.0`, React `^18.3.1`, Tailwind `^3.4.17`, TypeScript `^5.8.3`, Bun's `bun.lockb`, and an npm `package-lock.json`. It also declares a large set of Radix primitives, React Query, React Hook Form, Recharts, and other UI dependencies. The only scripts are `dev`, `build`, `start`, and `lint`; `lint` still calls `next lint`.

`app/page.tsx` is a client component containing the complete page composition. `src/components/UnitConverter.tsx` uses a 300 ms debounce and client state. `src/lib/conversions.ts` contains five categories—length, volume, weight, energy, and temperature—with multiplicative rates plus special-case temperature formulas. History is in memory and capped at ten entries. The supported-units list in the page is duplicated from the conversion registry.

The current implementation has no currency, developer-unit, or image conversion model; no rate-provider adapter; no API contract; no persistence; no queue; no tests; and no error/observability boundary for a server. `components.json` points at `src/index.css`, which does not exist; the actual stylesheet is `app/globals.css`. The conversion code uses JavaScript `number` values, which is acceptable for many physical units but is not an adequate precision policy for currency amounts.

## Evidence and alternatives

### Frontend: Next.js versus Vite/TanStack Start

| Option | Evidence and fit | Decision |
| --- | --- | --- |
| Next.js 16 App Router | The official installation guide supports Node 20.9+, App Router, TypeScript, Tailwind, ESLint, and Turbopack. The official v16 guide documents stable Turbopack, async request APIs, the `middleware` to `proxy` rename, and the removal of `next lint`. Next also supports static routes and SPA-style client navigation, so the converter can remain fast and mostly static while gaining server boundaries where needed. | **Recommended.** It preserves the current app and the existing shadcn/Radix investment while providing a mature SEO, route, metadata, and deployment model. Upgrade deliberately through the v14 → v15 → v16 changes. |
| Vite + React Router | Vite 8 is stable and uses Rolldown/Oxc. It is a strong static SPA choice with fast HMR, but SSR, metadata, server routes, and deployment become additional choices. A separate API is still required for the planned backend. | Good alternative if the product becomes a client-only tool with a separately hosted API. Migration cost is higher than upgrading the existing Next app and gives no immediate product advantage. |
| TanStack Start | Official docs describe Start as an RC full-stack framework built on TanStack Router with SSR, streaming, server functions, server routes, and Vite/Rsbuild output. The router-first model is compelling for typed URL state and data loaders, but it is still an RC on the official site as of the research date. | Do not migrate the existing app to Start for first release. Re-evaluate once the product needs its route-tree model and the release channel is stable. |

The decisive workload fact is that unit conversion is a small, deterministic, user-facing interaction. Rendering the catalog and calculator in the browser avoids a network round trip per keystroke. Next's server features are useful for metadata, currency-rate fetching, API proxying, and future accounts, not for every calculation.

### Backend: Fastify versus Hono versus Elysia

| Option | Evidence and fit | Decision |
| --- | --- | --- |
| Fastify 5 | Fastify's official TypeScript documentation recommends JSON Schema for request validation and response serialization and documents TypeBox and `json-schema-to-ts` type providers. The plugin model and Node-first operational ecosystem fit a durable API, OpenAPI generation, rate limiting, and a later worker process. | **Recommended for `apps/api`.** It makes the HTTP boundary explicit, is well suited to JSON Schema/OpenAPI, and avoids tying the backend to a less universal runtime. |
| Hono 4 | Hono is TypeScript and Web Standards based and officially supports Node, Bun, Deno, Cloudflare, AWS Lambda, and other runtimes. Its `hc` client gives a convenient RPC path. The portability is attractive if edge deployment is a firm requirement, but the API contract would need a deliberate OpenAPI integration and runtime-specific adapters. | Good second choice for an edge-first product. Do not add an edge runtime constraint before image and currency requirements are known. |
| Elysia 1 | Elysia's official guide says it is optimized for Bun while offering Node and Web Standard adapters. This makes it pleasant for a Bun-only service but couples the default path to Bun-specific behavior and a smaller operational ecosystem than Node-first Fastify. | Do not choose for the first production backend. It remains a viable prototype option if Bun becomes an explicit product requirement. |

### Runtime and package manager: Node + pnpm versus Bun

Node's official release page lists v24 as LTS and v26 as Current on the research date, and recommends Active or Maintenance LTS for production. Bun's official documentation provides a capable runtime, package manager, test runner, bundler, and workspace implementation. pnpm's official workspace documentation uses a root `pnpm-workspace.yaml`, which gives an explicit workspace boundary and a single lockfile.

Choose Node 24 LTS for `apps/web`, `apps/api`, and any worker. Choose pnpm 11.25.0 with an exact `packageManager` field and one `pnpm-lock.yaml`. Bun may be used to run isolated local experiments, but mixing `package-lock.json`, `bun.lockb`, and `pnpm-lock.yaml` would create non-reproducible dependency graphs. Use a CI-pinned pnpm version and fail CI if a second lockfile appears.

### Monorepo orchestration: Turborepo

Turborepo's official documentation describes task hashing, local/remote caching, the `outputs` contract, and workspace dependency graph. The applicable local Turborepo skill requires package-owned scripts, root scripts that delegate with `turbo run`, declared workspace dependencies, explicit outputs, and package configuration for package-specific overrides.

Use package scripts such as `web:build`, `api:build`, and `conversion-core:test` only within their owning package. The root package should delegate with `turbo run build`, `turbo run lint`, `turbo run test`, and `turbo run typecheck`. Configure `build` with `dependsOn: ["^build"]` and outputs for `.next/**`, `dist/**`, and generated contract artifacts; mark `dev` persistent and uncached. Keep `.env` files in the consuming app or package, declare their inputs, and never create an implicit root `.env` shared by every package.

### API contract: OpenAPI versus inferred RPC

OpenAPI 3.1.2 is a stable, language-agnostic API description, and the OpenAPI project describes its use for documentation, client generation, and testing. The OpenAPI project also lists the newer 3.2 line, but 3.1 has wider tool support. Fastify's JSON Schema route definitions can be the source for a generated OpenAPI 3.1 document.

Use `packages/contracts` as the contract boundary:

1. Define request, response, error, and pagination schemas once with TypeBox/JSON Schema.
2. Register the same schemas with Fastify validation and `@fastify/swagger`.
3. Commit the generated `openapi.json` as a reviewable artifact or generate it in CI.
4. Generate a typed web client with `openapi-typescript` plus `openapi-fetch`, or use plain `fetch` behind a tiny typed adapter.
5. Run contract tests against the API and reject undocumented response fields that would break clients.

Keep domain types in `@simple-units/conversion` and transport schemas in `@universal-convertal/contracts`; do not import API handlers into the web app.

### Database and queue choices

PostgreSQL 18 is the current documented major line. Its official documentation includes exact `numeric`/`decimal`, JSON/JSONB, and transaction support. That makes it suitable for accounts, saved conversions, rate snapshots, and durable job records when those features are actually needed. Drizzle is a small TypeScript ORM with SQL migrations and is already represented in the official Next.js SaaS starter ecosystem, but it should remain an implementation detail behind `apps/api`.

There is no first-release need for a database to calculate units. Keep anonymous history in the browser (localStorage for a small list, IndexedDB once image metadata or larger records are stored). Add PostgreSQL when the product requires signed-in synchronization, saved custom units, currency-rate auditability, or durable image-job state.

There is no first-release need for a queue. A bounded image request can be handled synchronously by Sharp in the Node API for an allowlisted set of small raster operations. When image conversion becomes long-running or high-volume, move it behind an explicit job boundary: API validates and records the job, object storage holds the input/output, and a worker processes it asynchronously. BullMQ's official docs describe Redis-backed queues, retries, delays, priorities, and horizontally scalable workers; Redis Streams provide consumer groups and at-least-once processing primitives. Use BullMQ only at that point, with idempotency keys and a Postgres job record. Redis is a coordination/cache layer, not the source of truth for user data.

For a turnkey first release, use Frankfurter's public API as the no-key baseline and expose only the currencies returned by the configured endpoint. The current v2 catalog includes TND, so Tunisian Dinar conversion works without a provider key in the implemented baseline; currencyapi remains an optional adapter for alternate coverage and commercial quotas. Keep both behind the same provider interface; a missing key or provider coverage must produce an explicit unsupported/unavailable state rather than a guessed or silently stale quote.

## Proposed boundaries and data flow

```text
browser
  ├─ @simple-units/conversion    (unit math, formatting, pure image metadata checks)
  └─ apps/web                    (routes, local history, accessibility, API client)
          │ HTTPS / OpenAPI
          ▼
apps/api (Fastify)
  ├─ contracts validation + auth/rate-limit middleware
  ├─ conversion application service
  ├─ currency provider adapter ──► Frankfurter or currencyapi (server-side key when required, timeout, cached quote)
  ├─ Sharp image adapter (synchronous, bounded first-release path)
  ├─ PostgreSQL adapter (later, durable state)
  └─ queue producer (later, image jobs)
          │
          ▼
apps/worker (later)
  ├─ BullMQ/Redis job consumer
  └─ object storage adapter
```

The pure engine in `@simple-units/conversion` must never fetch rates, read environment variables, access the database, or depend on React. Unit definitions should be one typed registry used to render selectors, validate API inputs, and produce the supported-units page. The registry needs explicit dimensions and conversion semantics: multiplicative factors, affine temperature transforms, currency quote requirements, and non-convertible developer/image operations.

Suggested first-release API surface:

| Route | Purpose | First-release policy |
| --- | --- | --- |
| `GET /v1/units` | Catalog categories, units, symbols, aliases, and capability flags. | Cacheable; generated from the shared registry. |
| `POST /v1/convert` | Server-side parity endpoint for integrations and verification. | Same request/response cases as the pure engine; no per-keystroke browser call. |
| `GET /v1/currency/rates` | Return a provider quote with source and timestamp. | Frankfurter v2 no-key baseline including TND; optional currencyapi adapter; timeout, bounded cache, stale/error state. |
| `GET /healthz` | Liveness; no dependency checks. | Fast and unauthenticated. |
| `GET /readyz` | Readiness for required dependencies. | Used by deployment and orchestration. |
| `POST /v1/image/convert` | Convert a small uploaded raster image synchronously. | Multipart input; Sharp allowlist, byte/pixel/output/time limits; no arbitrary URLs. |
| `POST /v1/image-jobs` | Create a server-side image conversion job. | Defer until object storage, worker, and queue limits are designed. |

All API errors should use a stable envelope such as `{ code, message, details?, requestId }`; provider internals and secrets must never be returned. Validate unknown JSON fields, numeric finiteness, magnitude/precision limits, file byte limits, image pixel limits, and currency rate age. Add CORS, request IDs, structured logs, timeouts, and a trusted deployment client-address strategy before public deployment.

### Implemented baseline on 2026-10-03

The first release now implements `apps/web`, `apps/api`,
`@simple-units/conversion`, and `@universal-convertal/contracts` in the layout
above. The API has working health/readiness, unit catalog, conversion,
currency-provider, and bounded Sharp image routes. The web app has the public
unit, currency, developer, image, and about routes. OpenAPI schemas are
registered with Fastify and generated documentation remains a follow-up
artifact; there is no generated typed web client yet. Anonymous history remains
browser-local, with PostgreSQL and asynchronous jobs reserved for later work.

## Dependency baseline observed on 2026-10-03

The following latest versions were read from the npm registry on the research date. They are a baseline for a lockfile update, not permission to float dependencies with `latest` in production.

| Package | Observed version | Recommendation |
| --- | ---: | --- |
| `next` | 16.3.8 | Upgrade from 14 only with the official v15/v16 codemods and migration checks. |
| `react`, `react-dom` | 19.3.0 | Upgrade together with Next; test Radix and shadcn components after the move. |
| `vite` | 8.3.2 | Use only if a future Vite/TanStack branch is selected. |
| `@tanstack/react-start` | 1.168.60 | RC; do not use as the default first-release framework. |
| `turbo` | 2.11.7 | Pin in the root dev dependencies; keep task scripts package-owned. |
| `pnpm` | 11.25.0 | Pin via `packageManager`; commit only `pnpm-lock.yaml`. |
| `fastify` | 5.12.5 | Node-first API runtime; verify plugin peer ranges together. |
| `hono` | 4.13.12 | Alternative if edge portability becomes a requirement. |
| `elysia` | 1.4.30 | Bun-oriented alternative; not selected. |
| `zod` | 4.6.5 | Useful for UI form validation, but do not duplicate the API contract. |
| `@sinclair/typebox` | 0.34.52 | Recommended shared JSON Schema/TypeScript representation. |
| `@fastify/swagger` | 9.9.1 | Generate OpenAPI from Fastify schemas; verify Fastify 5 peer compatibility. |
| `@fastify/multipart` | 10.1.2 | Parse bounded image uploads; enforce limits before Sharp decoding. |
| `sharp` | 0.35.5 | Synchronous first-release raster conversion; use product-specific byte/pixel/time limits. |
| `openapi-typescript` | 7.13.0 | Generate client types from committed OpenAPI. |
| `openapi-fetch` | 0.17.0 | Optional thin typed client; keep it behind `apps/web` adapter. |
| `drizzle-orm` | 0.45.3 | Add only with the first persistent data feature. |
| `bullmq` | 6.3.11 | Add only with asynchronous server-side image jobs. |
| `decimal.js` | 10.6.0 | Use for currency arithmetic and explicit rounding policy. |
| `vitest` | 5.0.3 | Pure-engine and API tests. |
| `playwright` | 1.63.0 | Browser smoke/accessibility flows at release gates. |

Before installation, check the package's release notes and Node engine range, run a clean lockfile install, and run the security audit. Do not copy every dependency from a template; the current app has many unused shadcn/Radix primitives.

The committed lockfile resolves the implementation's direct runtime baseline as
follows (captured with `pnpm list --depth 0 -r` on 2026-10-03): Next 16.3.8,
React/ReactDOM 19.3.0, Fastify 5.12.5, `@fastify/cors` 11.3.0,
`@fastify/multipart` 9.4.0, `@fastify/swagger` 9.9.1, TypeBox 0.34.52,
Sharp 0.35.5, Decimal.js 10.6.0, Turbo 2.11.7, and TypeScript 6.0.3 in the
web package / 5.9.3 in the API and shared packages. The manifest pins pnpm
11.25.0 for CI and local development; this is the exact version used for the
successful install and frozen-lockfile check.

## Open-source templates and components reviewed

Use source repositories as references and copy only the parts that fit the product boundary:

- [Next.js SaaS Starter](https://github.com/nextjs/saas-starter) demonstrates Next.js, Postgres, Drizzle, auth, shadcn/ui, and server-side validation. It is too feature-heavy for the anonymous converter first release, but useful later for account and persistence slices.
- [create-t3-app](https://github.com/t3-oss/create-t3-app) demonstrates an optional full-stack Next.js generator with TypeScript, Tailwind, SQL, and typed APIs. It is an opinionated scaffold, not a reason to add tRPC, Prisma, or auth before product requirements call for them.
- [Vercel Next.js examples](https://github.com/vercel/examples) provide narrow, maintained patterns such as Postgres starters. Prefer an example that matches one feature over importing a complete SaaS template.
- [shadcn/ui official resources](https://ui.shadcn.com/docs/official) identify the official CLI and source repository. Continue using local component source and update `components.json` to the actual stylesheet path during the web migration.
- [TanStack Start official examples](https://tanstack.com/start/latest/docs/framework/react/getting-started) are useful for a future router-first experiment, especially typed search state and data loaders, but the official site still labels Start RC.

## Migration and rollout plan

1. **Baseline and lockfile:** record the clean commit, delete the duplicate package-manager path only after confirming no deployment depends on it, create `pnpm-workspace.yaml`, and move the current app to `apps/web` without changing product behavior. **Completed in this workspace.**
2. **Framework upgrade:** upgrade Next and React in a focused change. Apply the official codemod, migrate `next lint` to the ESLint CLI, check async request APIs and any `middleware`/`proxy` usage, and fix the stale shadcn CSS path. **Completed for the current routes; ESLint flat configs are package-local.**
3. **Extract domain:** use `packages/conversion` as the shared domain package; add typed dimensions, aliases, units, invalid-input results, and golden tests. Replace the duplicated supported-unit list with the registry. **Completed for the current unit/developer surface.**
4. **Add monorepo graph:** add `packages/contracts` and shared config only when they have a consumer; keep web-only shadcn components in `apps/web`. Configure Turborepo package tasks, outputs, environment inputs, and boundaries. Keep web and API dependencies local to their packages. **Completed with two consumed packages; shared config remains deferred.**
5. **API slice:** add `apps/api` with `/healthz`, `/readyz`, `GET /v1/units`, and `POST /v1/convert`. Generate OpenAPI and a typed client. The web app should keep local conversion as its fast path and use the API only for parity/integration paths. **Routes and schemas are implemented; generated OpenAPI/client artifacts remain follow-up work.**
6. **Currency slice:** add a server-side provider adapter, decimal arithmetic, quote timestamp/source, bounded cache, timeout, retry/backoff policy, and an explicit stale-rate UX. Never expose provider credentials to the browser.
7. **Developer and image slices:** add byte/time/data-rate units to the same pure registry. Add a synchronous `/v1/image/convert` route for small uploads using Sharp with signature, byte, decoded-pixel, output-byte, format, and timeout limits. Keep larger jobs behind a later worker boundary; do not accept arbitrary remote URLs.
8. **Persistence and jobs:** add PostgreSQL for accounts/saved records/rate snapshots, then BullMQ/Redis and `apps/worker` only when an asynchronous job has a real user-facing need.

## Risks, current bugs, and mitigations

| Risk or bug | Evidence | Mitigation |
| --- | --- | --- |
| Historic migration baseline: the original app used Next 14/React 18. | The initial snapshot pinned `^14.2.0` and `^18.3.1`; the current workspace resolves Next 16.3.8 and React 19.3.0. | Resolved in the workspace migration; current package versions are recorded in `docs/research/verification.md`. |
| Two lockfiles can resolve different dependency graphs. | Both `package-lock.json` and `bun.lockb` are tracked. | Select pnpm, create one lockfile, and add CI checks for duplicate lockfiles. |
| UI registry and implementation can drift. | `components.json` names missing `src/index.css`; page duplicates unit labels. | Point shadcn config at `app/globals.css` and derive labels from `conversion-core`. |
| Currency can silently lose precision or use stale rates. | Current engine uses `number` and has no rate source or timestamp. | Use `decimal.js`, quote metadata, explicit rounding, provider timeout, cache age, and visible stale/error states. |
| Public image processing can exhaust memory or become an SSRF path. | The initial repository had no image route or storage boundary; the implemented route now accepts only bounded uploads. | Keep the first release on byte/pixel/output/time limits and no remote URLs; later require object storage, URL allowlists, sandboxed workers, and scanning for larger jobs. |
| A queue can become a second source of truth. | BullMQ uses Redis for jobs; Redis streams have at-least-once semantics. | Persist job state and idempotency in PostgreSQL; treat queue delivery as retryable and at-least-once. |
| Framework/runtime coupling may block deployment options. | Elysia is Bun-optimized; Hono needs adapters; Next and Fastify are Node-friendly. | Use Node 24 LTS in production and isolate runtime adapters behind `apps/api` boundaries. |
| Remote caching can replay incorrect artifacts if inputs are incomplete. | Turborepo documents deterministic inputs/outputs and environment hashing. | Declare outputs and environment inputs, keep `.env` package-local, and use signed remote cache only after CI identity is configured. |

## Verification gates

The first release is ready for a broader deployment only after these checks pass:

- `pnpm install --frozen-lockfile` from a clean checkout;
- `turbo run typecheck lint test build` with package-level scripts and cache summaries;
- conversion golden cases for affine temperature, SI prefixes, large/small values, invalid units, and rounding;
- API contract tests generated from the OpenAPI document;
- Playwright flows for conversion, swap, copy, history, currency loading/error/stale states, keyboard navigation, reduced motion, and disabled JavaScript fallback;
- route checks at 320, 390, 768, and 1440 px, including French/English copy if localization is added;
- dependency audit and container smoke test on Node 24 LTS;
- image tests covering MIME sniffing, pixel/byte limits, timeout, output format, cancellation, and malformed files for the synchronous endpoint; add duplicate-job and retry tests when a queue exists.

## Primary sources (all accessed 2026-10-03)

- [Next.js installation and system requirements](https://nextjs.org/docs/app/getting-started/installation)
- [Next.js v16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Next.js v16 release announcement](https://nextjs.org/blog/next-16)
- [React 19.3 release](https://react.dev/blog/2026/09/09/react-19-3)
- [Vite 8 release announcement](https://vite.dev/blog/announcing-vite8)
- [Vite 8 migration guide](https://vite.dev/guide/migration.html)
- [TanStack Start overview](https://tanstack.com/start/latest)
- [TanStack Start getting started and examples](https://tanstack.com/start/latest/docs/framework/react/getting-started)
- [Node.js supported release lines](https://nodejs.org/en/about/previous-releases)
- [Bun documentation](https://bun.sh/docs)
- [Bun workspaces](https://bun.sh/docs/pm/workspaces)
- [pnpm workspaces](https://pnpm.io/workspaces)
- [Turborepo task configuration](https://turborepo.dev/docs/reference/configuration)
- [Turborepo caching](https://turborepo.dev/docs/crafting-your-repository/caching)
- [Fastify TypeScript and JSON Schema providers](https://fastify.dev/docs/latest/Reference/TypeScript/)
- [Fastify validation and serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [Hono documentation](https://hono.dev/docs)
- [Hono Node.js adapter](https://hono.dev/docs/getting-started/nodejs)
- [Elysia quick start](https://elysiajs.com/quick-start)
- [OpenAPI Specification 3.1.2](https://spec.openapis.org/oas/v3.1)
- [OpenAPI specification versions](https://spec.openapis.org/oas/)
- [PostgreSQL 18 data types](https://www.postgresql.org/docs/current/datatype.html)
- [PostgreSQL JSON functions and operators](https://www.postgresql.org/docs/current/functions-json.html)
- [BullMQ queues](https://docs.bullmq.io/guide/queues/)
- [BullMQ overview](https://docs.bullmq.io/)
- [Redis Streams](https://redis.io/docs/latest/develop/data-types/streams/)
- [shadcn/ui official resources](https://ui.shadcn.com/docs/official)
- [shadcn/ui installation](https://ui.shadcn.com/docs/installation)
- [Next.js SaaS Starter](https://github.com/nextjs/saas-starter)
- [create-t3-app](https://github.com/t3-oss/create-t3-app)
- [Vercel examples](https://github.com/vercel/examples)

Package version observations were read from the corresponding npm registry `/<package>/latest` metadata on 2026-10-03; recheck each before implementation because registry latest tags are mutable.
