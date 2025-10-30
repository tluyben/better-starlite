/**
 * Plugin System Test
 *
 * Tests the schema and query rewriting plugins for all supported databases
 */

const {
  createPostgreSQLSchemaRewriter,
  createPostgreSQLQueryRewriter,
  createMySQLSchemaRewriter,
  createMySQLQueryRewriter,
  createOracleSchemaRewriter,
  createOracleQueryRewriter,
  createMSSQLSchemaRewriter,
  createMSSQLQueryRewriter
} = require('../dist/drivers/plugins');

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

async function runTest(name, testFn) {
  try {
    await testFn();
    testResults.passed++;
    testResults.tests.push({ name, status: 'PASS' });
    console.log(`✅ ${name}`);
  } catch (error) {
    testResults.failed++;
    testResults.tests.push({ name, status: 'FAIL', error: error.message });
    console.log(`❌ ${name}: ${error.message}`);
  }
}

// PostgreSQL Tests
async function testPostgreSQLSchemaRewriter() {
  const rewriter = createPostgreSQLSchemaRewriter({ verbose: false });

  const pgSchema = `
    CREATE TABLE users (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email TEXT UNIQUE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  const result = rewriter.rewriteSchema(pgSchema);

  // Check that BIGSERIAL was converted to AUTOINCREMENT
  if (!result.includes('AUTOINCREMENT')) {
    throw new Error('BIGSERIAL not converted to AUTOINCREMENT');
  }

  // Check that NOW() was converted
  if (!result.includes('CURRENT_TIMESTAMP')) {
    throw new Error('NOW() not converted to CURRENT_TIMESTAMP');
  }

  // Check that VARCHAR was converted to TEXT
  if (!result.includes('TEXT')) {
    throw new Error('VARCHAR not converted to TEXT');
  }
}

async function testPostgreSQLQueryRewriter() {
  const rewriter = createPostgreSQLQueryRewriter({ verbose: false });

  const pgQuery = `SELECT id, name, EXTRACT(YEAR FROM created_at) as year FROM users WHERE created_at > NOW()`;

  const result = rewriter.rewriteQuery(pgQuery);

  // Check that EXTRACT was converted
  if (!result.includes('strftime')) {
    throw new Error('EXTRACT not converted to strftime');
  }

  // Check that NOW() was converted
  if (!result.includes('CURRENT_TIMESTAMP')) {
    throw new Error('NOW() not converted to CURRENT_TIMESTAMP');
  }
}

// MySQL Tests
async function testMySQLSchemaRewriter() {
  const rewriter = createMySQLSchemaRewriter({ verbose: false });

  const mysqlSchema = `
    CREATE TABLE \`users\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`name\` VARCHAR(255) NOT NULL,
      \`created_at\` DATETIME DEFAULT NOW()
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `;

  const result = rewriter.rewriteSchema(mysqlSchema);

  // Check that AUTO_INCREMENT was converted to AUTOINCREMENT
  if (!result.includes('AUTOINCREMENT')) {
    throw new Error('AUTO_INCREMENT not converted to AUTOINCREMENT');
  }

  // Check that NOW() was converted
  if (!result.includes('CURRENT_TIMESTAMP')) {
    throw new Error('NOW() not converted to CURRENT_TIMESTAMP');
  }

  // Check that backticks were converted to double quotes
  if (result.includes('`')) {
    throw new Error('Backticks not converted to double quotes');
  }

  // Check that ENGINE was removed
  if (result.includes('ENGINE')) {
    throw new Error('ENGINE not removed');
  }
}

