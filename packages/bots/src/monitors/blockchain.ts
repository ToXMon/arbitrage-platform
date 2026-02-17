/**
 * BlockchainMonitor - Monitors blockchain for swap events
 * Fetches real token addresses from pool contracts
 */

import { Logger } from 'pino';
import { ethers } from 'ethers';

export interface SwapEvent {
  chainId: number;
  pool: `0x${string}`;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: bigint;
  amountOut: bigint;
  blockNumber: bigint;
  txHash: string;
  timestamp: number;
}

export interface MonitorConfig {
  chainId: number;
  rpcUrl: string;
  wsUrl?: string;
  pools?: `0x${string}`[];
}

export type SwapCallback = (event: SwapEvent) => void;

/**
 * Pool information cache
 */
interface PoolInfo {
  address: string;
  token0: string;
  token1: string;
  fee: number;
  decimals0: number;
  decimals1: number;
}

// Uniswap V3 Pool ABI for fetching token addresses
const UNISWAP_V3_POOL_ABI = [
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function fee() external view returns (uint24)',
  'function liquidity() external view returns (uint128)',
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
];

// ERC20 ABI for decimals
const ERC20_ABI = [
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
  'function name() external view returns (string)',
];

// Uniswap V3 Swap event signature
const SWAP_EVENT_ABI = [
  'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
];

export class BlockchainMonitor {
  private logger: Logger;
  private config: MonitorConfig;
  private provider: ethers.Provider | null = null;
  private running: boolean = false;
  private callbacks: SwapCallback[] = [];
  
  // Pool info cache - maps pool address to pool info
  private poolInfoCache: Map<string, PoolInfo> = new Map();
  // Pending fetches to avoid duplicate calls
  private pendingFetches: Map<string, Promise<PoolInfo>> = new Map();

  constructor(logger: Logger, config: MonitorConfig) {
    this.logger = logger.child({ module: `monitor-${config.chainId}` });
    this.config = config;
  }

  async start(): Promise<void> {
    if (this.running) {
      this.logger.warn('Monitor already running');
      return;
    }

    this.logger.info({ chainId: this.config.chainId }, 'Starting blockchain monitor');

    // Initialize provider
    this.provider = this.config.wsUrl
      ? new ethers.WebSocketProvider(this.config.wsUrl)
      : new ethers.JsonRpcProvider(this.config.rpcUrl);

    // Pre-fetch pool info for all configured pools
    if (this.config.pools && this.config.pools.length > 0) {
      this.logger.info({ poolCount: this.config.pools.length }, 'Pre-fetching pool info');
      await this.prefetchPoolInfo(this.config.pools);
    }

    // Subscribe to new blocks
    this.provider.on('block', (blockNumber) => {
      this.onNewBlock(blockNumber);
    });

    // Subscribe to swap events
    await this.subscribeToSwapEvents();

    this.running = true;
    this.logger.info({ chainId: this.config.chainId }, 'Blockchain monitor started');
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.logger.info({ chainId: this.config.chainId }, 'Stopping blockchain monitor');

    if (this.provider) {
      this.provider.removeAllListeners();
      if ('destroy' in this.provider) {
        await (this.provider as any).destroy();
      }
      this.provider = null;
    }

    this.running = false;
    this.logger.info({ chainId: this.config.chainId }, 'Blockchain monitor stopped');
  }

  onSwap(callback: SwapCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Pre-fetch pool info for all configured pools
   */
  private async prefetchPoolInfo(pools: `0x${string}`[]): Promise<void> {
    const fetchPromises = pools.map(pool => this.getPoolInfo(pool));
    
    try {
      await Promise.allSettled(fetchPromises);
      this.logger.info(
        { cachedCount: this.poolInfoCache.size },
        'Pool info pre-fetch complete'
      );
    } catch (error) {
      this.logger.error({ error }, 'Error pre-fetching pool info');
    }
  }

  /**
   * Get pool info from cache or fetch from chain
   */
  private async getPoolInfo(poolAddress: `0x${string}`): Promise<PoolInfo> {
    const normalizedAddress = ethers.getAddress(poolAddress);
    
    // Check cache first
    const cached = this.poolInfoCache.get(normalizedAddress);
    if (cached) {
      return cached;
    }
    
    // Check for pending fetch to avoid duplicate calls
    const pending = this.pendingFetches.get(normalizedAddress);
    if (pending) {
      return pending;
    }
    
    // Fetch from chain
    const fetchPromise = this.fetchPoolInfoFromChain(normalizedAddress);
    this.pendingFetches.set(normalizedAddress, fetchPromise);
    
    try {
      const poolInfo = await fetchPromise;
      this.poolInfoCache.set(normalizedAddress, poolInfo);
      return poolInfo;
    } finally {
      this.pendingFetches.delete(normalizedAddress);
    }
  }

  /**
   * Fetch pool info from blockchain
   */
  private async fetchPoolInfoFromChain(poolAddress: string): Promise<PoolInfo> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    const poolContract = new ethers.Contract(poolAddress, UNISWAP_V3_POOL_ABI, this.provider);
    
    this.logger.debug({ pool: poolAddress }, 'Fetching pool info from chain');

    // Fetch token addresses and fee in parallel
    const [token0, token1, fee] = await Promise.all([
      poolContract.token0(),
      poolContract.token1(),
      poolContract.fee(),
    ]);

    // Fetch decimals for both tokens
    const token0Contract = new ethers.Contract(token0, ERC20_ABI, this.provider);
    const token1Contract = new ethers.Contract(token1, ERC20_ABI, this.provider);

    let decimals0 = 18;
    let decimals1 = 18;

    try {
      decimals0 = await token0Contract.decimals();
    } catch (error) {
      this.logger.warn({ token: token0 }, 'Could not fetch decimals, using default 18');
    }

    try {
      decimals1 = await token1Contract.decimals();
    } catch (error) {
      this.logger.warn({ token: token1 }, 'Could not fetch decimals, using default 18');
    }

    const poolInfo: PoolInfo = {
      address: poolAddress,
      token0: ethers.getAddress(token0),
      token1: ethers.getAddress(token1),
      fee: Number(fee),
      decimals0: Number(decimals0),
      decimals1: Number(decimals1),
    };

    this.logger.info(
      {
        pool: poolAddress,
        token0: poolInfo.token0,
        token1: poolInfo.token1,
        fee: poolInfo.fee,
      },
      'Pool info fetched'
    );

    return poolInfo;
  }

