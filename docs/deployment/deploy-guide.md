# Akash Deployment Guide

This comprehensive guide walks you through deploying the Arbitrage Platform on Akash Network from start to finish.

## Table of Contents

1. [Prerequisites Checklist](#prerequisites-checklist)
2. [Building Docker Images](#building-docker-images)
3. [Pushing to Container Registry](#pushing-to-container-registry)
4. [Validating SDL File](#validating-sdl-file)
5. [Creating Deployment](#creating-deployment)
6. [Monitoring Deployment Status](#monitoring-deployment-status)
7. [Updating Deployment](#updating-deployment)
8. [Scaling Services](#scaling-services)
9. [Closing/Canceling Deployment](#closingcanceling-deployment)
10. [Cost Estimation and Bidding](#cost-estimation-and-bidding)

---

## Prerequisites Checklist

Before starting, ensure you have the following:

### Required Software

- [ ] **Akash CLI** installed and configured
- [ ] **Docker** (20.10+) for building images
- [ ] **Git** for version control
- [ ] **Node.js 18+** and npm (for local testing)

### Required Accounts

- [ ] **Akash wallet** with sufficient AKT (minimum 5 AKT recommended)
- [ ] **Container registry account** (Docker Hub, GitHub Container Registry, or other)
- [ ] **RPC provider accounts** (Alchemy, Infura, QuickNode for Ethereum/Arbitrum/Optimism/Base)

### Required Information

- [ ] Wallet address funded with AKT
- [ ] Private keys for bot wallets (one per chain)
- [ ] RPC URLs for each chain
- [ ] WebSocket URLs for each chain

### Verify Prerequisites

~~~bash
# Check Akash CLI
akash version

# Check Docker
docker --version

# Check Node.js
node --version

# Check wallet balance
akash q bank balances $(akash keys show default -a)

# Check environment
echo $AKASH_CHAIN_ID
echo $AKASH_NODE
~~~

---

## Building Docker Images

The platform consists of multiple services. Build each Docker image from the project root.

### Project Structure

~~~
/a0/usr/projects/arbitrage-platform/
├── docker/
│   ├── Dockerfile.api        # API service
│   ├── Dockerfile.bot        # Bot worker (multi-chain)
│   ├── Dockerfile.frontend   # Next.js frontend
│   └── Dockerfile.contracts  # Smart contract deployment
├── packages/
│   ├── api/                  # Fastify API service
│   ├── frontend/             # Next.js web app
│   ├── bots/                 # Bot worker code
│   ├── sdk/                  # Shared SDK
│   └── contracts/            # Solidity contracts
├── docker-compose.yml        # Local development
└── deploy.yaml               # Akash SDL
~~~

### Build All Images

~~~bash
# Navigate to project
cd /a0/usr/projects/arbitrage-platform

# Set version tag
export VERSION="1.0.0"

# Build API service
docker build -f docker/Dockerfile.api -t arbitrageplatform/api:${VERSION} .

# Build Frontend service
docker build -f docker/Dockerfile.frontend -t arbitrageplatform/frontend:${VERSION} .

# Build Bot worker
docker build -f docker/Dockerfile.bot -t arbitrageplatform/bot:${VERSION} .
~~~

### Build Individual Images

#### API Service

~~~bash
docker build -f docker/Dockerfile.api \
  -t arbitrageplatform/api:1.0.0 \
  --build-arg NODE_ENV=production \
  .

# Verify build
docker images | grep arbitrageplatform/api
~~~

#### Frontend Service

~~~bash
docker build -f docker/Dockerfile.frontend \
  -t arbitrageplatform/frontend:1.0.0 \
  --build-arg NEXT_PUBLIC_API_URL=http://api:3001 \
  .

# Verify build
docker images | grep arbitrageplatform/frontend
~~~

#### Bot Worker

~~~bash
docker build -f docker/Dockerfile.bot \
  -t arbitrageplatform/bot:1.0.0 \
  .

# Verify build
docker images | grep arbitrageplatform/bot
~~~

### Test Images Locally

Before pushing to registry, test locally:

~~~bash
# Start dependencies
docker-compose up -d postgres redis

# Test API
docker run -d --name test-api \
  -p 3001:3001 \
  -e DATABASE_URL=postgresql://arbitrage:arbitrage123@host.docker.internal:5432/arbitrage_db \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  arbitrageplatform/api:1.0.0

# Test health endpoint
curl http://localhost:3001/health

# Cleanup
docker stop test-api && docker rm test-api
~~~

---

## Pushing to Container Registry

Choose a container registry and push your images. Akash supports any publicly accessible registry.

### Option 1: Docker Hub

#### Setup

~~~bash
# Login to Docker Hub
docker login

# Your Docker Hub username
export DOCKER_USER="your-username"
export VERSION="1.0.0"
~~~

#### Tag and Push

~~~bash
# Tag images
docker tag arbitrageplatform/api:${VERSION} ${DOCKER_USER}/arbitrage-api:${VERSION}
docker tag arbitrageplatform/frontend:${VERSION} ${DOCKER_USER}/arbitrage-frontend:${VERSION}
docker tag arbitrageplatform/bot:${VERSION} ${DOCKER_USER}/arbitrage-bot:${VERSION}

# Push images
docker push ${DOCKER_USER}/arbitrage-api:${VERSION}
docker push ${DOCKER_USER}/arbitrage-frontend:${VERSION}
docker push ${DOCKER_USER}/arbitrage-bot:${VERSION}
~~~

#### Update deploy.yaml

~~~yaml
services:
  api:
    image: your-username/arbitrage-api:1.0.0
  frontend:
    image: your-username/arbitrage-frontend:1.0.0
  bot-ethereum:
    image: your-username/arbitrage-bot:1.0.0
~~~

### Option 2: GitHub Container Registry (ghcr.io)

#### Setup

~~~bash
# Create GitHub Personal Access Token (PAT) with write:packages scope
export GITHUB_TOKEN="your-github-token"
export GITHUB_USER="your-username"

# Login to ghcr.io
echo $GITHUB_TOKEN | docker login ghcr.io -u $GITHUB_USER --password-stdin

export VERSION="1.0.0"
~~~

#### Tag and Push

~~~bash
# Tag images
docker tag arbitrageplatform/api:${VERSION} ghcr.io/${GITHUB_USER}/arbitrage-api:${VERSION}
docker tag arbitrageplatform/frontend:${VERSION} ghcr.io/${GITHUB_USER}/arbitrage-frontend:${VERSION}
docker tag arbitrageplatform/bot:${VERSION} ghcr.io/${GITHUB_USER}/arbitrage-bot:${VERSION}

# Push images
docker push ghcr.io/${GITHUB_USER}/arbitrage-api:${VERSION}
docker push ghcr.io/${GITHUB_USER}/arbitrage-frontend:${VERSION}
docker push ghcr.io/${GITHUB_USER}/arbitrage-bot:${VERSION}
~~~

#### Update deploy.yaml

~~~yaml
services:
  api:
    image: ghcr.io/your-username/arbitrage-api:1.0.0
  frontend:
    image: ghcr.io/your-username/arbitrage-frontend:1.0.0
  bot-ethereum:
    image: ghcr.io/your-username/arbitrage-bot:1.0.0
~~~

### Option 3: Other Registries

| Registry | URL | Notes |
|----------|-----|-------|
| Quay.io | quay.io | Red Hat's registry |
| Google GCR | gcr.io | Google Cloud |
| AWS ECR | public.ecr.aws | AWS public registry |
| GitLab | registry.gitlab.com | GitLab Container Registry |

### Verify Images Are Accessible

~~~bash
# Pull image to verify it's accessible
docker pull your-username/arbitrage-api:1.0.0

# Or test without pulling
curl -I https://registry.hub.docker.com/v2/repositories/your-username/arbitrage-api/tags/1.0.0/
~~~

### Private Registry (Advanced)

If using private registry, add credentials to deploy.yaml:

~~~yaml
services:
  api:
    image: private-registry.com/arbitrage-api:1.0.0
    credentials:
      registry:
        username: $REGISTRY_USER
        password: $REGISTRY_PASS
~~~

---

## Validating SDL File

The SDL (Stack Definition Language) file defines your deployment. Always validate before deploying.

### SDL Structure Overview

~~~yaml
version: "2.0"

services:
  # Define your services (containers)
  
profiles:
  compute:
    # Define compute resources for each service
  placement:
    # Define placement constraints and pricing
    
deployment:
  # Map services to profiles
~~~

### Validate SDL Syntax

~~~bash
# Validate the SDL file
akash provider manifest validate deploy.yaml

# Expected output:
# Valid SDL file

# If errors occur, fix them before proceeding
~~~

### Common SDL Validation Issues

#### 1. Invalid Image Tag

~~~yaml
# ❌ WRONG - :latest not allowed
image: myapp:latest

# ✅ CORRECT - explicit version
image: myapp:1.0.0
~~~

#### 2. Incorrect CPU Units Format

~~~yaml
# ❌ WRONG - missing units
resources:
  cpu: 0.5

# ✅ CORRECT
resources:
  cpu:
    units: 0.5
~~~

#### 3. Missing Persistent Storage for Database

~~~yaml
# ✅ CORRECT - persistent storage for PostgreSQL
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

### Our deploy.yaml Breakdown

~~~yaml
# 8 services total:
# - frontend: Next.js web app (public)
# - api: Fastify backend (public + internal)
# - bot-ethereum: Ethereum bot worker
# - bot-arbitrum: Arbitrum bot worker  
# - bot-optimism: Optimism bot worker
# - bot-base: Base bot worker
# - postgres: PostgreSQL database (internal only)
# - redis: Redis cache (internal only)

# Total estimated resources:
# - CPU: ~4.75 units
# - Memory: ~4.25 GB
# - Storage: ~26.5 GB (including 20GB persistent for DB)
~~~

---

## Creating Deployment

### Step 1: Set Environment Variables

~~~bash
# Source Akash environment
source ~/akash-env.sh

# Verify settings
echo "Chain ID: $AKASH_CHAIN_ID"
echo "Node: $AKASH_NODE"
echo "Key: $AKASH_KEY_NAME"
~~~

### Step 2: Create Deployment

~~~bash
# Create deployment (creates escrow account)
akash tx deployment create deploy.yaml --from default --gas auto --gas-adjustment 1.5 -y

# Output will include:
# - dseq: Deployment sequence number (IMPORTANT - save this!)
# - events: transaction events
~~~

### Step 3: Capture Deployment ID

~~~bash
# Get your deployment sequence (DSEQ)
export DSEQ=$(akash query deployment list --owner $(akash keys show default -a) --output json | jq -r '.deployments[0].deployment.deployment_id.dseq')

echo "Deployment DSEQ: $DSEQ"

# Save for future reference
echo "export DSEQ=$DSEQ" >> ~/akash-env.sh
~~~

### Step 4: Wait for Bids

After creating deployment, providers will bid on your workload. Wait 1-2 minutes.

~~~bash
# List all bids for your deployment
akash query market bid list \
  --owner $(akash keys show default -a) \
  --dseq $DSEQ \
  --state open

# Output shows:
# - Provider addresses
# - Bid prices
# - Bid states
~~~

### Step 5: Evaluate Bids

~~~bash
# View bids in readable format
akash query market bid list \
  --owner $(akash keys show default -a) \
  --dseq $DSEQ \
  --output json | jq '.bids[] | {provider: .bid.bid_id.provider, price: .bid.price}'
~~~

### Step 6: Accept Bid and Create Lease

~~~bash
# Select a provider (replace with actual provider address)
export PROVIDER="akash1provider-address-here"

# Create lease
akash tx market lease create \
  --owner $(akash keys show default -a) \
  --dseq $DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $PROVIDER \
  --from default \
  --gas auto \
  -y
~~~

### Step 7: Send Manifest

After lease is created, send the manifest to the provider:

~~~bash
# Send manifest
akash provider send-manifest deploy.yaml \
  --dseq $DSEQ \
  --provider $PROVIDER \
  --from default

# Output includes service URIs
~~~

### Step 8: Get Service Endpoints

~~~bash
# Get lease status and endpoints
akash provider lease-status \
  --dseq $DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $PROVIDER \
  --from default

# Output includes:
# - Services status
# - Public URIs for frontend and API
# - Internal service endpoints
~~~

### Quick Deployment Script

~~~bash
#!/bin/bash
# deploy.sh - Complete deployment script

set -e

# Configuration
DEPLOY_FILE="deploy.yaml"
KEY_NAME="default"

# Create deployment
echo "Creating deployment..."
akash tx deployment create $DEPLOY_FILE --from $KEY_NAME --gas auto -y

# Get DSEQ
export DSEQ=$(akash query deployment list --owner $(akash keys show $KEY_NAME -a) --output json | jq -r '.deployments[0].deployment.deployment_id.dseq')
echo "DSEQ: $DSEQ"

# Wait for bids
echo "Waiting 60 seconds for bids..."
sleep 60

# List bids
echo "Available bids:"
akash query market bid list --owner $(akash keys show $KEY_NAME -a) --dseq $DSEQ --state open

# Prompt for provider
echo "Enter provider address:"
read PROVIDER

# Create lease
echo "Creating lease with $PROVIDER..."
akash tx market lease create \
  --owner $(akash keys show $KEY_NAME -a) \
  --dseq $DSEQ --gseq 1 --oseq 1 \
  --provider $PROVIDER \
  --from $KEY_NAME --gas auto -y

# Send manifest
echo "Sending manifest..."
akash provider send-manifest $DEPLOY_FILE \
  --dseq $DSEQ --provider $PROVIDER --from $KEY_NAME

# Get status
echo "Deployment status:"
akash provider lease-status \
  --dseq $DSEQ --gseq 1 --oseq 1 \
  --provider $PROVIDER --from $KEY_NAME

echo "Deployment complete! DSEQ: $DSEQ"
~~~

---

## Monitoring Deployment Status

### Check Deployment State

~~~bash
# Query deployment status
akash query deployment get \
  --owner $(akash keys show default -a) \
  --dseq $DSEQ

# States:
# - active: Deployment is running
# - closed: Deployment is closed
# - inactive: Deployment has insufficient funds
~~~

### Check Lease Status

~~~bash
# List all leases
akash query market lease list \
  --owner $(akash keys show default -a) \
  --dseq $DSEQ

# Get detailed lease status from provider
akash provider lease-status \
  --dseq $DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $PROVIDER \
  --from default
~~~

### Check Service Health

~~~bash
# View logs for specific service
akash provider lease-logs \
  --dseq $DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $PROVIDER \
  --from default \
  --service api

# View frontend logs
akash provider lease-logs \
  --dseq $DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $PROVIDER \
  --from default \
  --service frontend

# View bot logs
akash provider lease-logs \
  --dseq $DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $PROVIDER \
  --from default \
  --service bot-ethereum
~~~

### Check Escrow Balance

~~~bash
# View deployment escrow balance
akash query deployment get \
  --owner $(akash keys show default -a) \
  --dseq $DSEQ \
  --output json | jq '.escrow_account'

# Monitor balance depletion rate
watch -n 60 'akash query deployment get --owner $(akash keys show default -a) --dseq $DSEQ --output json | jq .escrow_account'
~~~

---

## Updating Deployment

### Update Services (New Image)

~~~bash
# Build and push new image
docker build -f docker/Dockerfile.api -t your-username/arbitrage-api:1.0.1 .
docker push your-username/arbitrage-api:1.0.1

# Update deploy.yaml with new tag
sed -i 's/arbitrage-api:1.0.0/arbitrage-api:1.0.1/g' deploy.yaml

# Update deployment
akash tx deployment update deploy.yaml \
  --dseq $DSEQ \
  --from default \
  --gas auto \
  -y

# Send updated manifest
akash provider send-manifest deploy.yaml \
  --dseq $DSEQ \
  --provider $PROVIDER \
  --from default
~~~

### Update Environment Variables

~~~bash
# Edit deploy.yaml to update env vars
nano deploy.yaml

# Apply update
akash tx deployment update deploy.yaml \
  --dseq $DSEQ \
  --from default \
  --gas auto \
  -y

# Send updated manifest
akash provider send-manifest deploy.yaml \
  --dseq $DSEQ \
  --provider $PROVIDER \
  --from default
~~~

### Add More Funds to Escrow

~~~bash
# Deposit additional AKT to deployment escrow
akash tx deployment deposit 5000000uakt \
  --dseq $DSEQ \
  --from default \
  --gas auto \
  -y

# Verify deposit
akash query deployment get \
  --owner $(akash keys show default -a) \
  --dseq $DSEQ
~~~

---

## Scaling Services

### Horizontal Scaling (Multiple Instances)

To run multiple instances of a service:

~~~yaml
# In deploy.yaml, change count
deployment:
  api:
    akash:
      profile: api
      count: 2  # Run 2 API instances
~~~

~~~bash
# Apply update
akash tx deployment update deploy.yaml \
  --dseq $DSEQ \
  --from default \
  --gas auto \
  -y
~~~

### Vertical Scaling (More Resources)

Increase resources in compute profile:

~~~yaml
profiles:
  compute:
    api:
      resources:
        cpu:
          units: 2.0  # Increase from 1.0
        memory:
          size: 2Gi   # Increase from 1Gi
        storage:
          size: 2Gi
~~~

~~~bash
# Apply update
akash tx deployment update deploy.yaml \
  --dseq $DSEQ \
  --from default \
  --gas auto \
  -y
~~~

### Add New Chain Bot

~~~yaml
# Add new bot service in deploy.yaml
services:
  bot-polygon:
    image: arbitrageplatform/bot:1.0.0
    env:
      - CHAIN_ID=137
      - CHAIN_NAME=polygon
      - RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY
      - WS_URL=wss://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY
      - DATABASE_URL=postgresql://arbitrage:arbitrage123@postgres:5432/arbitrage_db
      - REDIS_URL=redis://redis:6379
      - API_URL=http://api:3001
      - NODE_ENV=production
    depends_on:
      - postgres
      - redis
      - api

# Add to profiles
profiles:
  compute:
    bot-polygon:
      resources:
        cpu:
          units: 0.5
        memory:
          size: 512Mi
        storage:
          size: 512Mi

# Add to deployment
deployment:
  bot-polygon:
    akash:
      profile: bot-polygon
      count: 1
~~~

---

## Closing/Canceling Deployment

### Close Deployment Properly

~~~bash
# Close deployment (releases remaining escrow funds)
akash tx deployment close \
  --dseq $DSEQ \
  --from default \
  --gas auto \
  -y

# Verify deployment is closed
akash query deployment get \
  --owner $(akash keys show default -a) \
  --dseq $DSEQ
# State should be "closed"
~~~

### Cancel All Leases

~~~bash
# List active leases
akash query market lease list \
  --owner $(akash keys show default -a) \
  --state active

# Close deployment automatically cancels all leases
# Or manually close individual lease:
akash tx market lease close \
  --dseq $DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $PROVIDER \
  --from default \
  --gas auto \
  -y
~~~

### Verify Funds Returned

~~~bash
# Check wallet balance after closing
akash q bank balances $(akash keys show default -a)

# Remaining escrow should be returned to wallet
~~~

---

## Cost Estimation and Bidding

### Understanding Pricing

Akash uses a bidding system where providers compete for your workload.

#### Price Components

1. **Compute Price**: Cost per block for running services
2. **Storage Price**: Additional cost for persistent storage
3. **Network Egress**: Data transfer costs (usually minimal)

### Estimate Monthly Costs

~~~bash
# Based on our deploy.yaml profiles:
# Estimated costs at typical provider rates

cat << 'EOF'
+------------------+----------+----------+------------------+
| Service          | CPU      | Memory   | Est. Daily (AKT) |
+------------------+----------+----------+------------------+
| Frontend         | 0.5      | 512Mi    | 0.024            |
| API              | 1.0      | 1Gi      | 0.036            |
| Bot-Ethereum     | 0.5      | 512Mi    | 0.024            |
| Bot-Arbitrum     | 0.5      | 512Mi    | 0.024            |
| Bot-Optimism     | 0.5      | 512Mi    | 0.024            |
| Bot-Base         | 0.5      | 512Mi    | 0.024            |
| PostgreSQL       | 0.5      | 512Mi    | 0.036            |
| Redis            | 0.25     | 256Mi    | 0.012            |
+------------------+----------+----------+------------------+
| TOTAL Daily      |          |          | ~0.20 AKT        |
| TOTAL Monthly    |          |          | ~6 AKT           |
+------------------+----------+----------+------------------+
EOF
~~~

### Compare Provider Bids

~~~bash
# List all bids with prices
akash query market bid list \
  --owner $(akash keys show default -a) \
  --dseq $DSEQ \
  --state open \
  --output json | jq '.bids[] | {
    provider: .bid.bid_id.provider,
    price: .bid.price.amount,
    denom: .bid.price.denom
  }' | sort -t: -k2 -n
~~~

### Choosing a Provider

Consider these factors when selecting a provider:

| Factor | What to Check |
|--------|---------------|
| **Price** | Lower price = longer runtime for your deposit |
| **Reputation** | Check provider uptime and reviews |
| **Location** | Closer to target users/exchanges |
| **Attributes** | GPU, high CPU, special capabilities |
| **Uptime** | Historical provider reliability |

~~~bash
# Query provider attributes
akash query provider get <provider-address> --output json | jq '.attributes'
~~~

### Cost Optimization Tips

1. **Right-size resources**: Start small, scale up as needed
2. **Use persistent storage wisely**: Only for data that needs to persist
3. **Monitor escrow balance**: Don't let it run out unexpectedly
4. **Compare bids**: Always check multiple providers
5. **Use testnet first**: Test configurations on testnet to avoid wasting AKT

---

## Quick Reference

### Essential Commands

~~~bash
# Create deployment
akash tx deployment create deploy.yaml --from default -y

# Get DSEQ
export DSEQ=$(akash query deployment list --owner $(akash keys show default -a) --output json | jq -r '.deployments[0].deployment.deployment_id.dseq')

# List bids
akash query market bid list --owner $(akash keys show default -a) --dseq $DSEQ --state open

# Create lease
akash tx market lease create --dseq $DSEQ --gseq 1 --oseq 1 --provider $PROVIDER --from default -y

# Send manifest
akash provider send-manifest deploy.yaml --dseq $DSEQ --provider $PROVIDER --from default

# Check status
akash provider lease-status --dseq $DSEQ --gseq 1 --oseq 1 --provider $PROVIDER --from default

# View logs
akash provider lease-logs --dseq $DSEQ --gseq 1 --oseq 1 --provider $PROVIDER --from default --service api

# Close deployment
akash tx deployment close --dseq $DSEQ --from default -y
~~~

---

## Next Steps

- [Monitoring Guide](monitoring.md) - Set up monitoring and alerts
- [Troubleshooting Guide](troubleshooting.md) - Resolve common issues
- [Akash Setup Guide](akash-setup.md) - CLI and wallet configuration

---

## Additional Resources

- [Akash Documentation](https://docs.akash.network/)
- [Akash SDL Reference](https://docs.akash.network/readme/stack-definition-language)
- [Akash Console (Web UI)](https://console.akash.network/)
- [Akash Provider Directory](https://akash.network/providers/)
