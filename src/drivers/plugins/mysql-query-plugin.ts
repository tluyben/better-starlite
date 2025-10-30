/**
 * MySQL to SQLite Query Rewriter Plugin
 *
 * Translates MySQL queries to SQLite-compatible syntax
 */

import {
  BaseQueryRewriter,
  PluginOptions
} from '../plugin-interface';

export class MySQLQueryRewriter extends BaseQueryRewriter {
  readonly name = 'mysql-query';
  readonly sourceDialect = 'mysql';

  constructor(options: PluginOptions = {}) {
    super(options);
  }

  needsRewrite(sql: string): boolean {
    const mysqlPatterns = [
      /\bNOW\(\)/i,
      /\bCURDATE\(\)/i,
      /\bCURTIME\(\)/i,
      /\bDATE_FORMAT\(/i,
      /\bSTR_TO_DATE\(/i,
      /\bDATE_ADD\(/i,
      /\bDATE_SUB\(/i,
      /\bTIMESTAMPDIFF\(/i,
      /\bTIMESTAMPADD\(/i,
      /\bCONCAT\(/i,
      /\bCONCAT_WS\(/i,
      /\bGROUP_CONCAT\(/i,
      /\bIF\(/i,
      /\bIFNULL\(/i,
      /\bFIND_IN_SET\(/i,
      /`/,  // Backticks
      /\bLIMIT\s+\d+\s*,/i, // LIMIT offset, count
      /\bREGEXP\b/i,
      /\bRLIKE\b/i
    ];

    return mysqlPatterns.some(pattern => pattern.test(sql));
  }

  rewriteQuery(sql: string): string {
    this.log(`Rewriting MySQL query: ${sql.substring(0, 50)}...`);

    let rewritten = sql;

    // Replace backticks with double quotes
    rewritten = rewritten.replace(/`/g, '"');

    // Rewrite date/time functions
    rewritten = this.rewriteDateTimeFunctions(rewritten);

    // Rewrite string functions
    rewritten = this.rewriteStringFunctions(rewritten);

    // Rewrite conditional functions
    rewritten = this.rewriteConditionalFunctions(rewritten);

    // Rewrite aggregate functions
    rewritten = this.rewriteAggregateFunctions(rewritten);

    // Rewrite LIMIT syntax
    rewritten = this.rewriteLimit(rewritten);

    // Rewrite operators
    rewritten = this.rewriteOperators(rewritten);

    // Remove database name prefixes (database.table -> table)
    rewritten = rewritten.replace(/\b(\w+)\.(\w+)\b/g, '$2');

    this.log(`Rewritten query: ${rewritten.substring(0, 50)}...`);

    return rewritten;
  }

  private rewriteDateTimeFunctions(sql: string): string {
    let result = sql;

    // NOW() -> CURRENT_TIMESTAMP
    result = result.replace(/\bNOW\(\)/gi, 'CURRENT_TIMESTAMP');

    // CURDATE() -> date('now')
    result = result.replace(/\bCURDATE\(\)/gi, "date('now')");

    // CURTIME() -> time('now')
    result = result.replace(/\bCURTIME\(\)/gi, "time('now')");

    // CURRENT_DATE() -> date('now')
    result = result.replace(/\bCURRENT_DATE\(\)/gi, "date('now')");

    // CURRENT_TIME() -> time('now')
    result = result.replace(/\bCURRENT_TIME\(\)/gi, "time('now')");

    // CURRENT_TIMESTAMP() -> CURRENT_TIMESTAMP
    result = result.replace(/\bCURRENT_TIMESTAMP\(\)/gi, 'CURRENT_TIMESTAMP');

    // DATE_FORMAT(date, format) -> strftime(format, date)
    result = result.replace(
      /DATE_FORMAT\s*\(\s*([^,]+),\s*'([^']+)'\s*\)/gi,
      (match, dateExpr, format) => {
        const sqliteFormat = this.convertMySQLDateFormat(format);
        return `strftime('${sqliteFormat}', ${dateExpr})`;
      }
    );

    // STR_TO_DATE(str, format) -> date(str) or datetime(str)
    result = result.replace(
      /STR_TO_DATE\s*\(\s*'([^']+)',\s*'([^']+)'\s*\)/gi,
      (match, dateStr, format) => {
        if (format.includes('%H') || format.includes('%i') || format.includes('%s')) {
          return `datetime('${dateStr}')`;
        }
        return `date('${dateStr}')`;
      }
    );

    // DATE_ADD(date, INTERVAL value unit) -> date(date, '+value unit')
    result = result.replace(
      /DATE_ADD\s*\(\s*([^,]+),\s*INTERVAL\s+(\d+)\s+(\w+)\s*\)/gi,
      (match, dateExpr, value, unit) => {
        const sqliteUnit = this.convertMySQLIntervalUnit(unit);
        return `date(${dateExpr}, '+${value} ${sqliteUnit}')`;
      }
    );

    // DATE_SUB(date, INTERVAL value unit) -> date(date, '-value unit')
    result = result.replace(
      /DATE_SUB\s*\(\s*([^,]+),\s*INTERVAL\s+(\d+)\s+(\w+)\s*\)/gi,
      (match, dateExpr, value, unit) => {
        const sqliteUnit = this.convertMySQLIntervalUnit(unit);
        return `date(${dateExpr}, '-${value} ${sqliteUnit}')`;
      }
    );

    // TIMESTAMPDIFF(unit, start, end) -> difference calculation
    result = result.replace(
      /TIMESTAMPDIFF\s*\(\s*(\w+),\s*([^,]+),\s*([^)]+)\)/gi,
      (match, unit, start, end) => {
        this.log(`Converting TIMESTAMPDIFF with unit: ${unit}`);

        const unitLower = unit.toLowerCase();
        if (unitLower === 'day' || unitLower === 'days') {
          return `(julianday(${end}) - julianday(${start}))`;
        } else if (unitLower === 'hour' || unitLower === 'hours') {
          return `((julianday(${end}) - julianday(${start})) * 24)`;
        } else if (unitLower === 'minute' || unitLower === 'minutes') {
          return `((julianday(${end}) - julianday(${start})) * 1440)`;
        } else if (unitLower === 'second' || unitLower === 'seconds') {
          return `((julianday(${end}) - julianday(${start})) * 86400)`;
        }

        this.warn(`TIMESTAMPDIFF unit '${unit}' may not be fully supported.`);
        return `(julianday(${end}) - julianday(${start}))`;
      }
    );

    // TIMESTAMPADD(unit, interval, timestamp)
    result = result.replace(
      /TIMESTAMPADD\s*\(\s*(\w+),\s*(\d+),\s*([^)]+)\)/gi,
      (match, unit, interval, timestamp) => {
        const sqliteUnit = this.convertMySQLIntervalUnit(unit);
        return `datetime(${timestamp}, '+${interval} ${sqliteUnit}')`;
      }
    );

    // YEAR(), MONTH(), DAY() functions
    result = result.replace(/\bYEAR\s*\(([^)]+)\)/gi, "CAST(strftime('%Y', $1) AS INTEGER)");
    result = result.replace(/\bMONTH\s*\(([^)]+)\)/gi, "CAST(strftime('%m', $1) AS INTEGER)");
    result = result.replace(/\bDAY\s*\(([^)]+)\)/gi, "CAST(strftime('%d', $1) AS INTEGER)");
    result = result.replace(/\bHOUR\s*\(([^)]+)\)/gi, "CAST(strftime('%H', $1) AS INTEGER)");
    result = result.replace(/\bMINUTE\s*\(([^)]+)\)/gi, "CAST(strftime('%M', $1) AS INTEGER)");
    result = result.replace(/\bSECOND\s*\(([^)]+)\)/gi, "CAST(strftime('%S', $1) AS INTEGER)");

    // DAYOFWEEK(), DAYOFMONTH(), DAYOFYEAR()
    result = result.replace(/\bDAYOFWEEK\s*\(([^)]+)\)/gi, "CAST(strftime('%w', $1) AS INTEGER) + 1");
    result = result.replace(/\bDAYOFMONTH\s*\(([^)]+)\)/gi, "CAST(strftime('%d', $1) AS INTEGER)");
    result = result.replace(/\bDAYOFYEAR\s*\(([^)]+)\)/gi, "CAST(strftime('%j', $1) AS INTEGER)");

    // WEEKDAY()
    result = result.replace(/\bWEEKDAY\s*\(([^)]+)\)/gi, "CAST(strftime('%w', $1) AS INTEGER)");

