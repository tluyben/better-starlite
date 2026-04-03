/**
 * Edge Case Tests for Deno
 * Tests boundary conditions and unusual scenarios
 */

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { Database } from "../../deno-src/database-deno.ts";

// ============================================
// Empty Results Tests
// ============================================

Deno.test({
  name: "Edge: Empty table returns empty array",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");

    const users = await db.prepare("SELECT * FROM users").all();
    assertEquals(users, []);

    db.close();
  },
});

Deno.test({
  name: "Edge: COUNT on empty table returns 0",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");

    const result = await db.prepare("SELECT COUNT(*) as cnt FROM users").get();
    assertEquals(result.cnt, 0);

    db.close();
  },
});

Deno.test({
  name: "Edge: SUM on empty table returns null",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE sales (id INTEGER PRIMARY KEY, amount INTEGER)");

    const result = await db.prepare("SELECT SUM(amount) as total FROM sales").get();
    assertEquals(result.total, null);

    db.close();
  },
});

// ============================================
// Large Data Tests
// ============================================

Deno.test({
  name: "Edge: Insert many rows",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE numbers (id INTEGER PRIMARY KEY, value INTEGER)");

    const insert = db.prepare("INSERT INTO numbers (value) VALUES (?)");
    for (let i = 0; i < 100; i++) {
      await insert.run(i);
    }

    const result = await db.prepare("SELECT COUNT(*) as cnt FROM numbers").get();
    assertEquals(result.cnt, 100);

    db.close();
  },
});

Deno.test({
  name: "Edge: Long text values",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE docs (id INTEGER PRIMARY KEY, content TEXT)");

    const longText = "x".repeat(10000);
    await db.prepare("INSERT INTO docs (content) VALUES (?)").run(longText);

    const result = await db.prepare("SELECT content FROM docs").get();
    assertEquals(result.content.length, 10000);

    db.close();
  },
});

Deno.test({
  name: "Edge: Large integer values",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE numbers (id INTEGER PRIMARY KEY, big INTEGER)");

    // Use a large number that's safely within 32-bit signed range for compatibility
    const bigNum = 2147483647; // Max 32-bit signed integer
    await db.prepare("INSERT INTO numbers (big) VALUES (?)").run(bigNum);

    const result = await db.prepare("SELECT big FROM numbers").get();
    assertEquals(result.big, bigNum);

    db.close();
  },
});

// ============================================
// Special Characters Tests
// ============================================

Deno.test({
  name: "Edge: SQL injection attempt is safe",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");

    // This should be treated as a literal string, not SQL
    const malicious = "'; DROP TABLE users; --";
    await db.prepare("INSERT INTO users (name) VALUES (?)").run(malicious);

    // Table should still exist
    const tables = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    ).all();
    assertEquals(tables.length, 1);

    // The malicious string should be stored literally
    const user = await db.prepare("SELECT name FROM users").get();
    assertEquals(user.name, malicious);

    db.close();
  },
});

Deno.test({
  name: "Edge: Null byte in string",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, data TEXT)");

    const withNull = "before\0after";
    await db.prepare("INSERT INTO test (data) VALUES (?)").run(withNull);

    const result = await db.prepare("SELECT data FROM test").get();
    // SQLite handles null bytes in strings
    assertExists(result.data);

    db.close();
  },
});

Deno.test({
  name: "Edge: Empty string value",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)");

    await db.prepare("INSERT INTO test (value) VALUES (?)").run("");

    const result = await db.prepare("SELECT value FROM test").get();
    assertEquals(result.value, "");

    db.close();
  },
});

// ============================================
// LIKE and Pattern Matching Tests
// ============================================

Deno.test({
  name: "Edge: LIKE pattern matching",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");

    const insert = db.prepare("INSERT INTO users (name) VALUES (?)");
    await insert.run("Alice");
    await insert.run("Bob");
    await insert.run("Alicia");
    await insert.run("Alex");

    const results = await db.prepare("SELECT name FROM users WHERE name LIKE ?").all("Al%");
    assertEquals(results.length, 3);

    db.close();
  },
});

