import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { v4 as uuidv4 } from 'uuid';

import { DatabaseService } from './services/database';
import { RedisService } from './services/redis';
import { QueueService } from './services/queue';
import { WebSocketService } from './services/websocket';
import { OrderRequest, OrderResponse, OrderStatus, OrderProgress } from './types';
import { MockDexRouter } from '../index';

// Initialize services
const databaseService = new DatabaseService();
const redisService = new RedisService();
const queueService = new QueueService(databaseService, redisService);
const wsService = new WebSocketService(redisService);
const dexRouter = new MockDexRouter();

// Helper function to get status message
function getStatusMessage(status: OrderStatus): string {
  switch (status) {
    case OrderStatus.PENDING:
      return 'Order received and queued';
    case OrderStatus.ROUTING:
      return 'Comparing DEX prices';
    case OrderStatus.BUILDING:
      return 'Creating transaction';
    case OrderStatus.SUBMITTED:
      return 'Transaction sent to network';
    case OrderStatus.CONFIRMED:
      return 'Transaction confirmed';
    case OrderStatus.FAILED:
      return 'Order execution failed';
    default:
      return 'Unknown status';
  }
}

// Create Fastify instance
const fastify = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
      },
    },
  },
});

// Register plugins
fastify.register(cors, {
  origin: true,
});

fastify.register(websocket);

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Quote endpoint - get best price without placing order
fastify.post('/api/orders/quote', async (request, reply) => {
  try {
    const quoteRequest = request.body as {
      tokenIn: string;
      tokenOut: string;
      amount: number;
    };

    // Validate request
    if (!quoteRequest.tokenIn || !quoteRequest.tokenOut || !quoteRequest.amount) {
      return reply.status(400).send({
        error: 'Missing required fields: tokenIn, tokenOut, amount',
      });
    }

    if (quoteRequest.amount <= 0) {
      return reply.status(400).send({
        error: 'Amount must be greater than 0',
      });
    }

    // Get best quote from DEX router
    const bestQuote = await dexRouter.getBestQuote(
      quoteRequest.tokenIn,
      quoteRequest.tokenOut,
      quoteRequest.amount
    );

    // Calculate fee amount from input token
    const feeAmount = quoteRequest.amount * bestQuote.quote.fee;
    const amountAfterFee = quoteRequest.amount - feeAmount;
    
    // Calculate output based on amount after fee
    const estimatedOutput = amountAfterFee * bestQuote.quote.price;

    const response = {
      tokenIn: quoteRequest.tokenIn,
      tokenOut: quoteRequest.tokenOut,
      amount: quoteRequest.amount,
      quote: {
        dex: bestQuote.dex,
        price: bestQuote.quote.price,
        fee: bestQuote.quote.fee,
        feeAmount: feeAmount,
        amountAfterFee: amountAfterFee,
        feePercentage: (bestQuote.quote.fee * 100).toFixed(2) + '%',
      },
      estimatedOutput: estimatedOutput.toFixed(6),
      timestamp: new Date().toISOString(),
    };

    return reply.status(200).send(response);
  } catch (error) {
    fastify.log.error('Error getting quote:', error);
    return reply.status(500).send({
      error: 'Internal server error',
    });
  }
});

// Order execution endpoint
fastify.post('/api/orders/execute', async (request, reply) => {
  try {
    const orderRequest = request.body as OrderRequest;

    // Validate request
    if (!orderRequest.tokenIn || !orderRequest.tokenOut || !orderRequest.amount) {
      return reply.status(400).send({
        error: 'Missing required fields: tokenIn, tokenOut, amount',
      });
    }

    if (orderRequest.amount <= 0) {
      return reply.status(400).send({
        error: 'Amount must be greater than 0',
      });
    }

    // Generate order ID
    const orderId = uuidv4();

    // Create order in database
    await databaseService.createOrder({
      orderId,
      tokenIn: orderRequest.tokenIn,
      tokenOut: orderRequest.tokenOut,
      amount: orderRequest.amount,
      maxSlippage: orderRequest.maxSlippage || 0.05,
    });

    // Set initial progress
    const initialProgress: OrderProgress = {
      orderId,
      status: OrderStatus.PENDING,
      message: 'Order received and queued',
      timestamp: new Date(),
    };

    await redisService.setOrderProgress(orderId, initialProgress);
    await redisService.setActiveOrder(orderId, {
      orderId,
      status: OrderStatus.PENDING,
      progress: initialProgress,
      createdAt: new Date(),
    });

    // Add to processing queue
    await queueService.addOrderJob(orderId, orderRequest);

    // Broadcast initial status
    await wsService.broadcastOrderUpdate(orderId, initialProgress);

    const response: OrderResponse = {
      orderId,
      status: OrderStatus.PENDING,
      message: 'Order received and queued',
    };

    return reply.status(200).send(response);
  } catch (error) {
    fastify.log.error('Error creating order:', error);
    return reply.status(500).send({
      error: 'Internal server error',
    });
  }
});

