import type { VerifyResponse } from "@enclave/core";

export interface FacilitatorVerifyParams {
  facilitatorUrl: string;
  paymentPayload: unknown;
  paymentRequirements: unknown;
}

export async function verifyWithFacilitator(params: FacilitatorVerifyParams): Promise<VerifyResponse> {
  const resp = await fetch(`${params.facilitatorUrl}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      x402Version: 1,
      paymentPayload: params.paymentPayload,
      paymentRequirements: params.paymentRequirements,
    }),
  });
  if (!resp.ok) {
    throw new Error(`facilitator /verify returned ${resp.status}: ${await resp.text()}`);
  }
  return resp.json() as Promise<VerifyResponse>;
}
