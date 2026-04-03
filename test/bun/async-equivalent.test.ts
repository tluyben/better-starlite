/**
 * Additional Tests for Bun (async-equivalent patterns)
 * Tests covering functionality similar to the async tests in Deno
 * Using Bun's synchronous native SQLite
 */

import { test, expect, describe, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

const testDbPath = "/tmp/test-async-equiv-bun.db";

// Cleanup function
async function cleanup() {
  const fs = await import("fs/promises");
  const files = [
    testDbPath,
    `${testDbPath}-wal`,
    `${testDbPath}-shm`,
  ];
  for (const file of files) {
    try {
      await fs.unlink(file);
    } catch {
      // File might not exist
    }
  }
}

// ============================================
// Database Creation Tests
// ============================================

describe("Database Creation", () => {
  test("creates in-memory database", () => {
    const db = new Database(":memory:");
    expect(db).toBeDefined();
    db.close();
  });

  test("creates file database with WAL", async () => {
    await cleanup();
    const db = new Database(testDbPath);
    db.exec("PRAGMA journal_mode = WAL");

    const mode = db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
    expect(mode.journal_mode).toBe("wal");

    db.close();
    await cleanup();
  });

  test("database with different options", async () => {
    await cleanup();
    const db = new Database(testDbPath);
    db.exec("PRAGMA journal_mode = DELETE");

    const mode = db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
    expect(mode.journal_mode).not.toBe("wal");

    db.close();
    await cleanup();
  });
});

// ============================================
// Complex Query Tests
// ============================================

describe("Complex Queries", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("JOIN queries", () => {
    db = new Database(":memory:");

    db.exec(`
      CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE books (id INTEGER PRIMARY KEY, author_id INTEGER, title TEXT);
    `);

    db.prepare("INSERT INTO authors (name) VALUES (?)").run("Alice");
    db.prepare("INSERT INTO authors (name) VALUES (?)").run("Bob");

    db.prepare("INSERT INTO books (author_id, title) VALUES (?, ?)").run(1, "Book A");
    db.prepare("INSERT INTO books (author_id, title) VALUES (?, ?)").run(1, "Book B");
    db.prepare("INSERT INTO books (author_id, title) VALUES (?, ?)").run(2, "Book C");

    const results = db.prepare(`
      SELECT a.name, b.title
      FROM authors a
      JOIN books b ON a.id = b.author_id
      ORDER BY a.name, b.title
    `).all() as { name: string; title: string }[];

    expect(results.length).toBe(3);
    expect(results[0].name).toBe("Alice");
    expect(results[0].title).toBe("Book A");
  });

  test("aggregate queries", () => {
    db = new Database(":memory:");

    db.exec("CREATE TABLE sales (id INTEGER PRIMARY KEY, product TEXT, amount INTEGER)");

    const insert = db.prepare("INSERT INTO sales (product, amount) VALUES (?, ?)");
    insert.run("Widget", 100);
    insert.run("Widget", 150);
    insert.run("Gadget", 200);
    insert.run("Gadget", 50);

    const results = db.prepare(`
      SELECT product, SUM(amount) as total, COUNT(*) as cnt
      FROM sales
      GROUP BY product
      ORDER BY total DESC
    `).all() as { product: string; total: number; cnt: number }[];

    expect(results.length).toBe(2);
    expect(results[0].product).toBe("Widget");
    expect(results[0].total).toBe(250);
    expect(results[0].cnt).toBe(2);
  });

  test("subqueries with aggregates", () => {
    db = new Database(":memory:");

    db.exec("CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price INTEGER)");

    const insert = db.prepare("INSERT INTO products (name, price) VALUES (?, ?)");
    insert.run("Cheap", 10);
    insert.run("Medium", 50);
    insert.run("Expensive", 100);
    insert.run("Very Expensive", 200);

    // Find products above average price
    const results = db.prepare(`
      SELECT name, price
      FROM products
      WHERE price > (SELECT AVG(price) FROM products)
      ORDER BY price
    `).all() as { name: string; price: number }[];

    expect(results.length).toBe(2);
    expect(results[0].name).toBe("Expensive");
    expect(results[1].name).toBe("Very Expensive");
  });
});

// ============================================
// Statement Properties Tests
// ============================================

describe("Statement Properties", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("columnNames property", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE test (id INTEGER, name TEXT, value REAL)");

    const stmt = db.prepare("SELECT id, name, value FROM test");
    expect(stmt.columnNames).toEqual(["id", "name", "value"]);
  });

  test("paramsCount property", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE test (id INTEGER, name TEXT)");

    const stmt1 = db.prepare("SELECT * FROM test WHERE id = ?");
    expect(stmt1.paramsCount).toBe(1);

    const stmt2 = db.prepare("INSERT INTO test (id, name) VALUES (?, ?)");
    expect(stmt2.paramsCount).toBe(2);

    const stmt3 = db.prepare("SELECT * FROM test");
    expect(stmt3.paramsCount).toBe(0);
  });
});

// ============================================
// Database Properties Tests
// ============================================

describe("Database Properties", () => {
  test("filename returns database path", async () => {
    await cleanup();
    const db = new Database(testDbPath);

    expect(db.filename).toBe(testDbPath);

    db.close();
    await cleanup();
  });

  test("inTransaction during transaction", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE test (id INTEGER)");

    expect(db.inTransaction).toBe(false);

    const txn = db.transaction(() => {
      // Inside transaction
      expect(db.inTransaction).toBe(true);
    });
    txn();

    expect(db.inTransaction).toBe(false);

    db.close();
  });

  test("memory property for in-memory db", () => {
    const memDb = new Database(":memory:");
    // Bun doesn't have a direct 'memory' property, but we can check filename
    expect(memDb.filename).toBe(":memory:");
    memDb.close();
  });
});

// ============================================
// Additional CRUD Patterns
// ============================================

describe("Additional CRUD", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("batch insert with transaction", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)");

    const insert = db.prepare("INSERT INTO users (name, email) VALUES (?, ?)");

    const insertMany = db.transaction((users: { name: string; email: string }[]) => {
      for (const user of users) {
        insert.run(user.name, user.email);
      }
      return users.length;
    });

    const count = insertMany([
      { name: "Alice", email: "alice@test.com" },
      { name: "Bob", email: "bob@test.com" },
      { name: "Charlie", email: "charlie@test.com" },
    ]);

    expect(count).toBe(3);

    const users = db.prepare("SELECT * FROM users").all() as any[];
    expect(users.length).toBe(3);
  });
});
