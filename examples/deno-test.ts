/**
 * Example usage in Deno
 * Run with: deno run --allow-read --allow-write --allow-net deno-test.ts
 */

import { Database } from '../src/database-deno.ts';

// Test with local SQLite database
console.log('Testing SQLite in Deno...');
const db = new Database(':memory:');

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

// Test with RQLite (if server is running)
const rqliteUrl = 'http://localhost:4001';
console.log(`\nTesting RQLite connection to ${rqliteUrl}...`);

try {
  const rdb = new Database(rqliteUrl);

  // Note: With RQLite in Deno, we need to use async methods
  await rdb.execAsync(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      price REAL
    )
  `);

  const insertStmt = rdb.prepare('INSERT INTO products (name, price) VALUES (?, ?)');
  await insertStmt.run('Laptop', 999.99);
  await insertStmt.run('Mouse', 29.99);

  const products = rdb.prepare('SELECT * FROM products');
  const allProducts = await products.all();
  console.log('Products from RQLite:', allProducts);
} catch (e) {
  console.log('RQLite test skipped (server not running):', e.message);
}

db.close();
console.log('\nDeno test completed successfully!');