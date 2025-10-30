/**
 * SQLite to PostgreSQL Schema Rewriter Plugin
 *
 * Translates SQLite schema definitions to PostgreSQL-compatible syntax
 */

import {
  BaseSchemaRewriter,
  TypeMapping,
  PluginOptions
} from '../plugin-interface';

export class PostgreSQLSchemaRewriter extends BaseSchemaRewriter {
  readonly name = 'postgresql-schema';
  readonly sourceDialect = 'postgresql';

  constructor(options: PluginOptions = {}) {
    super(options);
  }

  getTypeMappings(): TypeMapping[] {
    return [
      // Integer types
      { sourceType: 'SMALLINT', sqliteType: 'INTEGER' },
      { sourceType: 'INT', sqliteType: 'INTEGER' },
      { sourceType: 'INTEGER', sqliteType: 'INTEGER' },
      { sourceType: 'BIGINT', sqliteType: 'INTEGER' },
      { sourceType: 'SMALLSERIAL', sqliteType: 'INTEGER' },
      { sourceType: 'SERIAL', sqliteType: 'INTEGER' },
      { sourceType: 'BIGSERIAL', sqliteType: 'INTEGER' },

      // Numeric types
      { sourceType: 'DECIMAL', sqliteType: 'REAL' },
      { sourceType: 'NUMERIC', sqliteType: 'REAL' },
      { sourceType: 'REAL', sqliteType: 'REAL' },
      { sourceType: 'DOUBLE PRECISION', sqliteType: 'REAL' },
      { sourceType: 'MONEY', sqliteType: 'REAL' },

      // String types
      { sourceType: 'VARCHAR', sqliteType: 'TEXT' },
      { sourceType: 'CHAR', sqliteType: 'TEXT' },
      { sourceType: 'CHARACTER', sqliteType: 'TEXT' },
      { sourceType: 'CHARACTER VARYING', sqliteType: 'TEXT' },
      { sourceType: 'TEXT', sqliteType: 'TEXT' },

      // Date/Time types
      { sourceType: 'TIMESTAMP', sqliteType: 'TEXT' },
      { sourceType: 'TIMESTAMP WITHOUT TIME ZONE', sqliteType: 'TEXT' },
      { sourceType: 'TIMESTAMP WITH TIME ZONE', sqliteType: 'TEXT' },
      { sourceType: 'TIMESTAMPTZ', sqliteType: 'TEXT' },
      { sourceType: 'DATE', sqliteType: 'TEXT' },
      { sourceType: 'TIME', sqliteType: 'TEXT' },
      { sourceType: 'TIME WITHOUT TIME ZONE', sqliteType: 'TEXT' },
      { sourceType: 'TIME WITH TIME ZONE', sqliteType: 'TEXT' },
      { sourceType: 'TIMETZ', sqliteType: 'TEXT' },
      { sourceType: 'INTERVAL', sqliteType: 'TEXT' },

      // Boolean type
      { sourceType: 'BOOLEAN', sqliteType: 'INTEGER' },
      { sourceType: 'BOOL', sqliteType: 'INTEGER' },

      // Binary types
      { sourceType: 'BYTEA', sqliteType: 'BLOB' },

      // JSON types
      { sourceType: 'JSON', sqliteType: 'TEXT' },
      { sourceType: 'JSONB', sqliteType: 'TEXT' },

      // UUID type
      { sourceType: 'UUID', sqliteType: 'TEXT' },

      // Array types (stored as JSON text)
      { sourceType: 'ARRAY', sqliteType: 'TEXT' },

      // Other types
      { sourceType: 'XML', sqliteType: 'TEXT' },
      { sourceType: 'CIDR', sqliteType: 'TEXT' },
      { sourceType: 'INET', sqliteType: 'TEXT' },
      { sourceType: 'MACADDR', sqliteType: 'TEXT' }
    ];
  }

