# Universal Convertal: research and first-release design brief

Status: recommendation for the first working release  
Research date: 2026-10-03  
Scope: `D:\1_DEV\1_NEXT_JS\simple-units`  
Decision owner: product and engineering team

This document is the research and design record for the next release of Universal Convertal. The current implementation source is the repository code plus [`system design.md`](../../system%20design.md); this record preserves the audited state, evidence, tradeoffs, reusable component/license inventory, functional contracts, and acceptance criteria. It intentionally describes a working conversion product rather than a static landing page.

## Recommendation

Build a calm, dense conversion workbench with one active tool, clear input/output relationships, a searchable tool rail, and a context column for history, metadata, and help. The initial screen should open directly into a useful conversion task. The product should feel like a dependable utility people can return to, not a collection of promotional cards.

The first release should make these four areas real:

1. **Units**: length, volume, mass, energy, temperature, area, speed, time, and data, with explicit dimensions and correct factors.
2. **Currency**: amount, source currency, target currency, rate timestamp, provider/source, refresh, stale, and offline/error states.
3. **Developer tools**: JSON formatter/validator, Base64 encode/decode, URL encode/decode, UUID generation, and timestamp conversion. Each tool must show the actual transformed output and actionable errors.
4. **Images**: bounded server-side Sharp conversion by default for a deliberately scoped set of raster formats, with an explicit browser-local Canvas fallback, preview, output format, quality/dimensions, before/after bytes, and download. The selected mode must be visible before upload and the server path must enforce byte, pixel, output, and timeout limits.

History, copy, download, keyboard shortcuts, theme, locale, and clear privacy controls should work across these tools. A later phase can add batch jobs, saved recipes, shareable links, richer codec coverage, and authenticated cloud processing.

## Initial repository audit (before migration)

The repository was clean at the start of this audit (`git -c safe.directory='D:/1_DEV/1_NEXT_JS/simple-units' status --short --branch` reported `main...origin/main`). The project team has since added repository-level [`AGENTS.md`](../../AGENTS.md) and [`system design.md`](../../system%20design.md); those files are now normative and this brief complements them with the research, component/license review, and detailed first-release acceptance criteria. At that initial snapshot, dependencies were not installed, so `npm run dev` stopped with `'next' is not recognized`; no install was performed as part of that research-only pass. The migrated implementation and current checks are recorded in [`verification.md`](verification.md).

| Area | Actual state | Consequence for the release |
| --- | --- | --- |
| Runtime | Next.js 14.2, React 18.3, TypeScript, Tailwind 3.4, `rsc: false` in `components.json` | The existing app is a client-rendered React surface. Keep the implementation compatible with React 18 and introduce server boundaries deliberately when the backend lands. |
| Route shape | One `app/page.tsx`, one not-found page, one root layout | There are no tool routes, metadata boundaries, API routes, or shareable tool URLs. Introduce a route model without forcing every panel to be a new page. |
| Homepage | A sticky header, gradient hero, two-column converter/history grid, feature card, five supported-unit cards, and footer | The structure is a marketing-style card grid. Replace it with an app shell and an active workbench. Keep the first screen task-oriented. |
| Unit model | `src/lib/conversions.ts` has length, volume, weight, energy, and temperature; factors are plain floating-point numbers; temperature is special-cased | The model cannot represent dimensions, aliases, systems, precision policy, currency quotes, or developer/image tools. Use one typed registry and make each result explain its source and precision. |
| Conversion interaction | `UnitConverter` uses three Radix Selects, a number input, a swap button, a debounced 300 ms calculation, a result block, and clipboard copy | It is a useful proof of concept but does not expose invalid-input, loading, stale, or provider-error states. It calls `onConversion` from an effect and pushes in-memory history while typing settles. |
| History | `ConversionHistory` holds at most ten items in page state and resets on reload | Persist a versioned, bounded local history for safe scalar operations. Do not persist raw image files or developer payloads by default. Let users clear all history. |
| Accessibility | Visible labels exist for fields. Icon-only swap/copy controls have no accessible name. Output is not announced. Select behavior is delegated to Radix but there is no documented keyboard contract. | Add explicit names, `aria-live="polite"` for results/status, error descriptions, and a keyboard acceptance matrix. Prefer native controls or proven Radix primitives. |
| Visual system | `app/globals.css` defines blue/cyan gradients, shadows, and a global 700 ms transition on `*`; reduced motion overrides animation/transition duration | The system feels decorative and can make every state change slow. Use semantic tokens, restrained elevation, explicit transition properties, and no global transition. |
| Theme | `next-themes`, a custom animated toggle, `color-scheme: light dark`, and a view-transition reveal | Keep light/dark/system but gate all animated theme changes behind reduced-motion checks. The theme control needs a stable accessible name and a non-animated fallback. |
| UI inventory | Nearly the full Radix-backed shadcn set is already copied under `src/components/ui`; `lucide-react`, `cmdk`, `sonner`, `recharts`, and React Query are installed | Compose existing primitives before adding dependencies. The installed set is enough for the rail, command search, tabs, sheets, dialogs, tables, feedback, and history. |
| shadcn configuration | `components.json` points at `src/index.css`, but the app imports `app/globals.css`; shadcn CLI reports the project as Next.js 14.2, Tailwind v3, Radix base, Lucide icons, and all listed components installed | Reconcile the CSS path before the next shadcn update. Do not apply a preset blindly. Preserve the current Radix base and `@/` aliases. |
| Package hygiene | Both `package-lock.json` and `bun.lockb` are present, with no `packageManager` field | The implemented workspace selects verified pnpm 11.25.0 and one `pnpm-lock.yaml`; duplicate lockfiles were removed during migration. |
| Backend/privacy | No API route or server job exists; conversion runs in the browser | Units and developer transforms should stay local. Currency needs a server/provider boundary for caching and rate metadata. Image processing should stay in a worker/browser path by default. |

