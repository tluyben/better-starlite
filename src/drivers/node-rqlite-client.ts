/**
 * Node.js RQLite client wrapper
 * Wraps the existing rqlite-client for Node.js environments
 */

import * as http from 'http';
import * as https from 'https';
import * as url from 'url';

let deasync: any;

// Only load deasync in Node.js environment
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  try {
    deasync = require('deasync');
  } catch (e) {
    console.warn('Failed to load deasync:', e);
  }
}

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

export class NodeRqliteClient {
  private readonly baseUrl: string;
  private readonly protocol: typeof http | typeof https;
  private readonly options: url.UrlWithStringQuery;

  constructor(connectionUrl: string) {
    const parsed = url.parse(connectionUrl);
    this.baseUrl = connectionUrl;
    this.protocol = parsed.protocol === 'https:' ? https : http;
    this.options = parsed;
  }

  executeSync(query: string, params?: any[], options: RqliteOptions = {}): RqliteResult {
    if (!deasync) {
      throw new Error('deasync module not available. Use executeAsync instead.');
    }

    let result: RqliteResult | null = null;
    let error: Error | null = null;
    let done = false;

    this.executeAsync(query, params, options)
      .then(r => {
        result = r;
        done = true;
      })
      .catch(e => {
        error = e;
        done = true;
      });

    deasync.loopWhile(() => !done);

    if (error) throw error;
    return result!;
  }

  querySync(query: string, params?: any[], options: RqliteOptions = {}): RqliteResult {
    if (!deasync) {
      throw new Error('deasync module not available. Use queryAsync instead.');
    }

    let result: RqliteResult | null = null;
    let error: Error | null = null;
    let done = false;

    this.queryAsync(query, params, options)
      .then(r => {
        result = r;
        done = true;
      })
      .catch(e => {
        error = e;
        done = true;
      });

    deasync.loopWhile(() => !done);

    if (error) throw error;
    return result!;
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

  private buildRequestBody(query: string, params?: any[]): string {
    if (params && params.length > 0) {
      return JSON.stringify([[query, ...params]]);
    }
    return JSON.stringify([query]);
  }

  private request(method: string, endpoint: string, body?: string, options: RqliteOptions = {}): Promise<RqliteResult> {
    return new Promise((resolve, reject) => {
      const queryParams = new URLSearchParams();
      if (options.level) queryParams.set('level', options.level);
      if (options.pretty) queryParams.set('pretty', 'true');
      if (options.timings) queryParams.set('timings', 'true');

      const fullPath = queryParams.toString() ? `${endpoint}?${queryParams}` : endpoint;

      const reqOptions = {
        ...this.options,
        method,
        path: fullPath,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': body ? Buffer.byteLength(body) : 0
        },
        timeout: options.timeout || 30000
      };

      const req = this.protocol.request(reqOptions, (res) => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(result);
            } else {
              reject(new Error(result.error || `HTTP ${res.statusCode}: ${data}`));
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (body) {
        req.write(body);
      }
      req.end();
    });
  }

  transactionSync(fn: () => void): void {
    if (!deasync) {
      throw new Error('deasync module not available. Use transactionAsync instead.');
    }

    let error: Error | null = null;
    let done = false;

    this.transactionAsync(async () => fn())
      .then(() => {
        done = true;
      })
      .catch(e => {
        error = e;
        done = true;
      });

    deasync.loopWhile(() => !done);

    if (error) throw error;
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
}