# SQL Lab Assessment Workflow Plan

Nov 12, 2026 · @Abderrahmane Moubarek Sadou

Three additions make SQL Lab fit the assessment workflow: import CSV and Excel, autosave, and export for Tableau, with a sturdier evidence log alongside. Nothing here is scheduled; each phase can ship on its own when you choose.

**Revised Nov 15, 2026.** Import and export (§3 and §5), and the parts of §2 and §6 to §10 they rest on, were checked against the source at commit `1e981e3`, against the test files in `tests/fixtures/`, and against the libraries themselves. "Q1" to "Q26" are the open points listed in that folder's README. This plan and the expected results there are meant to agree; where they do not, stop and ask the owner. The revision changes two things the first version asked for: which columns are `REAL` (§3, rule 3), and what an export must give back when it is imported again (§5). Both are listed in §10. Smaller rewordings are marked where they occur, and some phases now need an earlier one (§8). The same day, the owner agreed to both changes and settled the header row (Q1); §10 records all three.

## 1. The workflow

Students bring a CSV or Excel file, clean it with SQL, export it, and build their charts in Tableau; today the tool handles only the middle of that.

&#91;embedded content: assessment workflow, raw file to Tableau\]

Blue boxes are added by this plan; everything else works today. Students submit the three items in the bottom row.

| Stage | Works today | Added by this plan |
| --- | --- | --- |
| Load | Course databases, SQLite files and SQL scripts | CSV and Excel import (§3) |
| Clean and transform | Full SQLite, run in the browser | Autosave, restore and reset (§4) |
| Export | The database as a file | Tables as CSV for Tableau, or as an Excel workbook (§5) |
| Evidence | A run log of up to 200 queries per database | No cap, events, and several files verified together (§6) |

## 2. Guardrails

The tool is live and in use for teaching, so every phase ships switched off and changes nothing students see until the owner turns it on.

- **Audience**: an autonomous coding agent, later. Work the phases in §8 in order, one PR per phase. The phases are independent: stop after any of them. (Since the revision, some phases need an earlier one; §8 says which.)
- **Sub-agents**: any sub-agent you spawn, whatever its purpose, runs on Claude Sonnet 5.5 at high reasoning effort. Set both explicitly on every spawn; sub-agents never inherit this session's model.
- **Preview switch**: each new feature sits behind a named flag in one config file, off by default, and can be turned on for a single visit with a URL parameter such as `?preview=import`. The owner flips the default when ready.
  - The file is `js/lab/config-workflow.js`. The texts and settings of this plan's features go there and not in `js/lab/config.js`, for the reason given under "The verify page stays small" below. The one exception is what the verify page itself needs to read a version 2 file: the heading, the word `event:` and the list of kinds are in `config.js`.
  - The flags for import and export are `import`, `export`, `excel-import` and `excel-export` (§8). Several can be given at once: `?preview=import,export`. A name the app does not know is ignored.
  - `excel-import` does nothing without `import`, and `excel-export` does nothing without `export`. With `import` alone, a workbook is refused with a message that Excel files cannot be imported yet.
  - The other phases name their flags when they are built. Phase 1 moves stored data, so it must say what its flag can and cannot switch off.
  - The parameter is read once, when the page loads, and kept in memory. Opening a dataset, a file, an exercise set or an exercise, and closing a set, all rewrite the address and drop the parameter; only Open from URL keeps it. A flag read later would switch itself off part-way through a visit.
- **Still binding from the build spec and the UI plan**: static site on GitHub Pages; no third-party requests at runtime; relative URLs only; no cookies or analytics; nothing leaves the browser; the look follows the UI plan's tokens and mockups.
- **One earlier rule changes**: the working database no longer lives only in memory. Imported and opened databases are also saved in the browser's IndexedDB (§4). OPFS stays ruled out.
- **New libraries are vendored and loaded on demand**: they are fetched only when a student first imports or exports, so the initial load stays at or under 3 MB.
  - The check is `tests/ac9-size.spec.js`: at most 3,000,000 bytes, uncompressed, with `datasets/` left out. A first visit is about 2.2 MB today. `tests/app-bundle.spec.js` also holds a first visit to 20 requests.
  - Each library is the publisher's own minified file, unchanged, in `vendor/` with its licence beside it. The page adds it as an ordinary `<script>` the first time it is needed, and requests it once, however often it is used. So it must be a build that attaches itself to the page as a global, and the loader (`js/lab/vendor-loader.js`) takes a plain file name of `vendor/`, never a path.
  - It is not imported into the app bundle: `tools/build-app.mjs` refuses any import from `vendor/` except the editor. The deploy already copies `vendor/` as it is, so neither the build nor the deploy changes, and the deploy stays free of npm.
  - Loading can fail: a lab PC offline, a missing file, a file that is not the library, or no answer within 30 seconds. The loader then removes its script tag, forgets the attempt and gives every caller that was waiting the same error, so the next use tries again. The dialog says in plain words that the tool could not be loaded, and the page stays usable.
- **The app bundle**: after any change under `js/` or `css/`, run `npm run build:app` and commit `bundle/`. Otherwise `tests/app-bundle.spec.js` fails, and the old bundle is what deploys.
  - A new stylesheet must also be added to `STYLES` in `tools/build-app.mjs` and to `CASCADE` in that test.
  - A test can reach a module only when it is listed in `EXPOSE` in `tools/build-app.mjs`; the same test checks that list.
  - Three tests hold lists that a phase changes on purpose: `tests/app-bundle.spec.js` names every module a test can reach; `tests/m2-brand.spec.js` lists every line of source that holds the app's name or `sqllab`, a new storage key included; and `tests/aw0-flags.spec.js` names the flags. That last file also has a group, "nothing a student can see", which compares the page with every flag on against the page with none. It holds while nothing reads a flag, so the phase that first reads one rewrites the tests its flag changes.
- **The verify page stays small**: `tests/m5-verify-page.spec.js` holds it to 100,000 bytes without fonts. It was about 79,700 in Chromium (82,800 in Firefox) before Phase 0 and is about 85,600 (88,700) with it, and that counts `js/lab/config.js` whole. So the texts and settings of the new dialogs go in a module the verify page does not load, and a test in `tests/aw0-evidence.spec.js` lists the scripts the page may load.
- **Behaviour freeze**: course databases, exercises and checking, share links, `Ctrl+Enter`, and the evidence checksum rule stay as they are. Evidence files exported before this work must still verify as VALID. The results pane's own Download CSV also stays as it is (§5).
- **Never clean on import** (§3): cleaning is the assessed skill.
- **First step of any phase**: confirm today's behaviour in the code before changing it. The first version of this plan was written from the live site and its About page, not from the source. The points it asked about were checked on Nov 14, 2026 at commit `1e981e3`. Check them again, because the code moves:
  - SQL runs on the main thread. There is no worker.
  - The run log is in local storage, one key per database. It keeps the newest 200 entries, and no more than 5 MB of SQL text, dropping the oldest first. A stored entry that is not a query is thrown away the next time the log is written (`js/lab/run-log.js`), which matters for events (§6).
  - The results pane's Download CSV exists, and holds every row of the result, not only the 500 on screen.
  - An opened file's database is named after the file, extension included.
  - Open a file… takes one file. A name ending in `.sql`, in lower case, is run as a script. Anything else is read as a SQLite database, so a CSV is refused today.
  - A file dropped on the page is refused on purpose. Tests pin that, and the one-file chooser (§3).
  - While a database is loading, Run and Check are refused with a message. Opening another database is not refused: the newer load wins and the older one is dropped (§7).

