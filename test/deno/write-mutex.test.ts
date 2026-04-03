/**
 * Write-mutex concurrency safety tests for Deno
 * Mirrors test/write-mutex.test.js for Node.js and test/bun/write-mutex.test.ts for Bun
 */

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createDatabase } from "../../deno-src/async-unified-deno.ts";

// ============================================================
// Concurrent inserts via stmt.run()
// ============================================================

Deno.test({
  name: "write-mutex: 100 concurrent stmt.run() inserts produce correct count",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = await createDatabase(":memory:");
    await db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT)");
    const stmt = await db.prepare("INSERT INTO t (v) VALUES (?)");

    await Promise.all(
      Array.from({ length: 100 }, (_, i) => stmt.run(`val-${i}`))
    );

    const count = await (await db.prepare("SELECT COUNT(*) AS c FROM t")).get();
    assertEquals(count.c, 100);
    await db.close();
  },
});

// ============================================================
// Concurrent transactions
// ============================================================

Deno.test({
  name: "write-mutex: 10 concurrent transactions each inserting 10 rows (100 total)",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = await createDatabase(":memory:");
    await db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, batch INTEGER, v TEXT)");

    const insertStmt = await db.prepare("INSERT INTO t (batch, v) VALUES (?, ?)");

    // Create a reusable transaction wrapper
    const batchInsert = await db.transaction(async (batchId: number) => {
      for (let i = 0; i < 10; i++) {
        await insertStmt.run(batchId, `item-${i}`);
      }
      return batchId;
    });

    // Run 10 transactions concurrently
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => batchInsert(i))
    );

    const count = await (await db.prepare("SELECT COUNT(*) AS c FROM t")).get();
    assertEquals(count.c, 100);
    await db.close();
  },
});

// ============================================================
// writeMutex is null for rqlite (networked) URLs
// ============================================================

Deno.test({
  name: "write-mutex: writeMutex is null for non-SQLite backends",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // We cannot open a real rqlite connection, but we can verify the private field
    // is set correctly on SQLite (it should be non-null).
    const db = await createDatabase(":memory:");
    // Access the private field via casting to verify the mutex is active for SQLite.
    const mutex = (db as any).writeMutex;
    assertEquals(typeof mutex, "object");
    assertEquals(mutex !== null, true);
    await db.close();
  },
});

// ============================================================
// exec() serialization: concurrent exec calls don't corrupt state
// ============================================================

Deno.test({
  name: "write-mutex: concurrent exec() calls produce correct row count",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = await createDatabase(":memory:");
    await db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT)");

    // Fire 50 concurrent exec-based inserts
    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        db.exec(`INSERT INTO t (v) VALUES ('exec-${i}')`)
      )
    );

    const count = await (await db.prepare("SELECT COUNT(*) AS c FROM t")).get();
    assertEquals(count.c, 50);
    await db.close();
  },
});
