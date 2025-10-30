/**
 * Oracle to SQLite Schema Rewriter Plugin
 *
 * Translates Oracle schema definitions to SQLite-compatible syntax
 */

import {
  BaseSchemaRewriter,
  TypeMapping,
  PluginOptions
} from '../plugin-interface';

export class OracleSchemaRewriter extends BaseSchemaRewriter {
  readonly name = 'oracle-schema';
  readonly sourceDialect = 'oracle';

  constructor(options: PluginOptions = {}) {
    super(options);
  }

  getTypeMappings(): TypeMapping[] {
    return [
      // Numeric types
      { sourceType: 'NUMBER', sqliteType: 'REAL' },
      { sourceType: 'NUMERIC', sqliteType: 'REAL' },
      { sourceType: 'DECIMAL', sqliteType: 'REAL' },
      { sourceType: 'DEC', sqliteType: 'REAL' },
      { sourceType: 'INTEGER', sqliteType: 'INTEGER' },
      { sourceType: 'INT', sqliteType: 'INTEGER' },
      { sourceType: 'SMALLINT', sqliteType: 'INTEGER' },
      { sourceType: 'FLOAT', sqliteType: 'REAL' },
      { sourceType: 'DOUBLE PRECISION', sqliteType: 'REAL' },
      { sourceType: 'REAL', sqliteType: 'REAL' },
      { sourceType: 'BINARY_FLOAT', sqliteType: 'REAL' },
      { sourceType: 'BINARY_DOUBLE', sqliteType: 'REAL' },

      // String types
      { sourceType: 'VARCHAR', sqliteType: 'TEXT' },
      { sourceType: 'VARCHAR2', sqliteType: 'TEXT' },
      { sourceType: 'NVARCHAR2', sqliteType: 'TEXT' },
      { sourceType: 'CHAR', sqliteType: 'TEXT' },
      { sourceType: 'NCHAR', sqliteType: 'TEXT' },
      { sourceType: 'CLOB', sqliteType: 'TEXT' },
      { sourceType: 'NCLOB', sqliteType: 'TEXT' },
      { sourceType: 'LONG', sqliteType: 'TEXT' },

      // Binary types
      { sourceType: 'RAW', sqliteType: 'BLOB' },
      { sourceType: 'LONG RAW', sqliteType: 'BLOB' },
      { sourceType: 'BLOB', sqliteType: 'BLOB' },
      { sourceType: 'BFILE', sqliteType: 'BLOB' },

      // Date/Time types
      { sourceType: 'DATE', sqliteType: 'TEXT' },
      { sourceType: 'TIMESTAMP', sqliteType: 'TEXT' },
      { sourceType: 'TIMESTAMP WITH TIME ZONE', sqliteType: 'TEXT' },
      { sourceType: 'TIMESTAMP WITH LOCAL TIME ZONE', sqliteType: 'TEXT' },
      { sourceType: 'INTERVAL YEAR TO MONTH', sqliteType: 'TEXT' },
      { sourceType: 'INTERVAL DAY TO SECOND', sqliteType: 'TEXT' },

      // Other types
      { sourceType: 'ROWID', sqliteType: 'TEXT' },
      { sourceType: 'UROWID', sqliteType: 'TEXT' },
      { sourceType: 'XMLTYPE', sqliteType: 'TEXT' }
    ];
  }

  rewriteSchema(sql: string): string {
    this.log(`Rewriting Oracle schema: ${sql.substring(0, 50)}...`);

    let rewritten = sql;

    // Convert Oracle sequences to AUTOINCREMENT
    rewritten = this.convertSequences(rewritten);

    // Convert data types
    rewritten = this.convertDataTypes(rewritten);

    // Handle DEFAULT values with Oracle-specific functions
    rewritten = this.convertDefaultValues(rewritten);

    // Remove Oracle-specific constraints
    rewritten = this.removeOracleConstraints(rewritten);

    // Convert indexes
    rewritten = this.convertIndexes(rewritten);

    // Remove table/column options
    rewritten = this.removeTableOptions(rewritten);

    // Remove schemas from object names
    rewritten = rewritten.replace(/\b(\w+)\.(\w+)\b/g, '$2');

    // Clean up extra whitespace
    rewritten = rewritten.replace(/\s+/g, ' ').trim();

    this.log(`Rewritten schema: ${rewritten.substring(0, 50)}...`);

    return rewritten;
  }

