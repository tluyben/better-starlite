/**
 * PostgreSQL to SQLite Query Rewriter Plugin
 *
 * Translates PostgreSQL queries to SQLite-compatible syntax
 */

import {
  BaseQueryRewriter,
  PluginOptions
} from '../plugin-interface';

export class PostgreSQLQueryRewriter extends BaseQueryRewriter {
  readonly name = 'postgresql-query';
  readonly sourceDialect = 'postgresql';

  constructor(options: PluginOptions = {}) {
    super(options);
  }

  needsRewrite(sql: string): boolean {
    const pgPatterns = [
      /\bNOW\(\)/i,
      /\bCURRENT_DATE\b/i,
      /\bCURRENT_TIME\b/i,
      /\bTO_CHAR\(/i,
      /\bTO_DATE\(/i,
      /\bTO_TIMESTAMP\(/i,
      /\bEXTRACT\(/i,
      /\bDATE_TRUNC\(/i,
      /\bCONCAT_WS\(/i,
      /\bSTRING_AGG\(/i,
      /\bARRAY_AGG\(/i,
      /\bGENERATE_SERIES\(/i,
      /::/,  // Type casting (::)
      /\bISNULL\(/i,
      /\bCOALESCE\(/i,
      /\bGREATEST\(/i,
      /\bLEAST\(/i,
      /\|\|/,  // String concatenation operator
      /\bRETURNING\b/i,
      /\bLIMIT\s+\d+\s+OFFSET/i,
      /\bBOOLEAN\b/i,
      /\b(TRUE|FALSE)\b(?!\s*\))/i
    ];

    return pgPatterns.some(pattern => pattern.test(sql));
  }

  rewriteQuery(sql: string): string {
    this.log(`Rewriting PostgreSQL query: ${sql.substring(0, 50)}...`);

    let rewritten = sql;

    // Rewrite date/time functions
    rewritten = this.rewriteDateTimeFunctions(rewritten);

    // Rewrite string functions
    rewritten = this.rewriteStringFunctions(rewritten);

    // Rewrite aggregate functions
    rewritten = this.rewriteAggregateFunctions(rewritten);

    // Rewrite type casting
    rewritten = this.rewriteTypeCasting(rewritten);

    // Rewrite operators
    rewritten = this.rewriteOperators(rewritten);

    // Rewrite boolean values
    rewritten = this.rewriteBooleans(rewritten);

    // Rewrite RETURNING clause
    rewritten = this.rewriteReturning(rewritten);

    // Rewrite LIMIT/OFFSET
    rewritten = this.rewriteLimitOffset(rewritten);

    // Remove schemas from table/function names
    rewritten = rewritten.replace(/\b(\w+)\.(\w+)\b/g, '$2');

    this.log(`Rewritten query: ${rewritten.substring(0, 50)}...`);

    return rewritten;
  }

  private rewriteDateTimeFunctions(sql: string): string {
    let result = sql;

    // NOW() -> CURRENT_TIMESTAMP
    result = result.replace(/\bNOW\(\)/gi, 'CURRENT_TIMESTAMP');

    // CURRENT_DATE (no parens in PostgreSQL)
    result = result.replace(/\bCURRENT_DATE\b/gi, "date('now')");

    // CURRENT_TIME (no parens in PostgreSQL)
    result = result.replace(/\bCURRENT_TIME\b/gi, "time('now')");

    // CURRENT_TIMESTAMP -> CURRENT_TIMESTAMP
    result = result.replace(/\bCURRENT_TIMESTAMP\b/gi, 'CURRENT_TIMESTAMP');

    // TO_CHAR(date, format) - basic conversion
    result = result.replace(
      /TO_CHAR\s*\(\s*([^,]+),\s*'([^']+)'\s*\)/gi,
      (match, dateExpr, format) => {
        this.log(`Converting TO_CHAR with format: ${format}`);
        // Simple format conversions
        if (format.includes('YYYY-MM-DD')) {
          return `date(${dateExpr})`;
        } else if (format.includes('HH:MI:SS')) {
          return `time(${dateExpr})`;
        }
        this.warn(`TO_CHAR format '${format}' may not convert perfectly. Using strftime.`);
        return `strftime('${this.convertDateFormat(format)}', ${dateExpr})`;
      }
    );

    // TO_DATE(string, format) -> date conversion
    result = result.replace(
      /TO_DATE\s*\(\s*'([^']+)',\s*'([^']+)'\s*\)/gi,
      (match, dateStr, format) => {
        return `date('${dateStr}')`;
      }
    );

    // TO_TIMESTAMP(string) -> datetime conversion
    result = result.replace(
      /TO_TIMESTAMP\s*\(\s*'([^']+)'(?:,\s*'([^']+)')?\s*\)/gi,
      (match, dateStr, format) => {
        return `datetime('${dateStr}')`;
      }
    );

    // EXTRACT(field FROM source)
    result = result.replace(
      /EXTRACT\s*\(\s*(\w+)\s+FROM\s+([^)]+)\)/gi,
      (match, field, source) => {
        const fieldMap: Record<string, string> = {
          'YEAR': '%Y',
          'MONTH': '%m',
          'DAY': '%d',
          'HOUR': '%H',
          'MINUTE': '%M',
          'SECOND': '%S',
          'DOW': '%w', // Day of week
          'DOY': '%j'  // Day of year
        };

        const format = fieldMap[field.toUpperCase()];
        if (format) {
          return `CAST(strftime('${format}', ${source}) AS INTEGER)`;
        }

        this.warn(`EXTRACT field '${field}' may not be supported. Using strftime.`);
        return `strftime('%${field}', ${source})`;
      }
    );

    // DATE_TRUNC(precision, source)
    result = result.replace(
      /DATE_TRUNC\s*\(\s*'(\w+)',\s*([^)]+)\)/gi,
      (match, precision, source) => {
        this.log(`Converting DATE_TRUNC with precision: ${precision}`);

        const precisionMap: Record<string, string> = {
          'year': "strftime('%Y-01-01', ${source})",
          'month': "strftime('%Y-%m-01', ${source})",
          'day': "date(${source})",
          'hour': "strftime('%Y-%m-%d %H:00:00', ${source})",
          'minute': "strftime('%Y-%m-%d %H:%M:00', ${source})"
        };

        const format = precisionMap[precision.toLowerCase()];
        if (format) {
          return format.replace('${source}', source);
        }

        this.warn(`DATE_TRUNC precision '${precision}' may not be fully supported.`);
        return `date(${source})`;
      }
    );

    // AGE() function (not directly supported in SQLite)
    if (result.match(/\bAGE\s*\(/i)) {
      this.warn('AGE() function is not directly supported in SQLite. Consider calculating intervals manually.');
    }

    return result;
  }

  private rewriteStringFunctions(sql: string): string {
    let result = sql;

    // CONCAT_WS(separator, str1, str2, ...) -> concatenation with separator
    result = result.replace(
      /CONCAT_WS\s*\(\s*'([^']+)',\s*([^)]+)\)/gi,
      (match, separator, fields) => {
        const fieldList = fields.split(',').map((f: string) => f.trim());
        const concatenated = fieldList.join(` || '${separator}' || `);
        return `(${concatenated})`;
      }
    );

    // CONCAT(str1, str2, ...) -> str1 || str2 || ...
    result = result.replace(
      /CONCAT\s*\(([^)]+)\)/gi,
      (match, fields) => {
        const fieldList = fields.split(',').map((f: string) => f.trim());
        return `(${fieldList.join(' || ')})`;
      }
    );

    // POSITION(substring IN string) -> INSTR(string, substring)
    result = result.replace(
      /POSITION\s*\(\s*([^)]+)\s+IN\s+([^)]+)\)/gi,
      (match, substring, string) => {
        return `INSTR(${string}, ${substring})`;
      }
    );

    // SUBSTRING(string FROM start FOR length) -> SUBSTR(string, start, length)
    result = result.replace(
      /SUBSTRING\s*\(\s*([^)]+)\s+FROM\s+(\d+)(?:\s+FOR\s+(\d+))?\)/gi,
      (match, string, start, length) => {
        if (length) {
          return `SUBSTR(${string}, ${start}, ${length})`;
        }
        return `SUBSTR(${string}, ${start})`;
      }
    );

    // LEFT(string, n) and RIGHT(string, n) are supported in SQLite 3.38+
    // For older versions, we'd need to rewrite them

    // LPAD and RPAD (not directly supported in SQLite)
    if (result.match(/\b(LPAD|RPAD)\s*\(/i)) {
      this.warn('LPAD/RPAD functions are not directly supported in SQLite. Consider using application-level padding.');
    }

    // REGEXP_REPLACE (not directly supported in standard SQLite)
    if (result.match(/\bREGEXP_REPLACE\s*\(/i)) {
      this.warn('REGEXP_REPLACE is not supported in standard SQLite. Consider using the REGEXP extension or application-level logic.');
    }

    return result;
  }

  private rewriteAggregateFunctions(sql: string): string {
    let result = sql;

    // STRING_AGG(expression, delimiter) -> GROUP_CONCAT(expression, delimiter)
    result = result.replace(
      /STRING_AGG\s*\(\s*([^,]+),\s*'([^']+)'\s*\)/gi,
      (match, expression, delimiter) => {
        return `GROUP_CONCAT(${expression}, '${delimiter}')`;
      }
    );

    // ARRAY_AGG() -> GROUP_CONCAT() with JSON
    result = result.replace(
      /ARRAY_AGG\s*\(([^)]+)\)/gi,
      (match, expression) => {
        this.warn('ARRAY_AGG is being converted to GROUP_CONCAT. Consider using JSON functions for array operations.');
        return `GROUP_CONCAT(${expression}, ',')`;
      }
    );

    // BOOL_AND() and BOOL_OR()
    if (result.match(/\bBOOL_(AND|OR)\s*\(/i)) {
      this.warn('BOOL_AND/BOOL_OR are not directly supported in SQLite. Consider using MIN/MAX with integer booleans.');

      result = result.replace(/\bBOOL_AND\s*\(([^)]+)\)/gi, 'MIN($1)');
      result = result.replace(/\bBOOL_OR\s*\(([^)]+)\)/gi, 'MAX($1)');
    }

    return result;
  }

  private rewriteTypeCasting(sql: string): string {
    let result = sql;

    // PostgreSQL type casting: expression::type -> CAST(expression AS type)
    result = result.replace(
      /([a-zA-Z0-9_'"().]+)::(\w+)/g,
      (match, expression, type) => {
        // Map PostgreSQL types to SQLite types
        const typeMap: Record<string, string> = {
          'integer': 'INTEGER',
          'int': 'INTEGER',
          'bigint': 'INTEGER',
          'smallint': 'INTEGER',
          'numeric': 'REAL',
          'decimal': 'REAL',
          'real': 'REAL',
          'double precision': 'REAL',
          'float': 'REAL',
          'text': 'TEXT',
          'varchar': 'TEXT',
          'char': 'TEXT',
          'boolean': 'INTEGER',
          'bool': 'INTEGER',
          'date': 'TEXT',
          'timestamp': 'TEXT',
          'time': 'TEXT',
          'bytea': 'BLOB'
        };

        const sqliteType = typeMap[type.toLowerCase()] || type.toUpperCase();
        return `CAST(${expression} AS ${sqliteType})`;
      }
    );

    return result;
  }

  private rewriteOperators(sql: string): string {
    let result = sql;

    // String concatenation operator || is the same in both

    // ILIKE operator (case-insensitive LIKE)
    result = result.replace(
      /\s+ILIKE\s+/gi,
      ' LIKE '
    );

    // ~~ (LIKE) and ~~* (ILIKE) operators
    result = result.replace(/\s+~~\*\s+/g, ' LIKE ');
    result = result.replace(/\s+~~\s+/g, ' LIKE ');

    // !~~ (NOT LIKE) and !~~* (NOT ILIKE) operators
    result = result.replace(/\s+!~~\*\s+/g, ' NOT LIKE ');
    result = result.replace(/\s+!~~\s+/g, ' NOT LIKE ');

    // Regex operators (not supported in standard SQLite)
    if (result.match(/\s+[!]?~[*]?\s+/)) {
      this.warn('Regular expression operators (~, ~*, !~, !~*) are not supported in standard SQLite. Consider using the REGEXP extension.');
    }

    return result;
  }

  rewriteFunction(functionCall: string): string {
    // This is called for individual function rewrites
    const lower = functionCall.toLowerCase();

    if (lower.startsWith('now()')) {
      return 'CURRENT_TIMESTAMP';
    }

    return functionCall;
  }

  rewriteOperator(operator: string): string {
    const operatorMap: Record<string, string> = {
      '||': '||',  // Same in both
      'ILIKE': 'LIKE',
      '~~': 'LIKE',
      '~~*': 'LIKE',
      '!~~': 'NOT LIKE',
      '!~~*': 'NOT LIKE'
    };

    return operatorMap[operator] || operator;
  }

  private rewriteBooleans(sql: string): string {
    let result = sql;

    // Convert TRUE/FALSE to 1/0
    result = result.replace(/\b(=|!=|<>)\s*TRUE\b/gi, '$1 1');
    result = result.replace(/\b(=|!=|<>)\s*FALSE\b/gi, '$1 0');

    // WHERE TRUE/FALSE conditions
    result = result.replace(/\bWHERE\s+TRUE\b/gi, 'WHERE 1');
    result = result.replace(/\bWHERE\s+FALSE\b/gi, 'WHERE 0');

    // AND/OR TRUE/FALSE
    result = result.replace(/\bAND\s+TRUE\b/gi, 'AND 1');
    result = result.replace(/\bAND\s+FALSE\b/gi, 'AND 0');
    result = result.replace(/\bOR\s+TRUE\b/gi, 'OR 1');
    result = result.replace(/\bOR\s+FALSE\b/gi, 'OR 0');

    return result;
  }

  private rewriteReturning(sql: string): string {
    // RETURNING clause is not supported in standard SQLite
    if (sql.match(/\bRETURNING\b/i)) {
      this.warn('RETURNING clause is not supported in standard SQLite. You may need to use a SELECT query after the INSERT/UPDATE/DELETE.');
      // Remove the RETURNING clause for now
      // In practice, drivers should handle this by issuing a follow-up query
      return sql.replace(/\s+RETURNING\s+[^;]+/gi, '');
    }

    return sql;
  }

  private rewriteLimitOffset(sql: string): string {
    // PostgreSQL: LIMIT n OFFSET m
    // SQLite: LIMIT n OFFSET m (same syntax)
    // But PostgreSQL also supports: OFFSET m LIMIT n

    let result = sql;

    // Reorder OFFSET before LIMIT to the SQLite standard order
    result = result.replace(
      /\bOFFSET\s+(\d+)\s+LIMIT\s+(\d+)/gi,
      'LIMIT $2 OFFSET $1'
    );

    return result;
  }

  private convertDateFormat(pgFormat: string): string {
    // Convert PostgreSQL date format to SQLite strftime format
    const formatMap: Record<string, string> = {
      'YYYY': '%Y',
      'YY': '%y',
      'MM': '%m',
      'DD': '%d',
      'HH24': '%H',
      'HH': '%I',
      'MI': '%M',
      'SS': '%S',
      'MS': '%f'
    };

    let sqliteFormat = pgFormat;
    Object.entries(formatMap).forEach(([pg, sqlite]) => {
      sqliteFormat = sqliteFormat.replace(new RegExp(pg, 'g'), sqlite);
    });

    return sqliteFormat;
  }
}

/**
 * Factory function to create PostgreSQL query rewriter
 */
export function createPostgreSQLQueryRewriter(options?: PluginOptions): PostgreSQLQueryRewriter {
  return new PostgreSQLQueryRewriter(options);
}
