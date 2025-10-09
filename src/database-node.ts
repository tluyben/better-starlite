/**
 * Node.js-specific database implementation
 * This file is loaded only in Node.js environments
 */

import { NodeDatabase, NodeStatement } from './drivers/node-sqlite';
import { NodeRqliteClient } from './drivers/node-rqlite-client';

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

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export class Statement {
  private sqliteStmt?: NodeStatement;
  private rqliteClient?: NodeRqliteClient;
  private sql: string;
  private isWrite: boolean;

  constructor(stmt: NodeStatement | { client: NodeRqliteClient; sql: string; isWrite: boolean }) {
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

  run(...params: any[]): RunResult {
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

  columns(): any[] | undefined {
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

export class Database {
  private sqliteDb?: NodeDatabase;
  private rqliteClient?: NodeRqliteClient;
  private options: DatabaseOptions;

  constructor(filename: string, options: DatabaseOptions = {}) {
    this.options = options;

    if (filename.startsWith('http://') || filename.startsWith('https://')) {
      // Initialize RQLite client
      this.rqliteClient = new NodeRqliteClient(filename);
    } else {
      // Initialize SQLite database
      this.sqliteDb = new NodeDatabase(filename, options);
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

  pragma(sql: string, options?: any): any {
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
      return this.sqliteDb.backup(destination);
    }
    throw new Error('Backup not supported for rqlite connections');
  }

  function(name: string, fn: (...args: any[]) => any): this;
  function(name: string, options: any, fn: (...args: any[]) => any): this;
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

  aggregate(name: string, options: any): this {
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

export default Database;