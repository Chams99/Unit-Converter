# Explicit unit history verification

Verified 2026-10-05 against a Next.js 16.3.8 production build served locally on Node.js 24.11.1, using headless Chrome on Windows. The local preview was served by `next start`; Docker standalone deployment is checked separately by the repository's CI smoke job.

The former 1.2-second autosave timer and copy-result save callback were removed. Only **Save to history** records unit conversions. The save button is disabled for empty, partial, invalid, or impossible inputs, and provides an accessible status announcement. Existing entries and the current clear/undo behavior remain available.

## Results

- **13 browser cases passed.** Eight cases cover 320, 390, 768, and 1440px in light and dark themes. Each checks that category changes, typing, source/target choices, swaps, comparison-list choices, copying, waiting, and restoring do not save; explicit keyboard saves persist and deduplicate; invalid input disables saving; and clear/undo and reload work.
- Additional cases cover existing entries and shared URLs, below-absolute-zero input, blocked storage, malformed storage, normal motion, client navigation and browser back, changing reduced-motion preference, and 200% zoom reflow emulation.
- All eight route/width/theme cases passed axe checks scoped to the unit and history panels. Save targets are at least 44×44px, and there is no horizontal overflow at the tested widths.
- API requests were intercepted and blocked in every test context; the checks observed **zero API requests**. No currency provider or uploaded file was used.
- The affected frontend/dependency lint, type-check, and build tasks passed. Lint retains the existing `@next/next/no-img-element` warning for the image-file preview. The production dependency audit reported no known vulnerabilities.

The 200% zoom case uses a 720×450 CSS viewport at device scale 2, equivalent to a 1440×900 physical viewport. Native browser zoom controls, screen readers, and a fresh full-site/performance audit were not tested. The broader existing UI/browser scripts were updated for explicit history saving, but were not rerun in full for this focused change.

Machine-readable results: [results.json](results.json). Screenshots: [mobile light](units-390-light.png), [desktop dark](units-1440-dark.png).

## Repeat

Start the production web build locally, then run:

```powershell
$env:BASE_URL = 'http://127.0.0.1:3220'
pnpm --filter @universal-convertal/web qa:history
```

Use `CHROME_PATH` for an alternate Chrome executable and `QA_ARTIFACT_DIR` for a different artifact directory. This test does not start the web server.
