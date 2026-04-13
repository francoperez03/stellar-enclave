#!/usr/bin/env bash
# Render the README Testnet Contracts section from scripts/deployments.json.
# Single source of truth — rerun after any redeploy to regenerate the table.
#
# Usage: scripts/render-contracts-table.sh
# Output: markdown block on stdout (redirect into README during Plan 06-01).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOYMENTS="$ROOT_DIR/scripts/deployments.json"

die()  { echo "render-contracts-table.sh: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing '$1'"; }

need jq
[[ -f "$DEPLOYMENTS" ]] || die "scripts/deployments.json not found — run deploy.sh first"

pool="$(jq -r '.pool' "$DEPLOYMENTS")"
asp_m="$(jq -r '.asp_membership' "$DEPLOYMENTS")"
asp_nm="$(jq -r '.asp_non_membership' "$DEPLOYMENTS")"
verifier="$(jq -r '.verifier' "$DEPLOYMENTS")"
deployer="$(jq -r '.admin' "$DEPLOYMENTS")"

for v in "$pool" "$asp_m" "$asp_nm" "$verifier" "$deployer"; do
  [[ -n "$v" && "$v" != "null" ]] || die "deployments.json missing required field"
done

expert="https://stellar.expert/explorer/testnet"

cat <<EOF
## Testnet Contracts

All four Soroban contracts are live on Stellar testnet. Source of truth: [\`scripts/deployments.json\`](scripts/deployments.json). Rendered by \`scripts/render-contracts-table.sh\`.

| Contract | Address | Stellar Expert |
|----------|---------|----------------|
| Pool (\`pool\`) | \`${pool}\` | [View](${expert}/contract/${pool}) |
| ASP Membership (\`asp-membership\`) | \`${asp_m}\` | [View](${expert}/contract/${asp_m}) |
| ASP Non-Membership (\`asp-non-membership\`) | \`${asp_nm}\` | [View](${expert}/contract/${asp_nm}) |
| Groth16 Verifier (\`circom-groth16-verifier\`) | \`${verifier}\` | [View](${expert}/contract/${verifier}) |

**Admin / deployer:** [\`${deployer}\`](${expert}/account/${deployer}) · TTL extended daily via \`scripts/preflight.sh pool-ttl-bump\` during the 2026-04-10 → 2026-04-17 hackathon window (see \`.planning/phases/05-*\` for the routine).

**Facilitator health:** \`GET \$FACILITATOR_URL/health\` returns the live USDC float + gas float + last-seen pool root. Defaults to \`http://localhost:3001/health\` per Phase 2/5 convention. Public URL (if hosted) lands here before submission.
EOF
