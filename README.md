# Arbitrage Platform

Production-grade multi-chain arbitrage trading platform with autonomous scanning, opportunity detection, and trade execution via flash loans.

## Architecture

```
Frontend (Next.js :3000)  -->  API (Fastify :3001)  -->  Redis + SQLite/Postgres
                                     |
                               Bot Workers
                          (Scanner + Executor)
                                     |
                            Smart Contracts
                       (Aave/Balancer Flash Loans
                        + Uniswap V3 Swaps)
```

## Packages

| Package | Description |
|---------|-------------|
| `packages/sdk` | Core SDK — chain configs, DEX adapters, profit calculator |
| `packages/api` | Fastify API with WebSocket, Redis pub/sub, SQLite DB |
| `packages/bots` | Bot workers — BlockScanner, TransactionExecutor, Strategies |
| `packages/contracts` | Solidity contracts — Arbitrage.sol with flash loans |
| `packages/frontend` | Next.js dashboard for monitoring and control |

## Quick Start (Local Dev)

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set your Alchemy/Infura RPC URLs and private key

# 3. Build all packages
npm run build

# 4. Start Redis (required by API)
docker run -d --name redis -p 6379:6379 redis:alpine

# 5. Start API (port 3001)
cd packages/api && node dist/index.js

# 6. Start Frontend (port 3000)
cd packages/frontend && npm run dev

# 7. Open dashboard
open http://localhost:3000
```

## Sepolia Testnet Setup

### Step 1: Get Sepolia ETH

- Use a faucet: https://sepoliafaucet.com or https://faucets.chain.link/sepolia
- You need ~0.1 SEP ETH for gas + contract deployment

### Step 2: Configure .env

```bash
NETWORK_MODE=testnet
SEPOLIA_RPC=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
SEPOLIA_WS=wss://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
ETH_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
```

### Step 3: Deploy Arbitrage Contract to Sepolia

```bash
cd packages/contracts
npm install
npx hardhat compile          # Compiles 17 Solidity files
npx hardhat run scripts/deploy.js --network sepolia
```

Copy the deployed contract address into `.env`:
```bash
ARBITRAGE_CONTRACT_ADDRESS=0xYOUR_DEPLOYED_ADDRESS
```

### Step 4: Run the Bot on Sepolia

```bash
cd packages/bots

# Monitor-only mode (no private key needed for trades):
CHAIN_ID=11155111 npx tsx src/run.ts

# Full execution mode (needs private key + contract):
CHAIN_ID=11155111 \
SEPOLIA_RPC=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY \
SEPOLIA_WS=wss://eth-sepolia.g.alchemy.com/v2/YOUR_KEY \
ETH_PRIVATE_KEY=0x... \
ARBITRAGE_CONTRACT_ADDRESS=0x... \
npx tsx src/run.ts
```

The bot will:
1. Connect to Sepolia via WebSocket/HTTP
2. Monitor Uniswap V3 and SushiSwap V3 pools for WETH/USDC swaps
3. Detect price differences between DEXes
4. If profitable and executor is configured, execute trades via flash loans

## Mainnet Deployment

### Step 1: Update .env for mainnet

```bash
NETWORK_MODE=mainnet
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
ETH_WS_URL=wss://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
ETH_PRIVATE_KEY=0xYOUR_MAINNET_KEY
```

### Step 2: Deploy contract to mainnet

```bash
cd packages/contracts
npx hardhat run scripts/deploy.js --network mainnet
```

### Step 3: Run mainnet bot

```bash
CHAIN_ID=1 \
ETH_PRIVATE_KEY=0x... \
ARBITRAGE_CONTRACT_ADDRESS=0x... \
npx tsx src/run.ts
```

## Docker Deployment

```bash
# Start infrastructure (Postgres + Redis + API + Frontend)
docker-compose up -d

# Start Sepolia testnet bot
docker-compose --profile testnet up -d

# Start mainnet bots
docker-compose --profile bots up -d
```

## Supported Chains

| Chain | ID | DEXes |
|-------|----|-------|
| **Sepolia Testnet** | 11155111 | Uniswap V3, SushiSwap V3 |
| Ethereum Mainnet | 1 | Uniswap V3, SushiSwap V3 |
| Arbitrum | 42161 | Uniswap V3, SushiSwap V3, Camelot |
| Optimism | 10 | Uniswap V3, Velodrome |
| Base | 8453 | Uniswap V3, Aerodrome |
| Polygon | 137 | Uniswap V3, QuickSwap |
| BSC | 56 | PancakeSwap V3 |
| Avalanche | 43114 | Trader Joe V2 |
| Fantom | 250 | SpookySwap |
| Linea | 59144 | Uniswap V3 |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check + service status |
| GET | `/bots` | List all bots |
| POST | `/bots` | Create a bot |
| GET | `/bots/:id` | Get single bot |
| PUT | `/bots/:id` | Update bot config |
| POST | `/bots/:id/start` | Start a bot |
| POST | `/bots/:id/stop` | Stop a bot |
| DELETE | `/bots/:id` | Delete a bot |
| GET | `/opportunities` | List opportunities (filterable) |
| GET | `/opportunities/stats` | Opportunity statistics |
| GET | `/opportunities/latest` | Last 10 minutes |
| GET | `/opportunities/:id` | Single opportunity |
| GET | `/trades` | Trade history (filterable) |
| GET | `/trades/stats` | Trade statistics |
| GET | `/trades/:id` | Single trade |
| POST | `/trades` | Execute a trade |
| POST | `/trades/:id/cancel` | Cancel pending trade |

## Project Structure

```
arbitrage-platform/
├── packages/
│   ├── api/          # Fastify API (port 3001)
│   ├── bots/         # Bot scanner + executor
│   ├── contracts/    # Solidity contracts (Hardhat + Foundry)
│   ├── frontend/     # Next.js dashboard (port 3000)
│   └── sdk/          # Shared SDK
├── docker/           # Dockerfiles
├── init-db.sql       # PostgreSQL schema
├── docker-compose.yml
└── turbo.json        # Turborepo config
```

## License

MIT
