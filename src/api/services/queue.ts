import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { OrderJobData } from '../types';
import { MockDexRouter } from '../../index';
import { DatabaseService } from './database';
import { RedisService } from './redis';
import { OrderStatus, OrderProgress } from '../types';

export class QueueService {
  private orderQueue: Queue;
  private worker: Worker;
  private redis: Redis;
  private dexRouter: MockDexRouter;
  private databaseService: DatabaseService;
  private redisService: RedisService;

  // Configuration constants
  private readonly MAX_CONCURRENT_ORDERS = 10;
  private readonly ORDERS_PER_MINUTE = 100;
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly BASE_RETRY_DELAY = 1000; // 1 second base delay

  constructor(
    databaseService: DatabaseService,
    redisService: RedisService
  ) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: null,
    });

    this.databaseService = databaseService;
    this.redisService = redisService;
    this.dexRouter = new MockDexRouter();

    this.orderQueue = new Queue('order-execution', {
      connection: this.redis,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: this.MAX_RETRY_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: this.BASE_RETRY_DELAY,
        },
        delay: 60000 / this.ORDERS_PER_MINUTE, // Rate limiting: 600ms between jobs
      },
    });

    this.worker = new Worker(
      'order-execution',
      async (job: Job<OrderJobData>) => {
        await this.processOrder(job);
      },
      {
        connection: this.redis,
        concurrency: this.MAX_CONCURRENT_ORDERS,
        limiter: {
          max: this.ORDERS_PER_MINUTE,
          duration: 60000, // 1 minute
        },
      }
    );

    this.setupWorkerEvents();
  }

  private setupWorkerEvents() {
    this.worker.on('completed', (job) => {
      console.log(`✅ Job ${job.id} completed successfully`);
    });

    this.worker.on('failed', (job, err) => {
      const attemptNumber = job?.attemptsMade || 0;
      const maxAttempts = this.MAX_RETRY_ATTEMPTS;
      
      if (attemptNumber >= maxAttempts) {
        console.error(`❌ Job ${job?.id} failed permanently after ${maxAttempts} attempts:`, err);
        this.handlePermanentFailure(job, err);
      } else {
        console.warn(`⚠️ Job ${job?.id} failed (attempt ${attemptNumber + 1}/${maxAttempts}):`, err);
      }
    });

    this.worker.on('error', (err) => {
      console.error('❌ Worker error:', err);
    });

    this.worker.on('stalled', (jobId) => {
      console.warn(`⚠️ Job ${jobId} stalled, will be retried`);
    });
  }

  private async handlePermanentFailure(job: Job<OrderJobData> | undefined, error: Error): Promise<void> {
    if (!job) return;

    const { orderId } = job.data;
    const errorMessage = `Permanent failure after ${this.MAX_RETRY_ATTEMPTS} attempts: ${error.message}`;

    try {
      // Update status to FAILED with detailed error information
      await this.updateOrderProgress(orderId, OrderStatus.FAILED, 'Order execution failed permanently', {
        error: errorMessage,
        attempts: this.MAX_RETRY_ATTEMPTS,
        finalAttempt: true,
        failureReason: error.message,
        failureStack: error.stack,
        timestamp: new Date().toISOString(),
      });

      await this.databaseService.updateOrderStatus(orderId, OrderStatus.FAILED, {
        errorMessage: errorMessage,
        attempts: this.MAX_RETRY_ATTEMPTS,
        failureReason: error.message,
      });

      // Remove from active orders
      await this.redisService.removeActiveOrder(orderId);
      await this.redisService.removeOrderProgress(orderId);

      console.log(`📝 Permanent failure logged for order ${orderId}: ${errorMessage}`);
    } catch (dbError) {
      console.error(`❌ Failed to log permanent failure for order ${orderId}:`, dbError);
    }
  }

  async addOrderJob(orderId: string, orderRequest: any): Promise<void> {
    await this.orderQueue.add(
      'execute-order',
      { orderId, orderRequest },
      {
        jobId: orderId,
        priority: 1,
        attempts: this.MAX_RETRY_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: this.BASE_RETRY_DELAY,
        },
      }
    );
  }

  private async processOrder(job: Job<OrderJobData>): Promise<void> {
    const { orderId, orderRequest } = job.data;
    const attemptNumber = job.attemptsMade || 0;

    try {
      // Log attempt number for debugging
      if (attemptNumber > 0) {
        console.log(`🔄 Retrying order ${orderId} (attempt ${attemptNumber + 1}/${this.MAX_RETRY_ATTEMPTS})`);
      }

      // Update status to ROUTING
      await this.updateOrderProgress(orderId, OrderStatus.ROUTING, 'Comparing DEX prices...');
      await this.databaseService.updateOrderStatus(orderId, OrderStatus.ROUTING);

      // Get best quote with timeout
      const bestQuote = await this.withTimeout(
        this.dexRouter.getBestQuote(
          orderRequest.tokenIn,
          orderRequest.tokenOut,
          orderRequest.amount
        ),
        10000, // 10 second timeout
        'Quote request timed out'
      );

      // Calculate fee details (same as quote API)
      const feeAmount = orderRequest.amount * bestQuote.quote.fee;
      const amountAfterFee = orderRequest.amount - feeAmount;
      const estimatedOutput = amountAfterFee * bestQuote.quote.price;

      // Update status to BUILDING
      await this.updateOrderProgress(orderId, OrderStatus.BUILDING, 'Creating transaction...', {
        quote: {
          dex: bestQuote.dex,
          price: bestQuote.quote.price,
          fee: bestQuote.quote.fee,
          feeAmount: feeAmount,
          amountAfterFee: amountAfterFee,
          feePercentage: (bestQuote.quote.fee * 100).toFixed(2) + '%',
        },
        estimatedOutput: estimatedOutput.toFixed(6),
      });
      await this.databaseService.updateOrderStatus(orderId, OrderStatus.BUILDING, {
        quoteDex: bestQuote.dex,
        quotePrice: bestQuote.quote.price,
        quoteFee: bestQuote.quote.fee,
      });

      // Update status to SUBMITTED
      await this.updateOrderProgress(orderId, OrderStatus.SUBMITTED, 'Transaction sent to network...');
      await this.databaseService.updateOrderStatus(orderId, OrderStatus.SUBMITTED);

      // Execute the swap with timeout
      const swapResult = await this.withTimeout(
        this.dexRouter.executeBestSwapWithQuote(
          orderRequest.tokenIn,
          orderRequest.tokenOut,
          orderRequest.amount,
          bestQuote,
          orderRequest.maxSlippage
        ),
        30000, // 30 second timeout
        'Swap execution timed out'
      );

      // Update status to CONFIRMED
      const slippage = Math.abs((swapResult.executedPrice - bestQuote.quote.price) / bestQuote.quote.price);
      
      await this.updateOrderProgress(orderId, OrderStatus.CONFIRMED, 'Transaction confirmed!', {
        quote: {
          dex: bestQuote.dex,
          price: bestQuote.quote.price,
          fee: bestQuote.quote.fee,
          feeAmount: feeAmount,
          amountAfterFee: amountAfterFee,
          feePercentage: (bestQuote.quote.fee * 100).toFixed(2) + '%',
        },
        estimatedOutput: estimatedOutput.toFixed(6),
        txHash: swapResult.txHash,
        executedPrice: swapResult.executedPrice,
        slippage: slippage,
        attempts: attemptNumber + 1,
        transactions: swapResult.transactions,
        requiresWrapping: swapResult.requiresWrapping,
      });

      await this.databaseService.updateOrderStatus(orderId, OrderStatus.CONFIRMED, {
        txHash: swapResult.txHash,
        executedPrice: swapResult.executedPrice,
        slippage: slippage,
        attempts: attemptNumber + 1,
        errorMessage: null, // Clear any previous error messages from failed attempts
        wrapTxHash: swapResult.transactions?.wrapTxHash,
        swapTxHash: swapResult.transactions?.swapTxHash,
        unwrapTxHash: swapResult.transactions?.unwrapTxHash,
        requiresWrapping: swapResult.requiresWrapping,
      });

      // Remove from active orders
      await this.redisService.removeActiveOrder(orderId);
      await this.redisService.removeOrderProgress(orderId);

      console.log(`✅ Order ${orderId} completed successfully (attempt ${attemptNumber + 1})`);

    } catch (error) {
      console.error(`❌ Order ${orderId} failed (attempt ${attemptNumber + 1}):`, error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      // Update status to FAILED (will be retried if attempts remain)
      await this.updateOrderProgress(orderId, OrderStatus.FAILED, `Order execution failed (attempt ${attemptNumber + 1})`, {
        error: errorMessage,
        attempts: attemptNumber + 1,
        maxAttempts: this.MAX_RETRY_ATTEMPTS,
        willRetry: attemptNumber + 1 < this.MAX_RETRY_ATTEMPTS,
      });

      await this.databaseService.updateOrderStatus(orderId, OrderStatus.FAILED, {
        errorMessage: errorMessage,
        attempts: attemptNumber + 1,
      });

      // Only remove from active orders if this was the final attempt
      if (attemptNumber + 1 >= this.MAX_RETRY_ATTEMPTS) {
        await this.redisService.removeActiveOrder(orderId);
        await this.redisService.removeOrderProgress(orderId);
      }

      throw error; // Re-throw to trigger retry mechanism
    }
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  private async updateOrderProgress(
    orderId: string,
    status: OrderStatus,
    message: string,
    data?: any
  ): Promise<void> {
    const progress: OrderProgress = {
      orderId,
      status,
      message,
      data,
      timestamp: new Date(),
    };

    await this.redisService.setOrderProgress(orderId, progress);
  }

  // Queue monitoring methods
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.orderQueue.getWaiting(),
      this.orderQueue.getActive(),
      this.orderQueue.getCompleted(),
      this.orderQueue.getFailed(),
      this.orderQueue.getDelayed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.orderQueue.close();
    await this.redis.quit();
  }
} 