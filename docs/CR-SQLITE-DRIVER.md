# CR-SQLite Driver for better-starlite

## Overview

The CR-SQLite driver enables **offline-first** applications with **conflict-free replication** using CRDTs (Conflict-free Replicated Data Types). This driver wraps [CR-SQLite](https://github.com/vlcn-io/cr-sqlite) to provide seamless synchronization between multiple database instances without conflicts.

## What is CR-SQLite?

CR-SQLite (Convergent, Replicated SQLite) extends SQLite with CRDT capabilities, enabling:

- **Offline-first applications**: Users can work offline, and changes sync automatically when back online
- **Multi-device sync**: Same data across web, mobile, and server without conflicts
- **Automatic conflict resolution**: Changes from different sources merge automatically
- **Local-first architecture**: Data lives on the device, server is optional
- **Real-time collaboration**: Multiple users can edit the same data simultaneously

## Platform Support

The CR-SQLite driver works across all major JavaScript runtimes:

| Platform | Support | Notes |
|----------|---------|-------|
| **Node.js** | ✅ Full | Uses `@vlcn.io/crsqlite-wasm` |
| **Bun** | ✅ Full | Fast WASM execution, excellent performance |
| **Deno** | ✅ Full | Native WASM support |
| **Browser** | ✅ Full | Via bundler (Webpack, Vite, etc.) |

## Installation

```bash
# Install better-starlite with CR-SQLite support
npm install better-starlite @vlcn.io/crsqlite-wasm

# Or with yarn
yarn add better-starlite @vlcn.io/crsqlite-wasm

# Or with pnpm
pnpm add better-starlite @vlcn.io/crsqlite-wasm

# Or with bun
bun add better-starlite @vlcn.io/crsqlite-wasm
```

## Quick Start

### Basic Usage (Node.js/Bun)

```javascript
const { DriverRegistry } = require('better-starlite/drivers');
const { createCrSqliteDriver } = require('better-starlite/drivers/cr-sqlite-driver');

async function main() {
  // Initialize and register the driver
  const driver = await createCrSqliteDriver();
  DriverRegistry.register('cr-sqlite', driver);

  // Create a database with a unique site ID
  const db = driver.createDatabase('myapp.db', {
    siteId: 'user-device-123' // Unique identifier for this device/instance
  });

  // Use like regular SQLite
  db.exec(`
    CREATE TABLE todos (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      completed INTEGER DEFAULT 0
    )
  `);

  const stmt = db.prepare('INSERT INTO todos (title) VALUES (?)');
  stmt.run('Buy groceries');
  stmt.run('Write documentation');

  const todos = db.prepare('SELECT * FROM todos').all();
  console.log(todos);
}

main();
```

### TypeScript Usage

```typescript
import { DriverRegistry } from 'better-starlite/drivers';
import { createCrSqliteDriver, CrSqliteOptions } from 'better-starlite/drivers/cr-sqlite-driver';

async function main() {
  const driver = await createCrSqliteDriver();
  DriverRegistry.register('cr-sqlite', driver);

  const options: CrSqliteOptions = {
    siteId: 'server-node-1',
    verbose: true
  };

  const db = driver.createDatabase(':memory:', options);

  // Your code here...
}

main();
```

### Browser Usage

```javascript
// In your bundled application (Webpack, Vite, etc.)
import { DriverRegistry } from 'better-starlite/drivers';
import { createCrSqliteDriver } from 'better-starlite/drivers/cr-sqlite-driver';

async function initDatabase() {
  const driver = await createCrSqliteDriver();
  DriverRegistry.register('cr-sqlite', driver);

  const db = driver.createDatabase('myapp.db', {
    siteId: `browser-${userId}` // Unique per user/device
  });

  return db;
}
```

## Configuration Options

The CR-SQLite driver accepts the following options:

```typescript
interface CrSqliteOptions {
  // Unique identifier for this database instance (required for sync)
  siteId?: string;

  // Enable verbose logging
  verbose?: boolean;

  // Custom WASM module path (advanced)
  wasmPath?: string;

  // Standard options
  readonly?: boolean;
  timeout?: number;
}
```

### Site ID

The `siteId` is a **unique identifier** for each database instance. It's critical for CRDT replication:

```javascript
// Different site IDs for different contexts
const browserDb = driver.createDatabase('app.db', {
  siteId: 'browser-user-123'
});

const serverDb = driver.createDatabase('app.db', {
  siteId: 'server-node-1'
});

const mobileDb = driver.createDatabase('app.db', {
  siteId: 'mobile-device-abc'
});
```

## CRDT Replication Features

### Enabling CRDT Tracking

To enable CRDT tracking for a table:

```javascript
// Create table
db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL
  )
`);

