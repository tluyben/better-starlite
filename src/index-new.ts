/**
 * Better-Starlite - Universal SQLite/RQLite Interface
 *
 * This is the main entry point for the library.
 * Drivers are not automatically loaded to avoid platform-specific issues.
 *
 * Usage:
 *   // Option 1: Auto-register available drivers
 *   import Database from 'better-starlite';
 *   import { autoRegisterDrivers } from 'better-starlite/drivers';
 *
 *   await autoRegisterDrivers(); // Or autoRegisterDriversSync() for sync
 *   const db = new Database('mydb.db');
 *
 *   // Option 2: Manually register specific drivers
 *   import Database, { DriverRegistry } from 'better-starlite';
 *   import { createSqliteNodeDriver } from 'better-starlite/drivers/sqlite-node';
 *
 *   DriverRegistry.register('sqlite-node', createSqliteNodeDriver());
 *   const db = new Database('mydb.db', { driver: 'sqlite-node' });
 */

// Export the main Database class
export { default, Database, Statement, DatabaseOptions } from './database';

// Export driver utilities
export {
  DriverRegistry,
  DatabaseInterface,
  StatementInterface,
  DriverOptions,
  RunResult,
  ColumnDefinition
} from './drivers/driver-interface';

// Export auto-registration helpers
export { autoRegisterDrivers, autoRegisterDriversSync } from './drivers';

// Export async database if it exists
export { AsyncDatabase, AsyncStatement } from './async';

// Export drizzle adapter if it exists
export { drizzle } from './drizzle';

// Type exports for better-sqlite3 compatibility
export interface Options {
  readonly?: boolean;
  fileMustExist?: boolean;
  timeout?: number;
  verbose?: boolean;
  nativeBinding?: string;
}

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
  nullable: boolean;
  default: any;
}

export interface PragmaOptions {
  simple?: boolean;
}

export interface RegistrationOptions {
  varargs?: boolean;
  deterministic?: boolean;
  safeIntegers?: boolean;
}

export interface AggregateOptions extends RegistrationOptions {
  seed?: any;
  step: (total: any, next: any) => any;
  inverse?: (total: any, next: any) => any;
  result?: (total: any) => any;
}