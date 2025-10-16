# Cross-Platform Usage Guide for better-starlite

## 🚀 Quick Overview

**better-starlite** is a universal SQLite interface that works seamlessly across:
- ✅ **Node.js** - Native performance with better-sqlite3
- ✅ **Deno** - First-class support with native SQLite bindings
- ✅ **RQLite** - Distributed database clusters with zero code changes
- ✅ **Drizzle ORM** - Full ORM integration support
- ✅ **Prisma** - Driver adapter support (preview feature)

**Write once, run anywhere** - The same code works across all platforms and database backends!

## 📦 Installation

### Node.js
```bash
npm install better-starlite
```

### Deno
No installation needed! Import directly:
```typescript
import { createDatabase } from './path/to/better-starlite/src/async-unified-deno.ts';
```

## 🎯 The Universal Pattern

The key to cross-platform compatibility is using the **async unified API**:

```javascript
// This SAME code works in Node.js and Deno!
const { createDatabase } = require('better-starlite/dist/async-unified'); // Node.js
// import { createDatabase } from '../src/async-unified-deno.ts'; // Deno

async function runApp() {
  // Works with local SQLite
  const localDb = await createDatabase('myapp.db');

  // OR works with distributed RQLite (just change the URL!)
  const rqliteDb = await createDatabase('http://localhost:4001');

  // Same API for everything!
  const stmt = await db.prepare('SELECT * FROM users WHERE age > ?');
  const users = await stmt.all(18);

  await db.close();
}
```

## 🔄 Migration Scenarios

### Scenario 1: From better-sqlite3 to better-starlite

**Before (better-sqlite3):**
```javascript
const Database = require('better-sqlite3');
const db = new Database('app.db');
const users = db.prepare('SELECT * FROM users').all();
```

**After (better-starlite - Drop-in):**
```javascript
const Database = require('better-starlite').default;
const db = new Database('app.db');
const users = db.prepare('SELECT * FROM users').all(); // No changes!
```

**After (better-starlite - Cross-platform):**
```javascript
const { createDatabase } = require('better-starlite/dist/async-unified');

const db = await createDatabase('app.db');
const stmt = await db.prepare('SELECT * FROM users');
const users = await stmt.all(); // Now async!
```

### Scenario 2: Development to Production

**Development (Local SQLite):**
```javascript
const db = await createDatabase('dev.db');
```

**Production (RQLite Cluster):**
```javascript
const db = await createDatabase(process.env.RQLITE_URL || 'http://rqlite-cluster:4001');
```

No other code changes needed! 🎉

## 🔌 ORM Integration

### Drizzle ORM

```javascript
const { AsyncDatabase } = require('better-starlite/dist/async-unified');
const { drizzle } = require('better-starlite/drizzle');
const { sqliteTable, text, integer } = require('drizzle-orm/sqlite-core');

// Define your schema
const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').unique()
});

// Connect to any backend
const database = new AsyncDatabase(
  process.env.DATABASE_URL || 'myapp.db'  // Local or RQLite!
);
const db = drizzle(database);

// Use Drizzle normally
const allUsers = await db.select().from(users);
```

### Prisma (with Driver Adapters)

See `examples/prisma-integration.js` for detailed Prisma setup.

## 🧪 Testing Your Migration

We provide comprehensive tests to ensure compatibility:

```bash
# Run our test suite
node tests/cross-platform-test.js

# Test with your own database
RQLITE_URL=http://your-server:4001 node tests/cross-platform-test.js
```

## 📋 Examples

We've created several examples to help you get started:

### 1. Quick Start (`examples/quick-start.js`)
Shows the simplest migration path from better-sqlite3.

### 2. Simple Cross-Platform (`examples/simple-cross-platform.js`)
Demonstrates the same code running against different backends.

### 3. Drizzle Integration (`examples/drizzle-cross-platform.js`)
Complete Drizzle ORM example with transactions and complex queries.

