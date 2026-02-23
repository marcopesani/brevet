# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Brevet is an MCP (Model Context Protocol) server and web dashboard that enables AI agents to make x402 HTTP payments on Base using USDC. When an AI agent accesses a paid API that returns HTTP 402, the gateway automatically handles the payment flow: parsing payment requirements, signing an EIP-712 message, retrying with payment proof, and logging the transaction.

**Tech stack**: Next.js 16 (App Router), React 19, TypeScript 5, Mongoose 8 (MongoDB Atlas), Tailwind CSS 4, shadcn/ui, viem/wagmi, Reown AppKit (WalletConnect), Vitest 4.

## Commands

```bash
npm run dev              # Dev server on localhost:3000
npm run build            # Production build
npm run lint             # ESLint
npm test                 # Unit + integration tests (watch mode)
npm run test:run         # All tests once (CI mode)
npm run test:e2e         # E2E tests only (requires Base Sepolia RPC)
docker compose up -d     # Start MongoDB + app server
./scripts/test-mcp-auth.sh  # MCP auth integration tests (requires Docker)
```

Run a single test file: `npx vitest run src/lib/__tests__/policy.test.ts`

Run a single test by name: `npx vitest run -t "test name pattern"`

Vitest has two projects configured in `vitest.config.ts`: `unit` (everything except `src/test/e2e/`) and `e2e` (only `src/test/e2e/`). Both run with `fileParallelism: false`.

## Architecture

### x402 Payment Flow

The core logic lives in `src/lib/x402/payment.ts`:

1. Agent calls the `x402_pay` MCP tool with a URL
2. Gateway fetches the URL; if 402 returned, parses payment requirements from body (V1) or headers (V2) via `@x402/core` SDK
3. Endpoint policy lookup determines signing strategy (hot wallet auto-sign vs WalletConnect manual approval)
4. For hot wallet: verifies USDC balance, creates EIP-712 signed payment via SDK, retries request with payment headers
5. For WalletConnect: creates a PendingPayment record for the user to approve in the dashboard
6. On success: extracts settlement tx hash from `Payment-Response` header, stores Transaction record

URL validation rejects localhost, private IPs, and internal hostnames (SSRF protection).

### Multi-version protocol (x402 V1/V2)

When supporting multiple protocol versions, enforce these rules:

- **Version at the edge only.** Detect and parse V1 vs V2 at the single protocol boundary (e.g. 402 response). Downstream code consumes one normalized representation; no `if (v1) ... else (v2)` in business logic.
- **One pipeline.** Policy, signing, retry, and storage run in a single version-agnostic path. Version-specific code lives only in adapters (parsers, header builders); core never branches on version.
- **Normalize before branching.** Convert version-specific payloads to internal types at parse time. Any version-specific field (e.g. `amount` vs `maxAmountRequired`) is handled in the adapter or one narrow helper, not scattered.
- **Test both versions explicitly.** Every behavior that differs by version has tests for V1 and V2. When both can appear (e.g. header + body), test precedence once and document it.
- **No version in persistence by default.** Do not store protocol version in the DB unless required for audit, replay, or compliance. Schema is version-agnostic; version is an input concern.

### MCP Server

Endpoint: `POST /api/mcp/[userId]` using Streamable HTTP transport. Stateless — fresh server instance per request. Requires API key authentication via `Authorization: Bearer brv_...` header or `?api_key=brv_...` query parameter.

Six tools defined in `src/lib/mcp/tools/` (one file per tool): `x402_pay`, `x402_check_balance`, `x402_spending_history`, `x402_check_pending`, `x402_get_result`, `x402_discover`. MCP tools import from `src/lib/data/` (shared data layer) — they do not use API routes or inline database queries.

### Testing MCP Endpoints

Use the MCP Inspector CLI (`@modelcontextprotocol/inspector`) to test the MCP endpoint in headless mode without a chat client:

