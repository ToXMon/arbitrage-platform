/**
 * Bot service - business logic for bot management
 */

import type { BotConfig } from '../types.js';

// In-memory storage (will be replaced with database)
const bots: Map<string, BotConfig & { id: string; enabled: boolean; status: string }> = new Map();

interface CreateBotInput {
  name: string;
  chainId: number;
  strategy: string;
  config?: Record<string, unknown>;
}

interface UpdateBotInput {
  name?: string;
  strategy?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
}

export const botService = {
  async getBots(): Promise<Array<BotConfig & { id: string; enabled: boolean; status: string }>> {
    return Array.from(bots.values());
  },

  async getBotById(id: string): Promise<(BotConfig & { id: string; enabled: boolean; status: string }) | null> {
    return bots.get(id) || null;
  },

  async createBot(input: CreateBotInput): Promise<BotConfig & { id: string; enabled: boolean; status: string }> {
    const id = `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const bot: BotConfig & { id: string; enabled: boolean; status: string } = {
      id,
      botId: id,
      chainId: input.chainId,
      privateKey: '', // Will be set securely
      strategies: [
        {
          name: input.strategy,
          enabled: true,
          minProfitUSD: 10,
          maxTradeSizeUSD: 10000,
          maxGasPriceGwei: 100,
        },
      ],
      monitors: [],
      enabled: true,
      status: 'stopped',
    };

    bots.set(id, bot);
    return bot;
  },

  async updateBot(id: string, input: UpdateBotInput): Promise<(BotConfig & { id: string; enabled: boolean; status: string }) | null> {
    const bot = bots.get(id);
    if (!bot) return null;

    if (input.enabled !== undefined) {
      bot.enabled = input.enabled;
    }

    bots.set(id, bot);
    return bot;
  },

  async deleteBot(id: string): Promise<void> {
    bots.delete(id);
  },

  async startBot(id: string): Promise<{ success: boolean; status: string }> {
    const bot = bots.get(id);
    if (!bot) {
      return { success: false, status: 'not_found' };
    }

    bot.status = 'running';
    bots.set(id, bot);

    return { success: true, status: 'running' };
  },

  async stopBot(id: string): Promise<{ success: boolean; status: string }> {
    const bot = bots.get(id);
    if (!bot) {
      return { success: false, status: 'not_found' };
    }

    bot.status = 'stopped';
    bots.set(id, bot);

    return { success: true, status: 'stopped' };
  },

  async getBotStatus(id: string): Promise<{ status: string; enabled: boolean }> {
    const bot = bots.get(id);
    if (!bot) {
      return { status: 'not_found', enabled: false };
    }
    return { status: bot.status, enabled: bot.enabled };
  },

  async getBotStats(id: string): Promise<{
    totalTrades: number;
    successfulTrades: number;
    totalProfit: string;
    uptime: number;
  }> {
    const bot = bots.get(id);
    if (!bot) {
      return {
        totalTrades: 0,
        successfulTrades: 0,
        totalProfit: '0',
        uptime: 0,
      };
    }

    // TODO: Calculate actual stats from trade history
    return {
      totalTrades: 0,
      successfulTrades: 0,
      totalProfit: '0',
      uptime: bot.status === 'running' ? process.uptime() : 0,
    };
  },
};
