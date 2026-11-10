# SQL Lab UI and UX Plan

Nov 10, 2026 · @Abderrahmane Moubarek Sadou

Six PR-sized phases turn the working SQL Lab into a modern three-pane workbench without changing what it does.

## 1. Guardrails

This is a reskin and re-layout, not a rewrite: every feature that works today must work identically afterwards.

- **Audience**: an autonomous coding agent. Work the phases in §7 in order, one PR per phase.
- **Sub-agents**: any sub-agent you spawn, whatever its purpose, runs on Claude Sonnet 5.5 at high reasoning effort. Set both explicitly on every spawn; sub-agents never inherit this session's model.
- **Still binding from the build spec**: static site on GitHub Pages; no third-party requests at runtime (fonts, icons and libraries are vendored); initial load ≤ 3 MB excluding datasets; relative URLs only; no cookies or analytics; MIT licence with the SQLime credit visible.
- **Behaviour freeze**: no change to query execution, exercise checking, the share-link format, the evidence-export format and checksum, or existing localStorage keys. Links and evidence files created before this work must still open and verify.
- **Tests**: the existing acceptance suite stays green in every phase. When a selector changes, update the test; never delete an assertion.
- **Tooling**: plain CSS custom properties and vanilla JS. No UI framework, no CSS framework. One build step is allowed, for bundling the editor in Phase 3, with its output committed to `vendor/`.
- **Platform features to prefer**: native `<dialog>` for modals and the `popover` attribute for menus, so focus handling and light-dismiss come from the browser.
- **Out of scope**: new features (charts, lesson pages, linting), changes to exercise content, and anything that alters what a query returns.

## 2. What is wrong today

Twelve problems on the current screen, each mapped to its fix and the phase that delivers it.

| What is wrong today | Fix | Phase |
| --- | --- | --- |
| Actions are bare text links in mixed weights; nothing reads as a button and Run is not visually primary | Real buttons: one filled primary per context, the rest quiet; related actions grouped into menus | 2 |
| Two controls name the database: an editable `northlight_retail.db` showing a spell-check squiggle, and a Dataset dropdown | One database switcher; any rename moves into the export dialog; `spellcheck="false"` on filename inputs | 2 |
| The page is a scrolling document; about half the viewport sits empty while results get whatever is left | A full-height app shell with a resizable editor and results split | 2 |
| Schema sits in a narrow fixed column on the right | A left sidebar, resizable and collapsible, where SQL tools conventionally put the object browser | 2 |
| The editor is a plain textarea: no highlighting, line numbers or completion | CodeMirror 6 with schema-aware autocomplete | 3 |
| The toolbar (run, tables, copy link, history) sits inside the editor box, and the SQLite version takes prime space | A toolbar row above the editor; the version moves to the status bar | 2 and 3 |
| `tables` duplicates the Schema panel | Remove it; if it previews rows today, keep that as a Preview action on each sidebar table | 2 |
| A permanent keyboard hint ("Press Tab to indent…") adds a line of noise for every user | Move it to Help; keep it attached to the editor with `aria-describedby` | 3 |
| The empty results area shows only a status sentence | A designed empty state with sample queries to try | 4 |
| `evidence` and the `i` icon are unexplained | "Export evidence…" in the Export menu with one line on its purpose; a labelled Help button | 2 |
| No theme control is visible, and several greys look below AA contrast (verify both) | Token-based light and dark themes with a toggle; contrast tested | 1 |
| The footer spends a full row on credits | The credit moves to the status bar as a link to About | 2 |

## 3. Design direction

The look is a ledger: ink on paper, with the result table as the one place the design shows off.

SQL Lab teaches business students to produce tables, so results are typeset like a table in a printed statistics report. Everything around them stays quiet. The layout itself is deliberately conventional, because students should recognise the tools they will meet at work.

**Visual reference** — `docs/design/mockup/` holds seven static HTML screens: the query result in light and dark, first visit, error, exercise correct, exercise wrong, and phone. The owner supplies them; commit them unchanged. Match them for layout, spacing, colour and type. This plan governs behaviour; where the two disagree on looks, the mockup wins.