Deno.test({
  name: "Edge: LIKE with underscore wildcard",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE codes (id INTEGER PRIMARY KEY, code TEXT)");

    const insert = db.prepare("INSERT INTO codes (code) VALUES (?)");
    await insert.run("A1B");
    await insert.run("A2B");
    await insert.run("A12B");
    await insert.run("A3B");

    const results = await db.prepare("SELECT code FROM codes WHERE code LIKE ?").all("A_B");
    assertEquals(results.length, 3); // A1B, A2B, A3B (not A12B)

    db.close();
  },
});

// ============================================
// ORDER BY Tests
// ============================================

Deno.test({
  name: "Edge: ORDER BY with NULL values",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, value INTEGER)");

    const insert = db.prepare("INSERT INTO items (value) VALUES (?)");
    await insert.run(3);
    await insert.run(null);
    await insert.run(1);
    await insert.run(null);
    await insert.run(2);

    // NULL values should come first in ascending order (SQLite default)
    const results = await db.prepare("SELECT value FROM items ORDER BY value ASC").all();
    assertEquals(results[0].value, null);
    assertEquals(results[1].value, null);
    assertEquals(results[2].value, 1);

    db.close();
  },
});

Deno.test({
  name: "Edge: ORDER BY multiple columns",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, category TEXT, name TEXT)");

    const insert = db.prepare("INSERT INTO items (category, name) VALUES (?, ?)");
    await insert.run("B", "Item1");
    await insert.run("A", "Item2");
    await insert.run("A", "Item1");
    await insert.run("B", "Item2");

    const results = await db.prepare(
      "SELECT category, name FROM items ORDER BY category, name"
    ).all();

    assertEquals(results[0].category, "A");
    assertEquals(results[0].name, "Item1");
    assertEquals(results[1].category, "A");
    assertEquals(results[1].name, "Item2");

    db.close();
  },
});

// ============================================
// LIMIT and OFFSET Tests
// ============================================

Deno.test({
  name: "Edge: LIMIT clause",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY)");

    const insert = db.prepare("INSERT INTO items DEFAULT VALUES");
    for (let i = 0; i < 10; i++) {
      await insert.run();
    }

    const results = await db.prepare("SELECT * FROM items LIMIT 5").all();
    assertEquals(results.length, 5);

    db.close();
  },
});

Deno.test({
  name: "Edge: LIMIT with OFFSET",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, value INTEGER)");

    const insert = db.prepare("INSERT INTO items (value) VALUES (?)");
    for (let i = 1; i <= 10; i++) {
      await insert.run(i);
    }

    const results = await db.prepare(
      "SELECT value FROM items ORDER BY value LIMIT 3 OFFSET 5"
    ).all();

    assertEquals(results.length, 3);
    assertEquals(results[0].value, 6);
    assertEquals(results[1].value, 7);
    assertEquals(results[2].value, 8);

    db.close();
  },
});

// ============================================
// CASE Expression Tests
// ============================================

Deno.test({
  name: "Edge: CASE expression",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE scores (id INTEGER PRIMARY KEY, score INTEGER)");

    const insert = db.prepare("INSERT INTO scores (score) VALUES (?)");
    await insert.run(95);
    await insert.run(75);
    await insert.run(55);

    const results = await db.prepare(`
      SELECT score,
        CASE
          WHEN score >= 90 THEN 'A'
          WHEN score >= 70 THEN 'B'
          ELSE 'C'
        END as grade
      FROM scores ORDER BY score DESC
    `).all();

    assertEquals(results[0].grade, "A");
    assertEquals(results[1].grade, "B");
    assertEquals(results[2].grade, "C");

    db.close();
  },
});

// ============================================
// DISTINCT Tests
// ============================================

