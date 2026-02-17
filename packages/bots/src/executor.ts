/**
 * @fileoverview Transaction builder and executor for arbitrage trades
 * Handles gas estimation, nonce tracking, error handling, and retries
 */

import {
  ethers,
  Wallet,
  Provider,
  Contract,
  TransactionReceipt,
  TransactionResponse,
  JsonRpcProvider,
} from 'ethers';
import Big from 'big.js';
import {
  ChainConfig,
  ChainId,
  getChainConfig,
  DEFAULT_BOT_SETTINGS,
  BotSettings,
} from './config.js';
import type { PoolInfo, ArbitrageOpportunity } from './scanner.js';
import { logger } from './index.js';

/**
 * Flash loan provider enum (matches Solidity contract)
 */
export enum FlashLoanProvider {
  AAVE_V3 = 0,
  BALANCER_V2 = 1,
}

/**
 * Arbitrage contract ABI (updated for multi-DEX flash loans)
 */
const ARBITRAGE_CONTRACT_ABI = [
  'function executeTrade(address[] calldata routerPath, address[] calldata tokenPath, uint24[] calldata fees, uint256 flashAmount, uint8 provider) external',
  'function owner() view returns (address)',
  'function pause() external',
  'function unpause() external',
  'function withdrawProfits(address token) external',
  'function emergencyWithdraw(address token, address to) external',
  'function accumulatedProfits(address token) view returns (uint256)',
  'function getAavePool() view returns (address)',
  'function getChainConfig(uint256 chainId) view returns (tuple(address aaveProvider, address balancerVault, bool isActive))',
];

/**
 * Quoter ABI
 */
const QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut)',
  'function quoteExactOutputSingle((address tokenIn, address tokenOut, uint256 amount, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountIn)',
];

/**
 * Execution result
 */
export interface ExecutionResult {
  success: boolean;
  transactionHash?: string;
  blockNumber?: number;
  gasUsed?: bigint;
  gasPrice?: bigint;
  profit?: bigint;
  error?: string;
  timestamp: number;
}

/**
 * Profitability check result
 */
export interface ProfitabilityResult {
  isProfitable: boolean;
  amountIn: bigint;
  amountOut: bigint;
  estimatedProfit: bigint;
  gasCost: bigint;
  profitMargin: number;
  reason?: string;
}

/**
 * Executor configuration
 */
export interface ExecutorConfig {
  chainId: ChainId;
  arbitrageContractAddress: string;
  privateKey: string;
  settings: BotSettings;
}

/**
 * Nonce manager for transaction sequencing
 */
class NonceManager {
  private provider: Provider;
  private address: string;
  private currentNonce: number = -1;
  private nonceLock: boolean = false;

  constructor(provider: Provider, address: string) {
    this.provider = provider;
    this.address = address;
  }

  /**
   * Get the next nonce for transaction
   */
  public async getNextNonce(): Promise<number> {
    while (this.nonceLock) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    this.nonceLock = true;

    try {
      if (this.currentNonce === -1) {
        this.currentNonce = await this.provider.getTransactionCount(this.address, 'pending');
      } else {
        this.currentNonce++;
      }

      return this.currentNonce;
    } finally {
      this.nonceLock = false;
    }
  }

  /**
   * Reset nonce (call after transaction failure)
   */
  public async reset(): Promise<void> {
    this.currentNonce = await this.provider.getTransactionCount(this.address, 'pending');
  }

  /**
   * Sync nonce from network
   */
  public async sync(): Promise<void> {
    this.currentNonce = await this.provider.getTransactionCount(this.address, 'pending');
  }
}

/**
 * Gas estimator for transaction fees
 */
class GasEstimator {
  private provider: Provider;
  private chainConfig: ChainConfig;

  constructor(provider: Provider, chainConfig: ChainConfig) {
    this.provider = provider;
    this.chainConfig = chainConfig;
  }

  /**
   * Estimate gas for transaction
   */
  public async estimateGas(
    to: string,
    data: string,
    from: string,
    value: bigint = 0n
  ): Promise<bigint> {
    try {
      const estimated = await this.provider.estimateGas({
        to,
        data,
        from,
        value,
      });

      // Add buffer for safety
      return (estimated * 120n) / 100n;
    } catch (error) {
      logger.warn({ error }, 'Gas estimation failed, using default');
      return this.chainConfig.gas.gasLimit;
    }
  }

