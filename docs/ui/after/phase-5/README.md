# Phase 5: exercise mode

The plan's Phase 5 (`docs/design/SQL Lab UI and UX Plan.md`, section 7): the prompt panel, Check answer as the primary, the feedback banner, the Expected and Yours view, and the sidebar's progress (section 5, "Exercise mode"; `docs/design/mockup/exercise-correct.html` and `exercise-wrong.html`).

**Done when** the whole sample set can be completed by keyboard alone:

- `tests/ui5-exercise.spec.js`, "the whole sample set by keyboard alone", does it with keys only, from a first visit. It goes to the Exercises tab and opens the Northlight set from the set picker. For each of the ten exercises it types the answer into the editor, checks it with Ctrl+Shift+Enter, leaves the editor with Escape, tabs to the banner's Next exercise and presses Enter, which puts the focus back in the editor.
- It ends on "All 10 exercises complete. Well done.", "10 of 10 complete", a full progress bar and ten ticks, with the ten passes stored.
- It fails if a single pointer event (pointerdown, mousedown or touchstart) reaches the page, and it fails when Next exercise no longer puts the focus in the editor.
- It passes in Chromium and Firefox, at the root and at a subpath.

## What changed on screen

- **The prompt panel** (exercise-correct.html): the exercise's title and "Exercise 5 of 10", then, 12 px below, the prompt in 16 px text. Under it is one row of buttons: "Show hint (1 of 3)" at the left, Previous and Next at the right. Previous and Next move through the set in its order. The hint button counts the hints (the hint a press shows, of how many) and goes once all are shown. The hints shown so far sit under the buttons, their numbers on the panel's left edge.
- **Check answer** is the one filled button in exercise mode, and Run beside it is outlined. Phase 2 already drew this; it is checked here.
- **The feedback banner** at the top of the results pane is a band across the pane with no border. It fades in over 120 ms; with reduced motion nothing moves. Its kinds:
  - Correct: on green, with a tick that draws itself (the circle, then the tick, 300 ms in all), "**Correct.** 5 rows match." ("1 row matches.", "No rows, as expected.") and Next exercise at its end. When the last exercise of the set is passed, "All 10 exercises complete. Well done." follows on a line of its own.
  - Wrong: on red, with a cross, "**Not quite.**" and the checker's message on the same line, starting with a capital and ending with a full stop on screen.
  - A query with an error: "This query has an error, shown below.", pointing at the error band of the run.
  - An exercise that cannot be checked: "**Not checked.**" in the caution colours, with an alert sign.
  - Check with nothing written: "**Nothing to check.**" with an "i".
- **Expected and Yours** (exercise-wrong.html): for a row that differs, the expected result's rows and the student's sit side by side under the banner. They are the checker's rows: at most three, from the first that differs, numbered as in the whole result. Both are ruled like the result table. The cells of Yours that differ are outlined in red, with "Outlined cells differ from the expected result." under them. On a phone the two tables stack. Wide tables open at the first difference and scroll sideways together.
- **The sidebar**: a passed exercise gets its tick, the progress line its count and the bar its length in the same moment as the banner appears. This worked before; the look is Phase 2's, which matches the mockup.
- **Words**: "Show hint (1 of 3)", "Next exercise", "Correct.", "Not quite." and "Yours" (the plan's and the mockups') replace "Show next hint (3 left)", "Next: Exercise 6", "Passed", "Not passed yet" and "Your result".

## Decisions and resolved conflicts

