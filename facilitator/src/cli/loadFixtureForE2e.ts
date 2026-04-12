import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export interface E2eFixture {
  proof: unknown;
  extData: unknown;
  paymentRequirements: { scheme: string; network: string; payTo: string; maxAmountRequired: string; resource: string };
}

/**
 * Loads a real shielded-proof fixture for the testnet e2e test. The fixture
 * must be produced by Phase 3 agent SDK executing its first real withdrawal
 * against live pool state. Phase 0's smoke fixture was built against
 * Env::default() state (UnknownRoot on-chain) and Phase 1 is deposit-only
 * (no withdrawal proofs emitted), so neither can satisfy this loader.
 *
 * Until Phase 3 delivers the first live withdrawal fixture, Task 3 of this
 * plan runs in "deferred" mode — the fixture absence is detected and the
 * live e2e steps are skipped with a DEFERRED marker in the summary.
 *
 * Lookup order:
 *   1. $ENCLAVE_E2E_FIXTURE (explicit path — preferred, set by Phase 3 agent SDK)
 *   2. wallets/circuits/fixtures/e2e-proof.json (Phase 3 default drop path)
 *   3. .planning/phases/00-setup-day-1-de-risking/e2e-proof.json (Phase 0 fallback)
 *   4. Fallback: throw with a helpful instruction.
 */
export function loadE2eFixture(repoRoot: string): E2eFixture {
  const explicit = process.env.ENCLAVE_E2E_FIXTURE;
  const candidates = [
    explicit ? resolve(explicit) : undefined,
    resolve(repoRoot, "wallets/circuits/fixtures/e2e-proof.json"),
    resolve(repoRoot, ".planning/phases/00-setup-day-1-de-risking/e2e-proof.json"),
  ].filter(Boolean) as string[];

  for (const path of candidates) {
    if (existsSync(path)) {
      const parsed = JSON.parse(readFileSync(path, "utf-8"));
      return parsed as E2eFixture;
    }
  }

  throw new Error(
    `No e2e fixture found. Tried:\n${candidates.join("\n")}\n` +
      "This fixture is produced by Phase 3 agent SDK on its first real withdrawal. " +
      "If Phase 3 is already complete, set ENCLAVE_E2E_FIXTURE to the proof file path.",
  );
}
