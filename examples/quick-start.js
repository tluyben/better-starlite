#!/usr/bin/env node

/**
 * Quick Start Example - Drop-in SQLite Replacement
 *
 * This example demonstrates the simplest way to use better-starlite
 * as a drop-in replacement for better-sqlite3 or node-sqlite3.
 *
 * Run with: node examples/quick-start.js
 */

// ==================================================
// OPTION 1: Direct Drop-in Replacement (Sync API)
// ==================================================
console.log('=== Option 1: Direct Drop-in Replacement ===\n');

const Database = require('../dist/index').default;

// Works exactly like better-sqlite3
const db = new Database(':memory:');

// Create a table
db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE
  )
`);

// Insert some data
const insert = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
insert.run('Alice', 'alice@example.com');
insert.run('Bob', 'bob@example.com');

// Query data
const users = db.prepare('SELECT * FROM users').all();
console.log('Users (sync):', users);

db.close();

// ==================================================
// OPTION 2: Modern Async API (Cross-Platform)
// ==================================================
console.log('\n=== Option 2: Modern Async API ===\n');

const { createDatabase } = require('../dist/async-unified');

async function modernExample() {
  // Works with local SQLite
  const localDb = await createDatabase(':memory:');

  // Create table
  await localDb.exec(`
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL
    )
  `);

  // Insert data
  const stmt = await localDb.prepare('INSERT INTO products (name, price) VALUES (?, ?)');
  await stmt.run('Laptop', 999.99);
  await stmt.run('Mouse', 29.99);

  // Query data
  const selectStmt = await localDb.prepare('SELECT * FROM products');
  const products = await selectStmt.all();
  console.log('Products (async):', products);

  await localDb.close();
}

// ==================================================
// OPTION 3: Distributed Database with RQLite
// ==================================================
console.log('\n=== Option 3: Distributed Database with RQLite ===\n');

async function distributedExample() {
  try {
    // Just change the connection string to use rqlite!
    const rqliteDb = await createDatabase('http://localhost:4001');

    await rqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const stmt = await rqliteDb.prepare('INSERT INTO events (event_type) VALUES (?)');
    await stmt.run('user_login');
    await stmt.run('page_view');

    const selectStmt = await rqliteDb.prepare('SELECT * FROM events ORDER BY timestamp DESC LIMIT 5');
    const events = await selectStmt.all();
    console.log('Recent events from RQLite:', events);

    await rqliteDb.close();
  } catch (error) {
    console.log('RQLite example skipped (server not running):', error.message);
    console.log('To test RQLite, run: docker run -p 4001:4001 rqlite/rqlite');
  }
}

// ==================================================
// MAIN: Run all examples
// ==================================================
async function main() {
  console.log('================================================');
  console.log('Better-Starlite Quick Start Examples');
  console.log('================================================\n');

  // Run async examples
  await modernExample();
  await distributedExample();

  console.log('\n================================================');
  console.log('Quick Start Complete!');
  console.log('================================================\n');

  console.log('Summary:');
  console.log('✅ Option 1: Use sync API for drop-in replacement');
  console.log('✅ Option 2: Use async API for modern code');
  console.log('✅ Option 3: Use URLs for distributed rqlite');
  console.log('\nSee MIGRATION-GUIDE.md for detailed migration instructions.');
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}