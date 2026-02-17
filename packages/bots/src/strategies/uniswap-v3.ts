/**
 * Uniswap V3 Arbitrage Strategy
 * Detects arbitrage opportunities in Uniswap V3 pools
 */

import { Logger } from 'pino';
import { BaseStrategy, StrategyContext, StrategyResult } from './base';

export class UniswapV3ArbitrageStrategy extends BaseStrategy {
  readonly name = 'uniswap-v3-arbitrage';
  readonly description = 'Detects arbitrage opportunities in Uniswap V3 pools';

  private readonly minProfitUSD = 10;
  private readonly maxGasPriceGwei = 100;

  constructor(logger: Logger) {
    super(logger);
  }

  async evaluate(context: StrategyContext): Promise<StrategyResult> {
    const { tokenIn, tokenOut, amountIn, gasPrice, poolReserves } = context;

    if (!poolReserves) {
      return {
        shouldExecute: false,
        reason: 'Pool reserves not available',
      };
    }

    // Calculate output amount using constant product formula (simplified)
    const amountOut = this.calculateOutput(
      amountIn,
      poolReserves.reserve0,
      poolReserves.reserve1
    );

    // Calculate profit
    const profitUSD = this.calculateProfitUSD(amountOut, amountIn);

    // Check thresholds
    const meetsThresholds = this.meetsThresholds(
      profitUSD,
      this.minProfitUSD,
      gasPrice,
      this.maxGasPriceGwei
    );

    const result: StrategyResult = {
      shouldExecute: meetsThresholds,
      reason: meetsThresholds ? 'Profitable opportunity found' : 'Below profit threshold or gas too high',
    };

    if (meetsThresholds) {
      result.opportunity = {
        strategyName: this.name,
        expectedProfit: amountOut - amountIn,
        profitUSD,
        route: {
          tokenIn,
          tokenOut,
          amountIn,
          amountOut,
          path: [tokenIn, tokenOut],
        },
        gasEstimate: 150000n,
      };
    }

    this.logEvaluation(context, result);
    return result;
  }

  private calculateOutput(
    amountIn: bigint,
    reserve0: bigint,
    reserve1: bigint
  ): bigint {
    // Simplified AMM formula: amountOut = (amountIn * reserve1) / (reserve0 + amountIn)
    // For Uniswap V3, this would use the concentrated liquidity formula
    const amountInWithFee = (amountIn * 997n) / 1000n; // 0.3% fee
    return (amountInWithFee * reserve1) / (reserve0 + amountInWithFee);
  }
}
