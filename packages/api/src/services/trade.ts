/**
 * Trade service - business logic for trade execution
 * Production implementation with Redis queue, status tracking, and persistence
 */

import { eq, and, gte, sql, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { trades as tradesTable } from '../db/schema.js';
import {
  redis,
  redisPublisher,
  cacheSet,
  cacheGet,
  CHANNELS,
} from '../redis/index.js';
import type { TradeExecution, ApiResponse, Trade, TradeRow, NewTrade } from '../types.js';

// Trade execution channels for bot communication
const TRADE_CHANNELS = {
  EXECUTE: 'trade:execute',
  STATUS_UPDATE: 'trade:status',
  CANCEL: 'trade:cancel',
} as const;

// Trade status transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['queued', 'cancelled'],
  queued: ['executing', 'cancelled', 'timeout'],
  executing: ['submitted', 'failed'],
  submitted: ['confirmed', 'failed', 'reverted'],
  confirmed: [],
  failed: [],
  reverted: [],
  cancelled: [],
  timeout: [],
};

// Trade execution timeout in milliseconds
const TRADE_TIMEOUT_MS = 60000; // 60 seconds

// In-memory trade tracking for active executions
const activeTrades = new Map<
  string,
  {
    trade: TradeExecution;
    timeoutId: NodeJS.Timeout;
    botId: string;
  }
>();

export interface TradeQueryParams {
  status?: string;
  chainId?: number;
  botId?: string;
  limit: number;
  offset: number;
}

export interface TradeHistoryBucket {
  time: string;
  profit: number;
  trades: number;
  timestamp: number;
}

export interface TimeBasedStats {
  last24h: { trades: number; profit: string; successRate: number };
  last7d: { trades: number; profit: string; successRate: number };
  last30d: { trades: number; profit: string; successRate: number };
}

/**
 * Generate unique trade ID
 */
