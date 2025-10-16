/**
 * Prisma Adapter Pattern Tests
 *
 * Tests the custom Prisma adapter implementation for better-starlite.
 * Since Prisma's driver adapter feature is in preview, this tests our
 * adapter pattern to ensure it correctly translates Prisma operations
 * to better-starlite calls.
 *
 * Run with: node tests/prisma-adapter-test.js
 */

const { createDatabase } = require('../dist/async-unified');
const { BetterStarlitePrismaAdapter } = require('../examples/prisma-integration');

// Test configuration
const TEST_CONFIG = {
  verbose: process.env.VERBOSE === 'true',
  rqliteUrl: process.env.RQLITE_URL || 'http://localhost:4001',
  testRqlite: process.env.SKIP_RQLITE !== 'true',
};

// Test results tracker
const testResults = {
  passed: 0,
  failed: 0,
  skipped: 0,
  errors: [],
};

// Test assertion helper
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Test runner helper
async function runTest(name, testFn) {
  try {
    await testFn();
    testResults.passed++;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    testResults.failed++;
    testResults.errors.push({ test: name, error: error.message });
    console.log(`  ❌ ${name}: ${error.message}`);
    if (TEST_CONFIG.verbose) {
      console.error(error.stack);
    }
  }
}

async function setupTestSchema(database) {
  await database.exec(`
    CREATE TABLE IF NOT EXISTS test_prisma_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      age INTEGER,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await database.exec(`
    CREATE TABLE IF NOT EXISTS test_prisma_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT,
      published BOOLEAN DEFAULT 0,
      author_id INTEGER NOT NULL,
      view_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (author_id) REFERENCES test_prisma_users(id)
    )
  `);

  await database.exec(`
    CREATE TABLE IF NOT EXISTS test_prisma_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      post_id INTEGER NOT NULL,
      author_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES test_prisma_posts(id),
      FOREIGN KEY (author_id) REFERENCES test_prisma_users(id)
    )
  `);
}

async function cleanupTestSchema(database) {
  await database.exec('DROP TABLE IF EXISTS test_prisma_comments');
  await database.exec('DROP TABLE IF EXISTS test_prisma_posts');
  await database.exec('DROP TABLE IF EXISTS test_prisma_users');
}

async function testAdapterQueryMethods(adapter, dbType) {
  console.log(`\n📝 Testing Prisma adapter query methods with ${dbType}...`);

  await runTest(`${dbType}: queryRaw - SELECT query`, async () => {
    // Insert test data directly
    await adapter.database.exec(`
      INSERT INTO test_prisma_users (email, name, age)
      VALUES ('test1@example.com', 'Test User 1', 25)
    `);

    const result = await adapter.queryRaw({
      sql: 'SELECT * FROM test_prisma_users WHERE email = ?',
      args: ['test1@example.com']
    });

    assert(Array.isArray(result), 'queryRaw should return array');
    assert(result.length === 1, 'Should find one user');
    assert(result[0].email === 'test1@example.com', 'Email should match');
  });

  await runTest(`${dbType}: queryRaw - Multiple results`, async () => {
    // Insert more test data
    await adapter.database.exec(`
      INSERT INTO test_prisma_users (email, name, age)
      VALUES
        ('test2@example.com', 'Test User 2', 30),
        ('test3@example.com', 'Test User 3', 35)
    `);

    const result = await adapter.queryRaw({
      sql: 'SELECT * FROM test_prisma_users WHERE age >= ?',
      args: [30]
    });

    assert(result.length >= 2, 'Should find multiple users');
  });

  await runTest(`${dbType}: executeRaw - INSERT operation`, async () => {
    const result = await adapter.executeRaw({
      sql: 'INSERT INTO test_prisma_users (email, name, age) VALUES (?, ?, ?)',
      args: ['execute@example.com', 'Execute Test', 40]
    });

    assert(result.affectedRows === 1, 'Should affect one row');
    assert(result.lastInsertId > 0, 'Should have lastInsertId');
  });

  await runTest(`${dbType}: executeRaw - UPDATE operation`, async () => {
    const result = await adapter.executeRaw({
      sql: 'UPDATE test_prisma_users SET age = ? WHERE email = ?',
      args: [26, 'test1@example.com']
    });

    assert(result.affectedRows === 1, 'Should update one row');
  });

  await runTest(`${dbType}: executeRaw - DELETE operation`, async () => {
    // Add a record to delete
    await adapter.executeRaw({
      sql: 'INSERT INTO test_prisma_users (email, name) VALUES (?, ?)',
      args: ['todelete@example.com', 'To Delete']
    });

    const result = await adapter.executeRaw({
      sql: 'DELETE FROM test_prisma_users WHERE email = ?',
      args: ['todelete@example.com']
    });

    assert(result.affectedRows === 1, 'Should delete one row');
  });

  await runTest(`${dbType}: Handle NULL values`, async () => {
    await adapter.executeRaw({
      sql: 'INSERT INTO test_prisma_users (email, name, age) VALUES (?, ?, ?)',
      args: ['null-test@example.com', null, null]
    });

    const result = await adapter.queryRaw({
      sql: 'SELECT * FROM test_prisma_users WHERE email = ?',
      args: ['null-test@example.com']
    });

    assert(result[0].name === null, 'Should handle NULL for name');
    assert(result[0].age === null, 'Should handle NULL for age');
  });
}

async function testAdapterTransactions(adapter, dbType) {
  console.log(`\n💰 Testing Prisma adapter transactions with ${dbType}...`);

  await runTest(`${dbType}: Basic transaction commit`, async () => {
    const tx = await adapter.startTransaction();

    // Insert within transaction
    await adapter.executeRaw({
      sql: 'INSERT INTO test_prisma_users (email, name) VALUES (?, ?)',
      args: ['tx-test@example.com', 'Transaction Test']
    });

    await tx.commit();

    // Verify data was committed
    const result = await adapter.queryRaw({
      sql: 'SELECT * FROM test_prisma_users WHERE email = ?',
      args: ['tx-test@example.com']
    });

    assert(result.length === 1, 'Transaction should commit data');
  });

  await runTest(`${dbType}: Transaction rollback`, async () => {
    const initialCount = await adapter.queryRaw({
      sql: 'SELECT COUNT(*) as count FROM test_prisma_users',
      args: []
    });

    const tx = await adapter.startTransaction();

    // Insert within transaction
    await adapter.executeRaw({
      sql: 'INSERT INTO test_prisma_users (email, name) VALUES (?, ?)',
      args: ['rollback@example.com', 'Will Rollback']
    });

    // Rollback instead of commit
    await tx.rollback();

    // Verify data was rolled back
    const finalCount = await adapter.queryRaw({
      sql: 'SELECT COUNT(*) as count FROM test_prisma_users',
      args: []
    });

    assert(
      finalCount[0].count === initialCount[0].count,
      'Transaction should rollback changes'
    );
  });
}

async function testComplexPrismaPatterns(adapter, dbType) {
  console.log(`\n🔍 Testing complex Prisma patterns with ${dbType}...`);

  await runTest(`${dbType}: Nested inserts pattern`, async () => {
    // Simulate Prisma's nested create
    const tx = await adapter.startTransaction();

    // Create user
    const userResult = await adapter.executeRaw({
      sql: 'INSERT INTO test_prisma_users (email, name) VALUES (?, ?)',
      args: ['author@example.com', 'Post Author']
    });

    // Create related posts
    await adapter.executeRaw({
      sql: 'INSERT INTO test_prisma_posts (title, content, author_id) VALUES (?, ?, ?)',
      args: ['First Post', 'Content here', userResult.lastInsertId]
    });

    await adapter.executeRaw({
      sql: 'INSERT INTO test_prisma_posts (title, content, author_id) VALUES (?, ?, ?)',
      args: ['Second Post', 'More content', userResult.lastInsertId]
    });

    await tx.commit();

    // Verify
    const posts = await adapter.queryRaw({
      sql: 'SELECT * FROM test_prisma_posts WHERE author_id = ?',
      args: [userResult.lastInsertId]
    });

    assert(posts.length === 2, 'Should create nested records');
  });

  await runTest(`${dbType}: Join queries pattern`, async () => {
    // Add test data
    const userResult = await adapter.executeRaw({
      sql: 'INSERT INTO test_prisma_users (email, name) VALUES (?, ?)',
      args: ['join-test@example.com', 'Join Test User']
    });

    await adapter.executeRaw({
      sql: 'INSERT INTO test_prisma_posts (title, author_id, published) VALUES (?, ?, ?)',
      args: ['Published Post', userResult.lastInsertId, 1]
    });

    // Simulate Prisma's include/join
    const result = await adapter.queryRaw({
      sql: `
        SELECT
          u.id as user_id,
          u.name as user_name,
          p.id as post_id,
          p.title as post_title,
          p.published
        FROM test_prisma_users u
        LEFT JOIN test_prisma_posts p ON u.id = p.author_id
        WHERE u.email = ?
      `,
      args: ['join-test@example.com']
    });

    assert(result.length >= 1, 'Should return join results');
    assert(result[0].user_name === 'Join Test User', 'Should have user data');
    assert(result[0].post_title === 'Published Post', 'Should have post data');
  });

  await runTest(`${dbType}: Aggregate queries pattern`, async () => {
    const result = await adapter.queryRaw({
      sql: `
        SELECT
          COUNT(*) as total_users,
          AVG(age) as avg_age,
          MAX(age) as max_age,
          MIN(age) as min_age
        FROM test_prisma_users
        WHERE age IS NOT NULL
      `,
      args: []
    });

    assert(result[0].total_users >= 0, 'Should have count');
    assert(typeof result[0].avg_age === 'number' || result[0].avg_age === null, 'Should have average');
  });

  await runTest(`${dbType}: Batch operations pattern`, async () => {
    const emails = ['batch1@example.com', 'batch2@example.com', 'batch3@example.com'];

    const tx = await adapter.startTransaction();

    for (const email of emails) {
      await adapter.executeRaw({
        sql: 'INSERT INTO test_prisma_users (email, name) VALUES (?, ?)',
        args: [email, `Batch User ${email}`]
      });
    }

    await tx.commit();

    const result = await adapter.queryRaw({
      sql: 'SELECT COUNT(*) as count FROM test_prisma_users WHERE email LIKE ?',
      args: ['batch%@example.com']
    });

    assert(result[0].count === 3, 'Should insert batch records');
  });

  await runTest(`${dbType}: Update with returning pattern`, async () => {
    // Prisma often uses RETURNING clause, simulate with separate queries
    const tx = await adapter.startTransaction();

    await adapter.executeRaw({
      sql: 'UPDATE test_prisma_users SET name = ?, age = ? WHERE email = ?',
      args: ['Updated Name', 50, 'test1@example.com']
    });

    const updated = await adapter.queryRaw({
      sql: 'SELECT * FROM test_prisma_users WHERE email = ?',
      args: ['test1@example.com']
    });

    await tx.commit();

    assert(updated[0].name === 'Updated Name', 'Should update name');
    assert(updated[0].age === 50, 'Should update age');
  });
}

async function testEdgeCases(adapter, dbType) {
  console.log(`\n⚠️ Testing edge cases with ${dbType}...`);

  await runTest(`${dbType}: Empty result set`, async () => {
    const result = await adapter.queryRaw({
      sql: 'SELECT * FROM test_prisma_users WHERE email = ?',
      args: ['nonexistent@example.com']
    });

    assert(Array.isArray(result), 'Should return empty array');
    assert(result.length === 0, 'Should have no results');
  });

  await runTest(`${dbType}: Special characters in strings`, async () => {
    const specialEmail = "test'special\"@example.com";
    const specialName = "Name with 'quotes' and \"doubles\"";

    await adapter.executeRaw({
      sql: 'INSERT INTO test_prisma_users (email, name) VALUES (?, ?)',
      args: [specialEmail, specialName]
    });

    const result = await adapter.queryRaw({
      sql: 'SELECT * FROM test_prisma_users WHERE email = ?',
      args: [specialEmail]
    });

    assert(result[0].name === specialName, 'Should handle special characters');
  });

  await runTest(`${dbType}: Large batch operations`, async () => {
    const batchSize = 100;
    const tx = await adapter.startTransaction();

    for (let i = 0; i < batchSize; i++) {
      await adapter.executeRaw({
        sql: 'INSERT INTO test_prisma_users (email, name, age) VALUES (?, ?, ?)',
        args: [`bulk${i}@example.com`, `Bulk User ${i}`, 20 + (i % 50)]
      });
    }

    await tx.commit();

    const result = await adapter.queryRaw({
      sql: 'SELECT COUNT(*) as count FROM test_prisma_users WHERE email LIKE ?',
      args: ['bulk%@example.com']
    });

    assert(result[0].count === batchSize, `Should insert ${batchSize} records`);
  });

  await runTest(`${dbType}: Boolean handling`, async () => {
    await adapter.executeRaw({
      sql: 'INSERT INTO test_prisma_posts (title, published, author_id) VALUES (?, ?, ?)',
      args: ['Boolean Test', 1, 1]  // SQLite stores booleans as 0/1
    });

    const result = await adapter.queryRaw({
      sql: 'SELECT * FROM test_prisma_posts WHERE published = ?',
      args: [1] // SQLite stores booleans as 0/1
    });

    assert(result.some(p => p.title === 'Boolean Test'), 'Should handle boolean values');
  });
}

async function runAllPrismaTests(database, dbType) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running Prisma adapter tests with ${dbType}`);
  console.log('='.repeat(60));

  const adapter = new BetterStarlitePrismaAdapter(database);

  try {
    await setupTestSchema(database);
    await testAdapterQueryMethods(adapter, dbType);
    await testAdapterTransactions(adapter, dbType);
    await testComplexPrismaPatterns(adapter, dbType);
    await testEdgeCases(adapter, dbType);
  } finally {
    await cleanupTestSchema(database);
  }

  console.log(`\n✨ ${dbType} Prisma adapter tests completed`);
}

