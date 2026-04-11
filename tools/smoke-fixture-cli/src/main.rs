//! tools/smoke-fixture-cli — standalone Rust binary that reproduces the exact
//! 2-in/2-out proof generation path from
//! e2e-tests/src/tests/e2e_pool_2_in_2_out.rs::test_e2e_transact_with_real_proof
//! and writes the resulting Proof + ExtData as JSON files for
//! scripts/smoke-test.sh to consume.
//!
//! DEVIATION from 00-04-PLAN.md Task 2: the plan proposed importing helpers
//! from `e2e_tests::tests::utils::*`, but `e2e-tests/src/lib.rs` only exposes
//! `mod tests` under `#[cfg(test)]` — those helpers are NOT reachable from a
//! path-dep. Deviation Rule 3 (blocking issue): the helpers are inlined
//! directly into this binary instead. The logic is copied verbatim from
//! e2e-tests/src/tests/utils.rs (the canonical source) and stays line-for-line
//! faithful.
//!
//! Build:  cargo build --manifest-path tools/smoke-fixture-cli/Cargo.toml --release
//! Run:    cargo run   --manifest-path tools/smoke-fixture-cli/Cargo.toml --release -- \
//!           .planning/phases/00-setup-day-1-de-risking/fixtures/smoke-proof.json \
//!           .planning/phases/00-setup-day-1-de-risking/fixtures/smoke-ext-data.json

use anyhow::{Context, Result, anyhow, bail};
use ark_bn254::Bn254;
use ark_groth16::VerifyingKey;
use circom_groth16_verifier::Groth16Proof;
use circuits::test::utils::{
    circom_tester::{CircomResult, SignalKey, load_keys, prove_and_verify_with_keys},
    general::{load_artifacts, poseidon2_hash2, scalar_to_bigint},
    keypair::derive_public_key,
    merkle_tree::{merkle_proof, merkle_root},
    sparse_merkle_tree::prepare_smt_proof_with_overrides,
    transaction::{commitment, prepopulated_leaves},
    transaction_case::{InputNote, OutputNote, TxCase, prepare_transaction_witness},
};
use num_bigint::{BigInt, BigUint};
use pool::{ExtData, Proof, hash_ext_data};
use serde_json::json;
use soroban_sdk::{
    Address, Bytes, BytesN, Env, I256, U256, Vec as SorobanVec,
    crypto::bn254::{Bn254G1Affine as G1Affine, Bn254G2Affine as G2Affine},
    testutils::Address as _,
};
use soroban_utils::{
    g1_bytes_from_ark, g2_bytes_from_ark,
    utils::vk_bytes_from_ark,
};
use zkhash::{
    ark_ff::{BigInteger, PrimeField, Zero},
    fields::bn256::FpBN256 as Scalar,
};

// ============================================================================
// Inlined helpers from e2e-tests/src/tests/utils.rs (verbatim copies)
// ============================================================================
// The upstream helpers are gated behind `#[cfg(test)]` in the e2e-tests crate
// (`e2e-tests/src/lib.rs` only declares `#[cfg(test)] mod tests`), so a
// path-dep cannot reach them. Inlining keeps the logic identical to the
// canonical e2e test while letting this binary build as a standalone crate.
// If the upstream helpers ever gain a non-test-gated export, this block can
// be replaced by a direct re-import.

/// Number of levels in the pool's commitment Merkle tree.
const LEVELS: usize = 10;
/// Number of membership proofs required per input.
const N_MEM_PROOFS: usize = 1;
/// Number of non-membership proofs required per input.
const N_NON_PROOFS: usize = 1;

/// Path to the committed proving key for the policy_tx_2_2 circuit.
/// Resolved relative to this crate's Cargo.toml, which lives at
/// `tools/smoke-fixture-cli/` — so two `parent()` calls reach the workspace
/// root where `scripts/testdata/` resides.
fn proving_key_path() -> std::path::PathBuf {
    let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .parent()
        .expect("tools/smoke-fixture-cli parent dir")
        .parent()
        .expect("workspace root")
        .join("scripts/testdata/policy_tx_2_2_proving_key.bin")
}

