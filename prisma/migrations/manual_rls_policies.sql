-- =============================================================================
-- Row Level Security (RLS) Policies for all tables
-- Run this manually in Supabase SQL Editor (Prisma does not manage RLS)
-- =============================================================================

-- =============================================================================
-- 1. User table
-- The "id" column IS the auth.uid(), so policies use "id" directly.
-- Users can read and update their own row only. No client-side insert/delete.
-- =============================================================================

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON "User"
  FOR SELECT TO authenticated
  USING ((select auth.uid())::text = "id");

CREATE POLICY "Users can update own profile" ON "User"
  FOR UPDATE TO authenticated
  USING ((select auth.uid())::text = "id")
  WITH CHECK ((select auth.uid())::text = "id");

-- =============================================================================
-- 2. HotWallet table
-- Users can only read their own wallet. All writes are server-side only
-- (via Prisma service role, which bypasses RLS).
-- =============================================================================

ALTER TABLE "HotWallet" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own hot wallet" ON "HotWallet"
  FOR SELECT TO authenticated
  USING ((select auth.uid())::text = "userId");

-- =============================================================================
-- 3. SpendingPolicy table
-- Users can read and update their own spending policy.
-- Insert/delete handled server-side.
-- =============================================================================

ALTER TABLE "SpendingPolicy" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own spending policy" ON "SpendingPolicy"
  FOR SELECT TO authenticated
  USING ((select auth.uid())::text = "userId");

CREATE POLICY "Users can update own spending policy" ON "SpendingPolicy"
  FOR UPDATE TO authenticated
  USING ((select auth.uid())::text = "userId")
  WITH CHECK ((select auth.uid())::text = "userId");

-- =============================================================================
-- 4. Transaction table
-- Users can only read their own transactions. All writes are server-side.
-- =============================================================================

ALTER TABLE "Transaction" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions" ON "Transaction"
  FOR SELECT TO authenticated
  USING ((select auth.uid())::text = "userId");

-- =============================================================================
-- 5. PendingPayment table
-- Users can only read their own pending payments. All writes are server-side.
-- =============================================================================

ALTER TABLE "PendingPayment" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pending payments" ON "PendingPayment"
  FOR SELECT TO authenticated
  USING ((select auth.uid())::text = "userId");
