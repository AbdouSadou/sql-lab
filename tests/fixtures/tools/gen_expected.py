"""Compute the expected result of importing or exporting every fixture, into ../expected/.

    python3 gen_expected.py <fixtures dir>

Run after gen_csv.py, gen_excel.py and gen_export.py.
"""
import hashlib
import json
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rules  # noqa: E402

QUESTIONS = {
    'Q1': ('Header row not on the first row',
           'Course files often have title lines above the column names. The plan only offers "the first row holds column names: yes or no".',
           'Literal: the first row is the header. Each affected fixture also gives the result if the preview let the student pick the header row.'),
    'Q2': ('Reserved words as names',
           'A column or table called Order, Group or Select must be quoted in every query, which the naming rule set out to avoid.',
           'Literal: the name is kept as it is, and the import report lists each name that must be written in double quotes (plan section 10).'),
    'Q3': ('Accented letters in names',
           'Is é one of the "other characters" that become an underscore?',
           'Yes: only A to Z, a to z, 0 to 9 and underscore are kept, so Café becomes Caf_.'),
    'Q4': ('Underscores at the ends of names',
           '"Amount (£)" becomes Amount_ and "% Change" becomes _Change.',
           'Literal: nothing is trimmed.'),
    'Q5': ('Numbering of blank headers',
           'Is a blank header in the fifth column called column_5 or column_1?',
           'By position: column_5. A file with no header row gets column_1 to column_n.'),
    'Q6': ('What counts as a plain number',
           'The plan covers leading zeros, currency, separators, percent, decimal commas and exponents. It does not mention +5, .5, 5. or a number with spaces round it, or a decimal column that also holds whole numbers.',
           '+5, .5, 5. and " 3" keep the column TEXT, because storing them as numbers would change what was written. Whole numbers and decimals together make a REAL column.'),
    'Q7': ('A column with no values',
           'Every row is empty, so the INTEGER rule is met by default.',
           'TEXT.'),
    'Q8': ('Blank lines and blank rows',
           'A completely empty line in a CSV, a line of only spaces, a line of only delimiters, and an empty row inside a sheet.',
           'An empty CSV line is skipped. A line of spaces is a row whose first field holds those spaces. A line of only delimiters, and an empty row inside a sheet, are rows of NULLs.'),
    'Q9': ('Detecting a file with no header row',
           'The plan says the header setting is detected, not how.',
           'no_header.csv should be detected as having no header. Treat this as a soft expectation.'),
    'Q10': ('Excel number formats',
            'A cell shows £1,234.50, 12.5% or 00123 but holds 1234.5, 0.125 or 123.',
            'The stored number is imported, not the displayed text. Only date formats change what is imported. A numeric cell is a number whatever its size.'),
    'Q11': ('Excel times and durations',
            'The plan covers dates and dates with times, not a cell holding only a time, or a duration such as 30:00:00.',
            'Text as HH:MM:SS, with hours allowed to pass 24 for a duration.'),
    'Q12': ('Excel true and false cells',
            'Store 1 and 0, or the words?',
            'The words TRUE and FALSE, as Excel shows them.'),
    'Q13': ('Formulas with no stored result',
            'Files written by Python libraries hold formulas but no calculated values, so there is no "last calculated value" to import.',
            'NULL, and the import report says how many formula cells had no value.'),
    'Q14': ('Hidden rows and columns',
            'Filtered-out or hidden rows and columns on a visible sheet.',
            'Imported like any other. Hidden and very hidden sheets are listed but not ticked.'),
    'Q15': ('Merged cells',
            'A merged block holds its value in the top-left cell only.',
            'The top-left cell gets the value and the rest are NULL.'),
    'Q16': ('Where a sheet\'s table starts and ends',
            'Sheets that are empty, hold only formatting, start at C5, have a stray value far from the table, or are chart sheets.',
            'The table is the smallest rectangle holding every value. A sheet with no values cannot be imported and is shown unticked and disabled. Chart sheets are not listed.'),
    'Q17': ('More than 2,000 columns',
            'SQLite refuses a table with more than 2,000 columns.',
            'Refuse the file with a message that says why.'),
    'Q18': ('Files that are not what their extension says, or are damaged',
            'A web export saved as .xls is often HTML or tab-separated text. Students also rename files. Some files are cut short or password-protected.',
            'Read by content when the content is recognisable; otherwise refuse with a clear message. Never leave a half-made database.'),
    'Q19': ('Dates in January and February 1900',
            'Excel counts a 29 February 1900 that never existed (serial 60).',
            'Follow Excel: serial 60 is 1900-02-29, serial 59 is 1900-02-28, serial 61 is 1900-03-01.'),
    'Q20': ('How numbers are written on export',
            'The plan says plainly, with a decimal point and no rounding. JavaScript prints 1.0 as 1 and 0.0000001 as 1e-7.',
            'A REAL always has a decimal point (1.0) and never an exponent (0.0000001). An INTEGER is written in full, including values above 2^53.'),
    'Q21': ('What cannot survive export then re-import',
            'An empty string and NULL both export as an empty field. A text column holding only digits re-imports as INTEGER.',
            'Accepted. export.json lists the exact differences for each table, so the round-trip check can allow for them.'),
    'Q22': ('Exporting a BLOB',
            'The plan does not say.',
            'Written as the results pane shows one, x\'deadbeef\' (lower-case hex), in a CSV (plan section 10). mixed_types has an expected CSV.'),
    'Q23': ('Line ending on export',
            'The plan does not say.',
            'CRLF after every record, including the last. Line breaks inside a field are left as stored.'),
    'Q24': ('Names of exported files',
            'Table names can hold characters a file name cannot (sales/2024), can collide once cleaned, and can be reserved on Windows (con).',
            'The import naming rule is applied to the table name, and duplicates gain _2. con.csv is left as it is.'),
    'Q25': ('The Excel export',
            'Added to the plan\'s decisions table after the fixtures were designed. Sheet names are limited to 31 characters, a cell to 32,767 characters.',
            'export.json states what each sheet must hold. There is no binary file to compare against.'),
    'Q26': ('Text that starts with = + - or @',
            'Opened in Excel, such a field in a CSV is treated as a formula.',
            'Written exactly as stored, as the plan says. The files are meant for Tableau.'),
}