  private convertSequences(sql: string): string {
    let result = sql;

    // Oracle uses sequences for auto-increment
    // CREATE SEQUENCE seq_name START WITH 1 INCREMENT BY 1;
    if (result.match(/CREATE\s+SEQUENCE/i)) {
      this.warn('Oracle sequences should be replaced with AUTOINCREMENT in column definitions.');
      // Remove sequence creation statements
      result = result.replace(/CREATE\s+SEQUENCE\s+[^;]+;/gi, '');
    }

    // Convert columns using sequences to AUTOINCREMENT
    // columnName NUMBER DEFAULT seq_name.NEXTVAL
    result = result.replace(
      /(\w+)\s+(NUMBER|INTEGER)\s+DEFAULT\s+\w+\.NEXTVAL/gi,
      '$1 INTEGER PRIMARY KEY AUTOINCREMENT'
    );

    return result;
  }

  private convertDataTypes(sql: string): string {
    let result = sql;

    // Match type definitions with optional size/precision
    const typeMappings = this.getTypeMappings();
    const typeMap = new Map(
      typeMappings.map(m => [m.sourceType.toUpperCase(), m.sqliteType])
    );

    // Handle NUMBER(p,s) specifically
    result = result.replace(
      /\bNUMBER\s*\((\d+)(?:,\s*(\d+))?\)/gi,
      (match, precision, scale) => {
        if (scale && parseInt(scale) > 0) {
          return 'REAL'; // Has decimal places
        } else {
          return 'INTEGER'; // No decimal places
        }
      }
    );

    // Handle VARCHAR2 and other string types with size
    result = result.replace(
      /\b(VARCHAR2|NVARCHAR2|CHAR|NCHAR)\s*\((\d+)(?:\s+(BYTE|CHAR))?\)/gi,
      'TEXT'
    );

    // Handle RAW with size
    result = result.replace(/\bRAW\s*\(\d+\)/gi, 'BLOB');

    // Convert other known types
    Object.entries(Object.fromEntries(typeMap)).forEach(([oracleType, sqliteType]) => {
      const regex = new RegExp(`\\b${oracleType}\\b`, 'gi');
      result = result.replace(regex, sqliteType);
    });

    return result;
  }

  private convertDefaultValues(sql: string): string {
    let result = sql;

    // Convert SYSDATE to CURRENT_TIMESTAMP
    result = result.replace(/DEFAULT\s+SYSDATE/gi, "DEFAULT CURRENT_TIMESTAMP");

    // Convert SYSTIMESTAMP to CURRENT_TIMESTAMP
    result = result.replace(/DEFAULT\s+SYSTIMESTAMP/gi, "DEFAULT CURRENT_TIMESTAMP");

    // Convert CURRENT_DATE
    result = result.replace(/DEFAULT\s+CURRENT_DATE/gi, "DEFAULT (date('now'))");

    // Convert CURRENT_TIMESTAMP
    result = result.replace(/DEFAULT\s+CURRENT_TIMESTAMP/gi, "DEFAULT CURRENT_TIMESTAMP");

    // Handle sequence defaults (already handled in convertSequences)

    // Convert SYS_GUID() for UUID generation
    if (result.match(/SYS_GUID\(\)/i)) {
      this.warn('SYS_GUID() is not supported in SQLite. You may need to generate UUIDs in application code.');
      result = result.replace(/DEFAULT\s+SYS_GUID\(\)/gi, '');
    }

    // Handle NULL defaults explicitly
    result = result.replace(/DEFAULT\s+NULL/gi, 'DEFAULT NULL');

    return result;
  }

  private removeOracleConstraints(sql: string): string {
    let result = sql;

    // Remove ENABLE/DISABLE keywords
    result = result.replace(/\b(ENABLE|DISABLE)\b/gi, '');

    // Remove VALIDATE/NOVALIDATE keywords
    result = result.replace(/\b(VALIDATE|NOVALIDATE)\b/gi, '');

    // Remove DEFERRABLE/NOT DEFERRABLE
    result = result.replace(/\b(NOT\s+)?DEFERRABLE\b/gi, '');

    // Remove INITIALLY DEFERRED/IMMEDIATE
    result = result.replace(/\bINITIALLY\s+(DEFERRED|IMMEDIATE)\b/gi, '');

    // Remove RELY/NORELY
    result = result.replace(/\b(RELY|NORELY)\b/gi, '');

    // Remove constraint names
    result = result.replace(/CONSTRAINT\s+\w+\s+(PRIMARY KEY|FOREIGN KEY|UNIQUE|CHECK)/gi, '$1');

    // Handle CHECK constraints with Oracle-specific syntax
    result = this.convertCheckConstraints(result);

    return result;
  }

