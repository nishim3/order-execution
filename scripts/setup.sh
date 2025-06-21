#!/bin/bash

echo "🚀 Setting up Order Execution Environment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Start the services
echo "📦 Starting PostgreSQL and Redis with Docker Compose..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check if services are running
echo "🔍 Checking service status..."

# Check PostgreSQL
if docker-compose exec -T postgres pg_isready -U postgres -d order_execution > /dev/null 2>&1; then
    echo "✅ PostgreSQL is ready"
else
    echo "❌ PostgreSQL is not ready yet. Please wait a moment and try again."
fi

# Check Redis
if docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis is ready"
else
    echo "❌ Redis is not ready yet. Please wait a moment and try again."
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Install dependencies: npm install"
echo "2. Build the project: npm run api:build"
echo "3. Start the API server: npm run api:dev"
echo "4. Test the API: npx ts-node src/api/test-client.ts"
echo ""
echo "🔧 Useful commands:"
echo "- View logs: docker-compose logs -f"
echo "- Stop services: docker-compose down"
echo "- Restart services: docker-compose restart"
echo "" 