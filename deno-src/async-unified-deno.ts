/**
 * Unified async database interface for Deno
 * This version has proper .ts extensions for Deno imports
 */

import { detectRuntime } from './runtime.ts';
import { AsyncWriteMutex } from './write-mutex.ts';

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
  rqliteLevel?: 'none' | 'weak' | 'linearizable';
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

  if (runtime === 'deno') {
    // Deno environment
    const { DenoDatabase } = await import('./deno-sqlite.ts');
    const { DenoRqliteClient } = await import('./deno-rqlite-client.ts');

    return {
      createSqliteDriver: (filename: string, options: DatabaseOptions) => {
        return new DenoDatabase(filename, options);
      },
      createRqliteDriver: (url: string) => new DenoRqliteClient(url)
    };
  } else {
    throw new Error('This module is for Deno only. Use async-unified.ts for Node.js');
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
  // Active only for SQLite backends; null for networked backends (rqlite, etc.)
  private writeMutex: AsyncWriteMutex | null = null;

  constructor(filename: string, options: DatabaseOptions = {}) {
    this.options = options;

    // Initialize drivers asynchronously
    this.driversPromise = this.initialize(filename, options);
  }

  private async initialize(filename: string, options: DatabaseOptions) {
    const drivers = await loadDrivers();

    if (filename.startsWith('http://') || filename.startsWith('https://')) {
      this.rqliteClient = drivers.createRqliteDriver(filename);
      // Networked backends handle their own concurrency — no mutex needed.
    } else {
      this.sqliteDb = drivers.createSqliteDriver(filename, options);
      // SQLite is single-connection; serialize writes to prevent interleaving.
      this.writeMutex = new AsyncWriteMutex();
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
      const run = () => { this.sqliteDb!.exec(sql); return Promise.resolve(this); };
      return this.writeMutex ? this.writeMutex.serialize(run) : run();
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
      // Inner wrapper runs the full BEGIN…fn…COMMIT/ROLLBACK sequence.
      const inner = async (...args: any[]) => {
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
      // Hold the write mutex for the entire transaction so concurrent transactions
      // cannot interleave their BEGIN/COMMIT with each other's async work.
      if (!this.writeMutex) return inner;
      const mutex = this.writeMutex;
      return async (...args: any[]) => mutex.serialize(() => inner(...args));
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
      const run = () => Promise.resolve(this.sqliteDb!.pragma(sql, options));
      return this.writeMutex ? this.writeMutex.serialize(run) : run();
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

  async upsert(
    table: string,
    cols: string[],
    values: unknown[],
    conflictCols: string[],
    updateCols: string[],
  ): Promise<{ changes: number; lastInsertRowid: number | bigint; created: boolean }> {
    await this.ensureInitialized();
    const whereClause = conflictCols.map(c => `${c} = ?`).join(' AND ');
    const conflictValues = conflictCols.map(c => values[cols.indexOf(c)]);
    const existStmt = await this.prepare(
      `SELECT 1 FROM ${table} WHERE ${whereClause} LIMIT 1`,
    );
    const existing = await existStmt.get(...conflictValues);
    const created = existing == null;
    const placeholders = cols.map(() => '?').join(', ');
    const onConflict = updateCols.length > 0
      ? `ON CONFLICT(${conflictCols.join(', ')}) DO UPDATE SET ${updateCols.map(c => `${c}=excluded.${c}`).join(', ')}`
      : `ON CONFLICT(${conflictCols.join(', ')}) DO NOTHING`;
    const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders}) ${onConflict}`;
    const stmt = await this.prepare(sql);
    const result = await stmt.run(...values);
    return { ...result, created };
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

  /**
   * Dialect-neutral schema introspection.
   * Use this instead of raw PRAGMA calls — works regardless of the underlying driver.
   */
  readonly introspect = {
    tableExists: async (table: string): Promise<boolean> => {
      await this.ensureInitialized();
      const stmt = await this.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
      );
      const row = await stmt.get(table);
      return row != null;
    },

    getColumns: async (table: string): Promise<{
      name: string; type: string; nullable: boolean; default: any; primaryKey: boolean;
    }[]> => {
      await this.ensureInitialized();
      const stmt = await this.prepare(`PRAGMA table_info(${table})`);
      const rows = await stmt.all();
      return rows.map((r: any) => ({
        name: r.name,
        type: (r.type || '').toUpperCase(),
        nullable: r.notnull === 0 || r.notnull === false,
        default: r.dflt_value ?? null,
        primaryKey: r.pk === 1 || r.pk === true,
      }));
    },

    getIndexes: async (table: string): Promise<{
      name: string; unique: boolean; columns: string[]; sql?: string;
    }[]> => {
      await this.ensureInitialized();
      const listStmt = await this.prepare(`PRAGMA index_list(${table})`);
      const indexList = await listStmt.all();
      const result = [];
      for (const idx of indexList) {
        const infoStmt = await this.prepare(`PRAGMA index_info(${idx.name})`);
        const cols = await infoStmt.all();
        const masterStmt = await this.prepare(
          `SELECT sql FROM sqlite_master WHERE type='index' AND name=?`
        );
        const masterRow = await masterStmt.get(idx.name);
        result.push({
          name: idx.name,
          unique: idx.unique === 1 || idx.unique === true,
          columns: cols.map((c: any) => c.name),
          sql: masterRow?.sql ?? undefined,
        });
      }
      return result;
    },

    getForeignKeys: async (table: string): Promise<{
      column: string; refTable: string; refColumn: string;
    }[]> => {
      await this.ensureInitialized();
      const stmt = await this.prepare(`PRAGMA foreign_key_list(${table})`);
      const rows = await stmt.all();
      return rows.map((r: any) => ({
        column: r.from,
        refTable: r.table,
        refColumn: r.to,
      }));
    },

    getDatabaseVersion: async (): Promise<string> => {
      await this.ensureInitialized();
      const stmt = await this.prepare(`SELECT sqlite_version() AS v`);
      const row = await stmt.get();
      return row?.v ?? 'unknown';
    },
  };
}

// Export a factory function for creating databases
export async function createDatabase(filename: string, options: DatabaseOptions = {}): Promise<AsyncDatabase> {
  const db = new AsyncDatabase(filename, options);
  // Ensure initialization is complete before returning
  await (db as any).ensureInitialized();
  return db;
}