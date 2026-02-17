/**
 * FlashLoanExecutor - Executes flash loan arbitrage
 */

import { Logger } from 'pino';
import { ethers } from 'ethers';
import { ExecutionRequest, ExecutionResult } from './engine';
import { ARBITRAGE_ABI } from '../../../sdk/src/abi';

// FlashLoanProvider enum matching contract
export enum FlashLoanProvider {
  AAVE_V3 = 0,
  BALANCER_V2 = 1,
}

// Extended Arbitrage ABI with executeTrade
const ARBITRAGE_EXEC_ABI = [
  'function executeTrade(address[] calldata _routerPath, address[] calldata _tokenPath, uint24[] calldata _fees, uint256 _flashAmount, uint8 _provider) external',
  'function owner() external view returns (address)',
  'function paused() external view returns (bool)',
  'function emergencyWithdraw(address token, address to) external',
  'function getChainConfig(uint256 chainId) external view returns (tuple(address aaveProvider, address balancerVault, bool isActive))',
  'event ArbitrageExecuted(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, uint256 profit, address[] routerPath, uint256 timestamp)',
  'event FlashLoanExecuted(address indexed provider, address indexed token, uint256 amount, uint256 fee, uint256 timestamp)',
];

export class FlashLoanExecutor {
  private logger: Logger;
  private wallet: ethers.Wallet | null = null;
  private arbitrageContract: ethers.Contract | null = null;
  private provider: ethers.JsonRpcProvider | null = null;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'flashloan-executor' });
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    this.logger.info(
      { opportunityId: request.opportunityId, amountIn: request.route.amountIn.toString() },
      'Executing flash loan arbitrage'
    );

    if (!this.wallet || !this.arbitrageContract) {
      return {
        success: false,
        error: 'FlashLoanExecutor not initialized. Call initialize() first.',
      };
    }

    try {
      // Extract path from route
      const { path } = request.route;
      if (path.length < 2) {
        return {
          success: false,
          error: 'Invalid path: must have at least 2 tokens',
        };
      }

      // Build router path and token path
      // For triangular arbitrage: WETH -> USDC -> DAI -> WETH
      // routerPath length = tokenPath.length - 1
      const tokenPath: string[] = path.map(addr => ethers.getAddress(addr));
      
      // Default to Uniswap V3 router for all legs (can be made configurable)
      // In production, this would come from the strategy/opportunity
      const routerAddress = await this.getDefaultRouter();
      const routerPath: string[] = [];
      const fees: number[] = [];
      
      for (let i = 0; i < tokenPath.length - 1; i++) {
        routerPath.push(routerAddress);
        // Default fee tier 3000 (0.3%) - should come from opportunity
        fees.push(3000);
      }

      const flashAmount = request.route.amountIn;
      const provider = FlashLoanProvider.AAVE_V3; // Default to Aave, can be configurable

      this.logger.info(
        {
          tokenPath,
          routerPath,
          fees,
          flashAmount: flashAmount.toString(),
          provider
        },
        'Calling executeTrade on arbitrage contract'
      );

      // Check if contract is paused
      const paused = await this.arbitrageContract.paused();
      if (paused) {
        return {
          success: false,
          error: 'Arbitrage contract is paused',
        };
      }

      // Get gas price with multiplier for faster inclusion
      const feeData = await this.provider!.getFeeData();
      const maxFeePerGas = feeData.maxFeePerGas 
        ? (feeData.maxFeePerGas * 110n) / 100n // 10% bump
        : undefined;
      const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas
        ? (feeData.maxPriorityFeePerGas * 110n) / 100n
        : undefined;

      // Execute the trade
      const tx = await this.arbitrageContract.executeTrade(
        routerPath,
        tokenPath,
        fees,
        flashAmount,
        provider,
        {
          gasLimit: request.gasEstimate || 500000n,
          maxFeePerGas,
          maxPriorityFeePerGas,
        }
      );

      this.logger.info({ txHash: tx.hash }, 'Transaction submitted, waiting for confirmation');

      // Wait for transaction confirmation
      const receipt = await tx.wait(1); // Wait for 1 confirmation

      if (!receipt || receipt.status === 0) {
        return {
          success: false,
          error: 'Transaction reverted on chain',
          txHash: tx.hash,
        };
      }

      // Parse events to get actual profit
      let actualProfit = 0n;
      for (const log of receipt.logs) {
        try {
          const parsedLog = this.arbitrageContract.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          if (parsedLog?.name === 'ArbitrageExecuted') {
            actualProfit = BigInt(parsedLog.args.profit.toString());
            this.logger.info(
              {
                tokenIn: parsedLog.args.tokenIn,
                tokenOut: parsedLog.args.tokenOut,
                amountIn: parsedLog.args.amountIn.toString(),
                amountOut: parsedLog.args.amountOut.toString(),
                profit: actualProfit.toString(),
              },
              'Arbitrage executed successfully'
            );
          }
        } catch {
          // Skip logs that don't match our ABI
        }
      }

      return {
        success: true,
        txHash: tx.hash,
        actualProfit: actualProfit > 0n ? actualProfit : request.expectedProfit,
      };
    } catch (error) {
      this.logger.error({ error, request }, 'Flash loan execution failed');
      
      // Extract revert reason if available
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        if (error.message.includes('reason=')) {
          const match = error.message.match(/reason="([^"]+)"/);
          if (match) errorMessage = match[1];
        } else {
          errorMessage = error.message;
        }
      }
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  private async getDefaultRouter(): Promise<string> {
    // Default Uniswap V3 SwapRouter - should be configurable per chain
    // Ethereum mainnet: 0xE592427A0AEce92De3Edee1F18E0157C05861564
    // For now, use a configurable default
    return process.env.DEFAULT_ROUTER || '0xE592427A0AEce92De3Edee1F18E0157C05861564';
  }

  async initialize(
    privateKey: string,
    rpcUrl: string,
    arbitrageAddress: string
  ): Promise<void> {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.arbitrageContract = new ethers.Contract(
      ethers.getAddress(arbitrageAddress),
      ARBITRAGE_EXEC_ABI,
      this.wallet
    );
    
    // Verify contract is deployed and accessible
    const code = await this.provider.getCode(arbitrageAddress);
    if (code === '0x') {
      throw new Error(`No contract deployed at ${arbitrageAddress}`);
    }
    
    this.logger.info(
      { address: this.wallet.address, contract: arbitrageAddress },
      'Flash loan executor initialized'
    );
  }

  getAddress(): string | undefined {
    return this.wallet?.address;
  }

  getContractAddress(): string | undefined {
    if (!this.arbitrageContract) return undefined;
    return this.arbitrageContract.target as string;
  }

  async estimateProfit(
    request: ExecutionRequest,
    gasPrice: bigint
  ): Promise<bigint> {
    // Calculate expected profit after gas costs
    const gasCost = gasPrice * request.gasEstimate;
    
    // Account for flash loan fee (Aave: 0.09%, Balancer: 0%)
    const flashLoanFeeBps = 9n; // 0.09% for Aave
    const flashLoanFee = (request.route.amountIn * flashLoanFeeBps) / 10000n;
    
    const netProfit = request.expectedProfit - gasCost - flashLoanFee;
    return netProfit > 0n ? netProfit : 0n;
  }
}