function generateTradeId(): string {
  return `trade-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Broadcast trade status update via WebSocket (through Redis pub/sub)
 */
async function broadcastTradeUpdate(trade: TradeExecution): Promise<void> {
  await redisPublisher.publish(
    CHANNELS.TRADES,
    JSON.stringify({
      type: 'trade_update',
      data: trade,
    })
  );
}

/**
 * Update trade status with validation
 */
async function updateTradeStatus(
  tradeId: string,
  newStatus: TradeExecution['status'],
  error?: string
): Promise<TradeExecution | null> {
  // Get current trade from DB
  const [existing] = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.id, tradeId))
    .limit(1);

  if (!existing) {
    console.error(`Trade ${tradeId} not found`);
    return null;
  }

  // Validate status transition
  const validNext = VALID_TRANSITIONS[existing.status] || [];
  if (!validNext.includes(newStatus) && validNext.length > 0) {
    console.error(
      `Invalid status transition: ${existing.status} -> ${newStatus}`
    );
    return null;
  }

  // Update in database
  const updateData: Partial<TradeRow> = {
    status: newStatus as TradeRow['status'],
    updatedAt: new Date(),
  confirmedAt: undefined,
  error: undefined,
  txHash: undefined,
    amountOut: undefined,
    profit: undefined,
    gasUsed: undefined,
  gasPrice: undefined,
  confirmedAt: undefined,
  error: undefined,
  txHash: undefined,
  amountOut: undefined,
    profit: undefined,
    gasUsed: undefined,
    gasPrice: undefined,
  };

  if (error) {
    updateData.error = error;
  }

  if (newStatus === 'confirmed') {
    updateData.confirmedAt = new Date();
  }

  const [updated] = await db
    .update(tradesTable)
    .set(updateData)
    .where(eq(tradesTable.id, tradeId))
    .returning();

  // Create execution object for broadcast
  const execution: TradeExecution = {
    opportunityId: updated.opportunityId || '',
    status: newStatus,
    timestamp: Date.now(),
    ...(error && { error }),
  };

  // Broadcast update
  await broadcastTradeUpdate(execution);

  // Invalidate relevant caches
  await redis.del(`trade:${tradeId}`);
  await redis.del(`trades:stats`);
  if (updated.botId) {
    await redis.del(`bot:${updated.botId}:stats`);
  }

  return execution;
}

/**
 * Handle trade execution timeout
 */
async function handleTradeTimeout(tradeId: string): Promise<void> {
  const active = activeTrades.get(tradeId);
  if (!active) return;

  console.warn(`Trade ${tradeId} timed out`);

  await updateTradeStatus(tradeId, 'timeout', 'Trade execution timed out');
  activeTrades.delete(tradeId);
}

/**
 * Listen for trade execution results from bots
 */
function setupTradeResultListener(): void {
  redis.subscribe(TRADE_CHANNELS.STATUS_UPDATE, (message: unknown) => {
    try {
      const { tradeId, status, result, error } = message as {
        tradeId: string;
        status: string;
        result?: {
          txHash?: string;
          amountOut?: string;
          profit?: string;
          gasUsed?: string;
          gasPrice?: string;
        };
        error?: string;
      };

      const active = activeTrades.get(tradeId);
      if (!active) {
        console.warn(`Received status for unknown trade: ${tradeId}`);
        return;
      }

      // Clear timeout
      clearTimeout(active.timeoutId);
      activeTrades.delete(tradeId);

      // Update trade in database with results
      if (status === 'confirmed' && result) {
        db.update(tradesTable)
          .set({
            status: 'confirmed',
            txHash: result.txHash || null,
            amountOut: result.amountOut || '0',
            profit: result.profit || '0',
            gasUsed: result.gasUsed || '0',
            gasPrice: result.gasPrice || '0',
            confirmedAt: new Date(),
          })
          .where(eq(tradesTable.id, tradeId))
          .execute();
      } else if (status === 'failed' || status === 'reverted') {
        db.update(tradesTable)
          .set({
            status: status as TradeRow['status'],
            error: error || 'Unknown error',
          })
          .where(eq(tradesTable.id, tradeId))
          .execute();
      }

      // Broadcast update
      updateTradeStatus(
        tradeId,
        status as TradeExecution['status'],
        error
      ).catch(console.error);
    } catch (err) {
      console.error('Error processing trade status update:', err);
    }
  });
}

// Initialize listener on module load
setupTradeResultListener();

export const tradeService = {
  /**
   * Get trades with filtering and pagination
   */
  async getTrades(
    query: TradeQueryParams
  ): Promise<ApiResponse<TradeRow[]>> {
    try {
      const conditions = [];

      if (query.status) {
        conditions.push(eq(tradesTable.status, query.status as TradeRow['status']));
      }

      if (query.botId) {
        conditions.push(eq(tradesTable.botId, query.botId));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const results = await db
        .select()
        .from(tradesTable)
        .where(whereClause)
        .orderBy(desc(tradesTable.createdAt))
        .limit(query.limit)
        .offset(query.offset);

      // Get total count
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(tradesTable)
        .where(whereClause);

      return {
        success: true,
        data: results,
        meta: {
          total: Number(count),
          limit: query.limit,
          offset: query.offset,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Error fetching trades:', error);
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to fetch trades',
          details: error,
        },
        timestamp: Date.now(),
      };
    }
  },

  /**
   * Get single trade by ID
   */
  async getTradeById(id: string): Promise<TradeRow | null> {
    // Check cache first
    const cached = await cacheGet<TradeRow>(`trade:${id}`);
    if (cached) return cached;

    const [trade] = await db
      .select()
      .from(tradesTable)
      .where(eq(tradesTable.id, id))
      .limit(1);

    if (trade) {
      await cacheSet(`trade:${id}`, trade, 60); // Cache for 1 minute
    }

    return trade || null;
  },

  /**
   * Execute trade - Queue to bot via Redis
   */
  async executeTrade(
    opportunityId: string,
    botId: string,
    options?: {
      maxGasPrice?: string;
      slippageTolerance?: number;
    }
  ): Promise<TradeExecution> {
    const tradeId = generateTradeId();
    const now = new Date();

    // Create initial trade record
    const newTrade: NewTrade = {
      id: tradeId,
      opportunityId,
      botId,
      tokenIn: '',
      tokenOut: '',
      amountIn: '0',
      amountOut: '0',
      profit: '0',
      gasUsed: '0',
      gasPrice: '0',
      status: 'pending',
      chain: '',
      createdAt: now,
    };

    try {
      // Insert trade into database
      await db.insert(tradesTable).values(newTrade);

      // Create execution object
      const execution: TradeExecution = {
        opportunityId,
        status: 'pending',
        timestamp: Date.now(),
      };

      // Set up timeout handler
      const timeoutId = setTimeout(
        () => handleTradeTimeout(tradeId),
        TRADE_TIMEOUT_MS
      );

      // Track active trade
      activeTrades.set(tradeId, { trade: execution, timeoutId, botId });

      // Update status to queued
      await updateTradeStatus(tradeId, 'queued');

      // Publish trade execution request to Redis for bot consumption
      await redisPublisher.publish(
        TRADE_CHANNELS.EXECUTE,
        JSON.stringify({
          tradeId,
          opportunityId,
          botId,
          options,
          timestamp: Date.now(),
        })
      );

      // Broadcast queued status
      execution.status = 'queued';
      await broadcastTradeUpdate(execution);

      return execution;
    } catch (error) {
      console.error('Error executing trade:', error);

      // Update status to failed
      await updateTradeStatus(tradeId, 'failed', String(error));

      return {
        opportunityId,
        status: 'failed',
        timestamp: Date.now(),
        error: String(error),
      };
    }
  },

  /**
   * Get trade statistics with time-based aggregations
   */
  async getStats(): Promise<{
    total: number;
    successful: number;
    failed: number;
    totalProfit: string;
    timeBased?: TimeBasedStats;
  }> {
    // Check cache first
    const cached = await cacheGet<{
      total: number;
      successful: number;
      failed: number;
      totalProfit: string;
      timeBased?: TimeBasedStats;
    }>('trades:stats');

    if (cached) return cached;

    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get all-time stats
    const [allStats] = await db
      .select({
        total: sql<number>`count(*)`,
        successful: sql<number>`sum(case when status = 'confirmed' then 1 else 0 end)`,
        failed: sql<number>`sum(case when status in ('failed', 'reverted') then 1 else 0 end)`,
        totalProfit: sql<string>`coalesce(sum(case when status = 'confirmed' then cast(profit as real) else 0 end), 0)`,
      })
      .from(tradesTable);

    // Get 24h stats
    const [stats24h] = await db
      .select({
        trades: sql<number>`count(*)`,
        profit: sql<string>`coalesce(sum(case when status = 'confirmed' then cast(profit as real) else 0 end), 0)`,
        successful: sql<number>`sum(case when status = 'confirmed' then 1 else 0 end)`,
      })
      .from(tradesTable)
      .where(gte(tradesTable.createdAt, dayAgo));

    // Get 7d stats
    const [stats7d] = await db
      .select({
        trades: sql<number>`count(*)`,
        profit: sql<string>`coalesce(sum(case when status = 'confirmed' then cast(profit as real) else 0 end), 0)`,
        successful: sql<number>`sum(case when status = 'confirmed' then 1 else 0 end)`,
      })
      .from(tradesTable)
      .where(gte(tradesTable.createdAt, weekAgo));

    // Get 30d stats
    const [stats30d] = await db
      .select({
        trades: sql<number>`count(*)`,
        profit: sql<string>`coalesce(sum(case when status = 'confirmed' then cast(profit as real) else 0 end), 0)`,
        successful: sql<number>`sum(case when status = 'confirmed' then 1 else 0 end)`,
      })
      .from(tradesTable)
      .where(gte(tradesTable.createdAt, monthAgo));

    const result = {
      total: Number(allStats?.total || 0),
      successful: Number(allStats?.successful || 0),
      failed: Number(allStats?.failed || 0),
      totalProfit: String(allStats?.totalProfit || '0'),
      timeBased: {
        last24h: {
          trades: Number(stats24h?.trades || 0),
          profit: String(stats24h?.profit || '0'),
          successRate:
            Number(stats24h?.trades || 0) > 0
              ? Number(stats24h?.successful || 0) / Number(stats24h?.trades)
              : 0,
        },
        last7d: {
          trades: Number(stats7d?.trades || 0),
          profit: String(stats7d?.profit || '0'),
          successRate:
            Number(stats7d?.trades || 0) > 0
              ? Number(stats7d?.successful || 0) / Number(stats7d?.trades)
              : 0,
        },
        last30d: {
          trades: Number(stats30d?.trades || 0),
          profit: String(stats30d?.profit || '0'),
          successRate:
            Number(stats30d?.trades || 0) > 0
              ? Number(stats30d?.successful || 0) / Number(stats30d?.trades)
              : 0,
        },
      },
    };

    // Cache for 30 seconds
    await cacheSet('trades:stats', result, 30);

    return result;
  },

  /**
   * Get trade history grouped by time period for charts
   */
  async getTradeHistory(params: {
    groupBy?: 'hour' | 'day';
    period?: '24h' | '7d' | '30d';
    botId?: string;
  }): Promise<TradeHistoryBucket[]> {
    const { groupBy = 'hour', period = '24h', botId } = params;

    // Calculate time range
    const now = new Date();
    let startDate: Date;
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    // Build query conditions
    const conditions = [gte(tradesTable.createdAt, startDate)];
    if (botId) {
      conditions.push(eq(tradesTable.botId, botId));
    }

    const whereClause = and(...conditions);

    // Group by hour or day
    const timeFormat = groupBy === 'hour' ? '%Y-%m-%d %H:00' : '%Y-%m-%d';

    const results = await db
      .select({
        time: sql<string>`strftime(${timeFormat}, datetime(created_at / 1000, 'unixepoch'))`,
        profit: sql<number>`coalesce(sum(case when status = 'confirmed' then cast(profit as real) else 0 end), 0)`,
        trades: sql<number>`count(*)`,
      })
      .from(tradesTable)
      .where(whereClause)
      .groupBy(sql`strftime(${timeFormat}, datetime(created_at / 1000, 'unixepoch'))`)
      .orderBy(sql`strftime(${timeFormat}, datetime(created_at / 1000, 'unixepoch'))`);

    // Fill in missing time slots with zeros
    const buckets: TradeHistoryBucket[] = [];
    const resultMap = new Map(results.map((r) => [r.time, r]));

    // Generate all time slots
    const numSlots = period === '24h' ? 24 : period === '7d' ? 7 : 30;
    const slotMs =
      groupBy === 'hour'
        ? 60 * 60 * 1000
        : 24 * 60 * 60 * 1000;

    for (let i = 0; i < numSlots; i++) {
      const slotTime = new Date(now.getTime() - (numSlots - 1 - i) * slotMs);
      const timeStr =
        groupBy === 'hour'
          ? slotTime.toISOString().slice(0, 13).replace('T', ' ') + ':00'
          : slotTime.toISOString().slice(0, 10);

      const result = resultMap.get(timeStr);
      buckets.push({
        time: groupBy === 'hour' ? `${i}:00` : timeStr,
        profit: Number(result?.profit || 0),
        trades: Number(result?.trades || 0),
        timestamp: slotTime.getTime(),
      });
    }

    return buckets;
  },

  /**
   * Cancel pending trade
   */
  async cancelTrade(id: string): Promise<{ success: boolean; error?: string }> {
    const trade = await this.getTradeById(id);
    if (!trade) {
      return { success: false, error: 'Trade not found' };
    }

    if (!['pending', 'queued'].includes(trade.status)) {
      return { success: false, error: 'Trade cannot be cancelled in current status' };
    }

    // Publish cancel message
    await redisPublisher.publish(
      TRADE_CHANNELS.CANCEL,
      JSON.stringify({ tradeId: id, timestamp: Date.now() })
    );

    // Update status
    await updateTradeStatus(id, 'cancelled', 'Cancelled by user');

    // Clean up active trade if exists
    const active = activeTrades.get(id);
    if (active) {
      clearTimeout(active.timeoutId);
      activeTrades.delete(id);
    }

    return { success: true };
  },
};
