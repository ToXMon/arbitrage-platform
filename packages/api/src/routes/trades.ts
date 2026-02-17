import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { db, schema } from '../db/index.js';
import { eq, desc, and } from 'drizzle-orm';
import { ExecuteTradeSchema, TradeQuerySchema, type ApiResponse, type Trade } from '../types.js';
import { publish, CHANNELS } from '../redis/index.js';
import type { ExecuteTrade, TradeQuery } from '../types.js';

export default async function tradesRoutes(fastify: FastifyInstance) {
  // GET /trades - List trade history with filtering
  fastify.get<{ Querystring: TradeQuery; Reply: ApiResponse<Trade[]> }>(
    '/trades',
    async (request, reply) => {
      try {
        const validationResult = TradeQuerySchema.safeParse(request.query);
        
        if (!validationResult.success) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid query parameters',
              details: validationResult.error.issues,
            },
          });
        }
        
        const { chain, botId, status, limit, offset } = validationResult.data;
        
        // Build filter conditions
        const conditions = [];
        if (chain) {
          conditions.push(eq(schema.trades.chain, chain));
        }
        if (botId) {
          conditions.push(eq(schema.trades.botId, botId));
        }
        if (status) {
          conditions.push(eq(schema.trades.status, status));
        }
        
        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
        
        // Get total count
        const allTrades = await db
          .select()
          .from(schema.trades)
          .where(whereClause);
        
        // Get paginated results
        const results = await db
          .select()
          .from(schema.trades)
          .where(whereClause)
          .orderBy(desc(schema.trades.createdAt))
          .limit(limit)
          .offset(offset);
        
        return reply.send({
          success: true,
          data: results.map(trade => ({
            ...trade,
            createdAt: new Date(trade.createdAt),
            confirmedAt: trade.confirmedAt ? new Date(trade.confirmedAt) : null,
          })),
          meta: {
            total: allTrades.length,
            limit,
            offset,
          },
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

  // GET /trades/:id - Get single trade
  fastify.get<{ Params: { id: string }; Reply: ApiResponse<Trade> }>(
    '/trades/:id',
    async (request, reply) => {
      try {
        const { id } = request.params;
        const [trade] = await db
          .select()
          .from(schema.trades)
          .where(eq(schema.trades.id, id));
        
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

  // POST /trades - Execute a trade
  fastify.post<{ Body: ExecuteTrade; Reply: ApiResponse<Trade> }>(
    '/trades',
    async (request, reply) => {
      try {
        const validationResult = ExecuteTradeSchema.safeParse(request.body);
        
        if (!validationResult.success) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid request body',
              details: validationResult.error.issues,
            },
          });
        }
        
        const { opportunityId, botId, maxGasPrice, slippageTolerance } = validationResult.data;
        
        // Verify opportunity exists
        const [opportunity] = await db
          .select()
          .from(schema.opportunities)
          .where(eq(schema.opportunities.id, opportunityId));
        
        if (!opportunity) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Opportunity not found' },
          });
        }
        
        if (opportunity.executed) {
          return reply.status(400).send({
            success: false,
            error: { code: 'ALREADY_EXECUTED', message: 'Opportunity already executed' },
          });
        }
        
        // Verify bot exists and is running
        const [bot] = await db
          .select()
          .from(schema.bots)
          .where(eq(schema.bots.id, botId));
        
        if (!bot) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Bot not found' },
          });
        }
        
        if (bot.status !== 'running') {
          return reply.status(400).send({
            success: false,
            error: { code: 'BOT_NOT_RUNNING', message: 'Bot is not in running state' },
          });
        }
        
        // Create trade record
        const now = new Date();
        const tradeId = uuidv4();
        
        await db.insert(schema.trades).values({
          id: tradeId,
          opportunityId,
          botId,
          tokenIn: opportunity.tokenIn,
          tokenOut: opportunity.tokenOut,
          amountIn: opportunity.amountIn,
          amountOut: '0', // Will be updated after execution
          profit: '0',
          gasUsed: '0',
          gasPrice: maxGasPrice || '0',
          txHash: null,
          status: 'pending',
          chain: opportunity.chain,
          error: null,
          createdAt: now,
          confirmedAt: null,
        });
        
        // Mark opportunity as executed
        await db
          .update(schema.opportunities)
          .set({ executed: true })
          .where(eq(schema.opportunities.id, opportunityId));
        
        // Publish trade event for WebSocket clients
        await publish(CHANNELS.TRADES, {
          type: 'trade_created',
          tradeId,
          opportunityId,
          botId,
          chain: opportunity.chain,
          timestamp: now.getTime(),
        });
        
        const [newTrade] = await db
          .select()
          .from(schema.trades)
          .where(eq(schema.trades.id, tradeId));
        
        return reply.status(201).send({
          success: true,
          data: {
            ...newTrade!,
            createdAt: new Date(newTrade!.createdAt),
            confirmedAt: null,
          },
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: { code: 'DB_ERROR', message: 'Failed to execute trade' },
        });
      }
    }
  );

  // POST /trades/:id/cancel - Cancel a pending trade
  fastify.post<{ Params: { id: string }; Reply: ApiResponse<Trade> }>(
    '/trades/:id/cancel',
    async (request, reply) => {
      try {
        const { id } = request.params;
        const [trade] = await db
          .select()
          .from(schema.trades)
          .where(eq(schema.trades.id, id));

        if (!trade) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Trade not found' },
          });
        }

        if (trade.status !== 'pending') {
          return reply.status(400).send({
            success: false,
            error: { code: 'NOT_CANCELLABLE', message: `Trade status is '${trade.status}', only pending trades can be cancelled` },
          });
        }

        await db
          .update(schema.trades)
          .set({ status: 'failed', error: 'Cancelled by user' })
          .where(eq(schema.trades.id, id));

        // Un-execute the opportunity so it can be retried
        if (trade.opportunityId) {
          await db
            .update(schema.opportunities)
            .set({ executed: false })
            .where(eq(schema.opportunities.id, trade.opportunityId));
        }

        await publish(CHANNELS.TRADES, {
          type: 'trade_cancelled',
          tradeId: id,
          timestamp: Date.now(),
        });

        const [updatedTrade] = await db
          .select()
          .from(schema.trades)
          .where(eq(schema.trades.id, id));

        return reply.send({
          success: true,
          data: {
            ...updatedTrade!,
            createdAt: new Date(updatedTrade!.createdAt),
            confirmedAt: updatedTrade!.confirmedAt ? new Date(updatedTrade!.confirmedAt) : null,
          },
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: { code: 'DB_ERROR', message: 'Failed to cancel trade' },
        });
      }
    }
  );

  // GET /trades/stats - Get trade statistics
  fastify.get<{ Querystring: { chain?: string; botId?: string } }>(
    '/trades/stats',
    async (request, reply) => {
      try {
        const { chain, botId } = request.query;
        
        const conditions = [];
        if (chain) {
          conditions.push(eq(schema.trades.chain, chain));
        }
        if (botId) {
          conditions.push(eq(schema.trades.botId, botId));
        }
        
        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
        const trades = await db.select().from(schema.trades).where(whereClause);
        
        const stats = {
          total: trades.length,
          confirmed: trades.filter(t => t.status === 'confirmed').length,
          pending: trades.filter(t => t.status === 'pending').length,
          failed: trades.filter(t => t.status === 'failed').length,
          totalProfit: trades
            .filter(t => t.status === 'confirmed')
            .reduce((sum, t) => sum + parseFloat(t.profit || '0'), 0),
          totalGasUsed: trades
            .filter(t => t.status === 'confirmed')
            .reduce((sum, t) => sum + parseFloat(t.gasUsed || '0'), 0),
        };
        
        return reply.send({
          success: true,
          data: stats,
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: { code: 'DB_ERROR', message: 'Failed to fetch trade statistics' },
        });
      }
    }
  );
}
