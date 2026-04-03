/**
 * Edge Case Tests for Bun
 * Tests boundary conditions using Bun's native SQLite
 */

import { test, expect, describe, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

describe("Empty Results", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("empty table returns empty array", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
    const users = db.prepare("SELECT * FROM users").all();
    expect(users).toEqual([]);
  });

  test("COUNT on empty table returns 0", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
    const result = db.prepare("SELECT COUNT(*) as cnt FROM users").get() as { cnt: number };
    expect(result.cnt).toBe(0);
  });

  test("SUM on empty table returns null", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE sales (id INTEGER PRIMARY KEY, amount INTEGER)");
    const result = db.prepare("SELECT SUM(amount) as total FROM sales").get() as { total: null };
    expect(result.total).toBeNull();
  });
});

describe("Large Data", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("insert many rows", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE numbers (id INTEGER PRIMARY KEY, value INTEGER)");
    const insert = db.prepare("INSERT INTO numbers (value) VALUES (?)");
    for (let i = 0; i < 100; i++) {
      insert.run(i);
    }

    const result = db.prepare("SELECT COUNT(*) as cnt FROM numbers").get() as { cnt: number };
    expect(result.cnt).toBe(100);
  });

  test("long text values", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE docs (id INTEGER PRIMARY KEY, content TEXT)");
    const longText = "x".repeat(10000);
    db.prepare("INSERT INTO docs (content) VALUES (?)").run(longText);

    const result = db.prepare("SELECT content FROM docs").get() as { content: string };
    expect(result.content.length).toBe(10000);
  });
});

describe("Special Characters", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("SQL injection attempt is safe", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
    const malicious = "'; DROP TABLE users; --";
    db.prepare("INSERT INTO users (name) VALUES (?)").run(malicious);

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    ).all() as any[];
    expect(tables.length).toBe(1);

    const user = db.prepare("SELECT name FROM users").get() as { name: string };
    expect(user.name).toBe(malicious);
  });

  test("null byte in string", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, data TEXT)");
    const withNull = "before\0after";
    db.prepare("INSERT INTO test (data) VALUES (?)").run(withNull);

    const result = db.prepare("SELECT data FROM test").get() as { data: string };
    expect(result.data).toBeDefined();
  });
});

describe("LIKE Pattern Matching", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("LIKE with percent wildcard", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
    const insert = db.prepare("INSERT INTO users (name) VALUES (?)");
    insert.run("Alice");
    insert.run("Bob");
    insert.run("Alicia");
    insert.run("Alex");

    const results = db.prepare("SELECT name FROM users WHERE name LIKE ?").all("Al%") as any[];
    expect(results.length).toBe(3);
  });

  test("LIKE with underscore wildcard", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE codes (id INTEGER PRIMARY KEY, code TEXT)");
    const insert = db.prepare("INSERT INTO codes (code) VALUES (?)");
    insert.run("A1B");
    insert.run("A2B");
    insert.run("A12B");
    insert.run("A3B");

    const results = db.prepare("SELECT code FROM codes WHERE code LIKE ?").all("A_B") as any[];
    expect(results.length).toBe(3);
  });
});

describe("ORDER BY", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("with NULL values", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, value INTEGER)");
    const insert = db.prepare("INSERT INTO items (value) VALUES (?)");
    insert.run(3);
    insert.run(null);
    insert.run(1);
    insert.run(null);
    insert.run(2);

    const results = db.prepare("SELECT value FROM items ORDER BY value ASC").all() as { value: number | null }[];
    expect(results[0].value).toBeNull();
    expect(results[1].value).toBeNull();
    expect(results[2].value).toBe(1);
  });

  test("multiple columns", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, category TEXT, name TEXT)");
    const insert = db.prepare("INSERT INTO items (category, name) VALUES (?, ?)");
    insert.run("B", "Item1");
    insert.run("A", "Item2");
    insert.run("A", "Item1");
    insert.run("B", "Item2");

    const results = db.prepare("SELECT category, name FROM items ORDER BY category, name").all() as any[];
    expect(results[0].category).toBe("A");
    expect(results[0].name).toBe("Item1");
  });
});

