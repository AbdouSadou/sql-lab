# SQL Lab redesign mockup

Seven static HTML screens that show the target look for the UI and UX plan.
Put this folder in the repo at `docs/design/mockup/` and open any file in a browser.

| File | Screen | Viewport |
| --- | --- | --- |
| `main-light.html` | Query result, light theme | 1366 x 768 |
| `main-dark.html` | Query result, dark theme | 1366 x 768 |
| `first-visit.html` | First visit, no result yet, sample queries | 1366 x 768 |
| `error.html` | Query error | 1366 x 768 |
| `exercise-correct.html` | Exercise mode, correct answer | 1366 x 820 |
| `exercise-wrong.html` | Exercise mode, wrong answer with Expected and Yours | 1366 x 820 |
| `phone.html` | Phone, result tab | 390 x 844 |

## How to use these

- They are the visual reference: match layout, spacing, colour and type. The plan governs behaviour.
- Every colour is written as a literal hex value so it can be read off directly. Each one is a token
  from section 3 of the plan; the real site must use the CSS custom properties, never raw hex.
- Nothing here is interactive. Buttons, tabs and menus are drawn in one state only.
- Fonts load from Google Fonts in these files for convenience. The real site vendors Atkinson
  Hyperlegible Next and Mono into `vendor/fonts/` and makes no third-party requests.
- Icons are inline SVG in the Lucide style; the real site uses a single sprite built from `lucide-static`.
- The data is real: every result shown is what the query above it returns on `northlight_retail.db`.
  Timings and exercise titles are illustrative.
