/**
 * Better-Starlite - SAFE Entry Point
 *
 * This entry point DOES NOT auto-import any drivers.
 * You must explicitly register drivers yourself.
 * This prevents ANY compilation issues on ANY platform.
 */

// Export the main Database class - this has NO platform dependencies
export { default, Database, Statement, DatabaseOptions } from './database';

// Export driver interface - also has NO platform dependencies
export {
  DriverRegistry,
  DatabaseInterface,
  StatementInterface,
  DriverOptions,
  RunResult,
  ColumnDefinition
} from './drivers/driver-interface';

// Export types only (for TypeScript compatibility)
export type { Options, PragmaOptions, RegistrationOptions, AggregateOptions } from './types';

/**
 * IMPORTANT: NO DRIVERS ARE IMPORTED OR REGISTERED BY DEFAULT!
 *
 * You must explicitly import and register the drivers you need:
 *
 * Example for Node.js:
 * ```javascript
 * import Database, { DriverRegistry } from 'better-starlite';
 *
 * // Only import this if you're in Node.js!
 * import { createSqliteNodeDriver } from 'better-starlite/drivers/sqlite-node';
 * DriverRegistry.register('sqlite-node', createSqliteNodeDriver());
 *
 * const db = new Database('myapp.db');
 * ```
 *
 * Example for React Native:
 * ```javascript
 * import Database, { DriverRegistry } from 'better-starlite';
 *
 * // Import your React Native driver
 * import { createReactNativeDriver } from './my-rn-driver';
 * DriverRegistry.register('rn-sqlite', createReactNativeDriver());
 *
 * const db = new Database('myapp.db', { driver: 'rn-sqlite' });
 * ```
 */

// NO AUTO-REGISTRATION FUNCTIONS EXPORTED FROM MAIN ENTRY
// They must be imported separately if needed