CSV = [
    # path, delimiter, header, covers, questions, notes
    ('messy_sales.csv', ',', True, 'The plan\'s main messy file: leading zeros, £ amounts, dd/mm/yyyy dates, blanks, trailing spaces, quoted commas and line breaks, a short row, a row with an extra field, an exact duplicate row.', ['Q4'],
     ['Row 14 (00135) has 4 fields and is padded with NULL. Row 15 (00136) has 13 fields, which creates extra_1.',
      'Unit_Price is REAL although one value is written 100 (Q6).']),
    ('windows1252.csv', ',', True, 'Windows-1252 bytes: £, é, €, curly quotes and a dash, as Excel saves a CSV.', ['Q3'],
     ['The € sign and curly quotes are bytes 0x80 to 0x9F, which exist in Windows-1252 but not in Latin-1.']),
    ('semicolon.csv', ';', True, 'Semicolon delimiter with decimal commas and commas inside unquoted fields.', [],
     ['Commas outnumber semicolons on some lines, so delimiter detection must not be a simple count of the first line.']),
    ('csv/utf8_bom.csv', ',', True, 'UTF-8 with a byte-order mark.', [], ['The first column must be called id, with no invisible mark in front of it.']),
    ('csv/utf16le_bom.txt', '\t', True, 'UTF-16 little-endian with a byte-order mark and tabs: Excel\'s "Unicode Text".', [], []),
    ('csv/utf16be_bom.csv', ',', True, 'UTF-16 big-endian with a byte-order mark.', [], []),
    ('csv/tab_delimited.tsv', '\t', True, 'Tab delimiter, with commas, semicolons, pipes and a quoted tab in the data.', [], []),
    ('csv/pipe_delimited.txt', '|', True, 'Pipe delimiter in a .txt file, with a quoted pipe in the data.', [], []),
    ('csv/single_column.csv', ',', True, 'One column, so there is no delimiter to detect.', [], []),
    ('csv/no_header.csv', ',', False, 'No header row.', ['Q5', 'Q9'], []),
    ('csv/header_names.csv', ',', True, 'Awkward column names: duplicates that differ only by case, a clash with a generated name, blanks, reserved words, a leading digit, symbols, accents.', ['Q2', 'Q3', 'Q4', 'Q5'],
     ['SQLite compares column names without regard to case, so Name, name and NAME are duplicates.',
      'The fourth header is Name_2, which is already taken by the time it is reached.']),
    ('csv/title_rows.csv', ',', True, 'Three title lines and a blank line above the header, a totals row and a source line below the data.', ['Q1', 'Q8'],
     ['The title lines have no commas at all, which can also mislead delimiter detection.']),
    ('csv/names/2024 Sales Data (final) v2.csv', ',', True, 'A file name with a leading digit, spaces and brackets, for the table name.', [], []),
    ('csv/names/Order.csv', ',', True, 'A file whose name is a reserved word.', ['Q2'], []),
    ('csv/types.csv', ',', True, 'One column per type-inference case, six rows each.', ['Q6', 'Q7'], []),
    ('csv/late_type_change.csv', ',', True, '5,000 rows where the value that decides each column\'s type is in the last eleven rows.', [],
     ['Proves that types come from all rows (rule 8). qty turns TEXT at row 4,990, price turns REAL at row 4,995, code turns TEXT at row 5,000.']),
    ('csv/quotes_and_newlines.csv', ',', True, 'Quoted line feeds and CRLF, doubled quotes, a stray quote, padding spaces, a 10,000-character field, emoji, no line ending at the end of the file.', [], []),
    ('csv/ragged_rows.csv', ',', True, 'Rows shorter and longer than the header.', [], []),
    ('csv/trailing_delimiter.csv', ',', True, 'Every line ends with a comma, so there is a nameless, empty last column.', ['Q5', 'Q7'], []),
    ('csv/blank_lines.csv', ',', True, 'Blank lines before the header, between rows and at the end; a line of spaces; a line holding only a comma.', ['Q8'], []),
    ('csv/header_only.csv', ',', True, 'A header and no data rows.', ['Q7'], []),
]

