# Phase 6: responsive, accessibility and polish

The plan's Phase 6 (`docs/design/SQL Lab UI and UX Plan.md`, section 7): "Breakpoints, the text-size control in the editor toolbar, reduced motion, a restyled About page, a favicon set, and Open Graph tags so a shared link previews properly. The preview image is the one place an absolute URL is required; read the site URL from a single config constant."

**Done when** every section 8 check passes and the full screenshot matrix is committed:

- The matrix is in this folder: 36 states at four sizes in both themes, 288 shots. Phase 6 adds a fourth size, 1024×768: a tablet, where the sidebar is a drawer. It also adds four states: `drawer`, `text-size`, `about` and `verify`.
- Every check of section 8 passes; the numbers are under "Automated checks" below.

## What changed on screen

- **The breakpoints of section 6.**
  - **From 1100 px**, the three panes are as they were. The one change is A− and A+ at the right end of the toolbar's row.
  - **From 700 to 1099 px** the sidebar is a drawer. A Sidebar button at the left of the top bar opens it over the page, at the left edge and the window's full height. It is 320 px wide, always leaving at least 56 px of the page beside it, and a scrim covers the rest. Its Close button, Escape, a press on the page beside it, or the focus going anywhere but its button close it. The editor and the result keep their split, and the top bar keeps its actions. Up to 900 px the Sidebar button and the brand are their icons alone, so the database switcher keeps room for a name.
  - **Under 700 px**, a phone (and a phone held sideways: Decisions), the layout follows `docs/design/mockup/phone.html`:
    - A 56 px top bar: the Sidebar button, the brand's mark, the database switcher across the rest, and More (⋯).
    - Two 48 px view buttons, Editor and Result. A run, or a Check's verdict, shows Result. Text put in the editor (a sample, a History entry, an inserted name, an exercise's draft) shows Editor.
    - Run, with Check answer in an exercise, in a 64 px bar at the foot. The credit stays above it, on one line.
    - Copy link, the three exports, the three themes and Help in the More menu. Copy link's popover and Help open under the More button.
