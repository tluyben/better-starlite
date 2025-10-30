/**
 * Microsoft SQL Server to SQLite Query Rewriter Plugin
 *
 * Translates MSSQL queries to SQLite-compatible syntax
 */

import {
  BaseQueryRewriter,
  PluginOptions
} from '../plugin-interface';

export class MSSQLQueryRewriter extends BaseQueryRewriter {
  readonly name = 'mssql-query';
  readonly sourceDialect = 'mssql';

  constructor(options: PluginOptions = {}) {
    super(options);
  }

  needsRewrite(sql: string): boolean {
    const mssqlPatterns = [
      /\bGETDATE\(\)/i,
      /\bGETUTCDATE\(\)/i,
      /\bSYSDATETIME\(\)/i,
      /\bSYSUTCDATETIME\(\)/i,
      /\bISNULL\(/i,
      /\bIIF\(/i,
      /\bCHOOSE\(/i,
      /\bDATEADD\(/i,
      /\bDATEDIFF\(/i,
      /\bDATEPART\(/i,
      /\bDATENAME\(/i,
      /\bFORMAT\(/i,
      /\bCONVERT\(/i,
      /\bCAST\(/i,
      /\bCHARINDEX\(/i,
      /\bLEN\(/i,
      /\bSTUFF\(/i,
      /\[/,  // Square brackets
      /\bTOP\s+\d+/i,
      /\bOFFSET\s+\d+\s+ROWS/i,
      /\bFETCH\s+NEXT/i
    ];

    return mssqlPatterns.some(pattern => pattern.test(sql));
  }

  rewriteQuery(sql: string): string {
    this.log(`Rewriting MSSQL query: ${sql.substring(0, 50)}...`);

    let rewritten = sql;

    // Replace square brackets with double quotes
    rewritten = rewritten.replace(/\[/g, '"').replace(/\]/g, '"');

    // Rewrite date/time functions
    rewritten = this.rewriteDateTimeFunctions(rewritten);

    // Rewrite string functions
    rewritten = this.rewriteStringFunctions(rewritten);

    // Rewrite conditional functions
    rewritten = this.rewriteConditionalFunctions(rewritten);

    // Rewrite conversion functions
    rewritten = this.rewriteConversionFunctions(rewritten);

    // Rewrite TOP and pagination
    rewritten = this.rewriteTopAndPagination(rewritten);

    // Remove schema prefixes (dbo.table -> table)
    rewritten = rewritten.replace(/\b(\w+)\.(\w+)\b/g, '$2');

    this.log(`Rewritten query: ${rewritten.substring(0, 50)}...`);

    return rewritten;
  }

  private rewriteDateTimeFunctions(sql: string): string {
    let result = sql;

    // GETDATE() -> CURRENT_TIMESTAMP
    result = result.replace(/\bGETDATE\(\)/gi, 'CURRENT_TIMESTAMP');

    // GETUTCDATE() -> CURRENT_TIMESTAMP
    result = result.replace(/\bGETUTCDATE\(\)/gi, 'CURRENT_TIMESTAMP');

    // SYSDATETIME() -> CURRENT_TIMESTAMP
    result = result.replace(/\bSYSDATETIME\(\)/gi, 'CURRENT_TIMESTAMP');

    // SYSUTCDATETIME() -> CURRENT_TIMESTAMP
    result = result.replace(/\bSYSUTCDATETIME\(\)/gi, 'CURRENT_TIMESTAMP');

    // CURRENT_TIMESTAMP (already compatible)

    // DATEADD(datepart, number, date) -> date/datetime with modifiers
    result = result.replace(
      /\bDATEADD\s*\(\s*(\w+),\s*(-?\d+),\s*([^)]+)\)/gi,
      (match, datepart, number, date) => {
        const modifier = this.convertDatePart(datepart, number);
        return `datetime(${date}, '${modifier}')`;
      }
    );

    // DATEDIFF(datepart, startdate, enddate)
    result = result.replace(
      /\bDATEDIFF\s*\(\s*(\w+),\s*([^,]+),\s*([^)]+)\)/gi,
      (match, datepart, startdate, enddate) => {
        const part = datepart.toLowerCase();

        if (part === 'day' || part === 'dd' || part === 'd') {
          return `(julianday(${enddate}) - julianday(${startdate}))`;
        } else if (part === 'hour' || part === 'hh') {
          return `((julianday(${enddate}) - julianday(${startdate})) * 24)`;
        } else if (part === 'minute' || part === 'mi' || part === 'n') {
          return `((julianday(${enddate}) - julianday(${startdate})) * 1440)`;
        } else if (part === 'second' || part === 'ss' || part === 's') {
          return `((julianday(${enddate}) - julianday(${startdate})) * 86400)`;
        } else if (part === 'year' || part === 'yy' || part === 'yyyy') {
          return `(CAST(strftime('%Y', ${enddate}) AS INTEGER) - CAST(strftime('%Y', ${startdate}) AS INTEGER))`;
        } else if (part === 'month' || part === 'mm' || part === 'm') {
          return `((CAST(strftime('%Y', ${enddate}) AS INTEGER) - CAST(strftime('%Y', ${startdate}) AS INTEGER)) * 12 + CAST(strftime('%m', ${enddate}) AS INTEGER) - CAST(strftime('%m', ${startdate}) AS INTEGER))`;
        }

        this.warn(`DATEDIFF datepart '${datepart}' may not be fully supported.`);
        return `(julianday(${enddate}) - julianday(${startdate}))`;
      }
    );

    // DATEPART(datepart, date) -> strftime
    result = result.replace(
      /\bDATEPART\s*\(\s*(\w+),\s*([^)]+)\)/gi,
      (match, datepart, date) => {
        const format = this.getDatePartFormat(datepart);
        return `CAST(strftime('${format}', ${date}) AS INTEGER)`;
      }
    );

    // DATENAME(datepart, date) -> strftime
    result = result.replace(
      /\bDATENAME\s*\(\s*(\w+),\s*([^)]+)\)/gi,
      (match, datepart, date) => {
        const format = this.getDatePartFormat(datepart);
        return `strftime('${format}', ${date})`;
      }
    );

    // YEAR(), MONTH(), DAY() functions
    result = result.replace(/\bYEAR\s*\(([^)]+)\)/gi, "CAST(strftime('%Y', $1) AS INTEGER)");
    result = result.replace(/\bMONTH\s*\(([^)]+)\)/gi, "CAST(strftime('%m', $1) AS INTEGER)");
    result = result.replace(/\bDAY\s*\(([^)]+)\)/gi, "CAST(strftime('%d', $1) AS INTEGER)");

    // EOMONTH(date) - end of month
    result = result.replace(
      /\bEOMONTH\s*\(\s*([^)]+)\)/gi,
      "date($1, 'start of month', '+1 month', '-1 day')"
    );

    return result;
  }

  private rewriteStringFunctions(sql: string): string {
    let result = sql;

    // CHARINDEX(substring, string, start_position) -> INSTR(string, substring)
    // Note: parameter order is different, and MSSQL has optional start position
    result = result.replace(
      /\bCHARINDEX\s*\(\s*([^,]+),\s*([^,)]+)(?:,\s*\d+)?\s*\)/gi,
      (match, substring, string) => {
        if (match.match(/,\s*\d+\s*\)/)) {
          this.warn('CHARINDEX with start_position parameter is not fully supported in SQLite INSTR.');
        }
        return `INSTR(${string}, ${substring})`;
      }
    );

    // LEN(string) -> LENGTH(string)
    result = result.replace(/\bLEN\s*\(/gi, 'LENGTH(');

    // LEFT(string, length) and RIGHT(string, length)
    result = result.replace(
      /\bLEFT\s*\(\s*([^,]+),\s*(\d+)\s*\)/gi,
      'SUBSTR($1, 1, $2)'
    );

    result = result.replace(
      /\bRIGHT\s*\(\s*([^,]+),\s*(\d+)\s*\)/gi,
      'SUBSTR($1, -$2)'
    );

    // SUBSTRING(string, start, length) -> SUBSTR(string, start, length)
    result = result.replace(/\bSUBSTRING\s*\(/gi, 'SUBSTR(');

    // STUFF(string, start, length, replacement) - not directly in SQLite
    if (result.match(/\bSTUFF\s*\(/i)) {
      this.warn('STUFF function is not directly supported in SQLite. Consider using application-level logic or multiple SUBSTR calls.');
    }

    // REPLICATE(string, count) - not in SQLite
    if (result.match(/\bREPLICATE\s*\(/i)) {
      this.warn('REPLICATE function is not directly supported in SQLite.');
    }

    // REVERSE(string) - not in standard SQLite
    if (result.match(/\bREVERSE\s*\(/i)) {
      this.warn('REVERSE function is not available in standard SQLite.');
    }

    // CONCAT(string1, string2, ...) -> string1 || string2 || ...
    result = result.replace(
      /\bCONCAT\s*\(([^)]+)\)/gi,
      (match, fields) => {
        const fieldList = fields.split(',').map((f: string) => f.trim());
        return `(${fieldList.join(' || ')})`;
      }
    );

    // STRING_AGG(expression, separator) -> GROUP_CONCAT(expression, separator)
    result = result.replace(
      /\bSTRING_AGG\s*\(\s*([^,]+),\s*'([^']+)'\s*\)/gi,
      "GROUP_CONCAT($1, '$2')"
    );

    return result;
  }

  private rewriteConditionalFunctions(sql: string): string {
    let result = sql;

    // ISNULL(check_expression, replacement_value) -> IFNULL or COALESCE
    result = result.replace(/\bISNULL\s*\(/gi, 'IFNULL(');

    // IIF(condition, true_value, false_value) -> CASE WHEN ... END
    result = result.replace(
      /\bIIF\s*\(\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/gi,
      '(CASE WHEN $1 THEN $2 ELSE $3 END)'
    );

    // CHOOSE(index, val1, val2, val3, ...) - not directly in SQLite
    if (result.match(/\bCHOOSE\s*\(/i)) {
      this.warn('CHOOSE function is not directly supported in SQLite. Consider using CASE expression.');

      result = result.replace(
        /\bCHOOSE\s*\(([^)]+)\)/gi,
        (match, args) => {
          const argList = args.split(',').map((a: string) => a.trim());
          if (argList.length < 2) return match;

          const index = argList[0];
          let caseExpr = 'CASE';

          for (let i = 1; i < argList.length; i++) {
            caseExpr += ` WHEN ${index} = ${i} THEN ${argList[i]}`;
          }

          caseExpr += ' END';
          return caseExpr;
        }
      );
    }

    return result;
  }

  private rewriteConversionFunctions(sql: string): string {
    let result = sql;

    // FORMAT(value, format) - basic conversion
    result = result.replace(
      /\bFORMAT\s*\(\s*([^,]+),\s*'([^']+)'\s*\)/gi,
      (match, value, format) => {
        this.log(`Converting FORMAT with format: ${format}`);

        // Handle date formats
        if (format.match(/[yMdHms]/)) {
          const sqliteFormat = this.convertMSSQLDateFormat(format);
          return `strftime('${sqliteFormat}', ${value})`;
        }

        // For numeric formats, just cast to text
        this.warn(`FORMAT numeric format '${format}' is not fully supported. Using simple CAST.`);
        return `CAST(${value} AS TEXT)`;
      }
    );

    // CONVERT(data_type, expression, style) -> CAST(expression AS data_type)
    result = result.replace(
      /\bCONVERT\s*\(\s*(\w+)(?:\s*\(\d+\))?,\s*([^,)]+)(?:,\s*\d+)?\s*\)/gi,
      (match, dataType, expression) => {
        const sqliteType = this.mapDataType(dataType);
        return `CAST(${expression} AS ${sqliteType})`;
      }
    );

    // CAST is already supported in SQLite, but we may need to map data types
    result = result.replace(
      /\bCAST\s*\(\s*([^)]+)\s+AS\s+(\w+)(?:\s*\(\d+\))?\s*\)/gi,
      (match, expression, dataType) => {
        const sqliteType = this.mapDataType(dataType);
        return `CAST(${expression} AS ${sqliteType})`;
      }
    );

    return result;
  }

  private rewriteTopAndPagination(sql: string): string {
    let result = sql;

    // SELECT TOP n -> SELECT ... LIMIT n
    result = result.replace(
      /\bSELECT\s+TOP\s+(\d+)\s+/gi,
      (match, limit) => {
        // Move TOP to end as LIMIT
        // This is a simplified approach - may need refinement for complex queries
        this.log(`Converting TOP ${limit} to LIMIT ${limit}`);
        return `SELECT `;
      }
    );

    // If we removed TOP, add LIMIT at the end (simplified)
    if (sql.match(/\bSELECT\s+TOP\s+\d+\s+/i)) {
      const topMatch = sql.match(/\bTOP\s+(\d+)\b/i);
      if (topMatch) {
        const limit = topMatch[1];
        // Append LIMIT if not already present
        if (!result.match(/\bLIMIT\b/i)) {
          result += ` LIMIT ${limit}`;
        }
      }
    }

    // OFFSET n ROWS FETCH NEXT m ROWS ONLY -> LIMIT m OFFSET n
    result = result.replace(
      /\bOFFSET\s+(\d+)\s+ROWS?\s+FETCH\s+NEXT\s+(\d+)\s+ROWS?\s+ONLY/gi,
      'LIMIT $2 OFFSET $1'
    );

    // FETCH NEXT n ROWS ONLY -> LIMIT n
    result = result.replace(
      /\bFETCH\s+NEXT\s+(\d+)\s+ROWS?\s+ONLY/gi,
      'LIMIT $1'
    );

    return result;
  }

  rewriteFunction(functionCall: string): string {
    const lower = functionCall.toLowerCase();

    if (lower === 'getdate()') {
      return 'CURRENT_TIMESTAMP';
    } else if (lower === 'getutcdate()') {
      return 'CURRENT_TIMESTAMP';
    } else if (lower.startsWith('isnull(')) {
      return functionCall.replace(/^isnull\(/i, 'IFNULL(');
    } else if (lower.startsWith('len(')) {
      return functionCall.replace(/^len\(/i, 'LENGTH(');
    }

    return functionCall;
  }

  rewriteOperator(operator: string): string {
    const operatorMap: Record<string, string> = {
      '+': '+',  // String concatenation in MSSQL, but also addition
      '%': '%'   // Modulo is the same
    };

    return operatorMap[operator] || operator;
  }

  private convertDatePart(datepart: string, number: string): string {
    const part = datepart.toLowerCase();

    const partMap: Record<string, string> = {
      'year': `${number} years`,
      'yy': `${number} years`,
      'yyyy': `${number} years`,
      'quarter': `${parseInt(number) * 3} months`,
      'qq': `${parseInt(number) * 3} months`,
      'q': `${parseInt(number) * 3} months`,
      'month': `${number} months`,
      'mm': `${number} months`,
      'm': `${number} months`,
      'day': `${number} days`,
      'dd': `${number} days`,
      'd': `${number} days`,
      'week': `${parseInt(number) * 7} days`,
      'wk': `${parseInt(number) * 7} days`,
      'ww': `${parseInt(number) * 7} days`,
      'hour': `${number} hours`,
      'hh': `${number} hours`,
      'minute': `${number} minutes`,
      'mi': `${number} minutes`,
      'n': `${number} minutes`,
      'second': `${number} seconds`,
      'ss': `${number} seconds`,
      's': `${number} seconds`
    };

    return partMap[part] || `${number} days`;
  }

  private getDatePartFormat(datepart: string): string {
    const part = datepart.toLowerCase();

    const formatMap: Record<string, string> = {
      'year': '%Y',
      'yy': '%Y',
      'yyyy': '%Y',
      'quarter': '%m',  // Approximation
      'qq': '%m',
      'q': '%m',
      'month': '%m',
      'mm': '%m',
      'm': '%m',
      'day': '%d',
      'dd': '%d',
      'd': '%d',
      'dayofyear': '%j',
      'dy': '%j',
      'y': '%j',
      'week': '%W',
      'wk': '%W',
      'ww': '%W',
      'weekday': '%w',
      'dw': '%w',
      'hour': '%H',
      'hh': '%H',
      'minute': '%M',
      'mi': '%M',
      'n': '%M',
      'second': '%S',
      'ss': '%S',
      's': '%S'
    };

    return formatMap[part] || '%Y';
  }

  private convertMSSQLDateFormat(mssqlFormat: string): string {
    // Convert MSSQL FORMAT string to SQLite strftime format
    let sqliteFormat = mssqlFormat;

    const formatMap: Record<string, string> = {
      'yyyy': '%Y',
      'yy': '%y',
      'MM': '%m',
      'M': '%m',
      'dd': '%d',
      'd': '%d',
      'HH': '%H',
      'hh': '%I',
      'mm': '%M',
      'ss': '%S',
      'tt': '%p'
    };

    Object.entries(formatMap).forEach(([mssql, sqlite]) => {
      sqliteFormat = sqliteFormat.replace(new RegExp(mssql, 'g'), sqlite);
    });

    return sqliteFormat;
  }

  private mapDataType(mssqlType: string): string {
    const type = mssqlType.toUpperCase();

    const typeMap: Record<string, string> = {
      'INT': 'INTEGER',
      'INTEGER': 'INTEGER',
      'TINYINT': 'INTEGER',
      'SMALLINT': 'INTEGER',
      'BIGINT': 'INTEGER',
      'BIT': 'INTEGER',
      'DECIMAL': 'REAL',
      'NUMERIC': 'REAL',
      'FLOAT': 'REAL',
      'REAL': 'REAL',
      'MONEY': 'REAL',
      'SMALLMONEY': 'REAL',
      'VARCHAR': 'TEXT',
      'NVARCHAR': 'TEXT',
      'CHAR': 'TEXT',
      'NCHAR': 'TEXT',
      'TEXT': 'TEXT',
      'NTEXT': 'TEXT',
      'BINARY': 'BLOB',
      'VARBINARY': 'BLOB',
      'IMAGE': 'BLOB',
      'DATE': 'TEXT',
      'TIME': 'TEXT',
      'DATETIME': 'TEXT',
      'DATETIME2': 'TEXT',
      'SMALLDATETIME': 'TEXT',
      'DATETIMEOFFSET': 'TEXT'
    };

    return typeMap[type] || 'TEXT';
  }
}

/**
 * Factory function to create MSSQL query rewriter
 */
export function createMSSQLQueryRewriter(options?: PluginOptions): MSSQLQueryRewriter {
  return new MSSQLQueryRewriter(options);
}