## 3. Import CSV and Excel

Students open a CSV or Excel file the same way they open a database today, and each file or sheet becomes a table.

**Where it starts**

- The database menu's open-file action and `Ctrl+O` accept `.csv`, `.tsv`, `.txt`, `.xlsx` and `.xls` as well as SQLite files and SQL scripts. Several files can be chosen at once. Dropping files on the page does the same.
- Choosing several files and dropping files both reverse behaviour that tests pin today. With the flag off, both stay as they are and keep their tests. With it on:
  - several CSV or Excel files can be chosen or dropped together;
  - a choice that mixes them with a database or a script, or that holds more than one database or script, is refused with a message before any dialog opens;
  - a drop is treated exactly as if the same files had been chosen, wherever on the page it lands. It never puts text in the editor, and never lets the browser open the file. A drop is ignored while a dialog is open or an import is running.
- The five extensions are matched in any letter case. Every other file is opened as today: a SQLite database or a `.sql` script.
- For a file with one of the five extensions, what it is, is decided from its bytes before its name (Q18). Test in this order; the first that fits decides:
  1. No bytes at all: the file is empty, and is refused.
  2. The four bytes `50 4B 03 04` first: a zip, so an `.xlsx` workbook, whatever it is called. The two letters `PK` are not enough: a CSV whose first column is called `PK` starts with them.
  3. The eight bytes `D0 CF 11 E0 A1 B1 1A E1` first: an OLE2 file, so an `.xls` workbook, or a workbook locked with a password, which is refused.
  4. A `<` as the first character, after any byte-order mark and white space, under an `.xls` or `.xlsx` name: a web page or an XML spreadsheet saved as a workbook. SheetJS reads both. The app decodes the bytes itself, by the rules under "Encoding", and gives SheetJS the text; read from bytes, a page that is not UTF-8 comes out garbled. The web page also needs `raw`, so that cell text is kept as written. It has no sheet name of its own, so its table is named after the file.
  5. A zero byte anywhere in the file, with no UTF-16 byte-order mark: not text, so the file is refused. The zero byte is looked for in the same pass that checks for UTF-8.
  6. Anything else: text, which goes through the CSV preview.
- Tests 2, 3 and 4 find a workbook. Tests 5 and 6 are about text, whatever the file is called, so a text file with a workbook's name is imported as text under `import` alone.
- When SheetJS throws on a zip or an OLE2 file, the workbook is damaged or locked. Refuse it with a message in plain words, never the library's own. A sheet that SheetJS names but leaves out of `wb.Sheets` makes the workbook damaged too.
- A text file with nothing left once empty lines are skipped is empty as well.
- A refusal is shown in the dialog, as a tab with its reason, whether one file was chosen or several. The other files can still be imported. With nothing left to import, the dialog offers only Close.
- A preview dialog opens before anything is imported.
- An import either finishes or leaves nothing. A refusal, a failure or Cancel creates no table and no database, and the page stays usable.

**Preview dialog**

- One tab per file or sheet, showing the first 20 rows exactly as read, with an editable table name taken from the file or sheet name. (As built: the row of column names and the 20 rows under it, so 21 rows when the names are on row 1; with the names lower down, up to three rows above them as well. The owner may want 20 rows in all.) (A field of more than 80 characters is shown cut short in the preview, with the whole of it in its title; the table keeps it whole.)
  - For a text file, that is each field's text, after empty lines are skipped. For a sheet, it is each cell after the rules under "Excel cells". The header row is row 1.
- CSV settings, detected and changeable: the delimiter (comma, semicolon, tab or pipe), the text encoding, and whether the first row holds column names.
  - The preview parses the start of the file as one text: the first 1 MB, or all of it when the file is smaller. Papa's result for that text gives the delimiter (`meta.delimiter`).
  - The line ending is found by the app, not taken from Papa (`meta.linebreak`), which the first version of this plan used. Papa pairs every quote mark with the next one and looks at what is left. One quote that is not part of a pair, such as the inch mark in a heading `Height (in")`, puts every pair after it out of step: a Windows file is then read with a line feed alone, every row keeps a carriage return at its end, and a column of numbers becomes text, with nothing to show for it. The app applies Papa's own rule to the text outside quoted fields, with quotes read as the parser reads them: a quote opens a quoted field only at the start of a field, and closes it only where the field ends. White space of any kind may stand between that quote and the end of the field, a no-break space as well as a space or a tab. For a file whose quotes are in order the answer is the one Papa gives. A carriage return that is the very last character of the first megabyte of a larger file is not counted, since it may be half of a pair.
  - A file larger than 1 MB with not one complete row in its first megabyte is refused: there is nothing to show, and no line ending to find. A quote at the start that is never closed does this.
  - Delimiter: Papa Parse's own guess, limited to these four (`delimitersToGuess`). Papa needs about two fields a row, on average, over the first ten rows. When it cannot tell, it reports `UndetectableDelimiter` and the delimiter is comma. That is a normal result, not a failure. The result is right for every text file in the fixtures.
  - Encoding: the choices are UTF-8, UTF-16 little-endian, UTF-16 big-endian and Windows-1252 ("Encoding" below).
  - Header: the first row is taken as column names unless one of its fields is a plain number (rules 2 and 3). This is a guess the student can overrule, not a promise (Q9).
  - The column names can be on a later row. A "Column names are on row" box, which starts at 1, says which. Rows above that row are left out, and the rows below it are the data. Rows are counted as the preview shows them: in `csv/title_rows.csv` the names are on row 4, though on line 5 of the file. The app does not guess this row (Q1, settled in §10).
  - The settings shown are the settings used. The import passes the delimiter and the line ending to Papa; it does not let Papa guess again ("Libraries" below). While a tab is read again after a change, Import waits. A file that was saved again after it was chosen is refused when it is imported, because the settings were found in the text that was shown: Firefox would read the new bytes without a word (Chromium refuses to read such a file at all).
  - A delimiter or an encoding the student chooses can make the file unreadable as a table (a row of more than 2,000 fields, or no row at all). The tab says so in place of the preview and Import is off, but the file is not refused: the choice can be changed back.
- Excel: a tick box per sheet, with visible sheets ticked. Hidden and very hidden sheets are listed, marked as hidden, and not ticked. A sheet with no values is listed but cannot be ticked. Chart sheets are not listed (Q14, Q16). Each sheet has the same "Column names are on row" box.
- Destination: a new database, named after the first file without its extension (a name that is all extension, `.csv`, is kept whole), and editable; or the current database, when that is itself an import or an opened file. Files are never imported into a course database.
  - A course database is one opened from the list of datasets. "An opened file" is read here as any other database: a file, a database opened from a URL, a script, or the empty database.
  - The dialog starts on a new database. Its name comes from the first file that is not refused.
  - A new database is built apart from the open one, which stays open and untouched until the import has finished. It then opens as a file does today: the address becomes `./`, and its run log is kept under its name.
- No mockup exists for this dialog, the progress view or the import report. Build them from the UI plan's dialog pattern and tokens (`docs/design/`), and send the owner screenshots in light and dark before the flag is offered to students.

**Faithful import rules** — the importer reads; it does not clean. Rule 3 is changed from the first version, and rule 1 is reworded to say what typed columns mean (§10). The other rules are filled in from the readings the fixtures use, each marked with its Q number.

