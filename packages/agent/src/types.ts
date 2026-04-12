import type { ShieldedProof, PaymentRequest } from '@enclave/core';

/** A shielded note (UTXO) from the pool, held by an agent */
export interface EnclaveNote {
  /** Pool commitment hash as decimal string */
  commitment: string;
  /** Precomputed nullifier as decimal string */
  nullifier: string;
  /** Note amount in stroops */
  amount: bigint;
  /** Blinding factor as decimal string */
  blinding: string;
  /** Merkle path elements (array of TREE_DEPTH decimal strings) */
  pathElements: string[];
  /** Merkle path index as decimal string */
  pathIndex: string;
  /** ASP membership leaf (Poseidon2(orgSpendingPubKey, blinding=0)) as decimal string */
  aspLeaf: string;
  /** ASP membership Merkle path elements (array of decimal strings) */
  aspPathElements: string[];
  /** ASP membership path index as decimal string */
  aspPathIndex: string;
}

/** Agent bundle loaded from <agentName>.enclave.json */
export interface AgentBundle {
  /** Org spending private key as hex string (BN254 scalar, little-endian) */
  orgSpendingPrivKey: string;
  /** Agent auth key as hex string (used in Authorization: Bearer header) */
  agentAuthKey: string;
  /** Org identifier slug */
  orgId: string;
  /** Facilitator base URL */
  facilitatorUrl: string;
  // Note: real bundle from app/js/enclave/bundle.js may contain additional fields
  // loadBundle() must accept (not reject) them
  [key: string]: unknown;
}

/** ExtData for pool.transact -- internal representation before wire serialization */
export interface ExtData {
  /** Stellar address of the USDC recipient (as strkey) */
  recipient: string;
  /** External amount (negative for withdrawal, in stroops as BigInt) */
  ext_amount: bigint;
  /** 112-byte encrypted output for real output */
  encrypted_output0: Uint8Array;
  /** 112-byte dummy padding output */
  encrypted_output1: Uint8Array;
}

/** A pre-generated proof fixture entry (indexed by URL) */
export interface FixtureEntry {
  proof: ShieldedProof;
  extData: ExtData;
  note: { commitment: string; nullifier: string };
}

/** Fixture index: keyed by URL string */
export type FixtureIndex = Record<string, FixtureEntry>;

/** Error thrown by agent.fetch() on payment failure */
export class EnclavePaymentError extends Error {
  reason: 'proof_failed' | 'facilitator_rejected' | 'no_funds' | 'retry_402' | 'already_spent';
  nullifier?: string;
  facilitatorResponse?: unknown;

  constructor(opts: {
    reason: EnclavePaymentError['reason'];
    nullifier?: string;
    facilitatorResponse?: unknown;
  }) {
    super(`EnclavePaymentError: ${opts.reason}`);
    this.name = 'EnclavePaymentError';
    this.reason = opts.reason;
    this.nullifier = opts.nullifier;
    this.facilitatorResponse = opts.facilitatorResponse;
  }
}

export type { ShieldedProof, PaymentRequest };
