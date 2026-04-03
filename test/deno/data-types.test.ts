/**
 * Data Types Tests for Deno
 * Tests SQLite data type handling
 */

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { Database } from "../../deno-src/database-deno.ts";

// ============================================
// Integer Type Tests
// ============================================

Deno.test({
  name: "Types: Integer - positive",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (v INTEGER)");
    await db.prepare("INSERT INTO t (v) VALUES (?)").run(42);
    const result = await db.prepare("SELECT v FROM t").get();
    assertEquals(result.v, 42);
    db.close();
  },
});

Deno.test({
  name: "Types: Integer - negative",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (v INTEGER)");
    await db.prepare("INSERT INTO t (v) VALUES (?)").run(-42);
    const result = await db.prepare("SELECT v FROM t").get();
    assertEquals(result.v, -42);
    db.close();
  },
});

Deno.test({
  name: "Types: Integer - zero",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (v INTEGER)");
    await db.prepare("INSERT INTO t (v) VALUES (?)").run(0);
    const result = await db.prepare("SELECT v FROM t").get();
    assertEquals(result.v, 0);
    db.close();
  },
});

// ============================================
// Real/Float Type Tests
// ============================================

Deno.test({
  name: "Types: Real - positive float",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (v REAL)");
    await db.prepare("INSERT INTO t (v) VALUES (?)").run(3.14159);
    const result = await db.prepare("SELECT v FROM t").get();
    assertEquals(Math.abs(result.v - 3.14159) < 0.0001, true);
    db.close();
  },
});

Deno.test({
  name: "Types: Real - negative float",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (v REAL)");
    await db.prepare("INSERT INTO t (v) VALUES (?)").run(-2.718);
    const result = await db.prepare("SELECT v FROM t").get();
    assertEquals(Math.abs(result.v + 2.718) < 0.001, true);
    db.close();
  },
});

Deno.test({
  name: "Types: Real - very small float",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (v REAL)");
    await db.prepare("INSERT INTO t (v) VALUES (?)").run(0.00001);
    const result = await db.prepare("SELECT v FROM t").get();
    assertEquals(result.v > 0 && result.v < 0.001, true);
    db.close();
  },
});

// ============================================
// Text Type Tests
// ============================================

Deno.test({
  name: "Types: Text - simple string",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (v TEXT)");
    await db.prepare("INSERT INTO t (v) VALUES (?)").run("hello");
    const result = await db.prepare("SELECT v FROM t").get();
    assertEquals(result.v, "hello");
    db.close();
  },
});

Deno.test({
  name: "Types: Text - unicode characters",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (v TEXT)");
    const unicode = "Hello 世界 🌍 مرحبا";
    await db.prepare("INSERT INTO t (v) VALUES (?)").run(unicode);
    const result = await db.prepare("SELECT v FROM t").get();
    assertEquals(result.v, unicode);
    db.close();
  },
});

Deno.test({
  name: "Types: Text - newlines",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (v TEXT)");
    const text = "line1\nline2\rline3\r\nline4";
    await db.prepare("INSERT INTO t (v) VALUES (?)").run(text);
    const result = await db.prepare("SELECT v FROM t").get();
    assertEquals(result.v, text);
    db.close();
  },
});

Deno.test({
  name: "Types: Text - tabs and whitespace",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (v TEXT)");
    const text = "col1\tcol2\t\tcol3";
    await db.prepare("INSERT INTO t (v) VALUES (?)").run(text);
    const result = await db.prepare("SELECT v FROM t").get();
    assertEquals(result.v, text);
    db.close();
  },
});

Deno.test({
  name: "Types: Text - quotes",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (v TEXT)");
    const text = 'He said "Hello" and \'Goodbye\'';
    await db.prepare("INSERT INTO t (v) VALUES (?)").run(text);
    const result = await db.prepare("SELECT v FROM t").get();
    assertEquals(result.v, text);
    db.close();
  },
});

// ============================================
// Blob Type Tests
// ============================================

Deno.test({
  name: "Types: Blob - Uint8Array",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (v BLOB)");
    const blob = new Uint8Array([1, 2, 3, 4, 5]);
    await db.prepare("INSERT INTO t (v) VALUES (?)").run(blob);
    const result = await db.prepare("SELECT v FROM t").get();
    assertExists(result.v);
    db.close();
  },
});

Deno.test({
  name: "Types: Blob - empty",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (v BLOB)");
    const blob = new Uint8Array([]);
    await db.prepare("INSERT INTO t (v) VALUES (?)").run(blob);
    const result = await db.prepare("SELECT v FROM t").get();
    assertExists(result.v);
    db.close();
  },
});

