/**
 * Dummy Driver for Testing
 *
 * This driver provides a mock implementation that returns predictable test data.
 * Useful for testing applications without requiring a real database.
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

interface DummyTable {
  name: string;
  columns: string[];
  data: any[][];
}

class DummyStatement implements StatementInterface {
  private sql: string;
  private db: DummyDatabase;
  private isWrite: boolean;
  private pluckMode: boolean = false;
  private rawMode: boolean = false;
  private boundParams: any[] = [];

  constructor(db: DummyDatabase, sql: string) {
    this.db = db;
    this.sql = sql;
    this.isWrite = /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/i.test(sql);
  }

  run(...params: any[]): RunResult {
    const allParams = [...this.boundParams, ...params];

    // Simulate INSERT
    if (/^\s*INSERT\s+INTO\s+(\w+)/i.test(this.sql)) {
      const match = this.sql.match(/INSERT\s+INTO\s+(\w+)\s*\((.*?)\)\s*VALUES\s*\((.*?)\)/i);
      if (match) {
        const [, tableName] = match;
        const table = this.db.getTable(tableName);
        if (table) {
          // Add dummy row
          table.data.push(allParams.length > 0 ? allParams : ['dummy', 'data']);
          return {
            changes: 1,
            lastInsertRowid: table.data.length
          };
        }
      }
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

  get(...params: any[]): any {
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

  all(...params: any[]): any[] {
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

  iterate(...params: any[]): IterableIterator<any> {
    const rows = this.all(...params);
    return rows[Symbol.iterator]();
  }

  pluck(toggleState?: boolean): this {
    this.pluckMode = toggleState !== false;
    return this;
  }

  expand(_toggleState?: boolean): this {
    // Dummy implementation doesn't need expand mode
    return this;
  }

  raw(toggleState?: boolean): this {
    this.rawMode = toggleState !== false;
    return this;
  }

  columns(): ColumnDefinition[] | undefined {
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

  bind(...params: any[]): this {
    this.boundParams = params;
    return this;
  }

  get source(): string {
    return this.sql;
  }

  get reader(): boolean {
    return !this.isWrite;
  }
}

class DummyDatabase implements DatabaseInterface {
  private isOpen: boolean = true;
  private inTrans: boolean = false;
  private options: DriverOptions;
  private tables: Map<string, DummyTable> = new Map();
  private transactionDepth: number = 0;

  constructor(filename: string, options: DriverOptions) {
    this.options = options;

    // Initialize with some dummy tables
    this.tables.set('users', {
      name: 'users',
      columns: ['id', 'name', 'email'],
      data: []
    });

    this.tables.set('products', {
      name: 'products',
      columns: ['id', 'name', 'price', 'stock'],
      data: []
    });

    if (options.verbose) {
      console.log(`[DummyDriver] Opened database: ${filename}`);
    }
  }

  getTable(name: string): DummyTable | undefined {
    return this.tables.get(name.toLowerCase());
  }

  prepare(sql: string): StatementInterface {
    if (!this.isOpen) {
      throw new Error('Database is closed');
    }
    return new DummyStatement(this, sql);
  }

  exec(sql: string): this {
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

    // Handle CREATE TABLE
    if (/^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i.test(sql)) {
      const match = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\((.*)\)/i);
      if (match) {
        const [, tableName] = match;
        if (!this.tables.has(tableName.toLowerCase())) {
          this.tables.set(tableName.toLowerCase(), {
            name: tableName,
            columns: ['id', 'data'],
            data: []
          });
        }
      }
    }

    if (this.options.verbose) {
      console.log(`[DummyDriver] Executed: ${sql.substring(0, 50)}...`);
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
    // Return dummy pragma values
    const pragmaMatch = sql.match(/^(\w+)(?:\s*=\s*(.+))?$/);
    if (!pragmaMatch) {
      throw new Error('Invalid pragma statement');
    }

    const [, key] = pragmaMatch;

    // Return common pragma values
    const pragmaValues: { [key: string]: any } = {
      'journal_mode': 'wal',
      'foreign_keys': 1,
      'synchronous': 2,
      'cache_size': -2000,
      'page_size': 4096,
      'user_version': 1,
      'application_id': 0
    };

    const value = pragmaValues[key.toLowerCase()] || 'dummy_value';

    if (options?.simple) {
      return value;
    }

    return [{ [key]: value }];
  }

  backup(_destination: string): Promise<Buffer> {
    // Return a dummy buffer
    return Promise.resolve(Buffer.from('DUMMY_BACKUP_DATA'));
  }

  function(_name: string, _fn: (...args: any[]) => any): this;
  function(_name: string, _options: any, _fn: (...args: any[]) => any): this;
  function(name: string, _optionsOrFn: any, _maybeFn?: any): this {
    if (this.options.verbose) {
      console.log(`[DummyDriver] Registered function: ${name}`);
    }
    return this;
  }

  aggregate(name: string, _options: any): this {
    if (this.options.verbose) {
      console.log(`[DummyDriver] Registered aggregate: ${name}`);
    }
    return this;
  }

  loadExtension(path: string): this {
    if (this.options.verbose) {
      console.log(`[DummyDriver] Loaded extension: ${path}`);
    }
    return this;
  }

  close(): this {
    this.isOpen = false;
    if (this.options.verbose) {
      console.log('[DummyDriver] Database closed');
    }
    return this;
  }

  defaultSafeIntegers(_toggleState?: boolean): this {
    return this;
  }

  unsafeMode(_toggleState?: boolean): this {
    return this;
  }

  get inTransaction(): boolean {
    return this.inTrans;
  }

  get name(): string {
    return 'dummy.db';
  }

  get open(): boolean {
    return this.isOpen;
  }

  get readonly(): boolean {
    return this.options.readonly || false;
  }

  get memory(): boolean {
    return true; // Dummy driver is always in-memory
  }
}

export class DummyDriver implements DriverFactory {
  readonly name = 'dummy';
  readonly features = {
    backup: true,
    loadExtension: true,
    customFunctions: true,
    customAggregates: true,
    transactions: true,
    wal: true
  };

  isAvailable(): boolean {
    // Dummy driver is always available
    return true;
  }

  createDatabase(filename: string, options: DriverOptions = {}): DatabaseInterface {
    return new DummyDatabase(filename, options);
  }
}

// Export a factory function
export function createDummyDriver(): DummyDriver {
  return new DummyDriver();
}