- **The text size** (section 5's toolbar and "Projector use"): A− and A+ make the SQL and the results 2 px smaller or larger, from 12 to 24 px. That covers the editor, the result table, an error's SQL, a long cell's value, and Expected and Yours. The rest of the interface keeps its size. The size is kept, and applied before the first paint. Each new size is said ("Text size 16 pixels"). At either end the button stays, with a title that says why it does nothing. On a phone the buttons are not shown and the default size applies (a phone zooms).
- **Reduced motion**: nothing moves. The menus, popovers, toasts, the feedback banner and its drawn tick appear at once, and the editor's caret does not blink.
- **About** is in the app's look:
  - a 48 px bar with the brand and what the site is;
  - one column of 16 px text at most 42rem wide, with sections under 16 px headings;
  - the keyboard shortcuts drawn as the Help popover draws them;
  - a new section on the projector, the tablet and the phone;
  - the credit in a bar at the foot.

  Its brand and its last link go back in the history when the page was opened from the app, so the app comes back as it was left; otherwise they go to the app.
- **The evidence check page** shares About's look (the same stylesheet): the same header, and its controls in the app's shapes.
- **The favicon set**:
  - an SVG mark that follows the colour scheme;
  - an ICO of 16, 32 and 48 px;
  - the 180 px touch icon;
  - the web manifest's 192, 512 and maskable 512 px icons;
  - the preview picture, `img/social.png` (1200×630), drawn in the app's typefaces.

  All of them are drawn from the brand mark and the tokens by `tools/build-favicons.mjs`.
- **Link previews**: the deploy writes the Open Graph tags into the published copy of each page: its title, its description, its address and the preview picture, with its absolute URL, and the link to a web manifest. The address is `SITE_URL` in `js/lab/config.js` when it is set, else the address GitHub Pages gives the workflow.

## Decisions and resolved conflicts

- **The drawer is 320 px wide, and 56 px short of the window on a narrow phone.** The plan does not give a width. 280 px, the sidebar's own, would leave a tablet's drawer narrower than the panel needs at a touch screen's 44 px rows. The 56 px left beside it show the page is still there, and give a place to press to close it.
- **A phone has the drawer too.** Section 6 says nothing about the sidebar under 700 px, and the phone mockup has no sidebar control. The Schema, Exercises and History tabs are needed there, so the Sidebar button opens the same drawer.
- **The drawer never opens by itself.** A set that opens selects the Exercises tab but leaves the drawer shut: the prompt is what the student needs first. Choosing an exercise in it closes it. A sidebar hidden on a wide window opens as the drawer when the window narrows, and is hidden again when it widens.
- **Which view a phone shows.** The plan says the views switch to Result after a run. A Check's verdict, which can come without a run ("Nothing to check."), and a Run with nothing written also show Result. Anything that puts text in the editor shows Editor: a sample, a History entry, a name from the Schema tab, an exercise's draft, the skip link. The page opens on Editor. When the view that goes held the focus, the focus goes to the button of the view that comes, never to the page.
- **A phone held sideways takes the phone's layout.** Section 6's table goes by width alone, so a phone held sideways (844×390) would get the tablet's layout. There the 120 px editor, the toolbar and the top bar leave the result its header and no row (found in review). A touch screen less than 500 px tall now takes the phone's layout and its drawer: two rows of a result are whole, and the third begins. A short window with a mouse keeps the layout of its width.
- **A− and A+ come last in the Tab order**, after the result, though they are drawn at the right end of the toolbar's row. The keyboard path in and out of the editor stays as it was from Milestone 2 and Phase 3, and the acceptance tests pin it: Shift+Tab out of the editor reaches Run (or Check answer), Tab reaches the splitter. With the buttons in the toolbar's place in the document, Shift+Tab would land on A+. The text size is a display setting, reached once.
- **On a phone, Run stays before the editor in the Tab order** though it is drawn in the bar at the foot, for the same reason.
- **A− and A+ are named "A−, smaller text" and "A+, larger text".** The mockups' names, "Smaller text" and "Larger text", leave out what the buttons show, which WCAG 2.5.3 (and axe) asks to be in the name.
- **On a phone the text size is the default.** The mockup's phone has no A− and A+, and a phone zooms. A size chosen on a wider window is kept for it.
- **The Open Graph tags are written at deploy, not into the repository.** Only `js/lab/config.js` may name the app (a Milestone 2 rule that `m2-brand.spec.js` pins), and the preview needs an absolute address that the repository does not know. `tools/site-meta.mjs` writes the tags into the staged copy of each page, between two markers. It also writes the web manifest. The address is `SITE_URL` once the owner sets it (a custom domain), else the address GitHub Pages gives the workflow. `SITE_URL` is empty: the owner has not given an address.
- **The web manifest's display is `browser`**: the site is not an installable app (no offline mode), but the manifest gives its name, colours and icons to whatever reads it.
- **The preview picture has the app's name drawn in it**, set from `APP_NAME` when it is drawn: renaming the app means drawing it again (`node tools/build-favicons.mjs`, in the README).
- **The mark in About's and the evidence page's headers is the SVG favicon.** As an image it follows the page's colour scheme, so a pinned theme too, in Chromium and Firefox (checked in all four combinations). `favicon-64x64.png`, which those headers showed, stays for whatever cannot draw the SVG.
- **The evidence check page** shares About's stylesheet, so it took About's look. Its header is now About's: the brand is not a heading, which put an h3 before the page's h1. Its controls are the app's, but for the verdict's word, which stays large for a marker reading it across a desk.
- **About's way back** goes back in the history only when About was opened from this site. Otherwise, from a bookmark or in a new tab, it goes to the app's address. It never runs a `javascript:` link.

## Before and after

Each pair sets the Phase 5 interface beside the same state now (the same recipes of `tests/ui-states.js`). Phase 5 had no 1024×768 shots and none of the four new states: those were shot of the Phase 5 interface at the start of this phase, into `before/`.

At 1366×768 only the toolbar's row changed (A− and A+ at its right end), and About and the evidence check page:

| Phase 5 | Phase 6 |
|---|---|
| ![](../phase-5/result--1366x768--light.png) | ![](result--1366x768--light.png) |
| ![](before/text-size--1366x768--dark.png) | ![](text-size--1366x768--dark.png) |
| ![](before/about--1366x768--light.png) | ![](about--1366x768--light.png) |
| ![](before/verify--1366x768--light.png) | ![](verify--1366x768--light.png) |

A tablet, 1024×768: the sidebar is a drawer.

| Phase 5 | Phase 6 |
|---|---|
| ![](before/first-visit--1024x768--light.png) | ![](first-visit--1024x768--light.png) |
| ![](before/drawer--1024x768--dark.png) | ![](drawer--1024x768--dark.png) |
| ![](before/schema-expanded--1024x768--light.png) | ![](schema-expanded--1024x768--light.png) |
| ![](before/exercise-wrong--1024x768--light.png) | ![](exercise-wrong--1024x768--light.png) |
| ![](before/menu-help--1024x768--dark.png) | ![](menu-help--1024x768--dark.png) |

A phone, 390×844: the stack of Phase 2 becomes the phone mockup's layout.

| Phase 5 | Phase 6 |
|---|---|
| ![](../phase-5/first-visit--390x844--light.png) | ![](first-visit--390x844--light.png) |
| ![](../phase-5/result--390x844--light.png) | ![](result--390x844--light.png) |
| ![](../phase-5/exercise-prompt--390x844--light.png) | ![](exercise-prompt--390x844--light.png) |
| ![](../phase-5/exercise-wrong--390x844--dark.png) | ![](exercise-wrong--390x844--dark.png) |
| ![](../phase-5/menu-export--390x844--dark.png) | ![](menu-export--390x844--dark.png) |
| ![](../phase-5/schema-expanded--390x844--light.png) | ![](schema-expanded--390x844--light.png) |
| ![](before/text-size--390x844--light.png) | ![](text-size--390x844--light.png) |
| ![](before/about--390x844--dark.png) | ![](about--390x844--dark.png) |
| ![](before/verify--390x844--dark.png) | ![](verify--390x844--dark.png) |

## Independent review

Four reviewers read the change without my notes, one lens each: fidelity to the plan and the mockups, correctness and the behaviour freeze, accessibility, and the tests. A verifier then tried to refute each reviewer's findings.

They checked a lot and found it sound:

- **Against the mockup:** the phone matches `phone.html` box for box, measured. So do A− and A+ against the desktop mockups, and the plan's projector check holds at 1280×720.
- **The behaviour freeze:** nothing about how queries run, how exercises are checked, the share link, the evidence file and its checksum, or the stored keys changed.
- **The drawer, the views and More:** they work in Chromium and Firefox, at both mounts, across the breakpoints.
- **The deploy tool:** it writes the right tags, runs twice cleanly, and leaves the repository's pages with only the markers.
- **Accessibility:**
  - axe at every impact level finds nothing on the new states, in both themes at three sizes.
  - The lowest text contrast is 5.63:1.
  - Every `aria-controls` points at an element.
  - Reduced motion stills everything.
  - Reflow at 320 px and the text-spacing test lose nothing.

What they found, all fixed here:

- **A phone held sideways showed a result's header and no row** (two reviewers). Section 6 goes by width, so 844×390 got the tablet's layout, and its fixed heights left the result 69 px. A touch screen less than 500 px tall now takes the phone's layout (Decisions).
- **From 700 to about 840 px the database switcher showed one letter of the name.** The new Sidebar button's word and the brand's took its room. Up to 900 px they are their icons alone.
- **On a phone, Run with nothing written did nothing you could see.** Its answer went to the Result view, which was not shown. It shows the Result view now, as a run does.
- **Shift+Tab past the Sidebar button left the drawer open with the focus under it.** Any focus outside the drawer but on its button closes it now.
- **On a phone, a name inserted from the drawer while the Result view was shown left the drawer open and the focus in it.** The editor was not shown when it was focused. The insertion shows the Editor view first now.
- **A menu left open while the window crossed 700 px jumped to the window's corner** (its button no longer shown), and Escape then lost the focus. It closes now.
- **The More menu's lines were cut at 320 and 360 px**, with no title to read them in. They wrap.
- **About and the evidence check page had the browser's focus ring**, not the plan's (they do not load `css/core.css`). `css/article.css` draws the plan's now.
- **The evidence check page's controls were not the app's**: a 2 px radius, a 40 px button, the browser's grey file button, sizes off the type scale. They are the app's now, with 44 px targets on a touch screen.
- **The phone's credit wrapped onto two lines.** It is "Made by …" alone there, one line from 360 px (the brand's mark stands for the name, which stays for a screen reader).
- **Behaviours no test pinned** (the tests reviewer, each shown with a deliberate bug the tests did not notice). Each has its check now:
  - the skip link showing the Editor view from the Result view;
  - the reduced-motion rules of Copy link's popover and of "Running…";
  - the text size said by a live region;
  - a phone's toast clear of the bar at the foot;
  - the 32 and 44 px targets of More's entries and the drawer's controls;
  - the phone's 45 % cap on the exercise prompt;
  - a long cell's value and the plain editor at the text size.

  The reviewer confirmed that no assertion was deleted, and found no flake in three runs of the spec in each browser and in runs under load.
