#!/usr/bin/env node

const { exec, execSync } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const Database = require('../dist/index.js').default;
const { AsyncDatabase } = require('../dist/index.js');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Chaos testing configuration
const config = {
  rqliteNodes: [
    { name: 'rqlite-stress-1', port: 4001, container: 'rqlite-stress-1' },
    { name: 'rqlite-stress-2', port: 4011, container: 'rqlite-stress-2' },
    { name: 'rqlite-stress-3', port: 4021, container: 'rqlite-stress-3' },
    { name: 'rqlite-stress-4', port: 4031, container: 'rqlite-stress-4' },
    { name: 'rqlite-stress-5', port: 4041, container: 'rqlite-stress-5' },
  ],
  testDuration: 120000, // 2 minutes
  chaosInterval: 10000, // Cause chaos every 10 seconds
  dataIntegrityCheckInterval: 5000, // Check data every 5 seconds
  consistencyLevels: ['weak', 'linearizable'],
};

// Test data tracking
const testData = {
  expectedData: new Map(),
  actualData: new Map(),
  discrepancies: [],
  nodeFailures: [],
  recoveries: [],
};

// Docker container management
class DockerChaos {
  static async stopNode(containerName) {
    console.log(`\n🔥 CHAOS: Stopping node ${containerName}`);
    try {
      await execAsync(`docker stop ${containerName}`);
      testData.nodeFailures.push({
        node: containerName,
        action: 'stop',
        timestamp: new Date().toISOString(),
      });
      return true;
    } catch (error) {
      console.error(`Failed to stop ${containerName}:`, error.message);
      return false;
    }
  }

  static async startNode(containerName) {
    console.log(`\n✅ RECOVERY: Starting node ${containerName}`);
    try {
      await execAsync(`docker start ${containerName}`);
      testData.recoveries.push({
        node: containerName,
        action: 'start',
        timestamp: new Date().toISOString(),
      });
      return true;
    } catch (error) {
      console.error(`Failed to start ${containerName}:`, error.message);
      return false;
    }
  }

  static async pauseNode(containerName) {
    console.log(`\n⏸️ CHAOS: Pausing node ${containerName}`);
    try {
      await execAsync(`docker pause ${containerName}`);
      testData.nodeFailures.push({
        node: containerName,
        action: 'pause',
        timestamp: new Date().toISOString(),
      });
      return true;
    } catch (error) {
      console.error(`Failed to pause ${containerName}:`, error.message);
      return false;
    }
  }

  static async unpauseNode(containerName) {
    console.log(`\n▶️ RECOVERY: Unpausing node ${containerName}`);
    try {
      await execAsync(`docker unpause ${containerName}`);
      testData.recoveries.push({
        node: containerName,
        action: 'unpause',
        timestamp: new Date().toISOString(),
      });
      return true;
    } catch (error) {
      console.error(`Failed to unpause ${containerName}:`, error.message);
      return false;
    }
  }

  static async networkPartition(containerName) {
    console.log(`\n🌐 CHAOS: Creating network partition for ${containerName}`);
    try {
      // Disconnect from network
      await execAsync(`docker network disconnect stress-test-net ${containerName}`);
      testData.nodeFailures.push({
        node: containerName,
        action: 'network_partition',
        timestamp: new Date().toISOString(),
      });

      // Reconnect after 5 seconds
      setTimeout(async () => {
        await execAsync(`docker network connect stress-test-net ${containerName}`);
        console.log(`\n🔗 RECOVERY: Network restored for ${containerName}`);
        testData.recoveries.push({
          node: containerName,
          action: 'network_restore',
          timestamp: new Date().toISOString(),
        });
      }, 5000);

      return true;
    } catch (error) {
      console.error(`Failed to partition ${containerName}:`, error.message);
      return false;
    }
  }

  static async getClusterStatus() {
    try {
      const { stdout } = await execAsync('curl -s http://localhost:4001/status');
      return JSON.parse(stdout);
    } catch (error) {
      return null;
    }
  }

  static async getNodeStatus(port) {
    try {
      const { stdout } = await execAsync(`curl -s http://localhost:${port}/status`);
      return JSON.parse(stdout);
    } catch (error) {
      return null;
    }
  }
}

