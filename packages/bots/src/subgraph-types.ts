/**
 * @fileoverview TypeScript types for subgraph responses
 */

/**
 * Uniswap V3 / SushiSwap V3 pool from subgraph
 */
export interface UniswapV3PoolSubgraph {
  id: string;
  token0: {
    id: string;
    symbol: string;
    decimals: string;
  };
  token1: {
    id: string;
    symbol: string;
    decimals: string;
  };
  feeTier: string;
  liquidity: string;
  totalValueLockedUSD: string;
  volumeUSD?: string;
}

/**
 * Balancer V2 pool from subgraph
 */
export interface BalancerV2PoolSubgraph {
  id: string;
  poolType: string;
  tokens: Array<{
    address: string;
    symbol: string;
    decimals: number;
    balance: string;
  }>;
  totalLiquidity: string;
  totalSwapVolume?: string;
}

/**
 * Normalized discovered pool (protocol-agnostic)
 */
export interface DiscoveredPool {
  address: string;
  dex: 'uniswap-v3' | 'sushiswap-v3' | 'balancer-v2';
  poolType?: string; // For Balancer: Weighted, Stable, MetaStable, etc.
  token0: {
    address: string;
    symbol: string;
    decimals: number;
  };
  token1: {
    address: string;
    symbol: string;
    decimals: number;
  };
  fee: number; // In basis points (e.g., 3000 = 0.3%)
  liquidity: string; // USD value
  volume24h?: string; // USD value
}

/**
 * Pool discovery configuration
 */
export interface PoolDiscoveryConfig {
  chainId: number;
  minLiquidity: number; // Minimum TVL in USD
  maxPoolsPerDex: number;
  allowedTokens?: string[]; // Token symbols to filter (e.g., ['WETH', 'USDC'])
  trendingTokenCount?: number; // Number of trending tokens to include
  refreshIntervalMs: number;
}

/**
 * Subgraph endpoint configuration
 */
export interface SubgraphEndpoints {
  uniswapV3: string;
  sushiswapV3: string;
  balancerV2: string;
}
