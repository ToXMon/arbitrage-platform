/**
 * Request logging middleware
 */

import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';

export async function requestLogger(
  request: FastifyRequest,
  reply: FastifyReply,
  next: HookHandlerDoneFunction
) {
  const startTime = Date.now();

  // Log request
  request.log.info({
    type: 'request',
    method: request.method,
    url: request.url,
    ip: request.ip,
    userAgent: request.headers['user-agent'],
    requestId: request.id,
  });

  // Add response time to reply headers
  reply.header('x-request-id', request.id);
  reply.header('x-response-time', `${Date.now() - startTime}ms`);

  // Log response on finish
  reply.raw.on('finish', () => {
    request.log.info({
      type: 'response',
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: Date.now() - startTime,
      requestId: request.id,
    });
  });

  next();
}
