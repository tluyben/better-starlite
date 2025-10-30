/**
 * Plugin Interface for Better-Starlite
 *
 * This interface defines the contract for plugins that can transform SQL queries
 * and schemas between different database dialects and SQLite.
 */

/**
 * Represents a SQL data type mapping between databases
 */
export interface TypeMapping {
  sourceType: string;
  sqliteType: string;
  /** Optional conversion function for data transformation */
  converter?: (value: any) => any;
}

/**
 * Schema rewriting plugin interface
 * Translates CREATE TABLE, ALTER TABLE, and other DDL statements from
 * various database dialects to SQLite-compatible syntax
 */
export interface SchemaRewriterPlugin {
  /**
   * Name of the plugin (e.g., 'postgresql-schema', 'mysql-schema')
   */
  readonly name: string;

  /**
   * Source database dialect (e.g., 'postgresql', 'mysql', 'oracle', 'mssql')
   */
  readonly sourceDialect: string;

  /**
   * Rewrite a schema statement (CREATE TABLE, ALTER TABLE, etc.) to SQLite syntax
   * @param sql - The original SQL statement
   * @returns The rewritten SQL statement compatible with SQLite
   */
  rewriteSchema(sql: string): string;

  /**
   * Get type mappings for this database dialect
   * @returns Array of type mappings from source dialect to SQLite
   */
  getTypeMappings(): TypeMapping[];

  /**
   * Map a specific data type from source dialect to SQLite
   * @param sourceType - The source database type (e.g., 'VARCHAR2', 'BIGSERIAL')
   * @returns The equivalent SQLite type
   */
  mapType(sourceType: string): string;

  /**
   * Check if a feature is supported and needs translation
   * @param feature - Feature name (e.g., 'AUTO_INCREMENT', 'CHECK_CONSTRAINT')
   * @returns true if the feature needs translation
   */
  needsTranslation(feature: string): boolean;
}

/**
 * Query rewriting plugin interface
 * Translates SELECT, INSERT, UPDATE, DELETE and other DML statements from
 * various database dialects to SQLite-compatible syntax
 */
export interface QueryRewriterPlugin {
  /**
   * Name of the plugin (e.g., 'postgresql-query', 'mysql-query')
   */
  readonly name: string;

  /**
   * Source database dialect (e.g., 'postgresql', 'mysql', 'oracle', 'mssql')
   */
  readonly sourceDialect: string;

  /**
   * Rewrite a query statement to SQLite syntax
   * @param sql - The original SQL statement
   * @returns The rewritten SQL statement compatible with SQLite
   */
  rewriteQuery(sql: string): string;

  /**
   * Check if a query needs rewriting
   * @param sql - The SQL statement to check
   * @returns true if the query needs rewriting
   */
  needsRewrite(sql: string): boolean;

  /**
   * Rewrite function calls specific to the source database
   * @param functionCall - The function call to rewrite
   * @returns The equivalent SQLite function call
   */
  rewriteFunction?(functionCall: string): string;

  /**
   * Rewrite operators specific to the source database
   * @param operator - The operator to rewrite
   * @returns The equivalent SQLite operator
   */
  rewriteOperator?(operator: string): string;
}

/**
 * Plugin options that can be passed when applying plugins
 */
export interface PluginOptions {
  /**
   * Enable verbose logging
   */
  verbose?: boolean;

  /**
   * Throw errors on unsupported features instead of warnings
   */
  strict?: boolean;

  /**
   * Custom type mappings to override defaults
   */
  customTypeMappings?: TypeMapping[];

  /**
   * Enable/disable specific transformations
   */
  transformations?: {
    autoIncrement?: boolean;
    defaultValues?: boolean;
    constraints?: boolean;
    indexes?: boolean;
    functions?: boolean;
    operators?: boolean;
  };
}

/**
 * Plugin registry for managing schema and query rewriters
 */
export class PluginRegistry {
  private static schemaPlugins = new Map<string, SchemaRewriterPlugin>();
  private static queryPlugins = new Map<string, QueryRewriterPlugin>();

  /**
   * Register a schema rewriter plugin
   */
  static registerSchemaPlugin(plugin: SchemaRewriterPlugin): void {
    const key = `${plugin.sourceDialect}-schema`;
    this.schemaPlugins.set(key, plugin);
  }

