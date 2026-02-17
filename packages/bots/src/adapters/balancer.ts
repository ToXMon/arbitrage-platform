/**
 * @fileoverview Balancer V2 adapter for handling all pool types
 * Supports Weighted, Stable, MetaStable, and ComposableStable pools
 */

import { ethers, Contract, Provider } from 'ethers';
import Big from 'big.js';
import { logger } from '../index.js';
import {
  BALANCER_VAULT_ABI,
  BALANCER_POOL_ABI,
  BalancerPoolType,
  SwapKind,
  getBalancerVaultAddress,
} from '../abis/balancer-vault.js';

/**
 * Balancer pool information
 */
export interface BalancerPoolInfo {
  address: string;
  poolId: string;
  poolType: BalancerPoolType;
  tokens: string[];
  balances: bigint[];
  weights?: bigint[]; // For Weighted pools
  amplificationParameter?: bigint; // For Stable pools
}

/**
 * Balancer swap parameters
 */
export interface BalancerSwapParams {
  poolId: string;
  tokenIn: string;
  tokenOut: string;
  amount: bigint;
  kind: SwapKind;
  userData: string;
}

/**
 * Balancer quote result
 */
export interface BalancerQuoteResult {
  amountOut: bigint;
  priceImpact: number;
  effectivePrice: Big;
}

/**
 * Balancer V2 adapter for all pool types
 */
export class BalancerAdapter {
  private provider: Provider;
  private vaultAddress: string;
  private vaultContract: Contract;
  private poolCache: Map<string, BalancerPoolInfo> = new Map();

  constructor(provider: Provider, chainId: number) {
    this.provider = provider;
    this.vaultAddress = getBalancerVaultAddress(chainId);
    this.vaultContract = new Contract(this.vaultAddress, BALANCER_VAULT_ABI, provider);

    logger.info(`BalancerAdapter initialized for chain ${chainId}`);
    logger.info(`Vault address: ${this.vaultAddress}`);
  }

  /**
   * Get pool information from Balancer Vault
   */
  async getPoolInfo(poolAddress: string): Promise<BalancerPoolInfo> {
    const cached = this.poolCache.get(poolAddress.toLowerCase());
    if (cached) {
      return cached;
    }

    try {
      const poolContract = new Contract(poolAddress, BALANCER_POOL_ABI, this.provider);

      // Get pool ID
      const getPoolIdFn = poolContract.getFunction('getPoolId');
      const poolId = await getPoolIdFn.staticCall() as string;

      // Get pool tokens and balances from Vault
      const getPoolTokensFn = this.vaultContract.getFunction('getPoolTokens');
      const [tokens, balances] = await getPoolTokensFn.staticCall(poolId) as [string[], bigint[]];

      // Determine pool type and get type-specific data
      const poolType = await this.detectPoolType(poolContract);
      
      const poolInfo: BalancerPoolInfo = {
        address: poolAddress,
        poolId,
        poolType,
        tokens,
        balances,
      };

      // Get weights for Weighted pools
      if (poolType === BalancerPoolType.WEIGHTED) {
        try {
          const getNormalizedWeightsFn = poolContract.getFunction('getNormalizedWeights');
          const weights = await getNormalizedWeightsFn.staticCall() as bigint[];
          poolInfo.weights = weights;
        } catch (error) {
          logger.warn({ error, poolAddress }, 'Failed to get pool weights');
        }
      }

      // Get amplification parameter for Stable pools
      if (
        poolType === BalancerPoolType.STABLE ||
        poolType === BalancerPoolType.META_STABLE ||
        poolType === BalancerPoolType.COMPOSABLE_STABLE
      ) {
        try {
          const getAmpFn = poolContract.getFunction('getAmplificationParameter');
          const [value] = await getAmpFn.staticCall() as [bigint, boolean, bigint];
          poolInfo.amplificationParameter = value;
        } catch (error) {
          logger.warn({ error, poolAddress }, 'Failed to get amplification parameter');
        }
      }

      this.poolCache.set(poolAddress.toLowerCase(), poolInfo);
      return poolInfo;
    } catch (error) {
      logger.error({ error, poolAddress }, 'Failed to get Balancer pool info');
      throw error;
    }
  }

