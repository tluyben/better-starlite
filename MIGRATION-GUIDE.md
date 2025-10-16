# Migration Guide: SQLite to better-starlite

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Migration from better-sqlite3](#migration-from-better-sqlite3)
4. [Migration from node-sqlite3](#migration-from-node-sqlite3)
5. [ORM Integration](#orm-integration)
   - [Drizzle ORM](#drizzle-orm)
   - [Prisma](#prisma)
   - [TypeORM](#typeorm)
   - [Sequelize](#sequelize)
6. [Cross-Platform Development](#cross-platform-development)
7. [Distributed Database with RQLite](#distributed-database-with-rqlite)
8. [Performance Optimization](#performance-optimization)
9. [Troubleshooting](#troubleshooting)
10. [API Reference](#api-reference)

---

## Overview

**better-starlite** is a drop-in replacement for better-sqlite3 that provides:

- ✅ **100% API compatibility** with better-sqlite3
- ✅ **Cross-platform support** (Node.js and Deno)
- ✅ **Transparent RQLite support** for distributed databases
- ✅ **Async/await API** for modern JavaScript
- ✅ **Zero configuration** - works out of the box
- ✅ **WAL mode enabled by default** for better performance

## Quick Start

### Installation

```bash
npm install better-starlite
```

### Basic Usage

```javascript
// For synchronous API (Node.js only, better-sqlite3 compatible)
const Database = require('better-starlite').default;
const db = new Database('myapp.db');

// For asynchronous API (Node.js and Deno)
const { createDatabase } = require('better-starlite/dist/async-unified');
const db = await createDatabase('myapp.db');

// Works with RQLite too!
const rqliteDb = await createDatabase('http://localhost:4001');
```

## Migration from better-sqlite3

### Step 1: Update Package Import

**Before:**
```javascript
const Database = require('better-sqlite3');
const db = new Database('myapp.db');
```

**After (Option 1 - Keep Synchronous):**
```javascript
const Database = require('better-starlite').default;
const db = new Database('myapp.db'); // No code changes needed!
```

**After (Option 2 - Use Async for Cross-Platform):**
```javascript
const { createDatabase } = require('better-starlite/dist/async-unified');

async function main() {
  const db = await createDatabase('myapp.db');

  // Convert synchronous calls to async
  const stmt = await db.prepare('SELECT * FROM users WHERE id = ?');
  const user = await stmt.get(userId);
}
```

### Step 2: Update Your Code (Async Version Only)

If you choose the async version for cross-platform support:

```javascript
// Synchronous (better-sqlite3)
const stmt = db.prepare('SELECT * FROM users');
const users = stmt.all();
const user = stmt.get(1);
stmt.run('John', 'john@example.com');

// Asynchronous (better-starlite)
const stmt = await db.prepare('SELECT * FROM users');
const users = await stmt.all();
const user = await stmt.get(1);
await stmt.run('John', 'john@example.com');
```

### Step 3: Transactions

```javascript
// Synchronous
const insert = db.prepare('INSERT INTO users (name) VALUES (?)');
const transaction = db.transaction((users) => {
  for (const user of users) insert.run(user);
});
transaction(['Alice', 'Bob']);

// Asynchronous
const insert = await db.prepare('INSERT INTO users (name) VALUES (?)');
const transaction = await db.transaction(async (users) => {
  for (const user of users) await insert.run(user);
});
await transaction(['Alice', 'Bob']);
```

## Migration from node-sqlite3

### Key Differences

- node-sqlite3 uses callbacks, better-starlite provides both sync and async/promise APIs
- better-starlite has prepared statement objects
- better-starlite includes transaction support

### Migration Example

**Before (node-sqlite3):**
```javascript
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('myapp.db');

db.run("INSERT INTO users (name) VALUES (?)", ['Alice'], function(err) {
  if (err) return console.error(err.message);
  console.log(`Row inserted with ID ${this.lastID}`);
});

db.get("SELECT * FROM users WHERE id = ?", [1], (err, row) => {
  if (err) return console.error(err.message);
  console.log(row);
});
```

**After (better-starlite):**
```javascript
const { createDatabase } = require('better-starlite/dist/async-unified');

async function main() {
  const db = await createDatabase('myapp.db');

  // Insert
  const stmt = await db.prepare("INSERT INTO users (name) VALUES (?)");
  const result = await stmt.run('Alice');
  console.log(`Row inserted with ID ${result.lastInsertRowid}`);

  // Select
  const selectStmt = await db.prepare("SELECT * FROM users WHERE id = ?");
  const row = await selectStmt.get(1);
  console.log(row);
}
```

## ORM Integration

### Drizzle ORM

**Installation:**
```bash
npm install drizzle-orm better-starlite
```

**Usage:**
```javascript
const { AsyncDatabase } = require('better-starlite/dist/async-unified');
const { drizzle } = require('better-starlite/drizzle');
const { sqliteTable, integer, text } = require('drizzle-orm/sqlite-core');

// Define schema
const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').unique(),
});

// Create database connection
const database = new AsyncDatabase('myapp.db'); // or 'http://localhost:4001' for rqlite
const db = drizzle(database);

// Use Drizzle normally
const allUsers = await db.select().from(users);
await db.insert(users).values({ name: 'Alice', email: 'alice@example.com' });
```

### Prisma

**Note:** Prisma integration requires the driver adapter feature (currently in preview).

**schema.prisma:**
```prisma
generator client {
  provider = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}

datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

model User {
  id    Int     @id @default(autoincrement())
  name  String
  email String  @unique
}
```

**Usage:**
```javascript
const { AsyncDatabase } = require('better-starlite/dist/async-unified');
const { PrismaClient } = require('@prisma/client');

// Custom adapter (see examples/prisma-integration.js for full implementation)
const database = new AsyncDatabase('myapp.db');
const adapter = new BetterStarlitePrismaAdapter(database);

const prisma = new PrismaClient({ adapter });

// Use Prisma normally
const users = await prisma.user.findMany();
```

### TypeORM

```javascript
const { DataSource } = require('typeorm');

const AppDataSource = new DataSource({
  type: 'better-sqlite3',
  database: 'myapp.db',
  driver: require('better-starlite').default,
  entities: [User],
  synchronize: true,
});
```

### Sequelize

```javascript
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: 'myapp.db',
  dialectModule: require('better-starlite').default,
});
```

## Cross-Platform Development

### Node.js

```javascript
// CommonJS
const { createDatabase } = require('better-starlite/dist/async-unified');

// ES Modules
import { createDatabase } from 'better-starlite/dist/async-unified';

async function main() {
  const db = await createDatabase('myapp.db');
  // Your code here
}
```

### Deno

```typescript
// Import from the Deno-specific module
import { createDatabase } from './path/to/better-starlite/src/async-unified-deno.ts';

const db = await createDatabase('myapp.db');
// Your code here
```

### Browser (with bundler)

```javascript
// Configure your bundler to use the browser-compatible build
import { createDatabase } from 'better-starlite/browser';

// Use with rqlite only (no local file access in browser)
const db = await createDatabase('http://your-rqlite-server:4001');
```

## Distributed Database with RQLite

### What is RQLite?

RQLite is a lightweight, distributed relational database built on SQLite. It provides:
- High availability through Raft consensus
- Automatic failover
- Strong consistency guarantees
- HTTP API

### Setting up RQLite

**Using Docker:**
```bash
docker run -p 4001:4001 rqlite/rqlite
```

**Using Docker Compose:**
```yaml
version: '3'
services:
  rqlite1:
    image: rqlite/rqlite
    ports:
      - "4001:4001"
    command: ["-node-id", "1"]

  rqlite2:
    image: rqlite/rqlite
    ports:
      - "4002:4001"
    command: ["-node-id", "2", "-join", "rqlite1:4002"]

  rqlite3:
    image: rqlite/rqlite
    ports:
      - "4003:4001"
    command: ["-node-id", "3", "-join", "rqlite1:4002"]
```

### Using RQLite with better-starlite

```javascript
const { createDatabase } = require('better-starlite/dist/async-unified');

// Connect to rqlite cluster
const db = await createDatabase('http://localhost:4001', {
  rqliteLevel: 'weak', // Consistency level: 'none', 'weak', or 'strong'
});

// Use exactly like SQLite!
const stmt = await db.prepare('INSERT INTO users (name) VALUES (?)');
await stmt.run('Alice');

const users = await db.prepare('SELECT * FROM users').all();
```

### Consistency Levels

- **`none`** (default): Fastest, may read stale data
- **`weak`**: Ensures reads from leader, guarantees fresh data
- **`strong`**: Slowest, requires quorum confirmation, linearizable consistency

## Performance Optimization

### 1. WAL Mode (Enabled by Default)

```javascript
// WAL mode is enabled automatically for better performance
const db = new Database('myapp.db'); // WAL enabled

// To disable WAL mode
const db = new Database('myapp.db', { disableWAL: true });
```

### 2. Prepared Statements

```javascript
// Reuse prepared statements for better performance
const stmt = await db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');

// Good: Reuse the statement
for (const user of users) {
  await stmt.run(user.name, user.email);
}

// Bad: Creating new statement each time
for (const user of users) {
  await db.prepare('INSERT INTO users (name, email) VALUES (?, ?)').run(user.name, user.email);
}
```

### 3. Batch Operations with Transactions

```javascript
// Batch inserts in a transaction for 100x+ performance
const insert = await db.prepare('INSERT INTO users (name) VALUES (?)');
const transaction = await db.transaction(async (users) => {
  for (const user of users) {
    await insert.run(user);
  }
});

await transaction(largeUserArray); // Much faster than individual inserts
```

### 4. Connection Pooling (RQLite)

```javascript
// For high-concurrency applications with rqlite
const connections = [];
for (let i = 0; i < 10; i++) {
  connections.push(await createDatabase('http://localhost:4001'));
}

// Use round-robin or other strategy to distribute load
let currentIndex = 0;
function getConnection() {
  currentIndex = (currentIndex + 1) % connections.length;
  return connections[currentIndex];
}
```

## Troubleshooting

### Common Issues

**1. "Cannot find module 'better-starlite'"**
```bash
npm install better-starlite
```

**2. "Database is locked" error**
- Enable WAL mode (enabled by default)
- Use transactions for batch operations
- Ensure proper connection closing

**3. RQLite connection failed**
- Check if rqlite server is running
- Verify the URL (http://localhost:4001)
- Check network/firewall settings

**4. Deno import errors**
- Use the Deno-specific import path
- Ensure you have the proper permissions: `--allow-read --allow-write --allow-net`

### Debug Mode

```javascript
// Enable verbose logging
const db = new Database('myapp.db', {
  verbose: console.log
});
```

### Performance Profiling

```javascript
// Measure query performance
console.time('query');
const users = await stmt.all();
console.timeEnd('query');

// Log slow queries
const db = new Database('myapp.db', {
  verbose: (message) => {
    if (message.includes('ms')) {
      const time = parseInt(message.match(/(\d+)ms/)[1]);
      if (time > 100) {
        console.warn('Slow query:', message);
      }
    }
  }
});
```

## API Reference

### Database Class

```typescript
class Database {
  constructor(filename: string, options?: DatabaseOptions)
  prepare(sql: string): Statement
  exec(sql: string): this
  transaction(fn: Function): Function
  pragma(sql: string, options?: PragmaOptions): any
  close(): this

  // Properties
  readonly name: string
  readonly open: boolean
  readonly inTransaction: boolean
  readonly memory: boolean
  readonly readonly: boolean
}
```

### AsyncDatabase Class

```typescript
class AsyncDatabase {
  constructor(filename: string, options?: DatabaseOptions)
  async prepare(sql: string): Promise<AsyncStatement>
  async exec(sql: string): Promise<this>
  async transaction(fn: Function): Promise<Function>
  async pragma(sql: string, options?: PragmaOptions): Promise<any>
  async close(): Promise<this>
}
```

### Statement Methods

```typescript
interface Statement {
  run(...params: any[]): RunResult
  get(...params: any[]): any
  all(...params: any[]): any[]
  iterate(...params: any[]): IterableIterator<any>
  pluck(toggleState?: boolean): this
  expand(toggleState?: boolean): this
  raw(toggleState?: boolean): this
  columns(): ColumnDefinition[]
  bind(...params: any[]): this
}
```

### Options

```typescript
interface DatabaseOptions {
  readonly?: boolean           // Open in read-only mode
  fileMustExist?: boolean      // Fail if file doesn't exist
  timeout?: number             // Busy timeout in milliseconds
  verbose?: Function           // Logging function
  disableWAL?: boolean         // Disable WAL mode
  rqliteLevel?: 'none' | 'weak' | 'strong'  // RQLite consistency
}
```

---

## Support and Resources

- **GitHub**: [https://github.com/your-org/better-starlite](https://github.com/your-org/better-starlite)
- **Issues**: [Report bugs or request features](https://github.com/your-org/better-starlite/issues)
- **Examples**: See the `/examples` directory for complete examples
- **Tests**: Run `npm test` to verify your setup

## License

MIT