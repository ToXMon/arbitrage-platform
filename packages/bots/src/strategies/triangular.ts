/**
 * Triangular Arbitrage Strategy
 * Detects arbitrage opportunities through three-token cycles using graph algorithms
 */

import { Logger } from 'pino';
import { ethers } from 'ethers';
import { BaseStrategy, StrategyContext, StrategyResult } from './base';

/**
 * Edge in the token graph representing a trading pair
 */
interface PoolEdge {
  tokenIn: string;
  tokenOut: string;
  fee: number; // Fee in basis points (e.g., 3000 = 0.3%)
  poolAddress: string;
  dex: string;
  liquidity: string;
  // Exchange rate: amountOut = amountIn * rate / SCALE
  rate: bigint;
}

/**
 * Token graph adjacency list
 */
type TokenGraph = Map<string, PoolEdge[]>;

/**
 * Result from cycle detection
 */
interface CycleResult {
  path: `0x${string}`[];
  pools: PoolEdge[];
  finalAmount: bigint;
  profitRatio: number;
}

/**
 * Pool data for building graph
 */
interface PoolData {
  token0: { address: string; decimals: number };
  token1: { address: string; decimals: number };
  fee: number;
  address: string;
  dex: string;
  liquidity: string;
  sqrtPriceX96?: bigint;
}

export class TriangularArbitrageStrategy extends BaseStrategy {
  readonly name = 'triangular-arbitrage';
  readonly description = 'Detects arbitrage through three-token cycles using Bellman-Ford';

  private readonly minProfitUSD = 5;
  private readonly maxGasPriceGwei = 50;
  private readonly MAX_CYCLE_LENGTH = 3;
  private readonly MIN_PROFIT_RATIO = 1.001; // 0.1% minimum profit
  
  // Cache for pool data
  private poolsCache: PoolData[] = [];
  private graphCache: TokenGraph = new Map();
  private lastCacheUpdate: number = 0;
  private readonly CACHE_TTL_MS = 30000; // 30 seconds

  constructor(logger: Logger) {
    super(logger);
  }

  async evaluate(context: StrategyContext): Promise<StrategyResult> {
    const { tokenIn, tokenOut, amountIn, chainId, gasPrice } = context;

    this.logger.debug(
      { tokenIn, tokenOut, amountIn: amountIn.toString(), chainId },
      'Evaluating triangular arbitrage opportunity'
    );

    // Build or refresh the token graph
    await this.refreshGraph(context);

    // Find profitable cycles starting from tokenIn
    const cycles = this.findProfitableCycles(tokenIn, amountIn);

    if (cycles.length === 0) {
      return {
        shouldExecute: false,
        reason: 'No profitable triangular cycles found',
      };
    }

    // Sort by profit ratio (descending)
    cycles.sort((a, b) => b.profitRatio - a.profitRatio);
    const bestCycle = cycles[0];

    const profitUSD = this.calculateProfitUSD(bestCycle.finalAmount, amountIn);

    const meetsThresholds = this.meetsThresholds(
      profitUSD,
      this.minProfitUSD,
      gasPrice,
      this.maxGasPriceGwei
    );

    const result: StrategyResult = {
      shouldExecute: meetsThresholds,
      reason: meetsThresholds
        ? `Profitable triangular arbitrage found: ${bestCycle.path.join(' -> ')}`
        : 'Profit below threshold or gas too high',
    };

    if (meetsThresholds) {
      result.opportunity = {
        strategyName: this.name,
        expectedProfit: bestCycle.finalAmount - amountIn,
        profitUSD,
        route: {
          tokenIn,
          tokenOut,
          amountIn,
          amountOut: bestCycle.finalAmount,
          path: bestCycle.path,
        },
        gasEstimate: this.estimateGasForCycle(bestCycle.path.length),
      };
    }

    this.logEvaluation(context, result);
    return result;
  }

  /**
   * Build token graph from available pools
   */
  private async refreshGraph(context: StrategyContext): Promise<void> {
    const now = Date.now();
    if (now - this.lastCacheUpdate < this.CACHE_TTL_MS && this.graphCache.size > 0) {
      return; // Cache is still valid
    }

    this.logger.debug('Refreshing token graph');

    // Get pools from context or use default major pools
    this.poolsCache = this.getDefaultPools(context.chainId);
    
    // Build adjacency list
    this.graphCache = new Map();
    
    for (const pool of this.poolsCache) {
      // Add edge in both directions
      this.addEdge(pool.token0.address, pool.token1.address, pool, true);
      this.addEdge(pool.token1.address, pool.token0.address, pool, false);
    }

    this.lastCacheUpdate = now;
    this.logger.debug(
      { poolCount: this.poolsCache.length, tokenCount: this.graphCache.size },
      'Token graph built'
    );
  }

