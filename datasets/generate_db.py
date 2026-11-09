"""Generate northlight_retail.db — a small teaching SQLite database.

Fictional Yorkshire retail chain, star-ish schema:
stores, products, customers, orders, order_items (+ a v_sales view).
Deterministic (seeded) so it can be regenerated identically.
"""
import os
import random
import sqlite3
from datetime import date, timedelta

random.seed(42)
DB = "northlight_retail.db"
if os.path.exists(DB):
    os.remove(DB)

con = sqlite3.connect(DB)
cur = con.cursor()
cur.executescript("""
PRAGMA foreign_keys = ON;

CREATE TABLE stores (
    store_id    INTEGER PRIMARY KEY,
    store_name  TEXT NOT NULL,
    city        TEXT NOT NULL,
    region      TEXT NOT NULL,
    opened_date TEXT NOT NULL
);

CREATE TABLE products (
    product_id   INTEGER PRIMARY KEY,
    product_name TEXT NOT NULL,
    category     TEXT NOT NULL,
    unit_price   REAL NOT NULL,
    unit_cost    REAL NOT NULL
);

CREATE TABLE customers (
    customer_id INTEGER PRIMARY KEY,
    first_name  TEXT NOT NULL,
    last_name   TEXT NOT NULL,
    city        TEXT,
    segment     TEXT NOT NULL CHECK (segment IN ('Consumer','Small Business','Corporate')),
    signup_date TEXT NOT NULL
);

CREATE TABLE orders (
    order_id       INTEGER PRIMARY KEY,
    customer_id    INTEGER NOT NULL REFERENCES customers(customer_id),
    store_id       INTEGER NOT NULL REFERENCES stores(store_id),
    order_date     TEXT NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('Card','Online','Cash'))
);

CREATE TABLE order_items (
    order_id   INTEGER NOT NULL REFERENCES orders(order_id),
    line_no    INTEGER NOT NULL,
    product_id INTEGER NOT NULL REFERENCES products(product_id),
    quantity   INTEGER NOT NULL CHECK (quantity > 0),
    discount   REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (order_id, line_no)
);

CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_items_product   ON order_items(product_id);

CREATE VIEW v_sales AS
SELECT o.order_id,
       o.order_date,
       s.store_name,
       s.region,
       c.customer_id,
       c.first_name || ' ' || c.last_name AS customer_name,
       c.segment,
       p.product_name,
       p.category,
       oi.quantity,
       p.unit_price,
       oi.discount,
       ROUND(oi.quantity * p.unit_price * (1 - oi.discount), 2) AS line_revenue
FROM orders o
JOIN order_items oi ON oi.order_id   = o.order_id
JOIN products p     ON p.product_id  = oi.product_id
JOIN customers c    ON c.customer_id = o.customer_id
JOIN stores s       ON s.store_id    = o.store_id;
""")

# --- stores -----------------------------------------------------------------
stores = [
    (1, "Northlight Huddersfield", "Huddersfield", "West Yorkshire",   "2018-03-12"),
    (2, "Northlight Leeds",        "Leeds",        "West Yorkshire",   "2016-09-01"),
    (3, "Northlight York",         "York",         "North Yorkshire",  "2019-05-20"),
    (4, "Northlight Sheffield",    "Sheffield",    "South Yorkshire",  "2017-11-04"),
    (5, "Northlight Manchester",   "Manchester",   "Greater Manchester","2021-02-15"),
]
cur.executemany("INSERT INTO stores VALUES (?,?,?,?,?)", stores)

# --- products ---------------------------------------------------------------
products = [
    ("Wireless Mouse",            "Electronics",    24.99, 11.50),
    ("Mechanical Keyboard",       "Electronics",    79.99, 42.00),
    ("27-inch Monitor",           "Electronics",   189.00, 120.00),
    ("USB-C Hub",                 "Electronics",    34.50, 15.25),
    ("Bluetooth Speaker",         "Electronics",    49.99, 22.00),
    ("Cast Iron Skillet",         "Home & Kitchen", 39.95, 18.00),
    ("Electric Kettle",           "Home & Kitchen", 29.99, 13.50),
    ("Knife Set",                 "Home & Kitchen", 64.00, 30.00),
    ("Storage Jars (x6)",         "Home & Kitchen", 21.50,  8.75),
    ("A5 Notebook",               "Stationery",      6.99,  2.10),
    ("Gel Pens (x10)",            "Stationery",      8.49,  3.00),
    ("Desk Organiser",            "Stationery",     14.99,  6.20),
    ("Whiteboard Markers",        "Stationery",      7.25,  2.80),
    ("Yorkshire Tea (240 bags)",  "Food & Drink",    7.50,  4.10),
    ("Ground Coffee 1kg",         "Food & Drink",   15.99,  8.90),
    ("Dark Chocolate Bar",        "Food & Drink",    3.25,  1.40),
    ("Sparkling Water (x12)",     "Food & Drink",    5.99,  2.60),
    ("Hoodie",                    "Clothing",       32.00, 14.00),
    ("Beanie Hat",                "Clothing",       12.50,  4.75),
    ("Waterproof Jacket",         "Clothing",       89.00, 47.00),
]
cur.executemany(
    "INSERT INTO products (product_name, category, unit_price, unit_cost) VALUES (?,?,?,?)",
    products,
)

