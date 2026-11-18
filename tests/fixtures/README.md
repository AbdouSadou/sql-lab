# SQL Lab test fixtures

Test files for the import and export phases of the SQL Lab Assessment Workflow Plan (sections 3, 5 and 9),
with the result each one should give.

## What is here

| Where | What |
| --- | --- |
| `messy_sales.csv`, `windows1252.csv`, `semicolon.csv`, `shopping_db.xlsx` | The files the plan names. `large.csv` is not stored: `python3 tools/gen_csv.py . --large` writes it (200,000 rows). |
| `csv/` | One edge case per file: encodings, delimiters, headers and names, type inference, quoting, ragged and blank rows. |
| `excel/` | Workbooks, including genuine binary `.xls` files. `messy_course_workbook` is the realistic one; the rest isolate one feature each. |
| `impostors/` | Files that are not what their extension says, or are damaged or locked. |
| `export/` | `export_edge_cases.db`, a database of awkward tables, and `expected_csv/`, the exact CSV each table should export to. |
| `expected/` | One JSON file per fixture with the expected result. `index.json` lists them. |
| `tools/` | The Python scripts that made all of this. Not needed to run the tests. |

## Reading an expected file

The file for `csv/types.csv` is `expected/csv__types.csv.json`: the path with `/` replaced by `__`, plus `.json`.

- `outcome` is `import`, `refuse`, or `import_by_content_or_refuse` (see Q18).
- `settings` (text files) holds what the preview dialog should detect: encoding, delimiter, and whether the first row is a header.
- `tables` (text files) or `sheets[].table` (workbooks) holds each table: `name`, `rows`, and for every column its `name`,
  `type`, number of `nulls`, the `original` header where the name changed, and `report_example` where the import report
  should name a value that stopped the column being a number.
- `data` holds every row. JSON `null` is NULL, a number is an INTEGER or REAL value, a string is TEXT.
  A table of more than 200 rows has `data_first_rows`, `data_last_rows` and `data_sha256` instead: the SHA-256 of
  `JSON.stringify(rows)` as JavaScript writes it.
- For a workbook, each sheet also has its `state` (`visible`, `hidden`, `veryHidden`), whether it is `importable`,
  and whether it is `ticked_by_default`. Table names are given as if every importable sheet were ticked.
- `table_if_header_row_can_be_chosen` and `tables_if_header_row_can_be_chosen` give a second result for files with
  title rows, in case the preview gains a way to pick the header row (Q1).
- `open_questions` lists the points below that the expected result depends on.
- `expected/export.json` describes the export database: each table, its expected CSV file with a checksum, and
  `after_reimport`, which is `identical` or the list of differences once that CSV is imported again.

## Where the plan does not decide

The fixtures were written from the plan, and 26 points came up that it does not settle. Each expected result follows
the reading in the last column. If the owner decides otherwise, change the reading in `tools/rules.py` or
`tools/gen_expected.py` and run the scripts again.