  /**
   * Register a query rewriter plugin
   */
  static registerQueryPlugin(plugin: QueryRewriterPlugin): void {
    const key = `${plugin.sourceDialect}-query`;
    this.queryPlugins.set(key, plugin);
  }

  /**
   * Get a schema rewriter plugin by dialect
   */
  static getSchemaPlugin(dialect: string): SchemaRewriterPlugin | undefined {
    return this.schemaPlugins.get(`${dialect}-schema`);
  }

  /**
   * Get a query rewriter plugin by dialect
   */
  static getQueryPlugin(dialect: string): QueryRewriterPlugin | undefined {
    return this.queryPlugins.get(`${dialect}-query`);
  }

  /**
   * List all registered schema plugins
   */
  static listSchemaPlugins(): string[] {
    return Array.from(this.schemaPlugins.keys());
  }

  /**
   * List all registered query plugins
   */
  static listQueryPlugins(): string[] {
    return Array.from(this.queryPlugins.keys());
  }

  /**
   * Clear all registered plugins (useful for testing)
   */
  static clear(): void {
    this.schemaPlugins.clear();
    this.queryPlugins.clear();
  }
}

/**
 * Base class for schema rewriter plugins with common functionality
 */
export abstract class BaseSchemaRewriter implements SchemaRewriterPlugin {
  abstract readonly name: string;
  abstract readonly sourceDialect: string;

  protected typeMappings: Map<string, string> = new Map();
  protected options: PluginOptions;

  constructor(options: PluginOptions = {}) {
    this.options = {
      verbose: false,
      strict: false,
      transformations: {
        autoIncrement: true,
        defaultValues: true,
        constraints: true,
        indexes: true,
        functions: true,
        operators: true,
        ...options.transformations
      },
      ...options
    };
  }

  abstract rewriteSchema(sql: string): string;
  abstract getTypeMappings(): TypeMapping[];

  mapType(sourceType: string): string {
    const normalized = sourceType.toUpperCase().trim();

    // Check custom mappings first
    if (this.options.customTypeMappings) {
      const custom = this.options.customTypeMappings.find(
        m => m.sourceType.toUpperCase() === normalized
      );
      if (custom) return custom.sqliteType;
    }

    // Check built-in mappings
    const mapping = this.getTypeMappings().find(
      m => m.sourceType.toUpperCase() === normalized
    );

    if (mapping) return mapping.sqliteType;

    // Default fallback
    if (this.options.verbose) {
      console.warn(`No mapping found for type: ${sourceType}, using TEXT`);
    }

    return 'TEXT';
  }

  needsTranslation(feature: string): boolean {
    const transformations = this.options.transformations || {};
    const featureMap: Record<string, boolean> = {
      'AUTO_INCREMENT': transformations.autoIncrement !== false,
      'DEFAULT': transformations.defaultValues !== false,
      'CHECK': transformations.constraints !== false,
      'FOREIGN_KEY': transformations.constraints !== false,
      'INDEX': transformations.indexes !== false,
      'FUNCTION': transformations.functions !== false,
      'OPERATOR': transformations.operators !== false
    };

    return featureMap[feature.toUpperCase()] !== false;
  }

  protected log(message: string): void {
    if (this.options.verbose) {
      console.log(`[${this.name}] ${message}`);
    }
  }

  protected warn(message: string): void {
    if (this.options.strict) {
      throw new Error(`[${this.name}] ${message}`);
    } else {
      console.warn(`[${this.name}] ${message}`);
    }
  }
}

/**
 * Base class for query rewriter plugins with common functionality
 */
export abstract class BaseQueryRewriter implements QueryRewriterPlugin {
  abstract readonly name: string;
  abstract readonly sourceDialect: string;

  protected options: PluginOptions;

  constructor(options: PluginOptions = {}) {
    this.options = {
      verbose: false,
      strict: false,
      transformations: {
        functions: true,
        operators: true,
        ...options.transformations
      },
      ...options
    };
  }

  abstract rewriteQuery(sql: string): string;
  abstract needsRewrite(sql: string): boolean;

  rewriteFunction?(functionCall: string): string;
  rewriteOperator?(operator: string): string;

  protected log(message: string): void {
    if (this.options.verbose) {
      console.log(`[${this.name}] ${message}`);
    }
  }

  protected warn(message: string): void {
    if (this.options.strict) {
      throw new Error(`[${this.name}] ${message}`);
    } else {
      console.warn(`[${this.name}] ${message}`);
    }
  }
}