async function main() {
  console.log('=================================================');
  console.log('Prisma Adapter Pattern Test Suite');
  console.log('=================================================');
  console.log(`\nTest configuration:`);
  console.log(`- Verbose: ${TEST_CONFIG.verbose}`);
  console.log(`- RQLite URL: ${TEST_CONFIG.rqliteUrl}`);
  console.log(`- Test RQLite: ${TEST_CONFIG.testRqlite}\n`);

  // Test with local SQLite
  try {
    const localDb = await createDatabase(':memory:');
    await runAllPrismaTests(localDb, 'Local SQLite');
    await localDb.close();
  } catch (error) {
    console.error('Failed to test local SQLite:', error.message);
    testResults.errors.push({ test: 'Local SQLite Setup', error: error.message });
  }

  // Test with RQLite (if configured)
  if (TEST_CONFIG.testRqlite) {
    try {
      const rqliteDb = await createDatabase(TEST_CONFIG.rqliteUrl);
      await runAllPrismaTests(rqliteDb, 'RQLite');
      await rqliteDb.close();
    } catch (error) {
      console.log(`\n⚠️ RQLite tests skipped (server not available): ${error.message}`);
      testResults.skipped++;
    }
  }

  // Print test summary
  console.log('\n=================================================');
  console.log('Test Summary');
  console.log('=================================================');
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`⏭️  Skipped: ${testResults.skipped}`);

  if (testResults.errors.length > 0) {
    console.log('\nFailed Tests:');
    testResults.errors.forEach(({ test, error }) => {
      console.log(`  - ${test}: ${error}`);
    });
  }

  // Exit with appropriate code
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run tests
if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = { runAllPrismaTests, testResults };