async function testMySQLQueryRewriter() {
  const rewriter = createMySQLQueryRewriter({ verbose: false });

  const mysqlQuery = `SELECT id, name, YEAR(\`created_at\`) as year FROM users WHERE \`created_at\` > NOW() LIMIT 10, 20`;

  const result = rewriter.rewriteQuery(mysqlQuery);

  // Check that YEAR() was converted
  if (!result.includes('strftime')) {
    throw new Error('YEAR() not converted to strftime');
  }

  // Check that NOW() was converted
  if (!result.includes('CURRENT_TIMESTAMP')) {
    throw new Error('NOW() not converted to CURRENT_TIMESTAMP');
  }

  // Check that LIMIT syntax was converted
  if (result.includes('LIMIT 10, 20')) {
    throw new Error('LIMIT offset, count not converted to LIMIT count OFFSET offset');
  }

  if (!result.includes('LIMIT 20 OFFSET 10')) {
    throw new Error('LIMIT not properly converted');
  }
}

// Oracle Tests
async function testOracleSchemaRewriter() {
  const rewriter = createOracleSchemaRewriter({ verbose: false });

  const oracleSchema = `
    CREATE TABLE users (
      id NUMBER PRIMARY KEY,
      name VARCHAR2(255) NOT NULL,
      email VARCHAR2(255) UNIQUE,
      created_at TIMESTAMP DEFAULT SYSDATE
    )
  `;

  const result = rewriter.rewriteSchema(oracleSchema);

  // Check that VARCHAR2 was converted to TEXT
  if (!result.includes('TEXT')) {
    throw new Error('VARCHAR2 not converted to TEXT');
  }

  // Check that SYSDATE was converted
  if (!result.includes('CURRENT_TIMESTAMP')) {
    throw new Error('SYSDATE not converted to CURRENT_TIMESTAMP');
  }
}

async function testOracleQueryRewriter() {
  const rewriter = createOracleQueryRewriter({ verbose: false });

  const oracleQuery = `SELECT id, name, TRUNC(created_at) as date FROM users WHERE created_at > SYSDATE AND ROWNUM <= 10`;

  const result = rewriter.rewriteQuery(oracleQuery);

  // Check that TRUNC was converted
  if (!result.includes('date(')) {
    throw new Error('TRUNC not converted to date()');
  }

  // Check that SYSDATE was converted
  if (!result.includes('CURRENT_TIMESTAMP')) {
    throw new Error('SYSDATE not converted to CURRENT_TIMESTAMP');
  }

  // Check that ROWNUM was handled
  if (!result.includes('LIMIT')) {
    throw new Error('ROWNUM not converted to LIMIT');
  }
}

// MSSQL Tests
async function testMSSQLSchemaRewriter() {
  const rewriter = createMSSQLSchemaRewriter({ verbose: false });

  const mssqlSchema = `
    CREATE TABLE [dbo].[users] (
      [id] INT IDENTITY(1,1) PRIMARY KEY,
      [name] NVARCHAR(255) NOT NULL,
      [created_at] DATETIME2 DEFAULT GETDATE()
    )
  `;

  const result = rewriter.rewriteSchema(mssqlSchema);

  // Check that IDENTITY was converted to AUTOINCREMENT
  if (!result.includes('AUTOINCREMENT')) {
    throw new Error('IDENTITY not converted to AUTOINCREMENT');
  }

  // Check that NVARCHAR was converted to TEXT
  if (!result.includes('TEXT')) {
    throw new Error('NVARCHAR not converted to TEXT');
  }

  // Check that GETDATE() was converted
  if (!result.includes('CURRENT_TIMESTAMP')) {
    throw new Error('GETDATE() not converted to CURRENT_TIMESTAMP');
  }

  // Check that square brackets were converted
  if (result.includes('[') || result.includes(']')) {
    throw new Error('Square brackets not converted to double quotes');
  }
}

async function testMSSQLQueryRewriter() {
  const rewriter = createMSSQLQueryRewriter({ verbose: false });

  const mssqlQuery = `SELECT TOP 10 [id], [name], YEAR([created_at]) as year FROM [users] WHERE [created_at] > GETDATE()`;

  const result = rewriter.rewriteQuery(mssqlQuery);

  // Check that YEAR() was converted
  if (!result.includes('strftime')) {
    throw new Error('YEAR() not converted to strftime');
  }

  // Check that GETDATE() was converted
  if (!result.includes('CURRENT_TIMESTAMP')) {
    throw new Error('GETDATE() not converted to CURRENT_TIMESTAMP');
  }

  // Check that TOP was handled
  if (!result.includes('LIMIT')) {
    throw new Error('TOP not converted to LIMIT');
  }
}

