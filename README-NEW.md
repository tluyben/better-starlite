# better-*lite

A unified database interface for SQLite and RQLite with a **driver-based architecture** that works across Node.js, Deno, browsers, and mobile platforms without compilation issues.

## 🚀 Key Features

- 🔌 **Driver-Based Architecture** - No platform-specific code loaded unless explicitly requested
- 🌐 **Universal Compatibility** - Works in Node.js, Deno, browsers, React Native, and more
- 🎯 **Zero Compilation Issues** - Platform dependencies are injected, not bundled
- ⚡ **Multiple Database Support** - SQLite (better-sqlite3), Deno SQLite, RQLite, and custom drivers
- 📦 **Drizzle ORM Support** - Full ORM integration
- 🔄 **Async & Sync APIs** - Modern Promise-based and classic synchronous interfaces

## Why Driver-Based?

Traditional SQLite libraries fail when imported in different environments:
- ❌ `better-sqlite3` won't compile in React Native
- ❌ Node modules break in the browser
- ❌ Deno modules fail in Node.js

**Our solution:** Drivers are injected at runtime, not compiled in. Your app only loads what it needs!

## Installation

```bash
npm install better-starlite
```

## Quick Start

### 1. Register Your Driver

```javascript
import Database from 'better-starlite';
import { DriverRegistry } from 'better-starlite/drivers';

// Option A: Auto-register all available drivers
import { autoRegisterDrivers } from 'better-starlite/drivers';
await autoRegisterDrivers();

// Option B: Register specific driver only
import { createSqliteNodeDriver } from 'better-starlite/drivers/sqlite-node';
DriverRegistry.register('sqlite-node', createSqliteNodeDriver());

// Now use the database
const db = new Database('myapp.db');
```

### 2. Use The Database

The API is identical regardless of which driver you use:

```javascript
// Local SQLite
const localDb = new Database('myapp.db');

// RQLite cluster
const rqliteDb = new Database('http://localhost:4001');

// In-memory database
const memoryDb = new Database(':memory:');

// All use the same API!
const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
const user = stmt.get(userId);
```

## Available Drivers

### Built-in Drivers

| Driver | Platform | Import Path | Auto-Detect |
|--------|----------|-------------|-------------|
| **sqlite-node** | Node.js | `better-starlite/drivers/sqlite-node` | ✅ File paths |
| **sqlite-deno** | Deno | `better-starlite/drivers/sqlite-deno` | ✅ File paths |
| **rqlite** | Any (with fetch) | `better-starlite/drivers/rqlite` | ✅ HTTP(S) URLs |
| **dummy** | Any | `better-starlite/drivers/dummy` | ❌ Testing only |

### Platform Examples

#### Node.js

```javascript
import Database, { DriverRegistry } from 'better-starlite';
import { createSqliteNodeDriver } from 'better-starlite/drivers/sqlite-node';

DriverRegistry.register('sqlite-node', createSqliteNodeDriver());
const db = new Database('app.db');
```

#### Deno

```typescript
import Database, { DriverRegistry } from 'better-starlite';
import { createSqliteDenoDriver } from 'better-starlite/drivers/sqlite-deno';

const driver = createSqliteDenoDriver();
await driver.loadDenoSqlite(); // Async loading for Deno
DriverRegistry.register('sqlite-deno', driver);

const db = await driver.createDatabaseAsync('app.db');
```

#### Browser (with SQL.js or similar)

```javascript
import Database, { DriverRegistry } from 'better-starlite';
import { createBrowserSqliteDriver } from './my-browser-driver';

DriverRegistry.register('browser-sqlite', createBrowserSqliteDriver());
const db = new Database(':memory:', { driver: 'browser-sqlite' });
```

#### React Native

```javascript
import Database, { DriverRegistry } from 'better-starlite';
import { createReactNativeDriver } from './my-react-native-driver';

DriverRegistry.register('rn-sqlite', createReactNativeDriver());
const db = new Database('app.db', { driver: 'rn-sqlite' });
```

## Creating Custom Drivers

Need support for a different database or platform? Create your own driver:

```javascript
// my-custom-driver.js
import { DriverFactory } from 'better-starlite/drivers';

export class MyCustomDriver {
  name = 'my-driver';

  features = {
    transactions: true,
    backup: false,
    // ... other features
  };

  isAvailable() {
    // Check if this driver can work here
    return typeof myRequiredGlobal !== 'undefined';
  }

  createDatabase(filename, options) {
    // Return DatabaseInterface implementation
    return new MyCustomDatabase(filename, options);
  }
}

// Register and use
DriverRegistry.register('my-driver', new MyCustomDriver());
const db = new Database('mydb', { driver: 'my-driver' });
```

