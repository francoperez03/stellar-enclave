#!/usr/bin/env bash
# check-upstream.sh — Guard against license drift from upstream.
#
# Usage: scripts/check-upstream.sh
#
# Runs `git diff upstream/main -- LICENSE NOTICE circuits/LICENSE` and exits
# non-zero if any of those files drift from upstream/main.
#
# Referenced by SETUP-01 + SETUP-03 (Phase 0) and by scripts/preflight.sh (Phase 5).

set -euo pipefail

if ! git remote get-url upstream >/dev/null 2>&1; then
  echo "check-upstream.sh: ERROR — 'upstream' remote is not configured" >&2
  echo "  fix: git remote add upstream https://github.com/NethermindEth/stellar-private-payments.git" >&2
  exit 2
fi

if ! git rev-parse --verify upstream/main >/dev/null 2>&1; then
  echo "check-upstream.sh: fetching upstream/main..." >&2
  git fetch upstream main
fi

DRIFT="$(git diff upstream/main -- LICENSE NOTICE circuits/LICENSE)"
if [[ -n "$DRIFT" ]]; then
  echo "check-upstream.sh: FAIL — license drift detected against upstream/main" >&2
  echo "$DRIFT" >&2
  exit 1
fi

echo "check-upstream.sh: PASS — LICENSE, NOTICE, circuits/LICENSE match upstream/main"
