/**
 * Unified async database interface for both Node.js and Deno
 * Works with both SQLite and RQLite in both environments
 */

import { detectRuntime } from './runtime';

// Types that work across both environments
export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface DatabaseOptions {
  readonly?: boolean;
  fileMustExist?: boolean;
  timeout?: number;
  verbose?: typeof console.log | ((message?: any, ...additionalArgs: any[]) => void);
  nativeBinding?: string;
  disableWAL?: boolean;
  rqliteLevel?: 'none' | 'weak' | 'strong';
  [key: string]: any;
}

export interface ColumnDefinition {
  name: string;
  column: string | null;
  table: string | null;
  database: string | null;
  type: string | null;
  nullable: boolean;
  default: any;
}

export interface PragmaOptions {
  simple?: boolean;
}

// Abstract interfaces for the database drivers
interface SqliteDriver {
  prepare(sql: string): any;
  exec(sql: string): void;
  pragma(sql: string, options?: PragmaOptions): any;
  close(): void;
  readonly name: string;
  readonly open: boolean;
  readonly memory: boolean;
  readonly readonly: boolean;
  readonly inTransaction: boolean;
}

interface RqliteDriver {
  executeAsync(query: string, params?: any[]): Promise<any>;
  queryAsync(query: string, params?: any[]): Promise<any>;
}

// Load the appropriate drivers based on runtime
async function loadDrivers(): Promise<{
  createSqliteDriver: (filename: string, options: DatabaseOptions) => SqliteDriver;
  createRqliteDriver: (url: string) => RqliteDriver;
}> {
  const runtime = detectRuntime();

  if (runtime === 'node') {
    // Node.js environment
    const BetterSqlite3 = (await import('better-sqlite3')).default;
    const { NodeRqliteClient } = await import('./drivers/node-rqlite-client');

    return {
      createSqliteDriver: (filename: string, options: DatabaseOptions) => {
        const db = new BetterSqlite3(filename, options);
        if (!options.disableWAL && filename !== ':memory:') {
          try {
            db.pragma('journal_mode = WAL');
          } catch (e) {
            console.warn('Failed to enable WAL mode:', e);
          }
        }
        return db;
      },
      createRqliteDriver: (url: string) => new NodeRqliteClient(url)
    };
  } else if (runtime === 'deno') {
    // Deno environment - use string paths for dynamic import
    const denoSqliteModule = await import('./drivers/deno-sqlite' + '.ts');
    const denoRqliteModule = await import('./drivers/deno-rqlite-client' + '.ts');

    return {
      createSqliteDriver: (filename: string, options: DatabaseOptions) => {
        return new denoSqliteModule.DenoDatabase(filename, options);
      },
      createRqliteDriver: (url: string) => new denoRqliteModule.DenoRqliteClient(url)
    };
  } else {
    throw new Error('Unsupported runtime environment');
  }
}

export class AsyncStatement {
  private sqliteStmt?: any;
  private rqliteClient?: RqliteDriver;
  private sql: string;
  private isWrite: boolean;

  constructor(stmt: any | { client: RqliteDriver; sql: string; isWrite: boolean }) {
    if ('client' in stmt) {
      this.rqliteClient = stmt.client;
      this.sql = stmt.sql;
      this.isWrite = stmt.isWrite;
    } else {
      this.sqliteStmt = stmt;
      this.sql = stmt.source || stmt.sql;
      this.isWrite = stmt.reader === false || !stmt.reader;
    }
  }

