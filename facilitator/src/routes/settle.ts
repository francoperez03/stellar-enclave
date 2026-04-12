// Stub for Task 1 — replaced in Task 3
import { Router } from "express";
import type { FacilitatorState } from "../state.js";

export function createSettleRoute(_state: FacilitatorState): Router {
  const r = Router();
  r.post("/", (_req, res) => res.status(501).json({ error: "not_implemented" }));
  return r;
}
