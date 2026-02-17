/**
 * MonitorManager - Manages multiple blockchain monitors
 */

import { Logger } from 'pino';
import { BlockchainMonitor, MonitorConfig } from './blockchain';
import { getChainConfig } from '../config.js';

export class MonitorManager {
  private monitors: Map<number, BlockchainMonitor> = new Map();
  private logger: Logger;

  constructor(logger: Logger, _redisUrl?: string) {
    this.logger = logger.child({ module: 'monitor-manager' });
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
    const chainConfig = getChainConfig(chainId as any);
    const defaultRpcUrl = chainConfig.rpcUrls[0] ?? '';
    const defaultWsUrl = chainConfig.wsRpcUrls[0];

    return {
      chainId,
      rpcUrl: process.env.RPC_URL || defaultRpcUrl,
      ...(process.env.WS_URL || defaultWsUrl
        ? { wsUrl: process.env.WS_URL || defaultWsUrl }
        : {}),
    };
  }
}