# --- customers ---------------------------------------------------------------
first_names = ["Amelia","Oliver","Isla","George","Freya","Noah","Poppy","Arthur",
               "Yusuf","Sofia","Leo","Grace","Ethan","Maryam","Jack","Aisha",
               "Harry","Zara","Daniel","Nadia","Thomas","Layla","Samuel","Imane","Lucas"]
last_names  = ["Walker","Hussain","Clarke","Patel","Robinson","Benali","Wood","Khan",
               "Turner","Ahmed","Hall","Begum","Wright","Mansouri","Green","Shaw",
               "Baker","Iqbal","Harrison","Osman","Moore","Haddad","Ward","Bennett","Fletcher"]
cities = ["Huddersfield","Leeds","York","Sheffield","Manchester",
          "Bradford","Wakefield","Halifax","Harrogate","Barnsley"]

def rand_date(start: date, end: date) -> str:
    return (start + timedelta(days=random.randint(0, (end - start).days))).isoformat()

null_city_ids = {14, 31, 47}  # a few missing values for data-quality exercises
for cid in range(1, 61):
    fn = random.choice(first_names)
    ln = random.choice(last_names)
    city = None if cid in null_city_ids else random.choice(cities)
    segment = random.choices(["Consumer", "Small Business", "Corporate"], weights=[60, 25, 15])[0]
    signup = rand_date(date(2024, 1, 1), date(2026, 6, 30))
    cur.execute("INSERT INTO customers VALUES (?,?,?,?,?,?)", (cid, fn, ln, city, segment, signup))

# --- orders & order_items -----------------------------------------------------
# Customers 56-60 never order (LEFT JOIN exercise).
# Product 12 (Desk Organiser) is never sold (another LEFT JOIN exercise).
eligible_products = [pid for pid in range(1, 21) if pid != 12]

n_orders = 450
for order_id in range(1, n_orders + 1):
    cust = random.randint(1, 55)
    store = random.choices([1, 2, 3, 4, 5], weights=[25, 30, 15, 18, 12])[0]
    odate = rand_date(date(2025, 1, 1), date(2026, 10, 31))
    pay = random.choices(["Card", "Online", "Cash"], weights=[55, 30, 15])[0]
    cur.execute("INSERT INTO orders VALUES (?,?,?,?,?)", (order_id, cust, store, odate, pay))

    n_lines = random.choices([1, 2, 3, 4], weights=[35, 35, 20, 10])[0]
    for line_no, pid in enumerate(random.sample(eligible_products, n_lines), start=1):
        qty = random.choices([1, 2, 3, 4, 5], weights=[45, 28, 15, 8, 4])[0]
        disc = random.choices([0.0, 0.05, 0.10, 0.20], weights=[80, 12, 6, 2])[0]
        cur.execute("INSERT INTO order_items VALUES (?,?,?,?,?)",
                    (order_id, line_no, pid, qty, disc))

con.commit()

# --- sanity checks ------------------------------------------------------------
for t in ["stores", "products", "customers", "orders", "order_items"]:
    print(t, cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0])
print("total revenue", cur.execute("SELECT ROUND(SUM(line_revenue),2) FROM v_sales").fetchone()[0])
print("date range", cur.execute("SELECT MIN(order_date), MAX(order_date) FROM orders").fetchone())
print("customers with no orders",
      cur.execute("""SELECT COUNT(*) FROM customers c
                     LEFT JOIN orders o ON o.customer_id = c.customer_id
                     WHERE o.order_id IS NULL""").fetchone()[0])
print("unsold products",
      cur.execute("""SELECT COUNT(*) FROM products p
                     LEFT JOIN order_items oi ON oi.product_id = p.product_id
                     WHERE oi.order_id IS NULL""").fetchone()[0])
con.close()
print("written", DB, os.path.getsize(DB), "bytes")
