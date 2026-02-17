/**
 * Uniswap V3 Arbitrage Strategy
 * Uses proper concentrated liquidity math with tick-based calculations
 */

import { Logger } from 'pino';
import { ethers } from 'ethers';
import { BaseStrategy, StrategyContext, StrategyResult } from './base';

/**
 * Uniswap V3 constants
 */
const Q96 = BigInt(2) ** BigInt(96); // 2^96 for sqrtPriceX96 calculations
const Q128 = BigInt(2) ** BigInt(128); // 2^128 for liquidity calculations
const MIN_TICK = -887272;
const MAX_TICK = 887272;

/**
 * Tick spacing by fee tier
 */
const TICK_SPACING: Record<number, number> = {
  100: 1,    // 0.01%
  500: 10,   // 0.05%
  3000: 60,  // 0.3%
  10000: 200, // 1%
};

/**
 * Pool state for V3 calculations
 */
interface V3PoolState {
  sqrtPriceX96: bigint;
  liquidity: bigint;
  tick: number;
  fee: number;
}

/**
 * Result from V3 swap calculation
 */
interface V3SwapResult {
  amountOut: bigint;
  sqrtPriceX96After: bigint;
  tickAfter: number;
  gasEstimate: bigint;
}

/**
 * Extended context for V3 pools
 */
interface V3StrategyContext extends StrategyContext {
  sqrtPriceX96?: bigint;
  liquidity?: bigint;
  tick?: number;
  feeTier?: number;
}

export class UniswapV3ArbitrageStrategy extends BaseStrategy {
  readonly name = 'uniswap-v3-arbitrage';
  readonly description = 'Detects arbitrage opportunities in Uniswap V3 pools using concentrated liquidity math';

  private readonly minProfitUSD = 10;
  private readonly maxGasPriceGwei = 100;
  
  // V3 specific thresholds
  private readonly MIN_LIQUIDITY = BigInt(1e18); // Minimum pool liquidity
  private readonly MAX_PRICE_IMPACT = 0.03; // 3% max price impact

  constructor(logger: Logger) {
    super(logger);
  }

  async evaluate(context: StrategyContext): Promise<StrategyResult> {
    const v3Context = context as V3StrategyContext;
    const { tokenIn, tokenOut, amountIn, gasPrice } = context;

    // Check for V3-specific data
    if (!v3Context.sqrtPriceX96 || !v3Context.liquidity) {
      return {
        shouldExecute: false,
        reason: 'Uniswap V3 pool state (sqrtPriceX96, liquidity) not available',
      };
    }

    const fee = v3Context.feeTier || 3000; // Default 0.3%
    
    // Build pool state
    const poolState: V3PoolState = {
      sqrtPriceX96: v3Context.sqrtPriceX96,
      liquidity: v3Context.liquidity,
      tick: v3Context.tick ?? this.sqrtPriceX96ToTick(v3Context.sqrtPriceX96),
      fee,
    };

    // Check minimum liquidity
    if (poolState.liquidity < this.MIN_LIQUIDITY) {
      return {
        shouldExecute: false,
        reason: 'Pool liquidity below minimum threshold',
      };
    }

    // Calculate output using V3 concentrated liquidity math
    const swapResult = this.calculateV3SwapOutput(
      amountIn,
      poolState,
      true // zeroForOne - assuming we're swapping token0 for token1
    );

    // Calculate price impact
    const priceImpact = this.calculatePriceImpact(amountIn, swapResult.amountOut, poolState);
    
    if (priceImpact > this.MAX_PRICE_IMPACT) {
      return {
        shouldExecute: false,
        reason: `Price impact too high: ${(priceImpact * 100).toFixed(2)}%`,
      };
    }

    // Calculate profit
    const profitUSD = this.calculateProfitUSD(swapResult.amountOut, amountIn);

    // Check thresholds
    const meetsThresholds = this.meetsThresholds(
      profitUSD,
      this.minProfitUSD,
      gasPrice,
      this.maxGasPriceGwei
    );

    const result: StrategyResult = {
      shouldExecute: meetsThresholds,
      reason: meetsThresholds 
        ? 'Profitable V3 opportunity found' 
        : 'Below profit threshold or gas too high',
    };

    if (meetsThresholds) {
      result.opportunity = {
        strategyName: this.name,
        expectedProfit: swapResult.amountOut - amountIn,
        profitUSD,
        route: {
          tokenIn,
          tokenOut,
          amountIn,
          amountOut: swapResult.amountOut,
          path: [tokenIn, tokenOut],
        },
        gasEstimate: swapResult.gasEstimate,
      };
    }

    this.logEvaluation(context, result);
    return result;
  }

