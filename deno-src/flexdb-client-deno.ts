/**
 * FlexDB client adapter for better-starlite (Deno).
 *
 * Wraps the local @tychoish/flexdb SDK so that async-unified-deno.ts does
 * not call raw REST endpoints directly.  The public surface is intentionally
 * identical to the Node.js version (src/drivers/flexdb-client.ts) so the
 * two async-unified files stay in sync.
 */

// Import directly from client.ts to avoid the cluster_file.ts → @std/path dependency.
import { FlexDBClient } from '../../3rdparty/flexdb-deno/src/client.ts';
import type {
  AnalyticsGetResponse,
  AnalyticsListResponse,
  AnalyticsRebuildResponse,
  FlexDBClientOptions as SDKOptions,
  NodesResponse,
  Statement as SDKStatement,
  TransactionHandle,
} from '../../3rdparty/flexdb-deno/src/types.ts';

export type ConsistencyMode = 'raft' | 'eventual' | 'crdt';

export interface FlexDbClientOptions {
  authToken?: string;
  timeoutMs?: number;
  defaultConsistency?: ConsistencyMode;
  /** Per-table consistency modes applied at connect time. */
  tableModes?: Record<string, ConsistencyMode>;
}

export interface FlexDbQueryResult {
  columns: string[];
  rows: any[][];
  rows_affected: number;
  last_insert_id: number | null;
  time_ns: number;
  error?: string;
}

export class FlexDbClient {
  private readonly sdk: FlexDBClient;
  private readonly nodes: string[];
  private readonly options: FlexDbClientOptions;
  private activeTxn: TransactionHandle | undefined;

  constructor(nodes: string[], options: FlexDbClientOptions = {}) {
    this.nodes = nodes;
    this.options = options;

    const sdkOpts: SDKOptions = {
      nodes,
      authToken: options.authToken,
      timeoutMs: options.timeoutMs,
    };
    this.sdk = new FlexDBClient(sdkOpts);
  }

  // ── Core query ──────────────────────────────────────────────────────────────

  async query(sql: string, params: any[] = []): Promise<FlexDbQueryResult> {
    const stmt = { sql, params };
    const resp = this.activeTxn
      ? await this.activeTxn.query(stmt)
      : await this.sdk.query(stmt);

    const r = resp.results[0];
    if (!r) throw new Error('FlexDB returned empty results array');
    return r as FlexDbQueryResult;
  }

  async queryBatch(
    statements: Array<{ sql: string; params?: any[] }>,
  ): Promise<FlexDbQueryResult[]> {
    if (statements.length === 0) return [];
    const stmts = statements.map(s => ({ sql: s.sql, params: s.params ?? [] }));
    const resp = this.activeTxn
      ? await this.activeTxn.query(stmts)
      : await this.sdk.query(stmts);
    return resp.results as FlexDbQueryResult[];
  }

  // ── Transactions ────────────────────────────────────────────────────────────

  async beginTransaction(): Promise<string> {
    this.activeTxn = await this.sdk.beginTransaction();
    return this.activeTxn.id;
  }

  async commitTransaction(_txnId: string): Promise<void> {
    if (!this.activeTxn) throw new Error('FlexDB: no active transaction to commit');
    await this.activeTxn.commit();
  }

  async rollbackTransaction(_txnId: string): Promise<void> {
    if (!this.activeTxn) return;
    await this.activeTxn.rollback();
  }

  setActiveTxnId(id: string | undefined): void {
    if (id === undefined) this.activeTxn = undefined;
  }

  getActiveTxnId(): string | undefined {
    return this.activeTxn?.id;
  }

  // ── Per-table consistency ───────────────────────────────────────────────────

  async setTableMode(table: string, mode: ConsistencyMode): Promise<void> {
    await this.sdk.setTableMode(table, mode as any);
  }

  async getTableMode(table: string): Promise<ConsistencyMode> {
    const resp = await this.sdk.getTableMode(table);
    return resp.mode as ConsistencyMode;
  }

