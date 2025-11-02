/**
 * Cross-Database Integration Tests
 *
 * Proves that the SAME CODE works on SQLite, MySQL, and PostgreSQL
 * via the plugin system with the async interface.
 */

const { AsyncDatabase } = require('../dist/index');
const { registerAllPlugins } = require('../dist/drivers/plugins');
const fs = require('fs');

// Register all plugins once
registerAllPlugins({ verbose: false });

// Common test data
const testUsers = [
  { name: 'Alice', email: 'alice@test.com' },
  { name: 'Bob', email: 'bob@test.com' },
  { name: 'Charlie', email: 'charlie@test.com' }
];

// Common test function that works across all databases
async function runDatabaseTests(db, dbName) {
  // Create table - SAME SQLite syntax for all databases!
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert data
  const insert = await db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');

  for (const user of testUsers) {
    const result = await insert.run(user.name, user.email);
    expect(result.changes).toBe(1);
  }

  // Query data
  const selectAll = await db.prepare('SELECT * FROM users ORDER BY id');
  const users = await selectAll.all();

  expect(users.length).toBe(testUsers.length);
  expect(users[0].name).toBe('Alice');
  expect(users[1].name).toBe('Bob');
  expect(users[2].name).toBe('Charlie');

  // Test WHERE clause
  const selectOne = await db.prepare('SELECT * FROM users WHERE email = ?');
  const alice = await selectOne.get('alice@test.com');

  expect(alice).toBeDefined();
  expect(alice.name).toBe('Alice');
  expect(alice.email).toBe('alice@test.com');

  // Test COUNT
  const count = await db.prepare('SELECT COUNT(*) as total FROM users');
  const countResult = await count.get();
  expect(Number(countResult.total)).toBe(testUsers.length);

  // Test transaction
  const insertMany = await db.transaction(async (newUsers) => {
    for (const user of newUsers) {
      await insert.run(user.name, user.email);
    }
    return newUsers.length;
  });

  const moreUsers = [
    { name: 'Diana', email: 'diana@test.com' },
    { name: 'Eve', email: 'eve@test.com' }
  ];

  const inserted = await insertMany(moreUsers);
  expect(inserted).toBe(2);

  // Verify transaction worked
  const allUsers = await selectAll.all();
  expect(allUsers.length).toBe(testUsers.length + moreUsers.length);

  console.log(`✅ ${dbName}: All tests passed! (${allUsers.length} users in database)`);
}

// Cleanup function
async function cleanupDatabase(db, dbName) {
  try {
    await db.exec('DROP TABLE IF EXISTS users');
  } catch (err) {
    // Table might not exist
  }
  await db.close();
}

