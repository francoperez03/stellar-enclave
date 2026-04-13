import pino from "pino";
import { Env } from "./config/env.js";
import { NullifierCache } from "./replay/cache.js";
import { createStellarClient } from "./chain/stellarClient.js";
import { hydrateNullifierCache } from "./chain/hydrateNullifierCache.js";
import { loadVerifyingKey } from "./mock/offChainVerify.js";
import { createInitialState } from "./state.js";
import { createApp } from "./app.js";
import { createSettlementsLog } from "./settlements/log.js";

async function bootstrap(): Promise<void> {
  Env.validate();
  const logger = pino({ level: Env.logLevel });
  const cache = new NullifierCache({ logger });

  let client = null;
  let vKey: unknown = null;

  if (Env.facilitatorMode === "on_chain") {
    client = createStellarClient({
      horizonUrl: Env.stellarHorizonUrl,
      rpcUrl: Env.stellarRpcUrl,
      networkPassphrase: Env.stellarNetworkPassphrase,
      usdcContractId: Env.usdcContractId,
      poolContractId: Env.poolContractId,
      keyPath: Env.keyPath,
    });
    logger.info({ publicKey: client.keypair.publicKey() }, "stellar client initialized");

    const hydrateResult = await hydrateNullifierCache({
      rpc: client.rpc,
      cache,
      poolContractId: client.config.poolContractId,
      hydrateLedgers: Env.cacheHydrateLedgers,
      logger,
    });
    logger.info(hydrateResult, "nullifier cache rehydrated");
  } else {
    vKey = loadVerifyingKey(Env.circuitVkeyPath);
    logger.info({ path: Env.circuitVkeyPath }, "mock mode: loaded verifying key");
  }

  const settlementsLog = createSettlementsLog({ path: Env.settlementsPath });

  const state = createInitialState({
    mode: Env.facilitatorMode,
    cache,
    client,
    vKey,
    logger,
    settlementsLog,
  });

  const app = createApp(state, { corsOrigins: Env.corsOrigins });
  const server = app.listen(Env.port, () => {
    logger.info({ port: Env.port, mode: Env.facilitatorMode }, "facilitator listening");
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, "shutdown requested");
    server.close(() => {
      logger.info("server closed");
      process.exit(0);
    });
    setTimeout(() => {
      logger.error("force exit after 10s");
      process.exit(1);
    }, 10_000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

bootstrap().catch((err) => {
  console.error("bootstrap failed:", err);
  process.exit(1);
});