/// Merkle tree data for membership proofs (inlined from e2e-tests::tests::utils).
struct MembershipTreeProof {
    leaves: [Scalar; 1 << LEVELS],
    index: usize,
    blinding: Scalar,
}

/// Non-membership input (inlined from e2e-tests::tests::utils).
struct NonMembership {
    key_non_inclusion: BigInt,
}

/// Convert a BN256 scalar to a Soroban U256 (inlined from e2e-tests::tests::utils).
fn scalar_to_u256(env: &Env, s: Scalar) -> U256 {
    let bytes = s.into_bigint().to_bytes_be();
    let mut buf = [0u8; 32];
    // BN256 scalars fit in 32 bytes; left-pad if serialization came out shorter.
    let offset = 32usize.saturating_sub(bytes.len());
    buf[offset..].copy_from_slice(&bytes);
    U256::from_be_bytes(env, &Bytes::from_array(env, &buf))
}

/// Convert a 32-byte BytesN to a BigInt (inlined from e2e-tests::tests::utils).
fn bytes32_to_bigint(bytes: &BytesN<32>) -> BigInt {
    let mut buf = [0u8; 32];
    bytes.copy_into_slice(&mut buf);
    BigInt::from_bytes_be(num_bigint::Sign::Plus, &buf)
}

/// Build membership trees for all inputs (inlined from e2e-tests::tests::utils).
fn build_membership_trees<F>(case: &TxCase, seed_fn: F) -> Vec<MembershipTreeProof>
where
    F: Fn(usize) -> u64,
{
    let n_inputs = case.inputs.len();
    let mut membership_trees = Vec::with_capacity(n_inputs * N_MEM_PROOFS);

    for j in 0..N_MEM_PROOFS {
        let seed_j = seed_fn(j);
        let base_mem_leaves_j = prepopulated_leaves(LEVELS, seed_j, &[], 24);

        for input in &case.inputs {
            membership_trees.push(MembershipTreeProof {
                leaves: base_mem_leaves_j
                    .clone()
                    .try_into()
                    .map_err(|_| "membership tree leaf count mismatch")
                    .expect("membership tree build"),
                index: input.leaf_index,
                blinding: Scalar::zero(),
            });
        }
    }
    membership_trees
}

/// Generate sparse-merkle-tree overrides from public keys
/// (inlined from e2e-tests::tests::utils).
fn non_membership_overrides_from_pubs(pubs: &[Scalar]) -> Vec<(BigInt, BigInt)> {
    pubs.iter()
        .enumerate()
        .map(|(i, pk)| {
            let idx = (i as u64)
                .checked_add(1)
                .expect("override index u64 overflow");
            let override_idx = idx
                .checked_mul(100_000)
                .and_then(|v| v.checked_add(idx))
                .expect("override index arithmetic overflow");
            let override_key = Scalar::from(override_idx);
            let leaf = poseidon2_hash2(*pk, Scalar::zero(), Some(Scalar::from(1u64)));
            (scalar_to_bigint(override_key), scalar_to_bigint(leaf))
        })
        .collect()
}

