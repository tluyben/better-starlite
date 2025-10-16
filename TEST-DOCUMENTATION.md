# Better-Starlite Test Documentation

## 📊 Test Coverage Overview

Better-starlite includes comprehensive test coverage to ensure it works as a true drop-in replacement for SQLite across all platforms and use cases.

## 🧪 Test Suites

### 1. Core Cross-Platform Tests (`tests/cross-platform-test.js`)

**Purpose:** Verifies core SQLite functionality works identically across Node.js and with RQLite.

**Coverage:**
- ✅ Basic CRUD operations (Create, Read, Update, Delete)
- ✅ Transactions (commit and rollback)
- ✅ Prepared statements and parameter binding
- ✅ Data types (TEXT, INTEGER, REAL, BLOB, NULL)
- ✅ Pragmas
- ✅ Iterators
- ✅ Pluck, expand, and raw modes

**Run individually:**
```bash
node tests/cross-platform-test.js
```

### 2. Drizzle ORM Integration Tests (`tests/drizzle-integration-test.js`)

**Purpose:** Ensures full compatibility with Drizzle ORM, a popular TypeScript ORM.

**Coverage:**
- ✅ Basic Drizzle operations (insert, select, update, delete)
- ✅ Complex queries (joins, aggregations, subqueries)
- ✅ Transactions with Drizzle
- ✅ Drizzle-specific features (returning, SQL expressions, batch operations)
- ✅ Schema operations
- ✅ Type safety verification

**Run individually:**
```bash
node tests/drizzle-integration-test.js
```

### 3. Prisma Adapter Tests (`tests/prisma-adapter-test.js`)

**Purpose:** Tests the custom Prisma adapter pattern for integration with Prisma ORM.

**Coverage:**
- ✅ queryRaw and executeRaw methods
- ✅ Transaction management (commit/rollback)
- ✅ Complex Prisma patterns (nested creates, joins, aggregates)
- ✅ Edge cases (special characters, large batches, NULL handling)
- ✅ Boolean value conversion
- ✅ Batch operations

**Run individually:**
```bash
node tests/prisma-adapter-test.js
```

### 4. Stress Tests (`tests/stress-test.js`)

**Purpose:** Performance and concurrency testing.

**Coverage:**
- ✅ Large batch inserts
- ✅ Concurrent operations
- ✅ Memory usage patterns
- ✅ Transaction performance
- ✅ Query optimization

### 5. Chaos Testing (`tests/chaos-testing.js`)

**Purpose:** Error handling and recovery testing.

**Coverage:**
- ✅ Connection failures
- ✅ Malformed queries
- ✅ Resource exhaustion
- ✅ Concurrent transaction conflicts

## 📝 Example Files

### Quick Start Examples

#### 1. `examples/quick-start.js`
- **Purpose:** Simplest migration path from better-sqlite3
- **Shows:** Sync API (drop-in), Async API, and RQLite usage
- **Perfect for:** Getting started quickly

#### 2. `examples/simple-cross-platform.js`
- **Purpose:** Demonstrates identical code across all backends
- **Shows:** Same operations on in-memory, file-based, and RQLite
- **Perfect for:** Understanding cross-platform capabilities

### ORM Integration Examples

#### 3. `examples/drizzle-cross-platform.js`
- **Purpose:** Complete Drizzle ORM integration example
- **Shows:** Schema definition, CRUD operations, transactions, joins
- **Perfect for:** Drizzle ORM users

#### 4. `examples/drizzle-cross-platform-deno.ts`
- **Purpose:** Deno-specific Drizzle example
- **Shows:** How to use better-starlite with Drizzle in Deno
- **Perfect for:** Deno developers

#### 5. `examples/prisma-integration.js`
- **Purpose:** Prisma adapter pattern and migration guide
- **Shows:** Custom adapter implementation for Prisma
- **Perfect for:** Prisma users migrating from better-sqlite3

### Legacy Examples

- `examples/basic-usage.js` - Basic synchronous API usage
- `examples/async-usage.js` - Asynchronous API usage
- `examples/drizzle-usage.ts` - Simple Drizzle example
- `examples/drizzle-rqlite.ts` - Drizzle with RQLite

## 🚀 Running Tests

