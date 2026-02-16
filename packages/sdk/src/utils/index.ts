/**
 * Utilities module
 * @module utils
 */

export * from './constants';
export * from './profitCalculator';
export * from './priceFetcher';

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
} from './constants';

export {
  // Profit calculator
  calculateProfit,
  calculateMinOutputAmount,
  calculateGasCost,
  calculatePriceImpact,
  applySlippage,
  weiToEth,
  ethToWei,
  formatWei,
  meetsMinProfit,
  type ProfitParams,
  type ProfitBreakdown,
} from './profitCalculator';

export {
  // Price fetcher
  PriceFetcher,
  createPriceFetcher,
  type PriceComparison,
  type DexPrice,
} from './priceFetcher';
