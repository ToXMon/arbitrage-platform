/**
 * Uniswap V3 DEX Adapter
 * @module dex/UniswapV3
 */

import { createPublicClient, http, type Address, type PublicClient } from 'viem';
import type { ChainConfig } from '../chains/types';
import type { DexAdapter, QuoteResult, PoolInfo } from './types';

/**
 * Uniswap V3 Quoter contract ABI (simplified)
 */
const QUOTER_ABI = [
  {
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'sqrtPriceLimitX96', type: 'uint160' },
    ],
    name: 'quoteExactInputSingle',
    outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

/**
 * Uniswap V3 Pool contract ABI (simplified)
 */
const POOL_ABI = [
  {
    inputs: [],
    name: 'token0',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'token1',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'fee',
    outputs: [{ name: '', type: 'uint24' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'liquidity',
    outputs: [{ name: '', type: 'uint128' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'slot0',
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'observationIndex', type: 'uint16' },
      { name: 'observationCardinality', type: 'uint16' },
      { name: 'observationCardinalityNext', type: 'uint16' },
      { name: 'feeProtocol', type: 'uint32' },
      { name: 'unlocked', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Uniswap V3 Factory ABI for pool address
 */
const FACTORY_ABI = [
  {
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'fee', type: 'uint24' },
    ],
    name: 'getPool',
    outputs: [{ name: 'pool', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Contract addresses per chain
 */
const ADDRESSES: Record<number, {
  router: Address;
  quoter: Address;
  factory: Address;
}> = {
  1: {
    router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    quoter: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  },
  42161: {
    router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    quoter: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  },
  10: {
    router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    quoter: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  },
  8453: {
    router: '0x2626664c2603336E57B271c5C0b26F421741e481',
    quoter: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
    factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
  },
  137: {
    router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    quoter: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  },
};

/**
 * Uniswap V3 DEX Adapter implementation
 */
export class UniswapV3Adapter implements DexAdapter {
  readonly name = 'Uniswap V3';
  readonly chainId: number;
  readonly router: Address;
  readonly quoter: Address;
  readonly factory: Address;
  
  private client: PublicClient;

  /**
   * Create new Uniswap V3 adapter
   * @param chainConfig - Chain configuration
   */
  constructor(chainConfig: ChainConfig) {
    this.chainId = chainConfig.chainId;
    
    const addresses = ADDRESSES[this.chainId];
    if (!addresses) {
      throw new Error(`Uniswap V3 not supported on chain ${this.chainId}`);
    }
    
    this.router = addresses.router;
    this.quoter = addresses.quoter;
    this.factory = addresses.factory;
    
    this.client = createPublicClient({
      chain: this.getViemChain(chainConfig),
      transport: http(chainConfig.rpcUrl),
    });
  }

  /**
   * Get viem chain object from config
   */
  private getViemChain(config: ChainConfig) {
    return {
      id: config.chainId,
      name: config.name,
      nativeCurrency: config.nativeCurrency,
      rpcUrls: {
        default: { http: [config.rpcUrl] },
      },
    };
  }

  /**
   * Get quote for a swap
   * @param tokenIn - Input token address
   * @param tokenOut - Output token address
   * @param amountIn - Input amount in wei
   * @param fee - Pool fee tier (default 3000 = 0.3%)
   */
  async getQuote(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint,
    fee: number = 3000
  ): Promise<QuoteResult> {
    try {
      const amountOut = await this.client.simulateContract({
        address: this.quoter,
        abi: QUOTER_ABI,
        functionName: 'quoteExactInputSingle',
        args: [tokenIn, tokenOut, fee, amountIn, BigInt(0)],
      });

      return {
        amountOut: amountOut.result as bigint,
        path: [tokenIn, tokenOut],
        gasEstimate: BigInt(150000),
        fee,
        dex: this.name,
      };
    } catch (error) {
      throw new Error(`Uniswap V3 quote failed: ${error}`);
    }
  }

  /**
   * Get pool information
   * @param tokenA - First token address
   * @param tokenB - Second token address
   * @param fee - Pool fee tier
   */
  async getPoolInfo(
    tokenA: Address,
    tokenB: Address,
    fee: number
  ): Promise<PoolInfo> {
    try {
      // Get pool address from factory
      const poolAddress = await this.client.readContract({
        address: this.factory,
        abi: FACTORY_ABI,
        functionName: 'getPool',
        args: [tokenA, tokenB, fee],
      }) as Address;

      if (poolAddress === '0x0000000000000000000000000000000000000000') {
        throw new Error('Pool does not exist');
      }

      // Fetch pool data
      const [token0, token1, liquidity, slot0] = await Promise.all([
        this.client.readContract({
          address: poolAddress,
          abi: POOL_ABI,
          functionName: 'token0',
        }),
        this.client.readContract({
          address: poolAddress,
          abi: POOL_ABI,
          functionName: 'token1',
        }),
        this.client.readContract({
          address: poolAddress,
          abi: POOL_ABI,
          functionName: 'liquidity',
        }),
        this.client.readContract({
          address: poolAddress,
          abi: POOL_ABI,
          functionName: 'slot0',
        }),
      ]);

      return {
        address: poolAddress,
        token0: token0 as Address,
        token1: token1 as Address,
        fee,
        liquidity: liquidity as bigint,
        sqrtPriceX96: (slot0 as any[])[0],
        tick: (slot0 as any[])[1],
      };
    } catch (error) {
      throw new Error(`Failed to get pool info: ${error}`);
    }
  }

  /**
   * Calculate output amounts for a multi-hop route
   * @param amountIn - Input amount
   * @param path - Token path
   * @param fees - Fee for each hop
   */
  async getAmountsOut(
    amountIn: bigint,
    path: Address[],
    fees: number[]
  ): Promise<bigint> {
    if (path.length < 2) {
      throw new Error('Path must have at least 2 tokens');
    }
    if (fees.length !== path.length - 1) {
      throw new Error('Fees array must be one less than path length');
    }

    let currentAmount = amountIn;
    
    for (let i = 0; i < path.length - 1; i++) {
      const quote = await this.getQuote(
        path[i],
        path[i + 1],
        currentAmount,
        fees[i]
      );
      currentAmount = quote.amountOut;
    }

    return currentAmount;
  }
}

export default UniswapV3Adapter;