// Enable CRDT tracking
db.exec(`SELECT crsql_as_crr('users')`);
```

### Getting Changes for Sync

```javascript
// Get all changes since database creation
const changes = db.getChanges();

// Get changes since a specific version
const version = 100;
const recentChanges = db.getChanges(version);

console.log(`Found ${changes.length} changes to sync`);
```

### Applying Changes from Remote

```javascript
// Receive changes from another node
const remoteChanges = await fetch('/api/sync/changes').then(r => r.json());

// Apply changes locally
db.applyChanges(remoteChanges);

console.log('Changes applied successfully!');
```

### Bidirectional Sync Example

```javascript
async function syncWithServer(db) {
  // 1. Get local changes
  const localVersion = db.getVersion();
  const localChanges = db.getChanges();

  // 2. Send to server and get remote changes
  const response = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: localVersion,
      changes: localChanges
    })
  });

  const { changes: remoteChanges } = await response.json();

  // 3. Apply remote changes
  if (remoteChanges.length > 0) {
    db.applyChanges(remoteChanges);
    console.log(`Applied ${remoteChanges.length} remote changes`);
  }
}
```

## Feature Support

The CR-SQLite driver supports the following features:

| Feature | Supported | Notes |
|---------|-----------|-------|
| **Basic CRUD** | ✅ Yes | Full support for all SQL operations |
| **Transactions** | ✅ Yes | BEGIN, COMMIT, ROLLBACK |
| **Custom Functions** | ✅ Yes | Register custom SQL functions |
| **Custom Aggregates** | ❌ No | Not supported in WASM |
| **Load Extensions** | ❌ No | Not supported in WASM |
| **Backup** | ❌ No | Use export/import via JSON |
| **WAL Mode** | ❌ No | Uses CRDT instead |
| **CRDT Replication** | ✅ Yes | Core feature |
| **Change Tracking** | ✅ Yes | getChanges() / applyChanges() |

## Advanced Usage

### Custom SQL Functions

```javascript
// Register a custom function
db.function('upper_first', (str) => {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
});

// Use in queries
const stmt = db.prepare('SELECT upper_first(name) as formatted_name FROM users');
const results = stmt.all();
```

### Transactions

```javascript
// Create a transaction function
const insertMultiple = db.transaction((items) => {
  const stmt = db.prepare('INSERT INTO items (name, value) VALUES (?, ?)');
  for (const item of items) {
    stmt.run(item.name, item.value);
  }
});

// Execute transaction (atomic)
insertMultiple([
  { name: 'Item 1', value: 100 },
  { name: 'Item 2', value: 200 },
  { name: 'Item 3', value: 300 }
]);
```

### Statement Modes

```javascript
// Pluck mode - return only first column
const name = db.prepare('SELECT name FROM users WHERE id = ?')
  .pluck()
  .get(1);
console.log(name); // "John Doe"

// Raw mode - return array instead of object
const row = db.prepare('SELECT id, name, email FROM users WHERE id = ?')
  .raw()
  .get(1);
console.log(row); // [1, "John Doe", "john@example.com"]

// Expand mode
const expanded = db.prepare('SELECT * FROM users')
  .expand()
  .all();
```

### Iterating Results

```javascript
// Memory-efficient iteration
const stmt = db.prepare('SELECT * FROM large_table');

for (const row of stmt.iterate()) {
  // Process each row without loading all into memory
  console.log(row);
}
```

## Use Cases

### 1. Offline-First Mobile/Web Apps

```javascript
// User works offline
const db = driver.createDatabase('offline-app.db', {
  siteId: `user-${userId}-${deviceId}`
});

// Changes tracked automatically
db.exec('INSERT INTO notes (title, content) VALUES (?, ?)', ['Offline Note', 'Created while offline']);

// When back online, sync
await syncWithServer(db);
```

### 2. Multi-Device Sync

```javascript
// Same user, different devices
const laptopDb = driver.createDatabase('app.db', {
  siteId: 'user-123-laptop'
});

const phoneDb = driver.createDatabase('app.db', {
  siteId: 'user-123-phone'
});

