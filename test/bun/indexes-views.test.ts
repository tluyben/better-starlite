/**
 * Index and View Tests for Bun
 * Tests SQLite index and view functionality using Bun's native SQLite
 */

import { test, expect, describe, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

describe("Indexes", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("CREATE INDEX", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)");
    db.exec("CREATE INDEX idx_name ON t(name)");

    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='t'"
    ).all() as any[];
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames.includes("idx_name")).toBe(true);
  });

  test("CREATE UNIQUE INDEX", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, email TEXT)");
    db.exec("CREATE UNIQUE INDEX idx_email ON t(email)");

    db.prepare("INSERT INTO t (email) VALUES (?)").run("test@example.com");

    expect(() => {
      db.prepare("INSERT INTO t (email) VALUES (?)").run("test@example.com");
    }).toThrow();
  });

  test("composite index", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, a TEXT, b TEXT)");
    db.exec("CREATE INDEX idx_ab ON t(a, b)");

    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_ab'"
    ).all() as any[];
    expect(indexes.length).toBe(1);
  });

  test("DROP INDEX", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)");
    db.exec("CREATE INDEX idx_name ON t(name)");
    db.exec("DROP INDEX idx_name");

    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_name'"
    ).all() as any[];
    expect(indexes.length).toBe(0);
  });

  test("index used for queries", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)");
    db.exec("CREATE INDEX idx_name ON t(name)");

    const insert = db.prepare("INSERT INTO t (name) VALUES (?)");
    for (let i = 0; i < 100; i++) {
      insert.run(`name${i}`);
    }

    const result = db.prepare("SELECT id FROM t WHERE name = ?").get("name50");
    expect(result).toBeDefined();
  });

  test("partial index with WHERE", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, status TEXT, name TEXT)");
    db.exec("CREATE INDEX idx_active_name ON t(name) WHERE status = 'active'");

    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_active_name'"
    ).all() as any[];
    expect(indexes.length).toBe(1);
  });
});

describe("Views", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("CREATE VIEW", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, active INTEGER)");
    db.exec("CREATE VIEW active_users AS SELECT * FROM users WHERE active = 1");

    const views = db.prepare("SELECT name FROM sqlite_master WHERE type='view'").all() as any[];
    expect(views.length).toBe(1);
    expect(views[0].name).toBe("active_users");
  });

  test("SELECT from view", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, active INTEGER)");
    db.exec("CREATE VIEW active_users AS SELECT * FROM users WHERE active = 1");

    db.prepare("INSERT INTO users (name, active) VALUES (?, ?)").run("Alice", 1);
    db.prepare("INSERT INTO users (name, active) VALUES (?, ?)").run("Bob", 0);
    db.prepare("INSERT INTO users (name, active) VALUES (?, ?)").run("Charlie", 1);

    const results = db.prepare("SELECT name FROM active_users ORDER BY name").all() as any[];
    expect(results.length).toBe(2);
    expect(results[0].name).toBe("Alice");
    expect(results[1].name).toBe("Charlie");
  });

  test("view with JOIN", () => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE books (id INTEGER PRIMARY KEY, author_id INTEGER, title TEXT);
      CREATE VIEW book_info AS
        SELECT b.title, a.name as author
        FROM books b
        JOIN authors a ON b.author_id = a.id;
    `);

    db.prepare("INSERT INTO authors (id, name) VALUES (?, ?)").run(1, "Alice");
    db.prepare("INSERT INTO books (author_id, title) VALUES (?, ?)").run(1, "Book A");

    const result = db.prepare("SELECT * FROM book_info").get() as any;
    expect(result.title).toBe("Book A");
    expect(result.author).toBe("Alice");
  });

  test("view with aggregation", () => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE sales (id INTEGER PRIMARY KEY, product TEXT, amount INTEGER);
      CREATE VIEW product_totals AS
        SELECT product, SUM(amount) as total
        FROM sales
        GROUP BY product;
    `);

    db.prepare("INSERT INTO sales (product, amount) VALUES (?, ?)").run("A", 100);
    db.prepare("INSERT INTO sales (product, amount) VALUES (?, ?)").run("A", 50);
    db.prepare("INSERT INTO sales (product, amount) VALUES (?, ?)").run("B", 200);

    const results = db.prepare("SELECT * FROM product_totals ORDER BY product").all() as any[];
    expect(results.length).toBe(2);
    expect(results[0].total).toBe(150);
  });

  test("DROP VIEW", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER)");
    db.exec("CREATE VIEW v AS SELECT * FROM t");
    db.exec("DROP VIEW v");

    const views = db.prepare("SELECT name FROM sqlite_master WHERE type='view'").all() as any[];
    expect(views.length).toBe(0);
  });

  test("CREATE VIEW IF NOT EXISTS", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER)");
    db.exec("CREATE VIEW IF NOT EXISTS v AS SELECT * FROM t");
    db.exec("CREATE VIEW IF NOT EXISTS v AS SELECT * FROM t"); // Should not error
  });
});

describe("Metadata", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("PRAGMA table_info", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, age INTEGER)");

    const columns = db.prepare("PRAGMA table_info(users)").all() as any[];
    expect(columns.length).toBe(3);

    const names = columns.map((c) => c.name);
    expect(names.includes("id")).toBe(true);
    expect(names.includes("name")).toBe(true);
    expect(names.includes("age")).toBe(true);
  });

  test("PRAGMA index_list", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)");
    db.exec("CREATE INDEX idx_name ON t(name)");

    const indexes = db.prepare("PRAGMA index_list(t)").all() as any[];
    expect(indexes.length >= 1).toBe(true);
  });

  test("sqlite_version", () => {
    db = new Database(":memory:");
    const result = db.prepare("SELECT sqlite_version() as version").get() as { version: string };
    expect(result.version).toBeDefined();
    expect(result.version.startsWith("3")).toBe(true);
  });
});