```bash
# List all tools
npx @modelcontextprotocol/inspector --cli \
  http://localhost:3000/api/mcp/{userId} \
  --transport http \
  --header "Authorization: Bearer brv_..." \
  --method tools/list

# Call a specific tool
npx @modelcontextprotocol/inspector --cli \
  http://localhost:3000/api/mcp/{userId} \
  --transport http \
  --header "Authorization: Bearer brv_..." \
  --method tools/call \
  --tool-name x402_check_balance

# Call a tool with arguments
npx @modelcontextprotocol/inspector --cli \
  http://localhost:3000/api/mcp/{userId} \
  --transport http \
  --header "Authorization: Bearer brv_..." \
  --method tools/call \
  --tool-name x402_discover \
  --tool-arg query=weather

# Alternative: pass API key as query parameter
npx @modelcontextprotocol/inspector --cli \
  "http://localhost:3000/api/mcp/{userId}?api_key=brv_..." \
  --transport http \
  --method tools/list
```

Key flags: `--cli` enables headless mode (no web UI), `--transport http` is required because our URL path doesn't end in `/mcp` (the Inspector defaults to SSE otherwise). Output is JSON to stdout; pipe to `jq` for parsing (e.g., `2>/dev/null | jq '.tools[].name'`). Exit code 0 on success, 1 on failure.

The automated test suite in `scripts/test-mcp-auth.sh` exercises all auth scenarios and tool calls against a running Docker Compose environment.

### Endpoint Policy System

`src/lib/policy.ts` enforces per-endpoint spending rules. Policies match by longest URL prefix. When an agent tries to pay an unknown endpoint, a draft policy is auto-created — the user must activate it in the dashboard before payments are allowed.

### Authentication

Sign-In-With-Ethereum (SIWE) via Reown AppKit + NextAuth credentials provider. SIWX extension support for x402-aware auth flows. Configuration in `src/lib/auth-config.ts` and `src/lib/siwe-config.ts`.

No middleware — route protection uses Next.js route groups: `(dashboard)` layout checks auth and redirects to `/login`.

### Hot Wallet

Auto-created on first login. Private key encrypted with AES-256-GCM, stored in `hotwallets` collection. Encryption key from `HOT_WALLET_ENCRYPTION_KEY` env var (64-char hex). Logic in `src/lib/hot-wallet.ts`.

### Route Groups

- `(auth)` — login page (simple layout)
- `(dashboard)` — protected pages: dashboard, wallet, policies, transactions, pending payments, settings
- `(marketing)` — public landing page
- `api/` — 3 API routes: `auth/[...nextauth]` (NextAuth), `mcp/[userId]` (MCP server), `payments/pending` (React Query polling)

### Data Architecture

**Shared Data Layer** (`src/lib/data/`): Six modules — `payments.ts`, `policies.ts`, `transactions.ts`, `analytics.ts`, `wallet.ts`, `users.ts`. Pure async functions that take `userId` as first parameter. No `"use server"` directive, no HTTP concerns, no auth checks. This is the single source of truth for all database queries (via Mongoose models) — both MCP tools and the dashboard use these.

**Server Actions** (`src/app/actions/`): Thin wrappers with `"use server"` directive. Each action authenticates via `getAuthenticatedUser()`, calls the data layer, and calls `revalidatePath()` for mutations. Used by dashboard components for mutations (approve, reject, activate, create, etc.).

**React Query Hooks** (`src/hooks/`):
- `use-pending-payments.ts` — shared hook for pending payment data, polls every 10s, deduplicates across components
- `use-wallet-balance.ts` — event-driven balance refresh (no polling interval, refetch on window focus + after mutations)

### Server-First Rules

These rules prevent regression to the old polling-heavy architecture:

- **Never create new API routes for dashboard data.** Use Server Components + data layer for reads, Server Actions for mutations.
- **Never add `setInterval` or polling in components.** If data needs periodic updates, use React Query with `refetchInterval` and a shared hook in `src/hooks/`.
- **Never write inline database queries in components, API routes, or MCP tools.** All database access goes through `src/lib/data/`.
- **Never duplicate data-fetching logic.** If MCP tools and the dashboard need the same data, both must import from `src/lib/data/`.
- **Server Components for read-only data.** If a component only displays data (no interactivity), it should be an async Server Component calling the data layer directly.
- **Client Components only when needed.** Only use `"use client"` for: event handlers, useState/useEffect, browser APIs (wagmi, clipboard), interactive controls (sorting, filtering).
- **Mutations via Server Actions.** Dashboard mutations call Server Actions from `src/app/actions/`, which handle auth + data layer + `revalidatePath()`.
- **React Query only for external events.** Only use React Query polling when data changes come from outside the dashboard (e.g., MCP agent creates a pending payment). For data that only changes via dashboard mutations, `revalidatePath()` is sufficient.

