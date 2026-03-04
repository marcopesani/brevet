# Brevet Monorepo

Brevet is a pnpm + Turborepo workspace with:
- `apps/frontend`: Next.js 16 auth UI
- `apps/backend`: Fastify 5 API
- `apps/cli`: oclif CLI (`brevet`)
- `packages/auth-contracts`: shared Zod API contracts
- `packages/db`: Drizzle schema + migrations

## Quick Start

```sh
pnpm install --no-frozen-lockfile
pnpm db:up
pnpm dev
```

## Quality Gates

Run from the repo root:

```sh
pnpm lint
pnpm check-types
pnpm test
pnpm build
```

## Database

```sh
pnpm db:up
pnpm db:down
pnpm db:logs
pnpm --filter @repo/db run db:push
```

## Auth Surface

- Session cookies + API keys
- SIWX wallet auth (`/auth/siwx/*`)
- Passkeys via WebAuthn (`/auth/passkey/*`)
- Shared request/response schemas in `@repo/auth-contracts`

## Logging Conventions

- Structured JSON logs across backend, frontend, and CLI.
- Required fields: `service`, `env`, `event.name`, `event.category`, `event.outcome`, `request.id`.
- Backend accepts and propagates `x-request-id` for end-to-end correlation.
- Sensitive data must never be logged; auth headers/cookies/secrets/signatures/challenges are redacted.
- Use event names from `@repo/auth-contracts/logging` for consistency.
- Detailed guidance and incident query examples: `LOGGING.md`.
