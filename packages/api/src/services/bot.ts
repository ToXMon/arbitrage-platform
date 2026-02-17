/**
 * Bot service - business logic for bot management
 * Production implementation with real stats from trade history
 */

import { eq, and, gte, sql, desc, count } from 'drizzle-orm';
import { db } from '../db/index.js';
import { bots as botsTable, trades as tradesTable } from '../db/schema.js';
import { cacheSet, cacheGet } from '../redis/index.js';
import type { BotRow, NewBot } from '../db/schema.js';

// Cache TTL in seconds
const BOT_STATS_CACHE_TTL = 30; // 30 seconds
const BOT_LIST_CACHE_TTL = 60; // 1 minute

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

export interface BotStats {
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  totalProfit: string;
  avgProfit: string;
  winRate: number;
  uptime: number;
  performance: {
    avgExecutionTime: number;
    avgGasUsed: string;
    profitPerTrade: string;
  };
  timeBased: {
    last24h: {
      trades: number;
      profit: string;
      successRate: number;
    };
    last7d: {
      trades: number;
      profit: string;
      successRate: number;
    };
    last30d: {
      trades: number;
      profit: string;
      successRate: number;
    };
  };
}

// Track bot start times for uptime calculation
const botStartTimes = new Map<string, Date>();

/**
 * Generate unique bot ID
 */
