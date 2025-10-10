/**
 * Better-Starlite - SAFE Entry Point (JavaScript)
 *
 * This entry point DOES NOT auto-import any drivers.
 * You must explicitly register drivers yourself.
 * This prevents ANY compilation issues on ANY platform.
 */

// Export the main Database class - this has NO platform dependencies
const { Database, Statement, DatabaseOptions } = require('./database.js');

// Export driver interface - also has NO platform dependencies
const {
  DriverRegistry,
  DatabaseInterface,
  StatementInterface,
  DriverOptions,
  RunResult,
  ColumnDefinition
} = require('./drivers/driver-interface.js');

module.exports = Database;
module.exports.default = Database;
module.exports.Database = Database;
module.exports.Statement = Statement;
module.exports.DatabaseOptions = DatabaseOptions;
module.exports.DriverRegistry = DriverRegistry;
module.exports.DatabaseInterface = DatabaseInterface;
module.exports.StatementInterface = StatementInterface;
module.exports.DriverOptions = DriverOptions;
module.exports.RunResult = RunResult;
module.exports.ColumnDefinition = ColumnDefinition;