  /**
   * Calculate swap output using Uniswap V3 concentrated liquidity formula
   * 
   * In V3, swaps move the price within a tick range. The formula depends on
   * whether we're swapping token0 for token1 (price decreases) or vice versa.
   * 
   * For zeroForOne (token0 -> token1):
   *   amountOut = liquidity * (1/sqrtPriceCurrent - 1/sqrtPriceNext)
   *   amountIn = amountOut * sqrtPriceCurrent * sqrtPriceNext / (sqrtPriceNext - sqrtPriceCurrent)
   * 
   * For oneForZero (token1 -> token0):
   *   amountOut = liquidity * (sqrtPriceNext - sqrtPriceCurrent)
   *   amountIn = amountOut / (sqrtPriceNext - sqrtPriceCurrent)
   */
  private calculateV3SwapOutput(
    amountIn: bigint,
    poolState: V3PoolState,
    zeroForOne: boolean
  ): V3SwapResult {
    const { sqrtPriceX96, liquidity, fee } = poolState;

    // Apply fee
    const feeAmount = (amountIn * BigInt(fee)) / 1000000n; // fee is in parts per million
    const amountInAfterFee = amountIn - feeAmount;

    let amountOut: bigint;
    let sqrtPriceX96After: bigint;

    if (zeroForOne) {
      // Swapping token0 for token1: price decreases
      // amountOut = liquidity * (sqrtPriceNext - sqrtPriceCurrent) / Q96
      // But we need to solve for sqrtPriceNext given amountIn
      
      // Formula: sqrtPriceNext = sqrtPriceCurrent * liquidity / (liquidity + amountIn * sqrtPriceCurrent / Q96)
      // Rearranged: sqrtPriceNext = (liquidity * Q96) / (liquidity * Q96 / sqrtPriceCurrent + amountIn)
      
      const denominator = liquidity + (amountInAfterFee * sqrtPriceX96) / Q96;
      sqrtPriceX96After = (liquidity * sqrtPriceX96) / denominator;
      
      // Calculate amount out: liquidity * (1/sqrtPriceCurrent - 1/sqrtPriceNext) adjusted for Q96
      // = liquidity * (sqrtPriceNext - sqrtPriceCurrent) * Q96 / (sqrtPriceCurrent * sqrtPriceNext)
      const numerator = liquidity * (sqrtPriceX96 - sqrtPriceX96After);
      const denominatorOut = (sqrtPriceX96 * sqrtPriceX96After) / Q96;
      amountOut = denominatorOut > 0n ? (numerator / denominatorOut) : 0n;
    } else {
      // Swapping token1 for token0: price increases
      // sqrtPriceNext = sqrtPriceCurrent + amountIn / liquidity * Q96
      // amountOut = liquidity * (1/sqrtPriceCurrent - 1/sqrtPriceNext) * Q96
      
      sqrtPriceX96After = sqrtPriceX96 + (amountInAfterFee * Q96) / liquidity;
      
      // Calculate amount out: liquidity * (sqrtPriceNext - sqrtPriceCurrent) / Q96
      const numerator = liquidity * (sqrtPriceX96After - sqrtPriceX96);
      amountOut = numerator / Q96;
    }

    // Ensure non-negative output
    amountOut = amountOut > 0n ? amountOut : 0n;

    // Calculate new tick
    const tickAfter = this.sqrtPriceX96ToTick(sqrtPriceX96After);

    // Estimate gas (V3 swaps are more gas intensive due to tick crossing)
    const gasEstimate = this.estimateV3Gas(tickAfter !== poolState.tick);

    return {
      amountOut,
      sqrtPriceX96After,
      tickAfter,
      gasEstimate,
    };
  }

