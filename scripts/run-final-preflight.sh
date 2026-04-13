#!/usr/bin/env bash
# run-final-preflight.sh — Plan 06-04 Task 1: capture the submission-day
# preflight full-check into an archival log with git + env provenance.
#
# Run this AT SUBMISSION TIME (2026-04-16 PM → 2026-04-17 evening):
#   1. Make sure the facilitator is running on $FACILITATOR_URL (default http://localhost:4021)
#   2. Make sure scripts/preflight.sh pool-ttl-bump was run today
#   3. Then: REGISTRY_FROZEN=1 ./scripts/run-final-preflight.sh
#
# The script exports REGISTRY_FROZEN=1 if not already set, so the common case is:
#   ./scripts/run-final-preflight.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

LOG=.planning/phases/06-demo-recording-submission/06-04-FINAL-PREFLIGHT.log
mkdir -p "$(dirname "$LOG")"

# ORG-04 / OPS-01 check 6: REGISTRY_FROZEN must be 1
: "${REGISTRY_FROZEN:=1}"
export REGISTRY_FROZEN

{
  echo "# Final preflight for hackathon submission"
  echo "date: $(date -Iseconds)"
  echo "branch: $(git rev-parse --abbrev-ref HEAD)"
  echo "head: $(git rev-parse HEAD)"
  echo "deployments_sha: $(git rev-parse HEAD:scripts/deployments.json 2>/dev/null || echo NA)"
  echo "REGISTRY_FROZEN=${REGISTRY_FROZEN}"
  echo "FACILITATOR_URL=${FACILITATOR_URL:-http://localhost:4021}"
  echo "---"
  set +e
  ./scripts/preflight.sh full-check 2>&1
  rc=$?
  set -e
  echo "---"
  echo "exit_code: ${rc}"
} > "$LOG"

# Summary on stderr for human eyes
tail -n 12 "$LOG" >&2
echo "" >&2
echo "→ Log archived at: $LOG" >&2

if grep -q "^exit_code: 0$" "$LOG"; then
  echo "✓ Preflight PASSED. You are clear to submit on DoraHacks." >&2
  exit 0
else
  echo "✗ Preflight FAILED. Read the log, fix the failing check, re-run." >&2
  echo "  Common fixes:" >&2
  echo "    facilitator /health  → start facilitator (npm -w @enclave/facilitator start)" >&2
  echo "    float>10USDC         → seed USDC float per FACIL-07; seed XLM gas per FACIL-08" >&2
  echo "    REGISTRY_FROZEN=1    → this script already exports it; shell env overrode?" >&2
  echo "    pool-ttl             → ./scripts/preflight.sh pool-ttl-bump" >&2
  exit 1
fi