- **The student's own result stays under the banner.** The mockup's wrong screen shows only the Expected and Yours view. But the view holds at most three rows of the student's result, and the plan does not take the run's result away; hiding it would lose the rest of what the student's query returned. At 1366×768 it starts just under the view, and the pane scrolls to it.
- **The rows keep their numbers** in Expected and Yours, which the mockup does not have. The checker shows at most three rows, from the first that differs, so the numbers say where those rows are in the whole result ("Row 7 is the first that differs" above rows 7 to 9).
- **No "3 rows in 2 ms" beside Yours**, which the mockup has. The summary line under the view already gives the run's count and time. The view's rows also come from the Check's own run on the original database, which that time does not describe.
- **The checker's words are kept**, not the mockup's "Row 1 does not match the expected result.". The plan says "the checker's specific message", and the checker is frozen. Its lower-case fragments ("expected 2 columns, got 1") were written to stand on a line of their own. Run on after "Not quite.", they are drawn with a capital and a full stop (CSS), while their text stays the checker's. The words said follow the screen: each part is said as a sentence.
- **A query with an error is not shown twice** (found in review). The run under the banner shows SQLite's message and the statement in its error band, so the banner points at it ("This query has an error, shown below.") and the message is what is said. When the banner's message is not the band's (the student's working copy differs from the original database), the banner gives the engine's message itself, in mono.
- **"12 rows match" counts what the checker matched.** The checker's pass outcome now carries `rows`, the number of rows it compared. Nothing about what passes changed; the twenty assertions that pinned a pass as `{status: "pass"}` now pin `{status: "pass", rows: N}`.
- **Next exercise still goes to the next exercise not yet passed**, wrapping round to the start (as before; the plan names the button, not where it goes). Its title, and so its description to a screen reader, names that exercise, which can be further on than the next one. Previous and Next in the prompt follow the list's order.
- **Previous and Next stay put at the ends of the set** and keep the focus, but do nothing there. They carry `aria-disabled` and a title that says why ("This is the first exercise of the set."). A disabled button would drop the focus of the student who pressed it to get there.
- **The banner is not a live region.** The results pane's live region says its words once ("Correct. 5 rows match."), as it says every run's outcome, and the banner's tables are not read out. Before, the verdict box itself was live, and read out the tables of a failure.
- **The hints sit under the row of buttons**, so a button pressed again and again stays where it is. The mockup shows no hint.
- **The drawn tick is the sprite's own icon**, copied inline so that its circle and its tick can be stroked in one after the other.
- A set with one exercise says "The set is complete. Well done." instead of "All 1 exercises complete."
- The phone layout stays Phase 2's stopgap; Phase 6 brings the tabs and the bottom bar.

## Before and after (1366×768)

Each pair sets a state of Phase 4 beside the same state now (the same queries):

| Phase 4 | Phase 5 |
|---|---|
| ![](../phase-4/exercise-prompt--1366x768--light.png) | ![](exercise-prompt--1366x768--light.png) |
| ![](../phase-4/exercise-correct--1366x768--light.png) | ![](exercise-correct--1366x768--light.png) |
| ![](../phase-4/exercise-correct--1366x768--dark.png) | ![](exercise-correct--1366x768--dark.png) |
| ![](../phase-4/exercise-wrong--1366x768--light.png) | ![](exercise-wrong--1366x768--light.png) |
| ![](../phase-4/exercise-wrong--1366x768--dark.png) | ![](exercise-wrong--1366x768--dark.png) |
| ![](../phase-4/menu-exercise-set--1366x768--light.png) | ![](menu-exercise-set--1366x768--light.png) |

New in the matrix (32 states now): `exercise-hints`, `exercise-not-quite`, `exercise-no-query` and `exercise-complete`, at every size in both themes. `docs/ui/README.md` lists what each shows. These states existed before this phase but had no shots, so the Phase 4 interface was shot in them at the start of this phase (`before/`, 1366×768, both themes):

| Phase 4 | Phase 5 |
|---|---|
| ![](before/exercise-hints--1366x768--light.png) | ![](exercise-hints--1366x768--light.png) |
| ![](before/exercise-not-quite--1366x768--light.png) | ![](exercise-not-quite--1366x768--light.png) |
| ![](before/exercise-no-query--1366x768--dark.png) | ![](exercise-no-query--1366x768--dark.png) |
| ![](before/exercise-complete--1366x768--light.png) | ![](exercise-complete--1366x768--light.png) |

## Independent review

Four reviewers read the change without my notes, one lens each: fidelity to the plan and the mockups, correctness and the behaviour freeze, accessibility, and the tests. A verifier then tried to refute each reviewer's findings. They checked a lot and found it sound:

