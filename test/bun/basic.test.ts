/**
 * Basic SQLite Tests for Bun
 * Tests core database functionality using Bun's native SQLite
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

const testDbPath = "/tmp/test-basic-bun.db";

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

  test("creates file database", async () => {
    await cleanup();
    const db = new Database(testDbPath);
    expect(db).toBeDefined();
    db.close();
    await cleanup();
  });

  test("WAL mode can be enabled", async () => {
    await cleanup();
    const db = new Database(testDbPath);
    db.exec("PRAGMA journal_mode = WAL");
    const result = db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
    expect(result.journal_mode).toBe("wal");
    db.close();
    await cleanup();
  });
});

// ============================================
// Basic CRUD Operations Tests
// ============================================

describe("CRUD Operations", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)");
  });

  afterEach(() => {
    db.close();
  });

  test("inserts data with prepare/run", () => {
    const insert = db.prepare("INSERT INTO users (name, age) VALUES (?, ?)");
    const result = insert.run("Alice", 30);
    expect(result.changes).toBe(1);
    expect(Number(result.lastInsertRowid)).toBe(1);
  });

  test("retrieves single row with get", () => {
    db.prepare("INSERT INTO users (name, age) VALUES (?, ?)").run("Alice", 30);
    const user = db.prepare("SELECT * FROM users WHERE name = ?").get("Alice") as { name: string; age: number };
    expect(user).toBeDefined();
    expect(user.name).toBe("Alice");
    expect(user.age).toBe(30);
  });

  test("retrieves all rows with all", () => {
    db.prepare("INSERT INTO users (name, age) VALUES (?, ?)").run("Alice", 30);
    db.prepare("INSERT INTO users (name, age) VALUES (?, ?)").run("Bob", 25);

    const users = db.prepare("SELECT * FROM users ORDER BY name").all() as { name: string }[];
    expect(users.length).toBe(2);
    expect(users[0].name).toBe("Alice");
    expect(users[1].name).toBe("Bob");
  });

  test("updates data", () => {
    db.prepare("INSERT INTO users (name, age) VALUES (?, ?)").run("Alice", 30);
    const result = db.prepare("UPDATE users SET age = ? WHERE name = ?").run(31, "Alice");
    expect(result.changes).toBe(1);

    const user = db.prepare("SELECT age FROM users WHERE name = ?").get("Alice") as { age: number };
    expect(user.age).toBe(31);
  });

  test("deletes data", () => {
    db.prepare("INSERT INTO users (name, age) VALUES (?, ?)").run("Alice", 30);
    db.prepare("INSERT INTO users (name, age) VALUES (?, ?)").run("Bob", 25);

    const result = db.prepare("DELETE FROM users WHERE name = ?").run("Alice");
    expect(result.changes).toBe(1);

    const users = db.prepare("SELECT * FROM users").all() as any[];
    expect(users.length).toBe(1);
  });

  test("get returns null for no match", () => {
    const user = db.prepare("SELECT * FROM users WHERE name = ?").get("NonExistent");
    expect(user).toBeNull();
  });
});

// ============================================
// Exec Tests
// ============================================

describe("Exec Operations", () => {
  test("executes multiple statements", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE t1 (id INTEGER);
      CREATE TABLE t2 (id INTEGER);
      INSERT INTO t1 VALUES (1);
      INSERT INTO t2 VALUES (2);
    `);

    const t1 = db.prepare("SELECT * FROM t1").all() as any[];
    const t2 = db.prepare("SELECT * FROM t2").all() as any[];

    expect(t1.length).toBe(1);
    expect(t2.length).toBe(1);
    db.close();
  });

  test("creates table with multiple columns", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price REAL,
        quantity INTEGER DEFAULT 0
      )
    `);

    const info = db.prepare("PRAGMA table_info(products)").all() as any[];
    expect(info.length).toBe(4);
    db.close();
  });
});

// ============================================
// Transaction Tests
// ============================================

describe("Transactions", () => {
  test("commits transaction on success", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");

    const insert = db.prepare("INSERT INTO users (name) VALUES (?)");
    const insertMany = db.transaction((names: string[]) => {
      for (const name of names) {
        insert.run(name);
      }
      return names.length;
    });

    const count = insertMany(["Alice", "Bob", "Charlie"]);
    expect(count).toBe(3);

    const users = db.prepare("SELECT COUNT(*) as cnt FROM users").get() as { cnt: number };
    expect(users.cnt).toBe(3);
    db.close();
  });

  test("rolls back transaction on error", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT UNIQUE)");

    const insert = db.prepare("INSERT INTO users (name) VALUES (?)");
    const insertMany = db.transaction((names: string[]) => {
      for (const name of names) {
        insert.run(name);
      }
    });

    try {
      insertMany(["Alice", "Bob", "Alice"]); // Duplicate
    } catch {
      // Expected
    }

    const users = db.prepare("SELECT COUNT(*) as cnt FROM users").get() as { cnt: number };
    expect(users.cnt).toBe(0);
    db.close();
  });

  test("transaction returns value", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE counter (value INTEGER)");
    db.exec("INSERT INTO counter VALUES (0)");

    const increment = db.transaction((amount: number) => {
      db.prepare("UPDATE counter SET value = value + ?").run(amount);
      const result = db.prepare("SELECT value FROM counter").get() as { value: number };
      return result.value;
    });

    const result = increment(5);
    expect(result).toBe(5);
    db.close();
  });
});

// ============================================
// Iterator Tests
// ============================================

describe("Iterator", () => {
  test("iterates over results", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, value INTEGER)");

    const insert = db.prepare("INSERT INTO items (value) VALUES (?)");
    for (let i = 1; i <= 5; i++) {
      insert.run(i * 10);
    }

    const stmt = db.prepare("SELECT value FROM items ORDER BY id");
    const values: number[] = [];
    for (const row of stmt.iterate() as IterableIterator<{ value: number }>) {
      values.push(row.value);
    }

    expect(values).toEqual([10, 20, 30, 40, 50]);
    db.close();
  });
});

// ============================================
// Pragma Tests
// ============================================

describe("Pragma", () => {
  test("returns pragma value", () => {
    const db = new Database(":memory:");
    const result = db.prepare("PRAGMA compile_options").all();
    expect(Array.isArray(result)).toBe(true);
    db.close();
  });

  test("sets pragma value", () => {
    const db = new Database(":memory:");
    db.exec("PRAGMA cache_size = 5000");
    const result = db.prepare("PRAGMA cache_size").get() as { cache_size: number };
    expect(Math.abs(result.cache_size)).toBe(5000);
    db.close();
  });
});

// ============================================
// Statement Properties Tests
// ============================================

describe("Statement Properties", () => {
  test("columnNames returns column names", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER, name TEXT)");
    const stmt = db.prepare("SELECT id, name FROM t");
    expect(stmt.columnNames).toEqual(["id", "name"]);
    db.close();
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

  test("inTransaction is false by default", () => {
    const db = new Database(":memory:");
    expect(db.inTransaction).toBe(false);
    db.close();
  });
});
