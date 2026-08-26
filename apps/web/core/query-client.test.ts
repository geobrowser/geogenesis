import { describe, expect, it } from 'vitest';

import { queryClient } from './query-client';

/**
 * These defaults are a behaviour change to every query in the app, and the failure mode if one is
 * lost is silent — the app just quietly goes back to refetching everything on every mount and
 * focus. Nothing renders differently, so nothing surfaces it. Hence pinning them.
 */
describe('global query defaults', () => {
  const defaults = queryClient.getDefaultOptions().queries;

  it('caches for long enough that returning to a page does not refetch it', () => {
    // Measured before this was set: 84 requests to navigate back to a page you had just left, and
    // 80 for a tab refocus, all for data already in the cache.
    expect(defaults?.staleTime).toBe(30_000);
  });

  it('does not stack its own retries on top of the graphql client\'s', () => {
    // `core/io/graphql-client.ts` already retries on an exponential, jittered schedule. React
    // Query's default of 3 multiplies that budget.
    expect(defaults?.retry).toBe(1);
  });

  it('still refetches on window focus', () => {
    // The deliberate half of the decision. Turning this off removes more requests, at the cost of
    // a tab left open never picking up anyone else's votes on return. `staleTime` above already
    // makes rapid alt-tabbing free; this keeps the refresh a genuine return deserves.
    //
    // `undefined` is react-query's default, which is `true` — asserting it is not `false` rather
    // than that it equals `true`, since either spelling would be correct.
    expect(defaults?.refetchOnWindowFocus).not.toBe(false);
  });
});
