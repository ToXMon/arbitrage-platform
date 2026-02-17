import { FastifyInstance, FastifyRequest } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { db, schema } from '../db/index.js';
import { eq, desc } from 'drizzle-orm';
import { CreateBotSchema, UpdateBotSchema, type ApiResponse, type Bot } from '../types.js';
import type { CreateBot, UpdateBot } from '../types.js';

export default async function botsRoutes(fastify: FastifyInstance) {
  // GET /bots - List all bots
  fastify.get<{ Reply: ApiResponse<Bot[]> }>('/bots', async (request, reply) => {
    try {
      const allBots = await db.select().from(schema.bots).orderBy(desc(schema.bots.createdAt));
      
      return reply.send({
        success: true,
        data: allBots.map(bot => ({
          ...bot,
          createdAt: new Date(bot.createdAt),
          updatedAt: new Date(bot.updatedAt),
        })),
        meta: { total: allBots.length },
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'DB_ERROR', message: 'Failed to fetch bots' },
      });
    }
  });

  // GET /bots/:id - Get single bot
  fastify.get<{ Params: { id: string }; Reply: ApiResponse<Bot> }>(
    '/bots/:id',
    async (request, reply) => {
      try {
        const { id } = request.params;
        const [bot] = await db.select().from(schema.bots).where(eq(schema.bots.id, id));
        
        if (!bot) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Bot not found' },
          });
        }
        
        return reply.send({
          success: true,
          data: {
            ...bot,
            createdAt: new Date(bot.createdAt),
            updatedAt: new Date(bot.updatedAt),
          },
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: { code: 'DB_ERROR', message: 'Failed to fetch bot' },
        });
      }
    }
  );

  // POST /bots - Create new bot
  fastify.post<{ Body: CreateBot; Reply: ApiResponse<Bot> }>(
    '/bots',
    async (request, reply) => {
      try {
        const validationResult = CreateBotSchema.safeParse(request.body);
        
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
        
        const data = validationResult.data;
        const now = new Date();
        const id = uuidv4();
        
        await db.insert(schema.bots).values({
          id,
          name: data.name,
          chain: data.chain,
          status: 'idle',
          config: data.config as Record<string, unknown>,
          createdAt: now,
          updatedAt: now,
        });
        
        const [newBot] = await db.select().from(schema.bots).where(eq(schema.bots.id, id));
        
        return reply.status(201).send({
          success: true,
          data: {
            ...newBot!,
            createdAt: new Date(newBot!.createdAt),
            updatedAt: new Date(newBot!.updatedAt),
          },
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: { code: 'DB_ERROR', message: 'Failed to create bot' },
        });
      }
    }
  );

  // PUT /bots/:id - Update bot
  fastify.put<{ Params: { id: string }; Body: UpdateBot; Reply: ApiResponse<Bot> }>(
    '/bots/:id',
    async (request, reply) => {
      try {
        const { id } = request.params;
        const validationResult = UpdateBotSchema.safeParse(request.body);
        
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
        
        const [existingBot] = await db.select().from(schema.bots).where(eq(schema.bots.id, id));
        
        if (!existingBot) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Bot not found' },
          });
        }
        
        const updateData = validationResult.data;
        const now = new Date();
        
        await db
          .update(schema.bots)
          .set({
            ...(updateData.name && { name: updateData.name }),
            ...(updateData.chain && { chain: updateData.chain }),
            ...(updateData.status && { status: updateData.status }),
            ...(updateData.config && { config: updateData.config as Record<string, unknown> }),
            updatedAt: now,
          })
          .where(eq(schema.bots.id, id));
        
        const [updatedBot] = await db.select().from(schema.bots).where(eq(schema.bots.id, id));
        
        return reply.send({
          success: true,
          data: {
            ...updatedBot!,
            createdAt: new Date(updatedBot!.createdAt),
            updatedAt: new Date(updatedBot!.updatedAt),
          },
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: { code: 'DB_ERROR', message: 'Failed to update bot' },
        });
      }
    }
  );

  // POST /bots/:id/start - Start a bot
  fastify.post<{ Params: { id: string }; Reply: ApiResponse<Bot> }>(
    '/bots/:id/start',
    async (request, reply) => {
      try {
        const { id } = request.params;
        const [bot] = await db.select().from(schema.bots).where(eq(schema.bots.id, id));

        if (!bot) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Bot not found' },
          });
        }

        if (bot.status === 'running') {
          return reply.status(400).send({
            success: false,
            error: { code: 'ALREADY_RUNNING', message: 'Bot is already running' },
          });
        }

        const now = new Date();
        await db
          .update(schema.bots)
          .set({ status: 'running', updatedAt: now })
          .where(eq(schema.bots.id, id));

        const [updatedBot] = await db.select().from(schema.bots).where(eq(schema.bots.id, id));

        return reply.send({
          success: true,
          data: {
            ...updatedBot!,
            createdAt: new Date(updatedBot!.createdAt),
            updatedAt: new Date(updatedBot!.updatedAt),
          },
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: { code: 'DB_ERROR', message: 'Failed to start bot' },
        });
      }
    }
  );

  // POST /bots/:id/stop - Stop a bot
  fastify.post<{ Params: { id: string }; Reply: ApiResponse<Bot> }>(
    '/bots/:id/stop',
    async (request, reply) => {
      try {
        const { id } = request.params;
        const [bot] = await db.select().from(schema.bots).where(eq(schema.bots.id, id));

        if (!bot) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Bot not found' },
          });
        }

        if (bot.status !== 'running') {
          return reply.status(400).send({
            success: false,
            error: { code: 'NOT_RUNNING', message: 'Bot is not running' },
          });
        }

        const now = new Date();
        await db
          .update(schema.bots)
          .set({ status: 'idle', updatedAt: now })
          .where(eq(schema.bots.id, id));

        const [updatedBot] = await db.select().from(schema.bots).where(eq(schema.bots.id, id));

        return reply.send({
          success: true,
          data: {
            ...updatedBot!,
            createdAt: new Date(updatedBot!.createdAt),
            updatedAt: new Date(updatedBot!.updatedAt),
          },
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: { code: 'DB_ERROR', message: 'Failed to stop bot' },
        });
      }
    }
  );

  // DELETE /bots/:id - Delete bot
  fastify.delete<{ Params: { id: string }; Reply: ApiResponse<void> }>(
    '/bots/:id',
    async (request, reply) => {
      try {
        const { id } = request.params;
        const [existingBot] = await db.select().from(schema.bots).where(eq(schema.bots.id, id));
        
        if (!existingBot) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Bot not found' },
          });
        }
        
        await db.delete(schema.bots).where(eq(schema.bots.id, id));
        
        return reply.status(204).send();
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: { code: 'DB_ERROR', message: 'Failed to delete bot' },
        });
      }
    }
  );
}
