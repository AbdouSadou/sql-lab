# SQL Lab Assessment Workflow Plan

Nov 12, 2026 · @Abderrahmane Moubarek Sadou

Three additions make SQL Lab fit the assessment workflow: import CSV and Excel, autosave, and export for Tableau, with a sturdier evidence log alongside. Nothing here is scheduled; each phase can ship on its own when you choose.

## 1. The workflow

Students bring a CSV or Excel file, clean it with SQL, export it, and build their charts in Tableau; today the tool handles only the middle of that.

&#91;embedded content: assessment workflow, raw file to Tableau\]

Blue boxes are added by this plan; everything else works today. Students submit the three items in the bottom row.

| Stage | Works today | Added by this plan |
| --- | --- | --- |
| Load | Course databases, SQLite files and SQL scripts | CSV and Excel import (§3) |
| Clean and transform | Full SQLite, run in the browser | Autosave, restore and reset (§4) |
| Export | The database as a file | Tables as CSV for Tableau (§5) |
| Evidence | A run log of up to 200 queries per database | No cap, events, and several files verified together (§6) |

## 2. Guardrails

The tool is live and in use for teaching, so every phase ships switched off and changes nothing students see until the owner turns it on.

- **Audience**: an autonomous coding agent, later. Work the phases in §8 in order, one PR per phase. The phases are independent: stop after any of them.
- **Sub-agents**: any sub-agent you spawn, whatever its purpose, runs on Claude Sonnet 5.5 at high reasoning effort. Set both explicitly on every spawn; sub-agents never inherit this session's model.
- **Preview switch**: each new feature sits behind a named flag in one config file, off by default, and can be turned on for a single visit with a URL parameter such as `?preview=import`. The owner flips the default when ready.
- **Still binding from the build spec and the UI plan**: static site on GitHub Pages; no third-party requests at runtime; relative URLs only; no cookies or analytics; nothing leaves the browser; the look follows the UI plan's tokens and mockups.
- **One earlier rule changes**: the working database no longer lives only in memory. Imported and opened databases are also saved in the browser's IndexedDB (§4). OPFS stays ruled out.
- **New libraries are vendored and loaded on demand**: they are fetched only when a student first imports or exports, so the initial load stays at or under 3 MB.
- **Behaviour freeze**: course databases, exercises and checking, share links, `Ctrl+Enter`, and the evidence checksum rule stay as they are. Evidence files exported before this work must still verify as VALID.
- **Never clean on import** (§3): cleaning is the assessed skill.
- **First step of any phase**: confirm today's behaviour in the code before changing it. This plan was written from the live site and its About page, not from the source. Check in particular: whether SQL runs on the main thread; how the run log is stored and trimmed; whether a results CSV download exists and whether it is limited to the rows on screen; how an opened file's database name is chosen; and what opening a `.sql` file does.

## 3. Import CSV and Excel

Students open a CSV or Excel file the same way they open a database today, and each file or sheet becomes a table.

**Where it starts**

- The database menu's open-file action and `Ctrl+O` accept `.csv`, `.tsv`, `.txt`, `.xlsx` and `.xls` as well as SQLite files and SQL scripts. Several files can be chosen at once. Dropping files on the page does the same.
- A preview dialog opens before anything is imported.

**Preview dialog**

- One tab per file or sheet, showing the first 20 rows exactly as read, with an editable table name taken from the file or sheet name.
- CSV settings, detected and changeable: the delimiter (comma, semicolon, tab or pipe), the text encoding, and whether the first row holds column names.
- Excel: a tick box per sheet, with visible sheets ticked.
- Destination: a new database, named after the first file and editable; or the current database, when that is itself an import or an opened file. Files are never imported into a course database.

**Faithful import rules** — the importer reads; it does not clean.

1. Every value is stored exactly as written, including leading and trailing spaces.
2. A column is `INTEGER` only when every non-empty value is a plain whole number of at most 15 digits with no leading zero. So `00123`, postcodes and phone numbers stay text.
3. A column is `REAL` only when every non-empty value is a plain number with a `.` decimal point. Currency signs, thousands separators, percent signs, decimal commas and exponents all keep the column as `TEXT`.
4. Everything else is `TEXT`. Dates in a CSV are never converted: `05/08/2023` stays text.
5. Empty fields become `NULL`.
6. Excel cells formatted as dates are stored as ISO text (`2023-08-05`, with a time only when one is present), because the cell's real value is a date and not the serial number 45143. Formula cells give their last calculated value. Error cells such as `#N/A` are stored as that text.
7. A short row is padded with `NULL`. Fields beyond the header go into added columns named `extra_1`, `extra_2`.
8. Types are decided from all rows, never from a sample.

**Names**

- Table and column names are made SQL-friendly so students need no quoting: each run of other characters becomes `_`, a name starting with a digit gains a `c_` prefix, and duplicates gain `_2`, `_3`. Letter case is kept.
- A blank header becomes `column_1`, `column_2`.

