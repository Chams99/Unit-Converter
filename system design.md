# Universal Convertal system design

**Status:** first-release product and visual system  
**Updated:** 2026-10-05

Universal Convertal should feel like a dependable technical utility: quick for a one-off conversion, clear when a value is unavailable or stale, and broad enough to support expert workflows without becoming a crowded toolbox. The interface should establish trust through visible units, source metadata, precision, and honest capability boundaries.

This document defines product structure and interaction rules. Architecture and runtime decisions live in [docs/research/architecture.md](docs/research/architecture.md); numerical and file-format constraints live in [docs/research/conversion-engines.md](docs/research/conversion-engines.md).

## Product model

The product has one shared conversion model with focused workflows:

```text
Universal Convertal
├─ Units       physical quantities and compound units
├─ Currency    provider-backed foreign-exchange quotes
├─ Developer   deterministic text, encoding, JSON, and data transforms
└─ Images      bounded metadata and format conversion (resize planned)
```

The current English first release has separate routes for all four workflows. `/about` still uses a standalone page without the shared header and footer; bringing it into the shell is a P2 visual-consistency follow-up.

The global header contains the product mark, primary workflow navigation, theme control, and a compact help/about link. Add a language control when localization ships. The main content has one descriptive `h1`, a short explanation, the active converter workspace, and supporting history or capability information. Do not put five competing cards above the primary interaction.

The unit workflow is the default route. The category is selected first, followed by a value field, source unit, swap action, target unit, and result panel. History is a secondary panel that can repopulate the form; clearing history is reversible within the current session when practical. On small screens, the result follows the target selector and history moves below the converter.

Currency adds amount, base/quote currencies, a swap action, a result, provider/source, fetched-at time, and a visible fresh/cached/stale/error status. Developer tools choose an operation and show input/output panes with copy feedback; output-file download is planned. Image tools currently accept one file and show operation controls, a preview, and a downloadable output artifact; multi-file handling and resize operations are planned. Limits and unsupported formats are stated before upload.

Small supported raster files are sent to the bounded synchronous image endpoint only after the user starts conversion. Larger or unsupported operations are clearly marked as unavailable until the worker roadmap is shipped.

## Information architecture

Use these route shapes when the workflows are split into pages:

- `/` — universal units converter;
- `/currency` — currency quotes and freshness information;
- `/developer` — deterministic developer transforms;
- `/images` — bounded browser or server image operations;
- `/about` — supported capabilities, precision policy, provider attribution, and privacy explanation.

Each route receives a stable deep link for its selected category/operation through URL search state only when that state can be validated and restored safely. The browser may keep recent history locally; the URL must never contain private message data or provider credentials.

## Visual language

The visual language is calm, crisp, and tool-oriented:

- Use a neutral ink/surface foundation, one high-contrast action color, and one restrained accent for successful output.
- Keep cards lightly bordered and layered by surface rather than by heavy shadows. Reserve elevation for the active workspace, menus, and transient feedback.
- Use one readable sans-serif family for interface text and a monospace face for code, values, units, and timestamps. Numeric output uses tabular figures where available.
- Use icons as labels or supporting affordances, never as the sole explanation of an action. The workbench uses the local filled Bootstrap SVG set in `apps/web/src/components/convertal/FlatIcon.tsx`; copied shadcn primitives may retain their upstream Lucide imports.
- Keep decorative gradients and background patterns quiet enough that value, unit, and error text remain dominant.

Use semantic tokens rather than per-component literals:

```text
surface-canvas    page background
surface-panel     converter and secondary panels
surface-raised    menus, dialogs, focused result blocks
text-primary      headings and input values
text-secondary    descriptions and metadata
border-default    panel and field boundaries
action-primary    primary buttons and active navigation
action-quiet      secondary controls and selected surfaces
feedback-success  completed result and available status
feedback-warning  stale data and limits
feedback-danger   validation and provider errors
focus-ring        keyboard focus indicator
```

