# Synpress + Playwright E2E Tests

Browser-based E2E tests for Brevet using [Synpress](https://docs.synpress.io/) (Playwright + MetaMask automation).

## Prerequisites

- Node.js v18+
- Running Brevet app (default: `http://localhost:3000`)
- MongoDB instance
- Environment variables configured (`.env.local`)

## Setup

```bash
# Install dependencies (already done if you ran npm install)
npm install

# Install Playwright browsers
npx playwright install --with-deps chromium
```

## Running Tests

```bash
# Run all Playwright E2E tests (starts dev server automatically)
npm run test:pw

# Run in headed mode (see the browser)
npm run test:pw:headed

# Run via Synpress CLI
npm run test:synpress

# Run a specific test file
npx playwright test e2e/tests/poc-synpress.spec.ts

# Run with Playwright UI
npx playwright test --ui
```

## Critical Paths Tested

### 1. SIWE Authentication (`auth-flow.spec.ts`)
- Login page renders correctly
- "Connect Wallet" opens AppKit modal
- Full SIWE flow: MetaMask connect → sign message → redirect to dashboard

### 2. Dashboard Navigation (`dashboard-navigation.spec.ts`)
- Unauthenticated users are redirected to `/login`
- Sidebar navigation to all dashboard pages
- Dashboard sections render correctly

### 3. Policy Management (`policy-management.spec.ts`)
- Policy table with tabs (All/Active/Draft/Archived)
- Add Policy dialog
- Tab switching
- Create new policy

### 4. Wallet / Account (`wallet-account.spec.ts`)
- Wallet page loads with setup or balance
- Smart account status display

### 5. Settings (`settings-page.spec.ts`)
- MCP server URL display
- API key section
- Chain settings

## Architecture

```
e2e/
├── fixtures/
│   └── metamask.ts          # Shared test fixtures with MetaMask
├── wallet-setup/
│   ├── basic.setup.ts       # Default MetaMask wallet (Ethereum)
│   └── base-sepolia.setup.ts # MetaMask + Base Sepolia network
├── tests/
│   ├── poc-synpress.spec.ts       # POC: verify Synpress integration works
│   ├── auth-flow.spec.ts          # SIWE authentication flow
│   ├── dashboard-navigation.spec.ts # Dashboard nav & route protection
│   ├── policy-management.spec.ts  # Endpoint policy CRUD
│   ├── wallet-account.spec.ts     # Smart account management
│   └── settings-page.spec.ts      # Settings page
└── README.md
```

## Wallet Setup

Tests use a standard test seed phrase that derives address `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`. This wallet **never holds real funds**.

The `base-sepolia.setup.ts` pre-configures MetaMask with the Base Sepolia network (chain ID 84532) so tests can interact with the testnet chain that Brevet defaults to.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:3000` | App URL for tests |
| `CI` | — | Set in CI to use GitHub reporter and disable dev server |

## Notes

- Tests run sequentially (`workers: 1`) because MetaMask state is shared per browser context.
- The `webServer` config in `playwright.config.ts` auto-starts `npm run dev` if not already running.
- Synpress wallet setup files are cached after first run for faster subsequent executions.
- AppKit modal interaction may vary across versions — selectors target web component names and text content rather than CSS classes.
