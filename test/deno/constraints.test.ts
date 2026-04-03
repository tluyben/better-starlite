/**
 * Constraint Tests for Deno
 * Tests SQLite constraint handling
 */

import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { Database } from "../../deno-src/database-deno.ts";

// ============================================
// PRIMARY KEY Constraint Tests
// ============================================

Deno.test({
  name: "Constraints: PRIMARY KEY - auto increment",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT)");

    await db.prepare("INSERT INTO t (v) VALUES (?)").run("a");
    await db.prepare("INSERT INTO t (v) VALUES (?)").run("b");

    const results = await db.prepare("SELECT * FROM t ORDER BY id").all();
    assertEquals(results.length, 2);
    assertEquals(results[0].id, 1);
    assertEquals(results[1].id, 2);

    db.close();
  },
});

Deno.test({
  name: "Constraints: PRIMARY KEY - uniqueness enforced",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");

    await db.prepare("INSERT INTO t (id, v) VALUES (?, ?)").run(1, "a");

    let error = false;
    try {
      await db.prepare("INSERT INTO t (id, v) VALUES (?, ?)").run(1, "b");
    } catch (_e) {
      error = true;
    }
    assertEquals(error, true);

    db.close();
  },
});

Deno.test({
  name: "Constraints: Composite PRIMARY KEY",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (a INTEGER, b INTEGER, v TEXT, PRIMARY KEY (a, b))");

    await db.prepare("INSERT INTO t (a, b, v) VALUES (?, ?, ?)").run(1, 1, "a");
    await db.prepare("INSERT INTO t (a, b, v) VALUES (?, ?, ?)").run(1, 2, "b");
    await db.prepare("INSERT INTO t (a, b, v) VALUES (?, ?, ?)").run(2, 1, "c");

    let error = false;
    try {
      await db.prepare("INSERT INTO t (a, b, v) VALUES (?, ?, ?)").run(1, 1, "d");
    } catch (_e) {
      error = true;
    }
    assertEquals(error, true);

    const results = await db.prepare("SELECT COUNT(*) as cnt FROM t").get();
    assertEquals(results.cnt, 3);

    db.close();
  },
});

// ============================================
// UNIQUE Constraint Tests
// ============================================

Deno.test({
  name: "Constraints: UNIQUE - prevents duplicates",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, email TEXT UNIQUE)");

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
  name: "Constraints: UNIQUE - NULL allowed multiple times",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, email TEXT UNIQUE)");

    await db.prepare("INSERT INTO t (email) VALUES (?)").run(null);
    await db.prepare("INSERT INTO t (email) VALUES (?)").run(null);

    const results = await db.prepare("SELECT COUNT(*) as cnt FROM t").get();
    assertEquals(results.cnt, 2);

    db.close();
  },
});

Deno.test({
  name: "Constraints: Composite UNIQUE",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (a TEXT, b TEXT, UNIQUE(a, b))");

    await db.prepare("INSERT INTO t (a, b) VALUES (?, ?)").run("x", "1");
    await db.prepare("INSERT INTO t (a, b) VALUES (?, ?)").run("x", "2");
    await db.prepare("INSERT INTO t (a, b) VALUES (?, ?)").run("y", "1");

    let error = false;
    try {
      await db.prepare("INSERT INTO t (a, b) VALUES (?, ?)").run("x", "1");
    } catch (_e) {
      error = true;
    }
    assertEquals(error, true);

    db.close();
  },
});

// ============================================
// NOT NULL Constraint Tests
// ============================================

Deno.test({
  name: "Constraints: NOT NULL - prevents null",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");

    let error = false;
    try {
      await db.prepare("INSERT INTO t (name) VALUES (?)").run(null);
    } catch (_e) {
      error = true;
    }
    assertEquals(error, true);

    db.close();
  },
});

Deno.test({
  name: "Constraints: NOT NULL - empty string allowed",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");

    await db.prepare("INSERT INTO t (name) VALUES (?)").run("");

    const results = await db.prepare("SELECT name FROM t").get();
    assertEquals(results.name, "");

    db.close();
  },
});

// ============================================
// DEFAULT Constraint Tests
// ============================================

Deno.test({
  name: "Constraints: DEFAULT - value used when omitted",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, status TEXT DEFAULT 'pending')");

    db.prepare("INSERT INTO t (id) VALUES (1)").run();

    const result = await db.prepare("SELECT status FROM t").get();
    assertEquals(result.status, "pending");

    db.close();
  },
});

Deno.test({
  name: "Constraints: DEFAULT - numeric default",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, count INTEGER DEFAULT 0)");

    db.prepare("INSERT INTO t (id) VALUES (1)").run();

    const result = await db.prepare("SELECT count FROM t").get();
    assertEquals(result.count, 0);

    db.close();
  },
});

