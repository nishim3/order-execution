# Docker Setup Guide

This guide provides detailed instructions for running the Order Execution API using Docker and Docker Compose.

## Prerequisites

### Install Docker

**macOS:**
```bash
# Install Docker Desktop
brew install --cask docker

# Or download from https://www.docker.com/products/docker-desktop
```

**Ubuntu/Debian:**
```bash
# Update package index
sudo apt-get update

# Install prerequisites
sudo apt-get install apt-transport-https ca-certificates curl gnupg lsb-release

# Add Docker's official GPG key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Add Docker repository
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine
sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io

# Add user to docker group
sudo usermod -aG docker $USER
```

**Windows:**
- Download Docker Desktop from https://www.docker.com/products/docker-desktop
- Install and restart your computer

### Install Docker Compose

Docker Compose is included with Docker Desktop. For standalone installation:

```bash
# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### Verify Installation

```bash
# Check Docker version
docker --version

# Check Docker Compose version
docker-compose --version

# Test Docker installation
docker run hello-world
```

## Quick Start

### 1. Start Services

```bash
# Start PostgreSQL and Redis
npm run docker:up

# Or manually with docker-compose
docker-compose up -d
```

### 2. Verify Services

```bash
# Check running containers
docker ps

# Expected output:
# CONTAINER ID   IMAGE       COMMAND                  CREATED         STATUS         PORTS                    NAMES
# abc123def456   postgres:15 "docker-entrypoint.s…"   2 minutes ago   Up 2 minutes   0.0.0.0:5433->5432/tcp   order-execution-postgres-1
# def456ghi789   redis:7     "docker-entrypoint.s…"   2 minutes ago   Up 2 minutes   0.0.0.0:6379->6379/tcp   order-execution-redis-1
```

### 3. Test Connections

```bash
# Test PostgreSQL connection
docker-compose exec postgres psql -U postgres -d order_execution -c "SELECT version();"

# Test Redis connection
docker-compose exec redis redis-cli ping
# Should return: PONG
```

## Service Configuration

### PostgreSQL

**Port:** 5433 (mapped from container port 5432)  
**Database:** order_execution  
**User:** postgres  
**Password:** password  
**Data Volume:** `./docker/postgres-data`

**Connection String:**
```
postgresql://postgres:password@localhost:5433/order_execution
```

**Environment Variables:**
```env
POSTGRES_DB=order_execution
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
```

### Redis

**Port:** 6379  
**Password:** (none)  
**Data Volume:** `./docker/redis-data`

**Connection String:**
```
redis://localhost:6379
```

**Environment Variables:**
```env
# No password required for development
```

## Docker Compose Configuration

### docker-compose.yml

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    container_name: order-execution-postgres
    environment:
      POSTGRES_DB: order_execution
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5433:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7
    container_name: order-execution-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local
```

## Management Commands

### Start Services

```bash
# Start all services
npm run docker:up

# Start specific service
docker-compose up -d postgres
docker-compose up -d redis

# Start with logs
docker-compose up
```

### Stop Services

```bash
# Stop all services
npm run docker:down

# Stop specific service
docker-compose stop postgres
docker-compose stop redis

# Stop and remove containers
docker-compose down
```

### View Logs

```bash
# View all logs
npm run docker:logs

# View specific service logs
docker-compose logs postgres
docker-compose logs redis

# Follow logs in real-time
docker-compose logs -f postgres
docker-compose logs -f redis
```

### Restart Services

```bash
# Restart all services
npm run docker:restart

# Restart specific service
docker-compose restart postgres
docker-compose restart redis
```

### Database Operations

```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U postgres -d order_execution

# Run SQL file
docker-compose exec -T postgres psql -U postgres -d order_execution < script.sql

# Backup database
docker-compose exec postgres pg_dump -U postgres order_execution > backup.sql

# Restore database
docker-compose exec -T postgres psql -U postgres -d order_execution < backup.sql
```

### Redis Operations

```bash
# Connect to Redis CLI
docker-compose exec redis redis-cli

# Monitor Redis commands
docker-compose exec redis redis-cli monitor

# Check Redis info
docker-compose exec redis redis-cli info
```

## Troubleshooting

### Port Conflicts

**PostgreSQL port 5432 already in use:**
```bash
# Check what's using port 5432
lsof -i :5432

# Stop conflicting service (e.g., local PostgreSQL)
sudo brew services stop postgresql
# or
sudo systemctl stop postgresql

# Or change Docker port mapping in docker-compose.yml
ports:
  - "5434:5432"  # Use port 5434 instead
```

**Redis port 6379 already in use:**
```bash
# Check what's using port 6379
lsof -i :6379

# Stop conflicting service
sudo brew services stop redis
# or
sudo systemctl stop redis
```

### Container Issues

**Container won't start:**
```bash
# Check container logs
docker-compose logs <service-name>

# Remove and recreate containers
docker-compose down
docker-compose up -d

# Remove volumes (WARNING: This will delete data)
docker-compose down -v
docker-compose up -d
```

**Database connection errors:**
```bash
# Check if database is ready
docker-compose exec postgres pg_isready -U postgres

# Check database exists
docker-compose exec postgres psql -U postgres -l

# Recreate database
docker-compose exec postgres dropdb -U postgres order_execution
docker-compose exec postgres createdb -U postgres order_execution
```

### Performance Issues

**Increase memory limits:**
```yaml
# In docker-compose.yml
services:
  postgres:
    deploy:
      resources:
        limits:
          memory: 1G
    environment:
      POSTGRES_SHARED_BUFFERS: 256MB
      POSTGRES_EFFECTIVE_CACHE_SIZE: 1GB

  redis:
    deploy:
      resources:
        limits:
          memory: 512M
```

**Enable Redis persistence:**
```yaml
# In docker-compose.yml
services:
  redis:
    command: redis-server --appendonly yes
```

## Production Considerations

### Security

**Use strong passwords:**
```yaml
environment:
  POSTGRES_PASSWORD: ${DB_PASSWORD}
  REDIS_PASSWORD: ${REDIS_PASSWORD}
```

**Enable SSL:**
```yaml
services:
  postgres:
    environment:
      POSTGRES_SSL: "on"
      POSTGRES_SSL_CERT_FILE: "/etc/ssl/certs/server.crt"
      POSTGRES_SSL_KEY_FILE: "/etc/ssl/private/server.key"
```

### Backup Strategy

**Automated backups:**
```bash
#!/bin/bash
# backup.sh
DATE=$(date +%Y%m%d_%H%M%S)
docker-compose exec -T postgres pg_dump -U postgres order_execution > "backup_${DATE}.sql"
```

**Cron job for daily backups:**
```bash
# Add to crontab
0 2 * * * /path/to/backup.sh
```

### Monitoring

**Health checks:**
```yaml
services:
  postgres:
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  redis:
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3
```

## Cleanup

### Remove Everything

```bash
# Stop and remove containers, networks, and volumes
docker-compose down -v

# Remove images
docker rmi postgres:15 redis:7

# Remove volumes
docker volume rm order-execution_postgres_data order-execution_redis_data
```

### Reset Development Environment

```bash
# Stop services
npm run docker:down

# Remove data volumes
docker volume rm order-execution_postgres_data order-execution_redis_data

# Restart fresh
npm run docker:up
```

## Useful Commands

```bash
# View resource usage
docker stats

# Clean up unused resources
docker system prune

# View disk usage
docker system df

# Export container
docker export order-execution-postgres > postgres.tar

# Import container
docker import postgres.tar postgres:backup
``` 