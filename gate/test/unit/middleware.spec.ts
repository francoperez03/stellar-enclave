import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// Mock the facilitatorClient module before importing middleware
vi.mock("../../src/facilitatorClient.js", () => ({
  verifyWithFacilitator: vi.fn(),
}));

import { withEnclaveGate } from "../../src/middleware.js";
import { verifyWithFacilitator } from "../../src/facilitatorClient.js";
import type { EnclaveGateOptions } from "../../src/types.js";

const mockPaymentRequirements = {
  scheme: "shielded-exact",
  network: "stellar:testnet",
  maxAmountRequired: "1000000",
  resource: "https://api.example.com/data",
  description: "Access to premium data",
  mimeType: "application/json",
  payTo: "GTEST...",
  maxTimeoutSeconds: 300,
  asset: "CUSDC...",
};

function makeReqResMocks(headers: Record<string, string> = {}) {
  const req = {
    headers,
    url: "/test",
  } as unknown as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

const baseOpts: EnclaveGateOptions = {
  orgId: "northfield-capital",
  facilitatorUrl: "http://localhost:4021",
  paymentRequirements: mockPaymentRequirements,
};

describe("withEnclaveGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Test 1: returns 402 with x402 paymentRequirements when no X-PAYMENT header is present", async () => {
    const { req, res, next } = makeReqResMocks();
    const handler = withEnclaveGate(baseOpts);

    await handler(req, res, next);

    expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(402);
    expect((res.json as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({
        x402Version: 1,
        accepts: [mockPaymentRequirements],
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("Test 2: returns 402 when X-PAYMENT header contains malformed JSON", async () => {
    const { req, res, next } = makeReqResMocks({ "x-payment": "not-valid-json{{{" });
    const handler = withEnclaveGate(baseOpts);

    await handler(req, res, next);

    expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(402);
    expect((res.json as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({
        x402Version: 1,
        error: "malformed_x_payment",
        accepts: [mockPaymentRequirements],
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("Test 3: calls verifyWithFacilitator and calls next() when facilitator returns { isValid: true }", async () => {
    (verifyWithFacilitator as ReturnType<typeof vi.fn>).mockResolvedValue({ isValid: true });
    const validPayload = JSON.stringify({ scheme: "shielded-exact", proof: {} });
    const { req, res, next } = makeReqResMocks({ "x-payment": validPayload });
    const handler = withEnclaveGate(baseOpts);

    await handler(req, res, next);

    expect(verifyWithFacilitator).toHaveBeenCalledWith(
      expect.objectContaining({
        facilitatorUrl: "http://localhost:4021",
        paymentRequirements: mockPaymentRequirements,
      })
    );
    expect(next).toHaveBeenCalled();
    expect((res.status as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("Test 4: returns 402 with invalidReason when facilitator returns already_spent", async () => {
    (verifyWithFacilitator as ReturnType<typeof vi.fn>).mockResolvedValue({
      isValid: false,
      invalidReason: "already_spent",
    });
    const validPayload = JSON.stringify({ scheme: "shielded-exact", proof: {} });
    const { req, res, next } = makeReqResMocks({ "x-payment": validPayload });
    const handler = withEnclaveGate(baseOpts);

    await handler(req, res, next);

    expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(402);
    expect((res.json as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({
        x402Version: 1,
        error: "already_spent",
        accepts: [mockPaymentRequirements],
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("Test 5: returns 402 with invalidReason when facilitator returns proof_verification_failed", async () => {
    (verifyWithFacilitator as ReturnType<typeof vi.fn>).mockResolvedValue({
      isValid: false,
      invalidReason: "proof_verification_failed",
    });
    const validPayload = JSON.stringify({ scheme: "shielded-exact", proof: {} });
    const { req, res, next } = makeReqResMocks({ "x-payment": validPayload });
    const handler = withEnclaveGate(baseOpts);

    await handler(req, res, next);

    expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(402);
    expect((res.json as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({
        x402Version: 1,
        error: "proof_verification_failed",
        accepts: [mockPaymentRequirements],
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("Test 6: returns 500 when verifyWithFacilitator throws (facilitator unreachable)", async () => {
    (verifyWithFacilitator as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("ECONNREFUSED connect ECONNREFUSED 127.0.0.1:4021")
    );
    const validPayload = JSON.stringify({ scheme: "shielded-exact", proof: {} });
    const { req, res, next } = makeReqResMocks({ "x-payment": validPayload });
    const handler = withEnclaveGate(baseOpts);

    await handler(req, res, next);

    expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(500);
    expect((res.json as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({ error: "gate verification failed" })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("Test 7: logs elapsed time via logger.info with elapsed field", async () => {
    (verifyWithFacilitator as ReturnType<typeof vi.fn>).mockResolvedValue({ isValid: true });
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };
    const validPayload = JSON.stringify({ scheme: "shielded-exact", proof: {} });
    const { req, res, next } = makeReqResMocks({ "x-payment": validPayload });
    const handler = withEnclaveGate({ ...baseOpts, logger: logger as never });

    await handler(req, res, next);

    const loggerInfoCalls = logger.info.mock.calls;
    const verifyCompleteCall = loggerInfoCalls.find(
      (call: unknown[]) => typeof call[0] === "object" && "elapsed" in (call[0] as object)
    );
    expect(verifyCompleteCall).toBeDefined();
    expect((verifyCompleteCall![0] as { elapsed: unknown }).elapsed).toBeTypeOf("number");
  });

  it("Test 8 (org-scoping): returns 402 when Authorization key maps to a different org", async () => {
    const opts: EnclaveGateOptions = {
      ...baseOpts,
      allowedAuthKeys: new Map([
        ["valid-key-123", "northfield-capital"],
        ["ashford-key-456", "ashford-partners"],
      ]),
    };
    // Send valid x-payment but auth key from wrong org
    const validPayload = JSON.stringify({ scheme: "shielded-exact", proof: {} });
    const { req, res, next } = makeReqResMocks({
      "x-payment": validPayload,
      authorization: "Bearer ashford-key-456",
    });
    const handler = withEnclaveGate(opts);

    await handler(req, res, next);

    expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(402);
    expect((res.json as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({
        x402Version: 1,
        error: "org_not_authorized",
        accepts: [mockPaymentRequirements],
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("Test 9 (org-scoping): passes through when Authorization key maps to the correct org", async () => {
    (verifyWithFacilitator as ReturnType<typeof vi.fn>).mockResolvedValue({ isValid: true });
    const opts: EnclaveGateOptions = {
      ...baseOpts,
      allowedAuthKeys: new Map([
        ["valid-key-123", "northfield-capital"],
        ["ashford-key-456", "ashford-partners"],
      ]),
    };
    const validPayload = JSON.stringify({ scheme: "shielded-exact", proof: {} });
    const { req, res, next } = makeReqResMocks({
      "x-payment": validPayload,
      authorization: "Bearer valid-key-123",
    });
    const handler = withEnclaveGate(opts);

    await handler(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((res.status as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});
