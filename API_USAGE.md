# API Usage Guide

A practical guide for integrating with the Order Execution API.

## Base URL

```
http://localhost:3000
```

## Authentication

Currently, the API doesn't require authentication for development. In production, you should implement proper authentication.

## Endpoints

### 1. Health Check

**GET** `/health`

Check if the API is running.

```bash
curl http://localhost:3000/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### 2. Submit Order

**POST** `/api/orders/execute`

Submit a new order for execution.

**Request Body:**
```json
{
  "tokenIn": "SOL",
  "tokenOut": "USDC",
  "amount": 100,
  "maxSlippage": 0.05
}
```

**Parameters:**
- `tokenIn` (string, required): Input token symbol
- `tokenOut` (string, required): Output token symbol  
- `amount` (number, required): Amount to swap
- `maxSlippage` (number, optional): Maximum allowed slippage (default: 0.05 = 5%)

**Example:**
```bash
curl -X POST http://localhost:3000/api/orders/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tokenIn": "SOL",
    "tokenOut": "USDC",
    "amount": 100,
    "maxSlippage": 0.05
  }'
```

**Response:**
```json
{
  "orderId": "bd096c7f-232c-46e0-901f-414bca79b6cc",
  "status": "pending",
  "message": "Order received and queued"
}
```

### 3. Get Order Status

**GET** `/api/orders/{orderId}`

Get the current status of an order.

**Example:**
```bash
curl http://localhost:3000/api/orders/bd096c7f-232c-46e0-901f-414bca79b6cc
```

**Response (Pending):**
```json
{
  "orderId": "bd096c7f-232c-46e0-901f-414bca79b6cc",
  "status": "routing",
  "message": "Comparing DEX prices",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Response (Completed):**
```json
{
  "orderId": "bd096c7f-232c-46e0-901f-414bca79b6cc",
  "status": "confirmed",
  "message": "Transaction confirmed",
  "data": {
    "quote": {
      "dex": "Raydium",
      "price": 1.0234,
      "fee": 0.003
    },
    "txHash": "5J7XbK8mN2pQ9rT3vW6yZ1aB4cE7fH8jK",
    "executedPrice": 1.0256,
    "slippage": 0.0215
  },
  "timestamp": "2024-01-15T10:30:05.000Z"
}
```

**Response (Failed):**
```json
{
  "orderId": "bd096c7f-232c-46e0-901f-414bca79b6cc",
  "status": "failed",
  "message": "Order execution failed",
  "data": {
    "error": "Slippage exceeded maximum allowed (5.2% > 5.0%)"
  },
  "timestamp": "2024-01-15T10:30:03.000Z"
}
```

### 4. List Orders

**GET** `/api/orders`

Get a list of all orders with pagination.

**Query Parameters:**
- `limit` (number, optional): Number of orders to return (default: 50, max: 100)
- `offset` (number, optional): Number of orders to skip (default: 0)

**Example:**
```bash
curl "http://localhost:3000/api/orders?limit=10&offset=0"
```

**Response:**
```json
[
  {
    "id": "bd096c7f-232c-46e0-901f-414bca79b6cc",
    "token_in": "SOL",
    "token_out": "USDC",
    "amount": "100.00000000",
    "max_slippage": "0.0500",
    "status": "confirmed",
    "quote_dex": "Raydium",
    "quote_price": "1.02340000",
    "quote_fee": "0.0030",
    "tx_hash": "5J7XbK8mN2pQ9rT3vW6yZ1aB4cE7fH8jK",
    "executed_price": "1.02560000",
    "slippage": "0.0215",
    "error_message": null,
    "created_at": "2024-01-15T10:30:00.000Z",
    "updated_at": "2024-01-15T10:30:05.000Z"
  }
]
```

## WebSocket Updates

### Connect to WebSocket

**URL:** `ws://localhost:3000/api/orders/{orderId}/ws`

Connect to receive real-time updates for a specific order.

**JavaScript Example:**
```javascript
const orderId = 'bd096c7f-232c-46e0-901f-414bca79b6cc';
const ws = new WebSocket(`ws://localhost:3000/api/orders/${orderId}/ws`);

ws.onopen = () => {
  console.log('Connected to WebSocket');
};

ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  console.log('Order Update:', update);
  
  switch (update.status) {
    case 'pending':
      console.log('Order received and queued');
      break;
    case 'routing':
      console.log('Comparing DEX prices...');
      break;
    case 'building':
      console.log('Creating transaction...');
      break;
    case 'submitted':
      console.log('Transaction sent to network');
      break;
    case 'confirmed':
      console.log('Transaction confirmed!');
      console.log('TX Hash:', update.data.txHash);
      console.log('Executed Price:', update.data.executedPrice);
      ws.close();
      break;
    case 'failed':
      console.log('Order failed:', update.data.error);
      ws.close();
      break;
  }
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('WebSocket connection closed');
};
```

**Python Example:**
```python
import websocket
import json

