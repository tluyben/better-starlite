/**
 * MySQL Async Driver for Better-Starlite
 *
 * Wraps the 'mysql2/promise' Node.js MySQL client and provides SQLite-compatible interface
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

/**
 * MySQL Statement implementation (async)
 */
class MySQLAsyncStatement implements StatementInterface {
  private sql: string;
  private connection: any;
  private database: any;
  private boundParams: any[] = [];
  private isPluck: boolean = false;
  private isRaw: boolean = false;
  private queryRewriter: any;
  private schemaRewriter: any;

  constructor(database: any, connection: any, sql: string, queryRewriter?: any, schemaRewriter?: any) {
    this.database = database;
    this.connection = connection;
    this.sql = sql;
    this.queryRewriter = queryRewriter;
    this.schemaRewriter = schemaRewriter;
  }

  private rewriteSQL(sql: string): string {
    // Apply schema rewriting for DDL
    if (this.schemaRewriter && /^\s*(CREATE|ALTER|DROP)/i.test(sql)) {
      return this.schemaRewriter.rewriteSchema(sql);
    }

    // Apply query rewriting for DML
    if (this.queryRewriter && this.queryRewriter.needsRewrite(sql)) {
      return this.queryRewriter.rewriteQuery(sql);
    }

    return sql;
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
    // MySQL doesn't provide column info without executing
    return undefined;
  }

  get source(): string {
    return this.sql;
  }

  get reader(): boolean {
    return /^\s*(SELECT|SHOW|DESCRIBE|EXPLAIN)/i.test(this.sql);
  }

  // Async methods (these are what actually get called)
  async runAsync(...params: any[]): Promise<RunResult> {
    // Wait for connection to be initialized
    await this.database.initPromise;

    const actualParams = params.length > 0 ? params : this.boundParams;
    const rewrittenSQL = this.rewriteSQL(this.sql);

    try {
      const [result]: any = await this.connection.execute(rewrittenSQL, actualParams);

      return {
        changes: result.affectedRows || 0,
        lastInsertRowid: result.insertId || 0
      };
    } catch (error: any) {
      throw new Error(`MySQL query error: ${error.message}`);
    }
  }

  async getAsync(...params: any[]): Promise<any> {
    // Wait for connection to be initialized
    await this.database.initPromise;

    const actualParams = params.length > 0 ? params : this.boundParams;
    const rewrittenSQL = this.rewriteSQL(this.sql);

    try {
      const [rows]: any = await this.connection.execute(rewrittenSQL, actualParams);

      if (rows.length === 0) {
        return undefined;
      }

      const row = rows[0];

      if (this.isPluck) {
        const firstKey = Object.keys(row)[0];
        return row[firstKey];
      }

      if (this.isRaw) {
        return Object.values(row);
      }

      return row;
    } catch (error: any) {
      throw new Error(`MySQL query error: ${error.message}`);
    }
  }

