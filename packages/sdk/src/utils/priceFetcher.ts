/**
 * Price fetching utilities from multiple DEX sources
 * @module utils/priceFetcher
 */

import type { DexAdapter, QuoteResult, PoolInfo } from '../dex/types';
import type { ChainConfig } from '../chains/types';
import { DEFAULT_FEE_TIERS } from './constants';

/**
 * Price comparison result between DEXes
 */
export interface PriceComparison {
  /** Token pair being compared */
  pair: {
    tokenA: `0x${string}`;
    tokenB: `0x${string}`;
  };
  /** Prices from each DEX */
  prices: DexPrice[];
  /** Best buy price */
  bestBuy: DexPrice | null;
  /** Best sell price */
  bestSell: DexPrice | null;
  /** Price difference in basis points */
  spreadBps: number;
  /** Potential profit indicator */
  hasArbitrageOpportunity: boolean;
}

/**
 * Price from a specific DEX
 */
export interface DexPrice {
  dex: string;
  price: number;
  amountOut: bigint;
  fee: number;
  gasEstimate: bigint;
  timestamp: number;
}

/**
 * Multi-DEX price fetcher
 */
export class PriceFetcher {
  private adapters: DexAdapter[];
  private chain: ChainConfig;

  /**
   * Create new price fetcher
   * @param adapters - Array of DEX adapters to use
   * @param chain - Chain configuration
   */
  constructor(adapters: DexAdapter[], chain: ChainConfig) {
    this.adapters = adapters;
    this.chain = chain;
  }

  /**
   * Fetch prices from all DEXes for a token pair
   * @param tokenA - First token address
   * @param tokenB - Second token address
   * @param amountIn - Amount to quote (in wei)
   * @param feeTiers - Fee tiers to check
   * @returns Array of prices from each DEX
   */
  async fetchPrices(
    tokenA: `0x${string}`,
    tokenB: `0x${string}`,
    amountIn: bigint,
    feeTiers: number[] = DEFAULT_FEE_TIERS
  ): Promise<DexPrice[]> {
    const prices: DexPrice[] = [];
    const timestamp = Date.now();

    // Fetch from each adapter in parallel
    const promises = this.adapters.map(async (adapter) => {
      try {
        // Try each fee tier
        for (const fee of feeTiers) {
          try {
            const quote = await adapter.getQuote(tokenA, tokenB, amountIn, fee);
            
            // Calculate price (tokenB per tokenA)
            const price = Number(quote.amountOut) / Number(amountIn);

            return {
              dex: quote.dex,
              price,
              amountOut: quote.amountOut,
              fee: quote.fee,
              gasEstimate: quote.gasEstimate,
              timestamp,
            } as DexPrice;
          } catch {
            // Try next fee tier
            continue;
          }
        }
        return null;
      } catch (error) {
        return null;
      }
    });

    const results = await Promise.all(promises);
    
    for (const result of results) {
      if (result) {
        prices.push(result);
      }
    }

    return prices;
  }

  /**
   * Compare prices across DEXes for arbitrage opportunity
   * @param tokenA - Token to buy/sell
   * @param tokenB - Token to receive/pay
   * @param amountIn - Amount to trade
   * @returns Price comparison result
   */
  async comparePrices(
    tokenA: `0x${string}`,
    tokenB: `0x${string}`,
    amountIn: bigint
  ): Promise<PriceComparison> {
    // Fetch forward prices (A -> B)
    const forwardPrices = await this.fetchPrices(tokenA, tokenB, amountIn);
    
    // Find best prices
    const sortedByPrice = [...forwardPrices].sort((a, b) => b.price - a.price);
    
    const bestSell = sortedByPrice[0] || null;
    const bestBuy = sortedByPrice[sortedByPrice.length - 1] || null;

    // Calculate spread
    let spreadBps = 0;
    if (bestSell && bestBuy && bestBuy.price > 0) {
      spreadBps = Math.round(((bestSell.price - bestBuy.price) / bestBuy.price) * 10000);
    }

    // Check for arbitrage (spread > typical costs ~0.5%)
    const hasArbitrageOpportunity = spreadBps > 50;

    return {
      pair: { tokenA, tokenB },
      prices: forwardPrices,
      bestBuy,
      bestSell,
      spreadBps,
      hasArbitrageOpportunity,
    };
  }

  /**
   * Fetch pool info from all DEXes
   * @param tokenA - First token address
   * @param tokenB - Second token address
   * @param fee - Fee tier
   * @returns Pool info from each DEX
   */
  async fetchPoolInfos(
    tokenA: `0x${string}`,
    tokenB: `0x${string}`,
    fee: number
  ): Promise<Map<string, PoolInfo>> {
    const poolInfos = new Map<string, PoolInfo>();

    const promises = this.adapters.map(async (adapter) => {
      try {
        const poolInfo = await adapter.getPoolInfo(tokenA, tokenB, fee);
        return { name: adapter.name, info: poolInfo };
      } catch {
        return null;
      }
    });

    const results = await Promise.all(promises);

    for (const result of results) {
      if (result) {
        poolInfos.set(result.name, result.info);
      }
    }

    return poolInfos;
  }

  /**
   * Get amount out across multiple hops
   * @param adapter - DEX adapter to use
   * @param amountIn - Input amount
   * @param path - Token path
   * @param fees - Fee for each hop
   */
  async getAmountsOut(
    adapter: DexAdapter,
    amountIn: bigint,
    path: `0x${string}`[],
    fees: number[]
  ): Promise<bigint> {
    return adapter.getAmountsOut(amountIn, path, fees);
  }

  /**
   * Calculate effective price
   * @param amountIn - Input amount
   * @param amountOut - Output amount
   * @returns Effective price (amountOut / amountIn)
   */
  calculateEffectivePrice(amountIn: bigint, amountOut: bigint): number {
    if (amountIn === BigInt(0)) return 0;
    return Number(amountOut) / Number(amountIn);
  }

  /**
   * Batch fetch prices for multiple pairs
   * @param pairs - Array of token pairs
   * @param amountIn - Amount to quote
   */
  async batchFetchPrices(
    pairs: Array<{ tokenA: `0x${string}`; tokenB: `0x${string}` }>,
    amountIn: bigint
  ): Promise<PriceComparison[]> {
    const promises = pairs.map(({ tokenA, tokenB }) =>
      this.comparePrices(tokenA, tokenB, amountIn)
    );

    return Promise.all(promises);
  }
}

/**
 * Create a price fetcher instance
 * @param adapters - DEX adapters
 * @param chain - Chain configuration
 */
export function createPriceFetcher(
  adapters: DexAdapter[],
  chain: ChainConfig
): PriceFetcher {
  return new PriceFetcher(adapters, chain);
}

export default PriceFetcher;
