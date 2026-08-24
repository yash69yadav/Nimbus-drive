#!/bin/bash
# scripts/test-login.sh - Test authentication endpoint

API_URL="http://localhost:4173"

echo "Testing Nimbus Drive Authentication"
echo "===================================="
echo ""

# Test health
echo "1. Testing health endpoint..."
curl -s "$API_URL/api/health" | jq . || echo "Health check failed"
echo ""

# Register a test user
echo "2. Registering test user..."
REGISTER_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User"
  }')

echo "$REGISTER_RESPONSE" | jq . || echo "$REGISTER_RESPONSE"
echo ""

# Extract token from response (if registration was successful)
TOKEN=$(echo "$REGISTER_RESPONSE" | jq -r '.user.id' 2>/dev/null)

if [ "$TOKEN" != "null" ] && [ -n "$TOKEN" ]; then
  echo "3. Registration successful!"
  echo ""
  
  # Login
  echo "4. Testing login..."
  LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -c cookies.txt \
    -d '{
      "email": "test@example.com",
      "password": "password123"
    }')
  
  echo "$LOGIN_RESPONSE" | jq . || echo "$LOGIN_RESPONSE"
  echo ""
  
  # Get current user
  echo "5. Getting current user..."
  curl -s -X GET "$API_URL/api/auth/me" \
    -H "Content-Type: application/json" \
    -b cookies.txt | jq . || echo "Failed to get user"
else
  echo "3. Registration failed, trying login anyway..."
  echo ""
  
  # Try login
  echo "4. Testing login..."
  LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -c cookies.txt \
    -d '{
      "email": "test@example.com",
      "password": "password123"
    }')
  
  echo "$LOGIN_RESPONSE" | jq . || echo "$LOGIN_RESPONSE"
fi

echo ""
echo "===================================="
echo "Test complete!"
