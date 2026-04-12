import { describe, it, expect } from 'vitest';

// Unit tests use mock prover to avoid WASM dependency in CI.
// The [live] test is guarded behind an env var check.

describe('Prover wrapper (SDK-02, SDK-03, SDK-04)', () => {
  describe('prove() output format (SDK-02)', () => {
    it('returns exactly 128-byte compressed Groth16 proof', async () => {
      // Mock the prover to return a controlled 128-byte result
      const mockProofBytes = new Uint8Array(128).fill(0xab);
      const mockUncompressed = new Uint8Array(256).fill(0xcd);
      const mockPublicInputs = new Uint8Array(352).fill(0xef);
      const mockWitness = new Uint8Array(64).fill(0x01);

      const mockHandle = {
        _prover: {
          prove_bytes: () => mockProofBytes,
          proof_bytes_to_uncompressed: () => mockUncompressed,
          extract_public_inputs: () => mockPublicInputs,
        },
        _witnessCalc: {
          compute_witness: () => mockWitness,
        },
        artifactsPath: '/mock/path',
      };

      const { prove } = await import('../prover.js');
      const result = await prove(mockHandle as never, JSON.stringify({ inAmount: ['0', '13'] }));
      expect(result.proofBytes.length).toBe(128);
    });

    it('decomposes proof into a=64, b=128, c=64 byte components', async () => {
      const mockProofBytes = new Uint8Array(128).fill(0x01);
      const mockUncompressed = new Uint8Array(256);
      mockUncompressed.fill(0xaa, 0, 64);    // a
      mockUncompressed.fill(0xbb, 64, 192);  // b
      mockUncompressed.fill(0xcc, 192, 256); // c
      const mockWitness = new Uint8Array(32).fill(0x00);
      const mockPublicInputs = new Uint8Array(352).fill(0x00);

      const mockHandle = {
        _prover: {
          prove_bytes: () => mockProofBytes,
          proof_bytes_to_uncompressed: () => mockUncompressed,
          extract_public_inputs: () => mockPublicInputs,
        },
        _witnessCalc: { compute_witness: () => mockWitness },
        artifactsPath: '/mock/path',
      };

      const { prove } = await import('../prover.js');
      const result = await prove(mockHandle as never, '{}');
      expect(result.proofComponents.a.length).toBe(64);
      expect(result.proofComponents.b.length).toBe(128);
      expect(result.proofComponents.c.length).toBe(64);
    });

    it('extracts 352-byte public inputs (11 inputs x 32 bytes)', async () => {
      const mockProofBytes = new Uint8Array(128).fill(0x01);
      const mockUncompressed = new Uint8Array(256).fill(0x00);
      const mockPublicInputs = new Uint8Array(352).fill(0xef);
      const mockWitness = new Uint8Array(32).fill(0x00);

      const mockHandle = {
        _prover: {
          prove_bytes: () => mockProofBytes,
          proof_bytes_to_uncompressed: () => mockUncompressed,
          extract_public_inputs: () => mockPublicInputs,
        },
        _witnessCalc: { compute_witness: () => mockWitness },
        artifactsPath: '/mock/path',
      };

      const { prove } = await import('../prover.js');
      const result = await prove(mockHandle as never, '{}');
      expect(result.publicInputBytes.length).toBe(352);
    });
  });

  describe('loadProverArtifacts — local path only (SDK-03)', () => {
    it('uses createRequire (not import()) to load CJS WASM modules', async () => {
      const { readFileSync } = await import('node:fs');
      const { fileURLToPath } = await import('node:url');
      const path = await import('node:path');
      const testDir = path.dirname(fileURLToPath(import.meta.url));
      const source = readFileSync(
        path.resolve(testDir, '..', 'prover.ts'),
        'utf-8',
      );
      expect(source).toContain('createRequire');
      expect(source).not.toMatch(/import\s*\(\s*['"]/); // no dynamic import() of wasm modules
    });

    it('throws if artifact path does not contain prover.js', async () => {
      const { loadProverArtifacts } = await import('../prover.js');
      await expect(loadProverArtifacts('/nonexistent/path')).rejects.toThrow();
    });
  });

  describe('[live] Node WASM prover smoke test (SDK-04)', () => {
    it('generates real proof from witness-1real-1null fixture (skipped unless ENCLAVE_PROVING_ARTIFACTS_PATH set)', async () => {
      const artifactsPath = process.env['ENCLAVE_PROVING_ARTIFACTS_PATH'];
      if (!artifactsPath) {
        console.log('[skip] ENCLAVE_PROVING_ARTIFACTS_PATH not set — skipping live prover test');
        return;
      }

      const { readFile } = await import('node:fs/promises');
      const { loadProverArtifacts, prove } = await import('../prover.js');

      // Load witness fixture (strip _pool08_evidence and inPublicKey before passing)
      const fixtureRaw = await readFile(
        new URL('../../../../../../scripts/bench-fixtures/witness-1real-1null.json', import.meta.url),
        'utf-8',
      );
      const fixture = JSON.parse(fixtureRaw);
      const { _pool08_evidence, inPublicKey, ...circuitInputs } = fixture;

      const handle = await loadProverArtifacts(artifactsPath);
      const result = await prove(handle, JSON.stringify(circuitInputs));

      expect(result.proofBytes.length).toBe(128);
      expect(result.proofComponents.a.length).toBe(64);
      expect(result.proofComponents.b.length).toBe(128);
      expect(result.proofComponents.c.length).toBe(64);
      expect(result.publicInputBytes.length).toBe(352);
    }, 15000); // 15s timeout (Phase 0 benchmark: 2753ms)
  });
});
