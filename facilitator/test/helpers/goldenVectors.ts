import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface HashVector {
  label: string;
  extData: {
    recipient: string;
    ext_amount: string;
    encrypted_output0: string;
    encrypted_output1: string;
  };
  expectedHashHex: string;
}

export function loadHashVectors(): HashVector[] {
  const raw = JSON.parse(
    readFileSync(path.join(__dirname, "..", "fixtures", "ext-data-hash-vectors.json"), "utf8"),
  );
  if (!Array.isArray(raw) || raw.length < 3) {
    throw new Error(`goldenVectors: expected ≥3 vectors, got ${Array.isArray(raw) ? raw.length : "non-array"}`);
  }
  for (const v of raw) {
    if (v.expectedHashHex === "TBD" || !v.expectedHashHex) {
      throw new Error(`goldenVectors: vector "${v.label}" has TBD hash — regenerate fixtures`);
    }
  }
  return raw;
}
