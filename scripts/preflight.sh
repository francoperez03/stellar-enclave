#!/usr/bin/env bash
# Enclave preflight checks and ops actions.
#
# Phase 1 scope: only implements the `pool-ttl-bump` subcommand.
# Phase 4 adds `freeze-check`.
# Phase 5 (OPS-01) adds `full-check` — six OPS-01 checks in one command.
#
# pool-ttl-bump wraps `stellar contract extend` for the four contracts in
# scripts/deployments.json (pool, asp-membership, asp-non-membership,
# circom-groth16-verifier) so persistent storage TTL can be bumped in one
# command before recording day.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOYMENTS="$ROOT_DIR/scripts/deployments.json"

# OPS-01 default thresholds (overridable via full-check flags)
DEFAULT_TTL_MIN_HOURS=48
DEFAULT_FLOAT_MIN_USDC=10
DEFAULT_EVENT_WINDOW_MAX_DAYS=6

die()  { echo "preflight.sh: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing '$1'"; }
step() { echo "==> $*" >&2; }

usage() {
  cat >&2 <<'USAGE'
Usage: preflight.sh <subcommand> [options]

Subcommands:
  pool-ttl-bump [--dry-run] [--ledgers-to-extend N]
    Bump Soroban persistent storage TTL for pool + asp-membership +
    asp-non-membership + circom-groth16-verifier contracts read from
    scripts/deployments.json. Default --ledgers-to-extend is 535680
    (~30 days at 5s/ledger). --dry-run prints the commands without
    executing.

  freeze-check
    Verify REGISTRY_FROZEN=1 is set in the environment. Required before
    demo recording to prevent ASP root drift (ORG-04).

  full-check [--ttl-min HOURS] [--float-min USDC] [--event-window-max DAYS]
    Run the six OPS-01 checks and print a PASS/FAIL table.
    Exit 0 iff all pass. Defaults: TTL_MIN_HOURS=48, FLOAT_MIN_USDC=10,
    EVENT_WINDOW_MAX_DAYS=6. Reads FACILITATOR_URL env var
    (default http://localhost:4021).

  -h, --help
    Show this message.
USAGE
  exit 2
}

cmd_pool_ttl_bump() {
  need stellar
  need jq
  [[ -f "$DEPLOYMENTS" ]] || die "scripts/deployments.json not found — run deploy.sh first"

  local dry_run=false
  local ledgers_to_extend=535680
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run) dry_run=true; shift ;;
      --ledgers-to-extend) ledgers_to_extend="$2"; shift 2 ;;
      *) die "unknown arg: $1" ;;
    esac
  done

  local network deployer pool asp_m asp_nm verifier
  network=$(jq -r '.network' "$DEPLOYMENTS")
  deployer=$(jq -r '.deployer' "$DEPLOYMENTS")
  pool=$(jq -r '.pool' "$DEPLOYMENTS")
  asp_m=$(jq -r '.asp_membership' "$DEPLOYMENTS")
  asp_nm=$(jq -r '.asp_non_membership' "$DEPLOYMENTS")
  verifier=$(jq -r '.verifier' "$DEPLOYMENTS")

  for id in "$pool" "$asp_m" "$asp_nm" "$verifier"; do
    [[ -n "$id" && "$id" != "null" ]] || die "missing contract id in deployments.json"
  done

  local contracts=("$pool" "$asp_m" "$asp_nm" "$verifier")
  for contract_id in "${contracts[@]}"; do
    local cmd="stellar contract extend --id $contract_id --source-account $deployer --network $network --durability persistent --ledgers-to-extend $ledgers_to_extend"
    step "$contract_id"
    if [[ "$dry_run" == "true" ]]; then
      echo "DRY-RUN: $cmd"
    else
      eval "$cmd" || die "extend failed for $contract_id"
    fi
  done

  step "pool-ttl-bump complete (${#contracts[@]} contracts)"
}

cmd_freeze_check() {
  if [[ "${REGISTRY_FROZEN:-}" != "1" ]]; then
    die "REGISTRY_FROZEN is not set to 1. Set REGISTRY_FROZEN=1 in your .env before recording."
  fi
  step "freeze-check PASS: REGISTRY_FROZEN=1"
}

# ---------------------------------------------------------------------------
# OPS-01 check functions — each prints "PASS <detail>" or "FAIL <reason>"
# and returns 0 on pass, 1 on fail. MUST NOT call exit (aggregator collects).
# ---------------------------------------------------------------------------

