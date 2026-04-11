#!/usr/bin/env bash
# Deploy all Stellar private transaction contracts and optionally run constructors.
# Usage: deploy.sh <network> [options]

set -euo pipefail

# Helpers

die() { echo "deploy.sh: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing '$1'"; }
step() { echo "==> $*" >&2; }

usage() {
  cat >&2 <<'USAGE'
Usage: deploy.sh <network> [OPTIONS]

Deploys and runs constructors for the ASP membership, ASP non-membership,
Circom Groth16 verifier, and Pool contracts.

Arguments:
  network               Network name from Stellar CLI config (e.g. testnet, futurenet)

Options:
  --deployer NAME       Stellar identity or secret key used to deploy (required)
  --admin ADDRESS       Admin address (G... or C...). Defaults to deployer address
  --token ADDRESS       Token contract address for the pool (defaults to native XLM)
  --asp-levels N        Merkle tree levels for asp-membership (required)
  --pool-levels N       Merkle tree levels for pool (required)
  --max-deposit U256    Maximum deposit amount (required)
  --vk-json JSON        VerificationKeyBytes JSON for circom verifier constructor
  --vk-file PATH        JSON file containing VerificationKeyBytes
  --skip-init           Deploy only, do not call constructors
  --yes                 Skip confirmation for mainnet
  -h, --help            Show this help

Examples:
  scripts/deploy.sh futurenet \
    --deployer alice \
    --token CB... \
    --asp-levels 8 \
    --pool-levels 8 \
    --max-deposit 1000000000 \
    --vk-file ./vk.json

Notes:
  - VerificationKeyBytes must match the contract type:
    {"alpha":"...","beta":"...","gamma":"...","delta":"...","ic":["..."]}
  - Use --vk-json to pass the JSON inline or --vk-file to read it from disk.
  - snarkjs-style vk.json files are converted automatically.
  - If --token is omitted, defaults to the Soroban native XLM contract for the selected network.
  - Deployment output is written to scripts/deployments.json.
USAGE
  exit 2
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WASM_DIR="$ROOT_DIR/target/stellar"

NETWORK="${1:-}"
shift || true

DEPLOYER=""
ADMIN=""
TOKEN=""
ASP_LEVELS=""
POOL_LEVELS=""
MAX_DEPOSIT=""
VK_JSON=""
VK_FILE=""
SKIP_INIT=false
YES=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --deployer) DEPLOYER="$2"; shift 2 ;;
    --admin) ADMIN="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    --asp-levels) ASP_LEVELS="$2"; shift 2 ;;
    --pool-levels) POOL_LEVELS="$2"; shift 2 ;;
    --max-deposit) MAX_DEPOSIT="$2"; shift 2 ;;
    --vk-json) VK_JSON="$2"; shift 2 ;;
    --vk-file) VK_FILE="$2"; shift 2 ;;
    --skip-init) SKIP_INIT=true; shift ;;
    --yes) YES=true; shift ;;
    -h|--help) usage ;;
    *) die "unknown option: $1" ;;
  esac
done

[[ -n "$NETWORK" ]] || usage
need stellar

[[ -n "$DEPLOYER" ]] || die "--deployer is required"
# If no token is provided, default to the Soroban native asset contract for XLM on this network.
if [[ -z "$TOKEN" ]]; then
  TOKEN="$(stellar contract id asset --asset native --network "$NETWORK")"
fi
[[ -n "$ASP_LEVELS" ]] || die "--asp-levels is required"
[[ -n "$POOL_LEVELS" ]] || die "--pool-levels is required"
[[ -n "$MAX_DEPOSIT" ]] || die "--max-deposit is required"

if [[ -n "$VK_JSON" && -n "$VK_FILE" ]]; then
  die "use only one of --vk-json or --vk-file"
fi

if [[ "$SKIP_INIT" != "true" ]]; then
  if [[ -n "$VK_FILE" ]]; then
    [[ -f "$VK_FILE" ]] || die "vk file not found: $VK_FILE"
    VK_JSON="$(tr -d '\n' < "$VK_FILE")"
  fi
  [[ -n "$VK_JSON" ]] || die "verification key required (use --vk-json or --vk-file)"
  if [[ "$VK_JSON" == *"vk_alpha_1"* ]]; then
    need python3
    VK_JSON="$(python3 -c 'import json,sys
data = json.load(sys.stdin)
def to_hex32(v):
    n = int(v)
    return n.to_bytes(32, "big").hex()
