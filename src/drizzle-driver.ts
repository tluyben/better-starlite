import Database from './index';

export class DrizzleStarliteSession {
  constructor(private db: Database) {}

  exec(query: { sql: string; params: any[] }): {
    rows: any[];
    rowsAffected: number;
    lastInsertRowid?: number;
  } {
    const stmt = this.db.prepare(query.sql);

    const isSelect = /^\s*SELECT/i.test(query.sql);

    if (isSelect) {
      const rows = stmt.all(...query.params);
      return {
        rows,
        rowsAffected: 0,
      };
    } else {
      const result = stmt.run(...query.params);
      return {
        rows: [],
        rowsAffected: result.changes,
        lastInsertRowid: result.lastInsertRowid as number,
      };
    }
  }

  all<T = any>(query: string, params?: any[]): T[] {
    const stmt = this.db.prepare(query);
    return stmt.all(...(params || [])) as T[];
  }

  get<T = any>(query: string, params?: any[]): T | undefined {
    const stmt = this.db.prepare(query);
    return stmt.get(...(params || [])) as T | undefined;
  }

  run(query: string, params?: any[]): { changes: number; lastInsertRowid: number } {
    const stmt = this.db.prepare(query);
    const result = stmt.run(...(params || []));
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid as number,
    };
  }

  transaction<T>(fn: () => T): T {
    const wrapped = this.db.transaction(fn);
    return wrapped();
  }
}

export class StarliteDriver {
  constructor(private db: Database) {}

  createSession(): DrizzleStarliteSession {
    return new DrizzleStarliteSession(this.db);
  }
}

export function drizzleStarlite(db: Database) {
  return new StarliteDriver(db);
}