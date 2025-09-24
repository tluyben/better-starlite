# Better-Starlite Testing Suite

Comprehensive stress testing and chaos engineering suite for comparing SQLite and rqlite performance and reliability.

## Quick Start

```bash
# Run complete test suite (3 nodes)
./tests/run-comprehensive-test.sh

# Run with 5 nodes for better fault tolerance testing
./tests/run-comprehensive-test.sh --nodes 5

# Run with monitoring (Grafana + Prometheus)
./tests/run-comprehensive-test.sh --monitoring

# Run everything
./tests/run-comprehensive-test.sh --nodes 5 --monitoring
```

## Test Components

### 1. Performance Stress Testing (`tests/stress-test.js`)

Measures and compares:
- **Read/Write latency** (mean, p50, p95, p99)
- **Throughput** (operations per second)
- **Sync vs Async API performance**
- **Consistency level impact** (none, weak, strong)

### 2. Chaos Engineering (`tests/chaos-testing.js`)

Tests fault tolerance by:
- **Node failures**: Killing leader and follower nodes
- **Network partitions**: Simulating network splits
- **Node pausing**: Freezing nodes temporarily
- **Majority failures**: Testing quorum loss scenarios
- **Data integrity verification**: Checksums and consistency checks

### 3. Docker Compose Setup (`docker-compose.stress.yml`)

Provides:
- **Configurable rqlite cluster** (3 or 5 nodes)
- **SQLite test environment**
- **Optional monitoring stack** (Prometheus + Grafana)
- **Health checks and auto-recovery**

## Manual Testing

### Start Environment

```bash
# Start 3-node cluster
docker-compose -f docker-compose.stress.yml up -d

# Start 5-node cluster
docker-compose -f docker-compose.stress.yml --profile 5-nodes up -d

# With monitoring
docker-compose -f docker-compose.stress.yml --profile monitoring up -d
```

### Run Individual Tests

```bash
# Performance test only
docker exec sqlite-stress-app node /app/tests/stress-test.js

# Chaos test only
docker exec sqlite-stress-app node /app/tests/chaos-testing.js
```

### Manual Node Management

```bash
# Kill a node
docker stop rqlite-stress-2

# Pause a node (simulate freeze)
docker pause rqlite-stress-3

# Recover nodes
docker start rqlite-stress-2
docker unpause rqlite-stress-3

# Check cluster status
curl http://localhost:4001/status | jq .
```

## Understanding Results

### Performance Metrics

```
SQLite Performance:
  ASYNC Mode:
    Reads:
      Latency (ms) - Mean: 0.15, P50: 0.12, P95: 0.25, P99: 0.45
      Throughput: 6666.67 ops/sec

rqlite Performance (weak consistency):
  ASYNC Mode:
    Reads:
      Latency (ms) - Mean: 2.34, P50: 2.10, P95: 3.50, P99: 5.20
      Throughput: 427.35 ops/sec
```

**Interpretation:**
- SQLite is ~15x faster for local operations
- rqlite provides distributed fault tolerance at the cost of latency
- Weak consistency offers best balance for most applications

### Chaos Test Results

```
Data Integrity:
  Valid Records: 1847
  Invalid Records: 0
  Missing Records: 153
  Data Loss Rate: 7.65%

Chaos Events:
  Node Failures: 12
  Node Recoveries: 12
  Data Discrepancies: 0
```

**Interpretation:**
- No data corruption (discrepancies = 0) ✅
- Some data loss during majority failures (expected)
- Strong consistency reduces data loss but impacts performance

## Configuration Options

### Environment Variables

```bash
# Stress test configuration
export ITERATIONS=10000        # Number of test iterations
export BATCH_SIZE=100          # Batch operation size
export READ_RATIO=0.7          # 70% reads, 30% writes
export TEST_DURATION=60000     # Test duration in ms

# Run tests with custom config
./tests/run-comprehensive-test.sh
```

### Docker Compose Scaling

```yaml
# Modify docker-compose.stress.yml to adjust:
- Node count (3 or 5 nodes)
- Port mappings
- Volume persistence
- Health check intervals
```

## Monitoring Dashboard

When running with `--monitoring`:

1. **Grafana**: http://localhost:3000 (admin/admin)
2. **Prometheus**: http://localhost:9090

Pre-configured dashboards show:
- Cluster health and node status
- Operation latencies
- Failure rates
- Recovery times

## Test Reports

Reports are saved in `test-reports/` directory:

```
test-reports/
├── stress-test-20240124_143022.log      # Performance test results
├── chaos-test-20240124_143022.log       # Chaos test results
├── summary-20240124_143022.md           # Consolidated summary
└── *.json                                # Detailed JSON reports
```

## Recommendations Based on Testing

### Use SQLite when:
- Single-node deployment
- Maximum performance required
- No high availability needs
- Embedded or edge deployments

### Use rqlite with `weak` consistency when:
- High availability required
- Can tolerate occasional stale reads
- Need automatic failover
- Multi-region deployments

### Use rqlite with `strong` consistency when:
- Data consistency is critical
- Financial/transactional systems
- Can accept higher latencies
- Need linearizable guarantees

## Troubleshooting

### Common Issues

1. **Nodes not starting**: Check Docker logs
   ```bash
   docker logs rqlite-stress-1
   ```

2. **Port conflicts**: Ensure ports 4001-4041 are free
   ```bash
   netstat -tulpn | grep 400
   ```

3. **Build failures**: Rebuild the project
   ```bash
   npm run build
   ```

4. **Cleanup stuck containers**:
   ```bash
   docker-compose -f docker-compose.stress.yml down -v
   ```

## Advanced Usage

### Custom Chaos Scenarios

Edit `tests/chaos-testing.js` to add custom failure scenarios:

```javascript
static async customScenario() {
  // Your chaos logic here
  await DockerChaos.stopNode('rqlite-stress-1');
  await new Promise(r => setTimeout(r, 10000));
  await DockerChaos.startNode('rqlite-stress-1');
}
```

### Performance Profiling

```bash
# Profile with Node.js built-in profiler
node --prof tests/stress-test.js

# Analyze profile
node --prof-process isolate-*.log > profile.txt
```

## Contributing

To add new test scenarios:

1. Add test logic to `stress-test.js` or `chaos-testing.js`
2. Update `run-comprehensive-test.sh` to include new tests
3. Document expected results in this README

## License

MIT