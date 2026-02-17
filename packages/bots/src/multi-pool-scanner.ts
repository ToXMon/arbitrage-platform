/**
 * @fileoverview Multi-pool scanner for monitoring discovered pools across multiple DEXes
 * Supports dynamic pool list updates and cross-protocol arbitrage detection
 */

import { ethers, Provider, WebSocketProvider, JsonRpcProvider, Contract, Log } from 'ethers';
import EventEmitter from 'eventemitter3';
import Big from 'big.js';
import { ChainConfig, ChainId, getChainConfig, getDexConfig } from './config.js';
import { logger } from './index.js';
import type { DiscoveredPool } from './subgraph-types.js';
import type {
  SwapEvent,
  TokenInfo,
  PoolInfo,
  PoolPrice,
  ArbitrageOpportunity,
  ScannerEvents,
} from './scanner.js';

/**
 * Pool swap event ABI
 */
const SWAP_EVENT_ABI = [
  'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
];
const SWAP_EVENT_TOPIC = ethers.id(
  'Swap(address,address,int256,int256,uint160,uint128,int24)'
);

/**
 * ERC20 ABI
 */
const ERC20_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function name() view returns (string)',
  'function balanceOf(address) view returns (uint256)',
];

/**
 * Pool ABI
 */
const POOL_ABI = [
  ...SWAP_EVENT_ABI,
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function fee() view returns (uint24)',
  'function liquidity() view returns (uint128)',
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
];

/**
 * Multi-pool scanner configuration
 */
export interface MultiPoolScannerConfig {
  chainId: ChainId;
  pools: DiscoveredPool[];
  priceDifferenceThreshold: number;
  useWebSocket: boolean;
  pollIntervalMs: number;
  poolRefreshIntervalMs?: number;
}

/**
 * Multi-pool scanner for dynamic pool discovery
 */
export class MultiPoolScanner extends EventEmitter<ScannerEvents> {
  private config: MultiPoolScannerConfig;
  private chainConfig: ChainConfig;
  private provider: Provider | null = null;
  private pools: Map<string, PoolInfo> = new Map();
  private tokenCache: Map<string, TokenInfo> = new Map();
  private poolPrices: Map<string, PoolPrice> = new Map();
  private isScanning: boolean = false;
  private lastBlockNumber: number = 0;
  private pollTimer: NodeJS.Timeout | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(config: MultiPoolScannerConfig) {
    super();
    this.config = config;
    this.chainConfig = getChainConfig(config.chainId);
  }

  /**
   * Initialize scanner with discovered pools
   */
  public async initialize(): Promise<void> {
    logger.info(`Initializing multi-pool scanner for chain ${this.chainConfig.name}...`);
    logger.info(`Initial pool count: ${this.config.pools.length}`);

    try {
      await this.initializeProvider();
      await this.loadPools(this.config.pools);

      logger.info(`Scanner initialized with ${this.pools.size} pools`);
      this.emit('connected');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize multi-pool scanner');
      this.emit('error', error as Error);
      throw error;
    }
  }

  /**
   * Initialize provider
   */
  private async initializeProvider(): Promise<void> {
    if (this.config.useWebSocket && this.chainConfig.wsRpcUrls.length > 0) {
      try {
        const wsUrl = this.chainConfig.wsRpcUrls[0] ?? '';
        logger.info(`Connecting to WebSocket: ${wsUrl}`);
        this.provider = new WebSocketProvider(wsUrl);

        const websocket = (this.provider as WebSocketProvider).websocket as {
          on?: (event: string, listener: (...args: unknown[]) => void) => void;
        };

        websocket.on?.('error', (error: unknown) => {
          logger.error({ error }, 'WebSocket error');
        });

        websocket.on?.('close', () => {
          logger.warn('WebSocket connection closed');
        });

        logger.info('WebSocket provider initialized');
        return;
      } catch (error) {
        logger.warn({ error }, 'Failed to connect via WebSocket, falling back to HTTP');
      }
    }

    const httpUrl = this.chainConfig.rpcUrls[0] ?? '';
    logger.info(`Using HTTP provider: ${httpUrl}`);
    this.provider = new JsonRpcProvider(httpUrl);
  }