def g1_bytes(pt):
    return to_hex32(pt[0]) + to_hex32(pt[1])
def g2_bytes(pt):
    # snarkjs format uses [imag, real] for Fq2 components.
    x_im, x_re = pt[0]
    y_im, y_re = pt[1]
    return to_hex32(x_im) + to_hex32(x_re) + to_hex32(y_im) + to_hex32(y_re)
out = {
    "alpha": g1_bytes(data["vk_alpha_1"]),
    "beta": g2_bytes(data["vk_beta_2"]),
    "gamma": g2_bytes(data["vk_gamma_2"]),
    "delta": g2_bytes(data["vk_delta_2"]),
    "ic": [g1_bytes(p) for p in data["IC"]],
}
print(json.dumps(out, separators=(",", ":")))' <<<"$VK_JSON")"
  fi
fi

if [[ "$NETWORK" == "mainnet" && "$YES" != "true" ]]; then
  die "mainnet requires --yes"
fi

resolve_address() {
  local input="$1"
  if [[ "$input" =~ ^[GC][A-Z0-9]{55}$ ]]; then
    echo "$input"
    return
  fi
  if addr="$(stellar keys address "$input" 2>/dev/null)"; then
    echo "$addr"
    return
  fi
  echo "$input"
}

DEPLOYER_ADDR="$(resolve_address "$DEPLOYER")"
if [[ -z "$ADMIN" ]]; then
  ADMIN_ADDR="$DEPLOYER_ADDR"
else
  ADMIN_ADDR="$(resolve_address "$ADMIN")"
fi

step "build contracts"
mkdir -p "$WASM_DIR"
for pkg in asp-membership asp-non-membership circom-groth16-verifier pool; do
  stellar contract build --manifest-path "$ROOT_DIR/Cargo.toml" --out-dir "$WASM_DIR" --optimize \
    --package "$pkg" >/dev/null
done

ASP_MEMBERSHIP_WASM="$WASM_DIR/asp_membership.wasm"
ASP_NON_MEMBERSHIP_WASM="$WASM_DIR/asp_non_membership.wasm"
VERIFIER_WASM="$WASM_DIR/circom_groth16_verifier.wasm"
POOL_WASM="$WASM_DIR/pool.wasm"

[[ -f "$ASP_MEMBERSHIP_WASM" ]] || die "missing wasm: $ASP_MEMBERSHIP_WASM"
[[ -f "$ASP_NON_MEMBERSHIP_WASM" ]] || die "missing wasm: $ASP_NON_MEMBERSHIP_WASM"
[[ -f "$VERIFIER_WASM" ]] || die "missing wasm: $VERIFIER_WASM"
[[ -f "$POOL_WASM" ]] || die "missing wasm: $POOL_WASM"

