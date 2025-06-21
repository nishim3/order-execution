import WebSocket from 'ws';

// Interface for queue stats response
interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  timestamp: string;
  config: {
    maxConcurrentOrders: number;
    ordersPerMinute: number;
    maxRetryAttempts: number;
  };
}

// Test concurrent order processing
async function testConcurrentProcessing() {
  console.log('🚀 Testing Concurrent Order Processing...\n');

  const orderCount = 15; // Submit 15 orders to test concurrency
  const orders: Promise<any>[] = [];

  console.log(`📦 Submitting ${orderCount} orders concurrently...`);

  // Submit orders concurrently
  for (let i = 0; i < orderCount; i++) {
    const orderPromise = submitOrder(i + 1);
    orders.push(orderPromise);
  }

  // Wait for all orders to be submitted
  const results = await Promise.allSettled(orders);
  
  console.log('\n📊 Order Submission Results:');
  let successCount = 0;
  let failureCount = 0;

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successCount++;
      console.log(`✅ Order ${index + 1}: Submitted (ID: ${result.value.orderId})`);
    } else {
      failureCount++;
      console.log(`❌ Order ${index + 1}: Failed - ${result.reason}`);
    }
  });

  console.log(`\n📈 Summary: ${successCount} successful, ${failureCount} failed`);

  // Monitor queue stats
  await monitorQueueStats();

  return results;
}

async function submitOrder(orderNumber: number) {
  const response = await fetch('http://localhost:3000/api/orders/execute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tokenIn: 'SOL',
      tokenOut: 'USDC',
      amount: 10 + orderNumber, // Varying amounts
      maxSlippage: 0.05,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  return await response.json();
}

async function monitorQueueStats() {
  console.log('\n📊 Monitoring Queue Statistics...');
  
  const checkStats = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/queue/stats');
      if (response.ok) {
        const stats = await response.json() as QueueStats;
        console.log(`⏰ ${new Date().toLocaleTimeString()}:`, {
          waiting: stats.waiting,
          active: stats.active,
          completed: stats.completed,
          failed: stats.failed,
        });
      }
    } catch (error) {
      console.error('❌ Failed to get queue stats:', error);
    }
  };

  // Check stats every 2 seconds for 30 seconds
  for (let i = 0; i < 15; i++) {
    await checkStats();
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

// Test queue stats endpoint
async function testQueueStats() {
  console.log('📊 Testing Queue Stats Endpoint...\n');

  try {
    const response = await fetch('http://localhost:3000/api/queue/stats');
    
    if (!response.ok) {
      console.error('❌ Failed to get queue stats:', await response.text());
      return;
    }

    const stats = await response.json() as QueueStats;
    console.log('✅ Queue Stats:');
    console.log(`   Waiting: ${stats.waiting}`);
    console.log(`   Active: ${stats.active}`);
    console.log(`   Completed: ${stats.completed}`);
    console.log(`   Failed: ${stats.failed}`);
    console.log(`   Delayed: ${stats.delayed}`);
    console.log(`   Config:`, stats.config);
  } catch (error) {
    console.error('❌ Error getting queue stats:', error);
  }
}

// Main test function
async function runConcurrentTests() {
  console.log('🧪 Starting Concurrent Processing Tests...\n');

  // Test queue stats first
  await testQueueStats();
  console.log('');

  // Test concurrent order processing
  await testConcurrentProcessing();
}

// Run tests if this file is executed directly
if (require.main === module) {
  runConcurrentTests().catch(console.error);
}

export { testConcurrentProcessing, testQueueStats, runConcurrentTests }; 