function generateBotId(): string {
  return `bot-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Map database row to API response format
 */
function mapBotToResponse(bot: BotRow): BotRow & { enabled: boolean } {
  return {
    ...bot,
    enabled: bot.status !== 'paused',
  };
}

export const botService = {
  /**
   * Get all bots
   */
  async getBots(): Promise<Array<BotRow & { enabled: boolean }>> {
    // Check cache first
    const cached = await cacheGet<Array<BotRow & { enabled: boolean }>>('bots:list');
    if (cached) return cached;

    const bots = await db.select().from(botsTable).orderBy(desc(botsTable.createdAt));

    const result = bots.map(mapBotToResponse);

    // Cache result
    await cacheSet('bots:list', result, BOT_LIST_CACHE_TTL);

    return result;
  },

  /**
   * Get bot by ID
   */
  async getBotById(id: string): Promise<(BotRow & { enabled: boolean }) | null> {
    // Check cache first
    const cached = await cacheGet<BotRow & { enabled: boolean }>(`bot:${id}`);
    if (cached) return cached;

    const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, id)).limit(1);

    if (!bot) return null;

    const result = mapBotToResponse(bot);
    await cacheSet(`bot:${id}`, result, BOT_LIST_CACHE_TTL);

    return result;
  },

  /**
   * Create new bot
   */
  async createBot(input: CreateBotInput): Promise<BotRow & { enabled: boolean }> {
    const id = generateBotId();
    const now = new Date();

    const newBot: NewBot = {
      id,
      name: input.name,
      chain: input.chainId.toString(),
      status: 'idle',
      config: {
        strategy: input.strategy,
        chainId: input.chainId,
        ...input.config,
      },
      createdAt: now,
      updatedAt: now,
    };

    const [bot] = await db.insert(botsTable).values(newBot).returning();

    // Invalidate cache
    await cacheSet('bots:list', null, 0); // Clear cache

    return mapBotToResponse(bot);
  },

  /**
   * Update bot
   */
  async updateBot(
    id: string,
    input: UpdateBotInput
  ): Promise<(BotRow & { enabled: boolean }) | null> {
    const bot = await this.getBotById(id);
    if (!bot) return null;

    const updateData: Partial<BotRow> = {
      updatedAt: new Date(),
    };

    if (input.name) {
      updateData.name = input.name;
    }

    if (input.config) {
      updateData.config = { ...bot.config, ...input.config } as Record<string, unknown>;
    }

    if (input.enabled !== undefined) {
      updateData.status = input.enabled ? 'running' : 'paused';
    }

    const [updated] = await db
      .update(botsTable)
      .set(updateData)
      .where(eq(botsTable.id, id))
      .returning();

    // Invalidate caches
    await cacheSet(`bot:${id}`, null, 0);
    await cacheSet('bots:list', null, 0);

    return updated ? mapBotToResponse(updated) : null;
  },

  /**
   * Delete bot
   */
  async deleteBot(id: string): Promise<void> {
    await db.delete(botsTable).where(eq(botsTable.id, id));

    // Invalidate caches
    await cacheSet(`bot:${id}`, null, 0);
    await cacheSet(`bot:${id}:stats`, null, 0);
    await cacheSet('bots:list', null, 0);

    // Clean up start time tracking
    botStartTimes.delete(id);
  },

  /**
   * Start bot
   */
  async startBot(id: string): Promise<{ success: boolean; status: string }> {
    const bot = await this.getBotById(id);
    if (!bot) {
      return { success: false, status: 'not_found' };
    }

    if (bot.status === 'running') {
      return { success: true, status: 'running' };
    }

    // Update status
    await db.update(botsTable).set({ status: 'running', updatedAt: new Date() }).where(eq(botsTable.id, id));

    // Track start time for uptime
    botStartTimes.set(id, new Date());

    // Invalidate caches
    await cacheSet(`bot:${id}`, null, 0);
    await cacheSet('bots:list', null, 0);

    return { success: true, status: 'running' };
  },

  /**
   * Stop bot
   */
  async stopBot(id: string): Promise<{ success: boolean; status: string }> {
    const bot = await this.getBotById(id);
    if (!bot) {
      return { success: false, status: 'not_found' };
    }

    // Update status
    await db.update(botsTable).set({ status: 'idle', updatedAt: new Date() }).where(eq(botsTable.id, id));

    // Invalidate caches
    await cacheSet(`bot:${id}`, null, 0);
    await cacheSet('bots:list', null, 0);

    return { success: true, status: 'stopped' };
  },

  /**
   * Get bot status
   */
  async getBotStatus(id: string): Promise<{ status: string; enabled: boolean }> {
    const bot = await this.getBotById(id);
    if (!bot) {
      return { status: 'not_found', enabled: false };
    }
    return { status: bot.status, enabled: bot.status !== 'paused' };
  },

  /**
   * Get comprehensive bot statistics from trade history
   */
  async getBotStats(id: string): Promise<BotStats> {
    // Check cache first
    const cacheKey = `bot:${id}:stats`;
    const cached = await cacheGet<BotStats>(cacheKey);
    if (cached) return cached;

    // Default empty stats
    const emptyStats: BotStats = {
      totalTrades: 0,
      successfulTrades: 0,
      failedTrades: 0,
      totalProfit: '0',
      avgProfit: '0',
      winRate: 0,
      uptime: 0,
      performance: {
        avgExecutionTime: 0,
        avgGasUsed: '0',
        profitPerTrade: '0',
      },
      timeBased: {
        last24h: { trades: 0, profit: '0', successRate: 0 },
        last7d: { trades: 0, profit: '0', successRate: 0 },
        last30d: { trades: 0, profit: '0', successRate: 0 },
      },
    };

    // Verify bot exists
    const bot = await this.getBotById(id);
    if (!bot) {
      return emptyStats;
    }

    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    try {
      // Get all-time stats
      const [allTimeStats] = await db
        .select({
          totalTrades: sql<number>`count(*)`,
          successfulTrades: sql<number>`sum(case when status = 'confirmed' then 1 else 0 end)`,
          failedTrades: sql<number>`sum(case when status in ('failed', 'reverted') then 1 else 0 end)`,
          totalProfit: sql<string>`coalesce(sum(case when status = 'confirmed' then cast(profit as real) else 0 end), 0)`,
          avgProfit: sql<string>`coalesce(avg(case when status = 'confirmed' then cast(profit as real) else null end), 0)`,
          avgGasUsed: sql<string>`coalesce(avg(case when status = 'confirmed' then cast(gas_used as real) else null end), 0)`,
        })
        .from(tradesTable)
        .where(eq(tradesTable.botId, id));

      // Get 24h stats
      const [stats24h] = await db
        .select({
          trades: sql<number>`count(*)`,
          profit: sql<string>`coalesce(sum(case when status = 'confirmed' then cast(profit as real) else 0 end), 0)`,
          successful: sql<number>`sum(case when status = 'confirmed' then 1 else 0 end)`,
        })
        .from(tradesTable)
        .where(and(eq(tradesTable.botId, id), gte(tradesTable.createdAt, dayAgo)));

      // Get 7d stats
      const [stats7d] = await db
        .select({
          trades: sql<number>`count(*)`,
          profit: sql<string>`coalesce(sum(case when status = 'confirmed' then cast(profit as real) else 0 end), 0)`,
          successful: sql<number>`sum(case when status = 'confirmed' then 1 else 0 end)`,
        })
        .from(tradesTable)
        .where(and(eq(tradesTable.botId, id), gte(tradesTable.createdAt, weekAgo)));

      // Get 30d stats
      const [stats30d] = await db
        .select({
          trades: sql<number>`count(*)`,
          profit: sql<string>`coalesce(sum(case when status = 'confirmed' then cast(profit as real) else 0 end), 0)`,
          successful: sql<number>`sum(case when status = 'confirmed' then 1 else 0 end)`,
        })
        .from(tradesTable)
        .where(and(eq(tradesTable.botId, id), gte(tradesTable.createdAt, monthAgo)));

      // Calculate uptime
      const startTime = botStartTimes.get(id);
      let uptime = 0;
      if (startTime && bot.status === 'running') {
        uptime = (now.getTime() - startTime.getTime()) / 1000; // in seconds
      }

      const totalTrades = Number(allTimeStats?.totalTrades || 0);
      const successfulTrades = Number(allTimeStats?.successfulTrades || 0);
      const failedTrades = Number(allTimeStats?.failedTrades || 0);
      const totalProfit = Number(allTimeStats?.totalProfit || 0);
      const avgProfit = Number(allTimeStats?.avgProfit || 0);
      const avgGasUsed = Number(allTimeStats?.avgGasUsed || 0);

      const result: BotStats = {
        totalTrades,
        successfulTrades,
        failedTrades,
        totalProfit: totalProfit.toFixed(6),
        avgProfit: avgProfit.toFixed(6),
        winRate: totalTrades > 0 ? successfulTrades / totalTrades : 0,
        uptime,
        performance: {
          avgExecutionTime: 0, // Would need to track execution times in trades table
          avgGasUsed: avgGasUsed.toFixed(0),
          profitPerTrade: totalTrades > 0 ? (totalProfit / totalTrades).toFixed(6) : '0',
        },
        timeBased: {
          last24h: {
            trades: Number(stats24h?.trades || 0),
            profit: Number(stats24h?.profit || 0).toFixed(6),
            successRate:
              Number(stats24h?.trades || 0) > 0
                ? Number(stats24h?.successful || 0) / Number(stats24h?.trades)
                : 0,
          },
          last7d: {
            trades: Number(stats7d?.trades || 0),
            profit: Number(stats7d?.profit || 0).toFixed(6),
            successRate:
              Number(stats7d?.trades || 0) > 0
                ? Number(stats7d?.successful || 0) / Number(stats7d?.trades)
                : 0,
          },
          last30d: {
            trades: Number(stats30d?.trades || 0),
            profit: Number(stats30d?.profit || 0).toFixed(6),
            successRate:
              Number(stats30d?.trades || 0) > 0
                ? Number(stats30d?.successful || 0) / Number(stats30d?.trades)
                : 0,
          },
        },
      };

      // Cache result
      await cacheSet(cacheKey, result, BOT_STATS_CACHE_TTL);

      return result;
    } catch (error) {
      console.error('Error calculating bot stats:', error);
      return emptyStats;
    }
  },

  /**
   * Get bot performance metrics
   */
  async getBotPerformance(id: string): Promise<{
    dailyProfit: Array<{ date: string; profit: number; trades: number }>;
    hourlyProfit: Array<{ hour: string; profit: number; trades: number }>;
  }> {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get daily profit for last 7 days
    const dailyData = await db
      .select({
        date: sql<string>`date(datetime(created_at / 1000, 'unixepoch'))`,
        profit: sql<number>`coalesce(sum(case when status = 'confirmed' then cast(profit as real) else 0 end), 0)`,
        trades: sql<number>`count(*)`,
      })
      .from(tradesTable)
      .where(and(eq(tradesTable.botId, id), gte(tradesTable.createdAt, weekAgo)))
      .groupBy(sql`date(datetime(created_at / 1000, 'unixepoch'))`)
      .orderBy(sql`date(datetime(created_at / 1000, 'unixepoch'))`);

    // Get hourly profit for last 24 hours
    const hourlyData = await db
      .select({
        hour: sql<string>`strftime('%Y-%m-%d %H:00', datetime(created_at / 1000, 'unixepoch'))`,
        profit: sql<number>`coalesce(sum(case when status = 'confirmed' then cast(profit as real) else 0 end), 0)`,
        trades: sql<number>`count(*)`,
      })
      .from(tradesTable)
      .where(and(eq(tradesTable.botId, id), gte(tradesTable.createdAt, dayAgo)))
      .groupBy(sql`strftime('%Y-%m-%d %H:00', datetime(created_at / 1000, 'unixepoch'))`)
      .orderBy(sql`strftime('%Y-%m-%d %H:00', datetime(created_at / 1000, 'unixepoch'))`);

    return {
      dailyProfit: dailyData.map((d) => ({
        date: d.date,
        profit: Number(d.profit),
        trades: Number(d.trades),
      })),
      hourlyProfit: hourlyData.map((h) => ({
        hour: h.hour,
        profit: Number(h.profit),
        trades: Number(h.trades),
      })),
    };
  },
};