  /**
   * Add edge to graph
   */
  private addEdge(
    tokenIn: string,
    tokenOut: string,
    pool: PoolData,
    isToken0ToToken1: boolean
  ): void {
    const normalizedIn = ethers.getAddress(tokenIn);
    const normalizedOut = ethers.getAddress(tokenOut);
    
    if (!this.graphCache.has(normalizedIn)) {
      this.graphCache.set(normalizedIn, []);
    }
    
    const edges = this.graphCache.get(normalizedIn)!;
    
    // Calculate exchange rate from sqrtPriceX96 if available
    // For V3 pools: price = (sqrtPriceX96 / 2^96)^2
    let rate: bigint;
    if (pool.sqrtPriceX96) {
      const Q96 = BigInt(2) ** BigInt(96);
      if (isToken0ToToken1) {
        // token1 per token0 = (sqrtPriceX96 / Q96)^2
        const sqrtPrice = pool.sqrtPriceX96;
        rate = (sqrtPrice * sqrtPrice) / Q96;
      } else {
        // token0 per token1 = Q96^2 / sqrtPriceX96^2
        const sqrtPrice = pool.sqrtPriceX96;
        rate = (Q96 * Q96) / (sqrtPrice * sqrtPrice);
      }
    } else {
      // Default 1:1 rate (should be updated with actual prices)
      rate = BigInt(10 ** 18);
    }
    
    // Apply fee adjustment
    const feeMultiplier = BigInt(10000 - pool.fee);
    rate = (rate * feeMultiplier) / 10000n;
    
    edges.push({
      tokenIn: normalizedIn,
      tokenOut: normalizedOut,
      fee: pool.fee,
      poolAddress: pool.address,
      dex: pool.dex,
      liquidity: pool.liquidity,
      rate,
    });
  }

  /**
   * Find all profitable cycles using DFS
   */
  private findProfitableCycles(
    startToken: `0x${string}`,
    amountIn: bigint
  ): CycleResult[] {
    const results: CycleResult[] = [];
    const startNormalized = ethers.getAddress(startToken);
    
    if (!this.graphCache.has(startNormalized)) {
      return results;
    }

    // DFS to find cycles
    const visited = new Set<string>();
    const path: string[] = [startNormalized];
    const pools: PoolEdge[] = [];
    
    this.dfsFindCycles(
      startNormalized,
      startNormalized,
      amountIn,
      path,
      pools,
      visited,
      results
    );

    // Filter for profitable cycles only
    return results.filter(c => c.profitRatio >= this.MIN_PROFIT_RATIO);
  }

  /**
   * DFS to find cycles of length <= MAX_CYCLE_LENGTH
   */
  private dfsFindCycles(
    current: string,
    start: string,
    currentAmount: bigint,
    path: string[],
    pools: PoolEdge[],
    visited: Set<string>,
    results: CycleResult[]
  ): void {
    // Cycle found
    if (path.length > 1 && current === start) {
      const profitRatio = Number(currentAmount) / Number(path.reduce((acc) => acc, amountIn => amountIn));
      results.push({
        path: path.map(p => p as `0x${string}`),
        pools: [...pools],
        finalAmount: currentAmount,
        profitRatio: Number(currentAmount) / Number(this.getInitialAmount(path[0])),
      });
      return;
    }

    // Stop if path too long
    if (path.length >= this.MAX_CYCLE_LENGTH + 1) {
      // Check if we can return to start
      const edges = this.graphCache.get(current);
      if (edges) {
        for (const edge of edges) {
          if (edge.tokenOut === start && path.length === this.MAX_CYCLE_LENGTH) {
            const nextAmount = this.calculateOutput(currentAmount, edge);
            const finalPath = [...path, start];
            const finalPools = [...pools, edge];
            results.push({
              path: finalPath.map(p => p as `0x${string}`),
              pools: finalPools,
              finalAmount: nextAmount,
              profitRatio: Number(nextAmount) / Number(this.getInitialAmount(start)),
            });
          }
        }
      }
      return;
    }

    // Explore neighbors
    const edges = this.graphCache.get(current);
    if (!edges) return;

    for (const edge of edges) {
      // Skip if already visited (except for returning to start)
      if (visited.has(edge.tokenOut) && edge.tokenOut !== start) {
        continue;
      }

      // Skip going back to start too early
      if (edge.tokenOut === start && path.length < 3) {
        continue;
      }

      visited.add(edge.tokenOut);
      path.push(edge.tokenOut);
      pools.push(edge);

      const nextAmount = this.calculateOutput(currentAmount, edge);
      
      this.dfsFindCycles(
        edge.tokenOut,
        start,
        nextAmount,
        path,
        pools,
        visited,
        results
      );

      // Backtrack
      path.pop();
      pools.pop();
      visited.delete(edge.tokenOut);
    }
  }

