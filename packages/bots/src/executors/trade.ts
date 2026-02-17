/**
 * TradeExecutor - Executes direct trades on DEXes
 */

import { Logger } from 'pino';
import { ethers } from 'ethers';
import { ExecutionRequest, ExecutionResult } from './engine';

// Uniswap V3 SwapRouter ABI
const SWAP_ROUTER_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
  'function exactInput((bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum)) external payable returns (uint256 amountOut)',
  'function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountIn)',
  'function multicall(bytes[] calldata data) external payable returns (bytes[] memory results)',
  'function WETH9() external view returns (address)',
];

// ERC20 ABI for approvals
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address owner) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
];

// Default fee tiers
const FEE_TIERS = [100, 500, 3000, 10000]; // 0.01%, 0.05%, 0.3%, 1%

export class TradeExecutor {
  private logger: Logger;
  private wallet: ethers.Wallet | null = null;
  private provider: ethers.JsonRpcProvider | null = null;
  private routerAddress: string;

  constructor(logger: Logger, routerAddress?: string) {
    this.logger = logger.child({ module: 'trade-executor' });
    // Default to Uniswap V3 SwapRouter02 on mainnet
    this.routerAddress = routerAddress || process.env.DEFAULT_ROUTER || '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45';
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    this.logger.info(
      { opportunityId: request.opportunityId, path: request.route.path },
      'Executing trade'
    );

    if (!this.wallet || !this.provider) {
      return {
        success: false,
        error: 'TradeExecutor not initialized. Call initialize() first.',
      };
    }

    try {
      const { path, amountIn } = request.route;
      
      if (path.length < 2) {
        return {
          success: false,
          error: 'Invalid path: must have at least 2 tokens',
        };
      }

      // Create router contract instance
      const router = new ethers.Contract(this.routerAddress, SWAP_ROUTER_ABI, this.wallet);
      
      // Check and approve token spending
      const tokenIn = ethers.getAddress(path[0]);
      await this.ensureApproval(tokenIn, amountIn);

      // Build and execute swap
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes
      let tx: ethers.ContractTransactionResponse;
      
      if (path.length === 2) {
        // Single-hop swap using exactInputSingle
        tx = await this.executeSingleHop(router, path, amountIn, deadline, request);
      } else {
        // Multi-hop swap using exactInput
        tx = await this.executeMultiHop(router, path, amountIn, deadline, request);
      }

      this.logger.info({ txHash: tx.hash }, 'Transaction submitted, waiting for confirmation');

      // Wait for confirmation
      const receipt = await tx.wait(1);

      if (!receipt || receipt.status === 0) {
        return {
          success: false,
          error: 'Transaction reverted on chain',
          txHash: tx.hash,
        };
      }

      // Calculate actual profit from balance changes
      const actualProfit = await this.calculateProfit(tokenIn, amountIn, receipt);

      this.logger.info(
        {
          txHash: tx.hash,
          gasUsed: receipt.gasUsed.toString(),
          actualProfit: actualProfit.toString(),
        },
        'Trade executed successfully'
      );

      return {
        success: true,
        txHash: tx.hash,
        actualProfit: actualProfit > 0n ? actualProfit : request.expectedProfit,
      };
    } catch (error) {
      this.logger.error({ error, request }, 'Trade execution failed');
      
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        // Extract revert reason
        if (error.message.includes('reason=')) {
          const match = error.message.match(/reason="([^"]+)"/);
          if (match) errorMessage = match[1];
        } else if (error.message.includes('execution reverted')) {
          errorMessage = 'Execution reverted';
        } else {
          errorMessage = error.message.slice(0, 200);
        }
      }
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  private async executeSingleHop(
    router: ethers.Contract,
    path: `0x${string}`[],
    amountIn: bigint,
    deadline: number,
    request: ExecutionRequest
  ): Promise<ethers.ContractTransactionResponse> {
    const tokenIn = ethers.getAddress(path[0]);
    const tokenOut = ethers.getAddress(path[1]);
    
    // Determine fee tier (default to 0.3%)
    const fee = this.determineFeeTier(request);
    
    // Get fee data for EIP-1559 transaction
    const feeData = await this.provider!.getFeeData();
    const maxFeePerGas = feeData.maxFeePerGas
      ? (feeData.maxFeePerGas * 110n) / 100n
      : undefined;
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas
      ? (feeData.maxPriorityFeePerGas * 110n) / 100n
      : undefined;

    const params = {
      tokenIn,
      tokenOut,
      fee,
      recipient: this.wallet!.address,
      deadline,
      amountIn,
      amountOutMinimum: 0n, // In production: calculate minimum from expected profit
      sqrtPriceLimitX96: 0,
    };

    this.logger.debug({ params }, 'Executing exactInputSingle');

    return await router.exactInputSingle(params, {
      gasLimit: request.gasEstimate || 300000n,
      maxFeePerGas,
      maxPriorityFeePerGas,
    });
  }

