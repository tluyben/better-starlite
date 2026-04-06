/**
 * FlexDB test cluster helper.
 *
 * Spawns one or more real flexdb processes on ephemeral ports and tears them
 * down after the test suite. Tests skip automatically when the `flexdb` binary
 * cannot be found.
 *
 * Usage:
 *   const { FlexDbCluster, skipIfNoFlexDb } = require('./flexdb-cluster');
 *
 *   // In a Jest describe block:
 *   skipIfNoFlexDb();
 *   let cluster;
 *   beforeAll(async () => { cluster = await FlexDbCluster.start(1); });
 *   afterAll(async ()  => { await cluster.stop(); });
 *
 *   test('...', async () => {
 *     const db = await createDatabase(cluster.url(0));
 *     ...
 *   });
 */

const { spawnSync, spawn } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');

// ── Binary detection ────────────────────────────────────────────────────────

function findFlexDbBinary() {
  // 1. Explicit env var
  if (process.env.FLEXDB_BIN) return process.env.FLEXDB_BIN;

  // 2. Sibling workspace build artifacts
  const candidates = [
    path.resolve(__dirname, '../../../../flexdb/target/release/flexdb'),
    path.resolve(__dirname, '../../../../flexdb/target/debug/flexdb'),
    path.resolve(__dirname, '../../../flexdb/target/release/flexdb'),
    path.resolve(__dirname, '../../../flexdb/target/debug/flexdb'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  // 3. PATH lookup
  const result = spawnSync('which', ['flexdb'], { encoding: 'utf8' });
  if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();

  return null;
}

const FLEXDB_BIN = findFlexDbBinary();

/** Call at the top of a describe block to skip the whole suite when flexdb is absent. */
function skipIfNoFlexDb() {
  if (!FLEXDB_BIN) {
    // Jest's test.skip doesn't work at describe-level, so we use a beforeAll that skips.
    beforeAll(() => {
      console.log('⏭️  Skipping FlexDB tests — flexdb binary not found (set FLEXDB_BIN to enable)');
    });
    // eslint-disable-next-line jest/no-focused-tests
    test.skip('FlexDB binary not available', () => {});
  }
}

// ── Port utilities ───────────────────────────────────────────────────────────

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

// ── FlexDbCluster ────────────────────────────────────────────────────────────

class FlexDbCluster {
  constructor(nodes) {
    /** @type {Array<{ process: ChildProcess, httpPort: number, raftPort: number, dataDir: string }>} */
    this.nodes = nodes;
  }

  /** flexdb:// URL for the i-th node. */
  url(i = 0) {
    return `flexdb://127.0.0.1:${this.nodes[i].httpPort}`;
  }

  /** Multi-node URL for round-robin: "flexdb://node1:port1,node2:port2" */
  multiUrl() {
    return `flexdb://${this.nodes.map(n => `127.0.0.1:${n.httpPort}`).join(',')}`;
  }

  async stop() {
    for (const node of this.nodes) {
      try {
        node.process.kill('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 200));
        if (!node.process.killed) node.process.kill('SIGKILL');
      } catch { /* already dead */ }
    }
  }

  /**
   * Spawn `count` standalone FlexDB nodes (no RAFT cluster wiring for single-node).
   * @param {number} count
   * @param {{ authToken?: string }} [opts]
   * @returns {Promise<FlexDbCluster>}
   */
  static async start(count = 1, opts = {}) {
    if (!FLEXDB_BIN) throw new Error('flexdb binary not found — cannot start cluster');

    const nodes = [];
    for (let i = 0; i < count; i++) {
      const httpPort = await findFreePort();

      const args = [
        '--addr', `127.0.0.1:${httpPort}`,
        '--in-memory',
        '--no-raft',
      ];

      const proc = spawn(FLEXDB_BIN, args, {
        stdio: 'pipe',
        env: { ...process.env, RUST_LOG: 'warn' },
      });

      proc.on('error', () => {});
      nodes.push({ process: proc, httpPort });
    }

    // Wait for all nodes to become healthy
    const cluster = new FlexDbCluster(nodes);
    await cluster._waitForHealth();
    return cluster;
  }

  async _waitForHealth(maxRetries = 60, delayMs = 100) {
    for (const node of this.nodes) {
      let lastErr;
      for (let i = 0; i < maxRetries; i++) {
        try {
          const resp = await fetch(`http://127.0.0.1:${node.httpPort}/v1/health`, {
            signal: AbortSignal.timeout(1000),
          });
          if (resp.ok) break;
        } catch (e) {
          lastErr = e;
          await new Promise(r => setTimeout(r, delayMs));
        }
        if (i === maxRetries - 1) {
          throw new Error(`FlexDB node on port ${node.httpPort} did not become healthy: ${lastErr?.message}`);
        }
      }
    }
  }
}

module.exports = { FlexDbCluster, skipIfNoFlexDb, FLEXDB_BIN };
