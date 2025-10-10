/**
 * RQLite Driver for both Node.js and Deno (JavaScript)
 *
 * This driver provides access to RQLite distributed database.
 * It uses fetch API which is available in both Node.js (18+) and Deno.
 */

class RqliteStatement {
  constructor(client, sql) {
    this.client = client;
    this.sql = sql;
    this.isWrite = /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|BEGIN|COMMIT|ROLLBACK)/i.test(sql);
  }

  run(...params) {
    // For now, throw error for sync operations
    // In production, you'd use deasync or similar
    throw new Error('Synchronous RQLite operations not implemented. Use async API.');
  }

  get(...params) {
    throw new Error('Synchronous RQLite operations not implemented. Use async API.');
  }

  all(...params) {
    throw new Error('Synchronous RQLite operations not implemented. Use async API.');
  }

  iterate(...params) {
    throw new Error('Synchronous RQLite operations not implemented. Use async API.');
  }

  pluck(toggleState) {
    return this;
  }

  expand(toggleState) {
    return this;
  }

  raw(toggleState) {
    return this;
  }

  columns() {
    return undefined;
  }

  bind(...params) {
    return this;
  }

  get source() {
    return this.sql;
  }

  get reader() {
    return !this.isWrite;
  }
}

class RqliteClient {
  constructor(baseUrl, options) {
    this.baseUrl = baseUrl;
    this.options = options;
  }

  // Simplified sync operations - would need deasync in production
  executeSync(query, params) {
    throw new Error('Synchronous RQLite operations not implemented. Use async API.');
  }

  querySync(query, params) {
    throw new Error('Synchronous RQLite operations not implemented. Use async API.');
  }
}

class RqliteDatabase {
  constructor(connectionUrl, options) {
    this.connectionUrl = connectionUrl;
    this.options = options;
    this.client = new RqliteClient(connectionUrl, options);
    this.isOpen = true;
  }

  prepare(sql) {
    if (!this.isOpen) {
      throw new Error('Database is closed');
    }
    return new RqliteStatement(this.client, sql);
  }

  exec(sql) {
    if (!this.isOpen) {
      throw new Error('Database is closed');
    }
    // For now, no-op for sync version
    return this;
  }

  transaction(fn) {
    return (...args) => {
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

  pragma(sql, options) {
    // Simplified implementation
    return options && options.simple ? 'wal' : [{ journal_mode: 'wal' }];
  }

  function(name, optionsOrFn, maybeFn) {
    if (this.options.verbose) {
      console.warn('Custom functions are not supported in RQLite');
    }
    return this;
  }

  aggregate(name, options) {
    if (this.options.verbose) {
      console.warn('Custom aggregates are not supported in RQLite');
    }
    return this;
  }

  loadExtension(path) {
    if (this.options.verbose) {
      console.warn('Loading extensions is not supported in RQLite');
    }
    return this;
  }

  close() {
    this.isOpen = false;
    return this;
  }

  defaultSafeIntegers(toggleState) {
    return this;
  }

  unsafeMode(toggleState) {
    return this;
  }

  get inTransaction() {
    return false;
  }

  get name() {
    return this.connectionUrl;
  }

  get open() {
    return this.isOpen;
  }

  get readonly() {
    return false;
  }

  get memory() {
    return false;
  }
}

class RqliteDriver {
  constructor() {
    this.name = 'rqlite';
    this.features = {
      backup: false,
      loadExtension: false,
      customFunctions: false,
      customAggregates: false,
      transactions: true,
      wal: false
    };
  }

  isAvailable() {
    // RQLite driver is available if fetch is available
    return typeof fetch !== 'undefined' ||
           (typeof global !== 'undefined' && global.fetch) ||
           (typeof globalThis !== 'undefined' && globalThis.fetch);
  }

  createDatabase(filename, options = {}) {
    if (!this.isAvailable()) {
      throw new Error('RQLite driver requires fetch API to be available');
    }

    // For RQLite, the "filename" is actually the connection URL
    if (!filename.startsWith('http://') && !filename.startsWith('https://')) {
      throw new Error('RQLite driver requires an HTTP/HTTPS URL');
    }

    return new RqliteDatabase(filename, options);
  }
}

// Export a factory function instead of auto-registering
function createRqliteDriver() {
  return new RqliteDriver();
}

module.exports = {
  RqliteDriver,
  createRqliteDriver
};