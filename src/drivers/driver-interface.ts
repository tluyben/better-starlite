/**
 * Better-Starlite Driver Interface
 *
 * This interface defines the contract that all database drivers must implement
 * to work with better-starlite. This allows for platform-specific implementations
 * without causing compilation issues when the library is imported in different environments.
 */

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface ColumnDefinition {
  name: string;
  column: string | null;
  table: string | null;
  database: string | null;
  type: string | null;
  default: any;
  nullable: boolean;
}

export interface PragmaOptions {
  simple?: boolean;
}

export interface StatementInterface {
  // Core execution methods
  run(...params: any[]): RunResult;
  get(...params: any[]): any;
  all(...params: any[]): any[];
  iterate(...params: any[]): IterableIterator<any>;

  // Configuration methods
  pluck(toggleState?: boolean): this;
  expand(toggleState?: boolean): this;
  raw(toggleState?: boolean): this;
  bind(...params: any[]): this;

  // Information methods
  columns(): ColumnDefinition[] | undefined;

  // Properties
  readonly source: string;
  readonly reader: boolean;
}

export interface TransactionFunction {
  (...args: any[]): any;
}

export interface DatabaseInterface {
  // Core database operations
  prepare(sql: string): StatementInterface;
  exec(sql: string): this;
  transaction(fn: TransactionFunction): TransactionFunction;
  pragma(sql: string, options?: PragmaOptions): any;

  // Connection management
  close(): this;

  // Extension and function support
  function(name: string, fn: (...args: any[]) => any): this;
  function(name: string, options: any, fn: (...args: any[]) => any): this;
  aggregate(name: string, options: any): this;
  loadExtension(path: string): this;

  // Configuration
  defaultSafeIntegers(toggleState?: boolean): this;
  unsafeMode(toggleState?: boolean): this;

  // Backup support (optional for some drivers)
  backup?(destination: string): Promise<Buffer>;

  // Properties
  readonly inTransaction: boolean;
  readonly name: string;
  readonly open: boolean;
  readonly readonly: boolean;
  readonly memory: boolean;
}

export interface DriverOptions {
  // Common options for all drivers
  readonly?: boolean;
  verbose?: boolean;
  timeout?: number;
  disableWAL?: boolean;

  // RQLite specific
  rqliteLevel?: 'none' | 'weak' | 'linearizable';

  // Better-sqlite3 specific options (kept generic)
  [key: string]: any;
}

export interface DriverFactory {
  /**
   * Creates a new database connection
   * @param filename - Database file path, ':memory:' for in-memory, or URL for remote databases
   * @param options - Driver-specific options
   */
  createDatabase(filename: string, options?: DriverOptions): DatabaseInterface;

  /**
   * Returns the name of this driver
   */
  readonly name: string;

  /**
   * Returns true if this driver is available in the current environment
   */
  isAvailable(): boolean;

  /**
   * Returns a list of supported features
   */
  readonly features: {
    backup: boolean;
    loadExtension: boolean;
    customFunctions: boolean;
    customAggregates: boolean;
    transactions: boolean;
    wal: boolean;
  };
}

/**
 * Global registry for database drivers
 */
export class DriverRegistry {
  private static drivers = new Map<string, DriverFactory>();
  private static defaultDriver: string | null = null;

  /**
   * Register a new driver
   */
  static register(name: string, driver: DriverFactory): void {
    this.drivers.set(name, driver);

    // Set as default if it's the first driver or if explicitly marked
    if (!this.defaultDriver && driver.isAvailable()) {
      this.defaultDriver = name;
    }
  }

  /**
   * Get a driver by name
   */
  static get(name: string): DriverFactory | undefined {
    return this.drivers.get(name);
  }

  /**
   * Get the default driver
   */
  static getDefault(): DriverFactory | null {
    if (!this.defaultDriver) {
      // Try to find any available driver
      for (const [name, driver] of this.drivers) {
        if (driver.isAvailable()) {
          this.defaultDriver = name;
          return driver;
        }
      }
      return null;
    }
    return this.drivers.get(this.defaultDriver) || null;
  }

  /**
   * Set the default driver
   */
  static setDefault(name: string): void {
    if (!this.drivers.has(name)) {
      throw new Error(`Driver "${name}" not registered`);
    }
    this.defaultDriver = name;
  }

  /**
   * List all registered drivers
   */
  static list(): { name: string; available: boolean; features: any }[] {
    const list = [];
    for (const [name, driver] of this.drivers) {
      list.push({
        name,
        available: driver.isAvailable(),
        features: driver.features
      });
    }
    return list;
  }

  /**
   * Clear all registered drivers (useful for testing)
   */
  static clear(): void {
    this.drivers.clear();
    this.defaultDriver = null;
  }
}