  /**
   * Detect pool type from contract
   */
  private async detectPoolType(poolContract: Contract): Promise<BalancerPoolType> {
    // Try to detect pool type by checking which functions are available
    try {
      const getNormalizedWeightsFn = poolContract.getFunction('getNormalizedWeights');
      await getNormalizedWeightsFn.staticCall();
      return BalancerPoolType.WEIGHTED;
    } catch {
      // Not a weighted pool
    }

    try {
      const getAmpFn = poolContract.getFunction('getAmplificationParameter');
      await getAmpFn.staticCall();
      
      // Check if it's ComposableStable (has getBptIndex function)
      try {
        const getBptIndexFn = poolContract.getFunction('getBptIndex');
        await getBptIndexFn.staticCall();
        return BalancerPoolType.COMPOSABLE_STABLE;
      } catch {
        // Not ComposableStable
      }

      // Check if it's MetaStable (has getRate function)
      try {
        const getRateFn = poolContract.getFunction('getRate');
        await getRateFn.staticCall();
        return BalancerPoolType.META_STABLE;
      } catch {
        // Not MetaStable
      }

      return BalancerPoolType.STABLE;
    } catch {
      // Not a stable pool
    }

    // Default to Weighted if we can't determine
    logger.warn({ poolAddress: poolContract.target }, 'Could not determine pool type, defaulting to Weighted');
    return BalancerPoolType.WEIGHTED;
  }

  /**
   * Calculate spot price for a token pair in a pool
   */
  async getSpotPrice(
    poolAddress: string,
    tokenIn: string,
    tokenOut: string
  ): Promise<Big> {
    const poolInfo = await this.getPoolInfo(poolAddress);

    const tokenInIndex = poolInfo.tokens.findIndex(
      t => t.toLowerCase() === tokenIn.toLowerCase()
    );
    const tokenOutIndex = poolInfo.tokens.findIndex(
      t => t.toLowerCase() === tokenOut.toLowerCase()
    );

    if (tokenInIndex === -1 || tokenOutIndex === -1) {
      throw new Error('Token not found in pool');
    }

    const balanceIn = poolInfo.balances[tokenInIndex];
    const balanceOut = poolInfo.balances[tokenOutIndex];

    if (!balanceIn || !balanceOut) {
      throw new Error('Invalid pool balances');
    }

    // Calculate spot price based on pool type
    switch (poolInfo.poolType) {
      case BalancerPoolType.WEIGHTED:
        return this.calculateWeightedSpotPrice(
          balanceIn,
          balanceOut,
          poolInfo.weights?.[tokenInIndex],
          poolInfo.weights?.[tokenOutIndex]
        );

      case BalancerPoolType.STABLE:
      case BalancerPoolType.META_STABLE:
      case BalancerPoolType.COMPOSABLE_STABLE:
        return this.calculateStableSpotPrice(balanceIn, balanceOut);

      default:
        throw new Error(`Unsupported pool type: ${poolInfo.poolType}`);
    }
  }

  /**
   * Calculate spot price for Weighted pools
   * Formula: spotPrice = (balanceIn / weightIn) / (balanceOut / weightOut)
   */
  private calculateWeightedSpotPrice(
    balanceIn: bigint,
    balanceOut: bigint,
    weightIn?: bigint,
    weightOut?: bigint
  ): Big {
    if (!weightIn || !weightOut) {
      // If weights not available, assume equal weights
      return Big(balanceIn.toString()).div(Big(balanceOut.toString()));
    }

    const balanceInWeighted = Big(balanceIn.toString()).div(Big(weightIn.toString()));
    const balanceOutWeighted = Big(balanceOut.toString()).div(Big(weightOut.toString()));

    return balanceInWeighted.div(balanceOutWeighted);
  }

  /**
   * Calculate spot price for Stable pools
   * For stable pools, price is approximately 1:1 with small deviations
   */
  private calculateStableSpotPrice(balanceIn: bigint, balanceOut: bigint): Big {
    // Simplified stable pool pricing (actual calculation is more complex)
    // For stable pools, we approximate with balance ratio
    return Big(balanceIn.toString()).div(Big(balanceOut.toString()));
  }

  /**
   * Quote a swap on Balancer (estimate output amount)
   */
  async quoteSwap(
    poolAddress: string,
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint
  ): Promise<BalancerQuoteResult> {
    const poolInfo = await this.getPoolInfo(poolAddress);

    // Get spot price before swap
    const spotPriceBefore = await this.getSpotPrice(poolAddress, tokenIn, tokenOut);

    // Estimate output amount based on pool type
    let amountOut: bigint;

    switch (poolInfo.poolType) {
      case BalancerPoolType.WEIGHTED:
        amountOut = await this.quoteWeightedSwap(poolInfo, tokenIn, tokenOut, amountIn);
        break;

      case BalancerPoolType.STABLE:
      case BalancerPoolType.META_STABLE:
      case BalancerPoolType.COMPOSABLE_STABLE:
        amountOut = await this.quoteStableSwap(poolInfo, tokenIn, tokenOut, amountIn);
        break;

      default:
        throw new Error(`Unsupported pool type for quoting: ${poolInfo.poolType}`);
    }

    // Calculate effective price
    const effectivePrice = Big(amountIn.toString()).div(Big(amountOut.toString()));

    // Calculate price impact
    const priceImpact = effectivePrice.minus(spotPriceBefore).div(spotPriceBefore).mul(100).toNumber();

    return {
      amountOut,
      priceImpact,
      effectivePrice,
    };
  }

