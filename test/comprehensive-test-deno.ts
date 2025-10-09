/**
 * Comprehensive test suite for better-starlite in Deno
 * Tests both SQLite and RQLite with all operations
 * Run with: deno run --allow-read --allow-write --allow-net test/comprehensive-test-deno.ts
 */

import { createDatabase } from '../src/async-unified-deno.ts';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    testsPassed++;
  } else {
    console.error(`  ❌ ${message}`);
    testsFailed++;
    throw new Error(`Test failed: ${message}`);
  }
}

async function testBasicOperations(db: any, dbType: string) {
  console.log(`\n📋 Testing basic operations on ${dbType}...`);

  // Clean up from previous runs
  try {
    await db.exec('DROP TABLE IF EXISTS test_users');
  } catch (e) {
    // Table might not exist, that's ok
  }

  // Test CREATE TABLE
  await db.exec(`
    CREATE TABLE test_users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      age INTEGER
    )
  `);
  assert(true, 'CREATE TABLE works');

  // Test INSERT with prepared statement
  const insertStmt = await db.prepare('INSERT INTO test_users (name, email, age) VALUES (?, ?, ?)');
  const result1 = await insertStmt.run('Alice', 'alice@example.com', 30);
  assert(result1.changes === 1, 'INSERT returns correct changes count');
  assert(result1.lastInsertRowid > 0, 'INSERT returns lastInsertRowid');

  // Test multiple inserts
  await insertStmt.run('Bob', 'bob@example.com', 25);
  await insertStmt.run('Charlie', 'charlie@example.com', 35);
  assert(true, 'Multiple INSERTs work');

  // Test SELECT with get()
  const selectOneStmt = await db.prepare('SELECT * FROM test_users WHERE email = ?');
  const user = await selectOneStmt.get('alice@example.com');
  assert(user !== undefined, 'SELECT with get() returns result');
  assert(user.name === 'Alice', 'get() returns correct data');
  assert(user.age === 30, 'get() returns correct numeric data');

  // Test SELECT with all()
  const selectAllStmt = await db.prepare('SELECT * FROM test_users ORDER BY name');
  const users = await selectAllStmt.all();
  assert(Array.isArray(users), 'all() returns array');
  assert(users.length === 3, 'all() returns correct number of rows');
  assert(users[0].name === 'Alice', 'all() returns rows in correct order');

  // Test UPDATE
  const updateStmt = await db.prepare('UPDATE test_users SET age = ? WHERE name = ?');
  const updateResult = await updateStmt.run(31, 'Alice');
  assert(updateResult.changes === 1, 'UPDATE returns correct changes count');

  // Verify update
  const updatedUser = await selectOneStmt.get('alice@example.com');
  assert(updatedUser.age === 31, 'UPDATE modifies data correctly');

  // Test DELETE
  const deleteStmt = await db.prepare('DELETE FROM test_users WHERE name = ?');
  const deleteResult = await deleteStmt.run('Charlie');
  assert(deleteResult.changes === 1, 'DELETE returns correct changes count');

  // Verify delete
  const remainingUsers = await selectAllStmt.all();
  assert(remainingUsers.length === 2, 'DELETE removes rows correctly');
}

