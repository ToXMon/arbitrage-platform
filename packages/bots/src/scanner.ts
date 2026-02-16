/**
 * @fileoverview Block monitoring scanner for detecting arbitrage opportunities
 * Supports WebSocket and polling-based block subscription with multi-chain support
 */

import { ethers, Provider, WebSocketProvider, JsonRpcProvider, Contract, Log } from 'ethers';
import EventEmitter from 'eventemitter3';
import Big from 'big.js';
import {
  ChainConfig,
  ChainId,
  DexConfig,
  TokenConfig,
  getChainConfig,
  getDexConfig,
  getTokenConfig,
} from './config.js';
import { logger } from './index.js';

/**
 * Pool swap event ABI fragment
 */
const SWAP_EVENT_ABI = [
  'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
];

/**
 * ERC20 ABI for token info
 */
const ERC20_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function name() view returns (string)',
  'function balanceOf(address) view returns (uint256)',
];

/**
 * Pool ABI for price calculation
 */
const POOL_ABI = [
  ...SWAP_EVENT_ABI,
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function fee() view returns (uint24)',
  'function liquidity() view returns (uint128)',
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function getLiquidityByRange(int24 lowerTick, int24 upperTick) view returns (uint128)',
];

/**
 * Quoter ABI for price quotes
 */
const QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut)',
  'function quoteExactOutputSingle((address tokenIn, address tokenOut, uint256 amount, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountIn)',
];

/**
 * Swap event data
 */
export interface SwapEvent {
  poolAddress: string;
  dexName: string;
  chainId: ChainId;
  sender: string;
  recipient: string;
  amount0: bigint;
  amount1: bigint;
  sqrtPriceX96: bigint;
  liquidity: bigint;
  tick: number;
  blockNumber: number;
  transactionHash: string;
  timestamp: number;
}

/**
 * Token pair configuration
 */
export interface TokenPair {
  token0: TokenInfo;
  token1: TokenInfo;
  poolFee: number;
}

/**
 * Token information
 */
export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  name: string;
  contract: Contract;
}

/**
 * Pool information
 */
export interface PoolInfo {
  address: string;
  dexName: string;
  dexConfig: DexConfig;
  token0: TokenInfo;
  token1: TokenInfo;
  fee: number;
  contract: Contract;
}

/**
 * Price information for a pool
 */
export interface PoolPrice {
  pool: PoolInfo;
  price: string;
  priceFormatted: string;
  blockNumber: number;
  timestamp: number;
}

/**
 * Arbitrage opportunity
 */
export interface ArbitrageOpportunity {
  chainId: ChainId;
  tokenPair: TokenPair;
  buyPool: PoolInfo;
  sellPool: PoolInfo;
  priceDifferencePercent: number;
  buyPrice: string;
  sellPrice: string;
  estimatedProfit: bigint;
  blockNumber: number;
  timestamp: number;
}

/**
 * Scanner configuration
 */
export interface ScannerConfig {
  chainId: ChainId;
  token0Symbol: string;
  token1Symbol: string;
  poolFee: number;
  dexNames: string[];
  priceDifferenceThreshold: number;
  useWebSocket: boolean;
  pollIntervalMs: number;
}

/**
 * Scanner events
 */
export interface ScannerEvents {
  swap: (event: SwapEvent) => void;
  opportunity: (opportunity: ArbitrageOpportunity) => void;
  error: (error: Error) => void;
  block: (blockNumber: number) => void;
  connected: () => void;
  disconnected: () => void;
}

/**
 * Block scanner class for monitoring DEX pools and detecting arbitrage opportunities
 */
export class BlockScanner extends EventEmitter<ScannerEvents> {
  private config: ScannerConfig;
  private chainConfig: ChainConfig;
  private provider: Provider | null = null;
  private pools: Map<string, PoolInfo> = new Map();
  private token0: TokenInfo | null = null;
  private token1: TokenInfo | null = null;
  private isScanning: boolean = false;
  private isProcessingSwap: boolean = false;
  private lastBlockNumber: number = 0;
  private pollTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private swapFilter: ethers.TopicFilter | null = null;

  constructor(config: ScannerConfig) {
    super();
    this.config = config;
    this.chainConfig = getChainConfig(config.chainId);
  }

