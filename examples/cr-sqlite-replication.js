/**
 * CR-SQLite Replication Example
 *
 * This example demonstrates the CRDT replication features of CR-SQLite
 * for building offline-first, multi-node applications.
 *
 * This simulates two nodes (e.g., a browser and a server, or two different
 * devices) that can sync data changes bidirectionally without conflicts.
 *
 * Run with: node examples/cr-sqlite-replication.js
 */

const { DriverRegistry } = require('../dist/drivers');

async function main() {
  console.log('🔄 CR-SQLite Replication Example\n');
  console.log('This example simulates two nodes syncing data via CRDTs\n');

  // Step 1: Initialize driver
  console.log('1. Initializing CR-SQLite driver...');
  const { createCrSqliteDriver } = require('../dist/drivers/cr-sqlite-driver');
  const driver = await createCrSqliteDriver();

  if (!driver.isAvailable()) {
    console.error('❌ CR-SQLite driver is not available.');
    console.error('Please install: npm install @vlcn.io/crsqlite-wasm');
    process.exit(1);
  }

  DriverRegistry.register('cr-sqlite', driver);

  // Step 2: Create two database instances (simulating two nodes)
  console.log('2. Creating two database nodes...');
  const dbNode1 = driver.createDatabase(':memory:', {
    verbose: false,
    siteId: 'browser-client-1'
  });

  const dbNode2 = driver.createDatabase(':memory:', {
    verbose: false,
    siteId: 'server-node-1'
  });

  console.log('   Node 1 (Browser): Site ID = browser-client-1');
  console.log('   Node 2 (Server): Site ID = server-node-1\n');

  // Step 3: Create schema on both nodes
  console.log('3. Setting up schema on both nodes...');
  const schema = `
    CREATE TABLE todos (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    -- Enable CRDT tracking for the todos table
    SELECT crsql_as_crr('todos');
  `;

  try {
    dbNode1.exec(schema);
    dbNode2.exec(schema);
    console.log('   Schema created and CRDT tracking enabled!\n');
  } catch (e) {
    console.log('   ⚠️  Note: CRDT tracking requires cr-sqlite extensions');
    console.log('   Continuing with basic replication simulation...\n');
  }

  // Step 4: Insert data on Node 1 (Browser)
  console.log('4. User creates todos on Node 1 (Browser - offline)...');
  const insertNode1 = dbNode1.prepare('INSERT INTO todos (id, title, completed) VALUES (?, ?, ?)');
  insertNode1.run(1, 'Buy groceries', 0);
  insertNode1.run(2, 'Write documentation', 0);
  insertNode1.run(3, 'Review pull request', 1);

  const todosNode1 = dbNode1.prepare('SELECT * FROM todos').all();
  console.log(`   Node 1 has ${todosNode1.length} todos:`);
  for (const todo of todosNode1) {
    const status = todo.completed ? '✅' : '⬜';
    console.log(`   ${status} ${todo.title}`);
  }
  console.log();

  // Step 5: Get changes from Node 1
  console.log('5. Getting changes from Node 1 for sync...');
  try {
    const changesFromNode1 = dbNode1.getChanges();
    console.log(`   Found ${changesFromNode1.length} change records\n`);

    // Step 6: Apply changes to Node 2
    console.log('6. Applying changes to Node 2 (Server)...');
    dbNode2.applyChanges(changesFromNode1);

    const todosNode2 = dbNode2.prepare('SELECT * FROM todos').all();
    console.log(`   Node 2 now has ${todosNode2.length} todos:`);
    for (const todo of todosNode2) {
      const status = todo.completed ? '✅' : '⬜';
      console.log(`   ${status} ${todo.title}`);
    }
    console.log();
  } catch (e) {
    console.log('   ⚠️  Note: Full CRDT replication requires cr-sqlite extensions');
    console.log('   Demonstrating manual sync instead...\n');

    // Manual sync simulation
    console.log('6. Manual sync: Copying data from Node 1 to Node 2...');
    const todos = dbNode1.prepare('SELECT * FROM todos').all();
    const insertNode2 = dbNode2.prepare('INSERT INTO todos (id, title, completed, created_at) VALUES (?, ?, ?, ?)');
    for (const todo of todos) {
      insertNode2.run(todo.id, todo.title, todo.completed, todo.created_at);
    }

    const todosNode2 = dbNode2.prepare('SELECT * FROM todos').all();
    console.log(`   Node 2 now has ${todosNode2.length} todos`);
    console.log();
  }

  // Step 7: Make changes on Node 2
  console.log('7. User updates todo on Node 2 (Server)...');
  const updateNode2 = dbNode2.prepare('UPDATE todos SET completed = 1 WHERE id = ?');
  updateNode2.run(2); // Mark "Write documentation" as complete

  const insertNode2 = dbNode2.prepare('INSERT INTO todos (id, title, completed) VALUES (?, ?, ?)');
  insertNode2.run(4, 'Deploy to production', 0);

  console.log('   Updated: "Write documentation" marked as complete');
  console.log('   Added: "Deploy to production"\n');

  // Step 8: Sync changes back to Node 1
  console.log('8. Syncing changes back to Node 1...');
  try {
    // Get database version on Node 1 before sync
    const versionBefore = dbNode1.getVersion();
    console.log(`   Node 1 version before sync: ${versionBefore}`);

    // Get changes from Node 2 since last sync
    const changesFromNode2 = dbNode2.getChanges(versionBefore);
    console.log(`   Found ${changesFromNode2.length} changes from Node 2`);

    // Apply to Node 1
    dbNode1.applyChanges(changesFromNode2);

    const versionAfter = dbNode1.getVersion();
    console.log(`   Node 1 version after sync: ${versionAfter}\n`);
  } catch (e) {
    console.log('   Manual sync: Updating Node 1 with Node 2 changes...');

    // Manual update
    const updateNode1 = dbNode1.prepare('UPDATE todos SET completed = 1 WHERE id = ?');
    updateNode1.run(2);

    const insertNode1Extra = dbNode1.prepare('INSERT INTO todos (id, title, completed) VALUES (?, ?, ?)');
    insertNode1Extra.run(4, 'Deploy to production', 0);
    console.log();
  }

  // Step 9: Verify both nodes are in sync
  console.log('9. Verifying sync...');

  const finalTodosNode1 = dbNode1.prepare('SELECT * FROM todos ORDER BY id').all();
  const finalTodosNode2 = dbNode2.prepare('SELECT * FROM todos ORDER BY id').all();

  console.log(`\n   Node 1 final state (${finalTodosNode1.length} todos):`);
  for (const todo of finalTodosNode1) {
    const status = todo.completed ? '✅' : '⬜';
    console.log(`   ${status} ${todo.title}`);
  }

  console.log(`\n   Node 2 final state (${finalTodosNode2.length} todos):`);
  for (const todo of finalTodosNode2) {
    const status = todo.completed ? '✅' : '⬜';
    console.log(`   ${status} ${todo.title}`);
  }

  // Check if in sync
  const inSync = finalTodosNode1.length === finalTodosNode2.length &&
    finalTodosNode1.every((todo, i) => {
      const otherTodo = finalTodosNode2[i];
      return todo.id === otherTodo.id &&
        todo.title === otherTodo.title &&
        todo.completed === otherTodo.completed;
    });

  if (inSync) {
    console.log('\n   ✅ Both nodes are in sync!\n');
  } else {
    console.log('\n   ⚠️  Nodes have different data\n');
  }

  // Step 10: Demonstrate conflict-free concurrent edits
  console.log('10. Demonstrating concurrent edits...');
  console.log('    (In real CR-SQLite, these would merge automatically)\n');

  // Both nodes edit the same todo differently
  console.log('    Node 1: Updates todo #1 title');
  const updateTitleNode1 = dbNode1.prepare('UPDATE todos SET title = ? WHERE id = ?');
  updateTitleNode1.run('Buy groceries and cook dinner', 1);

  console.log('    Node 2: Marks todo #1 as complete');
  const updateCompletedNode2 = dbNode2.prepare('UPDATE todos SET completed = 1 WHERE id = ?');
  updateCompletedNode2.run(1);

  console.log('\n    After sync (with proper CR-SQLite CRDTs):');
  console.log('    - Both changes would be preserved');
  console.log('    - No conflicts or data loss');
  console.log('    - Last-write-wins per field (with vector clocks)\n');

  // Clean up
  console.log('11. Cleaning up...');
  dbNode1.close();
  dbNode2.close();
  console.log('    Databases closed\n');

  console.log('✅ Replication example completed!\n');
  console.log('💡 Key Takeaways:');
  console.log('   • CR-SQLite enables offline-first applications');
  console.log('   • Changes are tracked as CRDTs for conflict-free merging');
  console.log('   • Perfect for mobile apps, distributed systems, and PWAs');
  console.log('   • Each node has a unique site ID for change tracking');
  console.log('   • Bidirectional sync without central coordination\n');
}

// Run the example
main().catch((error) => {
  console.error('❌ Error running example:', error);
  process.exit(1);
});
