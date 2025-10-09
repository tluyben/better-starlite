/**
 * Node.js SQLite driver wrapper
 * This wraps better-sqlite3 for Node.js environments
 */

let BetterSqlite3: any;

// Only load better-sqlite3 in Node.js environment
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  try {
    BetterSqlite3 = require('better-sqlite3');
  } catch (e) {
    console.warn('Failed to load better-sqlite3:', e);
  }
}

export class NodeStatement {
  private stmt: any;

  constructor(stmt: any) {
    this.stmt = stmt;
  }

  run(...params: any[]): any {
    return this.stmt.run(...params);
  }

  get(...params: any[]): any {
    return this.stmt.get(...params);
  }

  all(...params: any[]): any[] {
    return this.stmt.all(...params);
  }

  iterate(...params: any[]): IterableIterator<any> {
    return this.stmt.iterate(...params);
  }

  pluck(toggleState?: boolean): this {
    this.stmt.pluck(toggleState);
    return this;
  }

  expand(toggleState?: boolean): this {
    this.stmt.expand(toggleState);
    return this;
  }

  raw(toggleState?: boolean): this {
    this.stmt.raw(toggleState);
    return this;
  }

  columns(): any[] | undefined {
    return this.stmt.columns();
  }

  bind(...params: any[]): this {
    this.stmt.bind(...params);
    return this;
  }

  get source(): string {
    return this.stmt.source;
  }

  get reader(): boolean {
    return this.stmt.reader;
  }
}

export class NodeDatabase {
  private db: any;
  private options: any;

  constructor(filename: string, options: any = {}) {
    if (!BetterSqlite3) {
      throw new Error('better-sqlite3 module not loaded. Make sure you are running in Node.js environment.');
    }

    this.options = options;
    this.db = new BetterSqlite3(filename, options);

    if (!options.disableWAL && filename !== ':memory:') {
      try {
        this.db.pragma('journal_mode = WAL');
      } catch (e) {
        console.warn('Failed to enable WAL mode:', e);
      }
    }
  }

  prepare(sql: string): NodeStatement {
    return new NodeStatement(this.db.prepare(sql));
  }

  exec(sql: string): this {
    this.db.exec(sql);
    return this;
  }

  transaction(fn: (...args: any[]) => any): (...args: any[]) => any {
    return this.db.transaction(fn);
  }

  pragma(sql: string, options?: any): any {
    return this.db.pragma(sql, options);
  }

  backup(destination: string): Promise<Buffer> {
    const result = this.db.backup(destination);
    return result as any as Promise<Buffer>;
  }

  function(name: string, fn: (...args: any[]) => any): this;
  function(name: string, options: any, fn: (...args: any[]) => any): this;
  function(name: string, optionsOrFn: any, maybeFn?: any): this {
    if (typeof optionsOrFn === 'function') {
      this.db.function(name, optionsOrFn);
    } else {
      this.db.function(name, optionsOrFn, maybeFn);
    }
    return this;
  }

  aggregate(name: string, options: any): this {
    this.db.aggregate(name, options);
    return this;
  }

  loadExtension(path: string): this {
    this.db.loadExtension(path);
    return this;
  }

  close(): this {
    this.db.close();
    return this;
  }

  defaultSafeIntegers(toggleState?: boolean): this {
    this.db.defaultSafeIntegers(toggleState);
    return this;
  }

  unsafeMode(toggleState?: boolean): this {
    this.db.unsafeMode(toggleState);
    return this;
  }

  get inTransaction(): boolean {
    return this.db.inTransaction;
  }

  get name(): string {
    return this.db.name;
  }

  get open(): boolean {
    return this.db.open;
  }

  get readonly(): boolean {
    return this.db.readonly;
  }

  get memory(): boolean {
    return this.db.memory;
  }
}