1. A value in a `TEXT` column is stored exactly as written, including leading and trailing spaces. A value in an `INTEGER` or `REAL` column is stored as that number, so `1.50` is 1.5, and `100` in a `REAL` column is 100.0.
2. A column is `INTEGER` only when every non-empty value is a plain whole number: `0`, or up to 15 digits that do not start with `0`, with or without a minus sign in front. Digits are `0` to `9` only. So `00123`, postcodes and phone numbers stay text, and so do `+5` and a number with a space beside it (Q6). `-0` is not a plain whole number either: stored as a number, it would lose its sign.
3. A column is `REAL` when every non-empty value is a plain number and at least one of them is a decimal. A decimal is `0`, or digits that do not start with `0`, then a `.` and one or more digits, with or without a minus sign in front: `0.25`, `-0.5`, `10.00`. Whole numbers and decimals together make a `REAL` column (Q6). The first version asked for a decimal point in every value, which makes `10` beside `12.50` a text column, and `WHERE price > 9` then finds nothing; the fixtures expect `REAL`. Currency signs, thousands separators, percent signs, decimal commas, exponents, `.5` and `5.` all keep the column as `TEXT`. So does a decimal that no number can hold: one with more than about 300 digits before the point would be stored as infinity, and one with as many zeros after it as zero, which is not that number (rule 1).
4. Everything else is `TEXT`, and so is a column with no values at all (Q7). Dates in a CSV are never converted: `05/08/2023` stays text.
5. Empty fields become `NULL`, quoted or not. A field of spaces is not empty: it is stored as those spaces.
6. Excel cells are read by what they hold, not by how they look. "Excel cells" below gives the rules.
7. A short row is padded with `NULL`. Fields beyond the header go into added columns named `extra_1`, `extra_2`, so the table is as wide as its widest row. A file with no header row has no `extra_` columns: its columns are `column_1` up to the length of its widest row.
8. Types are decided from all rows, never from a sample.
9. A completely empty line in a text file is skipped, wherever it is. A line of delimiters only is a row of `NULL`s (Q8).
10. A table of more than 2,000 columns is refused, because SQLite stops there (Q17). The file is refused as soon as a row is that wide.

**Excel cells** (Q10 to Q16, Q19)

- The table is the smallest rectangle that holds every value on the sheet. Cells with formatting but no value do not count, and nor does a formula cell that came out empty. Its first row is the header, unless the student moves the header in the preview (Q1).
- A numeric cell gives the number it stores, not the text it shows: a cell showing `£1,234.50`, `12.5%` or `00123` holds 1234.5, 0.125 or 123 (Q10). Nothing is rounded, so a formula result of 124.94999999999999 is imported as that.
- A column of numeric cells is `INTEGER` when every value is whole and lies between -10^15 and 10^15, and `REAL` otherwise. A text cell is judged as written, like a CSV field: `00123` typed as text stays text. A column that mixes the two kinds of cell is typed from all of them together.
- In a column that ends up `TEXT`, a number is written out in full, with no exponent whatever its size: `1234.5`, `329`, never `3.29E2`. A header cell that holds a number is named the same way, so `2023` gives `c_2023`.
- A cell with a date or time format is one of three things. Test in this order (Q11):
  1. A duration, when its format has square brackets round the hours, minutes or seconds, as in `[h]:mm:ss`. It is stored as `H:MM:SS`, with the hours not padded and free to pass 24: `1:00:00`, `30:00:00`.
  2. A time, when its value is below one day. It is stored as `HH:MM:SS`.
  3. A date, stored as ISO text, because its real value is a date and not the serial number 45143: `2023-08-05`, or `2023-08-05 14:30:00` when its time is not midnight. A time of exactly midnight counts as no time.
- All three are taken to the nearest second. Both of Excel's date systems are read, 1900 and 1904. Early 1900 follows Excel, which counts a 29 February that never existed: serial 60 is `1900-02-29` (Q19).
- True and false cells are stored as the words `TRUE` and `FALSE` (Q12).
- A formula cell gives its last calculated value. A formula with no stored value is `NULL`, and the report counts them (Q13).
- An error cell such as `#N/A` is stored as that text.
- An empty cell, and a formula that gives empty text, are `NULL`. An empty row inside the table is a row of `NULL`s (Q8).
- A merged block keeps its value in its top-left cell; the rest are `NULL` (Q15).
- Hidden rows and columns are imported like any other (Q14).

**Names**

- Table and column names are made SQL-friendly so students need no quoting: each run of other characters becomes `_`, a name starting with a digit gains a `c_` prefix, and duplicates gain `_2`, `_3`. Letter case is kept. (Reserved words are the exception: Q2, below.)
- "Other characters" are everything except the letters A to Z in either case, the digits and the underscore. An accented letter is one of them, and nothing is trimmed afterwards: `Café` becomes `Caf_`, `Amount (£)` becomes `Amount_`, and `% Change` becomes `_Change` (Q3, Q4).
- Duplicates are judged without regard to case, as SQLite judges them, and against every name already given, generated ones included: the headers `Name`, `name`, `NAME`, `Name_2` become `Name`, `name_2`, `NAME_3`, `Name_2_2`.
- A blank header, one that is empty or only white space, becomes `column_` and its position in the table, counted from 1 at the table's first column. A blank fifth header is `column_5`. A file with no header row gets `column_1` to `column_n` (Q5; the first version's `column_1`, `column_2` could also be read as counting the blank ones).
- A reserved word is kept as it is: a file called `Order.csv` gives a table called `Order`, which must then be written in double quotes (Q2, and §10).
- A table name comes from the file name without its extension, or from the sheet name. A file whose name is all extension (`.csv`) leaves nothing, and its table is suggested as `table`. Sheet names are made unique across the whole workbook, once, counting every sheet that can be imported, so they do not change as sheets are ticked.
- The names the dialog suggests are given in one pass: the names already in the destination come first, then the tabs in order. Each tab takes the first of `x`, `x_2`, `x_3` that nothing before it has, without regard to case. Tables, views and indexes in the destination all count, because SQLite keeps them in one list. So do the `TEMP` tables and views of the session: one of the same name would hide the new table from a query that does not say which. A name that only a temporary table or view has is refused in words of its own, because that table is in no database and the student would look for it there in vain.
- A name the student types is put through the same rule. The dialog does not accept a table name that is empty, that starts with `sqlite_` in any letter case (SQLite keeps those for itself), or that another tab or the destination already has.

**Encoding** — UTF-8 first, with or without a byte-order mark. If the bytes are not valid UTF-8, fall back to Windows-1252, which is what Excel usually writes. UTF-16 is recognised by its byte-order mark.

- A byte-order mark is looked for first: UTF-8, UTF-16 little-endian or UTF-16 big-endian.
- Without one, the whole file is checked for valid UTF-8 before the dialog shows the file, in a pass of its own. The first bad byte can be anywhere, so the first slice is not enough.
- Decoding is strict: a decoder that quietly replaces bad bytes would store the wrong characters. When the student picks an encoding that the bytes do not fit, the dialog says so, and Import is off until another is chosen.
- The expected results name five cases: `utf-8`, `utf-8 with BOM`, `utf-16le`, `utf-16be` and `windows-1252`. The second is UTF-8 in the dialog; the byte-order mark is a fact about the file.

**Import report** — shown in the results pane after import and recorded as an event in the evidence log (§6).

- Per table: rows, columns, and the source file or sheet. This much goes into the event; the rest of the report stays on screen.
- Per column: the original name where it changed, the type chosen, and the number of blanks. The blanks are the cells of the column that are `NULL`, including the ones added to pad a short row. A blank header is shown as blank.
- For a text column that is mostly numbers: one example of a value that stopped it being a number. This points students at what to clean without doing it for them. "Mostly" means that at least half of its non-empty values are plain numbers; the example is the first value that is not.
- For an Excel sheet: the number of formula cells that came out empty.
- For a text file with a quote that could not be paired: a warning, because everything after that quote may have been read as one field.

