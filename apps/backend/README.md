# Backend (`apps/backend`)

Fastify API for Brevet authentication and API-key flows.

## Scripts

```sh
pnpm --filter backend run dev
pnpm --filter backend run check-types
pnpm --filter backend run test
pnpm --filter backend run build
```

## Key Routes

- `GET /auth/session`
- `POST /auth/logout`
- `GET /auth/whoami`
- `POST /auth/siwx/challenge`
- `POST /auth/siwx/verify`
- `POST /auth/passkey/register/options`
- `POST /auth/passkey/register/verify`
- `POST /auth/passkey/login/options`
- `POST /auth/passkey/login/verify`

## Logging

- Uses structured JSON logs with request correlation (`x-request-id`).
- Security/auth events are emitted with stable names from `@repo/auth-contracts/logging`.
- Sensitive fields are redacted by default (`authorization`, `cookie`, API keys, secrets, signatures).

### Logging Environment Variables

- `LOG_LEVEL` (`debug|info|warn|error|fatal`, default `info`)
- `LOG_REDACT` (`1`/`0`, default `1`)
- `LOG_SAMPLE_RATE` (`0`-`1`, default `1`)
- `LOG_PRETTY` (`1`/`0`, default `0`, intended for local development)