    return result;
  }

  private rewriteStringFunctions(sql: string): string {
    let result = sql;

    // CONCAT(str1, str2, ...) -> str1 || str2 || ...
    result = result.replace(
      /CONCAT\s*\(([^)]+)\)/gi,
      (match, fields) => {
        const fieldList = fields.split(',').map((f: string) => f.trim());
        return `(${fieldList.join(' || ')})`;
      }
    );

    // CONCAT_WS(separator, str1, str2, ...) -> concatenation with separator
    result = result.replace(
      /CONCAT_WS\s*\(\s*'([^']+)',\s*([^)]+)\)/gi,
      (match, separator, fields) => {
        const fieldList = fields.split(',').map((f: string) => f.trim());
        const concatenated = fieldList.join(` || '${separator}' || `);
        return `(${concatenated})`;
      }
    );

    // SUBSTRING(str, pos, len) -> SUBSTR(str, pos, len)
    result = result.replace(/\bSUBSTRING\s*\(/gi, 'SUBSTR(');

    // LOCATE(substr, str) -> INSTR(str, substr) - note the parameter order swap
    result = result.replace(
      /LOCATE\s*\(\s*([^,]+),\s*([^)]+)\)/gi,
      (match, substr, str) => {
        return `INSTR(${str}, ${substr})`;
      }
    );

    // CHAR_LENGTH() or CHARACTER_LENGTH() -> LENGTH()
    result = result.replace(/\bCHAR_LENGTH\s*\(/gi, 'LENGTH(');
    result = result.replace(/\bCHARACTER_LENGTH\s*\(/gi, 'LENGTH(');

    // LCASE() and UCASE() -> LOWER() and UPPER()
    result = result.replace(/\bLCASE\s*\(/gi, 'LOWER(');
    result = result.replace(/\bUCASE\s*\(/gi, 'UPPER(');

    // LEFT(str, len) and RIGHT(str, len) are supported in SQLite 3.38+
    // For older versions:
    result = result.replace(
      /\bLEFT\s*\(\s*([^,]+),\s*(\d+)\s*\)/gi,
      'SUBSTR($1, 1, $2)'
    );

    result = result.replace(
      /\bRIGHT\s*\(\s*([^,]+),\s*(\d+)\s*\)/gi,
      'SUBSTR($1, -$2)'
    );

    // REVERSE() - not in standard SQLite
    if (result.match(/\bREVERSE\s*\(/i)) {
      this.warn('REVERSE() function is not available in standard SQLite.');
    }

    // FIND_IN_SET(str, strlist) - not directly supported
    if (result.match(/\bFIND_IN_SET\s*\(/i)) {
      this.warn('FIND_IN_SET() is not directly supported in SQLite. Consider using INSTR with comma-separated values.');

      result = result.replace(
        /FIND_IN_SET\s*\(\s*([^,]+),\s*([^)]+)\)/gi,
        (match, str, strlist) => {
          // Simple approximation: check if string exists in comma-separated list
          return `(CASE WHEN INSTR(${strlist}, ${str}) > 0 THEN 1 ELSE 0 END)`;
        }
      );
    }

    return result;
  }

  private rewriteConditionalFunctions(sql: string): string {
    let result = sql;

    // IF(condition, true_value, false_value) -> CASE WHEN condition THEN true_value ELSE false_value END
    result = result.replace(
      /\bIF\s*\(\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/gi,
      (match, condition, trueValue, falseValue) => {
        return `(CASE WHEN ${condition} THEN ${trueValue} ELSE ${falseValue} END)`;
      }
    );

    // IFNULL(expr1, expr2) -> COALESCE(expr1, expr2) or IFNULL (SQLite has both)
    result = result.replace(/\bIFNULL\s*\(/gi, 'IFNULL(');

    // NULLIF(expr1, expr2) - supported in SQLite
    // No changes needed

    return result;
  }

  private rewriteAggregateFunctions(sql: string): string {
    let result = sql;

    // GROUP_CONCAT(expr [ORDER BY ...] [SEPARATOR sep])
    result = result.replace(
      /GROUP_CONCAT\s*\(\s*([^)]+)\s+SEPARATOR\s+'([^']+)'\s*\)/gi,
      (match, expression, separator) => {
        return `GROUP_CONCAT(${expression}, '${separator}')`;
      }
    );

    // Handle GROUP_CONCAT with ORDER BY (SQLite doesn't support ORDER BY in GROUP_CONCAT)
    if (result.match(/GROUP_CONCAT\s*\([^)]*ORDER\s+BY/i)) {
      this.warn('GROUP_CONCAT with ORDER BY is not supported in standard SQLite. The ORDER BY clause will be removed.');

      result = result.replace(
        /GROUP_CONCAT\s*\(\s*([^)]+)\s+ORDER\s+BY\s+[^)]+\)/gi,
        'GROUP_CONCAT($1)'
      );
    }

    return result;
  }

  private rewriteLimit(sql: string): string {
    // MySQL LIMIT offset, count -> SQLite LIMIT count OFFSET offset
    let result = sql;

    result = result.replace(
      /\bLIMIT\s+(\d+)\s*,\s*(\d+)/gi,
      'LIMIT $2 OFFSET $1'
    );

    return result;
  }

  private rewriteOperators(sql: string): string {
    let result = sql;

    // REGEXP and RLIKE operators (not in standard SQLite)
    if (result.match(/\s+(REGEXP|RLIKE)\s+/i)) {
      this.warn('REGEXP/RLIKE operators require the REGEXP extension in SQLite.');
      // Keep as-is, but warn the user
    }

    // DIV operator (integer division) -> /
    result = result.replace(/\s+DIV\s+/gi, ' / ');

    // MOD operator -> %
    result = result.replace(/\bMOD\s*\(\s*([^,]+),\s*([^)]+)\)/gi, '($1 % $2)');

    return result;
  }

  rewriteFunction(functionCall: string): string {
    const lower = functionCall.toLowerCase();

    if (lower.startsWith('now()')) {
      return 'CURRENT_TIMESTAMP';
    } else if (lower.startsWith('curdate()')) {
      return "date('now')";
    } else if (lower.startsWith('curtime()')) {
      return "time('now')";
    }

    return functionCall;
  }

  rewriteOperator(operator: string): string {
    const operatorMap: Record<string, string> = {
      'DIV': '/',
      'REGEXP': 'REGEXP',
      'RLIKE': 'REGEXP'
    };

    return operatorMap[operator.toUpperCase()] || operator;
  }

  private convertMySQLDateFormat(mysqlFormat: string): string {
    // Convert MySQL date format to SQLite strftime format
    const formatMap: Record<string, string> = {
      '%Y': '%Y',  // 4-digit year
      '%y': '%y',  // 2-digit year
      '%m': '%m',  // Month (01-12)
      '%c': '%m',  // Month (1-12)
      '%M': '%B',  // Month name (not exact in SQLite)
      '%b': '%b',  // Abbreviated month name (not exact in SQLite)
      '%d': '%d',  // Day of month (01-31)
      '%e': '%d',  // Day of month (1-31)
      '%H': '%H',  // Hour (00-23)
      '%h': '%H',  // Hour (01-12) - SQLite doesn't distinguish
      '%I': '%H',  // Hour (01-12)
      '%i': '%M',  // Minutes (00-59)
      '%s': '%S',  // Seconds (00-59)
      '%S': '%S',  // Seconds (00-59)
      '%p': '%p',  // AM/PM
      '%W': '%A',  // Weekday name
      '%a': '%a',  // Abbreviated weekday name
      '%w': '%w',  // Day of week (0-6)
      '%j': '%j'   // Day of year (001-366)
    };

    let sqliteFormat = mysqlFormat;
    Object.entries(formatMap).forEach(([mysql, sqlite]) => {
      sqliteFormat = sqliteFormat.replace(new RegExp(mysql, 'g'), sqlite);
    });

    return sqliteFormat;
  }

  private convertMySQLIntervalUnit(mysqlUnit: string): string {
    // Convert MySQL INTERVAL units to SQLite date modifiers
    const unitMap: Record<string, string> = {
      'YEAR': 'years',
      'YEARS': 'years',
      'MONTH': 'months',
      'MONTHS': 'months',
      'DAY': 'days',
      'DAYS': 'days',
      'HOUR': 'hours',
      'HOURS': 'hours',
      'MINUTE': 'minutes',
      'MINUTES': 'minutes',
      'SECOND': 'seconds',
      'SECONDS': 'seconds'
    };

    return unitMap[mysqlUnit.toUpperCase()] || mysqlUnit.toLowerCase();
  }
}

/**
 * Factory function to create MySQL query rewriter
 */
export function createMySQLQueryRewriter(options?: PluginOptions): MySQLQueryRewriter {
  return new MySQLQueryRewriter(options);
}
