const Database = require('../dist/index').default;

console.log('Testing better-starlite with local SQLite database...\n');

// Local SQLite database (uses better-sqlite3 internally)
const localDb = new Database('test.db');

// Create table
localDb.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Prepare statements
const insert = localDb.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
const selectAll = localDb.prepare('SELECT * FROM users');
const selectByEmail = localDb.prepare('SELECT * FROM users WHERE email = ?');

// Insert data
console.log('Inserting users...');
const result1 = insert.run('Alice', 'alice@example.com');
console.log(`Inserted Alice with ID: ${result1.lastInsertRowid}`);

const result2 = insert.run('Bob', 'bob@example.com');
console.log(`Inserted Bob with ID: ${result2.lastInsertRowid}`);

// Query data
console.log('\nAll users:');
const allUsers = selectAll.all();
console.log(allUsers);

console.log('\nFinding user by email:');
const user = selectByEmail.get('alice@example.com');
console.log(user);

// Transaction example
console.log('\nRunning transaction...');
const insertMany = localDb.transaction((users) => {
  for (const user of users) {
    insert.run(user.name, user.email);
  }
});

try {
  insertMany([
    { name: 'Charlie', email: 'charlie@example.com' },
    { name: 'Diana', email: 'diana@example.com' }
  ]);
  console.log('Transaction completed successfully');
} catch (error) {
  console.error('Transaction failed:', error.message);
}

// Check WAL mode is enabled by default
const journalMode = localDb.pragma('journal_mode');
console.log('\nJournal mode:', journalMode);

// Clean up
localDb.close();

console.log('\n---\n');
console.log('For rqlite usage, use an HTTP/HTTPS URL:');
console.log('const rqliteDb = new Database("http://localhost:4001");');
console.log('\nThe API is identical - all the same methods work!');