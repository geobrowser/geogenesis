import { describe, expect, it } from 'vitest';

import { validateCid } from './ipfs-client';

describe('validateCid', () => {
  it('should throw an error if cid does not start with ipfs://', () => {
    expect(() => validateCid('https://ipfs.io/ipfs/Qma1g6o6g1r1z1')).toThrowError();
  });

  it('should throw an error if cid is empty', () => {
    expect(() => validateCid('ipfs://')).toThrowError();
  });

  it('should throw an error if cid is empty', () => {
    expect(() => validateCid('')).toThrowError();
  });

  it('should not throw an error if cid is valid', () => {
    expect(validateCid('ipfs://Qma1g6o6g1r1z1')).toEqual(true);
  });
});
