/**
 * Arbitrage Platform SDK
 * 
 * A TypeScript SDK for multi-chain arbitrage trading operations.
 * Provides DEX adapters, chain configurations, and utility functions.
 * 
 * @packageDocumentation
 */

// Chain configurations
export {
  // Individual chains
  ethereum,
  arbitrum,
  optimism,
  base,
  polygon,
  // Utilities
  chains,
  getChain,
  isChainSupported,
  getSupportedChainIds,
} from './chains';

export type {
  ChainConfig,
  NativeCurrency,
  BlockExplorer,
  ChainAddresses,
} from './chains';

// DEX adapters
export {
  // Adapters
  UniswapV3Adapter,
  SushiSwapAdapter,
  PancakeSwapV3Adapter,
  // Utilities
  createAdapter,
  getSupportedDexes,
  createAllAdapters,
  FEE_TIERS,
} from './dex';

export type {
  TokenPair,
  PoolInfo,
  QuoteResult,
  PriceInfo,
  DexAdapter,
  FeeTier,
} from './dex';

// Utilities
export {
  // Constants
  COMMON_TOKENS,
  DEFAULT_FEE_TIERS,
  GAS_MULTIPLIERS,
  DEFAULT_SLIPPAGE_BPS,
  MAX_ROUTE_HOPS,
  MIN_PROFIT_WEI,
  FLASH_LOAN_PROVIDERS,
  AAVE_POOL_ADDRESSES,
  BALANCER_VAULT,
  GAS_LIMITS,
  ETH_UNITS,
  DEFAULT_DEADLINE,
  PERCENTAGE_PRECISION,
  BPS_PRECISION,
  // Profit Calculator
  calculateProfit,
  calculateMinOutputAmount,
  calculateGasCost,
  calculatePriceImpact,
  applySlippage,
  weiToEth,
  ethToWei,
  formatWei,
  meetsMinProfit,
  // Price Fetcher
  PriceFetcher,
  createPriceFetcher,
} from './utils';

export type {
  ProfitParams,
  ProfitBreakdown,
  PriceComparison,
  DexPrice,
} from './utils';

// Re-export types module
export * from './dex/types';
export * from './chains/types';

/**
 * SDK version
 */
export const SDK_VERSION = '1.0.0';

/**
 * Initialize SDK for a specific chain
 * @param chainId - Chain ID to initialize for
 * @returns Chain config and available adapters
 */
export async function initializeSdk(chainId: number) {
  const { getChain } = await import('./chains');
  const { createAllAdapters } = await import('./dex');
  
  const chain = getChain(chainId);
  if (!chain) {
    throw new Error(`Unsupported chain: ${chainId}`);
  }
  
  const adapters = createAllAdapters(chain);
  
  return {
    chain,
    adapters,
  chainId,
  dexes: adapters.map(a => a.name),
  supportedDexes: chain.supportedDexes,
  addresses: chain.addresses,
  };
}

export default {
  SDK_VERSION,
  initializeSdk,
};