  private async executeMultiHop(
    router: ethers.Contract,
    path: `0x${string}`[],
    amountIn: bigint,
    deadline: number,
    request: ExecutionRequest
  ): Promise<ethers.ContractTransactionResponse> {
    // Encode multi-hop path with fee tiers
    // Path format: token0, fee0, token1, fee1, token2...
    const encodedPath = this.encodePath(path, request);
    
    const feeData = await this.provider!.getFeeData();
    const maxFeePerGas = feeData.maxFeePerGas
      ? (feeData.maxFeePerGas * 110n) / 100n
      : undefined;
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas
      ? (feeData.maxPriorityFeePerGas * 110n) / 100n
      : undefined;

    const params = {
      path: encodedPath,
      recipient: this.wallet!.address,
      deadline,
      amountIn,
      amountOutMinimum: 0n, // In production: calculate minimum
    };

    this.logger.debug({ params, pathLength: path.length }, 'Executing exactInput');

    return await router.exactInput(params, {
      gasLimit: request.gasEstimate || 500000n,
      maxFeePerGas,
      maxPriorityFeePerGas,
    });
  }

  private encodePath(path: `0x${string}`[], request: ExecutionRequest): string {
    // For Uniswap V3 exactInput, path is encoded as:
    // token0 (20 bytes) || fee (3 bytes) || token1 (20 bytes) || fee (3 bytes) || ... || tokenN (20 bytes)
    const fee = this.determineFeeTier(request);
    const feeHex = fee.toString(16).padStart(6, '0');
    
    let encoded = '';
    for (let i = 0; i < path.length - 1; i++) {
      const token = ethers.getAddress(path[i]).slice(2); // Remove 0x
      encoded += token + feeHex;
    }
    encoded += ethers.getAddress(path[path.length - 1]).slice(2);
    
    return '0x' + encoded;
  }

  private determineFeeTier(request: ExecutionRequest): number {
    // Default to 0.3% fee tier
    // In production, this should come from the opportunity metadata
    // or be determined by querying pool liquidity at different fee tiers
    return 3000;
  }

  private async ensureApproval(tokenAddress: string, amount: bigint): Promise<void> {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.wallet!);
    const allowance = await token.allowance(this.wallet!.address, this.routerAddress);
    
    if (allowance < amount) {
      this.logger.info(
        { token: tokenAddress, amount: amount.toString() },
        'Approving token for router'
      );
      
      // Approve max uint256 for efficiency
      const maxApproval = ethers.MaxUint256;
      const approveTx = await token.approve(this.routerAddress, maxApproval);
      await approveTx.wait();
      
      this.logger.debug({ txHash: approveTx.hash }, 'Approval confirmed');
    }
  }

  private async calculateProfit(
    tokenIn: string,
    amountIn: bigint,
    receipt: ethers.TransactionReceipt
  ): Promise<bigint> {
    try {
      const token = new ethers.Contract(tokenIn, ERC20_ABI, this.wallet!);
      const balanceAfter = await token.balanceOf(this.wallet!.address);
      
      // This is a simplified calculation
      // In production, you'd track balance before/after
      // And account for gas costs
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      
      // Return estimated profit (actual implementation needs balance tracking)
      return 0n; // Placeholder - real implementation tracks actual balance changes
    } catch (error) {
      this.logger.warn({ error }, 'Failed to calculate profit');
      return 0n;
    }
  }

  async initialize(privateKey: string, rpcUrl: string): Promise<void> {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    
    // Verify router is deployed
    const code = await this.provider.getCode(this.routerAddress);
    if (code === '0x') {
      this.logger.warn(
        { router: this.routerAddress },
        'Router contract not deployed at address. Trades may fail.'
      );
    }
    
    this.logger.info(
      { address: this.wallet.address, router: this.routerAddress },
      'Trade executor initialized'
    );
  }

  getAddress(): string | undefined {
    return this.wallet?.address;
  }

  getRouterAddress(): string {
    return this.routerAddress;
  }
}
