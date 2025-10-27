# better-*lite

A unified async database interface for SQLite and RQLite that works in both Node.js and Deno. Write once, run anywhere - against local SQLite or distributed rqlite clusters.

**🚨 IMPORTANT: For cross-platform compatibility (Node.js + Deno), you MUST use the async interface. The synchronous API is Node.js-only for backward compatibility.**

## Features

- 🎯 **Cross-platform** - Works in both Node.js and Deno
- 🌐 **Transparent rqlite support** - just use HTTP/HTTPS URLs
- ⚡ **Unified Async API** - modern Promise-based API for both SQLite and rqlite
- 🚀 **Synchronous API** - Node.js-only, for better-sqlite3 compatibility
- 📦 **Drizzle ORM support** included
- 🔄 **WAL mode enabled by default** for better performance

## Installation

### Node.js
```bash
npm install better-starlite
```

### Deno
```typescript
// Import directly from local path
import { createDatabase } from '../path/to/better-starlite/src/async-unified-deno.ts';
```

## Cross-Platform Usage (RECOMMENDED)

**For code that works in both Node.js and Deno, use the async interface:**

### Node.js
```javascript
const { createDatabase } = require('better-starlite/dist/async-unified');

async function main() {
  const db = await createDatabase('myapp.db');
  // or const db = await createDatabase('http://localhost:4001');

  const stmt = await db.prepare('SELECT * FROM users WHERE id = ?');
  const user = await stmt.get(userId);
  await db.close();
}
```

### Deno
```typescript
import { createDatabase } from './src/async-unified-deno.ts';

const db = await createDatabase('myapp.db');
// or const db = await createDatabase('http://localhost:4001');

const stmt = await db.prepare('SELECT * FROM users WHERE id = ?');
const user = await stmt.get(userId);
await db.close();
```

## Usage

### Synchronous API (better-sqlite3 compatible)

```javascript
const Database = require('better-starlite').default;

// Local SQLite (uses better-sqlite3)
const localDb = new Database('myapp.db');

// rqlite cluster (automatic detection via URL)
const rqliteDb = new Database('http://localhost:4001');

// The API is identical for both!
const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
const user = stmt.get(userId);
```

### Asynchronous API (Promise-based)

```javascript
const { AsyncDatabase } = require('better-starlite');

async function main() {
  // Works with both local and rqlite
  const db = new AsyncDatabase('myapp.db');
  // const db = new AsyncDatabase('http://localhost:4001');

  // All methods are async
  const stmt = await db.prepare('SELECT * FROM users WHERE id = ?');
  const user = await stmt.get(userId);

  // Transactions are async too
  const insertMany = await db.transaction(async (users) => {
    for (const user of users) {
      await stmt.run(user.name, user.email);
    }
  });

  await db.close();
}
```

### With Drizzle ORM

```typescript
import { AsyncDatabase } from 'better-starlite';
import { drizzle } from 'better-starlite/drizzle';

// Works with both local and rqlite databases
const database = new AsyncDatabase('http://localhost:4001');
// const database = new AsyncDatabase('myapp.db'); // for local SQLite

const db = drizzle(database);

// Use Drizzle as normal (all operations are async)
const results = await db.select().from(users);
```

### WAL Mode

WAL mode is enabled by default for better performance. To disable:

```javascript
const db = new Database('myapp.db', {
  disableWAL: true
});
```

## API Compatibility

Both sync and async versions support the same operations:

### Synchronous API (Database class)
- ✅ `prepare()` - Prepare statements
- ✅ `exec()` - Execute SQL
- ✅ `transaction()` - Transaction support
- ✅ `pragma()` - Pragma commands
- ✅ `function()` - Custom functions (SQLite only)
- ✅ `aggregate()` - Custom aggregates (SQLite only)
- ✅ `backup()` - Backup support (SQLite only)
- ✅ Statement methods: `run()`, `get()`, `all()`, `iterate()`
- ✅ Statement modifiers: `pluck()`, `expand()`, `raw()`

### Asynchronous API (AsyncDatabase class)
- ✅ `await prepare()` - Prepare statements
- ✅ `await exec()` - Execute SQL
- ✅ `await transaction()` - Transaction support
- ✅ `await pragma()` - Pragma commands
- ✅ `await function()` - Custom functions (SQLite only)
- ✅ `await aggregate()` - Custom aggregates (SQLite only)
- ✅ `await backup()` - Backup support (SQLite only)
- ✅ Statement methods: `await run()`, `await get()`, `await all()`, `await iterate()`
- ✅ Statement modifiers: `await pluck()`, `await expand()`, `await raw()`

## How it Works

better-starlite automatically detects the connection type:

- **File paths** (e.g., `myapp.db`, `:memory:`) → Uses better-sqlite3
- **HTTP/HTTPS URLs** (e.g., `http://localhost:4001`) → Uses rqlite client

### Synchronous API
The sync API uses `deasync` to provide better-sqlite3 compatible synchronous behavior for rqlite.

### Asynchronous API
The async API provides native Promises for both SQLite and rqlite, making it ideal for modern Node.js applications.

## Options

```typescript
interface DatabaseOptions {
  // Standard better-sqlite3 options
  readonly?: boolean;
  fileMustExist?: boolean;
  timeout?: number;
  verbose?: Function;

  // better-starlite specific
  disableWAL?: boolean;  // Disable WAL mode (enabled by default)
  rqliteLevel?: 'none' | 'weak' | 'linearizable';  // rqlite consistency level (see below)
}
```

### rqlite Consistency Levels

The `rqliteLevel` option controls the consistency guarantee for rqlite database operations:

#### `none` (default)
- **Performance**: Fastest
- **Consistency**: No guarantee - may read stale data
- **Use when**: Speed is critical and eventual consistency is acceptable
- **Example use cases**: Analytics, logging, non-critical reads

#### `weak`
- **Performance**: Moderate
- **Consistency**: Ensures you read from the leader node, guarantees fresh data
- **Use when**: You need fresh data but can tolerate rare edge cases
- **Example use cases**: User dashboards, most web applications

#### `linearizable`
- **Performance**: Slowest (requires quorum confirmation)
- **Consistency**: Strongest guarantee - linearizable consistency
- **Use when**: Absolute consistency is required for production systems
- **Example use cases**: Financial transactions, critical configuration changes
- **Note**: Preferred over the deprecated `strong` level for production use. Provides linearizable reads without the disk space and cost overhead of `strong`.

**Recommendation**: Start with `weak` for most applications as it provides a good balance of consistency and performance. Use `none` for read-heavy workloads where stale data is acceptable. Only use `linearizable` when you absolutely need linearizable consistency in production systems.

```javascript
// Example usage with consistency level
const db = new Database('http://localhost:4001', {
  rqliteLevel: 'weak'  // Good default for most applications
});
```

## Examples

Check the `examples/` directory for:
- Synchronous API usage (better-sqlite3 compatible)
- Asynchronous API usage (Promise-based)
- Drizzle ORM integration (sync and async)
- Transaction examples
- WAL mode configuration

## License

MIT
