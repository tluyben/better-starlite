/**
 * Basic CR-SQLite Usage Example
 *
 * This example demonstrates the basic usage of the CR-SQLite driver
 * with better-starlite for offline-first applications.
 *
 * CR-SQLite provides CRDT-based replication for conflict-free data sync
 * across multiple devices/nodes.
 *
 * Run with: node examples/cr-sqlite-basic.js
 */

const { DriverRegistry } = require('../dist/drivers');

async function main() {
  console.log('🚀 CR-SQLite Basic Usage Example\n');

  // Step 1: Import and initialize the CR-SQLite driver
  console.log('1. Initializing CR-SQLite driver...');
  const { createCrSqliteDriver } = require('../dist/drivers/cr-sqlite-driver');
  const driver = await createCrSqliteDriver();

  if (!driver.isAvailable()) {
    console.error('❌ CR-SQLite driver is not available.');
    console.error('Please install: npm install @vlcn.io/crsqlite-wasm');
    process.exit(1);
  }

  // Step 2: Register the driver
  console.log('2. Registering CR-SQLite driver...');
  DriverRegistry.register('cr-sqlite', driver);
  DriverRegistry.setDefault('cr-sqlite');

  // Step 3: Create a database instance
  console.log('3. Creating database...');
  const db = driver.createDatabase(':memory:', {
    verbose: true,
    siteId: 'example-node-1' // Unique identifier for this database instance
  });

  console.log('   Database created successfully!\n');

  // Step 4: Create a table
  console.log('4. Creating table...');
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('   Table created!\n');

  // Step 5: Insert some data
  console.log('5. Inserting data...');
  const insertStmt = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');

  const result1 = insertStmt.run('Alice Johnson', 'alice@example.com');
  console.log(`   Inserted Alice (ID: ${result1.lastInsertRowid})`);

  const result2 = insertStmt.run('Bob Smith', 'bob@example.com');
  console.log(`   Inserted Bob (ID: ${result2.lastInsertRowid})`);

  const result3 = insertStmt.run('Charlie Brown', 'charlie@example.com');
  console.log(`   Inserted Charlie (ID: ${result3.lastInsertRowid})\n`);

  // Step 6: Query the data
  console.log('6. Querying data...');
  const selectStmt = db.prepare('SELECT * FROM users ORDER BY id');
  const users = selectStmt.all();

  console.log(`   Found ${users.length} users:`);
  for (const user of users) {
    console.log(`   - ${user.name} (${user.email})`);
  }
  console.log();

  // Step 7: Update data
  console.log('7. Updating data...');
  const updateStmt = db.prepare('UPDATE users SET email = ? WHERE name = ?');
  const updateResult = updateStmt.run('alice.johnson@example.com', 'Alice Johnson');
  console.log(`   Updated ${updateResult.changes} row(s)\n`);

  // Step 8: Query single row
  console.log('8. Querying single user...');
  const getSingleStmt = db.prepare('SELECT * FROM users WHERE name = ?');
  const alice = getSingleStmt.get('Alice Johnson');
  console.log(`   Found: ${alice.name} - ${alice.email}\n`);

  // Step 9: Use transactions
  console.log('9. Using transactions...');
  const insertMany = db.transaction((usersData) => {
    const stmt = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
    for (const userData of usersData) {
      stmt.run(userData.name, userData.email);
    }
  });

  insertMany([
    { name: 'David Lee', email: 'david@example.com' },
    { name: 'Emma Wilson', email: 'emma@example.com' },
    { name: 'Frank Miller', email: 'frank@example.com' }
  ]);
  console.log('   Transaction completed!\n');

  // Step 10: Count total users
  console.log('10. Counting users...');
  const countStmt = db.prepare('SELECT COUNT(*) as total FROM users');
  const count = countStmt.get();
  console.log(`    Total users: ${count.total}\n`);

  // Step 11: Use iterator
  console.log('11. Iterating over results...');
  const iterStmt = db.prepare('SELECT name, email FROM users LIMIT 3');
  console.log('    First 3 users:');
  for (const user of iterStmt.iterate()) {
    console.log(`    - ${user.name}`);
  }
  console.log();

  // Step 12: Use statement modes
  console.log('12. Testing statement modes...');

  // Pluck mode - returns only first column
  const pluckStmt = db.prepare('SELECT name FROM users LIMIT 1').pluck();
  const name = pluckStmt.get();
  console.log(`    Pluck mode: ${name}`);

  // Raw mode - returns array instead of object
  const rawStmt = db.prepare('SELECT id, name, email FROM users LIMIT 1').raw();
  const rawRow = rawStmt.get();
  console.log(`    Raw mode: [${rawRow.join(', ')}]\n`);

  // Step 13: Delete data
  console.log('13. Deleting data...');
  const deleteStmt = db.prepare('DELETE FROM users WHERE name = ?');
  const deleteResult = deleteStmt.run('Frank Miller');
  console.log(`    Deleted ${deleteResult.changes} row(s)\n`);

  // Step 14: Final count
  const finalCount = countStmt.get();
  console.log(`14. Final user count: ${finalCount.total}\n`);

  // Step 15: Close the database
  console.log('15. Closing database...');
  db.close();
  console.log('    Database closed!\n');

  console.log('✅ Example completed successfully!');
}

// Run the example
main().catch((error) => {
  console.error('❌ Error running example:', error);
  process.exit(1);
});
