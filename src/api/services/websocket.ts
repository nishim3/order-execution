import { SocketStream } from '@fastify/websocket';
import { WebSocketMessage, OrderProgress } from '../types';
import { RedisService } from './redis';
import { v4 as uuidv4 } from 'uuid';

export class WebSocketService {
  private connections: Map<string, SocketStream> = new Map();
  private redisService: RedisService;

  constructor(redisService: RedisService) {
    this.redisService = redisService;
  }

  async handleConnection(connection: SocketStream, orderId: string): Promise<void> {
    const connectionId = uuidv4();
    
    // Store connection
    this.connections.set(connectionId, connection);
    
    // Register connection in Redis
    await this.redisService.addWebSocketConnection(orderId, connectionId);

    console.log(`🔌 WebSocket connected for order ${orderId} (${connectionId})`);

    // Send current order progress if available
    const currentProgress = await this.redisService.getOrderProgress(orderId);
    if (currentProgress) {
      await this.sendMessage(connectionId, this.createWebSocketMessage(currentProgress));
    }

    // Handle connection close
    connection.socket.on('close', async () => {
      console.log(`🔌 WebSocket disconnected for order ${orderId} (${connectionId})`);
      this.connections.delete(connectionId);
      await this.redisService.removeWebSocketConnection(orderId, connectionId);
    });

    // Handle incoming messages (if any)
    connection.socket.on('message', (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());
        console.log(`📨 Received message from ${connectionId}:`, data);
      } catch (error) {
        console.error('❌ Failed to parse WebSocket message:', error);
      }
    });

    // Handle errors
    connection.socket.on('error', (error: Error) => {
      console.error(`❌ WebSocket error for ${connectionId}:`, error);
      this.connections.delete(connectionId);
    });
  }

  async broadcastOrderUpdate(orderId: string, progress: OrderProgress): Promise<void> {
    const message = this.createWebSocketMessage(progress);
    
    // Get all connections for this order
    const connectionIds = await this.redisService.getWebSocketConnections(orderId);
    
    // Send message to all connections
    const sendPromises = connectionIds.map(connectionId => 
      this.sendMessage(connectionId, message)
    );

    await Promise.allSettled(sendPromises);
  }

  private async sendMessage(connectionId: string, message: WebSocketMessage): Promise<void> {
    const connection = this.connections.get(connectionId);
    
    if (connection && connection.socket.readyState === 1) { // WebSocket.OPEN
      try {
        connection.socket.send(JSON.stringify(message));
      } catch (error) {
        console.error(`❌ Failed to send message to ${connectionId}:`, error);
        this.connections.delete(connectionId);
      }
    } else {
      // Connection not found or not open, remove from Redis
      this.connections.delete(connectionId);
    }
  }

  private createWebSocketMessage(progress: OrderProgress): WebSocketMessage {
    return {
      type: 'order_update',
      orderId: progress.orderId,
      status: progress.status,
      data: progress.data,
      timestamp: progress.timestamp.toISOString(),
    };
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  async closeAllConnections(): Promise<void> {
    const closePromises = Array.from(this.connections.values()).map(connection => {
      return new Promise<void>((resolve) => {
        if (connection.socket.readyState === 1) {
          connection.socket.close(1000, 'Server shutdown');
        }
        resolve();
      });
    });

    await Promise.all(closePromises);
    this.connections.clear();
  }
} 