/**
 * SQLite to MySQL Schema Rewriter Plugin
 *
 * Translates SQLite schema definitions to MySQL-compatible syntax
 */

import {
  BaseSchemaRewriter,
  TypeMapping,
  PluginOptions
} from '../plugin-interface';

export class MySQLSchemaRewriter extends BaseSchemaRewriter {
  readonly name = 'mysql-schema';
  readonly sourceDialect = 'mysql';

  constructor(options: PluginOptions = {}) {
    super(options);
  }

  getTypeMappings(): TypeMapping[] {
    return [
      // Integer types
      { sourceType: 'TINYINT', sqliteType: 'INTEGER' },
      { sourceType: 'SMALLINT', sqliteType: 'INTEGER' },
      { sourceType: 'MEDIUMINT', sqliteType: 'INTEGER' },
      { sourceType: 'INT', sqliteType: 'INTEGER' },
      { sourceType: 'INTEGER', sqliteType: 'INTEGER' },
      { sourceType: 'BIGINT', sqliteType: 'INTEGER' },

      // Numeric types
      { sourceType: 'DECIMAL', sqliteType: 'REAL' },
      { sourceType: 'NUMERIC', sqliteType: 'REAL' },
      { sourceType: 'FLOAT', sqliteType: 'REAL' },
      { sourceType: 'DOUBLE', sqliteType: 'REAL' },
      { sourceType: 'DOUBLE PRECISION', sqliteType: 'REAL' },
      { sourceType: 'REAL', sqliteType: 'REAL' },

      // String types
      { sourceType: 'CHAR', sqliteType: 'TEXT' },
      { sourceType: 'VARCHAR', sqliteType: 'TEXT' },
      { sourceType: 'TINYTEXT', sqliteType: 'TEXT' },
      { sourceType: 'TEXT', sqliteType: 'TEXT' },
      { sourceType: 'MEDIUMTEXT', sqliteType: 'TEXT' },
      { sourceType: 'LONGTEXT', sqliteType: 'TEXT' },

      // Binary types
      { sourceType: 'BINARY', sqliteType: 'BLOB' },
      { sourceType: 'VARBINARY', sqliteType: 'BLOB' },
      { sourceType: 'TINYBLOB', sqliteType: 'BLOB' },
      { sourceType: 'BLOB', sqliteType: 'BLOB' },
      { sourceType: 'MEDIUMBLOB', sqliteType: 'BLOB' },
      { sourceType: 'LONGBLOB', sqliteType: 'BLOB' },

      // Date/Time types
      { sourceType: 'DATE', sqliteType: 'TEXT' },
      { sourceType: 'DATETIME', sqliteType: 'TEXT' },
      { sourceType: 'TIMESTAMP', sqliteType: 'TEXT' },
      { sourceType: 'TIME', sqliteType: 'TEXT' },
      { sourceType: 'YEAR', sqliteType: 'INTEGER' },

      // Boolean/Bit types
      { sourceType: 'BOOLEAN', sqliteType: 'INTEGER' },
      { sourceType: 'BOOL', sqliteType: 'INTEGER' },
      { sourceType: 'BIT', sqliteType: 'INTEGER' },

      // JSON type
      { sourceType: 'JSON', sqliteType: 'TEXT' },

      // Enum and Set (stored as TEXT)
      { sourceType: 'ENUM', sqliteType: 'TEXT' },
      { sourceType: 'SET', sqliteType: 'TEXT' },

      // Spatial types (stored as BLOB)
      { sourceType: 'GEOMETRY', sqliteType: 'BLOB' },
      { sourceType: 'POINT', sqliteType: 'BLOB' },
      { sourceType: 'LINESTRING', sqliteType: 'BLOB' },
      { sourceType: 'POLYGON', sqliteType: 'BLOB' }
    ];
  }

