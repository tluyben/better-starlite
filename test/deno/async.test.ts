/**
 * Async SQLite functionality tests for Deno
 * Mirrors test/async.test.js for Node.js
 */

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createDatabase } from "../../deno-src/async-unified-deno.ts";

const testDbPath = "/tmp/test-async-deno.db";
const testNoWalPath = "/tmp/test-async-nowal-deno.db";

// Cleanup function
async function cleanup() {
  const files = [
    testDbPath,
    `${testDbPath}-wal`,
    `${testDbPath}-shm`,
    testNoWalPath,
  ];
  for (const file of files) {
    try {
      await Deno.remove(file);
    } catch {
      // File might not exist, that's ok
    }
  }
}

Deno.test({
  name: "Async SQLite: Local database with WAL mode",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await cleanup();

    const db = await createDatabase(testDbPath);

    // Create table
    await db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL
      )
    `);

    // Verify WAL mode is enabled by default
    const journalMode = await db.pragma("journal_mode");
    assertEquals(journalMode[0].journal_mode, "wal");

    // Test prepare and run
    const insert = await db.prepare("INSERT INTO users (name, email) VALUES (?, ?)");
    const result = await insert.run("Alice", "alice@test.com");
    assertEquals(result.changes, 1);
    assertEquals(Number(result.lastInsertRowid), 1);

    // Test get
    const select = await db.prepare("SELECT * FROM users WHERE email = ?");
    const user = await select.get("alice@test.com");
    assertEquals(user.name, "Alice");

    // Test all
    await insert.run("Bob", "bob@test.com");
    const selectAll = await db.prepare("SELECT * FROM users");
    const users = await selectAll.all();
    assertEquals(users.length, 2);

    // Test async transaction
    const insertMany = await db.transaction(async (userList: { name: string; email: string }[]) => {
      for (const u of userList) {
        await insert.run(u.name, u.email);
      }
      return userList.length;
    });

    const count = await insertMany([
      { name: "Charlie", email: "charlie@test.com" },
      { name: "Diana", email: "diana@test.com" },
    ]);

    assertEquals(count, 2);

    const allUsers = await selectAll.all();
    assertEquals(allUsers.length, 4);

    // Test iterator
    const iterator = await selectAll.iterate();
    let iterCount = 0;
    for await (const _row of iterator) {
      iterCount++;
    }
    assertEquals(iterCount, 4);

    await db.close();
    await cleanup();
  },
});

Deno.test({
  name: "Async SQLite: Memory database",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const memDb = await createDatabase(":memory:");
    await memDb.exec("CREATE TABLE test (id INTEGER)");
    const memStmt = await memDb.prepare("INSERT INTO test VALUES (?)");
    await memStmt.run(1);
    const memSelect = await memDb.prepare("SELECT * FROM test");
    const memResult = await memSelect.get();
    assertEquals(memResult.id, 1);
    await memDb.close();
  },
});

Deno.test({
  name: "Async SQLite: File database with WAL disabled",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await cleanup();

    const noWalDb = await createDatabase(testNoWalPath, { disableWAL: true });
    const noWalMode = await noWalDb.pragma("journal_mode");
    assertNotEquals(noWalMode[0].journal_mode, "wal");
    await noWalDb.close();

    await cleanup();
  },
});