/// Generate a Groth16 proof for the transaction (inlined + adapted from
/// e2e-tests::tests::utils::generate_proof — same logic, same witness
/// construction order).
#[allow(clippy::too_many_arguments)]
fn generate_proof(
    case: &TxCase,
    leaves: Vec<Scalar>,
    public_amount: Scalar,
    membership_trees: &[MembershipTreeProof],
    non_membership: &[NonMembership],
    ext_data_hash: Option<BigInt>,
) -> Result<CircomResult> {
    let (wasm, r1cs) = load_artifacts("policy_tx_2_2")
        .context("load policy_tx_2_2 artifacts (circuits build.rs output)")?;

    let n_inputs = case.inputs.len();
    let witness = prepare_transaction_witness(case, leaves, LEVELS)
        .context("prepare_transaction_witness")?;
    let mut inputs = circuits::test::utils::transaction_case::build_base_inputs(
        case,
        &witness,
        public_amount,
    );
    let pubs = &witness.public_keys;

    if let Some(hash) = ext_data_hash {
        inputs.set("extDataHash", hash);
    }

    let mut mp_leaf: Vec<Vec<BigInt>> = vec![Vec::new(); n_inputs];
    let mut mp_blinding: Vec<Vec<BigInt>> = vec![Vec::new(); n_inputs];
    let mut mp_path_indices: Vec<Vec<BigInt>> = vec![Vec::new(); n_inputs];
    let mut mp_path_elements: Vec<Vec<Vec<BigInt>>> = vec![Vec::new(); n_inputs];
    let mut membership_roots: Vec<BigInt> = Vec::new();

    for j in 0..N_MEM_PROOFS {
        let base_idx = j
            .checked_mul(n_inputs)
            .ok_or_else(|| anyhow!("base index overflow"))?;
        let mut frozen_leaves = membership_trees[base_idx].leaves;

        for (k, &pk_scalar) in pubs.iter().enumerate() {
            let index = k
                .checked_mul(N_MEM_PROOFS)
                .and_then(|v| v.checked_add(j))
                .ok_or_else(|| anyhow!("membership tree index overflow"))?;
            let tree = &membership_trees[index];
            let leaf = poseidon2_hash2(pk_scalar, tree.blinding, Some(Scalar::from(1u64)));
            frozen_leaves[tree.index] = leaf;
        }

        let root_scalar = merkle_root(frozen_leaves.to_vec());

        for i in 0..n_inputs {
            let idx = i
                .checked_mul(N_MEM_PROOFS)
                .and_then(|v| v.checked_add(j))
                .ok_or_else(|| anyhow!("membership tree index overflow"))?;
            let t = &membership_trees[idx];
            let pk_scalar = pubs[i];
            let leaf_scalar = poseidon2_hash2(pk_scalar, t.blinding, Some(Scalar::from(1u64)));

            let (siblings, path_idx_u64, _depth) = merkle_proof(&frozen_leaves, t.index);

            mp_leaf[i].push(scalar_to_bigint(leaf_scalar));
            mp_blinding[i].push(scalar_to_bigint(t.blinding));
            mp_path_indices[i].push(scalar_to_bigint(Scalar::from(path_idx_u64)));
            mp_path_elements[i].push(siblings.into_iter().map(scalar_to_bigint).collect());

            membership_roots.push(scalar_to_bigint(root_scalar));
        }
    }

    let mut nmp_key: Vec<Vec<BigInt>> = vec![Vec::new(); n_inputs];
    let mut nmp_old_key: Vec<Vec<BigInt>> = vec![Vec::new(); n_inputs];
    let mut nmp_old_value: Vec<Vec<BigInt>> = vec![Vec::new(); n_inputs];
    let mut nmp_is_old0: Vec<Vec<BigInt>> = vec![Vec::new(); n_inputs];
    let mut nmp_siblings: Vec<Vec<Vec<BigInt>>> = vec![Vec::new(); n_inputs];
    let mut non_membership_roots: Vec<BigInt> = Vec::new();

    for _ in 0..N_NON_PROOFS {
        for i in 0..n_inputs {
            let overrides = non_membership_overrides_from_pubs(pubs);
            let proof = prepare_smt_proof_with_overrides(
                &non_membership[i].key_non_inclusion,
                &overrides,
                LEVELS,
            );

            nmp_key[i].push(scalar_to_bigint(pubs[i]));
            if proof.is_old0 {
                nmp_old_key[i].push(BigInt::from(0u32));
                nmp_old_value[i].push(BigInt::from(0u32));
                nmp_is_old0[i].push(BigInt::from(1u32));
            } else {
                nmp_old_key[i].push(proof.not_found_key.clone());
                nmp_old_value[i].push(proof.not_found_value.clone());
                nmp_is_old0[i].push(BigInt::from(0u32));
            }
            nmp_siblings[i].push(proof.siblings.clone());
            non_membership_roots.push(proof.root.clone());
        }
    }

    for i in 0..n_inputs {
        for j in 0..N_MEM_PROOFS {
            let key = |field: &str| {
                SignalKey::new("membershipProofs")
                    .idx(i)
                    .idx(j)
                    .field(field)
            };
            inputs.set_key(&key("leaf"), mp_leaf[i][j].clone());
            inputs.set_key(&key("blinding"), mp_blinding[i][j].clone());
            inputs.set_key(&key("pathIndices"), mp_path_indices[i][j].clone());
            inputs.set_key(&key("pathElements"), mp_path_elements[i][j].clone());
        }
    }
    inputs.set("membershipRoots", membership_roots);

    for i in 0..n_inputs {
        for j in 0..N_NON_PROOFS {
            let key = |field: &str| {
                SignalKey::new("nonMembershipProofs")
                    .idx(i)
                    .idx(j)
                    .field(field)
            };
            inputs.set_key(&key("key"), nmp_key[i][j].clone());
            inputs.set_key(&key("oldKey"), nmp_old_key[i][j].clone());
            inputs.set_key(&key("oldValue"), nmp_old_value[i][j].clone());
            inputs.set_key(&key("isOld0"), nmp_is_old0[i][j].clone());
            inputs.set_key(&key("siblings"), nmp_siblings[i][j].clone());
        }
    }
    inputs.set("nonMembershipRoots", non_membership_roots);

    let keys = load_keys(proving_key_path())
        .context("load_keys(scripts/testdata/policy_tx_2_2_proving_key.bin)")?;
    prove_and_verify_with_keys(&wasm, &r1cs, &inputs, &keys)
        .context("prove_and_verify_with_keys")
}

