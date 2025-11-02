/**
 * SQLite Driver for Node.js using better-sqlite3
 *
 * This driver is only loaded and registered when running in a Node.js environment.
 * It will not cause compilation issues in other environments because the better-sqlite3
 * import is dynamic and conditional.
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

class SqliteNodeStatement implements StatementInterface {
  private stmt: any; // Better-sqlite3 statement

  constructor(stmt: any) {
    this.stmt = stmt;
  }

  run(...params: any[]): RunResult {
    const result = this.stmt.run(...params);
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid
    };
  }

  get(...params: any[]): any {
    return this.stmt.get(...params);
  }

  all(...params: any[]): any[] {
    return this.stmt.all(...params);
  }

  iterate(...params: any[]): IterableIterator<any> {
    return this.stmt.iterate(...params);
  }

  pluck(toggleState?: boolean): this {
    this.stmt.pluck(toggleState);
    return this;
  }

  expand(toggleState?: boolean): this {
    this.stmt.expand(toggleState);
    return this;
  }

  raw(toggleState?: boolean): this {
    this.stmt.raw(toggleState);
    return this;
  }

  columns(): ColumnDefinition[] | undefined {
    const cols = this.stmt.columns();
    if (!cols) return undefined;

    return cols.map((col: any) => ({
      name: col.name,
      column: col.column,
      table: col.table,
      database: col.database,
      type: col.type,
      default: col.default,
      nullable: col.nullable || true
    }));
  }

  bind(...params: any[]): this {
    this.stmt.bind(...params);
    return this;
  }

  get source(): string {
    return this.stmt.source;
  }

  get reader(): boolean {
    return this.stmt.reader;
  }
}

class SqliteNodeDatabase implements DatabaseInterface {
  private db: any; // Better-sqlite3 database instance

  constructor(db: any) {
    this.db = db;
  }

  prepare(sql: string): StatementInterface {
    return new SqliteNodeStatement(this.db.prepare(sql));
  }

  exec(sql: string): this {
    this.db.exec(sql);
    return this;
  }

  transaction(fn: TransactionFunction): TransactionFunction {
    return this.db.transaction(fn);
  }

  pragma(sql: string, options?: PragmaOptions): any {
    return this.db.pragma(sql, options);
  }

  backup(destination: string): Promise<Buffer> {
    const result = this.db.backup(destination);
    return result as any as Promise<Buffer>;
  }

  function(name: string, fn: (...args: any[]) => any): this;
  function(name: string, options: any, fn: (...args: any[]) => any): this;
  function(name: string, optionsOrFn: any, maybeFn?: any): this {
    if (typeof optionsOrFn === 'function') {
      this.db.function(name, optionsOrFn);
    } else {
      this.db.function(name, optionsOrFn, maybeFn);
    }
    return this;
  }

  aggregate(name: string, options: any): this {
    this.db.aggregate(name, options);
    return this;
  }

  loadExtension(path: string): this {
    this.db.loadExtension(path);
    return this;
  }

  close(): this {
    this.db.close();
    return this;
  }

  defaultSafeIntegers(toggleState?: boolean): this {
    this.db.defaultSafeIntegers(toggleState);
    return this;
  }

  unsafeMode(toggleState?: boolean): this {
    this.db.unsafeMode(toggleState);
    return this;
  }

  get inTransaction(): boolean {
    return this.db.inTransaction;
  }

  get name(): string {
    return this.db.name;
  }

  get open(): boolean {
    return this.db.open;
  }

  get readonly(): boolean {
    return this.db.readonly;
  }

  get memory(): boolean {
    return this.db.memory;
  }
}

export class SqliteNodeDriver implements DriverFactory {
  private BetterSqlite3: any = null;

  readonly name = 'sqlite-node';
  readonly features = {
    backup: true,
    loadExtension: true,
    customFunctions: true,
    customAggregates: true,
    transactions: true,
    wal: true
  };

  constructor() {
    // Try to load better-sqlite3 dynamically
    if (this.isAvailable()) {
      try {
        // Dynamic import to avoid compilation issues
        this.BetterSqlite3 = require('better-sqlite3');
      } catch (e) {
        // Module not available, driver will report as unavailable
      }
    }
  }

  isAvailable(): boolean {
    // Check if we're in Node.js environment
    return typeof process !== 'undefined' &&
           process.versions &&
           process.versions.node !== undefined &&
           typeof require !== 'undefined';
  }

  createDatabase(filename: string, options: DriverOptions = {}): DatabaseInterface {
    if (!this.isAvailable()) {
      throw new Error('SQLite Node driver is not available in this environment');
    }

    if (!this.BetterSqlite3) {
      throw new Error('better-sqlite3 module not found. Please install it with: npm install better-sqlite3');
    }

    const db = new this.BetterSqlite3(filename, options);

    // Apply server-optimized pragmas (default: true)
    const serverOptimized = options.serverOptimized !== false;

    if (serverOptimized) {
      try {
        // Core safety features
        db.pragma('foreign_keys = ON');
        db.pragma('recursive_triggers = ON');

        // Performance optimizations (skip WAL for in-memory databases)
        if (filename !== ':memory:' && !options.disableWAL) {
          db.pragma('journal_mode = WAL');
          db.pragma('synchronous = NORMAL');
          db.pragma('wal_autocheckpoint = 1000');
        }

        // Memory and cache optimizations
        db.pragma('cache_size = 10000');
        db.pragma('temp_store = MEMORY');
        db.pragma('busy_timeout = 30000');
        db.pragma('mmap_size = 268435456'); // 256MB

        // Optimize database
        db.pragma('optimize');
      } catch (e: any) {
        // Silently ignore pragma errors to maintain compatibility
      }
    } else if (!options.disableWAL && filename !== ':memory:') {
      // Legacy behavior: just enable WAL if not disabled
      try {
        db.pragma('journal_mode = WAL');
      } catch (e) {
        if (options.verbose) {
          console.warn('Failed to enable WAL mode:', e);
        }
      }
    }

    return new SqliteNodeDatabase(db);
  }
}

// Export a factory function instead of auto-registering
export function createSqliteNodeDriver(): SqliteNodeDriver {
  return new SqliteNodeDriver();
}