# Better-Starlite Usage Guide

## 🚨 CRITICAL: Avoiding Compilation Errors

The #1 issue with SQLite libraries is compilation errors when used in different environments (React Native, browsers, etc.). **Better-Starlite solves this with a driver injection system.**

## The Golden Rule

**NEVER import from the main package if you're not sure about the environment:**

```javascript
// ❌ WRONG - May cause compilation errors
import Database from 'better-starlite';  // This might auto-load drivers!

// ✅ CORRECT - Always safe
import Database from 'better-starlite/safe';  // No drivers loaded
```

## Entry Points

Better-Starlite provides multiple entry points for different use cases:

| Entry Point | Path | Auto-loads | Safe for |
|------------|------|------------|----------|
| **Safe** (Recommended) | `better-starlite/safe` | Nothing | ✅ All platforms |
| **Node.js** | `better-starlite/node` | sqlite-node, rqlite | Node.js only |
| **Browser** | `better-starlite/browser` | rqlite, dummy | Browsers only |
| **Main** | `better-starlite` | Nothing (same as safe) | ✅ All platforms |

## Platform-Specific Usage

### React Native / Mobile

```javascript
// ✅ SAFE - No compilation errors
import Database, { DriverRegistry } from 'better-starlite/safe';

// Import YOUR React Native driver (not ours!)
import { createReactNativeDriver } from './drivers/my-rn-sqlite';

// Register it
DriverRegistry.register('rn-sqlite', createReactNativeDriver());

// Use it
const db = new Database('app.db', { driver: 'rn-sqlite' });
```

### Node.js

```javascript
// Option 1: Auto-registration (convenient)
import Database from 'better-starlite/node';
const db = new Database('app.db'); // Auto-uses sqlite-node

// Option 2: Manual registration (more control)
import Database, { DriverRegistry } from 'better-starlite/safe';
import { createSqliteNodeDriver } from 'better-starlite/drivers/sqlite-node';

DriverRegistry.register('sqlite-node', createSqliteNodeDriver());
const db = new Database('app.db', { driver: 'sqlite-node' });
```

### Browser

```javascript
// Option 1: Use browser entry (auto-registers web-safe drivers)
import Database from 'better-starlite/browser';
const db = new Database('http://localhost:4001'); // Auto-uses rqlite

// Option 2: Manual registration
import Database, { DriverRegistry } from 'better-starlite/safe';
import { createRqliteDriver } from 'better-starlite/drivers/rqlite';

DriverRegistry.register('rqlite', createRqliteDriver());
const db = new Database('http://localhost:4001', { driver: 'rqlite' });
```

### Deno

```typescript
import Database, { DriverRegistry } from './better-starlite/src/index-safe.ts';
import { createSqliteDenoDriver } from './better-starlite/src/drivers/sqlite-deno-driver.ts';

const driver = createSqliteDenoDriver();
await driver.loadDenoSqlite(); // Async loading required
DriverRegistry.register('sqlite-deno', driver);

const db = await driver.createDatabaseAsync('app.db');
```

## Package.json Configuration

Configure your package.json to expose the right entry points:

```json
{
  "name": "better-starlite",
  "main": "dist/index-safe.js",
  "exports": {
    ".": "./dist/index-safe.js",
    "./safe": "./dist/index-safe.js",
    "./node": "./dist/node.js",
    "./browser": "./dist/browser.js",
    "./drivers": "./dist/drivers/index.js",
    "./drivers/*": "./dist/drivers/*.js"
  },
  "browser": {
    ".": "./dist/browser.js",
    "./safe": "./dist/index-safe.js"
  },
  "react-native": {
    ".": "./dist/index-safe.js"
  }
}
```

## Bundler Configuration

### Webpack

```javascript
module.exports = {
  externals: {
    'better-sqlite3': 'commonjs better-sqlite3',
    'deasync': 'commonjs deasync'
  },
  resolve: {
    alias: {
      'better-starlite': 'better-starlite/safe'
    }
  }
};
```

### Rollup

```javascript
export default {
  external: ['better-sqlite3', 'deasync'],
  output: {
    paths: {
      'better-starlite': 'better-starlite/safe'
    }
  }
};
```

### Vite

```javascript
export default {
  resolve: {
    alias: {
      'better-starlite': 'better-starlite/safe'
    }
  },
  optimizeDeps: {
    exclude: ['better-sqlite3', 'deasync']
  }
};
```

## Testing with Different Drivers

Use the dummy driver for testing without a real database:

```javascript
import Database, { DriverRegistry } from 'better-starlite/safe';
import { createDummyDriver } from 'better-starlite/drivers/dummy';

beforeEach(() => {
  DriverRegistry.clear();
  DriverRegistry.register('dummy', createDummyDriver());
});

test('my database test', () => {
  const db = new Database(':memory:', { driver: 'dummy' });
  // Returns predictable test data
  const users = db.prepare('SELECT * FROM users').all();
  expect(users).toHaveLength(3);
});
```

## Common Patterns

### Conditional Driver Loading

```javascript
import Database, { DriverRegistry } from 'better-starlite/safe';

async function setupDatabase() {
  // Detect environment and load appropriate driver
  if (typeof process !== 'undefined' && process.versions?.node) {
    // Node.js
    const { createSqliteNodeDriver } = await import('better-starlite/drivers/sqlite-node');
    DriverRegistry.register('sqlite', createSqliteNodeDriver());
  } else if (typeof window !== 'undefined') {
    // Browser
    const { createRqliteDriver } = await import('better-starlite/drivers/rqlite');
    DriverRegistry.register('rqlite', createRqliteDriver());
  } else {
    // Unknown environment - use dummy or custom driver
    const { createDummyDriver } = await import('better-starlite/drivers/dummy');
    DriverRegistry.register('dummy', createDummyDriver());
  }

  return new Database('app.db');
}
```

### Factory Pattern

```javascript
// database-factory.js
import Database, { DriverRegistry } from 'better-starlite/safe';

let initialized = false;

export async function createDatabase(url) {
  if (!initialized) {
    await initializeDrivers();
    initialized = true;
  }

  // Auto-detect based on URL
  if (url.startsWith('http')) {
    return new Database(url, { driver: 'rqlite' });
  } else {
    return new Database(url, { driver: 'sqlite' });
  }
}

async function initializeDrivers() {
  // Load only the drivers you need
  if (process.env.NODE_ENV === 'test') {
    const { createDummyDriver } = await import('better-starlite/drivers/dummy');
    DriverRegistry.register('sqlite', createDummyDriver());
    DriverRegistry.register('rqlite', createDummyDriver());
  } else {
    // Production drivers
    const { createSqliteNodeDriver } = await import('better-starlite/drivers/sqlite-node');
    const { createRqliteDriver } = await import('better-starlite/drivers/rqlite');

    DriverRegistry.register('sqlite', createSqliteNodeDriver());
    DriverRegistry.register('rqlite', createRqliteDriver());
  }
}
```

## Troubleshooting

### "Cannot find module 'better-sqlite3'"

**Problem:** Your bundler is trying to bundle better-sqlite3 even though you're not using it.

**Solution:** Use the safe entry point and don't import Node drivers:
```javascript
// Use this
import Database from 'better-starlite/safe';
// NOT this
import Database from 'better-starlite/node';
```

### "No default driver available"

**Problem:** You haven't registered any drivers.

**Solution:** Register at least one driver before creating a database:
```javascript
import { DriverRegistry } from 'better-starlite/safe';
import { createDummyDriver } from 'better-starlite/drivers/dummy';

DriverRegistry.register('dummy', createDummyDriver());
```

### "Driver X is not available in this environment"

**Problem:** The driver you're trying to use doesn't work in your environment.

**Solution:** Use a different driver or create a custom one for your platform.

### Compilation errors in React Native

**Problem:** React Native is trying to compile Node.js modules.

**Solution:**
1. Use the safe entry point
2. Create or use a React Native specific driver
3. Configure Metro to ignore Node modules:

```javascript
// metro.config.js
module.exports = {
  resolver: {
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === 'better-sqlite3' || moduleName === 'deasync') {
        return { type: 'empty' };
      }
      return context.resolveRequest(context, moduleName, platform);
    }
  }
};
```

## Best Practices

1. **Always use the safe entry point** unless you're 100% sure about the environment
2. **Register drivers explicitly** rather than relying on auto-detection
3. **Create environment-specific builds** with only the drivers needed
4. **Use the dummy driver for testing** to avoid database dependencies
5. **Document which drivers your app uses** for other developers

## Examples

Check the `examples/` directory for complete examples:
- `examples/react-native/` - React Native with custom driver
- `examples/browser-webpack/` - Browser with Webpack
- `examples/node-typescript/` - Node.js with TypeScript
- `examples/deno/` - Deno application
- `examples/testing/` - Testing with dummy driver