  /**
   * Initialize the scanner with provider and contracts
   */
  public async initialize(): Promise<void> {
    logger.info(`Initializing scanner for chain ${this.chainConfig.name}...`);

    try {
      // Initialize provider
      await this.initializeProvider();

      // Initialize tokens
      await this.initializeTokens();

      // Initialize pools for each DEX
      await this.initializePools();

      logger.info(`Scanner initialized successfully for ${this.config.dexNames.length} DEXes`);
      this.emit('connected');
    } catch (error) {
      logger.error('Failed to initialize scanner:', error);
      this.emit('error', error as Error);
      throw error;
    }
  }

  /**
   * Initialize the provider (WebSocket or HTTP polling)
   */
  private async initializeProvider(): Promise<void> {
    if (this.config.useWebSocket && this.chainConfig.wsRpcUrls.length > 0) {
      try {
        const wsUrl = this.chainConfig.wsRpcUrls[0] ?? '';
        logger.info(`Connecting to WebSocket: ${wsUrl}`);
        this.provider = new WebSocketProvider(wsUrl);

        // Handle WebSocket errors and reconnection
        (this.provider as WebSocketProvider).websocket.on('error', (error: Error) => {
          logger.error('WebSocket error:', error);
          this.handleDisconnect();
        });

        (this.provider as WebSocketProvider).websocket.on('close', () => {
          logger.warn('WebSocket connection closed');
          this.handleDisconnect();
        });

        logger.info('WebSocket provider initialized');
        return;
      } catch (error) {
        logger.warn('Failed to connect via WebSocket, falling back to HTTP polling:', error);
      }
    }

    // Fallback to HTTP provider
    const httpUrl = this.chainConfig.rpcUrls[0] ?? '';
    logger.info(`Using HTTP provider: ${httpUrl}`);
    this.provider = new JsonRpcProvider(httpUrl);
  }

  /**
   * Initialize token contracts
   */
  private async initializeTokens(): Promise<void> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    const token0Config = getTokenConfig(this.config.chainId, this.config.token0Symbol);
    const token1Config = getTokenConfig(this.config.chainId, this.config.token1Symbol);

    this.token0 = await this.createTokenInfo(token0Config);
    this.token1 = await this.createTokenInfo(token1Config);

