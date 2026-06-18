import { describe, expect, it } from 'vitest';

import { RELOAD_REQUIRED_MESSAGE, isChunkLoadError, toUserFacingError } from './error-diagnostics';

describe('isChunkLoadError', () => {
  it('detects a chunk error wrapped as a cause (the reported bug)', () => {
    const chunk = new Error('Failed to load chunk /_next/static/chunks/0z3-yuq205903.js from module 532156');
    const wrapped = new Error('IPFS upload failed', { cause: chunk });
    expect(isChunkLoadError(wrapped)).toBe(true);
  });

  it('detects ChunkLoadError by name', () => {
    const err = new Error('whatever');
    err.name = 'ChunkLoadError';
    expect(isChunkLoadError(err)).toBe(true);
  });

  it('does not flag a genuine IPFS/network failure', () => {
    const wrapped = new Error('IPFS upload failed', { cause: new Error('fetch failed: 503') });
    expect(isChunkLoadError(wrapped)).toBe(false);
  });
});

describe('toUserFacingError', () => {
  it('swaps a chunk error for the reload prompt', () => {
    const wrapped = new Error('IPFS upload failed', { cause: new Error('Failed to load chunk x.js') });
    expect(toUserFacingError(wrapped, 'Failed to publish ranking: ').message).toBe(RELOAD_REQUIRED_MESSAGE);
  });

  it('keeps the prefix + cause chain for non-chunk errors', () => {
    const wrapped = new Error('IPFS upload failed', { cause: new Error('503') });
    const { message } = toUserFacingError(wrapped, 'Failed to publish ranking: ');
    expect(message).toBe('Failed to publish ranking: IPFS upload failed\nCaused by: 503');
  });
});
