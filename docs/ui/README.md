# UI screenshots and inventory

Proof for the UI plan (`docs/design/SQL Lab UI and UX Plan.md`, section 8). Not deployed: `docs/` is left out of the site by the Pages workflow.

| Path | What it is |
|---|---|
| `before/` | The interface before the redesign (commit 0a088a7), captured at the start of Phase 1. |
| `after/phase-N/` | The same states after phase N, with a `README.md` that pairs them with `before/` and records the self-review of section 8. |
| `UI_INVENTORY.md` | Every interactive element before the redesign, its handler, the tests that pin it, and its new home. Phase 2 ticks each row. |

Every matrix has the same three viewports (1366×768, 1920×1080, 390×844), both themes, and the states below. A file is named `<state>--<viewport>--<theme>.png`; screenshots are full-page, at device scale 1, with motion reduced.

| State | What is on screen |
|---|---|
| `first-visit` | The default database just opened. The interface before Phase 4 has no empty state: a first visit runs a preview of the first table. |
| `no-result` | No result yet: the page reloaded after a run, the last query is back in the editor and nothing has run. |
| `result` | The mockup's query (revenue share by category, a CTE and a window function) and its five rows. |
| `error` | `SELECT product_name, pric FROM products ...`: no such column. |
| `schema-expanded` | The `products` table expanded in the schema sidebar. |
| `menu-history` | The run history open after two runs. |
| `menu-theme` | The Theme menu open (from Phase 1; not in `before/`). |
| `evidence-dialog` | The evidence export dialog. |
| `exercise-prompt` | Exercise 5 of the Northlight set, "Online sales by category". |
| `exercise-correct` | Its answer, checked. |
| `exercise-wrong` | Its answer sorted the wrong way, checked: row 1 differs, with the Expected and Yours tables. |

The native selects of the old interface (Dataset, Exercises) open outside the page, so no screenshot can show them open.

To take a matrix: serve the site (`node tests/static-server.mjs 4301 /`), then `node tools/ui-matrix.mjs --url http://127.0.0.1:4301/ --out docs/ui/after/phase-N`. The states are the recipes of `tests/ui-states.js`, which the accessibility test (`tests/ui-a11y.spec.js`) also drives.
