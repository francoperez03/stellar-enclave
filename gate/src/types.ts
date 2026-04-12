import type { PaymentRequirements } from "@enclave/core";
import type { Logger } from "pino";

export interface EnclaveGateOptions {
  orgId: string;
  facilitatorUrl: string;
  paymentRequirements: PaymentRequirements;
  allowedAuthKeys?: Map<string, string>; // authKey -> orgId mapping
  logger?: Logger;
}
