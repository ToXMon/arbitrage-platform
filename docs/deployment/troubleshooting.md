# Deployment Troubleshooting Guide

This guide helps you diagnose and resolve common issues when deploying and running the Arbitrage Platform on Akash Network.

## Table of Contents

1. [Quick Debug Checklist](#quick-debug-checklist)
2. [Deployment Won't Start](#deployment-wont-start)
3. [Services Not Connecting](#services-not-connecting)
4. [Database Connection Failures](#database-connection-failures)
5. [Bot Not Executing Trades](#bot-not-executing-trades)
6. [High Resource Usage](#high-resource-usage)
7. [Image Pull Failures](#image-pull-failures)
8. [Persistent Storage Issues](#persistent-storage-issues)
9. [Common Error Messages](#common-error-messages)
10. [Getting Help](#getting-help)

---

## Quick Debug Checklist

Before diving into specific issues, run through this checklist:

### Environment Check

~~~bash
# 1. Verify Akash environment
source ~/akash-env.sh
echo "Chain ID: $AKASH_CHAIN_ID"
echo "Node: $AKASH_NODE"
echo "Key: $AKASH_KEY_NAME"

# 2. Check wallet balance
akash q bank balances $(akash keys show default -a)

# 3. Verify deployment exists
akash q deployment list --owner $(akash keys show default -a)
~~~

### Deployment Health Check

~~~bash
# Set variables
export DSEQ="your-dseq"
export PROVIDER="your-provider"

# 4. Check deployment state
akash q deployment get --owner $(akash keys show default -a) --dseq $DSEQ

# 5. Check lease status
akash q market lease list --owner $(akash keys show default -a) --dseq $DSEQ

# 6. Check service status
akash provider lease-status --dseq $DSEQ --gseq 1 --oseq 1 --provider $PROVIDER --from default

# 7. Check escrow balance
akash q deployment get --owner $(akash keys show default -a) --dseq $DSEQ --output json | jq '.escrow_account'
~~~

### Service Health Check

~~~bash
# 8. Get endpoints
LE STATUS=$(akash provider lease-status --dseq $DSEQ --gseq 1 --oseq 1 --provider $PROVIDER --from default --output json)

API_URI=$(echo "$LEASE_STATUS" | jq -r '.services[] | select(.name == "api") | .uris[0]')
FRONTEND_URI=$(echo "$LEASE_STATUS" | jq -r '.services[] | select(.name == "frontend") | .uris[0]')

# 9. Test API health
curl -s https://${API_URI}/health

# 10. Test frontend
curl -s -o /dev/null -w "%{http_code}" https://${FRONTEND_URI}
~~~

---

## Deployment Won't Start

### SDL Validation Errors

#### Symptom
~~~
Error: invalid SDL: services: missing required field
~~~

#### Causes and Solutions

**1. Missing Required Fields**

~~~yaml
# ❌ WRONG - Missing required fields
services:
  api:
    image: myapi

# ✅ CORRECT - All required fields
services:
  api:
    image: myapi:1.0.0  # Explicit tag required
    expose:
      - port: 3001
        to:
          - global: true
    env:
      - NODE_ENV=production
~~~

**2. Invalid Image Tag Format**

~~~yaml
# ❌ WRONG - :latest is not allowed
image: myapi:latest

# ✅ CORRECT - Explicit version
image: myapi:1.0.0
~~~

**3. Incorrect Compute Resources Format**

~~~yaml
# ❌ WRONG - Flat structure
resources:
  cpu: 0.5
  memory: 512Mi

# ✅ CORRECT - Nested structure
resources:
  cpu:
    units: 0.5
  memory:
    size: 512Mi
  storage:
    size: 1Gi
~~~

**4. Invalid Storage Configuration**

~~~yaml
# ❌ WRONG - Missing attributes for persistent storage
storage:
  size: 20Gi

# ✅ CORRECT - Persistent storage with attributes
storage:
  - name: pgdata
    size: 20Gi
    attributes:
      persistent: true
      class: beta2
~~~

### Validate SDL Before Deploying

~~~bash
# Always validate SDL first
akash provider manifest validate deploy.yaml

# If errors, fix them before creating deployment
~~~

### Insufficient Funds

#### Symptom
~~~
Error: insufficient funds: account balance is 0uakt
~~~

#### Solution

~~~bash
# Check wallet balance
akash q bank balances $(akash keys show default -a)

# Add more AKT to wallet (via exchange or transfer)

# For testnet, use faucet
curl -X POST "https://faucet.sandbox-01.aksh.pw/faucet" \
  -H "Content-Type: application/json" \
  -d '{"address": "'$YOUR_ADDRESS'"}'
~~~

### No Bids Received

#### Symptom
~~~
akash query market bid list --dseq $DSEQ --state open
# Returns empty list
~~~

#### Causes and Solutions

**1. Price Too Low**

~~~yaml
# Increase max price in placement section
profiles:
  placement:
    akash:
      pricing:
        api:
          denom: uakt
          amount: 200  # Increase from 100
~~~

**2. Resource Requirements Too High**

~~~yaml
# Reduce resources if providers can't accommodate
profiles:
  compute:
    api:
      resources:
        cpu:
          units: 0.5  # Reduce from 1.0
        memory:
          size: 512Mi  # Reduce from 1Gi
~~~

**3. Special Hardware Requirements Not Available**

Remove special requirements or find providers that support them.

**4. Wait Longer**

~~~bash
# Sometimes it takes 2-5 minutes for bids to come in
sleep 120
akash query market bid list --dseq $DSEQ --state open
~~~

### Escrow Account Issues

#### Symptom
Deployment shows "inactive" state

#### Solution

~~~bash
# Check escrow balance
akash q deployment get --owner $(akash keys show default -a) --dseq $DSEQ --output json | jq '.escrow_account'

# Add more funds to escrow
akash tx deployment deposit 5000000uakt --dseq $DSEQ --from default -y
~~~

---

## Services Not Connecting

### Service Discovery Issues

#### Symptom
~~~
Error: connect ECONNREFUSED postgres:5432
~~~

#### Causes and Solutions

**1. Wrong Service Name in Connection String**

~~~yaml
# ❌ WRONG - Wrong service name
DATABASE_URL: postgresql://user:pass@database:5432/db

# ✅ CORRECT - Use service name from deploy.yaml
DATABASE_URL: postgresql://user:pass@postgres:5432/db
~~~

**2. Missing Service Expose Configuration**

~~~yaml
# Ensure postgres exposes port to dependent services
services:
  postgres:
    expose:
      - port: 5432
        to:
          - service: api
          - service: bot-ethereum
          - service: bot-arbitrum
~~~

**3. Missing Dependencies**

~~~yaml
# Add dependencies to ensure startup order
services:
  api:
    depends_on:
      - postgres
      - redis
~~~

### Port Configuration Issues

#### Symptom
~~~
Error: Port 3001 already in use
~~~

#### Solution

~~~yaml
# Ensure ports are correctly configured
# Internal ports don't need to be unique
services:
  api:
    expose:
      - port: 3001  # Container port
        to:
          - global: true  # External access
~~~

### Network Policy Issues

#### Symptom
Services can't communicate with each other

#### Solution

~~~yaml
# Check expose configuration for internal services
services:
  postgres:
    expose:
      - port: 5432
        to:
          - service: api
          - service: bot-ethereum
          # List ALL services that need access
~~~

---

## Database Connection Failures

### PostgreSQL Won't Start

#### Symptom
~~~
FATAL: database files are incompatible with server
~~~

#### Solution

~~~bash
# Check PostgreSQL logs
akash provider lease-logs --dseq $DSEQ --gseq 1 --oseq 1 --provider $PROVIDER --from default --service postgres

# Usually caused by version mismatch or corrupted data
# For new deployment, clear persistent storage or use fresh deployment
~~~

### Authentication Failed

#### Symptom
~~~
FATAL: password authentication failed for user "arbitrage"
~~~

#### Causes and Solutions

**1. Mismatched Credentials**

~~~yaml
# Ensure credentials match in all places
services:
  postgres:
    env:
      - POSTGRES_USER=arbitrage
      - POSTGRES_PASSWORD=securepassword123
      - POSTGRES_DB=arbitrage_db
  
  api:
    env:
      - DATABASE_URL=postgresql://arbitrage:securepassword123@postgres:5432/arbitrage_db
      #              ^^^^^^^^ ^^^^^^^^^^^^^^^^
      #              Must match POSTGRES_USER and POSTGRES_PASSWORD
~~~

**2. Special Characters in Password**

~~~bash
# URL-encode special characters in connection string
# ! -> %21  @ -> %40  # -> %23  $ -> %24  % -> %25  & -> %26  * -> %2A

# ❌ WRONG
DATABASE_URL=postgresql://user:p@ssword@postgres:5432/db

# ✅ CORRECT
DATABASE_URL=postgresql://user:p%40ssword@postgres:5432/db
~~~

### Connection Timeout

#### Symptom
~~~
Error: connect ETIMEDOUT postgres:5432
~~~

#### Solution

~~~bash
# Check if postgres is running
akash provider lease-status --dseq $DSEQ --gseq 1 --oseq 1 --provider $PROVIDER --from default --output json | jq '.services[] | select(.name == "postgres")'

# Check postgres logs
akash provider lease-logs --dseq $DSEQ --gseq 1 --oseq 1 --provider $PROVIDER --from default --service postgres

# May need to wait for postgres to fully start (10-30 seconds)
~~~

### Database Not Initialized

#### Symptom
~~~
relation "users" does not exist
~~~

#### Solution

~~~yaml
# Add init script mount (if using docker-compose style init)
# Or ensure API runs migrations on startup
services:
  api:
    env:
      - RUN_MIGRATIONS=true

# Or use init container pattern
~~~

---

## Bot Not Executing Trades

### RPC Connection Issues

#### Symptom
~~~
Error: getaddrinfo ENOTFOUND eth-mainnet.g.alchemy.com
~~~

#### Causes and Solutions

**1. Invalid RPC URL**

~~~bash
# Check bot logs
akash provider lease-logs --dseq $DSEQ --gseq 1 --oseq 1 --provider $PROVIDER --from default --service bot-ethereum | grep -i rpc

# Verify RPC URL in deploy.yaml
services:
  bot-ethereum:
    env:
      - RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
      # Make sure YOUR_API_KEY is replaced with actual key
~~~

**2. Missing API Key**

~~~yaml
# ❌ WRONG - Placeholder still in config
RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# ✅ CORRECT - Actual API key
RPC_URL=https://eth-mainnet.g.alchemy.com/v2/abc123def456...
~~~

**3. RPC Rate Limited**

~~~bash
# Check for rate limit errors in logs
akash provider lease-logs --dseq $DSEQ --gseq 1 --oseq 1 --provider $PROVIDER --from default --service bot-ethereum | grep -i "rate limit\|429"

# Solution: Use higher tier RPC plan or add backup RPC
~~~

### Missing Environment Variables

#### Symptom
~~~
Error: PRIVATE_KEY is not defined
~~~

#### Solution

~~~yaml
# Ensure all required env vars are set
services:
  bot-ethereum:
    env:
      - CHAIN_ID=1
      - CHAIN_NAME=ethereum
      - RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
      - WS_URL=wss://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
      - DATABASE_URL=postgresql://arbitrage:password@postgres:5432/arbitrage_db
      - REDIS_URL=redis://redis:6379
      - API_URL=http://api:3001
      - PRIVATE_KEY=0x...  # Bot wallet private key
      - NODE_ENV=production
~~~

### Insufficient Gas/Gas Price Issues

#### Symptom
~~~
Error: insufficient funds for gas * price + value
~~~

#### Solution

1. **Check bot wallet has ETH**
   - Bot wallet needs ETH for transaction fees
   - Fund the wallet address associated with PRIVATE_KEY

2. **Check gas price settings**
   - High gas prices on Ethereum mainnet can be prohibitive
   - Consider using Layer 2s (Arbitrum, Optimism) for lower costs

### Flashbots Relay Issues (Ethereum)

#### Symptom
~~~
Error: Failed to send bundle to relay
~~~

#### Solution

~~~bash
# Check Flashbots relay URL
# Should be: https://relay.flashbots.net

# Check logs for specific error
akash provider lease-logs --dseq $DSEQ --gseq 1 --oseq 1 --provider $PROVIDER --from default --service bot-ethereum | grep -i flashbots
~~~

### Bot Process Crashes

#### Symptom
Bot container keeps restarting

#### Solution

~~~bash
# Check bot logs for crash reason
akash provider lease-logs --dseq $DSEQ --gseq 1 --oseq 1 --provider $PROVIDER --from default --service bot-ethereum --tail 100

# Common causes:
# 1. Missing dependencies - check npm install ran correctly
# 2. Memory issues - increase memory allocation
# 3. Unhandled exception - check code for missing error handling
~~~

---

## High Resource Usage

### Memory Issues

#### Symptom
~~~
FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory
~~~

#### Solution

~~~yaml
# Increase memory allocation
profiles:
  compute:
    api:
      resources:
        memory:
          size: 2Gi  # Increase from 1Gi

# Or optimize Node.js memory
services:
  api:
    env:
      - NODE_OPTIONS=--max-old-space-size=1536
~~~

### CPU Throttling

#### Symptom
Services are slow, high response times

#### Solution

~~~yaml
# Increase CPU allocation
profiles:
  compute:
    api:
      resources:
        cpu:
          units: 2.0  # Increase from 1.0
~~~

### Storage Full

#### Symptom
~~~
Error: no space left on device
~~~

#### Solution

~~~bash
# Check storage allocation
akash provider lease-status --dseq $DSEQ --gseq 1 --oseq 1 --provider $PROVIDER --from default --output json | jq '.services[] | {name: .name, storage: .storage}'

# Increase storage allocation
profiles:
  compute:
    postgres:
      resources:
        storage:
          - name: pgdata
            size: 50Gi  # Increase from 20Gi
~~~

### Resource Optimization Tips

1. **Right-size services**: Don't over-provision
2. **Use Redis effectively**: Cache frequently accessed data
3. **Optimize database queries**: Add indexes, use connection pooling
4. **Use appropriate bot count**: Only run bots for chains you trade on

---

## Image Pull Failures

### Image Not Found

#### Symptom
~~~
Error: image 'arbitrageplatform/api:1.0.0' not found
~~~

#### Solution

~~~bash
# Verify image exists in registry
docker pull your-username/arbitrage-api:1.0.0

# Check image tag in deploy.yaml matches pushed image
services:
  api:
    image: your-username/arbitrage-api:1.0.0  # Must match exactly
~~~

### Authentication Failed (Private Registry)

#### Symptom
~~~
Error: unauthorized: authentication required
~~~

#### Solution

~~~yaml
# Add credentials for private registry
services:
  api:
    image: private-registry.com/api:1.0.0
    credentials:
      registry:
        username: $REGISTRY_USER
        password: $REGISTRY_PASS
        host: private-registry.com
~~~

### Registry Rate Limited

#### Symptom
~~~
Error: toomanyrequests: You have reached your pull rate limit
~~~

#### Solution

1. **Use authenticated Docker Hub** (higher rate limits)
2. **Use alternative registry** (ghcr.io, quay.io)
3. **Add retry logic** to deployment

---

## Persistent Storage Issues

### Data Loss After Restart

#### Symptom
Database data is gone after container restart

#### Solution

~~~yaml
# Ensure persistent storage is configured correctly
services:
  postgres:
    params:
      storage:
        pgdata:
          mount: /var/lib/postgresql/data
          readOnly: false

profiles:
  compute:
    postgres:
      resources:
        storage:
          - name: pgdata
            size: 20Gi
            attributes:
              persistent: true
              class: beta2
~~~

### Storage Mount Issues

#### Symptom
~~~
Error: mkdir /var/lib/postgresql/data: permission denied
~~~

#### Solution

~~~yaml
# Ensure mount path matches container's expected path
# For PostgreSQL, use /var/lib/postgresql/data

# Also ensure PGDATA is set correctly
services:
  postgres:
    env:
      - PGDATA=/var/lib/postgresql/data/pgdata
    params:
      storage:
        pgdata:
          mount: /var/lib/postgresql/data
~~~

### Storage Class Not Available

#### Symptom
~~~
Error: storage class "beta2" not found
~~~

#### Solution

~~~yaml
# Use default storage class or check available classes
# Try "default" or "beta1" if "beta2" not available
storage:
  - name: pgdata
    size: 20Gi
    attributes:
      persistent: true
      class: beta1  # or "default"
~~~

---

## Common Error Messages

### Blockchain/RPC Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `ETIMEDOUT` | RPC endpoint unreachable | Check URL, use backup RPC |
| `429 Too Many Requests` | Rate limited | Upgrade RPC plan, add delays |
| `invalid API key` | Wrong API key | Verify API key in env vars |
| `nonce too low` | Transaction nonce issue | Reset nonce or use auto |
| `insufficient funds` | Wallet empty | Fund bot wallet with ETH |
| `gas price too low` | Network congestion | Increase max gas price |
| `revert` | Smart contract error | Check contract logic |

### Database Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `ECONNREFUSED` | Database not running | Check postgres service status |
| `password authentication failed` | Wrong credentials | Verify DATABASE_URL matches |
| `relation does not exist` | Table missing | Run migrations |
| `connection pool exhausted` | Too many connections | Increase pool size |
| `deadlock detected` | Concurrent access | Review transaction logic |

### Akash/Deployment Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `insufficient funds` | Low wallet balance | Add AKT to wallet |
| `escrow account closed` | Deployment out of funds | Deposit more AKT |
| `no bids received` | Price too low | Increase max price |
| `manifest invalid` | SDL syntax error | Validate SDL file |
| `lease not found` | Provider offline | Try different provider |

---

## Debug Checklist

### Step-by-Step Debug Process

~~~bash
#!/bin/bash
# debug-deployment.sh - Comprehensive debug script

DSEQ=$1
PROVIDER=$2

echo "=== DEBUG REPORT FOR DEPLOYMENT $DSEQ ==="
echo "Time: $(date)"
echo ""

# 1. Check deployment state
echo "--- Deployment State ---"
akash q deployment get --owner $(akash keys show default -a) --dseq $DSEQ --output json | jq '{
  state: .deployment.state,
  version: .deployment.version,
  created: .deployment.created_at
}'

# 2. Check escrow
echo ""
echo "--- Escrow Balance ---"
akash q deployment get --owner $(akash keys show default -a) --dseq $DSEQ --output json | jq '.escrow_account'

# 3. Check leases
echo ""
echo "--- Leases ---"
akash q market lease list --owner $(akash keys show default -a) --dseq $DSEQ --output json | jq '.leases[] | {
  provider: .lease.lease_id.provider,
  state: .lease.state,
  price: .lease.price
}'

# 4. Check service status
echo ""
echo "--- Service Status ---"
akash provider lease-status --dseq $DSEQ --gseq 1 --oseq 1 --provider $PROVIDER --from default --output json | jq '.services[] | {
  name: .name,
  status: .status,
  uris: .uris
}'

# 5. Check recent logs for each service
SERVICES="api frontend bot-ethereum postgres redis"
for service in $SERVICES; do
  echo ""
  echo "--- $service Logs (last 20 lines) ---"
  akash provider lease-logs --dseq $DSEQ --gseq 1 --oseq 1 --provider $PROVIDER --from default --service $service --tail 20 2>/dev/null || echo "Could not fetch logs"
done

echo ""
echo "=== END DEBUG REPORT ==="
~~~

### Health Check Script

~~~bash
#!/bin/bash
# health-check.sh - Quick health verification

DSEQ=$1
PROVIDER=$2

# Get endpoints
STATUS=$(akash provider lease-status --dseq $DSEQ --gseq 1 --oseq 1 --provider $PROVIDER --from default --output json)
API_URI=$(echo "$STATUS" | jq -r '.services[] | select(.name == "api") | .uris[0]')
FRONTEND_URI=$(echo "$STATUS" | jq -r '.services[] | select(.name == "frontend") | .uris[0]')

echo "API: $API_URI"
echo "Frontend: $FRONTEND_URI"

# Test API
echo -n "API Health: "
if curl -s --max-time 10 https://${API_URI}/health | jq -e '.status == "healthy"' > /dev/null 2>&1; then
  echo "✅ Healthy"
else
  echo "❌ Unhealthy"
fi

# Test Frontend
echo -n "Frontend: "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 https://${FRONTEND_URI})
if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ OK ($HTTP_CODE)"
else
  echo "❌ Error ($HTTP_CODE)"
fi

# Test Database via API
echo -n "Database: "
if curl -s --max-time 10 https://${API_URI}/health/database | jq -e '.status == "connected"' > /dev/null 2>&1; then
  echo "✅ Connected"
else
  echo "❌ Disconnected"
fi

# Test Redis via API
echo -n "Redis: "
if curl -s --max-time 10 https://${API_URI}/health/redis | jq -e '.status == "connected"' > /dev/null 2>&1; then
  echo "✅ Connected"
else
  echo "❌ Disconnected"
fi
~~~

---

## Getting Help

### Akash Resources

1. **Akash Documentation**: https://docs.akash.network/
2. **Akash Discord**: https://discord.gg/akash
   - #deployments channel for deployment help
   - #providers channel for provider issues
   - #developers channel for SDL questions
3. **Akash Forum**: https://forum.akash.network/
4. **Akash GitHub Issues**: https://github.com/akash-network/node/issues

### When Asking for Help

Provide the following information:

~~~bash
# Generate debug info
echo "### Environment ###"
echo "Akash Version: $(akash version)"
echo "Chain ID: $AKASH_CHAIN_ID"
echo "RPC Node: $AKASH_NODE"
echo ""
echo "### Deployment ###"
echo "DSEQ: $DSEQ"
echo "Provider: $PROVIDER"
akash q deployment get --owner $(akash keys show default -a) --dseq $DSEQ --output json | jq '{state: .deployment.state, escrow: .escrow_account.balance}'
echo ""
echo "### Problem ###"
echo "Describe your issue here..."
~~~

### Emergency Recovery

If your deployment is completely broken:

~~~bash
# 1. Close the broken deployment
akash tx deployment close --dseq $DSEQ --from default -y

# 2. Create a new deployment
akash tx deployment create deploy-fixed.yaml --from default -y

# 3. Get new DSEQ and proceed with lease creation
export NEW_DSEQ=$(akash query deployment list --owner $(akash keys show default -a) --output json | jq -r '.deployments[0].deployment.deployment_id.dseq')
~~~

---

## Related Documentation

- [Deployment Guide](deploy-guide.md) - Step-by-step deployment
- [Monitoring Guide](monitoring.md) - Ongoing monitoring
- [Akash Setup Guide](akash-setup.md) - CLI and wallet configuration

---

## Common Quick Fixes

| Problem | Quick Fix |
|---------|----------|
| Deployment inactive | Deposit more AKT to escrow |
| No bids received | Increase max price in SDL |
| Service won't start | Check logs, verify env vars |
| Database connection failed | Verify DATABASE_URL format |
| Bot not trading | Check RPC URL and PRIVATE_KEY |
| High memory usage | Increase memory allocation |
| Image pull failed | Verify image tag exists |
| Lost data on restart | Check persistent storage config |