| | Point | The question | Reading used here |
| --- | --- | --- | --- |
| Q1 | Header row not on the first row | Course files often have title lines above the column names. The plan only offers "the first row holds column names: yes or no". | Literal: the first row is the header. Each affected fixture also gives the result if the preview let the student pick the header row. |
| Q2 | Reserved words as names | A column or table called Order, Group or Select must be quoted in every query, which the naming rule set out to avoid. | Literal: the name is kept as it is, and the import report lists each name that must be written in double quotes (plan section 10). |
| Q3 | Accented letters in names | Is é one of the "other characters" that become an underscore? | Yes: only A to Z, a to z, 0 to 9 and underscore are kept, so Café becomes Caf_. |
| Q4 | Underscores at the ends of names | "Amount (£)" becomes Amount_ and "% Change" becomes _Change. | Literal: nothing is trimmed. |
| Q5 | Numbering of blank headers | Is a blank header in the fifth column called column_5 or column_1? | By position: column_5. A file with no header row gets column_1 to column_n. |
| Q6 | What counts as a plain number | The plan covers leading zeros, currency, separators, percent, decimal commas and exponents. It does not mention +5, .5, 5. or a number with spaces round it, or a decimal column that also holds whole numbers. | +5, .5, 5. and " 3" keep the column TEXT, because storing them as numbers would change what was written. Whole numbers and decimals together make a REAL column. |
| Q7 | A column with no values | Every row is empty, so the INTEGER rule is met by default. | TEXT. |
| Q8 | Blank lines and blank rows | A completely empty line in a CSV, a line of only spaces, a line of only delimiters, and an empty row inside a sheet. | An empty CSV line is skipped. A line of spaces is a row whose first field holds those spaces. A line of only delimiters, and an empty row inside a sheet, are rows of NULLs. |
| Q9 | Detecting a file with no header row | The plan says the header setting is detected, not how. | no_header.csv should be detected as having no header. Treat this as a soft expectation. |
| Q10 | Excel number formats | A cell shows £1,234.50, 12.5% or 00123 but holds 1234.5, 0.125 or 123. | The stored number is imported, not the displayed text. Only date formats change what is imported. A numeric cell is a number whatever its size. |
| Q11 | Excel times and durations | The plan covers dates and dates with times, not a cell holding only a time, or a duration such as 30:00:00. | Text as HH:MM:SS, with hours allowed to pass 24 for a duration. |
| Q12 | Excel true and false cells | Store 1 and 0, or the words? | The words TRUE and FALSE, as Excel shows them. |
| Q13 | Formulas with no stored result | Files written by Python libraries hold formulas but no calculated values, so there is no "last calculated value" to import. | NULL, and the import report says how many formula cells had no value. |
| Q14 | Hidden rows and columns | Filtered-out or hidden rows and columns on a visible sheet. | Imported like any other. Hidden and very hidden sheets are listed but not ticked. |
| Q15 | Merged cells | A merged block holds its value in the top-left cell only. | The top-left cell gets the value and the rest are NULL. |
| Q16 | Where a sheet's table starts and ends | Sheets that are empty, hold only formatting, start at C5, have a stray value far from the table, or are chart sheets. | The table is the smallest rectangle holding every value. A sheet with no values cannot be imported and is shown unticked and disabled. Chart sheets are not listed. |
| Q17 | More than 2,000 columns | SQLite refuses a table with more than 2,000 columns. | Refuse the file with a message that says why. |
| Q18 | Files that are not what their extension says, or are damaged | A web export saved as .xls is often HTML or tab-separated text. Students also rename files. Some files are cut short or password-protected. | Read by content when the content is recognisable; otherwise refuse with a clear message. Never leave a half-made database. |
| Q19 | Dates in January and February 1900 | Excel counts a 29 February 1900 that never existed (serial 60). | Follow Excel: serial 60 is 1900-02-29, serial 59 is 1900-02-28, serial 61 is 1900-03-01. |
| Q20 | How numbers are written on export | The plan says plainly, with a decimal point and no rounding. JavaScript prints 1.0 as 1 and 0.0000001 as 1e-7. | A REAL always has a decimal point (1.0) and never an exponent (0.0000001). An INTEGER is written in full, including values above 2^53. |
| Q21 | What cannot survive export then re-import | An empty string and NULL both export as an empty field. A text column holding only digits re-imports as INTEGER. | Accepted. export.json lists the exact differences for each table, so the round-trip check can allow for them. |
| Q22 | Exporting a BLOB | The plan does not say. | Written as the results pane shows one, x'deadbeef' (lower-case hex), in a CSV (plan section 10). mixed_types has an expected CSV. |
| Q23 | Line ending on export | The plan does not say. | CRLF after every record, including the last. Line breaks inside a field are left as stored. |
| Q24 | Names of exported files | Table names can hold characters a file name cannot (sales/2024), can collide once cleaned, and can be reserved on Windows (con). | The import naming rule is applied to the table name, and duplicates gain _2. con.csv is left as it is. |
| Q25 | The Excel export | Added to the plan's decisions table after the fixtures were designed. Sheet names are limited to 31 characters, a cell to 32,767 characters. | export.json states what each sheet must hold. There is no binary file to compare against. |
| Q26 | Text that starts with = + - or @ | Opened in Excel, such a field in a CSV is treated as a formula. | Written exactly as stored, as the plan says. The files are meant for Tableau. |

## How the files were checked

- Every expected table is computed by `tools/rules.py`, then reproduced by a second implementation written in
  JavaScript on Papa Parse 5.7.1 and SheetJS 0.18.5. The two agree on every table, column name, type and cell.
- The `.xls` files are genuine binary workbooks (BIFF8), converted from the `.xlsx` versions by LibreOffice 24.2 and
  read back with xlrd. `xlwt_written.xls` comes from a second writer.
- In `messy_course_workbook.xlsx` the stored result of each formula was worked out in Python. LibreOffice calculated
  the same formulas afresh for the `.xls`. Every cell agrees.
