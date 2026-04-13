import { existsSync, readFileSync } from "node:fs";
import {
  Address,
  Contract,
  Horizon,
  Keypair,
  TransactionBuilder,
  rpc as StellarRpc,
  scValToNative,
} from "@stellar/stellar-sdk";
import type { BalanceReaderDeps } from "./balanceReader.js";

export interface StellarClientConfig {
  horizonUrl: string;
  rpcUrl: string;
  networkPassphrase: string;
  usdcContractId: string;
  poolContractId: string;
  keyPath: string;
}

export interface StellarClient {
  horizon: Horizon.Server;
  rpc: StellarRpc.Server;
  keypair: Keypair;
  config: StellarClientConfig;
  balanceReaderDeps: BalanceReaderDeps;
}

function loadFacilitatorKeypair(keyPath: string): Keypair {
  if (!existsSync(keyPath)) {
    throw new Error(`facilitator key file not found at ${keyPath}`);
  }
  const raw = readFileSync(keyPath);
  if (raw.length !== 32) {
    throw new Error(
      `facilitator key file at ${keyPath} must be 32 bytes (got ${raw.length})`,
    );
  }
  return Keypair.fromRawEd25519Seed(raw);
}

/**
 * Factory that constructs Horizon + RPC clients, loads the facilitator Keypair
 * from disk, and exposes the BalanceReaderDeps shape that Plan 04 expects.
 *
 * The key at `config.keyPath` must be a raw 32-byte Ed25519 seed (not a S... secret).
 * This format is created by Plan 08's bootstrap CLI.
 */
export function createStellarClient(config: StellarClientConfig): StellarClient {
  const horizon = new Horizon.Server(config.horizonUrl);
  const rpc = new StellarRpc.Server(config.rpcUrl);
  const keypair = loadFacilitatorKeypair(config.keyPath);

  const balanceReaderDeps: BalanceReaderDeps = {
    loadHorizonAccount: async (publicKey: string) => {
      const account = await horizon.loadAccount(publicKey);
      return {
        balances: account.balances as Array<{ asset_type: string; balance: string }>,
      };
    },

    simulateSacBalance: async (usdcContractId: string, holderAddress: string) => {
      const contract = new Contract(usdcContractId);
      const account = await rpc.getAccount(keypair.publicKey());
      const tx = new TransactionBuilder(account, {
        fee: "100000",
        networkPassphrase: config.networkPassphrase,
      })
        .addOperation(
          contract.call("balance", Address.fromString(holderAddress).toScVal()),
        )
        .setTimeout(30)
        .build();

      const sim = await rpc.simulateTransaction(tx);
      if (StellarRpc.Api.isSimulationError(sim)) {
        throw new Error(`SAC balance sim failed: ${sim.error}`);
      }
      const retval = (sim as StellarRpc.Api.SimulateTransactionSuccessResponse).result?.retval;
      if (!retval) {
        throw new Error("SAC balance sim returned no retval");
      }
      return BigInt(scValToNative(retval) as string | number | bigint);
    },

    simulatePoolRoot: async (poolContractId: string) => {
      const contract = new Contract(poolContractId);
      const account = await rpc.getAccount(keypair.publicKey());
      const tx = new TransactionBuilder(account, {
        fee: "100000",
        networkPassphrase: config.networkPassphrase,
      })
        .addOperation(contract.call("get_root"))
        .setTimeout(30)
        .build();

      const sim = await rpc.simulateTransaction(tx);
      if (StellarRpc.Api.isSimulationError(sim)) {
        throw new Error(`pool.get_root sim failed: ${sim.error}`);
      }
      const retval = (sim as StellarRpc.Api.SimulateTransactionSuccessResponse).result?.retval;
      if (!retval) {
        throw new Error("pool.get_root sim returned no retval");
      }
      const native = scValToNative(retval);
      if (typeof native === "bigint") {
        return native.toString(16).padStart(64, "0");
      }
      if (native instanceof Uint8Array) {
        return Buffer.from(native).toString("hex").padStart(64, "0");
      }
      throw new Error(
        `pool.get_root returned unexpected type: ${typeof native}`,
      );
    },
  };

  return { horizon, rpc, keypair, config, balanceReaderDeps };
}