async function testTransactions(db: any, dbType: string) {
  console.log(`\n🔄 Testing transactions on ${dbType}...`);

  // Clean up
  try {
    await db.exec('DROP TABLE IF EXISTS test_transactions');
  } catch (e) {}

  await db.exec(`
    CREATE TABLE test_transactions (
      id INTEGER PRIMARY KEY,
      value INTEGER
    )
  `);

  // Test successful transaction
  const insertInTransaction = await db.transaction(async () => {
    const stmt = await db.prepare('INSERT INTO test_transactions (value) VALUES (?)');
    await stmt.run(100);
    await stmt.run(200);
    await stmt.run(300);
  });

  await insertInTransaction();

  const checkStmt = await db.prepare('SELECT COUNT(*) as count, SUM(value) as sum FROM test_transactions');
  const result = await checkStmt.get();
  assert(result.count === 3, 'Transaction commits all operations');
  assert(result.sum === 600, 'Transaction data is correct');

  // Test rollback on error
  let errorThrown = false;
  const failingTransaction = await db.transaction(async () => {
    const stmt = await db.prepare('INSERT INTO test_transactions (value) VALUES (?)');
    await stmt.run(400);
    throw new Error('Intentional error');
  });

  try {
    await failingTransaction();
  } catch (e) {
    errorThrown = true;
  }

  assert(errorThrown, 'Transaction throws error on failure');

  const resultAfterRollback = await checkStmt.get();
  assert(resultAfterRollback.count === 3, 'Transaction rollback works');
  assert(resultAfterRollback.sum === 600, 'Transaction rollback preserves original data');
}

async function testAggregatesAndFunctions(db: any, dbType: string) {
  console.log(`\n🧮 Testing aggregates and functions on ${dbType}...`);

  // Clean up
  try {
    await db.exec('DROP TABLE IF EXISTS test_stats');
  } catch (e) {}

  await db.exec(`
    CREATE TABLE test_stats (
      category TEXT,
      value INTEGER
    )
  `);

  // Insert test data
  const insertStmt = await db.prepare('INSERT INTO test_stats (category, value) VALUES (?, ?)');
  await insertStmt.run('A', 10);
  await insertStmt.run('A', 20);
  await insertStmt.run('B', 30);
  await insertStmt.run('B', 40);
  await insertStmt.run('C', 50);

  // Test COUNT
  const countStmt = await db.prepare('SELECT COUNT(*) as count FROM test_stats');
  const countResult = await countStmt.get();
  assert(countResult.count === 5, 'COUNT(*) works');

  // Test SUM
  const sumStmt = await db.prepare('SELECT SUM(value) as total FROM test_stats');
  const sumResult = await sumStmt.get();
  assert(sumResult.total === 150, 'SUM() works');

  // Test AVG
  const avgStmt = await db.prepare('SELECT AVG(value) as average FROM test_stats');
  const avgResult = await avgStmt.get();
  assert(avgResult.average === 30, 'AVG() works');

  // Test GROUP BY
  const groupStmt = await db.prepare('SELECT category, COUNT(*) as count, SUM(value) as sum FROM test_stats GROUP BY category ORDER BY category');
  const groups = await groupStmt.all();
  assert(groups.length === 3, 'GROUP BY works');
  assert(groups[0].category === 'A' && groups[0].count === 2 && groups[0].sum === 30, 'GROUP BY aggregates correctly');
}

