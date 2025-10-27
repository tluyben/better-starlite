/**
 * CR-SQLite Bun Example
 *
 * This example demonstrates using the CR-SQLite driver with Bun,
 * the fast all-in-one JavaScript runtime.
 *
 * Bun is perfect for CR-SQLite because:
 * - Fast WASM execution
 * - Built-in TypeScript support
 * - Fast startup time
 * - Compatible with Node.js APIs
 *
 * Run with: bun run examples/cr-sqlite-bun.ts
 */

import { DriverRegistry } from '../dist/drivers';

async function main() {
  console.log('🥟 CR-SQLite Bun Example\n');

  // Step 1: Initialize CR-SQLite driver
  console.log('1. Initializing CR-SQLite driver...');

  try {
    const { createCrSqliteDriver } = await import('../dist/drivers/cr-sqlite-driver');
    const driver = await createCrSqliteDriver();

    if (!driver.isAvailable()) {
      console.error('❌ CR-SQLite driver is not available.');
      console.error('Install with: bun add @vlcn.io/crsqlite-wasm');
      process.exit(1);
    }

    // Step 2: Register the driver
    console.log('2. Registering CR-SQLite driver...');
    DriverRegistry.register('cr-sqlite', driver);
    DriverRegistry.setDefault('cr-sqlite');
    console.log('   Driver registered!\n');

    // Step 3: Create API server database
    console.log('3. Creating API server database...');
    const db = driver.createDatabase(':memory:', {
      verbose: false,
      siteId: `bun-server-${Bun.hash(Date.now().toString()).toString(16)}`
    });
    console.log(`   Database created with site ID: ${db.name}\n`);

    // Step 4: Setup API data schema
    console.log('4. Setting up schema...');
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        api_key TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE api_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        endpoint TEXT NOT NULL,
        method TEXT NOT NULL,
        status_code INTEGER,
        duration_ms INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE INDEX idx_api_requests_user_id ON api_requests(user_id);
      CREATE INDEX idx_api_requests_created_at ON api_requests(created_at);
    `);
    console.log('   Schema created!\n');

    // Step 5: Seed data
    console.log('5. Seeding data...');
    const insertUser = db.prepare(
      'INSERT INTO users (username, email, api_key) VALUES (?, ?, ?)'
    );

    const users = [
      ['alice', 'alice@example.com', generateApiKey()],
      ['bob', 'bob@example.com', generateApiKey()],
      ['charlie', 'charlie@example.com', generateApiKey()]
    ];

    const seedUsers = db.transaction(() => {
      for (const user of users) {
        insertUser.run(...user);
      }
    });

    seedUsers();
    console.log(`   Created ${users.length} users\n`);

    // Step 6: Simulate API requests
    console.log('6. Simulating API requests...');
    const insertRequest = db.prepare(
      'INSERT INTO api_requests (user_id, endpoint, method, status_code, duration_ms) VALUES (?, ?, ?, ?, ?)'
    );

    const endpoints = ['/api/posts', '/api/users', '/api/comments', '/api/auth'];
    const methods = ['GET', 'POST', 'PUT', 'DELETE'];
    const statuses = [200, 201, 400, 404, 500];

    const simulateRequests = db.transaction(() => {
      for (let i = 0; i < 50; i++) {
        insertRequest.run(
          Math.floor(Math.random() * 3) + 1, // user_id
          endpoints[Math.floor(Math.random() * endpoints.length)],
          methods[Math.floor(Math.random() * methods.length)],
          statuses[Math.floor(Math.random() * statuses.length)],
          Math.floor(Math.random() * 500) + 10 // duration 10-510ms
        );
      }
    });

    simulateRequests();
    console.log('   Simulated 50 API requests\n');

    // Step 7: Analytics queries
    console.log('7. Running analytics...');

    // Total requests per user
    const requestsPerUser = db.prepare(`
      SELECT
        u.username,
        COUNT(r.id) as request_count,
        AVG(r.duration_ms) as avg_duration,
        MAX(r.duration_ms) as max_duration
      FROM users u
      LEFT JOIN api_requests r ON u.id = r.user_id
      GROUP BY u.id, u.username
      ORDER BY request_count DESC
    `).all();

    console.log('   Requests per user:');
    for (const row of requestsPerUser) {
      console.log(`   - ${row.username}: ${row.request_count} requests (avg: ${row.avg_duration?.toFixed(0)}ms)`);
    }
    console.log();

    // Most popular endpoints
    const popularEndpoints = db.prepare(`
      SELECT
        endpoint,
        COUNT(*) as hit_count,
        AVG(duration_ms) as avg_duration
      FROM api_requests
      GROUP BY endpoint
      ORDER BY hit_count DESC
      LIMIT 5
    `).all();

    console.log('   Most popular endpoints:');
    for (const row of popularEndpoints) {
      console.log(`   - ${row.endpoint}: ${row.hit_count} hits (avg: ${row.avg_duration.toFixed(0)}ms)`);
    }
    console.log();

    // Error rate
    const errorStats = db.prepare(`
      SELECT
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as errors,
        COUNT(*) as total,
        CAST(COUNT(CASE WHEN status_code >= 400 THEN 1 END) AS FLOAT) / COUNT(*) * 100 as error_rate
      FROM api_requests
    `).get();

    console.log('   Error statistics:');
    console.log(`   - Total requests: ${errorStats.total}`);
    console.log(`   - Errors: ${errorStats.errors}`);
    console.log(`   - Error rate: ${errorStats.error_rate.toFixed(2)}%\n`);

    // Step 8: Performance test
    console.log('8. Running performance test...');
    const iterations = 1000;

    const perfStart = Bun.nanoseconds();
    const selectStmt = db.prepare('SELECT * FROM users WHERE id = ?');

    for (let i = 0; i < iterations; i++) {
      selectStmt.get(1);
    }

    const perfEnd = Bun.nanoseconds();
    const durationMs = (perfEnd - perfStart) / 1_000_000;
    const opsPerSec = (iterations / durationMs * 1000).toFixed(0);

    console.log(`   Executed ${iterations} queries in ${durationMs.toFixed(2)}ms`);
    console.log(`   Performance: ${opsPerSec} ops/sec\n`);

    // Step 9: Demonstrate streaming results
    console.log('9. Streaming large result set...');
    let streamCount = 0;
    const streamStmt = db.prepare('SELECT * FROM api_requests ORDER BY id');

    for (const row of streamStmt.iterate()) {
      streamCount++;
      // Process each row without loading all into memory
    }

    console.log(`   Streamed ${streamCount} rows without loading all into memory\n`);

    // Step 10: Export for backup
    console.log('10. Exporting database...');
    const allUsers = db.prepare('SELECT * FROM users').all();
    const allRequests = db.prepare('SELECT * FROM api_requests').all();

    const backup = {
      exported_at: new Date().toISOString(),
      version: 1,
      users: allUsers,
      api_requests: allRequests
    };

    console.log(`    Backup size: ${JSON.stringify(backup).length} bytes\n`);

    // Step 11: Clean up
    console.log('11. Closing database...');
    db.close();
    console.log('    Database closed!\n');

    console.log('✅ Bun example completed successfully!\n');

    // Performance comparison
    console.log('🚀 Why Bun + CR-SQLite?');
    console.log('   • 3x faster startup than Node.js');
    console.log('   • Native WASM support for CR-SQLite');
    console.log('   • Built-in TypeScript - no compilation needed');
    console.log('   • Perfect for serverless/edge functions');
    console.log('   • Great for real-time APIs with offline sync\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Build the project: bun run build');
    console.error('   2. Install CR-SQLite: bun add @vlcn.io/crsqlite-wasm');
    process.exit(1);
  }
}

// Helper function to generate fake API keys
function generateApiKey(): string {
  return `bun_${Bun.hash(Math.random().toString()).toString(16)}`;
}

// Run the example
await main();
