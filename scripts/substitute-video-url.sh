#!/usr/bin/env bash
# substitute-video-url.sh — Land the YouTube URL into every <!-- VIDEO_URL --> slot.
#
# Plan 06-03 Task 2: after uploading demo/final/day-6-final.mp4 unlisted to
# YouTube, run this with the URL as the only argument. It replaces placeholders
# in README + DoraHacks draft, updates the meta file, re-runs DEMO-06 grep,
# and commits.
#
# Usage:   scripts/substitute-video-url.sh "https://www.youtube.com/watch?v=XXXXXXXXXXX"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

die() { echo "substitute-video-url.sh: $*" >&2; exit 1; }

[[ $# -eq 1 ]] || die "usage: substitute-video-url.sh <youtube-url>"
YOUTUBE_URL="$1"

[[ "$YOUTUBE_URL" =~ ^https://(www\.)?(youtube\.com/watch\?v=|youtu\.be/)[A-Za-z0-9_-]+ ]] \
  || die "bad YouTube URL format: $YOUTUBE_URL"

[[ -f README.md ]] || die "README.md not found"
[[ -f .planning/hackathon/DORAHACKS-WRITEUP.md ]] || die "DoraHacks draft not found — run 06-02 first"

# Count placeholders before substitution
readme_before="$(grep -c '<!-- VIDEO_URL -->' README.md || true)"
dh_before="$(grep -c '<!-- VIDEO_URL -->' .planning/hackathon/DORAHACKS-WRITEUP.md || true)"

[[ "$readme_before" -ge 1 ]] || die "README has no <!-- VIDEO_URL --> placeholder to replace"
[[ "$dh_before" -ge 1 ]] || die "DoraHacks draft has no <!-- VIDEO_URL --> placeholder to replace"

# macOS BSD sed requires the '' argument after -i
sed -i '' "s|<!-- VIDEO_URL -->|${YOUTUBE_URL}|g" README.md
sed -i '' "s|<!-- VIDEO_URL -->|${YOUTUBE_URL}|g" .planning/hackathon/DORAHACKS-WRITEUP.md

# Update meta file if present
META=demo/final/day-6-final-meta.txt
if [[ -f "$META" ]]; then
  sed -i '' "s|^youtube_url: .*|youtube_url: ${YOUTUBE_URL}|" "$META"
fi

# Verify placeholders are gone and URLs landed
[[ "$(grep -c '<!-- VIDEO_URL -->' README.md)" == "0" ]] \
  || die "README still has VIDEO_URL placeholder after substitution"
[[ "$(grep -c '<!-- VIDEO_URL -->' .planning/hackathon/DORAHACKS-WRITEUP.md)" == "0" ]] \
  || die "DoraHacks draft still has VIDEO_URL placeholder after substitution"
grep -qE "youtube\.com/watch|youtu\.be/" README.md \
  || die "README has no YouTube URL after substitution"

# DEMO-06 re-grep
readme_forbidden="$(grep -cE 'per-org ASP|per-org anonymity|each org has its own ASP|mainnet ready|security audited' README.md || true)"
dh_forbidden="$(grep -cE 'per-org anonymity|each org has its own ASP|mainnet ready|security audited' .planning/hackathon/DORAHACKS-WRITEUP.md || true)"

[[ "$readme_forbidden" == "0" ]] || die "DEMO-06 grep failed: $readme_forbidden forbidden-phrase hits in README.md"
[[ "$dh_forbidden" == "0" ]] || die "DEMO-06 grep failed: $dh_forbidden forbidden-phrase hits in DoraHacks draft"

# DoraHacks URL placeholder must still be present (Plan 06-04 fills that)
[[ "$(grep -c '<!-- DORAHACKS_URL -->' README.md)" == "1" ]] \
  || die "README <!-- DORAHACKS_URL --> placeholder state wrong (expected 1, Plan 06-04 will substitute)"

# Commit (README is tracked; DoraHacks draft + meta are in gitignored .planning/demo, so --allow-empty is used for audit trail)
TO_STAGE=(README.md)
[[ -f "$META" ]] && {
  # demo/ is not gitignored — stage the meta if it changed
  if ! git diff --quiet "$META"; then TO_STAGE+=("$META"); fi
}

git add "${TO_STAGE[@]}"
git commit -m "feat(06-03): land YouTube URL in README + DoraHacks draft (DEMO-01 / DEMO-02)

YouTube unlisted URL: ${YOUTUBE_URL}
<!-- VIDEO_URL --> placeholder replaced in README + DoraHacks draft.
<!-- DORAHACKS_URL --> still pending for Plan 06-04.
DEMO-06 strict grep clean across both files."

echo "✓ YouTube URL landed. README placeholder VIDEO_URL → ${YOUTUBE_URL}"
echo "  Remaining placeholder: <!-- DORAHACKS_URL --> in README + DoraHacks draft."
echo "  Next: publish DoraHacks writeup, then run scripts/substitute-dorahacks-url.sh <url>"