  rewriteSchema(sql: string): string {
    this.log(`Rewriting SQLite to PostgreSQL schema: ${sql.substring(0, 50)}...`);

    let rewritten = sql;

    // Convert SQLite AUTOINCREMENT to PostgreSQL SERIAL
    // INTEGER PRIMARY KEY AUTOINCREMENT → SERIAL PRIMARY KEY
    rewritten = rewritten.replace(/\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/gi, 'SERIAL PRIMARY KEY');

    // Handle standalone AUTOINCREMENT (shouldn't appear but just in case)
    rewritten = rewritten.replace(/\bAUTOINCREMENT\b/gi, 'SERIAL');

    // Special case: TEXT columns with CURRENT_TIMESTAMP default should be TIMESTAMP in PostgreSQL
    rewritten = rewritten.replace(/\bTEXT\s+DEFAULT\s+CURRENT_TIMESTAMP\b/gi, 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');

    // Convert TEXT to VARCHAR (PostgreSQL prefers VARCHAR for variable-length strings)
    // SQLite uses TEXT everywhere, PostgreSQL is more specific
    rewritten = rewritten.replace(/\bTEXT\b/gi, 'VARCHAR(255)');

    // CURRENT_TIMESTAMP is supported by both SQLite and PostgreSQL, no conversion needed

    // Clean up extra whitespace
    rewritten = rewritten.replace(/\s+/g, ' ').trim();

    this.log(`Rewritten schema: ${rewritten.substring(0, 50)}...`);

    return rewritten;
  }

  private convertDataTypes(sql: string): string {
    let result = sql;

    // Match type definitions with optional size/precision
    const typeRegex = /\b(\w+(?:\s+\w+)*)\s*(?:\((\d+(?:,\s*\d+)?)\))?/g;

    const typeMappings = this.getTypeMappings();
    const typeMap = new Map(
      typeMappings.map(m => [m.sourceType.toUpperCase(), m.sqliteType])
    );

    result = result.replace(typeRegex, (match, typeName, size): string => {
      const normalizedType = typeName.toUpperCase().trim();

      // Check if this is a known PostgreSQL type
      if (typeMap.has(normalizedType)) {
        const sqliteType = typeMap.get(normalizedType)!;

        // For INTEGER types in SQLite, we don't need size
        // For TEXT types, size is ignored in SQLite but we can keep it
        if (sqliteType === 'INTEGER' || sqliteType === 'REAL') {
          return sqliteType;
        } else if (size) {
          return `${sqliteType}(${size})`;
        } else {
          return sqliteType;
        }
      }

      return match;
    });

    return result;
  }

  private convertDefaultValues(sql: string): string {
    let result = sql;

    // Convert PostgreSQL NOW() to SQLite CURRENT_TIMESTAMP
    result = result.replace(/DEFAULT\s+NOW\(\)/gi, "DEFAULT CURRENT_TIMESTAMP");

    // Convert PostgreSQL CURRENT_TIMESTAMP
    result = result.replace(/DEFAULT\s+CURRENT_TIMESTAMP/gi, "DEFAULT CURRENT_TIMESTAMP");

    // Convert PostgreSQL gen_random_uuid() - SQLite doesn't have built-in UUID
    if (result.match(/gen_random_uuid\(\)/i)) {
      this.warn('gen_random_uuid() is not supported in SQLite. You may need to generate UUIDs in application code.');
      result = result.replace(/DEFAULT\s+gen_random_uuid\(\)/gi, '');
    }

    // Convert PostgreSQL nextval() for sequences
    if (result.match(/nextval\(/i)) {
      this.warn('nextval() sequences are not supported in SQLite. Consider using AUTOINCREMENT.');
      result = result.replace(/DEFAULT\s+nextval\([^)]+\)/gi, '');
    }

    // Convert boolean defaults
    result = result.replace(/DEFAULT\s+(TRUE|FALSE)/gi, (match, bool) => {
      return `DEFAULT ${bool.toUpperCase() === 'TRUE' ? '1' : '0'}`;
    });

    return result;
  }

  private convertCheckConstraints(sql: string): string {
    let result = sql;

    // SQLite supports CHECK constraints, but we need to ensure they use compatible syntax
    // Convert boolean checks: column = TRUE/FALSE to column = 1/0
    result = result.replace(
      /CHECK\s*\(([^)]*)(TRUE|FALSE)([^)]*)\)/gi,
      (match, before, bool, after) => {
        const value = bool.toUpperCase() === 'TRUE' ? '1' : '0';
        return `CHECK(${before}${value}${after})`;
      }
    );

    return result;
  }

  private convertIndexes(sql: string): string {
    // PostgreSQL CREATE INDEX syntax is very similar to SQLite
    // Main differences are in advanced features like partial indexes and expression indexes

    let result = sql;

    // Remove CONCURRENTLY keyword (not supported in SQLite)
    result = result.replace(/CREATE\s+INDEX\s+CONCURRENTLY/gi, 'CREATE INDEX');

    // Remove USING method specifications (btree, hash, etc.)
    result = result.replace(/USING\s+(btree|hash|gist|gin|brin)/gi, '');

    // Handle partial indexes (WHERE clause) - SQLite supports this
    // No changes needed for this

    return result;
  }

  private removeUnsupportedFeatures(sql: string): string {
    let result = sql;

    // Remove table storage parameters
    result = result.replace(/WITH\s*\([^)]+\)/gi, '');

    // Remove tablespace specifications
    result = result.replace(/TABLESPACE\s+\w+/gi, '');

    // Remove inheritance (INHERITS)
    if (result.match(/INHERITS/i)) {
      this.warn('Table inheritance (INHERITS) is not supported in SQLite.');
      result = result.replace(/INHERITS\s*\([^)]+\)/gi, '');
    }

    // Remove schemas from table names (SQLite doesn't have schemas)
    result = result.replace(/\b(\w+)\.(\w+)\b/g, '$2');

    // Remove OWNER TO
    result = result.replace(/OWNER\s+TO\s+\w+/gi, '');

    // Remove GRANT statements (handle separately)
    if (result.match(/GRANT/i)) {
      this.warn('GRANT statements are not supported in SQLite.');
      // Don't remove, let it fail or be handled separately
    }

    // Remove ALTER TABLE ... SET statements
    result = result.replace(/ALTER\s+TABLE\s+\w+\s+SET\s+[^;]+;/gi, '');

    // Remove COMMENT ON statements
    if (result.match(/COMMENT\s+ON/i)) {
      this.warn('COMMENT ON statements are not supported in SQLite.');
      result = result.replace(/COMMENT\s+ON\s+[^;]+;/gi, '');
    }

    return result;
  }
}

/**
 * Factory function to create PostgreSQL schema rewriter
 */
export function createPostgreSQLSchemaRewriter(options?: PluginOptions): PostgreSQLSchemaRewriter {
  return new PostgreSQLSchemaRewriter(options);
}