  async run(...params: any[]): Promise<RunResult> {
    if (this.sqliteStmt) {
      // For SQLite, wrap synchronous operation in a promise
      return Promise.resolve(this.sqliteStmt.run(...params));
    }

    // For RQLite, use async operation
    const result = await this.rqliteClient!.executeAsync(this.sql, params);
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

  async get(...params: any[]): Promise<any> {
    if (this.sqliteStmt) {
      return Promise.resolve(this.sqliteStmt.get(...params));
    }

    const result = await this.rqliteClient!.queryAsync(this.sql, params);
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
    firstResult.columns?.forEach((col: string, i: number) => {
      row[col] = firstResult.values![0][i];
    });
    return row;
  }

  async all(...params: any[]): Promise<any[]> {
    if (this.sqliteStmt) {
      return Promise.resolve(this.sqliteStmt.all(...params));
    }

    const result = await this.rqliteClient!.queryAsync(this.sql, params);
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

    return firstResult.values.map((row: any[]) => {
      const obj: any = {};
      firstResult.columns?.forEach((col: string, i: number) => {
        obj[col] = row[i];
      });
      return obj;
    });
  }

  async iterate(...params: any[]): Promise<AsyncIterableIterator<any>> {
    if (this.sqliteStmt) {
      const results = this.sqliteStmt.all(...params);
      return (async function* () {
        for (const row of results) {
          yield row;
        }
      })();
    }

    const rows = await this.all(...params);
    return (async function* () {
      for (const row of rows) {
        yield row;
      }
    })();
  }

  async pluck(toggleState?: boolean): Promise<this> {
    if (this.sqliteStmt && typeof this.sqliteStmt.pluck === 'function') {
      this.sqliteStmt.pluck(toggleState);
    }
    return this;
  }

  async expand(toggleState?: boolean): Promise<this> {
    if (this.sqliteStmt && typeof this.sqliteStmt.expand === 'function') {
      this.sqliteStmt.expand(toggleState);
    }
    return this;
  }

  async raw(toggleState?: boolean): Promise<this> {
    if (this.sqliteStmt && typeof this.sqliteStmt.raw === 'function') {
      this.sqliteStmt.raw(toggleState);
    }
    return this;
  }

  async columns(): Promise<ColumnDefinition[] | undefined> {
    if (this.sqliteStmt && typeof this.sqliteStmt.columns === 'function') {
      return Promise.resolve(this.sqliteStmt.columns());
    }
    return undefined;
  }

  async bind(...params: any[]): Promise<this> {
    if (this.sqliteStmt && typeof this.sqliteStmt.bind === 'function') {
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

export class AsyncDatabase {
  private sqliteDb?: SqliteDriver;
  private rqliteClient?: RqliteDriver;
  private options: DatabaseOptions;
  private driversPromise?: Promise<any>;

  constructor(filename: string, options: DatabaseOptions = {}) {
    this.options = options;

    // Initialize drivers asynchronously
    this.driversPromise = this.initialize(filename, options);
  }

  private async initialize(filename: string, options: DatabaseOptions) {
    const drivers = await loadDrivers();

    if (filename.startsWith('http://') || filename.startsWith('https://')) {
      this.rqliteClient = drivers.createRqliteDriver(filename);
    } else {
      this.sqliteDb = drivers.createSqliteDriver(filename, options);
    }
  }

  private async ensureInitialized() {
    if (this.driversPromise) {
      await this.driversPromise;
      this.driversPromise = undefined;
    }
  }

  async prepare(sql: string): Promise<AsyncStatement> {
    await this.ensureInitialized();

    if (this.sqliteDb) {
      return new AsyncStatement(this.sqliteDb.prepare(sql));
    }

    const isWrite = /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|BEGIN|COMMIT|ROLLBACK)/i.test(sql);
    return new AsyncStatement({
      client: this.rqliteClient!,
      sql,
      isWrite
    });
  }

  async exec(sql: string): Promise<this> {
    await this.ensureInitialized();

    if (this.sqliteDb) {
      this.sqliteDb.exec(sql);
      return this;
    }

    const statements = sql.split(';').filter(s => s.trim());
    for (const stmt of statements) {
      if (stmt.trim()) {
        await this.rqliteClient!.executeAsync(stmt);
      }
    }
    return this;
  }

  async transaction<T>(fn: (...args: any[]) => Promise<T>): Promise<(...args: any[]) => Promise<T>> {
    await this.ensureInitialized();

    if (this.sqliteDb) {
      const db = this.sqliteDb;
      return async (...args: any[]) => {
        db.exec('BEGIN');
        try {
          const result = await fn(...args);
          db.exec('COMMIT');
          return result;
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      };
    }

    return async (...args: any[]) => {
      await this.exec('BEGIN');
      try {
        const result = await fn(...args);
        await this.exec('COMMIT');
        return result;
      } catch (error) {
        await this.exec('ROLLBACK');
        throw error;
      }
    };
  }

  async pragma(sql: string, options?: PragmaOptions): Promise<any> {
    await this.ensureInitialized();

    if (this.sqliteDb) {
      return Promise.resolve(this.sqliteDb.pragma(sql, options));
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

    const result = await this.rqliteClient!.queryAsync(query);
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

    return firstResult.values.map((row: any[]) => {
      const obj: any = {};
      firstResult.columns?.forEach((col: string, i: number) => {
        obj[col] = row[i];
      });
      return obj;
    });
  }

  async close(): Promise<this> {
    await this.ensureInitialized();

    if (this.sqliteDb) {
      this.sqliteDb.close();
    }
    return this;
  }

  async getInTransaction(): Promise<boolean> {
    await this.ensureInitialized();

    if (this.sqliteDb) {
      return this.sqliteDb.inTransaction;
    }
    return false;
  }

  async getName(): Promise<string> {
    await this.ensureInitialized();

    if (this.sqliteDb) {
      return this.sqliteDb.name;
    }
    return 'rqlite';
  }

  async getOpen(): Promise<boolean> {
    await this.ensureInitialized();

    if (this.sqliteDb) {
      return this.sqliteDb.open;
    }
    return true;
  }

  async getReadonly(): Promise<boolean> {
    await this.ensureInitialized();

    if (this.sqliteDb) {
      return this.sqliteDb.readonly;
    }
    return false;
  }

  async getMemory(): Promise<boolean> {
    await this.ensureInitialized();

    if (this.sqliteDb) {
      return this.sqliteDb.memory;
    }
    return false;
  }
}

// Export a factory function for creating databases
export async function createDatabase(filename: string, options: DatabaseOptions = {}): Promise<AsyncDatabase> {
  const db = new AsyncDatabase(filename, options);
  // Ensure initialization is complete before returning
  await (db as any).ensureInitialized();
  return db;
}