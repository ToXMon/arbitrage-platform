/**
 * @fileoverview Pool Discovery Service using The Graph subgraphs
 * Discovers pools across Uniswap V3, SushiSwap V3, and Balancer V2
 */

import { GraphQLClient } from 'graphql-request';
import { logger } from '../index.js';
import type {
  UniswapV3PoolSubgraph,
  BalancerV2PoolSubgraph,
  DiscoveredPool,
  PoolDiscoveryConfig,
  SubgraphEndpoints,
} from '../subgraph-types.js';

/**
 * Subgraph endpoints by chain ID
 */
const SUBGRAPH_ENDPOINTS: Record<number, SubgraphEndpoints> = {
  // Ethereum Mainnet
  1: {
    uniswapV3: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
    sushiswapV3: 'https://api.thegraph.com/subgraphs/name/sushi-v3/v3-ethereum',
    balancerV2: 'https://api.thegraph.com/subgraphs/name/balancer-labs/balancer-v2',
  },
  // Arbitrum
  42161: {
    uniswapV3: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3-arbitrum',
    sushiswapV3: 'https://api.thegraph.com/subgraphs/name/sushi-v3/v3-arbitrum',
    balancerV2: 'https://api.thegraph.com/subgraphs/name/balancer-labs/balancer-arbitrum-v2',
  },
  // Optimism
  10: {
    uniswapV3: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3-optimism',
    sushiswapV3: 'https://api.thegraph.com/subgraphs/name/sushi-v3/v3-optimism',
    balancerV2: 'https://api.thegraph.com/subgraphs/name/balancer-labs/balancer-optimism-v2',
  },
  // Polygon
  137: {
    uniswapV3: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3-polygon',
    sushiswapV3: 'https://api.thegraph.com/subgraphs/name/sushi-v3/v3-polygon',
    balancerV2: 'https://api.thegraph.com/subgraphs/name/balancer-labs/balancer-polygon-v2',
  },
};

/**
 * GraphQL query for Uniswap V3 / SushiSwap V3 pools
 */
const UNISWAP_V3_POOLS_QUERY = `
  query GetPools($minLiquidity: String!, $first: Int!) {
    pools(
      first: $first
      orderBy: totalValueLockedUSD
      orderDirection: desc
      where: { totalValueLockedUSD_gt: $minLiquidity }
    ) {
      id
      token0 {
        id
        symbol
        decimals
      }
      token1 {
        id
        symbol
        decimals
      }
      feeTier
      liquidity
      totalValueLockedUSD
      volumeUSD
    }
  }
`;

/**
 * GraphQL query for Balancer V2 pools
 */
const BALANCER_V2_POOLS_QUERY = `
  query GetPools($minLiquidity: String!, $first: Int!) {
    pools(
      first: $first
      orderBy: totalLiquidity
      orderDirection: desc
      where: { totalLiquidity_gt: $minLiquidity }
    ) {
      id
      poolType
      tokens {
        address
        symbol
        decimals
        balance
      }
      totalLiquidity
      totalSwapVolume
    }
  }
`;

/**
 * Rate limiter for subgraph requests
 */
class RateLimiter {
  private lastRequestTime: number = 0;
  private minIntervalMs: number;

  constructor(requestsPerSecond: number = 1) {
    this.minIntervalMs = 1000 / requestsPerSecond;
  }

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minIntervalMs) {
      const waitTime = this.minIntervalMs - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }
}

/**
 * Cache entry for discovered pools
 */
interface CacheEntry {
  pools: DiscoveredPool[];
  timestamp: number;
}

/**
 * Pool Discovery Service
 */
export class PoolDiscoveryService {
  private config: PoolDiscoveryConfig;
  private clients: {
    uniswapV3: GraphQLClient;
    sushiswapV3: GraphQLClient;
    balancerV2: GraphQLClient;
  };
  private rateLimiter: RateLimiter;
  private cache: Map<string, CacheEntry> = new Map();
  private isRefreshing: boolean = false;