Every token needs light and dark values with composited contrast checked against its actual adjacent surface. Do not rely on opacity alone to establish a boundary. Use a shared radius and spacing scale; a result card may be more prominent through type and a border treatment instead of a larger glow.

## Layout and responsive behavior

At 320–390px, the converter is a single-column flow with full-width fields and a 44px or larger swap button. Labels remain above controls. Unit selectors may use a searchable command surface only after the list is large enough to justify it; native select behavior is preferred for the initial short catalog.

At tablet width, place the converter and history in two columns when both remain comfortable. At desktop width, use a centered content frame with a readable maximum width and a two-column tool workspace. Keep supported categories and help content below the active task. Avoid fixed-height panels; French labels, long currency names, and validation text must wrap naturally.

The header can remain sticky, but anchor targets need a scroll margin. A closed mobile navigation removes links from the tab order and accessibility tree. A modal menu is unnecessary for the first release; use a disclosure and restore focus to its trigger on close.

## Component system

The names below are planned component boundaries. Shared behavior is currently composed in the web workbench; extract these focused components as the implementation grows.

Extract repeated patterns into typed components with explicit variants:

- `AppShell`: header, skip link, navigation, theme/language controls, footer;
- `WorkflowNav`: unit/currency/developer/image route choices and current state;
- `ConverterCard`: category/operation heading, field stack, actions, result slot;
- `ValueField`: persistent label, unit-aware input, validation message, precision hint;
- `UnitSelect`: source/target choice with symbol and searchable fallback;
- `SwapButton`: accessible label, pressed feedback, disabled state when values cannot swap;
- `ResultPanel`: formatted value, canonical unit, precision/source metadata, copy action;
- `HistoryPanel`: recent records, restore action, clear action, empty state;
- `StatusBadge`: fresh, cached, stale, unavailable, processing, and complete states;
- `Dropzone` and `ArtifactRow`: image input limits, progress, output metadata, download action;
- `ErrorNotice`: stable user-facing code/message and retry action without losing input.

Keep page-specific composition in the route section. A component should not silently call a provider, read global environment variables, or own unrelated history state.

## Interaction states

The core conversion should update immediately enough to feel direct; debounce only expensive or network-backed work. Preserve the raw input string so a user can type a partial value, minus sign, decimal separator, or exponent without the UI fighting the edit. Show a neutral empty state before a valid number, an inline validation state for malformed or impossible input, and a result with copy feedback after conversion.

The unit workflow picks a category from keyboard-operable chips (a native radio group), then shows two rows, amount and source unit, then result and target unit, with the swap between them. The result is the largest text in the workspace. Below it, a relationship line (`1 km = 0.621 mi`, or two reference points for affine temperatures) and a list of the same amount in every compatible unit, which also sets the target unit. Target-unit choices only include units of the same kind, so absolute temperatures and temperature differences cannot be paired.

Display precision policy: unit results show at most 12 significant digits with comma digit grouping. Values below 1e-6, or at and above 1e15, switch to a mantissa and power of ten so small results are not rounded to zero. "Show full precision" reveals up to the 40 significant digits used for calculation. Copy actions copy the ungrouped displayed value. These rules live in `formatSignificant` in `@simple-units/conversion`, separate from arithmetic and parsing. Input accepts English digit grouping (`1,250`), but never treats a comma as a decimal separator.

Unit conversions save to local history only when the user activates "Save to history". Browsing categories, editing amounts or units, swapping, copying a result or link, and restoring an existing entry never save automatically. The save action is disabled for empty, partial, or invalid inputs and announces successful saves. Clearing history removes only the active tool's entries and can be undone for the rest of the session. The category, units, and amount are mirrored to the URL with `history.replaceState`, so a conversion can be reloaded or shared with "Copy link"; invalid or mismatched parameters are repaired to a valid pair rather than rejected. Restoring a history entry updates the form in place without a page reload.

