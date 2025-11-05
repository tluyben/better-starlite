/**
 * SQL Translation Error Logging Example
 *
 * This example demonstrates how the SQL translation error logging works
 * when using non-SQLite databases with Better-Starlite.
 *
 * To run this example:
 *   1. Ensure you have MySQL or PostgreSQL running
 *   2. Update the connection string below
 *   3. Run: node examples/error-logging-example.js
 *   4. Check the logs/ directory for error logs
 */

const Database = require('../dist/index.js');
const { SQLErrorLogger } = require('../dist/utils/sql-error-logger.js');
const fs = require('fs');
const path = require('path');

// Example: MySQL
async function testMySQLErrorLogging() {
  console.log('='.repeat(60));
  console.log('MySQL Error Logging Example');
  console.log('='.repeat(60));

  // Create a MySQL database connection
  // NOTE: Update this connection string with your actual MySQL credentials
  const db = new Database('mysql://root:password@localhost:3306/testdb', {
    driver: 'mysql-async',
    queryRewriter: 'mysql',
    schemaRewriter: 'mysql'
  });

  try {
    // Example 1: This might cause a translation error if the syntax is not supported
    console.log('\n1. Testing potentially problematic SQL...');

    const stmt1 = db.prepare('SELECT * FROM "users" WHERE "id" = ?');
    const result1 = await stmt1.allAsync(1);
    console.log('   ✓ Query succeeded');

    // Example 2: Create a table with SQLite syntax
    console.log('\n2. Testing schema creation...');

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS "test_users" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT,
        "name" TEXT NOT NULL,
        "email" TEXT UNIQUE
      )
    `);
    console.log('   ✓ Schema creation succeeded');

    // Example 3: Use RETURNING clause (may not be supported in MySQL)
    console.log('\n3. Testing RETURNING clause...');

    const stmt3 = db.prepare(`
      INSERT INTO "test_users" ("name", "email")
      VALUES (?, ?)
      RETURNING *
    `);

    try {
      const result3 = await stmt3.allAsync('John Doe', 'john@example.com');
      console.log('   ✓ RETURNING clause succeeded:', result3);
    } catch (error) {
      console.log('   ✗ RETURNING clause failed:', error.message);
      console.log('   → This error has been logged to logs/translate-error-mysql.log');
    }

    // Clean up
    await db.execAsync('DROP TABLE IF EXISTS "test_users"');

  } catch (error) {
    console.error('Error:', error.message);
    console.log('→ This error has been logged to logs/translate-error-mysql.log');
  } finally {
    await db.closeAsync();
  }

  // Show the error logs
  console.log('\n' + '='.repeat(60));
  console.log('Error Log Summary');
  console.log('='.repeat(60));

  const summary = SQLErrorLogger.getErrorSummary();
  console.log('\nErrors by database:');
  for (const [db, count] of Object.entries(summary)) {
    console.log(`  - ${db}: ${count} error(s)`);

    if (count > 0) {
      console.log(`\n  Log file: ${SQLErrorLogger.getLogFilePath(db)}`);

      const errors = SQLErrorLogger.readErrors(db);
      console.log(`\n  Recent errors:`);

      errors.slice(0, 3).forEach((err, idx) => {
        console.log(`\n  ${idx + 1}. [${err.errorType}] ${err.errorMessage}`);
        console.log(`     Original SQL: ${err.originalSQL.substring(0, 80)}...`);
        if (err.rewrittenSQL) {
          console.log(`     Rewritten SQL: ${err.rewrittenSQL.substring(0, 80)}...`);
        }
      });

      if (errors.length > 3) {
        console.log(`\n  ... and ${errors.length - 3} more errors`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Next Steps');
  console.log('='.repeat(60));
  console.log('\nTo fix these errors automatically, run:');
  console.log('  npm run fix-translation-errors -- mysql\n');
}

// Example: PostgreSQL
async function testPostgreSQLErrorLogging() {
  console.log('='.repeat(60));
  console.log('PostgreSQL Error Logging Example');
  console.log('='.repeat(60));

  // Create a PostgreSQL database connection
  // NOTE: Update this connection string with your actual PostgreSQL credentials
  const db = new Database('postgresql://postgres:password@localhost:5432/testdb', {
    driver: 'postgresql-async',
    queryRewriter: 'postgresql',
    schemaRewriter: 'postgresql'
  });

  try {
    console.log('\n1. Testing PostgreSQL-specific SQL...');

    const stmt1 = db.prepare('SELECT * FROM "users" WHERE "id" = ?');
    const result1 = await stmt1.allAsync(1);
    console.log('   ✓ Query succeeded');

    // PostgreSQL supports RETURNING, so this should work
    console.log('\n2. Testing RETURNING clause (should work)...');

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS "test_users" (
        "id" SERIAL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "email" TEXT UNIQUE
      )
    `);

    const stmt2 = db.prepare(`
      INSERT INTO "test_users" ("name", "email")
      VALUES (?, ?)
      RETURNING *
    `);

    const result2 = await stmt2.allAsync('Jane Doe', 'jane@example.com');
    console.log('   ✓ RETURNING clause succeeded:', result2);

    // Clean up
    await db.execAsync('DROP TABLE IF EXISTS "test_users"');

  } catch (error) {
    console.error('Error:', error.message);
    console.log('→ This error has been logged to logs/translate-error-postgresql.log');
  } finally {
    await db.closeAsync();
  }
}

// Main execution
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('Better-Starlite: SQL Translation Error Logging Example');
  console.log('='.repeat(60));
  console.log('\nThis example demonstrates automatic error logging when SQL');
  console.log('translation or execution fails.\n');

  // Create logs directory if it doesn't exist
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // Choose which database to test
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'mysql') {
    try {
      await testMySQLErrorLogging();
    } catch (error) {
      console.error('\nMySQL test failed. Make sure MySQL is running and the connection string is correct.');
      console.error('Error:', error.message);
    }
  }

  if (args.length === 0 || args[0] === 'postgresql') {
    try {
      console.log('\n\n');
      await testPostgreSQLErrorLogging();
    } catch (error) {
      console.error('\nPostgreSQL test failed. Make sure PostgreSQL is running and the connection string is correct.');
      console.error('Error:', error.message);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Example Complete');
  console.log('='.repeat(60));
  console.log('\nCheck the logs/ directory for error logs.');
  console.log('Use "npm run fix-translation-errors -- <database>" to fix errors.\n');
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testMySQLErrorLogging, testPostgreSQLErrorLogging };
