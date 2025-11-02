import BetterSqlite3 from 'better-sqlite3';
import { RqliteClient } from './rqlite-client';

type SqliteOptions = BetterSqlite3.Options;

export interface DatabaseOptions extends SqliteOptions {
  disableWAL?: boolean;
  serverOptimized?: boolean;
  rqliteLevel?: 'none' | 'weak' | 'linearizable';
  schemaRewriter?: string;
  queryRewriter?: string;
  autoRegisterPlugins?: boolean;
}

export class Statement {
  private sqliteStmt?: BetterSqlite3.Statement;
  private rqliteClient?: RqliteClient;
  private sql: string;
  private isWrite: boolean;

  constructor(stmt: BetterSqlite3.Statement | { client: RqliteClient; sql: string; isWrite: boolean }) {
    if ('client' in stmt) {
      this.rqliteClient = stmt.client;
      this.sql = stmt.sql;
      this.isWrite = stmt.isWrite;
    } else {
      this.sqliteStmt = stmt;
      this.sql = stmt.source;
      this.isWrite = !stmt.reader;
    }
  }

  run(...params: any[]): BetterSqlite3.RunResult {
    if (this.sqliteStmt) {
      return this.sqliteStmt.run(...params);
    }

    const result = this.rqliteClient!.executeSync(this.sql, params);
    if (result.error) {
      throw new Error(result.error);
    }

    const firstResult = result.results?.[0];
    if (firstResult?.error) {
      throw new Error(firstResult.error);
    }

    return {
      changes: firstResult?.rows_affected || 0,
      lastInsertRowid: firstResult?.last_insert_id || 0
    };
  }

  get(...params: any[]): any {
    if (this.sqliteStmt) {
      return this.sqliteStmt.get(...params);
    }

    const result = this.rqliteClient!.querySync(this.sql, params);
    if (result.error) {
      throw new Error(result.error);
    }

    const firstResult = result.results?.[0];
    if (firstResult?.error) {
      throw new Error(firstResult.error);
    }

    if (!firstResult?.values || firstResult.values.length === 0) {
      return undefined;
    }

    const row: any = {};
    firstResult.columns?.forEach((col, i) => {
      row[col] = firstResult.values![0][i];
    });
    return row;
  }

  all(...params: any[]): any[] {
    if (this.sqliteStmt) {
      return this.sqliteStmt.all(...params);
    }

    const result = this.rqliteClient!.querySync(this.sql, params);
    if (result.error) {
      throw new Error(result.error);
    }

    const firstResult = result.results?.[0];
    if (firstResult?.error) {
      throw new Error(firstResult.error);
    }

    if (!firstResult?.values) {
      return [];
    }

    return firstResult.values.map(row => {
      const obj: any = {};
      firstResult.columns?.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj;
    });
  }

  iterate(...params: any[]): IterableIterator<any> {
    if (this.sqliteStmt) {
      return this.sqliteStmt.iterate(...params);
    }

    const rows = this.all(...params);
    return rows[Symbol.iterator]();
  }

  pluck(toggleState?: boolean): this {
    if (this.sqliteStmt) {
      this.sqliteStmt.pluck(toggleState);
    }
    return this;
  }

  expand(toggleState?: boolean): this {
    if (this.sqliteStmt) {
      this.sqliteStmt.expand(toggleState);
    }
    return this;
  }

  raw(toggleState?: boolean): this {
    if (this.sqliteStmt) {
      this.sqliteStmt.raw(toggleState);
    }
    return this;
  }

  columns(): BetterSqlite3.ColumnDefinition[] | undefined {
    if (this.sqliteStmt) {
      return this.sqliteStmt.columns();
    }
    return undefined;
  }

  bind(...params: any[]): this {
    if (this.sqliteStmt) {
      this.sqliteStmt.bind(...params);
    }
    return this;
  }

  get source(): string {
    return this.sql;
  }

  get reader(): boolean {
    return !this.isWrite;
  }
}

export default class Database {
  private sqliteDb?: BetterSqlite3.Database;
  private rqliteClient?: RqliteClient;
  private options: DatabaseOptions;

  constructor(filename: string, options: DatabaseOptions = {}) {
    this.options = options;

    if (filename.startsWith('http://') || filename.startsWith('https://')) {
      this.rqliteClient = new RqliteClient(filename);
    } else {
      this.sqliteDb = new BetterSqlite3(filename, options);

      // Apply server-optimized pragmas (default: true)
      const serverOptimized = options.serverOptimized !== false;

      if (serverOptimized) {
        try {
          // Core safety features
          this.sqliteDb.pragma('foreign_keys = ON');
          this.sqliteDb.pragma('recursive_triggers = ON');

          // Performance optimizations (skip WAL for in-memory databases)
          if (filename !== ':memory:' && !options.disableWAL) {
            this.sqliteDb.pragma('journal_mode = WAL');
            this.sqliteDb.pragma('synchronous = NORMAL');
            this.sqliteDb.pragma('wal_autocheckpoint = 1000');
          }

          // Memory and cache optimizations
          this.sqliteDb.pragma('cache_size = 10000');
          this.sqliteDb.pragma('temp_store = MEMORY');
          this.sqliteDb.pragma('busy_timeout = 30000');
          this.sqliteDb.pragma('mmap_size = 268435456'); // 256MB

          // Optimize database
          this.sqliteDb.pragma('optimize');
        } catch (e) {
          // Silently ignore pragma errors to maintain compatibility
        }
      } else if (!options.disableWAL && filename !== ':memory:') {
        // Legacy behavior: just enable WAL if not disabled
        try {
          this.sqliteDb.pragma('journal_mode = WAL');
        } catch (e) {
          console.warn('Failed to enable WAL mode:', e);
        }
      }
    }
  }

