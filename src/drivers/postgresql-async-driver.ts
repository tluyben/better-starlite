/**
 * PostgreSQL Async Driver for Better-Starlite
 *
 * Wraps the 'pg' (node-postgres) client and provides SQLite-compatible interface
 * with automatic query/schema rewriting via plugins
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

import { PluginRegistry } from './plugin-interface';
import { SQLErrorLogger } from '../utils/sql-error-logger';

/**
 * PostgreSQL Statement implementation (async)
 */
class PostgreSQLAsyncStatement implements StatementInterface {
  private sql: string;
  private client: any;
  private boundParams: any[] = [];
  private isPluck: boolean = false;
  private isRaw: boolean = false;
  private queryRewriter: any;
  private schemaRewriter: any;

  constructor(client: any, sql: string, queryRewriter?: any, schemaRewriter?: any) {
    this.client = client;
    this.sql = sql;
    this.queryRewriter = queryRewriter;
    this.schemaRewriter = schemaRewriter;
  }

  private rewriteSQL(sql: string): string {
    try {
      let rewritten = sql;

      // Apply schema rewriting for DDL
      if (this.schemaRewriter && /^\s*(CREATE|ALTER|DROP)/i.test(sql)) {
        rewritten = this.schemaRewriter.rewriteSchema(sql);
      }

      // Apply query rewriting for DML
      if (this.queryRewriter && this.queryRewriter.needsRewrite(sql)) {
        rewritten = this.queryRewriter.rewriteQuery(sql);
      }

      // Convert ? placeholders to PostgreSQL $1, $2, etc.
      let placeholderIndex = 0;
      rewritten = rewritten.replace(/\?/g, () => {
        placeholderIndex++;
        return `$${placeholderIndex}`;
      });

      return rewritten;
    } catch (error: any) {
      // Log the translation error
      SQLErrorLogger.logTranslationError('postgresql', sql, error);

      // Re-throw the error
      throw new Error(`SQL translation failed: ${error.message}`);
    }
  }

  run(...params: any[]): RunResult {
    throw new Error('Use async API: await stmt.run()');
  }

  get(...params: any[]): any {
    throw new Error('Use async API: await stmt.get()');
  }

  all(...params: any[]): any[] {
    throw new Error('Use async API: await stmt.all()');
  }

  iterate(...params: any[]): IterableIterator<any> {
    throw new Error('Use async API: for await (const row of stmt.iterate())');
  }

  pluck(toggleState: boolean = true): this {
    this.isPluck = toggleState;
    return this;
  }

  expand(toggleState?: boolean): this {
    return this;
  }

  raw(toggleState: boolean = true): this {
    this.isRaw = toggleState;
    return this;
  }

  bind(...params: any[]): this {
    this.boundParams = params;
    return this;
  }

  columns(): ColumnDefinition[] | undefined {
    return undefined;
  }

  get source(): string {
    return this.sql;
  }

  get reader(): boolean {
    return /^\s*(SELECT|WITH|SHOW|EXPLAIN)/i.test(this.sql);
  }

  // Async methods
  async runAsync(...params: any[]): Promise<RunResult> {
    const actualParams = params.length > 0 ? params : this.boundParams;
    let rewrittenSQL: string;

    try {
      rewrittenSQL = this.rewriteSQL(this.sql);
    } catch (error: any) {
      // Translation error already logged in rewriteSQL
      throw error;
    }

    try {
      const result = await this.client.query(rewrittenSQL, actualParams);

      return {
        changes: result.rowCount || 0,
        lastInsertRowid: result.rows[0]?.id || 0
      };
    } catch (error: any) {
      // Log the execution error with both original and rewritten SQL
      SQLErrorLogger.logExecutionError('postgresql', this.sql, rewrittenSQL, error, actualParams);

      throw new Error(`PostgreSQL query error: ${error.message}`);
    }
  }