  /**
   * Calculate output amount for a trade through a pool
   */
  private calculateOutput(amountIn: bigint, edge: PoolEdge): bigint {
    // Simplified: output = input * rate / SCALE
    // SCALE is 10^18 for our rate calculations
    const SCALE = BigInt(10 ** 18);
    return (amountIn * edge.rate) / SCALE;
  }

  /**
   * Get initial amount (placeholder for starting token)
   */
  private initialAmounts: Map<string, bigint> = new Map();
  
  private getInitialAmount(token: string): bigint {
    if (this.initialAmounts.has(token)) {
      return this.initialAmounts.get(token)!;
    }
    return BigInt(10 ** 18); // Default 1 ETH
  }

  /**
   * Estimate gas for cycle based on path length
   */
  private estimateGasForCycle(pathLength: number): bigint {
    // Base gas per swap ~150k, flash loan overhead ~100k
    const BASE_GAS = 100000n;
    const SWAP_GAS = 150000n;
    return BASE_GAS + (SWAP_GAS * BigInt(pathLength - 1));
  }

  /**
   * Get default major pools for chain
   */
  private getDefaultPools(chainId: number): PoolData[] {
    // Major token addresses by chain
    const WETH: Record<number, string> = {
      1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      42161: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      10: '0x4200000000000000000000000000000000000006',
      137: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      8453: '0x4200000000000000000000000000000000000006',
    };
    
    const USDC: Record<number, string> = {
      1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
      137: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    };
    
    const DAI: Record<number, string> = {
      1: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      42161: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      10: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      137: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
      8453: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    };

    const chainWeth = WETH[chainId] || WETH[1];
    const chainUsdc = USDC[chainId] || USDC[1];
    const chainDai = DAI[chainId] || DAI[1];

    // Default pools for triangular arbitrage
    return [
      // WETH/USDC pools
      {
        token0: { address: chainWeth, decimals: 18 },
        token1: { address: chainUsdc, decimals: 6 },
        fee: 3000,
        address: '0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8', // Example Uniswap V3 pool
        dex: 'uniswap-v3',
        liquidity: '100000000',
        sqrtPriceX96: BigInt('79228162514264337593543950336'), // ~2000 USDC per ETH
      },
      // WETH/DAI pools
      {
        token0: { address: chainWeth, decimals: 18 },
        token1: { address: chainDai, decimals: 18 },
        fee: 3000,
        address: '0xc2e9f25be6257c210d7adf0d4cd6e3e881ba25f8',
        dex: 'uniswap-v3',
        liquidity: '50000000',
        sqrtPriceX96: BigInt('79228162514264337593543950336'),
      },
      // USDC/DAI pools
      {
        token0: { address: chainUsdc, decimals: 6 },
        token1: { address: chainDai, decimals: 18 },
        fee: 500,
        address: '0x5777d92f208679db4b9778590fa3cab3ac9e2168',
        dex: 'uniswap-v3',
        liquidity: '80000000',
        sqrtPriceX96: BigInt('79228162514264337593543950336'), // ~1:1
      },
    ];
  }

  /**
   * Update pool data from external source
   */
  updatePools(pools: PoolData[]): void {
    this.poolsCache = pools;
    this.lastCacheUpdate = 0; // Force refresh
    this.logger.info({ poolCount: pools.length }, 'Pools updated');
  }

  /**
   * Set initial amount for a token (for calculations)
   */
  setInitialAmount(token: string, amount: bigint): void {
    this.initialAmounts.set(ethers.getAddress(token), amount);
  }
}
