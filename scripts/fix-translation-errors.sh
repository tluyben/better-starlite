#!/bin/bash

###############################################################################
# SQL Translation Error Fixer
#
# This script reads SQL translation error logs and uses Claude Code to
# automatically create tests, fix the errors, and verify the fixes.
#
# Usage:
#   ./scripts/fix-translation-errors.sh <database>
#
# Example:
#   ./scripts/fix-translation-errors.sh mysql
#   ./scripts/fix-translation-errors.sh postgresql
###############################################################################

set -e

# Check if database parameter is provided
if [ -z "$1" ]; then
  echo "Error: Database name is required"
  echo ""
  echo "Usage: $0 <database>"
  echo ""
  echo "Example:"
  echo "  $0 mysql"
  echo "  $0 postgresql"
  echo "  $0 mssql"
  echo "  $0 oracle"
  exit 1
fi

DATABASE="$1"
LOG_FILE="logs/translate-error-${DATABASE}.log"

# Check if log file exists
if [ ! -f "$LOG_FILE" ]; then
  echo "Error: Log file not found: $LOG_FILE"
  echo ""
  echo "No translation errors have been logged for database: $DATABASE"
  exit 1
fi

# Count the number of errors
ERROR_COUNT=$(wc -l < "$LOG_FILE")

echo "=================================================="
echo "SQL Translation Error Fixer"
echo "=================================================="
echo "Database: $DATABASE"
echo "Log file: $LOG_FILE"
echo "Error count: $ERROR_COUNT"
echo "=================================================="
echo ""

# Read the log file and prepare a summary
echo "Reading error log..."
echo ""

# Create a prompt for Claude Code
PROMPT="I need help fixing SQL translation errors for the ${DATABASE} database.

**Context:**
- This project uses a SQL translation layer to convert SQLite SQL to various databases (MySQL, PostgreSQL, MSSQL, Oracle)
- The translation errors have been logged to: ${LOG_FILE}
- Each line in the log file is a JSON object with error details

**Your task:**
1. Read and analyze all errors in the log file: ${LOG_FILE}
2. For each unique error pattern:
   a. Understand what SQL translation is failing and why
   b. Create a test case in the test suite that reproduces the error
   c. Fix the translation logic in the appropriate plugin or driver
   d. Ensure the test passes
3. Run the entire test suite to ensure no regressions
4. Continue until all errors are fixed and all tests pass at 100%

**Important files:**
- Error log: ${LOG_FILE}
- MySQL driver: src/drivers/mysql-async-driver.ts
- PostgreSQL driver: src/drivers/postgresql-async-driver.ts
- MySQL query plugin: src/drivers/plugins/mysql-query-plugin.ts
- PostgreSQL query plugin: src/drivers/plugins/postgresql-query-plugin.ts
- MySQL schema plugin: src/drivers/plugins/mysql-schema-plugin.ts
- PostgreSQL schema plugin: src/drivers/plugins/postgresql-schema-plugin.ts

**Error Summary:**
$(head -n 10 "$LOG_FILE")

$(if [ "$ERROR_COUNT" -gt 10 ]; then echo "... and $(($ERROR_COUNT - 10)) more errors (see full log at $LOG_FILE)"; fi)

Please start by reading the log file and creating a plan to fix all the errors."

echo "Prompt prepared. You can now run Claude Code with this prompt:"
echo ""
echo "=================================================="
echo "OPTION 1: Copy and paste this command:"
echo "=================================================="
echo ""
echo "claude --dangerously-skip-permissions \"$PROMPT\""
echo ""
echo "=================================================="
echo "OPTION 2: Run Claude Code interactively:"
echo "=================================================="
echo ""
echo "1. Run: claude"
echo "2. Paste the following prompt when asked:"
echo ""
echo "---"
echo "$PROMPT"
echo "---"
echo ""
echo "=================================================="
echo "OPTION 3: Use this script to invoke Claude automatically:"
echo "=================================================="
echo ""

# Check if claude is installed
if command -v claude &> /dev/null; then
  read -p "Do you want to run Claude Code now? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Invoking Claude Code..."
    echo ""
    claude --dangerously-skip-permissions "$PROMPT"
  else
    echo "Skipping automatic invocation. Use one of the options above to run Claude Code manually."
  fi
else
  echo "Claude Code is not installed or not in PATH."
  echo "Please install Claude Code first: https://github.com/anthropics/claude-code"
  echo ""
  echo "After installation, use one of the options above to run the fixer."
fi

echo ""
echo "=================================================="
echo "Done!"
echo "=================================================="