**Libraries** — both vendored and loaded on demand. Versions are those current on Nov 14, 2026; check again when vendoring.

- CSV: Papa Parse (MIT), read in chunks so the page stays responsive and can show progress and a Cancel button.
  - The app reads the file in slices, decodes them through one streaming `TextDecoder`, and hands Papa the text piece by piece, never the file. Papa's own file reading, whenever it reads in chunks, decodes each 10 MB slice separately, so a character that straddles two slices comes out garbled.
  - Papa takes text in pieces through its stream input: an object with `readable: true`, a `read` function, and `on` and `removeListener` for the `data`, `end` and `error` events. The app hands over each piece as a string in a `data` event, waits as long as it needs between pieces, and sends `end` after the last. Papa joins a row that is split between two pieces.
  - Rows are taken in Papa's `chunk` callback, which runs once for each piece. There the app inserts the rows. Without that callback, Papa keeps every row until the end. The app pauses between two pieces, and looks there whether the import was cancelled: on Cancel it hands over no more pieces and lets the parser go, which then holds nothing but the row it had not finished. Papa's `abort()` is not needed for that, and is not called.
  - The app never ends a piece on a carriage return when another piece follows. It holds a trailing one back for the next piece: a CRLF split between two pieces can make Papa report a bad quote that is not there.
  - The delimiter and the line ending are settled by the preview and passed to Papa (`delimiter`, `newline`). Left to itself, Papa guesses both from the first piece it is given.
  - The other settings: `skipEmptyLines: true`, not `"greedy"`, which would also drop a line of spaces; `header: false`, so that Papa returns rows as lists and the app does all the work on names; and no `dynamicTyping`, so that every field stays text.
  - Papa lists the quotes it could not pair in each chunk's `errors` (`InvalidQuotes`, `MissingQuotes`). It repeats an error while the row is unfinished, so the report gives the warning once, and only for a row that has ended: a row cut by the end of a piece can give an error that is gone once the row is whole (a closing quote with a space after it, where the piece ends). Papa gives such an error the place after the quote that opens the field. For a row that has ended that place is never past the cursor, and it is exactly at the cursor when the quote is the last character of the file, so that case counts too. The error's `row` is no guide to the row in the table: Papa counts it within the piece, and before empty lines are skipped.
  - Use version 5.7.1 (19 KB). The expected results in the fixtures were reproduced on it (§9).
- Excel: SheetJS Community Edition (Apache-2.0). Take the current release from SheetJS's own distribution, not the npm registry, whose copy is the old 0.18.5 with a known vulnerability ([SheetJS issue 2961](https://git.sheetjs.com/sheetjs/sheetjs/issues/2961)).
  - The current release is 0.20.3. Reading `.xls` needs its full build, `xlsx.full.min.js` (952 KB, about 340 KB gzipped). The mini build has no reader for binary workbooks.
  - SheetJS reads a workbook in one blocking call, with no progress and no Cancel (§7).
  - Check a file's first bytes before SheetJS sees it ("Where it starts"). Given a file it does not recognise, it guesses: an empty file comes back as one empty sheet, and random bytes as a sheet of noise.
  - Read options: `cellNF`, which gives each cell's number format; `sheetStubs`; `cellHTML: false`, which saves work the import never uses; and `raw` for a web page. Dates are left as serial numbers. `cellText` stays on: the text of an error cell, such as `#N/A`, is only in the cell's `w`.
  - The app applies the date and time rules above itself, from the format. `XLSX.SSF.is_date` says whether a format is a date or time format, and the workbook's 1904 flag is `wb.Workbook.WBProps.date1904`. A binary `.xls` cannot tell a date, a time and a duration apart by cell type; only the format can. `XLSX.SSF.parse_date_code` cuts seconds off where the rules round, so round first.
  - With `sheetStubs`, an `.xlsx` formula with no stored value arrives as an empty cell that still carries its formula. Its type is `z`; test the type, because its `v` is 0. Without `sheetStubs`, the cell is left out. In an `.xls`, such a formula arrives as an empty text cell with its formula. Neither can be told apart from a formula that gives empty text, so the report counts the formula cells that came out empty.
  - The table's rectangle is worked out from the cells that hold a value, not from the sheet's `!ref`, which also covers cells that are only formatted.
  - A sheet's hidden state is in `wb.Workbook.Sheets`, matched by name. A chart, dialog or macro sheet is one whose sheet object has a `!type`; none of them is listed in the dialog. A web page read by SheetJS has no `wb.Workbook` at all.
- Read each text file in one pass into an all-text staging table, then copy it into the final typed table and drop the staging table.
  - The staging table is a `TEMP` table. One in the main database leaves its pages behind when it is dropped. On the app's own SQLite build, 200,000 rows staged in the main database gave an exported `.db` of 25.1 MB, against 12.3 MB with a `TEMP` table.
  - A later row can be wider than every row before it, so the staging table gains columns as the file is read.
  - The copy runs in chunks by rowid, with the same pause for progress and Cancel as the read. A single `INSERT … SELECT` allows neither.
  - An Excel sheet is already whole in memory, so it needs no staging table: decide its types there, then insert in chunks with the same pause.

## 4. Autosave, restore and reset

Work on an imported or opened database is saved in the browser as the student goes, so a refresh or crash no longer loses it.

- **What is saved**: the working database, plus an untouched copy as first imported or opened. Both go in IndexedDB, keyed by database name. Course databases are not autosaved and always open fresh, as now.
- **When**: about a second after any run that changed data or structure, and again when the tab is hidden or closed.
- **Status bar**: "Saved in this browser at 14:32", or "Not saved" with the reason. It never implies the work is stored anywhere else.
- **Coming back**: saved databases are listed in the database menu under "Your databases" with their saved time. On load, a banner names the most recent one and offers Open or Remove. It is not opened automatically, because the next person at a shared computer may not be its owner.
- **Name clash**: importing or opening a file under the name of a saved database asks whether to replace it or keep both. It never overwrites saved work silently.
- **Reset to as imported**: a database menu action with a confirmation. It replaces the working copy with the untouched copy and is recorded as an event in the evidence log (§6).
- **Remove**: each saved database can be removed from the browser, and Help offers "Remove all my saved work from this browser".
- **When saving fails** (storage full, or a private window): say so in the status bar and point to Export, then Database. Ask the browser to keep the storage with `navigator.storage.persist()`.
- **Moving between computers** is unchanged: export the database as a file and open it on the other machine. Autosave never syncs.

## 5. Export for Tableau

