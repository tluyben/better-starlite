/**
 * Oracle to SQLite Query Rewriter Plugin
 *
 * Translates Oracle queries to SQLite-compatible syntax
 */

import {
  BaseQueryRewriter,
  PluginOptions
} from '../plugin-interface';

export class OracleQueryRewriter extends BaseQueryRewriter {
  readonly name = 'oracle-query';
  readonly sourceDialect = 'oracle';

  constructor(options: PluginOptions = {}) {
    super(options);
  }

  needsRewrite(sql: string): boolean {
    const oraclePatterns = [
      /\bSYSDATE\b/i,
      /\bSYSTIMESTAMP\b/i,
      /\bNVL\(/i,
      /\bNVL2\(/i,
      /\bDECODE\(/i,
      /\bTO_CHAR\(/i,
      /\bTO_DATE\(/i,
      /\bTO_NUMBER\(/i,
      /\bTO_TIMESTAMP\(/i,
      /\bTRUNC\(/i,
      /\bADD_MONTHS\(/i,
      /\bMONTHS_BETWEEN\(/i,
      /\bNEXT_DAY\(/i,
      /\bLAST_DAY\(/i,
      /\bINSTR\(/i,
      /\bSUBSTR\(/i,
      /\bLENGTH\(/i,
      /\|\|/,  // String concatenation
      /\bROWNUM\b/i,
      /\bDUAL\b/i,
      /\bFETCH\s+FIRST/i,
      /\bOFFSET\s+\d+\s+ROWS/i
    ];

    return oraclePatterns.some(pattern => pattern.test(sql));
  }

  rewriteQuery(sql: string): string {
    this.log(`Rewriting Oracle query: ${sql.substring(0, 50)}...`);

    let rewritten = sql;

    // Rewrite date/time functions
    rewritten = this.rewriteDateTimeFunctions(rewritten);

    // Rewrite string functions
    rewritten = this.rewriteStringFunctions(rewritten);

    // Rewrite conditional functions
    rewritten = this.rewriteConditionalFunctions(rewritten);

    // Rewrite type conversion functions
    rewritten = this.rewriteConversionFunctions(rewritten);

    // Rewrite ROWNUM and pagination
    rewritten = this.rewriteRownum(rewritten);

    // Rewrite DUAL table references
    rewritten = this.rewriteDual(rewritten);

    // Remove schema prefixes
    rewritten = rewritten.replace(/\b(\w+)\.(\w+)\b/g, '$2');

    this.log(`Rewritten query: ${rewritten.substring(0, 50)}...`);

    return rewritten;
  }

  private rewriteDateTimeFunctions(sql: string): string {
    let result = sql;

    // SYSDATE -> CURRENT_TIMESTAMP
    result = result.replace(/\bSYSDATE\b/gi, 'CURRENT_TIMESTAMP');

    // SYSTIMESTAMP -> CURRENT_TIMESTAMP
    result = result.replace(/\bSYSTIMESTAMP\b/gi, 'CURRENT_TIMESTAMP');

    // CURRENT_DATE -> date('now')
    result = result.replace(/\bCURRENT_DATE\b/gi, "date('now')");

    // CURRENT_TIMESTAMP -> CURRENT_TIMESTAMP (same)
    result = result.replace(/\bCURRENT_TIMESTAMP\b/gi, 'CURRENT_TIMESTAMP');

    // TRUNC(date) -> date(date)
    result = result.replace(
      /\bTRUNC\s*\(\s*([^),]+)\s*\)/gi,
      'date($1)'
    );

    // TRUNC(date, format) with format
    result = result.replace(
      /\bTRUNC\s*\(\s*([^,]+),\s*'([^']+)'\s*\)/gi,
      (match, dateExpr, format) => {
        const formatLower = format.toLowerCase();
        if (formatLower === 'yyyy' || formatLower === 'year') {
          return `strftime('%Y-01-01', ${dateExpr})`;
        } else if (formatLower === 'mm' || formatLower === 'month') {
          return `strftime('%Y-%m-01', ${dateExpr})`;
        } else if (formatLower === 'dd' || formatLower === 'day') {
          return `date(${dateExpr})`;
        }

        this.warn(`TRUNC format '${format}' may not be fully supported.`);
        return `date(${dateExpr})`;
      }
    );

    // ADD_MONTHS(date, n) -> date(date, '+n months')
    result = result.replace(
      /\bADD_MONTHS\s*\(\s*([^,]+),\s*(-?\d+)\s*\)/gi,
      (match, dateExpr, months) => {
        const sign = parseInt(months) >= 0 ? '+' : '';
        return `date(${dateExpr}, '${sign}${months} months')`;
      }
    );

    // MONTHS_BETWEEN(date1, date2)
    result = result.replace(
      /\bMONTHS_BETWEEN\s*\(\s*([^,]+),\s*([^)]+)\)/gi,
      (match, date1, date2) => {
        this.warn('MONTHS_BETWEEN is approximated. Results may not be exact.');
        // Approximate: (julianday(date1) - julianday(date2)) / 30.44
        return `((julianday(${date1}) - julianday(${date2})) / 30.44)`;
      }
    );

    // NEXT_DAY(date, day_of_week) - complex, not directly supported
    if (result.match(/\bNEXT_DAY\s*\(/i)) {
      this.warn('NEXT_DAY function is not directly supported in SQLite. Consider using application-level logic.');
    }

    // LAST_DAY(date) - get last day of month
    result = result.replace(
      /\bLAST_DAY\s*\(\s*([^)]+)\)/gi,
      (match, dateExpr) => {
        // Get the last day of the month for the given date
        return `date(${dateExpr}, 'start of month', '+1 month', '-1 day')`;
      }
    );

    // EXTRACT(field FROM source)
    result = result.replace(
      /\bEXTRACT\s*\(\s*(\w+)\s+FROM\s+([^)]+)\)/gi,
      (match, field, source) => {
        const fieldMap: Record<string, string> = {
          'YEAR': '%Y',
          'MONTH': '%m',
          'DAY': '%d',
          'HOUR': '%H',
          'MINUTE': '%M',
          'SECOND': '%S'
        };

        const format = fieldMap[field.toUpperCase()];
        if (format) {
          return `CAST(strftime('${format}', ${source}) AS INTEGER)`;
        }

        this.warn(`EXTRACT field '${field}' may not be supported.`);
        return match;
      }
    );

    return result;
  }

  private rewriteStringFunctions(sql: string): string {
    let result = sql;

    // String concatenation || operator is the same in both
    // No changes needed

    // INSTR(string, substring, position, occurrence)
    // SQLite INSTR only supports INSTR(string, substring)
    result = result.replace(
      /\bINSTR\s*\(\s*([^,]+),\s*([^,)]+)(?:,\s*\d+)?(?:,\s*\d+)?\s*\)/gi,
      (match, string, substring) => {
        if (match.includes(',', match.indexOf(substring) + substring.length)) {
          this.warn('INSTR with position/occurrence parameters is not fully supported in SQLite.');
        }
        return `INSTR(${string}, ${substring})`;
      }
    );

    // SUBSTR(string, start, length) - same in both, but Oracle is 1-indexed (SQLite too)
    // No changes needed

    // LENGTH(string) - same in both
    // No changes needed

    // TRIM(LEADING/TRAILING/BOTH chars FROM string) -> TRIM/LTRIM/RTRIM
    result = result.replace(
      /\bTRIM\s*\(\s*LEADING\s+(?:'([^']+)'|(\w+))\s+FROM\s+([^)]+)\)/gi,
      (match, chars1, chars2, string) => {
        const chars = chars1 || chars2;
        if (chars && chars !== ' ') {
          this.warn('TRIM with custom characters is limited in SQLite. Only space trimming is fully supported.');
        }
        return `LTRIM(${string})`;
      }
    );

    result = result.replace(
      /\bTRIM\s*\(\s*TRAILING\s+(?:'([^']+)'|(\w+))\s+FROM\s+([^)]+)\)/gi,
      (match, chars1, chars2, string) => {
        const chars = chars1 || chars2;
        if (chars && chars !== ' ') {
          this.warn('TRIM with custom characters is limited in SQLite. Only space trimming is fully supported.');
        }
        return `RTRIM(${string})`;
      }
    );

    result = result.replace(
      /\bTRIM\s*\(\s*BOTH\s+(?:'([^']+)'|(\w+))\s+FROM\s+([^)]+)\)/gi,
      (match, chars1, chars2, string) => {
        const chars = chars1 || chars2;
        if (chars && chars !== ' ') {
          this.warn('TRIM with custom characters is limited in SQLite. Only space trimming is fully supported.');
        }
        return `TRIM(${string})`;
      }
    );

    // LPAD and RPAD (not directly supported)
    if (result.match(/\b(LPAD|RPAD)\s*\(/i)) {
      this.warn('LPAD/RPAD functions are not directly supported in SQLite.');
    }

    // INITCAP(string) - not in SQLite
    if (result.match(/\bINITCAP\s*\(/i)) {
      this.warn('INITCAP function is not supported in SQLite. Consider using application-level logic.');
    }

    return result;
  }

  private rewriteConditionalFunctions(sql: string): string {
    let result = sql;

    // NVL(expr1, expr2) -> IFNULL(expr1, expr2) or COALESCE(expr1, expr2)
    result = result.replace(/\bNVL\s*\(/gi, 'IFNULL(');

    // NVL2(expr1, expr2, expr3) -> CASE WHEN expr1 IS NOT NULL THEN expr2 ELSE expr3 END
    result = result.replace(
      /\bNVL2\s*\(\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/gi,
      '(CASE WHEN $1 IS NOT NULL THEN $2 ELSE $3 END)'
    );

    // DECODE(expr, search1, result1, search2, result2, ..., default)
    // Convert to CASE expression
    result = result.replace(
      /\bDECODE\s*\(([^)]+)\)/gi,
      (match, args) => {
        const argList = args.split(',').map((a: string) => a.trim());

        if (argList.length < 3) {
          this.warn('DECODE requires at least 3 arguments.');
          return match;
        }

        const expr = argList[0];
        let caseExpr = 'CASE';

        // Process pairs of search/result
        for (let i = 1; i < argList.length - 1; i += 2) {
          if (i + 1 < argList.length) {
            caseExpr += ` WHEN ${expr} = ${argList[i]} THEN ${argList[i + 1]}`;
          }
        }

        // Add default if odd number of arguments (after the first)
        if (argList.length % 2 === 0) {
          caseExpr += ` ELSE ${argList[argList.length - 1]}`;
        }

        caseExpr += ' END';
        return caseExpr;
      }
    );

    return result;
  }

  private rewriteConversionFunctions(sql: string): string {
    let result = sql;

    // TO_CHAR(value, format) -> CAST or strftime
    result = result.replace(
      /\bTO_CHAR\s*\(\s*([^,)]+)(?:,\s*'([^']*)')?\s*\)/gi,
      (match, value, format) => {
        if (format) {
          // Date format
          const sqliteFormat = this.convertOracleDateFormat(format);
          return `strftime('${sqliteFormat}', ${value})`;
        } else {
          // Simple conversion to text
          return `CAST(${value} AS TEXT)`;
        }
      }
    );

    // TO_DATE(string, format) -> date()
    result = result.replace(
      /\bTO_DATE\s*\(\s*'([^']+)'(?:,\s*'([^']*)')?\s*\)/gi,
      (match, dateStr, format) => {
        return `date('${dateStr}')`;
      }
    );

    // TO_TIMESTAMP(string, format) -> datetime()
    result = result.replace(
      /\bTO_TIMESTAMP\s*\(\s*'([^']+)'(?:,\s*'([^']*)')?\s*\)/gi,
      (match, dateStr, format) => {
        return `datetime('${dateStr}')`;
      }
    );

    // TO_NUMBER(string) -> CAST(string AS REAL/INTEGER)
    result = result.replace(
      /\bTO_NUMBER\s*\(\s*([^)]+)\)/gi,
      'CAST($1 AS REAL)'
    );

    return result;
  }

  private rewriteRownum(sql: string): string {
    let result = sql;

    // ROWNUM for limiting results
    // Oracle: WHERE ROWNUM <= n
    // SQLite: LIMIT n
    result = result.replace(
      /WHERE\s+ROWNUM\s*<=\s*(\d+)/gi,
      (match, limit) => {
        // Move to LIMIT clause at end
        // This is a simplified conversion - may need adjustment for complex queries
        this.log(`Converting ROWNUM <= ${limit} to LIMIT ${limit}`);
        return `LIMIT ${limit}`;
      }
    );

    // Handle AND ROWNUM <= n (more common pattern)
    result = result.replace(
      /\s+AND\s+ROWNUM\s*<=\s*(\d+)/gi,
      (match, limit) => {
        // Append LIMIT at the end instead
        this.log(`Converting AND ROWNUM <= ${limit} to LIMIT ${limit}`);
        return ` LIMIT ${limit}`;
      }
    );

    // OFFSET n ROWS FETCH FIRST m ROWS ONLY -> LIMIT m OFFSET n
    result = result.replace(
      /OFFSET\s+(\d+)\s+ROWS\s+FETCH\s+FIRST\s+(\d+)\s+ROWS?\s+ONLY/gi,
      'LIMIT $2 OFFSET $1'
    );

    // FETCH FIRST n ROWS ONLY -> LIMIT n
    result = result.replace(
      /FETCH\s+FIRST\s+(\d+)\s+ROWS?\s+ONLY/gi,
      'LIMIT $1'
    );

    // More complex ROWNUM usage (in subqueries, etc.) would need more sophisticated handling
    if (result.match(/\bROWNUM\b/i)) {
      this.warn('Complex ROWNUM usage may not be fully supported. Consider restructuring the query.');
    }

    return result;
  }

  private rewriteDual(sql: string): string {
    // Oracle uses DUAL as a dummy table for SELECT statements
    // SQLite doesn't need a FROM clause for simple SELECTs

    let result = sql;

    // SELECT ... FROM DUAL -> SELECT ...
    result = result.replace(
      /\bFROM\s+DUAL\b/gi,
      ''
    );

    // Clean up any extra whitespace
    result = result.replace(/\s+WHERE/gi, ' WHERE');
    result = result.replace(/\s+$/g, '');

    return result;
  }

  rewriteFunction(functionCall: string): string {
    const lower = functionCall.toLowerCase();

    if (lower === 'sysdate') {
      return 'CURRENT_TIMESTAMP';
    } else if (lower === 'systimestamp') {
      return 'CURRENT_TIMESTAMP';
    } else if (lower.startsWith('nvl(')) {
      return functionCall.replace(/^nvl\(/i, 'IFNULL(');
    }

    return functionCall;
  }

  rewriteOperator(operator: string): string {
    // Most operators are the same
    // || for concatenation is the same
    return operator;
  }

  private convertOracleDateFormat(oracleFormat: string): string {
    // Convert Oracle date format to SQLite strftime format
    const formatMap: Record<string, string> = {
      'YYYY': '%Y',
      'YY': '%y',
      'MM': '%m',
      'MON': '%b',
      'MONTH': '%B',
      'DD': '%d',
      'DY': '%a',
      'DAY': '%A',
      'HH24': '%H',
      'HH': '%I',
      'MI': '%M',
      'SS': '%S',
      'AM': '%p',
      'PM': '%p'
    };

    let sqliteFormat = oracleFormat;
    Object.entries(formatMap).forEach(([oracle, sqlite]) => {
      sqliteFormat = sqliteFormat.replace(new RegExp(oracle, 'g'), sqlite);
    });

    return sqliteFormat;
  }
}

/**
 * Factory function to create Oracle query rewriter
 */
export function createOracleQueryRewriter(options?: PluginOptions): OracleQueryRewriter {
  return new OracleQueryRewriter(options);
}