- **Smaller things:**
  - The drawer cast a shadow, which section 3 keeps for menus, dialogs and toasts.
  - A menu heading had a 2 px padding, off the spacing steps.
  - The view buttons' focus ring was clipped at the screen's edges; it is drawn inside them now.
  - The phone's brand was a 28 px target; it is 44 px now.

Rejected by the verifiers, or kept on purpose:

- **The credit and Show more as small targets** (rejected): both already have a 44 px pressable area on a touch screen, drawn around their text.
- **A− and A+ last in the Tab order, and Run before the editor on a phone** (confirmed, kept): see Decisions. The way in and out of the editor that the acceptance tests pin comes first.
- **The History entry's width** (rejected by the verifier, tightened anyway): the reviewer read the check, rewritten for the drawer, as loosened; the verifier found it rescaled to the drawer's 320 px, not loosened. It is bound now to the drawer less its two 12 px insets.

## Self-review (plan section 8)

Every shot of this folder was looked at: 1366×768 first, then 1920×1080, the tablet and the phone, each state in both themes (the phone and the tablet as contact sheets, then the states that changed one by one). Every shot of Phase 5 was compared with its Phase 6 counterpart pixel by pixel. At 1366 and 1920 only the toolbar's row changed, where A− and A+ appeared, besides the run-to-run noise (8 pixels of the logo, the History tab's times, a run's milliseconds). The phone's and the tablet's shots were set beside `phone.html` and the desktop mockups.

