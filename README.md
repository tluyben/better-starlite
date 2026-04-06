# better-*lite

A unified async database interface for SQLite, RQLite, FlexDB, MySQL, and PostgreSQL that works in both Node.js and Deno. Write once, run anywhere - write SQLite syntax and run it against local SQLite, distributed rqlite clusters, a FlexDB cluster, MySQL, or PostgreSQL databases.

**🚨 IMPORTANT: For cross-platform compatibility (Node.js + Deno), you MUST use the async interface. The synchronous API is Node.js-only for backward compatibility.**

## Features

- 🎯 **Cross-platform** - Works in both Node.js and Deno
- 🗄️ **Multi-Database Support** - SQLite, RQLite, FlexDB, MySQL, PostgreSQL with unified API
- 🔄 **Write SQLite, Run Anywhere** - Plugin system automatically translates SQLite syntax to MySQL/PostgreSQL
- 🌐 **Transparent rqlite support** - just use HTTP/HTTPS URLs
- 🚀 **FlexDB distributed backend** - strongly-consistent Raft clusters with per-table consistency, native FTS, and snapshot backup
- 🔄 **CR-SQLite support** - Offline-first apps with CRDT replication
- ⚡ **Unified Async API** - modern Promise-based API for all databases
- 🚀 **Synchronous API** - Node.js-only, for better-sqlite3 compatibility
- 📦 **Drizzle ORM support** included
- 🚀 **Server-optimized by default** - 2-5x faster with automatic performance pragmas
- 🔄 **WAL mode enabled by default** for better concurrency
- 🔌 **Plugin System** - Extensible schema and query rewriting for any database

## Installation

### Node.js
```bash
npm install better-starlite

# For MySQL support
npm install mysql2

# For PostgreSQL support
npm install pg
```

### Deno
```typescript
// Import directly from local path
import { createDatabase } from '../path/to/better-starlite/src/async-unified-deno.ts';
```

### CR-SQLite (for offline-first apps)
```bash
npm install better-starlite @vlcn.io/crsqlite-wasm
```

See [CR-SQLite Driver Documentation](docs/CR-SQLITE-DRIVER.md) for details.

## Multi-Database Support: MySQL & PostgreSQL

**Write SQLite syntax once, run on MySQL or PostgreSQL automatically!**

**Translation Direction: SQLite → MySQL/PostgreSQL**

The plugin system automatically translates SQLite schemas and queries TO the target database's native syntax. You write standard SQLite code, and the rewriters convert it to MySQL or PostgreSQL syntax on-the-fly. This is NOT the other way around - you don't write MySQL/PostgreSQL and get SQLite.

### MySQL Usage

```javascript
const { AsyncDatabase } = require('better-starlite');
const { registerAllPlugins } = require('better-starlite/dist/drivers/plugins');

// Register plugins once at startup
registerAllPlugins();

async function main() {
  // Connect to MySQL with SQLite compatibility
  const db = new AsyncDatabase('mysql://user:password@localhost:3306/database', {
    schemaRewriter: 'mysql',
    queryRewriter: 'mysql'
  });

  // Write SQLite syntax - it gets translated automatically!
  await db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Becomes: id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255), created_at TIMESTAMP

  const stmt = await db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
  await stmt.run('Alice', 'alice@example.com');

  const users = await db.prepare('SELECT * FROM users').all();
  console.log(users);

  await db.close();
}
```

### PostgreSQL Usage

```javascript
const { AsyncDatabase } = require('better-starlite');
const { registerAllPlugins } = require('better-starlite/dist/drivers/plugins');

// Register plugins once at startup
registerAllPlugins();

async function main() {
  // Connect to PostgreSQL with SQLite compatibility
  const db = new AsyncDatabase('postgresql://user:password@localhost:5432/database', {
    schemaRewriter: 'postgresql',
    queryRewriter: 'postgresql'
  });

  // Write SQLite syntax - it gets translated automatically!
  await db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Becomes: id SERIAL PRIMARY KEY, name VARCHAR(255), created_at TIMESTAMP

  const stmt = await db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
  await stmt.run('Bob', 'bob@example.com');
  // ? placeholders are converted to $1, $2, etc.

  const users = await db.prepare('SELECT * FROM users').all();
  console.log(users);

  await db.close();
}
```