  constructor(config: PoolDiscoveryConfig) {
    this.config = config;
    
    const endpoints = SUBGRAPH_ENDPOINTS[config.chainId];
    if (!endpoints) {
      throw new Error(`Subgraph endpoints not configured for chain ${config.chainId}`);
    }

    // Initialize GraphQL clients
    this.clients = {
      uniswapV3: new GraphQLClient(endpoints.uniswapV3),
      sushiswapV3: new GraphQLClient(endpoints.sushiswapV3),
      balancerV2: new GraphQLClient(endpoints.balancerV2),
    };

    this.rateLimiter = new RateLimiter(1); // 1 request per second

    logger.info(`PoolDiscoveryService initialized for chain ${config.chainId}`);
  }

  /**
   * Discover pools across all DEXes
   */
  async discoverPools(): Promise<DiscoveredPool[]> {
    const cacheKey = 'all-pools';
    const cached = this.cache.get(cacheKey);
    
    // Return cached if still valid
    if (cached && Date.now() - cached.timestamp < this.config.refreshIntervalMs) {
      logger.info(`Returning ${cached.pools.length} cached pools`);
      return cached.pools;
    }

    if (this.isRefreshing) {
      logger.info('Pool refresh already in progress, waiting...');
      await this.waitForRefresh();
      return this.cache.get(cacheKey)?.pools ?? [];
    }

    this.isRefreshing = true;

    try {
      logger.info('Discovering pools from subgraphs...');

      const [uniswapPools, sushiPools, balancerPools] = await Promise.allSettled([
        this.fetchUniswapV3Pools(),
        this.fetchSushiSwapV3Pools(),
        this.fetchBalancerV2Pools(),
      ]);

      const allPools: DiscoveredPool[] = [];

      if (uniswapPools.status === 'fulfilled') {
        allPools.push(...uniswapPools.value);
        logger.info(`Found ${uniswapPools.value.length} Uniswap V3 pools`);
      } else {
        logger.error({ error: uniswapPools.reason }, 'Failed to fetch Uniswap V3 pools');
      }

      if (sushiPools.status === 'fulfilled') {
        allPools.push(...sushiPools.value);
        logger.info(`Found ${sushiPools.value.length} SushiSwap V3 pools`);
      } else {
        logger.error({ error: sushiPools.reason }, 'Failed to fetch SushiSwap V3 pools');
      }

      if (balancerPools.status === 'fulfilled') {
        allPools.push(...balancerPools.value);
        logger.info(`Found ${balancerPools.value.length} Balancer V2 pools`);
      } else {
        logger.error({ error: balancerPools.reason }, 'Failed to fetch Balancer V2 pools');
      }

      // Filter by allowed tokens if specified
      const filteredPools = this.filterByTokens(allPools);

      // Cache the results
      this.cache.set(cacheKey, {
        pools: filteredPools,
        timestamp: Date.now(),
      });

      logger.info(`Total discovered pools: ${filteredPools.length}`);

      return filteredPools;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Fetch Uniswap V3 pools
   */
  private async fetchUniswapV3Pools(): Promise<DiscoveredPool[]> {
    await this.rateLimiter.waitForSlot();

    try {
      const response = await this.clients.uniswapV3.request<{
        pools: UniswapV3PoolSubgraph[];
      }>(UNISWAP_V3_POOLS_QUERY, {
        minLiquidity: this.config.minLiquidity.toString(),
        first: this.config.maxPoolsPerDex,
      });

      return response.pools.map(pool => this.normalizeUniswapV3Pool(pool, 'uniswap-v3'));
    } catch (error) {
      logger.error({ error }, 'Error fetching Uniswap V3 pools');
      throw error;
    }
  }

  /**
   * Fetch SushiSwap V3 pools
   */
  private async fetchSushiSwapV3Pools(): Promise<DiscoveredPool[]> {
    await this.rateLimiter.waitForSlot();

    try {
      const response = await this.clients.sushiswapV3.request<{
        pools: UniswapV3PoolSubgraph[];
      }>(UNISWAP_V3_POOLS_QUERY, {
        minLiquidity: this.config.minLiquidity.toString(),
        first: this.config.maxPoolsPerDex,
      });

      return response.pools.map(pool => this.normalizeUniswapV3Pool(pool, 'sushiswap-v3'));
    } catch (error) {
      logger.error({ error }, 'Error fetching SushiSwap V3 pools');
      throw error;
    }
  }

  /**
   * Fetch Balancer V2 pools
   */
  private async fetchBalancerV2Pools(): Promise<DiscoveredPool[]> {
    await this.rateLimiter.waitForSlot();

    try {
      const response = await this.clients.balancerV2.request<{
        pools: BalancerV2PoolSubgraph[];
      }>(BALANCER_V2_POOLS_QUERY, {
        minLiquidity: this.config.minLiquidity.toString(),
        first: this.config.maxPoolsPerDex,
      });

      // Only process pools with exactly 2 tokens for now
      const twoTokenPools = response.pools.filter(pool => pool.tokens.length === 2);
      
      return twoTokenPools.map(pool => this.normalizeBalancerV2Pool(pool));
    } catch (error) {
      logger.error({ error }, 'Error fetching Balancer V2 pools');
      throw error;
    }
  }

  /**
   * Normalize Uniswap V3 / SushiSwap V3 pool to common format
   */
  private normalizeUniswapV3Pool(
    pool: UniswapV3PoolSubgraph,
    dex: 'uniswap-v3' | 'sushiswap-v3'
  ): DiscoveredPool {
    const normalized: DiscoveredPool = {
      address: pool.id,
      dex,
      token0: {
        address: pool.token0.id,
        symbol: pool.token0.symbol,
        decimals: parseInt(pool.token0.decimals),
      },
      token1: {
        address: pool.token1.id,
        symbol: pool.token1.symbol,
        decimals: parseInt(pool.token1.decimals),
      },
      fee: parseInt(pool.feeTier),
      liquidity: pool.totalValueLockedUSD,
    };
    
    if (pool.volumeUSD !== undefined) {
      normalized.volume24h = pool.volumeUSD;
    }
    
    return normalized;
  }

  /**
   * Normalize Balancer V2 pool to common format
   */
  private normalizeBalancerV2Pool(pool: BalancerV2PoolSubgraph): DiscoveredPool {
    // For Balancer, we need to handle different pool types
    // For now, treat as 2-token pools with 0.3% fee (typical for Balancer)
    const token0 = pool.tokens[0];
    const token1 = pool.tokens[1];
    
    if (!token0 || !token1) {
      throw new Error(`Invalid Balancer pool ${pool.id}: missing tokens`);
    }

    const normalized: DiscoveredPool = {
      address: pool.id,
      dex: 'balancer-v2',
      poolType: pool.poolType,
      token0: {
        address: token0.address,
        symbol: token0.symbol,
        decimals: token0.decimals,
      },
      token1: {
        address: token1.address,
        symbol: token1.symbol,
        decimals: token1.decimals,
      },
      fee: 3000, // Balancer typically uses 0.3% (3000 basis points)
      liquidity: pool.totalLiquidity,
    };
    
    if (pool.totalSwapVolume !== undefined) {
      normalized.volume24h = pool.totalSwapVolume;
    }
    
    return normalized;
  }

  /**
   * Filter pools by allowed tokens
   */
  private filterByTokens(pools: DiscoveredPool[]): DiscoveredPool[] {
    if (!this.config.allowedTokens || this.config.allowedTokens.length === 0) {
      return pools;
    }

    const allowedSet = new Set(this.config.allowedTokens.map(t => t.toUpperCase()));

    return pools.filter(pool => {
      const token0Match = allowedSet.has(pool.token0.symbol.toUpperCase());
      const token1Match = allowedSet.has(pool.token1.symbol.toUpperCase());
      
      // Include pool if at least one token is in the allowed list
      return token0Match || token1Match;
    });
  }

  /**
   * Wait for ongoing refresh to complete
   */
  private async waitForRefresh(): Promise<void> {
    while (this.isRefreshing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('Pool discovery cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: Array<{ key: string; age: number }> } {
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      age: Date.now() - entry.timestamp,
    }));

    return {
      size: this.cache.size,
      entries,
    };
  }
}
