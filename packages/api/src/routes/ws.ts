/**
 * WebSocket handler for real-time updates
 */

import { FastifyRequest } from 'fastify';
import { WebSocket } from 'ws';

interface WebSocketMessage {
  type: string;
  payload: unknown;
}

// Store connected clients
const clients = new Set<WebSocket>();

// Broadcast to all connected clients
export function broadcast(type: string, payload: unknown) {
  const message = JSON.stringify({ type, payload, timestamp: Date.now() });
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

export async function wsHandler(
  connection: { socket: WebSocket },
  request: FastifyRequest
) {
  const { socket } = connection;

  // Add client to set
  clients.add(socket);
  console.log(`WebSocket client connected. Total clients: ${clients.size}`);

  // Send welcome message
  socket.send(
    JSON.stringify({
      type: 'connected',
      payload: { message: 'Connected to arbitrage platform' },
      timestamp: Date.now(),
    })
  );

  // Handle incoming messages
  socket.on('message', (data) => {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());
      handleMessage(socket, message);
    } catch (error) {
      socket.send(
        JSON.stringify({
          type: 'error',
          payload: { message: 'Invalid message format' },
          timestamp: Date.now(),
        })
      );
    }
  });

  // Handle close
  socket.on('close', () => {
    clients.delete(socket);
    console.log(`WebSocket client disconnected. Total clients: ${clients.size}`);
  });

  // Handle error
  socket.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(socket);
  });
}

function handleMessage(socket: WebSocket, message: WebSocketMessage) {
  switch (message.type) {
    case 'ping':
      socket.send(
        JSON.stringify({
          type: 'pong',
          payload: {},
          timestamp: Date.now(),
        })
      );
      break;

    case 'subscribe':
      // Handle subscription to specific channels
      socket.send(
        JSON.stringify({
          type: 'subscribed',
          payload: message.payload,
          timestamp: Date.now(),
        })
      );
      break;

    default:
      socket.send(
        JSON.stringify({
          type: 'error',
          payload: { message: `Unknown message type: ${message.type}` },
          timestamp: Date.now(),
        })
      );
  }
}