// ============================================
// NULL Type Tests
// ============================================

Deno.test({
  name: "Types: NULL - insert null",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (v TEXT)");
    await db.prepare("INSERT INTO t (v) VALUES (?)").run(null);
    const result = await db.prepare("SELECT v FROM t").get();
    assertEquals(result.v, null);
    db.close();
  },
});

Deno.test({
  name: "Types: NULL - default null",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
    db.prepare("INSERT INTO t (id) VALUES (1)").run();
    const result = await db.prepare("SELECT v FROM t").get();
    assertEquals(result.v, null);
    db.close();
  },
});

Deno.test({
  name: "Types: NULL - IS NULL query",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (v TEXT)");
    await db.prepare("INSERT INTO t (v) VALUES (?)").run(null);
    await db.prepare("INSERT INTO t (v) VALUES (?)").run("value");
    const result = await db.prepare("SELECT COUNT(*) as cnt FROM t WHERE v IS NULL").get();
    assertEquals(result.cnt, 1);
    db.close();
  },
});

Deno.test({
  name: "Types: NULL - IS NOT NULL query",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (v TEXT)");
    await db.prepare("INSERT INTO t (v) VALUES (?)").run(null);
    await db.prepare("INSERT INTO t (v) VALUES (?)").run("value");
    const result = await db.prepare("SELECT COUNT(*) as cnt FROM t WHERE v IS NOT NULL").get();
    assertEquals(result.cnt, 1);
    db.close();
  },
});

// ============================================
// Boolean Type Tests (stored as INTEGER in SQLite)
// ============================================

Deno.test({
  name: "Types: Boolean - true as 1",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (v INTEGER)");
    await db.prepare("INSERT INTO t (v) VALUES (?)").run(1);
    const result = await db.prepare("SELECT v FROM t").get();
    assertEquals(!!result.v, true);
    db.close();
  },
});

Deno.test({
  name: "Types: Boolean - false as 0",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (v INTEGER)");
    await db.prepare("INSERT INTO t (v) VALUES (?)").run(0);
    const result = await db.prepare("SELECT v FROM t").get();
    assertEquals(!!result.v, false);
    db.close();
  },
});

// ============================================
// Type Coercion Tests
// ============================================

Deno.test({
  name: "Types: Coercion - number as text",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (v TEXT)");
    await db.prepare("INSERT INTO t (v) VALUES (?)").run("42");
    const result = await db.prepare("SELECT v + 0 as num FROM t").get();
    assertEquals(result.num, 42);
    db.close();
  },
});

Deno.test({
  name: "Types: Coercion - CAST to INTEGER",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (v TEXT)");
    await db.prepare("INSERT INTO t (v) VALUES (?)").run("123");
    const result = await db.prepare("SELECT CAST(v AS INTEGER) as num FROM t").get();
    assertEquals(result.num, 123);
    db.close();
  },
});

Deno.test({
  name: "Types: Coercion - CAST to REAL",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (v TEXT)");
    await db.prepare("INSERT INTO t (v) VALUES (?)").run("3.14");
    const result = await db.prepare("SELECT CAST(v AS REAL) as num FROM t").get();
    assertEquals(Math.abs(result.num - 3.14) < 0.01, true);
    db.close();
  },
});

Deno.test({
  name: "Types: Coercion - CAST to TEXT",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (v INTEGER)");
    await db.prepare("INSERT INTO t (v) VALUES (?)").run(42);
    const result = await db.prepare("SELECT CAST(v AS TEXT) as txt FROM t").get();
    assertEquals(result.txt, "42");
    db.close();
  },
});

// ============================================
// Mixed Type Tests
// ============================================

Deno.test({
  name: "Types: Mixed - multiple types in row",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (i INTEGER, r REAL, t TEXT)");
    await db.prepare("INSERT INTO t (i, r, t) VALUES (?, ?, ?)").run(42, 3.14, "hello");
    const result = await db.prepare("SELECT * FROM t").get();
    assertEquals(result.i, 42);
    assertEquals(Math.abs(result.r - 3.14) < 0.01, true);
    assertEquals(result.t, "hello");
    db.close();
  },
});

Deno.test({
  name: "Types: Mixed - all NULL in row",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (a INTEGER, b TEXT, c REAL)");
    await db.prepare("INSERT INTO t (a, b, c) VALUES (?, ?, ?)").run(null, null, null);
    const result = await db.prepare("SELECT * FROM t").get();
    assertEquals(result.a, null);
    assertEquals(result.b, null);
    assertEquals(result.c, null);
    db.close();
  },
});
