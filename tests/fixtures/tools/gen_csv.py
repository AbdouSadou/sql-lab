"""Generate the CSV and text fixtures.

    python3 gen_csv.py <fixtures dir> [--large]

Everything is deterministic. --large also writes large.csv (200,000 rows, about 12 MB).
"""
import csv
import io
import os
import sys


def write_bytes(root, rel, data):
    path = os.path.join(root, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(data)
    return path


def to_csv(rows, delimiter=',', eol='\r\n', final_eol=True):
    buf = io.StringIO(newline='')
    w = csv.writer(buf, delimiter=delimiter, lineterminator=eol, quoting=csv.QUOTE_MINIMAL)
    for r in rows:
        w.writerow(r)
    text = buf.getvalue()
    if not final_eol and text.endswith(eol):
        text = text[:-len(eol)]
    return text


def messy_sales():
    head = ['Order ID', 'Customer Name', 'Order Date', 'Amount (£)', 'Quantity', 'Unit Price', 'Discount',
            'Postcode', 'Phone', 'Weight (kg)', 'Units In Stock', 'Notes']
    rows = [
        ['00123', 'Smith, John', '05/08/2023', '£1,234.50', '3', '411.50', '10%', 'HD1 3DH', '07700 900123', '2.5', '120', 'Repeat customer'],
        ['00124', 'Aisha Khan  ', '06/08/2023', '£45.00', '1', '45.00', '', 'LS1 4AP', '07700 900456', '0.75', '85', ''],
        ['00125', "O'Brien & Sons", '13/08/2023', '£310.00', '2', '155.00', '5%', 'YO1 7HH', '01632 960001', '12', '1,200', 'Said: "deliver before noon"'],
        ['00126', 'María José Fernández', '14/08/2023', '£89.99', '1', '89.99', '0%', 'M1 1AE', '07700 900789', 'N/A', '40', 'Leave with neighbour\nat number 12'],
        ['00127', '  Li Wei', '15/08/2023', '£15.50', '', '15.50', '', 'S1 2HE', '', '0.2', '15', ''],
        ['00128', 'Tom Baker', '31/08/2023', '£2,050.00', '5', '410.00', '15%', 'hd1 3dh ', '07700 900321', '3.1', '0', 'Postcode typed in lower case'],
        ['00129', 'Priya Patel', '01/09/2023', '-£20.00', '-1', '20.00', '', 'BD1 1HU', '07700 900654', '0.5', '60', 'Refund'],
        ['00130', 'Smith, John', '2023-09-04', '£410.00', '1', '410.00', '10%', 'HD1 3DH', '07700 900123', '2.5', '119', 'Date typed in ISO form'],
        ['00131', 'ACME Ltd', '05/09/2023', '£1,000', '10', '100', '0%', 'WF1 2TB', '+44 1632 960002', '10.0', '9', 'Unit price has no decimals'],
        ['00132', 'Aisha Khan', '7/9/2023', '£45.00', '1', '45.00', '', 'LS1 4AP', '07700 900456', '0.75', '84', 'Date typed without leading zeros'],
        ['00132', 'Aisha Khan', '7/9/2023', '£45.00', '1', '45.00', '', 'LS1 4AP', '07700 900456', '0.75', '84', 'Date typed without leading zeros'],
        ['00133', 'Zoë Müller', '11/09/2023', '£75.25', '2', '37.625', '', 'HX1 1UJ', '07700 900987', '1.25', '33', 'Accented name'],
        ['00134', 'Noah Williams', '12/09/2023', '', '', '', '', '', '', '', '', ''],
        ['00135', 'Emma Jones', '13/09/2023', '£60.00'],
        ['00136', 'Oliver Brown', '14/09/2023', '£120.00', '2', '60.00', '5%', 'HU1 1NQ', '07700 900111', '4', '25', 'Two notes', 'second note in an extra field'],
        ['00137', 'Grace Taylor', '15/09/2023', '£ 35.00', '1', '35.00', '', 'DN1 1AA', '07700 900222', '0.4', 'n/a', 'Space after the pound sign'],
        ['00138', 'Harry Evans', '18/09/2023', '£250.00', '4', '62.50', '5%', 'HG1 1BG', '07700 900333', '6', '48', ''],
        ['00139', 'Isla Roberts', '19/09/2023', '£18.00', '2', '9.00', '', 'BB1 1AA', '07700 900444', '0.3', '200', ''],
        ['00140', 'Jack Walker', '20/09/2023', '£999.99', '1', '999.99', '0%', 'OL1 1AA', '07700 900555', '15.5', '3', 'Last one in stock'],
        ['00141', 'Sophie Wright', '21/09/2023', '£64.00', '8', '8.00', '', 'WA1 1AA', '07700 900666', '1.6', '310', ''],
        ['00142', 'George Hall', '30/09/2023', '£132.75', '3', '44.25', '10%', 'CH1 1AA', '07700 900777', '2.25', '77', ''],
        ['00143', 'Mia Green', '31/09/2023', '£27.00', '3', '9.00', '', 'PR1 1AA', '07700 900888', '0.45', '199', '31 September does not exist'],
    ]
    return to_csv([head] + rows).encode('utf-8')


def windows1252():
    rows = [
        ['Product', 'Price', 'Café', 'Note'],
        ['Crème brûlée', '£4.50', 'Café Rouge', '“Best seller”'],
        ['Jalapeño bites', '£3.25', 'El Niño', 'Costs €3 abroad'],
        ['Smörgåsbord', '£12.00', 'Björk’s', 'Naïve façade — déjà vu'],
        ['Plain item', '£1.00', 'None', 'ASCII only'],
    ]
    return to_csv(rows).encode('cp1252')


def semicolon():
    text = ('Produkt;Preis;Menge;Datum;Beschreibung\n'
            'Kaffee;12,50;3;05.08.2023;"Bohnen; ganz"\n'
            'Tee;4,00;10;06.08.2023;Schwarz, lose\n'
            'Zucker;1,25;;07.08.2023;\n'
            'Milch;0,99;24;08.08.2023;"1,5 % Fett"\n'
            'Brot;2,10;6;09.08.2023;Vollkorn, geschnitten, 500 g\n')
    return text.encode('utf-8')


PEOPLE = [
    ['id', 'name', 'city', 'balance'],
    ['1', 'Chloé Dubois', 'Leeds', '£120.50'],
    ['2', 'Søren Østergaard', 'York', '£0.00'],
    ['3', 'Zoë Müller', 'Hull', '£75.25'],
]


def types_csv():
    cols = [
        ('int_plain', ['1', '22', '-5', '0', '', '123456789012345']),
        ('int_16_digits', ['1', '2', '3', '4', '5', '1234567890123456']),
        ('int_leading_zero', ['1', '2', '007', '4', '5', '6']),
        ('int_plus_sign', ['1', '2', '+3', '4', '5', '6']),
        ('int_with_space', ['1', '2', ' 3', '4', '5', '6']),
        ('real_plain', ['1.5', '0.25', '-3.0', '10.00', '', '2.75']),
        ('real_and_int', ['1.5', '2', '3', '4.25', '5', '6']),
        ('real_exponent', ['1.5', '2e3', '3.0', '4.0', '5.0', '6.0']),
        ('real_thousands', ['1,234.5', '2.0', '3.0', '4.0', '5.0', '6.0']),
        ('real_decimal_comma', ['1,5', '2,25', '3,0', '4,75', '5,5', '6,1']),
        ('real_currency', ['£1.50', '2.00', '3.00', '4.00', '5.00', '6.00']),
        ('real_percent', ['15%', '20%', '25%', '30%', '35%', '40%']),
        ('real_no_leading_digit', ['.5', '1.5', '2.5', '3.5', '4.5', '5.5']),
        ('real_trailing_point', ['5.', '1.5', '2.5', '3.5', '4.5', '5.5']),
        ('bool_words', ['TRUE', 'FALSE', 'true', 'false', 'True', 'False']),
        ('null_words', ['NULL', 'NA', 'N/A', '-', 'n/a', 'null']),
        ('all_blank', ['', '', '', '', '', '']),
        ('spaces_only', ['', '   ', '', '', '', '']),
        ('date_iso', ['2023-08-05', '2023-08-06', '2023-08-07', '2023-08-08', '2023-08-09', '2023-08-10']),
        ('date_uk', ['05/08/2023', '06/08/2023', '07/08/2023', '08/08/2023', '09/08/2023', '10/08/2023']),
        ('neg_parentheses', ['(100)', '200', '300', '400', '500', '600']),
        ('mixed_text', ['1', '2', 'three', '4', '5', '6']),
    ]
    rows = [[c[0] for c in cols]] + [[c[1][i] for c in cols] for i in range(6)]
    return to_csv(rows, eol='\n').encode('utf-8')


def quotes_and_newlines():
    rows = [
        ['id', 'text', 'comment'],
        ['1', 'Line one\nLine two', 'line feed inside quotes'],
        ['2', 'Windows\r\nbreak', 'carriage return and line feed inside quotes'],
        ['3', 'He said "hello"', 'doubled quotes'],
        ['4', 'a,b,c', 'commas inside quotes'],
        ['5', '  padded  ', 'leading and trailing spaces, not quoted'],
        ['6', '=SUM(A1:A3)', 'starts with an equals sign'],
        ['7', '', 'empty field'],
        ['8', '😀 emoji 日本語 العربية', 'characters outside Latin-1'],
        ['9', 'x' * 10000, 'ten thousand characters'],
        ['10', "it's 'single' quoted", 'apostrophes are ordinary characters'],
        ['11', 'tab\there', 'tab inside a field'],
        ['12', '5" nails', 'a quote in the middle of a field'],
        ['13', 'last row', 'no line ending after this row'],
    ]
    text = to_csv(rows, eol='\n', final_eol=False)
    # row 7: a quoted empty field, written by hand; row 12: unquoted field with a stray quote
    text = text.replace('\n7,,empty field', '\n7,"",quoted empty field')
    text = text.replace('\n12,"5"" nails",', '\n12,5" nails,')
    assert '7,"",quoted' in text and '12,5" nails,' in text
    return text.encode('utf-8')


def header_names():
    head = ['Name', 'name', 'NAME', 'Name_2', '', 'Order', 'Group', '2023 Sales', 'Unit Price (£)', '% Change',
            'Café', '  City  ', '###', 'first.name', 'select', '']
    r1 = ['a', 'b', 'c', 'd', 'e', '1', 'g', '100', '9.99', '5%', 'x', 'Leeds', 'z', 'Ann', 's', 'last']
    r2 = ['a2', 'b2', 'c2', 'd2', '', '2', 'g2', '200', '19.99', '-2%', 'y', 'York', 'z2', 'Bob', 's2', '']
    return to_csv([head, r1, r2], eol='\n').encode('utf-8')


def title_rows():
    text = ('Northlight Retail\r\n'
            'Quarterly sales report - Q3 2023\r\n'
            'Generated 01/10/2023 09:15\r\n'
            '\r\n'
            'Region,Month,Orders,Revenue\r\n'
            'North,Jul,120,15400.50\r\n'
            'North,Aug,135,17250.00\r\n'
            'South,Jul,210,26800.75\r\n'
            'South,Aug,260,33859.00\r\n'
            'Total,,725,93310.25\r\n'
            '\r\n'
            'Source: finance system export\r\n')
    return text.encode('utf-8')


def late_type_change():
    lines = ['id,qty,price,code']
    for i in range(1, 5001):
        qty = '12 units' if i == 4990 else str(1 + i % 9)
        price = '19.99' if i == 4995 else str(5 + i % 40)
        code = '007' if i == 5000 else str(100 + i % 900)
        lines.append('%d,%s,%s,%s' % (i, qty, price, code))
    return ('\n'.join(lines) + '\n').encode('utf-8')


def large_csv():
    regions = ['North', 'South', 'East', 'West', 'Scotland', 'Wales']
    out = io.StringIO()
    out.write('order_id,order_date,region,customer_ref,quantity,unit_price,note\r\n')
    for i in range(1, 200001):
        d = 1 + (i * 7) % 28
        m = 1 + (i * 3) % 12
        out.write('%d,2024-%02d-%02d,%s,C%05d,%d,%d.%02d,%s\r\n' % (
            i, m, d, regions[i % 6], (i * 37) % 4000, 1 + i % 12, 3 + i % 250, (i * 17) % 100,
            'gift' if i % 50 == 0 else ''))
    return out.getvalue().encode('utf-8')


def build(root, large=False):
    w = lambda rel, data: write_bytes(root, rel, data)
    # ---- the files the plan names
    w('messy_sales.csv', messy_sales())
    w('windows1252.csv', windows1252())
    w('semicolon.csv', semicolon())
    # ---- encodings
    people = to_csv(PEOPLE, eol='\r\n')
    w('csv/utf8_bom.csv', b'\xef\xbb\xbf' + people.encode('utf-8'))
    w('csv/utf16le_bom.txt', b'\xff\xfe' + to_csv(PEOPLE, delimiter='\t').encode('utf-16-le'))
    w('csv/utf16be_bom.csv', b'\xfe\xff' + people.encode('utf-16-be'))
    # ---- delimiters
    w('csv/tab_delimited.tsv', ('sku\tdescription\tprice\tstock\n'
                                'A-100\tMug, large, blue\t6.50\t40\n'
                                'A-101\t"Tea\ttowel"\t3.25\t0\n'
                                'A-102\tPlate; dinner\t8.00\t\n'
                                'A-103\tBowl | soup\t5.75\t12\n').encode('utf-8'))
    w('csv/pipe_delimited.txt', ('sku|description|price|stock\n'
                                 'A-100|Mug, large, blue|6.50|40\n'
                                 'A-101|"Jug | glass"|3.25|0\n'
                                 'A-102|Plate; dinner|8.00|\n').encode('utf-8'))
    w('csv/single_column.csv', b'email\nann@example.com\nbob@example.com\ncat@example.com\n')
    # ---- headers and names
    w('csv/no_header.csv', (b'1001,2023-08-05,Leeds,45.5\n1002,2023-08-06,York,12.25\n'
                            b'1003,2023-08-07,Hull,8.0\n1004,2023-08-08,Leeds,101.75\n'))
    w('csv/header_names.csv', header_names())
    w('csv/title_rows.csv', title_rows())
    w('csv/names/2024 Sales Data (final) v2.csv', b'region,orders\nNorth,12\nSouth,30\n')
    w('csv/names/Order.csv', b'id,item\n1,Mug\n2,Plate\n')
    # ---- types
    w('csv/types.csv', types_csv())
    w('csv/late_type_change.csv', late_type_change())
    # ---- structure
    w('csv/quotes_and_newlines.csv', quotes_and_newlines())
    w('csv/ragged_rows.csv', b'a,b,c,d\n1,2,3,4\n5,6\n7,8,9,10,11,12\n13\n14,15,16,17,18\n')
    w('csv/trailing_delimiter.csv', b'id,name,qty,\n1,Mug,4,\n2,Plate,6,\n3,Bowl,,\n')
    w('csv/blank_lines.csv', b'\n\nid,name\n1,Ann\n\n2,Bob\n   \n,\n3,Cat\n\n\n')
    w('csv/empty.csv', b'')
    w('csv/header_only.csv', b'id,name,joined\n')
    head = ','.join('c%d' % i for i in range(1, 2101))
    w('csv/wide_2100_columns.csv', (head + '\n' + ','.join(str(i) for i in range(1, 2101)) + '\n'
                                    + ','.join('x' for _ in range(2100)) + '\n').encode('ascii'))
    if large:
        w('large.csv', large_csv())


if __name__ == '__main__':
    build(sys.argv[1], '--large' in sys.argv)
    print('csv fixtures written')
