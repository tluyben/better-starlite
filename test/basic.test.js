const Database = require('../dist/index').default;
const fs = require('fs');

// Clean up test database if exists
if (fs.existsSync('test-basic.db')) {
  fs.unlinkSync('test-basic.db');
}

console.log('Testing better-starlite basic functionality...\n');

// Test 1: Local SQLite database
console.log('Test 1: Local SQLite with WAL mode');
const db = new Database('test-basic.db');

// Create table
db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL
  )
`);

// Verify WAL mode is enabled by default
const journalMode = db.pragma('journal_mode');
console.log('Journal mode:', journalMode);
console.assert(journalMode[0].journal_mode === 'wal', 'WAL mode should be enabled by default');

// Test prepare and run
const insert = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
const result = insert.run('Alice', 'alice@test.com');
console.log('Insert result:', result);
console.assert(result.changes === 1, 'Should have 1 change');
console.assert(result.lastInsertRowid === 1, 'Should have ID 1');

// Test get
const select = db.prepare('SELECT * FROM users WHERE email = ?');
const user = select.get('alice@test.com');
console.log('Retrieved user:', user);
console.assert(user.name === 'Alice', 'Should retrieve Alice');

// Test all
insert.run('Bob', 'bob@test.com');
const selectAll = db.prepare('SELECT * FROM users');
const users = selectAll.all();
console.log('All users:', users);
console.assert(users.length === 2, 'Should have 2 users');

// Test transaction
const insertMany = db.transaction((users) => {
  for (const user of users) {
    insert.run(user.name, user.email);
  }
});

insertMany([
  { name: 'Charlie', email: 'charlie@test.com' },
  { name: 'Diana', email: 'diana@test.com' }
]);

const allUsers = selectAll.all();
console.log('After transaction:', allUsers);
console.assert(allUsers.length === 4, 'Should have 4 users after transaction');

// Clean up
db.close();

// Test 2: Memory database without WAL
console.log('\nTest 2: Memory database (WAL disabled)');
const memDb = new Database(':memory:');
memDb.exec('CREATE TABLE test (id INTEGER)');
memDb.prepare('INSERT INTO test VALUES (?)').run(1);
const memResult = memDb.prepare('SELECT * FROM test').get();
console.assert(memResult.id === 1, 'Memory DB should work');
memDb.close();

// Test 3: Disable WAL explicitly
console.log('\nTest 3: File database with WAL disabled');
const noWalDb = new Database('test-nowal.db', { disableWAL: true });
const noWalMode = noWalDb.pragma('journal_mode');
console.log('Journal mode (WAL disabled):', noWalMode);
console.assert(noWalMode[0].journal_mode !== 'wal', 'WAL should be disabled when requested');
noWalDb.close();

// Clean up test databases
if (fs.existsSync('test-basic.db')) fs.unlinkSync('test-basic.db');
if (fs.existsSync('test-basic.db-wal')) fs.unlinkSync('test-basic.db-wal');
if (fs.existsSync('test-basic.db-shm')) fs.unlinkSync('test-basic.db-shm');
if (fs.existsSync('test-nowal.db')) fs.unlinkSync('test-nowal.db');

console.log('\n✅ All tests passed!');
console.log('\nNote: To test rqlite support, start an rqlite server and use:');
console.log('  const rqliteDb = new Database("http://localhost:4001");');