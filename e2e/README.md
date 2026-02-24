# Browser E2E (Synpress + Playwright)

This folder contains browser end-to-end tests for critical wallet flows:

- MetaMask SIWE login
- Policy creation
- Pending payment approval (typed-data signature)

## Run prerequisites

No separate app startup is required when using the provided scripts:

- `playwright.config.ts` boots a dedicated E2E dev server automatically.
- If `MONGODB_URI` is not provided, an in-memory MongoDB instance is started automatically.

## Install + cache setup

```bash
npm run test:e2e:browser:install
npm run test:e2e:browser:cache
```

## Execute

```bash
# Full suite
npm run test:e2e:browser

# POC only
npm run test:e2e:browser:poc

# Headed mode
npm run test:e2e:browser:headed
```

## Environment variables

- `E2E_BASE_URL` (default `http://127.0.0.1:3000`)
- `E2E_CHAIN_ID` (default `80002`, Polygon Amoy)
- `E2E_METAMASK_SEED_PHRASE` (defaults to Hardhat mnemonic)
- `E2E_METAMASK_PASSWORD` (default `Password123!`)
- `E2E_WALLETCONNECT_PROJECT_ID` (fallback if `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is not set)
- `E2E_ZERODEV_PROJECT_ID` (fallback if `ZERODEV_PROJECT_ID` is not set)
- `E2E_MONGODB_URI` (optional explicit DB URI for webServer startup)
- `E2E_REAL_METAMASK=true` to force real MetaMask approval popups for SIWE and typed-data flows (disabled by default for deterministic CI)
- `E2E_REAL_METAMASK_STRICT=true` to fail immediately when popup-driven real MetaMask flow fails (without deterministic fallback)

Use a valid WalletConnect/Reown project ID for full wallet-connection happy paths.
