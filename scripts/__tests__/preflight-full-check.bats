#!/usr/bin/env bats
# Tests for scripts/preflight.sh full-check subcommand (Plan 05-04).
#
# Strategy: source preflight.sh using the sourceability guard
# (BASH_SOURCE[0] != $0 when sourced) so the dispatcher does NOT run.
# Then override each check_* function with a stub that returns a
# deterministic PASS/FAIL string to exercise cmd_full_check's aggregation
# logic without requiring a live facilitator, testnet RPC, or stellar CLI.

setup() {
  PREFLIGHT="$BATS_TEST_DIRNAME/../preflight.sh"
  # Source the script — the BASH_SOURCE guard prevents the dispatcher from firing
  # shellcheck disable=SC1090
  source "$PREFLIGHT" >/dev/null 2>&1 || true
}

@test "full-check prints 6 rows and a summary line (all stubs pass)" {
  check_pool_ttl()         { echo "PASS pool=100h aspM=100h aspNM=100h verifier=100h"; return 0; }
  check_health_ok()        { echo "PASS http://stub"; return 0; }
  check_float_above()      { echo "PASS usdc_balance=500000000"; return 0; }
  check_event_window()     { echo "PASS rpc ok sequence=1234567"; return 0; }
  check_deployments_live() { echo "PASS 4/4 live"; return 0; }
  check_registry_frozen()  { echo "PASS REGISTRY_FROZEN=1"; return 0; }

  run cmd_full_check
  [ "$status" -eq 0 ]
  [[ "$output" == *"pool-ttl>48h"* ]]
  [[ "$output" == *"facilitator /health"* ]]
  [[ "$output" == *"float>10USDC"* ]]
  [[ "$output" == *"rpc-event-window<6d"* ]]
  [[ "$output" == *"deployments.json live"* ]]
  [[ "$output" == *"REGISTRY_FROZEN=1"* ]]
  [[ "$output" == *"6 passed, 0 failed"* ]]
}

@test "full-check exits non-zero when any check fails" {
  check_pool_ttl()         { echo "PASS pool=100h"; return 0; }
  check_health_ok()        { echo "FAIL unreachable"; return 1; }
  check_float_above()      { echo "PASS usdc_balance=500000000"; return 0; }
  check_event_window()     { echo "PASS rpc ok"; return 0; }
  check_deployments_live() { echo "PASS 4/4 live"; return 0; }
  check_registry_frozen()  { echo "PASS REGISTRY_FROZEN=1"; return 0; }

  run cmd_full_check
  [ "$status" -ne 0 ]
  [[ "$output" == *"5 passed, 1 failed"* ]]
}

@test "--ttl-min overrides threshold in the row label" {
  check_pool_ttl()         { echo "PASS pool=100h"; return 0; }
  check_health_ok()        { echo "PASS http://stub"; return 0; }
  check_float_above()      { echo "PASS usdc_balance=500000000"; return 0; }
  check_event_window()     { echo "PASS rpc ok"; return 0; }
  check_deployments_live() { echo "PASS 4/4 live"; return 0; }
  check_registry_frozen()  { echo "PASS REGISTRY_FROZEN=1"; return 0; }

  run cmd_full_check --ttl-min 72
  [ "$status" -eq 0 ]
  [[ "$output" == *"pool-ttl>72h"* ]]
}

@test "unknown flag is rejected" {
  run cmd_full_check --bogus-flag
  [ "$status" -ne 0 ]
  [[ "$output" == *"unknown full-check arg"* ]]
}
