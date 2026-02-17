import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { WebSocket } from 'ws';
import { registerRoutes } from './routes/index.js';
import { closeDb, testConnection as testDbConnection } from './db/index.js';
import {
  closeRedis,
  testRedisConnection,
  redisSubscriber,
  CHANNELS,
} from './redis/index.js';
import type { WSMessage } from './types.js';

// Create Fastify instance
const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
});

// WebSocket connections set for broadcasting
const wsClients = new Set<WebSocket>();

// Register plugins
async function registerPlugins() {
  // CORS configuration
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // WebSocket support
  await fastify.register(websocket);
}

// WebSocket endpoint for real-time updates
function setupWebSocket() {
  fastify.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (socket: WebSocket) => {
      fastify.log.info('WebSocket client connected');
      wsClients.add(socket);

      // Send welcome message
      const welcomeMessage: WSMessage = {
        type: 'system',
        payload: { message: 'Connected to arbitrage platform' },
        timestamp: Date.now(),
      };
      socket.send(JSON.stringify(welcomeMessage));

      // Handle incoming messages from client
      socket.on('message', (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString()) as {
            type?: string;
            channels?: unknown;
          };
          fastify.log.debug({ data }, 'Received WebSocket message');

          // Handle subscription requests
          if (data.type === 'subscribe') {
            socket.send(JSON.stringify({
              type: 'system',
              payload: { subscribed: data.channels },
              timestamp: Date.now(),
            }));
          }
        } catch (error) {
          fastify.log.error({ error }, 'Invalid WebSocket message');
        }
      });

      // Handle client disconnect
      socket.on('close', () => {
        fastify.log.info('WebSocket client disconnected');
        wsClients.delete(socket);
      });

      // Handle errors
      socket.on('error', (error: Error) => {
        fastify.log.error({ error }, 'WebSocket error');
        wsClients.delete(socket);
      });
    });
  });
}

// Redis subscription for broadcasting to WebSocket clients
async function setupRedisBroadcast() {
  const channels = Object.values(CHANNELS);
  
  await redisSubscriber.subscribe(...channels);
  
  redisSubscriber.on('message', (channel, message) => {
    const wsMessage: WSMessage = {
      type: channel.split(':')[1] as WSMessage['type'],
      payload: JSON.parse(message),
      timestamp: Date.now(),
    };
    
    // Broadcast to all connected WebSocket clients
    const messageStr = JSON.stringify(wsMessage);
    wsClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  });
}

// Global error handler
function setupErrorHandler() {
  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error({ error, request }, 'Unhandled error');
    
    if (error.validation) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.validation,
        },
      });
    }
    
    return reply.status(error.statusCode || 500).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'An unexpected error occurred',
      },
    });
  });
}

// Graceful shutdown handler
function setupShutdown() {
  const shutdown = async (signal: string) => {
    fastify.log.info(`Received ${signal}, shutting down gracefully...`);
    
    try {
      // Close all WebSocket connections
      wsClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.close(1001, 'Server shutting down');
        }
      });
      
      // Close Redis connections
      await closeRedis();
      
      // Close database connection
      closeDb();
      
      // Close Fastify
      await fastify.close();
      
      fastify.log.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      fastify.log.error({ error }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Start server
async function start() {
  try {
    // Test database connection
    if (!testDbConnection()) {
      fastify.log.warn('Database connection failed - some features may not work');
    }

    // Test Redis connection
    const redisConnected = await testRedisConnection();
    if (!redisConnected) {
      fastify.log.warn('Redis connection failed - real-time updates disabled');
    }

    // Register plugins
    await registerPlugins();

    // Setup WebSocket
    setupWebSocket();

    // Setup Redis broadcast if connected
    if (redisConnected) {
      await setupRedisBroadcast();
    }

    // Register routes
    await registerRoutes(fastify);

    // Setup error handler
    setupErrorHandler();

    // Setup graceful shutdown
    setupShutdown();

    // Start listening
    const host = process.env.HOST || '0.0.0.0';
    const port = parseInt(process.env.PORT || '3001', 10);

    await fastify.listen({ port, host });
    
    fastify.log.info(`Server running at http://${host}:${port}`);
    fastify.log.info(`WebSocket endpoint: ws://${host}:${port}/ws`);
  } catch (error) {
    fastify.log.error(error, 'Failed to start server');
    process.exit(1);
  }
}

// Run the server
start();
