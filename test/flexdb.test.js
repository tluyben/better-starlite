/**
 * FlexDB integration tests for better-starlite.
 *
 * These tests start a real flexdb process on an ephemeral port and exercise
 * the full AsyncDatabase → FlexDbClient stack. They are skipped automatically
 * when the flexdb binary is not available.
 *
 * To run:
 *   FLEXDB_BIN=/path/to/flexdb npx jest test/flexdb.test.js
 * or build the binary first:
 *   (cd ../../flexdb && cargo build --release)
 *   npx jest test/flexdb.test.js
 */

const { createDatabase } = require('../dist/async-unified');
const { FlexDbCluster, FLEXDB_BIN } = require('./helpers/flexdb-cluster');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Skip all tests in this file if the flexdb binary is not available.
// Use a top-level conditional so that beforeAll/afterAll are also skipped.
const RUN = !!FLEXDB_BIN;
const testIf = RUN ? test : test.skip;
const itIf = RUN ? it : it.skip;

// ── Suite setup ──────────────────────────────────────────────────────────────

let cluster;
let db;

beforeAll(async () => {
  if (!RUN) return;
  cluster = await FlexDbCluster.start(1);
  db = await createDatabase(cluster.url(0));
}, 30000);

afterAll(async () => {
  if (!RUN) return;
  if (db) await db.close();
  if (cluster) await cluster.stop();
});

// Sentinel test that always runs — either passes (binary present) or skips (absent)
test('FlexDB binary availability', () => {
  if (!RUN) {
    console.log('⏭️  Skipping FlexDB tests — flexdb binary not found (set FLEXDB_BIN to enable)');
  }
  expect(true).toBe(true);
});

// ── Basic connectivity ────────────────────────────────────────────────────────

testIf('getName() returns "flexdb"', async () => {
  expect(await db.getName()).toBe('flexdb');
});

testIf('creates a table and inserts rows', async () => {
  await db.exec(`CREATE TABLE IF NOT EXISTS greetings (id INTEGER PRIMARY KEY, msg TEXT)`);
  const stmt = await db.prepare('INSERT INTO greetings (msg) VALUES (?)');
  const r = await stmt.run('hello flexdb');
  expect(r.changes).toBe(1);
});

testIf('prepare + get() returns inserted row', async () => {
  await db.exec(`CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, body TEXT)`);
  await (await db.prepare('INSERT INTO notes (body) VALUES (?)')).run('test note');
  const row = await (await db.prepare('SELECT body FROM notes LIMIT 1')).get();
  expect(row.body).toBe('test note');
});

testIf('prepare + all() returns all rows', async () => {
  await db.exec(`CREATE TABLE IF NOT EXISTS fruits (id INTEGER PRIMARY KEY, name TEXT)`);
  const ins = await db.prepare('INSERT INTO fruits (name) VALUES (?)');
  await ins.run('apple');
  await ins.run('banana');
  await ins.run('cherry');
  const rows = await (await db.prepare('SELECT name FROM fruits ORDER BY name')).all();
  expect(rows.map(r => r.name)).toEqual(['apple', 'banana', 'cherry']);
});

// ── Transactions ──────────────────────────────────────────────────────────────

testIf('transaction() commits on success', async () => {
  await db.exec(`CREATE TABLE IF NOT EXISTS txtest (id INTEGER PRIMARY KEY, val INTEGER)`);
  // transaction() returns a wrapped function — must be called explicitly (SQLite pattern)
  const txFn = await db.transaction(async () => {
    await (await db.prepare('INSERT INTO txtest (val) VALUES (?)')).run(42);
    await (await db.prepare('INSERT INTO txtest (val) VALUES (?)')).run(43);
  });
  await txFn();
  const rows = await (await db.prepare('SELECT val FROM txtest ORDER BY val')).all();
  expect(rows.map(r => r.val)).toEqual([42, 43]);
});

testIf('transaction() rolls back on error', async () => {
  await db.exec(`CREATE TABLE IF NOT EXISTS txrollback (id INTEGER PRIMARY KEY, val INTEGER)`);
  const before = await (await db.prepare('SELECT COUNT(*) as n FROM txrollback')).get();

  const txFn = await db.transaction(async () => {
    await (await db.prepare('INSERT INTO txrollback (val) VALUES (?)')).run(99);
    throw new Error('intentional rollback');
  });
  await expect(txFn()).rejects.toThrow('intentional rollback');

  const after = await (await db.prepare('SELECT COUNT(*) as n FROM txrollback')).get();
  expect(Number(after.n)).toBe(Number(before.n));
});

// ── supportsFeature ───────────────────────────────────────────────────────────

testIf('supportsFeature("per-table-consistency") is true', () => {
  expect(db.supportsFeature('per-table-consistency')).toBe(true);
});

testIf('supportsFeature("native-search") is true', () => {
  expect(db.supportsFeature('native-search')).toBe(true);
});

testIf('supportsFeature("backup") is true', () => {
  expect(db.supportsFeature('backup')).toBe(true);
});

testIf('supportsFeature("unknown-feature") is false', () => {
  expect(db.supportsFeature('unknown-feature')).toBe(false);
});

// ── pragma() no-ops ────────────────────────────────────────────────────────────

testIf('pragma() returns empty array (no-op on FlexDB)', async () => {
  const result = await db.pragma('journal_mode');
  expect(Array.isArray(result)).toBe(true);
  expect(result.length).toBe(0);
});

