# @enclave/facilitator

x402 facilitator for the Enclave shielded-proof to USDC bridge.

## Quick start

```bash
# 1. Create and fund the facilitator key
pnpm --filter @enclave/facilitator run bootstrap

# 2. Copy .env.example to .env and fill in contract IDs
cp .env.example .env

# 3. Run in on_chain mode (default)
pnpm --filter @enclave/facilitator run dev

# or run in mock mode (no testnet required)
FACILITATOR_MODE=mock pnpm --filter @enclave/facilitator run dev
```

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| STELLAR_RPC_URL | yes | — | Soroban RPC endpoint |
| STELLAR_HORIZON_URL | yes | — | Horizon endpoint for account reads |
| STELLAR_NETWORK_PASSPHRASE | yes | — | `Test SDF Network ; September 2015` |
| POOL_CONTRACT_ID | yes | — | Deployed pool contract ID |
| USDC_CONTRACT_ID | yes | — | Testnet USDC SAC contract ID |
| FACILITATOR_KEY_PATH | yes | — | Path to 32-byte raw Ed25519 seed |
| FACILITATOR_MODE | no | on_chain | `on_chain` or `mock` |
| FACILITATOR_MIN_XLM_STROOPS | no | 50000000 | 5 XLM floor |
| FACILITATOR_MAX_TX_FEE_STROOPS | no | 10000000 | 1 XLM max tx fee |
| FACILITATOR_HYDRATE_LEDGERS | no | 120960 | ~7 days at 5s/ledger |
| FACILITATOR_VKEY_PATH | no | wallets/circuits/transact2.vkey.json | snarkjs vkey (mock mode only) |
| PORT | no | 4021 | HTTP listen port |
| CORS_ORIGIN | no | * | Comma-separated origins |
| LOG_LEVEL | no | info | pino log level |

## HTTP API

- `POST /verify` — x402 verify endpoint. Returns `{ isValid: true }` or `{ isValid: false, invalidReason: "..." }`.
- `POST /settle` — x402 settle endpoint (synchronous; returns after chain confirmation). Returns `{ success: true, transaction: "<hash>", network: "stellar-testnet" }`.
- `GET /supported` — x402 scheme discovery. Returns accepted payment schemes.
- `GET /health` — 9-field diagnostic report including balances, uptime, and pool state.

## Testing

```bash
# Unit tests (no network)
pnpm --filter @enclave/facilitator test:unit

# Integration tests (mocked chain)
pnpm --filter @enclave/facilitator test:integration

# Demo lock (static requirement coverage check)
pnpm --filter @enclave/facilitator test:e2e -- demoLock

# Live testnet e2e (requires funded facilitator account and Phase 3 fixture)
E2E_TESTNET=1 pnpm --filter @enclave/facilitator test:e2e
```

## Bootstrap CLI

The `bootstrap` command creates a facilitator key and funds it via Stellar friendbot:

```bash
pnpm --filter @enclave/facilitator run bootstrap
# Re-run is idempotent — skips key creation if admin.key already exists

pnpm --filter @enclave/facilitator run bootstrap -- --force
# Forces key regeneration even if admin.key exists
```

The key is written to `wallets/facilitator/admin.key` (32-byte raw Ed25519 seed, mode 0600).
This file is gitignored and must never be committed.

## Architecture

The facilitator is an Express HTTP server wired to four routes:

- `/verify` — validates proof, checks solvency, runs `simulateTransaction` (dry-run)
- `/settle` — same as verify + submits `pool.transact` and awaits Soroban confirmation
- `/supported` — returns the `shielded-exact` scheme descriptor
- `/health` — exposes internal state for monitoring

In `on_chain` mode the server connects to Stellar testnet and relays transactions.
In `mock` mode it uses snarkjs groth16 verification without any network calls.
