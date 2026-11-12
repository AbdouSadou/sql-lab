# UI screenshots and inventory

Proof for the UI plan (`docs/design/SQL Lab UI and UX Plan.md`, section 8). Not deployed: `docs/` is left out of the site by the Pages workflow.

| Path | What it is |
|---|---|
| `before/` | The interface before the redesign (commit 0a088a7), captured at the start of Phase 1. |
| `after/phase-N/` | The same states after phase N, with a `README.md` that pairs them with `before/` and records the self-review of section 8. |
| `UI_INVENTORY.md` | Every interactive element before the redesign, its handler, the tests that pin it, and its new home. Phase 2 ticked each row with where it lives now (or, until its later phase, where it works meanwhile); Phase 3 moved the editor's rows to CodeMirror; Phase 4 the result area's, the toasts' and the dialogs'; Phase 5 the exercise mode's. |

Every matrix has the same three viewports (1366×768, 1920×1080, 390×844), both themes, and the states below. A file is named `<state>--<viewport>--<theme>.png`; screenshots are full-page, at device scale 1, with motion reduced. The 390×844 shots are taken as a phone (a touch screen) and, as the page scrolls there, are as tall as the page. To draw past the window Chromium leaves mobile emulation, so from Phase 4 the tool pins the page's pointer and hover media rules first and the shot keeps the touch screen's 44 px controls (the phone shots of Phases 2 and 3 that are taller than 844 px show a mouse's 32 px ones). A fixed layer (a dialog's scrim, a toast) covers the first 844 px, the window the student sees.

| State | What is on screen |
|---|---|
| `first-visit` | The default database just opened. Before Phase 4 a first visit ran a preview of the first table; from Phase 4 nothing runs, and the results pane shows "no result yet" with Northlight's three sample queries (the mockup's `first-visit.html`). |
| `no-result` | No result yet: the page reloaded after a run, the last query is back in the editor and nothing has run. |
| `loading`, `loading-progress` | From Phase 4: the default database on its way (its request held back): its name and the progress bar, empty while its size is unknown; then with half the file arrived: "43 KB of 86 KB" and the bar half full. |
| `result` | The mockup's query (revenue share by category, a CTE and a window function) and its five rows. |
| `capped`, `zero-rows` | From Phase 4: `SELECT * FROM order_items` (906 rows, the first 500 shown) and a query that returns no rows (the header and its rules). |
| `long-cell` | From Phase 4: a value longer than 60 characters, pressed: the whole value in a popover. |
| `done` | From Phase 4: a run with no result set (CREATE TABLE and an INSERT): "Done. 2 rows changed". |
| `error` | `SELECT product_name, pric FROM products ...`: no such column (from Phase 4, the error band of `error.html`). |
| `load-problem`, `empty-database` | From Phase 4: a damaged share link (the error band over "no result yet"), and no list of databases (an empty database: the band, what to do, the links to About and SQLite's functions). |
| `toast`, `link-popover` | From Phase 4: Copy link's toast, and its popover with the link when the browser keeps the clipboard to itself. |
| `schema-expanded` | The `products` table expanded in the schema sidebar. |
| `menu-history` | The run history open after two runs (the interface before Phase 2; `history` from then on). |
| `history` | From Phase 2: the History tab after three runs, one of them failed. |
| `menu-theme` | The Theme menu open (from Phase 1; not in `before/`). |
| `menu-database`, `menu-export`, `menu-help`, `menu-exercise-set` | From Phase 2: the database switcher's menu, the Export menu, the Help popover and the exercise set picker's menu, open. |
| `menu-completion` | From Phase 3: the editor's list of names, open after `SELECT * FROM pro`. |
| `open-url-dialog`, `open-url-error` | From Phase 4: the Open from URL dialog (it was `window.prompt`), and the same with an address it cannot open (`gist:abc123`), refused in the dialog. |
| `evidence-dialog` | The evidence export dialog. |
| `exercise-prompt` | Exercise 5 of the Northlight set, "Online sales by category". From Phase 5 with Previous and Next beside the hint button. |
| `exercise-hints` | From Phase 5: the same exercise with two of its three hints shown, under the buttons. |
| `exercise-correct` | Its answer, checked (from Phase 5 the banner: "Correct. 5 rows match." and Next exercise). |
| `exercise-wrong` | Its answer sorted the wrong way, checked: row 1 differs, with the Expected and Yours tables (from Phase 5 side by side, the cells that differ outlined). |
| `exercise-not-quite` | From Phase 5: a wrong answer that is not a row of difference (one column where two are expected): "Not quite." and the checker's message, no tables. |
| `exercise-no-query` | From Phase 5: Check with nothing in the editor: "Nothing to check." |
| `exercise-complete` | From Phase 5: the last exercise of the set passed: "All 10 exercises complete. Well done." and no Next exercise. |

The native selects of the old interface (Dataset, Exercises) open outside the page, so no screenshot can show them open. "Running…" shows only while a run blocks the page, when a screenshot cannot be taken; Phase 4's README has frames of it from a video instead.

To take a matrix: serve the site (`node tests/static-server.mjs 4301 /`), then `node tools/ui-matrix.mjs --url http://127.0.0.1:4301/ --out docs/ui/after/phase-N --ui shell` (`--ui legacy` for the interface before Phase 2). From Phase 2 the same states are also screenshot baselines (`tests/ui-visual.spec.js`), compared on every test run. The states are the recipes of `tests/ui-states.js`, which the accessibility test (`tests/ui-a11y.spec.js`) also drives.