// WebSocket endpoint for order updates
fastify.register(async function (fastify) {
  fastify.get('/api/orders/:orderId/ws', { websocket: true }, async (connection, req) => {
    const orderId = (req.params as any).orderId;

    // Validate order exists
    const order = await databaseService.getOrder(orderId);
    if (!order) {
      connection.socket.close(1008, 'Order not found');
      return;
    }

    await wsService.handleConnection(connection, orderId);
  });
});

// Get order status endpoint
fastify.get('/api/orders/:orderId', async (request, reply) => {
  try {
    const orderId = (request.params as any).orderId;

    // Try to get from Redis first (active order)
    const activeOrder = await redisService.getActiveOrder(orderId);
    if (activeOrder) {
      return reply.status(200).send(activeOrder.progress);
    }

    // Fall back to database (completed order)
    const order = await databaseService.getOrder(orderId);
    if (!order) {
      return reply.status(404).send({
        error: 'Order not found',
      });
    }

    // Calculate fee details for completed orders (same as quote API)
    let quoteData = undefined;
    let estimatedOutput = undefined;
    
    if (order.quote_dex && order.quote_price && order.quote_fee) {
      const feeAmount = parseFloat(order.amount.toString()) * parseFloat(order.quote_fee.toString());
      const amountAfterFee = parseFloat(order.amount.toString()) - feeAmount;
      const calculatedOutput = amountAfterFee * parseFloat(order.quote_price.toString());
      
      quoteData = {
        dex: order.quote_dex,
        price: order.quote_price,
        fee: order.quote_fee,
        feeAmount: feeAmount,
        amountAfterFee: amountAfterFee,
        feePercentage: (parseFloat(order.quote_fee.toString()) * 100).toFixed(2) + '%',
      };
      estimatedOutput = calculatedOutput.toFixed(6);
    }

    const progress: OrderProgress = {
      orderId: order.id,
      status: order.status,
      message: getStatusMessage(order.status),
      data: {
        quote: quoteData,
        estimatedOutput: estimatedOutput,
        txHash: order.tx_hash,
        executedPrice: order.executed_price,
        slippage: order.slippage,
        error: order.error_message,
        requiresWrapping: order.requires_wrapping,
      },
      timestamp: order.updated_at,
    };

    return reply.status(200).send(progress);
  } catch (error) {
    fastify.log.error('Error getting order:', error);
    return reply.status(500).send({
      error: 'Internal server error',
    });
  }
});

// Get all orders endpoint
fastify.get('/api/orders', async (request, reply) => {
  try {
    const query = request.query as any;
    const limit = parseInt(query.limit || '50');
    const offset = parseInt(query.offset || '0');

    const orders = await databaseService.getOrders(limit, offset);
    return reply.status(200).send(orders);
  } catch (error) {
    fastify.log.error('Error getting orders:', error);
    return reply.status(500).send({
      error: 'Internal server error',
    });
  }
});

// Queue monitoring endpoint
fastify.get('/api/queue/stats', async (request, reply) => {
  try {
    const stats = await queueService.getQueueStats();
    return reply.status(200).send({
      ...stats,
      timestamp: new Date().toISOString(),
      config: {
        maxConcurrentOrders: 10,
        ordersPerMinute: 100,
        maxRetryAttempts: 3,
      },
    });
  } catch (error) {
    fastify.log.error('Error getting queue stats:', error);
    return reply.status(500).send({
      error: 'Internal server error',
    });
  }
});

