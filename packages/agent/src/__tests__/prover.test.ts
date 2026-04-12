import { describe, it } from '@jest/globals';

describe('Prover wrapper (SDK-02, SDK-03, SDK-04)', () => {
  it.todo('loadProverArtifacts loads from ENCLAVE_PROVING_ARTIFACTS_PATH without network calls');
  it.todo('prove() returns exactly 128-byte compressed Groth16 output');
  it.todo('prove() returns proof with a, b, c fields via uncompressed decomposition');
  it.todo('[live] Node WASM prover generates valid proof for witness-1real-1null fixture');
});
