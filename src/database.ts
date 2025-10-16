/**
 * Better-Starlite Main Database Class
 *
 * This is the main entry point that delegates to the appropriate driver.
 * It provides a consistent API regardless of which driver is used.
 */

import {
  DatabaseInterface,
  StatementInterface,
  DriverRegistry,
  DriverOptions,
  RunResult,
  ColumnDefinition,
  PragmaOptions,
  TransactionFunction
} from './drivers/driver-interface';

export interface DatabaseOptions extends DriverOptions {
  /**
   * The driver to use. If not specified, the default driver will be used.
   * You can specify:
   * - A registered driver name (e.g., 'sqlite-node', 'rqlite', 'dummy')
   * - 'auto' to automatically detect based on the filename/URL
   */
  driver?: string | 'auto';
}

export class Statement implements StatementInterface {
  private stmt: StatementInterface;

  constructor(stmt: StatementInterface) {
    this.stmt = stmt;
  }

  run(...params: any[]): RunResult {
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

  columns(): ColumnDefinition[] | undefined {
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

export default class Database implements DatabaseInterface {
  private db: DatabaseInterface;
  private driverName: string;

  constructor(filename: string, options: DatabaseOptions = {}) {
    // Determine which driver to use
    let driver;

    if (options.driver === 'auto' || !options.driver) {
      // Auto-detect driver based on filename
      if (filename.startsWith('http://') || filename.startsWith('https://')) {
        // Use RQLite for HTTP(S) URLs
        driver = DriverRegistry.get('rqlite');
        if (!driver) {
          throw new Error('RQLite driver not registered. Please register it first.');
        }
      } else {
        // Use default driver for file paths
        driver = DriverRegistry.getDefault();
        if (!driver) {
          throw new Error(
            'No default driver available. Please register a driver first.\n' +
            'Example:\n' +
            '  import { DriverRegistry } from "better-starlite/drivers";\n' +
            '  import { createSqliteNodeDriver } from "better-starlite/drivers/sqlite-node";\n' +
            '  DriverRegistry.register("sqlite-node", createSqliteNodeDriver());'
          );
        }
      }
      this.driverName = driver.name;
    } else {
      // Use specified driver
      driver = DriverRegistry.get(options.driver);
      if (!driver) {
        const available = DriverRegistry.list()
          .map(d => `  - ${d.name} (${d.available ? 'available' : 'not available'})`)
          .join('\n');

        throw new Error(
          `Driver "${options.driver}" not found.\n` +
          `Registered drivers:\n${available || '  (none)'}`
        );
      }
      this.driverName = options.driver;
    }

    // Check if driver is available
    if (!driver.isAvailable()) {
      throw new Error(
        `Driver "${this.driverName}" is not available in this environment.\n` +
        `This driver may require specific runtime dependencies or environment.`
      );
    }

    // Create database instance using the driver
    try {
      this.db = driver.createDatabase(filename, options);
    } catch (error) {
      throw new Error(
        `Failed to create database with driver "${this.driverName}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  prepare(sql: string): Statement {
    return new Statement(this.db.prepare(sql));
  }

  exec(sql: string): this {
    this.db.exec(sql);
    return this;
  }

  transaction(fn: TransactionFunction): TransactionFunction {
    return this.db.transaction(fn);
  }

  pragma(sql: string, options?: PragmaOptions): any {
    return this.db.pragma(sql, options);
  }

  backup(destination: string): Promise<Buffer> {
    if (!this.db.backup) {
      throw new Error(`Driver "${this.driverName}" does not support backup`);
    }
    return this.db.backup(destination);
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

  /**
   * Get the name of the driver being used
   */
  get driver(): string {
    return this.driverName;
  }

  /**
   * Get information about available drivers
   */
  static listDrivers() {
    return DriverRegistry.list();
  }

  /**
   * Register a driver
   */
  static registerDriver(name: string, driver: any) {
    DriverRegistry.register(name, driver);
  }

  /**
   * Set the default driver
   */
  static setDefaultDriver(name: string) {
    DriverRegistry.setDefault(name);
  }
}

// Export the main class as both default and named export
export { Database };

// Re-export driver-related types and utilities
export {
  DriverRegistry,
  DatabaseInterface,
  StatementInterface,
  DriverOptions,
  RunResult,
  ColumnDefinition
} from './drivers/driver-interface';