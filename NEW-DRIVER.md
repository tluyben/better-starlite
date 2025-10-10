# Creating a New Driver for Better-Starlite

This guide explains how to create a new database driver for Better-Starlite. The driver system is designed to allow platform-specific implementations without causing compilation issues when the library is used in different environments.

## Overview

Better-Starlite uses a driver-based architecture that allows different database implementations to be plugged in at runtime. This means:
- No platform-specific code is loaded unless explicitly requested
- No compilation errors when importing the library in environments that don't support certain dependencies
- Easy to add support for new databases or platforms

## Quick Start

1. Copy the template driver from `src/drivers/template-driver.ts`
2. Rename it to match your driver (e.g., `mysql-driver.ts`)
3. Implement all required methods
4. Register your driver in your application

## Step-by-Step Guide

### 1. Create Your Driver File

Start by copying the template:

```bash
cp src/drivers/template-driver.ts src/drivers/my-driver.ts
```

### 2. Implement the Driver Interface

Your driver must implement three main classes:

#### Statement Class

Handles prepared statements and query execution:

```typescript
class MyStatement implements StatementInterface {
  run(...params: any[]): RunResult {
    // Execute INSERT, UPDATE, DELETE
    // Return { changes: number, lastInsertRowid: number }
  }

  get(...params: any[]): any {
    // Fetch single row
    // Return row object or undefined
  }

  all(...params: any[]): any[] {
    // Fetch all rows
    // Return array of row objects
  }

  // ... other required methods
}
```

#### Database Class

Manages the database connection:

```typescript
class MyDatabase implements DatabaseInterface {
  prepare(sql: string): StatementInterface {
    // Create a prepared statement
  }

  exec(sql: string): this {
    // Execute SQL without returning results
  }

  transaction(fn: TransactionFunction): TransactionFunction {
    // Wrap function in transaction
  }

  // ... other required methods
}
```

#### Driver Factory

Creates database instances and reports capabilities:

```typescript
export class MyDriver implements DriverFactory {
  readonly name = 'my-driver';

  readonly features = {
    backup: false,        // Can backup databases?
    loadExtension: false, // Can load extensions?
    customFunctions: true, // Supports custom functions?
    customAggregates: false, // Supports custom aggregates?
    transactions: true,   // Supports transactions?
    wal: false           // Supports WAL mode?
  };

  isAvailable(): boolean {
    // Check if driver can work in current environment
    // e.g., check for Node.js, Deno, browser, etc.
  }

  createDatabase(filename: string, options: DriverOptions): DatabaseInterface {
    // Create and return database instance
  }
}
```

### 3. Handle Platform-Specific Dependencies

**IMPORTANT:** Never import platform-specific modules at the top level of your driver file. This will cause compilation errors in environments that don't have those modules.

#### ❌ Wrong Way:

```typescript
// This will fail in environments without 'my-node-module'
import MyDatabase from 'my-node-module';

export class MyDriver implements DriverFactory {
  // ...
}
```

#### ✅ Right Way:

```typescript
export class MyDriver implements DriverFactory {
  private MyDatabase: any = null;

  isAvailable(): boolean {
    // Check environment first
    return typeof process !== 'undefined' && process.versions?.node;
  }

  createDatabase(filename: string, options: DriverOptions): DatabaseInterface {
    if (!this.MyDatabase) {
      // Dynamic import only when needed
      try {
        this.MyDatabase = require('my-node-module');
      } catch (e) {
        throw new Error('my-node-module is required for this driver');
      }
    }
    // Use the dynamically loaded module
    return new MyDatabaseImpl(this.MyDatabase, filename, options);
  }
}
```

### 4. Using Your Driver

#### Method 1: Direct Registration

```typescript
import { DriverRegistry } from 'better-starlite/drivers';
import { createMyDriver } from './my-driver';

// Register the driver
DriverRegistry.register('my-driver', createMyDriver());

// Use it
import Database from 'better-starlite';

const db = new Database('myfile.db', {
  driver: 'my-driver'
});
```

#### Method 2: Auto-Detection

```typescript
// In your driver file, export a registration function
export function registerMyDriver() {
  if (MyDriver.isAvailable()) {
    DriverRegistry.register('my-driver', new MyDriver());
  }
}

// In your app initialization
import { registerMyDriver } from './drivers/my-driver';
registerMyDriver();
```

## Example Drivers

Look at these existing drivers for reference:

