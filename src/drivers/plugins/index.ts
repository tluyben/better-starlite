/**
 * Plugin Index
 *
 * Central exports for all schema and query rewriting plugins
 */

// Plugin interface and base classes
export * from '../plugin-interface';

// PostgreSQL plugins
export * from './postgresql-schema-plugin';
export * from './postgresql-query-plugin';

// MySQL plugins
export * from './mysql-schema-plugin';
export * from './mysql-query-plugin';

// Oracle plugins
export * from './oracle-schema-plugin';
export * from './oracle-query-plugin';

// MSSQL plugins
export * from './mssql-schema-plugin';
export * from './mssql-query-plugin';

/**
 * Register all plugins at once
 */
import { PluginRegistry } from '../plugin-interface';
import { createPostgreSQLSchemaRewriter } from './postgresql-schema-plugin';
import { createPostgreSQLQueryRewriter } from './postgresql-query-plugin';
import { createMySQLSchemaRewriter } from './mysql-schema-plugin';
import { createMySQLQueryRewriter } from './mysql-query-plugin';
import { createOracleSchemaRewriter } from './oracle-schema-plugin';
import { createOracleQueryRewriter } from './oracle-query-plugin';
import { createMSSQLSchemaRewriter } from './mssql-schema-plugin';
import { createMSSQLQueryRewriter } from './mssql-query-plugin';

export function registerAllPlugins(options?: any): void {
  // Register PostgreSQL plugins
  PluginRegistry.registerSchemaPlugin(createPostgreSQLSchemaRewriter(options));
  PluginRegistry.registerQueryPlugin(createPostgreSQLQueryRewriter(options));

  // Register MySQL plugins
  PluginRegistry.registerSchemaPlugin(createMySQLSchemaRewriter(options));
  PluginRegistry.registerQueryPlugin(createMySQLQueryRewriter(options));

  // Register Oracle plugins
  PluginRegistry.registerSchemaPlugin(createOracleSchemaRewriter(options));
  PluginRegistry.registerQueryPlugin(createOracleQueryRewriter(options));

  // Register MSSQL plugins
  PluginRegistry.registerSchemaPlugin(createMSSQLSchemaRewriter(options));
  PluginRegistry.registerQueryPlugin(createMSSQLQueryRewriter(options));
}
