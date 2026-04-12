import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES = path.join(__dirname, "..", "fixtures");

export interface FixtureShieldedProof {
  a: Uint8Array;
  b: Uint8Array;
  c: Uint8Array;
  root: bigint;
  inputNullifiers: bigint[];
  outputCommitment0: bigint;
  outputCommitment1: bigint;
  publicAmount: bigint;
  extDataHash: Uint8Array;
  aspMembershipRoot: bigint;
  aspNonMembershipRoot: bigint;
}

export interface FixtureExtData {
  recipient: string;
  ext_amount: bigint;
  encrypted_output0: Uint8Array;
  encrypted_output1: Uint8Array;
}

export interface FixturePaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: unknown;
}

function hexToBytes(h: string): Uint8Array {
  const s = h.replace(/^0x/, "");
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function loadShieldedProof(): FixtureShieldedProof {
  const raw = JSON.parse(readFileSync(path.join(FIXTURES, "shielded-proof.json"), "utf8"));
  return {
    a: hexToBytes(raw.a),
    b: hexToBytes(raw.b),
    c: hexToBytes(raw.c),
    root: BigInt(raw.root),
    inputNullifiers: raw.inputNullifiers.map((n: string) => BigInt(n)),
    outputCommitment0: BigInt(raw.outputCommitment0),
    outputCommitment1: BigInt(raw.outputCommitment1),
    publicAmount: BigInt(raw.publicAmount),
    extDataHash: hexToBytes(raw.extDataHash),
    aspMembershipRoot: BigInt(raw.aspMembershipRoot),
    aspNonMembershipRoot: BigInt(raw.aspNonMembershipRoot),
  };
}

export function loadExtData(): FixtureExtData {
  const raw = JSON.parse(readFileSync(path.join(FIXTURES, "ext-data.json"), "utf8"));
  return {
    recipient: raw.recipient,
    ext_amount: BigInt(raw.ext_amount),
    encrypted_output0: hexToBytes(raw.encrypted_output0),
    encrypted_output1: hexToBytes(raw.encrypted_output1),
  };
}

export function loadPaymentRequirements(): FixturePaymentRequirements {
  return JSON.parse(readFileSync(path.join(FIXTURES, "payment-requirements.json"), "utf8"));
}