  rewriteSchema(sql: string): string {
    this.log(`Rewriting SQLite to MySQL schema: ${sql.substring(0, 50)}...`);

    let rewritten = sql;

    // Convert SQLite AUTOINCREMENT to MySQL AUTO_INCREMENT
    rewritten = rewritten.replace(/\bAUTOINCREMENT\b/gi, 'AUTO_INCREMENT');

    // Special case: TEXT columns with CURRENT_TIMESTAMP default should be TIMESTAMP in MySQL
    rewritten = rewritten.replace(/\bTEXT\s+DEFAULT\s+CURRENT_TIMESTAMP\b/gi, 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');

    // Convert SQLite TEXT to MySQL VARCHAR (for most cases)
    // Keep simple - can be enhanced later with size hints
    rewritten = rewritten.replace(/\bTEXT\b/gi, 'VARCHAR(255)');

    // Clean up extra whitespace
    rewritten = rewritten.replace(/\s+/g, ' ').trim();

    this.log(`Rewritten schema: ${rewritten.substring(0, 50)}...`);

    return rewritten;
  }

  private convertUnsignedIntegers(sql: string): string {
    // SQLite doesn't have unsigned integers, but we can use CHECK constraints
    let result = sql;

    // Convert UNSIGNED attribute to CHECK constraint
    const unsignedRegex = /(\w+)\s+(TINY|SMALL|MEDIUM|BIG)?INT(?:EGER)?\s+UNSIGNED/gi;

    result = result.replace(unsignedRegex, (match, columnName, size) => {
      const intType = size ? `${size}INT` : 'INT';
      this.log(`Converting UNSIGNED ${intType} for column ${columnName}`);

      // We'll just use INTEGER and add a note
      // The CHECK constraint would need to be added separately
      return `${columnName} INTEGER`;
    });

    return result;
  }

  private convertDataTypes(sql: string): string {
    let result = sql;

    // Match type definitions with optional size/precision and attributes
    const typeRegex = /\b(\w+)\s*(?:\(([^)]+)\))?(?:\s+(UNSIGNED|ZEROFILL|CHARACTER SET \w+|COLLATE \w+))*\s*/gi;

    const typeMappings = this.getTypeMappings();
    const typeMap = new Map(
      typeMappings.map(m => [m.sourceType.toUpperCase(), m.sqliteType])
    );

    // Process each type definition
    result = result.replace(typeRegex, (match, typeName, sizeOrValues, attributes) => {
      const normalizedType = typeName.toUpperCase().trim();

      // Check if this is a known MySQL type
      if (typeMap.has(normalizedType)) {
        const sqliteType = typeMap.get(normalizedType);

        // For INTEGER and REAL types in SQLite, we don't need size
        if (sqliteType === 'INTEGER' || sqliteType === 'REAL') {
          return `${sqliteType} `;
        } else if (sizeOrValues && normalizedType !== 'ENUM' && normalizedType !== 'SET') {
          return `${sqliteType}(${sizeOrValues}) `;
        } else {
          return `${sqliteType} `;
        }
      }

      return match;
    });

    return result;
  }

  private convertDefaultValues(sql: string): string {
    let result = sql;

    // Convert MySQL NOW() to SQLite CURRENT_TIMESTAMP
    result = result.replace(/DEFAULT\s+NOW\(\)/gi, "DEFAULT CURRENT_TIMESTAMP");

    // Convert MySQL CURRENT_TIMESTAMP
    result = result.replace(/DEFAULT\s+CURRENT_TIMESTAMP(?:\(\))?/gi, "DEFAULT CURRENT_TIMESTAMP");

    // Convert MySQL CURDATE() to date('now')
    result = result.replace(/DEFAULT\s+CURDATE\(\)/gi, "DEFAULT (date('now'))");

    // Convert MySQL CURTIME() to time('now')
    result = result.replace(/DEFAULT\s+CURTIME\(\)/gi, "DEFAULT (time('now'))");

    // Handle ON UPDATE CURRENT_TIMESTAMP (not supported in SQLite)
    if (result.match(/ON UPDATE CURRENT_TIMESTAMP/i)) {
      this.warn('ON UPDATE CURRENT_TIMESTAMP is not supported in SQLite. You may need to handle updates in application code.');
      result = result.replace(/ON\s+UPDATE\s+CURRENT_TIMESTAMP(?:\(\))?/gi, '');
    }

    return result;
  }

  private convertEnumAndSet(sql: string): string {
    let result = sql;

    // Handle ENUM types - convert to TEXT with CHECK constraint
    const enumRegex = /(\w+)\s+ENUM\s*\(([^)]+)\)/gi;

    result = result.replace(enumRegex, (match, columnName, values) => {
      this.log(`Converting ENUM for column ${columnName}`);

      // Clean up the values
      const cleanValues = values.replace(/'/g, "''"); // Escape single quotes

      // Create CHECK constraint
      return `${columnName} TEXT CHECK(${columnName} IN (${values}))`;
    });

    // Handle SET types - convert to TEXT (SQLite doesn't have native SET support)
    const setRegex = /(\w+)\s+SET\s*\(([^)]+)\)/gi;

