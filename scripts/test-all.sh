#!/bin/bash
# Test runner that runs both Node.js and Deno tests

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "========================================"
echo "Running better-starlite tests"
echo "========================================"

# Track overall status
NODE_STATUS=0
DENO_STATUS=0

# Run Node.js tests with Jest
echo ""
echo "========================================"
echo "Running Node.js tests (Jest)..."
echo "========================================"
if npx jest --passWithNoTests; then
    echo "Node.js tests: PASSED"
else
    NODE_STATUS=$?
    echo "Node.js tests: FAILED"
fi

# Check if Deno is available and run Deno tests
echo ""
echo "========================================"
echo "Running Deno tests..."
echo "========================================"

if command -v deno &> /dev/null; then
    echo "Deno found: $(deno --version | head -1)"

    # Run Deno tests
    if deno test --allow-read --allow-write --allow-net --allow-env test/deno/; then
        echo "Deno tests: PASSED"
    else
        DENO_STATUS=$?
        echo "Deno tests: FAILED"
    fi
else
    echo "Deno not found - skipping Deno tests"
    echo "Install Deno to enable Deno compatibility testing: https://deno.land/#installation"
fi

# Summary
echo ""
echo "========================================"
echo "Test Summary"
echo "========================================"
echo "Node.js (Jest): $([ $NODE_STATUS -eq 0 ] && echo 'PASSED' || echo 'FAILED')"
if command -v deno &> /dev/null; then
    echo "Deno:           $([ $DENO_STATUS -eq 0 ] && echo 'PASSED' || echo 'FAILED')"
else
    echo "Deno:           SKIPPED (not installed)"
fi

# Exit with error if any tests failed
if [ $NODE_STATUS -ne 0 ] || [ $DENO_STATUS -ne 0 ]; then
    exit 1
fi

echo ""
echo "All tests passed!"
