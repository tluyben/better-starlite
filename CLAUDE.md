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

## Current Test Counts (PARITY ACHIEVED)
- Node.js: 183 tests
- Deno: 183 tests
- Bun: 183 tests

## Build & Test Commands
- `npm test` - Run all tests (Node.js, Deno, Bun)
- `npm run test:node` - Jest only
- `npm run test:deno` - Deno only
- `bun test test/bun/` - Bun only