  /**
   * Get current gas price
   */
  public async getGasPrice(): Promise<{
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
    gasPrice: bigint;
  }> {
    try {
      const feeData = await this.provider.getFeeData();

      return {
        maxFeePerGas: feeData.maxFeePerGas ?? this.chainConfig.gas.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? this.chainConfig.gas.maxPriorityFeePerGas,
        gasPrice: feeData.gasPrice ?? this.chainConfig.gas.maxFeePerGas,
      };
    } catch (error) {
      logger.warn('Failed to get gas price, using config defaults');
      return {
        maxFeePerGas: this.chainConfig.gas.maxFeePerGas,
        maxPriorityFeePerGas: this.chainConfig.gas.maxPriorityFeePerGas,
        gasPrice: this.chainConfig.gas.maxFeePerGas,
      };
    }
  }

  /**
   * Calculate gas cost for a transaction
   */
  public async calculateGasCost(gasLimit: bigint): Promise<bigint> {
    const { maxFeePerGas } = await this.getGasPrice();
    return gasLimit * maxFeePerGas;
  }
}

/**
 * Transaction executor for arbitrage trades
 */
export class TransactionExecutor {
  private config: ExecutorConfig;
  private chainConfig: ChainConfig;
  private provider: Provider;
  private wallet: Wallet;
  private arbitrageContract: Contract;
  private nonceManager: NonceManager;
  private gasEstimator: GasEstimator;
  private isExecuting: boolean = false;
  private settings: BotSettings;

  constructor(config: ExecutorConfig) {
    this.config = config;
    this.chainConfig = getChainConfig(config.chainId);
    this.settings = { ...DEFAULT_BOT_SETTINGS, ...config.settings };

    // Initialize provider
    this.provider = new JsonRpcProvider(this.chainConfig.rpcUrls[0]);

    // Initialize wallet
    this.wallet = new Wallet(config.privateKey, this.provider);

    // Initialize arbitrage contract
    this.arbitrageContract = new Contract(
      config.arbitrageContractAddress,
      ARBITRAGE_CONTRACT_ABI,
      this.wallet
    );

    // Initialize helpers
    this.nonceManager = new NonceManager(this.provider, this.wallet.address);
    this.gasEstimator = new GasEstimator(this.provider, this.chainConfig);

    logger.info(`Executor initialized for chain ${this.chainConfig.name}`);
    logger.info(`Wallet address: ${this.wallet.address}`);
    logger.info(`Arbitrage contract: ${config.arbitrageContractAddress}`);
  }

