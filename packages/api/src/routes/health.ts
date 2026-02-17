import { FastifyInstance } from 'fastify';
import { testConnection as testDbConnection } from '../db/index.js';
import { testRedisConnection } from '../redis/index.js';
import type { HealthResponse, ApiResponse } from '../types.js';

const startTime = Date.now();
const VERSION = '1.0.0';

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get<{ Reply: ApiResponse<HealthResponse> }>('/health', async (request, reply) => {
    const [dbConnected, redisConnected] = await Promise.all([
      Promise.resolve(testDbConnection()),
      testRedisConnection(),
    ]);

    const allHealthy = dbConnected && redisConnected;
    const status: HealthResponse['status'] = allHealthy
      ? 'ok'
      : (dbConnected || redisConnected ? 'degraded' : 'error');

    const healthData: HealthResponse = {
      status,
      timestamp: new Date().toISOString(),
      version: VERSION,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      services: {
        database: dbConnected ? 'connected' : 'disconnected',
        redis: redisConnected ? 'connected' : 'disconnected',
      },
    };

    return reply.status(status === 'ok' ? 200 : 503).send({
      success: status !== 'error',
      data: healthData,
    });
  });

  // Liveness probe for Kubernetes
  fastify.get('/health/live', async (request, reply) => {
    return reply.status(200).send({ status: 'alive' });
  });

  // Readiness probe for Kubernetes
  fastify.get('/health/ready', async (request, reply) => {
    const [dbConnected, redisConnected] = await Promise.all([
      Promise.resolve(testDbConnection()),
      testRedisConnection(),
    ]);

    if (dbConnected && redisConnected) {
      return reply.status(200).send({ status: 'ready' });
    }
    return reply.status(503).send({ status: 'not ready' });
  });
}
