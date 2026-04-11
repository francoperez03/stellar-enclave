// @enclave/core — Phase 0 stub. Shared types + constants.
// Phase 1 target: treasury CLI consumes OrgId + OrgSpendingPubKey.
// Phase 2 target: facilitator consumes ShieldedProof + PaymentRequest.
// Phase 3 target: @enclave/agent consumes all of the above.

export type {
  OrgId,
  OrgSpendingPubKey,
  AgentAuthKey,
  ShieldedProof,
  PaymentRequest,
} from "./types.js";

export { TREE_DEPTH, SMT_DEPTH, BN256_MOD } from "./constants.js";
