import { FastifyRequest } from 'fastify';

// Order execution status
export enum OrderStatus {
  PENDING = 'pending',
  ROUTING = 'routing',
  BUILDING = 'building',
  SUBMITTED = 'submitted',
  CONFIRMED = 'confirmed',
  FAILED = 'failed'
}

// Order execution request
export interface OrderRequest {
  tokenIn: string;
  tokenOut: string;
  amount: number;
  maxSlippage?: number;
}

// Order execution response
export interface OrderResponse {
  orderId: string;
  status: OrderStatus;
  message: string;
}

// WebSocket message types
export interface WebSocketMessage {
  type: 'order_update';
  orderId: string;
  status: OrderStatus;
  data?: any;
  timestamp: string;
}

// Order execution progress data
export interface OrderProgress {
  orderId: string;
  status: OrderStatus;
  message: string;
  data?: {
    quote?: {
      dex: string;
      price: number;
      fee: number;
    };
    txHash?: string;
    executedPrice?: number;
    slippage?: number;
    error?: string;
  };
  timestamp: Date;
}

// Database order record
export interface OrderRecord {
  id: string;
  token_in: string;
  token_out: string;
  amount: number;
  max_slippage: number;
  status: OrderStatus;
  quote_dex?: string;
  quote_price?: number;
  quote_fee?: number;
  tx_hash?: string;
  executed_price?: number;
  slippage?: number;
  error_message?: string;
  created_at: Date;
  updated_at: Date;
}

// Redis active order data
export interface ActiveOrder {
  orderId: string;
  status: OrderStatus;
  progress: OrderProgress;
  createdAt: Date;
}

// Request with order ID
export interface OrderRequestWithId extends FastifyRequest {
  params: {
    orderId: string;
  };
}

// BullMQ job data
export interface OrderJobData {
  orderId: string;
  orderRequest: OrderRequest;
} 