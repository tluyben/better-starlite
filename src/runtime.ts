/**
 * Runtime detection utilities for Node.js and Deno
 */

export type Runtime = 'node' | 'deno' | 'unknown';

/**
 * Detect the current runtime environment
 */
export function detectRuntime(): Runtime {
  // Check for Deno
  if (typeof (globalThis as any).Deno !== 'undefined') {
    return 'deno';
  }

  // Check for Node.js
  if (typeof process !== 'undefined' &&
      process.versions &&
      process.versions.node) {
    return 'node';
  }

  return 'unknown';
}

/**
 * Check if we're running in Deno
 */
export function isDeno(): boolean {
  return detectRuntime() === 'deno';
}

/**
 * Check if we're running in Node.js
 */
export function isNode(): boolean {
  return detectRuntime() === 'node';
}