/**
 * SQLite Driver for Node.js using better-sqlite3 (JavaScript)
 *
 * This driver is only loaded and registered when running in a Node.js environment.
 * It will not cause compilation issues in other environments because the better-sqlite3
 * import is dynamic and conditional.
 */

class SqliteNodeStatement {
  constructor(stmt) {
    this.stmt = stmt;
  }

  run(...params) {
    const result = this.stmt.run(...params);
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid
    };
  }

  get(...params) {
    return this.stmt.get(...params);
  }

  all(...params) {
    return this.stmt.all(...params);
  }

  iterate(...params) {
    return this.stmt.iterate(...params);
  }

  pluck(toggleState) {
    this.stmt.pluck(toggleState);
    return this;
  }

  expand(toggleState) {
    this.stmt.expand(toggleState);
    return this;
  }

  raw(toggleState) {
    this.stmt.raw(toggleState);
    return this;
  }

  columns() {
    const cols = this.stmt.columns();
    if (!cols) return undefined;

    return cols.map(col => ({
      name: col.name,
      column: col.column,
      table: col.table,
      database: col.database,
      type: col.type,
      default: col.default,
      nullable: col.nullable || true
    }));
  }

  bind(...params) {
    this.stmt.bind(...params);
    return this;
  }

  get source() {
    return this.stmt.source;
  }

  get reader() {
    return this.stmt.reader;
  }
}

class SqliteNodeDatabase {
  constructor(db) {
    this.db = db;
  }

  prepare(sql) {
    return new SqliteNodeStatement(this.db.prepare(sql));
  }

  exec(sql) {
    this.db.exec(sql);
    return this;
  }

  transaction(fn) {
    return this.db.transaction(fn);
  }

  pragma(sql, options) {
    return this.db.pragma(sql, options);
  }

  backup(destination) {
    const result = this.db.backup(destination);
    return result;
  }

  function(name, optionsOrFn, maybeFn) {
    if (typeof optionsOrFn === 'function') {
      this.db.function(name, optionsOrFn);
    } else {
      this.db.function(name, optionsOrFn, maybeFn);
    }
    return this;
  }

  aggregate(name, options) {
    this.db.aggregate(name, options);
    return this;
  }

  loadExtension(path) {
    this.db.loadExtension(path);
    return this;
  }

  close() {
    this.db.close();
    return this;
  }

  defaultSafeIntegers(toggleState) {
    this.db.defaultSafeIntegers(toggleState);
    return this;
  }

  unsafeMode(toggleState) {
    this.db.unsafeMode(toggleState);
    return this;
  }

  get inTransaction() {
    return this.db.inTransaction;
  }

  get name() {
    return this.db.name;
  }

  get open() {
    return this.db.open;
  }

  get readonly() {
    return this.db.readonly;
  }

  get memory() {
    return this.db.memory;
  }
}

class SqliteNodeDriver {
  constructor() {
    this.BetterSqlite3 = null;
    this.name = 'sqlite-node';
    this.features = {
      backup: true,
      loadExtension: true,
      customFunctions: true,
      customAggregates: true,
      transactions: true,
      wal: true
    };

    // Try to load better-sqlite3 dynamically
    if (this.isAvailable()) {
      try {
        // Dynamic import to avoid compilation issues
        this.BetterSqlite3 = require('better-sqlite3');
      } catch (e) {
        // Module not available, driver will report as unavailable
      }
    }
  }

  isAvailable() {
    // Check if we're in Node.js environment
    return typeof process !== 'undefined' &&
           process.versions &&
           process.versions.node !== undefined &&
           typeof require !== 'undefined';
  }

  createDatabase(filename, options = {}) {
    if (!this.isAvailable()) {
      throw new Error('SQLite Node driver is not available in this environment');
    }

    if (!this.BetterSqlite3) {
      throw new Error('better-sqlite3 module not found. Please install it with: npm install better-sqlite3');
    }

    const db = new this.BetterSqlite3(filename, options);

    // Enable WAL mode if not disabled and not in-memory
    if (!options.disableWAL && filename !== ':memory:') {
      try {
        db.pragma('journal_mode = WAL');
      } catch (e) {
        if (options.verbose) {
          console.warn('Failed to enable WAL mode:', e);
        }
      }
    }

    return new SqliteNodeDatabase(db);
  }
}

// Export a factory function instead of auto-registering
function createSqliteNodeDriver() {
  return new SqliteNodeDriver();
}

module.exports = {
  SqliteNodeDriver,
  createSqliteNodeDriver
};