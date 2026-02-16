import { FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq, desc, and, gte } from 'drizzle-orm';
import { OpportunityQuerySchema, type ApiResponse, type Opportunity } from '../types/index.js';
import type { OpportunityQuery } from '../types/index.js';

export default async function opportunitiesRoutes(fastify: FastifyInstance) {
  // GET /opportunities - List arbitrage opportunities with filtering
  fastify.get<{ Querystring: OpportunityQuery; Reply: ApiResponse<Opportunity[]> }>(
    '/opportunities',
    async (request, reply) => {
      try {
        const validationResult = OpportunityQuerySchema.safeParse(request.query);
        
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
        
        const { chain, minProfit, limit, offset } = validationResult.data;
        
        // Build filter conditions
        const conditions = [];
        if (chain) {
          conditions.push(eq(schema.opportunities.chain, chain));
        }
        if (minProfit) {
          conditions.push(gte(schema.opportunities.expectedProfit, minProfit));
        }
        
        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
        
        // Get total count for pagination
        const allOpportunities = await db
          .select()
          .from(schema.opportunities)
          .where(whereClause);
        
        // Get paginated results
        const results = await db
          .select()
          .from(schema.opportunities)
          .where(whereClause)
          .orderBy(desc(schema.opportunities.timestamp))
          .limit(limit)
          .offset(offset);
        
        return reply.send({
          success: true,
          data: results.map(opp => ({
            ...opp,
            timestamp: new Date(opp.timestamp),
          })),
          meta: {
            total: allOpportunities.length,
            limit,
            offset,
          },
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: { code: 'DB_ERROR', message: 'Failed to fetch opportunities' },
        });
      }
    }
  );

  // GET /opportunities/:id - Get single opportunity
  fastify.get<{ Params: { id: string }; Reply: ApiResponse<Opportunity> }>(
    '/opportunities/:id',
    async (request, reply) => {
      try {
        const { id } = request.params;
        const [opportunity] = await db
          .select()
          .from(schema.opportunities)
          .where(eq(schema.opportunities.id, id));
        
        if (!opportunity) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Opportunity not found' },
          });
        }
        
        return reply.send({
          success: true,
          data: {
            ...opportunity,
            timestamp: new Date(opportunity.timestamp),
          },
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: { code: 'DB_ERROR', message: 'Failed to fetch opportunity' },
        });
      }
    }
  );

  // GET /opportunities/latest - Get latest opportunities (last 10 minutes)
  fastify.get<{ Querystring: { chain?: string }; Reply: ApiResponse<Opportunity[]> }>(
    '/opportunities/latest',
    async (request, reply) => {
      try {
        const { chain } = request.query;
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        
        const conditions = [gte(schema.opportunities.timestamp, tenMinutesAgo)];
        if (chain) {
          conditions.push(eq(schema.opportunities.chain, chain));
        }
        
        const results = await db
          .select()
          .from(schema.opportunities)
          .where(and(...conditions))
          .orderBy(desc(schema.opportunities.timestamp))
          .limit(20);
        
        return reply.send({
          success: true,
          data: results.map(opp => ({
            ...opp,
            timestamp: new Date(opp.timestamp),
          })),
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: { code: 'DB_ERROR', message: 'Failed to fetch latest opportunities' },
        });
      }
    }
  );
}
