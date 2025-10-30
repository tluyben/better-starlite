/**
 * PostgreSQL Driver for Better-Starlite
 *
 * Wraps the 'pg' Node.js PostgreSQL client and provides SQLite-compatible interface
 * with optional query/schema rewriting via plugins
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
 * PostgreSQL Statement implementation
 */
class PostgreSQLStatement implements StatementInterface {
  private sql: string;
  private client: any;
  private boundParams: any[] = [];
  private isPluck: boolean = false;
  private isRaw: boolean = false;
  private queryRewriter: any;

  constructor(client: any, sql: string, queryRewriter?: any) {
    this.client = client;
    this.sql = sql;
    this.queryRewriter = queryRewriter;
  }

  private rewriteSQL(sql: string): string {
    if (this.queryRewriter && this.queryRewriter.needsRewrite(sql)) {
      return this.queryRewriter.rewriteQuery(sql);
    }
    return sql;
  }

  run(...params: any[]): RunResult {
    const actualParams = params.length > 0 ? params : this.boundParams;
    const rewrittenSQL = this.rewriteSQL(this.sql);

    try {
      const result = this.client.querySync(rewrittenSQL, actualParams);

      return {
        changes: result.rowCount || 0,
        lastInsertRowid: result.rows[0]?.id || 0
      };
    } catch (error: any) {
      throw new Error(`PostgreSQL query error: ${error.message}`);
    }
  }

  get(...params: any[]): any {
    const actualParams = params.length > 0 ? params : this.boundParams;
    const rewrittenSQL = this.rewriteSQL(this.sql);

    try {
      const result = this.client.querySync(rewrittenSQL, actualParams);

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
      throw new Error(`PostgreSQL query error: ${error.message}`);
    }
  }

  all(...params: any[]): any[] {
    const actualParams = params.length > 0 ? params : this.boundParams;
    const rewrittenSQL = this.rewriteSQL(this.sql);

    try {
      const result = this.client.querySync(rewrittenSQL, actualParams);

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
      throw new Error(`PostgreSQL query error: ${error.message}`);
    }
  }

  iterate(...params: any[]): IterableIterator<any> {
    return this.all(...params)[Symbol.iterator]();
  }

  pluck(toggleState: boolean = true): this {
    this.isPluck = toggleState;
    return this;
  }

  expand(toggleState?: boolean): this {
    // Not applicable for PostgreSQL
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
    try {
      const rewrittenSQL = this.rewriteSQL(this.sql);
      const result = this.client.querySync(`${rewrittenSQL} LIMIT 0`);

      return result.fields?.map((field: any) => ({
        name: field.name,
        column: field.name,
        table: field.tableID ? `table_${field.tableID}` : null,
        database: null,
        type: this.mapPostgreSQLType(field.dataTypeID),
        default: null,
        nullable: true
      }));
    } catch {
      return undefined;
    }
  }

  private mapPostgreSQLType(typeId: number): string {
    // PostgreSQL OID mappings (common types)
    const typeMap: Record<number, string> = {
      16: 'BOOLEAN',
      20: 'BIGINT',
      21: 'SMALLINT',
      23: 'INTEGER',
      25: 'TEXT',
      700: 'REAL',
      701: 'DOUBLE PRECISION',
      1043: 'VARCHAR',
      1082: 'DATE',
      1114: 'TIMESTAMP',
      1184: 'TIMESTAMPTZ'
    };

    return typeMap[typeId] || 'TEXT';
  }

  get source(): string {
    return this.sql;
  }

  get reader(): boolean {
    return /^\s*(SELECT|WITH|SHOW|DESCRIBE|EXPLAIN)/i.test(this.sql);
  }
}

/**
 * PostgreSQL Database implementation
 */
class PostgreSQLDatabase implements DatabaseInterface {
  private client: any;
  private isOpen: boolean = true;
  private options: DriverOptions;
  private inTrans: boolean = false;
  private schemaRewriter: any;
  private queryRewriter: any;