  private convertCheckConstraints(sql: string): string {
    let result = sql;

    // SQLite supports CHECK constraints, but Oracle has some specific patterns
    // that need conversion

    // No major differences for basic CHECK constraints
    // Both support: CHECK (column > 0), CHECK (column IN ('A', 'B')), etc.

    return result;
  }

  private convertIndexes(sql: string): string {
    let result = sql;

    // Remove UNIQUE/BITMAP keywords before INDEX
    result = result.replace(/CREATE\s+(UNIQUE\s+)?BITMAP\s+INDEX/gi, 'CREATE $1INDEX');

    // Remove index organization clause
    result = result.replace(/ORGANIZATION\s+INDEX/gi, '');

    // Remove tablespace specifications
    result = result.replace(/TABLESPACE\s+\w+/gi, '');

    // Remove storage clauses
    result = result.replace(/STORAGE\s*\([^)]+\)/gi, '');

    // Remove COMPRESS/NOCOMPRESS
    result = result.replace(/\b(NO)?COMPRESS(\s+\d+)?/gi, '');

    // Remove PARALLEL
    result = result.replace(/PARALLEL\s*(\([^)]+\)|\d+)?/gi, '');

    // Remove LOGGING/NOLOGGING
    result = result.replace(/\b(NO)?LOGGING\b/gi, '');

    // Handle function-based indexes
    if (result.match(/CREATE\s+INDEX\s+\w+\s+ON\s+\w+\s*\([^)]*\([^)]+\)[^)]*\)/i)) {
      this.warn('Function-based indexes may not work the same way in SQLite.');
    }

    // Handle domain indexes (not supported)
    if (result.match(/INDEXTYPE\s+IS/i)) {
      this.warn('Domain indexes (INDEXTYPE) are not supported in SQLite. Removing.');
      result = result.replace(/CREATE\s+INDEX\s+\w+\s+ON\s+\w+\s*\([^)]+\)\s+INDEXTYPE\s+IS\s+[^;]+;/gi, '');
    }

    return result;
  }

  private removeTableOptions(sql: string): string {
    let result = sql;

    // Remove TABLESPACE
    result = result.replace(/TABLESPACE\s+\w+/gi, '');

    // Remove PCTFREE/PCTUSED
    result = result.replace(/PCTFREE\s+\d+/gi, '');
    result = result.replace(/PCTUSED\s+\d+/gi, '');

    // Remove INITRANS/MAXTRANS
    result = result.replace(/INITRANS\s+\d+/gi, '');
    result = result.replace(/MAXTRANS\s+\d+/gi, '');

    // Remove STORAGE clause
    result = result.replace(/STORAGE\s*\([^)]+\)/gi, '');

    // Remove LOGGING/NOLOGGING
    result = result.replace(/\b(NO)?LOGGING\b/gi, '');

    // Remove CACHE/NOCACHE
    result = result.replace(/\b(NO)?CACHE\b/gi, '');

    // Remove PARALLEL
    result = result.replace(/PARALLEL\s*(\([^)]+\)|\d+)?/gi, '');

    // Remove ROW MOVEMENT
    result = result.replace(/\b(ENABLE|DISABLE)\s+ROW\s+MOVEMENT\b/gi, '');

    // Remove partitioning
    if (result.match(/PARTITION\s+BY/i)) {
      this.warn('Table partitioning is not supported in SQLite. Removing.');
      result = result.replace(/PARTITION\s+BY\s+[^;]+/gi, '');
    }

    // Remove organization clause
    result = result.replace(/ORGANIZATION\s+(HEAP|INDEX)/gi, '');

    // Remove COMPRESS/NOCOMPRESS
    result = result.replace(/\b(NO)?COMPRESS(\s+FOR\s+[^;]+)?/gi, '');

    return result;
  }
}

/**
 * Factory function to create Oracle schema rewriter
 */
export function createOracleSchemaRewriter(options?: PluginOptions): OracleSchemaRewriter {
  return new OracleSchemaRewriter(options);
}