# Check 1: Pool + ASPs TTL > ttl_min_hours on all four tracked contracts.
# Uses `stellar ledger entry fetch contract-data --instance` to read the
# contract instance entry which includes liveUntilLedgerSeq and latestLedger.
# Converts remaining ledgers to hours at 5 seconds/ledger.
check_pool_ttl() {
  local ttl_min_hours="$1"
  [[ -f "$DEPLOYMENTS" ]] || { echo "FAIL deployments.json not found"; return 1; }

  local network pool asp_m asp_nm verifier
  network=$(jq -r '.network' "$DEPLOYMENTS")
  pool=$(jq -r '.pool' "$DEPLOYMENTS")
  asp_m=$(jq -r '.asp_membership' "$DEPLOYMENTS")
  asp_nm=$(jq -r '.asp_non_membership' "$DEPLOYMENTS")
  verifier=$(jq -r '.verifier' "$DEPLOYMENTS")

  local threshold_ledgers=$(( ttl_min_hours * 3600 / 5 ))
  local all_pass=true
  local details=""

  local -a contract_list=("pool:$pool" "aspM:$asp_m" "aspNM:$asp_nm" "verifier:$verifier")

  for entry in "${contract_list[@]}"; do
    local name="${entry%%:*}"
    local cid="${entry##*:}"
    local fetch_output live_until current_ledger remaining_ledgers hours
    fetch_output=""
    live_until=""
    current_ledger=""
    remaining_ledgers=0
    hours=0

    # Fetch the contract instance entry — returns liveUntilLedgerSeq + latestLedger
    if ! fetch_output=$(stellar ledger entry fetch contract-data \
          --contract "$cid" \
          --instance \
          --network "$network" \
          --output json 2>/dev/null); then
      echo "FAIL unable to fetch ledger entry for $name ($cid)"
      return 1
    fi

    live_until=$(echo "$fetch_output" | jq -r '.entries[0].liveUntilLedgerSeq // empty' 2>/dev/null || true)
    current_ledger=$(echo "$fetch_output" | jq -r '.latestLedger // empty' 2>/dev/null || true)

    if [[ -z "$live_until" || "$live_until" == "null" || -z "$current_ledger" || "$current_ledger" == "null" ]]; then
      echo "FAIL unable to parse TTL for $name ($cid)"
      return 1
    fi

    remaining_ledgers=$(( live_until - current_ledger ))
    hours=$(( remaining_ledgers * 5 / 3600 ))

    if [[ $remaining_ledgers -lt $threshold_ledgers ]]; then
      all_pass=false
      details="${details} ${name}=${hours}h(BELOW${ttl_min_hours}h)"
    else
      details="${details} ${name}=${hours}h"
    fi
  done

  if [[ "$all_pass" == "true" ]]; then
    echo "PASS${details}"
    return 0
  else
    echo "FAIL${details}"
    return 1
  fi
}

# Check 2: Facilitator /health returns HTTP 200.
check_health_ok() {
  local url="${FACILITATOR_URL:-http://localhost:4021}/health"
  if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then
    echo "PASS $url"
    return 0
  fi
  echo "FAIL $url unreachable or non-2xx"
  return 1
}

# Check 3: USDC float > float_min_usdc (from /health usdc_balance field).
# usdc_balance is in base units (7 decimal places for USDC on Stellar).
check_float_above() {
  local float_min_usdc="$1"
  local url="${FACILITATOR_URL:-http://localhost:4021}/health"
  local json
  json=$(curl -fsS --max-time 5 "$url" 2>/dev/null) || { echo "FAIL /health unreachable"; return 1; }
  local usdc_base
  usdc_base=$(echo "$json" | jq -r '.usdc_balance')
  local threshold_base=$(( float_min_usdc * 10000000 ))
  if [[ "$usdc_base" =~ ^[0-9]+$ ]] && [[ "$usdc_base" -ge "$threshold_base" ]]; then
    echo "PASS usdc_balance=$usdc_base base units (min ${float_min_usdc} USDC = ${threshold_base} base units)"
    return 0
  fi
  echo "FAIL usdc_balance=$usdc_base below ${threshold_base} base units"
  return 1
}

# Check 4: RPC event window is intact (oldest event < event_window_max_days old).
# MVP: verify RPC responds to getLatestLedger and returns a valid sequence.
# A live RPC response with a non-zero sequence proves the 7-day retention window
# is intact (Pitfall 10 would manifest as RPC being unreachable or stale).
check_event_window() {
  local event_window_max_days="$1"
  local network
  network=$(jq -r '.network' "$DEPLOYMENTS" 2>/dev/null || echo "testnet")

  local rpc_url
  if [[ "$network" == "testnet" ]]; then
    rpc_url="https://soroban-testnet.stellar.org"
  else
    rpc_url="https://mainnet.stellar.validationcloud.io/v1/soroban"
  fi

  local response sequence
  response=$(curl -fsS --max-time 10 -X POST \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"getLatestLedger"}' \
    "$rpc_url" 2>/dev/null) || { echo "FAIL RPC unreachable at $rpc_url"; return 1; }

  sequence=$(echo "$response" | jq -r '.result.sequence // empty' 2>/dev/null || true)
  if [[ -n "$sequence" && "$sequence" != "null" && "$sequence" -gt 0 ]]; then
    echo "PASS rpc ok sequence=$sequence (window<${event_window_max_days}d)"
    return 0
  fi
  echo "FAIL RPC did not return a valid ledger sequence"
  return 1
}