- **Against the mockups** (measured on the page at the mockups' 1366×820 and from their inline styles): the band is the mockup's exact size (1085×56 px with Next exercise, 1085×47 px without), with its 12/24 px padding, the 20 px icon at the same place and the 16 px words. The prompt panel's padding, gaps and 16 px prompt, the 32 px controls, the comparison's 24/64 px gaps and ruled tables also match.
- **Accessibility**: axe at every impact level, on nine states in both themes at 1366 and 390 px, with reduced motion on and off, found nothing. They also computed every new colour pairing: the lowest is the success icon on its band, 4.68:1 in light; text on the bands is 11.8:1 or more.
- **Behaviour**: every verdict is said once; the Tab order is the reading order; the targets are 44 px on a touch screen; the code of the share link, the evidence file and the stored progress is untouched, and the checker changed only by the `rows` of a pass; and no assertion was deleted (the one looser check, the old "✓" text, is covered by the tick's shapes and colour in the new spec).

What they found, all fixed here:

- **A Check of a query with an error showed SQLite's message twice**, in two red bands one above the other: the banner, then the run's error band. The banner now points at the band ("This query has an error, shown below.") and the message is said.
- **A new verdict could be drawn out of sight.** A student who had scrolled the results pane down to their rows and checked again saw no change: the banner was redrawn above the visible part. The pane now goes back to its top for a new verdict.
- **On a wide result, the outlined cell could be off to the side.** Expected and Yours scrolled separately, so the cell could not be read against its expected value. The tables now scroll sideways together, and the first outlined cell is scrolled into sight when the view is drawn.
- **The focus fell to the page** when a Check from the keyboard redrew the banner while the focus was on Next exercise. It now goes to the new Next exercise, or to the banner itself, whose focus ring is drawn inside it.
- **Look**: the prompt sat 8 px under the title where the mockup has 12; the hints' numbers hung outside the panel's left edge; and the note under a row whose difference cannot be seen did not cover NULL against the text "NULL".
- **Tests that could not fail.** A full stop doubled after a checker sentence, row numbers that do not start at the first row that differs, a failing banner made live (`role="alert"`, which would be heard twice) and a progress bar that never fills: each passed every test. Each is pinned now. A test named "has a screenshot" checked only the recipes, and is renamed.

Rejected by the verifiers, with reasons:

- A Check followed within one frame by Next leaves the old run's result under the new exercise. That is Phase 4's run path, and a person cannot press twice within 16 ms.
- The spoken verdict of a row difference does not mention the tables. The plan asks the live region for the outcome, and the tables follow in the pane.
- A table is named both by its region and by its caption. Phase 4's result box uses the same pattern.
- No colour checks in the dark theme or at phone width. axe and the 360 px test cover every state in both themes at every size.

## Self-review (plan section 8)

Every shot of this folder was looked at: 1366×768 first, then 1920×1080 and the phone, each state in both themes. The banner and the comparison were also set beside `exercise-correct.html` and `exercise-wrong.html` at their 1366×820, and every shot of Phase 4 was compared with its Phase 5 counterpart pixel by pixel. Only the exercise states changed (`exercise-prompt`, `exercise-correct`, `exercise-wrong` and the set picker's menu over the prompt); the rest differ only by run-to-run noise: 8 pixels of the logo, the History tab's real timestamps, a run's milliseconds, and the caret in one field.

1. Nothing is clipped, overlapping or wrapping awkwardly. The banner's words are one line at 1366 and 1920. On a phone the band wraps, with Next exercise under the words, and Expected and Yours stack. Hints of more than one line hang after their numbers. Wide tables scroll in their boxes, with the note that says so.
2. Edges align on the section 3 steps. The band has 12/24 px of padding and the comparison 16/24, with gaps of 24 and 64 px (the mockup's). The prompt panel has 16/24 px of padding, with 12 px between the title and the prompt. The hints' numbers, the prompt and the buttons share the panel's 24 px edge.
3. Controls in a row share one height. The hint button, Previous and Next are 32 px (44 on a touch screen), and so are Run, Check answer and Next exercise in its band.
4. Exactly one filled primary button: Check answer. Run and Next exercise are outlined.
5. The focused element is obvious: the accent ring on the hint button, Previous, Next, Next exercise and a scroll box, and inside the banner's edge when the banner holds the focus.
6. Light and dark both look designed. The bands, icons and outlines take their colours from the plan's tokens in each theme, and `tests/ui1-tokens.spec.js` finds no raw colour.
7. Against `docs/design/mockup/`: the banner, the comparison and the prompt panel match `exercise-correct.html` and `exercise-wrong.html` (measured, above). What differs on purpose is listed under Decisions: the row numbers, no time beside Yours, the checker's own wording, and the student's result kept under the view. What differs until later phases: the editor's height (Phase 2's 40% split; the mockup's window is 52 px taller) and the text-size control (Phase 6).

Found while building and checking, and fixed:

- **The hidden "(differs)" words widened the page on a phone.** They are absolutely positioned, and escaped the scroll box of a wide table: Phase 4's 390 px layout tests failed on it while I was building. Their scroll box is positioned now, so it contains them, and the Phase 5 test has a wide table at 390 px too.
- **The `link-popover` screenshots depended on the test server's port.** The popover shows the whole link, origin included, and Phase 4 made its six baselines on another port than the default. A plain `npm test` (port 4173) would have failed six screenshot tests. `tests/ui-visual.spec.js` now gives the shown link one origin before the shot, as it gives run times one value, and the six pass on ports 4173, 5700 and 5790.
- **The words said ran sentences together** ("no such table: mine Your query ran on …"): each part is now said as a sentence, as it is drawn.

## Automated checks

- The acceptance suite passes in Chromium and Firefox, at the root and at a subpath, on the default ports (as a plain `npm test` runs it): 5,831 passed and 13 skipped (Phase 4's thirteen), in 12.8 minutes. No assertion was removed. The ones that pinned what this phase changes on purpose now pin the new behaviour with the same checks: the old words ("Passed", "Your result", "Show next hint (2 left)", "Next: Exercise 2", the "✓" mark), a pass as `{status: "pass"}`, the verdict box as the live region, and the engine's message repeated in the banner.

- `tests/ui5-exercise.spec.js`, 33 tests on each project: the plan's check (above); the prompt panel; Previous and Next; the hint counter; the banner's kinds, words, colours, motion and live region; the focus kept; a new verdict in sight; the sidebar at the moment of the banner; Check answer the one filled button; Expected and Yours (numbering, rules, outlines, a difference the table cannot show, wide tables, the phone); the matrix's exercise states. 49 mutations prove the tests: each is a copy of the app with one Phase 5 behaviour taken out, served with `page.route`, and each makes the tests that pin that behaviour fail. All 49 did.
- Screenshot baselines (`tests/ui-visual.spec.js`): the matrix's 192 shots, 32 states at three sizes in both themes. The 24 of the exercise states that changed were regenerated after looking at them; the 24 of the four new states are new; the six of `link-popover` were regenerated with the fixed origin. The whole set then passed three runs in a row on the default port (576 of 576).
- axe-core: no serious or critical violation in any of the 32 states, at the three sizes, in both themes, in both browsers at both mounts (`tests/ui-a11y.spec.js`).
- No horizontal page scroll at 360 px in any of the 32 states. A keyboard-only session loads the page, opens a database, runs a query and completes an exercise; the plan's check above completes the whole set.
- Initial transfer: 2,326,125 bytes without `datasets/`, under the 3 MB budget (`ac9`): the engine 1.32 MB, the editor bundle 0.39 MB, the app's scripts 0.46 MB, its styles 0.08 MB, the typefaces 0.05 MB, and the page, the manifest and the rest 0.03 MB. There is no request to another host (`ac6`).
- No hex colour outside `css/tokens.css`, and every `var()` is defined (`tests/ui1-tokens.spec.js`).
