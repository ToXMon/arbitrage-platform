/**
 * Common constants for arbitrage SDK
 * @module utils/constants
 */

/**
 * Common token addresses across chains
 */
export const COMMON_TOKENS: Record<number, Record<string, `0x${string}`>> = {
  1: {
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    DAI: '0x6B175474E89094C44Da98b954EescdCB4440985FB',
    WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  },
  42161: {
    WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    ARB: '0x912CE59144191C1204E64559FE8253a0e49E6548',
  },
  10: {
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    OP: '0x4200000000000000000000000000000000000042',
  },
  8453: {
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  137: {
    WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  },
};

/**
 * Default fee tiers to check
 */
export const DEFAULT_FEE_TIERS = [100, 500, 3000, 10000];

/**
 * Gas price multipliers for different speed settings
 */
export const GAS_MULTIPLIERS = {
  slow: 0.9,
  standard: 1.0,
  fast: 1.2,
  instant: 1.5,
} as const;

/**
 * Default slippage tolerance (in basis points)
 */
export const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%

/**
 * Maximum hops for route optimization
 */
export const MAX_ROUTE_HOPS = 4;

/**
 * Minimum profit threshold (in wei)
 */
export const MIN_PROFIT_WEI = BigInt('1000000000000000'); // 0.001 ETH

/**
 * Flash loan providers
 */
export const FLASH_LOAN_PROVIDERS = {
  AAVE: 'aave',
  BALANCER: 'balancer',
  DYDX: 'dydx',
  UNISWAP: 'uniswap',
} as const;

/**
 * Aave lending pool addresses per chain
 */
export const AAVE_POOL_ADDRESSES: Record<number, `0x${string}`> = {
  1: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
  42161: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
  137: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
};

/**
 * Balancer vault address (same across chains)
 */
export const BALANCER_VAULT: `0x${string}` = '0xBA12222222228d8Ba445958a75a0704d566BF2C8';

/**
 * Default gas limits for common operations
 */
export const GAS_LIMITS = {
  SIMPLE_SWAP: BigInt(200000),
  MULTI_SWAP: BigInt(400000),
  FLASH_LOAN: BigInt(600000),
  APPROVE: BigInt(60000),
};

/**
 * Ethereum unit multipliers
 */
export const ETH_UNITS = {
  WEI: BigInt(1),
  GWEI: BigInt(1e9),
  ETH: BigInt(10) ** BigInt(18),
};

/**
 * Common deadline for swaps (20 minutes in seconds)
 */
export const DEFAULT_DEADLINE = 1200;

/**
 * Percentage precision (100 = 100%)
 */
export const PERCENTAGE_PRECISION = 100;

/**
 * Basis point precision (10000 = 100%)
 */
export const BPS_PRECISION = 10000;