### What Gets Translated

The plugin system handles:

**Schema Translations:**
- `INTEGER PRIMARY KEY AUTOINCREMENT` → MySQL: `INT AUTO_INCREMENT PRIMARY KEY` / PostgreSQL: `SERIAL PRIMARY KEY`
- `TEXT` → `VARCHAR(255)` (both databases)
- `TEXT DEFAULT CURRENT_TIMESTAMP` → `TIMESTAMP DEFAULT CURRENT_TIMESTAMP`

**Query Translations:**
- `?` placeholders → PostgreSQL: `$1, $2, $3` (MySQL uses `?` natively)
- Automatic dialect-specific optimizations

**Benefits:**
- ✅ Write portable SQLite code
- ✅ Test locally with SQLite
- ✅ Deploy to MySQL or PostgreSQL without code changes
- ✅ Use the same codebase across different database backends
- ✅ Perfect for libraries and frameworks that need database flexibility

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

### With CR-SQLite (Offline-First with CRDT Replication)

```javascript
const { DriverRegistry } = require('better-starlite/drivers');
const { createCrSqliteDriver } = require('better-starlite/drivers/cr-sqlite-driver');

async function main() {
  // Initialize and register CR-SQLite driver
  const driver = await createCrSqliteDriver();
  DriverRegistry.register('cr-sqlite', driver);

  // Create database with unique site ID for sync
  const db = driver.createDatabase('myapp.db', {
    siteId: 'browser-user-123'
  });

  // Use normally
  db.exec('CREATE TABLE todos (id INTEGER PRIMARY KEY, title TEXT)');
  db.prepare('INSERT INTO todos (title) VALUES (?)').run('My todo');

  // Enable CRDT tracking for sync
  db.exec("SELECT crsql_as_crr('todos')");

  // Get changes for sync
  const changes = db.getChanges();
  await syncToServer(changes);

  // Apply remote changes
  const remoteChanges = await fetchFromServer();
  db.applyChanges(remoteChanges);
}
```

**Perfect for:**
- 📱 Mobile apps (offline-first)
- 🌐 Progressive Web Apps (PWAs)
- 🔄 Multi-device sync
- 👥 Collaborative apps
- 🚀 Edge computing

See [CR-SQLite Driver Documentation](docs/CR-SQLITE-DRIVER.md) for complete guide.

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
- ✅ `await pragma()` - Pragma commands (no-op on FlexDB)
- ✅ `await function()` - Custom functions (SQLite only)
- ✅ `await aggregate()` - Custom aggregates (SQLite only)
- ✅ `await backup(dest)` - Backup to file (SQLite: VACUUM INTO; FlexDB: snapshot download)
- ✅ Statement methods: `await run()`, `await get()`, `await all()`, `await iterate()`
- ✅ Statement modifiers: `await pluck()`, `await expand()`, `await raw()`

**FlexDB-only methods** (throw on other backends):
- ✅ `await setTableMode(table, mode)` - Set per-table consistency
- ✅ `await getTableMode(table)` - Get per-table consistency
- ✅ `await enableSearch(table, columns)` - Enable native FTS on a table
- ✅ `await disableSearch(table)` - Disable native FTS
- ✅ `await getSearchConfig(table)` - Get indexed columns
- ✅ `await search(table, query, limit?)` - Full-text search

**Feature detection:**
- ✅ `supportsFeature(feature)` - Returns `true` for FlexDB features (`'per-table-consistency'`, `'native-search'`, `'transactions'`, `'backup'`)

## FlexDB — Distributed Storage Backend

