import type { Request, Response, NextFunction } from "express";
import type { PaymentRequirements, VerifyResponse } from "@enclave/core";
import { verifyWithFacilitator } from "./facilitatorClient.js";
import type { EnclaveGateOptions } from "./types.js";

export function withEnclaveGate(opts: EnclaveGateOptions) {
  const log = opts.logger;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Org-scoping: check Authorization header against allowedAuthKeys
    if (opts.allowedAuthKeys && opts.allowedAuthKeys.size > 0) {
      const authHeader = req.headers.authorization;
      const bearerKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
      if (!bearerKey) {
        log?.info({ url: req.url }, "gate: no Authorization header, returning 402");
        return res.status(402).json({
          x402Version: 1,
          error: "authorization_required",
          accepts: [opts.paymentRequirements],
        });
      }
      const keyOrg = opts.allowedAuthKeys.get(bearerKey);
      if (keyOrg !== opts.orgId) {
        log?.info({ url: req.url, keyOrg, requiredOrg: opts.orgId }, "gate: org mismatch, returning 402");
        return res.status(402).json({
          x402Version: 1,
          error: "org_not_authorized",
          accepts: [opts.paymentRequirements],
        });
      }
    }

    const xPayment = req.headers["x-payment"];
    if (!xPayment) {
      log?.info({ url: req.url }, "gate: no X-PAYMENT header, returning 402");
      return res.status(402).json({
        x402Version: 1,
        error: "X-PAYMENT header required",
        accepts: [opts.paymentRequirements],
      });
    }

    const start = Date.now();
    try {
      const payloadStr = Array.isArray(xPayment) ? xPayment[0] : xPayment;
      let paymentPayload: unknown;
      try {
        paymentPayload = JSON.parse(payloadStr!);
      } catch {
        return res.status(402).json({
          x402Version: 1,
          error: "malformed_x_payment",
          accepts: [opts.paymentRequirements],
        });
      }

      const result: VerifyResponse = await verifyWithFacilitator({
        facilitatorUrl: opts.facilitatorUrl,
        paymentPayload,
        paymentRequirements: opts.paymentRequirements,
      });

      const elapsed = Date.now() - start;
      log?.info({ elapsed, isValid: result.isValid }, "gate: verify complete");

      if (!result.isValid) {
        return res.status(402).json({
          x402Version: 1,
          error: result.invalidReason ?? "proof_invalid",
          accepts: [opts.paymentRequirements],
        });
      }

      next();
    } catch (err) {
      const elapsed = Date.now() - start;
      log?.error({ err, elapsed }, "gate: verification error");
      return res.status(500).json({ error: "gate verification failed" });
    }
  };
}
