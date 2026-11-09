# CODEMAP

Map of the code as it stands at the end of milestone M2 (rebrand, gist and token sharing removed, injection holes closed, F3 fragment share links built). Upstream is SQLime (nalgeon/sqlime); sections 6a, 6e and 6f record what changed from it and why. Written for engineers and agents who will extend it.

Conventions: references are mostly `file` plus function name, because line numbers drift; `file:line` is used only where it still matters. Statements marked **(verified)** were checked by running the app in headless Chromium against a plain static server with no special headers; everything else comes from reading the code. The Playwright tests in `tests/` pin most of the behaviour described here.

## 0. Layout at a glance

| Path | What it is |
|---|---|
| `index.html` | The playground page. Loads the brand module, the engine, lz-string, then the components, then `js/index.js`. Has the footer (credit and About link) and the visually hidden editor hint. |
| `about.html` | Static About page styled by `css/article.css`. Describes this app and carries the upstream credit. No scripts except the inline `back()` and `js/lab/brand.js`. |
| `js/` | All application code (section 2). Vanilla ES modules, no bundler, no dependencies. `js/lab/` holds everything added on top of upstream. |
| `vendor/sqlite3.js`, `vendor/sqlite3.wasm` | The engine (official SQLite WASM 3.54.1), committed as ordinary files. `make sqlite` re-downloads it (version bump). |
| `vendor/lz-string.min.js`, `vendor/lz-string.LICENSE.txt` | lz-string 1.5.0 (MIT, Copyright 2013 pieroxy; compatible with this repo's MIT licence), 4.8 KB, the unmodified minified browser build from `npm pack lz-string@1.5.0` with one comment line on top. A classic script that defines the global `LZString`; only `js/lab/share.js` uses it. |
| `css/` | One stylesheet per UI region (`footer.css` is new); `core.css` and `layout.css` are global. No `url()` or `@import` anywhere, so there are no external fonts or images in CSS. |
| `img/` | `favicon.svg` (original mark, vector shapes only), and `favicon.ico`, `favicon-64x64.png`, `apple-touch-icon.png` rendered from it with Chromium. The header logo uses `favicon-64x64.png`. Upstream's `cover.png` is gone. |
| `demo.db`, `employees.db`, `sales.db` | Sample databases at the repo root (the welcome text links `demo.db`). They move to `datasets/` in M3. |
| `Makefile`, `.github/workflows/pages.yml`, `.nojekyll`, `package.json`, `playwright.config.js`, `tests/` | Engine bump, deploy and Playwright tests, section 8. Upstream's in-browser `test/` suite was deleted in M2: it called the live GitHub API and pinned removed behaviour. |

## 1. Entry points and run order

### index.html (the playground)

| Order | What runs | Where |
|---|---|---|
| 1 | Parser builds the DOM. Custom elements (`<tool-bar>`, `<command-bar>`, `<sqlime-editor>`, `<sqlime-result>`, `<sqlime-status>`, `<db-name>`) are still inert. | `index.html` body |
| 2 | Module script `js/lab/brand.js` (in `<head>`, deferred like every module) imports `config.js` and, once the DOM is parsed, writes `APP_NAME` into `document.title` and into every `[data-app-name]` element (header, footer). | `index.html` head |
| 3 | **Classic** (blocking) scripts: `vendor/sqlite3.js` defines the global `sqlite3InitModule` (it does not start the engine); `vendor/lz-string.min.js` defines `LZString`. Both come before every module that runs later (`share.js` reads `globalThis.LZString` at call time). | `index.html` |
| 4 | Module scripts run in document order: `copy-link.js`, `db-name.js`, `toolbar.js`, `command-bar.js`, `sqlime-editor.js`, `sqlime-result.js`, `sqlime-status.js`. Each calls `customElements.define`, which upgrades the element. `toolbar.js` and `command-bar.js` write their markup with `innerHTML` (constant text) in `connectedCallback`; `sqlime-status.js` appends one inner `<div>`; `sqlime-editor.js` sets `contenteditable`, the ARIA role/label, and registers listeners; `db-name.js` only registers a listener; `sqlime-result.js` renders nothing until `print` is called. | `index.html` |
| 5 | `js/index.js` runs last. It looks up the elements, builds the `actions` and `shortcuts` maps, exposes `window.app` (`{actions, ui}`), registers listeners, then calls `startFromCurrentUrl()` as its final statement. | `index.html` |

Order dependency that matters: `index.js` does `querySelector("#execute")` and `#show-tables`, and uses `ui.toolbar.btnOpenFile` / `ui.toolbar.file`. Those exist only after `command-bar.js` and `toolbar.js` have run, so any new module that must run before `index.js` cannot assume those parts of the DOM exist yet.

### about.html

Module `js/lab/brand.js` (title `About - <name>`, header, main text and footer names) and an inline `back()` function.

## 2. Modules in js/

| File | Role |
|---|---|
| `js/index.js` | The page controller and the only place that holds the current database (`let database`, module-private). Owns start/load, execute, result/status rendering, name change. Exposes `window.app = {actions, ui}` for tests. Imports from `js/lab/` at a few seams: `titleFor` (document title), `escapeHtml` (everything that reaches the status area), `tableContentSql` / `tableInfoSql` (quoted table names), the message and prompt constants from `config.js`, and for F3 `resolveRoute` (`startFromCurrentUrl`: where to start from) and `createCopyLinkAction` (`actions.copyLink`). `start(name, path, sharedSql)` takes the shared SQL, which wins over storage; `showStarted(shared)` picks the message. |
| `js/db-path.js` | `DatabasePath`: classifies a location string as `empty`, `remote`, `local`, `binary`, `sql` or `unsupported`; derives the display name; converts back to a hash. `unsupported` is anything the browser would not resolve to this site and that is not an `http(s)://` URL (section 5.2). |
| `js/storage.js` | Thin wrapper over `localStorage` for one thing: the last SQL per database name. |
| `js/printer.js` | Turns a `{columns, values}` result, or a table list, into an HTML string (`<table>`). Escapes every column name, value and table name. |
| `js/sqlite/manager.js` | The engine front door. `init(name, path)` boots the WASM once and returns an `SQLite` for any path type. Holds the private `sqlite3` API object. Exports only `{ init }`. |
| `js/sqlite/db.js` | `SQLite` class wrapping one `oo1.DB`: `execute`, `gatherTables`, `getTableInfo` (see 6f: unsafe, no longer called), naming helpers. Also `DEFAULT_NAME`, `QUERIES`, `MESSAGES`. |
| `js/lab/config.js` | Constants. `APP_NAME` (the only place the app name is written; a test greps for it), `RESTORED_MESSAGE`, `OPEN_URL_PROMPT`, `OPEN_URL_DEFAULT` (empty on purpose), and the F3 constants: `SHARE_PARAM` (`s`), `SHARE_VERSION`, `SHARE_ID_PATTERN`, the three size limits (`SHARE_MAX_PAYLOAD_CHARS`, `SHARE_MAX_JSON_CHARS`, `SHARE_MAX_SQL_CHARS`) and the share messages (`SHARED_MESSAGE`, `BAD_LINK_MESSAGE`, `LINK_COPIED_MESSAGE`, `LINK_COPY_FAILED_MESSAGE`, `LINK_TOO_LONG_MESSAGE`). Put new constants here. A test serves a copy of this file with a different name, so keep `APP_NAME = "..."` on one line. |
| `js/lab/brand.js` | Writes `APP_NAME` into `document.title` and `[data-app-name]`; exports `titleFor(part)`. Static pages set the page part with `<title data-page-title="About">`. The static text inside `<title>` is only what a no-JS view or crawler sees, so it is the page part or the neutral word `Loading` (index.html), never a product name; `tests/m2-brand.spec.js` checks it. |
| `js/lab/html.js` | `escapeHtml`: escapes `& < > " '`, null and undefined become `""`. Safe for element content and quoted attribute values. |
| `js/lab/sql.js` | `quoteIdent`, `quoteLiteral`, `tableContentSql`, `tableInfoSql`: build SQL around a table name without splicing it raw. Replacement is by function, so `$&` in a name is not a pattern. |
| `js/lab/share.js` | F3 state <-> URL fragment, no DOM. `encodeShare({dataset,set,exercise,sql})` -> payload; `decodeShare(hash)` -> `{ok:true,state}` or `{ok:false,reason}` and never throws (section 5.6); `isShareFragment` (lenient: any case, optional `?`, space or `%20`, encoded `=`; regex `SHARE_START`); `shareFragment`; `shareUrl(sql, pageUrl)` (page URL with query and fragment replaced; `null` if too long); `setShareContext` / `getShareContext` for the dataset, set and exercise ids that M3 and M4 supply (validated at the setter; nothing calls it yet). |
| `js/lab/router.js` | `resolveRoute(location)` -> `{database, sql, damaged}`: what `startFromCurrentUrl` starts from. anything `isShareFragment` accepts gives an empty database plus the shared SQL (blank SQL counts as none) or `damaged`, and is never taken for a database path; anything else is the old hash-as-database-path. M3 adds datasets, `?db=` and the default here. |
| `js/lab/copy-link.js` | `createCopyLinkAction(ui)`: the `copyLink` action handler. Builds the link from `ui.editor.value`, starts `navigator.clipboard.writeText` (falls back to `execCommand("copy")` without the API), always renders a read-only `input.share-link-field` in the status area, focuses it and selects its text, then updates a `role=status` note ("copied" or "copy by hand") when the clipboard settles. It returns a resolved promise at once so the button is not held disabled by a pending permission prompt. |
| `js/lab/editor-keys.js` | The Escape-then-Tab way out of the editor (`leavesEditor`, `cancelLeave`). Called from the editor component. |
| `js/components/action-button.js` | `actionButton(name, text, arg)` returns the HTML of a `<button class="sqlime-link" data-action=... data-arg=...>`. `text` is HTML; `arg` goes through `dataset` so the serialiser escapes it. |
| `js/components/command-bar.js` | `<command-bar>`: renders the Run, tables and copy link (`#copy-link`, `data-action=copyLink`) buttons. The bar is a flex row (`css/commandbar.css`), so a new button can be appended (section 7, hook 5). Like the others, it is not clickable with a mouse until the first keystroke, a load that put SQL in the editor, or a started database (`.sqlime-disabled`); the keyboard is not affected. |
| `js/components/copy-link.js` | `<copy-on-click href>`: copies its `href` attribute to the clipboard, shows "copied!" (set with `textContent`). Upstream's, no longer used by the copy link button (which must also work when the clipboard refuses); kept as a generic component. |
| `js/components/db-name.js` | `<db-name>`: contenteditable name in the header; fires `change` on Enter; `ready(name)` enables editing. |
| `js/components/sqlime-editor.js` | `<sqlime-editor>`: a plain contenteditable div (`role=textbox`, `aria-multiline`, label "SQL query"). Tab inserts two spaces; Escape then Tab / Shift+Tab leaves the editor (`editor-keys.js`); paste is forced to plain text (escaped before `insertHTML`); Ctrl/Cmd+Enter fires an `execute` CustomEvent; first input fires `start`. `value` (innerText) and `query` (selection, else full text). |
| `js/components/sqlime-result.js` | `<sqlime-result>`: `print(result)`, `printTables(tables)`, `clear()`; all set `innerHTML` from `printer.js`. |
| `js/components/sqlime-status.js` | `<sqlime-status>`: one-line status area; `info`, `success`, `error`, `loading`, `fadeOut/In`. The `value` setter writes **innerHTML**, so callers escape anything that is not their own markup. |
| `js/components/toolbar.js` | `<tool-bar>`: "open file" (hidden `<input type=file>`), "open url", link to `about.html`. Fires `open-file` and `open-url` events. |
| `js/controllers/actions.js` | `ActionController`: click delegation. Finds the clicked `<button>`, looks up `handlers[btn.dataset.action]`, disables the button until the returned promise settles. Handlers must return a Promise. |
| `js/controllers/shortcuts.js` | `ShortcutController`: on `keydown` with Ctrl or Meta, calls `handlers[event.key]` and `preventDefault`s. |

Removed in M2: `js/github.js`, `js/settings.js`, `js/sqlite/dumper.js`, `settings.html`. Not in this list on purpose: `vendor/sqlite3.js` / `.wasm` are the vendored third-party engine, not app code (section 6d).

## 3. Flow: open a database, execute, render

### 3.1 Open

```
startFromCurrentUrl             resolveRoute(window.location) (js/lab/router.js): {database, sql, damaged}
 -> new DatabasePath(route.database)   classify (section 5); "" for a share link
 -> start(name, path, route.sql)       clears result, status "Loading database..."
     unsupported path           -> no loader call, failure shown (below)
     -> manager.init            boots engine once: sqlite3InitModule(CONFIG), cached in `loading`
         path remote/local -> fetchFile (plain fetch(url), null on !ok or throw)
                              .sql suffix -> fromSql   else -> fromBytes
         path binary       -> fromBytes     (file upload)
         path sql          -> fromSql       (file upload)
         otherwise (empty) -> create        new sqlite3.oo1.DB()  == ":memory:" (verified)
     -> fromBytes: flips WAL header bytes 18/19 from 2 to 1, sqlite3_deserialize into "main", gatherTables
     -> returns SQLite instance
   back in start: `database = loadedDatabase` ONLY after a non-null result,
   restores SQL: `database.query = sharedSql ?? (database.query || storage.get(database.name))` (shared SQL from a link wins over storage),
   sets title (titleFor), header name (ui.name.ready), editor value + focus
 -> showStarted
     query exists       -> status SHARED_MESSAGE (came from a link) or RESTORED_MESSAGE (storage), enable command bar; the SQL sits in the editor and is NOT run
     else tables exist  -> showTableContent(first table): editor gets `select * from "<t>" limit 10`, runs it, not saved
     else               -> showWelcome
 -> damaged share link: BAD_LINK_MESSAGE replaces the status (escaped), command bar enabled; the app is an empty database as if there was no hash
```

Other entry points into `start`: `startFromUrl` (from "open url", pushes `#<url>` with `pushState`), `startFromFile` (from "open file", pushes `./` so the hash is dropped), and `popstate` (back/forward and hash edits), which goes through `startFromCurrentUrl` like the first load. So pasting a share link into an open tab (a fragment-only navigation) fires `popstate` and restores it; the open database is replaced by an empty one (verified in Chromium and Firefox). The fragment stays in the address bar after opening a link, so a reload restores the same state.

Behaviours worth knowing:
- Saved SQL (and SQL from a share link) is never run on load (M2). The reason: a runaway query saved by an earlier session would hang the tab on every reload, and with share links the SQL would come from someone else. Anything that restores SQL (F3 included) must put it in the editor and stop there; the student presses Run.
- The built-in preview is not saved as the student's last query (`execute(sql, false)`), so a reload with nothing else saved runs the preview again.
- A failed load shows `Failed to load database from <path>` (plus `: <exception>` when something threw). The path and the exception text are escaped. `database` is only assigned after a successful load, so a failure leaves whatever was open before (verified: open a file, move to `#scheme:id`, the old database still answers). On a fresh page `database` stays undefined and Run shows "No database is loaded." instead of throwing (`execute` guard).
- A 404 shows `Failed to load database from URL nope.db`; `#gist:abc` (or any `scheme:id`) shows `Failed to load database from unsupported address gist:abc` and makes no request (section 5.4).
- There is no default dataset yet. With no hash, an empty in-memory `new.db` is created and the welcome text is shown.
- Choosing the same file twice now loads it twice: `index.js` clears the file input after reading it (upstream cleared a property on the wrong object, so the second choice fired no event).

### 3.2 Execute

```
Trigger A: Ctrl/Cmd+Enter in editor
   handleExecute  sqlime-editor.js   dispatches CustomEvent("execute", {detail: editor.query})
   listener       index.js           -> execute(event.detail).catch(ignoreRejection)
Trigger B: Run button
   ActionController.onClick -> actions.executeCurrent -> execute(ui.editor.query)

execute(sql, persist = true)  index.js
   no database -> error "No database is loaded."
   sql.trim(); storage.set(database.name, sql) unless persist is false   <- saves what was run, i.e. the selection if there was one
   empty -> status "Run SQL query...", result cleared, return
   status.fadeOut + "Executing query..."
   result = database.execute(sql)
      SQLite.execute  db.js
         this.query = sql
         this.db.exec({sql, rowMode:"object", resultRows})   <- engine runs ALL statements, section 6b
         no rows -> return null
         else {columns: Object.getOwnPropertyNames(rows[0]), values: rows.map(Object.values)}
   showResult(result, elapsed)
      rows -> ui.status.success("N rows, took X ms"); ui.result.print(result)
      none -> ui.status.success("0 rows, ..."); ui.result.print("")  -> clears
         -> SqlimeResult.print -> printer.printResult (escapes) -> this.innerHTML = "<table>..."
   catch -> showError(exc): first line of the exception text, escaped, into the status as error; result cleared; returns Promise.reject(exc)
```

Other render paths: `showTables` (`database.gatherTables`, `ui.result.printTables`), `showTable` (runs `tableInfoSql(table)` with `database.execute`, shows `tables / <escaped name>:`).

Quirks of this path that new code inherits:
- Results are built by `Object.getOwnPropertyNames(rows[0])` from `rowMode: "object"` rows, so **duplicate column names collapse** (`select 1 as a, 2 as a` shows one column `a` with value 2) and **integer-like column names are reordered ahead of the others** (`select 2 as b, 1 as "1"` shows columns `1, b`). Both verified. Anything that needs positional, order-faithful rows (the exercise checker) must not use `SQLite.execute`; it needs `rowMode: "array"` on `database.db`.
- There is no row cap; every row becomes one big `innerHTML` string.
- `execute` returns a rejected promise on error. The editor listener and `showTableContent` now catch it (`ignoreRejection`), because the error is already on screen; `ActionController` swallows it for buttons.
- The editor keeps Tab for indentation (two spaces, verified plain spaces, not non-breaking) but Escape followed by Tab or Shift+Tab moves focus out. Any other key, or blur, cancels the Escape. `#editor-hint` (visually hidden, `aria-describedby` on the editor) says so. Ctrl/Cmd+Enter remains the other keyboard route to run.
- `ui.editor.query` uses `window.getSelection().toString()`, which is the page-wide selection, not the editor's. By reading the code (not tested): text selected anywhere (for example in the results table) is what the Run button executes.

## 4. localStorage

Complete list. `grep` finds no `sessionStorage`, IndexedDB or cookie use in `js/`, `index.html` or `about.html`. The engine opens `:memory:`, so nothing is persisted by SQLite (the build also registers `kvvfs`, a localStorage-backed VFS, but nothing opens it).

| Key | Value | Written by | Read by | Removed by |
|---|---|---|---|---|
| `sqlime.query.<database.name>` (prefix `PREFIX` in `storage.js`; kept as upstream named it so existing saved queries survive) | The last SQL text run for that database name. `database.name` is the file basename, or `new.db` for the empty database, so two databases with the same basename share one slot. | `storage.set` from `execute` (every run with persist on, with the trimmed text that was run, including empty) and `changeName` (moves what is *saved* under the old name to the new one; it does not write `database.query`, which can be the preview or an unrun share-link query, so renaming never saves SQL that was not run) | `storage.get` on every successful `start`; the SQL goes into the editor, not into a run | `storage.remove` on rename (old name) and on logo click (`new.db` only). Quirk: `set` with empty SQL calls `remove` and then still writes `""` (no `return`). |

Upstream also wrote `github.username` and `github.token`. Nothing writes or reads them any more; browsers that used upstream keep them, and the app never touches them. New keys should use a different prefix such as `sqllab.*`.

## 5. Loading a database from a URL today

### 5.1 Where it is read

Only the **fragment** (`resolveRoute`; a `#s=` fragment is a share link, section 5.6, everything below applies to any other). `startFromCurrentUrl` takes `window.location.hash.slice(1)` raw, without decoding. There is no `location.search`, `URLSearchParams` or `hashchange` anywhere (grep). `index.html?db=x` is ignored and loads an empty database. Hash changes are picked up through `popstate`, which also fires for in-page hash edits. The browser percent-encodes some characters (`<`, `>`, space, `"`) in what it stores as the hash.

### 5.2 Accepted formats

`DatabasePath.inferType` picks the first matching rule:

| # | Rule | Type | Example fragments | Then |
|---|---|---|---|---|
| 1 | empty string | `empty` | none, `#` | new empty in-memory database |
| 2 | `ArrayBuffer` instance | `binary` | file upload only, never from a URL | `fromBytes` |
| 3 | starts with `http://` or `https://` (case-insensitive) | `remote` | `#https://example.org/x.db` | `fetch(url)`, plain GET, so the remote host must send CORS headers |
| 4 | the browser's URL parser, given the value and the page URL, yields this site's origin | `local` | `#demo.db`, `#datasets/x.db`, `#../x.db`, `#a b.db`, `#folder/a:b` | `fetch(value)`, resolved against the page URL (so it is subpath-safe) |
| 5 | anything else, including a parse failure | `unsupported` | `#gist:abc`, `#GIST:abc`, `#foo:bar`, `#//host/x.db`, `#\\host\x.db`, `#data:...`, `#javascript:...`, `#file:///...` | refused by `start`: failure shown, no request, `manager.init` not called |
| - | `type` passed explicitly | `sql` | file upload of a `*.sql` file only | `fromSql` |

Rule 4 uses the URL parser on purpose. Checking for a `:` or a leading `//` would miss backslash forms (`\\host\x` is read as `//host/x` by the URL parser) and scheme case (`HTTPS://`). There is no id type any more; see the trap in 6a.

Both `remote` and `local` go through the same branch in `manager.init`: if `path.value.endsWith(".sql")` the body is fetched as text and executed as a script (`fromSql`), otherwise as bytes (`fromBytes`). The `.sql` test is on the whole string, so `x.sql?raw=1` is treated as a binary database.

Open question for the owner, not changed: a link can still carry `#https://some.host/x.db`, which makes the page fetch that host. That is upstream's open-from-URL feature (kept by the spec, F1), but it means a crafted link can cause one third-party request. Restricting it to an allow-list or to user-typed URLs is a product decision.

### 5.3 Name derivation and display

- `extractName`: last `/`-separated segment of the value, so a query string stays in the name (`#employees.db?x=1` gives name `employees.db?x=1`, and therefore localStorage key `sqlime.query.employees.db?x=1`; verified). `empty`, `binary`, `sql`, `unsupported` give `""`, which `SQLite` turns into `new.db`.
- `toString` produces the text used in failure messages: `URL <value>`, `unsupported address <value>`, `binary value`, `sql script`, `empty value`. It contains raw user text, so `start` escapes it.
- `toHash` is currently unused (it was only used by the removed share code); F3 may use it.

### 5.4 Failure handling

`fetchFile` returns null on a non-2xx response or a thrown fetch error. `start` then shows `Failed to load database from <escaped path>`, or the same with `: <escaped exception>` if something threw. Unsupported paths take the same message without calling the loader (without that guard `manager.init` would fall through to `create` and silently open an empty database). `database` keeps its previous value on every failure (section 3.1).

### 5.5 Other ways in

| Way | Code |
|---|---|
| "open url" button / Ctrl+U | `prompt(OPEN_URL_PROMPT, OPEN_URL_DEFAULT)` (the default is empty; upstream pre-filled a third-party example address) -> `startFromUrl` -> sets hash with `pushState` (which does not fire `popstate`, so no double load) |
| "open file" button / Ctrl+O | `<input type=file>` -> `open-file` event -> `FileReader` -> `startFromFile`; `.sql` read as text, anything else as ArrayBuffer; the URL is reset to `./` |
| "demo database" link in the welcome text | `loadDemo` -> `window.location.assign("#demo.db")` |

### 5.6 Share links (F3)

Format `#s=<payload>`; `payload = LZString.compressToEncodedURIComponent(JSON.stringify({v:1, d, x, e, q}))` with absent fields omitted (`d` dataset id, `x` exercise set id, `e` exercise id, `q` SQL). The page URL's query string is dropped, so a link is valid under any subpath and the SQL never goes in a query string. Alphabet of the payload: `A-Za-z0-9+-$` (no percent-escaping needed). A copied link omits `q` when the editor is blank (an empty editor reads as `\n`), and an incoming link whose `q` is only whitespace counts as having none, so the recipient's own saved SQL is restored with the usual message.

Reading is lenient about the start: `#S=`, `#s%3D`, `#?s=`, `# s=` (the browser stores the space as `%20`) are all share links (`SHARE_START` in `share.js`). One that does not decode is `damaged`, never a database path, so its payload is not requested from the server (it would reach server logs) and is not printed in the message.

`decodeShare` treats the fragment as hostile and returns `{ok:false, reason}` instead of throwing: `payload` (empty, a character outside the alphabet, a malformed `%` escape, over `SHARE_MAX_PAYLOAD_CHARS` = 100,000 characters, or a decompressed JSON longer than `SHARE_MAX_JSON_CHARS` = 400,000, which is checked before parsing because lz-string expands a few KB into hundreds of MB), `decompress` (null or empty), `json`, `shape` (not an object, or a field of the wrong type), `version` (`v` not 1), `id` (does not match `/^[A-Za-z0-9_-]{1,64}$/`), `sql` (over `SHARE_MAX_SQL_CHARS` = 200,000). Unknown extra keys are ignored. `copyLink` refuses to build a link whose payload would exceed the limit and says so, rather than producing a link that cannot open.

Dataset, set and exercise ids are decoded and round-trip, but `resolveRoute` ignores them until M3/M4 can load them. A damaged link starts the app on an empty database with the message; the bad fragment stays in the address bar.

Fidelity note: what a link carries is `ui.editor.value`, i.e. the editor's `innerText`. In Chromium, text typed or filled with Enter creates `<div>` lines, and a blank line then reads back with one extra newline (`a`, blank, `b` reads `a\n\n\nb`). The recipient sees exactly what the sender's `value` read, and SQL meaning is unchanged; text set programmatically (`<br>` lines) round-trips exactly. Upstream editor behaviour, not changed.

## 6. Verified against the spec's assumptions

### 6a. Does share save via the GitHub Gists API with a user-supplied token?

**Yes, it did, and it is gone (M2).** Upstream saved the whole database as a SQL dump (`schema.sql`) plus the query (`query.sql`) to a gist using a token the user typed into `settings.html` and kept in `localStorage`, and loaded `#gist:<id>` from `https://api.github.com/gists/<id>`.

Removed: `js/github.js`, `js/settings.js`, `js/sqlite/dumper.js`, `settings.html`; the settings link in the toolbar; the `#save` "share" button in the command bar; `actions.save`, `shortcuts.s` (Ctrl/Cmd+S now does whatever the browser does, nothing in the page), `save()`, `showSaved()`, the `github` entry of `window.app` and the settings hint in the welcome text; in `manager.js` the `id` branch, `loadGist`, `save`, `afterSave`; in `db.js` the gist-only members (`id`, `owner`, `hashcode`, `each`, `calcHashcode`, `ensureName`); the `id` type in `db-path.js`; the gist and token text in `about.html` and `README.md`; upstream's `test/` directory (live GitHub calls). `tests/m2-no-sharing.spec.js` greps the shipped files for `gist`, `github.token`, `api.github` and `Authorization`.

The trap, now handled: deleting the `id` branch from `manager.init` while `DatabasePath` still classified `:` strings as `id` would have made `init` fall through to `create` and silently open an empty database. `DatabasePath` now classifies those strings as `unsupported` and `start` refuses them (section 5.2, 5.4).

`js/components/copy-link.js` was kept: it is generic and F3 can reuse it.

### 6b. Multiple statements in one run

Chain: `execute` (`index.js`) -> `SQLite.execute` (`db.js`) -> `this.db.exec({sql, rowMode: "object", resultRows: rows})` -> the engine's `oo1.DB.exec`, which prepares and runs each statement in turn.

| Question | Answer | Evidence |
|---|---|---|
| Are all statements run? | Yes, in order, stopping at the first error. | verified |
| Which result set is returned? | **The first statement that returns columns**, not the last. The docstring "returns the last result" in `db.js` is wrong. The engine collects rows only for the first column-returning statement (flag `evalFirstResult` in the engine's `exec`, `sqlite3.js` ~9785 in 3.54.1) and just steps any later one, so its rows are discarded. | verified: `select 1 as a; select 2 as b, 3 as c;` shows only `a=1`. `select 1 as a where 0; select 2 as b` shows "0 rows" (an empty first SELECT still consumes the slot). `select 1 as a; create table z(y)` shows 1. |
| What is rendered per statement? | Nothing per statement. There is exactly one status line and one table for the whole run: `N rows, took X ms` (`showResult` in `index.js`) and one `<table>` (`printer.printResult`). Time covers the whole run. If no statement returned rows, `0 rows, took X ms` with an empty result, including after DML. | `showResult` |
| How does an error surface? | `exec` throws an `SQLite3Error`. `showError` (`index.js`) puts the **first line of the exception text** in the status area (HTML-escaped since M2), styled as error, and clears the result table. Example text: `SQLite3Error: SQLITE_ERROR: sqlite3 result code 1: no such table: nope`. | verified |
| Which statement is named? | **None.** The message is SQLite's own error text only: no statement index, no SQL text, no position. The exception carries only `message`, `resultCode`, `name`, `stack`. | verified (`Object.getOwnPropertyNames(e)` = `stack, message, resultCode, name`) |
| Message format | Prefix `SQLite3Error: SQLITE_ERROR: sqlite3 result code 1: ` before SQLite's text. A "verbatim engine message" (spec section 5) therefore needs that prefix stripped or a decision to keep it. | verified |
| Do earlier statements stay applied? | **Yes.** Nothing wraps a run in a transaction (no `BEGIN`/`COMMIT` exists in `js/` at all; the dumper that held the only ones was removed in M2), so the connection auto-commits each statement. Statements before the failing one persist; the failing one and everything after it never run. A later syntax error is only detected when that statement is reached, so earlier ones have already run. | verified: `create table u(x); insert into u values(1); selct;` errors, then `select count(*) from u` returns 1 |
| Rows from the earlier SELECT on error | Lost: the error path clears the result table. | `showError` |
| Side effects of an error | `database.query` was already set to the SQL (`SQLite.execute`) and the SQL was already saved to localStorage (`execute` in `index.js`). A `BEGIN` left open by a failing script stays open on the connection. | code |


### 6c. Current URL format for loading a database

Fragment only, `#<value>` where `<value>` is a path relative to this site, an `http(s)://` URL, or (refused) anything else. No query-string form exists, so the spec's `?db=<id>` alias is entirely new work. No SQL, dataset id, or exercise id can be carried yet. Full table in section 5.2. Structural fact for F3: any other non-empty fragment that resolves to this site is treated as a file path to fetch, so a new fragment scheme such as `#s=<lz-string>` would currently produce "Failed to load database from URL s=..." unless it is intercepted before `startFromCurrentUrl` reads the hash (section 7, hook 1). **Resolved in M2:** `resolveRoute` intercepts `#s=` before `DatabasePath` sees it (section 5.6). `?db=<id>` is still ignored (M3).

### 6d. Engine build, origin, and COOP/COEP / OPFS / SharedArrayBuffer

| Question | Answer | Evidence |
|---|---|---|
| Which engine? | The **official SQLite WASM build** (the `jswasm` `sqlite3.js` + `sqlite3.wasm` with the `oo1` API), SQLite **3.54.1**. It is **not** sqlean.js. | `Makefile:1-3`; `manager.js` logs `sqlite3_libversion()`; verified `3.54.1` at runtime |
| Where from? | Vendored: committed in `vendor/` since M1. The files come from `https://sqlite.org/2026/sqlite-wasm-3540100.zip` (the `jswasm/` directory), refreshed by `make sqlite` after editing `SQLITE_YEAR` / `SQLITE_VERSION` in the `Makefile`. Upstream instead downloaded them at build time into `js/sqlite/` and git-ignored them. | `Makefile`, `vendor/` |
| Size | `sqlite3.js` 439,732 B, `sqlite3.wasm` 879,430 B (raw), about 1.3 MB of the 3 MB budget. | measured |
| How is it loaded? | Classic `<script src="vendor/sqlite3.js">` on the main thread (`index.html`), then `sqlite3InitModule(CONFIG)` (`manager.js`). The `.wasm` is fetched relative to the script (`vendor/sqlite3.wasm`). No Web Worker. | verified by `tests/smoke.spec.js`: the only requests besides the app's own files are `vendor/sqlite3.wasm`; no OPFS proxy worker, no second wasm, no COOP/COEP headers, `crossOriginIsolated === false` |
| Database mode | In-memory only: `new sqlite3.oo1.DB()` (`create` in `manager.js`) has filename `:memory:` (verified). Uploaded or fetched files are copied in with `sqlite3_deserialize` (`fromBytes` in `manager.js`). Nothing is written back; there is no persistence layer. | |
| COOP/COEP, OPFS, SharedArrayBuffer? | **No dependency.** None of `SharedArrayBuffer`, `Atomics`, `opfs`, `crossOriginIsolated`, `COOP`, `COEP` or `Worker` appears in any app file (grep of `js/`, `*.html`, `css/`, `Makefile`, `.github/`, `test/`). At runtime without special headers: `crossOriginIsolated === false`, `typeof SharedArrayBuffer === "undefined"`, `sqlite3.opfs` undefined, `sqlite3_vfs_find("opfs") === 0` (a null pointer), and the app works. The OPFS VFS is simply not installed. | verified |
| Extensions | No sqlean (no `sqlean` string anywhere in the repo). Only what the stock build compiles in. | grep |

Engine facts that constrain new code (verified):
- `sqlite3InitModule` is **single-use**. A second call throws `TypeError: Cannot read properties of undefined (reading 'entries')`. `manager.js` caches the result in `loading`, and the resulting API object is a private `let sqlite3`, not exported. New code must not boot a second engine.
- `database.db.constructor` is not `sqlite3.oo1.DB`, so do not use it to construct connections. Use the API object (section 7, hook 3).


### 6e. Other places where the code contradicts the spec's description of upstream

| Spec says | Code says | Evidence |
|---|---|---|
| "SQLite compiled to WASM (the sqlean.js build with extensions)" (section 2) | Official SQLite WASM 3.54.1, no extensions | 6d |
| "no build step" (section 2, 3.3) | **Resolved in M1.** The engine is committed in `vendor/` and the repo root is the site. | `Makefile`, `vendor/`, `.github/workflows/pages.yml` |
| "keep (and verify) the existing **export-database** action" (F1) and acceptance 3 "export then re-upload round-trips" | **There is no export action.** No Blob, download link, or `createObjectURL` anywhere. `sqlite3_js_db_export` was called once upstream, only to compute a change-detection hash for gists, and that code is gone. Export is a new feature, not a verification task. | grep for `export|serialize|blob|download|createObjectURL` in `js/` and `index.html` |
| Share saves "snippets" | Saved the whole database dump plus the query, and loading went to api.github.com. **Removed in M2** (6a). | 6a |
| "Run (Ctrl/Cmd+Enter)" | True. | `sqlime-editor.js` |
| Journey 1: "the default database is already loaded" | Upstream starts on an empty `new.db` with a welcome message. A default dataset needs new start-up logic (M3). | `showStarted`, `manager.js` |
| "Keep file upload and open-from-URL" | Both exist, but the toolbar that holds them (open file, open url, about) is `hidden-mobile`, which is `display:none` at 40rem and below. On phones the only visible controls are the command-bar buttons (Run, tables) and the footer, and the shortcuts need a keyboard. | `index.html`, `css/layout.css` |
| Repo layout `tests/` with Playwright | `test/` was a hand-rolled in-browser harness. **Deleted in M2**; `tests/` replaces it. | section 8 |
| Credit "in the footer" and on About | **Done in M2.** `index.html` has a footer with the credit and a link to `about.html`; `about.html` states the credit in its text and footer. The exact sentence is "Based on SQLime by Anton Zhiyanov", written as plain HTML in both pages (not from `config.js`, so it cannot be renamed away). | `index.html`, `about.html`, `tests/m2-brand.spec.js` |
| "The app name is one constant used everywhere" | **Done in M2.** `js/lab/config.js` `APP_NAME`; `brand.js` applies it; `index.js` builds `<db name> - <app name>` titles with `titleFor`. A test fails if the name is written anywhere else in shipped HTML, CSS, JS or SVG, in any letter case. | `tests/m2-brand.spec.js` |
| Relative URLs only (section 6) | **Resolved in M1** for everything that is fetched or linked. M2 removed the last absolute `og:url` / `og:image` metadata (and every other `og:*` tag and `twitter:card`) with the upstream cover image. `tests/ac7-pages.spec.js` greps shipped HTML/CSS/JS for root-absolute URLs and for `location.origin`-style path building. | |
| Deploy workflow `pages.yml`, repo root minus `tests/` | **Done in M1**; M2 dropped the `test/` exclude along with the directory (section 8). | `.github/workflows/pages.yml` |
| F5 "errors name the failing statement", row cap, CSV | None exist. Errors name no statement (6b); no row cap (3.2); no CSV. | |
| F6 run log | None exists. The only history is the single last SQL per database name (section 4). | |
| Upstream CSS class `sql-status--error` / `sql-status--success` (set in `sqlime-status.js`) | `css/status.css` styles `.sqlime-status--error` / `--success`. The class names differ, so the red cross and tick never show. Upstream bug, not fixed. | `sqlime-status.js`, `css/status.css` |

### 6f. Hazards found while reading (relevant to F3 share links and the checker)

All four were verified in M1 and **closed in M2**; each has a test in `tests/m2-injection.spec.js` or `tests/m2-table-names.spec.js` that fails if the escaping is removed.

| Hazard | Where it was | Fix |
|---|---|---|
| Column headers inserted unescaped | `printer.js` | `printResult` escapes headers and values (`escapeHtml`; line breaks in values still become `<br>`) |
| Error text into the status area through `innerHTML` | `sqlime-status.js`, `showError` | `showError` escapes; so does every failure message in `start` (the path and the exception text) |
| Table names unescaped in `printTables` / `showTable`; names spliced into SQL with `String.replace` | `printer.js`, `showTable`, `db.js` `getTableInfo`, `showTableContent` | `printTables` escapes the text and the `data-arg`; `showTable` escapes the name; SQL is built by `js/lab/sql.js` with identifiers quoted and quotes doubled. `SQLite.getTableInfo` still has the raw splice but nothing calls it; do not use it |
| Saved or loaded SQL ran automatically at start | `showStarted` | It does not run any more (section 3.1): restored SQL waits in the editor |

Other sinks found by sweeping every `innerHTML` / `insertHTML` use, also closed: pasting into the editor passed raw clipboard text to `execCommand("insertHTML")` (now escaped first); `copy-link.js` restored its label with `innerHTML` (now `textContent`). What is left writes only constant markup (`toolbar.js`, `command-bar.js`, `showWelcome`, `actionButton` callers) or is escaped by its caller (`sqlime-status` `value`, `sqlime-result`). File names reach the page only through `innerText` (`db-name`), `document.title` and `localStorage` keys. Rule for new code: any string from SQL, a database, a file name, a URL or an error goes through `escapeHtml` before `innerHTML`, or through `textContent` / `dataset`.

## 7. Where new code should plug in

Goal: add functionality without editing `js/sqlite/`. `js/index.js` is the page controller and not part of the execution core, but its state is module-private, so hooks below avoid editing it too. Hook 1 is now realised by `js/lab/router.js` (an explicit seam in `startFromCurrentUrl`, not a pre-load module); hooks 1-3 were exercised with a throwaway module inserted before `index.js` in M1 (verified); M2 changed `index.js` and removed `github` from `window.app`, but not the shapes the hooks rely on.

| # | Hook | How | Notes |
|---|---|---|---|
| 1 | **Run before the initial load**: add `<script type="module" src="js/lab/<new>.js">` in `index.html` just before `js/index.js`. Modules run in order, and `index.js` calls `startFromCurrentUrl()` at its end. | The new module can read `location.hash` (for example an F3 `#s=...` fragment or `?db=`), then `history.replaceState` to a plain `#<dataset file>` and/or seed `localStorage["sqlime.query.<name>"]` with the shared SQL. `index.js` then loads that database and restores that SQL **into the editor, without running it** (section 3.1). | The seeded key must equal the database name (the file basename, section 4). A default dataset on first visit can be done the same way (set `#datasets/...` when the hash is empty). The DOM from `command-bar.js` / `toolbar.js` is not rendered yet if the new module sits before them in the tag order; put it after them. SQL arriving from a link must stay unexecuted: that is the whole point of the M2 change, and a shared query should wait for the student's Run. Anything the module shows from a link goes through `escapeHtml`. |
| 2 | **`window.app`**: `{actions, ui}`. `ui` holds the element handles (editor, status, result, commandbar, toolbar, name, buttons). `actions` is the live object that `ActionController` reads on every click, so `window.app.actions.myAction = () => Promise` adds a handler. | Any `<button data-action="myAction" data-arg="x">` placed inside `#commandbar`, `#status` or `#result` is dispatched to it. Handlers must return a Promise. | `database` is **not** exposed. |
| 3 | **Wrap the engine seams** without editing them. (a) `globalThis.sqlite3InitModule` is read as a global at call time (`manager.init`): wrapping it hands the module the real API object (`api.wasm`, `api.oo1`, `api.capi`), which is otherwise private; `tests/helpers.js` `captureEngineInit` does exactly this. (b) `manager` is a plain default-export object whose `init` is called as `manager.init(...)`: replacing it captures every loaded `SQLite` instance. (c) `SQLite.prototype.execute` is the single funnel for user SQL (and the schema-info query): wrapping it gives every run's SQL, row count or thrown error, which is all F6 needs. | ES modules are singletons, so `import manager from "./sqlite/manager.js"` and `import { SQLite } from "./sqlite/db.js"` give the same objects `index.js` uses, as long as the import specifier resolves to the same URL (no query string). | Verified together in M1: captured the API, loaded `demo.db`, logged the run, then built a second in-memory connection from the exported bytes with `wasm.allocFromTypedArray` + `sqlite3_deserialize`: the pristine-copy mechanism the exercise checker needs. `execute` returns only the first result set with collapsed duplicate columns (section 3.2), so the checker should use its own `rowMode: "array"` queries on the second connection. Install the wrappers before `index.js` runs (hook 1). Prefer an explicit seam (a small, delegating change in `index.js`) where one is practical; wrapping is the fallback. |
| 4 | **DOM events** on existing elements, added with `addEventListener`: `ui.editor` `execute` (detail = SQL) and `start`; `ui.toolbar` `open-file` (detail = `File`) and `open-url`; `ui.name` `change`; `window` `popstate`. | For example the Check button, or a history logger, can listen to `execute`. | There is no event after a run completes or after a database is loaded; use hook 3 for those. `execute` events do not bubble, so listen on the editor element itself. |
| 5 | **Extend the UI by appending DOM**. `#commandbar` is `display:flex` with buttons as direct children; the Run button is styled by `:first-child` and every other button looks like "tables", so **a new button (the F3 copy link button is the example, now in `command-bar.js`) is appended as another `<button>` or `<copy-on-click class=button>` child and needs no CSS change** (check it at 360px wide; Run grows to fill the row on phones). Append children to it rather than editing `command-bar.js`. Panels (dataset picker, schema sidebar, exercises) are new siblings inside `div.grid`, above the `<footer>`. Add stylesheets with extra `<link>` tags in `index.html`. | | `.toolbar` carries `hidden-mobile` (display:none at 40rem and below), so put anything students need on a phone elsewhere. `.grid` layout is in `css/layout.css`; the footer is the last child of `.grid` (`css/footer.css`). |
| 6 | **Own the editor interface, not the element**. `index.js` touches the editor only through `ui.editor.value` (get/set), `.query`, `.focus()`, `addEventListener("execute"/"start")`. A replacement editor (F8, CodeMirror) can swap in if it implements exactly those, keeping the element id `#editor`. | | `.query` must keep "selection else all" semantics, or Run changes meaning. A replacement must keep the keyboard way out (Escape, then Tab) and the `aria-describedby="editor-hint"` link; `tests/m2-editor-keys.spec.js` checks both. |
| 7 | **Keyboard shortcuts**: build a second `new ShortcutController({...}).listen(document)`. `shortcuts` in `index.js` is private and uses Ctrl/Cmd + `o`, `u`, `/`; Ctrl+Enter is handled inside the editor. | | Both controllers `preventDefault` on a match; avoid the three taken keys. `s` is free again (do not reuse it for anything that looks like a download or share without thought: browsers bind it to Save page). |
| 8 | **Reusable parts**: `actionButton()`, `<copy-on-click href=...>` (clipboard copy, unused now), `setShareContext` from `js/lab/share.js` (M3 and M4 call it with the dataset, set and exercise ids so copy link carries them), `shareUrl` / `decodeShare` (F11's per-entry link), `escapeHtml`, `sql.js`, `titleFor`, `storage.js` (the `sqlime.query.*` namespace; use a different prefix for new keys such as `sqllab.*`), `ActionController` for any new button group. | | `storage.js` has no way to list keys; F6/F7 should use their own module with their own prefix. |
| 9 | **Branding**: write the app name only through `config.js`. In HTML use `data-app-name` on an empty element; in JS import `APP_NAME` or `titleFor`. Put a page-specific title part in `<title data-page-title="...">`. | | The test that greps for the literal name scans all shipped HTML, CSS, JS and SVG. |
| - | **Not a hook**: `database` (`index.js`) and `sqlite3` (`manager.js`) are module-private. If the module wrappers in hook 3 prove too fragile, the smallest core edit is exporting `sqlite3` from `manager.js` and adding a `database` getter to `window.app`. | | |

## 8. Build, deploy and tests as found

| Item | Facts |
|---|---|
| `Makefile` | Targets `sqlite` (re-download the engine into `vendor/`) and `serve` (port 8000 by default, `python3 -m http.server`). |
| Workflow | `.github/workflows/pages.yml`: on push to `main` and manual dispatch; `actions/checkout@v7`, `actions/configure-pages@v6`, an `rsync` staging step, `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5`. `upload-pages-artifact` tars with `--exclude=.[^/]*` unless `include-hidden-files: true` is set, which would silently drop `.nojekyll`; it always drops `.git` and `.github`. |
| `.nojekyll` | Empty file at the repo root. |
| `tests/` | Playwright (`@playwright/test` 1.65.0, dev only; `npm ci && npm test`). `tests/static-server.mjs <port> <mount>` is a zero-dependency server that serves the repo root under a mount, answers 404 outside it (so root-absolute URLs fail on the subpath run), sends no COOP/COEP, and hides exactly what the workflow leaves out (its `HIDDEN` set, compared with the `--exclude` list in `pages.yml` by an AC7 test). `playwright.config.js` starts a root mount on `TEST_PORT_BASE` (default 4173) and `/repo/` on `TEST_PORT_BASE+1`, with projects `{chromium,firefox}-{root,subpath}` (plus `webkit-*` when `PW_WEBKIT=1`). `tests/helpers.js` has the `net` fixture (every request; external and same-origin-failure assertions; body bytes), the `app` fixture (open, run, read table, upload with optional `{ready:false}`, export, `expectInert`), `pageErrors`, the `engine` export hook (`app.rename`, `app.storedQueries` too), and the injection payload constants. Specs named `ac<N>-*.spec.js` cover the acceptance criterion `AC<N>` (3, 6, 7, 8, 9); `f3-share.spec.js` covers F3 (AC4 for the part that exists, AC6 with sharing, damaged links incl. loosely written starts and the size guard, shared SQL vs storage, open tab, the button with mouse, keyboard and refused clipboard; `openFresh` in `helpers.js` opens a link in a brand-new context); `m2-*.spec.js` cover the M2 work: `m2-brand` (name constant, rename through a routed copy of `config.js`, credit, footer layout, favicon, metadata), `m2-no-sharing` (gist and token code gone, Ctrl+S, unsupported addresses, open-url prompt), `m2-injection` (markup through aliases, values, errors, table names, file names, URLs, paste, saved SQL), `m2-restore`, `m2-editor-keys`, `m2-table-names`. `smoke.spec.js` checks that the app boots and which requests it makes; `static-server.spec.js` tests the harness itself. `tests/fixtures/` holds `sample.db` and `make_fixtures.py`. Unmodified SQLime has no export action, so AC3's export uses the engine's own serializer through a test-only hook (`engine` fixture). Tests navigate only with relative URLs. |
| What ships | The staged site is the repo root minus `.git`, `.github`, `.gitignore`, `.site-stage`, `tests/`, `node_modules/`, `package.json`, `package-lock.json` and `playwright.config.js` (`pages.yml`; the test server hides the same set). Everything else at the root is deployed and publicly fetchable: `CODEMAP.md`, `README.md`, `LICENSE`, `Makefile`, and the tracked root `.db` files (`demo.db`, `employees.db`, `sales.db`). `generate_db.py` and `northlight_retail.db` are the owner's input files: they are untracked and git-excluded (`.git/info/exclude`), so a CI checkout does not have them and the staging step cannot copy them; they become part of the site only if they are committed in M3. Left in on purpose: the spec's layout puts `CODEMAP.md` and `README.md` at the root and says to deploy the root minus `tests/` and `node_modules/`; the dataset files move in M3. |
