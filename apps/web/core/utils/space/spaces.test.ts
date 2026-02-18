import { describe, expect, it } from 'vitest';

import { getDeterministicSpaceId } from './spaces';

describe('getDeterministicSpaceId', () => {
  it('returns null when no spaces are available', () => {
    expect(getDeterministicSpaceId([])).toBeNull();
  });

  it('returns the preferred space when it exists', () => {
    expect(getDeterministicSpaceId(['space-a', 'space-b'], 'space-b')).toBe('space-b');
  });

  it('returns the first space when preferred is missing', () => {
    expect(getDeterministicSpaceId(['space-a', 'space-b'], 'space-c')).toBe('space-a');
  });
});
