import { describe, it, expect } from '@jest/globals';
import { buildWitnessInputs } from '../prover.js';
import type { EnclaveNote } from '../types.js';
import type { BuildWitnessParams, NonMembershipProof } from '../prover.js';

// Minimal EnclaveNote fixtures for testing (10 path elements = TREE_DEPTH)
const DUMMY_PATH_ELEMENTS = Array(10).fill('12345678901234567890');
const DUMMY_ASP_PATH_ELEMENTS = Array(10).fill('98765432109876543210');
const EMPTY_SMT_PROOF: NonMembershipProof = {
  root: '0',
  siblings: Array(32).fill('0'),
  oldKey: '0',
  oldValue: '0',
  isOld0: '1',
  key: '0',
  value: '0',
  fnc: '1',
};

function makeNote(amount: bigint, index: string): EnclaveNote {
  return {
    commitment: `commitment_${index}`,
    nullifier: `nullifier_${index}`,
    amount,
    blinding: `blinding_${index}`,
    pathElements: DUMMY_PATH_ELEMENTS,
    pathIndex: index,
    aspLeaf: `aspleaf_${index}`,
    aspPathElements: DUMMY_ASP_PATH_ELEMENTS,
    aspPathIndex: index,
  };
}

const SHARED_PRIV_KEY = 'aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa7777bbbb8888';
const REAL_NOTE = makeNote(BigInt(1000), '5');
const NULL_NOTE = makeNote(BigInt(0), '0');

const BASE_PARAMS: BuildWitnessParams = {
  orgSpendingPrivKey: SHARED_PRIV_KEY,
  realNote: REAL_NOTE,
  nullNote: NULL_NOTE,
  payAmount: BigInt(100),
  changeAmount: BigInt(900),
  changeBlinding: 'changeblinding123',
  extDataHash: '31415926535897932384626433832795028841971693993751',
  nonMembershipProofs: [EMPTY_SMT_PROOF, EMPTY_SMT_PROOF],
};

describe('Witness construction — Model X (SDK-07)', () => {
  it('sets inPrivateKey[0] === inPrivateKey[1] (Model X invariant: both slots share the org key)', () => {
    const inputs = buildWitnessInputs(BASE_PARAMS);
    // Exact-value assertion is not the invariant — buildWitnessInputs normalizes
    // the key into the BN254 field, which may change representation (hex → decimal,
    // reduction mod p). The invariant is "same key in both slots".
    expect(inputs.inPrivateKey[0]).toBe(inputs.inPrivateKey[1]);
    expect(inputs.inPrivateKey[0]).toBeTruthy();
  });

  it('two agents from the same org (same orgSpendingPrivKey) produce identical inPrivateKey fields', () => {
    // Different agents have different agentAuthKey but SAME orgSpendingPrivKey
    const agent1Inputs = buildWitnessInputs({ ...BASE_PARAMS, orgSpendingPrivKey: SHARED_PRIV_KEY });
    const agent2Inputs = buildWitnessInputs({ ...BASE_PARAMS, orgSpendingPrivKey: SHARED_PRIV_KEY });
    expect(agent1Inputs.inPrivateKey).toEqual(agent2Inputs.inPrivateKey);
  });

  it('sets inAmount[0] = "0" for the null slot', () => {
    const inputs = buildWitnessInputs(BASE_PARAMS);
    expect(inputs.inAmount[0]).toBe('0');
  });

  it('sets inAmount[1] = payAmount.toString() for the real slot', () => {
    const inputs = buildWitnessInputs(BASE_PARAMS);
    expect(inputs.inAmount[1]).toBe('100');
  });

  it('does NOT include _pool08_evidence field (not a circuit input)', () => {
    const inputs = buildWitnessInputs(BASE_PARAMS) as unknown as Record<string, unknown>;
    expect(Object.keys(inputs)).not.toContain('_pool08_evidence');
  });

  it('does NOT include inPublicKey field (circuit derives it from inPrivateKey internally)', () => {
    const inputs = buildWitnessInputs(BASE_PARAMS) as unknown as Record<string, unknown>;
    expect(Object.keys(inputs)).not.toContain('inPublicKey');
  });

  it('uses ASP membership blinding="0" for both slots (ORG-05 deterministic blinding)', () => {
    const inputs = buildWitnessInputs(BASE_PARAMS);
    expect(inputs.membershipProofs[0].blinding).toBe('0');
    expect(inputs.membershipProofs[1].blinding).toBe('0');
  });

  it('sets outPubKey to orgSpendingPrivKey for both output slots (change goes to org)', () => {
    const inputs = buildWitnessInputs(BASE_PARAMS);
    expect(inputs.outPubKey[0]).toBe(SHARED_PRIV_KEY);
    expect(inputs.outPubKey[1]).toBe(SHARED_PRIV_KEY);
  });

  it('sets outAmount[0] = changeAmount, outAmount[1] = "0"', () => {
    const inputs = buildWitnessInputs(BASE_PARAMS);
    expect(inputs.outAmount[0]).toBe('900');
    expect(inputs.outAmount[1]).toBe('0');
  });
});
