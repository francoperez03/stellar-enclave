import { Router, type Request, type Response } from "express";
import type { FacilitatorState } from "../state.js";

export function createSettlementsRoute(state: FacilitatorState): Router {
  const router = Router();
  router.get("/", async (_req: Request, res: Response) => {
    try {
      const entries = await state.settlementsLog.list();
      res.status(200).json(entries);
    } catch (err) {
      state.logger.error({ err }, "settlements list failed");
      res.status(500).json({ error: "settlements_read_failed" });
    }
  });
  return router;
}