  async allAsync(...params: any[]): Promise<any[]> {
    // Wait for connection to be initialized
    await this.database.initPromise;

    const actualParams = params.length > 0 ? params : this.boundParams;
    let rewrittenSQL = this.rewriteSQL(this.sql);

    try {
      // Ensure actualParams is an array
      let paramsArray = Array.isArray(actualParams) ? actualParams : [];

      // MySQL doesn't support ? placeholders in LIMIT/OFFSET with prepared statements
      // We need to inline these values
      if (rewrittenSQL.match(/\sLIMIT\s+\?/i)) {
        if (rewrittenSQL.match(/\sOFFSET\s+\?/i)) {
          // LIMIT ? OFFSET ?
          const limit = paramsArray[paramsArray.length - 2];
          const offset = paramsArray[paramsArray.length - 1];
          rewrittenSQL = rewrittenSQL.replace(/\sLIMIT\s+\?/i, ` LIMIT ${limit}`);
          rewrittenSQL = rewrittenSQL.replace(/\sOFFSET\s+\?/i, ` OFFSET ${offset}`);
          paramsArray = paramsArray.slice(0, -2);
        } else {
          // LIMIT ? only
          const limit = paramsArray[paramsArray.length - 1];
          rewrittenSQL = rewrittenSQL.replace(/\sLIMIT\s+\?/i, ` LIMIT ${limit}`);
          paramsArray = paramsArray.slice(0, -1);
        }
      }

      const [result]: any = await this.connection.execute(rewrittenSQL, paramsArray);

      // Check if this was a query with RETURNING clause that needs emulation
      // Only check if the ORIGINAL query had RETURNING
      const hadReturning = this.sql.toLowerCase().includes('returning');
      const hasReturning = hadReturning && this.queryRewriter && this.queryRewriter.lastReturningInfo;

      // If this was an INSERT/UPDATE/DELETE with RETURNING, emulate it
      if (hasReturning) {
        const { table, columns } = this.queryRewriter.lastReturningInfo;
        // Clear the returning info so it doesn't affect subsequent queries
        this.queryRewriter.lastReturningInfo = null;

        // For INSERT: use LAST_INSERT_ID() to get the inserted rows
        if (this.sql.trim().toLowerCase().startsWith('insert')) {
          const insertId = result.insertId;
          const affectedRows = result.affectedRows || 0;

          if (insertId && affectedRows > 0) {
            // Build SELECT query to fetch the inserted rows
            // Wrap column names in backticks
            const columnList = columns.map((col: string) => `\`${col}\``).join(', ');
            const selectSQL = `SELECT ${columnList} FROM \`${table}\` WHERE \`id\` >= ${insertId} LIMIT ${affectedRows}`;
            const [rows]: any = await this.connection.execute(selectSQL, []);
            return rows;
          }
        }

        // For UPDATE/DELETE: would need to capture rows before modification (not implemented yet)
        return [];
      }

      // Regular SELECT query
      const rows = result;

      if (this.isPluck) {
        return rows.map((row: any) => {
          const firstKey = Object.keys(row)[0];
          return row[firstKey];
        });
      }

      if (this.isRaw) {
        return rows.map((row: any) => Object.values(row));
      }

      return rows;
    } catch (error: any) {
      throw new Error(`MySQL query error: ${error.message}`);
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
 * MySQL Database implementation (async)
 */
class MySQLAsyncDatabase implements DatabaseInterface {
  private connection: any;
  private pool: any;
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
      throw new Error('MySQL driver requires Node.js with require() support');
    }

    const mysql = require('mysql2/promise');

    // Parse connection string
    // Format: mysql://user:password@host:port/database
    const match = connectionString.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
    if (!match) {
      throw new Error('Invalid MySQL connection string. Format: mysql://user:password@host:port/database');
    }

    const [, user, password, host, port, database] = match;

    this.pool = mysql.createPool({
      host,
      port: parseInt(port),
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    this.connection = await this.pool.getConnection();
  }

  prepare(sql: string): StatementInterface {
    if (!this.isOpen) {
      throw new Error('Database is closed');
    }

    // Note: prepare() is synchronous but returns a statement that will await initialization in its async methods
    return new MySQLAsyncStatement(this, this.connection, sql, this.queryRewriter, this.schemaRewriter);
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
    if (this.schemaRewriter && /^\s*(CREATE|ALTER|DROP)/i.test(sql)) {
      finalSQL = this.schemaRewriter.rewriteSchema(sql);
    }

    try {
      await this.connection.execute(finalSQL);
    } catch (error: any) {
      throw new Error(`MySQL exec error: ${error.message}`);
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
      await this.connection.beginTransaction();
      this.inTrans = true;

      try {
        const result = await fn(...args);
        await this.connection.commit();
        this.inTrans = false;
        return result;
      } catch (error) {
        await this.connection.rollback();
        this.inTrans = false;
        throw error;
      }
    };
  }

  pragma(sql: string, options?: PragmaOptions): any {
    console.warn('PRAGMA is SQLite-specific. Not supported in MySQL.');
    return undefined;
  }

  async pragmaAsync(sql: string, options?: PragmaOptions): Promise<any> {
    console.warn('PRAGMA is SQLite-specific. Not supported in MySQL.');
    return undefined;
  }

  function(name: string, fn: (...args: any[]) => any): this;
  function(name: string, options: any, fn: (...args: any[]) => any): this;
  function(name: string, optionsOrFn: any, maybeFn?: any): this {
    console.warn('Custom functions are not supported in this MySQL driver implementation.');
    return this;
  }

  aggregate(name: string, options: any): this {
    console.warn('Custom aggregates are not supported in this MySQL driver implementation.');
    return this;
  }

  loadExtension(path: string): this {
    console.warn('Extensions are loaded differently in MySQL.');
    return this;
  }

  close(): this {
    throw new Error('Use async API: await db.close()');
  }

  async closeAsync(): Promise<this> {
    if (this.isOpen && this.connection) {
      this.connection.release();
      await this.pool.end();
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
    return 'mysql';
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
 * MySQL Driver Factory
 */
export class MySQLAsyncDriver implements DriverFactory {
  readonly name = 'mysql-async';

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
      require.resolve('mysql2/promise');
      return true;
    } catch {
      return false;
    }
  }

  createDatabase(connectionString: string, options: DriverOptions = {}): DatabaseInterface {
    if (!this.isAvailable()) {
      throw new Error('MySQL driver is not available. Install mysql2: npm install mysql2');
    }

    return new MySQLAsyncDatabase(connectionString, options);
  }
}

/**
 * Factory function to create MySQL async driver
 */
export function createMySQLAsyncDriver(): MySQLAsyncDriver {
  return new MySQLAsyncDriver();
}

// Export the statement and database classes for use by AsyncDatabase
export { MySQLAsyncStatement, MySQLAsyncDatabase };
