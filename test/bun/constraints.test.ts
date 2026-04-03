/**
 * Constraint Tests for Bun
 * Tests SQLite constraint handling using Bun's native SQLite
 */

import { test, expect, describe, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

describe("PRIMARY KEY Constraints", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("auto increment", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT)");
    db.prepare("INSERT INTO t (v) VALUES (?)").run("a");
    db.prepare("INSERT INTO t (v) VALUES (?)").run("b");

    const results = db.prepare("SELECT * FROM t ORDER BY id").all() as { id: number }[];
    expect(results.length).toBe(2);
    expect(results[0].id).toBe(1);
    expect(results[1].id).toBe(2);
  });

  test("uniqueness enforced", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
    db.prepare("INSERT INTO t (id, v) VALUES (?, ?)").run(1, "a");

    expect(() => {
      db.prepare("INSERT INTO t (id, v) VALUES (?, ?)").run(1, "b");
    }).toThrow();
  });

  test("composite PRIMARY KEY", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (a INTEGER, b INTEGER, v TEXT, PRIMARY KEY (a, b))");
    db.prepare("INSERT INTO t (a, b, v) VALUES (?, ?, ?)").run(1, 1, "a");
    db.prepare("INSERT INTO t (a, b, v) VALUES (?, ?, ?)").run(1, 2, "b");
    db.prepare("INSERT INTO t (a, b, v) VALUES (?, ?, ?)").run(2, 1, "c");

    expect(() => {
      db.prepare("INSERT INTO t (a, b, v) VALUES (?, ?, ?)").run(1, 1, "d");
    }).toThrow();

    const result = db.prepare("SELECT COUNT(*) as cnt FROM t").get() as { cnt: number };
    expect(result.cnt).toBe(3);
  });
});

describe("UNIQUE Constraints", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("prevents duplicates", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, email TEXT UNIQUE)");
    db.prepare("INSERT INTO t (email) VALUES (?)").run("test@example.com");

    expect(() => {
      db.prepare("INSERT INTO t (email) VALUES (?)").run("test@example.com");
    }).toThrow();
  });

  test("NULL allowed multiple times", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, email TEXT UNIQUE)");
    db.prepare("INSERT INTO t (email) VALUES (?)").run(null);
    db.prepare("INSERT INTO t (email) VALUES (?)").run(null);

    const result = db.prepare("SELECT COUNT(*) as cnt FROM t").get() as { cnt: number };
    expect(result.cnt).toBe(2);
  });

  test("composite UNIQUE", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (a TEXT, b TEXT, UNIQUE(a, b))");
    db.prepare("INSERT INTO t (a, b) VALUES (?, ?)").run("x", "1");
    db.prepare("INSERT INTO t (a, b) VALUES (?, ?)").run("x", "2");
    db.prepare("INSERT INTO t (a, b) VALUES (?, ?)").run("y", "1");

    expect(() => {
      db.prepare("INSERT INTO t (a, b) VALUES (?, ?)").run("x", "1");
    }).toThrow();
  });
});

describe("NOT NULL Constraints", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("prevents null", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");

    expect(() => {
      db.prepare("INSERT INTO t (name) VALUES (?)").run(null);
    }).toThrow();
  });

  test("empty string allowed", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
    db.prepare("INSERT INTO t (name) VALUES (?)").run("");

    const result = db.prepare("SELECT name FROM t").get() as { name: string };
    expect(result.name).toBe("");
  });
});

describe("DEFAULT Constraints", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("value used when omitted", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, status TEXT DEFAULT 'pending')");
    db.prepare("INSERT INTO t (id) VALUES (1)").run();

    const result = db.prepare("SELECT status FROM t").get() as { status: string };
    expect(result.status).toBe("pending");
  });

  test("numeric default", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, count INTEGER DEFAULT 0)");
    db.prepare("INSERT INTO t (id) VALUES (1)").run();

    const result = db.prepare("SELECT count FROM t").get() as { count: number };
    expect(result.count).toBe(0);
  });

  test("CURRENT_TIMESTAMP", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, created TEXT DEFAULT CURRENT_TIMESTAMP)");
    db.prepare("INSERT INTO t (id) VALUES (1)").run();

    const result = db.prepare("SELECT created FROM t").get() as { created: string };
    expect(result.created.length > 10).toBe(true);
  });
});

describe("CHECK Constraints", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("valid value passes", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, age INTEGER CHECK(age >= 0))");
    db.prepare("INSERT INTO t (age) VALUES (?)").run(25);

    const result = db.prepare("SELECT age FROM t").get() as { age: number };
    expect(result.age).toBe(25);
  });

  test("invalid value fails", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, age INTEGER CHECK(age >= 0))");

    expect(() => {
      db.prepare("INSERT INTO t (age) VALUES (?)").run(-5);
    }).toThrow();
  });

  test("complex expression", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, min INTEGER, max INTEGER, CHECK(min <= max))");
    db.prepare("INSERT INTO t (min, max) VALUES (?, ?)").run(5, 10);

    expect(() => {
      db.prepare("INSERT INTO t (min, max) VALUES (?, ?)").run(10, 5);
    }).toThrow();
  });
});

describe("FOREIGN KEY Constraints", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("valid reference", () => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(`
      CREATE TABLE parent (id INTEGER PRIMARY KEY);
      CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));
    `);
    db.prepare("INSERT INTO parent (id) VALUES (?)").run(1);
    db.prepare("INSERT INTO child (parent_id) VALUES (?)").run(1);

    const result = db.prepare("SELECT COUNT(*) as cnt FROM child").get() as { cnt: number };
    expect(result.cnt).toBe(1);
  });

  test("invalid reference blocked", () => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(`
      CREATE TABLE parent (id INTEGER PRIMARY KEY);
      CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));
    `);

    expect(() => {
      db.prepare("INSERT INTO child (parent_id) VALUES (?)").run(999);
    }).toThrow();
  });

  test("NULL allowed", () => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(`
      CREATE TABLE parent (id INTEGER PRIMARY KEY);
      CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));
    `);
    db.prepare("INSERT INTO child (parent_id) VALUES (?)").run(null);

    const result = db.prepare("SELECT parent_id FROM child").get() as { parent_id: null };
    expect(result.parent_id).toBeNull();
  });
});

describe("ON CONFLICT", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("INSERT OR REPLACE", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
    db.prepare("INSERT INTO t (id, v) VALUES (?, ?)").run(1, "original");
    db.prepare("INSERT OR REPLACE INTO t (id, v) VALUES (?, ?)").run(1, "replaced");

    const result = db.prepare("SELECT v FROM t WHERE id = 1").get() as { v: string };
    expect(result.v).toBe("replaced");
  });

  test("INSERT OR IGNORE", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
    db.prepare("INSERT INTO t (id, v) VALUES (?, ?)").run(1, "original");
    db.prepare("INSERT OR IGNORE INTO t (id, v) VALUES (?, ?)").run(1, "ignored");

    const result = db.prepare("SELECT v FROM t WHERE id = 1").get() as { v: string };
    expect(result.v).toBe("original");
  });

  test("UPSERT with ON CONFLICT", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
    db.prepare("INSERT INTO t (id, v) VALUES (?, ?)").run(1, "original");
    db.prepare(`
      INSERT INTO t (id, v) VALUES (?, ?)
      ON CONFLICT(id) DO UPDATE SET v = excluded.v
    `).run(1, "updated");

    const result = db.prepare("SELECT v FROM t WHERE id = 1").get() as { v: string };
    expect(result.v).toBe("updated");
  });
});