/// Wrap an arkworks Groth16 proof into the Soroban `Groth16Proof` struct
/// (inlined from e2e-tests::tests::utils::wrap_groth16_proof).
fn wrap_groth16_proof(env: &Env, result: CircomResult) -> Groth16Proof {
    let a_bytes = g1_bytes_from_ark(result.proof.a);
    let b_bytes = g2_bytes_from_ark(result.proof.b);
    let c_bytes = g1_bytes_from_ark(result.proof.c);
    Groth16Proof {
        a: G1Affine::from_array(env, &a_bytes),
        b: G2Affine::from_array(env, &b_bytes),
        c: G1Affine::from_array(env, &c_bytes),
    }
}

// ============================================================================
// Serialization helpers for the JSON fixture output
// ============================================================================

/// Convert a Soroban `U256` to a decimal string. The stellar CLI's implicit
/// `transact`/`verify` invocation accepts u256 arguments as decimal strings
/// (e.g. `"root": "17705385695058847813..."`), NOT hex blobs — that's what the
/// contract's auto-generated JSON schema specifies.
fn u256_to_dec(v: &U256) -> String {
    let bytes = v.to_be_bytes();
    let len = bytes.len() as u32;
    let mut buf = vec![0u8; len as usize];
    for i in 0..len {
        buf[i as usize] = bytes.get(i).expect("U256 byte");
    }
    BigUint::from_bytes_be(&buf).to_str_radix(10)
}

/// Convert a Soroban `BytesN<32>` to a lowercase hex string (no 0x prefix).
/// Matches the `32_hex_bytes` shape the CLI's `transact` invocation expects
/// for `ext_data_hash`.
fn bytesn32_to_hex_plain(b: &BytesN<32>) -> String {
    let raw = b.to_array();
    hex::encode(raw)
}

/// Extract the raw `a/b/c` hex blobs from a wrapped `Groth16Proof`. The
/// stellar CLI expects 64 hex bytes (= 128 hex chars) for `a` and `c`
/// (uncompressed G1 points: x||y, 32 bytes each) and 128 hex bytes (= 256 hex
/// chars) for `b` (uncompressed G2 point in Soroban's c1||c0 ordering).
fn groth16_proof_to_hex_parts(proof: &Groth16Proof) -> (String, String, String) {
    let a_bytes: [u8; 64] = proof.a.to_array();
    let b_bytes: [u8; 128] = proof.b.to_array();
    let c_bytes: [u8; 64] = proof.c.to_array();
    (hex::encode(a_bytes), hex::encode(b_bytes), hex::encode(c_bytes))
}

