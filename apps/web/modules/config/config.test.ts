import { describe } from 'vitest';

import { getConfig, options } from './config';

describe('Config', () => {
  it('Parses production config from chainId', () => {
    expect(getConfig('137')).toBe(options.production);
  });

  it('Parses testnet config from chainId', () => {
    expect(getConfig('80001')).toBe(options.testnet);
  });

  it('Parses development config from chainId', () => {
    expect(getConfig('31337')).toBe(options.development);
  });

  it('Returns production config if given invalid chainId', () => {
    expect(getConfig('invalid')).toBe(options.production);
  });
});
