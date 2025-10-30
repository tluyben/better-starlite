/**
 * Microsoft SQL Server to SQLite Schema Rewriter Plugin
 *
 * Translates MSSQL schema definitions to SQLite-compatible syntax
 */

import {
  BaseSchemaRewriter,
  TypeMapping,
  PluginOptions
} from '../plugin-interface';

export class MSSQLSchemaRewriter extends BaseSchemaRewriter {
  readonly name = 'mssql-schema';
  readonly sourceDialect = 'mssql';

  constructor(options: PluginOptions = {}) {
    super(options);
  }

  getTypeMappings(): TypeMapping[] {
    return [
      // Integer types
      { sourceType: 'TINYINT', sqliteType: 'INTEGER' },
      { sourceType: 'SMALLINT', sqliteType: 'INTEGER' },
      { sourceType: 'INT', sqliteType: 'INTEGER' },
      { sourceType: 'INTEGER', sqliteType: 'INTEGER' },
      { sourceType: 'BIGINT', sqliteType: 'INTEGER' },

      // Numeric types
      { sourceType: 'DECIMAL', sqliteType: 'REAL' },
      { sourceType: 'NUMERIC', sqliteType: 'REAL' },
      { sourceType: 'FLOAT', sqliteType: 'REAL' },
      { sourceType: 'REAL', sqliteType: 'REAL' },
      { sourceType: 'MONEY', sqliteType: 'REAL' },
      { sourceType: 'SMALLMONEY', sqliteType: 'REAL' },

      // String types
      { sourceType: 'CHAR', sqliteType: 'TEXT' },
      { sourceType: 'VARCHAR', sqliteType: 'TEXT' },
      { sourceType: 'TEXT', sqliteType: 'TEXT' },
      { sourceType: 'NCHAR', sqliteType: 'TEXT' },
      { sourceType: 'NVARCHAR', sqliteType: 'TEXT' },
      { sourceType: 'NTEXT', sqliteType: 'TEXT' },

      // Binary types
      { sourceType: 'BINARY', sqliteType: 'BLOB' },
      { sourceType: 'VARBINARY', sqliteType: 'BLOB' },
      { sourceType: 'IMAGE', sqliteType: 'BLOB' },

      // Date/Time types
      { sourceType: 'DATE', sqliteType: 'TEXT' },
      { sourceType: 'TIME', sqliteType: 'TEXT' },
      { sourceType: 'DATETIME', sqliteType: 'TEXT' },
      { sourceType: 'DATETIME2', sqliteType: 'TEXT' },
      { sourceType: 'SMALLDATETIME', sqliteType: 'TEXT' },
      { sourceType: 'DATETIMEOFFSET', sqliteType: 'TEXT' },
      { sourceType: 'TIMESTAMP', sqliteType: 'BLOB' }, // MSSQL timestamp is actually a binary value

      // Boolean type
      { sourceType: 'BIT', sqliteType: 'INTEGER' },

      // Other types
      { sourceType: 'UNIQUEIDENTIFIER', sqliteType: 'TEXT' },
      { sourceType: 'XML', sqliteType: 'TEXT' },
      { sourceType: 'SQL_VARIANT', sqliteType: 'TEXT' },
      { sourceType: 'GEOGRAPHY', sqliteType: 'BLOB' },
      { sourceType: 'GEOMETRY', sqliteType: 'BLOB' },
      { sourceType: 'HIERARCHYID', sqliteType: 'TEXT' }
    ];
  }

  rewriteSchema(sql: string): string {
    this.log(`Rewriting MSSQL schema: ${sql.substring(0, 50)}...`);

    let rewritten = sql;

    // Handle IDENTITY (auto-increment) columns
    rewritten = this.convertIdentityColumns(rewritten);

    // Convert data types
    rewritten = this.convertDataTypes(rewritten);

    // Handle DEFAULT values with MSSQL-specific functions
    rewritten = this.convertDefaultValues(rewritten);

    // Remove MSSQL-specific constraints
    rewritten = this.removeMSSQLConstraints(rewritten);

    // Convert indexes
    rewritten = this.convertIndexes(rewritten);

    // Remove table/column options
    rewritten = this.removeTableOptions(rewritten);

    // Remove square brackets (MSSQL identifier quotes) - SQLite uses double quotes
    rewritten = rewritten.replace(/\[/g, '"').replace(/\]/g, '"');

    // Remove schemas from object names (dbo.tablename -> tablename)
    rewritten = rewritten.replace(/\b(\w+)\.(\w+)\b/g, '$2');

    // Clean up extra whitespace
    rewritten = rewritten.replace(/\s+/g, ' ').trim();

    this.log(`Rewritten schema: ${rewritten.substring(0, 50)}...`);

    return rewritten;
  }