**Principles**

1. The query and its result are the product; the chrome recedes.
2. One filled primary button per context: Run, or Check answer in exercise mode.
3. Every action has a text label. Icons support labels and never replace them.
4. Results show exactly what the query returned: no client-side sorting or filtering.
5. Legible on a washed-out projector and on a 1366×768 laptop.

**Colour tokens** — define these as CSS custom properties in `css/tokens.css`; components never use raw hex. Contrast was computed for these pairings: text is at least 4.5:1 on every surface it sits on, and control outlines at least 3:1.

| Token | Role | Light | Dark |
| --- | --- | --- | --- |
| `--desk` | App background | `#EEF1F0` | `#10141B` |
| `--paper` | Panes, editor, results | `#FCFDFC` | `#171C25` |
| `--sunken` | Exercise prompt panel, hover rows | `#F3F6F5` | `#1C222D` |
| `--rule` | Dividers and table rules | `#D5DCDD` | `#2C3542` |
| `--rule-strong` | Input and button outlines | `#7C8891` | `#6B7889` |
| `--ink` | Primary text | `#14213D` | `#E7EAF0` |
| `--graphite` | Secondary text | `#55606E` | `#A0AAB8` |
| `--accent` | Primary button, links, focus ring | `#2647C8` | `#8FAEFF` |
| `--accent-hover` | Hover and pressed | `#1D3AA8` | `#A9C1FF` |
| `--accent-subtle` | Selection, active row | `#E6ECFB` | `#1E2B4D` |
| `--on-accent` | Text on the accent | `#FFFFFF` | `#0E1630` |
| `--success`, `--success-subtle` | Correct answer | `#1B7A43`, `#E4F3E9` | `#5BC98B`, `#15301F` |
| `--danger`, `--danger-subtle` | Errors, wrong answer | `#B42318`, `#FBE9E7` | `#FF8A80`, `#3A1A18` |
| `--warning`, `--warning-subtle` | Cautions | `#8A5A00`, `#FBF1D9` | `#E8B84A`, `#33280F` |

Green and red are reserved for correct and wrong. The accent is blue so nothing competes with them, and so the two stay distinguishable for colour-blind users.

**Syntax colours** — five roles, each at least 4.5:1 on `--paper`.

| Role | Light | Dark |
| --- | --- | --- |
| Keyword | `#2647C8` | `#9DB8FF` |
| String | `#1B6B4A` | `#7DD6AC` |
| Number | `#9A3412` | `#F0A677` |
| Function | `#6D3FC0` | `#C9A8FF` |
| Comment (italic) | `#5F6B78` | `#8793A3` |

**Type** — Atkinson Hyperlegible Next for the interface; Atkinson Hyperlegible Mono for SQL, identifiers and result cells. Both were drawn to keep look-alike characters apart (0 and O, 1 and l), which matters when learners copy identifiers and read figures off a projector.

- Install `@fontsource-variable/atkinson-hyperlegible-next` and `@fontsource-variable/atkinson-hyperlegible-mono` (OFL). Copy the latin and latin-ext `woff2` files into `vendor/fonts/`: about 170 KB in total. Use `font-display: swap` with `system-ui` and `ui-monospace` fallbacks.
- Sizes: 12, 14, 16 and 20 px. Interface text is 14; exercise prompts 16; SQL and results 14, adjustable by the user from 12 to 24.
- Weights 400 and 600 only. Line height 1.45 for interface text, 1.6 for SQL and prompts.
- Sentence case everywhere. No all-caps labels and no letter-spaced text. Monospace is for SQL, identifiers and data only, never for labels or counts.

**Shape and space** — spacing steps of 4, 8, 12, 16, 24 and 32 px. Controls are 32 px high, 44 px on touch screens. Radius is 6 px on controls, 10 px on menus and dialogs, none on panes. Panes are separated by a 1 px rule, never a shadow; only menus, dialogs and toasts cast one.

**The result table** — the one bold element. No vertical lines and no zebra stripes. A 2 px `--ink` rule above the header and below the last row, a 1 px rule under the header, hairline `--rule` between rows. Numbers are right-aligned in tabular figures; text is left-aligned; `NULL` is graphite italic. The header is sticky, weight 600, and shows column names exactly as the query returned them.

