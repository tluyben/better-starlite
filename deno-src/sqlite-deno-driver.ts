/**
 * SQLite Driver for Deno using Deno's native SQLite module
 *
 * This driver is only loaded and registered when running in a Deno environment.
 * It will not cause compilation issues in other environments because the Deno
 * SQLite import is dynamic and conditional.
 */

import {
  DatabaseInterface,
  StatementInterface,
  DriverFactory,
  DriverOptions,
  RunResult,
  ColumnDefinition,
  PragmaOptions,
  TransactionFunction
} from './driver-interface';

class SqliteDenoStatement implements StatementInterface {
  private db: any; // Deno DB instance
  private sql: string;
  private stmt: any; // Prepared statement
  private isReader: boolean;
  private pluckMode: boolean = false;
  private rawMode: boolean = false;
  private columnInfo: any[] | null = null;

  constructor(db: any, sql: string) {
    this.db = db;
    this.sql = sql;
    this.isReader = !/^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|BEGIN|COMMIT|ROLLBACK)/i.test(sql);

    // Try to prepare the statement
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

  run(...params: any[]): RunResult {
    if (this.stmt) {
      this.stmt.execute(params);
    } else {
      this.db.query(this.sql, params);
    }

    return {
      changes: this.db.changes || 0,
      lastInsertRowid: this.db.lastInsertRowId || 0
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

  expand(_toggleState?: boolean): this {
    // Deno SQLite doesn't support expand mode
    return this;
  }

  raw(toggleState?: boolean): this {
    this.rawMode = toggleState !== false;
    return this;
  }

  columns(): ColumnDefinition[] | undefined {
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
      } catch (e) {
        // Ignore errors during finalization
      }
    }
  }
}

class SqliteDenoDatabase implements DatabaseInterface {
  private db: any;
  private filename: string;
  private isOpen: boolean = false;
  private options: DriverOptions;
  private statements: Set<SqliteDenoStatement> = new Set();

  constructor(db: any, filename: string, options: DriverOptions) {
    this.db = db;
    this.filename = filename;
    this.options = options;
    this.isOpen = true;
  }

  prepare(sql: string): StatementInterface {
    if (!this.isOpen) {
      throw new Error('Database is closed');
    }
    const stmt = new SqliteDenoStatement(this.db, sql);
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

  transaction(fn: TransactionFunction): TransactionFunction {
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

  pragma(sql: string, options?: PragmaOptions): any {
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
      return results.map((row: any) => {
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

    const Deno = (globalThis as any).Deno;
    return Deno.readFile(this.filename)
      .then((data: Uint8Array) => {
        return Deno.writeFile(destination, data)
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
    if (typeof this.db.createAggregate === 'function') {
      this.db.createAggregate(name, options);
    } else if (this.options.verbose) {
      console.warn(`Aggregate functions not fully supported in Deno SQLite`);
    }
    return this;
  }

  loadExtension(_path: string): this {
    // Deno SQLite doesn't support loading extensions
    if (this.options.verbose) {
      console.warn('Loading extensions is not supported in Deno SQLite');
    }
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
    // Deno handles BigInts differently
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
}

export class SqliteDenoDriver implements DriverFactory {
  private DB: any = null;

  readonly name = 'sqlite-deno';
  readonly features = {
    backup: true,
    loadExtension: false,
    customFunctions: true,
    customAggregates: false,
    transactions: true,
    wal: true
  };

  constructor() {
    // Try to load Deno SQLite dynamically
    if (this.isAvailable()) {
      try {
        // Dynamic import for Deno SQLite
        const Deno = (globalThis as any).Deno;
        if (Deno && Deno.version) {
          // We'll load the module when createDatabase is called
          // to avoid issues during module initialization
        }
      } catch (e) {
        // Module not available, driver will report as unavailable
      }
    }
  }

  isAvailable(): boolean {
    // Check if we're in Deno environment
    return typeof (globalThis as any).Deno !== 'undefined' &&
           typeof (globalThis as any).Deno.version !== 'undefined';
  }

  async loadDenoSqlite() {
    if (!this.DB) {
      // Dynamically import the Deno SQLite module
      const module = await import('https://deno.land/x/sqlite@v3.8/mod.ts');
      this.DB = module.DB;
    }
  }

  createDatabase(filename: string, options: DriverOptions = {}): DatabaseInterface {
    if (!this.isAvailable()) {
      throw new Error('SQLite Deno driver is not available in this environment');
    }

    // Load Deno SQLite synchronously if not already loaded
    if (!this.DB) {
      // For synchronous operation, we need to have the module already loaded
      throw new Error('Deno SQLite module not loaded. Please use createDatabaseAsync for Deno.');
    }

    const db = new this.DB(filename === ':memory:' ? ':memory:' : filename);

    // Enable WAL mode if not disabled and not in-memory
    if (!options.disableWAL && filename !== ':memory:') {
      try {
        db.query('PRAGMA journal_mode = WAL');
      } catch (e) {
        if (options.verbose) {
          console.warn('Failed to enable WAL mode:', e);
        }
      }
    }

    return new SqliteDenoDatabase(db, filename, options);
  }

  async createDatabaseAsync(filename: string, options: DriverOptions = {}): Promise<DatabaseInterface> {
    if (!this.isAvailable()) {
      throw new Error('SQLite Deno driver is not available in this environment');
    }

    await this.loadDenoSqlite();

    const db = new this.DB(filename === ':memory:' ? ':memory:' : filename);

    // Enable WAL mode if not disabled and not in-memory
    if (!options.disableWAL && filename !== ':memory:') {
      try {
        db.query('PRAGMA journal_mode = WAL');
      } catch (e) {
        if (options.verbose) {
          console.warn('Failed to enable WAL mode:', e);
        }
      }
    }

    return new SqliteDenoDatabase(db, filename, options);
  }
}

// Export a factory function instead of auto-registering
export function createSqliteDenoDriver(): SqliteDenoDriver {
  return new SqliteDenoDriver();
}