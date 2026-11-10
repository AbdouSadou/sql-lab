# SQL playground for teaching

A static, browser-only SQL playground for teaching. SQLite runs in your browser as WebAssembly: there is no server, no account and no analytics, and the queries and data you work with never leave the browser. The page is plain HTML, CSS and JavaScript with no build step.

Based on SQLime by Anton Zhiyanov.

The app name is defined once, in `js/lab/config.js` (`APP_NAME`); change it there to rename the app.

## Features

- Full SQLite (CTEs, window functions, views, triggers) in the browser.
- Built-in datasets, listed in `datasets/manifest.json` and chosen from the Dataset menu in the toolbar. The default one (Northlight Retail) is open on a first visit. `?db=<id>` in the address opens a dataset directly.
- Open a SQLite database file, a SQL script, or a database from a URL, and export the open database, with your changes, as a file (the export button).
- Share a query with the copy link button: the link holds the SQL, compressed, in the part of the address after `#`, which browsers never send to a server. Opening a link puts the SQL in the editor without running it. A link can be long for very large queries.
- Exercise sets with a Check button, a numbered list of exercises with pass marks, progressive hints and a "7/10 complete" counter kept in your browser. Pick a set in the Exercises menu, or open `?set=<set id>` (add `&ex=<exercise id>` for one exercise).
- Phone-friendly layout.
- The last query for each database is remembered in your browser's local storage, and put back in the editor (not run) when you return.

## Datasets

A dataset is a `.db` file in `datasets/` plus one entry in `datasets/manifest.json`: `id` (letters, digits, `_` or `-`; it goes into share links), `name` (shown in the menu), `file` (a relative path such as `datasets/northlight_retail.db`), an optional `description`, and `"default": true` on exactly one entry. A manifest that breaks these rules is reported on the page with the specific reason.

## Adding an exercise set

An exercise set is one file, `exercises/<set-id>.json`. Commit it and nothing else: there is no list to edit, no manifest entry and no build step. The file name must equal the `id` inside it (`retail-basics.json` holds `"id": "retail-basics"`), and the id uses only letters, digits, `_` and `-` (at most 64), because it goes into links and into the name of the browser's progress record. `dataset` is the id of a dataset in `datasets/manifest.json`; opening the set loads that dataset.

```json
{
  "id": "retail-basics",
  "title": "Northlight Retail — SQL basics",
  "dataset": "northlight",
  "exercises": [
    {
      "id": "e01",
      "title": "Electronics by price",
      "prompt": "List the name and unit price of every product in the Electronics category, most expensive first.",
      "hints": ["Filter with WHERE.", "Sort with ORDER BY ... DESC."],
      "model_query": "SELECT product_name, unit_price FROM products WHERE category = 'Electronics' ORDER BY unit_price DESC;",
      "order_matters": true,
      "check_column_names": false
    }
  ]
}
```

Exercises are SELECT-only. `hints` are revealed one at a time, in order. A student's query passes when its result equals the model query's result on the original dataset: column count always, column names only with `"check_column_names": true`, and the row order only with `"order_matters": true` (the default compares the rows as a multiset). The model query is never shown on the page, but it is in the file the browser fetches, so a student who opens the developer tools can read it: this is for practice, not for assessment.

How the site finds the sets: the page reads the folder listing of `exercises/`. `python3 -m http.server` writes one itself, and the Pages workflow writes `exercises/index.html` while it stages the site (the step "List exercise sets" in `.github/workflows/pages.yml`), because GitHub Pages cannot list a folder. A file that is not valid still appears in the Exercises menu, greyed out and named after its file, with the problem as its tooltip, so you see it at once. Progress and the SQL a student last wrote for each exercise are stored in the student's own browser (`localStorage`), one record per set; the Reset progress button clears them.

## Run it locally

Serve the repository root with any static file server, for example `python3 -m http.server`, and open the printed address.

## Tests

The tests need Node and Playwright (development tools only; the site itself has no build step):

```
npm ci
npm test
```

## Credits and licence

Based on [SQLime](https://github.com/nalgeon/sqlime) by Anton Zhiyanov. Link compression uses [lz-string](https://github.com/pieroxy/lz-string) 1.5.0 (MIT, Copyright 2013 pieroxy), vendored in `vendor/` with its licence. Released under the MIT License; see `LICENSE`, which keeps the upstream copyright notice.