For currency, show `loading`, `fresh`, `cached`, `stale`, `rate limited`, `provider unavailable`, and `invalid response` states. A stale quote is still useful only when labelled as stale and accompanied by its source/fetched times. Retry must preserve amount and currency choices.

For image operations, show selected file name, detected MIME, dimensions, byte size, operation limits, progress, cancellation where the request can be aborted, failure, and output artifact details. A file that is too large or unsupported should be rejected before expensive decoding where possible. The first release uses a bounded synchronous Sharp response for small raster operations; never imply an operation succeeded when only an upload completed. Longer operations move to a later queued job state with explicit processing status.

## Motion and feedback

Use a short opacity/transform transition for result appearance, field focus, copy confirmation, and panel state changes. Keep movement subtle and local to the changed content. A swap button may rotate on activation only if the rotation does not communicate state by itself. Do not animate large shadows, layout dimensions, or the entire page on every route change.

Implemented motion uses shared tokens in `globals.css` (`--dur-fast` 120 ms, `--dur-base` 200 ms, `--dur-slow` 320 ms) and only animates transform and opacity. It covers: the unit result easing in after an edit (never on first paint), the unit list fading in on a category change, swap icons turning half a turn per press, a copy check that pops in, the theme icon turning in after a change, small press and hover feedback on buttons and chips, and fades for new history entries, errors, menus, and results. Every tool, unit category, developer mode, and image mode has a Bootstrap icon, and each icon sits beside a visible text label.

Static content and controls render in their final accessible order before scripts initialize. `prefers-reduced-motion: reduce` removes route movement, decorative animation, smooth scrolling, and nonessential transitions. If a future operation displays progress for longer than five seconds, provide pause/cancel or an equivalent stop action; never rely on hover to pause it.

## Accessibility and localization

Use a single visible `h1` per route, then `h2` workflow sections and `h3` items. Every input has a persistent label, a useful `name`, suitable input type, autocomplete where meaningful, and an associated error. Copy feedback is announced in a polite live region. Keyboard focus remains visible and never moves behind the sticky header.

The first release UI is English-only; French localization is planned. It must preserve the domain IDs and API contract while localizing labels, descriptions, validation, status announcements, provider metadata labels, and document titles. Keep numeric parsing and display locale-aware while preserving a canonical machine value. Do not put locale-specific strings in the pure conversion registry; attach localized labels at the presentation layer.

## Trust, privacy, and performance

The first release should work anonymously and keep short history on the device. Explain when currency data comes from an external provider and when an image leaves the browser. Do not upload a file unless the user begins an operation that requires it. Do not send raw developer-tool input to an API when a browser implementation can complete the operation locally.

Keep the default route largely static and lazy-load heavy image/developer modules. The only likely LCP content is the converter shell; render it without waiting for fonts, providers, or animation. Lazy-load below-fold media, provide dimensions, and measure the production build against LCP ≤2.5 s, INP ≤200 ms, and CLS ≤0.1 under a documented test condition.

## Acceptance criteria for the visual system

- The default unit flow is usable at 320px width without horizontal scrolling; when French localization ships, verify its copy at the same width.
- Keyboard users can reach every field, swap, copy, history, navigation, and retry action with visible focus.
- Empty, invalid, stale, loading, disabled, and provider-error states explain what happened and what the user can do next.
- Result formatting distinguishes display precision from calculation precision and exposes the unit/symbol clearly.
- Reduced motion removes nonessential animation, and scripts failing to load still leave meaningful headings and form labels visible.
- The same workflow survives direct route load, client navigation, browser back/forward, dark mode, 200% zoom, and a narrow touch viewport.
## Resource hardening — 2026-10-05

The synchronous image route now uses short-lived child processes, with hard
termination before its concurrency slot is released. Uploaded images/results
remain buffers; there is no database or durable upload storage. Edge body,
rate and concurrency limits combine with global application/provider budgets
and read-only containers capped for CPU, RAM, swap and task count.
See [abuse protection](docs/abuse-protection.md) for enforced defaults,
verification and the remaining shared Traefik/network requirements.
