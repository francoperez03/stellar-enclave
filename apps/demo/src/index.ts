import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import pino from "pino";
// pino-http ESM/CJS interop: NodeNext module resolution resolves the CJS namespace.
// At runtime, pinoHttp IS callable (it's the default export). Suppress TS2349 here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import pinoHttpModule from "pino-http";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pinoHttp = (pinoHttpModule as any) as { (opts: object): express.RequestHandler };
import { withEnclaveGate } from "@enclave/gate";
import type { PaymentRequirements } from "@enclave/core";
import { Env } from "./env.js";
import { handleTreasuryReport } from "./routes/gated.js";
import { handleHealth } from "./routes/health.js";

Env.validate();

const log = pino({ level: Env.logLevel });

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(pinoHttp({ logger: log }));

const paymentRequirements: PaymentRequirements = {
  scheme: "shielded-exact",
  network: "stellar:testnet",
  maxAmountRequired: "1000000",
  resource: `http://localhost:${Env.port}/api/treasury/report`,
  description: "Enclave Treasury gated endpoint — Northfield Capital only",
  mimeType: "application/json",
  payTo: "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI",
  maxTimeoutSeconds: 300,
  asset: Env.usdcContractId,
};

const gate = withEnclaveGate({
  orgId: Env.gateOrgId,
  facilitatorUrl: Env.facilitatorUrl,
  paymentRequirements,
  allowedAuthKeys: Env.allowedAuthKeys,
  logger: log,
});

app.get("/api/treasury/report", gate, handleTreasuryReport(Env.gateOrgId));
app.get("/health", handleHealth(Env.gateOrgId, Env.facilitatorUrl));

app.use((_req, res) => res.status(404).json({ error: "not_found" }));

// Only listen when run directly (not when imported for tests)
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  app.listen(Env.port, () => log.info({ port: Env.port, gateOrgId: Env.gateOrgId }, "demo app listening"));
}