Deno.test({
  name: "Edge: DISTINCT values",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, category TEXT)");

    const insert = db.prepare("INSERT INTO items (category) VALUES (?)");
    await insert.run("A");
    await insert.run("B");
    await insert.run("A");
    await insert.run("C");
    await insert.run("B");

    const results = await db.prepare(
      "SELECT DISTINCT category FROM items ORDER BY category"
    ).all();

    assertEquals(results.length, 3);
    assertEquals(results[0].category, "A");
    assertEquals(results[1].category, "B");
    assertEquals(results[2].category, "C");

    db.close();
  },
});

// ============================================
// Coalesce and Nullif Tests
// ============================================

Deno.test({
  name: "Edge: COALESCE function",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, nickname TEXT, name TEXT)");

    await db.prepare("INSERT INTO users (nickname, name) VALUES (?, ?)").run(null, "Alice");
    await db.prepare("INSERT INTO users (nickname, name) VALUES (?, ?)").run("Bobby", "Bob");

    const results = await db.prepare(
      "SELECT COALESCE(nickname, name) as display FROM users ORDER BY id"
    ).all();

    assertEquals(results[0].display, "Alice");
    assertEquals(results[1].display, "Bobby");

    db.close();
  },
});

Deno.test({
  name: "Edge: NULLIF function",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT)");

    await db.prepare("INSERT INTO items (value) VALUES (?)").run("keep");
    await db.prepare("INSERT INTO items (value) VALUES (?)").run("N/A");

    const results = await db.prepare(
      "SELECT NULLIF(value, 'N/A') as clean FROM items ORDER BY id"
    ).all();

    assertEquals(results[0].clean, "keep");
    assertEquals(results[1].clean, null);

    db.close();
  },
});

// ============================================
// String Function Tests
// ============================================

Deno.test({
  name: "Edge: UPPER and LOWER functions",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)");

    await db.prepare("INSERT INTO items (name) VALUES (?)").run("Hello World");

    const result = await db.prepare(
      "SELECT UPPER(name) as upper, LOWER(name) as lower FROM items"
    ).get();

    assertEquals(result.upper, "HELLO WORLD");
    assertEquals(result.lower, "hello world");

    db.close();
  },
});

Deno.test({
  name: "Edge: LENGTH function",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, text TEXT)");

    await db.prepare("INSERT INTO items (text) VALUES (?)").run("Hello");

    const result = await db.prepare("SELECT LENGTH(text) as len FROM items").get();
    assertEquals(result.len, 5);

    db.close();
  },
});

Deno.test({
  name: "Edge: SUBSTR function",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, text TEXT)");

    await db.prepare("INSERT INTO items (text) VALUES (?)").run("Hello World");

    const result = await db.prepare("SELECT SUBSTR(text, 7, 5) as sub FROM items").get();
    assertEquals(result.sub, "World");

    db.close();
  },
});

Deno.test({
  name: "Edge: TRIM function",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, text TEXT)");

    await db.prepare("INSERT INTO items (text) VALUES (?)").run("  Hello  ");

    const result = await db.prepare("SELECT TRIM(text) as trimmed FROM items").get();
    assertEquals(result.trimmed, "Hello");

    db.close();
  },
});

// ============================================
// Date/Time Function Tests
// ============================================

Deno.test({
  name: "Edge: DATE function",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");

    const result = await db.prepare("SELECT DATE('2024-01-15 10:30:00') as d").get();
    assertEquals(result.d, "2024-01-15");

    db.close();
  },
});

Deno.test({
  name: "Edge: DATETIME function",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");

    const result = await db.prepare("SELECT DATETIME('now') as dt").get();
    assertExists(result.dt);
    // Should be in format YYYY-MM-DD HH:MM:SS
    assertEquals(result.dt.length, 19);

    db.close();
  },
});

// ============================================
// Math Function Tests
// ============================================

