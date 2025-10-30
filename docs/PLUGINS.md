# Better-Starlite Plugin System

The Better-Starlite plugin system allows you to use SQLite-compatible code with PostgreSQL, MySQL, Oracle, and Microsoft SQL Server databases. The plugins automatically translate SQL queries and schemas between different database dialects and SQLite.

## Overview

The plugin system consists of two types of plugins:

1. **Schema Rewriter Plugins** - Translate DDL statements (CREATE TABLE, ALTER TABLE, etc.) from various database dialects to SQLite-compatible syntax
2. **Query Rewriter Plugins** - Translate DML statements (SELECT, INSERT, UPDATE, DELETE) and database-specific functions/operators to SQLite-compatible syntax

## Why Use Plugins?

Different databases have different:
- Data types (e.g., PostgreSQL's `SERIAL`, MySQL's `AUTO_INCREMENT`, Oracle's `VARCHAR2`)
- Functions (e.g., MySQL's `NOW()`, PostgreSQL's `CURRENT_TIMESTAMP`, Oracle's `SYSDATE`)
- Operators and syntax (e.g., PostgreSQL's `::` type casting, MySQL's backticks)
- Date/time handling
- String operations

The plugin system handles these differences automatically, allowing you to write SQLite-compatible code that works across multiple databases.

## Installation

Install the necessary database drivers:

```bash
# For PostgreSQL
npm install pg

# For MySQL
npm install mysql2

# For Oracle
npm install oracledb

# For Microsoft SQL Server
npm install mssql
```

## Usage

### Basic Example

```javascript
import { createPostgreSQLDriver } from 'better-starlite/drivers/postgresql-driver';
import { DriverRegistry, PluginRegistry } from 'better-starlite/drivers';
import { registerAllPlugins } from 'better-starlite/drivers/plugins';

// Register all plugins
registerAllPlugins({ verbose: true });

// Register the PostgreSQL driver
const pgDriver = createPostgreSQLDriver();
DriverRegistry.register('postgresql', pgDriver);

// Create a database connection with plugins enabled
const db = pgDriver.createDatabase('postgresql://testuser:testpass@localhost:5432/testdb', {
  schemaRewriter: 'postgresql',  // Enable PostgreSQL -> SQLite schema translation
  queryRewriter: 'postgresql',   // Enable PostgreSQL -> SQLite query translation
  pluginOptions: {
    verbose: true,  // Log transformations
    strict: false   // Don't throw errors on unsupported features
  }
});

// Now you can use SQLite-compatible syntax
// The plugins will automatically translate to PostgreSQL

// Create table (SQLite syntax)
db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// Insert data (SQLite syntax)
const stmt = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
stmt.run('Alice', 'alice@example.com');
stmt.run('Bob', 'bob@example.com');

// Query data (SQLite syntax)
const users = db.prepare('SELECT * FROM users').all();
console.log(users);

// Clean up
db.close();
```

## Available Plugins

### PostgreSQL

**Schema Rewriter**: Translates PostgreSQL types and syntax to SQLite:
- `SERIAL` / `BIGSERIAL` → `INTEGER PRIMARY KEY AUTOINCREMENT`
- `VARCHAR(n)` / `TEXT` → `TEXT`
- `TIMESTAMP` / `TIMESTAMPTZ` → `TEXT`
- `BOOLEAN` → `INTEGER`
- `BYTEA` → `BLOB`
- `JSON` / `JSONB` → `TEXT`

**Query Rewriter**: Translates PostgreSQL functions and operators:
- `NOW()` → `CURRENT_TIMESTAMP`
- `TO_CHAR()` → `strftime()`
- `EXTRACT()` → `strftime()` + `CAST()`
- `CONCAT()` → `||` operator
- `::` type casting → `CAST()` function
- `ILIKE` → `LIKE`
- `STRING_AGG()` → `GROUP_CONCAT()`

### MySQL

**Schema Rewriter**: Translates MySQL types and syntax to SQLite:
- `AUTO_INCREMENT` → `AUTOINCREMENT`
- `TINYINT` / `SMALLINT` / `MEDIUMINT` / `BIGINT` → `INTEGER`
- `VARCHAR(n)` / `TEXT` → `TEXT`
- `DATETIME` / `TIMESTAMP` → `TEXT`
- `ENUM` → `TEXT CHECK(column IN (...))`
- Backticks → Double quotes

**Query Rewriter**: Translates MySQL functions and operators:
- `NOW()` / `CURDATE()` / `CURTIME()` → Appropriate SQLite functions
- `DATE_FORMAT()` → `strftime()`
- `DATE_ADD()` / `DATE_SUB()` → `date()` with modifiers
- `CONCAT()` → `||` operator
- `IF()` → `CASE WHEN ... END`
- `LIMIT offset, count` → `LIMIT count OFFSET offset`

### Oracle

**Schema Rewriter**: Translates Oracle types and syntax to SQLite:
- `NUMBER` → `REAL` or `INTEGER`
- `VARCHAR2` / `NVARCHAR2` → `TEXT`
- `CLOB` → `TEXT`
- `RAW` / `BLOB` → `BLOB`
- Sequences → `AUTOINCREMENT`

**Query Rewriter**: Translates Oracle functions and operators:
- `SYSDATE` / `SYSTIMESTAMP` → `CURRENT_TIMESTAMP`
- `TO_CHAR()` / `TO_DATE()` → SQLite date functions
- `NVL()` → `IFNULL()`
- `NVL2()` → `CASE WHEN ... END`
- `DECODE()` → `CASE` expression
- `ROWNUM` → `LIMIT`
- `FROM DUAL` → (removed)

### Microsoft SQL Server

**Schema Rewriter**: Translates MSSQL types and syntax to SQLite:
- `IDENTITY(1,1)` → `INTEGER PRIMARY KEY AUTOINCREMENT`
- `NVARCHAR(MAX)` → `TEXT`
- `DATETIME2` / `DATETIMEOFFSET` → `TEXT`
- `BIT` → `INTEGER`
- `UNIQUEIDENTIFIER` → `TEXT`
- Square brackets → Double quotes

**Query Rewriter**: Translates MSSQL functions and operators:
- `GETDATE()` / `SYSDATETIME()` → `CURRENT_TIMESTAMP`
- `DATEADD()` / `DATEDIFF()` → SQLite date functions
- `CHARINDEX()` → `INSTR()`
- `LEN()` → `LENGTH()`
- `ISNULL()` → `IFNULL()`
- `IIF()` → `CASE WHEN ... END`
- `TOP n` → `LIMIT n`

## Plugin Options

When creating a database connection, you can specify plugin options:

```javascript
const db = driver.createDatabase(connectionString, {
  schemaRewriter: 'postgresql',
  queryRewriter: 'postgresql',
  pluginOptions: {
    verbose: true,        // Log all transformations
    strict: false,        // Throw errors on unsupported features (vs warnings)
    transformations: {
      autoIncrement: true,    // Transform AUTO_INCREMENT
      defaultValues: true,    // Transform DEFAULT values
      constraints: true,      // Transform CHECK/FK constraints
      indexes: true,          // Transform indexes
      functions: true,        // Transform functions
      operators: true         // Transform operators
    },
    customTypeMappings: [    // Override default type mappings
      { sourceType: 'BIGSERIAL', sqliteType: 'INTEGER' }
    ]
  }
});
```

## Manual Plugin Registration

If you don't want to register all plugins at once, you can register them individually:

```javascript
import { PluginRegistry } from 'better-starlite/drivers';
import { createPostgreSQLSchemaRewriter, createPostgreSQLQueryRewriter } from 'better-starlite/drivers/plugins';

// Register only PostgreSQL plugins
PluginRegistry.registerSchemaPlugin(createPostgreSQLSchemaRewriter({ verbose: true }));
PluginRegistry.registerQueryPlugin(createPostgreSQLQueryRewriter({ verbose: true }));
```

## Docker Testing

The project includes Docker Compose files for testing with real databases:

```bash
# Start PostgreSQL and MySQL
docker-compose -f docker-compose-simple.yml up -d

# Wait for databases to be ready
docker-compose -f docker-compose-simple.yml ps

# Run tests
npm test

# Stop databases
docker-compose -f docker-compose-simple.yml down
```

Connection strings for Docker databases:
- PostgreSQL: `postgresql://testuser:testpass@localhost:5432/testdb`
- MySQL: `mysql://testuser:testpass@localhost:3306/testdb`

## Limitations

### General Limitations
- Complex queries may not translate perfectly
- Database-specific features (e.g., PostgreSQL arrays, MySQL fulltext indexes) may not have SQLite equivalents
- Performance characteristics differ between databases
- Some translations are approximations

### Schema Translation Limitations
- Partitioning is not supported
- Advanced constraints may be simplified
- Database-specific storage options are removed

### Query Translation Limitations
- Regular expressions work differently across databases
- Date/time arithmetic may have precision differences
- Window functions may need manual adjustment
- Advanced JSON operations may not translate

## Testing Your Plugins

Create a test file to verify plugin behavior:

```javascript
import { createPostgreSQLSchemaRewriter, createPostgreSQLQueryRewriter } from 'better-starlite/drivers/plugins';

const schemaRewriter = createPostgreSQLSchemaRewriter({ verbose: true });
const queryRewriter = createPostgreSQLQueryRewriter({ verbose: true });

// Test schema rewriting
const pgSchema = `
  CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )
`;

const sqliteSchema = schemaRewriter.rewriteSchema(pgSchema);
console.log('Rewritten schema:', sqliteSchema);

// Test query rewriting
const pgQuery = `
  SELECT id, name, TO_CHAR(created_at, 'YYYY-MM-DD') as date
  FROM users
  WHERE created_at > NOW() - INTERVAL '7 days'
`;

const sqliteQuery = queryRewriter.rewriteQuery(pgQuery);
console.log('Rewritten query:', sqliteQuery);
```

## Contributing

To add support for a new database:

1. Create schema rewriter plugin in `src/drivers/plugins/{database}-schema-plugin.ts`
2. Create query rewriter plugin in `src/drivers/plugins/{database}-query-plugin.ts`
3. Extend the base classes: `BaseSchemaRewriter` and `BaseQueryRewriter`
4. Implement all required methods
5. Add type mappings
6. Test with Docker Compose
7. Document limitations

See existing plugins for examples.

## Resources

- [SQLite Data Types](https://www.sqlite.org/datatype3.html)
- [PostgreSQL Type System](https://www.postgresql.org/docs/current/datatype.html)
- [MySQL Data Types](https://dev.mysql.com/doc/refman/8.0/en/data-types.html)
- [Oracle Data Types](https://docs.oracle.com/en/database/oracle/oracle-database/21/sqlrf/Data-Types.html)
- [SQL Server Data Types](https://learn.microsoft.com/en-us/sql/t-sql/data-types/data-types-transact-sql)
