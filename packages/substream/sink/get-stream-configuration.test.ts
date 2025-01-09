import { describe, expect, it } from 'vitest';

import { getStreamConfiguration } from './get-stream-configuration';

describe('get-stream-configuration', () => {
  it('--start-block', () => {
    const config = getStreamConfiguration({ startBlock: 500 }, undefined);

    expect(config).toEqual({
      shouldUseCursor: false,
      startBlockNumber: 500,
    });
  });

  it('no flags', () => {
    const config = getStreamConfiguration({}, undefined);

    expect(config).toEqual({
      shouldUseCursor: true,
      startBlockNumber: undefined,
    });
  });
});