Deno.test({
  name: "Constraints: DEFAULT - CURRENT_TIMESTAMP",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, created TEXT DEFAULT CURRENT_TIMESTAMP)");

    db.prepare("INSERT INTO t (id) VALUES (1)").run();

    const result = await db.prepare("SELECT created FROM t").get();
    // Should be a timestamp string
    assertEquals(result.created.length > 10, true);

    db.close();
  },
});

// ============================================
// CHECK Constraint Tests
// ============================================

Deno.test({
  name: "Constraints: CHECK - valid value passes",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, age INTEGER CHECK(age >= 0))");

    await db.prepare("INSERT INTO t (age) VALUES (?)").run(25);

    const result = await db.prepare("SELECT age FROM t").get();
    assertEquals(result.age, 25);

    db.close();
  },
});

Deno.test({
  name: "Constraints: CHECK - invalid value fails",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, age INTEGER CHECK(age >= 0))");

    let error = false;
    try {
      await db.prepare("INSERT INTO t (age) VALUES (?)").run(-5);
    } catch (_e) {
      error = true;
    }
    assertEquals(error, true);

    db.close();
  },
});

Deno.test({
  name: "Constraints: CHECK - complex expression",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, min INTEGER, max INTEGER, CHECK(min <= max))");

    await db.prepare("INSERT INTO t (min, max) VALUES (?, ?)").run(5, 10);

    let error = false;
    try {
      await db.prepare("INSERT INTO t (min, max) VALUES (?, ?)").run(10, 5);
    } catch (_e) {
      error = true;
    }
    assertEquals(error, true);

    db.close();
  },
});

// ============================================
// FOREIGN KEY Constraint Tests
// ============================================

Deno.test({
  name: "Constraints: FOREIGN KEY - valid reference",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(`
      CREATE TABLE parent (id INTEGER PRIMARY KEY);
      CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));
    `);

    await db.prepare("INSERT INTO parent (id) VALUES (?)").run(1);
    await db.prepare("INSERT INTO child (parent_id) VALUES (?)").run(1);

    const result = await db.prepare("SELECT COUNT(*) as cnt FROM child").get();
    assertEquals(result.cnt, 1);

    db.close();
  },
});

Deno.test({
  name: "Constraints: FOREIGN KEY - invalid reference blocked",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(`
      CREATE TABLE parent (id INTEGER PRIMARY KEY);
      CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));
    `);

    let error = false;
    try {
      await db.prepare("INSERT INTO child (parent_id) VALUES (?)").run(999);
    } catch (_e) {
      error = true;
    }
    assertEquals(error, true);

    db.close();
  },
});

Deno.test({
  name: "Constraints: FOREIGN KEY - NULL allowed",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(`
      CREATE TABLE parent (id INTEGER PRIMARY KEY);
      CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));
    `);

    await db.prepare("INSERT INTO child (parent_id) VALUES (?)").run(null);

    const result = await db.prepare("SELECT parent_id FROM child").get();
    assertEquals(result.parent_id, null);

    db.close();
  },
});

// ============================================
// ON CONFLICT Tests
// ============================================

Deno.test({
  name: "Constraints: INSERT OR REPLACE",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");

    await db.prepare("INSERT INTO t (id, v) VALUES (?, ?)").run(1, "original");
    await db.prepare("INSERT OR REPLACE INTO t (id, v) VALUES (?, ?)").run(1, "replaced");

    const result = await db.prepare("SELECT v FROM t WHERE id = 1").get();
    assertEquals(result.v, "replaced");

    db.close();
  },
});

Deno.test({
  name: "Constraints: INSERT OR IGNORE",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");

    await db.prepare("INSERT INTO t (id, v) VALUES (?, ?)").run(1, "original");
    await db.prepare("INSERT OR IGNORE INTO t (id, v) VALUES (?, ?)").run(1, "ignored");

    const result = await db.prepare("SELECT v FROM t WHERE id = 1").get();
    assertEquals(result.v, "original");

    db.close();
  },
});

Deno.test({
  name: "Constraints: UPSERT with ON CONFLICT",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");

    await db.prepare("INSERT INTO t (id, v) VALUES (?, ?)").run(1, "original");
    await db.prepare(`
      INSERT INTO t (id, v) VALUES (?, ?)
      ON CONFLICT(id) DO UPDATE SET v = excluded.v
    `).run(1, "updated");

    const result = await db.prepare("SELECT v FROM t WHERE id = 1").get();
    assertEquals(result.v, "updated");

    db.close();
  },
});
