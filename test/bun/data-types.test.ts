/**
 * Data Types Tests for Bun
 * Tests SQLite data type handling using Bun's native SQLite
 */

import { test, expect, describe, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

describe("Integer Types", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("positive integer", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (v INTEGER)");
    db.prepare("INSERT INTO t (v) VALUES (?)").run(42);
    const result = db.prepare("SELECT v FROM t").get() as { v: number };
    expect(result.v).toBe(42);
  });

  test("negative integer", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (v INTEGER)");
    db.prepare("INSERT INTO t (v) VALUES (?)").run(-42);
    const result = db.prepare("SELECT v FROM t").get() as { v: number };
    expect(result.v).toBe(-42);
  });

  test("zero", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (v INTEGER)");
    db.prepare("INSERT INTO t (v) VALUES (?)").run(0);
    const result = db.prepare("SELECT v FROM t").get() as { v: number };
    expect(result.v).toBe(0);
  });

  test("large integer", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (v INTEGER)");
    const big = 2147483647;
    db.prepare("INSERT INTO t (v) VALUES (?)").run(big);
    const result = db.prepare("SELECT v FROM t").get() as { v: number };
    expect(result.v).toBe(big);
  });
});

describe("Real/Float Types", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("positive float", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (v REAL)");
    db.prepare("INSERT INTO t (v) VALUES (?)").run(3.14159);
    const result = db.prepare("SELECT v FROM t").get() as { v: number };
    expect(Math.abs(result.v - 3.14159) < 0.0001).toBe(true);
  });

  test("negative float", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (v REAL)");
    db.prepare("INSERT INTO t (v) VALUES (?)").run(-2.718);
    const result = db.prepare("SELECT v FROM t").get() as { v: number };
    expect(Math.abs(result.v + 2.718) < 0.001).toBe(true);
  });

  test("very small float", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (v REAL)");
    db.prepare("INSERT INTO t (v) VALUES (?)").run(0.00001);
    const result = db.prepare("SELECT v FROM t").get() as { v: number };
    expect(result.v > 0 && result.v < 0.001).toBe(true);
  });
});

describe("Text Types", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("simple string", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (v TEXT)");
    db.prepare("INSERT INTO t (v) VALUES (?)").run("hello");
    const result = db.prepare("SELECT v FROM t").get() as { v: string };
    expect(result.v).toBe("hello");
  });

  test("unicode characters", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (v TEXT)");
    const unicode = "Hello 世界 🌍 مرحبا";
    db.prepare("INSERT INTO t (v) VALUES (?)").run(unicode);
    const result = db.prepare("SELECT v FROM t").get() as { v: string };
    expect(result.v).toBe(unicode);
  });

  test("newlines", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (v TEXT)");
    const text = "line1\nline2\rline3\r\nline4";
    db.prepare("INSERT INTO t (v) VALUES (?)").run(text);
    const result = db.prepare("SELECT v FROM t").get() as { v: string };
    expect(result.v).toBe(text);
  });

  test("tabs and whitespace", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (v TEXT)");
    const text = "col1\tcol2\t\tcol3";
    db.prepare("INSERT INTO t (v) VALUES (?)").run(text);
    const result = db.prepare("SELECT v FROM t").get() as { v: string };
    expect(result.v).toBe(text);
  });

  test("quotes", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (v TEXT)");
    const text = 'He said "Hello" and \'Goodbye\'';
    db.prepare("INSERT INTO t (v) VALUES (?)").run(text);
    const result = db.prepare("SELECT v FROM t").get() as { v: string };
    expect(result.v).toBe(text);
  });

  test("empty string", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (v TEXT)");
    db.prepare("INSERT INTO t (v) VALUES (?)").run("");
    const result = db.prepare("SELECT v FROM t").get() as { v: string };
    expect(result.v).toBe("");
  });
});

describe("Blob Types", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("Uint8Array", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (v BLOB)");
    const blob = new Uint8Array([1, 2, 3, 4, 5]);
    db.prepare("INSERT INTO t (v) VALUES (?)").run(blob);
    const result = db.prepare("SELECT v FROM t").get() as { v: Uint8Array };
    expect(result.v).toBeDefined();
  });

  test("empty Uint8Array", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (v BLOB)");
    const blob = new Uint8Array([]);
    db.prepare("INSERT INTO t (v) VALUES (?)").run(blob);
    const result = db.prepare("SELECT v FROM t").get() as { v: Uint8Array };
    expect(result.v).toBeDefined();
  });
});

