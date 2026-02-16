# Deployment Monitoring Guide

This guide covers monitoring your Arbitrage Platform deployment on Akash Network, including viewing logs, checking service health, setting up alerts, and monitoring bot activity.

## Table of Contents

1. [Checking Service Logs](#checking-service-logs)
2. [Viewing Lease Status](#viewing-lease-status)
3. [Monitoring Resource Usage](#monitoring-resource-usage)
4. [Setting Up Alerts](#setting-up-alerts)
5. [Health Check Endpoints](#health-check-endpoints)
6. [Performance Metrics](#performance-metrics)
7. [Database Monitoring](#database-monitoring)
8. [Bot Activity Monitoring](#bot-activity-monitoring)
9. [Recommended Monitoring Tools](#recommended-monitoring-tools)

---

## Checking Service Logs

### Basic Log Commands

~~~bash
# Set environment variables (if not already set)
export DSEQ="your-deployment-sequence"
export PROVIDER="your-provider-address"

# View logs for specific service
akash provider lease-logs \
  --dseq $DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $PROVIDER \
  --from default \
  --service <service-name>
~~~

### Service-Specific Logs

#### API Service Logs

~~~bash
# View API logs
akash provider lease-logs \
  --dseq $DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $PROVIDER \
  --from default \
  --service api

# Expected output includes:
# - Server startup messages
# - Database connection status
# - Incoming API requests
# - Error messages
~~~

#### Frontend Service Logs

~~~bash
# View frontend logs
akash provider lease-logs \
  --dseq $DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $PROVIDER \
  --from default \
  --service frontend

# Look for:
# - Next.js build/start messages
# - SSR rendering logs
# - Static page generation
# - API route calls
~~~

#### Bot Worker Logs

~~~bash
# View Ethereum bot logs
akash provider lease-logs \
  --dseq $DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $PROVIDER \
  --from default \
  --service bot-ethereum

# View Arbitrum bot logs
akash provider lease-logs \
  --dseq $DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $PROVIDER \
  --from default \
  --service bot-arbitrum

# View Optimism bot logs
akash provider lease-logs \
  --dseq $DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $PROVIDER \
  --from default \
  --service bot-optimism

# View Base bot logs
akash provider lease-logs \
  --dseq $DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $PROVIDER \
  --from default \
  --service bot-base

# Look for:
# - "Connected to RPC" - successful connection
# - "Scanning for opportunities" - bot active
# - "Found arbitrage opportunity" - potential profit
# - "Transaction executed" - trade completed
# - Error messages - connection failures, etc.
~~~

#### Database Logs

~~~bash
# View PostgreSQL logs
akash provider lease-logs \
  --dseq $DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $PROVIDER \
  --from default \
  --service postgres

# Look for:
# - Database startup messages
# - Connection events
# - Query errors
# - Checkpoint activity
~~~

### Advanced Log Options

~~~bash
# Follow logs in real-time (tail mode)
akash provider lease-logs \
  --dseq $DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $PROVIDER \
  --from default \
  --service api \
  --follow

# Limit number of lines
akash provider lease-logs \
  --dseq $DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $PROVIDER \
  --from default \
  --service api \
  --tail 100

# Output to file for analysis
akash provider lease-logs \
  --dseq $DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $PROVIDER \
  --from default \
  --service api \
  > logs/api-$(date +%Y%m%d-%H%M%S).log
~~~

### Log Analysis Script

~~~bash
#!/bin/bash
# collect-logs.sh - Collect and save all service logs

DSEQ=$1
PROVIDER=$2
SERVICES="frontend api bot-ethereum bot-arbitrum bot-optimism bot-base postgres redis"

mkdir -p logs/$(date +%Y%m%d)

for service in $SERVICES; do
  echo "Collecting logs for $service..."
  akash provider lease-logs \
    --dseq $DSEQ \
    --gseq 1 \
    --oseq 1 \
    --provider $PROVIDER \
    --from default \
    --service $service \
    > logs/$(date +%Y%m%d)/${service}.log 2>&1
done

echo "Logs collected in logs/$(date +%Y%m%d)/"
~~~

---

## Viewing Lease Status

### Get Lease Information

~~~bash
# List all leases for your deployment
akash query market lease list \
  --owner $(akash keys show default -a) \
  --dseq $DSEQ

# Output includes:
# - Lease ID (provider, dseq, gseq, oseq)
# - State (active, closed, insufficient funds)
# - Price per block
# - Payment information
~~~

### Detailed Provider Status

~~~bash
# Get comprehensive status from provider
akash provider lease-status \
  --dseq $DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $PROVIDER \
  --from default

# Output includes:
# - Service names and status
# - Public endpoints (URIs)
# - Internal service addresses
# - Container health
# - Resource allocation
~~~

### Parse Lease Status (JSON)

~~~bash
# Get status as JSON for parsing
akash provider lease-status \
  --dseq $DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $PROVIDER \
  --from default \
  --output json

# Extract specific information
akash provider lease-status \
  --dseq $DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $PROVIDER \
  --from default \
  --output json | jq '.services[] | {name: .name, status: .status, uris: .uris}'
~~~

### Lease Status Script

~~~bash
#!/bin/bash
# check-status.sh - Check all services status

DSEQ=$1
PROVIDER=$2

echo "=== Deployment Status ==="
echo "DSEQ: $DSEQ"
echo "Provider: $PROVIDER"
echo ""

# Get deployment state
akash query deployment get \
  --owner $(akash keys show default -a) \
  --dseq $DSEQ \
  --output json | jq '{state: .deployment.state, escrow: .escrow_account}'

echo ""
echo "=== Service Status ==="

# Get service status
akash provider lease-status \
  --dseq $DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $PROVIDER \
  --from default \
  --output json | jq '.services[] | "\(.name): \(.status)"'

echo ""
echo "=== Public Endpoints ==="

# Get public URIs
akash provider lease-status \
  --dseq $DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $PROVIDER \
  --from default \
  --output json | jq '.services[] | select(.uris != null) | "\(.name): \(.uris[0])"'
~~~

---

## Monitoring Resource Usage

### Check Escrow Balance

~~~bash
# View deployment escrow balance
akash query deployment get \
  --owner $(akash keys show default -a) \
  --dseq $DSEQ \
  --output json | jq '.escrow_account'

# Output includes:
# - balance: Current remaining balance
# - settled: Amount already paid to providers
# - state: Account state (open, closed, overdrawn)
~~~

### Calculate Burn Rate

~~~bash
#!/bin/bash
# calculate-burn-rate.sh - Estimate daily AKT consumption

DSEQ=$1
PROVIDER=$2

# Get current escrow balance
BALANCE=$(akash query deployment get \
  --owner $(akash keys show default -a) \
  --dseq $DSEQ \
  --output json | jq -r '.escrow_account.balance.amount')

echo "Current Escrow Balance: $BALANCE uakt"
echo "Current Escrow Balance: $(echo "scale=6; $BALANCE / 1000000" | bc) AKT"

# Get lease prices
akash query market lease list \
  --owner $(akash keys show default -a) \
  --dseq $DSEQ \
  --state active \
  --output json | jq '.leases[] | {provider: .lease.lease_id.provider, price: .lease.price}'

# Estimate daily cost (blocks are ~6 seconds, 14400 blocks/day)
echo ""
echo "Note: Daily cost = sum of (price * 14400) for all leases"
~~~

### Monitor Balance Over Time

~~~bash
# Watch escrow balance in real-time
watch -n 300 'akash query deployment get \
  --owner $(akash keys show default -a) \
  --dseq $DSEQ \
  --output json | jq "{balance: .escrow_account.balance.amount, settled: .escrow_account.settled.amount}"'

# Auto-refresh every 5 minutes
~~~

### Resource Allocation Check

~~~bash
# View allocated resources from SDL
akash query deployment get \
  --owner $(akash keys show default -a) \
  --dseq $DSEQ \
  --output json | jq '.groups[].group_spec.resources[] | {cpu: .resources.cpu.units, memory: .resources.memory.size, storage: .resources.storage[].size}'
~~~

---

## Setting Up Alerts

### Simple Alert Script

~~~bash
#!/bin/bash
# health-check.sh - Run via cron for alerts

DSEQ="your-dseq"
PROVIDER="your-provider"
WEBHOOK_URL="https://your-webhook-url"  # Discord, Slack, etc.

# Check deployment state
STATE=$(akash query deployment get \
  --owner $(akash keys show default -a) \
  --dseq $DSEQ \
  --output json | jq -r '.deployment.state')

if [ "$STATE" != "active" ]; then
  curl -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "{\"content\": \"⚠️ Alert: Deployment $DSEQ is $STATE\"}"
fi

# Check escrow balance (alert if below 1 AKT)
BALANCE=$(akash query deployment get \
  --owner $(akash keys show default -a) \
  --dseq $DSEQ \
  --output json | jq -r '.escrow_account.balance.amount')

if [ "$BALANCE" -lt 1000000 ]; then
  curl -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "{\"content\": \"⚠️ Alert: Escrow balance low: $(echo \"scale=6; $BALANCE / 1000000\" | bc) AKT\"}"
fi

# Check each service
SERVICES="frontend api bot-ethereum bot-arbitrum bot-optimism bot-base postgres redis"

for service in $SERVICES; do
  STATUS=$(akash provider lease-status \
    --dseq $DSEQ --gseq 1 --oseq 1 \
    --provider $PROVIDER \
    --from default \
    --output json | jq -r ".services[] | select(.name == \"$service\") | .status")
  
  if [ "$STATUS" != "running" ]; then
    curl -X POST "$WEBHOOK_URL" \
      -H "Content-Type: application/json" \
      -d "{\"content\": \"⚠️ Alert: Service $service is $STATUS\"}"
  fi
done
~~~

### Cron Job Setup

~~~bash
# Edit crontab
crontab -e

# Add health check every 5 minutes
*/5 * * * * /path/to/health-check.sh >> /var/log/akash-monitor.log 2>&1

# Add balance check every hour
0 * * * * /path/to/check-balance.sh >> /var/log/akash-monitor.log 2>&1
~~~

### Discord Webhook Setup

1. Go to Discord Server Settings > Integrations > Webhooks
2. Create new webhook in desired channel
3. Copy webhook URL
4. Use in alert scripts

~~~bash
# Test Discord webhook
curl -X POST "https://discord.com/api/webhooks/..." \
  -H "Content-Type: application/json" \
  -d '{"content": "✅ Akash monitoring configured!"}'
~~~

### Slack Webhook Setup

~~~bash
# Slack webhook format
curl -X POST "https://hooks.slack.com/services/XXX/YYY/ZZZ" \
  -H "Content-Type: application/json" \
  -d '{"text": "✅ Akash monitoring configured!"}'
~~~

---

## Health Check Endpoints

### API Service Health

~~~bash
# Get API endpoint from lease status
API_URI=$(akash provider lease-status \
  --dseq $DSEQ --gseq 1 --oseq 1 \
  --provider $PROVIDER \
  --from default \
  --output json | jq -r '.services[] | select(.name == "api") | .uris[0]')

# Check health endpoint
curl -s https://${API_URI}/health | jq .

# Expected response:
# {
#   "status": "healthy",
#   "database": "connected",
#   "redis": "connected",
#   "timestamp": "2024-01-15T10:30:00Z"
# }
~~~

### Frontend Service Health

~~~bash
# Get frontend endpoint
FRONTEND_URI=$(akash provider lease-status \
  --dseq $DSEQ --gseq 1 --oseq 1 \
  --provider $PROVIDER \
  --from default \
  --output json | jq -r '.services[] | select(.name == "frontend") | .uris[0]')

# Check frontend health
curl -s https://${FRONTEND_URI}/api/health | jq .

# Simple HTTP check
curl -s -o /dev/null -w "%{http_code}" https://${FRONTEND_URI}
# Expected: 200
~~~

### Database Connectivity Check

~~~bash
# Check database is accessible via API
curl -s https://${API_URI}/health/database | jq .

# Expected:
# {
#   "status": "connected",
#   "latency_ms": 5,
#   "version": "PostgreSQL 15.x"
# }
~~~

### Redis Connectivity Check

~~~bash
# Check Redis is accessible via API
curl -s https://${API_URI}/health/redis | jq .

# Expected:
# {
#   "status": "connected",
#   "latency_ms": 1,
#   "memory_used": "10MB",
#   "memory_max": "256MB"
# }
~~~

### Comprehensive Health Check Script

~~~bash
#!/bin/bash
# comprehensive-health.sh

DSEQ=$1
PROVIDER=$2

echo "=== Comprehensive Health Check ==="
echo "Time: $(date)"
echo ""

# Get endpoints
API_URI=$(akash provider lease-status \
  --dseq $DSEQ --gseq 1 --oseq 1 \
  --provider $PROVIDER \
  --from default \
  --output json | jq -r '.services[] | select(.name == "api") | .uris[0]')

FRONTEND_URI=$(akash provider lease-status \
  --dseq $DSEQ --gseq 1 --oseq 1 \
  --provider $PROVIDER \
  --from default \
  --output json | jq -r '.services[] | select(.name == "frontend") | .uris[0]')

echo "API URI: $API_URI"
echo "Frontend URI: $FRONTEND_URI"
echo ""

# API Health
echo "=== API Health ==="
curl -s https://${API_URI}/health | jq .

# Frontend Health
echo ""
echo "=== Frontend Health ==="
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://${FRONTEND_URI})
echo "HTTP Status: $HTTP_CODE"

# Database Health
echo ""
echo "=== Database Health ==="
curl -s https://${API_URI}/health/database | jq .

# Redis Health
echo ""
echo "=== Redis Health ==="
curl -s https://${API_URI}/health/redis | jq .

echo ""
echo "=== Check Complete ==="
~~~

---

## Performance Metrics

### Response Time Monitoring

~~~bash
# Measure API response time
curl -w "Connect: %{time_connect}s\nTTFB: %{time_starttransfer}s\nTotal: %{time_total}s\n" \
  -o /dev/null -s https://${API_URI}/health

# Example output:
# Connect: 0.050s
# TTFB: 0.120s
# Total: 0.125s
~~~

### Throughput Testing

~~~bash
# Simple throughput test with Apache Bench
ab -n 100 -c 10 https://${API_URI}/health

# Or with curl in a loop
for i in {1..100}; do
  curl -s -o /dev/null -w "$i: %{time_total}s\n" https://${API_URI}/health
done
~~~

### Database Performance

~~~bash
# Check query performance via API
# (if you have a stats endpoint)
curl -s https://${API_URI}/stats/database | jq .

# Look for:
# - Query latency
# - Connection pool utilization
# - Slow query count
~~~

### Memory and CPU Metrics

~~~bash
# Get resource usage from lease status
akash provider lease-status \
  --dseq $DSEQ --gseq 1 --oseq 1 \
  --provider $PROVIDER \
  --from default \
  --output json | jq '.services[] | {name: .name, memory: .memory, cpu: .cpu}'
~~~

---

## Database Monitoring

### PostgreSQL Monitoring

#### Via Logs

~~~bash
# Check PostgreSQL logs
akash provider lease-logs \
  --dseq $DSEQ --gseq 1 --oseq 1 \
  --provider $PROVIDER \
  --from default \
  --service postgres | grep -E "ERROR|WARNING|connection"
~~~

#### Via API (if endpoint exists)

~~~bash
# Check database stats
curl -s https://${API_URI}/stats/database | jq .

# Look for:
# - Active connections
# - Query count
# - Cache hit ratio
# - Table sizes
# - Index usage
~~~

#### Common Database Queries

If you can access the database directly (via API debug endpoints):

~~~sql
-- Active connections
SELECT count(*) FROM pg_stat_activity;

-- Table sizes
SELECT schemaname, relname, n_live_tup 
FROM pg_stat_user_tables 
ORDER BY n_live_tup DESC;

-- Slow queries
SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;

-- Cache hit ratio (should be > 99%)
SELECT sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) 
FROM pg_statio_user_tables;
~~~

### Redis Monitoring

#### Via Logs

~~~bash
# Check Redis logs
akash provider lease-logs \
  --dseq $DSEQ --gseq 1 --oseq 1 \
  --provider $PROVIDER \
  --from default \
  --service redis
~~~

#### Via API

~~~bash
# Check Redis stats
curl -s https://${API_URI}/stats/redis | jq .

# Look for:
# - Connected clients
# - Memory usage
# - Hit/miss ratio
# - Key count
~~~

### Database Backup Monitoring

~~~bash
# Check if backups are running (if you have backup logs)
akash provider lease-logs \
  --dseq $DSEQ --gseq 1 --oseq 1 \
  --provider $PROVIDER \
  --from default \
  --service postgres | grep -i backup

# Verify persistent storage is being used
akash query deployment get \
  --owner $(akash keys show default -a) \
  --dseq $DSEQ \
  --output json | jq '.groups[].group_spec.resources[] | select(.storage != null) | .storage'
~~~

---

## Bot Activity Monitoring

### Bot Log Analysis

~~~bash
# Check bot activity
akash provider lease-logs \
  --dseq $DSEQ --gseq 1 --oseq 1 \
  --provider $PROVIDER \
  --from default \
  --service bot-ethereum | grep -E "opportunity|transaction|profit|error"

# Look for these key indicators:
# - "Connected to RPC" - Bot started successfully
# - "Scanning for opportunities" - Bot is actively monitoring
# - "Found opportunity" - Potential profit detected
# - "Executing transaction" - Trade in progress
# - "Transaction successful" - Completed trade
# - "Profit: X" - Actual profit realized
~~~

### Bot Statistics via API

~~~bash
# Get bot stats (if endpoint exists)
curl -s https://${API_URI}/stats/bots | jq .

# Expected output:
# {
#   "bots": [
#     {
#       "chain": "ethereum",
#       "status": "running",
#       "opportunities_found": 150,
#       "trades_executed": 12,
#       "total_profit": "0.5 ETH",
#       "last_activity": "2024-01-15T10:30:00Z"
#     }
#   ]
# }
~~~

### Multi-Chain Bot Status

~~~bash
#!/bin/bash
# check-all-bots.sh

DSEQ=$1
PROVIDER=$2

BOTS="bot-ethereum bot-arbitrum bot-optimism bot-base"

echo "=== Bot Status Report ==="
for bot in $BOTS; do
  echo ""
  echo "--- $bot ---"
  
  # Get last 20 lines of logs
  akash provider lease-logs \
    --dseq $DSEQ --gseq 1 --oseq 1 \
    --provider $PROVIDER \
    --from default \
    --service $bot \
    --tail 20 | grep -E "status|error|opportunity|connected"
done
~~~

### Trade Monitoring

~~~bash
# Monitor recent trades via API
curl -s https://${API_URI}/trades?limit=10 | jq .

# Monitor pending transactions
curl -s https://${API_URI}/trades/pending | jq .

# Check for failed trades
curl -s https://${API_URI}/trades?status=failed | jq .
~~~

### Wallet Balance Monitoring

~~~bash
# Check bot wallet balances (if API endpoint exists)
curl -s https://${API_URI}/wallets/balances | jq .

# Expected:
# {
#   "ethereum": {"address": "0x...", "balance": "1.5 ETH"},
#   "arbitrum": {"address": "0x...", "balance": "2.0 ETH"}
# }
~~~

---

## Recommended Monitoring Tools

### Built-in Monitoring

Akash provides basic monitoring through the CLI. Use the commands above for:
- Service logs
- Lease status
- Resource allocation
- Escrow balance

### External Monitoring Services

#### 1. Uptime Monitoring (UptimeRobot, Pingdom)

~~~bash
# Set up uptime monitoring for public endpoints
# Frontend: https://your-app.example.com
# API: https://your-api.example.com/health

# UptimeRobot API example
curl -X POST "https://api.uptimerobot.com/v2/newMonitor" \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "your-key",
    "friendly_name": "Arbitrage API",
    "url": "https://your-api.example.com/health",
    "type": 1
  }'
~~~

#### 2. Log Aggregation (Optional)

For advanced log analysis, consider:
- **Grafana Loki**: Log aggregation
- **Papertrail**: Cloud log management
- **LogDNA**: Log analysis platform

#### 3. Metrics Collection (Optional)

For detailed metrics:
- **Prometheus**: Metrics collection
- **Grafana**: Visualization dashboards

##### Prometheus Configuration Example

~~~yaml
# prometheus.yml (if running alongside deployment)
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'arbitrage-api'
    metrics_path: /metrics
    static_configs:
      - targets: ['api:3001']
~~~

##### Grafana Dashboard

If using Grafana, create dashboards for:
- API request rate and latency
- Database query performance
- Bot activity metrics
- Wallet balances
- Trade success/failure rates

#### 4. Alert Management (Optional)

- **PagerDuty**: Incident management
- **OpsGenie**: Alert routing
- **Discord/Slack**: Simple notifications (covered above)

### Monitoring Architecture Overview

~~~
┌─────────────────────────────────────────────────────────────┐
│                     Monitoring Stack                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Uptime     │  │    Logs      │  │   Metrics    │       │
│  │  (External)  │  │ (Akash CLI)  │  │  (Optional)  │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│         │                 │                  │              │
│         └────────────────┼──────────────────┘              │
│                          ▼                                  │
│                  ┌──────────────┐                           │
│                  │    Alerts    │                           │
│                  │ (Discord/Slack)│                          │
│                  └──────────────┘                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
~~~

---

## Monitoring Checklist

### Daily Checks

- [ ] Verify all services are running
- [ ] Check escrow balance
- [ ] Review bot activity logs
- [ ] Check for failed transactions

### Weekly Checks

- [ ] Analyze profit/loss trends
- [ ] Review database size and performance
- [ ] Check for RPC endpoint issues
- [ ] Update deployment if needed

### Monthly Checks

- [ ] Review and optimize resource allocation
- [ ] Audit wallet security
- [ ] Backup critical data
- [ ] Update container images if updates available

---

## Related Documentation

- [Troubleshooting Guide](troubleshooting.md)
- [Deployment Guide](deploy-guide.md)
- [Akash Setup Guide](akash-setup.md)

---

## Additional Resources

- [Akash Documentation](https://docs.akash.network/)
- [Akash Monitoring Guide](https://docs.akash.network/guides/monitoring)
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