deploy_contract() {
  local name="$1"
  local wasm="$2"
  shift 2
  local output
  if [[ $# -gt 0 ]]; then
    output="$(stellar contract deploy --wasm "$wasm" --source-account "$DEPLOYER" --network "$NETWORK" -- "$@" 2>&1)"
  else
    output="$(stellar contract deploy --wasm "$wasm" --source-account "$DEPLOYER" --network "$NETWORK" 2>&1)"
  fi
  local id
  id="$(grep -Eo 'C[A-Z0-9]{55}' <<<"$output" | head -1 || true)"
  [[ -n "$id" ]] || { echo "$output" >&2; die "failed to parse contract id for $name"; }
  echo "$id"
}

step "deploy asp-membership"
if [[ "$SKIP_INIT" != "true" ]]; then
  ASP_MEMBERSHIP_ID="$(deploy_contract asp-membership "$ASP_MEMBERSHIP_WASM" --admin "$ADMIN_ADDR" --levels "$ASP_LEVELS")"
else
  ASP_MEMBERSHIP_ID="$(deploy_contract asp-membership "$ASP_MEMBERSHIP_WASM")"
fi

step "deploy asp-non-membership"
if [[ "$SKIP_INIT" != "true" ]]; then
  ASP_NON_MEMBERSHIP_ID="$(deploy_contract asp-non-membership "$ASP_NON_MEMBERSHIP_WASM" --admin "$ADMIN_ADDR")"
else
  ASP_NON_MEMBERSHIP_ID="$(deploy_contract asp-non-membership "$ASP_NON_MEMBERSHIP_WASM")"
fi

step "deploy circom-groth16-verifier"
if [[ "$SKIP_INIT" != "true" ]]; then
  VERIFIER_ID="$(deploy_contract circom-groth16-verifier "$VERIFIER_WASM" --vk "$VK_JSON")"
else
  VERIFIER_ID="$(deploy_contract circom-groth16-verifier "$VERIFIER_WASM")"
fi

step "deploy pool"
if [[ "$SKIP_INIT" != "true" ]]; then
  POOL_ID="$(deploy_contract pool "$POOL_WASM" \
    --admin "$ADMIN_ADDR" --token "$TOKEN" --verifier "$VERIFIER_ID" \
    --asp-membership "$ASP_MEMBERSHIP_ID" --asp-non-membership "$ASP_NON_MEMBERSHIP_ID" \
    --maximum-deposit-amount "$MAX_DEPOSIT" --levels "$POOL_LEVELS")"
else
  POOL_ID="$(deploy_contract pool "$POOL_WASM")"
fi

# ---------------------------------------------------------------------------
# POOL-06: flip asp-membership AdminInsertOnly to false
#
# Phase 1 plan 01-01 requirement. The asp-membership constructor defaults
# AdminInsertOnly=true (see contracts/asp-membership/src/lib.rs line 93), so
# only the admin can call insert_leaf. The browser-first Enclave UI needs to
# call insert_leaf permissionlessly (the per-org admin will have already
# signed an off-chain policy receipt), so we must flip this flag once at
# deploy time.
#
# Skipped when --skip-init is set (no constructor ran, so AdminInsertOnly is
# not initialized either).
# ---------------------------------------------------------------------------
POOL_ASP_ADMIN_INSERT_ONLY="unknown"
if [[ "$SKIP_INIT" != "true" ]]; then
  step "Setting asp-membership admin_insert_only=false (POOL-06)"
  #
  # Post-condition verification note:
  #
  # The plan (01-01 task 1 step 2) originally wanted a `get_admin_insert_only`
  # getter call to re-read the flag after flipping it. No such public fn
  # exists on asp-membership — the only reader is inside `insert_leaf`
  # (contracts/asp-membership/src/lib.rs line 195). The plan's fallback was
  # `stellar contract read --key AdminInsertOnly --durability persistent`,
  # but the stellar CLI 25.x --key flag only accepts symbol-style keys;
  # `DataKey::AdminInsertOnly` is a `#[contracttype] enum` variant whose
  # on-chain key is a serialized `Vec<Val>` (ScVec), NOT a symbol. The CLI
  # returns "no matching contract data entries" for the symbol probe even
  # though the entry exists. Running `stellar contract read --durability
  # persistent --id <ASP>` with no --key dumps all entries but uses CSV-ish
  # text output that is brittle to grep across CLI versions.
  #
  # Verification strategy instead: rely on the invoke's exit code. The
  # `set_admin_insert_only(admin_only)` function has exactly two branches:
  #   1. admin.require_auth() fails         -> HostError (non-zero exit)
  #   2. store.set(AdminInsertOnly, flag)   -> unconditional
  # So a successful invoke IS a proof of the post-condition.
  #
  # We record POOL_ASP_ADMIN_INSERT_ONLY="false" on invoke success and trust
  # the contract body. Phase 1 plan 01-03 will additionally exercise the
  # permissionless `insert_leaf` path from the browser; that call succeeding
  # from a non-admin source is the empirical confirmation that this flag
  # really is false on-chain.
  if stellar contract invoke \
      --id "$ASP_MEMBERSHIP_ID" \
      --source-account "$DEPLOYER" \
      --network "$NETWORK" \
      -- set_admin_insert_only --admin_only false >/dev/null; then
    POOL_ASP_ADMIN_INSERT_ONLY="false"
  else
    die "POOL-06 failed: set_admin_insert_only invoke returned non-zero on $ASP_MEMBERSHIP_ID"
  fi
fi

# ---------------------------------------------------------------------------
# POOL-07: capture the empty asp-non-membership SMT root
#
# contracts/asp-non-membership/src/lib.rs line 111 initializes Root to
# U256::from_u32(0). The stellar CLI returns this as the literal string "0"
# (not a 64-char hex). We capture it verbatim into deployments.json so the
# Enclave UI (Phase 1 plan 01-03) can use it as the "no blocklist" default
# when building the initial deposit proof.
# ---------------------------------------------------------------------------
ASP_NON_MEMBERSHIP_EMPTY_ROOT="unknown"
if [[ "$SKIP_INIT" != "true" ]]; then
  step "Recording asp_non_membership empty SMT root (POOL-07)"
  ASP_NON_MEMBERSHIP_EMPTY_ROOT="$(stellar contract invoke \
      --id "$ASP_NON_MEMBERSHIP_ID" \
      --source-account "$DEPLOYER" \
      --network "$NETWORK" \
      -- get_root 2>/dev/null | tr -d '"' | tr -d '\n' || echo "0")"
  # Empty SMT root is literally "0" per asp-non-membership::__constructor.
  # Preserve whatever the CLI returns (stripped of JSON string quotes).
  if [[ -z "$ASP_NON_MEMBERSHIP_EMPTY_ROOT" ]]; then
    ASP_NON_MEMBERSHIP_EMPTY_ROOT="0"
  fi
fi

cat >&2 <<EOF

  ┌─────────────────────────────────────────────────────────────────┐
  │                    ✅ DEPLOYMENT SUCCESSFUL                      │
  └─────────────────────────────────────────────────────────────────┘

Deployment complete
  Network:                     $NETWORK
  Deployer:                    $DEPLOYER_ADDR
  Admin:                       $ADMIN_ADDR
  ASP membership:              $ASP_MEMBERSHIP_ID
  ASP non-membership:          $ASP_NON_MEMBERSHIP_ID
  Verifier:                    $VERIFIER_ID
  Pool:                        $POOL_ID
  USDC SAC:                    $TOKEN
  pool_asp_admin_insert_only:  $POOL_ASP_ADMIN_INSERT_ONLY
  asp_non_membership_empty_root: $ASP_NON_MEMBERSHIP_EMPTY_ROOT
  Constructed:                 $([[ "$SKIP_INIT" == "true" ]] && echo "no" || echo "yes")
EOF

# Write deployment summary to a file for easy reuse.
#
# Schema (Phase 1 plan 01-01):
#   network, deployer, admin                 — provenance
#   asp_membership, asp_non_membership,
#   verifier, pool                           — four live contract IDs
#   usdc_token_sac                           — --token pass-through (or native XLM)
#   pool_asp_admin_insert_only               — POOL-06 post-flip state (false)
#   asp_non_membership_empty_root            — POOL-07 captured empty SMT root ("0")
#   initialized                              — constructors ran
need jq
if [[ "$SKIP_INIT" == "true" ]]; then
  INIT_FLAG=false
  # With --skip-init the new fields are not populated; emit placeholders.
  POOL_ASP_ADMIN_INSERT_ONLY_JSON='null'
  jq -n \
    --arg network "$NETWORK" \
    --arg deployer "$DEPLOYER_ADDR" \
    --arg admin "$ADMIN_ADDR" \
    --arg asp_membership "$ASP_MEMBERSHIP_ID" \
    --arg asp_non_membership "$ASP_NON_MEMBERSHIP_ID" \
    --arg verifier "$VERIFIER_ID" \
    --arg pool "$POOL_ID" \
    --arg usdc "$TOKEN" \
    --argjson initialized "$INIT_FLAG" \
    '{
      network: $network,
      deployer: $deployer,
      admin: $admin,
      asp_membership: $asp_membership,
      asp_non_membership: $asp_non_membership,
      verifier: $verifier,
      pool: $pool,
      usdc_token_sac: $usdc,
      pool_asp_admin_insert_only: null,
      asp_non_membership_empty_root: null,
      initialized: $initialized
    }' > "$SCRIPT_DIR/deployments.json"
else
  jq -n \
    --arg network "$NETWORK" \
    --arg deployer "$DEPLOYER_ADDR" \
    --arg admin "$ADMIN_ADDR" \
    --arg asp_membership "$ASP_MEMBERSHIP_ID" \
    --arg asp_non_membership "$ASP_NON_MEMBERSHIP_ID" \
    --arg verifier "$VERIFIER_ID" \
    --arg pool "$POOL_ID" \
    --arg usdc "$TOKEN" \
    --arg empty_root "$ASP_NON_MEMBERSHIP_EMPTY_ROOT" \
    --argjson admin_insert_only false \
    '{
      network: $network,
      deployer: $deployer,
      admin: $admin,
      asp_membership: $asp_membership,
      asp_non_membership: $asp_non_membership,
      verifier: $verifier,
      pool: $pool,
      usdc_token_sac: $usdc,
      pool_asp_admin_insert_only: $admin_insert_only,
      asp_non_membership_empty_root: $empty_root,
      initialized: true
    }' > "$SCRIPT_DIR/deployments.json"
fi

cat "$SCRIPT_DIR/deployments.json"
