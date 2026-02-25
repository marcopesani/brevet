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

To inject the resulting session into a browser (for GUI testing), set the cookies via DevTools console on the `localhost:3000` origin, then navigate to `/dashboard`.

### Required secrets

`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` and `ZERODEV_PROJECT_ID` are provided as environment secrets. With these set in `.env.local`, the AppKit modal properly connects to the WalletConnect relay (no 403 errors) and smart account operations work.

### MCP Inspector CLI testing

To get a fresh API key (keys are hashed in DB, can't be retrieved):

```bash
MONGODB_URI=mongodb://localhost:27017/brevet npx tsx -e "
import { rotateApiKey } from './src/lib/data/users';
import { connectDB } from './src/lib/db';
await connectDB();
const r = await rotateApiKey('<userId>');
console.log(r.rawKey);
process.exit(0);
"
```

Then use the Inspector CLI (see `CLAUDE.md` for full reference). Example flow:

```bash
MCP_URL="http://localhost:3000/api/mcp/<humanHash>"
API_KEY="brv_..."

# List tools
npx @modelcontextprotocol/inspector --cli "$MCP_URL" --transport http \
  --header "Authorization: Bearer $API_KEY" --method tools/list

# Trigger payment (creates pending payment if no smart account)
npx @modelcontextprotocol/inspector --cli "$MCP_URL" --transport http \
  --header "Authorization: Bearer $API_KEY" --method tools/call \
  --tool-name x402_pay --tool-arg url=https://nickeljoke.vercel.app/api/joke

# Check pending payment status
npx @modelcontextprotocol/inspector --cli "$MCP_URL" --transport http \
  --header "Authorization: Bearer $API_KEY" --method tools/call \
  --tool-name x402_check_pending --tool-arg paymentId=<id>
```

The SSRF protection rejects localhost/private-IP URLs in `x402_pay`. Use real public x402 endpoints (e.g., `https://nickeljoke.vercel.app/api/joke` on Base Sepolia). Active endpoint policies must exist for the target URL before payment can proceed.
