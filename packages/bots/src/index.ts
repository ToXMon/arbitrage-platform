/**
 * @arbitrage/bots - Trading Bot Entry Point
 */

export * from './strategies';
export * from './monitors';
export * from './executors';

import { MonitorManager } from './monitors';
import { ExecutorEngine } from './executors';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

export interface BotEngineOptions {
  config: BotConfig;
  redisUrl?: string;
}

export interface BotConfig {
  chainId: number;
}

export class BotEngine {
  private monitorManager: MonitorManager;
  private executorEngine: ExecutorEngine;
  private config: BotConfig;
  private running: boolean = false;

  constructor(options: BotEngineOptions) {
    this.config = options.config;
    this.monitorManager = new MonitorManager(logger, options.redisUrl);
    this.executorEngine = new ExecutorEngine(logger);
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn('Bot engine already running');
      return;
    }

    logger.info('Starting bot engine...');
    this.running = true;

    // Initialize monitors for configured chains
    await this.monitorManager.start(this.config.chainId);

    // Start executor engine
    await this.executorEngine.start();

    logger.info('Bot engine started successfully');
  }

  async stop(): Promise<void> {
    if (!this.running) {
      logger.warn('Bot engine not running');
      return;
    }

    logger.info('Stopping bot engine...');
    this.running = false;

    await this.monitorManager.stop();
    await this.executorEngine.stop();

    logger.info('Bot engine stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  getStatus(): { running: boolean; chainId: number; uptime: number } {
    return {
      running: this.running,
      chainId: this.config.chainId,
      uptime: process.uptime(),
    };
  }
}

export { logger };
