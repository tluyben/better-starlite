/**
 * CR-SQLite Driver for better-starlite
 *
 * This driver provides support for cr-sqlite (Convergent, Replicated SQLite),
 * enabling offline-first applications with CRDTs for conflict-free replication.
 *
 * Platform support:
 * - Node.js: Using @vlcn.io/crsqlite-wasm
 * - Deno: Using @vlcn.io/crsqlite-wasm
 * - Browser: Using @vlcn.io/crsqlite-wasm
 * - Bun: Using @vlcn.io/crsqlite-wasm
 *
 * Key features:
 * - CRDT-based replication
 * - Offline-first architecture
 * - Automatic conflict resolution
 * - Change tracking for sync
 */

import {
  DatabaseInterface,
  StatementInterface,
  DriverFactory,
  DriverOptions,
  RunResult,
  ColumnDefinition,
  PragmaOptions,
  TransactionFunction
} from './driver-interface';

/**
 * CR-SQLite specific options
 */
export interface CrSqliteOptions extends DriverOptions {
  /** Site ID for CRDT replication (unique identifier for this database instance) */
  siteId?: string;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Custom WASM module path (if not using default) */
  wasmPath?: string;
}

class CrSqliteStatement implements StatementInterface {
  private stmt: any; // CR-SQLite statement
  private _raw = false;
  private _pluck = false;
  private _expand = false;

  constructor(stmt: any) {
    this.stmt = stmt;
  }

  run(...params: any[]): RunResult {
    this.stmt.bind(params);
    this.stmt.step();
    const changes = this.stmt.db.changes();
    const lastInsertRowid = this.stmt.db.lastInsertRowid();
    this.stmt.reset();

    return {
      changes: changes || 0,
      lastInsertRowid: lastInsertRowid || 0
    };
  }

  get(...params: any[]): any {
    this.stmt.bind(params);

    if (this.stmt.step()) {
      const row = this._processRow(this.stmt.getAsObject());
      this.stmt.reset();
      return row;
    }

    this.stmt.reset();
    return undefined;
  }

  all(...params: any[]): any[] {
    const results: any[] = [];
    this.stmt.bind(params);

    while (this.stmt.step()) {
      results.push(this._processRow(this.stmt.getAsObject()));
    }

    this.stmt.reset();
    return results;
  }

  *iterate(...params: any[]): IterableIterator<any> {
    this.stmt.bind(params);

    while (this.stmt.step()) {
      yield this._processRow(this.stmt.getAsObject());
    }

    this.stmt.reset();
  }

  private _processRow(row: any): any {
    if (this._raw) {
      return Object.values(row);
    }
    if (this._pluck) {
      const values = Object.values(row);
      return values.length > 0 ? values[0] : undefined;
    }
    if (this._expand) {
      // Expand mode not directly supported, return as-is
      return row;
    }
    return row;
  }

  pluck(toggleState?: boolean): this {
    this._pluck = toggleState !== false;
    return this;
  }

  expand(toggleState?: boolean): this {
    this._expand = toggleState !== false;
    return this;
  }

  raw(toggleState?: boolean): this {
    this._raw = toggleState !== false;
    return this;
  }

  bind(...params: any[]): this {
    this.stmt.bind(params);
    return this;
  }

  columns(): ColumnDefinition[] | undefined {
    const columnNames = this.stmt.getColumnNames();
    if (!columnNames) return undefined;

    return columnNames.map((name: string) => ({
      name: name,
      column: name,
      table: null,
      database: null,
      type: null,
      default: undefined,
      nullable: true
    }));
  }

  get source(): string {
    return this.stmt.getSQL() || '';
  }

  get reader(): boolean {
    // CR-SQLite doesn't provide direct access to this info
    // We can approximate by checking if SQL starts with SELECT
    const sql = this.source.trim().toUpperCase();
    return sql.startsWith('SELECT') || sql.startsWith('WITH');
  }
}

class CrSqliteDatabase implements DatabaseInterface {
  private db: any; // CR-SQLite database instance
  private _inTransaction = false;
  private _closed = false;
  private _filename: string;
  private _readonly: boolean;
  private verbose: boolean;

  constructor(db: any, filename: string, options: CrSqliteOptions = {}) {
    this.db = db;
    this._filename = filename;
    this._readonly = options.readonly || false;
    this.verbose = options.verbose || false;
  }

