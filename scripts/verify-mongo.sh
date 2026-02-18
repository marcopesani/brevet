#!/bin/bash
set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}✓ $1${NC}"; }
fail() { echo -e "  ${RED}✗ $1${NC}"; exit 1; }
info() { echo -e "  ${YELLOW}ℹ $1${NC}"; }

MONGO_URI="${MONGODB_URI:-mongodb://localhost:27017/x402_gateway}"

echo "  Checking indexes and document structure..."

# Check indexes on users collection
USER_INDEXES=$(mongosh --quiet --eval "JSON.stringify(db.users.getIndexes())" "$MONGO_URI" 2>/dev/null)
if echo "$USER_INDEXES" | grep -q "walletAddress"; then
  pass "users.walletAddress index exists"
else
  fail "users.walletAddress index missing"
fi

# Check indexes on hotwallets (address has unique:true in schema, userId has unique:true)
HW_INDEXES=$(mongosh --quiet --eval "JSON.stringify(db.hotwallets.getIndexes())" "$MONGO_URI" 2>/dev/null)
if echo "$HW_INDEXES" | grep -q "userId"; then
  pass "hotwallets.userId index exists"
else
  fail "hotwallets.userId index missing"
fi
if echo "$HW_INDEXES" | grep -q "address"; then
  pass "hotwallets.address index exists"
else
  fail "hotwallets.address index missing"
fi

# Check indexes on endpointpolicies (compound: userId + endpointPattern)
EP_INDEXES=$(mongosh --quiet --eval "JSON.stringify(db.endpointpolicies.getIndexes())" "$MONGO_URI" 2>/dev/null)
if echo "$EP_INDEXES" | grep -q "endpointPattern"; then
  pass "endpointpolicies compound index exists"
else
  info "endpointpolicies compound index not yet created (collection may be empty)"
fi

# Check indexes on transactions
TX_INDEXES=$(mongosh --quiet --eval "JSON.stringify(db.transactions.getIndexes())" "$MONGO_URI" 2>/dev/null)
if echo "$TX_INDEXES" | grep -q "userId"; then
  pass "transactions.userId index exists"
else
  info "transactions.userId index not yet created (collection may be empty)"
fi

# Check indexes on pendingpayments
PP_INDEXES=$(mongosh --quiet --eval "JSON.stringify(db.pendingpayments.getIndexes())" "$MONGO_URI" 2>/dev/null)
if echo "$PP_INDEXES" | grep -q "userId"; then
  pass "pendingpayments.userId index exists"
else
  info "pendingpayments.userId index not yet created (collection may be empty)"
fi

# Document counts
echo ""
echo "  Document counts:"
for col in users hotwallets endpointpolicies transactions pendingpayments; do
  COUNT=$(mongosh --quiet --eval "db.getCollection('$col').countDocuments({})" "$MONGO_URI" 2>/dev/null || echo "0")
  echo "    $col: $COUNT"
done

# Sample document structure (users)
echo ""
echo "  Sample user document fields:"
mongosh --quiet --eval "
  const u = db.users.findOne();
  if (u) print(Object.keys(u).join(', '));
  else print('(no users yet)');
" "$MONGO_URI" 2>/dev/null

# Sample document structure (hotwallets)
echo "  Sample hotwallet document fields:"
mongosh --quiet --eval "
  const hw = db.hotwallets.findOne();
  if (hw) print(Object.keys(hw).join(', '));
  else print('(no hotwallets yet)');
" "$MONGO_URI" 2>/dev/null

pass "MongoDB verification complete"
