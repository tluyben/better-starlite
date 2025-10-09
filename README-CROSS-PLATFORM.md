# Better-Starlite Cross-Platform Support

This library now supports both Node.js and Deno environments, allowing seamless switching between SQLite3 and RQLite in both runtimes.

## Architecture

The library uses runtime detection to automatically load the appropriate drivers:

- **Node.js**: Uses `better-sqlite3` for SQLite and native Node.js HTTP modules for RQLite
- **Deno**: Uses Deno's native SQLite module and fetch API for RQLite

## File Structure

```
src/
├── runtime.ts                    # Runtime detection utilities
├── drivers/
│   ├── node-sqlite.ts           # Node.js SQLite wrapper
│   ├── node-rqlite-client.ts    # Node.js RQLite client
│   ├── deno-sqlite.ts           # Deno SQLite wrapper
│   └── deno-rqlite-client.ts    # Deno RQLite client
├── database-node.ts              # Node.js database implementation
├── database-deno.ts              # Deno database implementation
└── index-cross-platform.ts       # Main entry point with runtime detection
```

## Usage

### Node.js

```javascript
// Direct import (recommended for Node.js)
const { Database } = require('./src/database-node');

const db = new Database(':memory:');
db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');

const stmt = db.prepare('INSERT INTO users (name) VALUES (?)');
stmt.run('John Doe');

const users = db.prepare('SELECT * FROM users').all();
console.log(users);
```

### Deno

```typescript
// Direct import (recommended for Deno)
import { Database } from './src/database-deno.ts';

const db = new Database(':memory:');
db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');

const stmt = db.prepare('INSERT INTO users (name) VALUES (?)');
stmt.run('John Doe');

const users = stmt.all();
console.log(users);
```

### Cross-Platform (Async Factory)

```javascript
// Works in both Node.js and Deno
import { createDatabase } from './src/index-cross-platform.ts';

const db = await createDatabase(':memory:');
// Use database...
```

## Key Differences Between Runtimes

### 1. Module Loading
- **Node.js**: Uses CommonJS `require()` for synchronous module loading
- **Deno**: Uses ES modules with `.ts` extensions

### 2. SQLite Implementation
- **Node.js**: Uses `better-sqlite3` native module
- **Deno**: Uses `https://deno.land/x/sqlite` module

### 3. HTTP Requests (for RQLite)
- **Node.js**: Uses `http`/`https` modules
- **Deno**: Uses `fetch` API

### 4. Synchronous Operations
- **Node.js**: Full support for synchronous operations with `deasync`
- **Deno**: Limited synchronous support; async methods recommended for RQLite

## API Differences

### Synchronous vs Asynchronous

In Node.js, all operations can be synchronous:
```javascript
// Node.js - Synchronous
const result = stmt.run('value');
const rows = stmt.all();
```

In Deno with RQLite, some operations must be async:
```typescript
// Deno with RQLite - Asynchronous
const result = await stmt.run('value');
const rows = await stmt.all();
```

### Methods with Runtime-Specific Behavior

| Method | Node.js | Deno (SQLite) | Deno (RQLite) |
|--------|---------|---------------|---------------|
| `exec()` | Sync | Sync | Use `execAsync()` |
| `transaction()` | Sync | Sync | Use `transactionAsync()` |
| `pragma()` | Sync | Sync | Use `pragmaAsync()` |

## Running Tests

### Node.js
```bash
node examples/node-test.js
```

### Deno
```bash
deno run --allow-read --allow-write --allow-net examples/deno-test.ts
```

## Including in Projects

### Node.js Project

Simply require the module:
```javascript
const Database = require('../path/to/better-starlite/src/database-node');
```

### Deno Project

Import with full path and `.ts` extension:
```typescript
import { Database } from '../path/to/better-starlite/src/database-deno.ts';
```

## Limitations

1. **Deno Synchronous Operations**: Due to Deno's architecture, synchronous operations with RQLite are not fully supported. Use async methods when working with RQLite in Deno.

2. **Native Extensions**: Deno cannot load Node.js native extensions, so it uses a pure JavaScript/WebAssembly SQLite implementation.

3. **Module Resolution**: Deno requires explicit file extensions and doesn't support Node.js-style module resolution.

## Future Improvements

- [ ] Add support for Deno's `npm:` specifier for better-sqlite3 when available
- [ ] Implement connection pooling for RQLite
- [ ] Add more comprehensive type definitions
- [ ] Support for prepared statement caching
- [ ] Better error handling and retry logic for network operations