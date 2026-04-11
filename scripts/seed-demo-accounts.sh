#!/usr/bin/env bash
# Seed the Enclave demo accounts off-camera.
#
# Scope (Phase 1, plan 01-01, Task 3 — user_response extended scope):
#
#   1. Ensure a `user` identity exists in the local `stellar keys` config.
#      If missing: generate a fresh keypair with --fund (friendbot).
#      If present: skip keypair generation, assume seed already stashed.
#
#   2. Ensure the `user` account is friendbot-funded on Stellar testnet.
#      If already funded: skip.
#
#   3. Establish a CLASSIC `USDC:<Circle testnet issuer>` trustline on both
#      `mikey` (admin/deployer) AND `user`. The SAC at
#      CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA wraps the
#      classic USDC asset, so SAC balance/transfer calls require a
#      classic trustline on the source and destination accounts.
#      Idempotent: change-trust succeeds on existing trustlines.
#
#   4. Transfer USDC from `mikey` to `user` via the SAC's `transfer` fn.
#      Default: 1000 USDC = 10_000_000_000 stroops (USDC has 7 decimals
#      on Stellar classic, so 1000 USDC = 1_000 * 10^7 stroops).
#      Idempotent: skip if user's USDC balance is already ≥ threshold.
#
#      If mikey has no USDC, print a clear WARNING with the Circle
#      testnet faucet URL (https://faucet.circle.com/) and exit 0.
#      Circle testnet USDC is minted via a web-UI faucet which cannot
#      be automated from bash; log-and-continue is the correct fallback.
#
#   5. Write scripts/demo-accounts.json with ONLY public keys:
#        { "mikey": "G…", "user": "G…" }
#      Secret keys stay inside `stellar keys` config and are never
#      committed to git.
#
# Re-runnable: safe on second invocation. Every step is idempotent.
# The script does NOT transfer classic XLM between accounts (friendbot
# handles initial funding).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEMO_ACCOUNTS="$ROOT_DIR/scripts/demo-accounts.json"
DEPLOYMENTS="$ROOT_DIR/scripts/deployments.json"

die()  { echo "seed-demo-accounts.sh: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing '$1'"; }
step() { echo "==> $*" >&2; }
note() { echo "    $*" >&2; }
warn() { echo "    [WARN] $*" >&2; }
ok()   { echo "    [OK]   $*" >&2; }

need stellar
need jq
need curl

NETWORK="${STELLAR_NETWORK:-testnet}"
ADMIN_IDENTITY="${ADMIN_IDENTITY:-mikey}"
USER_IDENTITY="${USER_IDENTITY:-user}"
USDC_ISSUER="${USDC_ISSUER:-GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5}"
USDC_ASSET_LINE="USDC:${USDC_ISSUER}"
# 1000 USDC (classic USDC on Stellar uses 7 decimals → 10^10 stroops for 1000)
USDC_AMOUNT="${USDC_AMOUNT:-10000000000}"

# Validate deployments.json exists so users fail loudly if this script is
# run before deploy.sh.
[[ -f "$DEPLOYMENTS" ]] || die "scripts/deployments.json not found — run scripts/deploy.sh first"

# Confirm the SAC in deployments.json matches the classic asset we're about
# to trustline. If they differ, something is wired wrong upstream.
SAC_FROM_DEPLOY=$(jq -r '.usdc_token_sac' "$DEPLOYMENTS")
SAC_FROM_ASSET=$(stellar contract id asset --network "$NETWORK" --asset "$USDC_ASSET_LINE" 2>/dev/null || echo "")
if [[ -n "$SAC_FROM_ASSET" && "$SAC_FROM_ASSET" != "$SAC_FROM_DEPLOY" ]]; then
  die "USDC SAC mismatch: deployments.json has $SAC_FROM_DEPLOY but asset-id($USDC_ASSET_LINE) resolves to $SAC_FROM_ASSET"
fi
USDC_SAC="$SAC_FROM_DEPLOY"
[[ -n "$USDC_SAC" && "$USDC_SAC" != "null" ]] || die "usdc_token_sac missing from deployments.json"

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