  async getAsync(...params: any[]): Promise<any> {
    const actualParams = params.length > 0 ? params : this.boundParams;
    let rewrittenSQL: string;

    try {
      rewrittenSQL = this.rewriteSQL(this.sql);
    } catch (error: any) {
      // Translation error already logged in rewriteSQL
      throw error;
    }

    try {
      const result = await this.client.query(rewrittenSQL, actualParams);

      if (result.rows.length === 0) {
        return undefined;
      }

      const row = result.rows[0];

      if (this.isPluck) {
        const firstKey = Object.keys(row)[0];
        return row[firstKey];
      }

      if (this.isRaw) {
        return Object.values(row);
      }

      return row;
    } catch (error: any) {
      // Log the execution error
      SQLErrorLogger.logExecutionError('postgresql', this.sql, rewrittenSQL, error, actualParams);

      throw new Error(`PostgreSQL query error: ${error.message}`);
    }
  }

  async allAsync(...params: any[]): Promise<any[]> {
    const actualParams = params.length > 0 ? params : this.boundParams;
    let rewrittenSQL: string;

    try {
      rewrittenSQL = this.rewriteSQL(this.sql);
    } catch (error: any) {
      // Translation error already logged in rewriteSQL
      throw error;
    }

    try {
      const result = await this.client.query(rewrittenSQL, actualParams);

      if (this.isPluck) {
        return result.rows.map((row: any) => {
          const firstKey = Object.keys(row)[0];
          return row[firstKey];
        });
      }

      if (this.isRaw) {
        return result.rows.map((row: any) => Object.values(row));
      }

      return result.rows;
    } catch (error: any) {
      // Log the execution error
      SQLErrorLogger.logExecutionError('postgresql', this.sql, rewrittenSQL, error, actualParams);

      throw new Error(`PostgreSQL query error: ${error.message}`);
    }
  }

  async *iterateAsync(...params: any[]): AsyncIterableIterator<any> {
    const rows = await this.allAsync(...params);
    for (const row of rows) {
      yield row;
    }
  }
}

/**
 * PostgreSQL Database implementation (async)
 */
class PostgreSQLAsyncDatabase implements DatabaseInterface {
  private client: any;
  private isOpen: boolean = true;
  private options: DriverOptions;
  private inTrans: boolean = false;
  private schemaRewriter: any;
  private queryRewriter: any;
  private initPromise: Promise<void>;

  constructor(connectionString: string, options: DriverOptions) {
    this.options = options;

    // Start initialization immediately and store the promise
    this.initPromise = this.initConnection(connectionString, options);

    // Load plugins if specified
    if (options.schemaRewriter) {
      this.schemaRewriter = PluginRegistry.getSchemaPlugin(options.schemaRewriter);
    }

    if (options.queryRewriter) {
      this.queryRewriter = PluginRegistry.getQueryPlugin(options.queryRewriter);
    }
  }

  private async initConnection(connectionString: string, options: DriverOptions): Promise<void> {
    if (typeof require === 'undefined') {
      throw new Error('PostgreSQL driver requires Node.js with require() support');
    }

    const { Client } = require('pg');
    this.client = new Client({ connectionString });
    await this.client.connect();
  }

  prepare(sql: string): StatementInterface {
    if (!this.isOpen) {
      throw new Error('Database is closed');
    }

    return new PostgreSQLAsyncStatement(this.client, sql, this.queryRewriter, this.schemaRewriter);
  }

  exec(sql: string): this {
    throw new Error('Use async API: await db.exec()');
  }

  async execAsync(sql: string): Promise<this> {
    // Wait for connection to be initialized
    await this.initPromise;

    if (!this.isOpen) {
      throw new Error('Database is closed');
    }

    let finalSQL = sql;

    try {
      if (this.schemaRewriter && /^\s*(CREATE|ALTER|DROP)/i.test(sql)) {
        finalSQL = this.schemaRewriter.rewriteSchema(sql);
      }
    } catch (error: any) {
      // Log translation error
      SQLErrorLogger.logTranslationError('postgresql', sql, error);
      throw new Error(`SQL translation failed: ${error.message}`);
    }

    try {
      await this.client.query(finalSQL);
    } catch (error: any) {
      // Log execution error
      SQLErrorLogger.logExecutionError('postgresql', sql, finalSQL, error);
      throw new Error(`PostgreSQL exec error: ${error.message}`);
    }

    return this;
  }