    if (result.match(setRegex)) {
      this.warn('SET type is not fully supported in SQLite. Converting to TEXT.');

      result = result.replace(setRegex, (match, columnName, values) => {
        return `${columnName} TEXT`;
      });
    }

    return result;
  }

  private removeColumnAttributes(sql: string): string {
    let result = sql;

    // Remove ZEROFILL
    result = result.replace(/\bZEROFILL\b/gi, '');

    // Remove CHARACTER SET specifications
    result = result.replace(/CHARACTER\s+SET\s+\w+/gi, '');

    // Remove COLLATE specifications
    result = result.replace(/COLLATE\s+\w+/gi, '');

    // Remove COMMENT specifications on columns
    result = result.replace(/COMMENT\s+'[^']*'/gi, '');

    // Remove COLUMN_FORMAT
    result = result.replace(/COLUMN_FORMAT\s+(FIXED|DYNAMIC|DEFAULT)/gi, '');

    // Remove STORAGE
    result = result.replace(/STORAGE\s+(DISK|MEMORY)/gi, '');

    return result;
  }

  private convertIndexes(sql: string): string {
    let result = sql;

    // Convert KEY to INDEX (they're synonyms in MySQL)
    result = result.replace(/\bKEY\s+/gi, 'INDEX ');

    // Remove index type specifications (BTREE, HASH, RTREE, FULLTEXT)
    result = result.replace(/USING\s+(BTREE|HASH|RTREE)/gi, '');

    // Handle FULLTEXT indexes (not supported in SQLite, needs FTS extension)
    if (result.match(/FULLTEXT/i)) {
      this.warn('FULLTEXT indexes require SQLite FTS extension. Converting to regular index.');
      result = result.replace(/FULLTEXT\s+(INDEX|KEY)/gi, 'INDEX');
    }

    // Handle SPATIAL indexes (not supported in SQLite)
    if (result.match(/SPATIAL/i)) {
      this.warn('SPATIAL indexes are not supported in SQLite. Removing.');
      result = result.replace(/SPATIAL\s+(INDEX|KEY)\s+\w+\s+\([^)]+\)/gi, '');
    }

    // Remove index options (KEY_BLOCK_SIZE, WITH PARSER, COMMENT, etc.)
    result = result.replace(/KEY_BLOCK_SIZE\s*=\s*\d+/gi, '');
    result = result.replace(/WITH\s+PARSER\s+\w+/gi, '');

    return result;
  }

  private removeTableOptions(sql: string): string {
    let result = sql;

    // Remove ENGINE specification
    result = result.replace(/ENGINE\s*=\s*\w+/gi, '');

    // Remove AUTO_INCREMENT start value
    result = result.replace(/AUTO_INCREMENT\s*=\s*\d+/gi, '');

    // Remove DEFAULT CHARSET/CHARACTER SET
    result = result.replace(/DEFAULT\s+(CHARSET|CHARACTER\s+SET)\s*=\s*\w+/gi, '');

    // Remove COLLATE
    result = result.replace(/COLLATE\s*=\s*\w+/gi, '');

    // Remove ROW_FORMAT
    result = result.replace(/ROW_FORMAT\s*=\s*\w+/gi, '');

    // Remove KEY_BLOCK_SIZE
    result = result.replace(/KEY_BLOCK_SIZE\s*=\s*\d+/gi, '');

    // Remove DATA/INDEX DIRECTORY
    result = result.replace(/DATA\s+DIRECTORY\s*=\s*'[^']*'/gi, '');
    result = result.replace(/INDEX\s+DIRECTORY\s*=\s*'[^']*'/gi, '');

    // Remove TABLESPACE
    result = result.replace(/TABLESPACE\s+\w+/gi, '');

    // Remove STORAGE
    result = result.replace(/STORAGE\s+(DISK|MEMORY)/gi, '');

    // Remove COMMENT on table
    result = result.replace(/COMMENT\s*=\s*'[^']*'/gi, '');

    // Remove partition specifications
    if (result.match(/PARTITION\s+BY/i)) {
      this.warn('Table partitioning is not supported in SQLite. Removing.');
      result = result.replace(/PARTITION\s+BY\s+[^;]+/gi, '');
    }

    return result;
  }
}

/**
 * Factory function to create MySQL schema rewriter
 */
export function createMySQLSchemaRewriter(options?: PluginOptions): MySQLSchemaRewriter {
  return new MySQLSchemaRewriter(options);
}
