/**
 * Strategy exports and manager
 */

export { BaseStrategy } from './base';
export { UniswapV3ArbitrageStrategy } from './uniswap-v3';
export { TriangularArbitrageStrategy } from './triangular';

import { Logger } from 'pino';
import { BaseStrategy, StrategyContext, StrategyResult } from './base';
import { UniswapV3ArbitrageStrategy } from './uniswap-v3';
import { TriangularArbitrageStrategy } from './triangular';

export interface StrategyConfig {
  name: string;
  enabled: boolean;
  minProfitUSD: number;
  maxTradeSizeUSD: number;
  maxGasPriceGwei: number;
}

export class StrategyManager {
  private strategies: Map<string, BaseStrategy> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'strategy-manager' });
    this.registerDefaultStrategies();
  }

  private registerDefaultStrategies(): void {
    this.registerStrategy(new UniswapV3ArbitrageStrategy(this.logger));
    this.registerStrategy(new TriangularArbitrageStrategy(this.logger));
  }

  registerStrategy(strategy: BaseStrategy): void {
    this.strategies.set(strategy.name, strategy);
    this.logger.info({ strategy: strategy.name }, 'Strategy registered');
  }

  getStrategy(name: string): BaseStrategy | undefined {
    return this.strategies.get(name);
  }

  getAllStrategies(): BaseStrategy[] {
    return Array.from(this.strategies.values());
  }

  async evaluate(
    strategyName: string,
    context: StrategyContext
  ): Promise<StrategyResult> {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      return {
        shouldExecute: false,
        reason: `Strategy ${strategyName} not found`,
      };
    }

    return strategy.evaluate(context);
  }

  async evaluateAll(context: StrategyContext): Promise<StrategyResult[]> {
    const results: StrategyResult[] = [];
    for (const [name, strategy] of this.strategies) {
      try {
        const result = await strategy.evaluate(context);
        if (result.shouldExecute) {
          this.logger.info({ strategy: name, result }, 'Profitable opportunity found');
        }
        results.push(result);
      } catch (error) {
        this.logger.error({ strategy: name, error }, 'Strategy evaluation failed');
      }
    }
    return results;
  }
}
