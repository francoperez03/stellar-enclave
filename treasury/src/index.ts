// @enclave/treasury — Phase 1 target. Org bootstrap CLI: generates admin keypair,
// derives shared orgSpendingPubKey, inserts Poseidon2(orgSpendingPubKey, 0) into
// asp-membership, writes off-chain registry row (ORG-01..05).

import type { OrgId, OrgSpendingPubKey } from "@enclave/core";

export const PHASE_0_STUB = true;

// Phase 1 target — real CLI (commander / clipanion / native) lands after ORG-01..05.
export async function bootstrapOrg(_orgId: OrgId): Promise<{
  orgSpendingPubKey: OrgSpendingPubKey;
  aspMembershipTxId: string;
}> {
  throw new Error("@enclave/treasury: Phase 1 target, not yet implemented");
}