  /**
   * Check profitability of an arbitrage opportunity
   */
  public async checkProfitability(
    opportunity: ArbitrageOpportunity
  ): Promise<ProfitabilityResult> {
    logger.info('Checking profitability...');

    try {
      const { tokenPair, buyPool, sellPool } = opportunity;

      // Get pool liquidity
      const buyLiquidity = await this.getPoolLiquidity(buyPool);

      // Calculate optimal trade size (50% of available liquidity)
      const percentage = Big(0.5);
      const maxTradeSize = Big(buyLiquidity.toString()).mul(percentage);
      const tradeAmount = BigInt(maxTradeSize.round().toFixed(0));

      // Quote buying on first DEX
      const buyQuoter = new Contract(
        buyPool.dexConfig.quoter,
        QUOTER_ABI,
        this.provider
      );

      const buyQuoteParams = {
        tokenIn: tokenPair.token0.address,
        tokenOut: tokenPair.token1.address,
        amount: tradeAmount,
        fee: tokenPair.poolFee,
        sqrtPriceLimitX96: 0n,
      };

      const quoteExactOutputSingle = buyQuoter.getFunction('quoteExactOutputSingle');
      const amountInQuote = await quoteExactOutputSingle.staticCall(buyQuoteParams);
      const amountIn = BigInt(amountInQuote.toString());

      // Quote selling on second DEX
      const sellQuoter = new Contract(
        sellPool.dexConfig.quoter,
        QUOTER_ABI,
        this.provider
      );

      const sellQuoteParams = {
        tokenIn: tokenPair.token1.address,
        tokenOut: tokenPair.token0.address,
        amountIn: tradeAmount,
        fee: tokenPair.poolFee,
        sqrtPriceLimitX96: 0n,
      };

      const quoteExactInputSingle = sellQuoter.getFunction('quoteExactInputSingle');
      const amountOutQuote = await quoteExactInputSingle.staticCall(sellQuoteParams);
      const amountOut = BigInt(amountOutQuote.toString());

      // Calculate gas cost
      const gasCost = await this.gasEstimator.calculateGasCost(
        this.chainConfig.gas.gasLimit
      );

      // Calculate profit
      const grossProfit = amountOut - amountIn;
      const netProfit = grossProfit - gasCost;
      const profitMargin = Number(netProfit) / Number(amountIn) * 100;

      const result: ProfitabilityResult = {
        isProfitable: false,
        amountIn,
        amountOut,
        estimatedProfit: netProfit,
        gasCost,
        profitMargin,
      };

      // Validate profitability conditions
      if (amountOut < amountIn) {
        result.reason = 'Not enough to cover flash loan repayment';
        return result;
      }

      // Check ETH balance for gas
      const ethBalance = await this.provider.getBalance(this.wallet.address);
      if (ethBalance < gasCost) {
        result.reason = 'Insufficient ETH for gas';
        return result;
      }

      // Check minimum profit threshold
      if (netProfit <= 0n) {
        result.reason = 'Net profit is negative after gas';
        return result;
      }

      // Check minimum profit margin
      if (profitMargin < 0.1) {
        result.reason = `Profit margin too low: ${profitMargin.toFixed(4)}%`;
        return result;
      }

      result.isProfitable = true;
      logger.info(`Profitable trade found!`);
      logger.info(`Amount In: ${ethers.formatUnits(amountIn, tokenPair.token0.decimals)}`);
      logger.info(`Amount Out: ${ethers.formatUnits(amountOut, tokenPair.token0.decimals)}`);
      logger.info(`Gas Cost: ${ethers.formatEther(gasCost)} ETH`);
      logger.info(`Net Profit: ${ethers.formatUnits(netProfit, tokenPair.token0.decimals)}`);
      logger.info(`Profit Margin: ${profitMargin.toFixed(4)}%`);

      return result;
    } catch (error) {
      logger.error({ error }, 'Error checking profitability');
      return {
        isProfitable: false,
        amountIn: 0n,
        amountOut: 0n,
        estimatedProfit: 0n,
        gasCost: 0n,
        profitMargin: 0,
        reason: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get pool liquidity
   */
  private async getPoolLiquidity(pool: PoolInfo): Promise<bigint> {
    try {
      const liquidityFn = pool.contract.getFunction('liquidity');
      const liquidity = await liquidityFn.staticCall();
      return BigInt(liquidity.toString());
    } catch (error) {
      logger.error({ error, dexName: pool.dexName }, 'Error getting liquidity');
      return 0n;
    }
  }

  /**
   * Execute arbitrage trade with flash loan
   */
  public async executeTrade(
    opportunity: ArbitrageOpportunity,
    amount: bigint,
    provider: FlashLoanProvider = FlashLoanProvider.AAVE_V3
  ): Promise<ExecutionResult> {
    if (this.isExecuting) {
      return {
        success: false,
        error: 'Another trade is currently executing',
        timestamp: Date.now(),
      };
    }

    this.isExecuting = true;
    const startTime = Date.now();

    try {
      logger.info(`Executing arbitrage trade with ${provider === FlashLoanProvider.AAVE_V3 ? 'Aave V3' : 'Balancer V2'} flash loan...`);

      const { tokenPair, buyPool, sellPool } = opportunity;

      // Build router path
      const routerPath = [buyPool.dexConfig.router, sellPool.dexConfig.router];

      // Build token path (circular: token0 -> token1 -> token0)
      const tokenPath = [tokenPair.token0.address, tokenPair.token1.address, tokenPair.token0.address];
      
      // Build fee array for each swap leg
      const fees = [tokenPair.poolFee, tokenPair.poolFee];

      // Get balances before
      const tokenBalanceBeforeFn = tokenPair.token0.contract.getFunction('balanceOf');
      const tokenBalanceBefore = await tokenBalanceBeforeFn.staticCall(this.wallet.address);
      const tokenBalanceBeforeBigInt = BigInt(tokenBalanceBefore.toString());
      const ethBalanceBefore = await this.provider.getBalance(this.wallet.address);

      // Estimate gas
      const gasLimit = await this.gasEstimator.estimateGas(
        this.config.arbitrageContractAddress,
        this.arbitrageContract.interface.encodeFunctionData('executeTrade', [
          routerPath,
          tokenPath,
          fees,
          amount,
          provider,
        ]),
        this.wallet.address
      );

      // Get gas price
      const { maxFeePerGas, maxPriorityFeePerGas } = await this.gasEstimator.getGasPrice();

      // Get nonce
      const nonce = await this.nonceManager.getNextNonce();

      // Build transaction
      const txRequest = {
        to: this.config.arbitrageContractAddress,
        data: this.arbitrageContract.interface.encodeFunctionData('executeTrade', [
          routerPath,
          tokenPath,
          fees,
          amount,
          provider,
        ]),
        gasLimit,
        maxFeePerGas,
        maxPriorityFeePerGas,
        nonce,
        chainId: this.config.chainId,
      };

      logger.info(`Sending transaction with nonce ${nonce}...`);

      let receipt: TransactionReceipt | null = null;
      let tx: TransactionResponse;

      // Execute with retries
      for (let attempt = 1; attempt <= this.settings.maxRetries; attempt++) {
        try {
          tx = await this.wallet.sendTransaction(txRequest);
          logger.info(`Transaction sent: ${tx.hash}`);
          logger.info(`Waiting for confirmation...`);

          receipt = await tx.wait(1);

          if (receipt?.status === 1) {
            break;
          }

          throw new Error('Transaction failed');
        } catch (error) {
          logger.warn(
            { error, attempt, maxRetries: this.settings.maxRetries },
            'Execution attempt failed'
          );

          if (attempt < this.settings.maxRetries) {
            await new Promise((resolve) =>
              setTimeout(resolve, this.settings.retryDelayMs)
            );
            await this.nonceManager.reset();
            txRequest.nonce = await this.nonceManager.getNextNonce();
          } else {
            throw error;
          }
        }
      }

      if (!receipt || receipt.status !== 1) {
        throw new Error('Transaction failed after all retries');
      }

      // Get balances after
      const tokenBalanceAfterFn = tokenPair.token0.contract.getFunction('balanceOf');
      const tokenBalanceAfter = await tokenBalanceAfterFn.staticCall(this.wallet.address);
      const tokenBalanceAfterBigInt = BigInt(tokenBalanceAfter.toString());
      const ethBalanceAfter = await this.provider.getBalance(this.wallet.address);

      // Calculate profit
      const tokenProfit = tokenBalanceAfterBigInt - tokenBalanceBeforeBigInt;
      const ethSpent = ethBalanceBefore - ethBalanceAfter;

      const executionTime = Date.now() - startTime;

      logger.info(`Trade completed in ${executionTime}ms`);
      logger.info(`Transaction hash: ${receipt.hash}`);
      logger.info(`Gas used: ${receipt.gasUsed.toString()}`);
      logger.info(`Token profit: ${ethers.formatUnits(tokenProfit, tokenPair.token0.decimals)}`);
      logger.info(`ETH spent: ${ethers.formatEther(ethSpent)}`);

      return {
        success: true,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        gasPrice: receipt.gasPrice ?? 0n,
        profit: tokenProfit,
        timestamp: Date.now(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error: errorMessage }, 'Trade execution failed');

      return {
        success: false,
        error: errorMessage,
        timestamp: Date.now(),
      };
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * Execute dry run (simulation)
   */
  public async dryRun(
    opportunity: ArbitrageOpportunity,
    _amount: bigint
  ): Promise<ExecutionResult> {
    logger.info('Running dry run simulation...');

    try {
      const profitability = await this.checkProfitability(opportunity);

      return {
        success: profitability.isProfitable,
        ...(profitability.reason ? { error: profitability.reason } : {}),
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Get wallet address
   */
  public getWalletAddress(): string {
    return this.wallet.address;
  }

  /**
   * Get wallet balances
   */
  public async getBalances(): Promise<{
    eth: bigint;
    ethFormatted: string;
  }> {
    const ethBalance = await this.provider.getBalance(this.wallet.address);

    return {
      eth: ethBalance,
      ethFormatted: ethers.formatEther(ethBalance),
    };
  }

  /**
   * Check if executor is currently executing
   */
  public isCurrentlyExecuting(): boolean {
    return this.isExecuting;
  }

  /**
   * Withdraw accumulated profits from arbitrage contract
   */
  public async withdrawProfits(
    tokenAddress: string
  ): Promise<TransactionReceipt> {
    logger.info(`Withdrawing accumulated profits for token ${tokenAddress}...`);

    const withdrawProfits = this.arbitrageContract.getFunction('withdrawProfits');
    const tx = await withdrawProfits.send(tokenAddress);
    const receipt = await tx.wait();
    if (!receipt) {
      throw new Error('Withdrawal transaction receipt not available');
    }

    logger.info(`Profit withdrawal complete: ${receipt.hash}`);
    return receipt;
  }
  
  /**
   * Get accumulated profits for a token
   */
  public async getAccumulatedProfits(tokenAddress: string): Promise<bigint> {
    const accumulatedProfits = this.arbitrageContract.getFunction('accumulatedProfits');
    const profits = await accumulatedProfits.staticCall(tokenAddress);
    return BigInt(profits.toString());
  }

  /**
   * Emergency withdraw all funds
   */
  public async emergencyWithdraw(
    tokenAddress: string,
    recipient: string
  ): Promise<TransactionReceipt> {
    logger.warn(`Executing emergency withdrawal for ${tokenAddress}...`);

    const emergencyWithdraw = this.arbitrageContract.getFunction('emergencyWithdraw');
    const tx = await emergencyWithdraw.send(tokenAddress, recipient);
    const receipt = await tx.wait();
    if (!receipt) {
      throw new Error('Emergency withdrawal transaction receipt not available');
    }

    logger.info(`Emergency withdrawal complete: ${receipt.hash}`);
    return receipt;
  }
}

export default TransactionExecutor;
