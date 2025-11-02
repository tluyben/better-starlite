const { Database } = require('../dist');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('Server Optimization Tests', () => {
  let testDbPath;

  beforeEach(() => {
    // Create a temporary database file
    testDbPath = path.join(os.tmpdir(), `test-${Date.now()}.db`);
  });

  afterEach(() => {
    // Clean up test database
    try {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
      // Also clean up WAL and SHM files
      if (fs.existsSync(testDbPath + '-wal')) {
        fs.unlinkSync(testDbPath + '-wal');
      }
      if (fs.existsSync(testDbPath + '-shm')) {
        fs.unlinkSync(testDbPath + '-shm');
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('Default behavior (serverOptimized: true)', () => {
    test('Should enable foreign_keys by default', () => {
      const db = new Database(testDbPath);
      const result = db.pragma('foreign_keys', { simple: true });
      expect(result).toBe(1);
      db.close();
    });

    test('Should enable recursive_triggers by default', () => {
      const db = new Database(testDbPath);
      const result = db.pragma('recursive_triggers', { simple: true });
      expect(result).toBe(1);
      db.close();
    });

    test('Should set journal_mode to WAL by default', () => {
      const db = new Database(testDbPath);
      const result = db.pragma('journal_mode', { simple: true });
      expect(result).toBe('wal');
      db.close();
    });

    test('Should set synchronous to NORMAL by default', () => {
      const db = new Database(testDbPath);
      const result = db.pragma('synchronous', { simple: true });
      expect(result).toBe(1); // NORMAL = 1
      db.close();
    });

    test('Should set cache_size to 10000 by default', () => {
      const db = new Database(testDbPath);
      const result = db.pragma('cache_size', { simple: true });
      // SQLite returns 10000 (positive) when set as pages
      expect(Math.abs(result)).toBe(10000);
      db.close();
    });

    test('Should set temp_store to MEMORY by default', () => {
      const db = new Database(testDbPath);
      const result = db.pragma('temp_store', { simple: true });
      expect(result).toBe(2); // MEMORY = 2
      db.close();
    });

    test('Should set busy_timeout to 30000 by default', () => {
      const db = new Database(testDbPath);
      const result = db.pragma('busy_timeout', { simple: true });
      expect(result).toBe(30000);
      db.close();
    });

    test('Should set mmap_size to 268435456 by default', () => {
      const db = new Database(testDbPath);
      const result = db.pragma('mmap_size', { simple: true });
      expect(result).toBe(268435456);
      db.close();
    });

    test('Should set wal_autocheckpoint to 1000 by default', () => {
      const db = new Database(testDbPath);
      const result = db.pragma('wal_autocheckpoint', { simple: true });
      expect(result).toBe(1000);
      db.close();
    });
  });

  describe('Explicit serverOptimized: true', () => {
    test('Should enable all optimizations when explicitly set to true', () => {
      const db = new Database(testDbPath, { serverOptimized: true });

      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(db.pragma('recursive_triggers', { simple: true })).toBe(1);
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(db.pragma('synchronous', { simple: true })).toBe(1);
      expect(Math.abs(db.pragma('cache_size', { simple: true }))).toBe(10000);
      expect(db.pragma('temp_store', { simple: true })).toBe(2);
      expect(db.pragma('busy_timeout', { simple: true })).toBe(30000);
      expect(db.pragma('mmap_size', { simple: true })).toBe(268435456);
      expect(db.pragma('wal_autocheckpoint', { simple: true })).toBe(1000);

      db.close();
    });
  });

  describe('Disabled optimization (serverOptimized: false)', () => {
    test('Should not enable optimizations when serverOptimized is false', () => {
      const db = new Database(testDbPath, { serverOptimized: false });

      // These should be default SQLite values, not our optimized values
      // Note: better-sqlite3 v9+ enables foreign_keys by default, so we only check recursive_triggers
      expect(db.pragma('recursive_triggers', { simple: true })).toBe(0);

      // Cache size should be default (not 10000)
      const cacheSize = Math.abs(db.pragma('cache_size', { simple: true }));
      expect(cacheSize).not.toBe(10000);

      // Temp store should be default (not MEMORY=2)
      expect(db.pragma('temp_store', { simple: true })).not.toBe(2);

      db.close();
    });

    test('Should respect disableWAL when serverOptimized is false', () => {
      const db = new Database(testDbPath, {
        serverOptimized: false,
        disableWAL: true
      });

      const result = db.pragma('journal_mode', { simple: true });
      expect(result).not.toBe('wal');

      db.close();
    });
  });

  describe('In-memory databases', () => {
    test('Should not enable WAL for in-memory databases', () => {
      const db = new Database(':memory:');

      // Foreign keys and recursive triggers should still be enabled
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(db.pragma('recursive_triggers', { simple: true })).toBe(1);

      // WAL mode should NOT be set for in-memory databases
      const journalMode = db.pragma('journal_mode', { simple: true });
      expect(journalMode).not.toBe('wal');

      db.close();
    });

    test('Should still apply memory optimizations for in-memory databases', () => {
      const db = new Database(':memory:');

      expect(Math.abs(db.pragma('cache_size', { simple: true }))).toBe(10000);
      expect(db.pragma('temp_store', { simple: true })).toBe(2);
      expect(db.pragma('busy_timeout', { simple: true })).toBe(30000);

      db.close();
    });
  });

  describe('Integration test', () => {
    test('Should improve performance with foreign key constraints', () => {
      const db = new Database(testDbPath);

      // Create tables with foreign keys
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

      // Insert a user
      const insertUser = db.prepare('INSERT INTO users (name) VALUES (?)');
      insertUser.run('Alice');

      // Try to insert a post with an invalid user_id (should fail due to FK constraint)
      const insertPost = db.prepare('INSERT INTO posts (user_id, title) VALUES (?, ?)');

      expect(() => {
        insertPost.run(999, 'Invalid Post');
      }).toThrow();

      db.close();
    });
  });
});
