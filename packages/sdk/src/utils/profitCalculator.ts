/**
 * Profit calculation utilities for arbitrage operations
 * @module utils/profitCalculator
 */

import { ETH_UNITS, DEFAULT_SLIPPAGE_BPS, BPS_PRECISION } from './constants';

/**
 * Profit calculation parameters
 */
export interface ProfitParams {
  /** Amount received from sell DEX (in wei) */
  amountOut: bigint;
  /** Amount input to buy DEX (in wei) */
  amountIn: bigint;
  /** Estimated gas cost in wei */
  gasCost: bigint;
  /** Flash loan fee (in basis points) */
  flashLoanFeeBps?: number;
  /** Flash loan amount */
  flashLoanAmount: bigint;
  /** Additional protocol fees in wei */
  protocolFees?: bigint;
}

/**
 * Detailed profit breakdown
 */
export interface ProfitBreakdown {
  /** Gross profit before costs */
  grossProfit: bigint;
  /** Net profit after all costs */
  netProfit: bigint;
  /** Total costs (gas + fees) */
  totalCosts: bigint;
  /** Gas cost in wei */
  gasCost: bigint;
  /** Flash loan fee in wei */
  flashLoanFee: bigint;
  /** Protocol fees in wei */
  protocolFees: bigint;
  /** Profit percentage (basis points) */
  profitBps: number;
  /** Whether the trade is profitable */
  isProfitable: boolean;
  /** ROI percentage */
  roiPercentage: number;
}

/**
 * Calculate profit from an arbitrage opportunity
 * @param params - Profit calculation parameters
 * @returns Detailed profit breakdown
 */
export function calculateProfit(params: ProfitParams): ProfitBreakdown {
  const {
    amountOut,
    amountIn,
    gasCost,
    flashLoanFeeBps = 0,
    flashLoanAmount,
    protocolFees = BigInt(0),
  } = params;

  // Calculate gross profit
  const grossProfit = amountOut - amountIn;

  // Calculate flash loan fee
  const flashLoanFee = (flashLoanAmount * BigInt(flashLoanFeeBps)) / BigInt(BPS_PRECISION);

  // Total costs
  const totalCosts = gasCost + flashLoanFee + protocolFees;

  // Net profit
  const netProfit = grossProfit - totalCosts;

  // Profit in basis points
  const profitBps = amountIn > BigInt(0)
    ? Number((netProfit * BigInt(BPS_PRECISION)) / amountIn)
    : 0;

  // ROI percentage
  const roiPercentage = profitBps / 100;

  // Determine if profitable
  const isProfitable = netProfit > BigInt(0);

  return {
    grossProfit,
    netProfit,
    totalCosts,
    gasCost,
    flashLoanFee,
    protocolFees,
    profitBps,
    isProfitable,
    roiPercentage,
  };
}

/**
 * Calculate required output amount for profitable trade
 * @param amountIn - Input amount
 * @param gasCost - Gas cost in wei
 * @param flashLoanFeeBps - Flash loan fee in basis points
 * @param minProfitBps - Minimum required profit in basis points
 * @returns Minimum output amount required
 */
export function calculateMinOutputAmount(
  amountIn: bigint,
  gasCost: bigint,
  flashLoanFeeBps: number = 0,
  minProfitBps: number = 50
): bigint {
  // Minimum profit = amountIn * minProfitBps / 10000
  const minProfit = (amountIn * BigInt(minProfitBps)) / BigInt(BPS_PRECISION);
  
  // Flash loan fee on input amount
  const flashLoanFee = (amountIn * BigInt(flashLoanFeeBps)) / BigInt(BPS_PRECISION);
  
  // Required output = input + gas + flashLoanFee + minProfit
  return amountIn + gasCost + flashLoanFee + minProfit;
}

/**
 * Calculate gas cost from gas price and gas limit
 * @param gasPrice - Gas price in wei
 * @param gasLimit - Gas limit
 * @returns Total gas cost in wei
 */
export function calculateGasCost(gasPrice: bigint, gasLimit: bigint): bigint {
  return gasPrice * gasLimit;
}

/**
 * Calculate price impact
 * @param amountIn - Input amount
 * @param reserveIn - Input reserve
 * @param reserveOut - Output reserve
 * @returns Price impact in basis points
 */
export function calculatePriceImpact(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint
): number {
  if (reserveIn === BigInt(0) || reserveOut === BigInt(0)) {
    return 0;
  }

  // Constant product: (reserveIn + amountIn) * (reserveOut - amountOut) = reserveIn * reserveOut
  // amountOut = (reserveOut * amountIn) / (reserveIn + amountIn)
  const amountOut = (reserveOut * amountIn) / (reserveIn + amountIn);
  
  // Spot price before = reserveOut / reserveIn
  // Spot price after = (reserveOut - amountOut) / (reserveIn + amountIn)
  const priceBefore = (reserveOut * BigInt(BPS_PRECISION)) / reserveIn;
  const priceAfter = ((reserveOut - amountOut) * BigInt(BPS_PRECISION)) / (reserveIn + amountIn);
  
  // Price impact = (priceBefore - priceAfter) / priceBefore * 10000
  if (priceBefore === BigInt(0)) return 0;
  const impact = Number(((priceBefore - priceAfter) * BigInt(BPS_PRECISION)) / priceBefore);
  
  return impact;
}

/**
 * Apply slippage to amount
 * @param amount - Original amount
 * @param slippageBps - Slippage in basis points
 * @returns Amount after slippage
 */
export function applySlippage(amount: bigint, slippageBps: number = DEFAULT_SLIPPAGE_BPS): bigint {
  return (amount * BigInt(BPS_PRECISION - slippageBps)) / BigInt(BPS_PRECISION);
}

/**
 * Convert wei to ETH
 * @param wei - Amount in wei
 * @returns Amount in ETH (as number)
 */
export function weiToEth(wei: bigint): number {
  return Number(wei) / Number(ETH_UNITS.ETH);
}

/**
 * Convert ETH to wei
 * @param eth - Amount in ETH
 * @returns Amount in wei
 */
export function ethToWei(eth: number): bigint {
  return BigInt(Math.floor(eth * Number(ETH_UNITS.ETH)));
}

/**
 * Format wei amount for display
 * @param wei - Amount in wei
 * @param decimals - Token decimals (default 18)
 * @returns Formatted string
 */
export function formatWei(wei: bigint, decimals: number = 18): string {
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = wei / divisor;
  const fraction = wei % divisor;
  
  if (fraction === BigInt(0)) {
    return whole.toString();
  }
  
  const fractionStr = fraction.toString().padStart(decimals, '0');
  const trimmedFraction = fractionStr.slice(0, 6).replace(/0+$/, '');
  
  return `${whole}.${trimmedFraction}`;
}

/**
 * Check if profit meets minimum threshold
 * @param netProfit - Net profit in wei
 * @param minProfitWei - Minimum profit threshold in wei
 * @returns Boolean indicating if profit is sufficient
 */
export function meetsMinProfit(netProfit: bigint, minProfitWei: bigint): boolean {
  return netProfit >= minProfitWei;
}

export default {
  calculateProfit,
  calculateMinOutputAmount,
  calculateGasCost,
  calculatePriceImpact,
  applySlippage,
  weiToEth,
  ethToWei,
  formatWei,
  meetsMinProfit,
};
