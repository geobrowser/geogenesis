import { describe, expect, it } from 'vitest';

import { getConfig, options } from './environment';

describe('Config', () => {
  it('Parses production config from chainId', () => {
    expect(getConfig('production')).toBe(options.production);
  });

  it('Parses testnet config from chainId', () => {
    expect(getConfig('testnet')).toBe(options.testnet);
  });

  it('Parses development config from chainId', () => {
    expect(getConfig('development')).toBe(options.development);
  });

  it('Returns production config if given invalid chainId', () => {
    expect(getConfig('invalid')).toBe(options.production);
  });
});
