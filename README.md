# Order Execution API

A high-performance order execution system with real-time WebSocket updates, built with Fastify, BullMQ, PostgreSQL, and Redis.

## Features

- 🚀 **Real-time Order Execution** - Submit orders and get live updates via WebSocket
- 📊 **DEX Routing** - Automatically finds the best prices across multiple DEXes (Raydium, Meteor)
- 🔒 **Slippage Protection** - Configurable slippage limits with automatic rejection
- 💾 **Persistent Storage** - PostgreSQL for order history, Redis for active orders
- ⚡ **Queue Processing** - BullMQ for reliable, scalable order processing
- 🔄 **Live Updates** - WebSocket connections for real-time order status updates

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client App    │    │   Fastify API   │    │   BullMQ Queue  │
│                 │    │                 │    │                 │
│ • Submit Order  │───▶│ • REST Endpoints│───▶│ • Order Worker  │
│ • WebSocket     │◀───│ • WebSocket     │    │ • DEX Routing   │
│ • Status Poll   │    │ • Validation    │    │ • Execution     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │   PostgreSQL    │    │     Redis       │
                       │                 │    │                 │
                       │ • Order History │    │ • Active Orders │
                       │ • Audit Trail   │    │ • WebSocket     │
                       │ • Analytics     │    │   Connections   │
                       └─────────────────┘    └─────────────────┘
```

## Prerequisites

- **Docker & Docker Compose** - For PostgreSQL and Redis services
- **Node.js 18+** - For the API server
- **npm** - Package manager

> 📖 **Need help with Docker?** See the detailed [Docker Setup Guide](DOCKER.md) for installation and configuration instructions.

## Quick Start

### 1. Clone and Setup

```bash
git clone <repository-url>
cd order-execution
npm install
```

### 2. Start Services with Docker

```bash
# Start PostgreSQL and Redis
npm run docker:up

# Verify services are running
docker ps
```

### 3. Build and Start API Server

```bash
# Build the project
npm run api:build

# Start in development mode (with hot reload)
npm run api:dev
```

### 4. Test the API

```bash
# Run the test client
npx ts-node src/api/test-client.ts
```

## API Endpoints

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/orders/quote` | Get best price quote (no order placed) |
| `POST` | `/api/orders/execute` | Submit new order for execution |
| `GET` | `/api/orders/:orderId` | Get order status |
| `GET` | `/api/orders` | List all orders |
| `GET` | `/api/queue/stats` | Queue performance statistics |
| `GET` | `/api/metrics` | DEX network statistics and percentages |

### WebSocket Endpoint

| Endpoint | Description |
|----------|-------------|
| `ws://localhost:3000/api/orders/:orderId/ws` | Real-time order updates |

## Concurrent Processing

The system is designed for high-performance order execution with the following capabilities:

### Queue Configuration
- **Concurrent Orders**: Up to 10 orders processed simultaneously
- **Throughput**: 100 orders per minute (rate limited)
- **Retry Logic**: Exponential backoff with up to 3 attempts
- **Timeout Protection**: 10s for quotes, 30s for execution

### Retry Strategy
- **Attempt 1**: Immediate execution
- **Attempt 2**: 1 second delay (exponential backoff)
- **Attempt 3**: 2 second delay (exponential backoff)
- **Final Failure**: Permanent failure logged with detailed error analysis

### Queue Monitoring

```bash
# Get queue statistics
curl http://localhost:3000/api/queue/stats
```

**Response:**
```json
{
  "waiting": 5,
  "active": 3,
  "completed": 150,
  "failed": 2,
  "delayed": 0,
  "timestamp": "2024-01-15T10:30:00.000Z",
  "config": {
    "maxConcurrentOrders": 10,
    "ordersPerMinute": 100,
    "maxRetryAttempts": 3
  }
}
```

### Get DEX Metrics

```bash
# Get DEX network statistics (last 1000 orders)
curl http://localhost:3000/api/metrics

# Get metrics for last 100 orders only
curl "http://localhost:3000/api/metrics?limit=100"
```

**Response:**
```json
{
  "total": 150,
  "confirmed": 145,
  "failed": 5,
  "overallSuccessRate": 96.67,
  "byDex": {
    "Raydium": {
      "total": 85,
      "confirmed": 82,
      "failed": 3,
      "percentage": 56.67,
      "successRate": 96.47,
      "totalVolume": 8500.00,
      "averageSlippage": 1.2345,
      "averageSlippageSamples": 82
    },
    "Meteor": {
      "total": 65,
      "confirmed": 63,
      "failed": 2,
      "percentage": 43.33,
      "successRate": 96.92,
      "totalVolume": 6500.00,
      "averageSlippage": 0.9876,
      "averageSlippageSamples": 63
    }
  },
  "timeRange": {
    "oldest": "2024-01-15T08:00:00.000Z",
    "newest": "2024-01-15T10:30:00.000Z"
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "analysisWindow": "1000 most recent orders"
}
```

## Usage Examples

### Get a Quote (No Order Placed)

