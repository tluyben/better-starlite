/**
 * Better-Starlite - Browser Entry Point
 *
 * This entry point only registers web-safe drivers.
 * Safe to use in browser environments.
 */

import Database, { DriverRegistry } from './index-safe';

// Only register web-safe drivers
if (typeof (globalThis as any).window !== 'undefined' || typeof globalThis !== 'undefined') {
  // Register dummy driver for testing/development
  try {
    const { createDummyDriver } = require('./drivers/dummy-driver');
    const driver = createDummyDriver();
    DriverRegistry.register('dummy', driver);
  } catch (e) {
    // Dummy driver not available
  }

  // Register RQLite driver if fetch is available
  if (typeof fetch !== 'undefined') {
    try {
      const { createRqliteDriver } = require('./drivers/rqlite-driver');
      const driver = createRqliteDriver();
      if (driver.isAvailable()) {
        DriverRegistry.register('rqlite', driver);
        DriverRegistry.setDefault('rqlite');
      }
    } catch (e) {
      // RQLite driver not available
    }
  }
}

export default Database;
export { Database, DriverRegistry };
export * from './index-safe';