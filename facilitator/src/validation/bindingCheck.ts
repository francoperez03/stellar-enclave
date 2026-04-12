/**
 * Structural binding check — the FACIL-04 gate.
 *
 * D2 binding (from 02-CONTEXT.md):
 *   payTo       <- ExtData.recipient
 *   maxAmount   <- |ExtData.ext_amount|   (ext_amount is negative for withdrawals)
 *
 * Plus Pitfall 8 format parity: both encrypted_output blobs MUST be exactly 112 bytes.
 *
 * We do NOT recompute ext_data_hash here — the pool contract does that and rejects
 * mismatches via WrongExtHash. Our job is to ensure the agent-constructed ExtData
 * structurally matches the x402 paymentRequirements before we waste an on-chain call.
 */
import type { BindingCheckResult, ExtDataLike, PaymentRequirements } from "@enclave/core";

const ENCRYPTED_OUTPUT_LENGTH = 112;

export function checkBinding(
  ext: ExtDataLike,
  requirements: PaymentRequirements,
): BindingCheckResult {
  // Pitfall 8: format parity — both blobs must be exactly 112 bytes.
  if (
    ext.encrypted_output0.length !== ENCRYPTED_OUTPUT_LENGTH ||
    ext.encrypted_output1.length !== ENCRYPTED_OUTPUT_LENGTH
  ) {
    return {
      ok: false,
      reason: "encrypted_output_length_invalid",
      details: {
        len0: ext.encrypted_output0.length,
        len1: ext.encrypted_output1.length,
        expected: ENCRYPTED_OUTPUT_LENGTH,
      },
    };
  }

  // D2: recipient (payTo) binding — exact string equality
  if (ext.recipient !== requirements.payTo) {
    return {
      ok: false,
      reason: "recipient_mismatch",
      details: {
        expected: requirements.payTo,
        got: ext.recipient,
      },
    };
  }

  // D2: amount binding — |ext_amount| must equal maxAmountRequired
  const expected = BigInt(requirements.maxAmountRequired);
  const actualAbs = ext.ext_amount < 0n ? -ext.ext_amount : ext.ext_amount;
  if (actualAbs !== expected) {
    return {
      ok: false,
      reason: "amount_mismatch",
      details: {
        expected: expected.toString(),
        got: actualAbs.toString(),
        rawExtAmount: ext.ext_amount.toString(),
      },
    };
  }

  return { ok: true };
}
