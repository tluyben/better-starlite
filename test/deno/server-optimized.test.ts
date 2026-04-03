/**
 * Server Optimization Tests for Deno
 * Tests SQLite pragma settings and optimizations
 */

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { Database } from "../../deno-src/database-deno.ts";

const testDbPath = "/tmp/test-server-opt-deno.db";

// Cleanup function
async function cleanup() {
  const files = [
    testDbPath,
    `${testDbPath}-wal`,
    `${testDbPath}-shm`,
  ];
  for (const file of files) {
    try {
      await Deno.remove(file);
    } catch {
      // File might not exist
    }
  }
}

Deno.test({
  name: "Server Optimization: WAL mode enabled by default",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await cleanup();
    const db = new Database(testDbPath);
    const result = db.pragma("journal_mode");
    assertEquals(result[0].journal_mode, "wal");
    db.close();
    await cleanup();
  },
});

Deno.test({
  name: "Server Optimization: WAL mode disabled when requested",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await cleanup();
    const db = new Database(testDbPath, { disableWAL: true });
    const result = db.pragma("journal_mode");
    assertNotEquals(result[0].journal_mode, "wal");
    db.close();
    await cleanup();
  },
});

Deno.test({
  name: "Server Optimization: In-memory database doesn't use WAL",
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    const db = new Database(":memory:");
    const result = db.pragma("journal_mode");
    // In-memory databases use 'memory' journal mode
    assertNotEquals(result[0].journal_mode, "wal");
    db.close();
  },
});

Deno.test({
  name: "Server Optimization: Pragma simple mode returns single value",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await cleanup();
    const db = new Database(testDbPath);

    // Simple mode should return just the value
    const simpleResult = db.pragma("journal_mode", { simple: true });
    assertEquals(simpleResult, "wal");

    // Non-simple mode should return array of objects
    const fullResult = db.pragma("journal_mode");
    assertEquals(Array.isArray(fullResult), true);
    assertEquals(fullResult[0].journal_mode, "wal");

    db.close();
    await cleanup();
  },
});

Deno.test({
  name: "Server Optimization: Foreign keys work correctly",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await cleanup();
    const db = new Database(testDbPath);

    // Enable foreign keys
    db.exec("PRAGMA foreign_keys = ON");

    // Create tables with foreign key constraint
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      );

      CREATE TABLE posts (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    // Insert a valid user
    await db.prepare("INSERT INTO users (name) VALUES (?)").run("Alice");

    // Insert a valid post (should work)
    await db.prepare("INSERT INTO posts (user_id, title) VALUES (?, ?)").run(1, "Valid Post");

    // Verify the valid post was inserted
    const posts = await db.prepare("SELECT * FROM posts").all();
    assertEquals(posts.length, 1);

    // Try to insert an invalid post (should fail if FK is enforced)
    let fkError = false;
    try {
      await db.prepare("INSERT INTO posts (user_id, title) VALUES (?, ?)").run(999, "Invalid Post");
    } catch (_e) {
      fkError = true;
    }

    // FK should be enforced in SQLite with PRAGMA foreign_keys = ON
    assertEquals(fkError, true);

    // Verify no invalid post was inserted
    const postsAfter = await db.prepare("SELECT * FROM posts").all();
    assertEquals(postsAfter.length, 1);

    db.close();
    await cleanup();
  },
});

Deno.test({
  name: "Server Optimization: Cache size can be set",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await cleanup();
    const db = new Database(testDbPath);

    // Set cache size
    db.exec("PRAGMA cache_size = 5000");

    const cacheSize = db.pragma("cache_size", { simple: true });
    assertEquals(Math.abs(cacheSize as number), 5000);

    db.close();
    await cleanup();
  },
});

Deno.test({
  name: "Server Optimization: Temp store can be set to memory",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await cleanup();
    const db = new Database(testDbPath);

    // Set temp_store to MEMORY (2)
    db.exec("PRAGMA temp_store = 2");

    const tempStore = db.pragma("temp_store", { simple: true });
    assertEquals(tempStore, 2);

    db.close();
    await cleanup();
  },
});

Deno.test({
  name: "Server Optimization: Busy timeout can be set",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await cleanup();
    const db = new Database(testDbPath);

    // Set busy timeout
    db.exec("PRAGMA busy_timeout = 5000");

    const timeout = db.pragma("busy_timeout", { simple: true });
    assertEquals(timeout, 5000);

    db.close();
    await cleanup();
  },
});

Deno.test({
  name: "Server Optimization: Synchronous mode can be set",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await cleanup();
    const db = new Database(testDbPath);

    // Set synchronous to NORMAL (1)
    db.exec("PRAGMA synchronous = 1");

    const syncMode = db.pragma("synchronous", { simple: true });
    assertEquals(syncMode, 1);

    db.close();
    await cleanup();
  },
});