**Encoding** — UTF-8 first, with or without a byte-order mark. If the bytes are not valid UTF-8, fall back to Windows-1252, which is what Excel usually writes. UTF-16 is recognised by its byte-order mark.

**Import report** — shown in the results pane after import and recorded as an event in the run log (§6).

- Per table: rows, columns, and the source file or sheet.
- Per column: the original name where it changed, the type chosen, and the number of blanks.
- For a text column that is mostly numbers: one example of a value that stopped it being a number. This points students at what to clean without doing it for them.

**Libraries** — both vendored and loaded on demand.

- CSV: Papa Parse (MIT), read in chunks so the page stays responsive and can show progress and a Cancel button.
- Excel: SheetJS Community Edition (Apache-2.0). Take the current release from SheetJS's own distribution, not the npm registry, whose copy is the old 0.18.5 with a known vulnerability ([SheetJS issue 2961](https://git.sheetjs.com/sheetjs/sheetjs/issues/2961)).
- Read each file in one pass into an all-text staging table, then copy it into the final typed table and drop the staging table.

## 4. Autosave, restore and reset

Work on an imported or opened database is saved in the browser as the student goes, so a refresh or crash no longer loses it.

- **What is saved**: the working database, plus an untouched copy as first imported or opened. Both go in IndexedDB, keyed by database name. Course databases are not autosaved and always open fresh, as now.
- **When**: about a second after any run that changed data or structure, and again when the tab is hidden or closed.
- **Status bar**: "Saved in this browser at 14:32", or "Not saved" with the reason. It never implies the work is stored anywhere else.
- **Coming back**: saved databases are listed in the database menu under "Your databases" with their saved time. On load, a banner names the most recent one and offers Open or Remove. It is not opened automatically, because the next person at a shared computer may not be its owner.
- **Name clash**: importing or opening a file under the name of a saved database asks whether to replace it or keep both. It never overwrites saved work silently.
- **Reset to as imported**: a database menu action with a confirmation. It replaces the working copy with the untouched copy and is recorded as an event in the run log.
- **Remove**: each saved database can be removed from the browser, and Help offers "Remove all my saved work from this browser".
- **When saving fails** (storage full, or a private window): say so in the status bar and point to Export, then Database. Ask the browser to keep the storage with `navigator.storage.persist()`.
- **Moving between computers** is unchanged: export the database as a file and open it on the other machine. Autosave never syncs.

## 5. Export for Tableau

