/**
 * Index and View Tests for Deno
 * Tests SQLite index and view functionality
 */

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { Database } from "../../deno-src/database-deno.ts";

// ============================================
// Index Tests
// ============================================

Deno.test({
  name: "Index: CREATE INDEX",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)");
    db.exec("CREATE INDEX idx_name ON t(name)");

    const indexes = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='t'"
    ).all();
    const indexNames = indexes.map((i: {name: string}) => i.name);
    assertEquals(indexNames.includes("idx_name"), true);

    db.close();
  },
});

Deno.test({
  name: "Index: CREATE UNIQUE INDEX",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, email TEXT)");
    db.exec("CREATE UNIQUE INDEX idx_email ON t(email)");

    await db.prepare("INSERT INTO t (email) VALUES (?)").run("test@example.com");

    let error = false;
    try {
      await db.prepare("INSERT INTO t (email) VALUES (?)").run("test@example.com");
    } catch (_e) {
      error = true;
    }
    assertEquals(error, true);

    db.close();
  },
});

Deno.test({
  name: "Index: Composite index",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, a TEXT, b TEXT)");
    db.exec("CREATE INDEX idx_ab ON t(a, b)");

    const indexes = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_ab'"
    ).all();
    assertEquals(indexes.length, 1);

    db.close();
  },
});

Deno.test({
  name: "Index: DROP INDEX",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)");
    db.exec("CREATE INDEX idx_name ON t(name)");
    db.exec("DROP INDEX idx_name");

    const indexes = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_name'"
    ).all();
    assertEquals(indexes.length, 0);

    db.close();
  },
});

Deno.test({
  name: "Index: Index used for queries",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)");
    db.exec("CREATE INDEX idx_name ON t(name)");

    const insert = db.prepare("INSERT INTO t (name) VALUES (?)");
    for (let i = 0; i < 100; i++) {
      await insert.run(`name${i}`);
    }

    // Query should work correctly with index
    const result = await db.prepare("SELECT id FROM t WHERE name = ?").get("name50");
    assertExists(result);

    db.close();
  },
});

Deno.test({
  name: "Index: Partial index with WHERE",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, status TEXT, name TEXT)");
    db.exec("CREATE INDEX idx_active_name ON t(name) WHERE status = 'active'");

    const indexes = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_active_name'"
    ).all();
    assertEquals(indexes.length, 1);

    db.close();
  },
});

// ============================================
// View Tests
// ============================================

Deno.test({
  name: "View: CREATE VIEW",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, active INTEGER)");
    db.exec("CREATE VIEW active_users AS SELECT * FROM users WHERE active = 1");

    const views = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='view'"
    ).all();
    assertEquals(views.length, 1);
    assertEquals((views[0] as {name: string}).name, "active_users");

    db.close();
  },
});

Deno.test({
  name: "View: SELECT from view",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, active INTEGER)");
    db.exec("CREATE VIEW active_users AS SELECT * FROM users WHERE active = 1");

    await db.prepare("INSERT INTO users (name, active) VALUES (?, ?)").run("Alice", 1);
    await db.prepare("INSERT INTO users (name, active) VALUES (?, ?)").run("Bob", 0);
    await db.prepare("INSERT INTO users (name, active) VALUES (?, ?)").run("Charlie", 1);

    const results = await db.prepare("SELECT name FROM active_users ORDER BY name").all();
    assertEquals(results.length, 2);
    assertEquals((results[0] as {name: string}).name, "Alice");
    assertEquals((results[1] as {name: string}).name, "Charlie");

    db.close();
  },
});

