import { Contract, TransactionBuilder, rpc as StellarRpc } from "@stellar/stellar-sdk";
import type { ShieldedProofWireFormat, ExtDataWireFormat } from "@enclave/core";
import { buildPoolTransactArgs } from "./poolTransaction.js";
import { mapSubmitError, type SubmitInvalidReason } from "./errorMapping.js";

export interface SimulateResult {
  ok: boolean;
  reason?: SubmitInvalidReason;
  minResourceFee?: bigint;
}

export interface SimulateDeps {
  rpc: Pick<StellarRpc.Server, "simulateTransaction" | "getAccount">;
  poolContractId: string;
  facilitatorPublicKey: string;
  networkPassphrase: string;
  baseFeeStroops?: number;
}

/**
 * Dry-run pool.transact via simulateTransaction (no broadcast).
 * Used by the /verify path to confirm the proof is accepted by the contract
 * before committing a nullifier cache slot.
 *
 * Returns { ok: true, minResourceFee } on success,
 * or { ok: false, reason } if the simulation returns a host error.
 */
export async function simulatePoolTransaction(
  deps: SimulateDeps,
  proof: ShieldedProofWireFormat,
  extData: ExtDataWireFormat,
): Promise<SimulateResult> {
  try {
    const args = buildPoolTransactArgs(proof, extData, deps.facilitatorPublicKey);
    const contract = new Contract(deps.poolContractId);
    const account = await deps.rpc.getAccount(deps.facilitatorPublicKey);

    const tx = new TransactionBuilder(account as any, {
      fee: String(deps.baseFeeStroops ?? 100_000),
      networkPassphrase: deps.networkPassphrase,
    })
      .addOperation(contract.call("transact", ...args))
      .setTimeout(30)
      .build();

    const sim = await deps.rpc.simulateTransaction(tx);

    if (StellarRpc.Api.isSimulationError(sim)) {
      return { ok: false, reason: mapSubmitError(sim.error) };
    }

    return {
      ok: true,
      minResourceFee: BigInt(
        (sim as StellarRpc.Api.SimulateTransactionSuccessResponse).minResourceFee ?? 0,
      ),
    };
  } catch (err) {
    return { ok: false, reason: mapSubmitError(err) };
  }
}
