/**
 * Better-Starlite Main Database Class (JavaScript)
 *
 * This is the main entry point that delegates to the appropriate driver.
 * It provides a consistent API regardless of which driver is used.
 */

const { DriverRegistry } = require('./drivers/driver-interface.js');

class Statement {
  constructor(stmt) {
    this.stmt = stmt;
  }

  run(...params) {
    return this.stmt.run(...params);
  }

  get(...params) {
    return this.stmt.get(...params);
  }

  all(...params) {
    return this.stmt.all(...params);
  }

  iterate(...params) {
    return this.stmt.iterate(...params);
  }

  pluck(toggleState) {
    this.stmt.pluck(toggleState);
    return this;
  }

  expand(toggleState) {
    this.stmt.expand(toggleState);
    return this;
  }

  raw(toggleState) {
    this.stmt.raw(toggleState);
    return this;
  }

  columns() {
    return this.stmt.columns();
  }

  bind(...params) {
    this.stmt.bind(...params);
    return this;
  }

  get source() {
    return this.stmt.source;
  }

  get reader() {
    return this.stmt.reader;
  }
}

class Database {
  constructor(filename, options = {}) {
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
            '  const { DriverRegistry } = require("better-starlite");\n' +
            '  const { createSqliteNodeDriver } = require("better-starlite/drivers/sqlite-node");\n' +
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
        `Failed to create database with driver "${this.driverName}": ${error.message}`
      );
    }
  }

  prepare(sql) {
    return new Statement(this.db.prepare(sql));
  }

  exec(sql) {
    this.db.exec(sql);
    return this;
  }

  transaction(fn) {
    return this.db.transaction(fn);
  }

  pragma(sql, options) {
    return this.db.pragma(sql, options);
  }

  backup(destination) {
    if (!this.db.backup) {
      throw new Error(`Driver "${this.driverName}" does not support backup`);
    }
    return this.db.backup(destination);
  }

  function(name, optionsOrFn, maybeFn) {
    if (typeof optionsOrFn === 'function') {
      this.db.function(name, optionsOrFn);
    } else {
      this.db.function(name, optionsOrFn, maybeFn);
    }
    return this;
  }

  aggregate(name, options) {
    this.db.aggregate(name, options);
    return this;
  }

  loadExtension(path) {
    this.db.loadExtension(path);
    return this;
  }

  close() {
    this.db.close();
    return this;
  }

  defaultSafeIntegers(toggleState) {
    this.db.defaultSafeIntegers(toggleState);
    return this;
  }

  unsafeMode(toggleState) {
    this.db.unsafeMode(toggleState);
    return this;
  }

  get inTransaction() {
    return this.db.inTransaction;
  }

  get name() {
    return this.db.name;
  }

  get open() {
    return this.db.open;
  }

  get readonly() {
    return this.db.readonly;
  }

  get memory() {
    return this.db.memory;
  }

  get driver() {
    return this.driverName;
  }

  static listDrivers() {
    return DriverRegistry.list();
  }

  static registerDriver(name, driver) {
    DriverRegistry.register(name, driver);
  }

  static setDefaultDriver(name) {
    DriverRegistry.setDefault(name);
  }
}

// Export everything
module.exports = Database;
module.exports.default = Database;
module.exports.Database = Database;
module.exports.Statement = Statement;
module.exports.DriverRegistry = DriverRegistry;