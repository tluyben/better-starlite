# Plugin System Quick Start

This guide will get you up and running with the Better-Starlite plugin system in 5 minutes.

## What Are Plugins?

Plugins automatically translate SQL queries and schemas between different database dialects (PostgreSQL, MySQL, Oracle, MSSQL) and SQLite. This allows you to write SQLite-compatible code that works across multiple databases.

## Quick Start

### 1. Install Dependencies

```bash
# Core package
npm install better-starlite

# Database drivers (install the ones you need)
npm install pg          # PostgreSQL
npm install mysql2      # MySQL
npm install oracledb    # Oracle
npm install mssql       # Microsoft SQL Server
```

### 2. Start Test Databases (Optional)

```bash
# Start PostgreSQL and MySQL with Docker
docker-compose -f docker-compose-simple.yml up -d

# Wait for databases to be ready (about 10 seconds)
docker-compose -f docker-compose-simple.yml ps
```

### 3. Test the Plugins

```bash
# Build the project
npm run build

# Run plugin tests
node tests/plugin-test.js
```

## Example: Using Plugins with PostgreSQL

```javascript
const { registerAllPlugins } = require('better-starlite/drivers/plugins');
const { createPostgreSQLSchemaRewriter, createPostgreSQLQueryRewriter } = require('better-starlite/drivers/plugins');

// Register plugins
registerAllPlugins({ verbose: true });

// Create rewriters
const schemaRewriter = createPostgreSQLSchemaRewriter({ verbose: true });
const queryRewriter = createPostgreSQLQueryRewriter({ verbose: true });

// Test schema rewriting
const postgresSchema = `
  CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email TEXT UNIQUE,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
  )
`;

console.log('Original PostgreSQL Schema:');
console.log(postgresSchema);

const sqliteSchema = schemaRewriter.rewriteSchema(postgresSchema);
console.log('\nConverted to SQLite:');
console.log(sqliteSchema);

// Test query rewriting
const postgresQuery = `
  SELECT
    id,
    name,
    email,
    EXTRACT(YEAR FROM created_at) as year,
    created_at::TEXT as created_text
  FROM users
  WHERE
    created_at > NOW() - INTERVAL '7 days'
    AND active = TRUE
  ORDER BY created_at DESC
`;

console.log('\nOriginal PostgreSQL Query:');
console.log(postgresQuery);

const sqliteQuery = queryRewriter.rewriteQuery(postgresQuery);
console.log('\nConverted to SQLite:');
console.log(sqliteQuery);
```

## Example: Using Plugins with MySQL

```javascript
const { createMySQLSchemaRewriter, createMySQLQueryRewriter } = require('better-starlite/drivers/plugins');

const schemaRewriter = createMySQLSchemaRewriter({ verbose: true });
const queryRewriter = createMySQLQueryRewriter({ verbose: true });

// Test schema rewriting
const mysqlSchema = `
  CREATE TABLE \`users\` (
    \`id\` INT AUTO_INCREMENT PRIMARY KEY,
    \`name\` VARCHAR(255) NOT NULL,
    \`email\` VARCHAR(255) UNIQUE,
    \`created_at\` DATETIME DEFAULT NOW()
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

console.log('Original MySQL Schema:');
console.log(mysqlSchema);

const sqliteSchema = schemaRewriter.rewriteSchema(mysqlSchema);
console.log('\nConverted to SQLite:');
console.log(sqliteSchema);

// Test query rewriting
const mysqlQuery = `
  SELECT
    \`id\`,
    \`name\`,
    CONCAT(\`first_name\`, ' ', \`last_name\`) as full_name,
    YEAR(\`created_at\`) as year,
    DATE_FORMAT(\`created_at\`, '%Y-%m-%d') as date
  FROM \`users\`
  WHERE \`created_at\` > DATE_SUB(NOW(), INTERVAL 7 DAY)
  ORDER BY \`created_at\` DESC
  LIMIT 10, 20
`;

console.log('\nOriginal MySQL Query:');
console.log(mysqlQuery);

