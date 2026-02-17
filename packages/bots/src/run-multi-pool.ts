/**
 * @fileoverview Multi-pool arbitrage bot with automatic pool discovery
 * Uses subgraph-based pool discovery across Uniswap V3, SushiSwap V3, and Balancer V2
 */

import 'dotenv/config';
import { BotEngine } from './index.js';
import { MultiPoolScanner } from './multi-pool-scanner.js';
import { TransactionExecutor, type ExecutorConfig, FlashLoanProvider } from './executor.js';
import { PoolDiscoveryService } from './services/pool-discovery.js';
import { type ChainId, getChainConfig, DEFAULT_BOT_SETTINGS } from './config.js';
import { logger } from './index.js';
import type { PoolDiscoveryConfig } from './subgraph-types.js';

async function main() {
  // Environment variables
  const chainId = parseInt(process.env.CHAIN_ID || '1', 10) as ChainId;
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const privateKey = process.env.PRIVATE_KEY || process.env.ETH_PRIVATE_KEY || '';
  const contractAddress = process.env.ARBITRAGE_CONTRACT_ADDRESS || '';
  
  // Pool discovery configuration
  const poolDiscoveryEnabled = process.env.POOL_DISCOVERY_ENABLED !== 'false';
  const minPoolLiquidity = parseInt(process.env.MIN_POOL_LIQUIDITY || '100000', 10);
  const maxPoolsPerDex = parseInt(process.env.MAX_POOLS_PER_DEX || '40', 10);
  const poolRefreshIntervalMs = parseInt(process.env.POOL_REFRESH_INTERVAL_MS || '600000', 10);
  const allowedTokens = process.env.ALLOWED_TOKENS
    ? process.env.ALLOWED_TOKENS.split(',').map(t => t.trim()).filter(Boolean)
    : ['WETH', 'USDC', 'USDT', 'DAI', 'WBTC'];
  
  // Flash loan configuration
  const flashLoanProvider = (process.env.FLASH_LOAN_PROVIDER || 'aave').toLowerCase() === 'aave'
    ? FlashLoanProvider.AAVE_V3
    : FlashLoanProvider.BALANCER_V2;

  logger.info(`Starting multi-pool arbitrage bot on chain ${chainId}...`);
  logger.info(`Pool discovery: ${poolDiscoveryEnabled ? 'ENABLED' : 'DISABLED'}`);
  logger.info(`Flash loan provider: ${flashLoanProvider === FlashLoanProvider.AAVE_V3 ? 'Aave V3' : 'Balancer V2'}`);

  // Validate chain configuration
  let chainConfig;
  try {
    chainConfig = getChainConfig(chainId);
  } catch {
    logger.error(`Unsupported chain ID: ${chainId}`);
    process.exit(1);
  }

  logger.info(`Chain: ${chainConfig.name}`);

  // --- 1. Initialize Pool Discovery Service ---
  let poolDiscoveryService: PoolDiscoveryService | null = null;
  let discoveredPools: import('./subgraph-types.js').DiscoveredPool[] = [];

  if (poolDiscoveryEnabled) {
    try {
      const discoveryConfig: PoolDiscoveryConfig = {
        chainId,
        minLiquidity: minPoolLiquidity,
        maxPoolsPerDex,
        allowedTokens,
        refreshIntervalMs: poolRefreshIntervalMs,
      };

      poolDiscoveryService = new PoolDiscoveryService(discoveryConfig);
      logger.info('Discovering pools from subgraphs...');
      discoveredPools = await poolDiscoveryService.discoverPools();
      
      logger.info(`Discovered ${discoveredPools.length} pools:`);
      const poolsByDex = discoveredPools.reduce((acc: Record<string, number>, pool: import('./subgraph-types.js').DiscoveredPool) => {
        acc[pool.dex] = (acc[pool.dex] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      for (const [dex, count] of Object.entries(poolsByDex)) {
        logger.info(`  ${dex}: ${count} pools`);
      }
    } catch (error) {
      logger.error({ error }, 'Failed to initialize pool discovery');
      logger.warn('Continuing without pool discovery...');
    }
  }

  if (discoveredPools.length === 0) {
    logger.error('No pools discovered. Cannot start scanner.');
    process.exit(1);
  }

  // --- 2. Start BotEngine ---
  const bot = new BotEngine({ config: { chainId }, redisUrl });
  await bot.start();
  logger.info('BotEngine started');

  // --- 3. Initialize Multi-Pool Scanner ---
  const scannerConfig: import('./multi-pool-scanner.js').MultiPoolScannerConfig = {
    chainId,
    pools: discoveredPools,
    priceDifferenceThreshold: 0.3,
    useWebSocket: Boolean(process.env.WS_URL || chainConfig.wsRpcUrls.length > 0),
    pollIntervalMs: chainConfig.blockTime || 12000,
  };
  
  if (poolDiscoveryEnabled) {
    scannerConfig.poolRefreshIntervalMs = poolRefreshIntervalMs;
  }
  
  const scanner = new MultiPoolScanner(scannerConfig);

  // --- 4. Set up TransactionExecutor ---
  let executor: TransactionExecutor | null = null;
  if (privateKey && contractAddress) {
    const executorConfig: ExecutorConfig = {
      chainId,
      arbitrageContractAddress: contractAddress,
      privateKey,
      settings: DEFAULT_BOT_SETTINGS,
    };
    executor = new TransactionExecutor(executorConfig);
    const balances = await executor.getBalances();
    logger.info(`Wallet: ${executor.getWalletAddress()}`);
    logger.info(`Balance: ${balances.ethFormatted} ETH`);
  } else {
    logger.warn('No PRIVATE_KEY or ARBITRAGE_CONTRACT_ADDRESS — MONITOR-ONLY mode');
  }

  // --- 5. Wire scanner events ---
  let opportunityCount = 0;
  let swapCount = 0;
  let executionCount = 0;
  let successCount = 0;

  scanner.on('connected', () => {
    logger.info('Multi-pool scanner connected');
  });

  scanner.on('block', (blockNumber: number) => {
    logger.debug(`Block ${blockNumber}`);
  });

  scanner.on('swap', () => {
    swapCount++;
  });

  scanner.on('opportunity', async (opportunity) => {
    opportunityCount++;
    logger.info(
      `[OPP #${opportunityCount}] ${opportunity.tokenPair.token0.symbol}/${opportunity.tokenPair.token1.symbol} | ` +
      `${opportunity.priceDifferencePercent.toFixed(4)}% | ` +
      `Buy: ${opportunity.buyPool.dexName} @ ${opportunity.buyPrice} | ` +
      `Sell: ${opportunity.sellPool.dexName} @ ${opportunity.sellPrice}`
    );

    if (executor) {
      try {
        const profitability = await executor.checkProfitability(opportunity);
        
        if (profitability.isProfitable) {
          executionCount++;
          logger.info(
            `PROFITABLE! Margin: ${profitability.profitMargin.toFixed(4)}% | ` +
            `Estimated profit: ${profitability.estimatedProfit.toString()} | ` +
            `Executing with ${flashLoanProvider === FlashLoanProvider.AAVE_V3 ? 'Aave V3' : 'Balancer V2'}...`
          );
          
          const result = await executor.executeTrade(
            opportunity,
            profitability.amountIn,
            flashLoanProvider
          );
          
          if (result.success) {
            successCount++;
            logger.info(
              `TRADE SUCCESS [${successCount}/${executionCount}]: ${result.transactionHash} | ` +
              `Profit: ${result.profit?.toString() || 'N/A'} | ` +
              `Gas: ${result.gasUsed?.toString() || 'N/A'}`
            );
          } else {
            logger.warn(`Trade failed [${successCount}/${executionCount}]: ${result.error}`);
          }
        } else {
          logger.debug(`Not profitable: ${profitability.reason}`);
        }
      } catch (error) {
        logger.error({ error }, 'Error evaluating opportunity');
      }
    }
  });

  scanner.on('error', (error: Error) => {
    logger.error({ error: error.message }, 'Scanner error');
  });

  scanner.on('disconnected', () => {
    logger.warn('Scanner disconnected');
  });

  // --- 6. Initialize and start scanning ---
  try {
    await scanner.initialize();
    await scanner.startScanning();
    logger.info(`Multi-pool scanner is live with ${scanner.getPoolCount()} pools`);
  } catch (error) {
    logger.error({ error }, 'Failed to start scanner');
    process.exit(1);
  }

  // --- 7. Set up periodic pool refresh ---
  if (poolDiscoveryService && poolDiscoveryEnabled) {
    setInterval(async () => {
      try {
        logger.info('Refreshing pool list...');
        const newPools = await poolDiscoveryService!.discoverPools();
        await scanner.refreshPools(newPools);
        
        const stats = scanner.getStats();
        logger.info(
          `Pool refresh complete: ${stats.totalPools} total pools, ` +
          `${stats.tokenPairs} token pairs`
        );
      } catch (error) {
        logger.error({ error }, 'Failed to refresh pools');
      }
    }, poolRefreshIntervalMs);
  }

  // --- 8. Status ticker ---
  setInterval(() => {
    const botStatus = bot.getStatus();
    const stats = scanner.getStats();
    
    logger.info(
      `[STATUS] Running: ${botStatus.running} | ` +
      `Chain: ${chainConfig.name} | ` +
      `Pools: ${stats.totalPools} (${stats.tokenPairs} pairs) | ` +
      `Swaps: ${swapCount} | ` +
      `Opportunities: ${opportunityCount} | ` +
      `Executions: ${executionCount} (${successCount} success) | ` +
      `Uptime: ${Math.floor(botStatus.uptime)}s`
    );
    
    logger.debug(`Pools by DEX: ${JSON.stringify(stats.poolsByDex)}`);
  }, 30000);

  // --- 9. Graceful shutdown ---
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    await scanner.stopScanning();
    await bot.stop();
    
    if (poolDiscoveryService) {
      poolDiscoveryService.clearCache();
    }
    
    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => { shutdown('SIGINT'); });
  process.on('SIGTERM', () => { shutdown('SIGTERM'); });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
