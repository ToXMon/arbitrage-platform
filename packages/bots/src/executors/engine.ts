/**
 * ExecutorEngine - Orchestrates trade execution
 */

import { Logger } from 'pino';
import { ethers } from 'ethers';
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

interface ExecutorConfig {
  privateKey: string;
  rpcUrl: string;
  arbitrageAddress: string;
  routerAddress?: string;
}

interface PendingExecution {
  request: ExecutionRequest;
  resolve: (result: ExecutionResult) => void;
  reject: (error: Error) => void;
}

export class ExecutorEngine {
  private logger: Logger;
  private tradeExecutor: TradeExecutor;
  private flashLoanExecutor: FlashLoanExecutor;
  private running: boolean = false;
  private processing: boolean = false;
  private initialized: boolean = false;
  private pendingExecutions: Map<string, PendingExecution> = new Map();
  private executionQueue: ExecutionRequest[] = [];

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'executor-engine' });
    this.tradeExecutor = new TradeExecutor(this.logger);
    this.flashLoanExecutor = new FlashLoanExecutor(this.logger);
  }

  /**
   * Initialize executors with wallet and connection details
   */
  async initialize(config: ExecutorConfig): Promise<void> {
    this.logger.info('Initializing executor engine');

    try {
      // Initialize trade executor
      await this.tradeExecutor.initialize(config.privateKey, config.rpcUrl);

      // Initialize flash loan executor
      await this.flashLoanExecutor.initialize(
        config.privateKey,
        config.rpcUrl,
        config.arbitrageAddress
      );

      this.initialized = true;
      this.logger.info(
        {
          wallet: this.tradeExecutor.getAddress(),
          arbitrage: this.flashLoanExecutor.getContractAddress(),
        },
        'Executor engine initialized successfully'
      );
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize executor engine');
      throw error;
    }
  }

  async start(): Promise<void> {
    if (this.running) {
      this.logger.warn('Executor engine already running');
      return;
    }

    if (!this.initialized) {
      this.logger.warn('Executor engine not initialized. Call initialize() first.');
      return;
    }

    this.logger.info('Starting executor engine');
    this.running = true;

    // Start processing queue in background
    this.processQueue().catch((error) => {
      this.logger.error({ error }, 'Queue processing error');
    });

    this.logger.info('Executor engine started');
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping executor engine');
    this.running = false;

    // Wait for current execution to complete
    let waitCount = 0;
    while (this.processing && waitCount < 100) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      waitCount++;
    }

    this.logger.info('Executor engine stopped');
  }

  /**
   * Execute a trade opportunity - returns actual result from executor
   */
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    if (!this.initialized) {
      return {
        success: false,
        error: 'Executor engine not initialized',
      };
    }

    this.logger.info(
      {
        opportunityId: request.opportunityId,
        strategy: request.strategyName,
        amountIn: request.route.amountIn.toString(),
        path: request.route.path.length,
      },
      'Received execution request'
    );

    // If engine is running, queue the request
    if (this.running) {
      return new Promise((resolve, reject) => {
        this.executionQueue.push(request);
        this.pendingExecutions.set(request.opportunityId, {
          request,
          resolve,
          reject,
        });
        this.logger.debug(
          { opportunityId: request.opportunityId, queueLength: this.executionQueue.length },
          'Execution queued'
        );
      });
    }

    // Direct execution if not running in queue mode
    return this.processExecution(request);
  }

  /**
   * Process queued executions
   */
  private async processQueue(): Promise<void> {
    while (this.running) {
      if (this.executionQueue.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        continue;
      }

      const request = this.executionQueue.shift();
      if (!request) continue;

      this.processing = true;
      try {
        const result = await this.processExecution(request);
        
        // Resolve pending promise
        const pending = this.pendingExecutions.get(request.opportunityId);
        if (pending) {
          pending.resolve(result);
          this.pendingExecutions.delete(request.opportunityId);
        }
      } catch (error) {
        this.logger.error({ error, opportunityId: request.opportunityId }, 'Execution failed');
        
        const pending = this.pendingExecutions.get(request.opportunityId);
        if (pending) {
          pending.reject(error instanceof Error ? error : new Error('Unknown error'));
          this.pendingExecutions.delete(request.opportunityId);
        }
      }
      this.processing = false;
    }
  }

  /**
   * Execute using the appropriate executor
   */
  private async processExecution(request: ExecutionRequest): Promise<ExecutionResult> {
    this.logger.info(
      { opportunityId: request.opportunityId, strategy: request.strategyName },
      'Processing execution'
    );

    // Determine if flash loan is needed
    // Flash loans are used when we don't have enough capital
    const needsFlashLoan = await this.shouldUseFlashLoan(request);

    let result: ExecutionResult;

    if (needsFlashLoan) {
      this.logger.debug(
        { opportunityId: request.opportunityId },
        'Routing to flash loan executor'
      );
      result = await this.flashLoanExecutor.execute(request);
    } else {
      this.logger.debug(
        { opportunityId: request.opportunityId },
        'Routing to trade executor'
      );
      result = await this.tradeExecutor.execute(request);
    }

    // Log result
    if (result.success) {
      this.logger.info(
        {
          opportunityId: request.opportunityId,
          txHash: result.txHash,
          actualProfit: result.actualProfit?.toString(),
        },
        'Execution successful'
      );
    } else {
      this.logger.warn(
        { opportunityId: request.opportunityId, error: result.error },
        'Execution failed'
      );
    }

    return result;
  }

  /**
   * Determine if flash loan should be used based on available capital
   */
  private async shouldUseFlashLoan(request: ExecutionRequest): Promise<boolean> {
    // Check if amount exceeds available capital
    const MIN_DIRECT_TRADE_AMOUNT = 100000000000000000n; // 0.1 ETH in wei
    
    // For large amounts, use flash loans
    // In production, this would check actual wallet balance
    if (request.route.amountIn > MIN_DIRECT_TRADE_AMOUNT) {
      return true;
    }

    // For triangular arbitrage (path length > 2), prefer flash loans
    if (request.route.path.length > 2) {
      return true;
    }

    // Check if strategy explicitly requests flash loan
    if (request.strategyName.includes('flash') || request.strategyName.includes('triangular')) {
      return true;
    }

    return false;
  }

  /**
   * Estimate gas for execution
   */
  async estimateGas(request: ExecutionRequest): Promise<bigint> {
    // Base gas estimates
    const SINGLE_SWAP_GAS = 150000n;
    const FLASH_LOAN_OVERHEAD = 100000n;
    
    const pathLength = request.route.path.length;
    const swapGas = SINGLE_SWAP_GAS * BigInt(pathLength - 1);
    
    const needsFlashLoan = await this.shouldUseFlashLoan(request);
    const totalGas = needsFlashLoan 
      ? swapGas + FLASH_LOAN_OVERHEAD 
      : swapGas;

    return totalGas;
  }

  /**
   * Calculate net profit after costs
   */
  async calculateNetProfit(
    request: ExecutionRequest,
    gasPrice: bigint
  ): Promise<bigint> {
    const gasEstimate = await this.estimateGas(request);
    const gasCost = gasEstimate * gasPrice;
    
    // Account for flash loan fees
    const needsFlashLoan = await this.shouldUseFlashLoan(request);
    let flashLoanFee = 0n;
    
    if (needsFlashLoan) {
      // Aave V3: 0.09% fee
      flashLoanFee = (request.route.amountIn * 9n) / 10000n;
    }

    const netProfit = request.expectedProfit - gasCost - flashLoanFee;
    return netProfit > 0n ? netProfit : 0n;
  }

  getQueueLength(): number {
    return this.executionQueue.length;
  }

  isRunning(): boolean {
    return this.running;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getTradeExecutor(): TradeExecutor {
    return this.tradeExecutor;
  }

  getFlashLoanExecutor(): FlashLoanExecutor {
    return this.flashLoanExecutor;
  }
}