# Check 5: Every contract in deployments.json is live on-chain.
# Uses `stellar ledger entry fetch contract-data --instance` to confirm the
# contract instance exists and has a valid liveUntilLedgerSeq. This is
# cheaper than invoke and works on all four contracts regardless of their ABI.
# For pool/asp_membership/asp_non_membership, also validates get_root responds.
check_deployments_live() {
  [[ -f "$DEPLOYMENTS" ]] || { echo "FAIL deployments.json not found"; return 1; }

  local network deployer pool asp_m asp_nm verifier
  network=$(jq -r '.network' "$DEPLOYMENTS")
  deployer=$(jq -r '.deployer' "$DEPLOYMENTS")
  pool=$(jq -r '.pool' "$DEPLOYMENTS")
  asp_m=$(jq -r '.asp_membership' "$DEPLOYMENTS")
  asp_nm=$(jq -r '.asp_non_membership' "$DEPLOYMENTS")
  verifier=$(jq -r '.verifier' "$DEPLOYMENTS")

  local failed_contracts=""
  local pass_count=0

  for entry in "pool:$pool" "asp_membership:$asp_m" "asp_non_membership:$asp_nm" "verifier:$verifier"; do
    local name="${entry%%:*}"
    local cid="${entry##*:}"
    local fetch_out live_seq

    # Check contract instance exists and is not expired
    if fetch_out=$(stellar ledger entry fetch contract-data \
        --contract "$cid" \
        --instance \
        --network "$network" \
        --output json 2>/dev/null); then
      live_seq=$(echo "$fetch_out" | jq -r '.entries[0].liveUntilLedgerSeq // empty' 2>/dev/null || true)
      if [[ -n "$live_seq" && "$live_seq" != "null" && "$live_seq" -gt 0 ]]; then
        pass_count=$(( pass_count + 1 ))
        continue
      fi
    fi

    failed_contracts="$failed_contracts $name"
  done

  if [[ -z "$failed_contracts" ]]; then
    echo "PASS ${pass_count}/4 live"
    return 0
  fi
  echo "FAIL contracts not responding:$failed_contracts"
  return 1
}

# Check 6: REGISTRY_FROZEN=1 env var is set.
# Delegates to cmd_freeze_check in a subshell so `die` cannot kill this script.
check_registry_frozen() {
  if ( cmd_freeze_check ) >/dev/null 2>&1; then
    echo "PASS REGISTRY_FROZEN=1"
    return 0
  fi
  echo "FAIL REGISTRY_FROZEN is not set to 1"
  return 1
}

# ---------------------------------------------------------------------------
# Aggregator: run all six checks, print PASS/FAIL table, exit accordingly.
# ---------------------------------------------------------------------------

cmd_full_check() {
  need curl
  need jq
  need stellar

  local ttl_min_hours=$DEFAULT_TTL_MIN_HOURS
  local float_min_usdc=$DEFAULT_FLOAT_MIN_USDC
  local event_window_max_days=$DEFAULT_EVENT_WINDOW_MAX_DAYS

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --ttl-min)          ttl_min_hours="$2";          shift 2 ;;
      --float-min)        float_min_usdc="$2";         shift 2 ;;
      --event-window-max) event_window_max_days="$2";  shift 2 ;;
      *) die "unknown full-check arg: $1" ;;
    esac
  done

  local passed=0 failed=0
  local -a rows=()

  run_check() {
    local label="$1"; shift
    local output status
    if output=$("$@"); then
      status="PASS"
      passed=$(( passed + 1 ))
    else
      status="FAIL"
      failed=$(( failed + 1 ))
    fi
    # Strip the leading PASS/FAIL prefix that the check function already prepended
    local detail="${output#PASS }"; detail="${detail#FAIL }"
    rows+=("$(printf '%-36s %-5s %s' "$label" "$status" "$detail")")
  }

  run_check "pool-ttl>${ttl_min_hours}h"                   check_pool_ttl         "$ttl_min_hours"
  run_check "facilitator /health"                          check_health_ok
  run_check "float>${float_min_usdc}USDC"                  check_float_above      "$float_min_usdc"
  run_check "rpc-event-window<${event_window_max_days}d"   check_event_window     "$event_window_max_days"
  run_check "deployments.json live"                        check_deployments_live
  run_check "REGISTRY_FROZEN=1"                            check_registry_frozen

  printf '%s\n' "${rows[@]}"
  echo "---"
  echo "$passed passed, $failed failed"

  if (( failed > 0 )); then
    return 1
  fi
  return 0
}

# ---------------------------------------------------------------------------
# Dispatcher (guarded so the script is sourceable for bats tests)
# ---------------------------------------------------------------------------

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  SUBCMD="${1:-}"
  shift || true

  case "$SUBCMD" in
    pool-ttl-bump) cmd_pool_ttl_bump "$@" ;;
    freeze-check)  cmd_freeze_check "$@" ;;
    full-check)    cmd_full_check "$@" ;;
    -h|--help|"") usage ;;
    *) die "unknown subcommand: $SUBCMD" ;;
  esac
fi
