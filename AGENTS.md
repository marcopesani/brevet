# AGENTS.md

## Cursor Cloud specific instructions

### Services overview

| Service | How to start | Notes |
|---------|-------------|-------|
| MongoDB | `sudo docker compose up -d mongodb` (from repo root) | Required for dev server. Port 27017. |
| Next.js dev server | `npm run dev` | Port 3000. Hot-reloads on file changes. |

### Development commands

Standard commands are documented in `CLAUDE.md` and `package.json` scripts. Key ones:

- **Lint:** `npm run lint`
- **Unit tests:** `npm run test:run -- --project unit` (uses `mongodb-memory-server`, no external DB needed)
- **All tests once:** `npm run test:run`
- **Dev server:** `npm run dev`

### Gotchas

- **Docker daemon must be running** before `docker compose up`. In Cloud VM, start it with `sudo dockerd &>/tmp/dockerd.log &` and wait a few seconds.
- **Docker storage driver** must be `fuse-overlayfs` and iptables must use `iptables-legacy` in the Cloud VM (nested container environment). These are configured via `/etc/docker/daemon.json` and `update-alternatives`.
- **Unit tests do not need MongoDB running** — they use `mongodb-memory-server` (in-memory). Only the dev server and integration/MCP auth tests need the Docker MongoDB.
- **`npm run build` has a pre-existing TypeScript error** in `e2e/helpers/auth.ts`. This does not affect the dev server or unit tests.
- **Authentication requires an Ethereum wallet** (SIWE). The login flow uses WalletConnect/Reown AppKit. Without valid `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` and `ZERODEV_PROJECT_ID`, wallet connections and smart account features won't work, but the app still starts and serves pages.
- **`.env.local`** must exist with at least `NEXTAUTH_SECRET` and `MONGODB_URI` for the dev server to start. See `.env.example` for all variables.

### SIWE authentication for testing

MetaMask browser extension popups are difficult to interact with via automated tools due to Chrome extension security boundaries. For programmatic SIWE login (e.g., testing the dashboard), use the deterministic signing approach from `e2e/helpers/auth.ts` (`signInWithSeedPhraseCredentials`):

1. Derive wallet from seed phrase using `viem/accounts` (`mnemonicToAccount`)
2. Fetch CSRF token from `/api/auth/csrf` (include the `set-cookie` header for subsequent requests)
3. Build SIWE message with host, address, chainId, nonce, issuedAt
4. Sign with the derived account
5. POST to `/api/auth/callback/credentials` with the CSRF cookie

The default test seed phrase is `test test test test test test test test test test test junk` (Hardhat default), producing address `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`. MetaMask password: `TestPassword123!`.