def on_message(ws, message):
    update = json.loads(message)
    print(f"Order Update: {update}")
    
    if update['status'] in ['confirmed', 'failed']:
        ws.close()

def on_error(ws, error):
    print(f"WebSocket error: {error}")

def on_close(ws, close_status_code, close_msg):
    print("WebSocket connection closed")

def on_open(ws):
    print("Connected to WebSocket")

order_id = "bd096c7f-232c-46e0-901f-414bca79b6cc"
ws = websocket.WebSocketApp(
    f"ws://localhost:3000/api/orders/{order_id}/ws",
    on_open=on_open,
    on_message=on_message,
    on_error=on_error,
    on_close=on_close
)
ws.run_forever()
```

## Order Status Flow

```
pending → routing → building → submitted → confirmed
    ↓
  failed (if any step fails)
```

### Status Descriptions

| Status | Description | Duration |
|--------|-------------|----------|
| `pending` | Order received and queued | ~1s |
| `routing` | Comparing DEX prices | ~400ms |
| `building` | Creating transaction | ~500ms |
| `submitted` | Transaction sent to network | ~2-3s |
| `confirmed` | Transaction successful | Final |
| `failed` | Order execution failed | Final |

## Error Handling

### HTTP Status Codes

- `200` - Success
- `400` - Bad Request (invalid parameters)
- `404` - Order not found
- `500` - Internal server error

### Common Errors

**Invalid Request:**
```json
{
  "error": "Missing required fields: tokenIn, tokenOut, amount"
}
```

**Order Not Found:**
```json
{
  "error": "Order not found"
}
```

**Slippage Exceeded:**
```json
{
  "status": "failed",
  "message": "Order execution failed",
  "data": {
    "error": "Slippage exceeded maximum allowed (5.2% > 5.0%)"
  }
}
```

## Rate Limiting

Currently, there are no rate limits implemented. In production, consider implementing rate limiting to prevent abuse.

## Best Practices

### 1. Always Use WebSocket for Real-time Updates

Don't poll the status endpoint repeatedly. Use WebSocket for real-time updates:

```javascript
// ❌ Don't do this
setInterval(async () => {
  const status = await fetch(`/api/orders/${orderId}`);
  // ...
}, 1000);

// ✅ Do this instead
const ws = new WebSocket(`ws://localhost:3000/api/orders/${orderId}/ws`);
```

### 2. Handle WebSocket Reconnection

```javascript
function connectWebSocket(orderId) {
  const ws = new WebSocket(`ws://localhost:3000/api/orders/${orderId}/ws`);
  
  ws.onclose = () => {
    console.log('WebSocket closed, attempting to reconnect...');
    setTimeout(() => connectWebSocket(orderId), 1000);
  };
  
  return ws;
}
```

### 3. Set Appropriate Slippage

```javascript
// For stable pairs (USDC/USDT)
const stablePairSlippage = 0.001; // 0.1%

// For volatile pairs (SOL/USDC)
const volatilePairSlippage = 0.05; // 5%

// For very volatile pairs
const highVolatilitySlippage = 0.10; // 10%
```

### 4. Handle Errors Gracefully

```javascript
async function submitOrder(orderData) {
  try {
    const response = await fetch('/api/orders/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to submit order');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Order submission failed:', error);
    throw error;
  }
}
```

## Testing

### Test Client

Use the included test client to verify your setup:

```bash
npx ts-node src/api/test-client.ts
```

### Manual Testing

```bash
# 1. Submit an order
ORDER_ID=$(curl -s -X POST http://localhost:3000/api/orders/execute \
  -H "Content-Type: application/json" \
  -d '{"tokenIn":"SOL","tokenOut":"USDC","amount":100}' \
  | jq -r '.orderId')

echo "Order ID: $ORDER_ID"

# 2. Check status
curl http://localhost:3000/api/orders/$ORDER_ID

# 3. Wait and check again
sleep 5
curl http://localhost:3000/api/orders/$ORDER_ID
```

## Production Checklist

- [ ] Implement authentication
- [ ] Add rate limiting
- [ ] Set up SSL/TLS
- [ ] Configure proper logging
- [ ] Set up monitoring and alerting
- [ ] Implement backup strategies
- [ ] Add request validation
- [ ] Set up error tracking
- [ ] Configure CORS properly
- [ ] Add API documentation (Swagger/OpenAPI) 