// Data integrity verification
class DataIntegrityVerifier {
  constructor(db) {
    this.db = db;
    this.checksums = new Map();
  }

  generateChecksum(data) {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(data));
    return hash.digest('hex');
  }

  async writeTestData(id, data) {
    const checksum = this.generateChecksum(data);
    const timestamp = Date.now();

    try {
      if (this.db instanceof AsyncDatabase) {
        const stmt = await this.db.prepare(
          'INSERT OR REPLACE INTO integrity_test (id, data, checksum, timestamp) VALUES (?, ?, ?, ?)'
        );
        await stmt.run(id, JSON.stringify(data), checksum, timestamp);
      } else {
        const stmt = this.db.prepare(
          'INSERT OR REPLACE INTO integrity_test (id, data, checksum, timestamp) VALUES (?, ?, ?, ?)'
        );
        stmt.run(id, JSON.stringify(data), checksum, timestamp);
      }

      testData.expectedData.set(id, { data, checksum, timestamp });
      return true;
    } catch (error) {
      console.error(`Write failed for ID ${id}:`, error.message);
      return false;
    }
  }

  async verifyData(id) {
    try {
      let row;
      if (this.db instanceof AsyncDatabase) {
        const stmt = await this.db.prepare('SELECT * FROM integrity_test WHERE id = ?');
        row = await stmt.get(id);
      } else {
        const stmt = this.db.prepare('SELECT * FROM integrity_test WHERE id = ?');
        row = stmt.get(id);
      }

      if (!row) {
        return { valid: false, error: 'Data not found' };
      }

      const expectedData = testData.expectedData.get(id);
      if (!expectedData) {
        return { valid: false, error: 'No expected data recorded' };
      }

      const actualChecksum = this.generateChecksum(JSON.parse(row.data));
      const isValid = actualChecksum === expectedData.checksum;

      if (!isValid) {
        testData.discrepancies.push({
          id,
          expected: expectedData.checksum,
          actual: actualChecksum,
          timestamp: new Date().toISOString(),
        });
      }

      return { valid: isValid, row, expectedChecksum: expectedData.checksum, actualChecksum };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  async verifyAllData() {
    let valid = 0;
    let invalid = 0;
    let missing = 0;

    for (const [id, expectedData] of testData.expectedData) {
      const result = await this.verifyData(id);
      if (result.valid) {
        valid++;
      } else if (result.error === 'Data not found') {
        missing++;
        console.log(`  ⚠️ Missing data for ID ${id}`);
      } else {
        invalid++;
        console.log(`  ❌ Invalid data for ID ${id}: ${result.error}`);
      }
    }

    return { valid, invalid, missing, total: testData.expectedData.size };
  }
}

// Chaos scenarios
class ChaosScenarios {
  static async killLeader() {
    const status = await DockerChaos.getClusterStatus();
    if (!status || !status.store) return false;

    const leader = status.store.leader;
    const leaderNode = config.rqliteNodes.find(n => n.name.includes(leader));

    if (leaderNode) {
      console.log(`\n💀 CHAOS: Killing leader node ${leaderNode.name}`);
      await DockerChaos.stopNode(leaderNode.container);
      return true;
    }
    return false;
  }

  static async killMinorityNodes() {
    const nodesToKill = Math.floor(config.rqliteNodes.length / 2); // Less than majority
    const killed = [];

    for (let i = 0; i < nodesToKill && i < 2; i++) {
      const node = config.rqliteNodes[i + 1]; // Skip first node
      if (await DockerChaos.stopNode(node.container)) {
        killed.push(node);
      }
    }

    console.log(`\n💀 CHAOS: Killed ${killed.length} nodes (minority)`);
    return killed;
  }

  static async killMajorityNodes() {
    const nodesToKill = Math.ceil(config.rqliteNodes.length / 2) + 1; // More than majority
    const killed = [];

    for (let i = 0; i < nodesToKill && i < config.rqliteNodes.length; i++) {
      const node = config.rqliteNodes[i];
      if (await DockerChaos.stopNode(node.container)) {
        killed.push(node);
      }
    }

    console.log(`\n💀 CHAOS: Killed ${killed.length} nodes (MAJORITY - Cluster should be unavailable)`);
    return killed;
  }

  static async networkSplit() {
    // Create a network split by partitioning half the nodes
    const halfNodes = Math.floor(config.rqliteNodes.length / 2);

    for (let i = 0; i < halfNodes; i++) {
      await DockerChaos.networkPartition(config.rqliteNodes[i].container);
    }

    console.log(`\n🔪 CHAOS: Created network split - ${halfNodes} nodes partitioned`);
  }

  static async randomChaos() {
    const scenarios = [
      () => this.killLeader(),
      () => this.killMinorityNodes(),
      () => this.networkSplit(),
      () => {
        const randomNode = config.rqliteNodes[Math.floor(Math.random() * 3)];
        return DockerChaos.pauseNode(randomNode.container);
      },
    ];

    const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
    await scenario();
  }

  static async recoverAll() {
    console.log('\n🔧 RECOVERY: Attempting to recover all nodes...');

    for (const node of config.rqliteNodes) {
      try {
        // Check if container exists and its status
        const { stdout } = await execAsync(`docker ps -a --filter name=${node.container} --format "{{.Status}}"`);

        if (stdout.includes('Exited')) {
          await DockerChaos.startNode(node.container);
        } else if (stdout.includes('Paused')) {
          await DockerChaos.unpauseNode(node.container);
        }
      } catch (error) {
        console.error(`Failed to recover ${node.container}:`, error.message);
      }
    }

    // Wait for cluster to stabilize
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Verify cluster health
    const status = await DockerChaos.getClusterStatus();
    if (status && status.store) {
      console.log(`✅ Cluster recovered - Leader: ${status.store.leader}, Nodes: ${status.store.num_peers}`);
      return true;
    }

    return false;
  }
}

// Main chaos testing flow
async function runChaosTest(consistencyLevel = 'weak') {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`CHAOS TESTING WITH ${consistencyLevel.toUpperCase()} CONSISTENCY`);
  console.log('='.repeat(80));

  // Setup database
  const primaryUrl = `http://localhost:${config.rqliteNodes[0].port}`;
  const db = new AsyncDatabase(primaryUrl, { rqliteLevel: consistencyLevel });

  // Create schema
  await db.exec(`
    CREATE TABLE IF NOT EXISTS integrity_test (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      checksum TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `);

  const verifier = new DataIntegrityVerifier(db);

  // Start continuous write operations
  let writeCount = 0;
  let writeErrors = 0;
  const writeInterval = setInterval(async () => {
    const id = `test_${writeCount++}_${Date.now()}`;
    const data = {
      value: Math.random(),
      timestamp: Date.now(),
      consistency: consistencyLevel,
      metadata: crypto.randomBytes(32).toString('hex'),
    };

    const success = await verifier.writeTestData(id, data);
    if (!success) {
      writeErrors++;
    }

    if (writeCount % 100 === 0) {
      process.stdout.write(`\r📝 Writes: ${writeCount} (Errors: ${writeErrors})`);
    }
  }, 100);

  // Start periodic data verification
  const verifyInterval = setInterval(async () => {
    console.log('\n\n🔍 Verifying data integrity...');
    const results = await verifier.verifyAllData();
    console.log(`  Valid: ${results.valid}, Invalid: ${results.invalid}, Missing: ${results.missing}, Total: ${results.total}`);
  }, config.dataIntegrityCheckInterval);

  // Start chaos events
  let chaosCount = 0;
  const chaosInterval = setInterval(async () => {
    chaosCount++;
    console.log(`\n\n${'='.repeat(40)}`);
    console.log(`CHAOS EVENT #${chaosCount}`);
    console.log('='.repeat(40));

    // Execute random chaos
    await ChaosScenarios.randomChaos();

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Sometimes recover immediately, sometimes wait
    if (Math.random() > 0.5) {
      await ChaosScenarios.recoverAll();
    }
  }, config.chaosInterval);

  // Run for specified duration
  await new Promise(resolve => setTimeout(resolve, config.testDuration));

  // Stop all intervals
  clearInterval(writeInterval);
  clearInterval(verifyInterval);
  clearInterval(chaosInterval);

  // Final recovery
  await ChaosScenarios.recoverAll();

  // Final verification
  console.log('\n\n🏁 FINAL DATA VERIFICATION');
  console.log('='.repeat(40));
  const finalResults = await verifier.verifyAllData();

  await db.close();

  return {
    consistencyLevel,
    writes: writeCount,
    writeErrors,
    finalVerification: finalResults,
    discrepancies: testData.discrepancies.length,
    nodeFailures: testData.nodeFailures.length,
    recoveries: testData.recoveries.length,
  };
}