  private async onNewBlock(blockNumber: number): Promise<void> {
    this.logger.debug({ blockNumber }, 'New block received');

    // In production, this would:
    // 1. Get block with transactions
    // 2. Parse logs for swap events
    // 3. Calculate price impact
    // 4. Trigger strategy evaluation
  }

  private async subscribeToSwapEvents(): Promise<void> {
    // Subscribe to all configured pools
    if (this.config.pools && this.config.pools.length > 0) {
      for (const pool of this.config.pools) {
        // Ensure we have pool info
        await this.getPoolInfo(pool);
        
        const contract = new ethers.Contract(pool, SWAP_EVENT_ABI, this.provider!);

        contract.on('Swap', async (_sender, _recipient, amount0, amount1, sqrtPriceX96, liquidity, tick, event) => {
          await this.handleSwapEvent(pool, amount0, amount1, sqrtPriceX96, liquidity, tick, event);
        });

        this.logger.info({ pool }, 'Subscribed to pool swap events');
      }
    }
  }

  /**
   * Handle swap event with real token addresses
   */
  private async handleSwapEvent(
    pool: `0x${string}`,
    amount0: bigint,
    amount1: bigint,
    _sqrtPriceX96: bigint,
    _liquidity: bigint,
    _tick: number,
    event: any
  ): Promise<void> {
    try {
      // Get pool info (from cache or fetch)
      const poolInfo = await this.getPoolInfo(pool);
      
      // Determine swap direction based on amounts
      // amount0 < 0 means token0 was sold (in), token1 was bought (out)
      // amount0 > 0 means token1 was sold (in), token0 was bought (out)
      let tokenIn: string;
      let tokenOut: string;
      let amountIn: bigint;
      let amountOut: bigint;

      if (amount0 < 0n) {
        // Selling token0 for token1
        tokenIn = poolInfo.token0;
        tokenOut = poolInfo.token1;
        amountIn = -amount0; // Convert to positive
        amountOut = amount1;
      } else {
        // Selling token1 for token0
        tokenIn = poolInfo.token1;
        tokenOut = poolInfo.token0;
        amountIn = -amount1; // Convert to positive
        amountOut = amount0;
      }

      const swapEvent: SwapEvent = {
        chainId: this.config.chainId,
        pool,
        tokenIn: tokenIn as `0x${string}`,
        tokenOut: tokenOut as `0x${string}`,
        amountIn,
        amountOut,
        blockNumber: BigInt(event.blockNumber),
        txHash: event.transactionHash,
        timestamp: Date.now(),
      };

      this.logger.debug(
        {
          pool,
          tokenIn: swapEvent.tokenIn,
          tokenOut: swapEvent.tokenOut,
          amountIn: amountIn.toString(),
          amountOut: amountOut.toString(),
        },
        'Swap event detected'
      );

      // Notify all callbacks
      for (const callback of this.callbacks) {
        try {
          callback(swapEvent);
        } catch (error) {
          this.logger.error({ error }, 'Callback error');
        }
      }
    } catch (error) {
      this.logger.error({ error, pool }, 'Error handling swap event');
    }
  }

  /**
   * Get cached pool info
   */
  getPoolInfoCached(poolAddress: string): PoolInfo | undefined {
    return this.poolInfoCache.get(ethers.getAddress(poolAddress));
  }

  /**
   * Get all cached pools
   */
  getAllCachedPools(): PoolInfo[] {
    return Array.from(this.poolInfoCache.values());
  }

  /**
   * Clear pool cache
   */
  clearPoolCache(): void {
    this.poolInfoCache.clear();
    this.logger.info('Pool cache cleared');
  }

  getChainId(): number {
    return this.config.chainId;
  }

  isRunning(): boolean {
    return this.running;
  }
}
