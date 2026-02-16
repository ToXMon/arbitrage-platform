# Arbitrage Platform

Production-grade multi-chain arbitrage trading platform with autonomous scanning, opportunity detection, and trade execution.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend Dashboard                        │
│              (Next.js + React + TailwindCSS)                 │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                       API Gateway                            │
│              (Fastify + WebSocket + Redis)                   │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                      Bot Workers                             │
│         (Scanners + Executors + Strategies)                  │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                    Smart Contracts                           │
│        (Arbitrage.sol + Flash Loans + DEX Adapters)         │
└─────────────────────────────────────────────────────────────┘
```

## 📦 Packages

| Package | Description |
|---------|-------------|
| `@arbitrage-platform/sdk` | Core SDK with chain configs, DEX adapters, profit calculator |
| `@arbitrage-platform/api` | Fastify API server with WebSocket support |
| `@arbitrage/bots` | Bot workers with scanner, executor, and trading strategies |
| `@arbitrage-platform/contracts` | Solidity smart contracts for on-chain arbitrage |
| `@arbitrage/frontend` | Next.js dashboard for monitoring and control |

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Build all packages
npm run build

# Start development
npm run dev
```

## 🔧 Supported Chains

- Ethereum Mainnet
- Arbitrum
- Optimism
- Base
- Polygon
- BSC (BNB Chain)
- Avalanche
- Fantom
- Linea

## 🐳 Docker Deployment

```bash
# Start all services
docker-compose up -d

# Start with bot workers
docker-compose --profile bots up -d
```

## 📊 Project Structure

```
arbitrage-platform/
├── packages/
│   ├── api/          # Fastify API server
│   ├── bots/         # Trading bots
│   ├── contracts/    # Smart contracts
│   ├── frontend/     # Next.js dashboard
│   └── sdk/          # Core SDK
├── docker/           # Dockerfiles
├── docker-compose.yml
└── turbo.json        # Turborepo config
```

## 📝 License

MIT
