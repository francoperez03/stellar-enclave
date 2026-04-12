import { describe, it } from '@jest/globals';

describe('agent.fetch() intercept (SDK-01)', () => {
  it.todo('returns response directly when status is not 402');
  it.todo('completes 402 -> parsePaymentRequirements -> selectNote -> prove -> POST /settle -> retry cycle');
  it.todo('attaches Authorization: Bearer <authKey> to /settle POST');
  it.todo('retries original request with X-PAYMENT header containing txHash from /settle');
  it.todo('throws EnclavePaymentError({ reason: "no_funds" }) when no note covers maxAmountRequired');
  it.todo('throws EnclavePaymentError({ reason: "facilitator_rejected" }) when /settle returns non-200');
  it.todo('throws EnclavePaymentError({ reason: "retry_402" }) when retry still returns 402');
  it.todo('throws EnclavePaymentError({ reason: "already_spent" }) when /settle returns HTTP 409');
  it.todo('fixture mode: skips prover and uses pre-generated proof when ENCLAVE_FIXTURE_PATH is set and URL matches');
  it.todo('fixture mode: falls back to live proving on fixture cache miss (logs WARN)');
});
