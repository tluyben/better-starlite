#!/bin/bash
# Deno test runner - runs tests if Deno is available, skips gracefully otherwise

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

if command -v deno &> /dev/null; then
    echo "Deno found: $(deno --version | head -1)"
    echo "Running Deno tests..."
    echo ""

    # Run Deno test files
    deno test --allow-read --allow-write --allow-net --allow-env --allow-ffi test/deno/

    echo ""
    echo "Deno tests completed successfully!"
else
    echo "Deno not installed - skipping Deno tests"
    echo "To enable Deno compatibility testing, install Deno: https://deno.land/#installation"
    echo ""
    echo "Skipping Deno tests (this is OK if you only need Node.js compatibility)"
fi