  transaction(fn: TransactionFunction): TransactionFunction {
    throw new Error('Use async API: await db.transaction()');
  }

  async transactionAsync(fn: TransactionFunction): Promise<TransactionFunction> {
    // Wait for connection to be initialized
    await this.initPromise;

    return async (...args: any[]) => {
      await this.client.query('BEGIN');
      this.inTrans = true;

      try {
        const result = await fn(...args);
        await this.client.query('COMMIT');
        this.inTrans = false;
        return result;
      } catch (error) {
        await this.client.query('ROLLBACK');
        this.inTrans = false;
        throw error;
      }
    };
  }

  pragma(sql: string, options?: PragmaOptions): any {
    console.warn('PRAGMA is SQLite-specific. Not supported in PostgreSQL.');
    return undefined;
  }

  async pragmaAsync(sql: string, options?: PragmaOptions): Promise<any> {
    console.warn('PRAGMA is SQLite-specific. Not supported in PostgreSQL.');
    return undefined;
  }

  function(name: string, fn: (...args: any[]) => any): this;
  function(name: string, options: any, fn: (...args: any[]) => any): this;
  function(name: string, optionsOrFn: any, maybeFn?: any): this {
    console.warn('Custom functions are not supported in this PostgreSQL driver implementation.');
    return this;
  }

  aggregate(name: string, options: any): this {
    console.warn('Custom aggregates are not supported in this PostgreSQL driver implementation.');
    return this;
  }

  loadExtension(path: string): this {
    console.warn('Extensions are loaded differently in PostgreSQL. Use CREATE EXTENSION instead.');
    return this;
  }

  close(): this {
    throw new Error('Use async API: await db.close()');
  }

  async closeAsync(): Promise<this> {
    if (this.isOpen && this.client) {
      await this.client.end();
      this.isOpen = false;
    }
    return this;
  }

  defaultSafeIntegers(toggleState?: boolean): this {
    return this;
  }

  unsafeMode(toggleState?: boolean): this {
    return this;
  }

  get inTransaction(): boolean {
    return this.inTrans;
  }

  get name(): string {
    return 'postgresql';
  }

  get open(): boolean {
    return this.isOpen;
  }

  get readonly(): boolean {
    return this.options.readonly || false;
  }

  get memory(): boolean {
    return false;
  }
}

/**
 * PostgreSQL Driver Factory
 */
export class PostgreSQLAsyncDriver implements DriverFactory {
  readonly name = 'postgresql-async';

  readonly features = {
    backup: false,
    loadExtension: false,
    customFunctions: false,
    customAggregates: false,
    transactions: true,
    wal: false
  };

  isAvailable(): boolean {
    if (typeof process === 'undefined' || !process.versions?.node) {
      return false;
    }

    try {
      require.resolve('pg');
      return true;
    } catch {
      return false;
    }
  }

  createDatabase(connectionString: string, options: DriverOptions = {}): DatabaseInterface {
    if (!this.isAvailable()) {
      throw new Error('PostgreSQL driver is not available. Install pg: npm install pg');
    }

    return new PostgreSQLAsyncDatabase(connectionString, options);
  }
}

/**
 * Factory function to create PostgreSQL async driver
 */
export function createPostgreSQLAsyncDriver(): PostgreSQLAsyncDriver {
  return new PostgreSQLAsyncDriver();
}

// Export the statement and database classes for use by AsyncDatabase
export { PostgreSQLAsyncStatement, PostgreSQLAsyncDatabase };