describe("NULL Types", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("insert null", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (v TEXT)");
    db.prepare("INSERT INTO t (v) VALUES (?)").run(null);
    const result = db.prepare("SELECT v FROM t").get() as { v: null };
    expect(result.v).toBeNull();
  });

  test("default null", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
    db.prepare("INSERT INTO t (id) VALUES (1)").run();
    const result = db.prepare("SELECT v FROM t").get() as { v: null };
    expect(result.v).toBeNull();
  });

  test("IS NULL query", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (v TEXT)");
    db.prepare("INSERT INTO t (v) VALUES (?)").run(null);
    db.prepare("INSERT INTO t (v) VALUES (?)").run("value");
    const result = db.prepare("SELECT COUNT(*) as cnt FROM t WHERE v IS NULL").get() as { cnt: number };
    expect(result.cnt).toBe(1);
  });

  test("IS NOT NULL query", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (v TEXT)");
    db.prepare("INSERT INTO t (v) VALUES (?)").run(null);
    db.prepare("INSERT INTO t (v) VALUES (?)").run("value");
    const result = db.prepare("SELECT COUNT(*) as cnt FROM t WHERE v IS NOT NULL").get() as { cnt: number };
    expect(result.cnt).toBe(1);
  });
});

describe("Boolean Types", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("true as 1", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (v INTEGER)");
    db.prepare("INSERT INTO t (v) VALUES (?)").run(1);
    const result = db.prepare("SELECT v FROM t").get() as { v: number };
    expect(!!result.v).toBe(true);
  });

  test("false as 0", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (v INTEGER)");
    db.prepare("INSERT INTO t (v) VALUES (?)").run(0);
    const result = db.prepare("SELECT v FROM t").get() as { v: number };
    expect(!!result.v).toBe(false);
  });
});

describe("Type Coercion", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("number as text", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (v TEXT)");
    db.prepare("INSERT INTO t (v) VALUES (?)").run("42");
    const result = db.prepare("SELECT v + 0 as num FROM t").get() as { num: number };
    expect(result.num).toBe(42);
  });

  test("CAST to INTEGER", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (v TEXT)");
    db.prepare("INSERT INTO t (v) VALUES (?)").run("123");
    const result = db.prepare("SELECT CAST(v AS INTEGER) as num FROM t").get() as { num: number };
    expect(result.num).toBe(123);
  });

  test("CAST to REAL", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (v TEXT)");
    db.prepare("INSERT INTO t (v) VALUES (?)").run("3.14");
    const result = db.prepare("SELECT CAST(v AS REAL) as num FROM t").get() as { num: number };
    expect(Math.abs(result.num - 3.14) < 0.01).toBe(true);
  });

  test("CAST to TEXT", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (v INTEGER)");
    db.prepare("INSERT INTO t (v) VALUES (?)").run(42);
    const result = db.prepare("SELECT CAST(v AS TEXT) as txt FROM t").get() as { txt: string };
    expect(result.txt).toBe("42");
  });
});

describe("Mixed Types", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("multiple types in row", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (i INTEGER, r REAL, t TEXT)");
    db.prepare("INSERT INTO t (i, r, t) VALUES (?, ?, ?)").run(42, 3.14, "hello");
    const result = db.prepare("SELECT * FROM t").get() as { i: number; r: number; t: string };
    expect(result.i).toBe(42);
    expect(Math.abs(result.r - 3.14) < 0.01).toBe(true);
    expect(result.t).toBe("hello");
  });

  test("all NULL in row", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE t (a INTEGER, b TEXT, c REAL)");
    db.prepare("INSERT INTO t (a, b, c) VALUES (?, ?, ?)").run(null, null, null);
    const result = db.prepare("SELECT * FROM t").get() as { a: null; b: null; c: null };
    expect(result.a).toBeNull();
    expect(result.b).toBeNull();
    expect(result.c).toBeNull();
  });
});