  /**
   * Quote swap for Weighted pools
   * Formula: amountOut = balanceOut * (1 - (balanceIn / (balanceIn + amountIn))^(weightIn/weightOut))
   */
  private async quoteWeightedSwap(
    poolInfo: BalancerPoolInfo,
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint
  ): Promise<bigint> {
    const tokenInIndex = poolInfo.tokens.findIndex(t => t.toLowerCase() === tokenIn.toLowerCase());
    const tokenOutIndex = poolInfo.tokens.findIndex(t => t.toLowerCase() === tokenOut.toLowerCase());

    const balanceIn = poolInfo.balances[tokenInIndex];
    const balanceOut = poolInfo.balances[tokenOutIndex];
    const weightIn = poolInfo.weights?.[tokenInIndex];
    const weightOut = poolInfo.weights?.[tokenOutIndex];

    if (!balanceIn || !balanceOut || !weightIn || !weightOut) {
      throw new Error('Invalid pool data for weighted swap quote');
    }

    // Simplified calculation (actual Balancer math is more complex with fees)
    const balanceInAfter = Big(balanceIn.toString()).plus(Big(amountIn.toString()));
    const ratio = Big(balanceIn.toString()).div(balanceInAfter);
    const weightRatio = Big(weightIn.toString()).div(Big(weightOut.toString()));
    const power = ratio.pow(weightRatio.toNumber());
    const amountOut = Big(balanceOut.toString()).mul(Big(1).minus(power));

    return BigInt(amountOut.round().toFixed(0));
  }

  /**
   * Quote swap for Stable pools
   * Simplified stable swap calculation
   */
  private async quoteStableSwap(
    poolInfo: BalancerPoolInfo,
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint
  ): Promise<bigint> {
    const tokenInIndex = poolInfo.tokens.findIndex(t => t.toLowerCase() === tokenIn.toLowerCase());
    const tokenOutIndex = poolInfo.tokens.findIndex(t => t.toLowerCase() === tokenOut.toLowerCase());

    const balanceIn = poolInfo.balances[tokenInIndex];
    const balanceOut = poolInfo.balances[tokenOutIndex];

    if (!balanceIn || !balanceOut) {
      throw new Error('Invalid pool data for stable swap quote');
    }

    // Simplified stable swap (actual StableMath is more complex)
    // For stable pools, approximate 1:1 swap with small slippage
    const slippage = Big(0.001); // 0.1% slippage approximation
    const amountOut = Big(amountIn.toString()).mul(Big(1).minus(slippage));

    return BigInt(amountOut.round().toFixed(0));
  }

  /**
   * Build swap parameters for execution
   */
  buildSwapParams(
    poolId: string,
    tokenIn: string,
    tokenOut: string,
    amount: bigint,
    kind: SwapKind = SwapKind.GIVEN_IN
  ): BalancerSwapParams {
    return {
      poolId,
      tokenIn,
      tokenOut,
      amount,
      kind,
      userData: '0x', // Empty userData for basic swaps
    };
  }

  /**
   * Parse Balancer Swap event
   */
  parseSwapEvent(log: ethers.Log): {
    poolId: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: bigint;
    amountOut: bigint;
  } | null {
    try {
      const iface = new ethers.Interface(BALANCER_VAULT_ABI);
      const parsed = iface.parseLog({
        topics: log.topics as string[],
        data: log.data,
      });

      if (!parsed || parsed.name !== 'Swap') {
        return null;
      }

      return {
        poolId: parsed.args[0] as string,
        tokenIn: parsed.args[1] as string,
        tokenOut: parsed.args[2] as string,
        amountIn: BigInt(parsed.args[3].toString()),
        amountOut: BigInt(parsed.args[4].toString()),
      };
    } catch (error) {
      logger.error({ error }, 'Failed to parse Balancer swap event');
      return null;
    }
  }

  /**
   * Get Vault address
   */
  getVaultAddress(): string {
    return this.vaultAddress;
  }

  /**
   * Clear pool cache
   */
  clearCache(): void {
    this.poolCache.clear();
    logger.info('Balancer pool cache cleared');
  }
}
