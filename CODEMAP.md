# CODEMAP

Map of the upstream SQLime code as it stands in this fork (after M1, before any M2+ change). M1 changed only where files live and how they are deployed (section 8), not behaviour; line numbers below are unaffected. Written for engineers and agents who will extend it.

Conventions: `file:line` references are to the tree at the time of writing. Statements marked **(verified)** were also checked by running the app in headless Chromium against a plain `python3 -m http.server` (no special headers) with the engine fetched from the URL in the Makefile (it is now committed in `vendor/`); everything else comes from reading the code.

## 0. Layout at a glance

| Path | What it is |
|---|---|
| `index.html` | The playground page. Loads the engine, then the components, then `js/index.js`. |
| `about.html`, `settings.html` | Static pages styled by `css/article.css`. `settings.html` is the GitHub token form. |
| `js/` | All application code (section 2). Vanilla ES modules, no bundler, no dependencies. |
| `vendor/sqlite3.js`, `vendor/sqlite3.wasm` | The engine (official SQLite WASM 3.54.1), committed as ordinary files. Moved here in M1 from `js/sqlite/`, where it was git-ignored and downloaded by `make`. `make sqlite` re-downloads it (version bump). |
| `css/` | One stylesheet per UI region; `core.css` and `layout.css` are global. No `url()` or `@import` anywhere, so there are no external fonts or images in CSS. |
| `demo.db`, `employees.db`, `sales.db` | Sample databases at the repo root. `demo.db` and `employees.db` both hold `employees` + `expenses`; `sales.db` holds `sales`. |
| `test/` | In-browser test page (`suite.html` + `suite.js` + `tester.js`), not Playwright. See section 8. |
| `Makefile`, `.github/workflows/pages.yml`, `.nojekyll`, `package.json`, `playwright.config.js`, `tests/` | Engine bump, deploy and Playwright tests, section 8. (M1 removed `CNAME` and `deploy.yml`.) |

## 1. Entry points and run order

### index.html (the playground)

| Order | What runs | Where |
|---|---|---|
| 1 | Parser builds the DOM. Custom elements (`<tool-bar>`, `<command-bar>`, `<sqlime-editor>`, `<sqlime-result>`, `<sqlime-status>`, `<db-name>`) are still inert. | `index.html:29-57` |
| 2 | **Classic** (blocking) script `vendor/sqlite3.js` defines the global `sqlite3InitModule`. It does not start the engine. | `index.html:59` |
| 3 | Module scripts run in document order: `copy-link.js`, `db-name.js`, `toolbar.js`, `command-bar.js`, `sqlime-editor.js`, `sqlime-result.js`, `sqlime-status.js`. Each calls `customElements.define`, which upgrades the element. `toolbar.js` and `command-bar.js` write their markup with `innerHTML` in `connectedCallback`; `sqlime-status.js` appends one inner `<div>`; `sqlime-editor.js` only sets `contenteditable` / `spellcheck` and registers listeners; `db-name.js` only registers a listener; `sqlime-result.js` renders nothing until `print` is called. | `index.html:60-66` |
| 4 | `js/index.js` runs last. It looks up the elements (`index.js:13-26`), builds `actions` and `shortcuts` maps (`28-44`), exposes `window.app` (`51-55`), registers listeners (`309-356`), then calls `startFromCurrentUrl()` as its final statement (`358`). | `index.html:67` |

Order dependency that matters: `index.js:16-18` does `querySelector("#execute")`, `#save`, `#show-tables`, and `index.js:39` uses `ui.toolbar.btnOpenFile`. Those elements only exist after `command-bar.js` and `toolbar.js` have run, so any new module that must run before `index.js` cannot assume those parts of the DOM exist yet.

### Other pages

| Page | Scripts |
|---|---|
| `settings.html` | `js/settings.js` (module, `settings.html:43`). Standalone; does not touch the engine. |
| `about.html` | Inline `back()` function only (`about.html:142-150`). |
| `test/suite.html` | `test/tester.js`, `test/suite.js` (modules). Drives `../index.html` in an iframe. |

## 2. Modules in js/

