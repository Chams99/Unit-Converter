# UI audit · 2026-10-04

Measured against **http://127.0.0.1:3000** with system Chrome through Playwright 1.63.0. The script did not start, stop, or rebuild the application server. The baseline matrix covers 5 routes × 2 themes × 4 viewport widths. Separate checks captured 5 routes at 200% root font size and 1 interaction state(s); root font scaling is not browser zoom.

## Results

- Checks: 343
- Passed: 335
- Failed: 0
- Errors: 0
- Skipped: 8
- Screenshots: 46 (40 matrix, 5 text resize, 1 interaction)
- Findings: 1

## Findings for design review

- **P2 about-shell: About route omits the shared navigation shell.** /about has no skip link, primary navigation, theme control, or footer in the captured HTML.

## Failed or incomplete checks

- None.

## Limits

- Firefox and WebKit were not available in the installed Playwright browser cache; no Safari or Firefox result is claimed.
- 200% browser zoom was not available as a reliable Playwright context setting. A separately labeled 200% root-font-size reflow check is recorded; it is not a browser-zoom result.
- No external currency provider was called. Currency behavior below uses deterministic route mocks.

Machine-readable evidence is in [results.json](./results.json); screenshots are in [screenshots](./screenshots).
