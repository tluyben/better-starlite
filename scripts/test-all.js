#!/usr/bin/env node
/**
 * Test runner that runs Node.js, Deno, and Bun tests
 * Reports combined results and exits with appropriate code
 */

const { execSync, spawnSync } = require('child_process');
const path = require('path');

const projectDir = path.dirname(__dirname);
process.chdir(projectDir);

let nodeSuccess = true;
let denoSuccess = true;
let bunSuccess = true;

console.log('========================================');
console.log('Running better-starlite tests');
console.log('========================================');

// Run Node.js tests
console.log('\n========================================');
console.log('Running Node.js tests (Jest)...');
console.log('========================================\n');

try {
  execSync('npx jest --passWithNoTests', { stdio: 'inherit' });
  console.log('\nNode.js tests: PASSED');
} catch (error) {
  nodeSuccess = false;
  console.log('\nNode.js tests: FAILED');
}

// Run Deno tests
console.log('\n========================================');
console.log('Running Deno tests...');
console.log('========================================\n');

try {
  const denoVersion = spawnSync('deno', ['--version'], { encoding: 'utf-8' });
  if (denoVersion.status === 0) {
    console.log(`Deno found: ${denoVersion.stdout.split('\n')[0]}`);
    console.log('Running Deno tests...\n');

    const denoResult = spawnSync('deno', [
      'test',
      '--allow-read',
      '--allow-write',
      '--allow-net',
      '--allow-env',
      '--allow-ffi',
      'test/deno/'
    ], { stdio: 'inherit' });

    if (denoResult.status === 0) {
      console.log('\nDeno tests: PASSED');
    } else {
      denoSuccess = false;
      console.log('\nDeno tests: FAILED');
    }
  } else {
    throw new Error('Deno not found');
  }
} catch (error) {
  console.log('Deno not installed - skipping Deno tests');
  console.log('To enable Deno compatibility testing, install Deno: https://deno.land/#installation');
  console.log('\nSkipping Deno tests (this is OK if you only need Node.js compatibility)');
  denoSuccess = true; // Don't fail if Deno is not installed
}

// Run Bun tests
console.log('\n========================================');
console.log('Running Bun tests...');
console.log('========================================\n');

try {
  const bunVersion = spawnSync('bun', ['--version'], { encoding: 'utf-8' });
  if (bunVersion.status === 0) {
    console.log(`Bun found: ${bunVersion.stdout.trim()}`);
    console.log('Running Bun tests...\n');

    const bunResult = spawnSync('bun', [
      'test',
      'test/bun/'
    ], { stdio: 'inherit' });

    if (bunResult.status === 0) {
      console.log('\nBun tests: PASSED');
    } else {
      bunSuccess = false;
      console.log('\nBun tests: FAILED');
    }
  } else {
    throw new Error('Bun not found');
  }
} catch (error) {
  console.log('Bun not installed - skipping Bun tests');
  console.log('To enable Bun compatibility testing, install Bun: https://bun.sh');
  console.log('\nSkipping Bun tests (this is OK if you only need Node.js compatibility)');
  bunSuccess = true; // Don't fail if Bun is not installed
}

// Summary
console.log('\n========================================');
console.log('Test Summary');
console.log('========================================');
console.log(`Node.js (Jest): ${nodeSuccess ? 'PASSED' : 'FAILED'}`);
console.log(`Deno:           ${denoSuccess ? 'PASSED (or skipped)' : 'FAILED'}`);
console.log(`Bun:            ${bunSuccess ? 'PASSED (or skipped)' : 'FAILED'}`);

if (!nodeSuccess || !denoSuccess || !bunSuccess) {
  console.log('\nSome tests failed!');
  process.exit(1);
}

console.log('\nAll tests passed!');
process.exit(0);