  constructor(connectionString: string, options: DriverOptions) {
    this.options = options;

    // Dynamic import of pg module
    if (typeof require === 'undefined') {
      throw new Error('PostgreSQL driver requires Node.js with require() support');
    }

    const { Client } = require('pg');
    this.client = new Client(connectionString);

    // Connect synchronously using a trick (blocking the event loop - not recommended for production)
    this.client.connect((err: Error) => {
      if (err) {
        throw new Error(`Failed to connect to PostgreSQL: ${err.message}`);
      }
    });

    // Add synchronous query wrapper
    this.client.querySync = (sql: string, params?: any[]) => {
      let result: any;
      let error: any;
      let done = false;

      this.client.query(sql, params || [], (err: Error, res: any) => {
        error = err;
        result = res;
        done = true;
      });

      // Busy-wait (not ideal, but provides synchronous interface)
      const start = Date.now();
      while (!done && Date.now() - start < (this.options.timeout || 5000)) {
        // Wait
      }

      if (!done) {
        throw new Error('PostgreSQL query timeout');
      }

      if (error) {
        throw error;
      }

      return result;
    };

    // Load plugins if specified
    if (options.schemaRewriter) {
      this.schemaRewriter = PluginRegistry.getSchemaPlugin(options.schemaRewriter);
    }

    if (options.queryRewriter) {
      this.queryRewriter = PluginRegistry.getQueryPlugin(options.queryRewriter);
    }
  }

  prepare(sql: string): StatementInterface {
    if (!this.isOpen) {
      throw new Error('Database is closed');
    }

    // Apply schema rewriting if this is a DDL statement
    let finalSQL = sql;
    if (this.schemaRewriter && /^\s*(CREATE|ALTER|DROP)/i.test(sql)) {
      finalSQL = this.schemaRewriter.rewriteSchema(sql);
    }

    return new PostgreSQLStatement(this.client, finalSQL, this.queryRewriter);
  }

  exec(sql: string): this {
    if (!this.isOpen) {
      throw new Error('Database is closed');
    }

    // Apply schema rewriting if this is a DDL statement
    let finalSQL = sql;
    if (this.schemaRewriter && /^\s*(CREATE|ALTER|DROP)/i.test(sql)) {
      finalSQL = this.schemaRewriter.rewriteSchema(sql);
    }

    try {
      this.client.querySync(finalSQL);
    } catch (error: any) {
      throw new Error(`PostgreSQL exec error: ${error.message}`);
    }

    return this;
  }

  transaction(fn: TransactionFunction): TransactionFunction {
    return (...args: any[]) => {
      this.exec('BEGIN');
      this.inTrans = true;

      try {
        const result = fn(...args);
        this.exec('COMMIT');
        this.inTrans = false;
        return result;
      } catch (error) {
        this.exec('ROLLBACK');
        this.inTrans = false;
        throw error;
      }
    };
  }

  pragma(sql: string, options?: PragmaOptions): any {
    // PostgreSQL doesn't have PRAGMA, but we can support some common queries
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
    if (this.isOpen) {
      this.client.end();
      this.isOpen = false;
    }
    return this;
  }

  defaultSafeIntegers(toggleState?: boolean): this {
    // Not applicable for PostgreSQL
    return this;
  }

  unsafeMode(toggleState?: boolean): this {
    // Not applicable for PostgreSQL
    return this;
  }

  get inTransaction(): boolean {
    return this.inTrans;
  }

  get name(): string {
    return this.client.database || 'postgresql';
  }

  get open(): boolean {
    return this.isOpen;
  }

  get readonly(): boolean {
    return this.options.readonly || false;
  }

  get memory(): boolean {
    return false; // PostgreSQL is never in-memory
  }
}

/**
 * PostgreSQL Driver Factory
 */
export class PostgreSQLDriver implements DriverFactory {
  readonly name = 'postgresql';

  readonly features = {
    backup: false,
    loadExtension: false,
    customFunctions: false,
    customAggregates: false,
    transactions: true,
    wal: false
  };

  isAvailable(): boolean {
    // Check for Node.js environment and pg module
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

    return new PostgreSQLDatabase(connectionString, options);
  }
}

/**
 * Factory function to create PostgreSQL driver
 */
export function createPostgreSQLDriver(): PostgreSQLDriver {
  return new PostgreSQLDriver();
}
