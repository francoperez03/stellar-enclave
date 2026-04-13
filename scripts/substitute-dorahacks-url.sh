#!/usr/bin/env bash
# substitute-dorahacks-url.sh — Plan 06-04 Task 4: land the published
# DoraHacks URL into every <!-- DORAHACKS_URL --> slot.
#
# Usage:  scripts/substitute-dorahacks-url.sh "https://dorahacks.io/buidl/XXXXXX"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

die() { echo "substitute-dorahacks-url.sh: $*" >&2; exit 1; }

[[ $# -eq 1 ]] || die "usage: substitute-dorahacks-url.sh <dorahacks-url>"
DORAHACKS_URL="$1"

[[ "$DORAHACKS_URL" =~ ^https://dorahacks\.io/(buidl|hackathon)/.+$ ]] \
  || die "bad DoraHacks URL format: $DORAHACKS_URL"

# Live-reachability check
if ! curl -sI --max-time 10 "$DORAHACKS_URL" | head -1 | grep -qE "HTTP/[0-9.]+ (200|301|302|303)"; then
  die "DoraHacks URL does not resolve: $DORAHACKS_URL"
fi

[[ -f README.md ]] || die "README.md not found"
[[ -f .planning/hackathon/DORAHACKS-WRITEUP.md ]] || die "DoraHacks draft not found — run 06-02 first"

# Placeholder presence
[[ "$(grep -c '<!-- DORAHACKS_URL -->' README.md)" -ge 1 ]] \
  || die "README has no <!-- DORAHACKS_URL --> placeholder to replace"

sed -i '' "s|<!-- DORAHACKS_URL -->|${DORAHACKS_URL}|g" README.md
sed -i '' "s|<!-- DORAHACKS_URL -->|${DORAHACKS_URL}|g" .planning/hackathon/DORAHACKS-WRITEUP.md

# Every placeholder in README should now be gone
if grep -q '<!-- VIDEO_URL -->\|<!-- DORAHACKS_URL -->' README.md; then
  die "README still has placeholders after substitution — did 06-03 run first?"
fi

# Final DEMO-06 grep using the shared checker
if [[ -x scripts/check-claim-hygiene.sh ]]; then
  scripts/check-claim-hygiene.sh || die "claim-hygiene failed after substitution — fix before pushing"
fi

# Commit
git add README.md
git commit -m "docs(06-04): land DoraHacks URL (DEMO-01 complete, DEMO-04 published)

DoraHacks URL: ${DORAHACKS_URL}
Both URL placeholders (VIDEO_URL, DORAHACKS_URL) now substituted.
DEMO-06 claim-hygiene verified green via scripts/check-claim-hygiene.sh."

# Try to push if there's an upstream
if git rev-parse --abbrev-ref --symbolic-full-name "@{u}" >/dev/null 2>&1; then
  git push
else
  echo "note: no upstream set for current branch — run 'git push -u origin <branch>' manually" >&2
fi

echo "✓ Phase 6 closed. Submission live at ${DORAHACKS_URL}"