1. Nothing is clipped, overlapping or wrapping awkwardly. The drawer is whole at its 320 px and 56 px short of a narrow window. The phone's top bar is one 56 px row down to 320 px, the database's name cut with an ellipsis there. From 700 to 899 px the Sidebar button and the brand are their icons alone, so the name stays whole. The More menu's lines wrap down to 320 px, and the credit is one line from 360 px.
2. Edges align on the section 3 steps: the phone's top bar and its bar at the foot 12 px in from the edges (the mockup's), the view buttons 48 px, the drawer's panels on the sidebar's 16 px, About's column 24 px in, its headings 32 px above their sections and 8 px above their text.
3. Controls in a row share one height: 44 px in the phone's top bar and its bar at the foot (the mockup's, whatever the pointer), 32 px in the toolbar with A− and A+ (44 on a touch screen), and 32 px on the evidence check page.
4. Exactly one filled primary button: Run, or Check answer in an exercise (Run outlined beside it, in the bar at the foot too); Verify on the evidence check page.
5. The focused element is obvious: the accent ring on every new control (the Sidebar button, Close, More and its entries, A− and A+), drawn inside the view buttons, which run from edge to edge, and on About's and the evidence page's links and controls.
6. Light and dark both look designed: the drawer on the desk over its scrim, the phone's bars, About and the evidence page take their colours from the tokens in each theme; the marks of About's and the evidence page's headers follow a pinned theme.
7. Against `docs/design/mockup/`: the phone matches `phone.html`, measured: the 56 px top bar and its 44 px controls, the 28 px mark, the switcher's name at its left and its arrow at the right end, the 48 px view buttons with the 2 px accent underline, the summary line, the ruled table and the 64 px bar with its 44 px Run. A− and A+ match the desktop mockups: 32 px, outlined, 12 and 16 px glyphs, 16 px from the end of the row. What differs on purpose is under Decisions: the Sidebar button the mockup's phone does not have, the credit kept above the bar at the foot, the buttons' names.

