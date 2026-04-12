import { describe, it } from '@jest/globals';

describe('Witness construction — Model X (SDK-07)', () => {
  it.todo('two agents from the same org (same orgSpendingPrivKey) produce proofs with identical inPrivateKey fields');
  it.todo('buildWitnessInputs sets inPrivateKey[0] === inPrivateKey[1] === orgSpendingPrivKey for Model X');
  it.todo('buildWitnessInputs sets inAmount[0] = "0" for the null slot');
  it.todo('buildWitnessInputs sets inBlinding[0] from the null note blinding field');
  it.todo('buildWitnessInputs strips _pool08_evidence and inPublicKey before calling compute_witness');
});