  /**
   * Convert sqrtPriceX96 to tick
   * 
   * Formula: tick = floor(log(sqrtPrice) / log(1.0001))
   * With sqrtPriceX96: tick = floor(log(sqrtPriceX96 / Q96) * 2 / log(1.0001))
   * 
   * Uses the mathematical relationship:
   * price = (sqrtPriceX96 / Q96)^2
   * tick = log_base_1.0001(price)
   */
  private sqrtPriceX96ToTick(sqrtPriceX96: bigint): number {
    // Calculate price ratio
    const priceRatio = Number(sqrtPriceX96) / Number(Q96);
    const price = priceRatio * priceRatio;
    
    // Calculate tick using log base 1.0001
    // log_1.0001(x) = ln(x) / ln(1.0001)
    const tick = Math.floor(Math.log(price) / Math.log(1.0001));
    
    // Clamp to valid range
    return Math.max(MIN_TICK, Math.min(MAX_TICK, tick));
  }

  /**
   * Convert tick to sqrtPriceX96
   * 
   * Formula: sqrtPriceX96 = sqrt(1.0001^tick) * Q96
   */
  private tickToSqrtPriceX96(tick: number): bigint {
    const sqrtPrice = Math.sqrt(Math.pow(1.0001, tick));
    return BigInt(Math.floor(sqrtPrice * Number(Q96)));
  }

  /**
   * Calculate price impact for a swap
   */
  private calculatePriceImpact(
    amountIn: bigint,
    amountOut: bigint,
    poolState: V3PoolState
  ): number {
    // Calculate effective price
    const effectivePrice = amountOut > 0n 
      ? Number(amountIn) / Number(amountOut)
      : 0;
    
    // Calculate spot price from sqrtPriceX96
    const sqrtPrice = Number(poolState.sqrtPriceX96) / Number(Q96);
    const spotPrice = sqrtPrice * sqrtPrice;
    
    // Price impact as percentage difference
    if (spotPrice === 0) return 1;
    return Math.abs(effectivePrice - spotPrice) / spotPrice;
  }

  /**
   * Estimate gas for V3 swap
   */
  private estimateV3Gas(crossesTick: boolean): bigint {
    // Base gas for V3 swap
    let gas = 150000n;
    
    // Additional gas for tick crossing
    if (crossesTick) {
      gas += 30000n;
    }
    
    return gas;
  }

  /**
   * Calculate virtual reserves from sqrtPriceX96 and liquidity
   * 
   * Virtual reserves represent the equivalent V2 reserves at current price
   * 
   * Formula:
   * virtualReserve0 = liquidity * Q96 / sqrtPriceX96
   * virtualReserve1 = liquidity * sqrtPriceX96 / Q96
   */
  private calculateVirtualReserves(
    sqrtPriceX96: bigint,
    liquidity: bigint
  ): { reserve0: bigint; reserve1: bigint } {
    const reserve0 = (liquidity * Q96) / sqrtPriceX96;
    const reserve1 = (liquidity * sqrtPriceX96) / Q96;
    
    return { reserve0, reserve1 };
  }

  /**
   * Calculate amount out for comparison with other DEXes
   * Uses virtual reserves for V2-like comparison
   */
  calculateOutputWithVirtualReserves(
    amountIn: bigint,
    sqrtPriceX96: bigint,
    liquidity: bigint,
    fee: number
  ): bigint {
    const { reserve0, reserve1 } = this.calculateVirtualReserves(sqrtPriceX96, liquidity);
    
    // Apply V2-like formula with fee
    const feeMultiplier = BigInt(1000000 - fee);
    const amountInWithFee = (amountIn * feeMultiplier) / 1000000n;
    
    return (amountInWithFee * reserve1) / (reserve0 + amountInWithFee);
  }

