# SQL Translation Error Logging

This document describes the SQL translation error logging system in Better-Starlite, which helps track and fix SQL translation issues when using non-SQLite databases (MySQL, PostgreSQL, MSSQL, Oracle).

## Overview

Better-Starlite includes a SQL translation layer that automatically converts SQLite SQL to the syntax of target databases. When this translation fails or when the translated SQL fails to execute, these errors are automatically logged for later analysis and fixing.

## How It Works

### 1. Automatic Error Logging

All database drivers (MySQL, PostgreSQL, etc.) automatically log two types of errors:

- **Translation Errors**: Errors that occur during SQL rewriting (e.g., unsupported syntax, plugin failures)
- **Execution Errors**: Errors that occur when executing the rewritten SQL (e.g., syntax errors in translated SQL, constraint violations)

### 2. Log File Format

Errors are logged to database-specific files in the `logs/` directory:

```
logs/translate-error-mysql.log
logs/translate-error-postgresql.log
logs/translate-error-mssql.log
logs/translate-error-oracle.log
```

Each line in the log file is a JSON object containing:

```json
{
  "timestamp": "2025-11-05T10:30:45.123Z",
  "database": "mysql",
  "errorType": "execution",
  "errorMessage": "You have an error in your SQL syntax",
  "originalSQL": "SELECT * FROM \"users\" WHERE \"id\" = ?",
  "rewrittenSQL": "SELECT * FROM `users` WHERE `id` = ?",
  "params": [123],
  "stackTrace": "Error: MySQL query error...\n    at ..."
}
```

### 3. Error Types

#### Translation Errors

Occur during the SQL rewriting phase:

```typescript
{
  "errorType": "translation",
  "originalSQL": "CREATE TABLE ...",
  "rewrittenSQL": null,  // Null because translation failed
  "errorMessage": "Unsupported CREATE TABLE syntax"
}
```

#### Execution Errors

Occur when the translated SQL fails to execute:

```typescript
{
  "errorType": "execution",
  "originalSQL": "INSERT INTO users ...",
  "rewrittenSQL": "INSERT INTO `users` ...",
  "params": [1, "John"],
  "errorMessage": "Duplicate entry '1' for key 'PRIMARY'"
}
```

## Using the Error Logs

### Manual Analysis

You can read the error logs directly:

```bash
# View all MySQL errors
cat logs/translate-error-mysql.log

# View most recent errors
tail -n 20 logs/translate-error-mysql.log

# Count errors
wc -l logs/translate-error-mysql.log

# Pretty print JSON
cat logs/translate-error-mysql.log | while read line; do echo "$line" | jq .; done
```

### Automated Fixing with Claude Code

The recommended way to fix translation errors is using the automated script with Claude Code:

#### Option 1: Using npm script

```bash
npm run fix-translation-errors -- mysql
npm run fix-translation-errors -- postgresql
```

#### Option 2: Using Node.js script directly

```bash
node scripts/fix-translation-errors.js mysql
node scripts/fix-translation-errors.js postgresql
```

#### Option 3: Using shell script (Unix/Linux/Mac)

```bash
./scripts/fix-translation-errors.sh mysql
./scripts/fix-translation-errors.sh postgresql
```

### What the Script Does

The `fix-translation-errors` script will:

1. Read all errors from the specified database log file
2. Analyze and summarize the errors
3. Generate a detailed prompt for Claude Code
4. Optionally invoke Claude Code automatically

When Claude Code runs, it will:

1. Read and analyze all errors in the log file
2. For each unique error pattern:
   - Understand what SQL translation is failing and why
   - Create a test case that reproduces the error
   - Fix the translation logic in the appropriate plugin or driver
   - Verify the test passes
3. Run the entire test suite to ensure no regressions
4. Continue until all errors are fixed and all tests pass

## Programmatic Access

You can also access error logs programmatically using the `SQLErrorLogger` class:

```typescript
import { SQLErrorLogger } from './utils/sql-error-logger';

// Read all errors for a database
const mysqlErrors = SQLErrorLogger.readErrors('mysql');

// Get error summary across all databases
const summary = SQLErrorLogger.getErrorSummary();
console.log(summary); // { mysql: 15, postgresql: 3 }

// Clear errors for a database
SQLErrorLogger.clearErrors('mysql');

// Get log file path
const logPath = SQLErrorLogger.getLogFilePath('mysql');
console.log(logPath); // /path/to/logs/translate-error-mysql.log

// Log a custom error
SQLErrorLogger.logTranslationError(
  'mysql',
  'SELECT * FROM "users"',
  new Error('Translation failed')
);
```

## Integration in Your Code

