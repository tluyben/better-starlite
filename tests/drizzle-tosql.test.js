/**
 * Drizzle .toSQL() and Query Inspection Tests
 *
 * Tests that Drizzle queries can be inspected with .toSQL() before execution.
 * This is critical for:
 * - Debugging queries
 * - Query rewriting (for different SQL dialects)
 * - Logging
 * - Performance analysis
 */

const { createDatabase } = require('../dist/async-unified');
const { drizzle } = require('../dist/drizzle');
const { sql, eq, and, gte } = require('drizzle-orm');
const { integer, sqliteTable, text, real } = require('drizzle-orm/sqlite-core');

// Test configuration
const TEST_CONFIG = {
  verbose: process.env.VERBOSE === 'true',
  testTimeout: 30000, // 30 seconds

  rqliteUrl: process.env.RQLITE_URL || 'http://localhost:4001',
};

// Define test schema
const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  accountNumber: text('account_number').notNull(),
  expiresAt: integer('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  role: text('role').notNull(),
  createdAt: integer('created_at').default(sql`(strftime('%s', 'now'))`),
});

const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').unique().notNull(),
  age: integer('age'),
  score: real('score'),
});

async function setupSchema(db) {
  const database = db.$client || db;

  // Drop tables first to ensure clean schema
  try {
    await database.exec('DROP TABLE IF EXISTS sessions');
    await database.exec('DROP TABLE IF EXISTS users');
  } catch (e) {
    // Ignore errors
  }

  await database.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      account_number TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      role TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  await database.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      age INTEGER,
      score REAL
    )
  `);
}

async function cleanupSchema(db) {
  if (!db) return; // Skip if db is not initialized
  const database = db.$client || db;
  try {
    await database.exec('DROP TABLE IF EXISTS sessions');
    await database.exec('DROP TABLE IF EXISTS users');
  } catch (e) {
    // Ignore cleanup errors
  }
}

// ============================================================================
// toSQL() TESTS
// ============================================================================

function createToSQLTests(dbType, getDb) {
  describe(`${dbType} - toSQL() Query Inspection`, () => {
    let db;

    beforeAll(async () => {
      db = await getDb();
      if (db) {
        await setupSchema(db);
      }
    });

    afterAll(async () => {
      await cleanupSchema(db);
      if (db) {
        const database = db.$client || db;
        await database.close();
      }
    });

    test('INSERT query toSQL()', async () => {
      if (!db) return;

      const sessionId = 'sess_123456';
      const sessionExpiry = Math.floor(Date.now() / 1000) + 3600;

      const insertQuery = db.insert(sessions).values({
        id: sessionId,
        accountNumber: 'ACC-001',
        expiresAt: sessionExpiry,
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        role: 'user',
      });

      const sqlResult = insertQuery.toSQL();

      expect(sqlResult).toBeDefined();
      expect(sqlResult).not.toBeNull();
      expect(typeof sqlResult).toBe('object');
      expect(typeof sqlResult.sql).toBe('string');
      expect(Array.isArray(sqlResult.params)).toBe(true);
      expect(sqlResult.sql.toLowerCase()).toContain('insert');
      expect(sqlResult.sql).toContain('sessions');

      if (TEST_CONFIG.verbose) {
        console.log('    SQL:', sqlResult.sql);
        console.log('    Params:', sqlResult.params);
      }

      // Query should still be executable after toSQL()
      await insertQuery;

      // Verify it was actually inserted
      const result = await db.select().from(sessions).where(eq(sessions.id, sessionId));
      expect(result.length).toBe(1);
    });

    test('SELECT query toSQL()', async () => {
      if (!db) return;

      const selectQuery = db.select().from(sessions).where(eq(sessions.role, 'user'));

      const sqlResult = selectQuery.toSQL();

      expect(sqlResult).not.toBeNull();
      expect(typeof sqlResult.sql).toBe('string');
      expect(Array.isArray(sqlResult.params)).toBe(true);
      expect(sqlResult.sql.toLowerCase()).toContain('select');
      expect(sqlResult.sql).toContain('sessions');

      if (TEST_CONFIG.verbose) {
        console.log('    SQL:', sqlResult.sql);
        console.log('    Params:', sqlResult.params);
      }

      // Execute after inspection
      const rows = await selectQuery;
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });

    test('UPDATE query toSQL()', async () => {
      if (!db) return;

      const updateQuery = db
        .update(sessions)
        .set({ role: 'admin' })
        .where(eq(sessions.id, 'sess_123456'));

      const sqlResult = updateQuery.toSQL();

      expect(sqlResult).not.toBeNull();
      expect(sqlResult.sql.toLowerCase()).toContain('update');
      expect(sqlResult.sql).toContain('sessions');
      expect(sqlResult.params).toContain('admin');

      if (TEST_CONFIG.verbose) {
        console.log('    SQL:', sqlResult.sql);
        console.log('    Params:', sqlResult.params);
      }

      // Execute and verify
      await updateQuery;
      const result = await db.select().from(sessions).where(eq(sessions.id, 'sess_123456'));
      expect(result[0].role).toBe('admin');
    });

    test('DELETE query toSQL()', async () => {
      if (!db) return;

      const deleteQuery = db.delete(sessions).where(eq(sessions.id, 'sess_123456'));

      const sqlResult = deleteQuery.toSQL();

      expect(sqlResult).not.toBeNull();
      expect(sqlResult.sql.toLowerCase()).toContain('delete');
      expect(sqlResult.sql).toContain('sessions');

      if (TEST_CONFIG.verbose) {
        console.log('    SQL:', sqlResult.sql);
        console.log('    Params:', sqlResult.params);
      }

      // Execute and verify
      await deleteQuery;
      const result = await db.select().from(sessions).where(eq(sessions.id, 'sess_123456'));
      expect(result.length).toBe(0);
    });

    test('Complex SELECT with JOIN toSQL()', async () => {
      if (!db) return;

      // Insert test data
      await db.insert(users).values({ name: 'John', email: 'john@test.com', age: 30 });
      await db.insert(sessions).values({
        id: 'sess_john',
        accountNumber: 'john@test.com',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        role: 'user',
      });

      const joinQuery = db
        .select({
          sessionId: sessions.id,
          userName: users.name,
          userAge: users.age,
        })
        .from(sessions)
        .innerJoin(users, eq(sessions.accountNumber, users.email));

      const sqlResult = joinQuery.toSQL();

      expect(sqlResult).not.toBeNull();
      expect(sqlResult.sql.toLowerCase()).toContain('select');
      expect(sqlResult.sql.toLowerCase()).toContain('join');
      expect(sqlResult.sql).toContain('sessions');
      expect(sqlResult.sql).toContain('users');

      if (TEST_CONFIG.verbose) {
        console.log('    SQL:', sqlResult.sql);
        console.log('    Params:', sqlResult.params);
      }

      // Execute and verify
      const rows = await joinQuery;
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });

    test('Complex WHERE with multiple conditions toSQL()', async () => {
      if (!db) return;

      await db.insert(users).values([
        { name: 'Alice', email: 'alice@test.com', age: 25, score: 90.5 },
        { name: 'Bob', email: 'bob@test.com', age: 35, score: 85.0 },
        { name: 'Charlie', email: 'charlie@test.com', age: 30, score: 95.0 },
      ]);

      const complexQuery = db
        .select()
        .from(users)
        .where(and(gte(users.age, 25), gte(users.score, 90)));

      const sqlResult = complexQuery.toSQL();

      expect(sqlResult).not.toBeNull();
      expect(sqlResult.sql.toLowerCase()).toContain('where');
      expect(sqlResult.sql.toLowerCase()).toContain('and');

      if (TEST_CONFIG.verbose) {
        console.log('    SQL:', sqlResult.sql);
        console.log('    Params:', sqlResult.params);
      }

      // Execute and verify
      const rows = await complexQuery;
      expect(rows.length).toBeGreaterThanOrEqual(2);
    });

    test('INSERT with .returning() toSQL()', async () => {
      if (!db) return;

      const insertQuery = db
        .insert(users)
        .values({
          name: 'Test User',
          email: 'test@tosql.com',
          age: 40,
        })
        .returning();

      const sqlResult = insertQuery.toSQL();

      expect(sqlResult).not.toBeNull();
      expect(sqlResult.sql.toLowerCase()).toContain('insert');
      expect(sqlResult.sql.toLowerCase()).toContain('returning');

      if (TEST_CONFIG.verbose) {
        console.log('    SQL:', sqlResult.sql);
        console.log('    Params:', sqlResult.params);
      }

      // Execute and verify
      const result = await insertQuery;
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Test User');
    });

    test('Multiple toSQL() calls don\'t affect execution', async () => {
      if (!db) return;

      const query = db.insert(users).values({
        name: 'Multiple SQL',
        email: 'multiple@sql.com',
        age: 28,
      });

      // Call toSQL() multiple times
      const sql1 = query.toSQL();
      const sql2 = query.toSQL();
      const sql3 = query.toSQL();

      expect(sql1.sql).toBe(sql2.sql);
      expect(sql2.sql).toBe(sql3.sql);
      expect(JSON.stringify(sql1.params)).toBe(JSON.stringify(sql2.params));

      // Should still execute after multiple toSQL() calls
      await query;

      const result = await db.select().from(users).where(eq(users.email, 'multiple@sql.com'));
      expect(result.length).toBe(1);
    });

    test('toSQL() before conditional execution', async () => {
      if (!db) return;

      const query = db.insert(users).values({
        name: 'Conditional',
        email: 'conditional@test.com',
        age: 33,
      });

      const sqlResult = query.toSQL();

      // Simulate logging/debugging
      const shouldExecute = sqlResult.sql.toLowerCase().includes('insert');

      if (shouldExecute) {
        await query;
        const result = await db.select().from(users).where(eq(users.email, 'conditional@test.com'));
        expect(result.length).toBe(1);
      }
    });
  });

  // ============================================================================
  // QUERY REWRITING TESTS
  // ============================================================================

  describe(`${dbType} - Query Rewriting Capabilities`, () => {
    let db;

    beforeAll(async () => {
      db = await getDb();
      if (db) {
        await setupSchema(db);
      }
    });

    afterAll(async () => {
      await cleanupSchema(db);
      if (db) {
        const database = db.$client || db;
        await database.close();
      }
    });

    test('Extract and modify SQL before execution', async () => {
      if (!db) return;

      const originalQuery = db.insert(users).values({
        name: 'Original',
        email: 'original@test.com',
        age: 29,
      });

      const { sql: originalSql, params } = originalQuery.toSQL();

      expect(originalSql.toLowerCase()).toContain('insert');

      // Simulate query rewriting (for different SQL dialects, etc.)
      const rewrittenSql = originalSql.replace(/INSERT INTO/i, 'INSERT OR REPLACE INTO');

      if (TEST_CONFIG.verbose) {
        console.log('    Original SQL:', originalSql);
        console.log('    Rewritten SQL:', rewrittenSql);
      }

      // Execute the original (rewriting would be done in the driver layer)
      await originalQuery;

      const result = await db.select().from(users).where(eq(users.email, 'original@test.com'));
      expect(result.length).toBe(1);
    });

    test('Inspect params for query optimization', async () => {
      if (!db) return;

      // Insert test data first
      await db.insert(users).values({ name: 'Alice', email: 'alice@params.com', age: 25 });

      const query = db
        .select()
        .from(users)
        .where(and(eq(users.name, 'Alice'), gte(users.age, 25)));

      const { sql: querySql, params } = query.toSQL();

      expect(params.length).toBeGreaterThanOrEqual(2);
      expect(params).toContain('Alice');
      expect(params.includes(25) || params.some(p => p === 25)).toBe(true);

      if (TEST_CONFIG.verbose) {
        console.log('    Query params:', params);
        console.log('    Param types:', params.map(p => typeof p));
      }

      // Execute after inspection
      const rows = await query;
      expect(rows.length).toBeGreaterThanOrEqual(0);
    });
  });
}

// ============================================================================
// JEST TEST SUITES
// ============================================================================

// SQLite Tests
describe('Drizzle .toSQL() Tests - SQLite', () => {
  const getDb = async () => drizzle(await createDatabase(':memory:'));

  createToSQLTests('SQLite', getDb);
});

// RQLite Tests - conditionally run if available
describe('Drizzle .toSQL() Tests - RQLite', () => {
  const getDb = async () => {
    // Check if RQLite is available
    try {
      const response = await fetch('http://localhost:4001/status');
      if (!response.ok) {
        throw new Error('RQLite not available');
      }
    } catch (err) {
      console.log('⏭️  Skipping RQLite test - RQLite not available');
      return null;
    }
    return drizzle(await createDatabase(TEST_CONFIG.rqliteUrl));
  };

  createToSQLTests('RQLite', getDb);
});
