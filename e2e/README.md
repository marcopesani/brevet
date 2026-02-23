# Browser E2E (Synpress + Playwright)

This folder contains browser end-to-end tests for critical wallet flows:

- MetaMask SIWE login
- Policy creation
- Pending payment approval (typed-data signature)

## Run prerequisites

Start the app with test mode enabled:

```bash
NEXT_PUBLIC_TEST_MODE=true npm run dev
```

Also ensure MongoDB is available via your normal local setup (`docker compose up -d mongodb` or external URI).

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
- `E2E_METAMASK_SEED_PHRASE` (defaults to Hardhat mnemonic)
- `E2E_METAMASK_PASSWORD` (default `Password123!`)
