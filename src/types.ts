/**
 * Type definitions for Better-Starlite
 * These are pure TypeScript types with no runtime code
 */

export interface Options {
  readonly?: boolean;
  fileMustExist?: boolean;
  timeout?: number;
  verbose?: boolean;
  nativeBinding?: string;
}

export interface PragmaOptions {
  simple?: boolean;
}

export interface RegistrationOptions {
  varargs?: boolean;
  deterministic?: boolean;
  safeIntegers?: boolean;
}

export interface AggregateOptions extends RegistrationOptions {
  seed?: any;
  step: (total: any, next: any) => any;
  inverse?: (total: any, next: any) => any;
  result?: (total: any) => any;
}