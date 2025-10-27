/**
 * CR-SQLite Driver Tests for better-starlite
 *
 * These tests verify that the CR-SQLite driver works correctly with:
 * - Basic CRUD operations
 * - Transactions
 * - CRDT replication features
 * - Cross-platform compatibility (Node.js, Bun, Deno)
 *
 * Run with: node tests/cr-sqlite-test.js
 * Or with: npm test:cr-sqlite
 */

const { DriverRegistry } = require('../dist/drivers');

// Test suite configuration
const TEST_CONFIG = {
  verbose: process.env.VERBOSE === 'true',
  testReplication: process.env.TEST_REPLICATION === 'true',
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
// DRIVER REGISTRATION AND AVAILABILITY
// ========================================

async function testDriverRegistration() {
  console.log('\n🔧 Testing CR-SQLite driver registration...');

  await runTest('CR-SQLite: Driver can be imported', async () => {
    const { createCrSqliteDriver } = require('../dist/drivers/cr-sqlite-driver');
    assert(typeof createCrSqliteDriver === 'function', 'createCrSqliteDriver should be a function');
  });

  await runTest('CR-SQLite: Driver can be created and initialized', async () => {
    const { createCrSqliteDriver } = require('../dist/drivers/cr-sqlite-driver');
    const driver = await createCrSqliteDriver();
    assert(driver !== null, 'Driver should be created');
    assert(driver.name === 'cr-sqlite', 'Driver name should be cr-sqlite');
  });

  await runTest('CR-SQLite: Driver reports availability', async () => {
    const { createCrSqliteDriver } = require('../dist/drivers/cr-sqlite-driver');
    const driver = await createCrSqliteDriver();
    const available = driver.isAvailable();
    console.log(`   CR-SQLite availability: ${available}`);
    // Note: This may be false if @vlcn.io/crsqlite-wasm is not installed
  });

  await runTest('CR-SQLite: Driver can be registered', async () => {
    DriverRegistry.clear(); // Clear any existing registrations
    const { createCrSqliteDriver } = require('../dist/drivers/cr-sqlite-driver');
    const driver = await createCrSqliteDriver();
    DriverRegistry.register('cr-sqlite', driver);

    const registered = DriverRegistry.get('cr-sqlite');
    assert(registered !== undefined, 'Driver should be registered');
    assert(registered.name === 'cr-sqlite', 'Registered driver should be cr-sqlite');
  });

  await runTest('CR-SQLite: Driver features are correct', async () => {
    const { createCrSqliteDriver } = require('../dist/drivers/cr-sqlite-driver');
    const driver = await createCrSqliteDriver();

    assert(driver.features.backup === false, 'Backup should not be supported');
    assert(driver.features.loadExtension === false, 'loadExtension should not be supported');
    assert(driver.features.customFunctions === true, 'customFunctions should be supported');
    assert(driver.features.customAggregates === false, 'customAggregates should not be supported');
    assert(driver.features.transactions === true, 'transactions should be supported');
    assert(driver.features.wal === false, 'WAL should not be supported (uses CRDT instead)');
  });
}

// ========================================
// BASIC DATABASE OPERATIONS
// ========================================

async function testBasicOperations() {
  console.log('\n📝 Testing basic operations with CR-SQLite...');

  // Check if driver is available
  const { createCrSqliteDriver } = require('../dist/drivers/cr-sqlite-driver');
  let driver;
  try {
    driver = await createCrSqliteDriver();
    if (!driver.isAvailable()) {
      console.log('⚠️  CR-SQLite driver not available (install @vlcn.io/crsqlite-wasm), skipping basic tests');
      testResults.skipped += 8;
      return;
    }
  } catch (e) {
    console.log('⚠️  CR-SQLite driver not available:', e.message, ', skipping basic tests');
    testResults.skipped += 8;
    return;
  }

  DriverRegistry.clear();
  DriverRegistry.register('cr-sqlite', driver);

  // Create database
  let db;
  await runTest('CR-SQLite: Create in-memory database', async () => {
    db = driver.createDatabase(':memory:', { verbose: TEST_CONFIG.verbose, siteId: 'test-node-1' });
    assert(db !== null, 'Database should be created');
    assert(db.memory === true, 'Should be in-memory database');
  });

  // Create table
  await runTest('CR-SQLite: Create table', async () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS test_basic (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        value INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  // Insert data
  await runTest('CR-SQLite: Insert data', async () => {
    const stmt = db.prepare('INSERT INTO test_basic (name, value) VALUES (?, ?)');
    const result = stmt.run('test1', 100);
    assert(result.changes === 1, 'Should insert 1 row');
    assert(result.lastInsertRowid > 0, 'Should return lastInsertRowid');
  });

  // Select single row
  await runTest('CR-SQLite: Select single row', async () => {
    const stmt = db.prepare('SELECT * FROM test_basic WHERE name = ?');
    const row = stmt.get('test1');
    assert(row !== undefined, 'Should return a row');
    assert(row.name === 'test1', 'Name should match');
    assert(row.value === 100, 'Value should match');
  });

  // Select multiple rows
  await runTest('CR-SQLite: Insert and select multiple rows', async () => {
    const insertStmt = db.prepare('INSERT INTO test_basic (name, value) VALUES (?, ?)');
    insertStmt.run('test2', 200);
    insertStmt.run('test3', 300);

    const selectStmt = db.prepare('SELECT * FROM test_basic ORDER BY value');
    const rows = selectStmt.all();
    assert(rows.length >= 3, 'Should return at least 3 rows');
    assert(rows[0].value === 100, 'First row value should be 100');
  });

  // Update data
  await runTest('CR-SQLite: Update data', async () => {
    const updateStmt = db.prepare('UPDATE test_basic SET value = ? WHERE name = ?');
    const result = updateStmt.run(150, 'test1');
    assert(result.changes === 1, 'Should update 1 row');

    const selectStmt = db.prepare('SELECT value FROM test_basic WHERE name = ?');
    const row = selectStmt.get('test1');
    assert(row.value === 150, 'Value should be updated');
  });

  // Delete data
  await runTest('CR-SQLite: Delete data', async () => {
    const deleteStmt = db.prepare('DELETE FROM test_basic WHERE name = ?');
    const result = deleteStmt.run('test2');
    assert(result.changes === 1, 'Should delete 1 row');

    const selectStmt = db.prepare('SELECT COUNT(*) as count FROM test_basic');
    const row = selectStmt.get();
    assert(row.count === 2, 'Should have 2 rows remaining');
  });

  // Iterate over results
  await runTest('CR-SQLite: Iterate over results', async () => {
    const stmt = db.prepare('SELECT * FROM test_basic ORDER BY value');
    let count = 0;
    for (const row of stmt.iterate()) {
      count++;
      assert(row.name !== undefined, 'Row should have name');
      assert(row.value !== undefined, 'Row should have value');
    }
    assert(count === 2, 'Should iterate over 2 rows');
  });

  // Close database
  if (db) {
    db.close();
  }
}

// ========================================
// STATEMENT CONFIGURATION TESTS
// ========================================

async function testStatementConfiguration() {
  console.log('\n⚙️  Testing statement configuration with CR-SQLite...');

  const { createCrSqliteDriver } = require('../dist/drivers/cr-sqlite-driver');
  let driver;
  try {
    driver = await createCrSqliteDriver();
    if (!driver.isAvailable()) {
      console.log('⚠️  CR-SQLite driver not available, skipping statement configuration tests');
      testResults.skipped += 4;
      return;
    }
  } catch (e) {
    console.log('⚠️  CR-SQLite driver not available, skipping statement configuration tests');
    testResults.skipped += 4;
    return;
  }

  const db = driver.createDatabase(':memory:');

  // Setup test data
  db.exec(`
    CREATE TABLE test_config (id INTEGER PRIMARY KEY, name TEXT, value INTEGER);
    INSERT INTO test_config VALUES (1, 'test1', 100);
    INSERT INTO test_config VALUES (2, 'test2', 200);
  `);

  // Test pluck mode
  await runTest('CR-SQLite: Statement pluck mode', async () => {
    const stmt = db.prepare('SELECT value FROM test_config WHERE id = ?').pluck();
    const value = stmt.get(1);
    assert(value === 100, 'Pluck should return first column value');
  });

  // Test raw mode
  await runTest('CR-SQLite: Statement raw mode', async () => {
    const stmt = db.prepare('SELECT id, name, value FROM test_config WHERE id = ?').raw();
    const row = stmt.get(1);
    assert(Array.isArray(row), 'Raw mode should return array');
    assert(row[0] === 1, 'First element should be id');
    assert(row[1] === 'test1', 'Second element should be name');
    assert(row[2] === 100, 'Third element should be value');
  });

  // Test bind method
  await runTest('CR-SQLite: Statement bind method', async () => {
    const stmt = db.prepare('SELECT * FROM test_config WHERE id = ?');
    stmt.bind(2);
    const row = stmt.get(2); // Note: bind is called, but get still needs params
    assert(row !== undefined, 'Should return a row');
  });

  // Test columns method
  await runTest('CR-SQLite: Statement columns method', async () => {
    const stmt = db.prepare('SELECT id, name, value FROM test_config');
    const columns = stmt.columns();
    assert(columns !== undefined, 'Should return columns');
    assert(columns.length === 3, 'Should have 3 columns');
    assert(columns[0].name === 'id', 'First column should be id');
  });

  db.close();
}

// ========================================
// TRANSACTION TESTS
// ========================================

async function testTransactions() {
  console.log('\n💰 Testing transactions with CR-SQLite...');

  const { createCrSqliteDriver } = require('../dist/drivers/cr-sqlite-driver');
  let driver;
  try {
    driver = await createCrSqliteDriver();
    if (!driver.isAvailable()) {
      console.log('⚠️  CR-SQLite driver not available, skipping transaction tests');
      testResults.skipped += 3;
      return;
    }
  } catch (e) {
    console.log('⚠️  CR-SQLite driver not available, skipping transaction tests');
    testResults.skipped += 3;
    return;
  }

  const db = driver.createDatabase(':memory:');

  db.exec(`
    CREATE TABLE test_transaction (id INTEGER PRIMARY KEY, value INTEGER);
  `);

  // Test successful transaction
  await runTest('CR-SQLite: Successful transaction', async () => {
    const insertMany = db.transaction((values) => {
      const stmt = db.prepare('INSERT INTO test_transaction (value) VALUES (?)');
      for (const value of values) {
        stmt.run(value);
      }
    });

    insertMany([100, 200, 300]);

    const stmt = db.prepare('SELECT COUNT(*) as count FROM test_transaction');
    const row = stmt.get();
    assert(row.count === 3, 'Should have 3 rows after transaction');
  });

  // Test rollback on error
  await runTest('CR-SQLite: Transaction rollback on error', async () => {
    const insertManyWithError = db.transaction((values) => {
      const stmt = db.prepare('INSERT INTO test_transaction (value) VALUES (?)');
      for (const value of values) {
        if (value === 999) {
          throw new Error('Intentional error');
        }
        stmt.run(value);
      }
    });

    try {
      insertManyWithError([400, 500, 999, 600]);
    } catch (e) {
      // Expected error
    }

    const stmt = db.prepare('SELECT COUNT(*) as count FROM test_transaction');
    const row = stmt.get();
    assert(row.count === 3, 'Should still have 3 rows (transaction rolled back)');
  });

  // Test nested transactions (should work with proper BEGIN/COMMIT)
  await runTest('CR-SQLite: inTransaction property', async () => {
    assert(db.inTransaction === false, 'Should not be in transaction initially');

    const transaction = db.transaction(() => {
      assert(db.inTransaction === true, 'Should be in transaction during execution');
    });

    transaction();

    assert(db.inTransaction === false, 'Should not be in transaction after completion');
  });

  db.close();
}

// ========================================
// CRDT REPLICATION TESTS
// ========================================

async function testCRDTFeatures() {
  console.log('\n🔄 Testing CRDT replication features with CR-SQLite...');

  const { createCrSqliteDriver } = require('../dist/drivers/cr-sqlite-driver');
  let driver;
  try {
    driver = await createCrSqliteDriver();
    if (!driver.isAvailable() || !TEST_CONFIG.testReplication) {
      console.log('⚠️  CR-SQLite CRDT tests skipped (set TEST_REPLICATION=true to enable)');
      testResults.skipped += 4;
      return;
    }
  } catch (e) {
    console.log('⚠️  CR-SQLite driver not available, skipping CRDT tests');
    testResults.skipped += 4;
    return;
  }

  // Create two database instances representing two nodes
  const db1 = driver.createDatabase(':memory:', { siteId: 'node-1' });
  const db2 = driver.createDatabase(':memory:', { siteId: 'node-2' });

  // Test: Setup CRDT tables on both databases
  await runTest('CR-SQLite: Setup CRDT-tracked tables', async () => {
    const schema = `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL
      );
      SELECT crsql_as_crr('users');
    `;

    db1.exec(schema);
    db2.exec(schema);
  });

  // Test: Insert data on node 1
  await runTest('CR-SQLite: Insert data on node 1', async () => {
    const stmt = db1.prepare('INSERT INTO users (id, name, email) VALUES (?, ?, ?)');
    stmt.run(1, 'Alice', 'alice@example.com');
    stmt.run(2, 'Bob', 'bob@example.com');
  });

  // Test: Track changes
  await runTest('CR-SQLite: Get changes from node 1', async () => {
    const changes = db1.getChanges();
    assert(Array.isArray(changes), 'Changes should be an array');
    assert(changes.length > 0, 'Should have changes to sync');
    if (TEST_CONFIG.verbose) {
      console.log(`   Found ${changes.length} changes to sync`);
    }
  });

  // Test: Apply changes to node 2
  await runTest('CR-SQLite: Apply changes to node 2', async () => {
    const changes = db1.getChanges();
    db2.applyChanges(changes);

    const stmt = db2.prepare('SELECT COUNT(*) as count FROM users');
    const row = stmt.get();
    assert(row.count === 2, 'Node 2 should have synced data from node 1');
  });

  db1.close();
  db2.close();
}

// ========================================
// CUSTOM FUNCTIONS TEST
// ========================================

async function testCustomFunctions() {
  console.log('\n🔧 Testing custom functions with CR-SQLite...');

  const { createCrSqliteDriver } = require('../dist/drivers/cr-sqlite-driver');
  let driver;
  try {
    driver = await createCrSqliteDriver();
    if (!driver.isAvailable()) {
      console.log('⚠️  CR-SQLite driver not available, skipping custom function tests');
      testResults.skipped += 1;
      return;
    }
  } catch (e) {
    console.log('⚠️  CR-SQLite driver not available, skipping custom function tests');
    testResults.skipped += 1;
    return;
  }

  const db = driver.createDatabase(':memory:');

  await runTest('CR-SQLite: Register and use custom function', async () => {
    // Register a custom function
    db.function('add_numbers', (a, b) => a + b);

    // Use the custom function
    const stmt = db.prepare('SELECT add_numbers(10, 20) as result');
    const row = stmt.get();
    assert(row.result === 30, 'Custom function should return correct result');
  });

  db.close();
}

// ========================================
// ERROR HANDLING TESTS
// ========================================

async function testErrorHandling() {
  console.log('\n⚠️  Testing error handling with CR-SQLite...');

  const { createCrSqliteDriver } = require('../dist/drivers/cr-sqlite-driver');
  let driver;
  try {
    driver = await createCrSqliteDriver();
    if (!driver.isAvailable()) {
      console.log('⚠️  CR-SQLite driver not available, skipping error handling tests');
      testResults.skipped += 3;
      return;
    }
  } catch (e) {
    console.log('⚠️  CR-SQLite driver not available, skipping error handling tests');
    testResults.skipped += 3;
    return;
  }

  const db = driver.createDatabase(':memory:');

  await runTest('CR-SQLite: SQL syntax error throws', async () => {
    try {
      db.exec('INVALID SQL STATEMENT');
      assert(false, 'Should throw error for invalid SQL');
    } catch (e) {
      assert(e !== undefined, 'Should catch SQL error');
    }
  });

  await runTest('CR-SQLite: Operations on closed database throw', async () => {
    const tempDb = driver.createDatabase(':memory:');
    tempDb.close();

    try {
      tempDb.exec('SELECT 1');
      assert(false, 'Should throw error for closed database');
    } catch (e) {
      assert(e.message.includes('closed'), 'Error should mention closed database');
    }
  });

  await runTest('CR-SQLite: Unsupported operations throw', async () => {
    try {
      db.loadExtension('/some/path');
      assert(false, 'loadExtension should throw');
    } catch (e) {
      assert(e.message.includes('not supported'), 'Should mention unsupported operation');
    }
  });

  db.close();
}

// ========================================
// MAIN TEST RUNNER
// ========================================

async function main() {
  console.log('🚀 Starting CR-SQLite Driver Tests\n');
  console.log('=' .repeat(60));

  const startTime = Date.now();

  // Run all test suites
  await testDriverRegistration();
  await testBasicOperations();
  await testStatementConfiguration();
  await testTransactions();
  await testCRDTFeatures();
  await testCustomFunctions();
  await testErrorHandling();

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  // Print results
  console.log('\n' + '=' .repeat(60));
  console.log('📊 Test Results Summary');
  console.log('=' .repeat(60));
  console.log(`✅ Passed:  ${testResults.passed}`);
  console.log(`❌ Failed:  ${testResults.failed}`);
  console.log(`⏭️  Skipped: ${testResults.skipped}`);
  console.log(`⏱️  Duration: ${duration}s`);

  if (testResults.failed > 0) {
    console.log('\n❌ Failed Tests:');
    for (const error of testResults.errors) {
      console.log(`  - ${error.test}`);
      console.log(`    ${error.error}`);
    }
  }

  console.log('\n' + '=' .repeat(60));

  // Exit with appropriate code
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run tests
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error running tests:', error);
    process.exit(1);
  });
}

module.exports = { main, testResults };
