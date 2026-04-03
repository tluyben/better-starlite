/**
 * Comprehensive SQLite Tests for Bun
 * Tests all major SQLite operations using Bun's native SQLite
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

const testDbPath = "/tmp/test-comprehensive-bun.db";

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
// Basic CRUD Operations
// ============================================

describe("CRUD Operations", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("create table", () => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        age INTEGER
      )
    `);

    // Verify table exists
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    ).all() as any[];
    expect(tables.length).toBe(1);
  });

  test("insert single row", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");

    const stmt = db.prepare("INSERT INTO users (name) VALUES (?)");
    const result = stmt.run("Alice");

    expect(result.changes).toBe(1);
    expect(Number(result.lastInsertRowid)).toBe(1);
  });

  test("insert multiple rows", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");

    const stmt = db.prepare("INSERT INTO users (name) VALUES (?)");
    stmt.run("Alice");
    stmt.run("Bob");
    stmt.run("Charlie");

    const count = db.prepare("SELECT COUNT(*) as cnt FROM users").get() as { cnt: number };
    expect(count.cnt).toBe(3);
  });

  test("select single row with get()", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)");
    db.prepare("INSERT INTO users (name, age) VALUES (?, ?)").run("Alice", 30);

    const user = db.prepare("SELECT * FROM users WHERE name = ?").get("Alice") as { name: string; age: number };
    expect(user).toBeDefined();
    expect(user.name).toBe("Alice");
    expect(user.age).toBe(30);
  });

  test("select all rows with all()", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");

    const insert = db.prepare("INSERT INTO users (name) VALUES (?)");
    insert.run("Alice");
    insert.run("Bob");
    insert.run("Charlie");

    const users = db.prepare("SELECT * FROM users ORDER BY name").all() as { name: string }[];
    expect(users.length).toBe(3);
    expect(users[0].name).toBe("Alice");
    expect(users[1].name).toBe("Bob");
    expect(users[2].name).toBe("Charlie");
  });

  test("update rows", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)");
    db.prepare("INSERT INTO users (name, age) VALUES (?, ?)").run("Alice", 30);

    const result = db.prepare("UPDATE users SET age = ? WHERE name = ?").run(31, "Alice");
    expect(result.changes).toBe(1);

    const user = db.prepare("SELECT age FROM users WHERE name = ?").get("Alice") as { age: number };
    expect(user.age).toBe(31);
  });

  test("delete rows", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");

    const insert = db.prepare("INSERT INTO users (name) VALUES (?)");
    insert.run("Alice");
    insert.run("Bob");

    const result = db.prepare("DELETE FROM users WHERE name = ?").run("Alice");
    expect(result.changes).toBe(1);

    const users = db.prepare("SELECT * FROM users").all() as any[];
    expect(users.length).toBe(1);
    expect(users[0].name).toBe("Bob");
  });

  test("get returns null for no match", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");

    const user = db.prepare("SELECT * FROM users WHERE name = ?").get("NonExistent");
    expect(user).toBeNull();
  });
});

// ============================================
// Transaction Tests
// ============================================

describe("Transactions", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("basic transaction commits", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");

    const insert = db.prepare("INSERT INTO users (name) VALUES (?)");
    const insertMany = db.transaction((names: string[]) => {
      for (const name of names) {
        insert.run(name);
      }
    });

    insertMany(["Alice", "Bob", "Charlie"]);

    const users = db.prepare("SELECT * FROM users").all() as any[];
    expect(users.length).toBe(3);
  });

  test("transaction with return value", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");

    const insert = db.prepare("INSERT INTO users (name) VALUES (?)");
    const insertMany = db.transaction((names: string[]) => {
      let count = 0;
      for (const name of names) {
        insert.run(name);
        count++;
      }
      return count;
    });

    const result = insertMany(["Alice", "Bob", "Charlie"]);
    expect(result).toBe(3);
  });

  test("rollback on error", () => {
    db = new Database(":memory:");
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

    const users = db.prepare("SELECT * FROM users").all() as any[];
    expect(users.length).toBe(0);
  });
});

// ============================================
// Data Type Tests
// ============================================

describe("Data Types", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("NULL values", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)");

    db.prepare("INSERT INTO test (value) VALUES (?)").run(null);

    const row = db.prepare("SELECT * FROM test").get() as { value: null };
    expect(row.value).toBeNull();
  });

  test("integer values", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, value INTEGER)");

    db.prepare("INSERT INTO test (value) VALUES (?)").run(42);
    db.prepare("INSERT INTO test (value) VALUES (?)").run(-100);
    db.prepare("INSERT INTO test (value) VALUES (?)").run(0);

    const rows = db.prepare("SELECT value FROM test ORDER BY id").all() as { value: number }[];
    expect(rows[0].value).toBe(42);
    expect(rows[1].value).toBe(-100);
    expect(rows[2].value).toBe(0);
  });

  test("real/float values", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, value REAL)");

    db.prepare("INSERT INTO test (value) VALUES (?)").run(3.14159);
    db.prepare("INSERT INTO test (value) VALUES (?)").run(-2.5);

    const rows = db.prepare("SELECT value FROM test ORDER BY id").all() as { value: number }[];
    expect(Math.abs(rows[0].value - 3.14159) < 0.0001).toBe(true);
    expect(rows[1].value).toBe(-2.5);
  });

  test("text values with special characters", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)");

    const specialStrings = [
      "Hello, World!",
      "Unicode: 你好世界 🌍",
      "Quotes: 'single' and \"double\"",
      "Newlines:\nand\ttabs",
      "Empty string: ",
    ];

    const insert = db.prepare("INSERT INTO test (value) VALUES (?)");
    for (const str of specialStrings) {
      insert.run(str);
    }

    const rows = db.prepare("SELECT value FROM test ORDER BY id").all() as { value: string }[];
    for (let i = 0; i < specialStrings.length; i++) {
      expect(rows[i].value).toBe(specialStrings[i]);
    }
  });

  test("BLOB values", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, data BLOB)");

    const blobData = new Uint8Array([1, 2, 3, 4, 5]);
    db.prepare("INSERT INTO test (data) VALUES (?)").run(blobData);

    const row = db.prepare("SELECT data FROM test").get() as { data: Uint8Array };
    expect(row.data).toBeDefined();
  });
});

// ============================================
// Query Parameter Tests
// ============================================

describe("Parameters", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("multiple positional parameters", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER, city TEXT)");

    db.prepare("INSERT INTO users (name, age, city) VALUES (?, ?, ?)").run("Alice", 30, "NYC");

    const user = db.prepare("SELECT * FROM users WHERE name = ? AND age = ?").get("Alice", 30) as { name: string; age: number; city: string };
    expect(user.name).toBe("Alice");
    expect(user.age).toBe(30);
    expect(user.city).toBe("NYC");
  });

  test("WHERE IN clause", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");

    const insert = db.prepare("INSERT INTO users (name) VALUES (?)");
    insert.run("Alice");
    insert.run("Bob");
    insert.run("Charlie");
    insert.run("Diana");

    // SQLite doesn't support array parameters directly, use multiple ?
    const users = db.prepare("SELECT * FROM users WHERE name IN (?, ?) ORDER BY name").all("Alice", "Charlie") as { name: string }[];
    expect(users.length).toBe(2);
    expect(users[0].name).toBe("Alice");
    expect(users[1].name).toBe("Charlie");
  });
});

// ============================================
// Database State Tests
// ============================================

describe("Database State", () => {
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

// ============================================
// Error Handling Tests
// ============================================

describe("Errors", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("invalid SQL syntax", () => {
    db = new Database(":memory:");

    expect(() => {
      db.exec("SELEKT * FORM users");
    }).toThrow();
  });

  test("table does not exist", () => {
    db = new Database(":memory:");

    expect(() => {
      db.exec("SELECT * FROM nonexistent_table");
    }).toThrow();
  });

  test("unique constraint violation", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE)");

    db.prepare("INSERT INTO users (email) VALUES (?)").run("test@example.com");

    expect(() => {
      db.prepare("INSERT INTO users (email) VALUES (?)").run("test@example.com");
    }).toThrow();
  });

  test("NOT NULL constraint violation", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");

    expect(() => {
      db.prepare("INSERT INTO users (name) VALUES (?)").run(null);
    }).toThrow();
  });
});

// ============================================
// Aggregate Function Tests
// ============================================

describe("Aggregates", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("COUNT function", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");

    const insert = db.prepare("INSERT INTO users (name) VALUES (?)");
    insert.run("Alice");
    insert.run("Bob");
    insert.run("Charlie");

    const result = db.prepare("SELECT COUNT(*) as cnt FROM users").get() as { cnt: number };
    expect(result.cnt).toBe(3);
  });

  test("SUM function", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE sales (id INTEGER PRIMARY KEY, amount INTEGER)");

    const insert = db.prepare("INSERT INTO sales (amount) VALUES (?)");
    insert.run(100);
    insert.run(200);
    insert.run(300);

    const result = db.prepare("SELECT SUM(amount) as total FROM sales").get() as { total: number };
    expect(result.total).toBe(600);
  });

  test("AVG function", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE scores (id INTEGER PRIMARY KEY, score INTEGER)");

    const insert = db.prepare("INSERT INTO scores (score) VALUES (?)");
    insert.run(80);
    insert.run(90);
    insert.run(100);

    const result = db.prepare("SELECT AVG(score) as avg FROM scores").get() as { avg: number };
    expect(result.avg).toBe(90);
  });

  test("MIN and MAX functions", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE numbers (id INTEGER PRIMARY KEY, value INTEGER)");

    const insert = db.prepare("INSERT INTO numbers (value) VALUES (?)");
    insert.run(5);
    insert.run(10);
    insert.run(3);
    insert.run(8);

    const result = db.prepare("SELECT MIN(value) as min, MAX(value) as max FROM numbers").get() as { min: number; max: number };
    expect(result.min).toBe(3);
    expect(result.max).toBe(10);
  });

  test("GROUP BY clause", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE orders (id INTEGER PRIMARY KEY, category TEXT, amount INTEGER)");

    const insert = db.prepare("INSERT INTO orders (category, amount) VALUES (?, ?)");
    insert.run("Electronics", 100);
    insert.run("Electronics", 200);
    insert.run("Books", 50);
    insert.run("Books", 30);
    insert.run("Books", 20);

    const results = db.prepare(
      "SELECT category, COUNT(*) as cnt, SUM(amount) as total FROM orders GROUP BY category ORDER BY category"
    ).all() as { category: string; cnt: number; total: number }[];

    expect(results.length).toBe(2);
    expect(results[0].category).toBe("Books");
    expect(results[0].cnt).toBe(3);
    expect(results[0].total).toBe(100);
    expect(results[1].category).toBe("Electronics");
    expect(results[1].cnt).toBe(2);
    expect(results[1].total).toBe(300);
  });
});

// ============================================
// Join Tests
// ============================================

describe("Joins", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("INNER JOIN", () => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER, product TEXT);
    `);

    db.prepare("INSERT INTO users (name) VALUES (?)").run("Alice");
    db.prepare("INSERT INTO users (name) VALUES (?)").run("Bob");
    db.prepare("INSERT INTO orders (user_id, product) VALUES (?, ?)").run(1, "Laptop");
    db.prepare("INSERT INTO orders (user_id, product) VALUES (?, ?)").run(1, "Phone");
    db.prepare("INSERT INTO orders (user_id, product) VALUES (?, ?)").run(2, "Tablet");

    const results = db.prepare(`
      SELECT u.name, o.product
      FROM users u
      INNER JOIN orders o ON u.id = o.user_id
      ORDER BY u.name, o.product
    `).all() as { name: string; product: string }[];

    expect(results.length).toBe(3);
    expect(results[0].name).toBe("Alice");
    expect(results[0].product).toBe("Laptop");
  });

  test("LEFT JOIN", () => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER, product TEXT);
    `);

    db.prepare("INSERT INTO users (name) VALUES (?)").run("Alice");
    db.prepare("INSERT INTO users (name) VALUES (?)").run("Bob");
    db.prepare("INSERT INTO users (name) VALUES (?)").run("Charlie"); // No orders
    db.prepare("INSERT INTO orders (user_id, product) VALUES (?, ?)").run(1, "Laptop");
    db.prepare("INSERT INTO orders (user_id, product) VALUES (?, ?)").run(2, "Phone");

    const results = db.prepare(`
      SELECT u.name, o.product
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      ORDER BY u.name
    `).all() as { name: string; product: string | null }[];

    expect(results.length).toBe(3);
    // Charlie has no orders, so product should be null
    const charlie = results.find((r) => r.name === "Charlie");
    expect(charlie).toBeDefined();
    expect(charlie?.product).toBeNull();
  });
});

// ============================================
// Subquery Tests
// ============================================

describe("Subqueries", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("scalar subquery", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE scores (id INTEGER PRIMARY KEY, score INTEGER)");

    const insert = db.prepare("INSERT INTO scores (score) VALUES (?)");
    insert.run(80);
    insert.run(90);
    insert.run(100);
    insert.run(70);

    // Find scores above average
    const results = db.prepare(
      "SELECT * FROM scores WHERE score > (SELECT AVG(score) FROM scores) ORDER BY score"
    ).all() as { score: number }[];

    expect(results.length).toBe(2);
    expect(results[0].score).toBe(90);
    expect(results[1].score).toBe(100);
  });
});

// ============================================
// Index Tests
// ============================================

describe("Indexes", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("create and use index", () => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, name TEXT);
      CREATE INDEX idx_users_email ON users(email);
    `);

    // Insert some data
    const insert = db.prepare("INSERT INTO users (email, name) VALUES (?, ?)");
    insert.run("alice@test.com", "Alice");
    insert.run("bob@test.com", "Bob");

    // Query should use the index (we can't easily verify this, but it should work)
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get("alice@test.com") as { name: string };
    expect(user.name).toBe("Alice");
  });
});

// ============================================
// Statement Iteration Tests
// ============================================

describe("Iteration", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("iterate() returns iterator", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");

    const insert = db.prepare("INSERT INTO users (name) VALUES (?)");
    insert.run("Alice");
    insert.run("Bob");
    insert.run("Charlie");

    const stmt = db.prepare("SELECT * FROM users ORDER BY id");
    const iter = stmt.iterate();

    const names: string[] = [];
    for (const row of iter as IterableIterator<{ name: string }>) {
      names.push(row.name);
    }

    expect(names).toEqual(["Alice", "Bob", "Charlie"]);
  });
});