Students pick tables and views and get one CSV per table, which Tableau opens directly. A SQLite file would instead need an ODBC driver and data source set up on every computer ([Tableau help](https://help.tableau.com/current/pro/desktop/en-us/examples_otherdatabases.htm)).

- **Where**: the Export menu gains "Tables as CSV…". Its dialog lists every table and view with its row count and a tick box.
  - The Export items are built twice: in `js/lab/export-menu.js`, and in `js/lab/more-menu.js` for narrow screens. The new item goes in both, and only when the flag is on.
  - The dialog lists the tables and views whose names do not start with `sqlite_`, in the order of SQLite's own `ORDER BY name`, which is by character code: `sales/2024` comes before `sales_2024`.
  - Rows are counted one table at a time, with a pause between them. A view that cannot be counted is listed with the reason and cannot be ticked.
- **Output**: one table gives a single `.csv`. Several give a `.zip` holding one `.csv` each, named after the tables.
  - A file name is the table name put through the import naming rule (§3), so `sales/2024` gives `sales_2024.csv`. Names that collide among the tables being exported gain `_2`, in the dialog's order, judged as §3 judges duplicates. `con.csv` is left as it is, although Windows cannot create a file of that name (Q24).
  - The zip is named as the results download is: the database's name without a `.db`, `.sqlite`, `.sqlite3` or `.sql` ending, then `-tables.zip`. So `sales.db` gives `sales-tables.zip`.
- **Every row is exported**, whatever the results pane's display limit. The existing results download already holds every row. Leave it as it is, and give the table export a writer of its own. The results download writes no byte-order mark when the text is plain ASCII, no quotes for a leading or trailing space, a whole `REAL` without `.0`, and a very large or very small one with an exponent. `tests/m5-results.spec.js` pins the first three.
  - Rows are read one at a time and written in pieces, never built into one string, with the same pause for progress and Cancel as import (§7).
  - An error while a table is being read stops the whole export. Nothing is saved, no event is recorded, and the dialog names the table and gives the engine's message. A view can be counted and still fail when its rows are read.
- **CSV rules**: UTF-8 with a byte-order mark, so Excel reads it correctly; comma delimiter; a header row; fields quoted when they contain a comma, a quote, a line break, or a leading or trailing space; `NULL` as an empty field; numbers written plainly with a `.` decimal point and no rounding; text exactly as stored.
  - The byte-order mark is always written. Every record ends with CRLF, the last one too. A line break inside a field, whether a carriage return or a line feed, is left as stored (Q23).
  - Only the space character at either end calls for quotes; a tab does not.
  - A quote inside a quoted field is doubled. Column names follow the same quoting rule as values.
  - An empty string is an empty field, like `NULL` (Q21). Text that starts with `=`, `+`, `-` or `@` is written as stored, because the files are meant for Tableau (Q26).
- **Numbers** (Q20): each value is written by its own storage class, not by its column's declared type. A view's computed columns have no declared type, and a `REAL` column can hold whole values.
  - An `INTEGER` is written in full. A value beyond 2^53 must not pass through a JavaScript number, which would round it.
  - A `REAL` is written with the fewest digits that give back the same value, always with a decimal point and never with an exponent: `1.0`, `0.0000001`, `150000000000000000000.0`, `0.30000000000000004`. So a `REAL` column of whole values comes back as `REAL`, not `INTEGER`.
- **Binary values**: a BLOB is written as the results pane shows one, `x'deadbeef'` (Q22, §10).
- **Dates** need no special handling: ISO text such as `2023-08-05` should arrive in Tableau as a date. §9 checks this by hand.
- **What comes back**: exporting a table and importing the file again gives the same values in the same columns, with the known differences below (Q21). The first version asked for a table "identical cell for cell", which cannot hold; this replaces it (§10).
  - An empty string comes back as `NULL`.
  - A text column whose values are all plain numbers comes back as `INTEGER` or `REAL`.
  - An `INTEGER` column holding a value of 16 digits or more comes back as `TEXT`.
  - A name that is not SQL-friendly comes back cleaned: the column `Order ID` as `Order_ID`. A table is named after its file, so `sales/2024` comes back as `sales_2024`, and a table whose file gained `_2` comes back with it.
  - Declared column types are not kept: the importer decides types from the values, so a column with no values comes back as `TEXT`.
  - `expected/export.json` lists the differences for each fixture table. Its word `identical` compares values and the types of the values, not declared types or table names.
- **Recorded**: each export is an event in the evidence log (§6).
- **Library**: fflate (MIT) for the zip, vendored and loaded on demand. The current release is 0.8.3 (33 KB). It can build a zip in pieces.

**Excel workbook** — the same dialog offers a second format (§10): one workbook, with one sheet per table, written by SheetJS as `.xlsx` (`bookType: "xlsx"`, with compression on). It is named like the zip, with `.xlsx` in place of `-tables.zip`.

- A sheet's first row holds the column names, as stored, as text cells. Data starts on row 2.
- Numbers are number cells. Text is always a text cell, never a number, a date or a formula, so `00123`, `2023-08-05`, `+441632960001` and `=SUM(A1:A3)` arrive as they were stored. §10 has the one exception, for the largest integers.
- `NULL` and the empty string are empty cells. The app leaves the cell out for both: given an empty string, SheetJS writes an empty text cell.
- SheetJS has no way to take a large integer exactly. One that has to be written as text is handed over as a string, never as a number.
- A sheet name is made from the table name in four steps. Lengths are counted as JavaScript counts them (`length`), which is how SheetJS and Excel count; an emoji counts as two.
  1. Each of the characters Excel forbids (`[ ] : * ? / \`) becomes `_`.
  2. The name is cut to 31, never through the middle of a character.
  3. An apostrophe left at either end becomes `_`, a name equal to `History` in any letter case gains a `_` at its end, and an empty name becomes `Sheet`. SheetJS refuses the first two, and Excel has no sheet without a name.
  4. Names are made unique without regard to case, which SheetJS does not check: a duplicate ends in `_2`, `_3`, with the name cut further so that it still fits in 31.
- The dialog shows each sheet name that differs from its table name.
- Excel cannot hold everything SQLite can. A cell takes 32,767 characters, counted the same way; a sheet 1,048,576 rows including the header; and a number cell is exact only up to 2^53. SheetJS stops the whole workbook when a text is too long, and does not stop at all at the row limit, so the app checks both itself as it reads the rows. §10 has the handling.
- "What comes back" above is promised for CSV only. A workbook stores whole numbers and decimals the same way, so a `REAL` column whose values are all whole comes back as `INTEGER`.
- There is no expected workbook to compare against. `expected/export.json` holds a list of checks under `excel_export`; two of them are questions, which §10 answers for now (Q25).

## 6. Evidence log

The evidence file is the only SQL the marker sees, so it must hold everything a student ran and say where their data came from.

**Capacity**

- Today the run log keeps up to 200 queries per database, fewer when queries are long, in the browser's local storage. Move it to IndexedDB and remove the cap.
- Existing entries are migrated on first load, so nobody loses history.
- The History tab shows the latest 200 with a "Show older" control. The evidence export always contains every entry.
- Three things in today's code bear on this phase. They were read on Nov 15, 2026 and are Phase 1's to answer:
  - The log is written before a Run returns, so that leaving the page straight afterwards loses nothing (`js/lab/run-log.js`). A write that waits lost most such runs when it was tried, with a Web Lock. IndexedDB's writes also finish later, so Phase 1 must show that a Run followed at once by leaving the page is still stored.
  - The 5 MB cap keeps an evidence file under the 20 MB that the verify page accepts. With no cap, that limit needs an answer.
  - `tests/m5-run-log.spec.js` and `tests/m5-durability.spec.js` read the log's storage directly. They are rewritten for the new storage; what they promise stays.

**Events** — the log records more than queries.

- A file imported (file name, size, table, rows and columns); tables exported (file name, table, rows); the database reset; a saved database reopened.
- Events are numbered entries in the same sequence as queries, so the evidence reads as a timeline.
- A file containing events carries a version 2 header. The checksum rule does not change, and the verify page accepts both versions.

How events are kept, until Phase 1 replaces the log's storage:

- Events are kept apart from queries. They would not last in the query log: today's code throws away any entry that is not a query whenever it writes, so a tab still running an older release would erase them, and the 200-entry cap would push an import out first.
- They are stored under `sqllab.events.<log key>`, as `{"v": 1, "events": [...]}`, oldest first. Until Phase 1 removes the cap, the newest 1,000 are kept, with at most 1 MB of text in their lines. The key must not start with `sqllab.log.`: tests list the keys under that prefix exactly. The query log keeps its own key and its version 1.
- An event is one file imported or exported, or one reset or reopening. It is stored as `{"t", "kind", "lines", "after"}`: its time to the second, as a query's is; its kind, one of `import`, `export`, `reset` and `reopen`; its detail lines; and a count, explained next. An event holds at most 200 lines of at most 500 characters (as JavaScript counts them: an emoji is two): a longer line is cut, and past 200 the last line says how many are not listed. So a caller puts what matters first.
- `after` is how many queries of the event's own second were already in the log. The export places the event after that many of the second's queries, or after all of them when fewer are left. Events of one second keep their stored order. The timeline is then right even when a query and an event share a second, with no ids added to queries.
- One function records an event. Phase 0's tests call it directly, because no phase before Phase 2 produces one.
- A stored value with a later version number was written by a newer release. It is never written over, so any change to what an event may hold needs a new version number.
- When the browser has no room, the newest events that fit are stored, and the page keeps all of them in memory for as long as it is open. Events that cannot be read are never written over either.
- Phase 0 showed no notice when events cannot be stored, as the run log does for queries. Phase 2, the first to record one, decided it: the same band as the run log's notice, with a sentence of its own, shown while events are held in the page's memory alone. About's list of what the browser remembers names the files a student imports. It says so although the flag is off, which students can see: what a browser may come to hold is said before it holds it, and anyone given the preview link is already covered. The owner can hold that sentence back until the flag is switched on.
- Phase 1 moves the events into the new store with the queries, and removes the separate key.

The version 2 file:

- A log with no events still exports a version 1 file, byte for byte as today. Version 2 is written only when there is an event to record.
- A log that holds events and no queries can be exported. Before Phase 0 the dialog refused a log with no entries, and the verify page called a file with no queries EDITED; Phase 0 changed both for version 2. A version 2 file must list at least one event: the verify page calls one with none EDITED.
- After an export with events, the toast counts both: "Exported evidence-northlight.txt with 3 queries and 1 event".
- An event's header line is `[n]`, its time, the middle dot, then `event:` and its kind. It is numbered in the same sequence as the queries. Its detail lines follow, with one `table:` line for each table in the file. For a workbook, that line ends with the sheet the table came from.
- In a version 2 file, the rule that escapes header-shaped lines inside SQL covers the event header's shape too, whatever kind it names, and an event's detail lines are escaped by the same rule. A version 1 file is written with today's rule, unchanged. Names taken from files go through the same one-line filter as the dataset name. Numbers are written as plain digits.
- The verify page reads the version from the first line, which before Phase 0 had to end in `v1`. A version 1 file is checked exactly as it was then. For a version 2 file, the page counts both shapes of header in one sequence, and reports queries and events separately.
- The verify page knows the four kinds of event. A file that lists any other kind is EDITED, with a reason that says the page may be out of date. So a later release that adds a kind must get its verify page out before anything writes that kind, as Phase 0's verify page goes out before Phase 2 records an event.

A version 2 file looks like this:

```
SQL Lab evidence export v2
dataset: file:messy_sales
exported: 2026-11-15T10:20:00Z

[1] 2026-11-15T10:02:11Z · event: import
file: messy_sales.csv, 2128 bytes
table: messy_sales, 22 rows, 13 columns

[2] 2026-11-15T10:03:40Z · 22 rows
SELECT * FROM messy_sales;

student: 12345678
sha256: (64 hex digits)
```

**One log per browser**

- The log exists only in the browser where the work was done. A student who works in two places has two logs and submits two evidence files.
- The status bar shows how many entries are not yet in an exported evidence file, for example "14 queries not yet exported".
- Leaving the page with entries not yet exported brings up the browser's own prompt. §10 decided this, and no phase had it; it belongs with the count, in Phase 1.
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
  - The limits apply to each file, by the kind its first bytes show (§3), not by its name. The size is checked before the file is read in full: a workbook has to be read whole just to list its sheets.
  - A warning is a step of its own, with Continue and Cancel, before that read. In the import's dialog the step is in the file's own tab, and its two buttons say what they do: *Read this file*, and *Leave this file out*. A file that is left out is not read; its tab says so, as a refused file's tab gives its reason, and the other files can be imported without it. Until one of the two is pressed, Import is off, and a line beside it names the file that waits.
  - The Excel limits were set before it was known that SheetJS reads a workbook in one blocking call. The page is frozen for the whole of it, with no progress bar and no Cancel. The limits stand as decided (§10). Before the flag is switched on, time a 20 MB and a 100 MB workbook on a lab PC, and watch the memory too. If the freeze is longer than the owner accepts, the choice is lower limits or a worker for the reading (§10).
- **Imports stay responsive without a worker**: CSV is parsed and inserted in chunks inside one transaction, pausing between chunks to update a progress bar and honour Cancel, which rolls the import back.
  - The file is read and decoded in slices as well (§3), so the page never holds the whole file as text.
  - For an import into the current database, that transaction is a savepoint. The app wraps nothing in a transaction, so the student may have left one open, and Cancel must undo the import and nothing else. For some failures the engine itself undoes everything, the student's transaction included (memory ran out; a database with a page limit is full): the message then says that as well.
  - The import keeps a busy state of its own, with a message of its own. The page's loading state will not do: closing an exercise set clears it.
  - While an import or a table export runs, these are refused: Run and Check; the database export, since a database exported part-way through an import would hold half of it; and opening another database, by the switcher, `Ctrl+O`, Open from URL, or opening or closing an exercise set. Today a newer load wins, and it would close the database the import is writing to. Phase 4's Open and Reset join the list when it is built.
  - Back and Forward cannot be refused, because the address has already changed. The page opens nothing and puts the address back.
  - The reverse holds too: no import starts while a database is loading. Files chosen or dropped then are refused with a message, and so is Import pressed then. That second message covers both ends: once the database has opened the dialog has closed, and the files are chosen again; if it could not be opened the dialog is still there, and Import can be pressed again. A load that ended in the middle of an import would close the database the import is writing to.
  - While the import's dialog is open and nothing is running, Back and Forward do open the other database, as under any other dialog, and the dialog closes: its destination and its table names were worked out for the database that was open. Left open, it went on offering "the open database" and then imported into a course database.
  - When an import into the current database ends, the page announces it with a page event of its own, as it announces a database that has loaded. The table list and the editor's names catch up from that. The status bar has nothing to catch up with: the database is the one it names, and its other line is the last query's, which an import is not. It must not be announced as a run, which would put it in the run log as a query.
  - The staging table, the typed table and a new database built apart from the open one all share the engine's memory, which stops at 2 GB.
- **Single slow statements are the remaining problem**: an `UPDATE` over a million rows, or an accidental cross join, freezes the page while it runs.
- **Optional Phase 7** moves the database into a Web Worker. The page stays usable, and a Cancel button stops a statement by ending the worker and reloading the last saved copy. A plain worker needs no special headers, so it works on GitHub Pages. This is the change the UI plan held back: it touches the execution core and needs the owner's approval.

## 8. Phases

Built so far: Phase 0 and Phase 2 (Nov 15, 2026).

The first version had seven phases, each shippable alone, the first three being the least the assessment workflow needs. This revision makes it nine, numbered 0 to 8, and they no longer all stand alone:

- Phase 0 is groundwork. Phase 8 is the Excel export, which §10 decided on but no phase covered.
- The least the assessment workflow needs is now Phases 0 to 3.
- Import and export on their own are Phases 0, 2, 3, 5 and 8, in that order. Phases 2, 3, 5 and 8 need Phase 0; Phase 5 needs Phase 2, and Phase 8 needs Phase 3.
- Phases 4 and 6 record events, so they need Phase 0 as well. Phase 4's check uses an import, and Phase 6 needs Phases 2 and 3.
- Phase 1 also moves the events and lifts their cap, when Phase 0 has been built before it (§6).
- Phases 6 and 7 are optional: build them after Phase 8, or not at all.
- The version 2 evidence file has moved from Phase 2 to Phase 0, so that Phases 2 and 3 only record events.

0. **Groundwork.** Nothing a student can see. The preview flags, read once at load (§2); the loader for vendored libraries (§2); events and the version 2 evidence file, with the verify page reading both versions (§6). Before any of it, save evidence files from today's build under `tests/fixtures/evidence/`. Beside each, save what it was built from: the entries with their links, the dataset, the export time and the student number. *Done when*, with every flag off, the page behaves as it does today; `buildEvidence`, given each saved input, gives the saved file byte for byte; the saved files still verify as VALID; and a log with an event in it gives a file that verifies as version 2.
1. **Evidence log capacity.** The run log in IndexedDB with no cap and migration; "Show older" in History; the not-yet-exported count and the prompt on leaving; the verify page taking several files. *Done when* 1,000 runs all appear in one evidence file, and a file exported before this phase still verifies as VALID.
2. **Import CSV.** Flag `import`. Open-file accepts CSV, several files at once, and drops; the preview dialog; the faithful import rules; the import report; import events. *Done when* the messy test file (§9) imports with the expected type for every column and its leading zeros intact; every other text fixture gives its expected result, the two text files in `impostors/` included (`tab_text.xls` and `renamed_csv.xlsx`); with the header box set to row 4, `csv/title_rows.csv` gives the table its expected file holds under `tables_if_header_row_can_be_chosen`; `csv/empty.csv` and `csv/wide_2100_columns.csv` are refused and leave nothing behind; and a workbook, under any name, is refused with a message until Phase 5.
3. **Export tables as CSV.** Flag `export`. The export dialog, zip output, every row exported, export events. *Done when* each table and view of `export/export_edge_cases.db` that has an expected file exports to exactly those bytes; exporting all of them gives a zip of 14 files, the 13 expected names and `mixed_types.csv`; and, once Phase 2 is built, importing each file again gives what `expected/export.json` says under `after_reimport`.
4. **Autosave, restore and reset.** IndexedDB saving, the banner, "Your databases", reset and remove. *Done when* an import survives a page reload with its changes, and Reset returns it to as imported.
5. **Import Excel.** Flag `excel-import`, with `import`. Sheets become tables and date cells become ISO text. *Done when* `shopping_db.xlsx` imports as four tables and the first row of `orders` has `OrderDate` equal to `2023-08-05`; every workbook fixture, `.xls` included, gives its expected sheets and tables; each sheet that has a `table_if_header_row_can_be_chosen` gives that table when the header box is set to its `header_row`; the three workbooks in `impostors/` that can be read give the tables in their expected files (`html_table.xls`, `spreadsheetml_2003.xls`, `renamed_xlsx.csv`); and the empty, damaged, locked and meaningless ones are refused.
6. **File fingerprints (optional).** SHA-256 on import and export events; the verify page matches dropped files. *Done when* an untouched file matches, and the same file with one character changed does not.
7. **Background execution (optional, needs approval).** The database in a Web Worker, with Cancel. *Done when* a deliberately slow query can be cancelled and the page never stops responding.
8. **Export an Excel workbook.** Flag `excel-export`, with `export`. The format choice in the export dialog, with one sheet per table; the menu item becomes "Tables…" in both menus (§10). *Done when* a workbook written from `export/export_edge_cases.db` and read back passes the checks that `expected/export.json` lists under `excel_export`, with its two questions answered as §10 says; and the workbook opens in Excel with no repair message (§9, by hand). Under §10's answer, `text_edge` is left out of the workbook, so the checks on its other rows run on a copy of the table without its 40,000-character row.

Two notes on order:

- Until Phase 4, an imported database is lost on a reload or on Back, as an opened file is today. Weigh that before `import` is switched on for students.
- The flags are switched on for students one at a time, each after its checks by hand (§9).

## 9. Proof

Each phase adds test files and automated checks, and the existing acceptance suite stays green throughout.

**Test files** in `tests/fixtures/` — the README there describes every fixture of the import and export work, and how the set was made and checked. The folder `evidence/` is apart from that set: it holds the evidence files saved from the build before Phase 0, with a README of its own, and is never made again.

- `messy_sales.csv`: ids with leading zeros, amounts with a £ sign, `dd/mm/yyyy` dates, blanks, trailing spaces, quoted commas and line breaks, and one row with an extra field.
- `windows1252.csv` (a £ and an é, saved the way Excel saves them) and `semicolon.csv`.
- `shopping_db.xlsx`: the owner's real workbook, with four sheets and true date cells.
- `large.csv`: 200,000 generated rows, for timing and progress. It is not stored: `python3 tools/gen_csv.py . --large` writes it (about 8 MB), and `expected/large.csv.json` holds its checksum.
- `csv/`, `excel/` and `impostors/`: one edge case per file, with genuine binary `.xls` workbooks, and files that are damaged, locked, or not what their extension says.
- `export/`: a database of awkward tables, and the exact CSV each should export to.
- `expected/`: the result every file must give, listed in `index.json`. The results are computed by `tools/rules.py`, a plain reading of §3 and §5. When a rule in this plan changes, change `rules.py` to match and run the scripts again. Never edit an expected file by hand.

What has been checked, and what has not:

- On Nov 15, 2026 the libraries that will ship were run against the fixtures, outside a browser. Papa Parse 5.7.1, with the settings in §3 and the text fed in 7-byte slices, gave the same rows as the fixtures' own reader for every text fixture. SheetJS 0.20.3, with the rules of §3, gave the expected sheets, names, types and cells for every workbook fixture, `.xls` included. The app's own SQLite build was run the same way for the staging table (§3).
- No expected result has been checked in Excel or Tableau, and nothing has been run in a browser.
- The report's count of empty formula cells has no expected value in the fixtures. SheetJS 0.20.3 gives 10 for `excel/formulas_uncached.xlsx`, 3 for `excel/xlwt_written.xls` and 4 for `excel/formulas.xlsx`.

Where the fixtures' own notes differ from this plan, the plan and the expected results agree:

- The README's Q11 writes a duration as `HH:MM:SS`. The expected results, and this plan, do not pad the hours: `1:00:00`.
- The README's own check ran on SheetJS 0.18.5. The check above ran on 0.20.3.
- Five files in `impostors/` are marked `import_by_content_or_refuse` there: `html_table.xls`, `spreadsheetml_2003.xls`, `tab_text.xls`, `renamed_csv.xlsx` and `renamed_xlsx.csv`. This plan imports all five.
- `rules.py` read `-0` as a whole number, and took digits from other scripts as digits, both against rule 2. It was changed on Nov 16, 2026, at the owner's word, once Phase 2 was built and followed rule 2: `[0-9]` for `\d` in both patterns, and `-0` refused in `is_int`. No expected result depended on it: run with the changed rules, `gen_expected.py` and `gen_export.py` write every file of `expected/`, every CSV of `export/expected_csv/` and the fixtures' README byte for byte as they are stored. (The database of `export/` comes out with the same contents and other bytes: the number of the SQLite version in its header, and unused space in two of its pages. A dump of the two files is the same.)
- The delimiter, the header flag and the export file names in the expected files were typed in, not computed. The rules in this plan give the same ones.

This plan decides the following, but no fixture has them yet. Add one when the phase is built. (For the text files, Phase 2's own tests hold them, as files made in the test: the fixtures are the owner's, and none was added.)

- in a text file: `-0`; a header of spaces only; a text file that starts with `PK`; a file of blank lines only; UTF-16 with no byte-order mark, which the zero-byte test refuses;
- in a workbook: a header cell that holds a number; a column that mixes numeric cells and numeric-looking text; a blank header in a table that does not start in column A;
- on export: a text column of digits, and a `REAL` column of whole values, through the round trip; a view that fails part-way.

Nothing decides the following. Decide each when it is met, state it here and add a test. Phase 2 met the four about text files. It decided the last: the five bytes Windows-1252 leaves undefined (81, 8D, 8F, 90, 9D) are read as Windows itself reads them, as the control characters of the same number, so that Windows-1252 fits every file and an import is never blocked by them. The owner can overrule that. The other three are left as the library reads them, and the code map says what that is: a line holding only `""` is skipped; text after a closing quote is read on, and the report warns of the quote; a file that mixes line endings is read with the one found in its first megabyte, so the other kind stays inside fields. Phase 2 also met one case this list did not have: a decimal that is minus zero (`-0.0`, `-0.00`). Rule 3 as written takes it for a decimal, and so does the import (`rules.py` reads it the same way): its column can be `REAL`, and SQLite then stores 0.0, so the sign is lost, which is the very thing rule 2 refuses for `-0`. It is left as rule 3 is written, with a test that says so; the owner can decide that it keeps its column as text, as `-0` does (one line in `import-rules.js`). The review of Phase 2 changed four things this plan had said or left open, each stated where it belongs above: the line ending is the app's and not Papa's guess (§3, "Preview dialog"); a file with no complete row in its first megabyte, and a file saved again after it was chosen, are refused (the same place); a decimal that no number can hold is text (rule 3); and an import and the loading of a database never overlap (§7).

- in a text file: a line holding only `""`, which Papa skips although rule 5 would make it a row; text or spaces after a closing quote; a file that mixes line endings; the five bytes Windows-1252 leaves undefined; a decimal that is minus zero;
- in a workbook: a date-formatted cell whose number is negative or past the year 9999; a sheet whose part of the file is damaged while the file around it is sound, which SheetJS returns as an empty sheet;
- on export: how negative zero and infinity are written, in CSV and in a workbook; text shaped like `_x0041_`, which Excel reads as a character code.

**Automated checks**

- Import: every column of `messy_sales.csv` gets its expected type; row counts match the file; the report names the blocking value for each mostly-numeric column. Every import fixture in `expected/index.json` gives its expected settings, names, types and cells, or is refused; `large.csv` is among them once it has been generated.
- Encoding: the £ and the é survive from `windows1252.csv`. Every text fixture gives the same result when the reader's slice is cut to a few bytes, so that characters of several bytes are split across slices.
- Round trip: exporting a table and importing it again gives the same columns and values, apart from the differences `expected/export.json` lists.
- Export: a 2,000-row table produces 2,000 data lines, and each expected CSV is matched byte for byte.
- Autosave: a reload restores the changed data; Reset restores the original; Remove deletes it from IndexedDB; a name clash asks before replacing.
- Evidence: old files verify as VALID; version 2 files verify; events appear in order; several files verify together. The old files are real ones, saved from the build before Phase 0.
- Loading: the import and export libraries are requested only when first used; the initial transfer stays at or under 3 MB; there are no third-party requests.
- Accessibility: every new dialog, banner and menu item passes the UI plan's keyboard-only and axe checks, in light and dark.
- Flags: with every preview flag off, the page behaves exactly as it does today. The one-file chooser and the refused drop keep their tests, and both menus list what they list today.

**Checked by hand, once per phase that touches it**

- Open an exported CSV in Tableau: dates arrive as dates, numbers as numbers, and £ and accented text are intact.
- On a university lab PC: saved work and the run log behave sensibly across logging off and on again.
- Open an exported workbook in Excel and in Tableau: it opens with no repair message. Note whether Tableau offers the ISO dates as dates or as text.
- On a lab PC: time the import of a 20 MB and a 100 MB workbook (§7).
- In Safari: choose several files, import them, and download a CSV, a zip and a workbook. The site has never been tested in Safari.
- Import one real course file of each kind, and read the import report as a student would.

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

**Readings the test files are built on.** The first version of this plan left 26 points open. `tests/fixtures/README.md` lists them as Q1 to Q26, with the reading each expected result follows, and §3 and §5 now state those readings. They stand until the owner changes one; `tools/rules.py` then changes with it, and the expected results are made again.

**Settled by the owner on Nov 15, 2026.** Three points. The first two change what the first version of this plan said.

| Point | The question | What was decided |
| --- | --- | --- |
| Whole numbers beside decimals (Q6) | The first version's rule 3 made a column of `10` and `12.50` text. Its rule 1 stored every value "exactly as written", which a number column cannot do: `1.50` becomes 1.5. | `REAL`, as rule 3 now says and the fixtures expect. "Exactly as written" holds for `TEXT` columns (rule 1). |
| What an export gives back (Q21) | The first version's Phase 3 asked for a re-imported table "identical cell for cell". An empty string, a text column of digits and a 16-digit integer cannot come back unchanged. | The same values in the same columns, apart from the differences §5 lists. |
| Header row (Q1) | Course files often have title lines above the column names. With the first row as the header, the `Sales 2024` sheet of the messy course workbook imports with its title as the first column name, then `column_2` to `column_9`, all text. | The preview has a "Column names are on row" box (§3). It starts at 1, so a file read without touching it gives the result above. The fixtures hold both results: the second is under `table_if_header_row_can_be_chosen` for a sheet and `tables_if_header_row_can_be_chosen` for the CSV. |

**Still for the owner.** Five points are the owner's to settle. None was decided on Nov 15, 2026; until one is, build what the last column says.

| Point | The question | Build this until decided |
| --- | --- | --- |
| Reserved words (Q2) | A table called `Order` fails in `SELECT * FROM Order` until it is written `"Order"`. | Names are kept as they are. Suggested, and not built unless the owner agrees: the import report lists each name that needs double quotes, found by asking the engine to prepare a query that uses it. |
| Zero-padded Excel cells (Q10) | An id shown as `00123` by a number format is stored as 123, and its zeros are lost without a trace. | The stored number, as the fixtures expect. Suggested, and not built unless the owner agrees: the import report names each column that has such a format, with one example as Excel showed it. |
| Binary values on export (Q22) | A table can hold a BLOB, which CSV and Excel cannot. | Written as the results pane already shows one, `x'deadbeef'`, in CSV and as a text cell in a workbook. When the export ends, the dialog says which tables held one. The fixture table `mixed_types` has no expected file until this is settled. |
| What Excel cannot hold (Q25) | Text over 32,767 characters, more than 1,048,575 data rows, integers beyond 2^53. | A table with text or rows beyond the limits is left out of the workbook; when the export ends, the dialog says which and why, and points to CSV. An integer beyond 2^53 is written as a text cell. Once the dialog has two formats, its menu item is named "Tables…". |
| Reading Excel in a worker (§7) | SheetJS freezes the page while it reads. A worker used for the reading only would keep the page alive without touching the database. §7 keeps workers for the owner's approval. | No worker, and the size limits as decided above. The timing on a lab PC (§9) tells the owner whether to lower them. |