### Database

MongoDB with Mongoose. Six collections: `users`, `hotwallets`, `endpointpolicies`, `transactions`, `pendingpayments`, `smartaccounts`. Models defined in `src/lib/models/`.

**Monetary values (MongoDB):**
- Store amounts in **smallest unit as integer** (e.g. USDC 6 decimals); never float.
- Store **currency/asset** on same document as amount; never amount-only.
- **One module** for all add/subtract/compare; no ad-hoc money math elsewhere.
- **Conditional updates** for balance changes (read → compute → update with current-value check); no blind decrements.
- **Append-only audit** for every monetary change (what, when, ref); log is canonical.
- **Indexes** for every query pattern on money data; enforce uniqueness in schema where needed.
- **Migrations**: backward-compatible reads, write new format, backfill separately; have rollback.

### Chain Configuration

`NEXT_PUBLIC_CHAIN_ID` env var toggles between Base mainnet (8453) and Base Sepolia testnet (84532). Singleton config exported from `src/lib/chain-config.ts`.

## React 19 + Compiler

This project uses **React 19.2.3** with the **React Compiler enabled** (`reactCompiler: true` in `next.config.ts`).

### What this means for development:

- **No manual memoization needed**: The compiler auto-memoizes components, `useMemo`, `useCallback`, and `React.memo` are unnecessary in new code. For existing code, leave it in place or remove carefully after testing.
- **Actions**: Use async transitions (`startTransition`) for data mutations. The compiler handles pending states automatically.
- **useActionState**: Preferred hook for form actions with built-in pending/error state.
- **Server Components by default**: React 19 solidifies Server Components as the default mental model. Client Components (`"use client"`) are only needed for: event handlers, `useState`/`useEffect`, browser APIs (wagmi, clipboard), interactive controls.

## Code Conventions

- Import alias: `@/*` maps to `src/*`
- UI components: shadcn/ui (New York style, neutral theme) in `src/components/ui/`
- Never use barrel files
- File naming: kebab-case for utils (`hot-wallet.ts`), PascalCase for components
- Runtime validation: Zod v4 for MCP tool schemas
- Tests: co-located `__tests__/` directories; global mocks in `src/test/setup.ts` (uses mongodb-memory-server for in-memory MongoDB)
- E2E tests make real RPC calls to Base Sepolia
- Data access: all Mongoose queries in `src/lib/data/` — never inline
- Server Actions: `src/app/actions/` for authenticated mutations with revalidation
- React Query hooks: `src/hooks/` for client-side data that needs polling or cache invalidation
- Rate limiting: in-memory sliding window (`src/lib/rate-limit.ts`), applied to `/api/mcp/[userId]` and `/api/payments/pending`
- No magic numbers: configurable limits and defaults (spending caps, expiry durations, retry counts) must come from environment variables parsed at startup. Protocol constants (USDC decimals, chain IDs, contract addresses) can remain in code. Startup must fail if required env vars are missing or invalid.

## Environment Setup

Copy `.env.example` to `.env.local`. Required variables:
- `MONGODB_URI` — MongoDB connection string (default: `mongodb://localhost:27017/brevet`)
- `ZERODEV_PROJECT_ID` — ZeroDev project ID for bundler/paymaster operations (from https://dashboard.zerodev.app)
- `NEXTAUTH_SECRET` — session encryption key
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — from https://dashboard.reown.com

Optional:
- `HOT_WALLET_ENCRYPTION_KEY` — 64-char hex, only needed for legacy hot wallet migration

### Local Development with Docker

Start MongoDB and the app server together:

```bash
docker compose up -d    # Start MongoDB + Next.js dev server (localhost:3000)
docker compose down      # Stop all services (data persists in named volume)
```

The app service mounts the project directory and runs `npm run dev`. Environment variables from `.env.local` can be added to `docker-compose.override.yml` for local overrides.
