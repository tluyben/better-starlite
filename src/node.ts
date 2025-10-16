/**
 * Better-Starlite - Node.js Entry Point
 *
 * This entry point auto-registers the Node.js SQLite driver.
 * ONLY use this if you're sure you're in a Node.js environment.
 */

import Database, { DriverRegistry } from './index-safe';

// Auto-register Node driver if available
if (typeof process !== 'undefined' && process.versions?.node) {
  try {
    // This will only be evaluated in Node.js
    const { createSqliteNodeDriver } = require('./drivers/sqlite-node-driver');
    const driver = createSqliteNodeDriver();
    if (driver.isAvailable()) {
      DriverRegistry.register('sqlite-node', driver);
      DriverRegistry.setDefault('sqlite-node');
    }
  } catch (e) {
    // If better-sqlite3 is not installed, that's OK
    console.warn('SQLite Node driver not available:', e instanceof Error ? e.message : String(e));
  }

  // Also try to register RQLite driver
  try {
    const { createRqliteDriver } = require('./drivers/rqlite-driver');
    const driver = createRqliteDriver();
    if (driver.isAvailable()) {
      DriverRegistry.register('rqlite', driver);
    }
  } catch (e) {
    // RQLite driver not available
  }
}

export default Database;
export { Database, DriverRegistry };
export * from './index-safe';