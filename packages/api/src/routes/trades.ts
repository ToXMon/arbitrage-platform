/**
 * Trade routes - REST API endpoints for trade operations
 */

import { FastifyInstance } from 'fastify';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { trades } from '../db/schema.js';
import { redisPublisher, CHANNELS, cacheSet, cacheGet } from '../redis/index.js';
import { TradeQuerySchema, ExecuteTradeSchema, type ApiResponse, type Trade } from '../types.js';

// Trade execution channels
const TRADE_CHANNELS = {
  EXECUTE: 'trade:execute',
  STATUS_UPDATE: 'trade:status',
  CANCEL: 'trade:cancel',
} as const;

// Trade timeout in milliseconds
const TRADE_TIMEOUT_MS = 60000;

// Active trade tracking
const activeTrades = new Map<string, { timeoutId: NodeJS.Timeout; botId: string }>();

// Generate unique trade ID
function generateTradeId(): string {
  return `trade-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// Broadcast trade update via Redis
async function broadcastTradeUpdate(data: unknown): Promise<void> {
  await redisPublisher.publish(
    CHANNELS.TRADES,
    JSON.stringify({ type: 'trade_update', data })
  );
}

export default async function tradesRoutes(fastify: FastifyInstance) {
  // GET /trades - List trades with filtering
  fastify.get<{ Querystring: { status?: string; botId?: string; limit?: number; offset?: number }; Reply: ApiResponse<Trade[]> }>(
    '/trades',
    async (request, reply) => {
      try {
        const query = TradeQuerySchema.parse(request.query);
        const conditions = [];

        if (query.status) {
          conditions.push(eq(trades.status, query.status as typeof trades.$inferSelect['status']));
        }
        if (query.botId) {
          conditions.push(eq(trades.botId, query.botId));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const results = await db
          .select()
          .from(trades)
          .where(whereClause)
          .orderBy(desc(trades.createdAt))
          .limit(query.limit)
          .offset(query.offset);

        const [{ count: totalCount }] = await db
          .select({ count: sql<number>`count(*)` })
          .from(trades)
          .where(whereClause);

        return reply.send({
          success: true,
          data: results.map((t) => ({
            ...t,
            createdAt: new Date(t.createdAt),
            confirmedAt: t.confirmedAt ? new Date(t.confirmedAt) : null,
          })),
          meta: { total: Number(totalCount), limit: query.limit, offset: query.offset },
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: { code: 'DB_ERROR', message: 'Failed to fetch trades' },
        });
      }
    }
  );

  // GET /trades/stats - Get trade statistics
  fastify.get('/trades/stats', async (request, reply) => {
    try {
      // Check cache first
      const cached = await cacheGet('trades:stats');

      if (cached) {
        return reply.send({ success: true, data: cached });
      }

      const now = new Date();
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // All-time stats
      const [allStats] = await db
        .select({
          total: sql<number>`count(*)`,
          successful: sql<number>`sum(case when status = 'confirmed' then 1 else 0 end)`,
          failed: sql<number>`sum(case when status in ('failed', 'reverted') then 1 else 0 end)`,
          totalProfit: sql<string>`coalesce(sum(case when status = 'confirmed' then cast(profit as real) else 0 end), 0)`,
        })
        .from(trades);

      // 24h stats
      const [stats24h] = await db
        .select({
          trades: sql<number>`count(*)`,
          profit: sql<string>`coalesce(sum(case when status = 'confirmed' then cast(profit as real) else 0 end), 0)`,
          successful: sql<number>`sum(case when status = 'confirmed' then 1 else 0 end)`,
        })
        .from(trades)
        .where(gte(trades.createdAt, dayAgo));

      // 7d stats
      const [stats7d] = await db
        .select({
          trades: sql<number>`count(*)`,
          profit: sql<string>`coalesce(sum(case when status = 'confirmed' then cast(profit as real) else 0 end), 0)`,
          successful: sql<number>`sum(case when status = 'confirmed' then 1 else 0 end)`,
        })
        .from(trades)
        .where(gte(trades.createdAt, weekAgo));

      // 30d stats
      const [stats30d] = await db
        .select({
          trades: sql<number>`count(*)`,
          profit: sql<string>`coalesce(sum(case when status = 'confirmed' then cast(profit as real) else 0 end), 0)`,
          successful: sql<number>`sum(case when status = 'confirmed' then 1 else 0 end)`,
        })
        .from(trades)
        .where(gte(trades.createdAt, monthAgo));

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

      return reply.send({ success: true, data: result });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'DB_ERROR', message: 'Failed to fetch trade stats' },
      });
    }
  });

  // GET /trades/history - Get trade history grouped by time for charts
  fastify.get<{ Querystring: { groupBy?: 'hour' | 'day'; period?: '24h' | '7d' | '30d'; botId?: string } }>(
    '/trades/history',
    async (request, reply) => {
      try {
        const { groupBy = 'hour', period = '24h', botId } = request.query;

        // Calculate time range
        const now = new Date();
        let startDate: Date;
        let numSlots: number;

        switch (period) {
          case '7d':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            numSlots = 7;
            break;
          case '30d':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            numSlots = 30;
            break;
          default:
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            numSlots = 24;
        }

        const conditions = [gte(trades.createdAt, startDate)];
        if (botId) {
          conditions.push(eq(trades.botId, botId));
        }

        const timeFormat = groupBy === 'hour' ? '%Y-%m-%d %H:00' : '%Y-%m-%d';

        const results = await db
          .select({
            time: sql<string>`strftime(${timeFormat}, datetime(created_at / 1000, 'unixepoch'))`,
            profit: sql<number>`coalesce(sum(case when status = 'confirmed' then cast(profit as real) else 0 end), 0)`,
            trades: sql<number>`count(*)`,
          })
          .from(trades)
          .where(and(...conditions))
          .groupBy(sql`strftime(${timeFormat}, datetime(created_at / 1000, 'unixepoch'))`)
          .orderBy(sql`strftime(${timeFormat}, datetime(created_at / 1000, 'unixepoch'))`);

        const resultMap = new Map(results.map((r) => [r.time, r]));
        const slotMs = groupBy === 'hour' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

        // Fill in missing time slots
        const buckets: Array<{ time: string; profit: number; trades: number; timestamp: number }> = [];
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

        return reply.send({ success: true, data: buckets, timestamp: Date.now() });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: { code: 'DB_ERROR', message: 'Failed to fetch trade history' },
        });
      }
    }
  );

  // GET /trades/:id - Get single trade
  fastify.get<{ Params: { id: string }; Reply: ApiResponse<Trade> }>(
    '/trades/:id',
    async (request, reply) => {
      try {
        const { id } = request.params;
        const [trade] = await db.select().from(trades).where(eq(trades.id, id));

        if (!trade) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Trade not found' },
          });
        }

        return reply.send({
          success: true,
          data: {
            ...trade,
            createdAt: new Date(trade.createdAt),
            confirmedAt: trade.confirmedAt ? new Date(trade.confirmedAt) : null,
          },
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: { code: 'DB_ERROR', message: 'Failed to fetch trade' },
        });
      }
    }
  );

  // POST /trades/execute - Execute a new trade
  fastify.post<{ Body: { opportunityId: string; botId: string; maxGasPrice?: string; slippageTolerance?: number } }>(
    '/trades/execute',
    async (request, reply) => {
      try {
        const body = ExecuteTradeSchema.parse(request.body);
        const tradeId = generateTradeId();
        const now = new Date();

        // Create trade record
        await db.insert(trades).values({
          id: tradeId,
          opportunityId: body.opportunityId,
          botId: body.botId,
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
        });

        // Set up timeout
        const timeoutId = setTimeout(async () => {
          try {
            await db.update(trades).set({ status: 'failed', error: 'Trade execution timed out' }).where(eq(trades.id, tradeId));
            await broadcastTradeUpdate({ tradeId, status: 'timeout' });
            activeTrades.delete(tradeId);
          } catch (err) {
            fastify.log.error(err);
          }
        }, TRADE_TIMEOUT_MS);

        activeTrades.set(tradeId, { timeoutId, botId: body.botId });

        // Update status to queued
        await db.update(trades).set({ status: 'submitted' }).where(eq(trades.id, tradeId));

        // Publish to Redis for bot
        await redisPublisher.publish(
          TRADE_CHANNELS.EXECUTE,
          JSON.stringify({
            tradeId,
            opportunityId: body.opportunityId,
            botId: body.botId,
            options: { maxGasPrice: body.maxGasPrice, slippageTolerance: body.slippageTolerance },
            timestamp: Date.now(),
          })
        );

        // Broadcast update
        await broadcastTradeUpdate({ tradeId, opportunityId: body.opportunityId, status: 'queued' });

        return reply.status(201).send({
          success: true,
          data: { tradeId, opportunityId: body.opportunityId, status: 'pending' },
          timestamp: Date.now(),
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: { code: 'EXECUTION_ERROR', message: 'Failed to execute trade' },
        });
      }
    }
  );

  // POST /trades/:id/cancel - Cancel a pending trade
  fastify.post<{ Params: { id: string } }>('/trades/:id/cancel', async (request, reply) => {
    try {
      const { id } = request.params;
      const [trade] = await db.select().from(trades).where(eq(trades.id, id));

      if (!trade) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Trade not found' },
        });
      }

      if (!['pending', 'submitted'].includes(trade.status)) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_STATUS', message: 'Trade cannot be cancelled in current status' },
        });
      }

      // Cancel in DB
      await db.update(trades).set({ status: 'failed', error: 'Cancelled by user' }).where(eq(trades.id, id));

      // Clean up active trade
      const active = activeTrades.get(id);
      if (active) {
        clearTimeout(active.timeoutId);
        activeTrades.delete(id);
      }

      // Broadcast
      await broadcastTradeUpdate({ tradeId: id, status: 'cancelled' });

      return reply.send({ success: true, data: { cancelled: true } });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'CANCEL_ERROR', message: 'Failed to cancel trade' },
      });
    }
  });
}