| File | Role |
|---|---|
| `js/index.js` | The page controller and the only place that holds the current database (`let database`, `index.js:48`, module-private). Owns start/load, execute, result/status rendering, name change, and the (to-be-removed) save/share. Exposes `window.app = {actions, github, ui}` for tests. |
| `js/db-path.js` | `DatabasePath`: classifies a location string as `empty`, `remote`, `local`, `id`, `binary` or `sql`; derives the display name; converts back to a hash. |
| `js/storage.js` | Thin wrapper over `localStorage` for one thing: the last SQL per database name. |
| `js/printer.js` | Turns a `{columns, values}` result, or a table list, into an HTML string (`<table>`). |
| `js/github.js` | GitHub Gists API client (get/create/update) with token read from `localStorage`. Whole file is sharing. |
| `js/settings.js` | Wires the form in `settings.html` to the two GitHub `localStorage` keys. |
| `js/sqlite/manager.js` | The engine front door. `init(name, path)` boots the WASM once and returns an `SQLite` for any path type; also `save` (gist). Holds the private `sqlite3` API object. |
| `js/sqlite/db.js` | `SQLite` class wrapping one `oo1.DB`: `execute`, `each`, `gatherTables`, `getTableInfo`, `calcHashcode`, naming helpers. Also `DEFAULT_NAME`, `QUERIES`, `MESSAGES`. |
| `js/sqlite/dumper.js` | Dumps schema and rows to a SQL script (for the gist). Used only by `manager.save`. |
| `js/components/action-button.js` | `actionButton(name, text, arg)` returns the HTML of a `<button class="sqlime-link" data-action=... data-arg=...>`. |
| `js/components/command-bar.js` | `<command-bar>`: renders the Run, share (save) and tables buttons (`command-bar.js:12-31`). |
| `js/components/copy-link.js` | `<copy-on-click href>`: copies its `href` attribute to the clipboard, shows "copied!". Reusable for F3. |
| `js/components/db-name.js` | `<db-name>`: contenteditable name in the header; fires `change` on Enter; `ready(name)` enables editing. |
| `js/components/sqlime-editor.js` | `<sqlime-editor>`: a plain contenteditable div. Tab inserts two spaces, paste is forced to plain text, Ctrl/Cmd+Enter fires a `execute` CustomEvent, first input fires `start`. `value` (innerText) and `query` (selection, else full text). |
| `js/components/sqlime-result.js` | `<sqlime-result>`: `print(result)`, `printTables(tables)`, `clear()`; all set `innerHTML` from `printer.js`. |
| `js/components/sqlime-status.js` | `<sqlime-status>`: one-line status area; `info`, `success`, `error`, `loading`, `fadeOut/In`. The `value` setter writes **innerHTML** (`sqlime-status.js:57`). |
| `js/components/toolbar.js` | `<tool-bar>`: "open file" (hidden `<input type=file>`), "open url", links to `settings.html` and `about.html`. Fires `open-file` and `open-url` events. |
| `js/controllers/actions.js` | `ActionController`: click delegation. Finds the clicked `<button>`, looks up `handlers[btn.dataset.action]`, disables the button until the returned promise settles. Handlers must return a Promise. |
| `js/controllers/shortcuts.js` | `ShortcutController`: on `keydown` with Ctrl or Meta, calls `handlers[event.key]` and `preventDefault`s. |

Not in this list on purpose: `vendor/sqlite3.js` / `.wasm` are the vendored third-party engine, not app code (section 6d).

## 3. Flow: open a database, execute, render

### 3.1 Open

```
startFromCurrentUrl  index.js:59      reads location.hash (index.js:60)
 -> new DatabasePath  db-path.js:12   classify (section 5)
 -> start(name, path) index.js:97     clears result, status "Loading database..."
     -> manager.init  manager.js:20   boots engine once: sqlite3InitModule(CONFIG) (manager.js:22), cached in `loading`
         path remote/local -> fetchFile (manager.js:99, plain fetch(url), null on !ok or throw)
                              .sql suffix -> fromSql (manager.js:86)   else -> fromBytes (manager.js:62)
         path binary       -> fromBytes     (file upload)
         path sql          -> fromSql       (file upload)
         path id           -> loadGist      (manager.js:112, GitHub API)
         otherwise (empty) -> create        (manager.js:56): new sqlite3.oo1.DB()  == ":memory:" (verified)
     -> fromBytes: flips WAL header bytes 18/19 from 2 to 1 (manager.js:69-70), sqlite3_deserialize into "main" (manager.js:73-80), gatherTables
     -> returns SQLite instance (db.js:32)
   back in start: `database = loadedDatabase` (index.js:104), restores saved SQL
   `database.query = database.query || storage.get(database.name)` (index.js:114),
   sets title, header name (ui.name.ready), editor value + focus (index.js:116-120)
 -> showStarted      index.js:204
     saved query exists -> execute(database.query) + enable command bar
     else tables exist  -> showTableContent(first table) (index.js:238): editor gets "select * from <t> limit 10" and runs it
     else               -> showWelcome (index.js:251)
```

Other entry points into `start`: `startFromUrl` (`index.js:71`, from "open url", pushes `#<url>` with `pushState`), `startFromFile` (`index.js:84`, from "open file", pushes `./` so the hash is dropped), and `popstate` (`index.js:340`, back/forward and hash edits).

Observed behaviours worth knowing (verified):
- A failed load leaves `database` in one of two states, depending on how `manager.init` fails (`index.js:101-112`):
  - `init` **returns null** (404, fetch error, empty `.sql`, a `gist:`-style prefix that does not resolve): `database = loadedDatabase` (`index.js:104`) has already run, so `database` is `null`. The old UI stays on screen and the next Run throws `Cannot read properties of null (reading 'name')` at `index.js:134`.
  - `init` **throws** (a file that is not a database, a `.sql` script with an error): line 104 is never reached, so `database` keeps its previous value. On a fresh page that is `undefined`, and the next Run throws `Cannot read properties of undefined (reading 'name')`. After an earlier successful load it is the previous database, which keeps working under its old name and editor text (verified: open `#demo.db`, change the hash to `#README.md`, and `select count(*) from employees` still runs).
  The status line shows the failure in both cases (`Failed to load database from URL README.md: SQLite3Error: SQLITE_NOTADB: ...` for the throw).
- There is no default dataset. With no hash, an empty in-memory `new.db` is created and the welcome text is shown.

### 3.2 Execute

