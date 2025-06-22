# Order Execution API

A high-performance order execution system with real-time WebSocket updates, built with Fastify, BullMQ, PostgreSQL, and Redis.

## Features

- 🚀 **Real-time Order Execution** - Submit orders and get live updates via WebSocket
- 📊 **DEX Routing** - Automatically finds the best prices across multiple DEXes (Raydium, Meteor)
- 🔒 **Slippage Protection** - Configurable slippage limits with automatic rejection
- 💾 **Persistent Storage** - PostgreSQL for order history, Redis for active orders
- ⚡ **Queue Processing** - BullMQ for reliable, scalable order processing
- 🔄 **Live Updates** - WebSocket connections for real-time order status updates

## Market Orders
We currently only support market orders as we can route them very easily. However, it is very easy to extend this functionality into limit orders, as we can accept the orders, keep polling the blockchain, and if the quote matches the price, we can execute the order.
Sniper orders are vague. If we have to execute the order when the token is launched, that would require a very different implementation in which we poll the chain for the various tokens being created. For orders involving a certain market cap or delta, the limit order logic can be used with some changes.

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

## Quick Start

### Prerequisites
- **Docker & Docker Compose** - For PostgreSQL and Redis services
- **Node.js 18+** - For the API server
- **npm** - Package manager

### 1. Setup and Installation

```bash
git clone <repository-url>
cd order-execution
npm install
```

### 2. Start Services

```bash
# Start PostgreSQL and Redis
npm run docker:up

# Build and start API server
npm run api:build
npm run api:dev
```

### 3. Test the System

```bash
# Run basic test client
npx ts-node src/api/test-client.ts

# Run comprehensive test suite
npm test
```

## Documentation

| Document | Description |
|----------|-------------|
| **[API_USAGE.md](API_USAGE.md)** | 📚 **Comprehensive API guide** with detailed endpoints, examples, and integration instructions |
| **[README-Tests.md](README-Tests.md)** | 🧪 **Test suite overview** covering 23 tests across routing, queue, and WebSocket functionality |

## API Overview

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/orders/quote` | Get best price quote (no order placed) |
| `POST` | `/api/orders/execute` | Submit new order for execution |
| `GET` | `/api/orders/:orderId` | Get order status |
| `GET` | `/api/orders` | List all orders |
| `GET` | `/api/queue/stats` | Queue performance statistics |
| `GET` | `/api/metrics` | DEX network statistics |

### WebSocket Endpoint

| Endpoint | Description |
|----------|-------------|
| `ws://localhost:3000/api/orders/:orderId/ws` | Real-time order updates |

> 📖 **For detailed API documentation:** See [API_USAGE.md](API_USAGE.md)

## System Capabilities

### Performance & Concurrency
- **100 orders/minute** throughput capacity
- **10 concurrent orders** maximum
- **3 retry attempts** with exponential backoff
- **30 second timeout** protection

### Order Lifecycle
```
pending → routing → building → submitted → confirmed
    ↓
  failed (if any step fails)
```

### Queue Management
```bash
# Monitor queue in real-time
curl http://localhost:3000/api/queue/stats

# View system metrics
curl http://localhost:3000/api/metrics
```

## Quick Examples

### Submit and Track an Order

```bash
# 1. Submit order
curl -X POST http://localhost:3000/api/orders/execute \
  -H "Content-Type: application/json" \
  -d '{"tokenIn": "SOL", "tokenOut": "USDC", "amount": 100, "maxSlippage": 0.05}'

# 2. Track status
curl http://localhost:3000/api/orders/{orderId}

# 3. WebSocket monitoring
wscat -c ws://localhost:3000/api/orders/{orderId}/ws
```

> 📖 **For complete examples and integration guides:** See [API_USAGE.md](API_USAGE.md)

## Development

### Available Scripts

```bash
# Development
npm run api:dev          # Start API server with hot reload
npm run docker:up        # Start Docker services
npm run docker:down      # Stop Docker services

# Testing
npm test                 # Run comprehensive test suite
npm run test:watch       # Run tests in watch mode

# Building
npm run api:build        # Build for production
```

> 📖 **For detailed testing information:** See [README-Tests.md](README-Tests.md)

### Project Structure

```
src/
├── api/                 # API server and services
│   ├── server.ts       # Fastify server
│   ├── services/       # Business logic (database, queue, websocket)
│   └── types.ts        # TypeScript interfaces
├── index.ts            # DEX router logic
└── tests/              # Comprehensive test suite
```

## Configuration

### Environment Variables

```env
# Database
DB_HOST=localhost
DB_PORT=5433
DB_NAME=order_execution
DB_USER=postgres
DB_PASSWORD=password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Server
PORT=3000
HOST=0.0.0.0
```

### Docker Services

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL | 5433 | Order history and analytics |
| Redis | 6379 | Active orders and WebSocket connections |

## Troubleshooting

### Quick Diagnostics

```bash
# Check services
docker ps
npm run docker:logs

# Test connectivity
curl http://localhost:3000/health

# Database connection
docker-compose exec postgres psql -U postgres -d order_execution -c "SELECT 1;"

# Redis connection
docker-compose exec redis redis-cli ping
```

### Common Issues

**Port conflicts:** Docker uses ports 5433 (PostgreSQL) and 6379 (Redis)  
**Connection errors:** Ensure `npm run docker:up` completed successfully  
**BullMQ warnings:** Deprecation warnings, functionality not affected  

## Getting Started

1. **New to the system?** Start with the Quick Start guide above
2. **Building an integration?** See [API_USAGE.md](API_USAGE.md) for complete API reference
3. **Contributing code?** Check [README-Tests.md](README-Tests.md) for test coverage

---

**🎯 Ready to try it?** Follow the Quick Start guide and run `npm test` to verify everything works 