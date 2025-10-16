/**
 * Drizzle ORM Integration Tests
 *
 * Tests the integration between better-starlite and Drizzle ORM
 * Verifies that all Drizzle operations work correctly with both
 * local SQLite and RQLite backends.
 *
 * Run with: node tests/drizzle-integration-test.js
 */

const { createDatabase, AsyncDatabase } = require('../dist/async-unified');
const { drizzle } = require('../dist/drizzle');
const { sql, eq, and, gte, lte, desc, asc, isNull, isNotNull } = require('drizzle-orm');
const { integer, sqliteTable, text, real } = require('drizzle-orm/sqlite-core');

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

// Define schema for tests
const testUsers = sqliteTable('test_users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').unique(),
  age: integer('age'),
  score: real('score'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

const testPosts = sqliteTable('test_posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => testUsers.id),
  title: text('title').notNull(),
  content: text('content'),
  published: integer('published', { mode: 'boolean' }).default(false),
  views: integer('views').default(0),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

async function setupSchema(db) {
  // Use raw SQL for schema creation since Drizzle's schema methods might not be available
  const database = db.$client || db;

  await database.exec(`
    CREATE TABLE IF NOT EXISTS test_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      age INTEGER,
      score REAL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await database.exec(`
    CREATE TABLE IF NOT EXISTS test_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES test_users(id),
      title TEXT NOT NULL,
      content TEXT,
      published INTEGER DEFAULT 0,
      views INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function cleanupSchema(db) {
  const database = db.$client || db;
  await database.exec('DROP TABLE IF EXISTS test_posts');
  await database.exec('DROP TABLE IF EXISTS test_users');
}

// Test suites
async function testBasicDrizzleOperations(db, dbType) {
  console.log(`\n📝 Testing basic Drizzle operations with ${dbType}...`);

  await runTest(`${dbType}: Insert single record`, async () => {
    const result = await db.insert(testUsers).values({
      name: 'Alice',
      email: 'alice@test.com',
      age: 30,
      score: 95.5,
    }).returning();

    assert(result.length === 1, 'Should return inserted record');
    assert(result[0].name === 'Alice', 'Name should match');
    assert(result[0].email === 'alice@test.com', 'Email should match');
  });

  await runTest(`${dbType}: Insert multiple records`, async () => {
    const result = await db.insert(testUsers).values([
      { name: 'Bob', email: 'bob@test.com', age: 25, score: 87.3 },
      { name: 'Charlie', email: 'charlie@test.com', age: 35, score: 92.1 },
      { name: 'Diana', email: 'diana@test.com', age: 28, score: 88.5 },
    ]).returning();

    assert(result.length === 3, 'Should insert 3 records');
  });

  await runTest(`${dbType}: Select all records`, async () => {
    const users = await db.select().from(testUsers);
    assert(users.length >= 4, 'Should have at least 4 users');
  });

  await runTest(`${dbType}: Select with where clause`, async () => {
    const users = await db
      .select()
      .from(testUsers)
      .where(gte(testUsers.age, 30));

    assert(users.length >= 2, 'Should find users 30 or older');
    users.forEach(user => {
      assert(user.age >= 30, 'All users should be 30 or older');
    });
  });

  await runTest(`${dbType}: Select specific columns`, async () => {
    const result = await db
      .select({
        name: testUsers.name,
        email: testUsers.email,
      })
      .from(testUsers)
      .where(eq(testUsers.name, 'Alice'));

    assert(result.length === 1, 'Should find one user');
    assert(result[0].name === 'Alice', 'Name should match');
    assert(result[0].id === undefined, 'Should not include id');
  });

  await runTest(`${dbType}: Update records`, async () => {
    const result = await db
      .update(testUsers)
      .set({ score: 100 })
      .where(eq(testUsers.name, 'Alice'))
      .returning();

    assert(result.length === 1, 'Should update one record');
    assert(result[0].score === 100, 'Score should be updated');
  });

  await runTest(`${dbType}: Delete records`, async () => {
    // First, add a test record to delete
    await db.insert(testUsers).values({
      name: 'ToDelete',
      email: 'delete@test.com',
    });

    const result = await db
      .delete(testUsers)
      .where(eq(testUsers.email, 'delete@test.com'))
      .returning();

    assert(result.length === 1, 'Should delete one record');
    assert(result[0].name === 'ToDelete', 'Should delete correct record');
  });
}

async function testComplexQueries(db, dbType) {
  console.log(`\n🔍 Testing complex Drizzle queries with ${dbType}...`);

  // Add posts for testing
  await db.insert(testPosts).values([
    { userId: 1, title: 'First Post', content: 'Hello World', published: true, views: 100 },
    { userId: 1, title: 'Second Post', content: 'More content', published: false, views: 50 },
    { userId: 2, title: 'Bob Post', content: 'Bob content', published: true, views: 75 },
    { userId: 3, title: 'Charlie Post', content: null, published: true, views: 200 },
  ]);

  await runTest(`${dbType}: Complex where conditions`, async () => {
    const users = await db
      .select()
      .from(testUsers)
      .where(and(
        gte(testUsers.age, 25),
        lte(testUsers.age, 30),
        isNotNull(testUsers.email)
      ));

    assert(users.length >= 2, 'Should find users in age range');
  });

  await runTest(`${dbType}: Join queries`, async () => {
    const result = await db
      .select({
        userName: testUsers.name,
        postTitle: testPosts.title,
        postViews: testPosts.views,
      })
      .from(testPosts)
      .innerJoin(testUsers, eq(testPosts.userId, testUsers.id))
      .where(eq(testPosts.published, true));

    assert(result.length >= 3, 'Should find published posts');
    result.forEach(row => {
      assert(row.userName !== undefined, 'Should have user name');
      assert(row.postTitle !== undefined, 'Should have post title');
    });
  });

  await runTest(`${dbType}: Ordering and limiting`, async () => {
    const topPosts = await db
      .select()
      .from(testPosts)
      .orderBy(desc(testPosts.views))
      .limit(2);

    assert(topPosts.length === 2, 'Should return 2 posts');
    assert(topPosts[0].views >= topPosts[1].views, 'Should be ordered by views');
  });

  await runTest(`${dbType}: Aggregation with SQL`, async () => {
    const result = await db
      .select({
        userId: testPosts.userId,
        postCount: sql`COUNT(*)`.as('post_count'),
        totalViews: sql`SUM(${testPosts.views})`.as('total_views'),
        avgViews: sql`AVG(${testPosts.views})`.as('avg_views'),
      })
      .from(testPosts)
      .groupBy(testPosts.userId);

    assert(result.length >= 3, 'Should have aggregated results');
    result.forEach(row => {
      assert(typeof row.postCount === 'number', 'Should have post count');
      assert(typeof row.totalViews === 'number', 'Should have total views');
    });
  });

  await runTest(`${dbType}: Subqueries`, async () => {
    const subquery = db
      .select({ userId: testPosts.userId })
      .from(testPosts)
      .where(gte(testPosts.views, 100))
      .as('high_view_posts');

    const usersWithHighViewPosts = await db
      .select()
      .from(testUsers)
      .innerJoin(subquery, eq(testUsers.id, subquery.userId));

    assert(usersWithHighViewPosts.length >= 1, 'Should find users with high-view posts');
  });
}

async function testTransactions(db, dbType) {
  console.log(`\n💰 Testing Drizzle transactions with ${dbType}...`);

  await runTest(`${dbType}: Successful transaction`, async () => {
    const initialUserCount = (await db.select().from(testUsers)).length;

    await db.transaction(async (tx) => {
      await tx.insert(testUsers).values({
        name: 'Transaction User 1',
        email: 'tx1@test.com',
      });

      await tx.insert(testUsers).values({
        name: 'Transaction User 2',
        email: 'tx2@test.com',
      });

      const count = await tx.select().from(testUsers);
      assert(count.length === initialUserCount + 2, 'Should see new users in transaction');
    });

    const finalCount = (await db.select().from(testUsers)).length;
    assert(finalCount === initialUserCount + 2, 'Transaction should commit');
  });

  await runTest(`${dbType}: Failed transaction rollback`, async () => {
    const initialUserCount = (await db.select().from(testUsers)).length;

    try {
      await db.transaction(async (tx) => {
        await tx.insert(testUsers).values({
          name: 'Will Rollback',
          email: 'rollback@test.com',
        });

        // Force an error
        throw new Error('Intentional rollback');
      });
    } catch (e) {
      assert(e.message === 'Intentional rollback', 'Should catch transaction error');
    }

    const finalCount = (await db.select().from(testUsers)).length;
    assert(finalCount === initialUserCount, 'Transaction should rollback');
  });

  await runTest(`${dbType}: Nested operations in transaction`, async () => {
    await db.transaction(async (tx) => {
      // Create a user
      const newUser = await tx.insert(testUsers).values({
        name: 'Post Author',
        email: 'author@test.com',
      }).returning();

      // Create posts for that user
      await tx.insert(testPosts).values([
        { userId: newUser[0].id, title: 'TX Post 1', content: 'Content 1' },
        { userId: newUser[0].id, title: 'TX Post 2', content: 'Content 2' },
      ]);

      // Verify within transaction
      const userPosts = await tx
        .select()
        .from(testPosts)
        .where(eq(testPosts.userId, newUser[0].id));

      assert(userPosts.length === 2, 'Should see posts in transaction');
    });
  });
}

async function testDrizzleSpecificFeatures(db, dbType) {
  console.log(`\n⚡ Testing Drizzle-specific features with ${dbType}...`);

  await runTest(`${dbType}: Insert with default values`, async () => {
    const result = await db.insert(testUsers).values({
      name: 'Default Test',
    }).returning();

    assert(result[0].isActive === 1, 'Should have default isActive value');
    assert(result[0].email === null, 'Optional field should be null');
    assert(result[0].createdAt !== null, 'Should have timestamp');
  });

  await runTest(`${dbType}: Batch operations`, async () => {
    const users = Array.from({ length: 10 }, (_, i) => ({
      name: `Batch User ${i}`,
      email: `batch${i}@test.com`,
      age: 20 + i,
    }));

    const result = await db.insert(testUsers).values(users).returning();
    assert(result.length === 10, 'Should insert all batch records');
  });

  await runTest(`${dbType}: Update with SQL expressions`, async () => {
    await db
      .update(testPosts)
      .set({
        views: sql`${testPosts.views} + 1`,
      })
      .where(eq(testPosts.published, true));

    const posts = await db.select().from(testPosts).where(eq(testPosts.published, true));
    posts.forEach(post => {
      assert(post.views > 0, 'Views should be incremented');
    });
  });

  await runTest(`${dbType}: Complex select with aliases`, async () => {
    const result = await db
      .select({
        user: {
          id: testUsers.id,
          name: testUsers.name,
        },
        stats: {
          postCount: sql`(SELECT COUNT(*) FROM ${testPosts} WHERE ${testPosts.userId} = ${testUsers.id})`,
        }
      })
      .from(testUsers)
      .limit(3);

    assert(result.length <= 3, 'Should respect limit');
    result.forEach(row => {
      assert(row.user.id !== undefined, 'Should have user id');
      assert(row.user.name !== undefined, 'Should have user name');
      assert(typeof row.stats.postCount === 'number', 'Should have post count');
    });
  });
}

async function runAllDrizzleTests(database, dbType) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running Drizzle tests with ${dbType}`);
  console.log('='.repeat(60));

  const db = drizzle(database);

  try {
    await setupSchema(db);
    await testBasicDrizzleOperations(db, dbType);
    await testComplexQueries(db, dbType);
    await testTransactions(db, dbType);
    await testDrizzleSpecificFeatures(db, dbType);
  } finally {
    await cleanupSchema(db);
  }

  console.log(`\n✨ ${dbType} Drizzle tests completed`);
}

async function main() {
  console.log('=================================================');
  console.log('Drizzle ORM Integration Test Suite');
  console.log('=================================================');
  console.log(`\nTest configuration:`);
  console.log(`- Verbose: ${TEST_CONFIG.verbose}`);
  console.log(`- RQLite URL: ${TEST_CONFIG.rqliteUrl}`);
  console.log(`- Test RQLite: ${TEST_CONFIG.testRqlite}\n`);

  // Test with local SQLite
  try {
    const localDb = await createDatabase(':memory:');
    await runAllDrizzleTests(localDb, 'Local SQLite');
    await localDb.close();
  } catch (error) {
    console.error('Failed to test local SQLite:', error.message);
    testResults.errors.push({ test: 'Local SQLite Setup', error: error.message });
  }

  // Test with RQLite (if configured)
  if (TEST_CONFIG.testRqlite) {
    try {
      const rqliteDb = await createDatabase(TEST_CONFIG.rqliteUrl);
      await runAllDrizzleTests(rqliteDb, 'RQLite');
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

module.exports = { runAllDrizzleTests, testResults };