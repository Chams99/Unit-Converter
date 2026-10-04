# Initial UI audit baseline · 2026-10-04

> Historical baseline captured before the latest responsive fixes and audit-runner updates. Its 200 checks, 198 passes, 1 failure, and 1 error are preserved for comparison and are not current final verification. The updated runner writes separately to `final/` and requires an explicit `BASE_URL` for the Universal Convertal web app.

Measured against **http://localhost:3000** with system Chrome through Playwright 1.63.0. The script did not start, stop, or rebuild the application server. Screenshots cover 5 routes × 2 themes × 4 viewport widths.

This is the pre-fix baseline retained for comparison. The final-source audit,
when available, is recorded separately under [`final/`](./final/); do not use
these baseline counts as the final result.

## Results

- Checks: 200
- Passed: 198
- Failed: 1
- Errors: 1
- Screenshots: 40
- Findings: 2

## Findings for design review

- **P2 about-shell: About route omits the shared navigation shell.** /about has no skip link, primary navigation, theme control, or footer in the captured HTML.
- **P1 units-long-number-overflow: Long unit input creates horizontal overflow.** A 100-digit amount expanded the document to 1108px at a 390px viewport.

## Failed or incomplete checks

- **fail** units:long-number-reflow: 100-digit amount widths: body 1108, root 1108, viewport 390.
- **error** developer-checks: locator.selectOption: Error: strict mode violation: getByLabel('Transformation') resolved to 2 elements:
    1) <section class="workspace-panel developer-panel" aria-labelledby="developer-workspace-title">…</section> aka getByRole('region', { name: 'Pick a transformation' })
    2) <select autocomplete="off" id="field-transformation" name="field-transformation">…</select> aka getByLabel('TransformationJSONBase64URL')

Call log:
[2m  - waiting for getByLabel('Transformation')[22m


## Limits

- Firefox and WebKit were not available in the installed Playwright browser cache; no Safari or Firefox result is claimed.
- 200% browser zoom was not available as a reliable Playwright context setting; CSS reflow and 320px proxy checks are recorded, but no browser-zoom claim is made.
- No external currency provider was called. Currency behavior below uses deterministic route mocks.

Machine-readable evidence is in [results.json](./results.json); screenshots are in [screenshots](./screenshots).
