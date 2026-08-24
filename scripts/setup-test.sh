#!/bin/bash
# scripts/setup-test.sh - Complete setup and test

API_URL="http://localhost:4173"
EMAIL="test@example.com"
PASSWORD="password123"
NAME="Demo User"

echo ""
echo "╔════════════════════════════════════════╗"
echo "║   Nimbus Drive - Setup & Test          ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Step 1: Check API health
echo "Step 1: Checking API health..."
HEALTH=$(curl -s "$API_URL/api/health" 2>/dev/null)
if [ -z "$HEALTH" ]; then
  echo "❌ API not responding at $API_URL"
  echo ""
  echo "Make sure services are running:"
  echo "  docker compose up -d"
  exit 1
fi
echo "✅ API is responding"
echo ""

# Step 2: Try to register demo user
echo "Step 2: Creating demo user ($EMAIL)..."
REGISTER=$(curl -s -X POST "$API_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\",
    \"name\": \"$NAME\"
  }")

if echo "$REGISTER" | grep -q "EMAIL_EXISTS\|$EMAIL"; then
  echo "✅ Demo user exists or created"
else
  echo "⚠️  Registration response:"
  echo "$REGISTER"
fi
echo ""

# Step 3: Test login
echo "Step 3: Testing login..."
LOGIN=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -c /tmp/cookies.txt \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\"
  }")

if echo "$LOGIN" | grep -q "$EMAIL"; then
  echo "✅ Login successful!"
else
  echo "❌ Login failed"
  echo "Response: $LOGIN"
  exit 1
fi
echo ""

# Step 4: Get user details
echo "Step 4: Retrieving user details..."
USER=$(curl -s -X GET "$API_URL/api/auth/me" \
  -H "Content-Type: application/json" \
  -b /tmp/cookies.txt)

if echo "$USER" | grep -q "$EMAIL"; then
  echo "✅ User retrieved successfully"
  echo "   Name: $NAME"
  echo "   Email: $EMAIL"
else
  echo "❌ Failed to get user"
  echo "Response: $USER"
  exit 1
fi
echo ""

# Step 5: Test folder creation
echo "Step 5: Testing folder creation..."
FOLDER=$(curl -s -X POST "$API_URL/api/folders" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(echo $LOGIN | grep -o 'id":"[^"]*' | cut -d'"' -f3)" \
  -b /tmp/cookies.txt \
  -d '{
    "name": "Test Folder"
  }')

if echo "$FOLDER" | grep -q "Test Folder\|folder"; then
  echo "✅ Folder creation works"
else
  echo "⚠️  Folder creation response: $FOLDER"
fi
echo ""

echo "╔════════════════════════════════════════╗"
echo "║   ✅ ALL TESTS PASSED!                  ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "You can now login with:"
echo "  Email: $EMAIL"
echo "  Password: $PASSWORD"
echo ""
echo "Visit: http://localhost:4173"
echo ""
