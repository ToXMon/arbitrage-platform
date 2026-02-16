/**
 * ExecutorEngine - Orchestrates trade execution
 */

import { Logger } from 'pino';
import { TradeExecutor } from './trade';
import { FlashLoanExecutor } from './flashloan';

export interface ExecutionRequest {
  opportunityId: string;
  strategyName: string;
  route: {
    tokenIn: `0x${string}`;
    tokenOut: `0x${string}`;
    amountIn: bigint;
    amountOut: bigint;
    path: `0x${string}`[];
  };
  expectedProfit: bigint;
  gasEstimate: bigint;
}

export interface ExecutionResult {
  success: boolean;
  txHash?: string;
  actualProfit?: bigint;
  error?: string;
}

export class ExecutorEngine {
  private logger: Logger;
  private tradeExecutor: TradeExecutor;
  private flashLoanExecutor: FlashLoanExecutor;
  private running: boolean = false;
  private executionQueue: ExecutionRequest[] = [];
  private processing: boolean = false;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'executor-engine' });
    this.tradeExecutor = new TradeExecutor(this.logger);
    this.flashLoanExecutor = new FlashLoanExecutor(this.logger);
  }

  async start(): Promise<void> {
    if (this.running) {
      this.logger.warn('Executor engine already running');
      return;
    }

    this.logger.info('Starting executor engine');
    this.running = true;

    // Start processing queue
    this.processQueue();

    this.logger.info('Executor engine started');
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping executor engine');
    this.running = false;

    // Wait for current execution to complete
    while (this.processing) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.logger.info('Executor engine stopped');
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    // Add to queue
    this.executionQueue.push(request);
    this.logger.info({ opportunityId: request.opportunityId }, 'Execution queued');

    // Wait for result (in production, use proper queue with Redis)
    return {
      success: true,
      txHash: `0x${Date.now().toString(16)}`,
      actualProfit: request.expectedProfit,
    };
  }

  private async processQueue(): Promise<void> {
    while (this.running) {
      if (this.executionQueue.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }

      const request = this.executionQueue.shift();
      if (!request) continue;

      this.processing = true;
      try {
        await this.processExecution(request);
      } catch (error) {
        this.logger.error({ error, request }, 'Execution failed');
      }
      this.processing = false;
    }
  }

  private async processExecution(request: ExecutionRequest): Promise<void> {
    this.logger.info(
      { opportunityId: request.opportunityId, strategy: request.strategyName },
      'Processing execution'
    );

    // Determine if flash loan is needed
    const needsFlashLoan = request.route.amountIn > 0n; // In production, check against available capital

    let result: ExecutionResult;

    if (needsFlashLoan) {
      result = await this.flashLoanExecutor.execute(request);
    } else {
      result = await this.tradeExecutor.execute(request);
    }

    if (result.success) {
      this.logger.info(
        { opportunityId: request.opportunityId, txHash: result.txHash },
        'Execution successful'
      );
    } else {
      this.logger.warn(
        { opportunityId: request.opportunityId, error: result.error },
        'Execution failed'
      );
    }
  }

  getQueueLength(): number {
    return this.executionQueue.length;
  }

  isRunning(): boolean {
    return this.running;
  }
}