  prepare(sql: string): StatementInterface {
    if (this._closed) {
      throw new Error('Database is closed');
    }
    const stmt = this.db.prepare(sql);
    return new CrSqliteStatement(stmt);
  }

  exec(sql: string): this {
    if (this._closed) {
      throw new Error('Database is closed');
    }
    this.db.exec(sql);
    return this;
  }

  transaction(fn: TransactionFunction): TransactionFunction {
    const db = this;
    return function transactionWrapper(...args: any[]) {
      db.exec('BEGIN');
      db._inTransaction = true;

      try {
        const result = fn(...args);
        db.exec('COMMIT');
        db._inTransaction = false;
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        db._inTransaction = false;
        throw error;
      }
    };
  }

  pragma(sql: string, options?: PragmaOptions): any {
    if (this._closed) {
      throw new Error('Database is closed');
    }

    const stmt = this.db.prepare(`PRAGMA ${sql}`);
    const results: any[] = [];

    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }

    stmt.free();

    if (options?.simple && results.length > 0) {
      const firstRow = results[0];
      const values = Object.values(firstRow);
      return values.length > 0 ? values[0] : undefined;
    }

    return results;
  }

  function(name: string, fn: (...args: any[]) => any): this;
  function(name: string, options: any, fn: (...args: any[]) => any): this;
  function(name: string, optionsOrFn: any, maybeFn?: any): this {
    if (this._closed) {
      throw new Error('Database is closed');
    }

    const fn = typeof optionsOrFn === 'function' ? optionsOrFn : maybeFn;
    const options = typeof optionsOrFn === 'function' ? {} : optionsOrFn;

    this.db.create_function(name, fn);

    if (this.verbose) {
      console.log(`Registered custom function: ${name}`);
    }

    return this;
  }

  aggregate(name: string, options: any): this {
    if (this._closed) {
      throw new Error('Database is closed');
    }

    // CR-SQLite doesn't directly support aggregate functions like better-sqlite3
    // This is a limitation of the WASM implementation
    console.warn('Custom aggregate functions are not fully supported in CR-SQLite WASM');

    return this;
  }

  loadExtension(path: string): this {
    throw new Error('loadExtension is not supported in CR-SQLite WASM');
  }

  close(): this {
    if (!this._closed) {
      this.db.close();
      this._closed = true;
    }
    return this;
  }

  defaultSafeIntegers(toggleState?: boolean): this {
    // CR-SQLite doesn't have this option, but we can track it
    if (this.verbose) {
      console.log(`defaultSafeIntegers is not directly supported in CR-SQLite`);
    }
    return this;
  }

  unsafeMode(toggleState?: boolean): this {
    // CR-SQLite doesn't have this option
    if (this.verbose) {
      console.log(`unsafeMode is not supported in CR-SQLite`);
    }
    return this;
  }

  get inTransaction(): boolean {
    return this._inTransaction;
  }

  get name(): string {
    return this._filename;
  }

  get open(): boolean {
    return !this._closed;
  }

  get readonly(): boolean {
    return this._readonly;
  }

  get memory(): boolean {
    return this._filename === ':memory:';
  }

  /**
   * CR-SQLite specific: Get changes for synchronization
   */
  getChanges(since?: number): any[] {
    const stmt = this.db.prepare(
      since !== undefined
        ? 'SELECT * FROM crsql_changes WHERE db_version > ?'
        : 'SELECT * FROM crsql_changes'
    );

    if (since !== undefined) {
      stmt.bind([since]);
    }

    const changes: any[] = [];
    while (stmt.step()) {
      changes.push(stmt.getAsObject());
    }

    stmt.free();
    return changes;
  }

  /**
   * CR-SQLite specific: Apply changes from remote
   */
  applyChanges(changes: any[]): void {
    const stmt = this.db.prepare(
      'INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    for (const change of changes) {
      stmt.bind([
        change.table,
        change.pk,
        change.cid,
        change.val,
        change.col_version,
        change.db_version,
        change.site_id,
        change.cl,
        change.seq
      ]);
      stmt.step();
      stmt.reset();
    }

    stmt.free();
  }

  /**
   * CR-SQLite specific: Get current database version
   */
  getVersion(): number {
    const stmt = this.db.prepare('SELECT crsql_db_version()');
    stmt.step();
    const result = stmt.getAsObject();
    stmt.free();

    const version = Object.values(result)[0];
    return typeof version === 'number' ? version : 0;
  }
}