- **`sqlite-node-driver.ts`**: Uses better-sqlite3 for Node.js
- **`sqlite-deno-driver.ts`**: Uses Deno's native SQLite module
- **`rqlite-driver.ts`**: HTTP-based driver using fetch API
- **`dummy-driver.ts`**: Mock driver for testing

## Testing Your Driver

Create tests to ensure your driver works correctly:

```typescript
import { createMyDriver } from './my-driver';

describe('MyDriver', () => {
  let driver;
  let db;

  beforeEach(() => {
    driver = createMyDriver();
    if (driver.isAvailable()) {
      db = driver.createDatabase(':memory:');
    }
  });

  test('should execute queries', () => {
    if (!driver.isAvailable()) {
      return; // Skip test in unsupported environments
    }

    db.exec('CREATE TABLE test (id INTEGER, name TEXT)');
    const stmt = db.prepare('INSERT INTO test VALUES (?, ?)');
    stmt.run(1, 'Test');

    const row = db.prepare('SELECT * FROM test').get();
    expect(row).toEqual({ id: 1, name: 'Test' });
  });
});
```

## Common Patterns

### Async Initialization

If your driver needs async initialization:

```typescript
export class MyDriver implements DriverFactory {
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  async initialize() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInitialize();
    await this.initPromise;
    this.initialized = true;
  }

  private async doInitialize() {
    // Async initialization logic
    const module = await import('my-async-module');
    this.MyDatabase = module.default;
  }

  createDatabase(filename: string, options: DriverOptions): DatabaseInterface {
    if (!this.initialized) {
      throw new Error('Driver not initialized. Call initialize() first');
    }
    // ...
  }
}
```

### Connection Pooling

For network-based drivers:

```typescript
class MyDriver implements DriverFactory {
  private connectionPool = new Map<string, DatabaseInterface>();

  createDatabase(filename: string, options: DriverOptions): DatabaseInterface {
    const key = `${filename}:${JSON.stringify(options)}`;

    if (!this.connectionPool.has(key)) {
      const db = new MyDatabase(filename, options);
      this.connectionPool.set(key, db);
    }

    return this.connectionPool.get(key)!;
  }
}
```

### Error Handling

Always provide clear error messages:

```typescript
createDatabase(filename: string, options: DriverOptions): DatabaseInterface {
  if (!this.isAvailable()) {
    throw new Error(
      `${this.name} driver is not available. ` +
      `This driver requires Node.js environment with 'my-module' installed.`
    );
  }

  if (!filename.startsWith('mydb://')) {
    throw new Error(
      `${this.name} driver requires URIs starting with 'mydb://'`
    );
  }

  // ...
}
```

## Best Practices

1. **Environment Detection**: Always check the environment in `isAvailable()`
2. **Lazy Loading**: Load dependencies only when the driver is actually used
3. **Clear Errors**: Provide helpful error messages when the driver can't be used
4. **Feature Flags**: Accurately report supported features
5. **Type Safety**: Use TypeScript interfaces properly
6. **Memory Management**: Clean up resources in the `close()` method
7. **Documentation**: Comment complex implementations
8. **Testing**: Test in all target environments

## Platform-Specific Considerations

### Node.js
```typescript
isAvailable(): boolean {
  return typeof process !== 'undefined' &&
         process.versions &&
         process.versions.node !== undefined;
}
```

### Deno
```typescript
isAvailable(): boolean {
  return typeof (globalThis as any).Deno !== 'undefined';
}
```

### Browser
```typescript
isAvailable(): boolean {
  return typeof window !== 'undefined' &&
         typeof fetch !== 'undefined';
}
```

### React Native
```typescript
isAvailable(): boolean {
  return typeof (globalThis as any).__REACT_NATIVE__ !== 'undefined';
}
```

## Troubleshooting

### Compilation Errors

If users report compilation errors when importing your driver:
- Check for top-level imports of platform-specific modules
- Ensure all platform code is behind `isAvailable()` checks
- Use dynamic imports or conditional requires

### Runtime Errors

If the driver fails at runtime:
- Verify `isAvailable()` returns correct value
- Check that all required APIs are available
- Ensure proper error handling for missing dependencies

## Contributing

If you create a driver for a popular database, consider contributing it back:

1. Ensure it follows the patterns in this guide
2. Add comprehensive tests
3. Document any special requirements
4. Submit a pull request

## Questions?

For questions or help creating drivers, please open an issue on GitHub.