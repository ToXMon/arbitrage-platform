/**
 * Global error handler middleware
 */

import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: unknown;
  };
  timestamp: number;
  requestId?: string;
}

export async function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const requestId = request.id;
  const timestamp = Date.now();

  // Log the error
  request.log.error({
    error: {
      message: error.message,
      stack: error.stack,
    },
    requestId,
    path: request.url,
    method: request.method,
  });

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const response: ErrorResponse = {
      success: false,
      error: {
        message: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: error.errors,
      },
      timestamp,
      requestId,
    };
    return reply.code(400).send(response);
  }

  // Handle Fastify errors with status codes
  if ('statusCode' in error) {
    const statusCode = error.statusCode || 500;
    const response: ErrorResponse = {
      success: false,
      error: {
        message: error.message || 'An error occurred',
        code: error.code || 'UNKNOWN_ERROR',
      },
      timestamp,
      requestId,
    };
    return reply.code(statusCode).send(response);
  }

  // Handle generic errors
  const response: ErrorResponse = {
    success: false,
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
    },
    timestamp,
    requestId,
  };

  return reply.code(500).send(response);
}