describe("LIMIT and OFFSET", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("LIMIT clause", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY)");
    const insert = db.prepare("INSERT INTO items DEFAULT VALUES");
    for (let i = 0; i < 10; i++) {
      insert.run();
    }

    const results = db.prepare("SELECT * FROM items LIMIT 5").all() as any[];
    expect(results.length).toBe(5);
  });

  test("LIMIT with OFFSET", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, value INTEGER)");
    const insert = db.prepare("INSERT INTO items (value) VALUES (?)");
    for (let i = 1; i <= 10; i++) {
      insert.run(i);
    }

    const results = db.prepare("SELECT value FROM items ORDER BY value LIMIT 3 OFFSET 5").all() as { value: number }[];
    expect(results.length).toBe(3);
    expect(results[0].value).toBe(6);
    expect(results[1].value).toBe(7);
    expect(results[2].value).toBe(8);
  });
});

describe("SQL Functions", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("UPPER and LOWER", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)");
    db.prepare("INSERT INTO items (name) VALUES (?)").run("Hello World");

    const result = db.prepare("SELECT UPPER(name) as upper, LOWER(name) as lower FROM items").get() as any;
    expect(result.upper).toBe("HELLO WORLD");
    expect(result.lower).toBe("hello world");
  });

  test("LENGTH function", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, text TEXT)");
    db.prepare("INSERT INTO items (text) VALUES (?)").run("Hello");

    const result = db.prepare("SELECT LENGTH(text) as len FROM items").get() as { len: number };
    expect(result.len).toBe(5);
  });

  test("SUBSTR function", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, text TEXT)");
    db.prepare("INSERT INTO items (text) VALUES (?)").run("Hello World");

    const result = db.prepare("SELECT SUBSTR(text, 7, 5) as sub FROM items").get() as { sub: string };
    expect(result.sub).toBe("World");
  });

  test("TRIM function", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, text TEXT)");
    db.prepare("INSERT INTO items (text) VALUES (?)").run("  Hello  ");

    const result = db.prepare("SELECT TRIM(text) as trimmed FROM items").get() as { trimmed: string };
    expect(result.trimmed).toBe("Hello");
  });

  test("ABS function", () => {
    db = new Database(":memory:");
    const result = db.prepare("SELECT ABS(-42) as abs_val").get() as { abs_val: number };
    expect(result.abs_val).toBe(42);
  });

  test("ROUND function", () => {
    db = new Database(":memory:");
    const result = db.prepare("SELECT ROUND(3.14159, 2) as rounded").get() as { rounded: number };
    expect(result.rounded).toBe(3.14);
  });

  test("COALESCE function", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, nickname TEXT, name TEXT)");
    db.prepare("INSERT INTO users (nickname, name) VALUES (?, ?)").run(null, "Alice");
    db.prepare("INSERT INTO users (nickname, name) VALUES (?, ?)").run("Bobby", "Bob");

    const results = db.prepare("SELECT COALESCE(nickname, name) as display FROM users ORDER BY id").all() as any[];
    expect(results[0].display).toBe("Alice");
    expect(results[1].display).toBe("Bobby");
  });

  test("NULLIF function", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT)");
    db.prepare("INSERT INTO items (value) VALUES (?)").run("keep");
    db.prepare("INSERT INTO items (value) VALUES (?)").run("N/A");

    const results = db.prepare("SELECT NULLIF(value, 'N/A') as clean FROM items ORDER BY id").all() as any[];
    expect(results[0].clean).toBe("keep");
    expect(results[1].clean).toBeNull();
  });

  test("DATE function", () => {
    db = new Database(":memory:");
    const result = db.prepare("SELECT DATE('2024-01-15 10:30:00') as d").get() as { d: string };
    expect(result.d).toBe("2024-01-15");
  });

  test("DATETIME function", () => {
    db = new Database(":memory:");
    const result = db.prepare("SELECT DATETIME('now') as dt").get() as { dt: string };
    expect(result.dt).toBeDefined();
    expect(result.dt.length).toBe(19);
  });
});

