import BetterSqlite3 from 'better-sqlite3';
import { RqliteClient } from './rqlite-client';
import { DatabaseOptions } from './index';
import { MySQLAsyncDatabase } from './drivers/mysql-async-driver';
import { PostgreSQLAsyncDatabase } from './drivers/postgresql-async-driver';
import { DatabaseInterface } from './drivers/driver-interface';

export class AsyncStatement {
  private sqliteStmt?: BetterSqlite3.Statement;
  private rqliteClient?: RqliteClient;
  private mysqlStmt?: any;
  private postgresqlStmt?: any;
  private sql: string;
  private isWrite: boolean;

  constructor(stmt: BetterSqlite3.Statement | { client: RqliteClient; sql: string; isWrite: boolean } | { type: 'mysql' | 'postgresql'; stmt: any }) {
    if ('type' in stmt) {
      // MySQL or PostgreSQL statement
      if (stmt.type === 'mysql') {
        this.mysqlStmt = stmt.stmt;
      } else {
        this.postgresqlStmt = stmt.stmt;
      }
      this.sql = stmt.stmt.source;
      this.isWrite = !stmt.stmt.reader;
    } else if ('client' in stmt) {
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

    if (this.mysqlStmt) {
      return await this.mysqlStmt.runAsync(...params);
    }

    if (this.postgresqlStmt) {
      return await this.postgresqlStmt.runAsync(...params);
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

    if (this.mysqlStmt) {
      return await this.mysqlStmt.getAsync(...params);
    }

    if (this.postgresqlStmt) {
      return await this.postgresqlStmt.getAsync(...params);
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

    if (this.mysqlStmt) {
      return await this.mysqlStmt.allAsync(...params);
    }

    if (this.postgresqlStmt) {
      return await this.postgresqlStmt.allAsync(...params);
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
  private mysqlDb?: DatabaseInterface;
  private postgresqlDb?: DatabaseInterface;
  private options: DatabaseOptions;
  private dbType: 'sqlite' | 'rqlite' | 'mysql' | 'postgresql' = 'sqlite';

  constructor(filename: string, options: DatabaseOptions = {}) {
    this.options = options;

    if (filename.startsWith('mysql://')) {
      this.dbType = 'mysql';
      // Convert DatabaseOptions to DriverOptions
      const driverOptions = {
        ...options,
        verbose: typeof options.verbose === 'function' ? false : options.verbose
      };
      this.mysqlDb = new MySQLAsyncDatabase(filename, driverOptions as any);
    } else if (filename.startsWith('postgresql://') || filename.startsWith('postgres://')) {
      this.dbType = 'postgresql';
      // Convert DatabaseOptions to DriverOptions
      const driverOptions = {
        ...options,
        verbose: typeof options.verbose === 'function' ? false : options.verbose
      };
      this.postgresqlDb = new PostgreSQLAsyncDatabase(filename, driverOptions as any);
    } else if (filename.startsWith('http://') || filename.startsWith('https://')) {
      this.dbType = 'rqlite';
      this.rqliteClient = new RqliteClient(filename);
    } else {
      this.dbType = 'sqlite';
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

    if (this.mysqlDb) {
      const stmt = this.mysqlDb.prepare(sql);
      return new AsyncStatement({ type: 'mysql', stmt });
    }

    if (this.postgresqlDb) {
      const stmt = this.postgresqlDb.prepare(sql);
      return new AsyncStatement({ type: 'postgresql', stmt });
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

    if (this.mysqlDb) {
      await this.mysqlDb.execAsync!(sql);
      return this;
    }

    if (this.postgresqlDb) {
      await this.postgresqlDb.execAsync!(sql);
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

    if (this.mysqlDb) {
      return await this.mysqlDb.transactionAsync!(fn);
    }

    if (this.postgresqlDb) {
      return await this.postgresqlDb.transactionAsync!(fn);
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

    if (this.mysqlDb) {
      await this.mysqlDb.closeAsync!();
    }

    if (this.postgresqlDb) {
      await this.postgresqlDb.closeAsync!();
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
    if (this.mysqlDb) {
      return this.mysqlDb.inTransaction;
    }
    if (this.postgresqlDb) {
      return this.postgresqlDb.inTransaction;
    }
    return false;
  }

  get name(): string {
    if (this.sqliteDb) {
      return this.sqliteDb.name;
    }
    if (this.mysqlDb) {
      return this.mysqlDb.name;
    }
    if (this.postgresqlDb) {
      return this.postgresqlDb.name;
    }
    return 'rqlite';
  }

  get open(): boolean {
    if (this.sqliteDb) {
      return this.sqliteDb.open;
    }
    if (this.mysqlDb) {
      return this.mysqlDb.open;
    }
    if (this.postgresqlDb) {
      return this.postgresqlDb.open;
    }
    return true;
  }

  get readonly(): boolean {
    if (this.sqliteDb) {
      return this.sqliteDb.readonly;
    }
    if (this.mysqlDb) {
      return this.mysqlDb.readonly;
    }
    if (this.postgresqlDb) {
      return this.postgresqlDb.readonly;
    }
    return false;
  }

  get memory(): boolean {
    if (this.sqliteDb) {
      return this.sqliteDb.memory;
    }
    if (this.mysqlDb) {
      return this.mysqlDb.memory;
    }
    if (this.postgresqlDb) {
      return this.postgresqlDb.memory;
    }
    return false;
  }
}