Deno.test({
  name: "Edge: ABS function",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");

    const result = await db.prepare("SELECT ABS(-42) as abs_val").get();
    assertEquals(result.abs_val, 42);

    db.close();
  },
});

Deno.test({
  name: "Edge: ROUND function",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");

    const result = await db.prepare("SELECT ROUND(3.14159, 2) as rounded").get();
    assertEquals(result.rounded, 3.14);

    db.close();
  },
});

// ============================================
// HAVING Clause Tests
// ============================================

Deno.test({
  name: "Edge: HAVING clause",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE sales (id INTEGER PRIMARY KEY, product TEXT, amount INTEGER)");

    const insert = db.prepare("INSERT INTO sales (product, amount) VALUES (?, ?)");
    await insert.run("A", 100);
    await insert.run("A", 200);
    await insert.run("B", 50);
    await insert.run("C", 150);
    await insert.run("C", 250);
    await insert.run("C", 100);

    const results = await db.prepare(`
      SELECT product, SUM(amount) as total
      FROM sales
      GROUP BY product
      HAVING SUM(amount) > 200
      ORDER BY total DESC
    `).all();

    assertEquals(results.length, 2);
    assertEquals(results[0].product, "C");
    assertEquals(results[0].total, 500);

    db.close();
  },
});

// ============================================
// UNION Tests
// ============================================

Deno.test({
  name: "Edge: UNION query",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE suppliers (id INTEGER PRIMARY KEY, name TEXT);
    `);

    await db.prepare("INSERT INTO customers (name) VALUES (?)").run("Alice");
    await db.prepare("INSERT INTO customers (name) VALUES (?)").run("Bob");
    await db.prepare("INSERT INTO suppliers (name) VALUES (?)").run("Bob");
    await db.prepare("INSERT INTO suppliers (name) VALUES (?)").run("Charlie");

    const results = await db.prepare(`
      SELECT name FROM customers
      UNION
      SELECT name FROM suppliers
      ORDER BY name
    `).all();

    // UNION removes duplicates
    assertEquals(results.length, 3);
    assertEquals(results[0].name, "Alice");
    assertEquals(results[1].name, "Bob");
    assertEquals(results[2].name, "Charlie");

    db.close();
  },
});

Deno.test({
  name: "Edge: UNION ALL keeps duplicates",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE a (id INTEGER PRIMARY KEY, value TEXT);
      CREATE TABLE b (id INTEGER PRIMARY KEY, value TEXT);
    `);

    await db.prepare("INSERT INTO a (value) VALUES (?)").run("X");
    await db.prepare("INSERT INTO b (value) VALUES (?)").run("X");

    const results = await db.prepare(`
      SELECT value FROM a
      UNION ALL
      SELECT value FROM b
    `).all();

    assertEquals(results.length, 2);

    db.close();
  },
});

// ============================================
// EXISTS Tests
// ============================================

Deno.test({
  name: "Edge: EXISTS subquery",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER);
    `);

    await db.prepare("INSERT INTO users (name) VALUES (?)").run("Alice");
    await db.prepare("INSERT INTO users (name) VALUES (?)").run("Bob");
    await db.prepare("INSERT INTO orders (user_id) VALUES (?)").run(1);

    const results = await db.prepare(`
      SELECT name FROM users u
      WHERE EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id)
    `).all();

    assertEquals(results.length, 1);
    assertEquals(results[0].name, "Alice");

    db.close();
  },
});

// ============================================
// Multiple Database Operations
// ============================================

Deno.test({
  name: "Edge: Multiple databases can be open",
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    const db1 = new Database(":memory:");
    const db2 = new Database(":memory:");

    db1.exec("CREATE TABLE t1 (id INTEGER)");
    db2.exec("CREATE TABLE t2 (id INTEGER)");

    // Both should work independently
    db1.prepare("INSERT INTO t1 VALUES (1)").run();
    db2.prepare("INSERT INTO t2 VALUES (2)").run();

    db1.close();
    db2.close();
  },
});
