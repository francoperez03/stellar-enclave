import express, { type Express } from "express";
import type { MockChainClient } from "./mockChainClient.js";

export interface TestAppOptions {
  chainClient?: MockChainClient;
}

/**
 * Wave 0 placeholder: returns a minimal Express app with /health.
 * Plan 07 replaces the body with the real createApp() wired to routes.
 * This helper's SIGNATURE is stable — plans 04/05/07 use it verbatim.
 */
export function createTestApp(_options: TestAppOptions = {}): Express {
  const app = express();
  app.use(express.json());
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", phase: "wave-0-scaffold" });
  });
  return app;
}
