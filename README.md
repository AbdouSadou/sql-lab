# SQL playground for teaching

A static, browser-only SQL playground for teaching. SQLite runs in your browser as WebAssembly: there is no server, no account and no analytics, and the queries and data you work with never leave the browser. The page is plain HTML, CSS and JavaScript with no build step.

Based on SQLime by Anton Zhiyanov.

The app name is defined once, in `js/lab/config.js` (`APP_NAME`); change it there to rename the app.

## Features

- Full SQLite (CTEs, window functions, views, triggers) in the browser.
- Built-in datasets, listed in `datasets/manifest.json` and chosen from the Dataset menu in the toolbar. The default one (Northlight Retail) is open on a first visit. `?db=<id>` in the address opens a dataset directly.
- Open a SQLite database file, a SQL script, or a database from a URL, and export the open database, with your changes, as a file (the export button).
- Share a query with the copy link button: the link holds the SQL, compressed, in the part of the address after `#`, which browsers never send to a server. Opening a link puts the SQL in the editor without running it. A link can be long for very large queries.
- Phone-friendly layout.
- The last query for each database is remembered in your browser's local storage, and put back in the editor (not run) when you return.

## Datasets

A dataset is a `.db` file in `datasets/` plus one entry in `datasets/manifest.json`: `id` (letters, digits, `_` or `-`; it goes into share links), `name` (shown in the menu), `file` (a relative path such as `datasets/northlight_retail.db`), an optional `description`, and `"default": true` on exactly one entry. A manifest that breaks these rules is reported on the page with the specific reason.

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
