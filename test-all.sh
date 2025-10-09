#!/bin/bash

# Comprehensive test script for better-starlite
# Tests everything in both Node.js and Deno with SQLite and RQLite

set -e  # Exit on error

echo "🚀 Starting comprehensive tests for better-starlite"
echo "=================================================="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Start or restart RQLite container
echo "🐳 Starting RQLite container..."
docker rm -f rqlite-test 2>/dev/null || true
docker run -d --name rqlite-test -p 4001:4001 rqlite/rqlite
echo "⏳ Waiting for RQLite to start..."
sleep 5

# Test RQLite is responding
if curl -s http://localhost:4001/status > /dev/null; then
    echo "✅ RQLite is running"
else
    echo "❌ RQLite failed to start"
    exit 1
fi

echo ""
echo "1️⃣ Running Node.js Tests"
echo "------------------------"
echo ""

# Build TypeScript files for Node.js
echo "📦 Building TypeScript files..."
npx tsc -p tsconfig.node.json

# Run Node.js comprehensive tests
echo "🧪 Running comprehensive test suite in Node.js..."
node test/comprehensive-test.js

echo ""
echo "2️⃣ Running Deno Tests"
echo "---------------------"
echo ""

# Run Deno comprehensive tests
echo "🧪 Running comprehensive test suite in Deno..."
deno run --allow-read --allow-write --allow-net test/comprehensive-test-deno.ts

echo ""
echo "3️⃣ Running Integration Tests"
echo "----------------------------"
echo ""

# Test Node.js async interface
echo "📝 Testing Node.js async interface..."
node test-async-node.js

# Test Deno async interface
echo "📝 Testing Deno async interface..."
deno run --allow-read --allow-write --allow-net test-async-deno.ts

echo ""
echo "=================================================="
echo "✨ All tests completed successfully!"
echo ""
echo "Summary:"
echo "  ✅ Node.js + SQLite: Working"
echo "  ✅ Node.js + RQLite: Working"
echo "  ✅ Deno + SQLite: Working"
echo "  ✅ Deno + RQLite: Working"
echo "  ✅ Async interface: Working in both environments"
echo "  ✅ All operations: Tested and verified"
echo ""
echo "🎉 The library is ready for production use!"

# Cleanup
echo ""
echo "🧹 Cleaning up..."
docker stop rqlite-test >/dev/null 2>&1 || true
docker rm rqlite-test >/dev/null 2>&1 || true
echo "✅ Cleanup complete"