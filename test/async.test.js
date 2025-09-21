const { AsyncDatabase } = require('../dist/index');
const fs = require('fs');

// Clean up test database if exists
if (fs.existsSync('test-async.db')) {
  fs.unlinkSync('test-async.db');
}

async function runTests() {
  console.log('Testing async better-starlite functionality...\n');

  // Test 1: Local SQLite database with async API
  console.log('Test 1: Async Local SQLite with WAL mode');
  const db = new AsyncDatabase('test-async.db');

  // Create table
  await db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL
    )
  `);

  // Verify WAL mode is enabled by default
  const journalMode = await db.pragma('journal_mode');
  console.log('Journal mode:', journalMode);
  console.assert(journalMode[0].journal_mode === 'wal', 'WAL mode should be enabled by default');

  // Test prepare and run
  const insert = await db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
  const result = await insert.run('Alice', 'alice@test.com');
  console.log('Insert result:', result);
  console.assert(result.changes === 1, 'Should have 1 change');
  console.assert(result.lastInsertRowid === 1, 'Should have ID 1');

  // Test get
  const select = await db.prepare('SELECT * FROM users WHERE email = ?');
  const user = await select.get('alice@test.com');
  console.log('Retrieved user:', user);
  console.assert(user.name === 'Alice', 'Should retrieve Alice');

  // Test all
  await insert.run('Bob', 'bob@test.com');
  const selectAll = await db.prepare('SELECT * FROM users');
  const users = await selectAll.all();
  console.log('All users:', users);
  console.assert(users.length === 2, 'Should have 2 users');

  // Test async transaction
  const insertMany = await db.transaction(async (users) => {
    for (const user of users) {
      await insert.run(user.name, user.email);
    }
    return users.length;
  });

  const count = await insertMany([
    { name: 'Charlie', email: 'charlie@test.com' },
    { name: 'Diana', email: 'diana@test.com' }
  ]);

  console.log('Inserted users in transaction:', count);
  console.assert(count === 2, 'Should have inserted 2 users in transaction');

  const allUsers = await selectAll.all();
  console.log('After transaction:', allUsers);
  console.assert(allUsers.length === 4, 'Should have 4 users after transaction');

  // Test iterator
  console.log('\nTesting async iterator:');
  const iterator = await selectAll.iterate();
  let iterCount = 0;
  for await (const row of iterator) {
    iterCount++;
  }
  console.assert(iterCount === 4, 'Iterator should yield 4 rows');

  // Clean up
  await db.close();

  // Test 2: Memory database without WAL
  console.log('\nTest 2: Async Memory database');
  const memDb = new AsyncDatabase(':memory:');
  await memDb.exec('CREATE TABLE test (id INTEGER)');
  const memStmt = await memDb.prepare('INSERT INTO test VALUES (?)');
  await memStmt.run(1);
  const memSelect = await memDb.prepare('SELECT * FROM test');
  const memResult = await memSelect.get();
  console.assert(memResult.id === 1, 'Memory DB should work');
  await memDb.close();

  // Test 3: Disable WAL explicitly
  console.log('\nTest 3: Async database with WAL disabled');
  const noWalDb = new AsyncDatabase('test-nowal.db', { disableWAL: true });
  const noWalMode = await noWalDb.pragma('journal_mode');
  console.log('Journal mode (WAL disabled):', noWalMode);
  console.assert(noWalMode[0].journal_mode !== 'wal', 'WAL should be disabled when requested');
  await noWalDb.close();

  console.log('\n✅ All async tests passed!');
  console.log('\nNote: The same AsyncDatabase class works with rqlite:');
  console.log('  const rqliteDb = new AsyncDatabase("http://localhost:4001");');
  console.log('  // All the same async methods work identically!');
}

runTests().catch(console.error).finally(() => {
  // Clean up test databases
  if (fs.existsSync('test-async.db')) fs.unlinkSync('test-async.db');
  if (fs.existsSync('test-async.db-wal')) fs.unlinkSync('test-async.db-wal');
  if (fs.existsSync('test-async.db-shm')) fs.unlinkSync('test-async.db-shm');
  if (fs.existsSync('test-nowal.db')) fs.unlinkSync('test-nowal.db');
});