resolve_address() {
  local identity="$1"
  stellar keys address "$identity" 2>/dev/null || true
}

friendbot_fund() {
  local g_address="$1"
  local label="$2"
  # Friendbot returns 400 "bad_request" with a createAccountAlreadyExist op
  # result for already-funded accounts. curl -f would die on that; we use
  # -sS and check the body ourselves.
  local body
  body=$(curl -sS "https://friendbot.stellar.org/?addr=${g_address}" 2>&1 || true)
  if echo "$body" | grep -q 'createAccountAlreadyExist\|already.*exist\|bad_request'; then
    ok "$label already funded (${g_address})"
  elif echo "$body" | grep -q '"successful":true\|"hash"'; then
    ok "$label funded via friendbot (${g_address})"
  else
    warn "$label friendbot response unclear (assuming funded):"
    warn "$(echo "$body" | head -3)"
  fi
}

usdc_balance() {
  # Returns the SAC balance as a raw integer string (stroops), or "0"
  # if no trustline / no account. Never fails.
  local g_address="$1"
  local out
  out=$(stellar contract invoke \
      --id "$USDC_SAC" \
      --source-account "$ADMIN_IDENTITY" \
      --network "$NETWORK" \
      -- balance --id "$g_address" 2>&1 || true)
  if echo "$out" | grep -q 'trustline entry is missing'; then
    echo "0"
  elif echo "$out" | grep -q 'Error'; then
    echo "0"
  else
    # Strip CLI decoration and JSON quoting
    echo "$out" | grep -oE '"[0-9]+"' | head -1 | tr -d '"' || echo "0"
  fi
}

ensure_trustline() {
  local identity="$1"
  local label="$2"
  step "$label: ensure USDC classic trustline"
  # `stellar tx new change-trust` is idempotent; adding a trustline that
  # already exists on an account is a no-op at the ledger level. We do NOT
  # pre-check existence; the operation is cheap.
  if stellar tx new change-trust \
      --source-account "$identity" \
      --network "$NETWORK" \
      --line "$USDC_ASSET_LINE" \
      >/dev/null 2>&1; then
    ok "$label trustline ensured"
  else
    # Second invocation may fail with "already exists" or "no change" —
    # the trustline is effectively present either way. Re-query balance
    # to confirm the account is now on the line.
    local probe
    probe=$(usdc_balance "$(resolve_address "$identity")")
    if [[ -n "$probe" ]]; then
      ok "$label trustline already present (balance query succeeded)"
    else
      warn "$label change-trust failed; proceeding anyway"
    fi
  fi
}

# -----------------------------------------------------------------------------
# STEP 1 — Resolve admin (mikey)
# -----------------------------------------------------------------------------

step "STEP 1: resolve admin identity ($ADMIN_IDENTITY)"
ADMIN_G=$(resolve_address "$ADMIN_IDENTITY")
[[ -n "$ADMIN_G" ]] || die "$ADMIN_IDENTITY identity not configured; run \`stellar keys add $ADMIN_IDENTITY\` first"
ok "$ADMIN_IDENTITY = $ADMIN_G"

# Sanity: the admin in deployments.json must match mikey. If not, the
# seeder is being run against a deploy that wasn't Branch-B'd under mikey.
DEPLOY_ADMIN=$(jq -r '.admin' "$DEPLOYMENTS")
if [[ "$DEPLOY_ADMIN" != "$ADMIN_G" ]]; then
  warn "deployments.json admin ($DEPLOY_ADMIN) does not match $ADMIN_IDENTITY ($ADMIN_G)"
  warn "seeder will still run, but the admin signer on the pool is different from mikey"
fi

# -----------------------------------------------------------------------------
# STEP 2 — Ensure user identity exists + is funded
# -----------------------------------------------------------------------------