FlexDB is a Raft-based distributed SQLite-compatible database. Connect by passing a `flexdb://` URL to `createDatabase()`.

### Connecting

```javascript
const { createDatabase } = require('better-starlite/dist/async-unified');

// Single node
const db = await createDatabase('flexdb://localhost:4001');

// Multi-node cluster (round-robin load balancing)
const db = await createDatabase('flexdb://node1:4001,node2:4001,node3:4001');

// With auth token and options
const db = await createDatabase('flexdb://localhost:4001', {
  flexdb: {
    authToken: 'my-secret-token',
    timeoutMs: 10_000,
    defaultConsistency: 'raft',
    // Set per-table modes at connect time
    tableModes: {
      events:    'eventual',
      counters:  'crdt',
      configs:   'raft',
    },
  }
});
```

### FlexDB-specific options (`flexdb` key in `DatabaseOptions`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `authToken` | `string` | — | Bearer token sent as `Authorization` header |
| `timeoutMs` | `number` | `30000` | Per-request timeout in milliseconds |
| `defaultConsistency` | `'raft' \| 'eventual' \| 'crdt'` | `'raft'` | Default consistency for all tables |
| `tableModes` | `Record<string, ConsistencyMode>` | — | Per-table modes applied at connect time |

### Per-table consistency

| Mode | Consistency | Performance | Best for |
|------|-------------|-------------|----------|
| `'raft'` | Strongly consistent (default) | Moderate | Config, metadata, critical writes |
| `'eventual'` | Eventually consistent | High throughput | Events, logs, analytics |
| `'crdt'` | Conflict-free merge | High throughput | Counters, collaborative data |

```javascript
// Change a table's mode at runtime
await db.setTableMode('events', 'eventual');
await db.setTableMode('configs', 'raft');

const mode = await db.getTableMode('events'); // → 'eventual'
```

### Native full-text search

FlexDB has a native FTS engine. Columns indexed server-side are searched without loading data into the client.

```javascript
// Enable search on a table
await db.enableSearch('articles', ['title', 'body']);

// Search
const results = await db.search('articles', 'distributed systems', 20);
// → [{ id: 1, title: '...', body: '...', ... }, ...]

// Get current search config
const cols = await db.getSearchConfig('articles'); // → ['title', 'body']

// Disable search
await db.disableSearch('articles');
```

### Snapshot / backup

```javascript
// Download a raw SQLite snapshot from the cluster
await db.backup('/tmp/snapshot.db');
```

### Feature detection

```javascript
db.supportsFeature('per-table-consistency'); // true on FlexDB, false elsewhere
db.supportsFeature('native-search');         // true on FlexDB, false elsewhere
db.supportsFeature('transactions');          // true on FlexDB, false elsewhere
db.supportsFeature('backup');                // true on FlexDB, false elsewhere
```

### Transaction safety

`transaction()` calls are serialised by `AsyncWriteMutex` — only one HTTP transaction session is active per `AsyncDatabase` instance at a time. All statements inside the closure automatically carry `X-Transaction-ID`.

```javascript
await db.transaction(async () => {
  await (await db.prepare('INSERT INTO orders (user_id) VALUES (?)')).run(42);
  await (await db.prepare('UPDATE inventory SET qty = qty - 1 WHERE id = ?')).run(99);
});
```

### URL helper

```typescript
import { parseFlexDbUrl } from 'better-starlite/dist/drivers/flexdb-client';

parseFlexDbUrl('flexdb://node1:4001,node2:4001')
// → ['http://node1:4001', 'http://node2:4001']

parseFlexDbUrl('flexdb://https://secure-node:4443')
// → ['https://secure-node:4443']
```

### PRAGMA behaviour

All `pragma()` calls are silently ignored on FlexDB — WAL, cache, and synchronous settings are managed by the cluster, not the client.

---

## How it Works

better-starlite automatically detects the connection type:

