/**
 * Trade service - business logic for trade execution
 */

import type { TradeExecution, ApiResponse } from '@arbitrage/sdk';

// In-memory storage (will be replaced with database)
const trades: Map<string, TradeExecution> = new Map();

export const tradeService = {
  async getTrades(query: {
    status?: string;
    chainId?: number;
    botId?: string;
    limit: number;
    offset: number;
  }): Promise<ApiResponse<TradeExecution[]>> {
    let filtered = Array.from(trades.values());

    if (query.status) {
      filtered = filtered.filter((t) => t.status === query.status);
    }

    const total = filtered.length;
    const paginated = filtered.slice(query.offset, query.offset + query.limit);

    return {
      success: true,
      data: paginated,
      timestamp: Date.now(),
    };
  },

  async getTradeById(id: string): Promise<TradeExecution | null> {
    return trades.get(id) || null;
  },

  async executeTrade(
    opportunityId: string,
    botId: string
  ): Promise<TradeExecution> {
    const trade: TradeExecution = {
      opportunityId,
      status: 'pending',
      timestamp: Date.now(),
    };

    trades.set(opportunityId, trade);

    // TODO: Queue trade execution to bot
    // TODO: Update trade status as execution progresses

    return trade;
  },

  async getStats(): Promise<{
    total: number;
    successful: number;
    failed: number;
    totalProfit: bigint;
  }> {
    const all = Array.from(trades.values());
    const successful = all.filter((t) => t.status === 'confirmed');
    const failed = all.filter((t) => t.status === 'failed' || t.status === 'reverted');

    return {
      total: all.length,
      successful: successful.length,
      failed: failed.length,
      totalProfit: successful.reduce((sum, t) => sum + (t.profit || 0n), 0n),
    };
  },

  async cancelTrade(id: string): Promise<{ success: boolean }> {
    const trade = trades.get(id);
    if (!trade) {
      return { success: false };
    }

    if (trade.status !== 'pending') {
      return { success: false };
    }

    trade.status = 'failed';
    trade.error = 'Cancelled by user';
    trades.set(id, trade);

    return { success: true };
  },
};
