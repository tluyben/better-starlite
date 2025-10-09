/**
 * Deno SQLite driver wrapper
 * This provides a better-sqlite3 compatible API using Deno's native SQLite module
 */

// Import Deno SQLite module directly (will only work in Deno)
import { DB } from 'https://deno.land/x/sqlite@v3.8/mod.ts';

export interface DenoRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export class DenoStatement {
  private db: any; // Deno DB instance
  private sql: string;
  private stmt: any; // Prepared statement
  private isReader: boolean;
  private pluckMode: boolean = false;
  private expandMode: boolean = false;
  private rawMode: boolean = false;
  private columnInfo: any[] | null = null;

  constructor(db: any, sql: string) {
    this.db = db;
    this.sql = sql;
    this.isReader = !/^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|BEGIN|COMMIT|ROLLBACK)/i.test(sql);

    // Prepare the statement
    try {
      this.stmt = this.db.prepareQuery(sql);
      // Cache column info
      if (this.stmt && typeof this.stmt.columns === 'function') {
        this.columnInfo = this.stmt.columns();
      }
    } catch (e) {
      // If prepare fails, we'll execute directly
      this.stmt = null;
    }
  }

  run(...params: any[]): DenoRunResult {
    if (this.stmt) {
      this.stmt.execute(params);
    } else {
      this.db.query(this.sql, params);
    }

    return {
      changes: this.db.changes,
      lastInsertRowid: this.db.lastInsertRowId
    };
  }

  get(...params: any[]): any {
    const results = this.stmt
      ? Array.from(this.stmt.iter(params))
      : Array.from(this.db.query(this.sql, params));

    if (results.length === 0) {
      return undefined;
    }

    const row = results[0];

    if (this.pluckMode && Array.isArray(row)) {
      return row[0];
    }

    if (this.rawMode) {
      return row;
    }

    // Convert array to object if we have column names
    if (Array.isArray(row) && this.columnInfo) {
      const obj: any = {};
      this.columnInfo.forEach((col: any, i: number) => {
        const colName = col.name || col;
        obj[colName] = row[i];
      });
      return obj;
    }

    // If no columns info, return as array
    return row;
  }

  all(...params: any[]): any[] {
    const results = this.stmt
      ? Array.from(this.stmt.iter(params))
      : Array.from(this.db.query(this.sql, params));

    if (this.pluckMode) {
      return results.map((row: any) => Array.isArray(row) ? row[0] : row);
    }

    if (this.rawMode) {
      return results;
    }

    // Convert arrays to objects if we have column names
    if (results.length > 0 && Array.isArray(results[0]) && this.columnInfo) {
      return results.map((row: any) => {
        const obj: any = {};
        this.columnInfo!.forEach((col: any, i: number) => {
          const colName = col.name || col;
          obj[colName] = row[i];
        });
        return obj;
      });
    }

    return results;
  }

  iterate(...params: any[]): IterableIterator<any> {
    const rows = this.all(...params);
    return rows[Symbol.iterator]();
  }

  pluck(toggleState?: boolean): this {
    this.pluckMode = toggleState !== false;
    return this;
  }

  expand(toggleState?: boolean): this {
    this.expandMode = toggleState !== false;
    return this;
  }

  raw(toggleState?: boolean): this {
    this.rawMode = toggleState !== false;
    return this;
  }

  columns(): any[] | undefined {
    if (this.columnInfo) {
      return this.columnInfo.map((col: any) => ({
        name: col.name || col,
        column: col.originName || null,
        table: col.tableName || null,
        database: null,
        type: null,
        default: null,
        nullable: true
      }));
    }
    return undefined;
  }

  bind(...params: any[]): this {
    // Deno SQLite doesn't support separate bind, parameters are passed at execution
    // We could store them for later use if needed
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
      } catch (e) {
        // Ignore errors during finalization
      }
    }
  }
}