- **File paths** (e.g., `myapp.db`, `:memory:`) → Uses better-sqlite3
- **`flexdb://` URLs** (e.g., `flexdb://localhost:4001`) → Uses FlexDB HTTP client
- **HTTP/HTTPS URLs** (e.g., `http://localhost:4001`) → Uses rqlite client
- **mysql:// URLs** (e.g., `mysql://user:pass@host:3306/db`) → Uses MySQL driver with plugin translation
- **postgresql:// URLs** (e.g., `postgresql://user:pass@host:5432/db`) → Uses PostgreSQL driver with plugin translation

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
  disableWAL?: boolean;         // Disable WAL mode (enabled by default)
  serverOptimized?: boolean;    // Apply server performance optimizations (default: true)
  rqliteLevel?: 'none' | 'weak' | 'linearizable';  // rqlite consistency level (see below)

  // Plugin system (for MySQL/PostgreSQL)
  schemaRewriter?: string;  // Enable schema translation plugin (e.g., 'mysql', 'postgresql')
  queryRewriter?: string;   // Enable query translation plugin (e.g., 'mysql', 'postgresql')
}
```

### Plugin Options

When using MySQL or PostgreSQL, specify the plugin names to enable automatic SQLite syntax translation:

```javascript
const db = new AsyncDatabase('mysql://localhost:3306/mydb', {
  schemaRewriter: 'mysql',    // Translates CREATE TABLE, ALTER TABLE, etc.
  queryRewriter: 'mysql'      // Translates queries if needed
});
```

Available plugins:
- `'mysql'` - For MySQL/MariaDB databases
- `'postgresql'` - For PostgreSQL databases

### Server Optimization

The `serverOptimized` option (default: `true`) automatically applies performance-optimized PRAGMA statements to SQLite databases. This significantly improves server-side performance, concurrency, and data integrity.

**Enabled by default** - These pragmas are applied unless you explicitly set `serverOptimized: false`:

```javascript
// Default behavior (serverOptimized: true)
const db = new Database('mydb.db');

// Disable optimizations
const db = new Database('mydb.db', { serverOptimized: false });
```

**Applied optimizations:**

| PRAGMA | Value | Benefit |
|--------|-------|---------|
| `foreign_keys` | ON | Enforces referential integrity |
| `recursive_triggers` | ON | Enables cascade operations |
| `journal_mode` | WAL | Better concurrency (file-based DBs only) |
| `synchronous` | NORMAL | Balanced durability/performance |
| `cache_size` | 10000 | More memory for better performance |
| `temp_store` | MEMORY | Faster temporary operations |
| `busy_timeout` | 30000 | 30s wait time for locks (better concurrency) |
| `wal_autocheckpoint` | 1000 | Automatic WAL checkpointing |
| `mmap_size` | 268435456 | 256MB memory-mapped I/O |
| `optimize` | - | Analyzes and optimizes database |

**Performance impact:**
- 2-5x faster writes in concurrent scenarios
- Better cache utilization
- Automatic foreign key enforcement
- Reduced database lock contention

**Note:** For in-memory databases (`:memory:`), WAL-related pragmas are automatically skipped.

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
- MySQL and PostgreSQL integration examples
- Drizzle ORM integration (sync and async)
- Transaction examples
- WAL mode configuration

### Testing with Docker

Run MySQL and PostgreSQL locally for testing:

```bash
# MySQL
docker run -d -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=rootpass \
  -e MYSQL_DATABASE=testdb \
  -e MYSQL_USER=testuser \
  -e MYSQL_PASSWORD=testpass \
  mysql:8.0

# PostgreSQL
docker run -d -p 5432:5432 \
  -e POSTGRES_USER=testuser \
  -e POSTGRES_PASSWORD=testpass \
  -e POSTGRES_DB=testdb \
  postgres:16-alpine

# Run tests against all databases
npm test
```

The integration tests in `test/cross-database-integration.test.js` demonstrate the same code working identically across SQLite, MySQL, and PostgreSQL.

## License

MIT