```bash
curl -X POST http://localhost:3000/api/orders/quote \
  -H "Content-Type: application/json" \
  -d '{
    "tokenIn": "SOL",
    "tokenOut": "USDC", 
    "amount": 100
  }'
```

**Response:**
```json
{
  "tokenIn": "SOL",
  "tokenOut": "USDC",
  "amount": 100,
  "quote": {
    "dex": "Meteor",
    "price": 0.9904,
    "fee": 0.002,
    "effectivePrice": 0.9924,
    "feePercentage": "0.20%"
  },
  "estimatedOutput": "100.7656",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Submit an Order

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

### Get Order Status

```bash
curl http://localhost:3000/api/orders/bd096c7f-232c-46e0-901f-414bca79b6cc
```

**Response:**
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
    "txHash": "5J7X...",
    "executedPrice": 1.0256,
    "slippage": 0.0215
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### WebSocket Connection

```javascript
const ws = new WebSocket('ws://localhost:3000/api/orders/bd096c7f-232c-46e0-901f-414bca79b6cc/ws');

ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  console.log('Order Update:', update);
  // {
  //   "type": "order_update",
  //   "orderId": "bd096c7f-232c-46e0-901f-414bca79b6cc",
  //   "status": "routing",
  //   "message": "Comparing DEX prices...",
  //   "timestamp": "2024-01-15T10:30:00.000Z"
  // }
};
```

## Order Status Flow

```
pending → routing → building → submitted → confirmed
    ↓
  failed (if any step fails)
```

- **pending** - Order received and queued
- **routing** - Comparing DEX prices
- **building** - Creating transaction
- **submitted** - Transaction sent to network
- **confirmed** - Transaction successful (includes txHash)
- **failed** - If any step fails (includes error)

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5433
DB_NAME=order_execution
DB_USER=postgres
DB_PASSWORD=password

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Server Configuration
PORT=3000
HOST=0.0.0.0
```

### Docker Services

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL | 5433 | Order history and audit trail |
| Redis | 6379 | Active orders and WebSocket connections |

## Development

### Available Scripts

```bash
# Development
npm run api:dev          # Start API server with hot reload
npm run dev              # Start original DEX router

# Building
npm run api:build        # Build API for production
npm run build            # Build original DEX router

# Testing
npm test                 # Run Jest tests
npm run test:watch       # Run tests in watch mode

# Docker Management
npm run docker:up        # Start Docker services
npm run docker:down      # Stop Docker services
npm run docker:logs      # View Docker logs
npm run docker:restart   # Restart Docker services
npm run setup            # Run setup script
```

### Project Structure

```
src/
├── api/                 # API server
│   ├── server.ts       # Fastify server setup
│   ├── types.ts        # TypeScript interfaces
│   ├── services/       # Business logic
│   │   ├── database.ts # PostgreSQL operations
│   │   ├── redis.ts    # Redis operations
│   │   ├── queue.ts    # BullMQ queue processing
│   │   └── websocket.ts # WebSocket management
│   └── test-client.ts  # API test client
├── index.ts            # Original DEX router
└── tests/              # Jest test files
```

## Testing

### Run All Tests

```bash
npm test
```

### Test API Endpoints

```bash
# Test the complete flow
npx ts-node src/api/test-client.ts
```

### Manual Testing

```bash
# Health check
curl http://localhost:3000/health

# Submit order
curl -X POST http://localhost:3000/api/orders/execute \
  -H "Content-Type: application/json" \
  -d '{"tokenIn":"SOL","tokenOut":"USDC","amount":100}'

# Get order status
curl http://localhost:3000/api/orders/<orderId>
```

> 📖 **Need detailed API documentation?** See the [API Usage Guide](API_USAGE.md) for complete examples and integration instructions.

## Troubleshooting

### Common Issues

**Port 5432 already in use:**
- The Docker setup uses port 5433 for PostgreSQL
- If you see port conflicts, check `docker ps` and stop conflicting containers

**Connection refused errors:**
- Ensure Docker services are running: `npm run docker:up`
- Check service logs: `npm run docker:logs`
- Verify ports are available: `lsof -i :5433` and `lsof -i :6379`

**BullMQ warnings:**
- These are deprecation warnings and don't affect functionality
- Fixed in the latest code with `maxRetriesPerRequest: null`

### Service Status

```bash
# Check Docker services
docker ps

# Check service logs
npm run docker:logs

# Test database connection
docker-compose exec postgres psql -U postgres -d order_execution -c "SELECT 1;"

# Test Redis connection
docker-compose exec redis redis-cli ping
```

## Production Deployment

### Docker Compose (Recommended)

```bash
# Build for production
npm run api:build

# Start with production environment
docker-compose -f docker-compose.prod.yml up -d
```

### Environment Setup

1. Set production environment variables
2. Use external PostgreSQL and Redis instances
3. Configure proper logging and monitoring
4. Set up SSL/TLS certificates
5. Configure reverse proxy (nginx)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

MIT License - see LICENSE file for details. 