EXCEL = [
    # path, covers, questions, {sheet: header row}, notes
    ('excel/messy_course_workbook.xlsx', 'A realistic course workbook: a read-me sheet, a sales sheet with a merged title, header on row 4, formulas, error values, a totals row and a hidden column; a customers sheet; a summary of formulas; a hidden lookup sheet; a very hidden sheet.',
     ['Q1', 'Q10', 'Q12', 'Q14', 'Q15'], {'Sales 2024': 4, 'Summary': 3},
     ['Order ID is text with leading zeros. One id was retyped as "126 ".',
      'Product, Unit Price and Line Total are formulas. Row 12 has #N/A in all three and row 16 has #VALUE! in Line Total, so the Total row shows #N/A.',
      'Column I (Margin %) is hidden.']),
    ('excel/messy_course_workbook.xls', 'The same workbook as a genuine binary .xls, with every formula calculated by LibreOffice.',
     ['Q1', 'Q10', 'Q12', 'Q14', 'Q15'], {'Sales 2024': 4, 'Summary': 3},
     ['The same cells as the .xlsx, except that LibreOffice\'s results carry the usual floating-point tail: Line Total on row 11 is 124.94999999999999, not 124.95. Import it as it is: the plan says no rounding.',
      'The Config sheet is hidden, not very hidden: LibreOffice does not keep the distinction.']),
    ('excel/shopping_db.xls', 'The owner\'s real workbook as a genuine binary .xls.', [], {}, ['Must import exactly as shopping_db.xlsx does.']),
    ('excel/title_rows_and_layouts.xlsx', 'One layout per sheet: title rows above the header; a table that starts at C5; a units row under the header; a two-level merged header; merged category cells; two tables side by side; a blank column and a blank row inside a table.',
     ['Q1', 'Q8', 'Q15', 'Q16'], {'Title above header': 5}, []),
    ('excel/hidden.xlsx', 'A hidden sheet, a very hidden sheet, hidden rows, a collapsed outline group and a hidden column.', ['Q14'], {}, []),
    ('excel/formulas.xlsx', 'Formulas with stored results of every kind: number, text, date, true or false, empty text, an array formula and all seven error values.', ['Q7', 'Q12'], {},
     ['The Blank column is a formula returning empty text in every row, so it imports as NULL.']),
    ('excel/formulas_uncached.xlsx', 'Formulas with no stored results, as written by openpyxl.', ['Q7', 'Q13'], {}, []),
    ('excel/formats.xlsx', 'One column per cell format: dates, date-times, times, custom and long date formats, dates typed as text, currency, percent, leading-zero format, thousands, scientific, numbers typed as text, true and false, long decimals, accounting, fractions, line breaks, padding spaces, mixed cells, durations, very large numbers. A second sheet holds 1900 serial dates.',
     ['Q10', 'Q11', 'Q12', 'Q19'], {},
     ['DateTime row 1 is at midnight, so it has no time part, as the plan\'s rule 6 says.']),
    ('excel/formats.xls', 'The same workbook as a genuine binary .xls.', ['Q10', 'Q11', 'Q12', 'Q19'], {}, ['In a binary .xls a time, a duration and a date are all the same kind of cell. Only the number format tells them apart.']),
    ('excel/dates_1904.xlsx', 'A workbook on the 1904 date system, as older Mac versions of Excel wrote.', [], {}, ['Serial numbers are 1,462 lower than usual. The dates must come out the same as in formats.xlsx.']),
    ('excel/sheet_names.xlsx', 'Sheet names that clash once cleaned, start with a digit, are reserved words, or hold accents, brackets and an emoji.', ['Q2', 'Q3', 'Q4'], {}, []),
    ('excel/empty_sheets.xlsx', 'An empty sheet, a header-only sheet, a sheet of formatted but empty cells, a single cell, and a table with one stray value at H20.', ['Q7', 'Q16'], {}, []),
    ('excel/chart_sheet.xlsx', 'A data sheet and a chart sheet.', ['Q16'], {}, []),
    ('excel/xlwt_written.xls', 'A binary .xls from a different writer (xlwt): text with leading zeros, dates, a £ format, true and false, formulas with no stored result, a hidden and a very hidden sheet.', ['Q10', 'Q12', 'Q13'], {}, []),
]