  /**
   * Load pools from discovered pool list
   */
  private async loadPools(discoveredPools: DiscoveredPool[]): Promise<void> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    logger.info(`Loading ${discoveredPools.length} discovered pools...`);

    for (const discovered of discoveredPools) {
      try {
        const token0 = await this.getOrCreateTokenInfo(discovered.token0.address, {
          symbol: discovered.token0.symbol,
          decimals: discovered.token0.decimals,
          name: discovered.token0.symbol,
        });

        const token1 = await this.getOrCreateTokenInfo(discovered.token1.address, {
          symbol: discovered.token1.symbol,
          decimals: discovered.token1.decimals,
          name: discovered.token1.symbol,
        });

        const poolContract = new Contract(discovered.address, POOL_ABI, this.provider);
        const dexConfig = getDexConfig(this.config.chainId, discovered.dex);

        const poolInfo: PoolInfo = {
          address: discovered.address,
          dexName: dexConfig.name,
          dexConfig,
          token0,
          token1,
          fee: discovered.fee,
          contract: poolContract,
        };

        this.pools.set(discovered.address.toLowerCase(), poolInfo);
      } catch (error) {
        logger.warn({ error, pool: discovered.address }, 'Failed to load pool');
      }
    }

    logger.info(`Successfully loaded ${this.pools.size} pools`);
  }

  /**
   * Get or create token info with caching
   */
  private async getOrCreateTokenInfo(
    address: string,
    fallback: { symbol: string; decimals: number; name: string }
  ): Promise<TokenInfo> {
    const key = address.toLowerCase();
    const cached = this.tokenCache.get(key);
    if (cached) {
      return cached;
    }

    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    const contract = new Contract(address, ERC20_ABI, this.provider);

    let symbol = fallback.symbol;
    let decimals = fallback.decimals;
    let name = fallback.name;

    try {
      const symbolFn = contract.getFunction('symbol');
      const decimalsFn = contract.getFunction('decimals');
      const nameFn = contract.getFunction('name');
      [symbol, decimals, name] = await Promise.all([
        symbolFn.staticCall(),
        decimalsFn.staticCall(),
        nameFn.staticCall(),
      ]);
    } catch (error) {
      logger.debug({ address }, 'Using fallback token info');
    }

    const tokenInfo: TokenInfo = {
      address,
      symbol,
      decimals: Number(decimals),
      name,
      contract,
    };

    this.tokenCache.set(key, tokenInfo);
    return tokenInfo;
  }

  /**
   * Refresh pools with new discovered pool list
   */
  public async refreshPools(newPools: DiscoveredPool[]): Promise<void> {
    logger.info(`Refreshing pools: ${newPools.length} new pools`);

    const newPoolAddresses = new Set(newPools.map(p => p.address.toLowerCase()));
    const currentPoolAddresses = new Set(this.pools.keys());

    const toRemove = Array.from(currentPoolAddresses).filter(addr => !newPoolAddresses.has(addr));
    const toAdd = newPools.filter(p => !currentPoolAddresses.has(p.address.toLowerCase()));

    for (const addr of toRemove) {
      this.pools.delete(addr);
      this.poolPrices.delete(addr);
    }

    if (toAdd.length > 0) {
      await this.loadPools(toAdd);
    }

    logger.info(`Pool refresh complete: +${toAdd.length} added, -${toRemove.length} removed`);
  }

  /**
   * Start scanning for opportunities
   */
  public async startScanning(): Promise<void> {
    if (this.isScanning) {
      logger.warn('Scanner already running');
      return;
    }

    if (this.pools.size < 2) {
      throw new Error('Need at least 2 pools to start scanning');
    }

    this.isScanning = true;
    logger.info(`Starting multi-pool scanner with ${this.pools.size} pools...`);

    if (this.provider instanceof WebSocketProvider) {
      await this.startWebSocketScanning();
    } else {
      await this.startPollingScanning();
    }

    if (this.config.poolRefreshIntervalMs) {
      this.startPoolRefreshTimer();
    }
  }

  /**
   * Start WebSocket scanning
   */
  private async startWebSocketScanning(): Promise<void> {
    logger.info('Starting WebSocket-based multi-pool scanning');

    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    for (const [address, pool] of this.pools) {
      try {
        const filter = {
          address: pool.address,
          topics: [SWAP_EVENT_TOPIC],
        };
        this.provider.on(filter, (log: Log) => {
          this.handleSwapEvent(log, pool);
        });
      } catch (error) {
        logger.error({ error, address }, 'Failed to subscribe to pool');
      }
    }

    this.provider.on('block', (blockNumber: number) => {
      this.lastBlockNumber = blockNumber;
      this.emit('block', blockNumber);
    });

    logger.info(`Subscribed to ${this.pools.size} pools`);
  }

  /**
   * Start polling scanning
   */
  private async startPollingScanning(): Promise<void> {
    logger.info(`Starting polling-based scanning (interval: ${this.config.pollIntervalMs}ms)`);

    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    const pollBlock = async () => {
      try {
        const currentBlock = await this.provider!.getBlockNumber();
        
        if (currentBlock > this.lastBlockNumber) {
          this.lastBlockNumber = currentBlock;
          this.emit('block', currentBlock);
          await this.scanBlockForSwaps(currentBlock);
        }
      } catch (error) {
        logger.error({ error }, 'Error polling block');
      }
    };

    await pollBlock();
    this.pollTimer = setInterval(pollBlock, this.config.pollIntervalMs);
  }

  /**
   * Scan block for swap events
   */
  private async scanBlockForSwaps(blockNumber: number): Promise<void> {
    if (!this.provider) return;

    const poolAddresses = Array.from(this.pools.values()).map(p => p.address);

    try {
      const logs = await this.provider.getLogs({
        fromBlock: blockNumber,
        toBlock: blockNumber,
        address: poolAddresses,
        topics: [SWAP_EVENT_TOPIC],
      });

      for (const log of logs) {
        const pool = this.pools.get(log.address.toLowerCase());
        if (pool) {
          await this.handleSwapEvent(log, pool);
        }
      }
    } catch (error) {
      logger.error({ error, blockNumber }, 'Error scanning block');
    }
  }

  /**
   * Handle swap event
   */
  private async handleSwapEvent(log: Log, pool: PoolInfo): Promise<void> {
    try {
      const iface = new ethers.Interface(SWAP_EVENT_ABI);
      const parsed = iface.parseLog({
        topics: log.topics as string[],
        data: log.data,
      });

      if (!parsed) return;

      const swapEvent: SwapEvent = {
        poolAddress: pool.address,
        dexName: pool.dexName,
        chainId: this.config.chainId,
        sender: parsed.args[0] as string,
        recipient: parsed.args[1] as string,
        amount0: BigInt(parsed.args[2].toString()),
        amount1: BigInt(parsed.args[3].toString()),
        sqrtPriceX96: BigInt(parsed.args[4].toString()),
        liquidity: BigInt(parsed.args[5].toString()),
        tick: Number(parsed.args[6]),
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
        timestamp: Date.now(),
      };

      this.emit('swap', swapEvent);

      const price = this.calculatePrice(swapEvent.sqrtPriceX96, pool.token0.decimals, pool.token1.decimals);
      
      this.poolPrices.set(pool.address.toLowerCase(), {
        pool,
        price: price.toString(),
        priceFormatted: price.toFixed(6),
        blockNumber: log.blockNumber,
        timestamp: Date.now(),
      });

      await this.detectOpportunities();
    } catch (error) {
      logger.error({ error, pool: pool.address }, 'Error handling swap event');
    }
  }

  /**
   * Calculate price from sqrtPriceX96
   */
  private calculatePrice(sqrtPriceX96: bigint, decimals0: number, decimals1: number): Big {
    const Q96 = Big(2).pow(96);
    const sqrtPrice = Big(sqrtPriceX96.toString()).div(Q96);
    const price = sqrtPrice.pow(2);
    const decimalAdjustment = Big(10).pow(decimals0 - decimals1);
    return price.mul(decimalAdjustment);
  }

  /**
   * Detect arbitrage opportunities across all pools
   */
  private async detectOpportunities(): Promise<void> {
    const poolsByTokenPair = this.groupPoolsByTokenPair();

    for (const [_pairKey, pools] of poolsByTokenPair) {
      if (pools.length < 2) continue;

      const prices = pools
        .map(pool => {
          const priceInfo = this.poolPrices.get(pool.address.toLowerCase());
          return priceInfo ? { pool, price: Big(priceInfo.price) } : null;
        })
        .filter((p): p is { pool: PoolInfo; price: Big } => p !== null);

      if (prices.length < 2) continue;

      for (let i = 0; i < prices.length; i++) {
        for (let j = i + 1; j < prices.length; j++) {
          const p1 = prices[i];
          const p2 = prices[j];
          
          if (!p1 || !p2) continue;

          const priceDiff = p1.price.minus(p2.price).abs();
          const avgPrice = p1.price.plus(p2.price).div(2);
          const priceDiffPercent = priceDiff.div(avgPrice).mul(100).toNumber();

          if (priceDiffPercent >= this.config.priceDifferenceThreshold) {
            const [buyPool, sellPool] = p1.price.lt(p2.price) ? [p1.pool, p2.pool] : [p2.pool, p1.pool];
            const [buyPrice, sellPrice] = p1.price.lt(p2.price) ? [p1.price, p2.price] : [p2.price, p1.price];

            const opportunity: ArbitrageOpportunity = {
              chainId: this.config.chainId,
              tokenPair: {
                token0: buyPool.token0,
                token1: buyPool.token1,
                poolFee: buyPool.fee,
              },
              buyPool,
              sellPool,
              priceDifferencePercent: priceDiffPercent,
              buyPrice: buyPrice.toString(),
              sellPrice: sellPrice.toString(),
              estimatedProfit: 0n,
              blockNumber: this.lastBlockNumber,
              timestamp: Date.now(),
            };

            this.emit('opportunity', opportunity);
          }
        }
      }
    }
  }

  /**
   * Group pools by token pair
   */
  private groupPoolsByTokenPair(): Map<string, PoolInfo[]> {
    const grouped = new Map<string, PoolInfo[]>();

    for (const pool of this.pools.values()) {
      const [token0, token1] = [pool.token0.address, pool.token1.address].sort();
      const key = `${token0}-${token1}`;
      
      const existing = grouped.get(key) ?? [];
      existing.push(pool);
      grouped.set(key, existing);
    }

    return grouped;
  }

  /**
   * Start pool refresh timer
   */
  private startPoolRefreshTimer(): void {
    if (!this.config.poolRefreshIntervalMs) return;

    this.refreshTimer = setInterval(() => {
      logger.info('Pool refresh timer triggered - waiting for external refresh');
    }, this.config.poolRefreshIntervalMs);
  }

  /**
   * Stop scanning
   */
  public async stopScanning(): Promise<void> {
    if (!this.isScanning) return;

    this.isScanning = false;
    logger.info('Stopping multi-pool scanner...');

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    if (this.provider) {
      await this.provider.removeAllListeners();
    }

    logger.info('Scanner stopped');
  }

  /**
   * Get current pool count
   */
  public getPoolCount(): number {
    return this.pools.size;
  }

  /**
   * Get pool statistics
   */
  public getStats(): {
    totalPools: number;
    poolsByDex: Record<string, number>;
    tokenPairs: number;
    pricesTracked: number;
  } {
    const poolsByDex: Record<string, number> = {};
    
    for (const pool of this.pools.values()) {
      poolsByDex[pool.dexName] = (poolsByDex[pool.dexName] ?? 0) + 1;
    }

    return {
      totalPools: this.pools.size,
      poolsByDex,
      tokenPairs: this.groupPoolsByTokenPair().size,
      pricesTracked: this.poolPrices.size,
    };
  }
}