```
Trigger A: Ctrl/Cmd+Enter in editor
   handleExecute  sqlime-editor.js:80   dispatches CustomEvent("execute", {detail: editor.query})   (sqlime-editor.js:91)
   listener       index.js:345          -> execute(event.detail)
Trigger B: Run button
   ActionController.onClick  actions.js:17 -> actions.executeCurrent -> executeCurrent (index.js:126) -> execute(ui.editor.query)

execute(sql)  index.js:132
   sql.trim(); storage.set(database.name, sql)  (index.js:133-134)   <- saves what was run, i.e. the selection if there was one
   empty -> status "Run SQL query...", result cleared, return
   status.fadeOut + "Executing query..." (index.js:141-142)
   t0 = performance.now(); result = database.execute(sql)   (index.js:143-144)
      SQLite.execute  db.js:46
         this.query = sql                                   (db.js:51)
         this.db.exec({sql, rowMode:"object", resultRows})  (db.js:53-57)   <- engine runs ALL statements, section 6b
         no rows -> return null
         else {columns: Object.getOwnPropertyNames(rows[0]), values: rows.map(Object.values)}  (db.js:61-69)
   showResult(result, elapsed)  index.js:267
      rows -> ui.status.success("N rows, took X ms"); ui.result.print(result)
      none -> ui.status.success("0 rows, ..."); ui.result.print("")  -> clears
         -> SqlimeResult.print sqlime-result.js:7 -> applyPrinter (18) -> printer.printResult (printer.js:4) -> this.innerHTML = "<table>..."
   catch -> showError(exc) index.js:279: first line of exc.toString() into the status as error; result cleared; returns Promise.reject(exc)
```

Other render paths: `showTables` (`index.js:217`, `database.gatherTables` db.js:83, `ui.result.printTables`), `showTable` (`index.js:229`, `database.getTableInfo` db.js:99 which runs `QUERIES.tableInfo`, `db.js:12-14`).

Quirks of this path that new code inherits:
- Results are built by `Object.getOwnPropertyNames(rows[0])` from `rowMode: "object"` rows (`db.js:62`), so **duplicate column names collapse** (`select 1 as a, 2 as a` shows one column `a` with value 2) and **integer-like column names are reordered ahead of the others** (`select 2 as b, 1 as "1"` shows columns `1, b`). Both verified. Anything that needs positional, order-faithful rows (the exercise checker) must not use `SQLite.execute`; it needs `rowMode: "array"` on `database.db`.
- There is no row cap; every row becomes one big `innerHTML` string.
- `execute` returns a rejected promise on error. The editor listener (`index.js:345-347`), `showStarted` (`index.js:206`) and `showTableContent` (`index.js:241`) do not handle it, so each failed run logs an unhandled rejection. `ActionController` swallows it (`actions.js:36`).
- The editor swallows Tab and Shift+Tab (`sqlime-editor.js` `handleIndent` inserts two spaces), so a keyboard user cannot Tab out of it to the Run button. Ctrl/Cmd+Enter is the keyboard route to run (found while writing `tests/ac8-keyboard.spec.js`; not fixed in M1).
- `ui.editor.query` uses `window.getSelection().toString()` (`sqlime-editor.js:64`), which is the page-wide selection, not the editor's. By reading the code (not tested): text selected anywhere (for example in the results table) is what the Run button executes.

## 4. localStorage

Complete list. `grep` finds no `sessionStorage`, IndexedDB or cookie use in `js/`, `index.html`, `about.html` or `settings.html`. The engine opens `:memory:`, so nothing is persisted by SQLite (the build also registers `kvvfs`, a localStorage-backed VFS, but nothing opens it; verified registered, unused).

| Key | Value | Written by | Read by | Removed by |
|---|---|---|---|---|
| `sqlime.query.<database.name>` (prefix `PREFIX`, `storage.js:4`) | The last SQL text run, or saved with share, for that database name. `database.name` is the file basename, or `new.db` for the empty database, so two databases with the same basename share one slot. | `storage.set` (`storage.js:12-17`) called from `index.js:134` (every `execute`, with the trimmed text that was run, including empty), `index.js:169` (`save`), `index.js:198` (`changeName`, under the new name) | `storage.get` (`storage.js:7-9`) at `index.js:114` (on every successful `start`) | `storage.remove` at `index.js:196` (old name on rename) and `index.js:336` (logo click removes `new.db` only). Quirk: `set` with empty SQL calls `remove` and then still writes `""` (`storage.js:13-16` has no `return`). |
| `github.username` | GitHub user name | `settings.js:11, 16` | `github.js:21` (getter, used by `hasCredentials` and `getUrl`), `settings.js:23`, `manager.js:144` | never |
| `github.token` | GitHub API token, plain text | `settings.js:12, 20` | `github.js:25` (getter, sent as `Authorization: Token ...` at `github.js:70`), `settings.js:24` | never |

`test/suite.js` also reads/writes `sqlime.query.new.db`, `sqlime.query.demo.db` (`suite.js:45, 63, 287-288`) and the two `github.*` keys (`suite.js:10-13, 273-283`).

## 5. Loading a database from a URL today

### 5.1 Where it is read

Only the **fragment**. `startFromCurrentUrl` takes `window.location.hash.slice(1)` raw, without decoding (`index.js:60`). The only other location reads are `window.location.assign` for navigation (`index.js:246, 304`) and printing the current URL into the share link (`index.js:288`). There is no `location.search`, `URLSearchParams` or `hashchange` anywhere (grep). `index.html?db=x` is ignored and loads an empty database. Hash changes are picked up through `popstate` (`index.js:340`), which also fires for in-page hash edits.

### 5.2 Accepted formats

`DatabasePath.inferType` (`db-path.js:18-32`) picks the first matching rule:

