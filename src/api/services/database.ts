import { Pool, PoolClient } from 'pg';
import { OrderRecord, OrderStatus } from '../types';

export class DatabaseService {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5433'),
      database: process.env.DB_NAME || 'order_execution',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
    });

    this.initDatabase();
  }

  private async initDatabase() {
    try {
      await this.createTables();
      console.log('✅ Database initialized successfully');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
    }
  }

  private async createTables() {
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS orders (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          token_in VARCHAR(50) NOT NULL,
          token_out VARCHAR(50) NOT NULL,
          amount DECIMAL(20, 8) NOT NULL,
          max_slippage DECIMAL(5, 4) NOT NULL DEFAULT 0.05,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          quote_dex VARCHAR(50),
          quote_price DECIMAL(20, 8),
          quote_fee DECIMAL(5, 4),
          tx_hash VARCHAR(100),
          executed_price DECIMAL(20, 8),
          slippage DECIMAL(5, 4),
          error_message TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);

      // Add new columns if they do not exist
      await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 1;`);
      await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS failure_reason TEXT;`);
      await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS requires_wrapping BOOLEAN DEFAULT FALSE;`);

      // Create indexes (safe to run even if already exist)
      await client.query(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_orders_attempts ON orders(attempts);`);
    } finally {
      client.release();
    }
  }

  async createOrder(orderData: {
    orderId?: string;
    tokenIn: string;
    tokenOut: string;
    amount: number;
    maxSlippage: number;
  }): Promise<string> {
    const client = await this.pool.connect();
    
    try {
      let query: string;
      let values: any[];
      
      if (orderData.orderId) {
        query = `INSERT INTO orders (id, token_in, token_out, amount, max_slippage)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING id`;
        values = [orderData.orderId, orderData.tokenIn, orderData.tokenOut, orderData.amount, orderData.maxSlippage];
      } else {
        query = `INSERT INTO orders (token_in, token_out, amount, max_slippage)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id`;
        values = [orderData.tokenIn, orderData.tokenOut, orderData.amount, orderData.maxSlippage];
      }
      
      const result = await client.query(query, values);
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  async updateOrderStatus(
    orderId: string, 
    status: OrderStatus, 
    data?: {
      quoteDex?: string;
      quotePrice?: number;
      quoteFee?: number;
      txHash?: string;
      executedPrice?: number;
      slippage?: number;
      errorMessage?: string | null;
      attempts?: number;
      failureReason?: string;
      requiresWrapping?: boolean;
    }
  ): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      const updates: string[] = ['status = $2', 'updated_at = NOW()'];
      const values: any[] = [orderId, status];
      let paramIndex = 3;

      if (data?.quoteDex) {
        updates.push(`quote_dex = $${paramIndex++}`);
        values.push(data.quoteDex);
      }
      if (data?.quotePrice !== undefined) {
        updates.push(`quote_price = $${paramIndex++}`);
        values.push(data.quotePrice);
      }
      if (data?.quoteFee !== undefined) {
        updates.push(`quote_fee = $${paramIndex++}`);
        values.push(data.quoteFee);
      }
      if (data?.txHash) {
        updates.push(`tx_hash = $${paramIndex++}`);
        values.push(data.txHash);
      }
      if (data?.executedPrice !== undefined) {
        updates.push(`executed_price = $${paramIndex++}`);
        values.push(data.executedPrice);
      }
      if (data?.slippage !== undefined) {
        updates.push(`slippage = $${paramIndex++}`);
        values.push(data.slippage);
      }
      if (data?.errorMessage !== undefined) {
        updates.push(`error_message = $${paramIndex++}`);
        values.push(data.errorMessage);
      }
      if (data?.attempts !== undefined) {
        updates.push(`attempts = $${paramIndex++}`);
        values.push(data.attempts);
      }
      if (data?.failureReason) {
        updates.push(`failure_reason = $${paramIndex++}`);
        values.push(data.failureReason);
      }
      if (data?.requiresWrapping !== undefined) {
        updates.push(`requires_wrapping = $${paramIndex++}`);
        values.push(data.requiresWrapping);
      }

      await client.query(
        `UPDATE orders SET ${updates.join(', ')} WHERE id = $1`,
        values
      );
    } finally {
      client.release();
    }
  }

  async getOrder(orderId: string): Promise<OrderRecord | null> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(
        'SELECT * FROM orders WHERE id = $1',
        [orderId]
      );
      
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async getOrders(limit: number = 50, offset: number = 0): Promise<OrderRecord[]> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(
        'SELECT * FROM orders ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [limit, offset]
      );
      
      return result.rows;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
} 