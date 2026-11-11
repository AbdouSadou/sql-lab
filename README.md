# SQL playground for teaching

A static, browser-only SQL playground for teaching. SQLite runs in your browser as WebAssembly: there is no server, no account and no analytics, and the queries and data you work with never leave the browser. The page is plain HTML, CSS and JavaScript with no build step.

Based on SQLime by Anton Zhiyanov (https://github.com/nalgeon/sqlime).

## What to do

| I want to | Commit | Details |
|---|---|---|
| add a dataset | the `.db` file in `datasets/` and one entry in `datasets/manifest.json` | [Adding a dataset](#adding-a-dataset) |
| add an exercise set | one file, `exercises/<set-id>.json` | [Adding an exercise set](#adding-an-exercise-set) |
| publish a change | push to `main` | [Deploying](#deploying) |
| check a student's evidence file | nothing: open `verify.html` on the site | [Marking evidence files](#marking-evidence-files) |
| rename the app, or change the student number format | one line in `js/lab/config.js` | [Settings](#settings) |
| work on the code | nothing to build | [Run it locally](#run-it-locally), [Tests](#tests) |

## Features

- Full SQLite (CTEs, window functions, views, triggers) in the browser. Run with Ctrl/Cmd+Enter.
- An app-like layout: a top bar, a sidebar with Schema, Exercises and History tabs, the query above its result, and a status bar. The sidebar's width, whether it is hidden and the editor's height are set by dragging the bars between the panes (or with the arrow keys) and kept between visits. Under 700 px wide the panes stack.
- Built-in datasets, listed in `datasets/manifest.json` and chosen from the database menu in the top bar (the button showing the open database). The default one (Northlight Retail) is open on a first visit. `?db=<id>` in the address opens a dataset directly.
- The Schema tab: tables and views with their columns, types, key marks and row counts. Clicking a name puts it in the editor.
- Open a SQLite database file, a SQL script, or a database from a URL, (all three from the database menu), and export the open database, with your changes, as a file (Export, then Database (.db)…; the file name given there also renames the database).
- Results show at most 500 rows ("showing 500 of N rows"), the time taken, and, for a failed run, the statement that failed. Download CSV (beside the result, and Export, then Results (.csv)) saves the whole result.
- Share a query with Copy link in the top bar: the link holds the dataset, the exercise (if one is open) and the SQL, compressed, in the part of the address after `#`, which browsers never send to a server. Opening a link puts the SQL in the editor without running it. A link can be long for very large queries.
- Exercise sets with a Check answer button (Ctrl/Cmd+Shift+Enter), a numbered list of exercises with pass marks, progressive hints and a "7 of 10 complete" counter kept in your browser. Pick a set in the Exercises tab, or open `?set=<set id>` (add `&ex=<exercise id>` for one exercise).
- A run log: every Run is kept (the last 200 per dataset, fewer if the queries are very long, in that browser on that device) and the History tab lists it, newest first; a click puts an earlier query back in the editor. Its times are UTC. When the browser has no room left to keep the log or the exercise progress, a line under the status says so.
- Evidence export: Export, then Evidence (.txt)…, saves the run log as a `.txt` file with the student's number and a checksum, to attach to assessed work; `verify.html` checks such a file. The file holds the log of the open dataset only (an uploaded file has a log of its own), so a student who worked on two datasets exports once for each dataset. The log lives in one browser profile: on a shared lab PC whose profile is wiped at log-off, or in a private window, it is gone, so students should export before they log off. `about.html` tells them this, and tells markers about `verify.html`.
- Phone-friendly layout.
- Browsers: current Chrome, Edge, Firefox and Safari. The menus use the `popover` attribute, so they need Safari 17, Firefox 125 or Chrome 114 or later; an older browser shows the page without them.
- Kept in the student's own browser (`localStorage`) and nowhere else: the last query for each database, exercise progress, the SQL last written for each exercise, the run log, the theme the student chose, and the pane sizes (`sqllab.layout`).
- Light and dark themes: the page follows the device until the student picks Light, Dark or Match device in the Theme menu.

## Adding a dataset

A dataset is a `.db` file in `datasets/` plus one entry in `datasets/manifest.json`: `id` (letters, digits, `_` or `-`, at most 64; it goes into share links, exercise sets and the name of the run log), `name` (shown in the menu), `file` (a relative path such as `datasets/northlight_retail.db`), an optional `description`, and `"default": true` on exactly one entry. The file must be a SQLite database (its first bytes are checked). A manifest that breaks these rules is reported on the page with the specific reason. Renaming an `id` later breaks the exercise sets that name it and orphans students' saved run logs, so choose ids once.

## Adding an exercise set

An exercise set is one file, `exercises/<set-id>.json`. Commit it and nothing else: there is no list to edit, no manifest entry and no build step. The file name must equal the `id` inside it (`store-basics.json` holds `"id": "store-basics"`), and the id uses only letters, digits, `_` and `-` (at most 64), because it goes into links and into the name of the browser's progress record. `dataset` is the id of a dataset in `datasets/manifest.json`; opening the set loads that dataset. Changing an exercise's `id` later makes browsers forget that exercise's pass mark and saved SQL.

```json
{
  "id": "store-basics",
  "title": "Northlight stores — a first look",
  "dataset": "northlight",
  "exercises": [
    {
      "id": "s01",
      "title": "West Yorkshire stores, oldest first",
      "prompt": "List the name and opening date of every store in the West Yorkshire region, the longest-established first.",
      "hints": ["Filter with WHERE.", "Sort with ORDER BY."],
      "model_query": "SELECT store_name, opened_date FROM stores WHERE region = 'West Yorkshire' ORDER BY opened_date;",
      "order_matters": true,
      "check_column_names": false
    }
  ]
}
```

Exercises are SELECT-only. `hints` are revealed one at a time, in order. A student's query passes when its result equals the model query's result on the original dataset: column count always, column names only with `"check_column_names": true`, and the row order only with `"order_matters": true` (the default compares the rows as a multiset). The model query is never shown on the page, but it is in the file the browser fetches, so a student who opens the developer tools can read it: this is for practice, not for assessment.

A `model_query` that fails, or a `dataset` that does not exist, is not caught when the Exercises menu is built (the menu checks only the file's shape): the dataset is reported only when the set is opened, and the model query only when an exercise is checked, when the student is told that the exercise cannot be checked and the browser's console says why (the engine's message, which can name a column or a table of the query but does not contain the query). So an instructor should try each new exercise once: open the set and press Check on every exercise before publishing it.

How the site finds the sets: the page reads the folder listing of `exercises/`. `python3 -m http.server` writes one itself, and the Pages workflow writes `exercises/index.html` while it stages the site (the step "List exercise sets" in `.github/workflows/pages.yml`), because GitHub Pages cannot list a folder. A file that is not valid still appears in the Exercises tab's set menu, greyed out and named after its file, with the problem under its name, so you see it at once. Progress and the SQL a student last wrote for each exercise are stored in the student's own browser (`localStorage`), one record per set; the Reset progress button clears them (it does not clear the run log).

## Deploying

Pushing to `main` redeploys the site: `.github/workflows/pages.yml` copies the repository root, leaving out `tests/`, `node_modules/`, `package.json`, `package-lock.json`, `playwright.config.js` and the git files, and publishes it with the official GitHub Pages actions. Everything else at the root is public, `datasets/generate_db.py` and `CODEMAP.md` included. The workflow can also be started by hand from the Actions tab.

Once, per repository: Settings, Pages, Source must be set to GitHub Actions. Until it is, the workflow fails or publishes nothing. The site is then at `https://<user>.github.io/<repo>/`. All addresses in the code are relative, so it works under that subpath; `.nojekyll` must stay at the root.

The evidence export and `verify.html` need a secure page (https, or `localhost`): browsers withhold the checksum function otherwise. GitHub Pages is https.

## Marking evidence files

A student exports their run log from the Export menu in the top bar (Evidence (.txt)…): they type their student number, and the browser saves `evidence-<dataset id>.txt`. To check one:

1. Open `verify.html` on the site (for example `https://<user>.github.io/<repo>/verify.html`). The app itself does not link to it; the About page does, in its "For markers" section, and you can bookmark it.
2. Paste the text of the student's `.txt` into the box, or drop the file on the page, or choose it. The page checks it at once; nothing is uploaded.
3. Read the result. **VALID** shows the student number, the number of queries, the time of export and the dataset. **EDITED** says why: the checksum does not match, or the footer is missing or damaged. A file covers one dataset only (the `dataset:` line): for work on two datasets, ask for two files.
4. To re-run a query, click the `link:` line under an entry in the `.txt` (or paste it into the address bar). The dataset opens with that SQL in the editor; press Run. The link points at the address the student was using, and entries that failed, or that came from an uploaded or URL database, have none.

An evidence file is corroboration, not proof: the checksum shows that a file was not changed after it was exported, but the code is public and runs on the student's machine, so a determined student can fabricate a file.

The query count is the number of entries the exporter wrote. SQL is written to the file as it was run, except that a line of it that looks like an entry header (`[4] 2026-11-09T13:58:12Z · 1 row`) gets a backslash in front, so that SQL cannot add entries to the count; the entry's `link:` still holds the exact SQL.

## Settings

Both are in `js/lab/config.js`:

- `APP_NAME` (default "SQL Lab") is the one place the app name is written; page titles, headers, footers and the first line of an evidence file take it from there. The tests spell the current name out, so after renaming, update them (`grep -rn "SQL Lab" tests/`). Evidence files exported under an older name still verify.
- `STUDENT_ID_PATTERN` (default `^[A-Za-z0-9]{6,12}$`) is the format the evidence dialog accepts for a student number. Change `EVIDENCE_HINT` and `EVIDENCE_INVALID_MESSAGE` beside it so the wording matches. `verify.html` does not apply the pattern, so files exported under an older pattern still verify.

## Run it locally

Serve the repository root with any static file server: from the repository root, `python3 -m http.server 8000 --bind 127.0.0.1` or `make serve` (`make serve PORT=9000` for another port). Then open http://localhost:8000/ (or your port). Do not open the address that `make serve` and a plain `python3 -m http.server` print, such as `http://0.0.0.0:8000/`: browsers do not treat it as a secure address, so the evidence export and `verify.html` cannot compute their checksum there. Opening `index.html` from the disk does not work either: the page loads ES modules and fetches the datasets. There is nothing to build; edit a file and reload.

`CODEMAP.md` is a map of the code: what each module does, how a database opens and a query runs, what is stored where, and how to extend it. Read it before changing code.

## Tests

The tests need Node and Playwright (development tools only; the site itself has no build step). The first time:

```
npm ci
npx playwright install chromium firefox
```

Then:

```
npm test
```

`npm test` runs Chromium and Firefox, each against the site at the server root and mounted at `/repo/` (as GitHub Pages serves a project site), and takes about four minutes. It starts its own static servers on ports 4173 and 4174; if those are busy, set `TEST_PORT_BASE` (it and the next port are used). To run one file or one browser: `npx playwright test tests/m5-results.spec.js --project=chromium-root`. `PW_WEBKIT=1 npm test` adds WebKit (after `npx playwright install webkit`; it needs system libraries that not every machine has).

## Credits and licence

Based on [SQLime](https://github.com/nalgeon/sqlime) by Anton Zhiyanov. Link compression uses [lz-string](https://github.com/pieroxy/lz-string) 1.5.0 (MIT, Copyright 2013 pieroxy), vendored in `vendor/` with its licence. The SQLite WebAssembly build in `vendor/` is the official one from sqlite.org (`make sqlite` refreshes it). Released under the MIT License; see `LICENSE`, which keeps the upstream copyright notice.
