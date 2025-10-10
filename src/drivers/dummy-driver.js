/**
 * Dummy Driver for Testing (JavaScript)
 *
 * This driver provides a mock implementation that returns predictable test data.
 * Useful for testing applications without requiring a real database.
 */

class DummyStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.isWrite = /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/i.test(sql);
    this.pluckMode = false;
    this.rawMode = false;
    this.boundParams = [];
  }

  run(...params) {
    const allParams = [...this.boundParams, ...params];

    // Simulate INSERT
    if (/^\s*INSERT\s+INTO\s+(\w+)/i.test(this.sql)) {
      return {
        changes: 1,
        lastInsertRowid: Math.floor(Math.random() * 1000)
      };
    }

    // Simulate UPDATE
    if (/^\s*UPDATE\s+(\w+)/i.test(this.sql)) {
      return {
        changes: Math.floor(Math.random() * 5) + 1,
        lastInsertRowid: 0
      };
    }

    // Simulate DELETE
    if (/^\s*DELETE\s+FROM\s+(\w+)/i.test(this.sql)) {
      return {
        changes: Math.floor(Math.random() * 3),
        lastInsertRowid: 0
      };
    }

    return {
      changes: 0,
      lastInsertRowid: 0
    };
  }

  get(...params) {
    const allParams = [...this.boundParams, ...params];

    // Return dummy data based on SQL pattern
    if (/SELECT.*FROM\s+users/i.test(this.sql)) {
      const data = { id: 1, name: 'John Doe', email: 'john@example.com' };
      if (this.pluckMode) return data.id;
      if (this.rawMode) return [data.id, data.name, data.email];
      return data;
    }

    if (/SELECT.*FROM\s+products/i.test(this.sql)) {
      const data = { id: 1, name: 'Widget', price: 99.99, stock: 50 };
      if (this.pluckMode) return data.id;
      if (this.rawMode) return [data.id, data.name, data.price, data.stock];
      return data;
    }

    // Check for parameterized queries
    if (allParams.length > 0) {
      return {
        id: allParams[0] || 1,
        value: `Result for param: ${allParams[0]}`,
        timestamp: new Date().toISOString()
      };
    }

    return undefined;
  }

  all(...params) {
    const allParams = [...this.boundParams, ...params];

    // Return dummy array data based on SQL pattern
    if (/SELECT.*FROM\s+users/i.test(this.sql)) {
      const data = [
        { id: 1, name: 'John Doe', email: 'john@example.com' },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
        { id: 3, name: 'Bob Wilson', email: 'bob@example.com' }
      ];

      if (this.pluckMode) return data.map(d => d.id);
      if (this.rawMode) return data.map(d => [d.id, d.name, d.email]);
      return data;
    }

    if (/SELECT.*FROM\s+products/i.test(this.sql)) {
      const data = [
        { id: 1, name: 'Widget', price: 99.99, stock: 50 },
        { id: 2, name: 'Gadget', price: 149.99, stock: 30 },
        { id: 3, name: 'Doohickey', price: 49.99, stock: 100 }
      ];

      if (this.pluckMode) return data.map(d => d.id);
      if (this.rawMode) return data.map(d => [d.id, d.name, d.price, d.stock]);
      return data;
    }

    // Return empty array for unknown tables
    return [];
  }

  iterate(...params) {
    const rows = this.all(...params);
    return rows[Symbol.iterator]();
  }

  pluck(toggleState) {
    this.pluckMode = toggleState !== false;
    return this;
  }

  expand(toggleState) {
    // Dummy implementation doesn't need expand mode
    return this;
  }

  raw(toggleState) {
    this.rawMode = toggleState !== false;
    return this;
  }

  columns() {
    // Return dummy column definitions based on SQL
    if (/FROM\s+users/i.test(this.sql)) {
      return [
        { name: 'id', column: 'id', table: 'users', database: 'dummy', type: 'INTEGER', default: null, nullable: false },
        { name: 'name', column: 'name', table: 'users', database: 'dummy', type: 'TEXT', default: null, nullable: false },
        { name: 'email', column: 'email', table: 'users', database: 'dummy', type: 'TEXT', default: null, nullable: true }
      ];
    }

    if (/FROM\s+products/i.test(this.sql)) {
      return [
        { name: 'id', column: 'id', table: 'products', database: 'dummy', type: 'INTEGER', default: null, nullable: false },
        { name: 'name', column: 'name', table: 'products', database: 'dummy', type: 'TEXT', default: null, nullable: false },
        { name: 'price', column: 'price', table: 'products', database: 'dummy', type: 'REAL', default: null, nullable: false },
        { name: 'stock', column: 'stock', table: 'products', database: 'dummy', type: 'INTEGER', default: 0, nullable: true }
      ];
    }

    return undefined;
  }

  bind(...params) {
    this.boundParams = params;
    return this;
  }

  get source() {
    return this.sql;
  }

  get reader() {
    return !this.isWrite;
  }
}

