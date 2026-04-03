/**
 * Deno SQLite driver wrapper
 * This provides a better-sqlite3 compatible API using Deno's native SQLite module
 */

// Import Deno SQLite module from JSR (Deno 2.x compatible)
import { Database as SqliteDB } from 'jsr:@db/sqlite@0.12';

export interface DenoRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export class DenoStatement {
  private db: SqliteDB;
  private sql: string;
  private stmt: ReturnType<SqliteDB['prepare']> | null = null;
  private isReader: boolean;
  private pluckMode: boolean = false;
  private rawMode: boolean = false;

  constructor(db: SqliteDB, sql: string) {
    this.db = db;
    this.sql = sql;
    this.isReader = !/^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|BEGIN|COMMIT|ROLLBACK)/i.test(sql);

    // Prepare the statement
    try {
      this.stmt = this.db.prepare(sql);
    } catch (_e) {
      // If prepare fails, we'll execute directly
      this.stmt = null;
    }
  }

  // deno-lint-ignore no-explicit-any
  run(...params: any[]): DenoRunResult {
    if (this.stmt) {
      this.stmt.run(...params);
    } else {
      this.db.exec(this.sql);
    }

    return {
      changes: this.db.changes,
      lastInsertRowid: this.db.lastInsertRowId
    };
  }

  // deno-lint-ignore no-explicit-any
  get(...params: any[]): any {
    if (!this.stmt) {
      return undefined;
    }

    const row = this.stmt.get(...params);

    if (row === undefined) {
      return undefined;
    }

    if (this.pluckMode && typeof row === 'object' && row !== null) {
      const values = Object.values(row);
      return values.length > 0 ? values[0] : undefined;
    }

    if (this.rawMode && typeof row === 'object' && row !== null) {
      return Object.values(row);
    }

    return row;
  }

  // deno-lint-ignore no-explicit-any
  all(...params: any[]): any[] {
    if (!this.stmt) {
      return [];
    }

    const results = this.stmt.all(...params);

    if (this.pluckMode) {
      // deno-lint-ignore no-explicit-any
      return results.map((row: any) => {
        const values = Object.values(row);
        return values.length > 0 ? values[0] : undefined;
      });
    }

    if (this.rawMode) {
      // deno-lint-ignore no-explicit-any
      return results.map((row: any) => Object.values(row));
    }

    return results;
  }

  // deno-lint-ignore no-explicit-any
  iterate(...params: any[]): IterableIterator<any> {
    const rows = this.all(...params);
    return rows[Symbol.iterator]();
  }

  pluck(toggleState?: boolean): this {
    this.pluckMode = toggleState !== false;
    return this;
  }

  expand(_toggleState?: boolean): this {
    // Not implemented for Deno
    return this;
  }

  raw(toggleState?: boolean): this {
    this.rawMode = toggleState !== false;
    return this;
  }

  // deno-lint-ignore no-explicit-any
  columns(): any[] | undefined {
    if (!this.stmt) {
      return undefined;
    }
    // The JSR sqlite module returns column names via the result objects
    // We don't have direct access to column metadata, so return undefined
    return undefined;
  }

  // deno-lint-ignore no-explicit-any
  bind(..._params: any[]): this {
    // Deno SQLite doesn't support separate bind, parameters are passed at execution
    return this;
  }

  get source(): string {
    return this.sql;
  }

  get reader(): boolean {
    return this.isReader;
  }

  finalize(): void {
    if (this.stmt && typeof this.stmt.finalize === 'function') {
      try {
        this.stmt.finalize();
      } catch (_e) {
        // Ignore errors during finalization
      }
    }
  }
}

export class DenoDatabase {
  private db: SqliteDB;
  private filename: string;
  private isOpen: boolean = false;
  private options: Record<string, unknown>;
  private statements: Set<DenoStatement> = new Set();

  constructor(filename: string, options: Record<string, unknown> = {}) {
    this.filename = filename;
    this.options = options;

    // Open the database
    try {
      this.db = new SqliteDB(filename === ':memory:' ? ':memory:' : filename);
      this.isOpen = true;

      // Enable WAL mode if not disabled and not in-memory
      if (!options.disableWAL && filename !== ':memory:') {
        try {
          this.db.exec('PRAGMA journal_mode = WAL');
        } catch (_e) {
          // WAL mode might not be supported, continue anyway
        }
      }
    } catch (e) {
      throw new Error(`Failed to open database: ${e}`);
    }
  }