The error logging is already integrated into all database drivers. No additional setup is required. Simply use the drivers normally:

```typescript
import Database from 'better-starlite';

// Connect to MySQL
const db = new Database('mysql://user:pass@localhost:3306/mydb', {
  driver: 'mysql-async',
  queryRewriter: 'mysql',
  schemaRewriter: 'mysql'
});

// Use the database normally
// Any translation or execution errors will be automatically logged
const stmt = db.prepare('SELECT * FROM "users" WHERE "id" = ?');
const user = await stmt.getAsync(123);
```

## Log Directory Configuration

By default, logs are written to the `logs/` directory in your project root. You can customize this:

```typescript
import { SQLErrorLogger } from './utils/sql-error-logger';

// Set a custom log directory
SQLErrorLogger.initialize('/custom/path/to/logs');
```

## Best Practices

### 1. Regular Monitoring

Set up a cron job or CI/CD step to check for new errors:

```bash
# Check if there are any new errors
if [ -f logs/translate-error-mysql.log ]; then
  echo "Warning: MySQL translation errors detected!"
  wc -l logs/translate-error-mysql.log
fi
```

### 2. Automated Fixing in CI/CD

You can integrate the error fixing script in your CI/CD pipeline:

```yaml
# .github/workflows/fix-errors.yml
name: Fix SQL Translation Errors

on:
  schedule:
    - cron: '0 2 * * *'  # Run daily at 2am

jobs:
  fix-errors:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Check for errors
        run: |
          if [ -f logs/translate-error-mysql.log ]; then
            npm run fix-translation-errors -- mysql
          fi
```

### 3. Development Workflow

During development:

1. Write your SQLite code as usual
2. Test against target databases (MySQL, PostgreSQL, etc.)
3. Check error logs after each test run
4. Fix errors using the automated script
5. Clear logs after fixing: `rm logs/translate-error-*.log`

### 4. Error Analysis

Look for patterns in errors:

```bash
# Find most common error messages
cat logs/translate-error-mysql.log | jq -r '.errorMessage' | sort | uniq -c | sort -nr

# Find most common failing SQL patterns
cat logs/translate-error-mysql.log | jq -r '.originalSQL' | head -c 50 | sort | uniq -c | sort -nr
```

## Troubleshooting

### Logs not being created

1. Ensure the `logs/` directory exists and is writable
2. Check that you're using the async database drivers (mysql-async, postgresql-async)
3. Verify that errors are actually occurring (check console output)

### Script can't find Claude Code

1. Install Claude Code: https://docs.claude.com/en/docs/claude-code
2. Ensure `claude` is in your PATH
3. Use the manual options to copy/paste the prompt

### Too many errors

1. Start with a subset of errors
2. Use `head` to limit the log file: `head -n 100 logs/translate-error-mysql.log > logs/translate-error-mysql-subset.log`
3. Fix the subset first, then tackle the rest

## Examples

### Example: Fixing MySQL RETURNING clause errors

```bash
# 1. Run your tests and observe errors
npm test

# 2. Check what errors were logged
cat logs/translate-error-mysql.log | jq '.errorMessage'
# Output: "MySQL doesn't support RETURNING clause"

# 3. Run the fixer
npm run fix-translation-errors -- mysql

# 4. Claude Code will:
#    - Add RETURNING emulation to mysql-query-plugin.ts
#    - Create tests for RETURNING clause
#    - Verify all tests pass

# 5. Clear the logs
rm logs/translate-error-mysql.log
```

### Example: Fixing PostgreSQL quote issues

```bash
# 1. Observe errors
cat logs/translate-error-postgresql.log

# 2. Run fixer
./scripts/fix-translation-errors.sh postgresql

# 3. Claude Code will:
#    - Fix quote conversion in postgresql-query-plugin.ts
#    - Add tests for quoted identifiers
#    - Verify all tests pass
```

## Related Files

- **Logger**: `src/utils/sql-error-logger.ts`
- **MySQL Driver**: `src/drivers/mysql-async-driver.ts`
- **PostgreSQL Driver**: `src/drivers/postgresql-async-driver.ts`
- **Scripts**: `scripts/fix-translation-errors.js`, `scripts/fix-translation-errors.sh`
- **Logs**: `logs/translate-error-*.log`

## Contributing

When fixing translation errors:

1. Always add a test case that reproduces the error
2. Fix the underlying issue in the appropriate plugin or driver
3. Ensure all existing tests still pass
4. Document any new limitations or workarounds

## Support

If you encounter issues with the error logging system:

1. Check this documentation
2. Review the error log format and contents
3. Open an issue with:
   - Sample error logs
   - Steps to reproduce
   - Expected vs actual behavior
