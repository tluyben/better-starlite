import { AsyncDatabase } from './async';

export interface QueryResult {
  rows: any[];
  rowsAffected?: number;
  lastInsertRowid?: number;
}

export class BetterStarliteSession {
  constructor(private db: AsyncDatabase) {}

  async prepareQuery(query: { sql: string; params?: unknown[] }) {
    return query;
  }

  async execute(query: { sql: string; params?: unknown[] }): Promise<QueryResult> {
    const stmt = await this.db.prepare(query.sql);
    const params = query.params || [];

    const isSelect = /^\s*SELECT/i.test(query.sql);

    if (isSelect) {
      const rows = await stmt.all(...params);
      return { rows, rowsAffected: 0 };
    } else {
      const result = await stmt.run(...params);
      return {
        rows: [],
        rowsAffected: result.changes,
        lastInsertRowid: result.lastInsertRowid as number,
      };
    }
  }

  async all(query: { sql: string; params?: unknown[] }): Promise<{ rows: any[] }> {
    const stmt = await this.db.prepare(query.sql);
    const rows = await stmt.all(...(query.params || []));
    return { rows };
  }

  async get(query: { sql: string; params?: unknown[] }): Promise<{ rows: any[] }> {
    const stmt = await this.db.prepare(query.sql);
    const result = await stmt.get(...(query.params || []));
    return { rows: result ? [result] : [] };
  }

  async run(query: { sql: string; params?: unknown[] }): Promise<QueryResult> {
    const stmt = await this.db.prepare(query.sql);
    const result = await stmt.run(...(query.params || []));
    return {
      rows: [],
      rowsAffected: result.changes,
      lastInsertRowid: result.lastInsertRowid as number,
    };
  }

  async batch(queries: Array<{ sql: string; params?: unknown[] }>): Promise<QueryResult[]> {
    const results: QueryResult[] = [];

    const transaction = await this.db.transaction(async () => {
      for (const query of queries) {
        const result = await this.execute(query);
        results.push(result);
      }
      return results;
    });

    return await transaction();
  }

  async transaction<T>(
    fn: (tx: BetterStarliteTransaction) => Promise<T>
  ): Promise<T> {
    const tx = new BetterStarliteTransaction(this.db);
    const wrapped = await this.db.transaction(() => fn(tx));
    return await wrapped();
  }
}

export class BetterStarliteTransaction extends BetterStarliteSession {
  async transaction<T>(_fn: (tx: BetterStarliteTransaction) => Promise<T>): Promise<T> {
    throw new Error('Cannot start a transaction within a transaction');
  }
}

export function drizzle(database: AsyncDatabase): any {
  const session = new BetterStarliteSession(database);

  const proxy = new Proxy(session, {
    get(target: any, prop: string | symbol) {
      if (prop in target) {
        const value = target[prop];
        if (typeof value === 'function') {
          return value.bind(target);
        }
        return value;
      }

      try {
        const drizzleCore = require('drizzle-orm');
        const drizzleSqlite = require('drizzle-orm/sqlite-core');

        if (prop in drizzleCore) {
          return drizzleCore[prop];
        }

        if (prop in drizzleSqlite) {
          return drizzleSqlite[prop];
        }
      } catch (_) {
        // Drizzle not installed, continue
      }

      return undefined;
    },
  });

  Object.defineProperties(proxy, {
    session: {
      value: session,
      writable: false,
      enumerable: false,
    },
    $client: {
      value: database,
      writable: false,
      enumerable: false,
    },
  });

  return proxy;
}