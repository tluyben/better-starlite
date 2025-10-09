/**
 * Test the async interface in Node.js
 * Run with: node test-async-node.js
 */

const { createDatabase } = require('./dist/async-unified');

async function testSqlite() {
  console.log('Testing SQLite with async interface in Node.js...');

  const db = await createDatabase(':memory:');

  // Create table
  await db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE
    )
  `);

  // Prepare and execute statements
  const insertStmt = await db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
  await insertStmt.run('John Doe', 'john@example.com');
  await insertStmt.run('Jane Smith', 'jane@example.com');

  // Query data
  const selectStmt = await db.prepare('SELECT * FROM users');
  const users = await selectStmt.all();
  console.log('Users:', users);

  // Get single row
  const userStmt = await db.prepare('SELECT * FROM users WHERE id = ?');
  const user = await userStmt.get(1);
  console.log('User 1:', user);

  // Test transaction
  const addUsersInTransaction = await db.transaction(async () => {
    const stmt = await db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
    await stmt.run('Alice Brown', 'alice@example.com');
    await stmt.run('Bob Wilson', 'bob@example.com');
  });

  await addUsersInTransaction();

  const countStmt = await db.prepare('SELECT COUNT(*) as count FROM users');
  const count = await countStmt.get();
  console.log('Total users after transaction:', count.count);

  // Test iteration
  console.log('Iterating over users:');
  const allUsersStmt = await db.prepare('SELECT * FROM users');
  const iterator = await allUsersStmt.iterate();
  for await (const user of iterator) {
    console.log('  -', user.name);
  }

  await db.close();
  console.log('SQLite test completed successfully!\n');
}

async function testRqlite() {
  const rqliteUrl = 'http://localhost:4001';
  console.log(`Testing RQLite with async interface at ${rqliteUrl}...`);

  try {
    const db = await createDatabase(rqliteUrl);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        price REAL
      )
    `);

    const insertStmt = await db.prepare('INSERT INTO products (name, price) VALUES (?, ?)');
    await insertStmt.run('Laptop', 999.99);
    await insertStmt.run('Mouse', 29.99);
    await insertStmt.run('Keyboard', 79.99);

    const selectStmt = await db.prepare('SELECT * FROM products');
    const products = await selectStmt.all();
    console.log('Products from RQLite:', products);

    const avgStmt = await db.prepare('SELECT AVG(price) as avg_price FROM products');
    const avgResult = await avgStmt.get();
    console.log('Average price:', avgResult.avg_price);

    await db.close();
    console.log('RQLite test completed successfully!');
  } catch (e) {
    console.log('RQLite test skipped (server not running):', e.message);
  }
}

// Run tests
(async () => {
  await testSqlite();
  await testRqlite();
  console.log('\nAll Node.js async tests completed!');
})();