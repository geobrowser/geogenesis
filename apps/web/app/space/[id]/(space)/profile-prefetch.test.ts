import { afterEach, describe, expect, it, vi } from 'vitest';

import { profileFactsQueryKey } from '~/core/io/subgraph/fetch-profile-facts';
import { profileHistoryQueryKey } from '~/core/io/subgraph/fetch-profile-history';
import { NO_FACTS } from '~/core/profile/profile-facts';

import { prefetchProfileQueries } from './profile-prefetch';

const mocks = vi.hoisted(() => ({
  facts: vi.fn(),
  history: vi.fn(),
}));

vi.mock('~/core/io/subgraph/fetch-profile-facts', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/io/subgraph/fetch-profile-facts')>()),
  fetchProfileFacts: (...args: unknown[]) => mocks.facts(...args),
}));

vi.mock('~/core/io/subgraph/fetch-profile-history', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/io/subgraph/fetch-profile-history')>()),
  fetchProfileHistory: (...args: unknown[]) => mocks.history(...args),
}));

const SPACE = 'f3dab79cb5a3d9d1759656dd5361d1c6';
const PERSON = '6caf2067e9a64f3696ff22fb7bc94947';

const HISTORY = { employment: [], education: [] };

const hashes = (state: Awaited<ReturnType<typeof prefetchProfileQueries>>['dehydratedState']) =>
  state.queries.map(query => query.queryHash);

/**
 * The profile's two reads, made on the server and handed to the client.
 *
 * Both were already happening — the facts twice, once here for the tab counts
 * and again in the rail after hydration; the history only on the client, a round
 * trip after the page it belongs to.
 */
describe('prefetchProfileQueries', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('hands over both reads under the keys their hooks use', async () => {
    mocks.facts.mockResolvedValue({ ...NO_FACTS, debates: 10 });
    mocks.history.mockResolvedValue(HISTORY);

    const { dehydratedState } = await prefetchProfileQueries(SPACE, PERSON);

    // The exact keys, because a key that does not match is a silent miss: the
    // hook simply makes the request it was always making.
    expect(hashes(dehydratedState)).toEqual(
      expect.arrayContaining([
        JSON.stringify(profileFactsQueryKey(SPACE, PERSON)),
        JSON.stringify(profileHistoryQueryKey(PERSON, SPACE)),
      ])
    );
  });

  it('returns the counts the tab bar reads', async () => {
    mocks.facts.mockResolvedValue({ ...NO_FACTS, debates: 10, positions: 243, proposals: 812 });
    mocks.history.mockResolvedValue(HISTORY);

    const { facts } = await prefetchProfileQueries(SPACE, PERSON);

    expect(facts).toMatchObject({ debates: 10, positions: 243, proposals: 812 });
  });

  it('carries no facts and no handover when the read fails', async () => {
    // `fetchProfileFacts` throws so the rail can draw a dash rather than a
    // confident zero. Dehydrating a failure would hand the client that error
    // instead of letting it make its own request — and `undefined` counts are
    // what tells the tab bar to offer every tab.
    mocks.facts.mockRejectedValue(new Error('nope'));
    mocks.history.mockResolvedValue(HISTORY);

    const { facts, dehydratedState } = await prefetchProfileQueries(SPACE, PERSON);

    expect(facts).toBeNull();
    expect(hashes(dehydratedState)).toEqual([JSON.stringify(profileHistoryQueryKey(PERSON, SPACE))]);
  });

  it('does not ask for the history of a space with no person on it', async () => {
    mocks.facts.mockResolvedValue(NO_FACTS);

    await prefetchProfileQueries(SPACE, '');

    expect(mocks.history).not.toHaveBeenCalled();
  });

  it('survives a history read that fails, keeping the facts', async () => {
    mocks.facts.mockResolvedValue({ ...NO_FACTS, debates: 4 });
    mocks.history.mockRejectedValue(new Error('nope'));

    const { facts, dehydratedState } = await prefetchProfileQueries(SPACE, PERSON);

    expect(facts).toMatchObject({ debates: 4 });
    expect(hashes(dehydratedState)).toEqual([JSON.stringify(profileFactsQueryKey(SPACE, PERSON))]);
  });
});
