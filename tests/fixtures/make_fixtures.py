"""Regenerates tests/fixtures/sample.db (python3 tests/fixtures/make_fixtures.py)."""
import os
import sqlite3

path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sample.db")
if os.path.exists(path):
    os.remove(path)

db = sqlite3.connect(path)
db.executescript(
    """
    CREATE TABLE fruit (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        price REAL,
        note TEXT
    );
    INSERT INTO fruit VALUES (1, 'apple', 0.5, 'crisp');
    INSERT INTO fruit VALUES (2, 'banana', 0.25, NULL);
    INSERT INTO fruit VALUES (3, 'cherry', 4.75, 'seasonal');
    INSERT INTO fruit VALUES (4, 'dragonfruit', 3.2, 'unicode: café');

    CREATE TABLE tags (fruit_id INTEGER REFERENCES fruit(id), tag TEXT);
    INSERT INTO tags VALUES (1, 'green'), (1, 'red'), (3, 'red');

    CREATE VIEW v_priced AS SELECT name, price FROM fruit WHERE price IS NOT NULL;
    """
)
db.commit()
db.execute("VACUUM")
db.close()
