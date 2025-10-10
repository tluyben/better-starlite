/**
 * Driver exports for Better-Starlite
 *
 * This file exports driver utilities and factory functions.
 * Drivers are NOT automatically registered to avoid loading platform-specific code.
 *
 * Usage:
 *   import { DriverRegistry } from 'better-starlite/drivers';
 *   import { createSqliteNodeDriver } from 'better-starlite/drivers/sqlite-node';
 *
 *   // Only register the drivers you need
 *   DriverRegistry.register('sqlite-node', createSqliteNodeDriver());
 */

// Export the driver interface and registry
export {
  DriverRegistry,
  DriverFactory,
  DatabaseInterface,
  StatementInterface,
  DriverOptions,
  RunResult,
  ColumnDefinition,
  PragmaOptions,
  TransactionFunction
} from './driver-interface';

// Export driver factory functions (NOT the drivers themselves)
// This prevents platform-specific code from being loaded unless explicitly imported

/**
 * Helper function to auto-register available drivers.
 * This will only register drivers that are available in the current environment.
 *
 * @param drivers - Array of driver names to try to register
 */
export async function autoRegisterDrivers(drivers?: string[]): Promise<void> {
  const driversToTry = drivers || ['sqlite-node', 'sqlite-deno', 'rqlite', 'dummy'];

  for (const driverName of driversToTry) {
    try {
      switch (driverName) {
        case 'sqlite-node':
          if (typeof process !== 'undefined' && process.versions?.node) {
            const { createSqliteNodeDriver } = await import('./sqlite-node-driver');
            const driver = createSqliteNodeDriver();
            if (driver.isAvailable()) {
              DriverRegistry.register('sqlite-node', driver);
            }
          }
          break;

        case 'sqlite-deno':
          if (typeof (globalThis as any).Deno !== 'undefined') {
            const { createSqliteDenoDriver } = await import('./sqlite-deno-driver');
            const driver = createSqliteDenoDriver();
            if (driver.isAvailable()) {
              DriverRegistry.register('sqlite-deno', driver);
            }
          }
          break;

        case 'rqlite':
          if (typeof fetch !== 'undefined') {
            const { createRqliteDriver } = await import('./rqlite-driver');
            const driver = createRqliteDriver();
            if (driver.isAvailable()) {
              DriverRegistry.register('rqlite', driver);
            }
          }
          break;

        case 'dummy':
          const { createDummyDriver } = await import('./dummy-driver');
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
export function autoRegisterDriversSync(drivers?: string[]): void {
  const driversToTry = drivers || ['sqlite-node', 'rqlite', 'dummy'];

  for (const driverName of driversToTry) {
    try {
      switch (driverName) {
        case 'sqlite-node':
          if (typeof process !== 'undefined' && process.versions?.node && typeof require !== 'undefined') {
            const { createSqliteNodeDriver } = require('./sqlite-node-driver');
            const driver = createSqliteNodeDriver();
            if (driver.isAvailable()) {
              DriverRegistry.register('sqlite-node', driver);
            }
          }
          break;

        case 'rqlite':
          if (typeof fetch !== 'undefined') {
            const { createRqliteDriver } = require('./rqlite-driver');
            const driver = createRqliteDriver();
            if (driver.isAvailable()) {
              DriverRegistry.register('rqlite', driver);
            }
          }
          break;

        case 'dummy':
          const { createDummyDriver } = require('./dummy-driver');
          const driver = createDummyDriver();
          DriverRegistry.register('dummy', driver);
          break;
      }
    } catch (e) {
      // Silently ignore drivers that can't be loaded
    }
  }
}