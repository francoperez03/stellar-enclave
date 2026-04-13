#!/usr/bin/env bash
# check-claim-hygiene.sh — DEMO-06 forbidden-phrase grep across all
# submission-facing surfaces. Plan 06-04 Task 2. Safe to run any time
# — prints a PASS/FAIL table; exit 0 iff all rows PASS.
#
# Current baselines (as of 2026-04-12 pre-submission):
#   README.md                    strict = 0  \baudited\b ≤ 3
#   DORAHACKS-WRITEUP.md         strict = 0  ("per-org on-chain ASPs" tolerated in v2 context)
#   DEMO-SCRIPT.md               strict = 6  (all in ## Checklist Final de Cumplimiento)
#   PITCH.md                     strict = 2  (both in claim-hygiene self-check)
#   DEMO-SCRIPT.md Franco count  = 2         (changelog meta only)
#
# The baselines for DEMO-SCRIPT.md and PITCH.md are self-referential (the
# forbidden phrases appear in a "NEVER say these" checklist). Any increase
# means the phrase escaped into [HABLADO] / narration — that is a drift.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

FAIL=0
row() {
  local label="$1" expect="$2" actual="$3" extra="${4:-}"
  if [[ "$actual" == "$expect" ]] || [[ "$expect" == *"≤"* && $actual -le ${expect#≤} ]]; then
    printf "%-48s PASS  %s\n" "$label" "$extra"
  else
    printf "%-48s FAIL  expected=%s actual=%s %s\n" "$label" "$expect" "$actual" "$extra"
    FAIL=$((FAIL+1))
  fi
}

README_STRICT=$(grep -cE "per-org ASP|per-org anonymity|each org has its own ASP|mainnet ready|security audited" README.md 2>/dev/null) || true
README_AUD=$(grep -cE "\baudited\b" README.md 2>/dev/null) || true

DH_STRICT=999
DH_CTX_OK="n/a"
if [[ -f .planning/hackathon/DORAHACKS-WRITEUP.md ]]; then
  DH_STRICT=$(grep -cE "per-org anonymity|each org has its own ASP|mainnet ready|security audited" .planning/hackathon/DORAHACKS-WRITEUP.md 2>/dev/null) || true
  if grep -q "per-org on-chain ASP" .planning/hackathon/DORAHACKS-WRITEUP.md 2>/dev/null; then
    if grep -B1 -A1 "per-org on-chain ASP" .planning/hackathon/DORAHACKS-WRITEUP.md | grep -qE "not built|v2|infeasible|Approach B|deferred"; then
      DH_CTX_OK="PASS"
    else
      DH_CTX_OK="FAIL"
    fi
  else
    DH_CTX_OK="PASS (no hit)"
  fi
fi

SC_STRICT=$(grep -cE "per-org ASP|per-org anonymity|each org has its own ASP|mainnet ready|security audited" .planning/hackathon/DEMO-SCRIPT.md 2>/dev/null) || true
PI_STRICT=$(grep -cE "per-org ASP|per-org anonymity|each org has its own ASP|mainnet ready|security audited" .planning/hackathon/PITCH.md 2>/dev/null) || true
FR=$(grep -c "Franco" .planning/hackathon/DEMO-SCRIPT.md 2>/dev/null) || true

echo "DEMO-06 claim-hygiene check — $(date -Iseconds)"
echo "-----------------------------------------------------------------"
row "README.md strict forbidden"            "0"  "$README_STRICT"
row "README.md baudited word"              "≤3"  "$README_AUD"  "(NOT-claiming context)"
row "DORAHACKS-WRITEUP.md strict"            "0"  "$DH_STRICT"
printf "%-48s %s\n" "DORAHACKS 'per-org on-chain ASP' context" "$DH_CTX_OK"
row "DEMO-SCRIPT.md forbidden (self-check)"  "6"  "$SC_STRICT"  "(all in ## Checklist Final de Cumplimiento)"
row "PITCH.md forbidden (self-check)"        "2"  "$PI_STRICT"  "(claim-hygiene section)"
row "DEMO-SCRIPT.md Franco count"            "2"  "$FR"          "(changelog meta only)"
echo "-----------------------------------------------------------------"
if [[ "$FAIL" == "0" && "$DH_CTX_OK" != "FAIL" ]]; then
  echo "✓ claim-hygiene CLEAN — safe to publish submission"
  exit 0
else
  echo "✗ claim-hygiene FAILED — fix drifts before publishing"
  exit 1
fi