  private convertIdentityColumns(sql: string): string {
    let result = sql;

    // Convert IDENTITY(seed, increment) to AUTOINCREMENT
    // MSSQL: [columnName] INT IDENTITY(1,1) or columnName INT IDENTITY(1,1)
    // SQLite: columnName INTEGER PRIMARY KEY AUTOINCREMENT
    result = result.replace(
      /(\[?\w+\]?)\s+(TINY|SMALL|BIG)?INT(?:EGER)?\s+IDENTITY(?:\s*\(\s*\d+\s*,\s*\d+\s*\))?/gi,
      '$1 INTEGER PRIMARY KEY AUTOINCREMENT'
    );

    return result;
  }

  private convertDataTypes(sql: string): string {
    let result = sql;

    // Handle VARCHAR(MAX), NVARCHAR(MAX)
    result = result.replace(/\b(N?VARCHAR|N?CHAR)\s*\(MAX\)/gi, 'TEXT');

    // Handle VARBINARY(MAX)
    result = result.replace(/\bVARBINARY\s*\(MAX\)/gi, 'BLOB');

    // Handle string types with size
    result = result.replace(
      /\b(N?VARCHAR|N?CHAR)\s*\((\d+)\)/gi,
      'TEXT'
    );

    // Handle binary types with size
    result = result.replace(/\b(VAR)?BINARY\s*\(\d+\)/gi, 'BLOB');

    // Handle DECIMAL/NUMERIC with precision and scale
    result = result.replace(
      /\b(DECIMAL|NUMERIC)\s*\((\d+)(?:,\s*(\d+))?\)/gi,
      'REAL'
    );

    // Handle DATETIME2 with precision
    result = result.replace(/\bDATETIME2\s*\(\d+\)/gi, 'TEXT');

    // Handle TIME with precision
    result = result.replace(/\bTIME\s*\(\d+\)/gi, 'TEXT');

    // Handle DATETIMEOFFSET with precision
    result = result.replace(/\bDATETIMEOFFSET\s*\(\d+\)/gi, 'TEXT');

    const typeMappings = this.getTypeMappings();
    const typeMap = new Map(
      typeMappings.map(m => [m.sourceType.toUpperCase(), m.sqliteType])
    );

    // Convert known types
    Object.entries(Object.fromEntries(typeMap)).forEach(([mssqlType, sqliteType]) => {
      const regex = new RegExp(`\\b${mssqlType}\\b`, 'gi');
      result = result.replace(regex, sqliteType);
    });

    return result;
  }

  private convertDefaultValues(sql: string): string {
    let result = sql;

    // Convert GETDATE() to CURRENT_TIMESTAMP
    result = result.replace(/DEFAULT\s+GETDATE\(\)/gi, "DEFAULT CURRENT_TIMESTAMP");

    // Convert GETUTCDATE() to CURRENT_TIMESTAMP
    result = result.replace(/DEFAULT\s+GETUTCDATE\(\)/gi, "DEFAULT CURRENT_TIMESTAMP");

    // Convert SYSDATETIME() to CURRENT_TIMESTAMP
    result = result.replace(/DEFAULT\s+SYSDATETIME\(\)/gi, "DEFAULT CURRENT_TIMESTAMP");

    // Convert SYSUTCDATETIME() to CURRENT_TIMESTAMP
    result = result.replace(/DEFAULT\s+SYSUTCDATETIME\(\)/gi, "DEFAULT CURRENT_TIMESTAMP");

    // Convert CURRENT_TIMESTAMP
    result = result.replace(/DEFAULT\s+CURRENT_TIMESTAMP/gi, "DEFAULT CURRENT_TIMESTAMP");

    // Convert NEWID() for GUID/UUID generation
    if (result.match(/NEWID\(\)/i)) {
      this.warn('NEWID() is not supported in SQLite. You may need to generate UUIDs in application code.');
      result = result.replace(/DEFAULT\s+NEWID\(\)/gi, '');
    }

    // Convert NEWSEQUENTIALID()
    if (result.match(/NEWSEQUENTIALID\(\)/i)) {
      this.warn('NEWSEQUENTIALID() is not supported in SQLite. Consider using AUTOINCREMENT or application-level UUID generation.');
      result = result.replace(/DEFAULT\s+NEWSEQUENTIALID\(\)/gi, '');
    }

    // Handle bit defaults (1/0)
    result = result.replace(/DEFAULT\s+([01])\b/gi, 'DEFAULT $1');

    return result;
  }

