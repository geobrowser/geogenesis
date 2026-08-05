import { describe, expect, it } from 'vitest';

import { parseRegisteredSpaceId } from './create-personal-space-on-chain';

describe('parseRegisteredSpaceId', () => {
  it('returns null for the empty/unregistered sentinel (any casing)', () => {
    expect(parseRegisteredSpaceId('0x00000000000000000000000000000000')).toBeNull();
    expect(parseRegisteredSpaceId('0X00000000000000000000000000000000')).toBeNull();
  });

  it('strips 0x and lowercases a registered id', () => {
    expect(parseRegisteredSpaceId('0xABCDEF00000000000000000000000123')).toBe('abcdef00000000000000000000000123');
  });
});