const sqliteQuery = queryRewriter.rewriteQuery(mysqlQuery);
console.log('\nConverted to SQLite:');
console.log(sqliteQuery);
```

## Common Translations

### PostgreSQL → SQLite

| PostgreSQL | SQLite |
|------------|--------|
| `BIGSERIAL` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| `VARCHAR(n)` | `TEXT` |
| `BOOLEAN` | `INTEGER` |
| `NOW()` | `CURRENT_TIMESTAMP` |
| `value::INTEGER` | `CAST(value AS INTEGER)` |
| `EXTRACT(YEAR FROM date)` | `CAST(strftime('%Y', date) AS INTEGER)` |
| `STRING_AGG(col, ',')` | `GROUP_CONCAT(col, ',')` |

### MySQL → SQLite

| MySQL | SQLite |
|-------|--------|
| `AUTO_INCREMENT` | `AUTOINCREMENT` |
| `` `column` `` | `"column"` |
| `NOW()` | `CURRENT_TIMESTAMP` |
| `CURDATE()` | `date('now')` |
| `CONCAT(a, b)` | `a || b` |
| `YEAR(date)` | `CAST(strftime('%Y', date) AS INTEGER)` |
| `LIMIT 10, 20` | `LIMIT 20 OFFSET 10` |

### Oracle → SQLite

| Oracle | SQLite |
|--------|--------|
| `VARCHAR2(n)` | `TEXT` |
| `NUMBER` | `REAL` or `INTEGER` |
| `SYSDATE` | `CURRENT_TIMESTAMP` |
| `NVL(a, b)` | `IFNULL(a, b)` |
| `TRUNC(date)` | `date(date)` |
| `FROM DUAL` | (removed) |
| `ROWNUM <= 10` | `LIMIT 10` |

### MSSQL → SQLite

| MSSQL | SQLite |
|-------|--------|
| `IDENTITY(1,1)` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| `[column]` | `"column"` |
| `NVARCHAR(MAX)` | `TEXT` |
| `GETDATE()` | `CURRENT_TIMESTAMP` |
| `CHARINDEX(a, b)` | `INSTR(b, a)` |
| `LEN(str)` | `LENGTH(str)` |
| `TOP 10` | `LIMIT 10` |

## Plugin Options

Control plugin behavior with options:

```javascript
const schemaRewriter = createPostgreSQLSchemaRewriter({
  verbose: true,        // Log all transformations
  strict: false,        // Throw errors vs warnings on unsupported features
  transformations: {
    autoIncrement: true,   // Transform AUTO_INCREMENT
    defaultValues: true,   // Transform DEFAULT values
    constraints: true,     // Transform CHECK/FK constraints
    indexes: true,         // Transform indexes
    functions: true,       // Transform functions
    operators: true        // Transform operators
  }
});
```

## Testing with Docker

The project includes Docker Compose files for testing:

```bash
# Start all databases (PostgreSQL, MySQL, Oracle, MSSQL)
docker-compose up -d

# Or start just PostgreSQL and MySQL
docker-compose -f docker-compose-simple.yml up -d

# Check database status
docker-compose ps

# Stop databases
docker-compose down
```

### Connection Strings

- **PostgreSQL**: `postgresql://testuser:testpass@localhost:5432/testdb`
- **MySQL**: `mysql://testuser:testpass@localhost:3306/testdb`
- **Oracle**: `oracle://testuser:testpass@localhost:1521/XEPDB1`
- **MSSQL**: `mssql://sa:MssqlPass123!@localhost:1433/master`

## Troubleshooting

### Plugin Not Found

```
Error: Schema plugin not found for dialect 'postgresql'
```

**Solution**: Register the plugins first:

```javascript
const { registerAllPlugins } = require('better-starlite/drivers/plugins');
registerAllPlugins();
```

### Module Not Found

```
Error: Cannot find module 'pg'
```

**Solution**: Install the required database driver:

```bash
npm install pg        # PostgreSQL
npm install mysql2    # MySQL
npm install oracledb  # Oracle
npm install mssql     # MSSQL
```

### Unsupported Feature Warning

```
[postgresql-schema] Feature X is not supported in SQLite
```

**Solution**: This is just a warning. The plugin will do its best to convert the SQL. If you want strict error handling:

```javascript
const rewriter = createPostgreSQLSchemaRewriter({ strict: true });
```

## Next Steps

1. Read the full [Plugin Documentation](docs/PLUGINS.md)
2. Check out the [examples](examples/) directory
3. Run the test suite: `npm test`
4. Contribute new plugins or improvements

## Need Help?

- Check the [Plugin Documentation](docs/PLUGINS.md)
- Review the [test files](tests/plugin-test.js)
- Look at [existing plugins](src/drivers/plugins/) for examples
- Open an issue on GitHub
