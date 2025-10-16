#!/usr/bin/env node

/**
 * Simple Cross-Platform Example
 *
 * This example demonstrates how better-starlite works identically
 * across different database backends without any code changes.
 *
 * Run with: node examples/simple-cross-platform.js
 */

const { createDatabase } = require('../dist/async-unified');

// ========================================
// Shared database operations
// ========================================
async function runDatabaseOperations(db, dbType) {
  console.log(`\n📊 Testing with ${dbType}`);
  console.log('━'.repeat(40));

  // Create table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      completed BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ Table created');

  // Insert data
  const insertStmt = await db.prepare('INSERT INTO todos (title, completed) VALUES (?, ?)');
  await insertStmt.run('Write documentation', 1);
  await insertStmt.run('Add tests', 1);
  await insertStmt.run('Create examples', 1);
  await insertStmt.run('Setup CI/CD', 0);
  await insertStmt.run('Release v1.0', 0);
  console.log('✅ Data inserted');

  // Query all todos
  const allStmt = await db.prepare('SELECT * FROM todos ORDER BY id');
  const allTodos = await allStmt.all();
  console.log(`\n📋 All todos (${allTodos.length} items):`);
  allTodos.forEach(todo => {
    const status = todo.completed ? '✅' : '⬜';
    console.log(`  ${status} ${todo.id}. ${todo.title}`);
  });

  // Count completed vs pending
  const statsStmt = await db.prepare(`
    SELECT
      SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN completed = 0 THEN 1 ELSE 0 END) as pending,
      COUNT(*) as total
    FROM todos
  `);
  const stats = await statsStmt.get();
  console.log(`\n📈 Statistics:`);
  console.log(`  Completed: ${stats.completed}/${stats.total}`);
  console.log(`  Pending: ${stats.pending}/${stats.total}`);
  console.log(`  Progress: ${Math.round((stats.completed / stats.total) * 100)}%`);

  // Transaction example - mark a todo as complete
  const transaction = await db.transaction(async () => {
    const updateStmt = await db.prepare('UPDATE todos SET completed = 1 WHERE title = ?');
    const result = await updateStmt.run('Setup CI/CD');

    if (result.changes === 0) {
      throw new Error('Todo not found');
    }

    return result.changes;
  });

  const updated = await transaction();
  console.log(`\n✏️ Updated ${updated} todo(s) in transaction`);

  // Verify update
  const verifyStmt = await db.prepare('SELECT * FROM todos WHERE title = ?');
  const updatedTodo = await verifyStmt.get('Setup CI/CD');
  console.log(`  Todo "${updatedTodo.title}" is now ${updatedTodo.completed ? 'completed ✅' : 'pending ⬜'}`);

  // Clean up for next test
  await db.exec('DROP TABLE IF EXISTS todos');
  console.log('\n🧹 Cleaned up');
}

// ========================================
// Main execution
// ========================================
async function main() {
  console.log('═'.repeat(50));
  console.log('🌟 Better-Starlite Cross-Platform Demo');
  console.log('═'.repeat(50));
  console.log('\nThis demo shows the SAME code working with:');
  console.log('• Local SQLite (in-memory)');
  console.log('• Local SQLite (file-based)');
  console.log('• Distributed RQLite cluster');

  try {
    // Test 1: In-memory SQLite
    const memoryDb = await createDatabase(':memory:');
    await runDatabaseOperations(memoryDb, 'In-Memory SQLite');
    await memoryDb.close();

    // Test 2: File-based SQLite
    const fileDb = await createDatabase('test-temp.db');
    await runDatabaseOperations(fileDb, 'File-Based SQLite');
    await fileDb.close();

    // Clean up test file
    const fs = require('fs');
    try {
      fs.unlinkSync('test-temp.db');
      fs.unlinkSync('test-temp.db-wal');
      fs.unlinkSync('test-temp.db-shm');
    } catch (e) {
      // Files might not exist
    }

    // Test 3: RQLite (if available)
    try {
      const rqliteDb = await createDatabase('http://localhost:4001');
      await runDatabaseOperations(rqliteDb, 'RQLite Cluster');
      await rqliteDb.close();
    } catch (error) {
      console.log('\n⚠️ RQLite test skipped (server not running)');
      console.log('  To test RQLite: docker run -p 4001:4001 rqlite/rqlite');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  console.log('\n═'.repeat(50));
  console.log('✨ All tests completed successfully!');
  console.log('═'.repeat(50));
  console.log('\n💡 Key Takeaways:');
  console.log('• Same API works for all database types');
  console.log('• Zero code changes needed when switching');
  console.log('• Async/await for modern JavaScript');
  console.log('• Perfect for development → production migration');
}

// Run the demo
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { runDatabaseOperations };