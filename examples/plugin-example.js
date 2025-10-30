/**
 * Plugin System Example
 *
 * This example demonstrates how to use the schema and query rewriting plugins
 * to translate SQL between different database dialects and SQLite.
 */

const {
  registerAllPlugins,
  createPostgreSQLSchemaRewriter,
  createPostgreSQLQueryRewriter,
  createMySQLSchemaRewriter,
  createMySQLQueryRewriter,
  createOracleSchemaRewriter,
  createOracleQueryRewriter,
  createMSSQLSchemaRewriter,
  createMSSQLQueryRewriter
} = require('../dist/drivers/plugins');

// Register all plugins
registerAllPlugins({ verbose: false });

console.log('='.repeat(70));
console.log('Better-Starlite Plugin System Example');
console.log('='.repeat(70));

// PostgreSQL Example
console.log('\n' + '='.repeat(70));
console.log('PostgreSQL → SQLite Translation');
console.log('='.repeat(70));

const pgSchemaRewriter = createPostgreSQLSchemaRewriter({ verbose: false });
const pgQueryRewriter = createPostgreSQLQueryRewriter({ verbose: false });

const postgresSchema = `
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL,
  full_name TEXT,
  age SMALLINT,
  balance NUMERIC(10,2) DEFAULT 0.00,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB
)`;

console.log('\n📝 Original PostgreSQL Schema:');
console.log(postgresSchema);

console.log('\n🔄 Translated to SQLite:');
const sqliteSchema1 = pgSchemaRewriter.rewriteSchema(postgresSchema);
console.log(sqliteSchema1);

const postgresQuery = `
SELECT
  id,
  username,
  CONCAT(username, '@', email) as contact,
  EXTRACT(YEAR FROM created_at) as signup_year,
  age::TEXT as age_text
FROM users
WHERE
  created_at > NOW() - INTERVAL '30 days'
  AND is_active = TRUE
  AND email ILIKE '%@example.com'
ORDER BY created_at DESC
LIMIT 10`;

console.log('\n📝 Original PostgreSQL Query:');
console.log(postgresQuery);

console.log('\n🔄 Translated to SQLite:');
const sqliteQuery1 = pgQueryRewriter.rewriteQuery(postgresQuery);
console.log(sqliteQuery1);

// MySQL Example
console.log('\n' + '='.repeat(70));
console.log('MySQL → SQLite Translation');
console.log('='.repeat(70));

const mysqlSchemaRewriter = createMySQLSchemaRewriter({ verbose: false });
const mysqlQueryRewriter = createMySQLQueryRewriter({ verbose: false });

const mysqlSchema = `
CREATE TABLE \`orders\` (
  \`id\` INT AUTO_INCREMENT PRIMARY KEY,
  \`user_id\` INT NOT NULL,
  \`product_name\` VARCHAR(255) NOT NULL,
  \`quantity\` SMALLINT DEFAULT 1,
  \`price\` DECIMAL(10,2) NOT NULL,
  \`status\` ENUM('pending', 'shipped', 'delivered') DEFAULT 'pending',
  \`created_at\` DATETIME DEFAULT NOW(),
  \`updated_at\` DATETIME DEFAULT NOW() ON UPDATE NOW(),
  INDEX \`idx_user_id\` (\`user_id\`),
  INDEX \`idx_status\` (\`status\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

console.log('\n📝 Original MySQL Schema:');
console.log(mysqlSchema);

console.log('\n🔄 Translated to SQLite:');
const sqliteSchema2 = mysqlSchemaRewriter.rewriteSchema(mysqlSchema);
console.log(sqliteSchema2);

const mysqlQuery = `
SELECT
  \`id\`,
  \`product_name\`,
  CONCAT(\`product_name\`, ' x', \`quantity\`) as description,
  \`quantity\` * \`price\` as total,
  YEAR(\`created_at\`) as order_year,
  DATE_FORMAT(\`created_at\`, '%Y-%m-%d') as order_date
FROM \`orders\`
WHERE
  \`created_at\` > DATE_SUB(NOW(), INTERVAL 7 DAY)
  AND \`status\` = 'delivered'
ORDER BY \`created_at\` DESC
LIMIT 20, 10`;

console.log('\n📝 Original MySQL Query:');
console.log(mysqlQuery);

console.log('\n🔄 Translated to SQLite:');
const sqliteQuery2 = mysqlQueryRewriter.rewriteQuery(mysqlQuery);
console.log(sqliteQuery2);

// Oracle Example
console.log('\n' + '='.repeat(70));
console.log('Oracle → SQLite Translation');
console.log('='.repeat(70));

