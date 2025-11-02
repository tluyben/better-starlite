import { AsyncDatabase } from './async';

export interface QueryResult {
  rows: any[];
  rowsAffected?: number;
  lastInsertRowid?: number;
}

export function drizzle(database: AsyncDatabase, config?: any): any {
  try {
    const {
      BaseSQLiteDatabase,
      SQLiteAsyncDialect,
      SQLiteSession,
      SQLiteTransaction,
    } = require('drizzle-orm/sqlite-core');

    const dialect = new SQLiteAsyncDialect();

    class BetterStarliteSession extends SQLiteSession<'async', any, any, any> {
      constructor(private client: AsyncDatabase, dialect: any, schema: any) {
        super('async', dialect, schema, { casing: config?.casing });
      }

      prepareQuery(query: any, fields: any, executeMethod: any, isResponseInArrayMode: boolean, customResultMapper?: any): any {
        const client = this.client;

        return {
          async execute(placeholderValues?: Record<string, unknown>) {
            const stmt = await client.prepare(query.sql);
            const params = query.params || [];

            // Check if this is a SELECT query
            if (executeMethod === 'all') {
              return await stmt.all(...params);
            } else if (executeMethod === 'get') {
              return await stmt.get(...params);
            } else {
              // run method for INSERT/UPDATE/DELETE
              const result = await stmt.run(...params);
              return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
            }
          },
          async run(placeholderValues?: Record<string, unknown>) {
            const stmt = await client.prepare(query.sql);
            const params = query.params || [];
            const result = await stmt.run(...params);
            return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
          },
          async all(placeholderValues?: Record<string, unknown>) {
            const stmt = await client.prepare(query.sql);
            const params = query.params || [];
            const rows = await stmt.all(...params);
            return rows;
          },
          async get(placeholderValues?: Record<string, unknown>) {
            const stmt = await client.prepare(query.sql);
            const params = query.params || [];
            const row = await stmt.get(...params);
            return row;
          },
          async values(placeholderValues?: Record<string, unknown>) {
            const stmt = await client.prepare(query.sql);
            const params = query.params || [];
            const rows = await stmt.all(...params);
            return rows.map((row: any) => Object.values(row));
          },
        };
      }

      async transaction<T>(
        transaction: (tx: any) => Promise<T>,
        _config?: any
      ): Promise<T> {
        const tx = new BetterStarliteTransaction();
        const wrapped = await this.client.transaction(() => transaction(tx));
        return await wrapped();
      }
    }

    const session = new BetterStarliteSession(database, dialect, config?.schema);

    class BetterStarliteTransaction extends SQLiteTransaction<'async', any, any, any> {
      constructor() {
        super('async', dialect, session, config?.schema);
      }

      async transaction<T>(_transaction: (tx: any) => Promise<T>): Promise<T> {
        throw new Error('Cannot start a transaction within a transaction');
      }
    }

    class BetterStarliteDatabase extends BaseSQLiteDatabase<'async', any, any> {
      constructor() {
        super('async', dialect, session, config?.schema);
      }
    }

    const db = new BetterStarliteDatabase();

    // Attach the raw client for direct access if needed
    Object.defineProperty(db, '$client', {
      value: database,
      writable: false,
      enumerable: false,
    });

    return db;
  } catch (error) {
    throw new Error(
      'drizzle-orm is required to use the drizzle adapter. ' +
      'Please install it with: npm install drizzle-orm'
    );
  }
}