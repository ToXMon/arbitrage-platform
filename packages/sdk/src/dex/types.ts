/**
 * DEX adapter types and interfaces
 * @module dex/types
 */

/**
 * Token pair for trading
 */
export interface TokenPair {
  tokenA: `0x${string}`;
  tokenB: `0x${string}`;
}

/**
 * Pool information
 */
export interface PoolInfo {
  address: `0x${string}`;
  token0: `0x${string}`;
  token1: `0x${string}`;
  fee: number;
  liquidity: bigint;
  sqrtPriceX96: bigint;
  tick: number;
}

/**
 * Quote result from DEX
 */
export interface QuoteResult {
  amountOut: bigint;
  path: `0x${string}`[];
  gasEstimate: bigint;
  fee: number;
  dex: string;
}

/**
 * Price information
 */
export interface PriceInfo {
  price: number;
  timestamp: number;
  dex: string;
  pool: `0x${string}`;
}

/**
 * DEX adapter interface
 */
export interface DexAdapter {
  readonly name: string;
  readonly chainId: number;
  readonly router: `0x${string}`;
  readonly quoter: `0x${string}`;
  
  /**
   * Get quote for a swap
   */
  getQuote(
    tokenIn: `0x${string}`,
    tokenOut: `0x${string}`,
    amountIn: bigint,
    fee?: number
  ): Promise<QuoteResult>;
  
  /**
   * Get pool information
   */
  getPoolInfo(
    tokenA: `0x${string}`,
    tokenB: `0x${string}`,
    fee: number
  ): Promise<PoolInfo>;
  
  /**
   * Calculate output amounts for a route
   */
  getAmountsOut(
    amountIn: bigint,
    path: `0x${string}`[],
    fees: number[]
  ): Promise<bigint>;
}

/**
 * Fee tier configuration
 */
export interface FeeTier {
  fee: number;
  tickSpacing: number;
}

/**
 * Common fee tiers for Uniswap V3 style DEXes
 */
export const FEE_TIERS: FeeTier[] = [
  { fee: 100, tickSpacing: 1 },      // 0.01%
  { fee: 500, tickSpacing: 10 },     // 0.05%
  { fee: 3000, tickSpacing: 60 },    // 0.3%
  { fee: 10000, tickSpacing: 200 },  // 1%
];
