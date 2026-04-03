/**
 * Comprehensive Async SQLite Tests for Deno
 * Tests the async database interface thoroughly
 */

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createDatabase, AsyncDatabase } from "../../deno-src/async-unified-deno.ts";

const testDbPath = "/tmp/test-async-comprehensive-deno.db";

// Cleanup function
async function cleanup() {
  const files = [
    testDbPath,
    `${testDbPath}-wal`,
    `${testDbPath}-shm`,
  ];
  for (const file of files) {
    try {
      await Deno.remove(file);
    } catch {
      // File might not exist
    }
  }
}

// ============================================
// Database Creation Tests
// ============================================

Deno.test({
  name: "Async Creation: createDatabase factory function",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = await createDatabase(":memory:");
    assertExists(db);
    await db.close();
  },
});

Deno.test({
  name: "Async Creation: File database with WAL",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await cleanup();
    const db = await createDatabase(testDbPath);

    const mode = await db.pragma("journal_mode");
    assertEquals(mode[0].journal_mode, "wal");

    await db.close();
    await cleanup();
  },
});

Deno.test({
  name: "Async Creation: Database with options",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await cleanup();
    const db = await createDatabase(testDbPath, { disableWAL: true });

    const mode = await db.pragma("journal_mode");
    assertEquals(mode[0].journal_mode !== "wal", true);

    await db.close();
    await cleanup();
  },
});

// ============================================
// Async CRUD Operations
// ============================================

