import { QueryClient } from '@tanstack/react-query';

import { describe, expect, it } from 'vitest';

import { invalidateAfterVisibilityChange } from './use-debate-removal';

describe('invalidateAfterVisibilityChange (GEO-2785)', () => {
  it('refreshes the listings, the debate under either id spelling, and Explore — and nothing else', async () => {
    const client = new QueryClient();
    const keys = [
      ['debates', 'space', 'space-1'],
      ['debates', 'detail', '01a0448a61d371018434a20fdadf6f97'],
      ['debates', 'detail', '01a0448a-61d3-7101-8434-a20fdadf6f97'],
      ['debates', 'media', '01a0448a-61d3-7101-8434-a20fdadf6f97'],
      ['debates', 'detail', 'another-debate'],
      ['debates', 'account', 'user-a', 'activity'],
      ['/api/explore/feed', 'best'],
      ['entity', 'x'],
    ];
    for (const key of keys) client.setQueryData(key, 1);

    await invalidateAfterVisibilityChange(client, '01a0448a-61d3-7101-8434-a20fdadf6f97');

    const invalidated = keys.filter(key => client.getQueryState(key)?.isInvalidated);
    expect(invalidated).toEqual([keys[0], keys[1], keys[2], keys[3], keys[6]]);
  });
});
