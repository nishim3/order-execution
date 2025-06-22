#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Docker services are running
if ! docker-compose ps | grep -q "Up"; then
    echo -e "${RED}❌ Docker services are not running!${NC}"
    echo -e "${YELLOW}💡 Run 'npm run docker:up' first${NC}"
    exit 1
fi

# Function to clear data only (keep structure)
clear_data_only() {
    echo -e "${BLUE}🗄️  Database Clearing Script${NC}"
    echo "================================"
    echo -e "${YELLOW}🧹 Clearing all data from orders table...${NC}"
    docker-compose exec -T postgres psql -U postgres -d order_execution -c "TRUNCATE TABLE orders RESTART IDENTITY CASCADE;" 2>/dev/null
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Database data cleared successfully!${NC}"
    else
        echo -e "${RED}❌ Failed to clear database data${NC}"
        exit 1
    fi
}

# Function to drop and recreate database
reset_database() {
    echo -e "${BLUE}🗄️  Database Clearing Script${NC}"
    echo "================================"
    echo -e "${YELLOW}🗑️  Dropping database...${NC}"
    docker-compose exec -T postgres psql -U postgres -c "DROP DATABASE IF EXISTS order_execution;" 2>/dev/null
    
    echo -e "${YELLOW}🏗️  Creating fresh database...${NC}"
    docker-compose exec -T postgres psql -U postgres -c "CREATE DATABASE order_execution;" 2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Database reset successfully!${NC}"
        echo -e "${YELLOW}⚠️  Note: You'll need to restart the API server to recreate tables${NC}"
    else
        echo -e "${RED}❌ Failed to reset database${NC}"
        exit 1
    fi
}

# Function to show current database stats
show_stats() {
    echo -e "${BLUE}📊 Current Database Stats:${NC}"
    echo "=========================="
    
    # Get order count
    ORDER_COUNT=$(docker-compose exec -T postgres psql -U postgres -d order_execution -t -c "SELECT COUNT(*) FROM orders;" 2>/dev/null | tr -d ' \n')
    
    if [ $? -eq 0 ] && [ ! -z "$ORDER_COUNT" ]; then
        echo -e "Orders: ${YELLOW}$ORDER_COUNT${NC}"
        
        # Get status breakdown
        echo -e "\n${BLUE}Status Breakdown:${NC}"
        docker-compose exec -T postgres psql -U postgres -d order_execution -c "
            SELECT status, COUNT(*) as count 
            FROM orders 
            GROUP BY status 
            ORDER BY count DESC;
        " 2>/dev/null | grep -E "(pending|routing|building|submitted|confirmed|failed)" | while read line; do
            echo -e "  $line"
        done
    else
        echo -e "${YELLOW}No data found or table doesn't exist${NC}"
    fi
}

# Parse command line arguments
case "${1:-}" in
    "data")
        clear_data_only
        ;;
    "reset")
        reset_database
        ;;
    "stats")
        show_stats
        ;;
    "nuclear")
        echo -e "${BLUE}🗄️  Database Clearing Script${NC}"
        echo "================================"
        echo -e "${RED}☢️  NUCLEAR OPTION - This will destroy ALL PostgreSQL data!${NC}"
        read -p "Are you absolutely sure? Type 'YES' to continue: " confirmation
        if [ "$confirmation" = "YES" ]; then
            echo -e "${YELLOW}🛑 Stopping services...${NC}"
            docker-compose down
            
            echo -e "${YELLOW}💥 Removing PostgreSQL volume...${NC}"
            docker volume rm order-execution_postgres_data 2>/dev/null || true
            
            echo -e "${YELLOW}🚀 Starting services with fresh database...${NC}"
            docker-compose up -d
            
            echo -e "${GREEN}✅ Nuclear reset complete!${NC}"
        else
            echo -e "${BLUE}🛡️  Nuclear option cancelled${NC}"
        fi
        ;;
    *)
        echo -e "${BLUE}🗄️  Database Clearing Script${NC}"
        echo "================================"
        echo "Usage: $0 {data|reset|stats|nuclear}"
        echo ""
        echo -e "${BLUE}Options:${NC}"
        echo -e "  ${GREEN}data${NC}    - Clear all data but keep table structure"
        echo -e "  ${GREEN}reset${NC}   - Drop and recreate database (requires API restart)"
        echo -e "  ${GREEN}stats${NC}   - Show current database statistics"
        echo -e "  ${GREEN}nuclear${NC} - Complete reset including Docker volume"
        echo ""
        echo -e "${BLUE}Examples:${NC}"
        echo "  npm run db:clear data    # Clear data only"
        echo "  npm run db:clear reset   # Full database reset"
        echo "  npm run db:clear stats   # Show current stats"
        echo ""
        exit 1
        ;;
esac 