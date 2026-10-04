# Universal Convertal repository instructions

## Scope and source of truth

This repository is Universal Convertal, an English-only first-release conversion utility that will grow from a unit converter into currency, developer-tool, and image-conversion workflows. Localization is planned, but there are no localized routes or language controls yet. Keep implementation decisions aligned with [system design.md](system%20design.md), [architecture research](docs/research/architecture.md), and [conversion-engine research](docs/research/conversion-engines.md). The research documents record rationale; the typed registry and contract packages are the runtime source of truth once implemented.

Preserve unrelated working-tree changes. Inspect `git status --short` before editing. Do not replace product copy, provider credentials, deployment settings, or conversion definitions as a side effect of styling or workspace work. Never claim support for a format, currency, market, or conversion operation until it has a source, tests, limits, and a visible error state.

## Target stack and repository boundaries

- `apps/web`: Next.js App Router, React, public routes, browser-local state, and the web API client.
- `apps/api`: Fastify HTTP API, OpenAPI generation, request validation, provider adapters, and server-only dependencies.
- `packages/conversion` (`@simple-units/conversion`): pure TypeScript domain model and arithmetic. It must run in browser and Node without React, I/O, environment variables, or network calls.
- `packages/contracts`: TypeBox/JSON Schema request and response schemas, stable error codes, and generated OpenAPI artifacts/types.
- `packages/ui` (later): local shadcn/ui component source only after a second consumer exists. Keep web-only components in `apps/web` until then.
- `packages/config` (later): shared TypeScript/ESLint/tooling presets only after more than one consumer exists.
- `packages/test-fixtures` (later): deterministic fixtures only after core and API genuinely share them.
- `apps/worker` (later): isolated image/PDF/Office/media/archive processing. Do not create it until an asynchronous job has a defined user-facing need.

Use pnpm 11.25.0 with one `pnpm-lock.yaml` and Turborepo 2 task orchestration. Production JavaScript runs on Node.js 24 LTS. Bun is an optional local tool, not a second lockfile or a production-runtime assumption. Root scripts route through the Turbo graph (the Windows dev entrypoint uses a Node supervisor for stable piped logs); task logic belongs in each package's `package.json`.

Do not import across package internals. Depend on package names and public exports. Keep server-only packages out of browser bundles, and keep the API from importing React or UI components.

## Conversion correctness

The unit registry in `packages/conversion` is the single source for categories, canonical IDs, symbols, aliases, dimensions, factors, affine offsets, and capabilities. The UI, API validation, supported-unit lists, and tests must consume it rather than duplicating labels or conversion tables.

Represent conversion values as decimal/rational strings or an explicitly documented precision policy. Use `decimal.js` for currency arithmetic when enabled. Separate parsing, arithmetic, and display formatting. Never parse a formatted result back into the calculation path.

Multiplicative units use dimension vectors and canonical factors. Temperature uses affine equations and a separate delta-temperature mode. Reject unknown units, non-finite values, incompatible dimensions, unsupported expressions, values below absolute zero, and configured magnitude/precision limits with stable error codes. Do not use falsy checks for numeric factors or results.

Currency is a server-only provider adapter. Keep API keys out of browser modules, validate provider responses, use an abort timeout, bound response size, handle 429s, and return source/fetched timestamps plus an explicit stale state. Do not call an external provider for every keystroke.

Developer tools should be deterministic and local: URL encoding, Base64, JSON, text escaping, and allowlisted hash/UUID helpers. Reject malformed input and bound input lengths. Do not fetch arbitrary URLs.

First release includes a synchronous, bounded Sharp image endpoint for small uploaded raster files. Validate content signatures, bytes, decoded dimensions, output size, operation time, and concurrency before returning an artifact. Keep browser metadata checks fast and local where practical. Do not put a shell command or arbitrary remote URL in a request path. A later worker must use fixed operation allowlists, generated storage keys, idempotency, cleanup, and isolation.

## API and data rules

The API is versioned under `/v1`. Define transport schemas once in `packages/contracts`, register them with Fastify, and generate an OpenAPI 3.1 document and typed client. Use stable error envelopes such as `{ code, message, details?, requestId }`; never expose provider internals, stack traces, credentials, or full personal inputs in logs.

The first release does not require a database or queue for anonymous conversion or bounded synchronous image conversion. Keep short history in the browser. Add PostgreSQL for accounts, saved conversions, rate snapshots, or durable job state. Add Redis/BullMQ only for real asynchronous workloads such as larger server-side image conversion; PostgreSQL remains the durable record and queue delivery is treated as retryable and at-least-once.

Health endpoints must distinguish liveness (`/healthz`) from dependency readiness (`/readyz`). Public API deployment needs request IDs, structured logs, CORS policy, request limits, trusted client-address handling, rate limiting, and timeouts.

## UI and accessibility

Render semantic HTML and keep the essential conversion flow usable without JavaScript where practical. Use headings in order, labels for every field, links for destinations, and buttons for actions. Provide visible focus indicators, a skip link, keyboard-operable selectors, a minimum 44px touch target, and useful status/error announcements.

Design at 320–390px first, then tablet and desktop. The shipped UI is English-only; do not imply that French routes or a language selector exist. If localization is added later, French or other localized strings must not be clipped by fixed heights. Every interactive component needs default, hover, focus-visible, pressed/selected, disabled, loading, empty, and error states where applicable. Keep meaningful control boundaries at WCAG 2.2 AA contrast.

Static content should be visible before scripts initialize. Honor reduced motion in CSS and JavaScript; no parallax, route hijacking, decorative loops, or delayed primary content. Use CSS for micro-interactions and only add coordinated animation when it improves comprehension. Controllers must initialize safely across client navigation and clean up listeners/observers.

Use shadcn/ui as local component source, not as an opaque runtime dependency. Product-workbench icons come from the local Bootstrap Icons paths in `apps/web/src/components/convertal/FlatIcon.tsx`; retain their attribution in `THIRD_PARTY_NOTICES.md`. Generated but currently unused shadcn primitives may continue to import Lucide icons. Keep tokens semantic (`--surface`, `--text`, `--action`, `--focus`, `--feedback`) and centralize them in the shared visual layer. Avoid ad hoc color literals and blanket transitions.

## Verification

Before handing off a workspace or feature change, run the relevant package checks and report exact conditions:

- `pnpm install --frozen-lockfile` from a clean checkout;
- `turbo run typecheck lint test build` for affected packages;
- conversion golden cases for dimensions, affine temperature, precision, aliases, invalid input, and rounding;
- API contract tests against generated OpenAPI;
- browser checks for conversion, swapping, copy, history, currency loading/stale/error states, keyboard use, reduced motion, direct load, and back/forward navigation;
- 320, 390, 768, and 1440px layout checks plus 200% zoom;
- dependency audit and production smoke test on Node 24 LTS.

Do not claim a lint, test, typecheck, performance, or accessibility check passed when it was not run. For provider and worker tests, use mocks or local stubs; never send production currency requests or real user files during routine verification.

## Documentation and changes

Keep architecture decisions and source links in `docs/research/`. When changing the stack or capability boundary, update the relevant design/research document in the same change. Record migration risks and rejected alternatives rather than silently introducing a second model or runtime.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
