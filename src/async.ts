import BetterSqlite3 from 'better-sqlite3';
import { RqliteClient } from './rqlite-client';
import { DatabaseOptions } from './index';

export class AsyncStatement {
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

  async run(...params: any[]): Promise<BetterSqlite3.RunResult> {
    if (this.sqliteStmt) {
      return Promise.resolve(this.sqliteStmt.run(...params));
    }

    return new Promise((resolve, reject) => {
      try {
        this.rqliteClient!.executeAsync(this.sql, params).then(result => {
          if (result.error) {
            reject(new Error(result.error));
            return;
          }

          const firstResult = result.results?.[0];
          if (firstResult?.error) {
            reject(new Error(firstResult.error));
            return;
          }

          resolve({
            changes: firstResult?.rows_affected || 0,
            lastInsertRowid: firstResult?.last_insert_id || 0
          });
        }).catch(reject);
      } catch (error) {
        reject(error);
      }
    });
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
    firstResult.columns?.forEach((col, i) => {
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

    return firstResult.values.map(row => {
      const obj: any = {};
      firstResult.columns?.forEach((col, i) => {
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
    if (this.sqliteStmt) {
      this.sqliteStmt.pluck(toggleState);
    }
    return this;
  }

  async expand(toggleState?: boolean): Promise<this> {
    if (this.sqliteStmt) {
      this.sqliteStmt.expand(toggleState);
    }
    return this;
  }

  async raw(toggleState?: boolean): Promise<this> {
    if (this.sqliteStmt) {
      this.sqliteStmt.raw(toggleState);
    }
    return this;
  }

  async columns(): Promise<BetterSqlite3.ColumnDefinition[] | undefined> {
    if (this.sqliteStmt) {
      return Promise.resolve(this.sqliteStmt.columns());
    }
    return undefined;
  }

  async bind(...params: any[]): Promise<this> {
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

export class AsyncDatabase {
  private sqliteDb?: BetterSqlite3.Database;
  private rqliteClient?: RqliteClient;
  private options: DatabaseOptions;

  constructor(filename: string, options: DatabaseOptions = {}) {
    this.options = options;

    if (filename.startsWith('http://') || filename.startsWith('https://')) {
      this.rqliteClient = new RqliteClient(filename);
    } else {
      this.sqliteDb = new BetterSqlite3(filename, options);

      if (!options.disableWAL && filename !== ':memory:') {
        try {
          this.sqliteDb.pragma('journal_mode = WAL');
        } catch (e) {
          console.warn('Failed to enable WAL mode:', e);
        }
      }
    }
  }

  async prepare(sql: string): Promise<AsyncStatement> {
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
    if (this.sqliteDb) {
      const db = this.sqliteDb;
      return async (...args: any[]) => {
        return new Promise<T>((resolve, reject) => {
          db.exec('BEGIN');
          fn(...args)
            .then(result => {
              db.exec('COMMIT');
              resolve(result);
            })
            .catch(error => {
              db.exec('ROLLBACK');
              reject(error);
            });
        });
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

  async pragma(sql: string, options?: BetterSqlite3.PragmaOptions): Promise<any> {
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

    return firstResult.values.map(row => {
      const obj: any = {};
      firstResult.columns?.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj;
    });
  }

  async backup(destination: string): Promise<Buffer> {
    if (this.sqliteDb) {
      const result = this.sqliteDb.backup(destination);
      return Promise.resolve(result as any as Buffer);
    }
    throw new Error('Backup not supported for rqlite connections');
  }

  async function(name: string, fn: (...args: any[]) => any): Promise<this>;
  async function(name: string, options: BetterSqlite3.RegistrationOptions, fn: (...args: any[]) => any): Promise<this>;
  async function(name: string, optionsOrFn: any, maybeFn?: any): Promise<this> {
    if (this.sqliteDb) {
      if (typeof optionsOrFn === 'function') {
        this.sqliteDb.function(name, optionsOrFn);
      } else {
        this.sqliteDb.function(name, optionsOrFn, maybeFn);
      }
    }
    return this;
  }

  async aggregate(name: string, options: BetterSqlite3.AggregateOptions): Promise<this> {
    if (this.sqliteDb) {
      this.sqliteDb.aggregate(name, options);
    }
    return this;
  }

  async loadExtension(path: string): Promise<this> {
    if (this.sqliteDb) {
      this.sqliteDb.loadExtension(path);
    }
    return this;
  }

  async close(): Promise<this> {
    if (this.sqliteDb) {
      this.sqliteDb.close();
    }
    return this;
  }

  async defaultSafeIntegers(toggleState?: boolean): Promise<this> {
    if (this.sqliteDb) {
      this.sqliteDb.defaultSafeIntegers(toggleState);
    }
    return this;
  }

  async unsafeMode(toggleState?: boolean): Promise<this> {
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