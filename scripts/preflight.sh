#!/usr/bin/env bash
# Enclave preflight checks and ops actions.
#
# Phase 1 scope: only implements the `pool-ttl-bump` subcommand.
# Phase 5 (OPS-01/OPS-02) will extend this file with `full-check`, `health`,
# `freeze`, etc. — do not preemptively scaffold those here.
#
# pool-ttl-bump wraps `stellar contract extend` for the four contracts in
# scripts/deployments.json (pool, asp-membership, asp-non-membership,
# circom-groth16-verifier) so persistent storage TTL can be bumped in one
# command before recording day.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOYMENTS="$ROOT_DIR/scripts/deployments.json"

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

SUBCMD="${1:-}"
shift || true

case "$SUBCMD" in
  pool-ttl-bump) cmd_pool_ttl_bump "$@" ;;
  freeze-check)  cmd_freeze_check "$@" ;;
  -h|--help|"") usage ;;
  *) die "unknown subcommand: $SUBCMD" ;;
esac