    logger.info(`Tokens initialized: ${this.token0.symbol}/${this.token1.symbol}`);
  }

  /**
   * Create token info from config
   */
  private async createTokenInfo(config: TokenConfig): Promise<TokenInfo> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    const contract = new Contract(config.address, ERC20_ABI, this.provider);

    let symbol = config.symbol;
    let decimals = config.decimals;
    let name = config.name;

    try {
      [symbol, decimals, name] = await Promise.all([
        contract.symbol(),
        contract.decimals(),
        contract.name(),
      ]);
    } catch (error) {
      logger.warn(`Using config values for token ${config.address}`);
    }

    return {
      address: config.address,
      symbol,
      decimals: Number(decimals),
      name,
      contract,
    };
  }

  /**
   * Initialize pools for all configured DEXes
   */
  private async initializePools(): Promise<void> {
    if (!this.provider || !this.token0 || !this.token1) {
      throw new Error('Provider or tokens not initialized');
    }

    for (const dexName of this.config.dexNames) {
      try {
        const dexConfig = getDexConfig(this.config.chainId, dexName);
        const poolAddress = await this.getPoolAddress(
          dexConfig.factory,
          this.token0.address,
          this.token1.address,
          this.config.poolFee
        );

        if (!poolAddress) {
          logger.warn(`Pool not found for ${dexName}`);
          continue;
        }

        const poolContract = new Contract(poolAddress, POOL_ABI, this.provider);
        const poolInfo: PoolInfo = {
          address: poolAddress,
          dexName: dexConfig.name,
          dexConfig,
          token0: this.token0,
          token1: this.token1,
          fee: this.config.poolFee,
          contract: poolContract,
        };

        this.pools.set(dexName.toLowerCase(), poolInfo);
        logger.info(`Pool initialized: ${dexConfig.name} at ${poolAddress}`);
      } catch (error) {
        logger.error(`Failed to initialize pool for ${dexName}:`, error);
      }
    }

    if (this.pools.size < 2) {
      throw new Error('Need at least 2 pools to find arbitrage opportunities');
    }
  }

  /**
   * Compute pool address from factory and tokens
   */
  private async getPoolAddress(
    factory: string,
    token0: string,
    token1: string,
    fee: number
  ): Promise<string | null> {
    if (!this.provider) return null;

    try {
      // Compute pool address deterministically
      const [tokenA, tokenB] = token0.toLowerCase() < token1.toLowerCase() 
        ? [token0, token1] 
        : [token1, token0];

      const poolAddress = ethers.getCreate2Address(
        factory,
        ethers.solidityPackedKeccak256(
          ['address', 'address', 'uint24'],
          [tokenA, tokenB, fee]
        ),
        this.chainConfig.dexes[Object.keys(this.chainConfig.dexes)[0] ?? '']?.poolInitCodeHash ?? ''
      );

      // Verify pool exists by checking code
      const code = await this.provider.getCode(poolAddress);
      if (code === '0x') {
        return null;
      }

      return poolAddress;
    } catch (error) {
      logger.error('Error computing pool address:', error);
      return null;
    }
  }

  /**
   * Start scanning for swap events
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
    logger.info('Starting block scanner...');

    if (this.provider instanceof WebSocketProvider) {
      await this.startWebSocketScanning();
    } else {
      await this.startPollingScanning();
    }
  }

  /**
   * Start WebSocket-based event listening
   */
  private async startWebSocketScanning(): Promise<void> {
    logger.info('Starting WebSocket-based scanning');

    // Subscribe to swap events on all pools
    for (const [dexName, pool] of this.pools) {
      try {
        const filter = pool.contract.filters.Swap();
        this.provider!.on(filter, (log: Log) => {
          this.handleSwapEvent(log, pool);
        });
        logger.info(`Subscribed to Swap events on ${pool.dexName}`);
      } catch (error) {
        logger.error(`Failed to subscribe to ${dexName}:`, error);
      }
    }

    // Also subscribe to new blocks
    this.provider!.on('block', (blockNumber: number) => {
      this.lastBlockNumber = blockNumber;
      this.emit('block', blockNumber);
    });
  }

  /**
   * Start polling-based event scanning
   */
  private async startPollingScanning(): Promise<void> {
    logger.info(`Starting polling-based scanning (interval: ${this.config.pollIntervalMs}ms)`);

    const poll = async () => {
      if (!this.isScanning) return;

      try {
        const blockNumber = await this.provider!.getBlockNumber();
        
        if (blockNumber > this.lastBlockNumber) {
          this.lastBlockNumber = blockNumber;
          this.emit('block', blockNumber);

          // Check for swap events in recent blocks
          await this.pollSwapEvents(blockNumber);
        }
      } catch (error) {
        logger.error('Polling error:', error);
        this.emit('error', error as Error);
      }

      // Schedule next poll
      this.pollTimer = setTimeout(poll, this.config.pollIntervalMs);
    };

    poll();
  }

  /**
   * Poll for swap events in recent blocks
   */
  private async pollSwapEvents(blockNumber: number): Promise<void> {
    const fromBlock = Math.max(0, blockNumber - 3);

    for (const [dexName, pool] of this.pools) {
      try {
        const filter = pool.contract.filters.Swap();
        const events = await pool.contract.queryFilter(filter, fromBlock, blockNumber);

        for (const event of events) {
          await this.handleSwapEvent(event as Log, pool);
        }
      } catch (error) {
        logger.error(`Error polling ${dexName}:`, error);
      }
    }
  }

  /**
   * Handle incoming swap event
   */
  private async handleSwapEvent(log: Log, pool: PoolInfo): Promise<void> {
    if (this.isProcessingSwap) {
      return;
    }

    try {
      this.isProcessingSwap = true;

      const parsedLog = pool.contract.interface.parseLog({
        topics: log.topics,
        data: log.data,
      });

      if (!parsedLog) return;

      const block = await this.provider!.getBlock(log.blockNumber);

      const swapEvent: SwapEvent = {
        poolAddress: pool.address,
        dexName: pool.dexName,
        chainId: this.config.chainId,
        sender: parsedLog.args[0],
        recipient: parsedLog.args[1],
        amount0: BigInt(parsedLog.args[2].toString()),
        amount1: BigInt(parsedLog.args[3].toString()),
        sqrtPriceX96: BigInt(parsedLog.args[4].toString()),
        liquidity: BigInt(parsedLog.args[5].toString()),
        tick: Number(parsedLog.args[6]),
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
        timestamp: block?.timestamp ?? Date.now(),
      };

      logger.debug(`Swap detected on ${pool.dexName}: ${swapEvent.amount0} / ${swapEvent.amount1}`);
      this.emit('swap', swapEvent);

      // Check for arbitrage opportunities
      await this.checkArbitrageOpportunity(swapEvent);
    } catch (error) {
      logger.error('Error handling swap event:', error);
      this.emit('error', error as Error);
    } finally {
      this.isProcessingSwap = false;
    }
  }

  /**
   * Check for arbitrage opportunities after a swap
   */
  private async checkArbitrageOpportunity(swapEvent: SwapEvent): Promise<void> {
    if (!this.token0 || !this.token1) return;

    try {
      // Get prices from all pools
      const pricePromises = Array.from(this.pools.values()).map(async (pool) => {
        const price = await this.calculatePrice(pool);
        return {
          pool,
          price: price.toString(),
          priceFormatted: Number(price).toFixed(this.config.priceDifferenceThreshold),
          blockNumber: swapEvent.blockNumber,
          timestamp: swapEvent.timestamp,
        } as PoolPrice;
      });

      const prices = await Promise.all(pricePromises);

      // Find best arbitrage opportunity
      for (let i = 0; i < prices.length; i++) {
        for (let j = i + 1; j < prices.length; j++) {
          const price1 = parseFloat(prices[i]?.priceFormatted ?? '0');
          const price2 = parseFloat(prices[j]?.priceFormatted ?? '0');

          if (price1 === 0 || price2 === 0) continue;

          const priceDiff = ((price1 - price2) / price2) * 100;

          if (Math.abs(priceDiff) >= this.config.priceDifferenceThreshold) {
            const [buyPool, sellPool, buyPrice, sellPrice] = priceDiff > 0
              ? [prices[j]!, prices[i]!, prices[j]!.priceFormatted, prices[i]!.priceFormatted]
              : [prices[i]!, prices[j]!, prices[i]!.priceFormatted, prices[j]!.priceFormatted];

            const opportunity: ArbitrageOpportunity = {
              chainId: this.config.chainId,
              tokenPair: {
                token0: this.token0,
                token1: this.token1,
                poolFee: this.config.poolFee,
              },
              buyPool: buyPool.pool,
              sellPool: sellPool.pool,
              priceDifferencePercent: Math.abs(priceDiff),
              buyPrice,
              sellPrice,
              estimatedProfit: 0n, // Will be calculated by executor
              blockNumber: swapEvent.blockNumber,
              timestamp: swapEvent.timestamp,
            };

            logger.info(`Arbitrage opportunity found: ${priceDiff.toFixed(4)}%`);
            logger.info(`Buy on ${buyPool.pool.dexName} at ${buyPrice}`);
            logger.info(`Sell on ${sellPool.pool.dexName} at ${sellPrice}`);

            this.emit('opportunity', opportunity);
          }
        }
      }
    } catch (error) {
      logger.error('Error checking arbitrage opportunity:', error);
    }
  }

  /**
   * Calculate current price from pool
   */
  private async calculatePrice(pool: PoolInfo): Promise<Big> {
    try {
      const slot0 = await pool.contract.slot0();
      const sqrtPriceX96 = BigInt(slot0[0].toString());

      // Calculate price from sqrtPriceX96
      // price = (sqrtPriceX96 / 2^96)^2
      const Q96 = Big(2).pow(96);
      const sqrtPrice = Big(sqrtPriceX96.toString()).div(Q96);
      const price = sqrtPrice.pow(2);

      // Adjust for token decimals
      const decimalDiff = pool.token1.decimals - pool.token0.decimals;
      const adjustedPrice = price.mul(Big(10).pow(decimalDiff));

      return adjustedPrice;
    } catch (error) {
      logger.error(`Error calculating price for ${pool.dexName}:`, error);
      return new Big(0);
    }
  }

  /**
   * Handle disconnection
   */
  private handleDisconnect(): void {
    this.emit('disconnected');

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      logger.info(`Attempting reconnection (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

      setTimeout(() => {
        this.initialize().catch((error) => {
          logger.error('Reconnection failed:', error);
        });
      }, 5000 * this.reconnectAttempts);
    } else {
      logger.error('Max reconnection attempts reached');
      this.emit('error', new Error('Max reconnection attempts reached'));
    }
  }

  /**
   * Stop scanning
   */
  public stopScanning(): void {
    logger.info('Stopping scanner...');
    this.isScanning = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.provider) {
      this.provider.removeAllListeners();
    }
  }

  /**
   * Get current status
   */
  public getStatus(): {
    isScanning: boolean;
    chainId: ChainId;
    poolsCount: number;
    lastBlockNumber: number;
    provider: string;
  } {
    return {
      isScanning: this.isScanning,
      chainId: this.config.chainId,
      poolsCount: this.pools.size,
      lastBlockNumber: this.lastBlockNumber,
      provider: this.provider instanceof WebSocketProvider ? 'WebSocket' : 'HTTP',
    };
  }
}

export default BlockScanner;
