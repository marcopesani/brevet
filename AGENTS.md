# AGENTS.md

Guidance for AI agents working in this repo. Focus: **avoid errors and wrong patterns**.

## Context

MCP server + dashboard for x402 HTTP payments on multiple chains (USDC). Next.js 16, React 19, Mongoose 9, viem/wagmi, Reown AppKit, Vitest 4.

## Commands

```bash
npm run dev
npm run build
npm run lint
npm run test:run
npm run test:e2e
docker compose up -d
```

Vitest: `unit` (excludes `src/test/e2e/`), `e2e` (only `src/test/e2e/`); `fileParallelism: false`.

## x402 & MCP: avoid these errors

- **Don't** add version branching (V1 vs V2) in payment core. Keep version at the edge only (parse/headers); normalize before business logic.
- **Don't** assume a hot-wallet EOA signs. Signing is the **smart account session key**; encryption in `src/lib/encryption.ts`, data on smart account doc.
- **Don't** use `userId` in the MCP URL. Route is `api/mcp/[humanHash]` (human hash from dashboard/settings).
- **Don't** add DB or API route calls inside MCP tools. They must use `src/lib/data/` only.
- **Don't** bypass `checkPolicy` for new x402 logic or send raw Mongoose docs to the client.
- Policies: `src/lib/policy.ts`, longest prefix; no match → reject + draft. Auth: SIWE (auth-config, siwe-config); no middleware; (dashboard) layout protects. Routes: (auth), (dashboard), (marketing), api (auth, mcp/[humanHash], payments/pending).
- **Must** sanitize user-supplied headers in payment flow (block auth/payment headers, strip CRLF); URL validation rejects localhost/private IPs (SSRF).

Chains: `src/lib/chain-config.ts`; `getChainById`, `getDefaultChainConfig()`; default UI chain is fixed in code (8453, Base mainnet); user-enabled chains per user.

**Testing MCP:** Inspector CLI: `--transport http`, URL `.../api/mcp/{humanHash}`, auth `Authorization: Bearer brv_...` or `?api_key=`. See CLAUDE.md for full examples.

## Data and actions: avoid these errors

- **Never** query DB or call HTTP from components, API routes, or MCP tools. All access via `src/lib/data/` (payments, policies, transactions, analytics, wallet, users, user, smart-account).
- **Never** create new API routes for dashboard data. Use Server Components + data layer for reads, Server Actions for mutations.
- **Mutations:** Must return `ActionResult<T>`; use `withAuth()` from `@/lib/action-result-server`; return `ok(data)` / `err(message)`; never throw from mutation actions.
- **Reads** used by Server Components: use `getAuthenticatedUser()`, throw if unauthenticated (error boundaries).
- **Client:** Check `result.success` and use `result.data` / `result.error`, or `unwrap(result)` in React Query `mutationFn` for `onError`.
- **Never** send Mongoose documents to the client. Data layer returns DTOs only (`*DTO.parse(doc)` / `doc.toObject()`); models have `*Doc` + Zod `*DTO`; exclude sensitive fields (e.g. `apiKeyHash`) from DTO.
- **Never** add `setInterval` or ad-hoc polling in components. Use React Query with a shared hook in `src/hooks/` (e.g. pending payments 10s poll; wallet balance refetch on focus + after mutations). Use React Query polling only for data changed outside the dashboard (e.g. MCP); otherwise `revalidatePath()` after mutations.

## DB and money: avoid these errors

- **Collections:** `users`, `endpointpolicies`, `transactions`, `pendingpayments`, `smartaccounts`. Models in `src/lib/models/`. **Don't** default `chainId` (or similar) from env in schema; store explicitly (required) for multi-chain safety.
- **Money:** Smallest unit as integer (e.g. 6 decimals); never float. Store currency/asset with amount. One module for add/subtract/compare; conditional updates (read–compute–update with current-value check); append-only audit; indexes for query patterns.
- **Migrations:** Backward-compatible reads, write new format, backfill separately; have rollback.

## React: avoid these errors

- **Don't** add `useMemo` / `useCallback` / `React.memo` in new code; compiler handles it.
- Prefer Server Components; use `"use client"` only for event handlers, `useState`/`useEffect`, browser APIs (wagmi, clipboard), or interactive controls (sorting, filtering).

## Conventions that prevent breakage

- `@/*` → `src/*`; no barrel files; kebab-case utils, PascalCase components.
- Zod v4 for MCP tool schemas. All DB in `src/lib/data/`; mutations in `src/app/actions/` with revalidation.
- Bundler/AA* errors: use `toHumanReadableBundlerError` / `extractJsonRpcError` from `src/lib/bundler-errors.ts`.
- Configurable limits from env (startup validation); no magic numbers for caps/expiry/retries.
- Rate limit on `api/mcp/[humanHash]` and `api/payments/pending`.

## Env: avoid startup/runtime errors

Copy `.env.example` → `.env.local`. Required: `MONGODB_URI`, `ZERODEV_PROJECT_ID`, `NEXTAUTH_SECRET`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`. Optional: `ALCHEMY_API_KEY`, `HOT_WALLET_ENCRYPTION_KEY` (legacy). Docker: `docker compose up -d` (see compose file).

## Cursor Cloud: avoid these gotchas

- Docker daemon must be running before `docker compose up`.
- Unit tests don't need live MongoDB (Vitest/setup); dev server needs MongoDB.
- `npm run build` may error in `e2e/helpers/auth.ts` (Playwright); does not affect dev server or Vitest.
- Auth requires wallet + env; `.env.local` must exist with required vars.
- MCP URL uses **humanHash** (from dashboard), not userId. API key: `rotateApiKey(userId)` from `src/lib/data/users` (userId = Mongo ObjectId). See CLAUDE.md for SIWE testing and Inspector CLI flow.