// Metrics endpoint - DEX network statistics
fastify.get('/api/metrics', async (request, reply) => {
  try {
    const query = request.query as any;
    const limit = parseInt(query.limit || '1000'); // Default to last 1000 orders for metrics
    
    // Get recent orders for analysis
    const orders = await databaseService.getOrders(limit, 0);
    
    // Filter only completed orders (confirmed or failed)
    const completedOrders = orders.filter(order => 
      order.status === OrderStatus.CONFIRMED || order.status === OrderStatus.FAILED
    );
    
    // Calculate DEX statistics
    const dexStats: {
      total: number;
      confirmed: number;
      failed: number;
      byDex: Record<string, any>;
      timeRange: {
        oldest: Date | null;
        newest: Date | null;
      };
      overallSuccessRate?: number;
    } = {
      total: completedOrders.length,
      confirmed: completedOrders.filter(o => o.status === OrderStatus.CONFIRMED).length,
      failed: completedOrders.filter(o => o.status === OrderStatus.FAILED).length,
      byDex: {} as Record<string, any>,
      timeRange: {
        oldest: orders.length > 0 ? orders[orders.length - 1].created_at : null,
        newest: orders.length > 0 ? orders[0].created_at : null,
      }
    };
    
    // Group by DEX
    const dexGroups = completedOrders.reduce((acc, order) => {
      const dex = order.quote_dex || 'Unknown';
      if (!acc[dex]) {
        acc[dex] = {
          total: 0,
          confirmed: 0,
          failed: 0,
          totalVolume: 0,
          averageSlippage: 0,
          slippageSamples: 0,
        };
      }
      
      acc[dex].total++;
      if (order.status === OrderStatus.CONFIRMED) {
        acc[dex].confirmed++;
        acc[dex].totalVolume += parseFloat(order.amount.toString());
        
        if (order.slippage !== null && order.slippage !== undefined) {
          acc[dex].slippageSamples++;
          acc[dex].averageSlippage += parseFloat(order.slippage.toString());
        }
      } else {
        acc[dex].failed++;
      }
      
      return acc;
    }, {} as Record<string, any>);
    
    // Calculate percentages and averages
    Object.keys(dexGroups).forEach(dex => {
      const stats = dexGroups[dex];
      const percentage = (stats.total / dexStats.total) * 100;
      const successRate = stats.total > 0 ? (stats.confirmed / stats.total) * 100 : 0;
      const avgSlippage = stats.slippageSamples > 0 ? stats.averageSlippage / stats.slippageSamples : 0;
      
      dexStats.byDex[dex] = {
        total: stats.total,
        confirmed: stats.confirmed,
        failed: stats.failed,
        percentage: parseFloat(percentage.toFixed(2)),
        successRate: parseFloat(successRate.toFixed(2)),
        totalVolume: parseFloat(stats.totalVolume.toFixed(2)),
        averageSlippage: parseFloat((avgSlippage * 100).toFixed(4)), // Convert to percentage
        averageSlippageSamples: stats.slippageSamples,
      };
    });
    
    // Add overall success rate
    dexStats.overallSuccessRate = dexStats.total > 0 
      ? parseFloat(((dexStats.confirmed / dexStats.total) * 100).toFixed(2))
      : 0;
    
    return reply.status(200).send({
      ...dexStats,
      timestamp: new Date().toISOString(),
      analysisWindow: `${limit} most recent orders`,
    });
  } catch (error) {
    fastify.log.error('Error getting DEX metrics:', error);
    return reply.status(500).send({
      error: 'Internal server error',
    });
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  await wsService.closeAllConnections();
  await queueService.close();
  await redisService.close();
  await databaseService.close();
  
  process.exit(0);
});

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000');
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });
    console.log(`🚀 Server running on http://${host}:${port}`);
    console.log(`📡 WebSocket endpoint: ws://${host}:${port}/api/orders/:orderId/ws`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start(); 