**Icons** — Lucide, from `lucide-static` (ISC), inlined as one SVG sprite holding only the icons used; 16 px, 1.5 px stroke, `currentColor`.

**Motion** — menus, toasts and the feedback banner fade in over 120 ms. One deliberate moment: when an answer is correct, its tick draws itself over 300 ms. Nothing else animates, and `prefers-reduced-motion` removes both.

**Voice** — plain verbs, sentence case. An action keeps its name through the flow: "Copy link" confirms with "Link copied". Errors say what happened and never apologise. The interface says "database", not "dataset".

**Never add** gradients, shadows on panes, card grids, emoji, decorative illustrations, or arrows appended to button text.

## 4. Target layout

A full-height workbench: schema in a left sidebar, the query above its result, and one status bar.

&#91;embedded content: target app shell, five regions\]

Run is the only filled control; in exercise mode, Check answer takes that role.

| Region | Size | Holds |
| --- | --- | --- |
| Top bar | 48 px high | Brand, database switcher, Copy link, Export, Theme, Help |
| Sidebar | 280 px wide; drag between 220 and 420 px; collapsible | Schema, Exercises and History tabs |
| Editor pane | 40% of the main height; at least 120 px | Toolbar, then the editor |
| Results pane | The remaining height | Summary line, result table, feedback banner, empty and error states |
| Status bar | 28 px high | Database name, last run, SQLite version, credit |

The app fills the viewport (`100dvh`) and the page itself never scrolls; only panes do. Pane sizes and the sidebar's collapsed state persist in localStorage under new keys.

## 5. Components and states

Every component below replaces something that exists today; the Phase 1 inventory maps each old control to its new home, so nothing is lost.

**Top bar**, left to right

- Brand: the mark and "SQL Lab".
- Database switcher: a button showing the current database name. Its menu lists the course databases (name, one-line description, size), then "Open a file…" and "Open from URL…". It replaces the Dataset dropdown, the editable filename and both open links.
- Copy link: copies the share link and confirms with a "Link copied" toast.
- Export menu: "Database (.db)", "Results (.csv)" (disabled until a result exists) and "Evidence (.txt)…", each with one line saying what it is for.
- Theme: light, dark, or match the device.
- Help: keyboard shortcuts, the line "Runs entirely in your browser. Your data and queries never leave this device.", and About.

**Sidebar**, three tabs

- Schema: the database description (two lines, expandable), then tables, then views. Each row has a disclosure arrow, the name in mono, and its row count right-aligned with thousands separators. Expanded rows list columns with their type in graphite, and mark primary and foreign keys. Clicking a name inserts it at the cursor, as today. A filter box appears once there are more than 8 objects.
- Exercises: the set picker, a progress line ("7 of 10 complete"), then each exercise with a status icon and its title. It replaces the top-bar Exercises dropdown; exercise links open this tab.
- History: past runs, newest first, each showing the first line of SQL in mono, when it ran, and its row count or an error mark. Clicking one restores it to the editor, as today.

**Editor**

- CodeMirror 6 with the SQLite dialect: highlighting, line numbers, active-line tint, bracket matching.
- Autocomplete offers keywords plus the tables and columns of the open database, and refreshes after a database switch or any DDL.
- Shortcuts: Ctrl/Cmd+Enter runs; Ctrl/Cmd+Shift+Enter checks the answer in exercise mode; Ctrl/Cmd+/ toggles a comment.
- Toolbar above the editor: Run (primary, showing its shortcut), Check answer (exercise mode only), and the text-size control at the far right.
- Placeholder when empty: "Write SQL here, then press Run."
- If the editor bundle fails to load, the existing textarea remains and everything still works.

**Results pane**