describe("CASE Expression", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("CASE expression", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE scores (id INTEGER PRIMARY KEY, score INTEGER)");
    const insert = db.prepare("INSERT INTO scores (score) VALUES (?)");
    insert.run(95);
    insert.run(75);
    insert.run(55);

    const results = db.prepare(`
      SELECT score,
        CASE
          WHEN score >= 90 THEN 'A'
          WHEN score >= 70 THEN 'B'
          ELSE 'C'
        END as grade
      FROM scores ORDER BY score DESC
    `).all() as any[];

    expect(results[0].grade).toBe("A");
    expect(results[1].grade).toBe("B");
    expect(results[2].grade).toBe("C");
  });
});

describe("DISTINCT", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("DISTINCT values", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, category TEXT)");
    const insert = db.prepare("INSERT INTO items (category) VALUES (?)");
    insert.run("A");
    insert.run("B");
    insert.run("A");
    insert.run("C");
    insert.run("B");

    const results = db.prepare("SELECT DISTINCT category FROM items ORDER BY category").all() as any[];
    expect(results.length).toBe(3);
    expect(results[0].category).toBe("A");
  });
});

describe("HAVING Clause", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("HAVING clause", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE sales (id INTEGER PRIMARY KEY, product TEXT, amount INTEGER)");
    const insert = db.prepare("INSERT INTO sales (product, amount) VALUES (?, ?)");
    insert.run("A", 100);
    insert.run("A", 200);
    insert.run("B", 50);
    insert.run("C", 150);
    insert.run("C", 250);
    insert.run("C", 100);

    const results = db.prepare(`
      SELECT product, SUM(amount) as total
      FROM sales
      GROUP BY product
      HAVING SUM(amount) > 200
      ORDER BY total DESC
    `).all() as any[];

    expect(results.length).toBe(2);
    expect(results[0].product).toBe("C");
    expect(results[0].total).toBe(500);
  });
});

describe("UNION", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("UNION removes duplicates", () => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE suppliers (id INTEGER PRIMARY KEY, name TEXT);
    `);
    db.prepare("INSERT INTO customers (name) VALUES (?)").run("Alice");
    db.prepare("INSERT INTO customers (name) VALUES (?)").run("Bob");
    db.prepare("INSERT INTO suppliers (name) VALUES (?)").run("Bob");
    db.prepare("INSERT INTO suppliers (name) VALUES (?)").run("Charlie");

    const results = db.prepare(`
      SELECT name FROM customers
      UNION
      SELECT name FROM suppliers
      ORDER BY name
    `).all() as any[];

    expect(results.length).toBe(3);
  });

  test("UNION ALL keeps duplicates", () => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE a (id INTEGER PRIMARY KEY, value TEXT);
      CREATE TABLE b (id INTEGER PRIMARY KEY, value TEXT);
    `);
    db.prepare("INSERT INTO a (value) VALUES (?)").run("X");
    db.prepare("INSERT INTO b (value) VALUES (?)").run("X");

    const results = db.prepare(`
      SELECT value FROM a
      UNION ALL
      SELECT value FROM b
    `).all() as any[];

    expect(results.length).toBe(2);
  });
});

describe("EXISTS", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("EXISTS subquery", () => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER);
    `);
    db.prepare("INSERT INTO users (name) VALUES (?)").run("Alice");
    db.prepare("INSERT INTO users (name) VALUES (?)").run("Bob");
    db.prepare("INSERT INTO orders (user_id) VALUES (?)").run(1);

    const results = db.prepare(`
      SELECT name FROM users u
      WHERE EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id)
    `).all() as any[];

    expect(results.length).toBe(1);
    expect(results[0].name).toBe("Alice");
  });
});

describe("Multiple Databases", () => {
  test("multiple databases can be open", () => {
    const db1 = new Database(":memory:");
    const db2 = new Database(":memory:");

    db1.exec("CREATE TABLE t1 (id INTEGER)");
    db2.exec("CREATE TABLE t2 (id INTEGER)");

    db1.prepare("INSERT INTO t1 VALUES (1)").run();
    db2.prepare("INSERT INTO t2 VALUES (2)").run();

    db1.close();
    db2.close();
  });
});
