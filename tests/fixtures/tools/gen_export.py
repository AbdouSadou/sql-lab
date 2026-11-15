"""Generate the export fixtures: a database of awkward tables, and the CSV each should export to.

    python3 gen_export.py <fixtures dir>
"""
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rules  # noqa: E402

LONG_NAME = 'monthly_revenue_by_region_and_channel_2024'

TEXT_EDGE = [
    'plain', 'comma, inside', 'quote " inside', 'line\nfeed', 'carriage return\r\nand line feed',
    ' leading space', 'trailing space ', '', None, '£ é ü — “curly quotes”', '😀 日本語 العربية',
    '=SUM(A1:A3)', '+441632960001', '-5 apples', '@handle', '00123', 'tab\there', 'x' * 40000,
    '"', ',', 'NULL', '  ',
]
TEXT_NOTE = [
    'ordinary text', 'must be quoted', 'quote is doubled', 'line feed kept inside quotes', 'CRLF kept inside quotes',
    'quoted because of the leading space', 'quoted because of the trailing space', 'empty string', 'NULL',
    'accents and typographic characters', 'outside the basic plane, and right to left', 'looks like a formula',
    'starts with a plus sign', 'starts with a minus sign', 'starts with an at sign', 'leading zeros',
    'tab is not quoted', '40,000 characters: longer than an Excel cell allows', 'a single quote character',
    'a single comma', 'the four letters NULL, not a missing value', 'two spaces',
]
NUMBER_EDGE = [
    (0, 0.0, 'zero'), (-1, -1.5, 'negative'), (9007199254740993, 0.1, 'integer just above 2^53'),
    (9223372036854775807, 0.30000000000000004, 'largest integer; a float with 17 significant digits'),
    (-9223372036854775808, 1.0, 'smallest integer; a real with a whole value'),
    (42, 1e-7, 'a real JavaScript prints as 1e-7'), (1000000, 1.5e20, 'a real JavaScript prints as 150000000000000000000'),
    (None, 123456.789, 'NULL integer'), (7, None, 'NULL real'),
    (123456789012345, 1e15, '15-digit integer'), (1234567890123456, 0.000123, '16-digit integer'),
]


def build(root):
    out = os.path.join(root, 'export')
    os.makedirs(os.path.join(out, 'expected_csv'), exist_ok=True)
    path = os.path.join(out, 'export_edge_cases.db')
    if os.path.exists(path):
        os.remove(path)
    con = sqlite3.connect(path)
    con.executescript('''
        CREATE TABLE basic (id INTEGER PRIMARY KEY, name TEXT, amount REAL, joined TEXT);
        INSERT INTO basic VALUES (1,'Ava Hughes',120.5,'2021-03-14'),(2,'Ben Carter',0.99,'2021-11-02'),
            (3,'Chloe Ward',NULL,'2022-02-13'),(4,'Dev Sharma',7500.25,NULL),(5,NULL,15.0,'2023-01-09');
        CREATE TABLE text_edge (id INTEGER PRIMARY KEY, value TEXT, note TEXT);
        CREATE TABLE number_edge (id INTEGER PRIMARY KEY, i INTEGER, r REAL, note TEXT);
        CREATE TABLE mixed_types (id INTEGER PRIMARY KEY, v, note TEXT);
        INSERT INTO mixed_types VALUES (1,42,'integer'),(2,3.14,'real'),(3,'text','text'),(4,NULL,'null'),
            (5,X'DEADBEEF','blob of four bytes'),(6,'','empty string'),(7,'42','the text 42');
        CREATE TABLE dates_iso (id INTEGER PRIMARY KEY, d TEXT, dt TEXT);
        INSERT INTO dates_iso VALUES (1,'2023-08-05','2023-08-05 14:30:00'),(2,'2024-02-29','2024-02-29 00:00:00'),
            (3,NULL,'1999-12-31 23:59:59'),(4,'2030-06-15',NULL);
        CREATE TABLE "Order Details" ("Order ID" INTEGER, "Unit Price (£)" REAL, "select" TEXT, "Notes, misc" TEXT);
        INSERT INTO "Order Details" VALUES (1,24.99,'a','x'),(2,149.0,'b',NULL);
        CREATE TABLE "order" (id INTEGER, item TEXT);
        INSERT INTO "order" VALUES (1,'Mug'),(2,'Plate');
        CREATE TABLE empty_table (a INTEGER, b TEXT, c REAL);
        CREATE TABLE big_2000 (id INTEGER PRIMARY KEY, value TEXT);
        CREATE TABLE "sales/2024" (region TEXT, orders INTEGER);
        INSERT INTO "sales/2024" VALUES ('North',12),('South',30);
        CREATE TABLE sales_2024 (region TEXT, orders INTEGER);
        INSERT INTO sales_2024 VALUES ('East',7),('West',9);
        CREATE TABLE con (id INTEGER, note TEXT);
        INSERT INTO con VALUES (1,'con is a reserved file name on Windows');
        CREATE VIEW v_basic_summary AS SELECT COUNT(*) AS customers, ROUND(SUM(amount), 2) AS total_amount,
            MIN(joined) AS first_joined FROM basic;
    ''')
    con.execute('CREATE TABLE %s (region TEXT, channel TEXT, revenue REAL)' % LONG_NAME)
    con.executemany('INSERT INTO %s VALUES (?,?,?)' % LONG_NAME, [('North', 'Web', 1200.5), ('South', 'Store', 980.0)])
    con.executemany('INSERT INTO text_edge VALUES (?,?,?)', [(i + 1, v, n) for i, (v, n) in enumerate(zip(TEXT_EDGE, TEXT_NOTE))])
    con.executemany('INSERT INTO number_edge VALUES (?,?,?,?)', [(i + 1,) + row for i, row in enumerate(NUMBER_EDGE)])
    con.executemany('INSERT INTO big_2000 VALUES (?,?)', [(i, 'row %04d' % i) for i in range(1, 2001)])
    con.commit()
    con.execute('VACUUM')

    goldens = {'basic': 'basic', 'text_edge': 'text_edge', 'number_edge': 'number_edge', 'dates_iso': 'dates_iso',
               'Order Details': 'Order_Details', 'order': 'order', 'empty_table': 'empty_table', 'big_2000': 'big_2000',
               'sales/2024': 'sales_2024', 'sales_2024': 'sales_2024_2', 'con': 'con',
               'v_basic_summary': 'v_basic_summary', LONG_NAME: LONG_NAME}
    for table, stem in goldens.items():
        cur = con.execute('SELECT * FROM "%s"' % table.replace('"', '""'))
        header = [d[0] for d in cur.description]
        data = rules.export_csv(header, cur.fetchall())
        with open(os.path.join(out, 'expected_csv', stem + '.csv'), 'wb') as f:
            f.write(data)
    con.close()
    return goldens


if __name__ == '__main__':
    build(sys.argv[1])
    print('export fixtures written')
