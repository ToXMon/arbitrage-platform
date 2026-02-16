/**
 * MonitorManager - Manages multiple blockchain monitors
 */

import { Logger } from 'pino';
import { BlockchainMonitor, MonitorConfig, SwapEvent } from './blockchain';

export class MonitorManager {
  private monitors: Map<number, BlockchainMonitor> = new Map();
  private logger: Logger;
  private redisUrl?: string;

  constructor(logger: Logger, redisUrl?: string) {
    this.logger = logger.child({ module: 'monitor-manager' });
    this.redisUrl = redisUrl;
  }

  async start(chainId: number): Promise<void> {
    if (this.monitors.has(chainId)) {
      this.logger.warn({ chainId }, 'Monitor already running');
      return;
    }

    const config = this.getMonitorConfig(chainId);
    const monitor = new BlockchainMonitor(this.logger, config);

    await monitor.start();
    this.monitors.set(chainId, monitor);
    this.logger.info({ chainId }, 'Monitor started');
  }

  async stop(): Promise<void> {
    for (const [chainId, monitor] of this.monitors) {
      await monitor.stop();
      this.logger.info({ chainId }, 'Monitor stopped');
    }
    this.monitors.clear();
  }

  getMonitor(chainId: number): BlockchainMonitor | undefined {
    return this.monitors.get(chainId);
  }

  getAllMonitors(): BlockchainMonitor[] {
    return Array.from(this.monitors.values());
  }

  private getMonitorConfig(chainId: number): MonitorConfig {
    const chainConfigs: Record<number, { rpc: string; ws?: string }> = {
      1: {
        rpc: 'https://eth-mainnet.public.blastapi.io',
        ws: 'wss://eth-mainnet.public.blastapi.io',
      },
      42161: {
        rpc: 'https://arb1.arbitrum.io/rpc',
      },
      10: {
        rpc: 'https://mainnet.optimism.io',
      },
      8453: {
        rpc: 'https://mainnet.base.org',
      },
      137: {
        rpc: 'https://polygon-rpc.com',
      },
      56: {
        rpc: 'https://bsc-dataseed.binance.org',
      },
      43114: {
        rpc: 'https://api.avax.network/ext/bc/C/rpc',
      },
      250: {
        rpc: 'https://rpc.ftm.tools',
      },
    };

    const config = chainConfigs[chainId] || { rpc: '' };

    return {
      chainId,
      rpcUrl: process.env.RPC_URL || config.rpc,
      wsUrl: process.env.WS_URL || config.ws,
    };
  }
}
