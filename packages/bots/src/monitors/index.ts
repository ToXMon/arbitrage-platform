/**
 * Monitor exports and manager
 */

export { BlockchainMonitor } from './blockchain';
export { MonitorManager } from './manager';

import { Logger } from 'pino';
import { BlockchainMonitor } from './blockchain';

export interface MonitorConfig {
  chainId: number;
  rpcUrl: string;
  wsUrl?: string;
}

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

    const monitor = new BlockchainMonitor(this.logger, {
      chainId,
      rpcUrl: process.env.RPC_URL || '',
      wsUrl: process.env.WS_URL,
    });

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
}