  private removeMSSQLConstraints(sql: string): string {
    let result = sql;

    // Remove WITH (NOCHECK) / WITH (CHECK)
    result = result.replace(/WITH\s+(NO)?CHECK/gi, '');

    // Remove NOT FOR REPLICATION
    result = result.replace(/NOT\s+FOR\s+REPLICATION/gi, '');

    // Remove constraint names
    result = result.replace(/CONSTRAINT\s+"?\w+"?\s+(PRIMARY KEY|FOREIGN KEY|UNIQUE|CHECK|DEFAULT)/gi, '$1');

    // Remove CLUSTERED/NONCLUSTERED from PRIMARY KEY and UNIQUE
    result = result.replace(/\b(PRIMARY\s+KEY|UNIQUE)\s+(NON)?CLUSTERED/gi, '$1');

    // Remove ON [PRIMARY] and ON [filegroup]
    result = result.replace(/ON\s+"?\w+"?(?=\s*(?:,|\)|;|$))/gi, '');

    // Handle FOREIGN KEY with ON DELETE/UPDATE CASCADE (SQLite supports this)
    // No changes needed

    return result;
  }

  private convertIndexes(sql: string): string {
    let result = sql;

    // Remove CLUSTERED/NONCLUSTERED keywords
    result = result.replace(/CREATE\s+(UNIQUE\s+)?(NON)?CLUSTERED\s+INDEX/gi, 'CREATE $1INDEX');

    // Remove WITH options
    result = result.replace(/WITH\s*\([^)]+\)/gi, '');

    // Remove ON [filegroup]
    result = result.replace(/ON\s+"?\w+"?\s*$/gi, '');

    // Handle included columns (not supported in SQLite)
    if (result.match(/INCLUDE\s*\(/i)) {
      this.warn('INCLUDE columns in indexes are not supported in SQLite. Consider adding them to the index key.');
      result = result.replace(/INCLUDE\s*\([^)]+\)/gi, '');
    }

    // Handle filtered indexes (WHERE clause) - SQLite supports partial indexes
    // No changes needed for this

    // Remove FILLFACTOR
    result = result.replace(/FILLFACTOR\s*=\s*\d+/gi, '');

    // Remove PAD_INDEX
    result = result.replace(/PAD_INDEX\s*=\s*(ON|OFF)/gi, '');

    return result;
  }

  private removeTableOptions(sql: string): string {
    let result = sql;

    // Remove ON [PRIMARY] or ON [filegroup]
    result = result.replace(/ON\s+"?PRIMARY"?/gi, '');
    result = result.replace(/ON\s+\[\w+\]/gi, '');

    // Remove TEXTIMAGE_ON
    result = result.replace(/TEXTIMAGE_ON\s+"?\w+"?/gi, '');

    // Remove FILESTREAM_ON
    result = result.replace(/FILESTREAM_ON\s+"?\w+"?/gi, '');

    // Remove WITH table options
    result = result.replace(/WITH\s*\([^)]+\)/gi, '');

    // Remove table compression
    if (result.match(/DATA_COMPRESSION/i)) {
      this.warn('DATA_COMPRESSION is not supported in SQLite.');
      result = result.replace(/DATA_COMPRESSION\s*=\s*\w+/gi, '');
    }

    // Remove memory-optimized table options
    if (result.match(/MEMORY_OPTIMIZED/i)) {
      this.warn('MEMORY_OPTIMIZED tables are not supported in SQLite. Using regular table.');
      result = result.replace(/WITH\s*\(\s*MEMORY_OPTIMIZED\s*=\s*ON[^)]*\)/gi, '');
    }

    // Remove temporal table specifications
    if (result.match(/SYSTEM_VERSIONING/i)) {
      this.warn('Temporal tables (SYSTEM_VERSIONING) are not supported in SQLite.');
      result = result.replace(/,?\s*PERIOD\s+FOR\s+SYSTEM_TIME\s*\([^)]+\)/gi, '');
      result = result.replace(/WITH\s*\(\s*SYSTEM_VERSIONING\s*=\s*ON[^)]*\)/gi, '');
    }

    // Remove partition specifications
    if (result.match(/PARTITION\s+BY/i)) {
      this.warn('Table partitioning is not supported in SQLite.');
      result = result.replace(/ON\s+\w+\s*\([^)]+\)/gi, '');
    }

    return result;
  }
}

/**
 * Factory function to create MSSQL schema rewriter
 */
export function createMSSQLSchemaRewriter(options?: PluginOptions): MSSQLSchemaRewriter {
  return new MSSQLSchemaRewriter(options);
}