testIf('pragma() with simple:true returns undefined', async () => {
  const result = await db.pragma('journal_mode', { simple: true });
  expect(result).toBeUndefined();
});

// ── Per-table consistency ─────────────────────────────────────────────────────

testIf('setTableMode() and getTableMode() roundtrip', async () => {
  await db.exec(`CREATE TABLE IF NOT EXISTS eventual_tbl (id INTEGER PRIMARY KEY, val TEXT)`);
  await db.setTableMode('eventual_tbl', 'eventual');
  const mode = await db.getTableMode('eventual_tbl');
  expect(mode).toBe('eventual');
});

testIf('setTableMode("raft") and getTableMode() roundtrip', async () => {
  await db.exec(`CREATE TABLE IF NOT EXISTS raft_tbl (id INTEGER PRIMARY KEY, val TEXT)`);
  await db.setTableMode('raft_tbl', 'raft');
  const mode = await db.getTableMode('raft_tbl');
  expect(mode).toBe('raft');
});

// ── Native search ─────────────────────────────────────────────────────────────

testIf('enableSearch() + search() returns matching rows', async () => {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY,
      title TEXT,
      body TEXT
    )
  `);
  const ins = await db.prepare('INSERT INTO articles (title, body) VALUES (?, ?)');
  await ins.run('Quick brown fox', 'The quick brown fox jumps over the lazy dog');
  await ins.run('Hello world', 'A simple greeting to the world');
  await ins.run('SQLite FTS', 'Full text search with porter stemmer');

  await db.enableSearch('articles', ['title', 'body']);

  const results = await db.search('articles', 'fox', 10);
  expect(results.length).toBeGreaterThan(0);
  expect(results[0].title).toBe('Quick brown fox');
});

testIf('disableSearch() removes search config', async () => {
  await db.exec(`CREATE TABLE IF NOT EXISTS searchable (id INTEGER PRIMARY KEY, text TEXT)`);
  await db.enableSearch('searchable', ['text']);
  await db.disableSearch('searchable');
  const config = await db.getSearchConfig('searchable');
  expect(config).toEqual([]);
});

testIf('getSearchConfig() returns configured columns', async () => {
  await db.exec(`CREATE TABLE IF NOT EXISTS config_tbl (id INTEGER PRIMARY KEY, title TEXT, body TEXT)`);
  await db.enableSearch('config_tbl', ['title', 'body']);
  const cols = await db.getSearchConfig('config_tbl');
  expect(cols).toContain('title');
  expect(cols).toContain('body');
});

// ── Backup / snapshot ─────────────────────────────────────────────────────────

testIf('backup() downloads a non-empty SQLite snapshot', async () => {
  const dest = path.join(os.tmpdir(), `flexdb-snap-${Date.now()}.db`);
  try {
    await db.backup(dest);
    const stat = fs.statSync(dest);
    expect(stat.size).toBeGreaterThan(0);
    // SQLite magic number in first 16 bytes
    const header = fs.readFileSync(dest).slice(0, 16).toString('utf8');
    expect(header).toMatch(/SQLite format/);
  } finally {
    try { fs.unlinkSync(dest); } catch { /* ignore */ }
  }
});

// ── upsert() ─────────────────────────────────────────────────────────────────

testIf('upsert() inserts and detects created=true', async () => {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS kvstore (
      k TEXT PRIMARY KEY,
      v TEXT
    )
  `);
  const result = await db.upsert('kvstore', ['k', 'v'], ['key1', 'val1'], ['k'], ['v']);
  expect(result.changes).toBeGreaterThanOrEqual(1);
  expect(result.created).toBe(true);
});

testIf('upsert() updates existing row and detects created=false', async () => {
  await db.exec(`CREATE TABLE IF NOT EXISTS kvstore2 (k TEXT PRIMARY KEY, v TEXT)`);
  await db.upsert('kvstore2', ['k', 'v'], ['mykey', 'original'], ['k'], ['v']);
  const result = await db.upsert('kvstore2', ['k', 'v'], ['mykey', 'updated'], ['k'], ['v']);
  expect(result.created).toBe(false);
  const row = await (await db.prepare('SELECT v FROM kvstore2 WHERE k = ?')).get('mykey');
  expect(row.v).toBe('updated');
});

// ── Round-robin multi-node URL ────────────────────────────────────────────────

testIf('multi-node URL parses and connects', async () => {
  // Single-node cluster registered as two aliases — still just tests URL parsing
  const url = cluster.multiUrl();
  expect(url).toMatch(/^flexdb:\/\//);
  const db2 = await createDatabase(url);
  const row = await (await db2.prepare('SELECT 1 AS n')).get();
  expect(row.n).toBe(1);
  await db2.close();
});

// ── getInTransaction() ────────────────────────────────────────────────────────

testIf('getInTransaction() is false outside a transaction', async () => {
  expect(await db.getInTransaction()).toBe(false);
});

testIf('getInTransaction() is true inside a transaction', async () => {
  await db.exec(`CREATE TABLE IF NOT EXISTS intxn_check (id INTEGER PRIMARY KEY)`);
  let seenInTxn = false;
  const txFn = await db.transaction(async () => {
    seenInTxn = await db.getInTransaction();
  });
  await txFn();
  expect(seenInTxn).toBe(true);
});
