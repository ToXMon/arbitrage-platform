/**
 * SushiSwap DEX Adapter
 * @module dex/SushiSwap
 */

import { createPublicClient, http, type Address, type PublicClient } from 'viem';
import type { ChainConfig } from '../chains/types';
import type { DexAdapter, QuoteResult, PoolInfo } from './types';

/**
 * SushiSwap V2 Router ABI (simplified)
 */
const ROUTER_ABI = [
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'path', type: 'address[]' },
    ],
    name: 'getAmountsOut',
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * SushiSwap V2 Pair ABI (simplified)
 */
const PAIR_ABI = [
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
    name: 'getReserves',
    outputs: [
      { name: 'reserve0', type: 'uint112' },
      { name: 'reserve1', type: 'uint112' },
      { name: 'blockTimestampLast', type: 'uint32' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * SushiSwap Factory ABI
 */
const FACTORY_ABI = [
  {
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
    ],
    name: 'getPair',
    outputs: [{ name: 'pair', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Contract addresses per chain
 */
const ADDRESSES: Record<number, {
  router: Address;
  factory: Address;
}> = {
  1: {
    router: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
    factory: '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac',
  },
  42161: {
    router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
    factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
  },
  10: {
    router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
    factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
  },
  8453: {
    router: '0x6BDED42c6DA8FBf0d2bA55B2fa120C5e5c822C77',
    factory: '0x7659CEAB2C0334bD008396637EcCf7848eec984c',
  },
  137: {
    router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
    factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
  },
};

/**
 * SushiSwap DEX Adapter implementation (V2 style AMM)
 */
export class SushiSwapAdapter implements DexAdapter {
  readonly name = 'SushiSwap';
  readonly chainId: number;
  readonly router: Address;
  readonly quoter: Address; // Not used in V2
  readonly factory: Address;
  
  private client: PublicClient;

  /**
   * Create new SushiSwap adapter
   * @param chainConfig - Chain configuration
   */
  constructor(chainConfig: ChainConfig) {
    this.chainId = chainConfig.chainId;
    
    const addresses = ADDRESSES[this.chainId];
    if (!addresses) {
      throw new Error(`SushiSwap not supported on chain ${this.chainId}`);
    }
    
    this.router = addresses.router;
    this.factory = addresses.factory;
    this.quoter = '0x0000000000000000000000000000000000000000';
    
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
   * @param _fee - Not used in V2 (fixed 0.3%)
   */
  async getQuote(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint,
    _fee?: number
  ): Promise<QuoteResult> {
    try {
      const amounts = await this.client.readContract({
        address: this.router,
        abi: ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [amountIn, [tokenIn, tokenOut]],
      }) as bigint[];

      return {
        amountOut: amounts[amounts.length - 1],
        path: [tokenIn, tokenOut],
        gasEstimate: BigInt(120000),
        fee: 3000, // 0.3% fixed fee
        dex: this.name,
      };
    } catch (error) {
      throw new Error(`SushiSwap quote failed: ${error}`);
    }
  }

  /**
   * Get pool (pair) information
   * @param tokenA - First token address
   * @param tokenB - Second token address
   * @param _fee - Not used in V2
   */
  async getPoolInfo(
    tokenA: Address,
    tokenB: Address,
    _fee?: number
  ): Promise<PoolInfo> {
    try {
      // Get pair address from factory
      const pairAddress = await this.client.readContract({
        address: this.factory,
        abi: FACTORY_ABI,
        functionName: 'getPair',
        args: [tokenA, tokenB],
      }) as Address;

      if (pairAddress === '0x0000000000000000000000000000000000000000') {
        throw new Error('Pair does not exist');
      }

      // Fetch pair data
      const [token0, token1, reserves] = await Promise.all([
        this.client.readContract({
          address: pairAddress,
          abi: PAIR_ABI,
          functionName: 'token0',
        }),
        this.client.readContract({
          address: pairAddress,
          abi: PAIR_ABI,
          functionName: 'token1',
        }),
        this.client.readContract({
          address: pairAddress,
          abi: PAIR_ABI,
          functionName: 'getReserves',
        }),
      ]);

      const reserveData = reserves as [bigint, bigint, number];
      
      // Calculate sqrt price from reserves
      const reserve0 = reserveData[0];
      const reserve1 = reserveData[1];
      const sqrtPriceX96 = this.calculateSqrtPriceX96(reserve0, reserve1);

      return {
        address: pairAddress,
        token0: token0 as Address,
        token1: token1 as Address,
        fee: 3000, // Fixed 0.3%
        liquidity: reserve0 + reserve1, // Simplified liquidity representation
        sqrtPriceX96,
        tick: 0, // V2 doesn't use ticks
      };
    } catch (error) {
      throw new Error(`Failed to get pair info: ${error}`);
    }
  }

  /**
   * Calculate sqrt price X96 from reserves
   */
  private calculateSqrtPriceX96(reserve0: bigint, reserve1: bigint): bigint {
    if (reserve0 === BigInt(0)) return BigInt(0);
    // price = reserve1 / reserve0
    // sqrtPriceX96 = sqrt(price) * 2^96
    const Q96 = BigInt(2) ** BigInt(96);
    return (BigInt(Math.sqrt(Number(reserve1 * Q96 / reserve0))) * Q96) / BigInt(Math.sqrt(Number(Q96)));
  }

  /**
   * Calculate output amounts for a multi-hop route
   * @param amountIn - Input amount
   * @param path - Token path
   * @param _fees - Not used in V2
   */
  async getAmountsOut(
    amountIn: bigint,
    path: Address[],
    _fees?: number[]
  ): Promise<bigint> {
    if (path.length < 2) {
      throw new Error('Path must have at least 2 tokens');
    }

    try {
      const amounts = await this.client.readContract({
        address: this.router,
        abi: ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [amountIn, path],
      }) as bigint[];

      return amounts[amounts.length - 1];
    } catch (error) {
      throw new Error(`Failed to get amounts out: ${error}`);
    }
  }
}

export default SushiSwapAdapter;
