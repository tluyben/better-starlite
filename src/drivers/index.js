/**
 * Driver exports for Better-Starlite (JavaScript)
 *
 * This file exports driver utilities and factory functions.
 * Drivers are NOT automatically registered to avoid loading platform-specific code.
 */

// Export the driver interface and registry
const { DriverRegistry } = require('./driver-interface.js');

/**
 * Helper function to auto-register available drivers.
 * This will only register drivers that are available in the current environment.
 *
 * @param {string[]} drivers - Array of driver names to try to register
 */
async function autoRegisterDrivers(drivers) {
  const driversToTry = drivers || ['sqlite-node', 'sqlite-deno', 'rqlite', 'dummy'];

  for (const driverName of driversToTry) {
    try {
      switch (driverName) {
        case 'sqlite-node':
          if (typeof process !== 'undefined' && process.versions && process.versions.node) {
            const { createSqliteNodeDriver } = require('./sqlite-node-driver.js');
            const driver = createSqliteNodeDriver();
            if (driver.isAvailable()) {
              DriverRegistry.register('sqlite-node', driver);
            }
          }
          break;

        case 'sqlite-deno':
          // Deno drivers need special handling
          if (typeof globalThis !== 'undefined' && globalThis.Deno) {
            // This would only work in Deno with actual async import
            console.warn('Deno driver requires Deno runtime');
          }
          break;

        case 'rqlite':
          if (typeof fetch !== 'undefined' || (typeof global !== 'undefined' && global.fetch)) {
            const { createRqliteDriver } = require('./rqlite-driver.js');
            const driver = createRqliteDriver();
            if (driver.isAvailable()) {
              DriverRegistry.register('rqlite', driver);
            }
          }
          break;

        case 'dummy':
          const { createDummyDriver } = require('./dummy-driver.js');
          const driver = createDummyDriver();
          DriverRegistry.register('dummy', driver);
          break;
      }
    } catch (e) {
      // Silently ignore drivers that can't be loaded
      // This is expected in environments where the driver isn't available
    }
  }
}

/**
 * Synchronous version of autoRegisterDrivers for environments that support it.
 * Note: This won't work for Deno's SQLite driver which requires async import.
 */
function autoRegisterDriversSync(drivers) {
  const driversToTry = drivers || ['sqlite-node', 'rqlite', 'dummy'];

  for (const driverName of driversToTry) {
    try {
      switch (driverName) {
        case 'sqlite-node':
          if (typeof process !== 'undefined' && process.versions && process.versions.node && typeof require !== 'undefined') {
            const { createSqliteNodeDriver } = require('./sqlite-node-driver.js');
            const driver = createSqliteNodeDriver();
            if (driver.isAvailable()) {
              DriverRegistry.register('sqlite-node', driver);
            }
          }
          break;

        case 'rqlite':
          if (typeof fetch !== 'undefined' || (typeof global !== 'undefined' && global.fetch)) {
            const { createRqliteDriver } = require('./rqlite-driver.js');
            const driver = createRqliteDriver();
            if (driver.isAvailable()) {
              DriverRegistry.register('rqlite', driver);
            }
          }
          break;

        case 'dummy':
          const { createDummyDriver } = require('./dummy-driver.js');
          const driver = createDummyDriver();
          DriverRegistry.register('dummy', driver);
          break;
      }
    } catch (e) {
      // Silently ignore drivers that can't be loaded
    }
  }
}

module.exports = {
  DriverRegistry,
  autoRegisterDrivers,
  autoRegisterDriversSync
};