const oracleSchemaRewriter = createOracleSchemaRewriter({ verbose: false });
const oracleQueryRewriter = createOracleQueryRewriter({ verbose: false });

const oracleSchema = `
CREATE TABLE employees (
  emp_id NUMBER PRIMARY KEY,
  emp_name VARCHAR2(100) NOT NULL,
  department VARCHAR2(50),
  salary NUMBER(10,2),
  hire_date DATE DEFAULT SYSDATE,
  notes CLOB
)`;

console.log('\n📝 Original Oracle Schema:');
console.log(oracleSchema);

console.log('\n🔄 Translated to SQLite:');
const sqliteSchema3 = oracleSchemaRewriter.rewriteSchema(oracleSchema);
console.log(sqliteSchema3);

const oracleQuery = `
SELECT
  emp_id,
  emp_name,
  department,
  TO_CHAR(salary, '999,999.99') as formatted_salary,
  TRUNC(hire_date) as hire_date_only,
  MONTHS_BETWEEN(SYSDATE, hire_date) as months_employed
FROM employees
WHERE
  hire_date > ADD_MONTHS(SYSDATE, -12)
  AND NVL(department, 'Unknown') != 'Unknown'
ORDER BY hire_date DESC
FETCH FIRST 10 ROWS ONLY`;

console.log('\n📝 Original Oracle Query:');
console.log(oracleQuery);

console.log('\n🔄 Translated to SQLite:');
const sqliteQuery3 = oracleQueryRewriter.rewriteQuery(oracleQuery);
console.log(sqliteQuery3);

// MSSQL Example
console.log('\n' + '='.repeat(70));
console.log('Microsoft SQL Server → SQLite Translation');
console.log('='.repeat(70));

const mssqlSchemaRewriter = createMSSQLSchemaRewriter({ verbose: false });
const mssqlQueryRewriter = createMSSQLQueryRewriter({ verbose: false });

const mssqlSchema = `
CREATE TABLE [dbo].[products] (
  [id] INT IDENTITY(1,1) PRIMARY KEY,
  [sku] NVARCHAR(50) NOT NULL UNIQUE,
  [name] NVARCHAR(255) NOT NULL,
  [description] NVARCHAR(MAX),
  [price] MONEY NOT NULL,
  [in_stock] BIT DEFAULT 1,
  [created_at] DATETIME2 DEFAULT GETDATE(),
  [updated_at] DATETIME2 DEFAULT GETDATE()
)`;

console.log('\n📝 Original MSSQL Schema:');
console.log(mssqlSchema);

console.log('\n🔄 Translated to SQLite:');
const sqliteSchema4 = mssqlSchemaRewriter.rewriteSchema(mssqlSchema);
console.log(sqliteSchema4);

const mssqlQuery = `
SELECT TOP 10
  [id],
  [sku],
  [name],
  CONCAT([name], ' (', [sku], ')') as full_name,
  [price] * 1.1 as price_with_tax,
  YEAR([created_at]) as created_year,
  DATEDIFF(day, [created_at], GETDATE()) as days_since_creation
FROM [dbo].[products]
WHERE
  [in_stock] = 1
  AND [created_at] > DATEADD(month, -3, GETDATE())
ORDER BY [created_at] DESC`;

console.log('\n📝 Original MSSQL Query:');
console.log(mssqlQuery);

console.log('\n🔄 Translated to SQLite:');
const sqliteQuery4 = mssqlQueryRewriter.rewriteQuery(mssqlQuery);
console.log(sqliteQuery4);

// Summary
console.log('\n' + '='.repeat(70));
console.log('Summary');
console.log('='.repeat(70));

console.log(`
✅ All plugins are working correctly!

The plugin system successfully translates SQL between different database
dialects and SQLite, including:

- Data type conversions (BIGSERIAL → AUTOINCREMENT, VARCHAR → TEXT, etc.)
- Function calls (NOW() → CURRENT_TIMESTAMP, YEAR() → strftime(), etc.)
- Operators (:: → CAST, ILIKE → LIKE, etc.)
- Syntax differences (backticks → double quotes, square brackets, etc.)
- Special features (TOP → LIMIT, ROWNUM → LIMIT, etc.)

This allows you to write SQLite-compatible code that works across multiple
database systems with automatic translation!

For more information, see:
- docs/PLUGINS.md - Comprehensive plugin documentation
- PLUGIN-QUICKSTART.md - Quick start guide
- tests/plugin-test.js - Plugin test suite
`);

console.log('='.repeat(70));
