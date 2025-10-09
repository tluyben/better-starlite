/**
 * Example usage in Node.js
 * Run with: node node-test.js
 */

const Database = require('../dist/database-node');

// Test with local SQLite database
console.log('Testing SQLite in Node.js...');
const db = new Database.Database(':memory:');

// Create table
db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE
  )
`);

// Insert data
const stmt = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
stmt.run('John Doe', 'john@example.com');
stmt.run('Jane Smith', 'jane@example.com');

// Query data
const selectStmt = db.prepare('SELECT * FROM users');
const users = selectStmt.all();
console.log('Users:', users);

// Get single row
const userStmt = db.prepare('SELECT * FROM users WHERE id = ?');
const user = userStmt.get(1);
console.log('User 1:', user);

// Test transactions
const addUsers = db.transaction((users) => {
  const insert = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
  for (const user of users) {
    insert.run(user.name, user.email);
  }
});

addUsers([
  { name: 'Alice Brown', email: 'alice@example.com' },
  { name: 'Bob Wilson', email: 'bob@example.com' }
]);

console.log('Total users:', db.prepare('SELECT COUNT(*) as count FROM users').get().count);

// Test with RQLite (if server is running)
const rqliteUrl = 'http://localhost:4001';
console.log(`\nTesting RQLite connection to ${rqliteUrl}...`);

try {
  const rdb = new Database.Database(rqliteUrl);

  rdb.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      price REAL
    )
  `);

  const insertStmt = rdb.prepare('INSERT INTO products (name, price) VALUES (?, ?)');
  insertStmt.run('Laptop', 999.99);
  insertStmt.run('Mouse', 29.99);

  const products = rdb.prepare('SELECT * FROM products').all();
  console.log('Products from RQLite:', products);
} catch (e) {
  console.log('RQLite test skipped (server not running):', e.message);
}

db.close();
console.log('\nNode.js test completed successfully!');