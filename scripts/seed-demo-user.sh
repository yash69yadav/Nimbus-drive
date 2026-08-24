#!/bin/bash
# scripts/seed-demo-user.sh - Create demo user for testing

API_URL="http://localhost:4173"

echo "Creating demo user for Nimbus Drive..."
echo ""

# Register demo user
echo "Registering demo user (test@example.com)..."

RESPONSE=$(curl -s -X POST "$API_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Demo User"
  }')

echo "Response: $RESPONSE"
echo ""

# Check if successful
if echo "$RESPONSE" | grep -q "test@example.com"; then
  echo "✓ Demo user created successfully!"
  echo ""
  echo "You can now login with:"
  echo "  Email: test@example.com"
  echo "  Password: password123"
else
  echo "✗ Failed to create demo user"
  echo ""
  echo "Response was: $RESPONSE"
fi