def canon(data):
    """SHA-256 of the rows as JavaScript's JSON.stringify writes them (a real with a whole value has no .0)."""
    js = [[int(v) if isinstance(v, float) and v.is_integer() and abs(v) < 1e15 else v for v in row] for row in data]
    return hashlib.sha256(json.dumps(js, ensure_ascii=False, separators=(',', ':')).encode('utf-8')).hexdigest()


def shrink(table):
    """Large tables keep their checksum and their first and last rows only."""
    if table['rows'] > 200:
        data = table.pop('data')
        table['data_sha256'] = canon(data)
        table['data_first_rows'] = data[:3]
        table['data_last_rows'] = data[-12:]
    return table


def stem_name(path):
    return rules.sanitise(os.path.splitext(os.path.basename(path))[0])


def write(root, rel, obj):
    name = rel.replace('/', '__') + '.json'
    with open(os.path.join(root, 'expected', name), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(obj, f, indent=1, ensure_ascii=False)
        f.write('\n')
    return name


def workbook_tables(sheets, header_rows=None):
    used, out = set(), []
    for name, state, grid in sheets:
        entry = {'sheet': name, 'state': state, 'importable': bool(grid), 'ticked_by_default': bool(grid) and state == 'visible'}
        if grid:
            tname = rules.unique(rules.sanitise(name), used)
            entry['table'] = shrink(rules.build_table(tname, grid, source=name))
            if header_rows and name in header_rows:
                entry['table_if_header_row_can_be_chosen'] = dict(
                    header_row=header_rows[name], **shrink(rules.build_table(tname, grid, header_row=header_rows[name], source=name)))
        out.append(entry)
    return out


def build(root):
    os.makedirs(os.path.join(root, 'expected'), exist_ok=True)
    index = []
    q = lambda ids: sorted(ids, key=lambda s: int(s[1:]))

    for path, delim, header, covers, questions, notes in CSV:
        data = open(os.path.join(root, path), 'rb').read()
        text, enc = rules.decode(data)
        grid = rules.parse_delimited(text, delim)
        table = shrink(rules.build_table(stem_name(path), grid, header=header, source=os.path.basename(path)))
        exp = {'fixture': path, 'covers': covers, 'outcome': 'import',
               'settings': {'encoding': enc, 'delimiter': {',': 'comma', ';': 'semicolon', '\t': 'tab', '|': 'pipe'}[delim], 'first_row_is_header': header},
               'tables': [table], 'open_questions': q(questions), 'notes': notes}
        if path == 'csv/title_rows.csv':
            alt = rules.build_table(stem_name(path), grid, header_row=4, source=os.path.basename(path))
            exp['tables_if_header_row_can_be_chosen'] = [dict(header_line_in_file=5, **alt)]
        if path == 'csv/no_header.csv':
            exp['tables_if_first_row_is_taken_as_header'] = [rules.build_table(stem_name(path), grid, header=True)]
        index.append((path, covers, write(root, path, exp), q(questions)))

    large = os.path.join(root, 'large.csv')
    if os.path.exists(large):
        text, enc = rules.decode(open(large, 'rb').read())
        table = shrink(rules.build_table('large', rules.parse_delimited(text), source='large.csv'))
        exp = {'fixture': 'large.csv', 'covers': '200,000 rows for timing, progress and Cancel. Not stored: tools/gen_csv.py writes it.',
               'outcome': 'import', 'settings': {'encoding': enc, 'delimiter': 'comma', 'first_row_is_header': True},
               'file_bytes': os.path.getsize(large), 'file_sha256': hashlib.sha256(open(large, 'rb').read()).hexdigest(),
               'tables': [table], 'open_questions': [], 'notes': ['Write the file with: python3 tools/gen_csv.py . --large']}
        write(root, 'large.csv', exp)
    index.append(('large.csv', '200,000 rows for timing, progress and Cancel. Not stored: tools/gen_csv.py writes it.', 'large.csv.json', []))

    for path, covers, why in [
        ('csv/empty.csv', 'A file of zero bytes.', 'There is nothing to import. Say so; create no table and no database.'),
        ('csv/wide_2100_columns.csv', '2,100 columns: more than SQLite allows in one table.', 'SQLite stops at 2,000 columns. Refuse with a message that says so; create no table and no database.'),
    ]:
        exp = {'fixture': path, 'covers': covers, 'outcome': 'refuse', 'reason': why, 'open_questions': ['Q17'] if 'wide' in path else [], 'notes': []}
        index.append((path, covers, write(root, path, exp), exp['open_questions']))

    for path, covers, questions, header_rows, notes in EXCEL:
        full = os.path.join(root, path)
        if path == 'excel/formats.xls':
            sheets, charts = [], []
        else:
            sheets, charts = (rules.xlsx_sheets if path.endswith('.xlsx') else rules.xls_sheets)(full)
        if path == 'excel/formats.xls':
            # no formulas here, so the cells equal those of formats.xlsx; times, durations and 1900 dates are
            # easier to read from there. The sheet states come from the .xls itself.
            states = {name: state for name, state, _ in rules.xls_states(full)}
            sheets = [(n, states[n], g) for n, _, g in rules.xlsx_sheets(full + 'x')[0]]
        if 'formats.xls' in path:
            for name, state, grid in sheets:
                if name == 'Dates 1900':
                    for row, iso in zip(grid[1:], ['1900-01-01', '1900-02-28', '1900-02-29', '1900-03-01', '1901-01-01']):
                        row[1] = iso
        exp = {'fixture': path, 'covers': covers, 'outcome': 'import', 'sheets': workbook_tables(sheets, header_rows),
               'chart_sheets_not_listed': charts, 'open_questions': q(questions), 'notes': notes}
        index.append((path, covers, write(root, path, exp), q(questions)))

    sheets = rules.xlsx_sheets(os.path.join(root, 'shopping_db.xlsx'))[0]
    exp = {'fixture': 'shopping_db.xlsx', 'covers': 'The owner\'s real workbook: four sheets, true date cells.', 'outcome': 'import',
           'sheets': workbook_tables(sheets), 'chart_sheets_not_listed': [], 'open_questions': [],
           'notes': ['Plan phase 5 is done when this imports as four tables and the first row of orders has OrderDate 2023-08-05.']}
    index.append(('shopping_db.xlsx', exp['covers'], write(root, 'shopping_db.xlsx', exp), []))

    # ---- files that are not what they claim, or are damaged
    small = [['id', 'name', 'qty'], ['1', 'Mug', '4'], ['2', 'Plate', '2']]
    by_content = [
        ('impostors/html_table.xls', 'An HTML table saved with an .xls extension, as many websites export.', 'html',
         rules.build_table('html_table', [['Order ID', 'Customer', 'Order Date', 'Amount'], ['00123', 'Zoë Müller', '05/08/2023', '£1,234.50'],
                                          ['00124', 'Smith & Sons', '06/08/2023', '£45.00'], ['00125', '', '07/08/2023', '£0.99']]),
         ['SheetJS turns HTML cell text into numbers and dates unless it is told to keep raw text. Read that way, 00123 becomes 123 and 05/08/2023 becomes 8 May 2023. Both break the faithful import rules.']),
        ('impostors/spreadsheetml_2003.xls', 'An "XML Spreadsheet 2003" file with an .xls extension, as some reporting systems export.', 'spreadsheetml',
         rules.build_table('Report', [['Ref', 'Posted', 'Amount'], ['00123', '2023-08-05', 1234.5], ['00124', '2023-08-06', 45]]), []),
        ('impostors/tab_text.xls', 'Tab-separated text with an .xls extension.', 'text',
         rules.build_table('tab_text', [['Ref', 'Item', 'Qty'], ['00123', 'Mug', '4'], ['00124', 'Plate', '2']]),
         ['SheetJS reads this with its own text parser, which also turns 00123 into 123 unless told to keep raw text.']),
        ('impostors/renamed_csv.xlsx', 'A CSV file renamed to .xlsx.', 'text', rules.build_table('renamed_csv', small), []),
        ('impostors/renamed_xlsx.csv', 'An Excel workbook renamed to .csv.', 'xlsx', rules.build_table('Stock', [['id', 'name', 'qty'], [1, 'Mug', 4], [2, 'Plate', 2]]),
         ['Read as text this is binary noise. The first two bytes are PK, the mark of a zip file.']),
    ]
    for path, covers, kind, table, notes in by_content:
        exp = {'fixture': path, 'covers': covers, 'outcome': 'import_by_content_or_refuse', 'real_content': kind,
               'tables_if_read_by_content': [table], 'open_questions': ['Q18'], 'notes': notes}
        index.append((path, covers, write(root, path, exp), ['Q18']))
    quiet = 'SheetJS 0.18.5 does not reject this file: it %s. The importer needs its own check before handing a file to SheetJS.'
    for path, covers, notes in [
            ('impostors/truncated.xlsx', 'A workbook cut off part-way through.', []),
            ('impostors/zero_bytes.xlsx', 'A file of zero bytes with an .xlsx extension.', [quiet % 'returns one empty sheet']),
            ('impostors/random_bytes.xls', 'Meaningless bytes with an .xls extension.', [quiet % 'reads the bytes as text and returns a sheet of noise']),
            ('impostors/password_protected.xlsx', 'A workbook encrypted with a password (the password is sqllab).', [])]:
        exp = {'fixture': path, 'covers': covers, 'outcome': 'refuse',
               'reason': 'The file cannot be read. Say why in plain words, create no table and no database, and leave the page usable.',
               'open_questions': ['Q18'], 'notes': notes}
        index.append((path, covers, write(root, path, exp), ['Q18']))

    # ---- export
    import gen_export
    con = sqlite3.connect('file:%s?mode=ro' % os.path.join(root, 'export', 'export_edge_cases.db'), uri=True)
    goldens = {'basic': 'basic', 'text_edge': 'text_edge', 'number_edge': 'number_edge', 'dates_iso': 'dates_iso',
               'mixed_types': 'mixed_types', 'Order Details': 'Order_Details', 'order': 'order', 'empty_table': 'empty_table', 'big_2000': 'big_2000',
               'sales/2024': 'sales_2024', 'sales_2024': 'sales_2024_2', 'con': 'con',
               'v_basic_summary': 'v_basic_summary', gen_export.LONG_NAME: gen_export.LONG_NAME}
    tables = []
    for (name, kind) in con.execute("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY name"):
        qn = '"%s"' % name.replace('"', '""')
        cur = con.execute('SELECT * FROM %s' % qn)
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()
        entry = {'name': name, 'kind': kind, 'rows': len(rows), 'columns': cols}
        if name in goldens:
            rel = 'export/expected_csv/%s.csv' % goldens[name]
            raw = open(os.path.join(root, rel), 'rb').read()
            entry['expected_csv'] = rel
            entry['expected_csv_bytes'] = len(raw)
            entry['expected_csv_sha256'] = hashlib.sha256(raw).hexdigest()
            # what happens when that CSV is imported again under the import rules
            text, _ = rules.decode(raw)
            back = rules.build_table(goldens[name], rules.parse_delimited(text))
            diffs = []
            for c, col in enumerate(cols):
                kinds = {r[0] for r in con.execute('SELECT DISTINCT typeof(%s) FROM %s' % ('"%s"' % col.replace('"', '""'), qn))} - {'null'}
                was = 'TEXT' if not kinds or 'text' in kinds or 'blob' in kinds else 'INTEGER' if kinds == {'integer'} else 'REAL'
                now = back['columns'][c]['type'] if c < len(back['columns']) else None
                if back['columns'][c]['name'] != col:
                    diffs.append({'column': col, 'change': 'name becomes %s' % back['columns'][c]['name']})
                if was != now:
                    diffs.append({'column': col, 'change': 'type %s becomes %s' % (was, now)})
                for r, row in enumerate(rows):
                    a, b = row[c], back['data'][r][c]
                    if a != b and not (was != now and a is not None and b is not None and str(a) == str(b)):
                        diffs.append({'column': col, 'row': r + 1, 'change': '%r becomes %r' % (a if not isinstance(a, str) or len(a) < 40 else a[:20] + '…', b)})
            entry['after_reimport'] = 'identical' if not diffs else diffs
        tables.append(entry)
    notes = {
        'mixed_types': 'Row 5 holds a BLOB, written as x\'deadbeef\' (Q22). One column holds an integer, a real, text, NULL, an empty string and a BLOB: each value is written by its own storage class.',
        'big_2000': 'Exactly 2,000 rows, more than the results pane shows. The export must hold 2,000 data lines.',
        'text_edge': 'Row 18 is 40,000 characters, longer than one Excel cell can hold (32,767). Rows 12 to 15 start with = + - @ and must stay text in the Excel export.',
        'number_edge': 'Rows 3 to 5 hold integers above 2^53. Read as ordinary JavaScript numbers they are silently rounded.',
        'sales/2024': 'Its cleaned file name is sales_2024, which is also the name of another table (Q24).',
        'con': 'con.csv cannot be created on Windows (Q24).',
        gen_export.LONG_NAME: 'The name is 42 characters. An Excel sheet name allows 31 (Q25).',
        'Order Details': 'Column names are written as stored. One holds a comma and is quoted.',
        'empty_table': 'No rows: the CSV is the header line only.',
    }
    for t in tables:
        if t['name'] in notes:
            t['note'] = notes[t['name']]
    exp = {'fixture': 'export/export_edge_cases.db', 'covers': 'A database of tables chosen to stress the CSV and Excel export.',
           'csv_rules': 'UTF-8 with a byte-order mark; comma; header row; a field is quoted when it holds a comma, a quote, a line break, or a leading or trailing space; NULL is an empty field; CRLF after every record (Q23); numbers as in Q20; a BLOB as x\'<hex>\' (Q22).',
           'zip': 'Exporting every table and view gives 14 entries. Entry names follow Q24.',
           'excel_export': {
               'one_sheet_per_table': True,
               'checks': ['text such as 00123, =SUM(A1:A3), +441632960001 and 2023-08-05 is written as text cells, never as numbers, formulas or dates',
                          'integers and reals are written as number cells; NULL is an empty cell',
                          'integers above 2^53 cannot be held exactly by a number cell: decide whether to write them as text',
                          'the 40,000-character value in text_edge does not fit a cell: decide whether to refuse, cut it short with a warning, or leave that table out',
                          'sheet names are at most 31 characters, hold none of [ ] : * ? / \\ and are unique without regard to case']},
           'tables': tables, 'open_questions': ['Q20', 'Q21', 'Q22', 'Q23', 'Q24', 'Q25', 'Q26'], 'notes': []}
    index.append(('export/export_edge_cases.db', exp['covers'], write(root, 'export', exp), exp['open_questions']))

    with open(os.path.join(root, 'expected', 'open_questions.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump({k: {'title': t, 'question': qq, 'reading_used_here': r} for k, (t, qq, r) in QUESTIONS.items()}, f, indent=1, ensure_ascii=False)
        f.write('\n')
    with open(os.path.join(root, 'expected', 'index.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump([{'fixture': p, 'covers': c, 'expected': 'expected/' + e, 'open_questions': qs} for p, c, e, qs in index], f, indent=1, ensure_ascii=False)
        f.write('\n')
    write_readme(root, index)
    return index


README_HEAD = '''# SQL Lab test fixtures

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
'''

README_TAIL = '''
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
'''


def write_readme(root, index):
    lines = [README_HEAD.rstrip('\n')]
    for k, (title, question, reading) in QUESTIONS.items():
        lines.append('| %s | %s | %s | %s |' % (k, title, question.replace('|', '\\|'), reading.replace('|', '\\|')))
    lines.append(README_TAIL.rstrip('\n'))
    for path, covers, _, qs in index:
        lines.append('| `%s` | %s | %s |' % (path, covers.replace('|', '\\|'), ', '.join(qs)))
    with open(os.path.join(root, 'README.md'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines) + '\n')


if __name__ == '__main__':
    idx = build(sys.argv[1])
    print('expected results written for %d fixtures' % len(idx))
