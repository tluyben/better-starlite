#!/usr/bin/env node

/**
 * Comprehensive Test Runner for better-starlite
 *
 * Runs all test suites and provides a unified report.
 * This ensures that better-starlite works correctly as a drop-in
 * replacement for SQLite across all use cases.
 *
 * Run with: node tests/run-all-tests.js
 * Or: npm test
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Test suite configuration
const TEST_SUITES = [
  {
    name: 'Core Cross-Platform Tests',
    file: 'cross-platform-test.js',
    description: 'Tests basic SQLite operations across platforms',
    required: true,
  },
  {
    name: 'Drizzle ORM Integration',
    file: 'drizzle-integration-test.js',
    description: 'Tests Drizzle ORM compatibility',
    required: false,
  },
  {
    name: 'Prisma Adapter Pattern',
    file: 'prisma-adapter-test.js',
    description: 'Tests Prisma adapter implementation',
    required: false,
  },
  {
    name: 'Stress Tests',
    file: 'stress-test.js',
    description: 'Performance and concurrency tests',
    required: false,
  },
  {
    name: 'Chaos Testing',
    file: 'chaos-testing.js',
    description: 'Error handling and edge cases',
    required: false,
  },
];

// Test results aggregator
const results = {
  suites: [],
  totalPassed: 0,
  totalFailed: 0,
  totalSkipped: 0,
  failedSuites: [],
  startTime: Date.now(),
};

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function printHeader() {
  console.log('\n' + '='.repeat(70));
  console.log(colors.cyan + colors.bright + 'Better-Starlite Comprehensive Test Suite' + colors.reset);
  console.log('='.repeat(70));
  console.log(`\n${colors.dim}Running ${TEST_SUITES.length} test suites...${colors.reset}`);
  console.log(`${colors.dim}RQLite URL: ${process.env.RQLITE_URL || 'http://localhost:4001'}${colors.reset}`);
  console.log(`${colors.dim}Skip RQLite: ${process.env.SKIP_RQLITE || 'false'}${colors.reset}\n`);
}

function runTestSuite(suite) {
  return new Promise((resolve) => {
    const testPath = path.join(__dirname, suite.file);

    // Check if test file exists
    if (!fs.existsSync(testPath)) {
      console.log(`${colors.yellow}⚠️  Skipping ${suite.name}: File not found${colors.reset}`);
      results.suites.push({
        name: suite.name,
        status: 'skipped',
        reason: 'File not found',
      });
      results.totalSkipped++;
      resolve();
      return;
    }

    console.log(`\n${colors.blue}▶ Running: ${suite.name}${colors.reset}`);
    console.log(`  ${colors.dim}${suite.description}${colors.reset}`);
    console.log('  ' + '-'.repeat(50));

    const startTime = Date.now();
    const child = spawn('node', [testPath], {
      env: { ...process.env },
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      process.stderr.write(text);
    });

    child.on('close', (code) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      // Parse test results from output
      const passedMatch = output.match(/✅ Passed: (\d+)/);
      const failedMatch = output.match(/❌ Failed: (\d+)/);
      const skippedMatch = output.match(/⏭️  Skipped: (\d+)/);

      const passed = passedMatch ? parseInt(passedMatch[1]) : 0;
      const failed = failedMatch ? parseInt(failedMatch[1]) : 0;
      const skipped = skippedMatch ? parseInt(skippedMatch[1]) : 0;

      results.totalPassed += passed;
      results.totalFailed += failed;
      results.totalSkipped += skipped;

      const status = code === 0 ? 'passed' : 'failed';

      if (status === 'failed') {
        results.failedSuites.push(suite.name);
      }

      results.suites.push({
        name: suite.name,
        status,
        passed,
        failed,
        skipped,
        duration,
        exitCode: code,
      });

      // Print suite summary
      const statusColor = status === 'passed' ? colors.green : colors.red;
      const statusIcon = status === 'passed' ? '✅' : '❌';

      console.log(`\n  ${statusIcon} ${statusColor}${suite.name}: ${status.toUpperCase()}${colors.reset}`);
      console.log(`     ${colors.dim}Duration: ${duration}s | Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped}${colors.reset}`);

      resolve();
    });

    child.on('error', (error) => {
      console.error(`${colors.red}Error running ${suite.name}:${colors.reset}`, error.message);
      results.suites.push({
        name: suite.name,
        status: 'error',
        error: error.message,
      });
      results.totalFailed++;
      results.failedSuites.push(suite.name);
      resolve();
    });
  });
}

async function runExampleTests() {
  console.log(`\n${colors.blue}▶ Running: Example Validation${colors.reset}`);
  console.log(`  ${colors.dim}Verifying examples work correctly${colors.reset}`);
  console.log('  ' + '-'.repeat(50));

  const examples = [
    'quick-start.js',
    'simple-cross-platform.js',
  ];

  let examplesPassed = 0;
  let examplesFailed = 0;

  for (const example of examples) {
    const examplePath = path.join(__dirname, '..', 'examples', example);

    if (!fs.existsSync(examplePath)) {
      console.log(`  ${colors.yellow}⚠️  ${example}: Not found${colors.reset}`);
      continue;
    }

    try {
      const result = await new Promise((resolve, reject) => {
        const child = spawn('node', [examplePath], {
          env: { ...process.env },
          stdio: ['inherit', 'pipe', 'pipe'],
          timeout: 30000, // 30 second timeout
        });

        let hasError = false;

        child.stdout.on('data', (data) => {
          if (process.env.VERBOSE) {
            process.stdout.write(data);
          }
        });

        child.stderr.on('data', (data) => {
          const text = data.toString();
          if (!text.includes('DeprecationWarning')) {
            hasError = true;
            if (process.env.VERBOSE) {
              process.stderr.write(data);
            }
          }
        });

        child.on('close', (code) => {
          if (code === 0 && !hasError) {
            resolve(true);
          } else {
            reject(new Error(`Exit code: ${code}`));
          }
        });

        child.on('error', reject);
      });

      console.log(`  ✅ ${example}: Passed`);
      examplesPassed++;
    } catch (error) {
      console.log(`  ❌ ${example}: Failed - ${error.message}`);
      examplesFailed++;
    }
  }

  results.suites.push({
    name: 'Example Validation',
    status: examplesFailed === 0 ? 'passed' : 'failed',
    passed: examplesPassed,
    failed: examplesFailed,
  });

  results.totalPassed += examplesPassed;
  results.totalFailed += examplesFailed;
}

function printFinalReport() {
  const duration = ((Date.now() - results.startTime) / 1000).toFixed(2);

  console.log('\n' + '='.repeat(70));
  console.log(colors.bright + 'Test Summary Report' + colors.reset);
  console.log('='.repeat(70));

  // Suite results
  console.log('\n📊 Suite Results:');
  results.suites.forEach(suite => {
    const icon = suite.status === 'passed' ? '✅' :
                 suite.status === 'failed' ? '❌' :
                 suite.status === 'skipped' ? '⏭️' : '⚠️';
    const color = suite.status === 'passed' ? colors.green :
                  suite.status === 'failed' ? colors.red :
                  colors.yellow;

    console.log(`  ${icon} ${color}${suite.name}${colors.reset}`);
    if (suite.passed !== undefined) {
      console.log(`     ${colors.dim}Passed: ${suite.passed} | Failed: ${suite.failed || 0} | Skipped: ${suite.skipped || 0}${colors.reset}`);
    }
    if (suite.reason) {
      console.log(`     ${colors.dim}Reason: ${suite.reason}${colors.reset}`);
    }
  });

  // Overall statistics
  console.log('\n📈 Overall Statistics:');
  console.log(`  Total Test Cases: ${results.totalPassed + results.totalFailed}`);
  console.log(`  ${colors.green}✅ Passed: ${results.totalPassed}${colors.reset}`);
  console.log(`  ${colors.red}❌ Failed: ${results.totalFailed}${colors.reset}`);
  console.log(`  ${colors.yellow}⏭️  Skipped: ${results.totalSkipped}${colors.reset}`);
  console.log(`  ⏱️  Duration: ${duration}s`);

  // Failed suites
  if (results.failedSuites.length > 0) {
    console.log(`\n${colors.red}Failed Suites:${colors.reset}`);
    results.failedSuites.forEach(suite => {
      console.log(`  - ${suite}`);
    });
  }

  // Final status
  const allPassed = results.totalFailed === 0;
  const finalColor = allPassed ? colors.green : colors.red;
  const finalStatus = allPassed ? 'ALL TESTS PASSED ✅' : 'TESTS FAILED ❌';

  console.log('\n' + '='.repeat(70));
  console.log(finalColor + colors.bright + finalStatus + colors.reset);
  console.log('='.repeat(70) + '\n');

  // Recommendations
  if (!allPassed) {
    console.log('📝 Recommendations:');
    console.log('  1. Review failed test output above');
    console.log('  2. Run individual test suites with VERBOSE=true for details');
    console.log('  3. Ensure all dependencies are installed: npm install');
    if (results.failedSuites.some(s => s.includes('RQLite'))) {
      console.log('  4. For RQLite tests: docker run -p 4001:4001 rqlite/rqlite');
    }
    console.log('');
  }

  return allPassed ? 0 : 1;
}

async function main() {
  printHeader();

  // Run core tests sequentially
  for (const suite of TEST_SUITES) {
    await runTestSuite(suite);
  }

  // Run example validation
  await runExampleTests();

  // Print final report and exit
  const exitCode = printFinalReport();
  process.exit(exitCode);
}

// Handle interrupts gracefully
process.on('SIGINT', () => {
  console.log(`\n${colors.yellow}Test run interrupted by user${colors.reset}`);
  process.exit(130);
});

// Run the test suite
if (require.main === module) {
  main().catch(error => {
    console.error(`${colors.red}Fatal error:${colors.reset}`, error);
    process.exit(1);
  });
}

module.exports = { runTestSuite, TEST_SUITES };