Deno.test({
  name: "View: View with JOIN",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE books (id INTEGER PRIMARY KEY, author_id INTEGER, title TEXT);
      CREATE VIEW book_info AS
        SELECT b.title, a.name as author
        FROM books b
        JOIN authors a ON b.author_id = a.id;
    `);

    await db.prepare("INSERT INTO authors (id, name) VALUES (?, ?)").run(1, "Alice");
    await db.prepare("INSERT INTO books (author_id, title) VALUES (?, ?)").run(1, "Book A");

    const result = await db.prepare("SELECT * FROM book_info").get();
    assertEquals(result.title, "Book A");
    assertEquals(result.author, "Alice");

    db.close();
  },
});

Deno.test({
  name: "View: View with aggregation",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE sales (id INTEGER PRIMARY KEY, product TEXT, amount INTEGER);
      CREATE VIEW product_totals AS
        SELECT product, SUM(amount) as total
        FROM sales
        GROUP BY product;
    `);

    await db.prepare("INSERT INTO sales (product, amount) VALUES (?, ?)").run("A", 100);
    await db.prepare("INSERT INTO sales (product, amount) VALUES (?, ?)").run("A", 50);
    await db.prepare("INSERT INTO sales (product, amount) VALUES (?, ?)").run("B", 200);

    const results = await db.prepare("SELECT * FROM product_totals ORDER BY product").all();
    assertEquals(results.length, 2);
    assertEquals((results[0] as {product: string; total: number}).total, 150);

    db.close();
  },
});

Deno.test({
  name: "View: DROP VIEW",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER)");
    db.exec("CREATE VIEW v AS SELECT * FROM t");
    db.exec("DROP VIEW v");

    const views = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='view'"
    ).all();
    assertEquals(views.length, 0);

    db.close();
  },
});

Deno.test({
  name: "View: CREATE VIEW IF NOT EXISTS",
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER)");
    db.exec("CREATE VIEW IF NOT EXISTS v AS SELECT * FROM t");
    db.exec("CREATE VIEW IF NOT EXISTS v AS SELECT * FROM t"); // Should not error

    db.close();
  },
});

// ============================================
// Virtual Table Tests (FTS5)
// ============================================

Deno.test({
  name: "Virtual: FTS5 create table",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");

    // Try to create FTS5 table - might not be available in all SQLite builds
    let fts5Available = true;
    try {
      db.exec("CREATE VIRTUAL TABLE docs USING fts5(title, body)");
    } catch (_e) {
      fts5Available = false;
    }

    if (fts5Available) {
      const tables = await db.prepare(
        "SELECT name FROM sqlite_master WHERE name='docs'"
      ).all();
      assertEquals(tables.length, 1);
    }

    db.close();
  },
});

Deno.test({
  name: "Virtual: FTS5 search",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");

    let fts5Available = true;
    try {
      db.exec("CREATE VIRTUAL TABLE docs USING fts5(title, body)");
    } catch (_e) {
      fts5Available = false;
    }

    if (fts5Available) {
      await db.prepare("INSERT INTO docs (title, body) VALUES (?, ?)").run(
        "Hello World",
        "This is a test document"
      );
      await db.prepare("INSERT INTO docs (title, body) VALUES (?, ?)").run(
        "Another Doc",
        "Some other content"
      );

      const results = await db.prepare(
        "SELECT title FROM docs WHERE docs MATCH ?"
      ).all("test");

      assertEquals(results.length, 1);
    }

    db.close();
  },
});

// ============================================
// Table Metadata Tests
// ============================================

Deno.test({
  name: "Metadata: PRAGMA table_info",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, age INTEGER)");

    // Use prepare/all instead of pragma for table_info
    const columns = await db.prepare("PRAGMA table_info(users)").all();
    assertEquals(columns.length, 3);

    const names = columns.map((c: {name: string}) => c.name);
    assertEquals(names.includes("id"), true);
    assertEquals(names.includes("name"), true);
    assertEquals(names.includes("age"), true);

    db.close();
  },
});

Deno.test({
  name: "Metadata: PRAGMA index_list",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)");
    db.exec("CREATE INDEX idx_name ON t(name)");

    // Use prepare/all instead of pragma for index_list
    const indexes = await db.prepare("PRAGMA index_list(t)").all();
    // Should have at least one index (might have auto-created ones too)
    assertEquals(indexes.length >= 1, true);

    db.close();
  },
});

Deno.test({
  name: "Metadata: sqlite_version",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");

    const result = await db.prepare("SELECT sqlite_version() as version").get();
    assertExists(result.version);
    // Version should be something like "3.x.x"
    assertEquals(result.version.startsWith("3"), true);

    db.close();
  },
});
