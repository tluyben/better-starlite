/**
 * Write-mutex concurrency safety tests for Node.js (Jest)
 * Mirrors test/deno/write-mutex.test.ts for Deno and test/bun/write-mutex.test.ts for Bun
 */

'use strict';

const { createDatabase } = require('../dist/async-unified');

describe('write-mutex', () => {
  // ============================================================
  // Concurrent inserts via stmt.run()
  // ============================================================

  test('100 concurrent stmt.run() inserts produce correct count', async () => {
    const db = await createDatabase(':memory:');
    await db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT)');
    const stmt = await db.prepare('INSERT INTO t (v) VALUES (?)');

    await Promise.all(
      Array.from({ length: 100 }, (_, i) => stmt.run(`val-${i}`))
    );

    const count = await (await db.prepare('SELECT COUNT(*) AS c FROM t')).get();
    expect(count.c).toBe(100);
    await db.close();
  });

  // ============================================================
  // Concurrent transactions
  // ============================================================

  test('10 concurrent transactions each inserting 10 rows (100 total)', async () => {
    const db = await createDatabase(':memory:');
    await db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, batch INTEGER, v TEXT)');

    const insertStmt = await db.prepare('INSERT INTO t (batch, v) VALUES (?, ?)');

    // Create a reusable transaction wrapper
    const batchInsert = await db.transaction(async (batchId) => {
      for (let i = 0; i < 10; i++) {
        await insertStmt.run(batchId, `item-${i}`);
      }
      return batchId;
    });

    // Run 10 transactions concurrently
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => batchInsert(i))
    );

    const count = await (await db.prepare('SELECT COUNT(*) AS c FROM t')).get();
    expect(count.c).toBe(100);
    await db.close();
  });

  // ============================================================
  // writeMutex is non-null for SQLite backends
  // ============================================================

  test('writeMutex is active (non-null) for SQLite backends', async () => {
    const db = await createDatabase(':memory:');
    // Access the private field via casting to verify the mutex is active for SQLite.
    const mutex = db.writeMutex;
    expect(mutex).not.toBeNull();
    expect(typeof mutex).toBe('object');
    await db.close();
  });

  // ============================================================
  // exec() serialization: concurrent exec calls don't corrupt state
  // ============================================================

  test('concurrent exec() calls produce correct row count', async () => {
    const db = await createDatabase(':memory:');
    await db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT)');

    // Fire 50 concurrent exec-based inserts
    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        db.exec(`INSERT INTO t (v) VALUES ('exec-${i}')`)
      )
    );

    const count = await (await db.prepare('SELECT COUNT(*) AS c FROM t')).get();
    expect(count.c).toBe(50);
    await db.close();
  });
});
