"""Generate the Excel fixtures.

    python3 gen_excel.py <fixtures dir> [path to the owner's shopping_db.xlsx]

Needs: xlsxwriter, openpyxl, xlwt, msoffcrypto-tool, and LibreOffice (soffice) for the
genuine .xls files, which are made by converting .xlsx workbooks to the binary format.
.xlsx files are written with XlsxWriter so that every formula carries its calculated
value, as a workbook saved by Excel does. formulas_uncached.xlsx is the exception.
"""
import datetime as dt
import io
import os
import shutil
import subprocess
import sys
import tempfile

import xlsxwriter

D = dt.date


def path_for(root, rel):
    p = os.path.join(root, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


def soffice_convert(src, out_dir, flt):
    args = ['--headless', '--convert-to', flt, '--outdir', out_dir, src]
    helper = os.environ.get('SOFFICE_HELPER')
    if helper:
        sys.path.insert(0, helper)
        from office.soffice import run_soffice
        r = run_soffice(args, capture_output=True, text=True, timeout=180)
    else:
        r = subprocess.run(['soffice'] + args, capture_output=True, text=True, timeout=180)
    if r.returncode != 0:
        raise RuntimeError('soffice failed: %s %s' % (r.stdout, r.stderr))


def without_formula_results(src_xlsx, dest_xlsx):
    """Copy a workbook, dropping the stored result of every formula.

    LibreOffice then calculates each formula itself. Given stored results it trusts them, and on
    the way to .xls it writes a text result as the number 0.
    """
    import re
    import zipfile
    cell = re.compile(rb'<c ([^>]*)>(<f[^>]*>.*?</f>|<f[^>]*/>)<v>.*?</v></c>', re.S)

    def fix(m):
        attrs = re.sub(rb'\s*t="[a-z]+"', b'', m.group(1))
        return b'<c ' + attrs + b'>' + m.group(2) + b'</c>'

    with zipfile.ZipFile(src_xlsx) as zin, zipfile.ZipFile(dest_xlsx, 'w', zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename.startswith('xl/worksheets/sheet'):
                data = cell.sub(fix, data)
            zout.writestr(item, data)


def to_xls(src_xlsx, dest_xls, flt='xls:MS Excel 97'):
    tmp = tempfile.mkdtemp()
    try:
        bare = os.path.join(tmp, os.path.basename(src_xlsx))
        without_formula_results(src_xlsx, bare)
        soffice_convert(bare, tmp, flt)
        made = os.path.join(tmp, os.path.splitext(os.path.basename(src_xlsx))[0] + '.xls')
        shutil.move(made, dest_xls)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# --------------------------------------------------------------------------- the messy course workbook
LOOKUP = [('P-100', 'Desk Lamp', 24.99), ('P-101', 'Office Chair', 149.0), ('P-102', 'Monitor Stand', 39.5),
          ('P-103', 'Notebook Set', 7.25), ('P-104', 'Wireless Mouse', 18.0), ('P-105', 'Standing Desk', 329.0)]


def sales_rows():
    """30 order lines: (order id text, date or text, region, product code, qty)."""
    regions = ['North', 'South', 'East', 'West']
    rows = []
    for i in range(30):
        oid = '%06d' % (101 + i)
        date = D(2024, 1, 8) + dt.timedelta(days=11 * i)
        region = regions[i % 4]
        code = LOOKUP[(i * 5) % 6][0]
        qty = 1 + (i * 3) % 7
        rows.append([oid, date, region, code, qty])
    rows[2][2] = 'east'            # lower case
    rows[5][2] = 'South '          # trailing space
    rows[9][2] = None              # blank region
    rows[7][3] = 'P-999'           # not in the lookup: #N/A   (West)
    rows[11][4] = 'two'            # quantity typed as a word: #VALUE!   (West)
    rows[14][4] = None             # blank quantity
    rows[20][1] = '31/02/2024'     # impossible date typed as text
    rows[25][0] = '126 '           # id retyped by hand, zeros lost, trailing space
    return rows


def lookup(code, col):
    for r in LOOKUP:
        if r[0] == code:
            return r[col]
    return '#N/A'


def course_workbook(path):
    wb = xlsxwriter.Workbook(path)
    wb.set_properties({'title': 'Northlight Retail course dataset', 'author': 'SQL Lab test fixture'})
    title = wb.add_format({'bold': True, 'font_size': 14})
    head = wb.add_format({'bold': True, 'bg_color': '#DDEBF7', 'border': 1})
    datef = wb.add_format({'num_format': 'dd/mm/yyyy'})
    money = wb.add_format({'num_format': '£#,##0.00'})
    pct = wb.add_format({'num_format': '0%'})
    bold = wb.add_format({'bold': True})
    boldmoney = wb.add_format({'bold': True, 'num_format': '£#,##0.00'})

    ws = wb.add_worksheet('Read me')
    ws.set_column('A:A', 90)
    for i, line in enumerate(['Northlight Retail — course dataset', '',
                              'Sheet "Sales 2024": one row per order line. Totals are at the bottom.',
                              'Sheet "Customers": one row per customer.',
                              'Sheet "Summary": calculated from the sales sheet. Do not edit.',
                              'Prices come from a hidden lookup sheet.']):
        ws.write_string(i, 0, line, title if i == 0 else None)

    ws = wb.add_worksheet('Sales 2024')
    ws.merge_range('A1:H1', 'Northlight Retail — Sales 2024', title)
    ws.write_string('A2', 'Prepared by Finance · figures in GBP · prices exclude VAT')
    cols = ['Order ID', 'Order Date', 'Region', 'Product Code', 'Product', 'Qty', 'Unit Price', 'Line Total', 'Margin %']
    for c, name in enumerate(cols):
        ws.write_string(3, c, name, head)
    rows = sales_rows()
    first, last = 5, 4 + len(rows)               # Excel row numbers of the data
    qty_sum, total_err, total_sum = 0, None, 0.0
    for i, (oid, date, region, code, qty) in enumerate(rows):
        r = 4 + i
        x = r + 1
        ws.write_string(r, 0, oid)
        if isinstance(date, dt.date):
            ws.write_datetime(r, 1, dt.datetime(date.year, date.month, date.day), datef)
        else:
            ws.write_string(r, 1, date)
        if region is not None:
            ws.write_string(r, 2, region)
        ws.write_string(r, 3, code)
        product, price = lookup(code, 1), lookup(code, 2)
        ws.write_formula(r, 4, '=VLOOKUP(D%d,Lookup!$A$2:$C$7,2,FALSE)' % x, None, product)
        if qty is None:
            pass
        elif isinstance(qty, str):
            ws.write_string(r, 5, qty)
        else:
            ws.write_number(r, 5, qty)
            qty_sum += qty
        ws.write_formula(r, 6, '=VLOOKUP(D%d,Lookup!$A$2:$C$7,3,FALSE)' % x, money, price)
        if price == '#N/A':
            line = '#N/A'
        elif isinstance(qty, str):
            line = '#VALUE!'
        else:
            line = round((qty or 0) * price, 2)
        ws.write_formula(r, 7, '=F%d*G%d' % (x, x), money, line)
        if isinstance(line, str):
            total_err = total_err or line
        else:
            total_sum += line
        ws.write_number(r, 8, 0.25 + (i % 5) * 0.05, pct)
    t = last + 1                                 # a blank row, then the totals row
    ws.write_string(t, 0, 'Total', bold)
    ws.write_formula(t, 5, '=SUM(F%d:F%d)' % (first, last), bold, qty_sum)
    ws.write_formula(t, 7, '=SUM(H%d:H%d)' % (first, last), boldmoney, total_err or round(total_sum, 2))
    ws.write_string(t + 2, 0, 'Note: regions follow the 2023 sales map.')
    ws.freeze_panes(4, 0)
    ws.set_column('A:D', 14)
    ws.set_column('E:E', 18)
    ws.set_column('I:I', None, None, {'hidden': True})

    ws = wb.add_worksheet('Customers')
    ccols = ['Customer ID', 'Name', 'Phone', 'Postcode', 'Joined', 'Credit Limit', 'Active', 'Discount %']
    for c, name in enumerate(ccols):
        ws.write_string(0, c, name, head)
    customers = [
        ('C001', 'Ava Hughes', '07700 900101', 'HD1 3DH', D(2021, 3, 14), 5000, True, 0.10),
        ('C002', 'Ben Carter ', '07700 900102', 'LS1 4AP', D(2021, 11, 2), 2500, True, 0.05),
        ('C003', 'Chloe Ward', '01632 960103', 'YO1 7HH', '13/02/2022', 1000, False, 0),
        ('C004', 'Dev Sharma', '07700 900104', 'M1 1AE', D(2022, 7, 30), 7500.5, True, 0.125),
        ('C005', 'Ella Fox', None, 'S1 2HE', D(2023, 1, 9), None, True, None),
        ('C006', 'Finn Byrne', '07700 900106', 'hu1 1nq', D(2023, 6, 21), 1500, False, 0.05),
        ('C007', 'Gita Rao', '07700 900107', 'BD1 1HU', D(2024, 2, 29), 3000, True, 0.10),
        ('C008', 'Ava Hughes', '07700 900101', 'HD1 3DH', D(2021, 3, 14), 5000, True, 0.10),
    ]
    for r, (cid, name, phone, pc, joined, limit, active, disc) in enumerate(customers, 1):
        ws.write_string(r, 0, cid)
        ws.write_string(r, 1, name)
        if phone:
            ws.write_string(r, 2, phone)
        ws.write_string(r, 3, pc)
        if isinstance(joined, dt.date):
            ws.write_datetime(r, 4, dt.datetime(joined.year, joined.month, joined.day), datef)
        else:
            ws.write_string(r, 4, joined)
        if limit is not None:
            ws.write_number(r, 5, limit, money)
        ws.write_boolean(r, 6, active)
        if disc is not None:
            ws.write_number(r, 7, disc, pct)
    ws.set_column('A:H', 14)

    ws = wb.add_worksheet('Summary')
    ws.write_string('A1', 'Summary by region', title)
    for c, name in enumerate(['Region', 'Orders', 'Revenue']):
        ws.write_string(2, c, name, head)
    rng_c = "'Sales 2024'!$C$%d:$C$%d" % (first, last)
    rng_h = "'Sales 2024'!$H$%d:$H$%d" % (first, last)
    for i, region in enumerate(['North', 'South', 'East', 'West']):
        r = 3 + i
        count, total, err = 0, 0.0, None
        for (oid, date, reg, code, qty) in rows:
            if reg is not None and reg.lower() == region.lower():
                count += 1
                price = lookup(code, 2)
                if price == '#N/A':
                    err = err or '#N/A'
                elif isinstance(qty, str):
                    err = err or '#VALUE!'
                else:
                    total += (qty or 0) * price
        ws.write_string(r, 0, region)
        ws.write_formula(r, 1, '=COUNTIF(%s,A%d)' % (rng_c, r + 1), None, count)
        ws.write_formula(r, 2, '=SUMIF(%s,A%d,%s)' % (rng_c, r + 1, rng_h), money, err or round(total, 2))

    ws = wb.add_worksheet('Lookup')
    for c, name in enumerate(['Product Code', 'Product', 'Unit Price']):
        ws.write_string(0, c, name, head)
    for r, (code, name, price) in enumerate(LOOKUP, 1):
        ws.write_string(r, 0, code)
        ws.write_string(r, 1, name)
        ws.write_number(r, 2, price, money)
    ws.hide()

    ws = wb.add_worksheet('Config')
    for r, (k, v) in enumerate([('setting', 'value'), ('academic_year', '2026/27'), ('dataset_version', '3'),
                                ('answer_key', 'do not share')]):
        ws.write_string(r, 0, k)
        ws.write_string(r, 1, v)
    ws.very_hidden()
    wb.get_worksheet_by_name('Sales 2024').activate()
    wb.close()


# --------------------------------------------------------------------------- layouts
def layouts(path):
    wb = xlsxwriter.Workbook(path)
    title = wb.add_format({'bold': True, 'font_size': 14})
    head = wb.add_format({'bold': True, 'border': 1})
    centre = wb.add_format({'bold': True, 'align': 'center', 'border': 1})
    data = [('North', 'Jul', 120, 15400.5), ('North', 'Aug', 135, 17250.0),
            ('South', 'Jul', 210, 26800.75), ('South', 'Aug', 260, 33859.0)]

    def table(ws, r0, c0, with_total=False):
        for c, h in enumerate(['Region', 'Month', 'Orders', 'Revenue']):
            ws.write_string(r0, c0 + c, h, head)
        for i, row in enumerate(data, 1):
            ws.write_string(r0 + i, c0, row[0])
            ws.write_string(r0 + i, c0 + 1, row[1])
            ws.write_number(r0 + i, c0 + 2, row[2])
            ws.write_number(r0 + i, c0 + 3, row[3])
        if with_total:
            r = r0 + len(data) + 1
            ws.write_string(r, c0, 'Total')
            ws.write_formula(r, c0 + 2, '=SUM(%s:%s)' % (xlsxwriter.utility.xl_rowcol_to_cell(r0 + 1, c0 + 2),
                                                           xlsxwriter.utility.xl_rowcol_to_cell(r - 1, c0 + 2)), None, 725)
            ws.write_formula(r, c0 + 3, '=SUM(%s:%s)' % (xlsxwriter.utility.xl_rowcol_to_cell(r0 + 1, c0 + 3),
                                                           xlsxwriter.utility.xl_rowcol_to_cell(r - 1, c0 + 3)), None, 93310.25)

    ws = wb.add_worksheet('Title above header')
    ws.merge_range('A1:D1', 'Northlight Retail', title)
    ws.write_string('A2', 'Quarterly sales report - Q3 2023')
    ws.write_string('A3', 'Generated 01/10/2023 09:15')
    table(ws, 4, 0, with_total=True)
    ws.write_string(11, 0, 'Source: finance system export')

    ws = wb.add_worksheet('Starts at C5')
    table(ws, 4, 2)

    ws = wb.add_worksheet('Two header rows')
    for c, (h, unit) in enumerate([('Product', ''), ('Weight', '(kg)'), ('Price', '(£)'), ('Stock', '(units)')]):
        ws.write_string(0, c, h, head)
        if unit:
            ws.write_string(1, c, unit)
    for r, row in enumerate([('Mug', 0.35, 6.5, 40), ('Plate', 0.6, 8.0, 25), ('Bowl', 0.45, 5.75, 0)], 2):
        ws.write_string(r, 0, row[0])
        for c in (1, 2, 3):
            ws.write_number(r, c, row[c])

    ws = wb.add_worksheet('Grouped header')
    ws.merge_range('A1:A2', 'Region', centre)
    ws.merge_range('B1:C1', '2023', centre)
    ws.merge_range('D1:E1', '2024', centre)
    for c, h in enumerate(['H1', 'H2', 'H1', 'H2'], 1):
        ws.write_string(1, c, h, head)
    for r, row in enumerate([('North', 10, 12, 14, 15), ('South', 20, 19, 23, 27)], 2):
        ws.write_string(r, 0, row[0])
        for c in range(1, 5):
            ws.write_number(r, c, row[c])

    ws = wb.add_worksheet('Merged categories')
    for c, h in enumerate(['Category', 'Product', 'Price']):
        ws.write_string(0, c, h, head)
    ws.merge_range('A2:A4', 'Kitchen')
    ws.merge_range('A5:A6', 'Office')
    for r, (p, price) in enumerate([('Mug', 6.5), ('Plate', 8.0), ('Bowl', 5.75), ('Desk Lamp', 24.99), ('Stapler', 4.2)], 1):
        ws.write_string(r, 1, p)
        ws.write_number(r, 2, price)

    ws = wb.add_worksheet('Side by side')
    table(ws, 0, 0)
    for c, h in enumerate(['Code', 'Meaning']):
        ws.write_string(0, 5 + c, h, head)
    for r, (k, v) in enumerate([('N', 'North'), ('S', 'South')], 1):
        ws.write_string(r, 5, k)
        ws.write_string(r, 6, v)

    ws = wb.add_worksheet('Blank column and row')
    for c, h in enumerate(['Region', 'Month', None, 'Orders']):
        if h:
            ws.write_string(0, c, h, head)
    for r, row in zip((1, 2, 4), [('North', 'Jul', 120), ('North', 'Aug', 135), ('South', 'Jul', 210)]):
        ws.write_string(r, 0, row[0])
        ws.write_string(r, 1, row[1])
        ws.write_number(r, 3, row[2])
    wb.close()


# --------------------------------------------------------------------------- hidden things
def hidden(path):
    wb = xlsxwriter.Workbook(path)
    ws = wb.add_worksheet('Visible data')
    for c, h in enumerate(['id', 'name', 'secret_cost', 'price']):
        ws.write_string(0, c, h)
    for r in range(1, 11):
        ws.write_number(r, 0, r)
        ws.write_string(r, 1, 'item %d' % r)
        ws.write_number(r, 2, r * 1.5)
        ws.write_number(r, 3, r * 2.25)
    for r in (3, 4, 5):                                   # rows 4-6 hidden
        ws.set_row(r, None, None, {'hidden': True})
    for r in (7, 8):                                      # a collapsed outline group
        ws.set_row(r, None, None, {'level': 1, 'hidden': True})
    ws.set_row(9, None, None, {'collapsed': True})
    ws.set_column('C:C', None, None, {'hidden': True})
    ws = wb.add_worksheet('Hidden sheet')
    ws.write_row(0, 0, ['code', 'label'])
    ws.write_row(1, 0, ['A', 'alpha'])
    ws.write_row(2, 0, ['B', 'beta'])
    ws.hide()
    ws = wb.add_worksheet('Very hidden sheet')
    ws.write_row(0, 0, ['key', 'value'])
    ws.write_row(1, 0, ['answer', '42'])
    ws.very_hidden()
    ws = wb.add_worksheet('Also visible')
    ws.write_row(0, 0, ['x', 'y'])
    ws.write_row(1, 0, [1, 2])
    wb.close()


# --------------------------------------------------------------------------- formulas
FORMULA_ROWS = [('Mug', 4, 6.5), ('Plate', 2, 8.0), ('Bowl', 3, 5.75), ('Jug', 0, 12.0)]
KNOWN = {'Mug': 'Kitchen', 'Plate': 'Kitchen', 'Bowl': 'Kitchen'}
ERRORS = [('#DIV/0!', '=1/0'), ('#N/A', '=NA()'), ('#NAME?', '=NOSUCHFUNCTION(1)'), ('#NULL!', '=SUM(A1 B1)'),
          ('#NUM!', '=SQRT(-1)'), ('#REF!', '=#REF!+1'), ('#VALUE!', '="a"+1')]


def formulas(path):
    wb = xlsxwriter.Workbook(path)
    datef = wb.add_format({'num_format': 'yyyy-mm-dd'})
    ws = wb.add_worksheet('Calc')
    ws.write_row(0, 0, ['Item', 'Qty', 'Price', 'Total', 'Tax', 'Label', 'Due', 'InStock', 'PerUnit', 'Category', 'Blank'])
    for i, (item, qty, price) in enumerate(FORMULA_ROWS):
        r, x = 1 + i, 2 + i
        ws.write_string(r, 0, item)
        ws.write_number(r, 1, qty)
        ws.write_number(r, 2, price)
        ws.write_formula(r, 3, '=B%d*C%d' % (x, x), None, qty * price)
        ws.write_formula(r, 4, '=ROUND(D%d*0.2,2)' % x, None, round(qty * price * 0.2 + 1e-9, 2))
        ws.write_formula(r, 5, '=A%d&" x"&B%d' % (x, x), None, '%s x%d' % (item, qty))
        due = dt.datetime(2024, 1, 10) + dt.timedelta(days=qty)
        ws.write_formula(r, 6, '=DATE(2024,1,10)+B%d' % x, datef, (due - dt.datetime(1899, 12, 30)).days)
        ws.write_formula(r, 7, '=B%d>0' % x, None, qty > 0)
        ws.write_formula(r, 8, '=D%d/B%d' % (x, x), None, price if qty else '#DIV/0!')
        ws.write_formula(r, 9, '=VLOOKUP(A%d,Categories!$A$2:$B$4,2,FALSE)' % x, None, KNOWN.get(item, '#N/A'))
        ws.write_formula(r, 10, '=IF(B%d>100,"big","")' % x, None, '')
    ws.write_string(6, 0, 'Grand total')
    ws.write_array_formula('D7:D7', '{=SUM(B2:B5*C2:C5)}', None, sum(q * p for _, q, p in FORMULA_ROWS))
    ws = wb.add_worksheet('Categories')
    ws.write_row(0, 0, ['Item', 'Category'])
    for r, (k, v) in enumerate(KNOWN.items(), 1):
        ws.write_row(r, 0, [k, v])
    ws = wb.add_worksheet('Errors')
    ws.write_row(0, 0, ['error', 'result'])
    for r, (name, f) in enumerate(ERRORS, 1):
        ws.write_string(r, 0, name)
        ws.write_formula(r, 1, f, None, name)
    wb.close()


def formulas_uncached(path):
    """Written by openpyxl, which stores formulas without their results, as many Python-made files do."""
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = 'Calc'
    ws.append(['Item', 'Qty', 'Price', 'Total', 'Label'])
    for i, (item, qty, price) in enumerate(FORMULA_ROWS):
        x = 2 + i
        ws.append([item, qty, price, '=B%d*C%d' % (x, x), '=A%d&" x"&B%d' % (x, x)])
    ws.append(['Total', '=SUM(B2:B5)', None, '=SUM(D2:D5)', None])
    wb.save(path)


# --------------------------------------------------------------------------- formats
def formats(path, date_1904=False):
    wb = xlsxwriter.Workbook(path, {'date_1904': date_1904})
    f = lambda s: wb.add_format({'num_format': s})
    dates = [dt.datetime(2023, 8, 5), dt.datetime(2023, 12, 31), dt.datetime(2024, 2, 29),
             dt.datetime(2000, 1, 1), dt.datetime(1999, 12, 31), dt.datetime(2030, 6, 15)]
    times = [dt.time(0, 0, 0), dt.time(9, 5, 0), dt.time(14, 30, 0), dt.time(23, 59, 59), dt.time(12, 0, 0), dt.time(6, 45, 30)]
    ws = wb.add_worksheet('Formats')
    if date_1904:
        ws.write_row(0, 0, ['DateOnly', 'DateTime'])
        for r in range(6):
            ws.write_datetime(r + 1, 0, dates[r], f('dd/mm/yyyy'))
            ws.write_datetime(r + 1, 1, dt.datetime.combine(dates[r].date(), times[r]), f('dd/mm/yyyy hh:mm:ss'))
        wb.close()
        return
    cols = ['DateOnly', 'DateTime', 'TimeOnly', 'DateCustom', 'DateAsText', 'Currency', 'Percent',
            'LeadingZeroFormat', 'LeadingZeroText', 'Thousands', 'Scientific', 'NumberAsText', 'Boolean',
            'FloatNoise', 'WholeNumber', 'Accounting', 'Fraction', 'TextWithNewline', 'TrailingSpace',
            'Mixed', 'Duration', 'BigNumber', 'LongDate']
    ws.write_row(0, 0, cols)
    money = [1234.5, 0.99, -20, 1000000, 15.5, 0]
    mixed = [10, 'n/a', 12.5, 7, 'unknown', 3]
    for r in range(6):
        x = r + 1
        ws.write_datetime(x, 0, dates[r], f('dd/mm/yyyy'))
        ws.write_datetime(x, 1, dt.datetime.combine(dates[r].date(), times[r]), f('dd/mm/yyyy hh:mm:ss'))
        ws.write_datetime(x, 2, times[r], f('hh:mm:ss'))
        ws.write_datetime(x, 3, dates[r], f('mmm-yy'))
        ws.write_string(x, 4, dates[r].strftime('%d/%m/%Y'))
        ws.write_number(x, 5, money[r], f('£#,##0.00'))
        ws.write_number(x, 6, [0.125, 0.5, 1, 0, 0.0725, 2.5][r], f('0.0%'))
        ws.write_number(x, 7, [123, 7, 45678, 0, 99, 1][r], f('00000'))
        ws.write_string(x, 8, ['00123', '00007', '45678', '00000', '00099', '00001'][r])
        ws.write_number(x, 9, [1234567, 1000, 999, 25000000, 12, 0][r], f('#,##0'))
        ws.write_number(x, 10, [12345.678, 0.00012, 6.02e23, 1, 250, 3.5e-9][r], f('0.00E+00'))
        ws.write_string(x, 11, ['42', '7', '1000', '0', '15', '8'][r])
        ws.write_boolean(x, 12, r % 2 == 0)
        ws.write_number(x, 13, [0.1 + 0.2, 1 / 3, 2 / 3, 0.1, 1.1 * 3, 100 / 7][r])
        ws.write_number(x, 14, [25.0, 3.0, 100.0, 0.0, 7.0, 12.0][r])
        ws.write_number(x, 15, [-1234.5, 250, -0.5, 1000, 0, 75.25][r],
                        f('_-£* #,##0.00_-;-£* #,##0.00_-;_-£* "-"??_-;_-@_-'))
        ws.write_number(x, 16, [0.5, 0.25, 1.75, 0.125, 2.5, 0.2][r], f('# ?/?'))
        ws.write_string(x, 17, 'line one\nline two %d' % x)
        ws.write_string(x, 18, ['North ', ' South', 'East', 'West  ', ' Mid ', 'Wales'][r])
        if isinstance(mixed[r], str):
            ws.write_string(x, 19, mixed[r])
        else:
            ws.write_number(x, 19, mixed[r])
        ws.write_number(x, 20, [1.25, 0.5, 0.0416666666666667, 2, 0.75, 1.5][r], f('[h]:mm:ss'))
        ws.write_number(x, 21, [12345678901234567890, 1e15, 123456789012345, 9007199254740993, 1, 2][r], f('0'))
        ws.write_datetime(x, 22, dates[r], f('[$-F800]dddd, mmmm dd, yyyy'))
    ws = wb.add_worksheet('Dates 1900')
    ws.write_row(0, 0, ['serial', 'as_date'])
    for r, serial in enumerate([1, 59, 60, 61, 367], 1):
        ws.write_number(r, 0, serial)
        ws.write_number(r, 1, serial, f('yyyy-mm-dd'))
    wb.close()


# --------------------------------------------------------------------------- names, empty sheets, chart sheet
SHEET_NAMES = ['Sales 2024', 'Sales-2024', '2024', 'Order', 'Données', 'Q1 (final)',
               'a_very_long_sheet_name_31_chars', '😀 data', 'sales_2024']


def sheet_names(path):
    wb = xlsxwriter.Workbook(path)
    for i, name in enumerate(SHEET_NAMES):
        assert len(name) <= 31
        ws = wb.add_worksheet(name)
        ws.write_row(0, 0, ['id', 'sheet'])
        ws.write_row(1, 0, [i + 1, name])
    wb.close()


def empty_sheets(path):
    wb = xlsxwriter.Workbook(path)
    fill = wb.add_format({'bg_color': '#FFF2CC', 'border': 1})
    ws = wb.add_worksheet('Data')
    ws.write_row(0, 0, ['id', 'name'])
    ws.write_row(1, 0, [1, 'Ann'])
    ws.write_row(2, 0, [2, 'Bob'])
    wb.add_worksheet('Empty')
    ws = wb.add_worksheet('Header only')
    ws.write_row(0, 0, ['id', 'name', 'joined'])
    ws = wb.add_worksheet('Formatting only')
    for r in range(3):
        for c in range(3):
            ws.write_blank(r, c, None, fill)
    ws = wb.add_worksheet('Single cell')
    ws.write_string('A1', 'just one value')
    ws = wb.add_worksheet('Stray cell')
    ws.write_row(0, 0, ['id', 'name', 'qty'])
    ws.write_row(1, 0, [1, 'Mug', 4])
    ws.write_row(2, 0, [2, 'Plate', 6])
    ws.write_string('H20', 'reviewed')
    wb.close()


def chart_sheet(path):
    wb = xlsxwriter.Workbook(path)
    ws = wb.add_worksheet('Data')
    ws.write_row(0, 0, ['month', 'orders'])
    for r, (m, n) in enumerate([('Jan', 18), ('Feb', 13), ('Mar', 19)], 1):
        ws.write_row(r, 0, [m, n])
    cs = wb.add_chartsheet('Orders chart')
    chart = wb.add_chart({'type': 'column'})
    chart.add_series({'categories': '=Data!$A$2:$A$4', 'values': '=Data!$B$2:$B$4', 'name': 'Orders'})
    cs.set_chart(chart)
    wb.close()


def xlwt_written(path):
    """A second, independent writer of the binary format. xlwt stores formulas without results."""
    import xlwt
    wb = xlwt.Workbook(encoding='utf-8')
    datef = xlwt.easyxf(num_format_str='DD/MM/YYYY')
    money = xlwt.easyxf(num_format_str='"£"#,##0.00')
    ws = wb.add_sheet('Data')
    for c, h in enumerate(['Ref', 'Item', 'Ordered', 'Qty', 'Price', 'Total', 'Paid']):
        ws.write(0, c, h)
    for r, (ref, item, d, qty, price, paid) in enumerate([('00123', 'Mug', D(2023, 8, 5), 4, 6.5, True),
                                                           ('00124', 'Plate ', D(2023, 8, 6), 2, 8.0, False),
                                                           ('00125', 'Café set', D(2023, 8, 7), 1, 24.99, True)], 1):
        ws.write(r, 0, ref)
        ws.write(r, 1, item)
        ws.write(r, 2, d, datef)
        ws.write(r, 3, qty)
        ws.write(r, 4, price, money)
        ws.write(r, 5, xlwt.Formula('D%d*E%d' % (r + 1, r + 1)), money)
        ws.write(r, 6, paid)
    hs = wb.add_sheet('Hidden lookup')
    hs.write(0, 0, 'code')
    hs.write(0, 1, 'label')
    hs.write(1, 0, 'A')
    hs.write(1, 1, 'alpha')
    hs.visibility = 1
    vs = wb.add_sheet('Very hidden')
    vs.write(0, 0, 'key')
    vs.write(1, 0, 'answer')
    vs.visibility = 2
    wb.save(path)


# --------------------------------------------------------------------------- impostors and broken files
HTML_XLS = '''<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head>
<body>
<table border="1">
<tr><th>Order ID</th><th>Customer</th><th>Order Date</th><th>Amount</th></tr>
<tr><td>00123</td><td>Zoë Müller</td><td>05/08/2023</td><td>£1,234.50</td></tr>
<tr><td>00124</td><td>Smith &amp; Sons</td><td>06/08/2023</td><td>£45.00</td></tr>
<tr><td>00125</td><td></td><td>07/08/2023</td><td>£0.99</td></tr>
</table>
</body>
</html>
'''

SPREADSHEETML = '''<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles><Style ss:ID="d"><NumberFormat ss:Format="Short Date"/></Style></Styles>
 <Worksheet ss:Name="Report">
  <Table>
   <Row><Cell><Data ss:Type="String">Ref</Data></Cell><Cell><Data ss:Type="String">Posted</Data></Cell><Cell><Data ss:Type="String">Amount</Data></Cell></Row>
   <Row><Cell><Data ss:Type="String">00123</Data></Cell><Cell ss:StyleID="d"><Data ss:Type="DateTime">2023-08-05T00:00:00.000</Data></Cell><Cell><Data ss:Type="Number">1234.5</Data></Cell></Row>
   <Row><Cell><Data ss:Type="String">00124</Data></Cell><Cell ss:StyleID="d"><Data ss:Type="DateTime">2023-08-06T00:00:00.000</Data></Cell><Cell><Data ss:Type="Number">45</Data></Cell></Row>
  </Table>
 </Worksheet>
</Workbook>
'''


def impostors(root):
    w = lambda rel: path_for(root, 'impostors/' + rel)
    open(w('html_table.xls'), 'w', encoding='utf-8', newline='\n').write(HTML_XLS)
    open(w('spreadsheetml_2003.xls'), 'w', encoding='utf-8', newline='\n').write(SPREADSHEETML)
    open(w('tab_text.xls'), 'wb').write('Ref\tItem\tQty\r\n00123\tMug\t4\r\n00124\tPlate\t2\r\n'.encode('utf-8'))
    open(w('renamed_csv.xlsx'), 'wb').write(b'id,name,qty\r\n1,Mug,4\r\n2,Plate,2\r\n')
    small = w('_small.xlsx')
    wb = xlsxwriter.Workbook(small)
    ws = wb.add_worksheet('Stock')
    ws.write_row(0, 0, ['id', 'name', 'qty'])
    ws.write_row(1, 0, [1, 'Mug', 4])
    ws.write_row(2, 0, [2, 'Plate', 2])
    wb.close()
    data = open(small, 'rb').read()
    open(w('renamed_xlsx.csv'), 'wb').write(data)
    open(w('truncated.xlsx'), 'wb').write(data[:len(data) * 3 // 5])
    open(w('zero_bytes.xlsx'), 'wb').write(b'')
    open(w('random_bytes.xls'), 'wb').write(bytes((i * 73 + 41) % 256 for i in range(4096)))
    from msoffcrypto.format.ooxml import OOXMLFile
    with open(small, 'rb') as fin, open(w('password_protected.xlsx'), 'wb') as fout:
        OOXMLFile(fin).encrypt('sqllab', fout)
    os.remove(small)


def build(root, shopping=None):
    x = lambda rel: path_for(root, 'excel/' + rel)
    course_workbook(x('messy_course_workbook.xlsx'))
    layouts(x('title_rows_and_layouts.xlsx'))
    hidden(x('hidden.xlsx'))
    formulas(x('formulas.xlsx'))
    formulas_uncached(x('formulas_uncached.xlsx'))
    formats(x('formats.xlsx'))
    formats(x('dates_1904.xlsx'), date_1904=True)
    sheet_names(x('sheet_names.xlsx'))
    empty_sheets(x('empty_sheets.xlsx'))
    chart_sheet(x('chart_sheet.xlsx'))
    xlwt_written(x('xlwt_written.xls'))
    impostors(root)
    # genuine binary .xls files, converted by LibreOffice
    to_xls(x('messy_course_workbook.xlsx'), x('messy_course_workbook.xls'))
    to_xls(x('formats.xlsx'), x('formats.xls'))
    if shopping:
        shutil.copyfile(shopping, os.path.join(root, 'shopping_db.xlsx'))
        to_xls(os.path.join(root, 'shopping_db.xlsx'), x('shopping_db.xls'))


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
    print('excel fixtures written')