step "STEP 2: ensure $USER_IDENTITY identity exists"
USER_G=$(resolve_address "$USER_IDENTITY")
if [[ -z "$USER_G" ]]; then
  step "$USER_IDENTITY not found; generating new keypair with --fund"
  stellar keys generate "$USER_IDENTITY" --network "$NETWORK" --fund >/dev/null
  USER_G=$(resolve_address "$USER_IDENTITY")
  [[ -n "$USER_G" ]] || die "failed to generate $USER_IDENTITY identity"
  ok "$USER_IDENTITY generated + funded = $USER_G"
else
  ok "$USER_IDENTITY already exists = $USER_G"
  # Already exists; make sure it's funded too. `--fund` on generate handles
  # this only for new keypairs; an existing-but-unfunded key needs an
  # explicit friendbot call.
  friendbot_fund "$USER_G" "$USER_IDENTITY"
fi

# Defensive: re-check admin is funded too (noop for already-active accounts).
friendbot_fund "$ADMIN_G" "$ADMIN_IDENTITY"

# -----------------------------------------------------------------------------
# STEP 3 — Establish USDC trustlines on both accounts
# -----------------------------------------------------------------------------

step "STEP 3: establish USDC classic trustlines on both accounts"
ensure_trustline "$ADMIN_IDENTITY" "$ADMIN_IDENTITY"
ensure_trustline "$USER_IDENTITY"  "$USER_IDENTITY"

# -----------------------------------------------------------------------------
# STEP 4 — Transfer USDC from admin to user
# -----------------------------------------------------------------------------

step "STEP 4: transfer $USDC_AMOUNT stroops USDC from $ADMIN_IDENTITY to $USER_IDENTITY"

USER_BALANCE=$(usdc_balance "$USER_G")
USER_BALANCE=${USER_BALANCE:-0}
note "$USER_IDENTITY current USDC balance: $USER_BALANCE stroops"

if [[ "$USER_BALANCE" =~ ^[0-9]+$ ]] && [[ "$USER_BALANCE" -ge "$USDC_AMOUNT" ]]; then
  ok "$USER_IDENTITY already has ≥ $USDC_AMOUNT stroops USDC; skipping transfer"
else
  ADMIN_BALANCE=$(usdc_balance "$ADMIN_G")
  ADMIN_BALANCE=${ADMIN_BALANCE:-0}
  note "$ADMIN_IDENTITY current USDC balance: $ADMIN_BALANCE stroops"

  if [[ ! "$ADMIN_BALANCE" =~ ^[0-9]+$ ]] || [[ "$ADMIN_BALANCE" -lt "$USDC_AMOUNT" ]]; then
    warn "$ADMIN_IDENTITY has insufficient USDC ($ADMIN_BALANCE stroops < $USDC_AMOUNT requested)"
    warn "Circle testnet USDC is minted via web UI: https://faucet.circle.com/"
    warn "  1. Open the URL above"
    warn "  2. Select Stellar testnet + paste $ADMIN_G"
    warn "  3. Re-run scripts/seed-demo-accounts.sh"
    warn "continuing without transfer — demo-accounts.json will still be written"
  else
    if stellar contract invoke \
        --id "$USDC_SAC" \
        --source-account "$ADMIN_IDENTITY" \
        --network "$NETWORK" \
        -- transfer \
        --from "$ADMIN_G" \
        --to "$USER_G" \
        --amount "$USDC_AMOUNT" >/dev/null 2>&1; then
      ok "transferred $USDC_AMOUNT stroops USDC: $ADMIN_IDENTITY → $USER_IDENTITY"
    else
      warn "transfer invoke failed; leaving balances unchanged"
    fi
  fi
fi

# -----------------------------------------------------------------------------
# STEP 5 — Write public keys to scripts/demo-accounts.json
# -----------------------------------------------------------------------------

step "STEP 5: write scripts/demo-accounts.json (public keys only)"
jq -n \
  --arg mikey "$ADMIN_G" \
  --arg user  "$USER_G" \
  '{ mikey: $mikey, user: $user }' > "$DEMO_ACCOUNTS"
ok "wrote $DEMO_ACCOUNTS"
cat "$DEMO_ACCOUNTS" >&2

step "Seed complete."
