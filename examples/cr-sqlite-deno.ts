/**
 * CR-SQLite Deno Example
 *
 * This example demonstrates using the CR-SQLite driver with Deno
 * for building offline-first applications with TypeScript.
 *
 * Run with: deno run --allow-read --allow-write --allow-net examples/cr-sqlite-deno.ts
 */

import { DriverRegistry } from '../dist/drivers/index.ts';

async function main() {
  console.log('🦕 CR-SQLite Deno Example\n');

  // Step 1: Import and initialize the CR-SQLite driver
  console.log('1. Initializing CR-SQLite driver...');

  try {
    const { createCrSqliteDriver } = await import('../dist/drivers/cr-sqlite-driver.ts');
    const driver = await createCrSqliteDriver();

    if (!driver.isAvailable()) {
      console.error('❌ CR-SQLite driver is not available in Deno.');
      console.error('Ensure @vlcn.io/crsqlite-wasm is compatible with Deno');
      Deno.exit(1);
    }

    // Step 2: Register the driver
    console.log('2. Registering CR-SQLite driver...');
    DriverRegistry.register('cr-sqlite', driver);
    console.log('   Driver registered!\n');

    // Step 3: Create a database
    console.log('3. Creating database...');
    const db = driver.createDatabase(':memory:', {
      verbose: true,
      siteId: 'deno-server-1'
    });
    console.log('   Database created!\n');

    // Step 4: Create schema
    console.log('4. Creating schema...');
    db.exec(`
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        author TEXT NOT NULL,
        published INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   Schema created!\n');

    // Step 5: Insert blog posts
    console.log('5. Creating blog posts...');
    const insertPost = db.prepare(
      'INSERT INTO posts (title, content, author, published) VALUES (?, ?, ?, ?)'
    );

    insertPost.run(
      'Getting Started with CR-SQLite',
      'Learn how to build offline-first apps with CR-SQLite...',
      'Alice',
      1
    );

    insertPost.run(
      'CRDT Explained',
      'Conflict-free Replicated Data Types made simple...',
      'Bob',
      1
    );

    insertPost.run(
      'Draft: Future of Databases',
      'This is still a work in progress...',
      'Alice',
      0
    );

    console.log('   Posts created!\n');

    // Step 6: Query published posts
    console.log('6. Fetching published posts...');
    const selectPublished = db.prepare(
      'SELECT id, title, author FROM posts WHERE published = 1 ORDER BY id'
    );

    const publishedPosts = selectPublished.all();
    console.log(`   Found ${publishedPosts.length} published posts:`);
    for (const post of publishedPosts) {
      console.log(`   - "${post.title}" by ${post.author}`);
    }
    console.log();

    // Step 7: Full-text search (basic)
    console.log('7. Searching posts...');
    const searchStmt = db.prepare(
      "SELECT id, title, author FROM posts WHERE title LIKE '%' || ? || '%' OR content LIKE '%' || ? || '%'"
    );

    const searchResults = searchStmt.all('CRDT', 'CRDT');
    console.log(`   Search results for "CRDT":`);
    for (const post of searchResults) {
      console.log(`   - "${post.title}" by ${post.author}`);
    }
    console.log();

    // Step 8: Aggregate queries
    console.log('8. Getting statistics...');
    const statsStmt = db.prepare(`
      SELECT
        COUNT(*) as total_posts,
        SUM(CASE WHEN published = 1 THEN 1 ELSE 0 END) as published_count,
        COUNT(DISTINCT author) as author_count
      FROM posts
    `);

    const stats = statsStmt.get();
    console.log(`   Total posts: ${stats.total_posts}`);
    console.log(`   Published: ${stats.published_count}`);
    console.log(`   Authors: ${stats.author_count}\n`);

    // Step 9: Using transactions for batch operations
    console.log('9. Batch updating with transaction...');
    const publishDrafts = db.transaction(() => {
      const updateStmt = db.prepare('UPDATE posts SET published = 1 WHERE published = 0');
      const result = updateStmt.run();
      console.log(`   Published ${result.changes} draft(s)`);
    });

    publishDrafts();
    console.log();

    // Step 10: Verify all posts are published
    console.log('10. Verifying updates...');
    const allPostsStmt = db.prepare('SELECT id, title, published FROM posts ORDER BY id');
    const allPosts = allPostsStmt.all();
    console.log('    All posts:');
    for (const post of allPosts) {
      const status = post.published ? '✅ Published' : '📝 Draft';
      console.log(`    - ${status}: "${post.title}"`);
    }
    console.log();

    // Step 11: Export data as JSON
    console.log('11. Exporting data...');
    const exportStmt = db.prepare('SELECT * FROM posts ORDER BY id');
    const allData = exportStmt.all();

    const exportData = {
      exported_at: new Date().toISOString(),
      site_id: 'deno-server-1',
      posts: allData
    };

    const exportJson = JSON.stringify(exportData, null, 2);
    console.log('    Export preview (first 200 chars):');
    console.log('    ' + exportJson.substring(0, 200) + '...\n');

    // Step 12: Clean up
    console.log('12. Closing database...');
    db.close();
    console.log('    Database closed!\n');

    console.log('✅ Deno example completed successfully!\n');

    console.log('💡 Next steps:');
    console.log('   • Enable CRDT tracking: SELECT crsql_as_crr(\'posts\')');
    console.log('   • Set up sync endpoint: Deno.serve() with HTTP handlers');
    console.log('   • Sync with browser: Use getChanges() and applyChanges()');
    console.log('   • Deploy: deno deploy or Docker container\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('Cannot find module')) {
      console.error('\n💡 Make sure to:');
      console.error('   1. Build the project: npm run build');
      console.error('   2. Install CR-SQLite: npm install @vlcn.io/crsqlite-wasm');
    }
    Deno.exit(1);
  }
}

// Run the example
if (import.meta.main) {
  await main();
}
