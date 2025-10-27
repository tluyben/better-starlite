#!/usr/bin/env node

const Database = require('../dist/index.js').default;
const { AsyncDatabase } = require('../dist/index.js');
const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const config = {
  iterations: process.env.ITERATIONS || 10000,
  batchSize: process.env.BATCH_SIZE || 100,
  readRatio: process.env.READ_RATIO || 0.7, // 70% reads, 30% writes
  rqliteNodes: [
    'http://localhost:4001',
    'http://localhost:4011',
    'http://localhost:4021',
    'http://localhost:4031', // Optional 4th node
    'http://localhost:4041', // Optional 5th node
  ],
  sqlitePath: '/app/data/stress-test.db',
  consistencyLevels: ['none', 'weak', 'linearizable'],
  testDuration: process.env.TEST_DURATION || 60000, // 60 seconds default
};

// Test results storage
const results = {
  sqlite: {},
  rqlite: {},
  failures: [],
  nodeFailures: [],
};

// Helper functions
function generateTestData(count) {
  const data = [];
  for (let i = 0; i < count; i++) {
    data.push({
      id: i,
      name: `User_${i}_${Math.random().toString(36).substring(7)}`,
      email: `user${i}@test.com`,
      age: Math.floor(Math.random() * 80) + 18,
      created_at: new Date().toISOString(),
      metadata: JSON.stringify({
        preferences: Array(10).fill(null).map(() => Math.random().toString(36)),
        scores: Array(5).fill(null).map(() => Math.random() * 100),
      }),
    });
  }
  return data;
}

async function measureOperation(name, operation) {
  const start = performance.now();
  let error = null;
  let result = null;

  try {
    result = await operation();
  } catch (err) {
    error = err;
  }

  const duration = performance.now() - start;

  return {
    name,
    duration,
    error,
    result,
    timestamp: new Date().toISOString(),
  };
}

