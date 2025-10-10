/**
 * Better-Starlite Driver Interface (JavaScript)
 *
 * This file contains the driver registry and interface definitions.
 * Pure JavaScript with no platform dependencies.
 */

/**
 * Global registry for database drivers
 */
class DriverRegistry {
  static drivers = new Map();
  static defaultDriver = null;

  /**
   * Register a new driver
   */
  static register(name, driver) {
    this.drivers.set(name, driver);

    // Set as default if it's the first driver or if explicitly marked
    if (!this.defaultDriver && driver.isAvailable()) {
      this.defaultDriver = name;
    }
  }

  /**
   * Get a driver by name
   */
  static get(name) {
    return this.drivers.get(name);
  }

  /**
   * Get the default driver
   */
  static getDefault() {
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
  static setDefault(name) {
    if (!this.drivers.has(name)) {
      throw new Error(`Driver "${name}" not registered`);
    }
    this.defaultDriver = name;
  }

  /**
   * List all registered drivers
   */
  static list() {
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
  static clear() {
    this.drivers.clear();
    this.defaultDriver = null;
  }
}

module.exports = {
  DriverRegistry
};