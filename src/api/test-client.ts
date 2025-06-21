import WebSocket from 'ws';

// Interface for quote response
interface QuoteResponse {
  tokenIn: string;
  tokenOut: string;
  amount: number;
  quote: {
    dex: string;
    price: number;
    fee: number;
    effectivePrice: number;
    feePercentage: string;
  };
  estimatedOutput: string;
  timestamp: string;
}

// Test the quote API
async function testQuoteAPI() {
  console.log('💰 Testing Quote API...\n');

  // Test 1: Get a quote
  console.log('1️⃣ Getting quote for SOL → USDC...');
  const quoteResponse = await fetch('http://localhost:3000/api/orders/quote', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tokenIn: 'SOL',
      tokenOut: 'USDC',
      amount: 100,
    }),
  });

  if (!quoteResponse.ok) {
    console.error('❌ Failed to get quote:', await quoteResponse.text());
    return;
  }

  const quote = await quoteResponse.json() as QuoteResponse;
  console.log('✅ Quote received:');
  console.log(`   Token Pair: ${quote.tokenIn} → ${quote.tokenOut}`);
  console.log(`   Amount: ${quote.amount} ${quote.tokenIn}`);
  console.log(`   Best DEX: ${quote.quote.dex}`);
  console.log(`   Price: $${quote.quote.price.toFixed(4)}`);
  console.log(`   Fee: ${quote.quote.feePercentage}`);
  console.log(`   Effective Price: $${quote.quote.effectivePrice.toFixed(4)}`);
  console.log(`   Estimated Output: ${quote.estimatedOutput} ${quote.tokenOut}`);
  console.log(`   Timestamp: ${quote.timestamp}\n`);

  // Simulate user decision
  console.log('🤔 User reviews the quote...');
  console.log('✅ User decides to proceed with the trade\n');

  return quote;
}

// Test the order execution API
async function testOrderExecution() {
  console.log('🚀 Testing Order Execution API...\n');

  // Test 1: Submit an order
  console.log('1️⃣ Submitting order...');
  const orderResponse = await fetch('http://localhost:3000/api/orders/execute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tokenIn: 'SOL',
      tokenOut: 'USDC',
      amount: 100,
      maxSlippage: 0.05, // 5%
    }),
  });

  if (!orderResponse.ok) {
    console.error('❌ Failed to submit order:', await orderResponse.text());
    return;
  }

  const order = await orderResponse.json() as { orderId: string };
  console.log('✅ Order submitted:', order);
  console.log(`📋 Order ID: ${order.orderId}\n`);

  // Test 2: Connect to WebSocket for real-time updates
  console.log('2️⃣ Connecting to WebSocket for real-time updates...');
  const ws = new WebSocket(`ws://localhost:3000/api/orders/${order.orderId}/ws`);

  ws.on('open', () => {
    console.log('🔌 WebSocket connected');
  });

  ws.on('message', (data: WebSocket.RawData) => {
    const message: any = JSON.parse(data.toString());
    console.log(`📨 WebSocket update:`, {
      status: message.status,
      message: message.message,
      data: message.data,
      timestamp: message.timestamp,
    });

    // Close connection when order is completed or failed
    if (message.status === 'confirmed' || message.status === 'failed') {
      console.log('✅ Order completed, closing WebSocket connection');
      ws.close();
    }
  });

  ws.on('error', (error: Error) => {
    console.error('❌ WebSocket error:', error);
  });

  ws.on('close', () => {
    console.log('🔌 WebSocket disconnected');
  });

  // Test 3: Poll order status via REST API
  console.log('3️⃣ Polling order status via REST API...');
  const pollInterval = setInterval(async () => {
    try {
      const statusResponse = await fetch(`http://localhost:3000/api/orders/${order.orderId}`);
      if (statusResponse.ok) {
        const status: any = await statusResponse.json();
        console.log(`📊 Order status: ${status.status} - ${status.message}`);
        
        if (status.status === 'confirmed' || status.status === 'failed') {
          clearInterval(pollInterval);
          console.log('✅ Order completed, stopping polling');
        }
      }
    } catch (error: any) {
      console.error('❌ Error polling status:', error);
    }
  }, 2000); // Poll every 2 seconds

  // Stop polling after 30 seconds
  setTimeout(() => {
    clearInterval(pollInterval);
    console.log('⏰ Polling timeout reached');
  }, 30000);
}

// Test health check
async function testHealthCheck() {
  console.log('🏥 Testing health check...');
  try {
    const response = await fetch('http://localhost:3000/health');
    const health = await response.json();
    console.log('✅ Health check:', health);
  } catch (error) {
    console.error('❌ Health check failed:', error);
  }
}

// Main test function
async function runTests() {
  console.log('🧪 Starting API Tests...\n');

  // Test health check first
  await testHealthCheck();
  console.log('');

  // Test quote API
  await testQuoteAPI();
  console.log('');

  // Test order execution
  await testOrderExecution();
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

export { testQuoteAPI, testOrderExecution, testHealthCheck, runTests }; 