| # | Rule | Type | Example fragments | Then |
|---|---|---|---|---|
| 1 | empty string | `empty` | none, `#` | new empty in-memory database (`manager.js:50-52`) |
| 2 | `ArrayBuffer` instance | `binary` | file upload only, never from a URL | `fromBytes` |
| 3 | starts with `http://` or `https://` (case-sensitive) | `remote` | `#https://raw.githubusercontent.com/nalgeon/sqlime/main/employees.db` | `fetch(url)`, plain GET with no options, so the remote host must send CORS headers |
| 4 | contains `:` anywhere | `id` | `#gist:e012594111ce51f91590c4737e41a046` | `loadGist` -> `GET https://api.github.com/gists/<id>` (verified request). Any other prefix, for example `#foo:bar`, resolves to null and shows "Failed to load database from ID foo:bar" (verified). |
| 5 | anything else | `local` | `#demo.db`, `#datasets/x.db`, `#../x.db` | `fetch(value)`, resolved against the page URL (so it is subpath-safe) |
| - | `type` passed explicitly | `sql` | file upload of a `*.sql` file only (`index.js:317`) | `fromSql` |

Both `remote` and `local` go through the same branch (`manager.js:28-36`): if `path.value.endsWith(".sql")` the body is fetched as text and executed as a script (`fromSql`, `manager.js:86-95`), otherwise as bytes (`fromBytes`). The `.sql` test is on the whole string, so `x.sql?raw=1` is treated as a binary database.

### 5.3 Name derivation and display

- `extractName` (`db-path.js:35-41`): last `/`-separated segment of the value, so a query string stays in the name (`#employees.db?x=1` gives name `employees.db?x=1`, and therefore localStorage key `sqlime.query.employees.db?x=1`; verified). `empty`, `binary`, `sql`, `id` give `""`, which `SQLite` turns into `new.db` (`db.js:35`).
- `toString` (`db-path.js:57-69`) produces the text used in failure messages: `URL <value>`, `ID <value>`, `binary value`, `sql script`, `empty value`.
- `toHash` (`db-path.js:44-54`) is only used by `showSaved` (`index.js:287`).

### 5.4 Failure handling

`fetchFile` returns null on a non-2xx response or a thrown fetch error (`manager.js:99-109`). `start` then shows `Failed to load database from <path.toString()>` (`index.js:106`), or the same with `: <exception>` if something threw (`index.js:110`). A 404 shows `Failed to load database from URL nope.db` (verified). What `database` is afterwards depends on whether `init` returned null or threw; see the section 3.1 note.

### 5.5 Other ways in

| Way | Code |
|---|---|
| "open url" button / Ctrl+U | `prompt("Enter database file URL:", "https://path/to/database")` (`index.js:158`; accepting the pre-filled example sends a request to `https://path/to/database`, a third-party host. Inherited from upstream, user-initiated, deferred to M2) -> `startFromUrl` (`index.js:71`) -> sets hash with `pushState` (`index.js:78`; `pushState` does not fire `popstate`, so no double load) |
| "open file" button / Ctrl+O | `<input type=file>` -> `open-file` event (`toolbar.js:38-44`) -> `FileReader` (`index.js:314-327`) -> `startFromFile`; `.sql` read as text, anything else as ArrayBuffer; the URL is reset to `./` (`index.js:91`) |
| "demo database" link | `loadDemo` -> `window.location.assign("#demo.db")` (`index.js:246`, `DEMO_URL` at `index.js:46`) |

## 6. Verified against the spec's assumptions

### 6a. Does share save via the GitHub Gists API with a user-supplied token?

**Yes, and it is broader than the spec says.** It saves the whole database as a SQL dump (`schema.sql`) plus the query (`query.sql`), not just the snippet, and a `#gist:<id>` link loads from `https://api.github.com/gists/<id>` (a third-party request at runtime, anonymous if no token).

Evidence:
- Endpoint and files: `github.js:15` (`https://api.github.com/gists`), `github.js:82-94` (`schema.sql`, `query.sql`), `github.js:70` (`Authorization: Token ${token}`).
- Token and user name come from the user: `localStorage` `github.username` / `github.token` (`github.js:20-26`), entered on `settings.html:28-38`.
- Share button: `command-bar.js:18-24` (`data-action="save"`, label "share") -> `actions.save` (`index.js:31`) -> `save()` (`index.js:167`). Without credentials it redirects to `settings.html` (`index.js:170-172`); Ctrl/Cmd+S does the same (`index.js:42`).
- `save` -> `manager.save` (`manager.js:129-154`) -> `dumper.toSql` -> `github.create` / `github.update`; result shown by `showSaved` with a "gist" link and a copy-link button (`index.js:285-295`).

**Everything that would have to be removed** (M2). Nothing outside this list uses GitHub.

| File | Remove | Lines |
|---|---|---|
| `js/github.js` | whole file | 1-116 |
| `js/settings.js` | whole file | 1-24 |
| `settings.html` | whole file | 1-45 |
| `js/components/toolbar.js` | the `settings.html` link | 17-23 |
| `js/components/command-bar.js` | the `#save` "share" button (F3 will add its own Copy-link) | 18-24 |
| `js/index.js` | `import github` | 3 |
| | `buttons.save` lookup | 17 |
| | `actions.save` | 31 |
| | `shortcuts.s` | 42 |
| | `github` in `window.app` | 53 |
| | `save()` | 165-189 |
| | `showSaved()` | 285-295 |
| | the "Visit settings to enable sharing" hint in `showWelcome` | 255-258 |
| `js/sqlite/manager.js` | `import github`, `import dumper` | 3-4 |
| | `path.type == "id"` branch in `init` | 47-49 |
| | `loadGist` | 111-126 |
| | `save`, `afterSave`; export becomes `{ init }` | 128-169 |
| `js/sqlite/dumper.js` | whole file (only `manager.save` uses it) | 1-101 |
| `js/db-path.js` | the `id` type: inference, name, hash and toString branches, header comment | 8, 28-30, 36, 48, 64-65 |
| `js/sqlite/db.js` | dead afterwards, optional (leaving them minimises edits to the core): `id`/`owner` fields, `each`, `calcHashcode` + `hash`, `ensureName`, `hashcode` | 33-34, 40, 72-79, 104-117, 127-142, 144-152 |
| `about.html` | "Save and share" and "Secure and private" text, the gist links, the Ctrl+S row | 62-75, 83-89, 124-128 |
| `README.md` | the same marketing text | 15-19, 27 |
| `test/suite.js` | `testLoadGist`, `testLoadGistInvalid`, `testSaveEmpty`, `testSave`, `testUpdate`, credential helpers, `buildGist`, `app.github` | 9-13, 100-120, 141-229, 252-254, 259-284, 296, 310-318 |
| localStorage | the `github.username` and `github.token` keys (nothing to delete in code; browsers that used upstream keep them) | |