### 4. Deno Example (`examples/drizzle-cross-platform-deno.ts`)
Shows how to use better-starlite in Deno.

### 5. Prisma Integration (`examples/prisma-integration.js`)
Guide for using better-starlite with Prisma's driver adapters.

## 🎓 Best Practices

### 1. Always Use Async for Cross-Platform Code

```javascript
// ✅ GOOD - Works everywhere
const db = await createDatabase('myapp.db');
const stmt = await db.prepare('...');
const result = await stmt.get();

// ❌ BAD - Only works in Node.js
const db = new Database('myapp.db');
const result = db.prepare('...').get();
```

### 2. Use Environment Variables for Database URLs

```javascript
const db = await createDatabase(
  process.env.DATABASE_URL || 'local.db'
);
```

### 3. Handle Connection Errors Gracefully

```javascript
let db;
try {
  // Try RQLite first
  db = await createDatabase('http://rqlite:4001');
} catch (e) {
  // Fall back to local SQLite
  console.log('Using local SQLite fallback');
  db = await createDatabase('fallback.db');
}
```

### 4. Use Transactions for Batch Operations

```javascript
const transaction = await db.transaction(async () => {
  for (const item of items) {
    await stmt.run(item);
  }
});
await transaction();
```

## 🚦 Platform Feature Matrix

| Feature | Node.js (Sync) | Node.js (Async) | Deno | RQLite |
|---------|---------------|-----------------|------|--------|
| Basic CRUD | ✅ | ✅ | ✅ | ✅ |
| Prepared Statements | ✅ | ✅ | ✅ | ✅ |
| Transactions | ✅ | ✅ | ✅ | ✅ |
| WAL Mode | ✅ | ✅ | ✅ | N/A |
| Custom Functions | ✅ | ✅ | ⚠️ | ❌ |
| Backup | ✅ | ✅ | ⚠️ | ❌ |
| Clustering | ❌ | ❌ | ❌ | ✅ |
| HTTP API | ❌ | ❌ | ❌ | ✅ |

Legend:
- ✅ Full support
- ⚠️ Partial support
- ❌ Not supported
- N/A Not applicable

## 🐛 Troubleshooting

### Issue: "Cannot find module 'better-starlite'"
**Solution:** Make sure you've installed the package:
```bash
npm install better-starlite
```

### Issue: "RQLite connection failed"
**Solution:** Ensure RQLite is running:
```bash
docker run -p 4001:4001 rqlite/rqlite
```

### Issue: "Deno import errors"
**Solution:** Use the Deno-specific import with .ts extension:
```typescript
import { createDatabase } from './src/async-unified-deno.ts';
```

### Issue: "Database is locked"
**Solution:** WAL mode is enabled by default, but you can also:
- Use transactions for batch operations
- Ensure you're closing statements and databases properly

## 📚 Additional Resources

- **Migration Guide:** See `MIGRATION-GUIDE.md` for detailed migration instructions
- **API Reference:** Complete API documentation in the migration guide
- **Examples:** Check the `/examples` directory for working code
- **Tests:** Run `npm test` to verify your setup

## 💡 Why better-starlite?

1. **Zero Lock-in:** Switch between local and distributed databases without code changes
2. **Future-Proof:** Works with modern JavaScript/TypeScript and Deno
3. **Production-Ready:** Battle-tested with comprehensive test suite
4. **ORM-Friendly:** Native support for Drizzle and Prisma
5. **Performance:** WAL mode enabled by default, prepared statement caching
6. **Developer Experience:** Async/await API, detailed error messages, TypeScript support

## 🤝 Contributing

Found an issue or want to contribute? Check our GitHub repository!

## 📄 License

MIT - Use it freely in your projects!

---

**Remember:** The beauty of better-starlite is that you don't need to choose between local development and distributed production databases. Write your code once, and deploy it anywhere! 🚀