  prepare(sql: string): DenoStatement {
    if (!this.isOpen) {
      throw new Error('Database is closed');
    }
    const stmt = new DenoStatement(this.db, sql);
    this.statements.add(stmt);
    return stmt;
  }

  exec(sql: string): this {
    if (!this.isOpen) {
      throw new Error('Database is closed');
    }
    this.db.exec(sql);
    return this;
  }

  // deno-lint-ignore no-explicit-any
  transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T {
    // deno-lint-ignore no-explicit-any
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

  // deno-lint-ignore no-explicit-any
  pragma(sql: string, options?: { simple?: boolean }): any {
    const pragmaMatch = sql.match(/^(\w+)(?:\s*=\s*(.+))?$/);
    if (!pragmaMatch) {
      throw new Error('Invalid pragma statement');
    }

    const [, key, value] = pragmaMatch;
    let query = `PRAGMA ${key}`;
    if (value !== undefined) {
      query += ` = ${value}`;
    }

    const stmt = this.db.prepare(query);
    // deno-lint-ignore no-explicit-any
    const results = stmt.all() as any[];

    if (results.length === 0) {
      return options?.simple ? undefined : [];
    }

    if (options?.simple) {
      const firstRow = results[0];
      const values = Object.values(firstRow);
      return values.length > 0 ? values[0] : undefined;
    }

    // Return objects with the pragma key as the column name
    // This matches better-sqlite3 behavior
    // deno-lint-ignore no-explicit-any
    return results.map((row: any) => {
      const values = Object.values(row);
      return { [key]: values.length > 0 ? values[0] : null };
    });
  }

  backup(destination: string): Promise<Uint8Array> {
    // Deno doesn't have built-in backup like better-sqlite3
    // We can implement a simple file copy for file-based databases
    if (this.filename === ':memory:') {
      throw new Error('Cannot backup in-memory database');
    }

    return Deno.readFile(this.filename)
      .then((data: Uint8Array) => {
        return Deno.writeFile(destination, data)
          .then(() => data);
      });
  }

  // deno-lint-ignore no-explicit-any
  function(name: string, fn: (...args: any[]) => any): this;
  // deno-lint-ignore no-explicit-any
  function(name: string, options: Record<string, any>, fn: (...args: any[]) => any): this;
  // deno-lint-ignore no-explicit-any
  function(name: string, optionsOrFn: ((...args: any[]) => any) | Record<string, any>, maybeFn?: (...args: any[]) => any): this {
    const fn = typeof optionsOrFn === 'function' ? optionsOrFn : maybeFn;

    if (fn && typeof (this.db as any).function === 'function') {
      (this.db as any).function(name, fn);
    }

    return this;
  }

  // deno-lint-ignore no-explicit-any
  aggregate(name: string, _options: Record<string, any>): this {
    // Deno SQLite has limited support for custom aggregates
    console.warn(`Aggregate functions not fully supported in Deno SQLite: ${name}`);
    return this;
  }

  loadExtension(_path: string): this {
    // Deno SQLite doesn't support loading extensions
    console.warn('Loading extensions is not supported in Deno SQLite');
    return this;
  }

  close(): this {
    if (this.isOpen && this.db) {
      // Finalize all prepared statements first
      for (const stmt of this.statements) {
        try {
          stmt.finalize();
        } catch (_e) {
          // Ignore finalization errors
        }
      }
      this.statements.clear();

      this.db.close();
      this.isOpen = false;
    }
    return this;
  }

  defaultSafeIntegers(_toggleState?: boolean): this {
    // Deno handles BigInts differently
    return this;
  }

  unsafeMode(_toggleState?: boolean): this {
    // Deno SQLite doesn't have an unsafe mode
    return this;
  }

  get inTransaction(): boolean {
    try {
      // Check if we're in a transaction
      const result = this.db.prepare('SELECT 1').get();
      return result !== undefined;
    } catch {
      return false;
    }
  }

  get name(): string {
    return this.filename;
  }

  get open(): boolean {
    return this.isOpen;
  }

  get readonly(): boolean {
    return (this.options.readonly as boolean) || false;
  }

  get memory(): boolean {
    return this.filename === ':memory:';
  }

  get changes(): number {
    return this.db.changes || 0;
  }

  get lastInsertRowId(): number | bigint {
    return this.db.lastInsertRowId || 0;
  }
}
