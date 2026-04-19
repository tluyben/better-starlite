/**
 * Unified async database interface for Deno
 * This version has proper .ts extensions for Deno imports
 */

import { detectRuntime } from './runtime.ts';
import { AsyncWriteMutex } from './write-mutex.ts';
import { FlexDbClient, parseFlexDbUrl } from './flexdb-client-deno.ts';
import type { ConsistencyMode, FlexDbClientOptions } from './flexdb-client-deno.ts';

// Types that work across both environments
export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export type { ConsistencyMode } from './flexdb-client-deno.ts';
export type FlexDbFeature = 'per-table-consistency' | 'native-search' | 'transactions' | 'backup' | 'analytics' | 'cluster-nodes';

export interface DatabaseOptions {
  readonly?: boolean;
  fileMustExist?: boolean;
  timeout?: number;
  verbose?: typeof console.log | ((message?: any, ...additionalArgs: any[]) => void);
  nativeBinding?: string;
  disableWAL?: boolean;
  rqliteLevel?: 'none' | 'weak' | 'linearizable';
  /** FlexDB-specific options. Ignored by all other drivers. */
  flexdb?: FlexDbClientOptions;
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
  private flexdbClient?: FlexDbClient;
  private sql: string;
  private isWrite: boolean;

  constructor(
    stmt:
      | any
      | { client: RqliteDriver; sql: string; isWrite: boolean }
      | { flexdb: FlexDbClient; sql: string; isWrite: boolean },
  ) {
    if ('flexdb' in stmt) {
      this.flexdbClient = stmt.flexdb;
      this.sql = stmt.sql;
      this.isWrite = stmt.isWrite;
    } else if ('client' in stmt) {
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
      return Promise.resolve(this.sqliteStmt.run(...params));
    }

    if (this.flexdbClient) {
      const r = await this.flexdbClient.query(this.sql, params);
      return {
        changes: Number(r.rows_affected),
        lastInsertRowid: r.last_insert_id ?? 0,
      };
    }

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

    if (this.flexdbClient) {
      const r = await this.flexdbClient.query(this.sql, params);
      if (!r.rows || r.rows.length === 0) return undefined;
      const obj: any = {};
      r.columns.forEach((col, i) => { obj[col] = r.rows![0][i]; });
      return obj;
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

    if (this.flexdbClient) {
      const r = await this.flexdbClient.query(this.sql, params);
      if (!r.rows || r.rows.length === 0) return [];
      return r.rows.map(row => {
        const obj: any = {};
        r.columns.forEach((col, i) => { obj[col] = row[i]; });
        return obj;
      });
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
  private flexdbClient?: FlexDbClient;
  private flexdbMutex?: AsyncWriteMutex;
  private options: DatabaseOptions;
  private driversPromise?: Promise<any>;
  private writeMutex: AsyncWriteMutex | null = null;

  constructor(filename: string, options: DatabaseOptions = {}) {
    this.options = options;
    this.driversPromise = this.initialize(filename, options);
  }

  private async initialize(filename: string, options: DatabaseOptions) {
    // FlexDB — must be checked before the generic http:// check
    if (filename.startsWith('flexdb://')) {
      const nodes = parseFlexDbUrl(filename);
      this.flexdbClient = new FlexDbClient(nodes, options.flexdb ?? {});
      this.flexdbMutex = new AsyncWriteMutex();
      if (options.flexdb?.tableModes) {
        await this.flexdbClient.applyTableModes(options.flexdb.tableModes);
      }
      return;
    }

    const drivers = await loadDrivers();

    if (filename.startsWith('http://') || filename.startsWith('https://')) {
      this.rqliteClient = drivers.createRqliteDriver(filename);
    } else {
      this.sqliteDb = drivers.createSqliteDriver(filename, options);
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

    if (this.flexdbClient) {
      return new AsyncStatement({ flexdb: this.flexdbClient, sql, isWrite });
    }

    return new AsyncStatement({ client: this.rqliteClient!, sql, isWrite });
  }

  async exec(sql: string): Promise<this> {
    await this.ensureInitialized();

    if (this.sqliteDb) {
      const run = () => { this.sqliteDb!.exec(sql); return Promise.resolve(this); };
      return this.writeMutex ? this.writeMutex.serialize(run) : run();
    }

    if (this.flexdbClient) {
      const statements = sql.split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .map(s => ({ sql: s }));
      if (statements.length > 0) {
        await this.flexdbClient.queryBatch(statements);
      }
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
      if (!this.writeMutex) return inner;
      const mutex = this.writeMutex;
      return async (...args: any[]) => mutex.serialize(() => inner(...args));
    }

    if (this.flexdbClient) {
      const client = this.flexdbClient;
      const mutex = this.flexdbMutex!;
      return async (...args: any[]) =>
        mutex.serialize(async () => {
          const txnId = await client.beginTransaction();
          client.setActiveTxnId(txnId);
          try {
            const result = await fn(...args);
            await client.commitTransaction(txnId);
            return result;
          } catch (error) {
            await client.rollbackTransaction(txnId).catch(() => {});
            throw error;
          } finally {
            client.setActiveTxnId(undefined);
          }
        });
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

    // FlexDB: silently ignore all PRAGMA calls
    if (this.flexdbClient) {
      return options?.simple ? undefined : [];
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

  async backup(destination: string): Promise<void> {
    await this.ensureInitialized();

    if (this.sqliteDb) {
      await (this.sqliteDb as any).backup?.(destination);
      return;
    }

    if (this.flexdbClient) {
      const bytes = await this.flexdbClient.snapshot();
      await Deno.writeFile(destination, bytes);
      return;
    }

    throw new Error('backup() is not supported for this driver');
  }

  supportsFeature(feature: FlexDbFeature): boolean {
    if (!this.flexdbClient) return false;
    switch (feature) {
      case 'per-table-consistency': return true;
      case 'native-search':         return true;
      case 'transactions':          return true;
      case 'backup':                return true;
      case 'analytics':             return true;
      case 'cluster-nodes':         return true;
      default:                      return false;
    }
  }

  async enableSearch(table: string, columns: string[]): Promise<void> {
    await this.ensureInitialized();
    this._requireFlexDb('enableSearch');
    await this.flexdbClient!.enableSearch(table, columns);
  }

  async disableSearch(table: string): Promise<void> {
    await this.ensureInitialized();
    this._requireFlexDb('disableSearch');
    await this.flexdbClient!.disableSearch(table);
  }

  async getSearchConfig(table: string): Promise<string[]> {
    await this.ensureInitialized();
    this._requireFlexDb('getSearchConfig');
    return this.flexdbClient!.getSearchConfig(table);
  }

  async search(table: string, query: string, limit = 20): Promise<any[]> {
    await this.ensureInitialized();
    this._requireFlexDb('search');
    return this.flexdbClient!.search(table, query, limit);
  }

  async setTableMode(table: string, mode: ConsistencyMode): Promise<void> {
    await this.ensureInitialized();
    this._requireFlexDb('setTableMode');
    await this.flexdbClient!.setTableMode(table, mode);
  }

  async getTableMode(table: string): Promise<ConsistencyMode> {
    await this.ensureInitialized();
    this._requireFlexDb('getTableMode');
    return this.flexdbClient!.getTableMode(table);
  }

  // ── Cluster observability ─────────────────────────────────────────────────

  /** List all nodes in the cluster. FlexDB only. */
  async getNodes(): Promise<any> {
    await this.ensureInitialized();
    this._requireFlexDb('getNodes');
    return this.flexdbClient!.getNodes();
  }

  /** Fetch raw Prometheus-format metrics text. FlexDB only. */
  async metrics(): Promise<string> {
    await this.ensureInitialized();
    this._requireFlexDb('metrics');
    return this.flexdbClient!.metrics();
  }

  // ── Analytics ────────────────────────────────────────────────────────────

  /** List all analytical tables. FlexDB only. */
  async listAnalytics(): Promise<any> {
    await this.ensureInitialized();
    this._requireFlexDb('listAnalytics');
    return this.flexdbClient!.listAnalytics();
  }

  /** Get a single analytical table definition. FlexDB only. */
  async getAnalyticsTable(name: string): Promise<any> {
    await this.ensureInitialized();
    this._requireFlexDb('getAnalyticsTable');
    return this.flexdbClient!.getAnalyticsTable(name);
  }

  /** Trigger a rebuild of an analytical table. FlexDB only. */
  async rebuildAnalyticsTable(name: string): Promise<any> {
    await this.ensureInitialized();
    this._requireFlexDb('rebuildAnalyticsTable');
    return this.flexdbClient!.rebuildAnalyticsTable(name);
  }

  private _requireFlexDb(method: string): void {
    if (!this.flexdbClient) {
      throw new Error(
        `${method}() is only supported on FlexDB backends (flexdb:// URL).`,
      );
    }
  }

  async close(): Promise<this> {
    await this.ensureInitialized();

    if (this.sqliteDb) {
      this.sqliteDb.close();
    }
    // FlexDB is a remote server; no local connection to close.
    return this;
  }

  async getInTransaction(): Promise<boolean> {
    await this.ensureInitialized();

    if (this.sqliteDb) {
      return this.sqliteDb.inTransaction;
    }
    if (this.flexdbClient) {
      return this.flexdbClient.getActiveTxnId() !== undefined;
    }
    return false;
  }

  async getName(): Promise<string> {
    await this.ensureInitialized();

    if (this.sqliteDb) {
      return this.sqliteDb.name;
    }
    if (this.flexdbClient) {
      return 'flexdb';
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
      // FlexDB: use the table-valued function form which works via /v1/query.
      if (this.flexdbClient) {
        const stmt = await this.prepare(
          `SELECT name, type, "notnull", dflt_value, pk FROM pragma_table_info(?) ORDER BY cid`,
        );
        const rows = await stmt.all(table);
        return rows.map((r: any) => ({
          name: r.name,
          type: (r.type || '').toUpperCase(),
          nullable: r.notnull === 0 || r.notnull === false,
          default: r.dflt_value ?? null,
          primaryKey: r.pk === 1 || r.pk === true,
        }));
      }
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