import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyWithFacilitator } from "../../src/facilitatorClient.js";

describe("verifyWithFacilitator", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns { isValid: true } when facilitator responds with a valid proof", async () => {
    const mockResponse = { isValid: true, payer: "GTEST..." };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    }));

    const result = await verifyWithFacilitator({
      facilitatorUrl: "http://localhost:4021",
      paymentPayload: { scheme: "shielded-exact", proof: {} },
      paymentRequirements: { scheme: "shielded-exact", network: "stellar:testnet" },
    });

    expect(result.isValid).toBe(true);
    expect(result.payer).toBe("GTEST...");
  });

  it("returns { isValid: false, invalidReason } when facilitator rejects the proof", async () => {
    const mockResponse = { isValid: false, invalidReason: "proof_verification_failed" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    }));

    const result = await verifyWithFacilitator({
      facilitatorUrl: "http://localhost:4021",
      paymentPayload: { scheme: "shielded-exact", proof: {} },
      paymentRequirements: { scheme: "shielded-exact", network: "stellar:testnet" },
    });

    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("proof_verification_failed");
  });

  it("throws an Error with status code when facilitator returns non-200 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    }));

    await expect(
      verifyWithFacilitator({
        facilitatorUrl: "http://localhost:4021",
        paymentPayload: {},
        paymentRequirements: {},
      })
    ).rejects.toThrow("facilitator /verify returned 500");
  });

  it("propagates the error when fetch throws a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    await expect(
      verifyWithFacilitator({
        facilitatorUrl: "http://localhost:4021",
        paymentPayload: {},
        paymentRequirements: {},
      })
    ).rejects.toThrow("ECONNREFUSED");
  });

  it("sends correct request shape to facilitator /verify", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ isValid: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await verifyWithFacilitator({
      facilitatorUrl: "http://localhost:4021",
      paymentPayload: { scheme: "shielded-exact" },
      paymentRequirements: { scheme: "shielded-exact", network: "stellar:testnet" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4021/verify",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );

    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.x402Version).toBe(1);
    expect(body.paymentPayload).toEqual({ scheme: "shielded-exact" });
  });
});
