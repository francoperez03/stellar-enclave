// Phase 3 Plan 02 target — real pino logger with redact paths
export const logger = {
  info: (_obj: unknown, _msg?: string) => {},
  warn: (_obj: unknown, _msg?: string) => {},
  error: (_obj: unknown, _msg?: string) => {},
  debug: (_obj: unknown, _msg?: string) => {},
};
export type Logger = typeof logger;