describe('Cross-Database Integration Tests (Same Code, Different Databases)', () => {
  const testTimeout = 30000; // 30 seconds for database operations

  afterEach(() => {
    // Clean up SQLite test files
    ['test-integration.db', 'test-integration.db-wal', 'test-integration.db-shm'].forEach(file => {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    });
  });

  test('SQLite - Baseline (no plugins needed)', async () => {
    const db = new AsyncDatabase('test-integration.db');

    try {
      await runDatabaseTests(db, 'SQLite');
    } finally {
      await cleanupDatabase(db, 'SQLite');
    }
  }, testTimeout);

  // MySQL test - requires MySQL to be running
  test('MySQL - Same code with MySQL plugin', async () => {
    // Check if MySQL is available
    let mysqlAvailable = false;
    try {
      const mysql = require('mysql2/promise');
      const testConnection = await mysql.createConnection({
        host: 'localhost',
        port: 3306,
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });
      await testConnection.end();
      mysqlAvailable = true;
    } catch (err) {
      console.log('⏭️  Skipping MySQL test - MySQL not available:', err.message);
    }

    if (!mysqlAvailable) {
      console.log('ℹ️  To run MySQL tests: docker run -d -p 3306:3306 -e MYSQL_ROOT_PASSWORD=rootpass -e MYSQL_DATABASE=testdb -e MYSQL_USER=testuser -e MYSQL_PASSWORD=testpass mysql:8.0');
      return; // Skip test but don't fail
    }

    // MySQL is available - run the test!
    const connectionString = 'mysql://testuser:testpass@localhost:3306/testdb';
    const db = new AsyncDatabase(connectionString, {
      schemaRewriter: 'mysql',
      queryRewriter: 'mysql'
    });

    try {
      await runDatabaseTests(db, 'MySQL');
    } finally {
      await cleanupDatabase(db, 'MySQL');
    }
  }, testTimeout);

  // PostgreSQL test - requires PostgreSQL to be running
  test('PostgreSQL - Same code with PostgreSQL plugin', async () => {
    // Check if PostgreSQL is available
    let postgresAvailable = false;
    try {
      const { Client } = require('pg');
      const testClient = new Client({
        connectionString: 'postgresql://testuser:testpass@localhost:5432/testdb'
      });
      await testClient.connect();
      await testClient.end();
      postgresAvailable = true;
    } catch (err) {
      console.log('⏭️  Skipping PostgreSQL test - PostgreSQL not available:', err.message);
    }

    if (!postgresAvailable) {
      console.log('ℹ️  To run PostgreSQL tests: docker run -d -p 5432:5432 -e POSTGRES_USER=testuser -e POSTGRES_PASSWORD=testpass -e POSTGRES_DB=testdb postgres:16-alpine');
      return; // Skip test but don't fail
    }

    // PostgreSQL is available - run the test!
    const connectionString = 'postgresql://testuser:testpass@localhost:5432/testdb';
    const db = new AsyncDatabase(connectionString, {
      schemaRewriter: 'postgresql',
      queryRewriter: 'postgresql'
    });

    try {
      await runDatabaseTests(db, 'PostgreSQL');
    } finally {
      await cleanupDatabase(db, 'PostgreSQL');
    }
  }, testTimeout);

  // RQLite test - requires RQLite to be running
  test('RQLite - Same code with RQLite (distributed SQLite)', async () => {
    // Check if RQLite is available
    let rqliteAvailable = false;
    try {
      const response = await fetch('http://localhost:4001/status');
      if (response.ok) {
        rqliteAvailable = true;
      }
    } catch (err) {
      console.log('⏭️  Skipping RQLite test - RQLite not available:', err.message);
    }

    if (!rqliteAvailable) {
      console.log('ℹ️  To run RQLite tests: docker run -d -p 4001:4001 -p 4002:4002 rqlite/rqlite -http-addr 0.0.0.0:4001 -raft-addr 0.0.0.0:4002');
      return; // Skip test but don't fail
    }

    // RQLite is available - run the test!
    const db = new AsyncDatabase('http://localhost:4001');

    try {
      await runDatabaseTests(db, 'RQLite');
    } finally {
      await cleanupDatabase(db, 'RQLite');
    }
  }, testTimeout);
});

describe('Plugin Translation Verification', () => {
  test('Verify plugins are registered', () => {
    const { PluginRegistry } = require('../dist/drivers/plugins');

    // Check schema plugins
    const pgSchema = PluginRegistry.getSchemaPlugin('postgresql');
    const mysqlSchema = PluginRegistry.getSchemaPlugin('mysql');

    expect(pgSchema).toBeDefined();
    expect(mysqlSchema).toBeDefined();

    // Check query plugins
    const pgQuery = PluginRegistry.getQueryPlugin('postgresql');
    const mysqlQuery = PluginRegistry.getQueryPlugin('mysql');

    expect(pgQuery).toBeDefined();
    expect(mysqlQuery).toBeDefined();
  });

  test('Plugin can translate SQLite schema to PostgreSQL', () => {
    const { PluginRegistry } = require('../dist/drivers/plugins');
    const plugin = PluginRegistry.getSchemaPlugin('postgresql');

    const sqliteSchema = `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const pgSchema = plugin.rewriteSchema(sqliteSchema);

    expect(pgSchema).toContain('SERIAL');
    expect(pgSchema).toContain('VARCHAR');
    expect(pgSchema).toContain('TIMESTAMP');
    expect(pgSchema).not.toContain('AUTOINCREMENT');
    expect(pgSchema).not.toContain('INTEGER PRIMARY KEY AUTOINCREMENT');
  });

  test('Plugin can translate SQLite schema to MySQL', () => {
    const { PluginRegistry } = require('../dist/drivers/plugins');
    const plugin = PluginRegistry.getSchemaPlugin('mysql');

    const sqliteSchema = `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const mysqlSchema = plugin.rewriteSchema(sqliteSchema);

    expect(mysqlSchema).toContain('AUTO_INCREMENT');
    expect(mysqlSchema).toContain('VARCHAR');
    expect(mysqlSchema).toContain('TIMESTAMP');
    expect(mysqlSchema).not.toContain('AUTOINCREMENT');
    expect(mysqlSchema).not.toContain('INTEGER PRIMARY KEY AUTOINCREMENT');
  });
});
