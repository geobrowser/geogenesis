import { describe, expect, it } from 'vitest';

import { getStreamConfiguration } from './get-stream-configuration';

describe('get-stream-configuration', () => {
  it('--from-cache', () => {
    const config = getStreamConfiguration({ fromCache: true }, 123);

    expect(config).toEqual({
      shouldUseCursor: false,
      startBlockNumber: 123,
    });
  });

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
      startBlockNumber: 36472424, // the default value from env
    });
  });

  it('--from-cache and --start-block', () => {
    const config = getStreamConfiguration({ fromCache: true, startBlock: 500 }, 180);

    expect(config).toEqual({
      shouldUseCursor: false,
      startBlockNumber: 180, // should use the cache value
    });
  });
});
