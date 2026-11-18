import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';

import { describe, expect, it } from 'vitest';

import { QuerySeed } from './query-seed';

describe('QuerySeed', () => {
  it('fills keys the browser cache lacks, and seeds an entry with updatedAt 0 already stale', () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });
    client.setQueryData(['kept'], 'fresher');
    render(
      <QueryClientProvider client={client}>
        <QuerySeed
          entries={[
            { queryKey: ['kept'], data: 'seeded' },
            { queryKey: ['fresh'], data: 1 },
            { queryKey: ['stale'], data: 2, updatedAt: 0 },
          ]}
        >
          <div />
        </QuerySeed>
      </QueryClientProvider>
    );

    expect(client.getQueryData(['kept'])).toBe('fresher');
    expect(client.getQueryState(['fresh'])?.dataUpdatedAt).toBeGreaterThan(0);
    expect(client.getQueryData(['stale'])).toBe(2);
    expect(client.getQueryState(['stale'])?.dataUpdatedAt).toBe(0);
  });
});