- Summary line: "23 rows in 4 ms" on the left, "Download CSV" on the right. When capped: "Showing 500 of 12,400 rows".
- The table is styled as §3 describes. Cells longer than 60 characters truncate and show the full value on click. Wide tables scroll inside the pane, never the page.
- Several statements: keep today's behaviour (verify whether results stack or replace), restyled, each with its own summary line.
- No result yet: "Run a query to see its result here." plus up to three sample queries, read from an optional `samples` array in the database manifest (`[{"label": "…", "sql": "…"}]`). With none, offer `SELECT * FROM <first table> LIMIT 10`. Clicking a sample fills the editor and does not run it.
- Statement with no result set: "Done.", plus the number of rows changed when the engine reports it.
- Query running longer than 300 ms: "Running…" in the summary line.
- Error: a full-width band with a `--danger-subtle` background and an alert icon, the heading "This query has an error", SQLite's message verbatim in mono, and the failing statement quoted in a `--paper` box. No coloured side border; it is the same band pattern as exercise feedback.

**Exercise mode**

- A prompt panel sits above the editor toolbar: exercise number and title, the prompt in 16 px text, a "Show hint" button that counts hints ("Hint 1 of 2"), and Previous and Next.
- Check answer becomes the filled primary button; Run stays in place as a quiet button.
- Feedback is a banner at the top of the results pane. Correct: `--success-subtle` background, the drawn tick, "Correct. 12 rows match." and a "Next exercise" button. Wrong: `--danger-subtle` background, a cross icon, "Not quite." and the checker's specific message.
- A row-level difference shows Expected and Yours side by side, with the differing cells outlined.
- A passed exercise gains its tick in the sidebar at once, and the progress line updates.

**Toasts and dialogs**

- Toasts: bottom centre, 4 seconds, one at a time, announced politely to screen readers. Used for link copied, file exported and database loaded.
- Dialogs use `<dialog>`: Open from URL, and Export evidence. The evidence dialog explains itself in one sentence ("Creates a text record of the queries you ran, to attach to your assessment."), validates the student number inline, and names the file it will save.
- Loading a database shows its name and size with a progress bar in the results pane.

**Status bar** — the open database's name, the last run's summary, the SQLite version, and "Made by Abdou Sadou, based on SQLime" linking to About.

## 6. Accessibility and responsive rules

The target is WCAG 2.2 AA, proved by the tests in §8 and not by eye.

- Text contrast is at least 4.5:1; control outlines and focus rings at least 3:1. The §3 tokens meet this; keep it true for any new pairing.
- Everything works from the keyboard in reading order: top bar, sidebar, editor, toolbar, results. A skip link jumps to the editor.
- Focus is always visible: a 2 px `--accent` outline with a 2 px offset.
- Landmarks: `header`, `nav` for the sidebar, `main`, and a `footer` for the status bar. Each pane has an accessible name.
- Pane splitters are focusable `role="separator"` elements; arrow keys resize in 16 px steps.
- Menus close on Escape and return focus to their button. Dialogs trap focus.
- A live region announces each outcome: "23 rows returned", the error heading, or "Correct".
- In the editor, Tab indents and Escape then Tab leaves it. Help states this, and the editor carries it as `aria-describedby`.
- Correct and wrong are never signalled by colour alone: always an icon and words.
- Follow `prefers-color-scheme` until the user picks a theme; honour `prefers-reduced-motion` always.
- Pointer targets are at least 32 px, and 44 px on touch screens.

| Viewport width | Layout |
| --- | --- |
| 1100 px and wider | Three panes, as drawn in §4 |
| 700 to 1099 px | The sidebar becomes an overlay drawer opened from the top bar; the editor and results split stays |
| Under 700 px | One column. Editor and Results become two tabs, switching to Results after a run. Top-bar actions collapse into a More menu. Run stays visible in a bottom bar |

**Projector use** — the text-size control scales SQL and results from 12 to 24 px and remembers the choice. At 1280×720 and size 20, a 6-line query and 6 result rows are visible without scrolling.

## 7. Phases

Six phases, one PR each, in this order; a phase is done only when its own check and the §8 checks pass.

