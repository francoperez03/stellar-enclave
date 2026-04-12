import { describe, it, expect } from '@jest/globals';
import { Writable } from 'node:stream';
import { createLogger } from '../logger.js';

function captureLogger(): { logger: ReturnType<typeof createLogger>; getOutput: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc: string, cb: () => void) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  const logger = createLogger(stream as unknown as NodeJS.WritableStream);
  return { logger, getOutput: () => chunks.join('') };
}

describe('Logger redaction (SDK-06)', () => {
  it('redacts orgSpendingPrivKey from log output', () => {
    const { logger, getOutput } = captureLogger();
    logger.info({ orgSpendingPrivKey: '0xdeadbeef1234abcdef', url: 'https://example.com' }, 'loading bundle');
    const output = getOutput();
    expect(output).not.toContain('deadbeef1234abcdef');
    expect(output).toContain('[Redacted]');
  });

  it('redacts agentAuthKey from log output', () => {
    const { logger, getOutput } = captureLogger();
    logger.info({ agentAuthKey: 'abc123secretkey456', url: 'https://example.com' }, 'settling');
    const output = getOutput();
    expect(output).not.toContain('abc123secretkey456');
    expect(output).toContain('[Redacted]');
  });

  it('redacts proof.a, proof.b, proof.c from log output', () => {
    const { logger, getOutput } = captureLogger();
    logger.info({ proof: { a: 'secretProofA', b: 'secretProofB', c: 'secretProofC' } }, 'proving');
    const output = getOutput();
    expect(output).not.toContain('secretProofA');
    expect(output).not.toContain('secretProofB');
    expect(output).not.toContain('secretProofC');
  });

  it('redacts inputNullifiers from log output', () => {
    const { logger, getOutput } = captureLogger();
    logger.info({ inputNullifiers: ['null1hexvalue', 'null2hexvalue'] }, 'nullifiers');
    const output = getOutput();
    expect(output).not.toContain('null1hexvalue');
    expect(output).not.toContain('null2hexvalue');
  });

  it('redacts extData from log output', () => {
    const { logger, getOutput } = captureLogger();
    logger.info({ extData: { recipient: 'GABC123SECRET', extAmount: '-100' } }, 'extdata');
    const output = getOutput();
    expect(output).not.toContain('GABC123SECRET');
  });

  it('passes through non-secret fields (orgId, url, phase)', () => {
    const { logger, getOutput } = captureLogger();
    logger.info({ orgId: 'northfield', url: 'https://api.example.com', phase: 'settle' }, 'request');
    const output = getOutput();
    expect(output).toContain('northfield');
    expect(output).toContain('https://api.example.com');
    expect(output).toContain('settle');
  });

  it('[Redacted] sentinel appears in output when secret is present', () => {
    const { logger, getOutput } = captureLogger();
    logger.info({ orgSpendingPrivKey: 'thesecretkey' }, 'check');
    expect(getOutput()).toContain('[Redacted]');
  });
});
