import { afterEach, describe, expect, it, vi } from 'vitest';

import { getDebateAcceptorConfig } from './acceptor-config';

const KEY_BODY = '4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318';
const SPACE_ID = '88883e1ec8261b8ac323f564e272b5be';

function setEnv(env: Record<string, string | undefined>) {
  vi.stubEnv('DEBATE_ACCEPTOR_PRIVATE_KEY', env.privateKey);
  vi.stubEnv('DEBATE_ACCEPTOR_SPACE_ID', env.spaceId ?? SPACE_ID);
  vi.stubEnv('DEBATE_ACCEPTOR_ADDRESS', env.address);
  vi.stubEnv('DEBATE_ACCEPTOR_RPC_URL', env.rpcUrl);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getDebateAcceptorConfig', () => {
  it('returns null when the acceptor is not configured', () => {
    setEnv({ privateKey: undefined });
    expect(getDebateAcceptorConfig()).toBeNull();

    setEnv({ privateKey: `0x${KEY_BODY}`, spaceId: '' });
    expect(getDebateAcceptorConfig()).toBeNull();
  });

  it('treats a quoted empty key as unset rather than malformed', () => {
    setEnv({ privateKey: '""' });
    expect(getDebateAcceptorConfig()).toBeNull();
  });

  it('accepts a well-formed 0x-prefixed key unchanged', () => {
    setEnv({ privateKey: `0x${KEY_BODY}` });
    expect(getDebateAcceptorConfig()?.privateKey).toBe(`0x${KEY_BODY}`);
  });

  it('adds the 0x prefix to a bare 64-character hex key', () => {
    setEnv({ privateKey: KEY_BODY });
    expect(getDebateAcceptorConfig()?.privateKey).toBe(`0x${KEY_BODY}`);
  });

  it.each([
    ['double quotes', `"0x${KEY_BODY}"`],
    ['single quotes', `'0x${KEY_BODY}'`],
    ['quotes around a bare key', `"${KEY_BODY}"`],
    ['quotes with inner whitespace', `" 0x${KEY_BODY} "`],
  ])('strips %s', (_label, raw) => {
    setEnv({ privateKey: raw });
    expect(getDebateAcceptorConfig()?.privateKey).toBe(`0x${KEY_BODY}`);
  });

  it('normalizes an uppercase 0X prefix', () => {
    setEnv({ privateKey: `0X${KEY_BODY}` });
    expect(getDebateAcceptorConfig()?.privateKey).toBe(`0x${KEY_BODY}`);
  });

  it('strips wrapping quotes from the other values too', () => {
    setEnv({
      privateKey: `0x${KEY_BODY}`,
      spaceId: `"${SPACE_ID}"`,
      address: '"0xabc"',
      rpcUrl: '"https://rpc.example"',
    });

    expect(getDebateAcceptorConfig()).toMatchObject({
      spaceId: SPACE_ID,
      address: '0xabc',
      rpcUrl: 'https://rpc.example',
    });
  });

  it('fails fast on a malformed key', () => {
    setEnv({ privateKey: KEY_BODY.slice(0, 63) });
    expect(() => getDebateAcceptorConfig()).toThrow(/not a 0x-prefixed 32-byte hex key/);
  });

  it('describes a rejected key by shape only, never by value', () => {
    const truncated = KEY_BODY.slice(0, 63);
    setEnv({ privateKey: truncated });

    const message = getThrownMessage();
    expect(message).toContain('no 0x prefix');
    expect(message).toContain('body of 63 hex character(s)');
    expect(message).not.toContain(truncated);
    expect(message).not.toContain(truncated.slice(0, 8));
  });

  it('reports a non-hex body as non-hex', () => {
    setEnv({ privateKey: `0x${'z'.repeat(64)}` });

    const message = getThrownMessage();
    expect(message).toContain('0x prefix');
    expect(message).toContain('body of 64 non-hex character(s)');
    expect(message).not.toContain('z'.repeat(8));
  });
});

function getThrownMessage(): string {
  try {
    getDebateAcceptorConfig();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('expected getDebateAcceptorConfig to throw');
}
