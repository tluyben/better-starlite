import * as http from 'http';
import * as https from 'https';
import * as url from 'url';
import * as deasync from 'deasync';

export interface RqliteOptions {
  level?: 'none' | 'weak' | 'strong';
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

export class RqliteClient {
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
    let result: RqliteResult | null = null;
    let error: Error | null = null;
    let done = false;

    this.execute(query, params, options)
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
    let result: RqliteResult | null = null;
    let error: Error | null = null;
    let done = false;

    this.query(query, params, options)
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

  private async execute(query: string, params?: any[], options: RqliteOptions = {}): Promise<RqliteResult> {
    return this.executeAsync(query, params, options);
  }

  private async query(query: string, params?: any[], options: RqliteOptions = {}): Promise<RqliteResult> {
    return this.queryAsync(query, params, options);
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
    let error: Error | null = null;
    let done = false;

    this.transaction(fn)
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

  private async transaction(fn: () => void): Promise<void> {
    await this.execute('BEGIN');
    try {
      fn();
      await this.execute('COMMIT');
    } catch (error) {
      await this.execute('ROLLBACK');
      throw error;
    }
  }
}