/**
 * Basic SQLite functionality tests for Deno
 * Mirrors test/basic.test.js for Node.js
 */

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { Database } from "../../deno-src/database-deno.ts";

const testDbPath = "/tmp/test-basic-deno.db";
const testNoWalPath = "/tmp/test-nowal-deno.db";

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
  name: "Basic SQLite: Local database with WAL mode",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await cleanup();

    const db = new Database(testDbPath);

    // Create table
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL
      )
    `);

    // Verify WAL mode is enabled by default
    const journalMode = db.pragma("journal_mode");
    assertEquals(journalMode[0].journal_mode, "wal");

    // Test prepare and run
    const insert = db.prepare("INSERT INTO users (name, email) VALUES (?, ?)");
    const result = await insert.run("Alice", "alice@test.com");
    assertEquals(result.changes, 1);
    assertEquals(Number(result.lastInsertRowid), 1);

    // Test get
    const select = db.prepare("SELECT * FROM users WHERE email = ?");
    const user = await select.get("alice@test.com");
    assertEquals(user.name, "Alice");

    // Test all
    await insert.run("Bob", "bob@test.com");
    const selectAll = db.prepare("SELECT * FROM users");
    const users = await selectAll.all();
    assertEquals(users.length, 2);

    // Test transaction
    const insertMany = db.transaction(async (userList: { name: string; email: string }[]) => {
      for (const u of userList) {
        await insert.run(u.name, u.email);
      }
    });

    await insertMany([
      { name: "Charlie", email: "charlie@test.com" },
      { name: "Diana", email: "diana@test.com" },
    ]);

    const allUsers = await selectAll.all();
    assertEquals(allUsers.length, 4);

    db.close();
    await cleanup();
  },
});

Deno.test({
  name: "Basic SQLite: Memory database without WAL",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const memDb = new Database(":memory:");
    memDb.exec("CREATE TABLE test (id INTEGER)");
    await memDb.prepare("INSERT INTO test VALUES (?)").run(1);
    const memResult = await memDb.prepare("SELECT * FROM test").get();
    assertEquals(memResult.id, 1);
    memDb.close();
  },
});

Deno.test({
  name: "Basic SQLite: File database with WAL disabled",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await cleanup();

    const noWalDb = new Database(testNoWalPath, { disableWAL: true });
    const noWalMode = noWalDb.pragma("journal_mode");
    assertNotEquals(noWalMode[0].journal_mode, "wal");
    noWalDb.close();

    await cleanup();
  },
});