Deno.test({
  name: "Async CRUD: Create table with exec",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = await createDatabase(":memory:");

    await db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE
      )
    `);

    const stmt = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");
    const tables = await stmt.all();
    assertEquals(tables.length, 1);

    await db.close();
  },
});

Deno.test({
  name: "Async CRUD: Insert and retrieve data",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = await createDatabase(":memory:");
    await db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)");

    const insert = await db.prepare("INSERT INTO users (name, age) VALUES (?, ?)");

    const result1 = await insert.run("Alice", 30);
    assertEquals(result1.changes, 1);
    assertEquals(Number(result1.lastInsertRowid), 1);

    const result2 = await insert.run("Bob", 25);
    assertEquals(result2.changes, 1);
    assertEquals(Number(result2.lastInsertRowid), 2);

    const select = await db.prepare("SELECT * FROM users ORDER BY id");
    const users = await select.all();

    assertEquals(users.length, 2);
    assertEquals(users[0].name, "Alice");
    assertEquals(users[0].age, 30);
    assertEquals(users[1].name, "Bob");
    assertEquals(users[1].age, 25);

    await db.close();
  },
});

Deno.test({
  name: "Async CRUD: Get single row",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = await createDatabase(":memory:");
    await db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");

    const insert = await db.prepare("INSERT INTO users (name) VALUES (?)");
    await insert.run("Alice");
    await insert.run("Bob");

    const select = await db.prepare("SELECT * FROM users WHERE name = ?");
    const user = await select.get("Alice");

    assertExists(user);
    assertEquals(user.name, "Alice");

    await db.close();
  },
});

Deno.test({
  name: "Async CRUD: Get returns undefined for no match",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = await createDatabase(":memory:");
    await db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");

    const select = await db.prepare("SELECT * FROM users WHERE name = ?");
    const user = await select.get("NonExistent");

    assertEquals(user, undefined);

    await db.close();
  },
});

Deno.test({
  name: "Async CRUD: Update rows",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = await createDatabase(":memory:");
    await db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, score INTEGER)");

    const insert = await db.prepare("INSERT INTO users (name, score) VALUES (?, ?)");
    await insert.run("Alice", 100);

    const update = await db.prepare("UPDATE users SET score = ? WHERE name = ?");
    const result = await update.run(150, "Alice");

    assertEquals(result.changes, 1);

    const select = await db.prepare("SELECT score FROM users WHERE name = ?");
    const user = await select.get("Alice");

    assertEquals(user.score, 150);

    await db.close();
  },
});

Deno.test({
  name: "Async CRUD: Delete rows",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = await createDatabase(":memory:");
    await db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");

    const insert = await db.prepare("INSERT INTO users (name) VALUES (?)");
    await insert.run("Alice");
    await insert.run("Bob");
    await insert.run("Charlie");

    const del = await db.prepare("DELETE FROM users WHERE name = ?");
    const result = await del.run("Bob");

    assertEquals(result.changes, 1);

    const select = await db.prepare("SELECT * FROM users ORDER BY name");
    const users = await select.all();

    assertEquals(users.length, 2);
    assertEquals(users[0].name, "Alice");
    assertEquals(users[1].name, "Charlie");

    await db.close();
  },
});

// ============================================
// Async Transaction Tests
// ============================================

Deno.test({
  name: "Async Transactions: Basic async transaction",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = await createDatabase(":memory:");
    await db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");

    const insert = await db.prepare("INSERT INTO users (name) VALUES (?)");

    const insertMany = await db.transaction(async (names: string[]) => {
      for (const name of names) {
        await insert.run(name);
      }
      return names.length;
    });

    const count = await insertMany(["Alice", "Bob", "Charlie"]);
    assertEquals(count, 3);

    const select = await db.prepare("SELECT COUNT(*) as cnt FROM users");
    const result = await select.get();
    assertEquals(result.cnt, 3);

    await db.close();
  },
});

Deno.test({
  name: "Async Transactions: Transaction with return value",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = await createDatabase(":memory:");
    await db.exec("CREATE TABLE counter (id INTEGER PRIMARY KEY, value INTEGER)");
    await db.exec("INSERT INTO counter (value) VALUES (0)");

    const increment = await db.transaction(async (amount: number) => {
      const update = await db.prepare("UPDATE counter SET value = value + ?");
      await update.run(amount);

      const select = await db.prepare("SELECT value FROM counter");
      const result = await select.get();
      return result.value;
    });

    const newValue = await increment(5);
    assertEquals(newValue, 5);

    const finalValue = await increment(10);
    assertEquals(finalValue, 15);

    await db.close();
  },
});

Deno.test({
  name: "Async Transactions: Rollback on error",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = await createDatabase(":memory:");
    await db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT UNIQUE)");

    const insert = await db.prepare("INSERT INTO users (name) VALUES (?)");

    const insertMany = await db.transaction(async (names: string[]) => {
      for (const name of names) {
        await insert.run(name);
      }
    });

    let errorThrown = false;
    try {
      await insertMany(["Alice", "Bob", "Alice"]); // Duplicate will fail
    } catch (_e) {
      errorThrown = true;
    }

    assertEquals(errorThrown, true);

    // Should have rolled back
    const select = await db.prepare("SELECT COUNT(*) as cnt FROM users");
    const result = await select.get();
    assertEquals(result.cnt, 0);

    await db.close();
  },
});

// ============================================
// Async Pragma Tests
// ============================================

Deno.test({
  name: "Async Pragma: Get pragma value",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await cleanup();
    const db = await createDatabase(testDbPath);

    const mode = await db.pragma("journal_mode");
    assertEquals(Array.isArray(mode), true);
    assertEquals(mode[0].journal_mode, "wal");

    await db.close();
    await cleanup();
  },
});

Deno.test({
  name: "Async Pragma: Simple mode",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await cleanup();
    const db = await createDatabase(testDbPath);

    const mode = await db.pragma("journal_mode", { simple: true });
    assertEquals(mode, "wal");

    await db.close();
    await cleanup();
  },
});

Deno.test({
  name: "Async Pragma: Set pragma value",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = await createDatabase(":memory:");

    // Set cache size
    await db.exec("PRAGMA cache_size = 5000");
    const cacheSize = await db.pragma("cache_size", { simple: true });
    assertEquals(Math.abs(cacheSize as number), 5000);

    await db.close();
  },
});

// ============================================
// Async Iterator Tests
// ============================================

Deno.test({
  name: "Async Iterator: iterate() returns async iterator",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = await createDatabase(":memory:");
    await db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");

    const insert = await db.prepare("INSERT INTO users (name) VALUES (?)");
    await insert.run("Alice");
    await insert.run("Bob");
    await insert.run("Charlie");

    const select = await db.prepare("SELECT * FROM users ORDER BY id");
    const iter = await select.iterate();

    const names: string[] = [];
    for await (const row of iter) {
      names.push((row as { name: string }).name);
    }

    assertEquals(names, ["Alice", "Bob", "Charlie"]);

    await db.close();
  },
});

// ============================================
// Async Complex Query Tests
// ============================================

Deno.test({
  name: "Async Complex: JOIN queries",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = await createDatabase(":memory:");

    await db.exec(`
      CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE books (id INTEGER PRIMARY KEY, author_id INTEGER, title TEXT);
    `);

    const insertAuthor = await db.prepare("INSERT INTO authors (name) VALUES (?)");
    await insertAuthor.run("Alice");
    await insertAuthor.run("Bob");

    const insertBook = await db.prepare("INSERT INTO books (author_id, title) VALUES (?, ?)");
    await insertBook.run(1, "Book A");
    await insertBook.run(1, "Book B");
    await insertBook.run(2, "Book C");

    const select = await db.prepare(`
      SELECT a.name, b.title
      FROM authors a
      JOIN books b ON a.id = b.author_id
      ORDER BY a.name, b.title
    `);
    const results = await select.all();

    assertEquals(results.length, 3);
    assertEquals(results[0].name, "Alice");
    assertEquals(results[0].title, "Book A");

    await db.close();
  },
});

Deno.test({
  name: "Async Complex: Aggregate queries",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = await createDatabase(":memory:");

    await db.exec("CREATE TABLE sales (id INTEGER PRIMARY KEY, product TEXT, amount INTEGER)");

    const insert = await db.prepare("INSERT INTO sales (product, amount) VALUES (?, ?)");
    await insert.run("Widget", 100);
    await insert.run("Widget", 150);
    await insert.run("Gadget", 200);
    await insert.run("Gadget", 50);

    const select = await db.prepare(`
      SELECT product, SUM(amount) as total, COUNT(*) as cnt
      FROM sales
      GROUP BY product
      ORDER BY total DESC
    `);
    const results = await select.all();

    assertEquals(results.length, 2);
    assertEquals(results[0].product, "Widget");
    assertEquals(results[0].total, 250);
    assertEquals(results[0].cnt, 2);

    await db.close();
  },
});

Deno.test({
  name: "Async Complex: Subqueries",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = await createDatabase(":memory:");

    await db.exec("CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price INTEGER)");

    const insert = await db.prepare("INSERT INTO products (name, price) VALUES (?, ?)");
    await insert.run("Cheap", 10);
    await insert.run("Medium", 50);
    await insert.run("Expensive", 100);
    await insert.run("Very Expensive", 200);

    // Find products above average price
    const select = await db.prepare(`
      SELECT name, price
      FROM products
      WHERE price > (SELECT AVG(price) FROM products)
      ORDER BY price
    `);
    const results = await select.all();

    assertEquals(results.length, 2);
    assertEquals(results[0].name, "Expensive");
    assertEquals(results[1].name, "Very Expensive");

    await db.close();
  },
});

// ============================================
// Database Properties Tests
// ============================================

Deno.test({
  name: "Async Properties: getName",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await cleanup();
    const db = await createDatabase(testDbPath);

    const name = await db.getName();
    assertEquals(name, testDbPath);

    await db.close();
    await cleanup();
  },
});

Deno.test({
  name: "Async Properties: getOpen",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = await createDatabase(":memory:");

    const openBefore = await db.getOpen();
    assertEquals(openBefore, true);

    await db.close();

    const openAfter = await db.getOpen();
    assertEquals(openAfter, false);
  },
});

Deno.test({
  name: "Async Properties: getMemory",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const memDb = await createDatabase(":memory:");
    const isMem = await memDb.getMemory();
    assertEquals(isMem, true);
    await memDb.close();

    await cleanup();
    const fileDb = await createDatabase(testDbPath);
    const isFileMem = await fileDb.getMemory();
    assertEquals(isFileMem, false);
    await fileDb.close();
    await cleanup();
  },
});

// ============================================
// Statement Properties Tests
// ============================================

Deno.test({
  name: "Async Statement: source property",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = await createDatabase(":memory:");

    const sql = "SELECT * FROM sqlite_master";
    const stmt = await db.prepare(sql);

    assertEquals(stmt.source, sql);

    await db.close();
  },
});

Deno.test({
  name: "Async Statement: reader property",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = await createDatabase(":memory:");
    await db.exec("CREATE TABLE test (id INTEGER)");

    const selectStmt = await db.prepare("SELECT * FROM test");
    assertEquals(selectStmt.reader, true);

    const insertStmt = await db.prepare("INSERT INTO test (id) VALUES (?)");
    assertEquals(insertStmt.reader, false);

    await db.close();
  },
});
