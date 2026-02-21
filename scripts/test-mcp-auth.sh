#!/bin/bash
set -e

echo "=== Brevet MCP API Key Auth Test ==="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; FAILED=$((FAILED + 1)); }
info() { echo -e "${YELLOW}ℹ $1${NC}"; }

FAILED=0
BASE_URL="${BASE_URL:-http://localhost:3000}"

# State for cleanup
ORIGINAL_API_KEY_HASH=""
ORIGINAL_API_KEY_PREFIX=""
USER_ID=""
HAS_ORIGINAL_KEY="false"

# ---------------------------------------------------------------------------
# Cleanup: restore original user state on exit
# ---------------------------------------------------------------------------
cleanup() {
  echo ""
  info "Cleaning up..."
  if [ -n "$USER_ID" ]; then
    if [ "$HAS_ORIGINAL_KEY" = "true" ]; then
      docker compose exec -T mongodb mongosh brevet --quiet --eval "
        db.users.updateOne(
          { _id: ObjectId('$USER_ID') },
          { \$set: { apiKeyHash: '$ORIGINAL_API_KEY_HASH', apiKeyPrefix: '$ORIGINAL_API_KEY_PREFIX' } }
        );
      " > /dev/null 2>&1
      info "Restored original API key for user $USER_ID"
    else
      docker compose exec -T mongodb mongosh brevet --quiet --eval "
        db.users.updateOne(
          { _id: ObjectId('$USER_ID') },
          { \$unset: { apiKeyHash: '', apiKeyPrefix: '' } }
        );
      " > /dev/null 2>&1
      info "Removed test API key from user $USER_ID"
    fi
  fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Pre-checks
# ---------------------------------------------------------------------------
echo "Pre-checks..."

# Docker Compose running
if docker compose ps --status running 2>/dev/null | grep -q "mongodb"; then
  pass "Docker Compose: mongodb is running"
else
  fail "Docker Compose: mongodb is not running. Run: docker compose up -d"
  exit 1
fi

if docker compose ps --status running 2>/dev/null | grep -q "app"; then
  pass "Docker Compose: app is running"
else
  info "Docker Compose: app container not detected (may be running outside Docker)"
fi

# App responding
if curl -sf "$BASE_URL" > /dev/null 2>&1; then
  pass "App is responding at $BASE_URL"
else
  fail "App is not responding at $BASE_URL"
  exit 1
fi

# At least one user in DB
USER_COUNT=$(docker compose exec -T mongodb mongosh brevet --quiet --eval "db.users.countDocuments()" 2>/dev/null)
if [ "$USER_COUNT" -gt 0 ] 2>/dev/null; then
  pass "Found $USER_COUNT user(s) in database"
else
  fail "No users found in database. Log in via the dashboard first."
  exit 1
fi

# ---------------------------------------------------------------------------
# Setup: pick first user, save original state, provision test API key
# ---------------------------------------------------------------------------
echo ""
echo "Setup: provisioning test API key..."

# Get first user's ID and current API key state
SETUP_OUTPUT=$(docker compose exec -T mongodb mongosh brevet --quiet --eval '
  const u = db.users.findOne();
  const hasKey = u.apiKeyHash != null;
  print("USER_ID=" + u._id.toString());
  print("HAS_KEY=" + hasKey);
  if (hasKey) {
    print("ORIG_HASH=" + u.apiKeyHash);
    print("ORIG_PREFIX=" + u.apiKeyPrefix);
  }
' 2>/dev/null)

USER_ID=$(echo "$SETUP_OUTPUT" | grep "^USER_ID=" | cut -d= -f2 | tr -d '[:space:]')
HAS_KEY=$(echo "$SETUP_OUTPUT" | grep "^HAS_KEY=" | cut -d= -f2 | tr -d '[:space:]')

if [ -z "$USER_ID" ]; then
  fail "Could not read user from database"
  exit 1
fi

if [ "$HAS_KEY" = "true" ]; then
  HAS_ORIGINAL_KEY="true"
  ORIGINAL_API_KEY_HASH=$(echo "$SETUP_OUTPUT" | grep "^ORIG_HASH=" | cut -d= -f2 | tr -d '[:space:]')
  ORIGINAL_API_KEY_PREFIX=$(echo "$SETUP_OUTPUT" | grep "^ORIG_PREFIX=" | cut -d= -f2 | tr -d '[:space:]')
  info "User $USER_ID has an existing API key (prefix: $ORIGINAL_API_KEY_PREFIX) — will restore on cleanup"
else
  HAS_ORIGINAL_KEY="false"
  info "User $USER_ID has no API key — will remove test key on cleanup"
fi

# Generate test API key (same algorithm as src/lib/data/users.ts)
KEY_OUTPUT=$(docker compose exec -T mongodb mongosh brevet --quiet --eval '
  const crypto = require("crypto");
  const rawKey = "brv_" + crypto.randomBytes(16).toString("hex");
  const hash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const prefix = rawKey.substring(0, 8);
  print("API_KEY=" + rawKey);
  print("API_KEY_HASH=" + hash);
  print("API_KEY_PREFIX=" + prefix);
' 2>/dev/null)

API_KEY=$(echo "$KEY_OUTPUT" | grep "^API_KEY=" | head -1 | cut -d= -f2 | tr -d '[:space:]')
API_KEY_HASH=$(echo "$KEY_OUTPUT" | grep "^API_KEY_HASH=" | cut -d= -f2 | tr -d '[:space:]')
API_KEY_PREFIX=$(echo "$KEY_OUTPUT" | grep "^API_KEY_PREFIX=" | cut -d= -f2 | tr -d '[:space:]')

if [ -z "$API_KEY" ] || [ -z "$API_KEY_HASH" ]; then
  fail "Could not generate test API key"
  exit 1
fi

# Insert test API key into user document
docker compose exec -T mongodb mongosh brevet --quiet --eval "
  db.users.updateOne(
    { _id: ObjectId('$USER_ID') },
    { \$set: { apiKeyHash: '$API_KEY_HASH', apiKeyPrefix: '$API_KEY_PREFIX' } }
  );
" > /dev/null 2>&1

pass "Test API key provisioned for user $USER_ID"
info "API key: ${API_KEY:0:12}..."
echo ""

# ---------------------------------------------------------------------------
# Test 1: No API key → Inspector CLI exits with code 1
# ---------------------------------------------------------------------------
echo "Test 1: No API key → rejected"
set +e
OUTPUT=$(npx @modelcontextprotocol/inspector --cli \
  "$BASE_URL/api/mcp/$USER_ID" \
  --transport http \
  --method tools/list 2>&1)
EXIT_CODE=$?
set -e

if [ "$EXIT_CODE" -ne 0 ] && echo "$OUTPUT" | grep -q "API key required"; then
  pass "No API key → rejected with 'API key required' (exit $EXIT_CODE)"
else
  fail "No API key → expected exit 1 + 'API key required', got exit $EXIT_CODE"
  info "Output: $(echo "$OUTPUT" | head -5)"
fi

# ---------------------------------------------------------------------------
# Test 2: Invalid API key → Inspector CLI exits with code 1
# ---------------------------------------------------------------------------
echo "Test 2: Invalid API key → rejected"
set +e
OUTPUT=$(npx @modelcontextprotocol/inspector --cli \
  "$BASE_URL/api/mcp/$USER_ID" \
  --transport http \
  --header "Authorization: Bearer brv_0000000000000000000000000000dead" \
  --method tools/list 2>&1)
EXIT_CODE=$?
set -e

if [ "$EXIT_CODE" -ne 0 ] && echo "$OUTPUT" | grep -q "Invalid API key"; then
  pass "Invalid API key → rejected with 'Invalid API key' (exit $EXIT_CODE)"
else
  fail "Invalid API key → expected exit 1 + 'Invalid API key', got exit $EXIT_CODE"
  info "Output: $(echo "$OUTPUT" | head -5)"
fi

# ---------------------------------------------------------------------------
# Test 3: Valid Bearer header → tools/list succeeds
# ---------------------------------------------------------------------------
echo "Test 3: Valid Bearer header → tools/list succeeds"
set +e
OUTPUT=$(npx @modelcontextprotocol/inspector --cli \
  "$BASE_URL/api/mcp/$USER_ID" \
  --transport http \
  --header "Authorization: Bearer $API_KEY" \
  --method tools/list 2>&1)
EXIT_CODE=$?
set -e

if [ "$EXIT_CODE" -eq 0 ] && echo "$OUTPUT" | grep -q "x402_pay"; then
  pass "Valid Bearer header → tools/list succeeded (found x402_pay)"
else
  fail "Valid Bearer header → expected exit 0 + 'x402_pay', got exit $EXIT_CODE"
  info "Output: $(echo "$OUTPUT" | head -5)"
fi

# ---------------------------------------------------------------------------
# Test 4: Valid query param → tools/list succeeds
# ---------------------------------------------------------------------------
echo "Test 4: Valid query param → tools/list succeeds"
set +e
OUTPUT=$(npx @modelcontextprotocol/inspector --cli \
  "$BASE_URL/api/mcp/$USER_ID?api_key=$API_KEY" \
  --transport http \
  --method tools/list 2>&1)
EXIT_CODE=$?
set -e

if [ "$EXIT_CODE" -eq 0 ] && echo "$OUTPUT" | grep -q "x402_pay"; then
  pass "Valid query param → tools/list succeeded (found x402_pay)"
else
  fail "Valid query param → expected exit 0 + 'x402_pay', got exit $EXIT_CODE"
  info "Output: $(echo "$OUTPUT" | head -5)"
fi

# ---------------------------------------------------------------------------
# Test 5: x402_check_balance tool call
# ---------------------------------------------------------------------------
echo "Test 5: x402_check_balance tool call"
set +e
OUTPUT=$(npx @modelcontextprotocol/inspector --cli \
  "$BASE_URL/api/mcp/$USER_ID" \
  --transport http \
  --header "Authorization: Bearer $API_KEY" \
  --method tools/call \
  --tool-name x402_check_balance 2>&1)
EXIT_CODE=$?
set -e

if [ "$EXIT_CODE" -eq 0 ] && echo "$OUTPUT" | grep -q "content"; then
  pass "x402_check_balance → returned content (exit 0)"
else
  fail "x402_check_balance → expected exit 0 + 'content', got exit $EXIT_CODE"
  info "Output: $(echo "$OUTPUT" | head -5)"
fi

# ---------------------------------------------------------------------------
# Test 6: x402_spending_history tool call
# ---------------------------------------------------------------------------
echo "Test 6: x402_spending_history tool call"
set +e
OUTPUT=$(npx @modelcontextprotocol/inspector --cli \
  "$BASE_URL/api/mcp/$USER_ID" \
  --transport http \
  --header "Authorization: Bearer $API_KEY" \
  --method tools/call \
  --tool-name x402_spending_history 2>&1)
EXIT_CODE=$?
set -e

if [ "$EXIT_CODE" -eq 0 ] && echo "$OUTPUT" | grep -q "content"; then
  pass "x402_spending_history → returned content (exit 0)"
else
  fail "x402_spending_history → expected exit 0 + 'content', got exit $EXIT_CODE"
  info "Output: $(echo "$OUTPUT" | head -5)"
fi

# ---------------------------------------------------------------------------
# Test 7: x402_discover with query arg
# ---------------------------------------------------------------------------
echo "Test 7: x402_discover with query=weather arg"
set +e
OUTPUT=$(npx @modelcontextprotocol/inspector --cli \
  "$BASE_URL/api/mcp/$USER_ID" \
  --transport http \
  --header "Authorization: Bearer $API_KEY" \
  --method tools/call \
  --tool-name x402_discover \
  --tool-arg query=weather 2>&1)
EXIT_CODE=$?
set -e

if [ "$EXIT_CODE" -eq 0 ] && echo "$OUTPUT" | grep -q "content"; then
  pass "x402_discover(query=weather) → returned content (exit 0)"
else
  fail "x402_discover → expected exit 0 + 'content', got exit $EXIT_CODE"
  info "Output: $(echo "$OUTPUT" | head -5)"
fi

# ---------------------------------------------------------------------------
# Test 8: Key rotation — new key works, old key fails
# ---------------------------------------------------------------------------
echo "Test 8: Key rotation"
OLD_API_KEY="$API_KEY"

# Generate a second key and update the user
ROTATE_OUTPUT=$(docker compose exec -T mongodb mongosh brevet --quiet --eval '
  const crypto = require("crypto");
  const newKey = "brv_" + crypto.randomBytes(16).toString("hex");
  const newHash = crypto.createHash("sha256").update(newKey).digest("hex");
  const newPrefix = newKey.substring(0, 8);
  print("NEW_KEY=" + newKey);
  print("NEW_HASH=" + newHash);
  print("NEW_PREFIX=" + newPrefix);
' 2>/dev/null)

NEW_API_KEY=$(echo "$ROTATE_OUTPUT" | grep "^NEW_KEY=" | cut -d= -f2 | tr -d '[:space:]')
NEW_HASH=$(echo "$ROTATE_OUTPUT" | grep "^NEW_HASH=" | cut -d= -f2 | tr -d '[:space:]')
NEW_PREFIX=$(echo "$ROTATE_OUTPUT" | grep "^NEW_PREFIX=" | cut -d= -f2 | tr -d '[:space:]')

docker compose exec -T mongodb mongosh brevet --quiet --eval "
  db.users.updateOne(
    { _id: ObjectId('$USER_ID') },
    { \$set: { apiKeyHash: '$NEW_HASH', apiKeyPrefix: '$NEW_PREFIX' } }
  );
" > /dev/null 2>&1

# Update API_KEY_HASH for cleanup to use the new hash
API_KEY_HASH="$NEW_HASH"
API_KEY_PREFIX="$NEW_PREFIX"

# Old key should fail
set +e
OUTPUT=$(npx @modelcontextprotocol/inspector --cli \
  "$BASE_URL/api/mcp/$USER_ID" \
  --transport http \
  --header "Authorization: Bearer $OLD_API_KEY" \
  --method tools/list 2>&1)
EXIT_CODE=$?
set -e

if [ "$EXIT_CODE" -ne 0 ] && echo "$OUTPUT" | grep -q "Invalid API key"; then
  pass "Old key rejected after rotation (exit $EXIT_CODE)"
else
  fail "Old key should be rejected after rotation, got exit $EXIT_CODE"
  info "Output: $(echo "$OUTPUT" | head -5)"
fi

# New key should work
set +e
OUTPUT=$(npx @modelcontextprotocol/inspector --cli \
  "$BASE_URL/api/mcp/$USER_ID" \
  --transport http \
  --header "Authorization: Bearer $NEW_API_KEY" \
  --method tools/list 2>&1)
EXIT_CODE=$?
set -e

if [ "$EXIT_CODE" -eq 0 ] && echo "$OUTPUT" | grep -q "x402_pay"; then
  pass "New key works after rotation (exit 0)"
else
  fail "New key should work after rotation, got exit $EXIT_CODE"
  info "Output: $(echo "$OUTPUT" | head -5)"
fi

# ---------------------------------------------------------------------------
# Test 9: DB verification — user has apiKeyHash and apiKeyPrefix
# ---------------------------------------------------------------------------
echo "Test 9: DB state verification"
DB_OUTPUT=$(docker compose exec -T mongodb mongosh brevet --quiet --eval "
  const u = db.users.findOne({ _id: ObjectId('$USER_ID') });
  print('HAS_HASH=' + (u.apiKeyHash != null));
  print('HAS_PREFIX=' + (u.apiKeyPrefix != null));
  print('HASH_LEN=' + (u.apiKeyHash ? u.apiKeyHash.length : 0));
  print('PREFIX_VAL=' + (u.apiKeyPrefix || ''));
" 2>/dev/null)

HAS_HASH=$(echo "$DB_OUTPUT" | grep "^HAS_HASH=" | cut -d= -f2 | tr -d '[:space:]')
HAS_PREFIX=$(echo "$DB_OUTPUT" | grep "^HAS_PREFIX=" | cut -d= -f2 | tr -d '[:space:]')
HASH_LEN=$(echo "$DB_OUTPUT" | grep "^HASH_LEN=" | cut -d= -f2 | tr -d '[:space:]')
PREFIX_VAL=$(echo "$DB_OUTPUT" | grep "^PREFIX_VAL=" | cut -d= -f2 | tr -d '[:space:]')

if [ "$HAS_HASH" = "true" ] && [ "$HASH_LEN" = "64" ]; then
  pass "User has apiKeyHash (SHA-256, 64 chars)"
else
  fail "User apiKeyHash invalid (hasHash=$HAS_HASH, len=$HASH_LEN)"
fi

if [ "$HAS_PREFIX" = "true" ] && echo "$PREFIX_VAL" | grep -q "^brv_"; then
  pass "User has apiKeyPrefix ($PREFIX_VAL)"
else
  fail "User apiKeyPrefix invalid (hasPrefix=$HAS_PREFIX, val=$PREFIX_VAL)"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}=== All $((9 + 2)) checks passed! ===${NC}"
else
  echo -e "${RED}=== $FAILED check(s) failed ===${NC}"
  exit 1
fi
