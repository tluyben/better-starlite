/**
 * FlexDB HTTP client for better-starlite.
 *
 * Wraps every FlexDB REST endpoint as a typed async method.
 * Node selection is round-robin — FlexDB handles all internal routing
 * (raft → leader, eventual → any, crdt → broadcast) transparently.
 */

export type ConsistencyMode = 'raft' | 'eventual' | 'crdt';

export interface FlexDbClientOptions {
  /** Bearer token for Authorization header. */
  authToken?: string;
  /** Per-request timeout in ms. Default: 30 000 */
  timeoutMs?: number;
  /** Default consistency mode for all tables. Default: "raft" */
  defaultConsistency?: ConsistencyMode;
  /** Per-table consistency modes applied at connect time. */
  tableModes?: Record<string, ConsistencyMode>;
}

// ─── Wire types ───────────────────────────────────────────────────────────────

export interface FlexDbQueryResult {
  columns: string[];
  rows: any[][];
  rows_affected: number;
  last_insert_id: number | null;
  time_ns: number;
  error?: string;
}

interface FlexDbQueryResponse {
  results: FlexDbQueryResult[];
  node_id: string;
  raft_index: number;
  crdt_conflicts: any[];
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class FlexDbClient {
  private readonly nodes: string[];
  private readonly options: FlexDbClientOptions;
  private cursor = 0;
  /** txnId set during an active transaction (guarded by writeMutex in AsyncDatabase). */
  private activeTxnId: string | undefined;

  constructor(nodes: string[], options: FlexDbClientOptions = {}) {
    this.nodes = nodes;
    this.options = options;
  }

  // ── Node selection ──────────────────────────────────────────────────────────

  private nextNode(): string {
    const node = this.nodes[this.cursor % this.nodes.length];
    this.cursor = (this.cursor + 1) % this.nodes.length;
    return node;
  }

  // ── HTTP helpers ────────────────────────────────────────────────────────────

  private buildHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.options.authToken) {
      h['Authorization'] = `Bearer ${this.options.authToken}`;
    }
    if (this.activeTxnId) {
      h['X-Transaction-ID'] = this.activeTxnId;
    }
    return { ...h, ...extraHeaders };
  }

  private async request(
    node: string,
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<any> {
    const url = `${node}${path}`;
    const init: RequestInit = {
      method,
      headers: this.buildHeaders(extraHeaders),
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 30_000),
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (err: any) {
      throw new Error(`FlexDB connection error (${url}): ${err?.message ?? err}`);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`FlexDB HTTP ${response.status} (${method} ${path}): ${text}`);
    }

    return response.json();
  }

  private async requestRaw(node: string, method: string, path: string): Promise<ArrayBuffer> {
    const url = `${node}${path}`;
    const headers: Record<string, string> = {};
    if (this.options.authToken) {
      headers['Authorization'] = `Bearer ${this.options.authToken}`;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 30_000),
      });
    } catch (err: any) {
      throw new Error(`FlexDB connection error (${url}): ${err?.message ?? err}`);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`FlexDB HTTP ${response.status} (${method} ${path}): ${text}`);
    }

    return response.arrayBuffer();
  }

  // ── Transaction context ─────────────────────────────────────────────────────

  setActiveTxnId(id: string | undefined): void {
    this.activeTxnId = id;
  }

  getActiveTxnId(): string | undefined {
    return this.activeTxnId;
  }

  // ── Core query ──────────────────────────────────────────────────────────────

  /** Execute a single SQL statement, returning its result. */
  async query(sql: string, params: any[] = []): Promise<FlexDbQueryResult> {
    const node = this.nextNode();
    const resp = await this.request(node, 'POST', '/v1/query', {
      statements: [{ sql, params }],
    }) as FlexDbQueryResponse;

    const result = resp.results[0];
    if (!result) throw new Error('FlexDB returned empty results array');
    if (result.error) throw new Error(`FlexDB SQL error: ${result.error}`);
    return result;
  }

  /** Execute multiple SQL statements in a single round-trip. */
  async queryBatch(
    statements: Array<{ sql: string; params?: any[] }>,
  ): Promise<FlexDbQueryResult[]> {
    if (statements.length === 0) return [];
    const node = this.nextNode();
    const resp = await this.request(node, 'POST', '/v1/query', {
      statements: statements.map(s => ({ sql: s.sql, params: s.params ?? [] })),
    }) as FlexDbQueryResponse;

    for (const r of resp.results) {
      if (r.error) throw new Error(`FlexDB SQL error: ${r.error}`);
    }
    return resp.results;
  }

  // ── Transactions ────────────────────────────────────────────────────────────

  async beginTransaction(): Promise<string> {
    const node = this.nextNode();
    const resp = await this.request(node, 'POST', '/v1/transaction/begin');
    if (!resp.transaction_id) {
      throw new Error('FlexDB begin: missing transaction_id in response');
    }
    return resp.transaction_id as string;
  }

  async commitTransaction(txnId: string): Promise<void> {
    const node = this.nextNode();
    await this.request(node, 'POST', '/v1/transaction/commit', { transaction_id: txnId });
  }

  async rollbackTransaction(txnId: string): Promise<void> {
    const node = this.nextNode();
    await this.request(node, 'POST', '/v1/transaction/rollback', { transaction_id: txnId });
  }

  // ── Per-table consistency ───────────────────────────────────────────────────

  async setTableMode(table: string, mode: ConsistencyMode): Promise<void> {
    const node = this.nextNode();
    await this.request(
      node, 'PUT', `/v1/table/${encodeURIComponent(table)}/mode`, { mode },
    );
  }

  async getTableMode(table: string): Promise<ConsistencyMode> {
    const node = this.nextNode();
    const resp = await this.request(
      node, 'GET', `/v1/table/${encodeURIComponent(table)}/mode`,
    );
    return resp.mode as ConsistencyMode;
  }

  // ── Full-text search ────────────────────────────────────────────────────────

  async enableSearch(table: string, columns: string[]): Promise<void> {
    const node = this.nextNode();
    await this.request(
      node, 'PUT', `/v1/table/${encodeURIComponent(table)}/search`, { columns },
    );
  }

  async disableSearch(table: string): Promise<void> {
    const node = this.nextNode();
    await this.request(
      node, 'DELETE', `/v1/table/${encodeURIComponent(table)}/search`,
    );
  }

  async getSearchConfig(table: string): Promise<string[]> {
    const node = this.nextNode();
    const resp = await this.request(
      node, 'GET', `/v1/table/${encodeURIComponent(table)}/search`,
    );
    return (resp.columns ?? []) as string[];
  }

  /**
   * Full-text search on a table that has native search enabled.
   * Returns an array of row objects (same shape as .all() results).
   */
  async search(table: string, query: string, limit = 20): Promise<any[]> {
    const node = this.nextNode();
    const resp = await this.request(node, 'POST', '/v1/search', { table, query, limit });
    const result = resp.results as FlexDbQueryResult | undefined;
    if (!result || !result.rows || result.rows.length === 0) return [];
    return result.rows.map(row => {
      const obj: any = {};
      result.columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  }

  // ── Backup / snapshot ───────────────────────────────────────────────────────

  /** Download a raw SQLite snapshot from the node (VACUUM INTO bytes). */
  async snapshot(): Promise<Uint8Array> {
    const node = this.nextNode();
    const buf = await this.requestRaw(node, 'GET', '/v1/snapshot');
    return new Uint8Array(buf);
  }

  // ── Cluster / health ────────────────────────────────────────────────────────

  async health(): Promise<{ status: string }> {
    const node = this.nextNode();
    return this.request(node, 'GET', '/v1/health');
  }

  async status(): Promise<any> {
    const node = this.nextNode();
    return this.request(node, 'GET', '/v1/status');
  }

  // ── Startup helpers ─────────────────────────────────────────────────────────

  /** Apply any tableModes from DatabaseOptions at connect time. */
  async applyTableModes(tableModes: Record<string, ConsistencyMode>): Promise<void> {
    for (const [table, mode] of Object.entries(tableModes)) {
      await this.setTableMode(table, mode);
    }
  }

  /** Wait until at least one node is healthy (used in tests / init). */
  async waitForHealth(maxRetries = 60, delayMs = 100): Promise<void> {
    let lastErr: Error | undefined;
    for (let i = 0; i < maxRetries; i++) {
      try {
        await this.health();
        return;
      } catch (err: any) {
        lastErr = err;
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    throw new Error(
      `FlexDB not healthy after ${maxRetries} retries: ${lastErr?.message ?? 'unknown'}`,
    );
  }
}

// ─── URL parsing helper ───────────────────────────────────────────────────────

/**
 * Parse a `flexdb://` URL into an array of `http://host:port` node addresses.
 *
 * Examples:
 *   "flexdb://localhost:4001"            → ["http://localhost:4001"]
 *   "flexdb://node1:4001,node2:4001"     → ["http://node1:4001", "http://node2:4001"]
 *   "flexdb://https://node1:4001"        → ["https://node1:4001"]  (explicit https)
 */
export function parseFlexDbUrl(url: string): string[] {
  const withoutScheme = url.startsWith('flexdb://') ? url.slice('flexdb://'.length) : url;
  return withoutScheme.split(',').map(part => {
    const node = part.trim();
    if (node.startsWith('http://') || node.startsWith('https://')) return node;
    return `http://${node}`;
  });
}