See [NEW-DRIVER.md](./NEW-DRIVER.md) for complete driver development guide.

## API

### Core Classes

#### Database Class

```javascript
const db = new Database(filename, options);

// Core methods
db.prepare(sql)        // Prepare a statement
db.exec(sql)          // Execute SQL directly
db.transaction(fn)    // Create a transaction
db.pragma(sql)        // Run PRAGMA commands
db.close()           // Close the database

// Driver-specific features (check driver.features)
db.backup(destination)  // Backup database
db.function(name, fn)   // Register custom function
db.aggregate(name, opts) // Register custom aggregate
```

#### Statement Class

```javascript
const stmt = db.prepare('SELECT * FROM users WHERE age > ?');

// Execution methods
stmt.run(18)           // Execute, return { changes, lastInsertRowid }
stmt.get(18)          // Get single row
stmt.all(18)          // Get all rows
stmt.iterate(18)      // Get iterator

// Modifiers
stmt.pluck()          // Return first column only
stmt.expand()         // Expand nested objects
stmt.raw()           // Return raw arrays instead of objects
```

### Options

```typescript
interface DatabaseOptions {
  // Driver selection
  driver?: string | 'auto';  // Which driver to use

  // Common options
  readonly?: boolean;
  verbose?: boolean;
  timeout?: number;

  // SQLite specific
  disableWAL?: boolean;

  // RQLite specific
  rqliteLevel?: 'none' | 'weak' | 'linearizable';
}
```

## Async API

All methods also available in async version:

```javascript
import { AsyncDatabase } from 'better-starlite';

async function example() {
  const db = new AsyncDatabase('app.db');
  const stmt = await db.prepare('SELECT * FROM users');
  const users = await stmt.all();
  await db.close();
}
```

## With Drizzle ORM

```typescript
import { AsyncDatabase } from 'better-starlite';
import { drizzle } from 'better-starlite/drizzle';

const database = new AsyncDatabase('app.db');
const db = drizzle(database);

// Use Drizzle as normal
const results = await db.select().from(users);
```

## Testing

Use the dummy driver for testing without a real database:

```javascript
import { createDummyDriver } from 'better-starlite/drivers/dummy';

DriverRegistry.register('dummy', createDummyDriver());
const db = new Database(':memory:', { driver: 'dummy' });

// Returns predictable test data
const user = db.prepare('SELECT * FROM users').get();
console.log(user); // { id: 1, name: 'John Doe', ... }
```

## Migration from better-sqlite3

1. Install better-starlite
2. Register the Node driver:
   ```javascript
   import { autoRegisterDriversSync } from 'better-starlite/drivers';
   autoRegisterDriversSync();
   ```
3. Change imports:
   ```javascript
   // Before
   import Database from 'better-sqlite3';

   // After
   import Database from 'better-starlite';
   ```
4. Your existing code continues to work!

## Performance

- **Driver overhead**: Minimal - just one extra function call
- **SQLite performance**: Identical to better-sqlite3
- **RQLite performance**: Network-dependent
- **Memory usage**: Only loaded drivers consume memory

## Troubleshooting

### "No default driver available"
You need to register a driver first:
```javascript
import { autoRegisterDrivers } from 'better-starlite/drivers';
await autoRegisterDrivers();
```

### "Driver X is not available in this environment"
The driver's dependencies aren't available. Check:
- Node driver needs Node.js
- Deno driver needs Deno
- RQLite driver needs fetch API

### Compilation errors with bundlers
Make sure to exclude platform-specific drivers from your bundle:
```javascript
// webpack.config.js
externals: {
  'better-sqlite3': 'commonjs better-sqlite3'
}
```

## Examples

See the `examples/` directory for:
- Platform-specific setup (Node, Deno, Browser, React Native)
- Driver registration patterns
- Custom driver implementation
- Testing with dummy driver
- Drizzle ORM integration

## Contributing

Contributions welcome! Especially new drivers for:
- Web SQL API
- React Native SQLite
- Cloudflare D1
- Turso
- Other databases

See [NEW-DRIVER.md](./NEW-DRIVER.md) for driver development guide.

## License

MIT