  /**
   * Get tick spacing for a fee tier
   */
  getTickSpacing(fee: number): number {
    return TICK_SPACING[fee] || 60; // Default to 0.3% spacing
  }

  /**
   * Calculate the next initialized tick above/below current tick
   */
  private getNextTick(
    currentTick: number,
    tickSpacing: number,
    direction: 'up' | 'down'
  ): number {
    const compressedTick = Math.floor(currentTick / tickSpacing);
    
    if (direction === 'up') {
      return (compressedTick + 1) * tickSpacing;
    } else {
      return (compressedTick - 1) * tickSpacing;
    }
  }

  /**
   * Calculate liquidity available at a specific tick range
   */
  calculateLiquidityForAmounts(
    sqrtPriceLower: bigint,
    sqrtPriceUpper: bigint,
    amount0: bigint,
    amount1: bigint
  ): bigint {
    if (sqrtPriceUpper <= sqrtPriceLower) {
      return 0n;
    }

    // Liquidity for amount0: L = amount0 * sqrtPriceUpper * sqrtPriceLower / (sqrtPriceUpper - sqrtPriceLower)
    // Liquidity for amount1: L = amount1 / (sqrtPriceUpper - sqrtPriceLower) * Q96
    
    const liquidity0 = (amount0 * sqrtPriceUpper * sqrtPriceLower) /
      ((sqrtPriceUpper - sqrtPriceLower) * Q96);
    
    const liquidity1 = (amount1 * Q96) / (sqrtPriceUpper - sqrtPriceLower);

    // Return minimum of both (conservative estimate)
    return liquidity0 < liquidity1 ? liquidity0 : liquidity1;
  }

  /**
   * Validate that a swap won't cross into uninitialized ticks
   */
  validateSwap(
    amountIn: bigint,
    poolState: V3PoolState,
    initializedTicks: number[]
  ): { valid: boolean; nearestTick: number | null } {
    const swapResult = this.calculateV3SwapOutput(amountIn, poolState, true);
    
    // Check if target tick is initialized
    const targetTick = swapResult.tickAfter;
    const tickSpacing = this.getTickSpacing(poolState.fee);
    
    // Find nearest initialized tick
    const nearestTick = initializedTicks
      .filter(t => Math.abs(t - targetTick) <= tickSpacing)
      .sort((a, b) => Math.abs(a - targetTick) - Math.abs(b - targetTick))[0];

    return {
      valid: nearestTick !== undefined || initializedTicks.length === 0,
      nearestTick: nearestTick ?? null,
    };
  }
}

// Export helper functions for use in other modules
export function sqrtPriceX96ToPrice(sqrtPriceX96: bigint, decimals0: number, decimals1: number): number {
  const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
  const price = sqrtPrice * sqrtPrice;
  const decimalAdjustment = Math.pow(10, decimals1 - decimals0);
  return price * decimalAdjustment;
}

export function priceToSqrtPriceX96(price: number, decimals0: number, decimals1: number): bigint {
  const decimalAdjustment = Math.pow(10, decimals0 - decimals1);
  const adjustedPrice = price * decimalAdjustment;
  const sqrtPrice = Math.sqrt(adjustedPrice);
  return BigInt(Math.floor(sqrtPrice * Number(Q96)));
}

export function encodeV3Path(tokens: string[], fees: number[]): string {
  if (tokens.length !== fees.length + 1) {
    throw new Error('Tokens array must be one longer than fees array');
  }

  let encoded = '0x';
  for (let i = 0; i < fees.length; i++) {
    // Token address (20 bytes)
    encoded += tokens[i].slice(2).toLowerCase();
    // Fee (3 bytes)
    encoded += fees[i].toString(16).padStart(6, '0');
  }
  // Final token address (20 bytes)
  encoded += tokens[tokens.length - 1].slice(2).toLowerCase();
  
  return encoded;
}