  prepare(sql: string): Statement {
    if (this.sqliteDb) {
      return new Statement(this.sqliteDb.prepare(sql));
    }

    const isWrite = /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|BEGIN|COMMIT|ROLLBACK)/i.test(sql);
    return new Statement({
      client: this.rqliteClient!,
      sql,
      isWrite
    });
  }

  exec(sql: string): this {
    if (this.sqliteDb) {
      this.sqliteDb.exec(sql);
    } else {
      const statements = sql.split(';').filter(s => s.trim());
      for (const stmt of statements) {
        if (stmt.trim()) {
          this.rqliteClient!.executeSync(stmt);
        }
      }
    }
    return this;
  }

  transaction(fn: (...args: any[]) => any): (...args: any[]) => any {
    if (this.sqliteDb) {
      return this.sqliteDb.transaction(fn);
    }

    return (...args: any[]) => {
      this.exec('BEGIN');
      try {
        const result = fn(...args);
        this.exec('COMMIT');
        return result;
      } catch (error) {
        this.exec('ROLLBACK');
        throw error;
      }
    };
  }

  pragma(sql: string, options?: BetterSqlite3.PragmaOptions): any {
    if (this.sqliteDb) {
      return this.sqliteDb.pragma(sql, options);
    }

    const pragmaMatch = sql.match(/^(\w+)(?:\s*=\s*(.+))?$/);
    if (!pragmaMatch) {
      throw new Error('Invalid pragma statement');
    }

    const [, key, value] = pragmaMatch;
    let query = `PRAGMA ${key}`;
    if (value !== undefined) {
      query += ` = ${value}`;
    }

    const result = this.rqliteClient!.querySync(query);
    if (result.error) {
      throw new Error(result.error);
    }

    const firstResult = result.results?.[0];
    if (firstResult?.error) {
      throw new Error(firstResult.error);
    }

    if (!firstResult?.values || firstResult.values.length === 0) {
      return options?.simple ? undefined : [];
    }

    if (options?.simple) {
      return firstResult.values[0][0];
    }

    return firstResult.values.map(row => {
      const obj: any = {};
      firstResult.columns?.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj;
    });
  }

  backup(destination: string): Promise<Buffer> {
    if (this.sqliteDb) {
      const result = this.sqliteDb.backup(destination);
      return result as any as Promise<Buffer>;
    }
    throw new Error('Backup not supported for rqlite connections');
  }

  function(name: string, fn: (...args: any[]) => any): this;
  function(name: string, options: BetterSqlite3.RegistrationOptions, fn: (...args: any[]) => any): this;
  function(name: string, optionsOrFn: any, maybeFn?: any): this {
    if (this.sqliteDb) {
      if (typeof optionsOrFn === 'function') {
        this.sqliteDb.function(name, optionsOrFn);
      } else {
        this.sqliteDb.function(name, optionsOrFn, maybeFn);
      }
    }
    return this;
  }

  aggregate(name: string, options: BetterSqlite3.AggregateOptions): this {
    if (this.sqliteDb) {
      this.sqliteDb.aggregate(name, options);
    }
    return this;
  }

  loadExtension(path: string): this {
    if (this.sqliteDb) {
      this.sqliteDb.loadExtension(path);
    }
    return this;
  }

  close(): this {
    if (this.sqliteDb) {
      this.sqliteDb.close();
    }
    return this;
  }

  defaultSafeIntegers(toggleState?: boolean): this {
    if (this.sqliteDb) {
      this.sqliteDb.defaultSafeIntegers(toggleState);
    }
    return this;
  }

  unsafeMode(toggleState?: boolean): this {
    if (this.sqliteDb) {
      this.sqliteDb.unsafeMode(toggleState);
    }
    return this;
  }

  get inTransaction(): boolean {
    if (this.sqliteDb) {
      return this.sqliteDb.inTransaction;
    }
    return false;
  }

  get name(): string {
    if (this.sqliteDb) {
      return this.sqliteDb.name;
    }
    return 'rqlite';
  }

  get open(): boolean {
    if (this.sqliteDb) {
      return this.sqliteDb.open;
    }
    return true;
  }

  get readonly(): boolean {
    if (this.sqliteDb) {
      return this.sqliteDb.readonly;
    }
    return false;
  }

  get memory(): boolean {
    if (this.sqliteDb) {
      return this.sqliteDb.memory;
    }
    return false;
  }
}

export { Database };
export { AsyncDatabase, AsyncStatement } from './async';
export { drizzle } from './drizzle';