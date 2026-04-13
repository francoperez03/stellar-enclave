import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
// pino-http ESM/CJS interop: NodeNext module resolution resolves the CJS namespace.
// At runtime, pinoHttp IS callable (it's the default export). Suppress TS2349 here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import pinoHttpModule from "pino-http";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pinoHttp = (pinoHttpModule as any) as { (opts: object): express.RequestHandler };
import type { FacilitatorState } from "./state.js";
import { createVerifyRoute } from "./routes/verify.js";
import { createSettleRoute } from "./routes/settle.js";
import { createSupportedRoute } from "./routes/supported.js";
import { createHealthRoute } from "./routes/health.js";
import { createSettlementsRoute } from "./routes/settlements.js";

export interface CreateAppOptions {
  corsOrigins?: string[];
}

export function createApp(state: FacilitatorState, options: CreateAppOptions = {}): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: options.corsOrigins ?? "*" }));
  app.use(express.json({ limit: "256kb" }));
  app.use(pinoHttp({ logger: state.logger }));

  app.use("/verify", createVerifyRoute(state));
  app.use("/settle", createSettleRoute(state));
  app.use("/supported", createSupportedRoute(state));
  app.use("/health", createHealthRoute(state));
  app.use("/settlements", createSettlementsRoute(state));

  app.use((_req, res) => res.status(404).json({ error: "not_found" }));

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    state.logger.error({ err }, "unhandled error");
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}
