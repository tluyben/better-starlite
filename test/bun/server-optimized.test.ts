/**
 * Server Optimization Tests for Bun
 * Tests SQLite pragma settings and optimizations using Bun's native SQLite
 */

import { test, expect, describe } from "bun:test";
import { Database } from "bun:sqlite";

const testDbPath = "/tmp/test-server-opt-bun.db";

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

describe("Server Optimization", () => {
  test("WAL mode can be enabled", async () => {
    await cleanup();
    const db = new Database(testDbPath);
    db.exec("PRAGMA journal_mode = WAL");
    const result = db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
    expect(result.journal_mode).toBe("wal");
    db.close();
    await cleanup();
  });

  test("WAL mode can be disabled", async () => {
    await cleanup();
    const db = new Database(testDbPath);
    db.exec("PRAGMA journal_mode = DELETE");
    const result = db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
    expect(result.journal_mode).toBe("delete");
    db.close();
    await cleanup();
  });

  test("in-memory database uses memory journal mode", () => {
    const db = new Database(":memory:");
    const result = db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
    expect(result.journal_mode).toBe("memory");
    db.close();
  });

  test("foreign keys work correctly", async () => {
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
    db.prepare("INSERT INTO users (name) VALUES (?)").run("Alice");

    // Insert a valid post (should work)
    db.prepare("INSERT INTO posts (user_id, title) VALUES (?, ?)").run(1, "Valid Post");

    // Verify the valid post was inserted
    const posts = db.prepare("SELECT * FROM posts").all() as any[];
    expect(posts.length).toBe(1);

    // Try to insert an invalid post (should fail if FK is enforced)
    expect(() => {
      db.prepare("INSERT INTO posts (user_id, title) VALUES (?, ?)").run(999, "Invalid Post");
    }).toThrow();

    // Verify no invalid post was inserted
    const postsAfter = db.prepare("SELECT * FROM posts").all() as any[];
    expect(postsAfter.length).toBe(1);

    db.close();
    await cleanup();
  });

  test("cache size can be set", async () => {
    await cleanup();
    const db = new Database(testDbPath);

    // Set cache size
    db.exec("PRAGMA cache_size = 5000");

    const result = db.prepare("PRAGMA cache_size").get() as { cache_size: number };
    expect(Math.abs(result.cache_size)).toBe(5000);

    db.close();
    await cleanup();
  });

  test("temp store can be set to memory", async () => {
    await cleanup();
    const db = new Database(testDbPath);

    // Set temp_store to MEMORY (2)
    db.exec("PRAGMA temp_store = 2");

    const result = db.prepare("PRAGMA temp_store").get() as { temp_store: number };
    expect(result.temp_store).toBe(2);

    db.close();
    await cleanup();
  });

  test("busy timeout can be set", async () => {
    await cleanup();
    const db = new Database(testDbPath);

    // Set busy timeout
    db.exec("PRAGMA busy_timeout = 5000");

    const result = db.prepare("PRAGMA busy_timeout").get() as { timeout: number };
    expect(result.timeout).toBe(5000);

    db.close();
    await cleanup();
  });

  test("synchronous mode can be set", async () => {
    await cleanup();
    const db = new Database(testDbPath);

    // Set synchronous to NORMAL (1)
    db.exec("PRAGMA synchronous = 1");

    const result = db.prepare("PRAGMA synchronous").get() as { synchronous: number };
    expect(result.synchronous).toBe(1);

    db.close();
    await cleanup();
  });

  test("compile options available", () => {
    const db = new Database(":memory:");
    const result = db.prepare("PRAGMA compile_options").all();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length > 0).toBe(true);
    db.close();
  });
});
