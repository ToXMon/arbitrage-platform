# Arbitrage Platform — Agent Documentation

## Repo Purpose
Production-grade multi-chain arbitrage trading platform with autonomous scanning, opportunity detection, and trade execution via flash loans (Aave/Balancer). Supports 10 chains with multi-DEX pool discovery.

## Tech Stack
- **Monorepo**: Turborepo with npm workspaces
- **SDK** (`packages/sdk`): Chain configs, DEX adapters (Uniswap V3, SushiSwap V3, PancakeSwap V3, Camelot, Velodrome, Aerodrome, QuickSwap, Trader Joe, SpookySwap), profit calculator
- **API** (`packages/api`): Fastify with WebSocket, Redis pub/sub, PostgreSQL via better-sqlite3 (dev) / pg (prod)
- **Bots** (`packages/bots`): BlockScanner, TransactionExecutor, multi-pool scanner, flash loan executor, strategy engine
- **Contracts** (`packages/contracts`): Solidity — Arbitrage.sol with Aave V3 + Balancer flash loans, Hardhat + Foundry
- **Frontend** (`packages/frontend`): Next.js dashboard for monitoring, bot control, trade history

## Module Map

| Package | Purpose | Key Files |
|---------|---------|-----------|
| `packages/sdk/src/chains/` | Chain configs (RPC, DEX addresses, tokens) | ethereum.ts, arbitrum.ts, optimism.ts, base.ts, polygon.ts |
| `packages/sdk/src/dex/` | DEX adapter implementations | UniswapV3.ts, SushiSwap.ts, PancakeSwapV3.ts |
| `packages/sdk/src/utils/` | Shared utilities | priceFetcher.ts, profitCalculator.ts, constants.ts |
| `packages/api/src/routes/` | REST API endpoints | bots.ts, trades.ts, opportunities.ts, health.ts, ws.ts |
| `packages/api/src/services/` | Business logic | bot.ts, trade.ts, opportunity.ts |
| `packages/api/src/db/` | Database layer | schema.ts, index.ts |
| `packages/bots/src/` | Core bot engine | scanner.ts, executor.ts, config.ts, run.ts |
| `packages/bots/src/strategies/` | Trading strategies | uniswap-v3.ts, triangular.ts, base.ts |
| `packages/bots/src/executors/` | Trade execution | flashloan.ts, trade.ts, engine.ts |
| `packages/bots/src/services/` | Pool discovery via subgraphs | pool-discovery.ts |
| `packages/bots/src/monitors/` | Blockchain monitoring | blockchain.ts, manager.ts |
| `packages/contracts/src/` | Solidity smart contracts | Arbitrage.sol, interfaces/ |

## Global Standards

### Type System
- TypeScript strict mode across all packages
- Shared types in each package's `types.ts`
- DEX types in `packages/sdk/src/dex/types.ts`, chain types in `packages/sdk/src/chains/types.ts`

### Architecture Patterns
- **Strategy pattern**: All trading strategies extend `base.ts` in `packages/bots/src/strategies/`
- **Adapter pattern**: DEX implementations follow unified interface in `packages/sdk/src/dex/`
- **Pub/sub**: API uses Redis for real-time opportunity/trade updates to WebSocket clients
- **Multi-pool**: Subgraph-based pool discovery with configurable filters (min liquidity, allowed tokens)

### Database
- Dev: better-sqlite3 (local file)
- Prod: PostgreSQL (via `DATABASE_URL`)
- Schema: `init-db.sql` at repo root

### Security
- Private keys ONLY in `.env` (never committed)
- Flashbots relay for mainnet MEV protection
- Spending limits enforced at smart contract level

## Environment Setup
- `NETWORK_MODE`: `testnet` or `mainnet`
- Chain RPC URLs per chain (Alchemy/Infura)
- `ETH_PRIVATE_KEY` / `ARB_PRIVATE_KEY` for signing
- `ARBITRAGE_CONTRACT_ADDRESS` after deployment
- `DATABASE_URL`, `REDIS_URL` for API
- See `.env.example` for full list (70+ variables)

## Key Commands

```bash
npm run build        # Build all packages
npm run dev          # Dev mode (turbo)
npm run test         # Run all tests
cd packages/contracts && npx hardhat compile  # Compile Solidity
cd packages/contracts && npx hardhat run scripts/deploy.js --network sepolia
```