async function testEdgeCases(db: any, dbType: string) {
  console.log(`\n🔍 Testing edge cases on ${dbType}...`);

  // Clean up
  try {
    await db.exec('DROP TABLE IF EXISTS test_edge');
  } catch (e) {}

  await db.exec(`
    CREATE TABLE test_edge (
      id INTEGER PRIMARY KEY,
      text_col TEXT,
      int_col INTEGER,
      real_col REAL,
      blob_col BLOB
    )
  `);

  // Test NULL values
  const insertStmt = await db.prepare('INSERT INTO test_edge (text_col, int_col) VALUES (?, ?)');
  await insertStmt.run(null, null);

  const selectStmt = await db.prepare('SELECT * FROM test_edge WHERE id = 1');
  const row = await selectStmt.get();
  assert(row.text_col === null, 'NULL values handled correctly');
  assert(row.int_col === null, 'NULL integers handled correctly');

  // Test empty string
  await insertStmt.run('', 0);
  const stmt2 = await db.prepare('SELECT * FROM test_edge WHERE id = 2');
  const row2 = await stmt2.get();
  assert(row2.text_col === '', 'Empty strings handled correctly');
  assert(row2.int_col === 0, 'Zero values handled correctly');

  // Test special characters
  const specialText = "Test with 'quotes' and \"double quotes\" and \n newlines";
  await insertStmt.run(specialText, 123);
  const stmt3 = await db.prepare('SELECT * FROM test_edge WHERE id = 3');
  const row3 = await stmt3.get();
  assert(row3.text_col === specialText, 'Special characters handled correctly');

  // Test large numbers
  const bigNum = 9007199254740991; // Max safe integer
  await insertStmt.run('big', bigNum);
  const stmt4 = await db.prepare('SELECT * FROM test_edge WHERE int_col = ?');
  const row4 = await stmt4.get(bigNum);
  assert(row4 !== undefined, 'Large numbers handled correctly');

  // Test floating point
  const floatStmt = await db.prepare('INSERT INTO test_edge (real_col) VALUES (?)');
  await floatStmt.run(3.14159);
  const stmt5 = await db.prepare('SELECT * FROM test_edge WHERE real_col > 3.14 AND real_col < 3.15');
  const row5 = await stmt5.get();
  assert(row5.real_col > 3.14 && row5.real_col < 3.15, 'Floating point numbers handled correctly');
}

async function testPragmas(db: any, dbType: string) {
  console.log(`\n⚙️ Testing pragmas on ${dbType}...`);

  try {
    // Test pragma query
    const version = await db.pragma('user_version');
    assert(typeof version !== 'undefined', 'Pragma query works');

    // Test pragma set
    await db.pragma('user_version = 42');
    const newVersion = await db.pragma('user_version', { simple: true });
    assert(newVersion === 42 || newVersion === '42', 'Pragma set works');
  } catch (e) {
    // Some pragmas might not work on RQLite, that's ok
    console.log(`  ℹ️ Some pragmas may not be supported on ${dbType}`);
  }
}

async function runAllTests() {
  console.log('🧪 Starting comprehensive test suite for better-starlite (Deno)\n');
  console.log('=' .repeat(60));

  // Test SQLite
  console.log('\n🗃️ TESTING SQLITE (LOCAL)');
  console.log('-'.repeat(40));
  const sqliteDb = await createDatabase(':memory:');

  await testBasicOperations(sqliteDb, 'SQLite');
  await testTransactions(sqliteDb, 'SQLite');
  await testAggregatesAndFunctions(sqliteDb, 'SQLite');
  await testEdgeCases(sqliteDb, 'SQLite');
  await testPragmas(sqliteDb, 'SQLite');

  await sqliteDb.close();

  // Test RQLite
  console.log('\n\n🌐 TESTING RQLITE (DISTRIBUTED)');
  console.log('-'.repeat(40));

  try {
    const rqliteDb = await createDatabase('http://localhost:4001');

    await testBasicOperations(rqliteDb, 'RQLite');
    await testTransactions(rqliteDb, 'RQLite');
    await testAggregatesAndFunctions(rqliteDb, 'RQLite');
    await testEdgeCases(rqliteDb, 'RQLite');
    await testPragmas(rqliteDb, 'RQLite');

    await rqliteDb.close();
  } catch (e: any) {
    console.error('\n❌ RQLite tests failed. Make sure RQLite is running on localhost:4001');
    console.error('   Run: docker run -d --name rqlite-test -p 4001:4001 rqlite/rqlite');
    testsFailed++;
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST RESULTS');
  console.log('-'.repeat(40));
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log('-'.repeat(40));

  if (testsFailed === 0) {
    console.log('\n🎉 All tests passed! The library is working correctly in Deno.');
    Deno.exit(0);
  } else {
    console.log('\n⚠️ Some tests failed. Please review the errors above.');
    Deno.exit(1);
  }
}

// Run tests
await runAllTests().catch((e: any) => {
  console.error('\n💥 Unexpected error:', e);
  Deno.exit(1);
});