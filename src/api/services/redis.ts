import Redis from 'ioredis';
import { ActiveOrder, OrderProgress, OrderStatus } from '../types';

export class RedisService {
  private redis: Redis;
  private readonly ACTIVE_ORDERS_KEY = 'active_orders';
  private readonly ORDER_PROGRESS_KEY = 'order_progress';
  private readonly WS_CONNECTIONS_KEY = 'ws_connections';

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    });

    this.redis.on('connect', () => {
      console.log('✅ Redis connected successfully');
    });

    this.redis.on('error', (error) => {
      console.error('❌ Redis connection error:', error);
    });
  }

  // Active Orders Management
  async setActiveOrder(orderId: string, orderData: ActiveOrder): Promise<void> {
    const key = `${this.ACTIVE_ORDERS_KEY}:${orderId}`;
    await this.redis.setex(key, 3600, JSON.stringify(orderData)); // 1 hour TTL
  }

  async getActiveOrder(orderId: string): Promise<ActiveOrder | null> {
    const key = `${this.ACTIVE_ORDERS_KEY}:${orderId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async removeActiveOrder(orderId: string): Promise<void> {
    const key = `${this.ACTIVE_ORDERS_KEY}:${orderId}`;
    await this.redis.del(key);
  }

  async getAllActiveOrders(): Promise<ActiveOrder[]> {
    const keys = await this.redis.keys(`${this.ACTIVE_ORDERS_KEY}:*`);
    if (keys.length === 0) return [];

    const orders = await this.redis.mget(...keys);
    return orders
      .filter(order => order !== null)
      .map(order => JSON.parse(order!));
  }

  // Order Progress Management
  async setOrderProgress(orderId: string, progress: OrderProgress): Promise<void> {
    const key = `${this.ORDER_PROGRESS_KEY}:${orderId}`;
    await this.redis.setex(key, 3600, JSON.stringify(progress)); // 1 hour TTL
  }

  async getOrderProgress(orderId: string): Promise<OrderProgress | null> {
    const key = `${this.ORDER_PROGRESS_KEY}:${orderId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async removeOrderProgress(orderId: string): Promise<void> {
    const key = `${this.ORDER_PROGRESS_KEY}:${orderId}`;
    await this.redis.del(key);
  }

  // WebSocket Connections Management
  async addWebSocketConnection(orderId: string, connectionId: string): Promise<void> {
    const key = `${this.WS_CONNECTIONS_KEY}:${orderId}`;
    await this.redis.sadd(key, connectionId);
    await this.redis.expire(key, 3600); // 1 hour TTL
  }

  async removeWebSocketConnection(orderId: string, connectionId: string): Promise<void> {
    const key = `${this.WS_CONNECTIONS_KEY}:${orderId}`;
    await this.redis.srem(key, connectionId);
  }

  async getWebSocketConnections(orderId: string): Promise<string[]> {
    const key = `${this.WS_CONNECTIONS_KEY}:${orderId}`;
    return await this.redis.smembers(key);
  }

  // Utility methods
  async isOrderActive(orderId: string): Promise<boolean> {
    const key = `${this.ACTIVE_ORDERS_KEY}:${orderId}`;
    return await this.redis.exists(key) === 1;
  }

  async getOrderStatus(orderId: string): Promise<OrderStatus | null> {
    const order = await this.getActiveOrder(orderId);
    return order ? order.status : null;
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
} 