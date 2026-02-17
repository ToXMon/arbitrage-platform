import 'dotenv/config';
import { BotEngine } from './index.js';
import { BlockScanner } from './scanner.js';
import { TransactionExecutor, type ExecutorConfig } from './executor.js';
import { type ChainId, getChainConfig, DEFAULT_BOT_SETTINGS } from './config.js';
import { logger } from './index.js';

async function main() {
  const chainId = parseInt(process.env.CHAIN_ID || '11155111', 10) as ChainId;
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const privateKey = process.env.PRIVATE_KEY || process.env.ETH_PRIVATE_KEY || '';
  const contractAddress = process.env.ARBITRAGE_CONTRACT_ADDRESS || '';
  const token0Symbol = process.env.TOKEN0_SYMBOL || 'WETH';
  const token1Symbol = process.env.TOKEN1_SYMBOL || 'USDC';
  const poolFee = parseInt(process.env.POOL_FEE || '3000', 10);
  const dexNamesOverride = (process.env.DEX_NAMES || '').trim();
  const poolAddressesEnv = (process.env.POOL_ADDRESSES || '').trim();
  const poolAddresses = poolAddressesEnv
    ? Object.fromEntries(
        poolAddressesEnv
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
          .map((part) => {
            const [dex, address] = part.split('=').map((s) => (s || '').trim());
            return [dex ? dex.toLowerCase() : '', address];
          })
          .filter(([dex, address]) => Boolean(dex) && Boolean(address))
      )
    : undefined;

  logger.info(`Starting arbitrage bot on chain ${chainId}...`);

  // Validate config for the chain
  let chainConfig;
  try {
    chainConfig = getChainConfig(chainId);
  } catch {
    logger.error(`Unsupported chain ID: ${chainId}. Supported: 11155111 (Sepolia), 1 (Ethereum), 42161 (Arbitrum), etc.`);
    process.exit(1);
  }

  logger.info(`Chain: ${chainConfig.name} | DEXes: ${Object.keys(chainConfig.dexes).join(', ')}`);

  // --- 1. Start the BotEngine (monitors + executor engine queue) ---
  const bot = new BotEngine({ config: { chainId }, redisUrl });
  await bot.start();
  logger.info('BotEngine started (monitors + executor queue)');

  // --- 2. Start the BlockScanner for real-time opportunity detection ---
  const dexNames = dexNamesOverride
    ? dexNamesOverride.split(',').map((d) => d.trim()).filter(Boolean)
    : Object.keys(chainConfig.dexes);
  const scanner = new BlockScanner({
    chainId,
    token0Symbol,
    token1Symbol,
    poolFee,
    dexNames,
    priceDifferenceThreshold: parseFloat(process.env.PRICE_DIFF_THRESHOLD || '0.05'),
    useWebSocket: process.env.USE_POLLING === 'true' ? false : Boolean(process.env.WS_URL || chainConfig.wsRpcUrls.length > 0),
    pollIntervalMs: chainConfig.blockTime || 12000,
    poolAddresses,
  });

  // --- 3. Set up TransactionExecutor if private key + contract are configured ---
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
    logger.info(`Wallet: ${executor.getWalletAddress()} | Balance: ${balances.ethFormatted} ETH`);
  } else {
    logger.warn('No PRIVATE_KEY or ARBITRAGE_CONTRACT_ADDRESS set — running in MONITOR-ONLY mode');
  }

  // --- 4. Wire scanner events ---
  let opportunityCount = 0;
  let swapCount = 0;

  scanner.on('connected', () => {
    logger.info('Scanner connected to blockchain');
  });

  scanner.on('block', (blockNumber: number) => {
    logger.debug(`Block ${blockNumber}`);
  });

  scanner.on('swap', () => {
    swapCount++;
  });

  scanner.on('opportunity', async (opportunity) => {
    opportunityCount++;
    logger.info(`[OPP #${opportunityCount}] ${opportunity.priceDifferencePercent.toFixed(4)}% | Buy: ${opportunity.buyPool.dexName} @ ${opportunity.buyPrice} | Sell: ${opportunity.sellPool.dexName} @ ${opportunity.sellPrice}`);

    // If executor is configured, check profitability and optionally execute
    if (executor) {
      try {
        const profitability = await executor.checkProfitability(opportunity);
        if (profitability.isProfitable) {
          logger.info(`PROFITABLE! Margin: ${profitability.profitMargin.toFixed(4)}% | Executing...`);
          const result = await executor.executeTrade(opportunity, profitability.amountIn);
          if (result.success) {
            logger.info(`TRADE SUCCESS: ${result.transactionHash}`);
          } else {
            logger.warn(`Trade failed: ${result.error}`);
          }
        } else {
          logger.info(`Not profitable: ${profitability.reason}`);
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
    logger.warn('Scanner disconnected — will attempt reconnect');
  });

  // --- 5. Initialize and start scanning ---
  try {
    await scanner.initialize();
    await scanner.startScanning();
    logger.info('Scanner is live — monitoring for arbitrage opportunities');
  } catch (error) {
    logger.warn({ error }, 'Scanner failed to fully initialize (may need at least 2 DEX pools with liquidity). Bot engine still running.');
  }

  // --- 6. Status ticker ---
  setInterval(() => {
    const botStatus = bot.getStatus();
    const scannerStatus = scanner.getStatus();
    logger.info(
      `[STATUS] Running: ${botStatus.running} | Chain: ${chainConfig.name} | Pools: ${scannerStatus.poolsCount} | Swaps: ${swapCount} | Opportunities: ${opportunityCount} | Block: ${scannerStatus.lastBlockNumber} | Uptime: ${Math.floor(botStatus.uptime)}s`
    );
  }, 30000);

  // --- 7. Graceful shutdown ---
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    scanner.stopScanning();
    await bot.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => { shutdown('SIGINT'); });
  process.on('SIGTERM', () => { shutdown('SIGTERM'); });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
