#!/usr/bin/env node

/**
 * SQL Translation Error Fixer
 *
 * This script reads SQL translation error logs and uses Claude Code to
 * automatically create tests, fix the errors, and verify the fixes.
 *
 * Usage:
 *   node scripts/fix-translation-errors.js <database>
 *   npm run fix-translation-errors -- <database>
 *
 * Example:
 *   node scripts/fix-translation-errors.js mysql
 *   npm run fix-translation-errors -- postgresql
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Error: Database name is required\n');
  console.error('Usage: node scripts/fix-translation-errors.js <database>\n');
  console.error('Example:');
  console.error('  node scripts/fix-translation-errors.js mysql');
  console.error('  node scripts/fix-translation-errors.js postgresql');
  console.error('  node scripts/fix-translation-errors.js mssql');
  console.error('  node scripts/fix-translation-errors.js oracle');
  process.exit(1);
}

const database = args[0];
const logFile = path.join(process.cwd(), 'logs', `translate-error-${database}.log`);

// Check if log file exists
if (!fs.existsSync(logFile)) {
  console.error(`Error: Log file not found: ${logFile}\n`);
  console.error(`No translation errors have been logged for database: ${database}`);
  process.exit(1);
}

// Read the log file
const logContent = fs.readFileSync(logFile, 'utf-8');
const errorLines = logContent.trim().split('\n').filter(line => line.trim());
const errorCount = errorLines.length;

console.log('==================================================');
console.log('SQL Translation Error Fixer');
console.log('==================================================');
console.log(`Database: ${database}`);
console.log(`Log file: ${logFile}`);
console.log(`Error count: ${errorCount}`);
console.log('==================================================\n');

// Parse and display error summary
console.log('Error Summary:\n');

const errorSummary = errorLines.slice(0, 5).map((line, idx) => {
  try {
    const error = JSON.parse(line);
    return `${idx + 1}. [${error.errorType}] ${error.errorMessage}\n   Original SQL: ${error.originalSQL.substring(0, 80)}${error.originalSQL.length > 80 ? '...' : ''}`;
  } catch {
    return `${idx + 1}. (Unable to parse error)`;
  }
}).join('\n');

console.log(errorSummary);

if (errorCount > 5) {
  console.log(`\n... and ${errorCount - 5} more errors (see full log at ${logFile})`);
}

console.log('\n==================================================');
console.log('Next Steps');
console.log('==================================================\n');

// Create the prompt for Claude Code
const prompt = `I need help fixing SQL translation errors for the ${database} database.

**Context:**
- This project uses a SQL translation layer to convert SQLite SQL to various databases (MySQL, PostgreSQL, MSSQL, Oracle)
- The translation errors have been logged to: ${logFile}
- Each line in the log file is a JSON object with error details

**Your task:**
1. Read and analyze all errors in the log file: ${logFile}
2. For each unique error pattern:
   a. Understand what SQL translation is failing and why
   b. Create a test case in the test suite that reproduces the error
   c. Fix the translation logic in the appropriate plugin or driver
   d. Ensure the test passes
3. Run the entire test suite to ensure no regressions
4. Continue until all errors are fixed and all tests pass at 100%

**Important files:**
- Error log: ${logFile}
- MySQL driver: src/drivers/mysql-async-driver.ts
- PostgreSQL driver: src/drivers/postgresql-async-driver.ts
- MySQL query plugin: src/drivers/plugins/mysql-query-plugin.ts
- PostgreSQL query plugin: src/drivers/plugins/postgresql-query-plugin.ts
- MySQL schema plugin: src/drivers/plugins/mysql-schema-plugin.ts
- PostgreSQL schema plugin: src/drivers/plugins/postgresql-schema-plugin.ts

**Error log preview:**
${errorLines.slice(0, 3).join('\n')}
${errorCount > 3 ? `\n... and ${errorCount - 3} more errors` : ''}

Please start by reading the log file and creating a plan to fix all the errors.`;

console.log('You can now run Claude Code with one of the following options:\n');
console.log('OPTION 1: Copy this command to run Claude Code:');
console.log('--------------------------------------------------');
console.log(`claude --dangerously-skip-permissions "${prompt.replace(/"/g, '\\"')}"`);
console.log('');

console.log('OPTION 2: Save prompt to file and use with Claude Code:');
console.log('--------------------------------------------------');
const promptFile = path.join(process.cwd(), 'logs', `fix-${database}-prompt.txt`);
fs.writeFileSync(promptFile, prompt, 'utf-8');
console.log(`Prompt saved to: ${promptFile}`);
console.log(`Run: claude --dangerously-skip-permissions "$(cat ${promptFile})"`);
console.log('');

console.log('OPTION 3: Run Claude Code interactively:');
console.log('--------------------------------------------------');
console.log('1. Run: claude');
console.log('2. When prompted, paste the following:\n');
console.log(prompt);
console.log('');

// Check if claude command is available
let claudeAvailable = false;
try {
  execSync('command -v claude', { stdio: 'ignore' });
  claudeAvailable = true;
} catch (error) {
  // claude not found
}

if (claudeAvailable) {
  console.log('OPTION 4: Run automatically now:');
  console.log('--------------------------------------------------');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Do you want to run Claude Code now? (y/n) ', (answer) => {
    rl.close();

    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      console.log('\nInvoking Claude Code...\n');

      try {
        // Write prompt to temp file and use it
        const tempPromptFile = path.join(process.cwd(), 'logs', '.temp-prompt.txt');
        fs.writeFileSync(tempPromptFile, prompt, 'utf-8');

        execSync(`claude --dangerously-skip-permissions "$(cat ${tempPromptFile})"`, {
          stdio: 'inherit'
        });

        // Clean up temp file
        fs.unlinkSync(tempPromptFile);
      } catch (error) {
        console.error('\nError running Claude Code:', error.message);
        process.exit(1);
      }
    } else {
      console.log('\nSkipping automatic invocation. Use one of the options above to run Claude Code manually.');
    }

    console.log('\n==================================================');
    console.log('Done!');
    console.log('==================================================');
  });
} else {
  console.log('NOTE: Claude Code CLI not found in PATH');
  console.log('Install it from: https://github.com/anthropics/claude-code');
  console.log('\n==================================================');
  console.log('Done!');
  console.log('==================================================');
}
