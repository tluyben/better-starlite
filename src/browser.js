/**
 * Better-Starlite - Browser Entry Point (JavaScript)
 *
 * This entry point only registers web-safe drivers.
 * Safe to use in browser environments.
 */

const Database = require('./index-safe.js');
const { DriverRegistry } = require('./drivers/driver-interface.js');

// Only register web-safe drivers
if (typeof window !== 'undefined' || typeof globalThis !== 'undefined') {
  // Register dummy driver for testing/development
  try {
    const { createDummyDriver } = require('./drivers/dummy-driver.js');
    const driver = createDummyDriver();
    DriverRegistry.register('dummy', driver);
  } catch (e) {
    // Dummy driver not available
  }

  // Register RQLite driver if fetch is available
  if (typeof fetch !== 'undefined') {
    try {
      const { createRqliteDriver } = require('./drivers/rqlite-driver.js');
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

module.exports = Database;
module.exports.default = Database;
module.exports.Database = Database;
module.exports.DriverRegistry = DriverRegistry;