async function setupDatabase(db, isAsync = false) {
  const schema = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      age INTEGER,
      created_at TEXT,
      metadata TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_age ON users(age);

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      amount REAL,
      type TEXT,
      status TEXT,
      created_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
  `;

  if (isAsync) {
    await db.exec(schema);
  } else {
    db.exec(schema);
  }
}

// SQLite stress tests
async function stressSQLite() {
  console.log('\n=== Starting SQLite Stress Test ===\n');

  const db = new Database(config.sqlitePath);
  const asyncDb = new AsyncDatabase(config.sqlitePath);

  // Setup
  setupDatabase(db, false);
  await setupDatabase(asyncDb, true);

  const testData = generateTestData(config.iterations);
  const metrics = {
    sync: { writes: [], reads: [], transactions: [] },
    async: { writes: [], reads: [], transactions: [] },
  };

  // Synchronous tests
  console.log('Testing synchronous API...');
  const insertStmt = db.prepare('INSERT OR REPLACE INTO users (id, name, email, age, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?)');
  const selectStmt = db.prepare('SELECT * FROM users WHERE id = ?');
  const rangeStmt = db.prepare('SELECT * FROM users WHERE age BETWEEN ? AND ?');

  // Batch inserts
  const insertMany = db.transaction((users) => {
    for (const user of users) {
      insertStmt.run(user.id, user.name, user.email, user.age, user.created_at, user.metadata);
    }
  });

  const batchResult = await measureOperation('sync_batch_insert', () => {
    insertMany(testData.slice(0, config.batchSize));
  });
  metrics.sync.transactions.push(batchResult);

  // Mixed read/write operations
  const startTime = Date.now();
  let operations = 0;

  while (Date.now() - startTime < config.testDuration / 2) {
    const isRead = Math.random() < config.readRatio;

    if (isRead) {
      const id = Math.floor(Math.random() * config.batchSize);
      const result = await measureOperation('sync_read', () => selectStmt.get(id));
      metrics.sync.reads.push(result);
    } else {
      const user = testData[Math.floor(Math.random() * testData.length)];
      const result = await measureOperation('sync_write', () =>
        insertStmt.run(user.id, user.name, user.email, user.age, user.created_at, user.metadata)
      );
      metrics.sync.writes.push(result);
    }

    operations++;
    if (operations % 1000 === 0) {
      process.stdout.write(`\rSync operations: ${operations}`);
    }
  }

  // Asynchronous tests
  console.log('\n\nTesting asynchronous API...');
  const asyncInsertStmt = await asyncDb.prepare('INSERT OR REPLACE INTO users (id, name, email, age, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?)');
  const asyncSelectStmt = await asyncDb.prepare('SELECT * FROM users WHERE id = ?');

  operations = 0;
  const asyncStartTime = Date.now();

  while (Date.now() - asyncStartTime < config.testDuration / 2) {
    const isRead = Math.random() < config.readRatio;

    if (isRead) {
      const id = Math.floor(Math.random() * config.batchSize);
      const result = await measureOperation('async_read', async () => await asyncSelectStmt.get(id));
      metrics.async.reads.push(result);
    } else {
      const user = testData[Math.floor(Math.random() * testData.length)];
      const result = await measureOperation('async_write', async () =>
        await asyncInsertStmt.run(user.id, user.name, user.email, user.age, user.created_at, user.metadata)
      );
      metrics.async.writes.push(result);
    }

    operations++;
    if (operations % 1000 === 0) {
      process.stdout.write(`\rAsync operations: ${operations}`);
    }
  }

  db.close();
  await asyncDb.close();

  results.sqlite = metrics;
  console.log('\n\n✓ SQLite stress test completed\n');
}

// rqlite stress tests with consistency levels
async function stressRqlite(consistencyLevel = 'weak') {
  console.log(`\n=== Starting rqlite Stress Test (${consistencyLevel} consistency) ===\n`);

  const primaryNode = config.rqliteNodes[0];
  const db = new Database(primaryNode, { rqliteLevel: consistencyLevel });
  const asyncDb = new AsyncDatabase(primaryNode, { rqliteLevel: consistencyLevel });

  // Setup
  setupDatabase(db, false);
  await setupDatabase(asyncDb, true);

  const testData = generateTestData(config.iterations);
  const metrics = {
    sync: { writes: [], reads: [], transactions: [], failures: [] },
    async: { writes: [], reads: [], transactions: [], failures: [] },
  };

  // Test with node rotation (simulating load balancing)
  let currentNodeIndex = 0;
  const getNextNode = () => {
    currentNodeIndex = (currentNodeIndex + 1) % 3; // Rotate between first 3 nodes
    return config.rqliteNodes[currentNodeIndex];
  };

  // Synchronous tests
  console.log('Testing synchronous API with node rotation...');
  const startTime = Date.now();
  let operations = 0;

  while (Date.now() - startTime < config.testDuration / 2) {
    const isRead = Math.random() < config.readRatio;
    const nodeUrl = getNextNode();
    const nodeDb = new Database(nodeUrl, { rqliteLevel: consistencyLevel });

    try {
      if (isRead) {
        const id = Math.floor(Math.random() * config.batchSize);
        const result = await measureOperation(`sync_read_${consistencyLevel}`, () => {
          const stmt = nodeDb.prepare('SELECT * FROM users WHERE id = ?');
          return stmt.get(id);
        });
        metrics.sync.reads.push(result);
      } else {
        const user = testData[Math.floor(Math.random() * testData.length)];
        const result = await measureOperation(`sync_write_${consistencyLevel}`, () => {
          const stmt = nodeDb.prepare('INSERT OR REPLACE INTO users (id, name, email, age, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?)');
          return stmt.run(user.id, user.name, user.email, user.age, user.created_at, user.metadata);
        });
        metrics.sync.writes.push(result);
      }
    } catch (error) {
      metrics.sync.failures.push({
        operation: isRead ? 'read' : 'write',
        node: nodeUrl,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }

    operations++;
    if (operations % 100 === 0) {
      process.stdout.write(`\rSync operations: ${operations} (Node: ${currentNodeIndex + 1})`);
    }

    nodeDb.close();
  }

  // Asynchronous tests
  console.log('\n\nTesting asynchronous API with node rotation...');
  operations = 0;
  const asyncStartTime = Date.now();

  while (Date.now() - asyncStartTime < config.testDuration / 2) {
    const isRead = Math.random() < config.readRatio;
    const nodeUrl = getNextNode();
    const nodeAsyncDb = new AsyncDatabase(nodeUrl, { rqliteLevel: consistencyLevel });

    try {
      if (isRead) {
        const id = Math.floor(Math.random() * config.batchSize);
        const result = await measureOperation(`async_read_${consistencyLevel}`, async () => {
          const stmt = await nodeAsyncDb.prepare('SELECT * FROM users WHERE id = ?');
          return await stmt.get(id);
        });
        metrics.async.reads.push(result);
      } else {
        const user = testData[Math.floor(Math.random() * testData.length)];
        const result = await measureOperation(`async_write_${consistencyLevel}`, async () => {
          const stmt = await nodeAsyncDb.prepare('INSERT OR REPLACE INTO users (id, name, email, age, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?)');
          return await stmt.run(user.id, user.name, user.email, user.age, user.created_at, user.metadata);
        });
        metrics.async.writes.push(result);
      }
    } catch (error) {
      metrics.async.failures.push({
        operation: isRead ? 'read' : 'write',
        node: nodeUrl,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }

    operations++;
    if (operations % 100 === 0) {
      process.stdout.write(`\rAsync operations: ${operations} (Node: ${currentNodeIndex + 1})`);
    }

    await nodeAsyncDb.close();
  }

  db.close();
  await asyncDb.close();

  if (!results.rqlite[consistencyLevel]) {
    results.rqlite[consistencyLevel] = {};
  }
  results.rqlite[consistencyLevel] = metrics;

  console.log(`\n\n✓ rqlite stress test (${consistencyLevel}) completed\n`);
}

// Calculate statistics
function calculateStats(measurements) {
  if (!measurements || measurements.length === 0) return null;

  const durations = measurements
    .filter(m => !m.error)
    .map(m => m.duration)
    .sort((a, b) => a - b);

  if (durations.length === 0) return null;

  const sum = durations.reduce((a, b) => a + b, 0);
  const mean = sum / durations.length;
  const p50 = durations[Math.floor(durations.length * 0.5)];
  const p95 = durations[Math.floor(durations.length * 0.95)];
  const p99 = durations[Math.floor(durations.length * 0.99)];
  const min = durations[0];
  const max = durations[durations.length - 1];

  return {
    count: measurements.length,
    successful: durations.length,
    failed: measurements.length - durations.length,
    mean: mean.toFixed(2),
    median: p50.toFixed(2),
    p95: p95.toFixed(2),
    p99: p99.toFixed(2),
    min: min.toFixed(2),
    max: max.toFixed(2),
    throughput: (1000 / mean).toFixed(2), // ops per second
  };
}

// Generate comprehensive report
function generateReport() {
  console.log('\n' + '='.repeat(80));
  console.log(' '.repeat(25) + 'STRESS TEST REPORT');
  console.log('='.repeat(80) + '\n');

  const report = {
    metadata: {
      timestamp: new Date().toISOString(),
      iterations: config.iterations,
      batchSize: config.batchSize,
      readRatio: config.readRatio,
      testDuration: config.testDuration,
    },
    results: {},
  };

  // SQLite results
  console.log('SQLite Performance:');
  console.log('-'.repeat(40));

  ['sync', 'async'].forEach(mode => {
    if (results.sqlite[mode]) {
      console.log(`\n  ${mode.toUpperCase()} Mode:`);

      ['reads', 'writes', 'transactions'].forEach(op => {
        const stats = calculateStats(results.sqlite[mode][op]);
        if (stats) {
          console.log(`    ${op.charAt(0).toUpperCase() + op.slice(1)}:`);
          console.log(`      Count: ${stats.count}, Success: ${stats.successful}, Failed: ${stats.failed}`);
          console.log(`      Latency (ms) - Mean: ${stats.mean}, P50: ${stats.median}, P95: ${stats.p95}, P99: ${stats.p99}`);
          console.log(`      Throughput: ${stats.throughput} ops/sec`);

          if (!report.results.sqlite) report.results.sqlite = {};
          if (!report.results.sqlite[mode]) report.results.sqlite[mode] = {};
          report.results.sqlite[mode][op] = stats;
        }
      });
    }
  });

  // rqlite results
  console.log('\n\nrqlite Performance:');
  console.log('-'.repeat(40));

  Object.keys(results.rqlite).forEach(consistency => {
    console.log(`\n${consistency.toUpperCase()} Consistency:`);

    ['sync', 'async'].forEach(mode => {
      if (results.rqlite[consistency] && results.rqlite[consistency][mode]) {
        console.log(`\n  ${mode.toUpperCase()} Mode:`);

        ['reads', 'writes', 'transactions'].forEach(op => {
          const stats = calculateStats(results.rqlite[consistency][mode][op]);
          if (stats) {
            console.log(`    ${op.charAt(0).toUpperCase() + op.slice(1)}:`);
            console.log(`      Count: ${stats.count}, Success: ${stats.successful}, Failed: ${stats.failed}`);
            console.log(`      Latency (ms) - Mean: ${stats.mean}, P50: ${stats.median}, P95: ${stats.p95}, P99: ${stats.p99}`);
            console.log(`      Throughput: ${stats.throughput} ops/sec`);

            if (!report.results.rqlite) report.results.rqlite = {};
            if (!report.results.rqlite[consistency]) report.results.rqlite[consistency] = {};
            if (!report.results.rqlite[consistency][mode]) report.results.rqlite[consistency][mode] = {};
            report.results.rqlite[consistency][mode][op] = stats;
          }
        });

        // Report failures
        const failures = results.rqlite[consistency][mode].failures;
        if (failures && failures.length > 0) {
          console.log(`    Failures: ${failures.length}`);
          const failureTypes = {};
          failures.forEach(f => {
            if (!failureTypes[f.error]) failureTypes[f.error] = 0;
            failureTypes[f.error]++;
          });
          Object.entries(failureTypes).forEach(([error, count]) => {
            console.log(`      - ${error}: ${count}`);
          });
        }
      }
    });
  });

  // Comparison summary
  console.log('\n\n' + '='.repeat(80));
  console.log('PERFORMANCE COMPARISON SUMMARY');
  console.log('='.repeat(80));

  if (report.results.sqlite?.async?.reads && report.results.rqlite?.weak?.async?.reads) {
    const sqliteReadLatency = parseFloat(report.results.sqlite.async.reads.mean);
    const rqliteReadLatency = parseFloat(report.results.rqlite.weak.async.reads.mean);
    const readRatio = (rqliteReadLatency / sqliteReadLatency).toFixed(2);

    const sqliteWriteLatency = parseFloat(report.results.sqlite.async.writes.mean);
    const rqliteWriteLatency = parseFloat(report.results.rqlite.weak.async.writes.mean);
    const writeRatio = (rqliteWriteLatency / sqliteWriteLatency).toFixed(2);

    console.log(`\nAsync Read Performance:`);
    console.log(`  SQLite: ${sqliteReadLatency.toFixed(2)}ms avg`);
    console.log(`  rqlite (weak): ${rqliteReadLatency.toFixed(2)}ms avg`);
    console.log(`  rqlite is ${readRatio}x slower`);

    console.log(`\nAsync Write Performance:`);
    console.log(`  SQLite: ${sqliteWriteLatency.toFixed(2)}ms avg`);
    console.log(`  rqlite (weak): ${rqliteWriteLatency.toFixed(2)}ms avg`);
    console.log(`  rqlite is ${writeRatio}x slower`);
  }

  // Save report to file
  const reportPath = path.join(__dirname, `stress-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n\n✓ Full report saved to: ${reportPath}`);

  return report;
}

// Main execution
async function main() {
  console.log('Starting comprehensive stress tests...\n');
  console.log('Configuration:');
  console.log(`  Iterations: ${config.iterations}`);
  console.log(`  Batch Size: ${config.batchSize}`);
  console.log(`  Read Ratio: ${config.readRatio}`);
  console.log(`  Test Duration: ${config.testDuration}ms per test\n`);

  try {
    // Test SQLite
    await stressSQLite();

    // Test rqlite with different consistency levels
    for (const level of config.consistencyLevels) {
      await stressRqlite(level);
    }

    // Generate and display report
    generateReport();

  } catch (error) {
    console.error('\n\n❌ Error during stress testing:', error);
    process.exit(1);
  }
}

// Check if running in Docker or locally
if (process.env.NODE_ENV === 'test' || process.env.RUN_STRESS_TEST) {
  main().catch(console.error);
} else {
  console.log('To run stress tests, set NODE_ENV=test or RUN_STRESS_TEST=1');
  console.log('Or run: docker-compose -f docker-compose.stress.yml up');
}

module.exports = { main, generateTestData, measureOperation, calculateStats };