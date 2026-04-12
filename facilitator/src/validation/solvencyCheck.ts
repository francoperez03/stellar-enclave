import type { BalanceSnapshot, SolvencyResult } from "../chain/types.js";

const BASE_UNIT_INTEGER_RE = /^[0-9]+$/;

export interface RequirementsLike {
  maxAmountRequired: string;
}

/**
 * Pure solvency validator. Compares a BalanceSnapshot against the request
 * requirements and the configured minimum XLM floor for gas.
 *
 * Reason priority (stable for debugging):
 *   1. insolvent_facilitator_xlm — facilitator cannot pay for the outer tx.
 *   2. insolvent_pool_usdc       — pool cannot satisfy the withdrawal amount.
 */
export function checkSolvency(
  snapshot: BalanceSnapshot,
  requirements: RequirementsLike,
  minXlmStroops: bigint,
): SolvencyResult {
  if (!BASE_UNIT_INTEGER_RE.test(requirements.maxAmountRequired)) {
    throw new TypeError(
      `maxAmountRequired must be a base-unit integer string (got: ${requirements.maxAmountRequired})`,
    );
  }
  const requiredUsdc = BigInt(requirements.maxAmountRequired);

  if (snapshot.facilitatorXlmStroops < minXlmStroops) {
    return {
      ok: false,
      reason: "insolvent_facilitator_xlm",
      details: {
        required: minXlmStroops.toString(),
        available: snapshot.facilitatorXlmStroops.toString(),
      },
    };
  }

  if (snapshot.poolUsdcBaseUnits < requiredUsdc) {
    return {
      ok: false,
      reason: "insolvent_pool_usdc",
      details: {
        required: requiredUsdc.toString(),
        available: snapshot.poolUsdcBaseUnits.toString(),
      },
    };
  }

  return { ok: true };
}
