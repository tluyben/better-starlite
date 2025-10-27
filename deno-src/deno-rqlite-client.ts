/**
 * Deno-compatible RQLite client
 * Uses fetch API instead of Node.js http/https modules
 */

export interface RqliteOptions {
  level?: 'none' | 'weak' | 'linearizable';
  pretty?: boolean;
  timings?: boolean;
  timeout?: number;
}

export interface RqliteResult {
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

export class DenoRqliteClient {
  private readonly baseUrl: string;

  constructor(connectionUrl: string) {
    this.baseUrl = connectionUrl;
  }

  async executeAsync(query: string, params?: any[], options: RqliteOptions = {}): Promise<RqliteResult> {
    const endpoint = '/db/execute';
    const body = this.buildRequestBody(query, params);
    return this.request('POST', endpoint, body, options);
  }

  async queryAsync(query: string, params?: any[], options: RqliteOptions = {}): Promise<RqliteResult> {
    const endpoint = '/db/query';
    const body = this.buildRequestBody(query, params);
    return this.request('POST', endpoint, body, options);
  }

  executeSync(query: string, params?: any[], options: RqliteOptions = {}): RqliteResult {
    // In Deno, we need to use async/await, but we can block with a wrapper
    let result: RqliteResult | null = null;
    let error: Error | null = null;

    // Create a promise and wait for it synchronously (not ideal but maintains API compatibility)
    const promise = this.executeAsync(query, params, options);

    // Note: True synchronous operations in Deno would require using Workers or other mechanisms
    // For now, we'll throw an error indicating this should be used with async
    throw new Error('Synchronous operations not supported in Deno. Please use executeAsync/queryAsync methods.');
  }

  querySync(query: string, params?: any[], options: RqliteOptions = {}): RqliteResult {
    throw new Error('Synchronous operations not supported in Deno. Please use executeAsync/queryAsync methods.');
  }

  private buildRequestBody(query: string, params?: any[]): string {
    if (params && params.length > 0) {
      return JSON.stringify([[query, ...params]]);
    }
    return JSON.stringify([query]);
  }

  private async request(method: string, endpoint: string, body?: string, options: RqliteOptions = {}): Promise<RqliteResult> {
    const queryParams = new URLSearchParams();
    if (options.level) queryParams.set('level', options.level);
    if (options.pretty) queryParams.set('pretty', 'true');
    if (options.timings) queryParams.set('timings', 'true');

    const fullUrl = queryParams.toString()
      ? `${this.baseUrl}${endpoint}?${queryParams}`
      : `${this.baseUrl}${endpoint}`;

    const controller = new AbortController();
    const timeout = options.timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(fullUrl, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': body ? body.length.toString() : '0'
        },
        body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const result = await response.json();

      if (response.ok) {
        return result;
      } else {
        throw new Error(result.error || `HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }

      throw error;
    }
  }

  async transactionAsync(fn: () => Promise<void>): Promise<void> {
    await this.executeAsync('BEGIN');
    try {
      await fn();
      await this.executeAsync('COMMIT');
    } catch (error) {
      await this.executeAsync('ROLLBACK');
      throw error;
    }
  }

  transactionSync(fn: () => void): void {
    throw new Error('Synchronous transactions not supported in Deno. Please use transactionAsync.');
  }
}