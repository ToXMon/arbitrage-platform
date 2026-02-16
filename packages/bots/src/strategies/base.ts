/**
 * Base Strategy - Abstract strategy interface
 */

import { Logger } from 'pino';

export interface StrategyContext {
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: bigint;
  chainId: number;
  blockNumber: bigint;
  gasPrice: bigint;
  poolReserves?: { reserve0: bigint; reserve1: bigint };
  priceImpact?: number;
}

export interface StrategyResult {
  shouldExecute: boolean;
  reason?: string;
  opportunity?: {
    strategyName: string;
    expectedProfit: bigint;
    profitUSD: number;
    route: {
      tokenIn: `0x${string}`;
      tokenOut: `0x${string}`;
      amountIn: bigint;
      amountOut: bigint;
      path: `0x${string}`[];
    };
    gasEstimate: bigint;
  };
}

export abstract class BaseStrategy {
  protected logger: Logger;
  abstract readonly name: string;
  abstract readonly description: string;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: `strategy-${this.name}` });
  }

  abstract evaluate(context: StrategyContext): Promise<StrategyResult>;

  protected calculateProfitUSD(
    amountOut: bigint,
    amountIn: bigint,
    tokenDecimals: number = 18
  ): number {
    const profit = amountOut - amountIn;
    return Number(profit) / 10 ** tokenDecimals;
  }

  protected meetsThresholds(
    profitUSD: number,
    minProfitUSD: number,
    gasPrice: bigint,
    maxGasPriceGwei: number
  ): boolean {
    const gasPriceGwei = Number(gasPrice) / 1e9;
    return profitUSD >= minProfitUSD && gasPriceGwei <= maxGasPriceGwei;
  }

  protected logEvaluation(
    context: StrategyContext,
    result: StrategyResult
  ): void {
    this.logger.debug(
      {
        tokenIn: context.tokenIn,
        tokenOut: context.tokenOut,
        chainId: context.chainId,
        shouldExecute: result.shouldExecute,
        reason: result.reason,
      },
      'Strategy evaluation'
    );
  }
}
