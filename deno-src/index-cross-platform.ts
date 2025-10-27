/**
 * Cross-platform SQLite/RQLite interface for both Node.js and Deno
 * This is the main entry point that works in both environments
 */

import { detectRuntime } from './runtime';

// Define unified interfaces
export interface DatabaseOptions {
  readonly?: boolean;
  fileMustExist?: boolean;
  timeout?: number;
  verbose?: console.log | ((message?: any, ...additionalArgs: any[]) => void);
  nativeBinding?: string;
  disableWAL?: boolean;
  rqliteLevel?: 'none' | 'weak' | 'linearizable';
  [key: string]: any;
}

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

// Factory function to create the appropriate database instance
export async function createDatabase(filename: string, options: DatabaseOptions = {}): Promise<any> {
  const runtime = detectRuntime();

  if (runtime === 'deno') {
    // Dynamic import for Deno
    const module = await import('./database-deno.ts');
    return new module.Database(filename, options);
  } else if (runtime === 'node') {
    // Dynamic import for Node.js
    const module = await import('./database-node');
    return new module.Database(filename, options);
  } else {
    throw new Error('Unsupported runtime environment');
  }
}

// For synchronous compatibility, we provide a factory that returns a promise
export function Database(filename: string, options: DatabaseOptions = {}): any {
  const runtime = detectRuntime();

  // For Node.js, we can use synchronous require
  if (runtime === 'node') {
    const { Database: NodeDatabase } = require('./database-node');
    return new NodeDatabase(filename, options);
  }

  // For Deno, we need to handle it differently
  if (runtime === 'deno') {
    // In Deno, we can't do synchronous imports of local modules
    // We need to use a different approach
    throw new Error(
      'Synchronous database creation not supported in Deno. ' +
      'Please use createDatabase() for async initialization or import from ./database-deno.ts directly.'
    );
  }

  throw new Error('Unsupported runtime environment');
}

// Export the default Database for compatibility
export default Database;

// Re-export async versions
export { AsyncDatabase, AsyncStatement } from './async';

// Re-export drizzle integration
export { drizzle } from './drizzle';

// Export runtime detection utilities
export { detectRuntime, isDeno, isNode } from './runtime';