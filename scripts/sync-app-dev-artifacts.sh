#!/usr/bin/env bash
# Copies WASM + circuit + key artifacts from build outputs into app/ so the
# python dev server (`python3 -m http.server 8080` inside app/) can serve them
# at the paths bridge.js expects. Trunk.toml creates these temporarily during
# esbuild bundling and then deletes them — the dev-time flow needs them to
# persist. Script is idempotent; re-run after rebuilding WASM or circuits.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

declare -a PAIRS=(
  # Browser-served dev artifacts (python http.server / trunk serve from app/)
  "target/wasm-bindgen/release/prover.js|app/js/prover.js"
  "target/wasm-bindgen/release/prover_bg.wasm|app/js/prover_bg.wasm"
  "target/wasm-witness/witness.js|app/js/witness/witness.js"
  "target/wasm-witness/witness_bg.wasm|app/js/witness/witness_bg.wasm"
  "dist/circuits/policy_tx_2_2.wasm|app/circuits/policy_tx_2_2.wasm"
  "dist/circuits/policy_tx_2_2.r1cs|app/circuits/policy_tx_2_2.r1cs"
  "dist/keys/policy_tx_2_2_proving_key.bin|app/keys/policy_tx_2_2_proving_key.bin"

  # Agent-SDK proving artifacts — loadProverArtifacts() expects ALL 5 in a
  # single directory. The Node-target WASM lives under target/wasm-*-nodejs/;
  # circuits+keys live under dist/. We collate into ./proving-artifacts/ so
  # the agent-package run.sh can point ENCLAVE_PROVING_ARTIFACTS_PATH there.
  "target/wasm-prover-nodejs/prover.js|proving-artifacts/prover.js"
  "target/wasm-prover-nodejs/prover_bg.wasm|proving-artifacts/prover_bg.wasm"
  "target/wasm-witness-nodejs/witness.js|proving-artifacts/witness.js"
  "target/wasm-witness-nodejs/witness_bg.wasm|proving-artifacts/witness_bg.wasm"
  "dist/circuits/policy_tx_2_2.wasm|proving-artifacts/policy_tx_2_2.wasm"
  "dist/circuits/policy_tx_2_2.r1cs|proving-artifacts/policy_tx_2_2.r1cs"
  "dist/keys/policy_tx_2_2_proving_key.bin|proving-artifacts/policy_tx_2_2_proving_key.bin"
)

missing=()
for pair in "${PAIRS[@]}"; do
  src="${pair%%|*}"
  if [[ ! -f "$src" ]]; then
    missing+=("$src")
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "sync-app-dev-artifacts: missing source files:" >&2
  for m in "${missing[@]}"; do echo "  - $m" >&2; done
  echo "" >&2
  echo "Rebuild them with:" >&2
  echo "  make wasm-prover wasm-witness   # for target/wasm-*" >&2
  echo "  trunk build                     # for dist/circuits and dist/keys" >&2
  exit 1
fi

for pair in "${PAIRS[@]}"; do
  src="${pair%%|*}"
  dst="${pair##*|}"
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
done

echo "sync-app-dev-artifacts: ${#PAIRS[@]} artifacts synced into app/"
