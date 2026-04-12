// Structured logger with automatic redaction of secret fields.
// SDK-06: no key material, nullifiers, or raw proof bytes survive the log pipeline.

import pino from 'pino';
import type { Logger as PinoLogger } from 'pino';

const REDACT_PATHS = [
  'orgSpendingPrivKey',
  'agentAuthKey',
  '*.orgSpendingPrivKey',
  '*.agentAuthKey',
  'proof.a',
  'proof.b',
  'proof.c',
  'inputNullifiers',
  'extData',
  'bundle.orgSpendingPrivKey',
  'bundle.agentAuthKey',
];

export function createLogger(stream?: NodeJS.WritableStream): PinoLogger {
  const opts = {
    level: process.env['LOG_LEVEL'] ?? 'info',
    redact: {
      paths: REDACT_PATHS,
      censor: '[Redacted]',
    },
  };
  return stream ? pino(opts, stream) : pino(opts);
}

export const logger: PinoLogger = createLogger();
export type Logger = PinoLogger;