  // ── Full-text search ────────────────────────────────────────────────────────

  async enableSearch(table: string, columns: string[]): Promise<void> {
    await this.sdk.enableSearch(table, columns);
  }

  async disableSearch(table: string): Promise<void> {
    await this.sdk.disableSearch(table);
  }

  async getSearchConfig(table: string): Promise<string[]> {
    const cfg = await this.sdk.getSearchConfig(table);
    return cfg.columns ?? [];
  }

  async search(table: string, query: string, limit = 20): Promise<any[]> {
    const resp = await this.sdk.search({ table, query, limit });
    const result = resp.results;
    if (!result || !result.rows || result.rows.length === 0) return [];
    return result.rows.map(row => {
      const obj: any = {};
      result.columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  }

  // ── Write-only execute ──────────────────────────────────────────────────────

  /**
   * Execute a write-only SQL statement via /v1/execute.
   * The server rejects SELECT statements on this endpoint.
   */
  async execute(sql: string, params: any[] = []): Promise<FlexDbQueryResult> {
    const stmt: SDKStatement[] = [{ sql, params: params as SDKStatement['params'] }];
    const resp = this.activeTxn
      ? await this.activeTxn.execute(stmt)
      : await this.sdk.execute(stmt);

    const r = resp.results[0];
    if (!r) throw new Error('FlexDB returned empty results array');
    return r as FlexDbQueryResult;
  }

  // ── Cluster observability ───────────────────────────────────────────────────

  /** List all nodes in the cluster. */
  async getNodes(): Promise<NodesResponse> {
    return this.sdk.getNodes();
  }

  /** Fetch raw Prometheus-format metrics text. */
  async metrics(): Promise<string> {
    return this.sdk.metrics();
  }

  // ── Analytics ────────────────────────────────────────────────────────────────

  /** List all analytical tables. */
  async listAnalytics(): Promise<AnalyticsListResponse> {
    return this.sdk.listAnalytics();
  }

  /** Get a single analytical table definition. */
  async getAnalyticsTable(name: string): Promise<AnalyticsGetResponse> {
    return this.sdk.getAnalyticsTable(name);
  }

  /** Trigger an immediate local rebuild of an analytical table. */
  async rebuildAnalyticsTable(name: string): Promise<AnalyticsRebuildResponse> {
    return this.sdk.rebuildAnalyticsTable(name);
  }

  // ── Backup / snapshot ───────────────────────────────────────────────────────

  /** GET /v1/snapshot — not yet in the SDK, called directly. */
  async snapshot(): Promise<Uint8Array> {
    const url = `${this.nodes[0]}/v1/snapshot`;
    const headers: Record<string, string> = {};
    if (this.options.authToken) {
      headers['Authorization'] = `Bearer ${this.options.authToken}`;
    }
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 30_000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`FlexDB snapshot HTTP ${response.status}: ${text}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  // ── Cluster / health ────────────────────────────────────────────────────────

  async health(): Promise<{ status: string }> {
    return this.sdk.health();
  }

  async status(): Promise<any> {
    return this.sdk.getStatus();
  }

  // ── Startup helpers ─────────────────────────────────────────────────────────

  async applyTableModes(tableModes: Record<string, ConsistencyMode>): Promise<void> {
    for (const [table, mode] of Object.entries(tableModes)) {
      await this.setTableMode(table, mode);
    }
  }

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

  destroy(): void {
    this.sdk.destroy();
  }
}

// ─── URL parsing helper ───────────────────────────────────────────────────────

export function parseFlexDbUrl(url: string): string[] {
  const withoutScheme = url.startsWith('flexdb://') ? url.slice('flexdb://'.length) : url;
  return withoutScheme.split(',').map(part => {
    const node = part.trim();
    if (node.startsWith('http://') || node.startsWith('https://')) return node;
    return `http://${node}`;
  });
}