The current unit conversion factors also need a correctness pass before expansion. The new core should define a canonical unit for each dimension, keep exact rational/decimal constants where feasible, reject incompatible dimensions, and test known reference conversions. `parseFloat` and a silent `return value` on unknown units are not sufficient for a universal converter.

## Research findings and design implications

### Squoosh: local-first image workbench

[Squoosh](https://squoosh.app/) presents a short path: drop or paste an image, inspect it, adjust the settings that matter, and save. Its public page explicitly says images stay on the device and the open-source repository documents the same local processing model. The interface uses sample images to teach the interaction without hiding the primary drop target.

Implications:

- Make the drop/paste surface the first control in the image tool and give it an equivalent “Choose files” button.
- Do not require an account or upload for browser-supported conversions.
- Reveal format, quality, resize, metadata, and comparison controls after a file is selected; avoid a wall of disabled settings before there is an input.
- Show original and output bytes, dimensions, and format beside the preview. A visual image comparison is useful, but the byte and dimension deltas are the more dependable result.
- Use a worker for codecs or expensive transforms. Revoke object URLs after each job and clear the file queue explicitly.

Reference: [Squoosh privacy and source](https://github.com/GoogleChromeLabs/squoosh).

### CloudConvert: clear job context and operation-specific options

[CloudConvert](https://cloudconvert.com/) leads with “select a file or drop it here,” then makes the target format and operation visible. Its format catalog groups formats by category, and its security overview describes processing, deletion, and service boundaries. The public workflow also shows that options should depend on the selected operation rather than appearing as an undifferentiated settings form.

Implications:

- Keep source and target formats adjacent so the conversion relationship is visible.
- Group supported formats by type and search the list instead of making users scroll a giant select.
- Render only options supported by the selected output format.
- Make processing status, cancel, retry, and download first-class states. A spinner alone is not a job model.
- If a future cloud mode is added, show exactly where files go, retention, and whether the job is local or remote before the user starts it.

Reference: [CloudConvert security overview](https://cloudconvert.com/security) and [format catalog](https://cloudconvert.com/formats).

### W3C APG: the keyboard contract for searchable choices

[WAI-ARIA APG’s combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) requires a distinct accessible name and value, a collapsed/expanded state, and predictable `Down Arrow`, `Escape`, and `Enter` behavior. It also cautions that a listbox option is a flat accessible name and should not contain interactive controls. The safest implementation for a fixed unit list is a native `<select>` or the existing Radix Select. A searchable list should use the existing `Command` primitive with a documented combobox/listbox contract.

Implications:

- Keep a visible label for category, amount, source unit, target unit, and format.
- Do not put buttons, checkboxes, or links inside a unit listbox option.
- `Escape` closes a picker without silently changing the previous value; `Enter` commits the active option; arrow keys move predictably.
- Keep popup indicators out of the ordinary tab sequence when the pattern allows it.
- Every icon-only action (swap, copy, clear, download, refresh, close) needs an accessible name and a visible focus indicator.

References: [WAI-ARIA overview](https://www.w3.org/WAI/standards-guidelines/aria/) and [combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/).

### GOV.UK and USWDS: errors are part of the task

[GOV.UK’s error-message guidance](https://design-system.service.gov.uk/components/error-message/) says to connect the message to the field, preserve entered values, use a visually hidden “Error” prefix, and explain how to fix the specific problem. [USWDS form guidance](https://designsystem.digital.gov/components/form/) similarly calls for contextual helper text, inline validation, and a clear notification of which field needs attention.

Implications:

- Keep the invalid value in the input so the user can edit it.
- Say “Enter a number greater than or equal to 0” or “Choose a supported output format,” not “Invalid input.”
- Attach field errors through `aria-describedby` and `aria-invalid`; announce async provider and job errors in a polite status region.
- A service/provider failure is different from a user input error. Do not paint a valid amount red when the currency provider is unavailable; show the service state beside the quote and offer retry.

### WCAG 2.2: contrast, keyboard, and resize are product requirements

[WCAG 2.2 SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) requires 4.5:1 contrast for normal text and 3:1 for large text. [SC 2.1.1 Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html) requires all functionality to be operable through a keyboard, and [SC 1.4.4 Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) requires content to remain usable at 200% text resize.

Implications:

- Measure text, borders, focus rings, disabled-but-informative states, badges, and chart labels on both themes after compositing overlays.
- Do not communicate success, stale, or errors with color alone. Pair color with text and/or an icon with a label.
- Keep a visible skip link, predictable focus order, and focus restoration after dialogs/sheets.
- Treat 320 px width, 200% text, and keyboard-only use as acceptance dimensions, not polish tasks.

### Currency authority and formatting

[ECB reference rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html) are usually updated on working days and are published for information; they are not transaction rates. [Frankfurter](https://frankfurter.dev/) is an open-source API that tracks daily rates from central banks and official sources and exposes a simple JSON API. [SIX](https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html) is the ISO 4217 maintenance agency, and [Unicode CLDR currency patterns](https://cldr.unicode.org/translation/number-currency-formats/number-and-currency-patterns) explain locale-specific symbol placement, grouping, decimals, and bidi directionality.

Implications:

- Display the rate source, quote date/time, and the phrase “reference rate” when using ECB/Frankfurter data. Never imply a live trading or guaranteed transaction price.
- Identify currencies by ISO code and localized name; do not rely on a symbol alone because `$`, `¥`, and other symbols are ambiguous.
- Use `Intl.NumberFormat(locale, { style: 'currency', currency })` or equivalent CLDR-backed formatting. Preserve currency-specific minor-unit rules and directionality markers in RTL layouts.
- Cache rates server-side with a bounded TTL and retain the quote timestamp in the result. On stale/offline data, label the result rather than hiding the limitation.

## Proposed information architecture

### App shell

Use a global header with primary workflow navigation. At wide desktop widths (1440 px and above), an optional compact rail may supplement that navigation while the primary workspace remains an active tool plus a context/history column:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ brand   search tools / ⌘K                         locale theme help      │
├───────────────┬──────────────────────────────────┬───────────────────────┤
│ tool rail      │ active workbench                 │ context column        │
│ Units          │ breadcrumb + title               │ Recent                │
│ Currency       │ input / output                   │ source / metadata     │
│ Developer      │ operation controls                │ keyboard shortcuts    │
│ Images         │ result / status                  │ help / privacy        │
│ History        │                                   │                       │
└───────────────┴──────────────────────────────────┴───────────────────────┘
```

The rail is 232–248 px when expanded and 72 px when collapsed. The center column should remain readable at roughly 640–760 px. The context column is 288–336 px and can collapse to a sheet. There should be one primary surface for the active tool; supporting information can use separators, grouped rows, and a few compact panels. At smaller desktop widths, collapse the rail so the active tool and context remain a two-column workspace. Avoid five equal “feature cards” competing with the task.

Suggested URLs:

- `/` opens the last-used tool when a preference exists; otherwise the units converter.
- `/currency`, `/developer`, and `/images` are stable deep links for the other first-release workflows.
- `/history` is a filtered history view, with no raw image or developer payload persisted by default.
- `/about` explains rate sources, local processing, supported formats, and open-source notices.

Keep the active tool in the URL so refresh, browser back/forward, and shared links preserve context. Use server-rendered shell/content where useful, but keep the calculator/editor/image worker islands local and small.

### Responsive behavior

| Width | Shell | Active tool | Context |
| --- | --- | --- | --- |
| 320–639 px | Top bar plus a horizontally scrollable category tab row or compact menu button | One-column flow: context is below results; no fixed-height panel | Recent/history and help become accordions or bottom sheets. Never hide required controls behind hover. |
| 640–1023 px | 72 px icon rail or menu drawer; top bar remains | Center column with a 16–24 px gutter | Context moves to a sheet opened by a labelled button. |
| 1024–1279 px | Expanded rail optional at 232 px | Center column plus a 288 px context panel | Keep input/output rows stacked if labels would wrap. |
| 1280 px and above | Expanded rail + three-region workbench | Center max 760 px; context 320 px | Show recent, source, and help beside the active task. |

Mobile controls must preserve the same semantic order as desktop: tool context, input, source, swap, target, result, actions. Do not reorder visually in a way that changes keyboard reading order.

### Tool-specific flows

#### Units

The unit tool should open with a compact category picker and a prominent two-sided conversion row. Each side includes an amount and unit; the swap button sits between the two relationships and is at least 44×44 px. Show a result sentence such as “1 mile = 1.60934 kilometers,” a copy action, and an optional details disclosure containing the canonical unit/factor and precision policy. Category search should support aliases (“mph”, “kilometre”, “°F”) and announce the active category.

State model: `idle → editing → ready | input-error`; the selected dimension must determine the available units. Unknown units and incompatible dimensions are errors, not silent identity conversions.

#### Currency

Use the same two-sided amount relationship as units, with currency search by ISO code/name and a visible “reference rate as of …” line. Add refresh, source, and stale indicators. The result needs the formatted amount, the unrounded rate in a details area, and a “rate source” link. Keep a last-known result visible during refresh, but announce “Updating rate” and then “Rate updated” or a specific retry message.

State model: `idle → loading → ready | stale | provider-error | input-error`; `stale` must be distinguishable from a valid fresh quote by text and icon, not color only.

#### Developer

Use a tool-level tab strip for small transformations (JSON, Base64, URL, UUID, timestamp) and keep one editor surface active. JSON gets format/minify/validate; Base64 and URL get encode/decode; UUID gets generate/copy; timestamp gets local/UTC/Unix conversions. Use a monospaced editor with a plain `<textarea>` fallback and an output area that remains selectable.

State model: `idle → editing → ready | parse-error | unsupported-input`; preserve input on errors. Never send developer text to a remote endpoint by default. Avoid a “run” button for deterministic local transforms unless the tool is explicitly a job.

#### Images

Use the Squoosh-inspired flow: drop/paste/choose file, then show preview and settings. The first release should support a tested browser-capable subset (for example JPEG, PNG, WebP, and AVIF where the browser supports them); expose capability in the format picker rather than promising every format. Quality, width/height, fit, and metadata stripping should be explicit. Show before/after byte size, dimensions, estimated percentage change, and an accessible download button.

State model: `empty → inspecting → ready → processing → complete | image-error`; support cancel, retry, and clear queue. Processing occurs in a worker or browser API path; show an explicit “Processed on this device” privacy note. A future cloud mode must be opt-in and visually separate.

#### History and recent

Recent items are concise, typed, and replayable for units/currency. Each row has a clear label, source/target, timestamp, and a replay action. Developer history shows tool type and a short metadata summary; do not display or persist raw sensitive content. Image history stores file name/type/size and output metadata only, not image bytes. Add clear-all with confirmation and per-row removal. Use a versioned storage schema and cap the number/size of entries.

## Proposed visual system

The visual direction is “quiet instrument”: warm-neutral canvas, high-contrast ink, one confident blue action color, and a restrained orange signal for image/conversion highlights. Use border and spacing to define regions; reserve shadows and gradients for a few intentional moments. Workbench controls use a coherent local set of filled SVG icons sourced from Bootstrap Icons; the copied shadcn primitives retain their upstream Lucide imports where they are used by those primitives.

### Semantic color tokens

These values are the design source of truth. The existing Tailwind v3 setup expects HSL variables; store the equivalent HSL values in `app/globals.css` so `hsl(var(--token))` utilities continue to work. The hex values are included to make review and contrast testing unambiguous.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `canvas` | `#F7F8FA` | `#0B1220` | page background |
| `surface` | `#FFFFFF` | `#111827` | active workbench and panels |
| `surface-subtle` | `#F2F4F7` | `#182230` | inputs, grouped rows, rail |
| `surface-strong` | `#EAECF0` | `#243244` | selected/pressed surfaces |
| `ink` | `#101828` | `#F9FAFB` | primary text |
| `ink-muted` | `#475467` | `#CBD5E1` | supporting text; must remain readable |
| `ink-faint` | `#667085` | `#A9B6C8` | metadata and timestamps after contrast check |
| `border` | `#D0D5DD` | `#334155` | dividers and control boundaries |
| `border-strong` | `#98A2B3` | `#64748B` | selected/hover boundaries |
| `action` | `#155EEF` | `#8EA7FF` | primary action, links, focus ring |
| `action-hover` | `#123AA8` | `#B4C4FF` | hover/pressed action |
| `action-soft` | `#E8EEFF` | `#1D2A4A` | selected tint and callout |
| `signal` | `#C2410C` | `#FFB088` | image/format accent; pair with ink in dark mode |
| `success` | `#067647` | `#4ADE80` | successful result/status |
| `warning` | `#B54708` | `#FDBA74` | stale, caution, recoverable issue |
| `danger` | `#B42318` | `#FCA5A5` | user-correctable error |

Do not put normal body text on `action-soft`, `signal`, or `warning` without checking the composited pair. Every color-only state needs text/icon support. Focus rings are 2 px action plus a 2 px canvas offset, visible in both themes.

### Type, spacing, and shape

- Keep Inter for the UI to avoid a new font dependency. Use a system mono stack (`ui-monospace`, `SFMono-Regular`, `Menlo`, `Consolas`) for values and code.
- Body: 14 px / 20 px; compact metadata: 12 px / 16 px; labels: 13 px / 18 px at 600 weight; tool title: 28 px / 34 px at 700; page title never needs to exceed 36 px.
- Use a 4 px base spacing scale. Primary gutters: 16 px mobile, 24 px tablet, 32 px desktop. Active tool sections use 24 px vertical rhythm.
- Controls are 44 px minimum height; icon buttons are 44×44 px even when the icon itself is 18–20 px.
- Radius: 10 px controls, 12 px workbench panels, 8 px rows, 999 px pills. Avoid rounding every nested element.
- Borders are 1 px. Use `box-shadow: 0 1px 2px rgba(16,24,40,.06)` for an active panel and a larger shadow only for a modal/sheet. Do not animate shadow continuously.
- Data and code use tabular numerals where supported (`font-variant-numeric: tabular-nums`) so changing results do not jump.

### Motion

- 150 ms for hover/focus color and border changes; 200 ms for opening a menu/sheet; no repeated decorative loops.
- Animate opacity/transform only. Do not animate layout height or large blur on every conversion.
- Initialize client behavior after the component is ready; static result/input HTML should remain usable before hydration where possible.
- Honor `prefers-reduced-motion` at runtime, including changes during a session. Disable theme reveal, panel slides, hover rotation, and result choreography when reduced motion is set.
- Never rely on a timeout to make the only result visible. Use a live status region for asynchronous work.

## Component inventory and license review

Use the installed primitives first. The links below are primary project documentation or repositories; license names are what the repositories currently declare and should be rechecked when upgrading.

| Need | Reuse/choice | License and notes |
| --- | --- | --- |
| Shell, forms, panels, dialogs | Existing shadcn/ui source under `src/components/ui` backed by Radix | [shadcn/ui](https://github.com/shadcn-ui/ui) is MIT. It distributes source for customization; keep local changes deliberate and preserve notices. |
| Accessible primitives | Existing Radix Select, Dialog, Sheet, Tabs, Tooltip, Separator, ScrollArea | [Radix Primitives](https://github.com/radix-ui/primitives) is MIT. Keep the installed Radix base; verify Title/Description and focus behavior for every overlay. |
| Tool icons | Local filled SVG paths in `FlatIcon.tsx` | [Bootstrap Icons license](https://github.com/twbs/icons/blob/main/LICENSE) is MIT. The workbench copies only the small paths it needs, records attribution in `THIRD_PARTY_NOTICES.md`, and pairs every icon with text or an accessible name. |
| Tool search/command palette | Existing `cmdk` through shadcn Command | [cmdk](https://github.com/pacocoursey/cmdk) is MIT. Use for tool/unit/format search and document `⌘K`/`Ctrl+K`, Escape, arrows, and Enter. |
| Toast/status feedback | Existing Sonner or the existing toast wrapper, one root toaster | [Sonner](https://github.com/emilkowalski/sonner) is MIT. Mount one toaster; prefer inline status for conversion results and errors so feedback is not transient-only. |
| History trend (later) | Existing Recharts | [Recharts](https://github.com/recharts/recharts) is MIT. Defer until a real trend/history requirement exists; provide a table or text summary for screen readers. |
| Image drop/paste | Native file input plus drag/drop; optionally `react-dropzone` | [react-dropzone](https://github.com/react-dropzone/react-dropzone) is MIT. It is optional; do not add it solely for a styled dropzone if native input and small event handlers suffice. |
| Local image processing | Browser APIs/worker first; study Squoosh codecs before adding packages | [Squoosh](https://github.com/GoogleChromeLabs/squoosh) is Apache-2.0 and local-first. Copying codecs or source requires preserving its notices and checking transitive licenses. Prefer an explicit capability matrix over silently shipping a large codec bundle. |
| Developer editor | Plain textarea first; CodeMirror 6 only when syntax editing justifies it; Monaco is a later option | [CodeMirror](https://github.com/codemirror/dev) is MIT; [Monaco](https://github.com/microsoft/monaco-editor) is MIT but has a heavier worker/bundle footprint. Use dynamic import and do not block the first conversion screen. |
| Currency data | Server-side provider adapter; Frankfurter/ECB reference rates for the first release | [Frankfurter](https://github.com/lineofflight/frankfurter) is MIT and tracks official central-bank sources. [ECB reference rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html) are informational, usually working-day updates, and must be labelled accordingly. |
| Number/currency formatting | Built-in `Intl.NumberFormat` backed by CLDR | [CLDR currency patterns](https://cldr.unicode.org/translation/number-currency-formats/number-and-currency-patterns) are the formatting authority. Avoid a new formatting library unless a tested gap is demonstrated. |

Template references are useful for patterns and migration checks, but none should be adopted wholesale:

- [shadcn/ui official Next template and registry](https://github.com/shadcn-ui/ui) — MIT source, local-copy model, and the closest fit for the existing Radix/Tailwind investment.
- [Vercel Next.js examples](https://github.com/vercel/examples) — MIT repository; use narrow examples for metadata, workers, or deployment rather than importing a dashboard shell.
- [Next.js SaaS Starter](https://github.com/nextjs/saas-starter) — MIT repository; useful later for auth/database slices, but too feature-heavy for an anonymous first-release converter.

A dashboard template usually adds decorative cards, fake metrics, and unnecessary dependencies. The existing shadcn source is sufficient for the proposed shell when composed around real tool contracts. Recheck the repository license and preserve notices before copying source from any template.

The product should include a small `THIRD_PARTY_NOTICES` or `/about#licenses` entry before release, covering any source copied from shadcn, Radix, Lucide, Sonner, Squoosh/codecs, CodeMirror, and other runtime packages according to the chosen distribution model.

## Recommended architecture and data contracts

The monorepo should separate deterministic conversion logic from UI and delivery:

```
apps/web                 Next.js app shell, routes, local workers, accessible UI
apps/api                 Fastify API, provider adapters, OpenAPI, bounded jobs
packages/conversion-core pure dimensions, unit registry, arithmetic, and errors
packages/contracts      TypeBox/JSON Schema and generated OpenAPI types
packages/ui              shared tokens/primitives once a second consumer exists
packages/config          shared tooling presets once a second consumer exists
packages/test-fixtures  deterministic vectors shared by core and API tests
apps/worker              later, only after an asynchronous media job is defined
```

The first pass can keep `apps/web` and Next route handlers together if the repository does not yet need a separate deployment. Keep the package boundaries in the source layout so a later `apps/api` extraction does not require rewriting business logic. Do not create a `packages/rates`, `packages/tools`, or `packages/media` boundary until a second consumer makes it real; those responsibilities belong in the core/API boundaries described in the repository instructions for now.

Every result should carry a typed status and provenance. A minimal shared shape is:

```ts
type OperationStatus =
  | 'idle'
  | 'editing'
  | 'loading'
  | 'processing'
  | 'ready'
  | 'stale'
  | 'input-error'
  | 'provider-error'
  | 'unsupported'

type OperationResult<T> = {
  status: OperationStatus
  input: T
  output?: T
  message?: string
  updatedAt?: string
  source?: { name: string; url?: string }
  requestId?: string
}
```

The concrete payload should remain tool-specific and serializable. A unit result needs dimension, source unit, target unit, raw numeric result, displayed result, and precision. A currency result needs source/target ISO codes, rate, quote date, provider, and stale flag. An image result needs file metadata, output MIME/type, byte counts, dimensions, and a revocable blob URL. A developer result needs input/output or a structured parse error with line/column when available.

Do not use a mutable module-level cache in the server for user-specific state. Rate caches need bounded TTL and provider failure handling. Local history must be versioned and size-capped; never put access keys or provider secrets in `PUBLIC_` variables or serialized page props.

## Roadmap and media plan

### Phase 0: foundation

- Keep pnpm 11.25.0 as the monorepo package manager and one `pnpm-lock.yaml`; do not reintroduce npm/Bun lockfiles.
- Keep the Radix/shadcn component source boundary; the workbench uses local filled Bootstrap SVG paths and does not add an icon runtime.
- Replace the global transition and gradient-heavy tokens with the semantic system above.
- Build the shell, skip link, focus styles, rail, command search, responsive sheets, theme/locale controls, and status region.

### Phase 1: units

- Move all factors into a typed dimension registry with aliases and incompatibility errors.
- Add the unit workbench, replayable local history, copy, precision disclosure, and tests against known values.
- Keep current length/volume/mass/energy/temperature coverage while adding area, speed, time, and data only when factors and labels are verified.

### Phase 2: currency

- Add a provider adapter and server cache around ECB/Frankfurter reference data.
- Implement stale/offline/provider-error states, timestamp/source disclosure, ISO search, and CLDR/`Intl.NumberFormat` output.
- Add tests for quote math, inverse/identity cases, formatting in English and at least one RTL locale, and stale behavior.

### Phase 3: developer tools

- Implement deterministic JSON, Base64, URL, UUID, and timestamp tools with preserved input and inline errors.
- Add a textarea editor and dynamically load CodeMirror only if syntax features are needed.
- Add copy/download where output is user-created, without remote logging or payload persistence by default.

### Phase 4: images

- Implement native file input, drag/drop, paste, capability-aware format picker, worker processing, preview, compare, byte/dimension metrics, metadata policy, and download.
- Test browser support and memory limits with large files; add a clear error and cancel path.
- Add Squoosh/codec notices only for code actually redistributed.

### Phase 5: quality and expansion

- Add keyboard shortcuts help, route/deep-link coverage, shareable recipes that exclude sensitive payloads, and optional PWA/offline shell.
- Add visual regression and accessibility checks at 320, 390, 768, 1024, and 1440 px plus 200% zoom.
- Consider batch image queues, saved unit presets, historical currency charts, and opt-in cloud conversion only after the local workflows are reliable.

Media should support the product rather than decorate it:

- A simple wordmark/icon uses the local filled SVG language; do not ship a stock hero illustration.
- The image tool can use one or two local sample images for discovery, labelled with dimensions and sizes, following the Squoosh pattern.
- Format and tool icons use consistent 16–20 px filled SVGs with labels and text alternatives. Do not use brand logos as substitutes for format names.
- Empty states should show the next useful action (“Choose a file,” “Enter an amount,” “Paste JSON”), not invented metrics or testimonials.

## Acceptance criteria

### Product behavior

- The default route opens a functional unit conversion workbench with no fake metrics or placeholder results.
- Units, currency, developer, and image tools produce real results for their documented supported inputs and expose clear unsupported/error states.
- Unit conversion rejects incompatible dimensions and unknown units instead of silently returning the original input.
- Currency output shows ISO codes/names, formatted amount, rate, quote timestamp, provider/source, and stale/error status. Reference rates are not presented as transaction guarantees.
- Developer tools preserve input on parse/validation errors and make output selectable/copyable.
- Image conversion defaults to bounded server processing, with an explicit on-device fallback; it shows processing/complete/error states, revokes object URLs, and downloads a real file.
- History survives reload only for safe scalar metadata, is replayable where supported, is versioned/capped, and can be cleared completely.

### Accessibility and interaction

- One descriptive `h1` is present per route; landmarks and heading order are meaningful.
- Every field has a persistent visible label, a programmatic description where needed, and an error relationship. Every icon-only control has an accessible name.
- Result updates and asynchronous loading/error messages are announced in a polite live region without stealing focus.
- Selects/searches follow APG/native keyboard behavior: Tab enters the control, arrows move options, Escape closes without accidental change, Enter commits, and focus returns predictably.
- Keyboard users can reach every tool, open/close the rail/sheet/dialog, copy/download, clear history, and switch themes/locales. Focus is visible and never trapped outside an active modal.
- Normal text reaches at least 4.5:1 contrast and large text at least 3:1 in light/dark, including hover, focus, selected, warning, stale, and error states. Non-text control boundaries/focus indicators are measured separately.
- At 320–390 px there is no horizontal overflow or fixed-height text truncation. At 200% text resize, the tool remains usable. Touch targets are at least 44×44 px.
- Reduced motion disables theme reveals, panel choreography, decorative loops, and nonessential result animation, including after a preference change.

### Privacy and delivery

- Units and deterministic developer transforms do not make network requests.
- The image path defaults to server conversion and sends a file only after the user presses Convert; on-device mode makes no upload request. The UI explains the selected mode and gives the user a clear way to remove the selected file.
- Provider keys/secrets stay server-side. Logs contain operation metadata and stable error codes, never raw developer text, image content, or full personal payloads.
- Currency provider failures, timeouts, stale data, and retry behavior are deterministic and testable with mocks.
- Any cloud image/file conversion is an explicitly separate, opt-in flow with retention/deletion language.

### Verification matrix

- Run production build and type/lint checks with the selected package manager.
- Exercise direct load, refresh, back/forward, deep links, and no-JavaScript/server-fallback behavior where applicable.
- Verify keyboard-only flows, screen-reader labels/statuses, reduced motion, light/dark, English and RTL/long-label formatting, 320/390/768/1024/1440 px, and 200% zoom.
- Test known conversion vectors, currency identity/inverse/rounding/stale states, developer malformed inputs, image unsupported formats/large files/cancel/retry, and clipboard/download failures.
- Inspect the browser network panel during image and developer work to confirm no unexpected upload or payload telemetry.
- Run an automated accessibility pass and a manual focus pass; treat failures as release blockers for the affected tool.

## UI audit and icon decision — 2026-10-04

This follow-up audit reviewed the current `apps/web` source, the 320/390/768/1440px screenshots in `docs/research/artifacts/`, and the rendered-workbench acceptance paths. The fresh [Vercel Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) were checked against the source, alongside the [WAI-ARIA APG tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/), [WCAG 2.2 target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), and the official [Bootstrap Icons README](https://github.com/twbs/icons/blob/main/README.md) and [license](https://github.com/twbs/icons/blob/main/LICENSE).

### Findings and implemented fixes

| Severity | Source finding | Implemented disposition |
| --- | --- | --- |
| High | At narrow widths the header hid search and About, while the footer only repeated the keyboard shortcut. | Added a real mobile Search tools button, a mobile-visible About link, a workflow `<nav>` landmark, and a touch-sized mobile footer hint in `Workbench.tsx`/`globals.css`. |
| High | The image picker used a `display:none` file input with a styled label inside a focusable group; keyboard users could not reliably invoke the picker. | Replaced the label trigger with a real keyboard-operable button wired to the native file input. Drag and paste remain supported. |
| High | Developer controls used `role=tablist`/`role=tab` without the APG roving-focus and arrow-key contract. | Replaced the custom tabs with a labelled native `<select>`, preserving all operations without a false accessibility contract. |
| High | The mobile unit flow rendered Result before the To selector, and long panel hints could overflow at 320px. | CSS ordering now presents Amount → From → To → Result; panel hints wrap at narrow widths and the main target has `tabIndex=-1` plus scroll margin for skip-link focus. |
| Medium | Workbench icons were outline Lucide glyphs while the requested visual direction was flat filled icons. | Added `FlatIcon.tsx` with only the required Bootstrap Icons MIT paths and replaced Workbench imports. Shadcn-generated primitives retain their own upstream notice. |
| Medium | Local history writes could throw on quota/privacy failures, malformed entries were accepted too broadly, and timestamp values were not bounded. | Reads validate entry shape and finite timestamps; writes are guarded so storage cannot block conversion. |
| Medium | Currency provider errors were inferred from message text and could mark a valid amount as a field error. | Amount validation now has a dedicated error state; provider/network errors are announced beside the workflow and never attached to the amount field. |
| Medium | Theme icon/toggle read `theme` instead of the resolved system theme, so the first click could be a no-op in system-dark mode. | The control uses `resolvedTheme` after a mounted guard, preserving the initial server/client markup and toggling the effective theme. |
| Low | Clipboard failure was silent to sighted users. | Copy failures now render an inline actionable message while also announcing status politely. |

### Verification boundary

The repository’s deterministic browser QA uses Playwright with system Chrome, routes real unit/currency/image/developer workflows, checks 320/390/768/1440px overflow, keyboard shortcuts, reduced motion, theme contrast, history, stale/error states, image download, and request cancellation. This audit did not constitute moderated user research or a screen-reader session. A manual 200% zoom pass and real assistive-technology pass remain release follow-ups; the existing image `<img>` lint advisory also remains documented. The no-JavaScript notice is now truthful: headings and guidance render, while conversion actions require JavaScript in this release.

## References

- [WAI-ARIA Authoring Practices: combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
- [WAI-ARIA Authoring Practices: tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
- [WAI-ARIA overview](https://www.w3.org/WAI/standards-guidelines/aria/)
- [WCAG 2.2: contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [WCAG 2.2: target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [WCAG 2.2: keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html)
- [WCAG 2.2: resize text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)
- [GOV.UK Design System: error message](https://design-system.service.gov.uk/components/error-message/)
- [GOV.UK Design System: text input](https://design-system.service.gov.uk/components/text-input/)
- [USWDS: forms](https://designsystem.digital.gov/components/form/)
- [Squoosh](https://squoosh.app/) and [Squoosh source/license](https://github.com/GoogleChromeLabs/squoosh)
- [CloudConvert](https://cloudconvert.com/) and [CloudConvert security](https://cloudconvert.com/security)
- [ECB euro reference exchange rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html)
- [Frankfurter API](https://frankfurter.dev/) and [Frankfurter source/license](https://github.com/lineofflight/frankfurter)
- [ISO 4217 currency codes](https://www.iso.org/iso-4217-currency-codes.html) and [SIX maintenance agency](https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html)
- [Unicode CLDR currency patterns](https://cldr.unicode.org/translation/number-currency-formats/number-and-currency-patterns)
- [shadcn/ui docs](https://ui.shadcn.com/docs) and [shadcn/ui source/license](https://github.com/shadcn-ui/ui)
- [Radix Primitives source/license](https://github.com/radix-ui/primitives)
- [Lucide source/license](https://github.com/lucide-icons/lucide)
- [Bootstrap Icons README](https://github.com/twbs/icons/blob/main/README.md) and [license](https://github.com/twbs/icons/blob/main/LICENSE)
- [Vercel Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)
- [cmdk source/license](https://github.com/pacocoursey/cmdk)
- [Sonner source/license](https://github.com/emilkowalski/sonner)
- [Recharts source/license](https://github.com/recharts/recharts)
- [React Dropzone source/license](https://github.com/react-dropzone/react-dropzone)
- [CodeMirror source/license](https://github.com/codemirror/dev)
- [Monaco Editor source/license](https://github.com/microsoft/monaco-editor)