// Generate chaos report
function generateChaosReport(results) {
  console.log('\n\n' + '='.repeat(80));
  console.log(' '.repeat(25) + 'CHAOS TEST REPORT');
  console.log('='.repeat(80));

  results.forEach(result => {
    console.log(`\nConsistency Level: ${result.consistencyLevel.toUpperCase()}`);
    console.log('-'.repeat(40));
    console.log(`Total Writes Attempted: ${result.writes}`);
    console.log(`Write Errors: ${result.writeErrors} (${((result.writeErrors / result.writes) * 100).toFixed(2)}%)`);
    console.log(`\nData Integrity:`);
    console.log(`  Valid Records: ${result.finalVerification.valid}`);
    console.log(`  Invalid Records: ${result.finalVerification.invalid}`);
    console.log(`  Missing Records: ${result.finalVerification.missing}`);
    console.log(`  Data Loss Rate: ${((result.finalVerification.missing / result.finalVerification.total) * 100).toFixed(2)}%`);
    console.log(`\nChaos Events:`);
    console.log(`  Node Failures: ${result.nodeFailures}`);
    console.log(`  Node Recoveries: ${result.recoveries}`);
    console.log(`  Data Discrepancies: ${result.discrepancies}`);
  });

  // Summary
  console.log('\n\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));

  const linearizableResult = results.find(r => r.consistencyLevel === 'linearizable');
  const weakResult = results.find(r => r.consistencyLevel === 'weak');

  if (linearizableResult && weakResult) {
    console.log('\nConsistency Level Impact:');
    console.log(`  Linearizable consistency data loss: ${((linearizableResult.finalVerification.missing / linearizableResult.finalVerification.total) * 100).toFixed(2)}%`);
    console.log(`  Weak consistency data loss: ${((weakResult.finalVerification.missing / weakResult.finalVerification.total) * 100).toFixed(2)}%`);

    if (linearizableResult.discrepancies === 0 && weakResult.discrepancies === 0) {
      console.log('\n✅ No data corruption detected - checksums match!');
    } else {
      console.log(`\n⚠️ Data discrepancies found - Linearizable: ${linearizableResult.discrepancies}, Weak: ${weakResult.discrepancies}`);
    }
  }

  // Save detailed report
  const reportPath = path.join(__dirname, `chaos-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    config,
    results,
    testData,
  }, null, 2));

  console.log(`\n📄 Detailed report saved to: ${reportPath}`);
}

// Main function
async function main() {
  console.log('🚨 CHAOS ENGINEERING TEST SUITE 🚨');
  console.log('This will intentionally fail nodes and test data integrity\n');

  const results = [];

  try {
    // Ensure all nodes are running first
    console.log('Ensuring all nodes are healthy...');
    await ChaosScenarios.recoverAll();

    // Run chaos tests with different consistency levels
    for (const level of config.consistencyLevels) {
      // Reset test data for each run
      testData.expectedData.clear();
      testData.actualData.clear();
      testData.discrepancies = [];
      testData.nodeFailures = [];
      testData.recoveries = [];

      const result = await runChaosTest(level);
      results.push(result);

      // Recover all nodes between tests
      await ChaosScenarios.recoverAll();
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Generate report
    generateChaosReport(results);

  } catch (error) {
    console.error('\n\n❌ Chaos test failed:', error);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  DockerChaos,
  DataIntegrityVerifier,
  ChaosScenarios,
  runChaosTest,
};