### Run All Tests
```bash
# Run comprehensive test suite
node tests/run-all-tests.js

# Or use npm script (if configured)
npm test
```

### Run Specific Test Suite
```bash
# Core tests only
node tests/cross-platform-test.js

# Drizzle tests only
node tests/drizzle-integration-test.js

# Prisma tests only
node tests/prisma-adapter-test.js
```

### Test with RQLite
```bash
# Start RQLite server
docker run -p 4001:4001 rqlite/rqlite

# Run tests with RQLite
RQLITE_URL=http://localhost:4001 node tests/run-all-tests.js
```

### Skip RQLite Tests
```bash
SKIP_RQLITE=true node tests/run-all-tests.js
```

### Verbose Output
```bash
VERBOSE=true node tests/cross-platform-test.js
```

## 📊 Test Matrix

| Test Type | Local SQLite | RQLite | Node.js | Deno | Drizzle | Prisma |
|-----------|--------------|--------|---------|------|---------|--------|
| Basic CRUD | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Transactions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Prepared Statements | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Complex Queries | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Type Safety | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| Performance | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ |

Legend:
- ✅ Full test coverage
- ⚠️ Partial test coverage
- ❌ Not tested

## 🔍 What's Being Tested

### Compatibility Tests
1. **API Compatibility**: Ensures all better-sqlite3 methods work
2. **Behavioral Compatibility**: Same results across all backends
3. **Error Compatibility**: Consistent error handling

### Integration Tests
1. **ORM Integration**: Drizzle and Prisma compatibility
2. **Cross-Platform**: Node.js and Deno support
3. **Distributed**: RQLite cluster operations

### Performance Tests
1. **Throughput**: Operations per second
2. **Latency**: Response times
3. **Concurrency**: Parallel operation handling
4. **Memory**: Resource usage patterns

### Reliability Tests
1. **Error Recovery**: Graceful failure handling
2. **Transaction Safety**: ACID compliance
3. **Edge Cases**: Boundary conditions
4. **Stress Testing**: Load handling

## 📈 Expected Test Results

When all tests pass, you should see:

```
=================================================
Test Summary
=================================================
✅ Passed: 50+
❌ Failed: 0
⏭️  Skipped: 0-2 (if RQLite not running)
```

## 🐛 Debugging Failed Tests

### Common Issues and Solutions

1. **RQLite Connection Failed**
   ```bash
   # Start RQLite server
   docker run -p 4001:4001 rqlite/rqlite
   ```

2. **Module Not Found**
   ```bash
   # Install dependencies
   npm install
   npm run build
   ```

3. **Database Locked**
   - WAL mode is enabled by default
   - Ensure proper cleanup in tests
   - Check for unclosed connections

4. **Type Errors**
   ```bash
   # Rebuild TypeScript files
   npm run build
   ```

## 🤝 Contributing Tests

When adding new features or fixing bugs:

1. **Add unit tests** to the appropriate test file
2. **Add integration tests** if the feature affects ORMs
3. **Add examples** to demonstrate usage
4. **Update this documentation**

### Test Structure Template

```javascript
async function testNewFeature(db, dbType) {
  console.log(`\n📝 Testing new feature with ${dbType}...`);

  await runTest(`${dbType}: Feature description`, async () => {
    // Test implementation
    const result = await db.someOperation();

    // Assertions
    assert(result.success === true, 'Operation should succeed');
  });
}
```

## 📚 Additional Resources

- **Migration Guide**: See `MIGRATION-GUIDE.md`
- **Cross-Platform Guide**: See `CROSS-PLATFORM-USAGE.md`
- **API Reference**: In the migration guide
- **Examples Directory**: `/examples` for working code

## ✅ Test Checklist for Releases

Before each release, ensure:

- [ ] All core tests pass
- [ ] Drizzle integration tests pass
- [ ] Prisma adapter tests pass
- [ ] Examples run without errors
- [ ] Tests pass with local SQLite
- [ ] Tests pass with RQLite (if available)
- [ ] No memory leaks detected
- [ ] Performance benchmarks meet targets

---

**Remember**: The goal is to ensure better-starlite works as a **true drop-in replacement** for SQLite, with the added benefit of distributed database support through RQLite. Every test helps guarantee this promise! 🚀