export class CrSqliteDriver implements DriverFactory {
  private CrSqlite: any = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  readonly name = 'cr-sqlite';
  readonly features = {
    backup: false,
    loadExtension: false,
    customFunctions: true,
    customAggregates: false,
    transactions: true,
    wal: false // CR-SQLite uses its own replication mechanism
  };

  constructor() {
    // Don't initialize immediately - wait for first use
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInitialize();
    await this.initPromise;
    this.initialized = true;
  }

  private async doInitialize(): Promise<void> {
    try {
      // Try to dynamically import cr-sqlite WASM
      // This works across Node.js, Deno, Bun, and browsers
      if (typeof require !== 'undefined') {
        // Node.js or Bun with require
        // @ts-ignore - Dynamic import of optional peer dependency
        const initWasm = require('@vlcn.io/crsqlite-wasm');
        this.CrSqlite = await initWasm();
      } else {
        // Deno or modern ESM environments
        // @ts-ignore - Dynamic import of optional peer dependency
        const { default: initWasm } = await import('@vlcn.io/crsqlite-wasm');
        this.CrSqlite = await initWasm();
      }
    } catch (e) {
      // Module not available
      if (this.isAvailable()) {
        console.warn('CR-SQLite module not found. Install with: npm install @vlcn.io/crsqlite-wasm');
      }
    }
  }

  isAvailable(): boolean {
    // CR-SQLite WASM works in Node.js, Deno, Bun, and browsers
    // Check for basic JavaScript environment features
    return (
      typeof Promise !== 'undefined' &&
      typeof (globalThis as any).WebAssembly !== 'undefined'
    );
  }

  createDatabase(filename: string, options: CrSqliteOptions = {}): DatabaseInterface {
    if (!this.isAvailable()) {
      throw new Error('CR-SQLite driver is not available in this environment');
    }

    // Initialize synchronously wrapped in async handler
    // This is a limitation - we need to make this async-safe
    if (!this.initialized) {
      throw new Error('CR-SQLite driver must be initialized before use. Call await driver.initialize() first, or use createCrSqliteDriver() factory.');
    }

    if (!this.CrSqlite) {
      throw new Error('@vlcn.io/crsqlite-wasm module not found. Please install it with: npm install @vlcn.io/crsqlite-wasm');
    }

    // Create database instance
    const db = new this.CrSqlite.DB(filename);

    // Set site ID if provided
    if (options.siteId) {
      db.exec(`SELECT crsql_siteid('${options.siteId}')`);
    }

    // Apply server-optimized pragmas (default: true)
    const serverOptimized = options.serverOptimized !== false;

    if (serverOptimized) {
      try {
        // Core safety features
        db.exec('PRAGMA foreign_keys = ON');
        db.exec('PRAGMA recursive_triggers = ON');

        // Performance optimizations (skip WAL for in-memory databases)
        if (filename !== ':memory:' && !options.disableWAL) {
          db.exec('PRAGMA journal_mode = WAL');
          db.exec('PRAGMA synchronous = NORMAL');
          db.exec('PRAGMA wal_autocheckpoint = 1000');
        }

        // Memory and cache optimizations
        db.exec('PRAGMA cache_size = 10000');
        db.exec('PRAGMA temp_store = MEMORY');
        db.exec('PRAGMA busy_timeout = 30000');
        db.exec('PRAGMA mmap_size = 268435456'); // 256MB

        // Optimize database
        db.exec('PRAGMA optimize');
      } catch (e) {
        if (options.verbose) {
          console.warn('Failed to apply server-optimized pragmas:', e);
        }
      }
    }

    if (options.verbose) {
      console.log(`CR-SQLite database created: ${filename}`);
      if (options.siteId) {
        console.log(`Site ID: ${options.siteId}`);
      }
    }

    return new CrSqliteDatabase(db, filename, options);
  }

  /**
   * Async initialization method for proper setup
   */
  async init(): Promise<void> {
    await this.initialize();
  }
}

/**
 * Factory function to create and initialize a CR-SQLite driver
 *
 * Usage:
 * ```typescript
 * const driver = await createCrSqliteDriver();
 * DriverRegistry.register('cr-sqlite', driver);
 * ```
 */
export async function createCrSqliteDriver(): Promise<CrSqliteDriver> {
  const driver = new CrSqliteDriver();
  await driver.init();
  return driver;
}

/**
 * Synchronous factory for environments where initialization can be deferred
 */
export function createCrSqliteDriverSync(): CrSqliteDriver {
  return new CrSqliteDriver();
}