/// Encode a Groth16 verification key as a CLI-shaped JSON object matching the
/// `VerificationKeyBytes` Soroban struct (alpha=BytesN<64>, beta/gamma/delta=
/// BytesN<128>, ic=Vec<BytesN<64>>). The verifier contract DOES NOT accept the
/// vk as a `verify()` argument — it loads it from storage at construction
/// time — so this object is informational. It exists so smoke-test.sh and
/// downstream phases can diff the fixture's vk against the live verifier's
/// configured vk if a mismatch is suspected.
fn vk_to_json_value(env: &Env, vk: &VerifyingKey<Bn254>) -> serde_json::Value {
    let vk_bytes = vk_bytes_from_ark(env, vk);
    let alpha_hex = hex::encode(vk_bytes.alpha.to_array());
    let beta_hex = hex::encode(vk_bytes.beta.to_array());
    let gamma_hex = hex::encode(vk_bytes.gamma.to_array());
    let delta_hex = hex::encode(vk_bytes.delta.to_array());
    let ic_hex: Vec<String> = vk_bytes
        .ic
        .iter()
        .map(|p| hex::encode(p.to_array()))
        .collect();
    json!({
        "alpha": alpha_hex,
        "beta": beta_hex,
        "gamma": gamma_hex,
        "delta": delta_hex,
        "ic": ic_hex
    })
}

