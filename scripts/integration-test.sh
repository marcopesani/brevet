#!/bin/bash
set -e

echo "=== Brevet Integration Test ==="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; FAILED=1; }
info() { echo -e "${YELLOW}ℹ $1${NC}"; }

FAILED=0
BASE_URL="${BASE_URL:-http://localhost:3000}"
MONGO_URI="${MONGODB_URI:-mongodb://localhost:27017/brevet}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ---------------------------------------------------------------------------
# Step 1: Check MongoDB is running
# ---------------------------------------------------------------------------
echo "Step 1: Checking MongoDB..."
if mongosh --quiet --eval "db.runCommand({ping:1}).ok" "$MONGO_URI" > /dev/null 2>&1; then
  pass "MongoDB is running"
else
  fail "MongoDB is not running. Run: docker compose up -d"
  echo "Aborting — MongoDB is required for all subsequent steps."
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 2: Check app is running
# ---------------------------------------------------------------------------
echo "Step 2: Checking app..."
if curl -sf "$BASE_URL" > /dev/null 2>&1; then
  pass "App is running at $BASE_URL"
else
  fail "App is not running at $BASE_URL"
  echo "Start it with: MONGODB_URI=$MONGO_URI NEXT_PUBLIC_TEST_MODE=true npm run dev"
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 3: Dev login — create test user + hot wallet
# ---------------------------------------------------------------------------
echo "Step 3: Creating test user via dev login..."
RESPONSE=$(curl -sf -X POST "$BASE_URL/api/auth/dev-login" -H "Content-Type: application/json" 2>&1) || true
if [ -z "$RESPONSE" ]; then
  fail "Dev login endpoint did not respond. Is NEXT_PUBLIC_TEST_MODE=true?"
  exit 1
fi

# Check for error in response
if echo "$RESPONSE" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);if(j.error){process.exit(1)}" 2>/dev/null; then
  USER_ID=$(echo "$RESPONSE" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).userId))")
  WALLET=$(echo "$RESPONSE" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).walletAddress))")
  HOT_WALLET=$(echo "$RESPONSE" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).hotWalletAddress))")
  pass "Test user created: $USER_ID"
  info "Wallet: $WALLET"
  info "Hot wallet: $HOT_WALLET"
else
  fail "Dev login returned error: $RESPONSE"
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 4: Verify MongoDB collections exist
# ---------------------------------------------------------------------------
echo "Step 4: Verifying MongoDB collections..."
COLLECTIONS=$(mongosh --quiet --eval "db.getCollectionNames().join(',')" "$MONGO_URI" 2>/dev/null)
for col in users hotwallets; do
  if echo "$COLLECTIONS" | grep -q "$col"; then
    pass "Collection '$col' exists"
  else
    fail "Collection '$col' missing"
  fi
done

# ---------------------------------------------------------------------------
# Step 5: Verify user data in MongoDB
# ---------------------------------------------------------------------------
echo "Step 5: Verifying user data in MongoDB..."
USER_COUNT=$(mongosh --quiet --eval "db.users.countDocuments({walletAddress:'$WALLET'})" "$MONGO_URI" 2>/dev/null)
if [ "$USER_COUNT" = "1" ]; then
  pass "User found in MongoDB"
else
  fail "User not found in MongoDB (count: $USER_COUNT)"
fi

HW_COUNT=$(mongosh --quiet --eval "db.hotwallets.countDocuments({address:'$HOT_WALLET'})" "$MONGO_URI" 2>/dev/null)
if [ "$HW_COUNT" = "1" ]; then
  pass "Hot wallet found in MongoDB"
else
  fail "Hot wallet not found in MongoDB (count: $HW_COUNT)"
fi

# ---------------------------------------------------------------------------
# Step 6: Test MCP endpoint with initialize request
# ---------------------------------------------------------------------------
echo "Step 6: Testing MCP endpoint..."
MCP_RESPONSE=$(curl -sf -X POST "$BASE_URL/api/mcp/$USER_ID" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"integration-test","version":"1.0.0"}}}' \
  2>&1) || true

if [ -z "$MCP_RESPONSE" ]; then
  fail "MCP endpoint did not respond"
else
  # Response may be SSE format (event stream) or JSON
  # For SSE, look for "result" in the stream data
  if echo "$MCP_RESPONSE" | grep -q "protocolVersion\|serverInfo\|capabilities"; then
    pass "MCP initialize responded with server info"
  elif echo "$MCP_RESPONSE" | grep -q "result"; then
    pass "MCP initialize responded"
  else
    info "MCP response (may need format adjustment): $(echo "$MCP_RESPONSE" | head -c 200)"
    fail "MCP endpoint returned unexpected response"
  fi
fi

# ---------------------------------------------------------------------------
# Step 7: Verify login page loads
# ---------------------------------------------------------------------------
echo "Step 7: Checking login page..."
STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/login" 2>/dev/null)
if [ "$STATUS" = "200" ]; then
  pass "Login page loads (HTTP 200)"
else
  fail "Login page returned HTTP $STATUS"
fi

# ---------------------------------------------------------------------------
# Step 8: Verify MongoDB indexes
# ---------------------------------------------------------------------------
echo "Step 8: Verifying MongoDB indexes..."
if [ -x "$SCRIPT_DIR/verify-mongo.sh" ]; then
  MONGODB_URI="$MONGO_URI" "$SCRIPT_DIR/verify-mongo.sh"
else
  info "verify-mongo.sh not found or not executable — skipping index check"
fi

# ---------------------------------------------------------------------------
# Step 9: Idempotency — calling dev login again should return same user
# ---------------------------------------------------------------------------
echo "Step 9: Testing idempotency..."
RESPONSE2=$(curl -sf -X POST "$BASE_URL/api/auth/dev-login" -H "Content-Type: application/json" 2>&1) || true
USER_ID2=$(echo "$RESPONSE2" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).userId))" 2>/dev/null)
if [ "$USER_ID" = "$USER_ID2" ]; then
  pass "Dev login is idempotent (same userId on repeat call)"
else
  fail "Dev login returned different userId on repeat call ($USER_ID vs $USER_ID2)"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
if [ "$FAILED" = "0" ]; then
  echo -e "${GREEN}=== All integration tests passed! ===${NC}"
else
  echo -e "${RED}=== Some integration tests failed ===${NC}"
  exit 1
fi