// Type Mapping Tests
async function testTypeMappings() {
  const pgRewriter = createPostgreSQLSchemaRewriter();
  const mysqlRewriter = createMySQLSchemaRewriter();
  const oracleRewriter = createOracleSchemaRewriter();
  const mssqlRewriter = createMSSQLSchemaRewriter();

  // Test common type mappings
  const typeMappingTests = [
    { rewriter: pgRewriter, sourceType: 'INTEGER', expectedSqlite: 'INTEGER' },
    { rewriter: pgRewriter, sourceType: 'BIGINT', expectedSqlite: 'INTEGER' },
    { rewriter: pgRewriter, sourceType: 'VARCHAR', expectedSqlite: 'TEXT' },
    { rewriter: pgRewriter, sourceType: 'TIMESTAMP', expectedSqlite: 'TEXT' },
    { rewriter: pgRewriter, sourceType: 'BOOLEAN', expectedSqlite: 'INTEGER' },
    { rewriter: mysqlRewriter, sourceType: 'INT', expectedSqlite: 'INTEGER' },
    { rewriter: mysqlRewriter, sourceType: 'VARCHAR', expectedSqlite: 'TEXT' },
    { rewriter: mysqlRewriter, sourceType: 'DATETIME', expectedSqlite: 'TEXT' },
    { rewriter: oracleRewriter, sourceType: 'NUMBER', expectedSqlite: 'REAL' },
    { rewriter: oracleRewriter, sourceType: 'VARCHAR2', expectedSqlite: 'TEXT' },
    { rewriter: mssqlRewriter, sourceType: 'INT', expectedSqlite: 'INTEGER' },
    { rewriter: mssqlRewriter, sourceType: 'NVARCHAR', expectedSqlite: 'TEXT' }
  ];

  for (const test of typeMappingTests) {
    const result = test.rewriter.mapType(test.sourceType);
    if (result !== test.expectedSqlite) {
      throw new Error(`Type mapping failed: ${test.sourceType} -> ${result} (expected ${test.expectedSqlite})`);
    }
  }
}

// Run all tests
async function runAllTests() {
  console.log('\n=== Better-Starlite Plugin System Tests ===\n');

  console.log('PostgreSQL Tests:');
  await runTest('PostgreSQL Schema Rewriter', testPostgreSQLSchemaRewriter);
  await runTest('PostgreSQL Query Rewriter', testPostgreSQLQueryRewriter);

  console.log('\nMySQL Tests:');
  await runTest('MySQL Schema Rewriter', testMySQLSchemaRewriter);
  await runTest('MySQL Query Rewriter', testMySQLQueryRewriter);

  console.log('\nOracle Tests:');
  await runTest('Oracle Schema Rewriter', testOracleSchemaRewriter);
  await runTest('Oracle Query Rewriter', testOracleQueryRewriter);

  console.log('\nMicrosoft SQL Server Tests:');
  await runTest('MSSQL Schema Rewriter', testMSSQLSchemaRewriter);
  await runTest('MSSQL Query Rewriter', testMSSQLQueryRewriter);

  console.log('\nType Mapping Tests:');
  await runTest('Type Mappings', testTypeMappings);

  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`Total: ${testResults.passed + testResults.failed}`);
  console.log(`Passed: ${testResults.passed}`);
  console.log(`Failed: ${testResults.failed}`);

  if (testResults.failed > 0) {
    console.log('\nFailed Tests:');
    testResults.tests
      .filter(t => t.status === 'FAIL')
      .forEach(t => console.log(`  - ${t.name}: ${t.error}`));
  }

  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
}

module.exports = { runAllTests };