1. **Baseline, tokens and themes.** First capture the §8 screenshot matrix of today's interface into `docs/ui/before/`, and write `UI_INVENTORY.md`: every interactive element, its handler, and its new home under §5. Then add `css/tokens.css`, the vendored fonts, the icon sprite, and the light, dark and device theme control. No layout change. *Done when* no hex colour remains outside `tokens.css` and both themes pass the contrast check.
2. **App shell.** Top bar with the Help popover, tabbed sidebar, split panes and status bar; menus consolidated; duplicate controls removed as the inventory directs. *Done when* there is no page-level scrollbar at 1366×768, pane sizes and the collapsed state survive a reload, and every inventory row is ticked.
3. **Editor.** CodeMirror bundled with esbuild into `vendor/editor.js`; autocomplete, shortcuts, toolbar and the textarea fallback. *Done when* typing `SELECT * FROM pro` offers `products`, the bundle is at most 500 KB minified, and blocking the bundle request still leaves a working textarea.
4. **Results and feedback.** The ruled result table; the empty, loading, error and no-result-set states; toasts and dialogs; three `samples` for Northlight in the manifest. *Done when* the category-revenue CTE query from the acceptance suite renders its 5 rows in the new table and every state has a screenshot.
5. **Exercise mode.** Prompt panel, Check answer as primary, feedback banner, the Expected and Yours view, and sidebar progress. *Done when* the whole sample set can be completed by keyboard alone.
6. **Responsive, accessibility and polish.** Breakpoints, the text-size control in the editor toolbar, reduced motion, a restyled About page, a favicon set, and Open Graph tags so a shared link previews properly. The preview image is the one place an absolute URL is required; read the site URL from a single config constant. *Done when* every §8 check passes and the full screenshot matrix is committed.

**Held back until the owner approves**: running queries in a Web Worker with a Cancel button, so a runaway join cannot freeze the tab. It changes the execution core that §1 freezes, so it is not part of these six phases.

## 8. Proof

Every PR carries screenshots the agent has looked at, plus automated checks; reading the code cannot judge a layout.

**Screenshot matrix** — taken with Playwright, saved to `docs/ui/after/phase-N/`, with before and after pairs in the PR description.

- Viewports: 1366×768, 1920×1080 and 390×844.
- Themes: light and dark.
- States: no result yet; a result table; an error; schema expanded; each menu open; the evidence dialog; an exercise prompt; a correct answer; a wrong answer with the Expected and Yours view.

**Self-review before opening the PR** — open every screenshot and check each point, fixing and re-shooting until all hold.

1. Nothing is clipped, overlapping or wrapping awkwardly. Check 1366×768 first.
2. Edges align, and spacing uses only the §3 steps.
3. Controls in a row share one height.
4. Exactly one filled primary button is visible.
5. The focused element is obvious.
6. Light and dark both look designed, not inverted.
7. Each screen matches its counterpart in `docs/design/mockup/` when the two are viewed side by side.

**Automated checks**

- The existing acceptance suite passes.
- `@axe-core/playwright` reports zero serious or critical violations on every matrix state, in both themes.
- Playwright `toHaveScreenshot` baselines cover the matrix from Phase 2 onward.
- No horizontal page scroll at 360 px wide.
- A keyboard-only test loads the page, opens a database, runs a query and completes one exercise.
- Initial transfer stays at or under 3 MB excluding `datasets/`, with zero third-party requests.
- A search finds no hex colour in the site's own CSS or JS outside `css/tokens.css`.

## 9. Defaults to confirm

Six decisions are baked into this plan; change any of them before handing it to the agent.

| Decision | Default in this plan | Alternative |
| --- | --- | --- |
| Editor | CodeMirror 6 with highlighting and autocomplete; adds one build step and roughly 150 KB gzipped | Keep the textarea and only restyle it |
| Typeface | Atkinson Hyperlegible Next and Mono, vendored, about 170 KB | System fonts, zero bytes |
| Theme | Follows the device setting, with a toggle; the design leads with light | Dark by default, as now |
| Sidebar | Moves to the left, with Schema, Exercises and History tabs | Stays on the right |
| Wording | "Database" in the interface; internal names such as `datasets/` unchanged | Keep "Dataset" |
| Sample queries | An optional `samples` array in the manifest feeds the empty state | An empty state with text only |
