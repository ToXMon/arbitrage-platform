import { FastifyInstance } from 'fastify';
import healthRoutes from './health.js';
import botsRoutes from './bots.js';
import opportunitiesRoutes from './opportunities.js';
import tradesRoutes from './trades.js';

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // Register all routes
  await fastify.register(healthRoutes);
  await fastify.register(botsRoutes);
  await fastify.register(opportunitiesRoutes);
  await fastify.register(tradesRoutes);
}

export { healthRoutes, botsRoutes, opportunitiesRoutes, tradesRoutes };