export class DenoDatabase {
  private db: any;
  private filename: string;
  private isOpen: boolean = false;
  private options: any;
  private statements: Set<DenoStatement> = new Set();

  constructor(filename: string, options: any = {}) {
    this.filename = filename;
    this.options = options;

    // Open the database
    try {
      this.db = new DB(filename === ':memory:' ? ':memory:' : filename);
      this.isOpen = true;

      // Enable WAL mode if not disabled and not in-memory
      if (!options.disableWAL && filename !== ':memory:') {
        try {
          this.db.query('PRAGMA journal_mode = WAL');
        } catch (e) {
          console.warn('Failed to enable WAL mode:', e);
        }
      }

      // Set other pragmas from options
      if (options.verbose) {
        console.log(`Opened database: ${filename}`);
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

    // Split and execute multiple statements
    const statements = sql.split(';').filter(s => s.trim());
    for (const stmt of statements) {
      if (stmt.trim()) {
        this.db.query(stmt);
      }
    }
    return this;
  }

  transaction(fn: (...args: any[]) => any): (...args: any[]) => any {
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

  pragma(sql: string, options?: any): any {
    const pragmaMatch = sql.match(/^(\w+)(?:\s*=\s*(.+))?$/);
    if (!pragmaMatch) {
      throw new Error('Invalid pragma statement');
    }

    const [, key, value] = pragmaMatch;
    let query = `PRAGMA ${key}`;
    if (value !== undefined) {
      query += ` = ${value}`;
    }

    const results = Array.from(this.db.query(query));

    if (results.length === 0) {
      return options?.simple ? undefined : [];
    }

    if (options?.simple) {
      return results[0][0];
    }

    // Convert to objects if we have multiple columns
    const stmt = this.db.prepareQuery(query);
    const columns = stmt.columns || [];
    stmt.finalize();

    if (columns.length > 1) {
      return results.map(row => {
        const obj: any = {};
        columns.forEach((col: any, i: number) => {
          obj[col.name || col] = row[i];
        });
        return obj;
      });
    }

    return results;
  }

  backup(destination: string): Promise<Buffer> {
    // Deno doesn't have built-in backup like better-sqlite3
    // We can implement a simple file copy for file-based databases
    if (this.filename === ':memory:') {
      throw new Error('Cannot backup in-memory database');
    }

    return (globalThis as any).Deno.readFile(this.filename)
      .then((data: Uint8Array) => {
        return (globalThis as any).Deno.writeFile(destination, data)
          .then(() => Buffer.from(data));
      });
  }

  function(name: string, fn: (...args: any[]) => any): this;
  function(name: string, options: any, fn: (...args: any[]) => any): this;
  function(name: string, optionsOrFn: any, maybeFn?: any): this {
    const fn = typeof optionsOrFn === 'function' ? optionsOrFn : maybeFn;
    const options = typeof optionsOrFn === 'function' ? {} : optionsOrFn;

    // Create a custom function in SQLite
    this.db.createFunction(name, fn, {
      deterministic: options.deterministic || false,
      varargs: options.varargs || false
    });

    return this;
  }

  aggregate(name: string, options: any): this {
    // Deno SQLite has limited support for custom aggregates
    // We can implement basic support if the module supports it
    if (typeof this.db.createAggregate === 'function') {
      this.db.createAggregate(name, options);
    } else {
      console.warn(`Aggregate functions not fully supported in Deno SQLite`);
    }
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
        } catch (e) {
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
    // Deno handles BigInts differently, but we can track this preference
    return this;
  }

  unsafeMode(_toggleState?: boolean): this {
    // Deno SQLite doesn't have an unsafe mode
    return this;
  }

  get inTransaction(): boolean {
    try {
      // Check if we're in a transaction by trying to start a savepoint
      this.db.query('SAVEPOINT test');
      this.db.query('RELEASE test');
      return true;
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
    return this.options.readonly || false;
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