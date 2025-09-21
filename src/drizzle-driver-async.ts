import { AsyncDatabase } from './async';

export class AsyncDrizzleStarliteSession {
  constructor(private db: AsyncDatabase) {}

  async exec(query: { sql: string; params: any[] }): Promise<{
    rows: any[];
    rowsAffected: number;
    lastInsertRowid?: number;
  }> {
    const stmt = await this.db.prepare(query.sql);

    const isSelect = /^\s*SELECT/i.test(query.sql);

    if (isSelect) {
      const rows = await stmt.all(...query.params);
      return {
        rows,
        rowsAffected: 0,
      };
    } else {
      const result = await stmt.run(...query.params);
      return {
        rows: [],
        rowsAffected: result.changes,
        lastInsertRowid: result.lastInsertRowid as number,
      };
    }
  }

  async all<T = any>(query: string, params?: any[]): Promise<T[]> {
    const stmt = await this.db.prepare(query);
    return await stmt.all(...(params || [])) as T[];
  }

  async get<T = any>(query: string, params?: any[]): Promise<T | undefined> {
    const stmt = await this.db.prepare(query);
    return await stmt.get(...(params || [])) as T | undefined;
  }

  async run(query: string, params?: any[]): Promise<{ changes: number; lastInsertRowid: number }> {
    const stmt = await this.db.prepare(query);
    const result = await stmt.run(...(params || []));
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid as number,
    };
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const wrapped = await this.db.transaction(fn);
    return wrapped();
  }
}

export class AsyncStarliteDriver {
  constructor(private db: AsyncDatabase) {}

  createSession(): AsyncDrizzleStarliteSession {
    return new AsyncDrizzleStarliteSession(this.db);
  }
}

export function drizzleAsyncStarlite(db: AsyncDatabase) {
  return new AsyncStarliteDriver(db);
}