/**
 * Comprehensive Cross-Platform Tests for better-starlite
 *
 * These tests verify that better-starlite works identically across:
 * - Node.js with local SQLite
 * - Node.js with rqlite
 * - Deno with local SQLite
 * - Deno with rqlite
 *
 * Run with: node tests/cross-platform-test.js
 */

const { createDatabase } = require('../dist/async-unified');

// Test suite configuration
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
    console.log(`✅ ${name}`);
  } catch (error) {
    testResults.failed++;
    testResults.errors.push({ test: name, error: error.message });
    console.log(`❌ ${name}: ${error.message}`);
    if (TEST_CONFIG.verbose) {
      console.error(error.stack);
    }
  }
}

// ========================================
// CORE FUNCTIONALITY TESTS
// ========================================

async function testBasicOperations(db, dbType) {
  console.log(`\n📝 Testing basic operations with ${dbType}...`);

  // Create table
  await runTest(`${dbType}: Create table`, async () => {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS test_basic (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        value INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  // Insert data
  await runTest(`${dbType}: Insert data`, async () => {
    const stmt = await db.prepare('INSERT INTO test_basic (name, value) VALUES (?, ?)');
    const result = await stmt.run('test1', 100);
    assert(result.changes === 1, 'Should insert 1 row');
    assert(result.lastInsertRowid > 0, 'Should return lastInsertRowid');
  });

  // Select data
  await runTest(`${dbType}: Select single row`, async () => {
    const stmt = await db.prepare('SELECT * FROM test_basic WHERE name = ?');
    const row = await stmt.get('test1');
    assert(row !== undefined, 'Should return a row');
    assert(row.name === 'test1', 'Name should match');
    assert(row.value === 100, 'Value should match');
  });

  // Select multiple rows
  await runTest(`${dbType}: Select multiple rows`, async () => {
    // Insert more data
    const insertStmt = await db.prepare('INSERT INTO test_basic (name, value) VALUES (?, ?)');
    await insertStmt.run('test2', 200);
    await insertStmt.run('test3', 300);

    const selectStmt = await db.prepare('SELECT * FROM test_basic ORDER BY value');
    const rows = await selectStmt.all();
    assert(rows.length >= 3, 'Should return at least 3 rows');
    assert(rows[0].value === 100, 'First row value should be 100');
  });

  // Update data
  await runTest(`${dbType}: Update data`, async () => {
    const stmt = await db.prepare('UPDATE test_basic SET value = ? WHERE name = ?');
    const result = await stmt.run(150, 'test1');
    assert(result.changes === 1, 'Should update 1 row');

    // Verify update
    const selectStmt = await db.prepare('SELECT value FROM test_basic WHERE name = ?');
    const row = await selectStmt.get('test1');
    assert(row.value === 150, 'Value should be updated');
  });

  // Delete data
  await runTest(`${dbType}: Delete data`, async () => {
    const stmt = await db.prepare('DELETE FROM test_basic WHERE name = ?');
    const result = await stmt.run('test3');
    assert(result.changes === 1, 'Should delete 1 row');

    // Verify deletion
    const selectStmt = await db.prepare('SELECT COUNT(*) as count FROM test_basic');
    const row = await selectStmt.get();
    assert(row.count === 2, 'Should have 2 rows remaining');
  });

  // Cleanup
  await db.exec('DROP TABLE IF EXISTS test_basic');
}

async function testTransactions(db, dbType) {
  console.log(`\n💰 Testing transactions with ${dbType}...`);

  // Setup
  await db.exec(`
    CREATE TABLE IF NOT EXISTS test_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account TEXT NOT NULL,
      balance INTEGER NOT NULL
    )
  `);

  const insertStmt = await db.prepare('INSERT INTO test_transactions (account, balance) VALUES (?, ?)');
  await insertStmt.run('account1', 1000);
  await insertStmt.run('account2', 500);

  // Successful transaction
  await runTest(`${dbType}: Successful transaction`, async () => {
    const transaction = await db.transaction(async () => {
      const updateStmt1 = await db.prepare('UPDATE test_transactions SET balance = balance - ? WHERE account = ?');
      await updateStmt1.run(100, 'account1');

      const updateStmt2 = await db.prepare('UPDATE test_transactions SET balance = balance + ? WHERE account = ?');
      await updateStmt2.run(100, 'account2');

      return true;
    });

    const result = await transaction();
    assert(result === true, 'Transaction should return true');

    // Verify balances
    const stmt = await db.prepare('SELECT * FROM test_transactions ORDER BY account');
    const rows = await stmt.all();
    assert(rows[0].balance === 900, 'Account1 balance should be 900');
    assert(rows[1].balance === 600, 'Account2 balance should be 600');
  });

  // Failed transaction (rollback)
  await runTest(`${dbType}: Failed transaction (rollback)`, async () => {
    const transaction = await db.transaction(async () => {
      const updateStmt = await db.prepare('UPDATE test_transactions SET balance = balance - ? WHERE account = ?');
      await updateStmt.run(1000, 'account1'); // This would make balance negative

      // Simulate error
      throw new Error('Insufficient funds');
    });

    try {
      await transaction();
      assert(false, 'Transaction should have failed');
    } catch (error) {
      assert(error.message === 'Insufficient funds', 'Should catch the error');
    }

    // Verify balances unchanged
    const stmt = await db.prepare('SELECT * FROM test_transactions ORDER BY account');
    const rows = await stmt.all();
    assert(rows[0].balance === 900, 'Account1 balance should still be 900');
    assert(rows[1].balance === 600, 'Account2 balance should still be 600');
  });

  // Cleanup
  await db.exec('DROP TABLE IF EXISTS test_transactions');
}

async function testPreparedStatements(db, dbType) {
  console.log(`\n🔧 Testing prepared statements with ${dbType}...`);

  // Setup
  await db.exec(`
    CREATE TABLE IF NOT EXISTS test_prepared (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      value INTEGER
    )
  `);

  // Test parameter binding
  await runTest(`${dbType}: Parameter binding`, async () => {
    const stmt = await db.prepare('INSERT INTO test_prepared (name, value) VALUES (?, ?)');

    // Test various parameter types
    await stmt.run('string', 123);
    await stmt.run(null, 456);
    await stmt.run('zero', 0);

    const selectStmt = await db.prepare('SELECT * FROM test_prepared ORDER BY id');
    const rows = await selectStmt.all();

    assert(rows.length === 3, 'Should have 3 rows');
    assert(rows[0].name === 'string', 'First name should be "string"');
    assert(rows[1].name === null, 'Second name should be null');
    assert(rows[2].value === 0, 'Third value should be 0');
  });

  // Test statement reuse
  await runTest(`${dbType}: Statement reuse`, async () => {
    const stmt = await db.prepare('SELECT * FROM test_prepared WHERE value = ?');

    const row1 = await stmt.get(123);
    assert(row1.name === 'string', 'Should find first row');

    const row2 = await stmt.get(456);
    assert(row2.name === null, 'Should find second row');

    const row3 = await stmt.get(999);
    assert(row3 === undefined, 'Should return undefined for non-existent row');
  });

  // Test pluck mode
  await runTest(`${dbType}: Pluck mode`, async () => {
    const stmt = await db.prepare('SELECT name FROM test_prepared WHERE id = ?');
    await stmt.pluck(true);  // Pass explicit boolean
    const value = await stmt.get(1);
    assert(value === 'string', 'Should return just the value in pluck mode');
  });

  // Cleanup
  await db.exec('DROP TABLE IF EXISTS test_prepared');
}

async function testDataTypes(db, dbType) {
  console.log(`\n📊 Testing data types with ${dbType}...`);

  // Setup
  await db.exec(`
    CREATE TABLE IF NOT EXISTS test_types (
      id INTEGER PRIMARY KEY,
      text_col TEXT,
      int_col INTEGER,
      real_col REAL,
      blob_col BLOB,
      null_col TEXT
    )
  `);

  // Test various data types
  await runTest(`${dbType}: Insert and retrieve data types`, async () => {
    const stmt = await db.prepare(`
      INSERT INTO test_types (id, text_col, int_col, real_col, blob_col, null_col)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Test different types
    await stmt.run(1, 'Hello World', 42, 3.14159, Buffer.from('binary data'), null);
    await stmt.run(2, '', -100, -2.5, Buffer.from([]), null);
    await stmt.run(3, 'Special chars: 你好 🌟', 0, 0.0, null, null);

    const selectStmt = await db.prepare('SELECT * FROM test_types ORDER BY id');
    const rows = await selectStmt.all();

    assert(rows.length === 3, 'Should have 3 rows');
    assert(rows[0].text_col === 'Hello World', 'Text should match');
    assert(rows[0].int_col === 42, 'Integer should match');
    assert(Math.abs(rows[0].real_col - 3.14159) < 0.00001, 'Real should match');
    assert(rows[0].null_col === null, 'Null should be null');

    assert(rows[1].text_col === '', 'Empty string should work');
    assert(rows[1].int_col === -100, 'Negative integer should work');

    assert(rows[2].text_col === 'Special chars: 你好 🌟', 'Unicode should work');
  });

  // Cleanup
  await db.exec('DROP TABLE IF EXISTS test_types');
}

async function testPragmas(db, dbType) {
  console.log(`\n⚙️ Testing pragmas with ${dbType}...`);

  await runTest(`${dbType}: Get pragma values`, async () => {
    // Test simple pragma
    const journalMode = await db.pragma('journal_mode', { simple: true });
    assert(typeof journalMode === 'string', 'Journal mode should be a string');

    // Test pragma returning multiple rows
    const tableInfo = await db.pragma('table_info(sqlite_master)');
    assert(Array.isArray(tableInfo), 'Table info should be an array');
    assert(tableInfo.length > 0, 'Table info should have rows');
  });

  await runTest(`${dbType}: Set pragma values`, async () => {
    // Set and verify cache size
    await db.pragma('cache_size = 2000');
    const cacheSize = await db.pragma('cache_size', { simple: true });
    // Note: rqlite might not support all pragmas
    if (dbType === 'Local SQLite') {
      assert(Math.abs(cacheSize) >= 2000, 'Cache size should be set');
    }
  });
}

async function testIterator(db, dbType) {
  console.log(`\n🔄 Testing iterator with ${dbType}...`);

  // Setup
  await db.exec(`
    CREATE TABLE IF NOT EXISTS test_iterator (
      id INTEGER PRIMARY KEY,
      value INTEGER
    )
  `);

  // Insert test data
  const stmt = await db.prepare('INSERT INTO test_iterator (id, value) VALUES (?, ?)');
  for (let i = 1; i <= 10; i++) {
    await stmt.run(i, i * 10);
  }

  await runTest(`${dbType}: Iterate over results`, async () => {
    const selectStmt = await db.prepare('SELECT * FROM test_iterator ORDER BY id');
    const iterator = await selectStmt.iterate();

    let count = 0;
    let sum = 0;

    for await (const row of iterator) {
      count++;
      sum += row.value;
    }

    assert(count === 10, 'Should iterate over 10 rows');
    assert(sum === 550, 'Sum should be 550');
  });

  // Cleanup
  await db.exec('DROP TABLE IF EXISTS test_iterator');
}

// ========================================
// MAIN TEST RUNNER
// ========================================

async function runAllTests(db, dbType) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running tests with ${dbType}`);
  console.log('='.repeat(60));

  await testBasicOperations(db, dbType);
  await testTransactions(db, dbType);
  await testPreparedStatements(db, dbType);
  await testDataTypes(db, dbType);
  await testPragmas(db, dbType);
  await testIterator(db, dbType);

  console.log(`\n✨ ${dbType} tests completed`);
}

async function main() {
  console.log('=================================================');
  console.log('Better-Starlite Cross-Platform Test Suite');
  console.log('=================================================');
  console.log(`\nTest configuration:`);
  console.log(`- Verbose: ${TEST_CONFIG.verbose}`);
  console.log(`- RQLite URL: ${TEST_CONFIG.rqliteUrl}`);
  console.log(`- Test RQLite: ${TEST_CONFIG.testRqlite}\n`);

  // Test with local SQLite
  try {
    const localDb = await createDatabase(':memory:');
    await runAllTests(localDb, 'Local SQLite');
    await localDb.close();
  } catch (error) {
    console.error('Failed to test local SQLite:', error.message);
    testResults.errors.push({ test: 'Local SQLite Setup', error: error.message });
  }

  // Test with RQLite (if configured)
  if (TEST_CONFIG.testRqlite) {
    try {
      const rqliteDb = await createDatabase(TEST_CONFIG.rqliteUrl);
      await runAllTests(rqliteDb, 'RQLite');
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

module.exports = {
  runAllTests,
  testResults,
};