Trap when removing: if the `id` branch in `manager.init` is deleted but `DatabasePath` still classifies `:` strings as `id`, `init` falls through to the final `create(name, path)` (`manager.js:50-52`) and **silently opens an empty database** instead of showing an error. Remove the `id` type from `db-path.js` in the same change.

`js/components/copy-link.js` is only used by `showSaved`, but it is generic and F3 can reuse it, so keep it (and its `<script>` tag, `index.html:60`).

### 6b. Multiple statements in one run

Chain: `execute` (`index.js:132`) -> `SQLite.execute` (`db.js:46`) -> `this.db.exec({sql, rowMode: "object", resultRows: rows})` (`db.js:53-57`) -> the engine's `oo1.DB.exec`, which prepares and runs each statement in turn.

| Question | Answer | Evidence |
|---|---|---|
| Are all statements run? | Yes, in order, stopping at the first error. | verified |
| Which result set is returned? | **The first statement that returns columns**, not the last. The docstring "returns the last result" (`db.js:44-45`) is wrong. The engine collects rows only for the first column-returning statement (flag `evalFirstResult` in the engine's `exec`, `sqlite3.js` ~9785 in 3.54.1) and just steps any later one, so its rows are discarded. | verified: `select 1 as a; select 2 as b, 3 as c;` shows only `a=1`. `select 1 as a where 0; select 2 as b` shows "0 rows" (an empty first SELECT still consumes the slot). `select 1 as a; create table z(y)` shows 1. |
| What is rendered per statement? | Nothing per statement. There is exactly one status line and one table for the whole run: `N rows, took X ms` (`index.js:269`) and one `<table>` (`printer.js:4`). Time covers the whole run (`index.js:143-145`). If no statement returned rows, `0 rows, took X ms` with an empty result (`index.js:272-273`), including after DML. | `index.js:267-275` |
| How does an error surface? | `exec` throws an `SQLite3Error`. `showError` (`index.js:279-283`) puts the **first line of `exc.toString()`** in the status area, styled as error, and clears the result table. Example text: `SQLite3Error: SQLITE_ERROR: sqlite3 result code 1: no such table: nope`. | verified |
| Which statement is named? | **None.** The message is SQLite's own error text only: no statement index, no SQL text, no position. The exception carries only `message`, `resultCode`, `name`, `stack`. | verified (`Object.getOwnPropertyNames(e)` = `stack, message, resultCode, name`) |
| Message format | Prefix `SQLite3Error: SQLITE_ERROR: sqlite3 result code 1: ` before SQLite's text. A "verbatim engine message" (spec section 5) therefore needs that prefix stripped or a decision to keep it. | verified |
| Do earlier statements stay applied? | **Yes.** Nothing wraps a run in a transaction (the only `BEGIN`/`COMMIT` in `js/` are inside the dump script text, `dumper.js:22,27`), so the connection auto-commits each statement. Statements before the failing one persist; the failing one and everything after it never run. A later syntax error is only detected when that statement is reached, so earlier ones have already run. | verified: `create table u(x); insert into u values(1); selct;` errors, then `select count(*) from u` returns 1 |
| Rows from the earlier SELECT on error | Lost: the error path clears the result table. | `index.js:281` |
| Side effects of an error | `database.query` was already set to the SQL (`db.js:51`) and the SQL was already saved to localStorage (`index.js:134`). A `BEGIN` left open by a failing script stays open on the connection. | code |

### 6c. Current URL format for loading a database

Fragment only, `#<value>` where `<value>` is a relative path/file name, an `http(s)://` URL, or `gist:<id>`. No query-string form exists, so the spec's `?db=<id>` alias is entirely new work. No SQL, dataset id, or exercise id can be carried today. Full table in section 5.2. Two structural facts matter for F3: (1) anything containing `:` is classified as a gist id (`db-path.js:28`), and (2) any other non-empty fragment is treated as a file path to fetch, so a new fragment scheme such as `#s=<lz-string>` would currently produce "Failed to load database from URL s=..." unless it is intercepted before `index.js:60` (see section 7, hook 1).

### 6d. Engine build, origin, and COOP/COEP / OPFS / SharedArrayBuffer

| Question | Answer | Evidence |
|---|---|---|
| Which engine? | The **official SQLite WASM build** (the `jswasm` `sqlite3.js` + `sqlite3.wasm` with the `oo1` API), SQLite **3.54.1**. It is **not** sqlean.js. | `Makefile:1-3`; `manager.js:22-23` logs `sqlite3_libversion()`; verified `3.54.1` at runtime |
| Where from? | Vendored: committed in `vendor/` since M1. The files come from `https://sqlite.org/2026/sqlite-wasm-3540100.zip` (the `jswasm/` directory), refreshed by `make sqlite` after editing `SQLITE_YEAR` / `SQLITE_VERSION` in the `Makefile`. Upstream instead downloaded them at build time into `js/sqlite/` and git-ignored them. | `Makefile`, `vendor/` |
| Size | `sqlite3.js` 439,732 B, `sqlite3.wasm` 879,430 B (raw), about 1.3 MB of the 3 MB budget. | measured |
| How is it loaded? | Classic `<script src="vendor/sqlite3.js">` on the main thread (`index.html:59`), then `sqlite3InitModule(CONFIG)` (`manager.js:22`). The `.wasm` is fetched relative to the script (`vendor/sqlite3.wasm`). No Web Worker. | verified by `tests/smoke.spec.js`: the only requests besides the app's own files are `vendor/sqlite3.wasm`; no OPFS proxy worker, no second wasm, no COOP/COEP headers, `crossOriginIsolated === false` |
| Database mode | In-memory only: `new sqlite3.oo1.DB()` (`manager.js:57`) has filename `:memory:` (verified). Uploaded or fetched files are copied in with `sqlite3_deserialize` (`manager.js:73`). Nothing is written back; there is no persistence layer. | |
| COOP/COEP, OPFS, SharedArrayBuffer? | **No dependency.** None of `SharedArrayBuffer`, `Atomics`, `opfs`, `crossOriginIsolated`, `COOP`, `COEP` or `Worker` appears in any app file (grep of `js/`, `*.html`, `css/`, `Makefile`, `.github/`, `test/`). At runtime without special headers: `crossOriginIsolated === false`, `typeof SharedArrayBuffer === "undefined"`, `sqlite3.opfs` undefined, `sqlite3_vfs_find("opfs") === 0` (a null pointer), and the app works. The OPFS VFS is simply not installed. | verified |
| Extensions | No sqlean (no `sqlean` string anywhere in the repo). Only what the stock build compiles in. | grep |

Engine facts that constrain new code (verified):
- `sqlite3InitModule` is **single-use**. A second call throws `TypeError: Cannot read properties of undefined (reading 'entries')`. `manager.js` caches the result in `loading` (`manager.js:10, 21-25`), and the resulting API object is a private `let sqlite3` (`manager.js:8`), not exported. New code must not boot a second engine.
- `database.db.constructor` is not `sqlite3.oo1.DB`, so do not use it to construct connections. Use the API object (section 7, hook 3).

### 6e. Other places where the code contradicts the spec's description of upstream

| Spec says | Code says | Evidence |
|---|---|---|
| "SQLite compiled to WASM (the sqlean.js build with extensions)" (section 2) | Official SQLite WASM 3.54.1, no extensions | 6d |
| "no build step" (section 2, 3.3) | **Resolved in M1.** Upstream's `make build` was the deploy path and downloaded the engine at build time, so the repo was not runnable as cloned. The engine is now committed in `vendor/` and the repo root is the site. | `Makefile`, `vendor/`, `.github/workflows/pages.yml` |
| "keep (and verify) the existing **export-database** action" (F1) and acceptance 3 "export then re-upload round-trips" | **There is no export action.** No Blob, download link, or `createObjectURL` anywhere. `sqlite3_js_db_export` is called once, only to compute a change-detection hash (`db.js:110`). The nearest thing is the gist SQL dump (`dumper.js`), which is being removed. Export is a new feature, not a verification task. | grep for `export|serialize|blob|download|createObjectURL` in `js/` and `index.html` |
| Share saves "snippets" | Saves the whole database dump plus the query, and loading goes to api.github.com | 6a |
| "Run (Ctrl/Cmd+Enter)" | True (`sqlime-editor.js:80-93`). | |
| Journey 1: "the default database is already loaded" | Upstream starts on an empty `new.db` with a welcome message. A default dataset needs new start-up logic. | `index.js:204-214`, `manager.js:50-52` |
| "Keep file upload and open-from-URL" | Both exist, but the toolbar that holds them (open file, open url, settings, about) is `hidden-mobile`, which is `display:none` at 40rem and below. On phones the only visible controls are the three command-bar buttons, and the shortcuts need a keyboard. | `index.html:41`, `css/layout.css:19-23` |
| Repo layout `tests/` with Playwright | `test/` is a hand-rolled in-browser harness; its gist tests call the live GitHub API and it uses fixed `setTimeout` waits | section 8 |
| Credit "in the footer" | `index.html` has no footer. `about.html:139-141` has one, text "SQL for the win!". | |
| Relative URLs only (section 6) | **Resolved in M1** for everything that is fetched or linked: the root-absolute `/img/...` and `href="/"` in `index.html`, `about.html`, `settings.html` and `test/suite.html` are now relative. All JS paths were already relative (`fetch(value)`, `${page}.html`, `"./"`). Still absolute, on purpose: `og:url` / `og:image` metadata pointing at `sqlime.org` (`index.html:14-15`, `about.html:14-15`; rebrand work for M2) and outbound links. `tests/ac7-pages.spec.js` greps shipped HTML/CSS/JS for root-absolute URLs and for `location.origin`-style path building. | |
| Deploy workflow `pages.yml`, repo root minus `tests/` | **Done in M1.** `.github/workflows/pages.yml` stages the repo root into `.site-stage/` minus `.git`, `.github`, `.gitignore`, `tests/`, `node_modules/`, upstream's `test/`, `package.json`, `package-lock.json` and `playwright.config.js` (section 8, "What ships"), then uploads it with `upload-pages-artifact` (`include-hidden-files: true`, see section 8). `deploy.yml` and `CNAME` are deleted. | `.github/workflows/pages.yml` |
| F5 "errors name the failing statement", row cap, CSV | None exist. Errors name no statement (6b); no row cap (3.2); no CSV. | |
| F6 run log | None exists. The only history is the single last SQL per database name (section 4). | |

### 6f. Hazards found while reading (relevant to F3 share links and the checker)

The first two rows are **verified**; the last two are from reading the code.

| Hazard | Where | Why it matters |
|---|---|---|
| Column headers are inserted unescaped: `join(columns, "th")` | `printer.js:9` | `select 1 as "<i>hi</i>"` renders an `<i>` element in the header. Row values **are** escaped (`sanitize`, `printer.js:44-48`). |
| Error text goes into the status area through `innerHTML` | `sqlime-status.js:57`, `index.js:282` | SQLite error messages echo user text: `select * from "<img src=x onerror=...>"` gives `no such table: <img ...>` and an `<img>` element appears in the status. |
| Table names are unescaped in `printTables` and `showTable`; `tableInfo` / `tableContent` splice names into SQL with `String.replace` | `printer.js:21-27`, `index.js:231-232`, `db.js:100`, `index.js:239` | Odd table names break the markup or the query (`select * from {}` is not quoted, so names with spaces fail). |
| Saved or loaded SQL runs automatically at start | `showStarted`, `index.js:205-206` | With F3 a link's SQL will auto-run, so the first two hazards become script injection from a crafted link without any click. Escape before M2 ships fragment sharing. |

## 7. Where new code should plug in

Goal: add functionality without editing `js/sqlite/`. `js/index.js` is the page controller and not part of the execution core, but its state is module-private, so hooks below avoid editing it too. Hooks 1-3 were exercised with a throwaway module inserted before `index.js` (verified).

| # | Hook | How | Notes |
|---|---|---|---|
| 1 | **Run before the initial load**: add `<script type="module" src="js/<new>.js">` in `index.html` just before `js/index.js` (`index.html:67`). Modules run in order, and `index.js` calls `startFromCurrentUrl()` at its end. | The new module can read `location.hash` (for example an F3 `#s=...` fragment or `?db=`), then `history.replaceState` to a plain `#<dataset file>` and/or seed `localStorage["sqlime.query.<name>"]` with the shared SQL. `index.js` then loads that database, restores that SQL into the editor (`index.js:114, 119`) and auto-runs it (`index.js:205-206`). | Verified: replaced the hash and seeded a query, and `index.js` loaded `demo.db` and ran the seeded SQL. The seeded key must equal the database name (the file basename, section 4). A default dataset on first visit can be done the same way (set `#datasets/...` when the hash is empty). The DOM from `command-bar.js` / `toolbar.js` is not rendered yet if the new module sits before them in the tag order; put it after them. |
| 2 | **`window.app`** (`index.js:51-55`): `{actions, github, ui}`. `ui` holds the element handles (editor, status, result, commandbar, toolbar, name, buttons). `actions` is the live object that `ActionController` reads on every click (`actions.js:26`), so `window.app.actions.myAction = () => Promise` adds a handler. | Any `<button data-action="myAction" data-arg="x">` placed inside `#commandbar`, `#status` or `#result` is dispatched to it (listeners are registered on those three, `index.js:355`). Handlers must return a Promise. | `database` is **not** exposed. `github` disappears in M2 (leave `app` itself). |
| 3 | **Wrap the engine seams** without editing them. (a) `globalThis.sqlite3InitModule` is read as a global at call time (`manager.js:22`): wrapping it (`orig.apply(...).then(api => capture api)`) hands the module the real API object (`api.wasm`, `api.oo1`, `api.capi`), which is otherwise private. (b) `manager` is a plain default-export object whose `init` is called as `manager.init(...)` (`index.js:102`): replacing `manager.init` captures every loaded `SQLite` instance and lets the module export the pristine bytes right after load via `api.capi.sqlite3_js_db_export(db.db.pointer)`. (c) `SQLite.prototype.execute` (`db.js:46`) is the single funnel for user SQL: wrapping it gives every run's SQL, row count or thrown error, which is all F6 needs. | ES modules are singletons, so `import manager from "./sqlite/manager.js"` and `import { SQLite } from "./sqlite/db.js"` give the same objects `index.js` uses, as long as the import specifier resolves to the same URL (no query string). | Verified together: captured the API, loaded `demo.db`, logged the run, then built a second in-memory connection from the exported bytes with `wasm.allocFromTypedArray` + `sqlite3_deserialize` and counted 10 rows: the pristine-copy mechanism the exercise checker (section 5 of the spec) needs. `execute` is also called internally by `getTableInfo` (`db.js:101`), `fromSql` (`manager.js:91`) and the dumper, and it returns only the first result set with collapsed duplicate columns (section 3.2), so the checker should use its own `rowMode: "array"` queries on the second connection rather than `SQLite.execute`. Install the wrappers before `index.js` runs (hook 1). |
| 4 | **DOM events** on existing elements, added with `addEventListener` (additional listeners do not disturb upstream's): `ui.editor` `execute` (detail = SQL, `sqlime-editor.js:91`) and `start`; `ui.toolbar` `open-file` (detail = `File`) and `open-url`; `ui.name` `change`; `window` `popstate`. | For example the Check button, or a history logger, can listen to `execute`. | There is no event after a run completes or after a database is loaded; use hook 3 for those. `execute` events are not bubbling (`new CustomEvent("execute", {detail})`), so listen on the editor element itself. |
| 5 | **Extend the UI by appending DOM**. `#toolbar` and `#commandbar` are custom elements whose markup is written once in `connectedCallback` (`toolbar.js:11-35`, `command-bar.js:10-32`); append children to them or to `.header` / `.sqlime-editor-section` / `.sqlime-result-section` in the page (`index.html:33-56`) rather than editing those render functions. Add stylesheets with extra `<link>` tags in `index.html`. | Panels for the dataset picker, schema sidebar and exercises are new siblings inside `div.grid` (`index.html:29`). | `.toolbar` carries `hidden-mobile` (display:none at 40rem and below), so put anything students need on a phone elsewhere. `.grid` layout is in `css/layout.css`. |
| 6 | **Own the editor interface, not the element**. `index.js` touches the editor only through `ui.editor.value` (get/set), `.query`, `.focus()`, `addEventListener("execute"/"start")`. A replacement editor (F8, CodeMirror) can swap in if it implements exactly those, keeping the element id `#editor`. | | `.query` must keep "selection else all" semantics, or Run changes meaning. |
| 7 | **Keyboard shortcuts**: build a second `new ShortcutController({...}).listen(document)` (`controllers/shortcuts.js`). `shortcuts` in `index.js:37-44` is private and already uses Ctrl/Cmd + `o`, `u`, `s`, `/`; Ctrl+Enter is handled inside the editor. | | Both controllers `preventDefault` on a match; avoid the four taken keys. `s` is freed once save is removed. |
| 8 | **Reusable parts**: `actionButton()` (HTML for an action button), `<copy-on-click href=...>` (clipboard copy; the F3 Copy-link button), `storage.js` (the `sqlime.query.*` namespace; use a different prefix for new keys such as `sqllab.*` so nothing collides), `ActionController` for any new button group. | | `storage.js` has no way to list keys; F6/F7 should use their own module with their own prefix. |
| - | **Not a hook**: `database` (`index.js:48`) and `sqlite3` (`manager.js:8`) are module-private. If the module wrappers in hook 3 prove too fragile, the smallest core edit is exporting `sqlite3` from `manager.js` and adding `database` getter to `window.app`; that is a two-line change, but it is a change to the core and to `index.js`. | | |

## 8. Build, deploy and tests as found

| Item | Facts |
|---|---|
| `Makefile` | Targets `sqlite` (re-download the engine into `vendor/`) and `serve` (port 8000 by default, `python3 -m http.server`). The upstream `build`, `clean` and `SITE` / `CNAME` parts are gone. |
| Workflow | `.github/workflows/pages.yml` (M1): on push to `main` and manual dispatch; `actions/checkout@v7`, `actions/configure-pages@v6`, an `rsync` staging step, `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5`. `upload-pages-artifact` tars with `--exclude=.[^/]*` unless `include-hidden-files: true` is set, which would silently drop `.nojekyll`; it always drops `.git` and `.github`. Checked by tarring a staged copy: the only difference the flag makes is `.nojekyll`. |
| `.nojekyll` | Empty file at the repo root (M1). `CNAME` (upstream's `sqlime.org`) was deleted. |
| `test/` | Open `test/suite.html` over HTTP. It loads `../index.html` in an iframe (`suite.js:286-299`), waits fixed delays (100/500/1000 ms), and asserts on `iframe.contentWindow.app`. Covers new database, execute, execute selection, demo, URL load, invalid URL, gist load (live API), show tables, save/update (mocked `github.create`/`update`), rename. It overwrites `sqlime.query.new.db` and `sqlime.query.demo.db` in the browser running it. It depends on `window.app.{actions, github, ui}` (`suite.js:295-297`), so removing `github` from `window.app` requires updating it. Assertion at `suite.js:21-22` pins the header text `SQLite Playground  // new.db`. |
| `tests/` (M1) | Playwright (`@playwright/test` 1.65.0, dev only; `npm ci && npm test`). `tests/static-server.mjs <port> <mount>` is a zero-dependency server that serves the repo root under a mount, answers 404 outside it (so root-absolute URLs fail on the subpath run), sends no COOP/COEP, and hides exactly what the workflow leaves out (its `HIDDEN` set, compared with the `--exclude` list in `pages.yml` by an AC7 test). `playwright.config.js` starts a root mount on `TEST_PORT_BASE` (default 4173) and `/repo/` on `TEST_PORT_BASE+1`, with projects `{chromium,firefox}-{root,subpath}` (plus `webkit-*` when `PW_WEBKIT=1`). `tests/helpers.js` has the `net` fixture (every request; external and same-origin-failure assertions; body bytes) and the `app` fixture (open, run, read table, upload, export). Specs named `ac<N>-*.spec.js` cover the acceptance criterion `AC<N>` (3, 6, 7, 8, 9). `smoke.spec.js` checks that the app boots and which requests it makes; `static-server.spec.js` tests the harness itself (mount, 404s, traversal, hidden files). `tests/fixtures/` holds `sample.db` and `make_fixtures.py`, which generates it. Unmodified SQLime has no export action, so AC3's export uses the engine's own serializer through a test-only hook (`engine` fixture). Upstream's `test/` is left untouched. |
| What ships | The staged site is the repo root minus `.git`, `.github`, `.gitignore`, `.site-stage`, `tests/`, `test/`, `node_modules/`, `package.json`, `package-lock.json` and `playwright.config.js` (`pages.yml`; the test server hides the same set). Everything else at the root is deployed and publicly fetchable: `CODEMAP.md`, `README.md`, `LICENSE`, `Makefile`, `generate_db.py` and the root `.db` files (`demo.db`, `employees.db`, `sales.db`, `northlight_retail.db`). Left in on purpose: the spec's layout puts `CODEMAP.md` and `README.md` at the root and says to deploy the root minus `tests/` and `node_modules/`; the dataset files move in M3. |
