/**
 * SQL Translation Error Logger
 *
 * Logs SQL translation errors to database-specific log files for debugging
 * and automated fixing via Claude Code or other tools.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface SQLTranslationError {
  timestamp: string;
  database: string;
  originalSQL: string;
  rewrittenSQL?: string;
  errorMessage: string;
  errorType: 'translation' | 'execution';
  stackTrace?: string;
  params?: any[];
}

export class SQLErrorLogger {
  private static logDir: string = path.join(process.cwd(), 'logs');

  /**
   * Initialize the logger and ensure log directory exists
   */
  static initialize(customLogDir?: string): void {
    if (customLogDir) {
      this.logDir = customLogDir;
    }

    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Log a SQL translation or execution error
   */
  static logError(error: SQLTranslationError): void {
    // Ensure log directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    const logFile = path.join(this.logDir, `translate-error-${error.database}.log`);

    // Format the error entry
    const logEntry = this.formatLogEntry(error);

    // Append to the log file
    try {
      fs.appendFileSync(logFile, logEntry + '\n');
    } catch (err) {
      console.error(`Failed to write to error log: ${err}`);
    }
  }

  /**
   * Format a log entry as JSON with readable formatting
   */
  private static formatLogEntry(error: SQLTranslationError): string {
    const entry = {
      timestamp: error.timestamp,
      database: error.database,
      errorType: error.errorType,
      errorMessage: error.errorMessage,
      originalSQL: error.originalSQL,
      rewrittenSQL: error.rewrittenSQL || null,
      params: error.params || null,
      stackTrace: error.stackTrace || null
    };

    // Use JSON format for easy parsing by scripts
    return JSON.stringify(entry);
  }

  /**
   * Log a translation error (error during SQL rewriting)
   */
  static logTranslationError(
    database: string,
    originalSQL: string,
    error: Error,
    rewrittenSQL?: string
  ): void {
    this.logError({
      timestamp: new Date().toISOString(),
      database,
      originalSQL,
      rewrittenSQL,
      errorMessage: error.message,
      errorType: 'translation',
      stackTrace: error.stack
    });
  }

  /**
   * Log an execution error (error when running rewritten SQL)
   */
  static logExecutionError(
    database: string,
    originalSQL: string,
    rewrittenSQL: string,
    error: Error,
    params?: any[]
  ): void {
    this.logError({
      timestamp: new Date().toISOString(),
      database,
      originalSQL,
      rewrittenSQL,
      errorMessage: error.message,
      errorType: 'execution',
      params,
      stackTrace: error.stack
    });
  }

  /**
   * Read all errors from a specific database log file
   */
  static readErrors(database: string): SQLTranslationError[] {
    const logFile = path.join(this.logDir, `translate-error-${database}.log`);

    if (!fs.existsSync(logFile)) {
      return [];
    }

    const content = fs.readFileSync(logFile, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.trim());

    return lines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(error => error !== null) as SQLTranslationError[];
  }

  /**
   * Clear all errors for a specific database
   */
  static clearErrors(database: string): void {
    const logFile = path.join(this.logDir, `translate-error-${database}.log`);

    if (fs.existsSync(logFile)) {
      fs.unlinkSync(logFile);
    }
  }

  /**
   * Get summary of errors by database
   */
  static getErrorSummary(): Record<string, number> {
    const summary: Record<string, number> = {};

    if (!fs.existsSync(this.logDir)) {
      return summary;
    }

    const files = fs.readdirSync(this.logDir);

    for (const file of files) {
      if (file.startsWith('translate-error-') && file.endsWith('.log')) {
        const database = file.replace('translate-error-', '').replace('.log', '');
        const errors = this.readErrors(database);
        summary[database] = errors.length;
      }
    }

    return summary;
  }

  /**
   * Get the path to the log file for a specific database
   */
  static getLogFilePath(database: string): string {
    return path.join(this.logDir, `translate-error-${database}.log`);
  }
}

// Initialize the logger on module load
if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
  SQLErrorLogger.initialize();
}
