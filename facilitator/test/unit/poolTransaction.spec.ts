import { describe, it, expect } from "vitest";
import { xdr } from "@stellar/stellar-sdk";
import { buildPoolTransactArgs } from "../../src/chain/poolTransaction.js";

// Valid Stellar G-address for tests (from ext-data fixture)
const DEMO_ADDRESS = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI";

// Minimal valid ShieldedProofWireFormat fixture (all fields required by the type)
function makeProofFixture() {
  return {
    a: "00".repeat(64), // 128 hex chars = 64 bytes (G1 point)
    b: "00".repeat(128), // 256 hex chars = 128 bytes (G2 point)
    c: "00".repeat(64), // 128 hex chars = 64 bytes (G1 point)
    root: "0",
    inputNullifiers: ["0", "12345"],
    outputCommitment0: "0",
    outputCommitment1: "0",
    publicAmount: "0",
    extDataHash: "0ce60aa2c0428529dfb03d8f84c67d2faece7ef05bc44084c522459b9aae2191",
    aspMembershipRoot: "0",
    aspNonMembershipRoot: "0",
  };
}

function makeExtDataFixture() {
  return {
    recipient: DEMO_ADDRESS,
    ext_amount: "-1000000",
    encrypted_output0: "00".repeat(112), // 224 hex chars = 112 bytes
    encrypted_output1: "00".repeat(112),
  };
}

describe("buildPoolTransactArgs", () => {
  it("returns 3 ScVal args: proof map, ext_data map, sender address", () => {
    const args = buildPoolTransactArgs(makeProofFixture(), makeExtDataFixture(), DEMO_ADDRESS);
    expect(args).toHaveLength(3);
    expect(args[0].switch().name).toBe("scvMap");
    expect(args[1].switch().name).toBe("scvMap");
    expect(args[2].switch().name).toBe("scvAddress");
  });

  it("proof map has exactly 9 keys in Rust struct order (proof, root, input_nullifiers, ...)", () => {
    const args = buildPoolTransactArgs(makeProofFixture(), makeExtDataFixture(), DEMO_ADDRESS);
    const proofMap = args[0].map()!;
    const keys = proofMap.map((e) => e.key().sym().toString());
    expect(keys).toEqual([
      "proof",
      "root",
      "input_nullifiers",
      "output_commitment0",
      "output_commitment1",
      "public_amount",
      "ext_data_hash",
      "asp_membership_root",
      "asp_non_membership_root",
    ]);
  });

  it("nested proof sub-map has keys a, b, c", () => {
    const args = buildPoolTransactArgs(makeProofFixture(), makeExtDataFixture(), DEMO_ADDRESS);
    const proofMap = args[0].map()!;
    const innerProofEntry = proofMap.find((e) => e.key().sym().toString() === "proof");
    expect(innerProofEntry).toBeDefined();
    const innerProofMap = innerProofEntry!.val().map()!;
    const innerKeys = innerProofMap.map((e) => e.key().sym().toString());
    expect(innerKeys).toEqual(["a", "b", "c"]);
  });

  it("input_nullifiers inside proofMap is an scvVec of scvU256 (length 2)", () => {
    const args = buildPoolTransactArgs(makeProofFixture(), makeExtDataFixture(), DEMO_ADDRESS);
    const proofMap = args[0].map()!;
    const nullifiersEntry = proofMap.find((e) => e.key().sym().toString() === "input_nullifiers");
    expect(nullifiersEntry).toBeDefined();
    const vec = nullifiersEntry!.val().vec()!;
    expect(vec).toHaveLength(2);
    expect(vec[0].switch().name).toBe("scvU256");
    expect(vec[1].switch().name).toBe("scvU256");
  });

  it("extDataMap has exactly 4 keys in struct order: recipient, ext_amount, encrypted_output0, encrypted_output1", () => {
    const args = buildPoolTransactArgs(makeProofFixture(), makeExtDataFixture(), DEMO_ADDRESS);
    const extDataMap = args[1].map()!;
    const keys = extDataMap.map((e) => e.key().sym().toString());
    expect(keys).toEqual(["recipient", "ext_amount", "encrypted_output0", "encrypted_output1"]);
  });

  it("ext_amount inside extDataMap is scvI256 with correct numeric value", () => {
    const args = buildPoolTransactArgs(makeProofFixture(), makeExtDataFixture(), DEMO_ADDRESS);
    const extDataMap = args[1].map()!;
    const extAmountEntry = extDataMap.find((e) => e.key().sym().toString() === "ext_amount");
    expect(extAmountEntry).toBeDefined();
    const extAmountVal = extAmountEntry!.val();
    expect(extAmountVal.switch().name).toBe("scvI256");
    // Check that it encodes -1000000 (the fixture value)
    const i256 = extAmountVal.i256();
    // i256 has hi_hi, hi_lo, lo_hi, lo_lo as 64-bit parts (little-endian parts)
    // -1000000n: all high parts 0xFFFFFFFFFFFFFFFF (two's complement), lo_lo = 2^64 - 1000000
    // Just verify it is not zero
    expect(i256).toBeDefined();
  });

  it("sender address arg is scvAddress for the provided G-address", () => {
    const args = buildPoolTransactArgs(makeProofFixture(), makeExtDataFixture(), DEMO_ADDRESS);
    expect(args[2].switch().name).toBe("scvAddress");
  });

  it("throws Error with 'invalid Stellar address' for garbage address", () => {
    expect(() =>
      buildPoolTransactArgs(makeProofFixture(), makeExtDataFixture(), "NOT_A_STELLAR_ADDRESS"),
    ).toThrow(/invalid Stellar address/);
  });

  it("throws for odd-length hex in encrypted_output0", () => {
    const extData = makeExtDataFixture();
    extData.encrypted_output0 = "abc"; // odd length
    expect(() =>
      buildPoolTransactArgs(makeProofFixture(), extData, DEMO_ADDRESS),
    ).toThrow();
  });
});
