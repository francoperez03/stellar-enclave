import { Router } from "express";
import type { FacilitatorState } from "../state.js";
import { readBalanceSnapshot } from "../chain/balanceReader.js";
import type { FacilitatorHealthReport } from "@enclave/core";

export function createHealthRoute(state: FacilitatorState): Router {
  const router = Router();
  router.get("/", async (_req, res) => {
    try {
      let usdcBalance = "0";
      let xlmBalance = "0";
      let poolRoot = state.lastSeenPoolRoot;

      if (state.mode === "on_chain" && state.client) {
        const snap = await readBalanceSnapshot(state.client.balanceReaderDeps, {
          facilitatorPublicKey: state.client.keypair.publicKey(),
          usdcContractId: state.client.config.usdcContractId,
          poolContractId: state.client.config.poolContractId,
        });
        usdcBalance = snap.poolUsdcBaseUnits.toString();
        xlmBalance = snap.facilitatorXlmStroops.toString();
        poolRoot = snap.poolRootHex;
        state.lastSeenPoolRoot = poolRoot;
      }

      const body: FacilitatorHealthReport = {
        usdc_balance: usdcBalance,
        xlm_balance: xlmBalance,
        last_seen_pool_root: poolRoot,
        nullifier_cache_size: state.cache.size,
        facilitator_mode: state.mode,
        registry_frozen: true,
        total_settlements: state.metrics.totalSettlements,
        total_replay_rejections: state.metrics.totalReplayRejections,
        uptime_seconds: Math.floor((Date.now() - state.bootTimeMs) / 1000),
      };

      res.json(body);
    } catch (err) {
      state.logger.error({ err }, "health check failed");
      res.status(503).json({ error: "health_check_failed" });
    }
  });
  return router;
}