Students pick tables and views and get one CSV per table, which Tableau opens directly. A SQLite file would instead need an ODBC driver and data source set up on every computer ([Tableau help](https://help.tableau.com/current/pro/desktop/en-us/examples_otherdatabases.htm)).

- **Where**: the Export menu gains "Tables as CSV…". Its dialog lists every table and view with its row count and a tick box.
- **Output**: one table gives a single `.csv`. Several give a `.zip` holding one `.csv` each, named after the tables.
- **Every row is exported**, whatever the results pane's display limit. Apply the same rule to the existing results download if it is limited today.
- **CSV rules**: UTF-8 with a byte-order mark, so Excel reads it correctly; comma delimiter; a header row; fields quoted when they contain a comma, a quote, a line break, or a leading or trailing space; `NULL` as an empty field; numbers written plainly with a `.` decimal point and no rounding; text exactly as stored.
- **Dates** need no special handling: ISO text such as `2023-08-05` should arrive in Tableau as a date. §9 checks this by hand.
- **Recorded**: each export is an event in the run log (§6).
- **Library**: fflate (MIT) for the zip, vendored and loaded on demand.

## 6. Evidence log

The evidence file is the only SQL the marker sees, so it must hold everything a student ran and say where their data came from.

**Capacity**

- Today the run log keeps up to 200 queries per database, fewer when queries are long, in the browser's local storage. Move it to IndexedDB and remove the cap.
- Existing entries are migrated on first load, so nobody loses history.
- The History tab shows the latest 200 with a "Show older" control. The evidence export always contains every entry.

**Events** — the log records more than queries.

- A file imported (file name, size, table, rows and columns); tables exported (file name, table, rows); the database reset; a saved database reopened.
- Events are numbered entries in the same sequence as queries, so the evidence reads as a timeline.
- A file containing events carries a version 2 header. The checksum rule does not change, and the verify page accepts both versions.

**One log per browser**

- The log exists only in the browser where the work was done. A student who works in two places has two logs and submits two evidence files.
- The status bar shows how many entries are not yet in an exported evidence file, for example "14 queries not yet exported".
- The verify page accepts several files at once. It reports each as VALID or EDITED, shows the student number, database, entry count and time span of each, and flags files whose student numbers differ.

**Optional: file fingerprints** (Phase 6)

- Import and export events also record the SHA-256 of the file's bytes.
- On the verify page, the marker drops the original dataset and the CSV behind the Tableau workbook beside the evidence file. The page says which import or export each one matches, or that it matches none.
- Check with a real packaged workbook (`.twbx`) whether the CSV can be read from inside it, so the marker need not extract it by hand.
- This is deterrence, like the student-number checksum, not proof.

**What students are told**

1. Submit three things: the original dataset, the evidence file or files, and the Tableau workbook.
2. Export the evidence at the end of every session, and always before logging off a shared computer.
3. Evidence is kept per database and per browser, so submit every file.

## 7. Large files

Plan for files up to about 100 MB or a million rows; beyond that the browser, not the tool, is the limit.

- **Warnings**: warn before importing a CSV over 50 MB or an Excel file over 20 MB. Refuse a CSV over 250 MB or an Excel file over 100 MB, with a message saying why. Excel files are read whole into memory, so they cost far more than their size.
- **Imports stay responsive without a worker**: CSV is parsed and inserted in chunks inside one transaction, pausing between chunks to update a progress bar and honour Cancel, which rolls the import back.
- **Single slow statements are the remaining problem**: an `UPDATE` over a million rows, or an accidental cross join, freezes the page while it runs.
- **Optional Phase 7** moves the database into a Web Worker. The page stays usable, and a Cancel button stops a statement by ending the worker and reloading the last saved copy. A plain worker needs no special headers, so it works on GitHub Pages. This is the change the UI plan held back: it touches the execution core and needs the owner's approval.

## 8. Phases

Seven phases, each shippable alone; the first three are the least the assessment workflow needs.

1. **Evidence log capacity.** The run log in IndexedDB with no cap and migration; "Show older" in History; the not-yet-exported count; the verify page taking several files. *Done when* 1,000 runs all appear in one evidence file, and a file exported before this phase still verifies as VALID.
2. **Import CSV.** Open-file accepts CSV; the preview dialog; the faithful import rules; the import report; import events and the version 2 evidence header. *Done when* the messy test file (§9) imports with the expected type for every column and its leading zeros intact.
3. **Export tables as CSV.** The export dialog, zip output, every row exported, export events. *Done when* a table exported and then re-imported is identical cell for cell.
4. **Autosave, restore and reset.** IndexedDB saving, the banner, "Your databases", reset and remove. *Done when* an import survives a page reload with its changes, and Reset returns it to as imported.
5. **Import Excel.** Sheets become tables and date cells become ISO text. *Done when* `shopping_db.xlsx` imports as four tables and the first row of `orders` has `OrderDate` equal to `2023-08-05`.
6. **File fingerprints (optional).** SHA-256 on import and export events; the verify page matches dropped files. *Done when* an untouched file matches, and the same file with one character changed does not.
7. **Background execution (optional, needs approval).** The database in a Web Worker, with Cancel. *Done when* a deliberately slow query can be cancelled and the page never stops responding.

## 9. Proof

Each phase adds test files and automated checks, and the existing acceptance suite stays green throughout.

**Test files** in `tests/fixtures/`

- `messy_sales.csv`: ids with leading zeros, amounts with a £ sign, `dd/mm/yyyy` dates, blanks, trailing spaces, quoted commas and line breaks, and one row with an extra field.
- `windows1252.csv` (a £ and an é, saved the way Excel saves them) and `semicolon.csv`.
- `shopping_db.xlsx`: the owner's real workbook, with four sheets and true date cells.
- `large.csv`: 200,000 generated rows, for timing and progress.

**Automated checks**

- Import: every column of `messy_sales.csv` gets its expected type; row counts match the file; the report names the blocking value for each mostly-numeric column.
- Encoding: the £ and the é survive from `windows1252.csv`.
- Round trip: import, export and re-import gives identical tables.
- Export: a 2,000-row table produces 2,000 data lines.
- Autosave: a reload restores the changed data; Reset restores the original; Remove deletes it from IndexedDB; a name clash asks before replacing.
- Evidence: old files verify as VALID; version 2 files verify; events appear in order; several files verify together.
- Loading: the import and export libraries are requested only when first used; the initial transfer stays at or under 3 MB; there are no third-party requests.
- Accessibility: every new dialog, banner and menu item passes the UI plan's keyboard-only and axe checks, in light and dark.
- Flags: with every preview flag off, the page behaves exactly as it does today.

**Checked by hand, once per phase that touches it**

- Open an exported CSV in Tableau: dates arrive as dates, numbers as numbers, and £ and accented text are intact.
- On a university lab PC: saved work and the run log behave sensibly across logging off and on again.

## 10. Decisions

Nine choices are baked into this plan.

| Decision | What to do |
| --- | --- |
| File fingerprints | Optional Phase 6, built last or not at all |
| Empty CSV fields | Become `NULL` |
| Column names | Made SQL-friendly, with the original shown in the report |
| What is autosaved | Imported and opened databases only |
| Saved work on return | Offered in a banner, never opened automatically |
| Export format | CSV and Also an Excel workbook, one sheet per table |
| Run log size | No cap; History shows the latest 200 |
| Size limits | Warn at 50 MB for CSV and 20 MB for Excel; refuse at 250 MB and 100 MB |
| Leaving with unexported queries | A count in the status bar and Also a browser prompt before the page closes |
