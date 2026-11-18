"""A plain reference reading of the plan's import and export rules (plan sections 3 and 5).

This is not the product code. It exists so the expected results in ../expected/ are computed,
not typed by hand. Where the plan is silent, the choice made here is listed as an open question
in ../README.md and in ../expected/open_questions.json.
"""
import csv
import datetime as dt
import decimal
import io
import re

# Plan section 3, rule 2: a plain number is written with the digits 0 to 9 (not the digits of
# another script, which \d would also take), and -0 is not one: stored as a number it would
# lose its sign.
INT_RE = re.compile(r'-?(0|[1-9][0-9]*)\Z')
REAL_RE = re.compile(r'-?(0|[1-9][0-9]*)\.[0-9]+\Z')


def is_int(s):
    return bool(INT_RE.match(s)) and s != '-0' and len(s.lstrip('-')) <= 15


def is_real(s):
    return bool(REAL_RE.match(s))


# ---------------------------------------------------------------- text files
def decode(data):
    """Plan section 3, Encoding. Returns (text, encoding name)."""
    if data[:3] == b'\xef\xbb\xbf':
        return data[3:].decode('utf-8'), 'utf-8 with BOM'
    if data[:2] == b'\xff\xfe':
        return data[2:].decode('utf-16-le'), 'utf-16le'
    if data[:2] == b'\xfe\xff':
        return data[2:].decode('utf-16-be'), 'utf-16be'
    try:
        return data.decode('utf-8'), 'utf-8'
    except UnicodeDecodeError:
        return data.decode('cp1252'), 'windows-1252'


def parse_delimited(text, delimiter=','):
    """Rows of fields. Completely empty lines are skipped; quoted line breaks are kept."""
    reader = csv.reader(io.StringIO(text, newline=''), delimiter=delimiter, quotechar='"', doublequote=True)
    return [row for row in reader if row != []]


# ---------------------------------------------------------------- names
def sanitise(name):
    s = re.sub(r'[^A-Za-z0-9_]+', '_', name)
    if s and s[0].isdigit():
        s = 'c_' + s
    return s


def unique(name, used):
    out, n = name, 2
    while out.lower() in used:
        out = '%s_%d' % (name, n)
        n += 1
    used.add(out.lower())
    return out


def column_names(header, width):
    """header: list of original header texts (may be shorter than width), or None for no header row."""
    used, names = set(), []
    for i in range(width):
        if header is None:
            original, base = None, 'column_%d' % (i + 1)
        elif i >= len(header):
            original, base = None, 'extra_%d' % (i - len(header) + 1)
        else:
            original = header[i]
            base = 'column_%d' % (i + 1) if (original or '').strip() == '' else sanitise(original)
        names.append((unique(base, used), original))
    return names


# ---------------------------------------------------------------- typing
def kind(v):
    """'int', 'real' or 'text' for one non-empty value.

    Text is judged by how it is written. A spreadsheet's numeric cell is a number whatever its size.
    """
    if isinstance(v, (int, float)):
        return 'int' if float(v).is_integer() and abs(v) < 1e15 else 'real'
    if is_int(v):
        return 'int'
    return 'real' if is_real(v) else 'text'


def column_type(values):
    kinds = {kind(v) for v in values if v is not None}
    if not kinds or 'text' in kinds:
        return 'TEXT'
    return 'INTEGER' if kinds == {'int'} else 'REAL'


def blocker(values):
    """For a TEXT column where at least half the values are plain numbers: the first value that is not."""
    vals = [v for v in values if v is not None]
    plain = [v for v in vals if kind(v) != 'text']
    if vals and len(plain) * 2 >= len(vals) and len(plain) < len(vals):
        return next(v for v in vals if kind(v) == 'text')
    return None


def stored(v, ctype):
    if v is None:
        return None
    if ctype == 'INTEGER':
        return int(v)
    if ctype == 'REAL':
        return float(v)
    return plain_number(v) if isinstance(v, (int, float)) else v


def build_table(name, grid, header=True, header_row=1, source=None):
    """grid: rows of cells as written: text, a number (spreadsheets only), or '' / None for empty."""
    grid = [[(c if c not in ('', None) else None) for c in row] for row in grid]
    if header:
        head = [('' if c is None else c if isinstance(c, str) else plain_number(c)) for c in grid[header_row - 1]]
        body = grid[header_row:]
    else:
        head, body = None, grid
    width = max([len(head or [])] + [len(r) for r in body])
    names = column_names(head, width)
    body = [r + [None] * (width - len(r)) for r in body]
    columns, typed = [], [[] for _ in body]
    for i, (col, original) in enumerate(names):
        values = [r[i] for r in body]
        ctype = column_type(values)
        entry = {'name': col, 'type': ctype, 'nulls': sum(v is None for v in values)}
        if original is not None and original != col:
            entry['original'] = original
        if ctype == 'TEXT' and blocker(values) is not None:
            entry['report_example'] = blocker(values)
        columns.append(entry)
        for row, v in zip(typed, values):
            row.append(stored(v, ctype))
    out = {'name': name, 'rows': len(body), 'columns': columns, 'data': typed}
    if source:
        out['source'] = source
    return out


