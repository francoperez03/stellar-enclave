// Phase 0 stub — shared numeric constants mirroring upstream.
// TODO-phase-1: replace TODO placeholders with the exact values from
// upstream app/js/state/utils.js and contracts/soroban-utils/src/constants.rs.

/**
 * Pool merkle tree depth. Must match the upstream pool contract's
 * `levels` constructor argument and the circuit's pool merkle depth.
 * Upstream default: 10 (see scripts/deploy.sh --pool-levels example).
 */
export const TREE_DEPTH: number = 10;

/**
 * Sparse merkle tree depth for the asp-non-membership contract.
 * Upstream circuit smtverifier uses depth matching the BN254 field.
 * TODO-phase-1: confirm exact depth used by upstream deploy.
 */
export const SMT_DEPTH: number = 32;

/**
 * BN254 scalar field modulus (r), used for all field-element arithmetic.
 * This is the canonical value — copied verbatim from the arkworks bn254 crate.
 */
export const BN256_MOD: bigint =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
