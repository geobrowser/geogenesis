import { describe, it } from 'node:test';
import { expect } from 'vitest';
import { configOptions, getConfigFromSearchParams } from './config';

describe('Config params', () => {
  it('Gets config from valid environment param', () => {
    const config = getConfigFromSearchParams('development');
    expect(config).toEqual(configOptions.development);
  });

  it("Defaults to production if there's no param", () => {
    const config = getConfigFromSearchParams(undefined);
    expect(config).toEqual(configOptions.production);
  });

  it('Defaults to production if param not in configOptions', () => {
    const config = getConfigFromSearchParams('banana');
    expect(config).toEqual(configOptions.production);
  });
});
