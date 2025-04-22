import { describe, expect, it } from 'vitest';

import { getConfig, options } from './environment';

describe('Config', () => {
  it('Parses production config from chainId', () => {
    expect(getConfig()).toBe(options.production);
  });
});