class DummyDatabase {
  constructor(filename, options) {
    this.isOpen = true;
    this.inTrans = false;
    this.options = options || {};
    this.filename = filename;
    this.transactionDepth = 0;

    if (this.options.verbose) {
      console.log(`[DummyDriver] Opened database: ${filename}`);
    }
  }

  prepare(sql) {
    if (!this.isOpen) {
      throw new Error('Database is closed');
    }
    return new DummyStatement(this, sql);
  }

  exec(sql) {
    if (!this.isOpen) {
      throw new Error('Database is closed');
    }

    // Handle transaction commands
    if (/^\s*BEGIN/i.test(sql)) {
      this.inTrans = true;
      this.transactionDepth++;
    } else if (/^\s*COMMIT/i.test(sql)) {
      if (this.transactionDepth > 0) {
        this.transactionDepth--;
        this.inTrans = this.transactionDepth > 0;
      }
    } else if (/^\s*ROLLBACK/i.test(sql)) {
      this.transactionDepth = 0;
      this.inTrans = false;
    }

    if (this.options.verbose) {
      console.log(`[DummyDriver] Executed: ${sql.substring(0, 50)}...`);
    }

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
    // Return dummy pragma values
    const pragmaMatch = sql.match(/^(\w+)(?:\s*=\s*(.+))?$/);
    if (!pragmaMatch) {
      throw new Error('Invalid pragma statement');
    }

    const [, key] = pragmaMatch;

    // Return common pragma values
    const pragmaValues = {
      'journal_mode': 'wal',
      'foreign_keys': 1,
      'synchronous': 2,
      'cache_size': -2000,
      'page_size': 4096,
      'user_version': 1,
      'application_id': 0
    };

    const value = pragmaValues[key.toLowerCase()] || 'dummy_value';

    if (options && options.simple) {
      return value;
    }

    return [{ [key]: value }];
  }

  backup(destination) {
    // Return a dummy buffer
    return Promise.resolve(Buffer.from('DUMMY_BACKUP_DATA'));
  }

  function(name, optionsOrFn, maybeFn) {
    if (this.options.verbose) {
      console.log(`[DummyDriver] Registered function: ${name}`);
    }
    return this;
  }

  aggregate(name, options) {
    if (this.options.verbose) {
      console.log(`[DummyDriver] Registered aggregate: ${name}`);
    }
    return this;
  }

  loadExtension(path) {
    if (this.options.verbose) {
      console.log(`[DummyDriver] Loaded extension: ${path}`);
    }
    return this;
  }

  close() {
    this.isOpen = false;
    if (this.options.verbose) {
      console.log('[DummyDriver] Database closed');
    }
    return this;
  }

  defaultSafeIntegers(toggleState) {
    return this;
  }

  unsafeMode(toggleState) {
    return this;
  }

  get inTransaction() {
    return this.inTrans;
  }

  get name() {
    return this.filename || 'dummy.db';
  }

  get open() {
    return this.isOpen;
  }

  get readonly() {
    return this.options.readonly || false;
  }

  get memory() {
    return true; // Dummy driver is always in-memory
  }
}

class DummyDriver {
  constructor() {
    this.name = 'dummy';
    this.features = {
      backup: true,
      loadExtension: true,
      customFunctions: true,
      customAggregates: true,
      transactions: true,
      wal: true
    };
  }

  isAvailable() {
    // Dummy driver is always available
    return true;
  }

  createDatabase(filename, options) {
    return new DummyDatabase(filename, options);
  }
}

// Export factory function
function createDummyDriver() {
  return new DummyDriver();
}

module.exports = {
  DummyDriver,
  createDummyDriver
};