- Every file in `export/expected_csv/` is reproduced byte for byte by a separate JavaScript exporter reading the
  database through SQLite's WebAssembly build.
- Not checked: nothing here has been opened in Microsoft Excel or Tableau. SheetJS 0.18.5 is the npm copy the plan
  says not to ship; it was used for checking only, and the current release may behave differently.

## What the checks turned up

1. **SheetJS guesses types in HTML and text files.** Reading `impostors/html_table.xls` without its raw option gives
   123 for `00123` and 8 May 2023 for `05/08/2023`. `impostors/tab_text.xls` and `impostors/renamed_csv.xlsx` lose
   their leading zeros the same way.
2. **SheetJS does not reject every bad file.** `impostors/zero_bytes.xlsx` comes back as one empty sheet and
   `impostors/random_bytes.xls` as a sheet of noise. Check the file's first bytes before handing it over.
3. **A `.xls` cannot tell a time from a date by its cell type.** Dates, times and durations are all numbers with a
   format. `excel/formats.xls` has all three.
4. **Formula results carry floating-point tails.** `excel/messy_course_workbook.xls` holds 124.94999999999999 where
   the sheet shows 124.95.
5. **SQLite stops at 2,000 columns.** Confirmed on the WebAssembly build with `csv/wide_2100_columns.csv`.
6. **Integers above 2^53** in `export/export_edge_cases.db` are rounded if read as ordinary JavaScript numbers.
7. **Papa Parse guessed the delimiter correctly for every text fixture here**, including `semicolon.csv` and
   `csv/title_rows.csv`.

## Making the files again

```
pip install xlsxwriter openpyxl xlwt xlrd msoffcrypto-tool
python3 tools/gen_csv.py .
python3 tools/gen_excel.py . shopping_db.xlsx      # needs LibreOffice (soffice) for the .xls files
python3 tools/gen_export.py .
python3 tools/gen_expected.py .
```

The text files, the export database and the expected results come out identical on every run. The workbooks hold
the same cells each time but not the same bytes, because they record when they were made.

## Every fixture