// ============================================================================
// Main
// ============================================================================

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        bail!(
            "usage: smoke-fixture-cli <out-proof-json> <out-ext-data-json>\n\
             example:\n\
               smoke-fixture-cli \\\n\
                 .planning/phases/00-setup-day-1-de-risking/fixtures/smoke-proof.json \\\n\
                 .planning/phases/00-setup-day-1-de-risking/fixtures/smoke-ext-data.json"
        );
    }
    let out_proof_path = &args[1];
    let out_ext_data_path = &args[2];

    // 1. Build a Soroban mock env for the test helpers. The smoke-test runs
    //    against a REAL testnet env via the stellar CLI, but the proof bytes
    //    are environment-agnostic at proof-build time, so this mock is fine.
    let env = Env::default();
    env.mock_all_auths();

    // 2. Reproduce the e2e test's TxCase verbatim. Constants 101/102, 201/211,
    //    501/502, 601/602, and amount=13 match upstream exactly. Both inputs
    //    use DISTINCT priv_keys — this is the empirical answer to POOL-08
    //    (hypothesis H4: caller-managed distinct keys per slot, BOTH inserted
    //    into asp-membership).
    let case = TxCase::new(
        vec![
            InputNote {
                leaf_index: 0,
                priv_key: Scalar::from(101u64),
                blinding: Scalar::from(201u64),
                amount: Scalar::from(0u64), // dummy
            },
            InputNote {
                leaf_index: 1,
                priv_key: Scalar::from(102u64),
                blinding: Scalar::from(211u64),
                amount: Scalar::from(13u64), // real
            },
        ],
        vec![
            OutputNote {
                pub_key: Scalar::from(501u64),
                blinding: Scalar::from(601u64),
                amount: Scalar::from(13u64), // real
            },
            OutputNote {
                pub_key: Scalar::from(502u64),
                blinding: Scalar::from(602u64),
                amount: Scalar::from(0u64), // dummy
            },
        ],
    );

    // 3. Prepare merkle tree leaves (Pool state at proof-build time). The
    //    `zero_u256` tail pads the last two slots with the circuit's known
    //    zero-leaf constant so the root-hash logic doesn't revert due to a
    //    full tree. This matches e2e_pool_2_in_2_out.rs verbatim.
    let mut leaves = prepopulated_leaves(
        LEVELS,
        0xDEAD_BEEFu64,
        &[case.inputs[0].leaf_index, case.inputs[1].leaf_index],
        24,
    );
    let zero = U256::from_be_bytes(
        &env,
        &Bytes::from_array(
            &env,
            &[
                37, 48, 34, 136, 219, 153, 53, 3, 68, 151, 65, 131, 206, 49, 13, 99, 181, 58, 187,
                158, 240, 248, 87, 87, 83, 238, 211, 110, 1, 24, 249, 206,
            ],
        ),
    );
    let len = leaves.len();
    // u256_to_scalar inverse: copy 32-byte BE into a Scalar via num-bigint.
    let zero_bytes: soroban_sdk::Bytes = zero.to_be_bytes();
    let mut zero_buf = [0u8; 32];
    zero_bytes.copy_into_slice(&mut zero_buf);
    let zero_scalar = Scalar::from(BigUint::from_bytes_be(&zero_buf));
    leaves[len - 2] = zero_scalar;
    leaves[len - 1] = zero_scalar;

    // 4. Build membership and non-membership trees.
    let membership_trees =
        build_membership_trees(&case, |j| 0xFEED_FACEu64 ^ ((j as u64) << 40));
    let keys = vec![
        NonMembership {
            key_non_inclusion: scalar_to_bigint(derive_public_key(case.inputs[0].priv_key)),
        },
        NonMembership {
            key_non_inclusion: scalar_to_bigint(derive_public_key(case.inputs[1].priv_key)),
        },
    ];

    // 5. Build ExtData and its keccak-based hash. The recipient is a mock
    //    address generated from the Soroban test env; smoke-test.sh will
    //    replace or accept it at invoke time depending on CLI requirements.
    let temp_recipient = Address::generate(&env);
    let ext_data = ExtData {
        recipient: temp_recipient.clone(),
        ext_amount: I256::from_i32(&env, 0),
        encrypted_output0: Bytes::new(&env),
        encrypted_output1: Bytes::new(&env),
    };
    let ext_data_hash_bytes = hash_ext_data(&env, &ext_data);
    let ext_data_hash_bigint = bytes32_to_bigint(&ext_data_hash_bytes);

    // 6. Compute the witness (used by the circuit and needed for
    //    input_nullifiers later).
    let witness = prepare_transaction_witness(&case, leaves.clone(), LEVELS)
        .map_err(|e| anyhow!("prepare_transaction_witness: {e}"))?;

    // 7. Generate the Groth16 proof itself.
    eprintln!("smoke-fixture-cli: generating Groth16 proof (this may take 60-120s)...");
    let result = generate_proof(
        &case,
        leaves.clone(),
        Scalar::from(0u64), // public_amount
        &membership_trees,
        &keys,
        Some(ext_data_hash_bigint),
    )?;
    if !result.verified {
        bail!("off-chain Groth16 verification returned verified=false");
    }
    eprintln!("smoke-fixture-cli: off-chain Groth16 verification PASSED");

    // 8. Compute roots and commitments for the Soroban Proof struct.
    let circuit_root = scalar_to_u256(&env, witness.root);

    // For a LIVE testnet pool we cannot query the ASP roots at proof-build
    // time. We capture the fixture's expected ASP roots so smoke-test.sh can
    // diff them against the live pool's get_asp_membership_root /
    // get_asp_non_membership_root and surface the mismatch if present.
    //
    // ASP roots derive deterministically from the helper chain: membership
    // root = merkle_root over the mutated frozen_leaves; non-membership root
    // = output of prepare_smt_proof_with_overrides.
    let mut frozen_leaves = membership_trees[0].leaves;
    for (k, &pk_scalar) in witness.public_keys.iter().enumerate() {
        let index = k * N_MEM_PROOFS;
        let t = &membership_trees[index];
        let leaf = poseidon2_hash2(pk_scalar, t.blinding, Some(Scalar::from(1u64)));
        frozen_leaves[t.index] = leaf;
    }
    let membership_root_scalar = merkle_root(frozen_leaves.to_vec());
    let asp_membership_root = scalar_to_u256(&env, membership_root_scalar);

    // Non-membership root: derived from the sparse-merkle proof for the
    // first input's non-inclusion key, re-run with the same overrides the
    // prover used. Both inputs share the same root because
    // non_membership_overrides_from_pubs is a pure function of the witness
    // public_keys.
    let overrides = non_membership_overrides_from_pubs(&witness.public_keys);
    let smt_proof = prepare_smt_proof_with_overrides(
        &keys[0].key_non_inclusion,
        &overrides,
        LEVELS,
    );
    let nm_root_biguint = smt_proof
        .root
        .to_biguint()
        .ok_or_else(|| anyhow!("non-membership root is negative"))?;
    let nm_bytes = nm_root_biguint.to_bytes_be();
    let mut nm_buf = [0u8; 32];
    let offset = 32usize.saturating_sub(nm_bytes.len());
    nm_buf[offset..].copy_from_slice(&nm_bytes);
    let asp_non_membership_root =
        U256::from_be_bytes(&env, &Bytes::from_array(&env, &nm_buf));

    let mut input_nullifiers: SorobanVec<U256> = SorobanVec::new(&env);
    for nul in &witness.nullifiers {
        input_nullifiers.push_back(scalar_to_u256(&env, *nul));
    }

    let output_commitment0 = scalar_to_u256(
        &env,
        commitment(
            case.outputs[0].amount,
            case.outputs[0].pub_key,
            case.outputs[0].blinding,
        ),
    );
    let output_commitment1 = scalar_to_u256(
        &env,
        commitment(
            case.outputs[1].amount,
            case.outputs[1].pub_key,
            case.outputs[1].blinding,
        ),
    );

    // 9. Build the complete Soroban `Proof` struct, then immediately decompose
    //    it into the CLI-shaped JSON fields the stellar CLI expects. The
    //    Stellar CLI's auto-generated invocation schema for `pool::transact`
    //    accepts arguments as JSON literals (not XDR base64): `--proof '{...}'`,
    //    `--ext_data '{...}'`. u256 fields go in as DECIMAL strings, BytesN<32>
    //    and Bytes go in as plain hex (no 0x prefix), the inner Groth16Proof
    //    `proof` field is a nested object `{a: <128hex>, b: <256hex>, c: <128hex>}`.
    //
    //    DEVIATION from 00-04-PLAN.md (Rule 3): the plan assumed `--proof-xdr`
    //    / `--ext-data-xdr` flags. Those don't exist on the auto-generated CLI;
    //    JSON literals are the actual interface. We capture all the field
    //    values in local bindings before constructing `Proof` because
    //    `pool::Proof` does NOT implement `Clone`.
    let vk_clone = result.vk.clone();
    let public_amount = U256::from_u32(&env, 0);
    let input_nullifier_count = input_nullifiers.len();
    let nullifier_dec_strings: Vec<String> =
        input_nullifiers.iter().map(|n| u256_to_dec(&n)).collect();
    let groth16_proof = wrap_groth16_proof(&env, result);
    let (proof_a_hex, proof_b_hex, proof_c_hex) = groth16_proof_to_hex_parts(&groth16_proof);

    // Build the Proof struct mainly so the field-by-field decomposition stays
    // checked against the upstream type — we never serialize it whole.
    let _proof = Proof {
        proof: groth16_proof,
        root: circuit_root.clone(),
        input_nullifiers,
        output_commitment0: output_commitment0.clone(),
        output_commitment1: output_commitment1.clone(),
        public_amount: public_amount.clone(),
        ext_data_hash: ext_data_hash_bytes.clone(),
        asp_membership_root: asp_membership_root.clone(),
        asp_non_membership_root: asp_non_membership_root.clone(),
    };

    // 10. Build CLI-shaped JSON.
    //
    //     `proof_json` is the literal `--proof '{...}'` argument to
    //     `stellar contract invoke ... -- transact ...`. `ext_data_json` is the
    //     literal `--ext_data '{...}'`. `verify_proof_json` is the smaller
    //     `--proof '{a,b,c}'` shape the verifier contract's `verify` method
    //     accepts in isolation, and `public_inputs` is the matching
    //     `--public_inputs '[...]'` argument. `vk_hex` lets smoke-test.sh
    //     re-deploy or reuse the fixture's exact verifier instance.
    //
    //     Public input ordering matches `pool::verify_proof`:
    //       [root, public_amount, ext_data_hash, input_nullifiers..,
    //        output_commitment0, output_commitment1,
    //        asp_membership_root, asp_non_membership_root]
    let mut public_inputs: Vec<String> = Vec::new();
    public_inputs.push(u256_to_dec(&circuit_root));
    public_inputs.push(u256_to_dec(&public_amount));
    // ext_data_hash is a 32-byte BytesN; the verifier expects it as a u256 in
    // BE form interpreted as a field element.
    public_inputs.push({
        let raw = ext_data_hash_bytes.to_array();
        BigUint::from_bytes_be(&raw).to_str_radix(10)
    });
    for n in &nullifier_dec_strings {
        public_inputs.push(n.clone());
    }
    public_inputs.push(u256_to_dec(&output_commitment0));
    public_inputs.push(u256_to_dec(&output_commitment1));
    public_inputs.push(u256_to_dec(&asp_membership_root));
    public_inputs.push(u256_to_dec(&asp_non_membership_root));

    let recipient_strkey = temp_recipient.to_string().to_string();

    let proof_json = json!({
        "schema_version": 2,
        "proof_json": {
            "root": u256_to_dec(&circuit_root),
            "public_amount": u256_to_dec(&public_amount),
            "ext_data_hash": bytesn32_to_hex_plain(&ext_data_hash_bytes),
            "input_nullifiers": nullifier_dec_strings.clone(),
            "output_commitment0": u256_to_dec(&output_commitment0),
            "output_commitment1": u256_to_dec(&output_commitment1),
            "asp_membership_root": u256_to_dec(&asp_membership_root),
            "asp_non_membership_root": u256_to_dec(&asp_non_membership_root),
            "proof": {
                "a": proof_a_hex,
                "b": proof_b_hex,
                "c": proof_c_hex
            }
        },
        "verify_proof_json": {
            "a": proof_a_hex,
            "b": proof_b_hex,
            "c": proof_c_hex
        },
        "public_inputs": public_inputs,
        "vk_json": vk_to_json_value(&env, &vk_clone),
        "input_nullifier_count": input_nullifier_count,
        "pool_08_evidence": {
            "input_0_priv_key": "101",
            "input_1_priv_key": "102",
            "input_0_role": "dummy",
            "input_1_role": "real",
            "both_pubkeys_inserted_into_asp_membership": true,
            "hypothesis": "H4 - caller-managed distinct keys per slot, BOTH inserted",
            "evidence_source": "e2e-tests/src/tests/e2e_pool_2_in_2_out.rs test_e2e_transact_with_real_proof (verbatim reproduction)"
        }
    });

    let ext_data_json = json!({
        "schema_version": 2,
        "ext_data_json": {
            "ext_amount": "0",
            "recipient": recipient_strkey,
            "encrypted_output0": "",
            "encrypted_output1": ""
        },
        "recipient_note": "Mock address generated under Env::default(); smoke-test.sh MUST substitute the live admin address before invoking transact, because the proof binds ext_data by hash. The fixture's recipient is informational only.",
        "ext_amount": "0"
    });

    std::fs::write(out_proof_path, serde_json::to_vec_pretty(&proof_json)?)?;
    std::fs::write(out_ext_data_path, serde_json::to_vec_pretty(&ext_data_json)?)?;

    eprintln!(
        "smoke-fixture-cli: PROOF FIXTURE WRITTEN -> {}",
        out_proof_path
    );
    eprintln!(
        "smoke-fixture-cli: EXT-DATA FIXTURE WRITTEN -> {}",
        out_ext_data_path
    );
    Ok(())
}
