/**
 * RQLite Driver for both Node.js and Deno
 *
 * This driver provides access to RQLite distributed database.
 * It uses fetch API which is available in both Node.js (18+) and Deno.
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

interface RqliteResult {
  results?: Array<{
    columns?: string[];
    types?: string[];
    values?: any[][];
    error?: string;
    rows_affected?: number;
    last_insert_id?: number;
  }>;
  error?: string;
}

class RqliteStatement implements StatementInterface {
  private client: RqliteClient;
  private sql: string;
  private isWrite: boolean;

  constructor(client: RqliteClient, sql: string) {
    this.client = client;
    this.sql = sql;
    this.isWrite = /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|BEGIN|COMMIT|ROLLBACK)/i.test(sql);
  }

  run(...params: any[]): RunResult {
    const result = this.client.executeSync(this.sql, params);

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
    const result = this.client.querySync(this.sql, params);

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
    const result = this.client.querySync(this.sql, params);

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
    const rows = this.all(...params);
    return rows[Symbol.iterator]();
  }

  pluck(_toggleState?: boolean): this {
    // Not implemented for RQLite
    return this;
  }

  expand(_toggleState?: boolean): this {
    // Not implemented for RQLite
    return this;
  }

  raw(_toggleState?: boolean): this {
    // Not implemented for RQLite
    return this;
  }

  columns(): ColumnDefinition[] | undefined {
    // RQLite doesn't provide column definitions in the same way
    return undefined;
  }

  bind(..._params: any[]): this {
    // Parameters are passed at execution time
    return this;
  }

  get source(): string {
    return this.sql;
  }

  get reader(): boolean {
    return !this.isWrite;
  }
}

class RqliteClient {
  private baseUrl: string;
  private options: DriverOptions;

  constructor(baseUrl: string, options: DriverOptions) {
    this.baseUrl = baseUrl;
    this.options = options;
  }

  private buildRequestBody(query: string, params?: any[]): string {
    if (params && params.length > 0) {
      return JSON.stringify([[query, ...params]]);
    }
    return JSON.stringify([query]);
  }

  async executeAsync(query: string, params?: any[]): Promise<RqliteResult> {
    const endpoint = '/db/execute';
    const body = this.buildRequestBody(query, params);
    return this.request('POST', endpoint, body);
  }

  async queryAsync(query: string, params?: any[]): Promise<RqliteResult> {
    const endpoint = '/db/query';
    const body = this.buildRequestBody(query, params);
    return this.request('POST', endpoint, body);
  }

  executeSync(query: string, params?: any[]): RqliteResult {
    // For environments that need sync operations, we'll need a different approach
    // This is a simplified version - in production, you'd use deasync or similar
    if (typeof (globalThis as any).Deno !== 'undefined') {
      // Deno doesn't support sync HTTP requests
      throw new Error('Synchronous operations not supported in Deno for RQLite. Use async methods.');
    }

    // For Node.js, we'd need to use a sync HTTP library or deasync
    // This is a placeholder - real implementation would require proper sync HTTP
    let result: RqliteResult | null = null;
    let error: Error | null = null;

    this.executeAsync(query, params)
      .then(r => { result = r; })
      .catch(e => { error = e; });

    // In real implementation, we'd use deasync here
    // For now, throw an error to indicate this needs proper implementation
    throw new Error('Synchronous RQLite operations require deasync or similar library');
  }

  querySync(query: string, params?: any[]): RqliteResult {
    // Similar to executeSync
    if (typeof (globalThis as any).Deno !== 'undefined') {
      throw new Error('Synchronous operations not supported in Deno for RQLite. Use async methods.');
    }

    // Placeholder - real implementation would require proper sync HTTP
    throw new Error('Synchronous RQLite operations require deasync or similar library');
  }

  private async request(method: string, endpoint: string, body?: string): Promise<RqliteResult> {
    const queryParams = new URLSearchParams();

    if (this.options.rqliteLevel) {
      queryParams.set('level', this.options.rqliteLevel);
    }

    const fullUrl = queryParams.toString()
      ? `${this.baseUrl}${endpoint}?${queryParams}`
      : `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(fullUrl, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body,
        signal: AbortSignal.timeout(this.options.timeout || 30000)
      });

      const data = await response.json();

      if (response.ok) {
        return data;
      } else {
        throw new Error(data.error || `HTTP ${response.status}: ${JSON.stringify(data)}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Request failed: ${error}`);
    }
  }
}

class RqliteDatabase implements DatabaseInterface {
  private client: RqliteClient;
  private connectionUrl: string;
  private options: DriverOptions;
  private isOpen: boolean = true;

  constructor(connectionUrl: string, options: DriverOptions) {
    this.connectionUrl = connectionUrl;
    this.options = options;
    this.client = new RqliteClient(connectionUrl, options);
  }

  prepare(sql: string): StatementInterface {
    if (!this.isOpen) {
      throw new Error('Database is closed');
    }
    return new RqliteStatement(this.client, sql);
  }

  exec(sql: string): this {
    if (!this.isOpen) {
      throw new Error('Database is closed');
    }

    const statements = sql.split(';').filter(s => s.trim());
    for (const stmt of statements) {
      if (stmt.trim()) {
        this.client.executeSync(stmt);
      }
    }
    return this;
  }

  transaction(fn: TransactionFunction): TransactionFunction {
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

  pragma(sql: string, options?: PragmaOptions): any {
    const pragmaMatch = sql.match(/^(\w+)(?:\s*=\s*(.+))?$/);
    if (!pragmaMatch) {
      throw new Error('Invalid pragma statement');
    }

    const [, key, value] = pragmaMatch;
    let query = `PRAGMA ${key}`;
    if (value !== undefined) {
      query += ` = ${value}`;
    }

    const result = this.client.querySync(query);
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

  function(_name: string, _fn: (...args: any[]) => any): this;
  function(_name: string, _options: any, _fn: (...args: any[]) => any): this;
  function(_name: string, _optionsOrFn: any, _maybeFn?: any): this {
    // RQLite doesn't support custom functions
    if (this.options.verbose) {
      console.warn('Custom functions are not supported in RQLite');
    }
    return this;
  }

  aggregate(_name: string, _options: any): this {
    // RQLite doesn't support custom aggregates
    if (this.options.verbose) {
      console.warn('Custom aggregates are not supported in RQLite');
    }
    return this;
  }

  loadExtension(_path: string): this {
    // RQLite doesn't support loading extensions
    if (this.options.verbose) {
      console.warn('Loading extensions is not supported in RQLite');
    }
    return this;
  }

  close(): this {
    this.isOpen = false;
    return this;
  }

  defaultSafeIntegers(_toggleState?: boolean): this {
    return this;
  }

  unsafeMode(_toggleState?: boolean): this {
    return this;
  }

  get inTransaction(): boolean {
    // RQLite doesn't provide an easy way to check this
    return false;
  }

  get name(): string {
    return this.connectionUrl;
  }

  get open(): boolean {
    return this.isOpen;
  }

  get readonly(): boolean {
    return false;
  }

  get memory(): boolean {
    return false;
  }
}

export class RqliteDriver implements DriverFactory {
  readonly name = 'rqlite';
  readonly features = {
    backup: false,
    loadExtension: false,
    customFunctions: false,
    customAggregates: false,
    transactions: true,
    wal: false // RQLite handles this differently
  };

  isAvailable(): boolean {
    // RQLite driver is available if fetch is available
    return typeof fetch !== 'undefined';
  }

  createDatabase(filename: string, options: DriverOptions = {}): DatabaseInterface {
    if (!this.isAvailable()) {
      throw new Error('RQLite driver requires fetch API to be available');
    }

    // For RQLite, the "filename" is actually the connection URL
    if (!filename.startsWith('http://') && !filename.startsWith('https://')) {
      throw new Error('RQLite driver requires an HTTP/HTTPS URL');
    }

    return new RqliteDatabase(filename, options);
  }
}

// Export a factory function instead of auto-registering
export function createRqliteDriver(): RqliteDriver {
  return new RqliteDriver();
}