# ---------------------------------------------------------------- spreadsheet cells, as written
def plain_number(v):
    """A number written out in full: no exponent, no trailing zeros."""
    if isinstance(v, int):
        return str(v)
    s = format(decimal.Decimal(repr(v)), 'f')
    if '.' in s:
        s = s.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def as_written(v):
    if v is None:
        return None
    if isinstance(v, bool):
        return 'TRUE' if v else 'FALSE'
    if isinstance(v, dt.datetime):
        if v.microsecond >= 500000:
            v += dt.timedelta(seconds=1)
        v = v.replace(microsecond=0)
        return v.strftime('%Y-%m-%d') if v.time() == dt.time() else v.strftime('%Y-%m-%d %H:%M:%S')
    if isinstance(v, dt.date):
        return v.isoformat()
    if isinstance(v, dt.time):
        return v.strftime('%H:%M:%S')
    if isinstance(v, dt.timedelta):
        total = int(round(v.total_seconds()))
        return '%d:%02d:%02d' % (total // 3600, total % 3600 // 60, total % 60)
    if isinstance(v, (int, float)):
        return v
    return v if v != '' else None


def value_box(rows):
    """Trim a sheet to the smallest rectangle that holds every value. Formatting-only cells do not count."""
    filled = [(r, c) for r, row in enumerate(rows) for c, v in enumerate(row) if v is not None]
    if not filled:
        return []
    r0, r1 = min(r for r, _ in filled), max(r for r, _ in filled)
    c0, c1 = min(c for _, c in filled), max(c for _, c in filled)
    return [[(row[c] if c < len(row) else None) for c in range(c0, c1 + 1)] for row in rows[r0:r1 + 1]]


def xlsx_sheets(path):
    """[(name, state, grid)] for worksheets, plus the names of chart sheets."""
    from openpyxl import load_workbook
    wb = load_workbook(path, data_only=True)
    out = []
    for ws in wb.worksheets:
        rows = [[as_written(c) for c in row] for row in ws.iter_rows(min_row=1, min_col=1, values_only=True)]
        out.append((ws.title, ws.sheet_state, value_box(rows)))
    return out, [cs.title for cs in wb.chartsheets]


def xls_sheets(path):
    """The same for a binary .xls, for files whose date cells are all on or after 1 March 1900."""
    import xlrd
    wb = xlrd.open_workbook(path)
    states = {0: 'visible', 1: 'hidden', 2: 'veryHidden'}
    out = []
    for sh in wb.sheets():
        rows = []
        for r in range(sh.nrows):
            row = []
            for cell in sh.row(r):
                v = cell.value
                if cell.ctype == 0 or v == '':
                    v = None
                elif cell.ctype == 3:
                    v = as_written(xlrd.xldate_as_datetime(v, wb.datemode))
                elif cell.ctype == 4:
                    v = as_written(bool(v))
                elif cell.ctype == 5:
                    v = xlrd.error_text_from_code[v]
                else:
                    v = as_written(v)
                row.append(v)
            rows.append(row)
        out.append((sh.name, states[sh.visibility], value_box(rows)))
    return out, []


def xls_states(path):
    import xlrd
    wb = xlrd.open_workbook(path)
    return [(sh.name, {0: 'visible', 1: 'hidden', 2: 'veryHidden'}[sh.visibility], None) for sh in wb.sheets()]


# ---------------------------------------------------------------- CSV export (plan section 5)
def export_number(v):
    if isinstance(v, int):
        return str(v)
    if v in (float('inf'), float('-inf')):
        # no digits can write it: the word the results pane shows (plan section 9, decided in Phase 3)
        return 'Infinity' if v > 0 else '-Infinity'
    s = format(decimal.Decimal(repr(v)), 'f')
    return s if '.' in s else s + '.0'


def export_field(v):
    if v is None:
        return ''
    if isinstance(v, (int, float)):
        return export_number(v)
    if isinstance(v, (bytes, bytearray)):
        return "x'%s'" % bytes(v).hex()   # as js/lab/cell-text.js writes a BLOB (plan section 10, Q22)
    if v != v.strip(' ') or any(ch in v for ch in ',"\r\n'):
        return '"' + v.replace('"', '""') + '"'
    return v


def export_csv(header, rows):
    """UTF-8 with a byte-order mark, comma, header row, CRLF after every record."""
    lines = [','.join(export_field(h) for h in header)]
    lines += [','.join(export_field(v) for v in row) for row in rows]
    return b'\xef\xbb\xbf' + ('\r\n'.join(lines) + '\r\n').encode('utf-8')
