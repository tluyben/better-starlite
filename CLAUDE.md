# Claude Code Project Notes

## Test Consistency Rules

**CRITICAL**: All runtime test files (Node.js, Deno, Bun) MUST be as similar as humanly possible.

1. **Use the same API methods across all runtimes**: Always use `db.prepare()` for queries - NEVER use `db.query()` even if both work. This ensures test code is nearly identical across runtimes.

2. **Same test structure**: Each runtime should have the same test files with the same test cases. The only differences should be:
   - Import statements (runtime-specific)
   - Test runner syntax (`describe`/`test` vs `Deno.test`)
   - Minor API differences that can't be avoided

3. **When adding tests**: Add to ALL runtimes simultaneously. Don't add tests to one runtime without adding equivalent tests to others.

4. **Test file parity**:
   - Node.js: `test/*.test.js`
   - Deno: `test/deno/*.test.ts`
   - Bun: `test/bun/*.test.ts`

## Current Test Counts
- Node.js: 188 tests + 23 FlexDB (211 total; FlexDB skip when binary absent)
- Deno: 183 tests
- Bun: 183 tests

> **Note:** The FlexDB integration tests (`test/flexdb.test.js`) skip automatically
> when the `flexdb` binary is not found. To run them:
> ```
> FLEXDB_BIN=/path/to/starlite npx jest test/flexdb.test.js
> ```
> The binary is built as `starlite` (not `flexdb`): `cd flexdb && cargo build --release`
> The Deno and Bun equivalents are not yet written — add them when adding FlexDB tests.

## Build & Test Commands
- `npm test` - Run all tests (Node.js, Deno, Bun)
- `npm run test:node` - Jest only
- `npm run test:deno` - Deno only
- `bun test test/bun/` - Bun only

## FlexDB Driver

**New driver backend** — `src/drivers/flexdb-client.ts` + `src/async-unified.ts`.

Detection: `createDatabase("flexdb://host:port")` or `createDatabase("flexdb://n1:p1,n2:p2")`.

### AsyncDatabase FlexDB API

| Method | Behaviour on FlexDB |
|--------|---------------------|
| `prepare(sql).run/get/all()` | POST /v1/query |
| `exec(sql)` | POST /v1/query (batch) |
| `transaction(fn)` | begin/commit/rollback HTTP sessions; serialized by `AsyncWriteMutex` |
| `pragma(key)` | No-op — returns `[]` or `undefined`; all PRAGMA calls silently ignored |
| `backup(dest)` | GET /v1/snapshot → writes SQLite file to `dest` |
| `upsert(...)` | SELECT existence check + INSERT ON CONFLICT via POST /v1/query |
| `supportsFeature(f)` | Returns true for `per-table-consistency`, `native-search`, `transactions`, `backup` |
| `setTableMode(t, mode)` | PUT /v1/table/:name/mode |
| `getTableMode(t)` | GET /v1/table/:name/mode |
| `enableSearch(t, cols)` | PUT /v1/table/:name/search |
| `disableSearch(t)` | DELETE /v1/table/:name/search |
| `getSearchConfig(t)` | GET /v1/table/:name/search |
| `search(t, query, limit)` | POST /v1/search |
| `getName()` | Returns `"flexdb"` |
| `getInTransaction()` | Returns true when `flexdbClient.activeTxnId !== undefined` |

### Transaction safety

`AsyncWriteMutex` serialises `transaction()` calls — only one active HTTP transaction
session per `AsyncDatabase` instance at a time (safe because `setActiveTxnId` is not
concurrent). All statements prepared inside the transaction closure send
`X-Transaction-ID` via the header automatically.

### FlexDB URL helpers

```typescript
import { parseFlexDbUrl } from 'better-starlite/dist/drivers/flexdb-client';
parseFlexDbUrl('flexdb://node1:4001,node2:4001')
// → ['http://node1:4001', 'http://node2:4001']
```