| File | What it covers | Depends on |
| --- | --- | --- |
| `messy_sales.csv` | The plan's main messy file: leading zeros, £ amounts, dd/mm/yyyy dates, blanks, trailing spaces, quoted commas and line breaks, a short row, a row with an extra field, an exact duplicate row. | Q4 |
| `windows1252.csv` | Windows-1252 bytes: £, é, €, curly quotes and a dash, as Excel saves a CSV. | Q3 |
| `semicolon.csv` | Semicolon delimiter with decimal commas and commas inside unquoted fields. |  |
| `csv/utf8_bom.csv` | UTF-8 with a byte-order mark. |  |
| `csv/utf16le_bom.txt` | UTF-16 little-endian with a byte-order mark and tabs: Excel's "Unicode Text". |  |
| `csv/utf16be_bom.csv` | UTF-16 big-endian with a byte-order mark. |  |
| `csv/tab_delimited.tsv` | Tab delimiter, with commas, semicolons, pipes and a quoted tab in the data. |  |
| `csv/pipe_delimited.txt` | Pipe delimiter in a .txt file, with a quoted pipe in the data. |  |
| `csv/single_column.csv` | One column, so there is no delimiter to detect. |  |
| `csv/no_header.csv` | No header row. | Q5, Q9 |
| `csv/header_names.csv` | Awkward column names: duplicates that differ only by case, a clash with a generated name, blanks, reserved words, a leading digit, symbols, accents. | Q2, Q3, Q4, Q5 |
| `csv/title_rows.csv` | Three title lines and a blank line above the header, a totals row and a source line below the data. | Q1, Q8 |
| `csv/names/2024 Sales Data (final) v2.csv` | A file name with a leading digit, spaces and brackets, for the table name. |  |
| `csv/names/Order.csv` | A file whose name is a reserved word. | Q2 |
| `csv/types.csv` | One column per type-inference case, six rows each. | Q6, Q7 |
| `csv/late_type_change.csv` | 5,000 rows where the value that decides each column's type is in the last eleven rows. |  |
| `csv/quotes_and_newlines.csv` | Quoted line feeds and CRLF, doubled quotes, a stray quote, padding spaces, a 10,000-character field, emoji, no line ending at the end of the file. |  |
| `csv/ragged_rows.csv` | Rows shorter and longer than the header. |  |
| `csv/trailing_delimiter.csv` | Every line ends with a comma, so there is a nameless, empty last column. | Q5, Q7 |
| `csv/blank_lines.csv` | Blank lines before the header, between rows and at the end; a line of spaces; a line holding only a comma. | Q8 |
| `csv/header_only.csv` | A header and no data rows. | Q7 |
| `large.csv` | 200,000 rows for timing, progress and Cancel. Not stored: tools/gen_csv.py writes it. |  |
| `csv/empty.csv` | A file of zero bytes. |  |
| `csv/wide_2100_columns.csv` | 2,100 columns: more than SQLite allows in one table. | Q17 |
| `excel/messy_course_workbook.xlsx` | A realistic course workbook: a read-me sheet, a sales sheet with a merged title, header on row 4, formulas, error values, a totals row and a hidden column; a customers sheet; a summary of formulas; a hidden lookup sheet; a very hidden sheet. | Q1, Q10, Q12, Q14, Q15 |
| `excel/messy_course_workbook.xls` | The same workbook as a genuine binary .xls, with every formula calculated by LibreOffice. | Q1, Q10, Q12, Q14, Q15 |
| `excel/shopping_db.xls` | The owner's real workbook as a genuine binary .xls. |  |
| `excel/title_rows_and_layouts.xlsx` | One layout per sheet: title rows above the header; a table that starts at C5; a units row under the header; a two-level merged header; merged category cells; two tables side by side; a blank column and a blank row inside a table. | Q1, Q8, Q15, Q16 |
| `excel/hidden.xlsx` | A hidden sheet, a very hidden sheet, hidden rows, a collapsed outline group and a hidden column. | Q14 |
| `excel/formulas.xlsx` | Formulas with stored results of every kind: number, text, date, true or false, empty text, an array formula and all seven error values. | Q7, Q12 |
| `excel/formulas_uncached.xlsx` | Formulas with no stored results, as written by openpyxl. | Q7, Q13 |
| `excel/formats.xlsx` | One column per cell format: dates, date-times, times, custom and long date formats, dates typed as text, currency, percent, leading-zero format, thousands, scientific, numbers typed as text, true and false, long decimals, accounting, fractions, line breaks, padding spaces, mixed cells, durations, very large numbers. A second sheet holds 1900 serial dates. | Q10, Q11, Q12, Q19 |
| `excel/formats.xls` | The same workbook as a genuine binary .xls. | Q10, Q11, Q12, Q19 |
| `excel/dates_1904.xlsx` | A workbook on the 1904 date system, as older Mac versions of Excel wrote. |  |
| `excel/sheet_names.xlsx` | Sheet names that clash once cleaned, start with a digit, are reserved words, or hold accents, brackets and an emoji. | Q2, Q3, Q4 |
| `excel/empty_sheets.xlsx` | An empty sheet, a header-only sheet, a sheet of formatted but empty cells, a single cell, and a table with one stray value at H20. | Q7, Q16 |
| `excel/chart_sheet.xlsx` | A data sheet and a chart sheet. | Q16 |
| `excel/xlwt_written.xls` | A binary .xls from a different writer (xlwt): text with leading zeros, dates, a £ format, true and false, formulas with no stored result, a hidden and a very hidden sheet. | Q10, Q12, Q13 |
| `shopping_db.xlsx` | The owner's real workbook: four sheets, true date cells. |  |
| `impostors/html_table.xls` | An HTML table saved with an .xls extension, as many websites export. | Q18 |
| `impostors/spreadsheetml_2003.xls` | An "XML Spreadsheet 2003" file with an .xls extension, as some reporting systems export. | Q18 |
| `impostors/tab_text.xls` | Tab-separated text with an .xls extension. | Q18 |
| `impostors/renamed_csv.xlsx` | A CSV file renamed to .xlsx. | Q18 |
| `impostors/renamed_xlsx.csv` | An Excel workbook renamed to .csv. | Q18 |
| `impostors/truncated.xlsx` | A workbook cut off part-way through. | Q18 |
| `impostors/zero_bytes.xlsx` | A file of zero bytes with an .xlsx extension. | Q18 |
| `impostors/random_bytes.xls` | Meaningless bytes with an .xls extension. | Q18 |
| `impostors/password_protected.xlsx` | A workbook encrypted with a password (the password is sqllab). | Q18 |
| `export/export_edge_cases.db` | A database of tables chosen to stress the CSV and Excel export. | Q20, Q21, Q22, Q23, Q24, Q25, Q26 |
