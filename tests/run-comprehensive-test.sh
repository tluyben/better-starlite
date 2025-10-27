#!/bin/bash

# Comprehensive stress and chaos testing runner script
# This script orchestrates the full testing suite for better-starlite

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.stress.yml"
REPORT_DIR="test-reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Functions
print_header() {
    echo -e "\n${GREEN}========================================${NC}"
    echo -e "${GREEN}$1${NC}"
    echo -e "${GREEN}========================================${NC}\n"
}

print_error() {
    echo -e "${RED}ERROR: $1${NC}" >&2
}

print_warning() {
    echo -e "${YELLOW}WARNING: $1${NC}"
}

cleanup() {
    print_header "Cleaning up..."
    docker-compose -f $COMPOSE_FILE down -v
    exit $1
}

# Trap for cleanup
trap 'cleanup $?' EXIT

# Parse arguments
PROFILE="default"
SKIP_BUILD=false
MONITORING=false
NODES=3

while [[ $# -gt 0 ]]; do
    case $1 in
        --nodes)
            NODES="$2"
            shift 2
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --monitoring)
            MONITORING=true
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --nodes <n>     Number of rqlite nodes (3 or 5, default: 3)"
            echo "  --skip-build    Skip building the project"
            echo "  --monitoring    Enable Prometheus and Grafana monitoring"
            echo "  --help          Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Create report directory
mkdir -p $REPORT_DIR

# Main execution
print_header "Better-Starlite Comprehensive Test Suite"
echo "Configuration:"
echo "  - Nodes: $NODES"
echo "  - Monitoring: $MONITORING"
echo "  - Report Directory: $REPORT_DIR"
echo "  - Timestamp: $TIMESTAMP"

# Step 1: Build the project if needed
if [ "$SKIP_BUILD" = false ]; then
    print_header "Building the project..."
    npm run build
    if [ $? -ne 0 ]; then
        print_error "Build failed!"
        exit 1
    fi
else
    print_warning "Skipping build step (--skip-build flag)"
fi

# Step 2: Start the test environment
print_header "Starting test environment..."

COMPOSE_PROFILES=""
if [ "$NODES" = "5" ]; then
    COMPOSE_PROFILES="--profile 5-nodes"
fi
if [ "$MONITORING" = true ]; then
    COMPOSE_PROFILES="$COMPOSE_PROFILES --profile monitoring"
fi

docker-compose -f $COMPOSE_FILE up -d $COMPOSE_PROFILES

# Wait for services to be healthy
print_header "Waiting for services to be healthy..."
sleep 10

# Verify rqlite cluster health
for i in 1 2 3; do
    PORT=$((4001 + (i-1)*10))
    echo -n "Checking rqlite node $i (port $PORT)... "

    if curl -s http://localhost:$PORT/status > /dev/null 2>&1; then
        echo -e "${GREEN}OK${NC}"
    else
        echo -e "${RED}FAILED${NC}"
        print_error "rqlite node $i is not healthy!"
        exit 1
    fi
done

if [ "$NODES" = "5" ]; then
    for i in 4 5; do
        PORT=$((4001 + (i-1)*10))
        echo -n "Checking rqlite node $i (port $PORT)... "

        if curl -s http://localhost:$PORT/status > /dev/null 2>&1; then
            echo -e "${GREEN}OK${NC}"
        else
            echo -e "${RED}FAILED${NC}"
            print_error "rqlite node $i is not healthy!"
            exit 1
        fi
    done
fi

# Step 3: Run performance stress tests
print_header "Running Performance Stress Tests..."

docker exec sqlite-stress-app sh -c "
    cd /app
    export NODE_ENV=test
    export ITERATIONS=1000
    export BATCH_SIZE=50
    export TEST_DURATION=30000
    node tests/stress-test.js
" | tee $REPORT_DIR/stress-test-$TIMESTAMP.log

if [ ${PIPESTATUS[0]} -ne 0 ]; then
    print_error "Stress tests failed!"
    exit 1
fi

# Step 4: Run chaos engineering tests
print_header "Running Chaos Engineering Tests..."

docker exec sqlite-stress-app sh -c "
    cd /app
    node tests/chaos-testing.js
" | tee $REPORT_DIR/chaos-test-$TIMESTAMP.log

if [ ${PIPESTATUS[0]} -ne 0 ]; then
    print_error "Chaos tests failed!"
    exit 1
fi

# Step 5: Generate consolidated report
print_header "Generating Consolidated Report..."

cat > $REPORT_DIR/summary-$TIMESTAMP.md << EOF
# Better-Starlite Test Report
**Date:** $(date)
**Test Configuration:**
- Nodes: $NODES
- Monitoring: $MONITORING

## Test Results Summary

### Performance Tests
\`\`\`
$(grep -A 20 "PERFORMANCE COMPARISON SUMMARY" $REPORT_DIR/stress-test-$TIMESTAMP.log || echo "Performance summary not found")
\`\`\`

### Chaos Engineering Tests
\`\`\`
$(grep -A 15 "SUMMARY" $REPORT_DIR/chaos-test-$TIMESTAMP.log || echo "Chaos summary not found")
\`\`\`

## Recommendations

Based on the test results:

1. **SQLite** is ideal for:
   - Single-node applications
   - Applications requiring maximum read/write performance
   - Embedded systems with limited network connectivity

2. **rqlite with weak consistency** is ideal for:
   - Distributed applications requiring high availability
   - Applications that can tolerate occasional stale reads
   - Systems where node failures should not cause downtime

3. **rqlite with linearizable consistency** is ideal for:
   - Financial or critical applications
   - Systems requiring strict data consistency
   - Applications where data integrity is more important than performance

## Files Generated
- Stress test log: stress-test-$TIMESTAMP.log
- Chaos test log: chaos-test-$TIMESTAMP.log
- JSON reports: Check tests/ directory

EOF

echo -e "${GREEN}Report saved to: $REPORT_DIR/summary-$TIMESTAMP.md${NC}"

# Step 6: Display monitoring info if enabled
if [ "$MONITORING" = true ]; then
    print_header "Monitoring Services"
    echo "Grafana: http://localhost:3000 (admin/admin)"
    echo "Prometheus: http://localhost:9090"
    echo ""
    echo "Press Ctrl+C to stop the test environment..."

    # Keep running to allow monitoring
    while true; do
        sleep 60
        echo "Test environment running... (Ctrl+C to stop)"
    done
else
    print_header "Test Suite Completed Successfully!"
    echo -e "${GREEN}All tests passed!${NC}"
    echo ""
    echo "Reports saved in: $REPORT_DIR/"
    echo ""
    echo "To view the summary report:"
    echo "  cat $REPORT_DIR/summary-$TIMESTAMP.md"
fi