Found while building and checking, and fixed: Show more appeared a frame after the drawer opened, and the drawer's shots now wait for it. On a phone the stored text size applied though A− and A+ are not there. The phone's switcher centred its name, where the mockup puts it at the left. More opened on the ticked theme rather than on its first entry. The phone's top bar was 57 px.

## Automated checks

- **The acceptance suite** passes in Chromium and Firefox, at the root and at a subpath, on the default ports (as a plain `npm test` runs it): 6,527 passed and 17 skipped, in 15.1 minutes. The skips are Phase 5's 13, and the two tests that need Chromium's mobile emulation, in Firefox's two projects. No assertion was removed. The tests that pinned the Phase 2 layout under 700 px now pin the phone's and the drawer's:
  - the sidebar stacked above the editor is now the drawer, opened by its button;
  - the editor above the result is now the two views;
  - the top bar's buttons are now More's entries;
  - the toolbar as a row above the editor is now the bar at the foot, at the mockup's 12 px inset;
  - the sidebar's 280 px column under 1100 px is now the drawer's 320 px.

  The helpers (`run`, `rename`, `openTab`, `openEvidence`, `copyLink`) show a phone's Editor view or open the drawer or More first, as a person would.
- **`tests/ui6-responsive.spec.js`**, 51 tests on each project (the two that need Chromium's mobile emulation are skipped in Firefox):
  - the drawer and the phone, and what the review found;
  - a touch screen's 44 px targets, and a phone held sideways;
  - keyboard-only sessions on a tablet and on a phone;
  - the text size and the plan's projector check;
  - reduced motion, About, the icons and the link preview.

  77 deliberate bugs prove the tests: each is a copy of the app with one Phase 6 behaviour taken out, served with `context.route` (or, for the deploy tool and the boot script, written to disk and put back). 76 of them make the tests that pin that behaviour fail. The one left is the Close button's own return of the focus, which the drawer's close handler also gives a task later, so nothing a person could see changes.
- **Screenshot baselines** (`tests/ui-visual.spec.js`) now cover 288 shots: 36 states at four sizes in both themes. 96 are new (the 1024×768 size and the four new states), and 182 were regenerated after looking at them. The whole set passed three runs in a row on the default port (288 of 288 each time).
- **axe-core** finds no serious or critical violation in any of the 36 states, at the four sizes, in both themes, in both browsers at both mounts (`tests/ui-a11y.spec.js`). The reviewer ran it at every impact level on the new states and found nothing.
- **No sideways scroll and keyboard only:** no horizontal page scroll at 360 px in any of the 36 states. The keyboard-only session of section 8 still passes, and the plan's own Phase 5 check (the whole set by keyboard) does too. New sessions do the same on a tablet and on a phone.
- **Initial transfer:** 2,361,378 bytes without `datasets/`, under the 3 MB budget (`ac9`). By part:

  | Part | Bytes |
  |---|---|
  | The engine | 1.32 MB |
  | The editor bundle | 0.39 MB |
  | The app's scripts | 0.48 MB |
  | Its styles | 0.09 MB |
  | The typefaces | 0.05 MB |
  | The page and the rest | 0.03 MB |

  That is 35 KB more than Phase 5: `more-menu.js`, `text-size.js`, the layout and the styles of the drawer and the phone. There is no request to another host (`ac6`).
- **No hex colour outside `css/tokens.css`**, and every `var()` is defined (`tests/ui1-tokens.spec.js`).
