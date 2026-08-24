#!/bin/bash
# scripts/health-check.sh - Check service health

set -e

API_URL="${API_URL:-http://localhost:4173}"
MONGO_HOST="${MONGO_HOST:-localhost}"
MONGO_PORT="${MONGO_PORT:-27017}"

echo "🔍 Health Check Report"
echo "===================="
echo ""

# Check API health
echo "API Server: $API_URL"
if curl -sf "$API_URL/api/health" > /dev/null; then
  HEALTH=$(curl -s "$API_URL/api/health")
  echo "✓ API is healthy"
  echo "  Response: $HEALTH"
else
  echo "✗ API is NOT responding"
  exit 1
fi

echo ""

# Check MongoDB connection
echo "MongoDB: $MONGO_HOST:$MONGO_PORT"
if docker compose ps mongo | grep -q "Up"; then
  echo "✓ MongoDB container is running"
  
  if docker compose exec -T mongo mongosh \
    -u nimbus \
    -p nimbus-dev-password \
    --authenticationDatabase admin \
    --quiet \
    --eval "db.adminCommand('ping').ok" > /dev/null 2>&1; then
    echo "✓ MongoDB is responding"
  else
    echo "✗ MongoDB is NOT responding"
    exit 1
  fi
else
  echo "✗ MongoDB container is NOT running"
  exit 1
fi

echo ""
echo "✓ All services healthy!"
