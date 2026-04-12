import { Router } from "express";
import type { FacilitatorState } from "../state.js";

export function createSupportedRoute(state: FacilitatorState): Router {
  const router = Router();
  router.get("/", (_req, res) => {
    res.json({
      x402Version: 1,
      accepts: [
        {
          scheme: "shielded-exact",
          network: "stellar-testnet",
          asset: state.client?.config.usdcContractId ?? "MOCK_USDC",
        },
      ],
    });
  });
  return router;
}