// Changes from laptop sync to phone and vice versa
```

### 3. Real-Time Collaboration

```javascript
// Multiple users editing same document
const userADb = driver.createDatabase('collab.db', {
  siteId: 'user-alice'
});

const userBDb = driver.createDatabase('collab.db', {
  siteId: 'user-bob'
});

// Both can edit simultaneously, changes merge automatically
```

### 4. Edge/Serverless Functions

```javascript
// Each edge node has its own database
const edgeDb = driver.createDatabase('edge-cache.db', {
  siteId: `edge-${region}-${nodeId}`
});

// Syncs with central database periodically
setInterval(() => syncWithCentral(edgeDb), 60000);
```

## Examples

The repository includes several complete examples:

- **[examples/cr-sqlite-basic.js](../examples/cr-sqlite-basic.js)** - Basic CRUD operations
- **[examples/cr-sqlite-replication.js](../examples/cr-sqlite-replication.js)** - Bidirectional sync demo
- **[examples/cr-sqlite-browser.html](../examples/cr-sqlite-browser.html)** - Browser integration
- **[examples/cr-sqlite-deno.ts](../examples/cr-sqlite-deno.ts)** - Deno TypeScript example
- **[examples/cr-sqlite-bun.ts](../examples/cr-sqlite-bun.ts)** - Bun performance example

Run any example:

```bash
# Node.js
node examples/cr-sqlite-basic.js

# Deno
deno run --allow-read --allow-write examples/cr-sqlite-deno.ts

# Bun
bun run examples/cr-sqlite-bun.ts
```

## Testing

Run the CR-SQLite driver tests:

```bash
# Basic tests
npm test tests/cr-sqlite-test.js

# With replication tests
TEST_REPLICATION=true npm test tests/cr-sqlite-test.js

# Verbose output
VERBOSE=true npm test tests/cr-sqlite-test.js
```

## Architecture Comparison

### Traditional Sync (Last-Write-Wins)

```
Client A: Update field X → Server accepts
Client B: Update field X → Server rejects (conflict!)
```

❌ **Problem**: Data loss, conflicts, complex resolution logic

### CR-SQLite (CRDT)

```
Client A: Update field X → Tracked with vector clock
Client B: Update field X → Tracked with vector clock
Sync: Both changes merge automatically
```

✅ **Solution**: No conflicts, all changes preserved, automatic merge

## Performance

CR-SQLite performance characteristics:

- **Read performance**: Same as SQLite (very fast)
- **Write performance**: Slightly slower due to CRDT tracking (~10-20% overhead)
- **Sync performance**: Efficient delta-based sync
- **Memory usage**: Minimal overhead for change tracking
- **Database size**: ~5-10% larger due to CRDT metadata

## Troubleshooting

### "CR-SQLite driver not available"

```bash
# Install the WASM module
npm install @vlcn.io/crsqlite-wasm
```

### "Module not found" in browser

Make sure you're using a bundler:

```bash
# With Vite
npm install -D vite
vite build

# With Webpack
npm install -D webpack webpack-cli
webpack
```

### Changes not syncing

1. Ensure each instance has a unique `siteId`
2. Enable CRDT tracking: `SELECT crsql_as_crr('table_name')`
3. Check that changes are being retrieved: `db.getChanges()`
4. Verify network connectivity for remote sync

### Performance issues

1. Use transactions for batch operations
2. Add appropriate indexes
3. Consider batching sync operations
4. Use `iterate()` for large result sets

## Limitations

- **Custom aggregates**: Not supported in WASM (use built-in aggregates)
- **Extensions**: Cannot load native SQLite extensions
- **Backup API**: Use JSON export/import instead
- **WAL mode**: Not applicable (uses CRDT for consistency)
- **Async initialization**: Driver must be initialized with `await createCrSqliteDriver()`

## Resources

- [CR-SQLite Documentation](https://github.com/vlcn-io/cr-sqlite)
- [CRDT Explained](https://crdt.tech/)
- [vlcn.io](https://vlcn.io/) - Official CR-SQLite website
- [better-starlite Documentation](../README.md)

## License

The CR-SQLite driver is part of better-starlite and is licensed under the MIT License. The underlying CR-SQLite library has its own license (MIT/Apache 2.0).

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](../CONTRIBUTING.md) for details.

## Support

- GitHub Issues: [better-starlite/issues](https://github.com/tluyben/better-starlite/issues)
- Documentation: [docs/](.)
- Examples: [examples/](../examples)
