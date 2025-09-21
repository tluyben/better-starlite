const { AsyncDatabase } = require('../dist/index');

async function main() {
  console.log('Testing async better-starlite with local SQLite database...\n');

  // Local SQLite database (uses better-sqlite3 internally but with async API)
  const localDb = new AsyncDatabase('test-async.db');

  // Create table
  await localDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Prepare statements with await
  const insert = await localDb.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
  const selectAll = await localDb.prepare('SELECT * FROM users');
  const selectByEmail = await localDb.prepare('SELECT * FROM users WHERE email = ?');

  // Insert data with await
  console.log('Inserting users...');
  const result1 = await insert.run('Alice', 'alice@example.com');
  console.log(`Inserted Alice with ID: ${result1.lastInsertRowid}`);

  const result2 = await insert.run('Bob', 'bob@example.com');
  console.log(`Inserted Bob with ID: ${result2.lastInsertRowid}`);

  // Query data with await
  console.log('\nAll users:');
  const allUsers = await selectAll.all();
  console.log(allUsers);

  console.log('\nFinding user by email:');
  const user = await selectByEmail.get('alice@example.com');
  console.log(user);

  // Transaction example with async
  console.log('\nRunning async transaction...');
  const insertMany = await localDb.transaction(async (users) => {
    for (const user of users) {
      await insert.run(user.name, user.email);
    }
  });

  try {
    await insertMany([
      { name: 'Charlie', email: 'charlie@example.com' },
      { name: 'Diana', email: 'diana@example.com' }
    ]);
    console.log('Transaction completed successfully');
  } catch (error) {
    console.error('Transaction failed:', error.message);
  }

  // Check WAL mode is enabled by default
  const journalMode = await localDb.pragma('journal_mode');
  console.log('\nJournal mode:', journalMode);

  // Async iterator example
  console.log('\nIterating users:');
  const iterator = await selectAll.iterate();
  for await (const row of iterator) {
    console.log('  User:', row.name);
  }

  // Clean up
  await localDb.close();

  console.log('\n---\n');
  console.log('For rqlite usage with async API:');
  console.log('const rqliteDb = new AsyncDatabase("http://localhost:4001");');
  console.log('\nThe async API is identical for both backends!');
  console.log('All methods return Promises - perfect for modern Node.js applications.');
}

main().catch(console.error).finally(() => {
  // Clean up test files
  const fs = require('fs');
  if (fs.existsSync('test-async.db')) fs.unlinkSync('test-async.db');
  if (fs.existsSync('test-async.db-wal')) fs.unlinkSync('test-async.db-wal');
  if (fs.existsSync('test-async.db-shm')) fs.unlinkSync('test-async.db-shm');
});