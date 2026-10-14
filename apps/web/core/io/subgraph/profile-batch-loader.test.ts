import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Profile } from '~/core/types';

import { loadProfileBySpaceId } from './profile-batch-loader';

const fetchProfilesBySpaceIds = vi.hoisted(() => vi.fn());
vi.mock('./fetch-profile', () => ({ fetchProfilesBySpaceIds }));

const profile = (spaceId: string) => ({ spaceId, name: `Name ${spaceId}` }) as unknown as Profile;

beforeEach(() => {
  fetchProfilesBySpaceIds.mockReset();
  fetchProfilesBySpaceIds.mockImplementation((ids: string[]) => Effect.succeed(ids.map(profile)));
});

describe('loadProfileBySpaceId', () => {
  it('sends every space asked for in the same tick as one request, and a repeat once', async () => {
    const profiles = await Promise.all(['a', 'b', 'a'].map(loadProfileBySpaceId));

    expect(fetchProfilesBySpaceIds).toHaveBeenCalledTimes(1);
    expect(fetchProfilesBySpaceIds).toHaveBeenCalledWith(['a', 'b']);
    expect(profiles.map(p => p.spaceId)).toEqual(['a', 'b', 'a']);
  });

  it('splits more than 100 spaces into requests of 100', async () => {
    const ids = Array.from({ length: 150 }, (_, index) => `s${index}`);
    await Promise.all(ids.map(loadProfileBySpaceId));

    expect(fetchProfilesBySpaceIds.mock.calls.map(([batch]) => batch.length)).toEqual([100, 50]);
  });

  it('fails only a space the response has a hole for, and answers the rest', async () => {
    fetchProfilesBySpaceIds.mockImplementation((ids: string[]) =>
      Effect.succeed(ids.map(id => (id === 'gone' ? undefined : profile(id))))
    );

    const [gone, kept] = await Promise.allSettled([loadProfileBySpaceId('gone'), loadProfileBySpaceId('a')]);

    expect(gone).toMatchObject({ status: 'rejected', reason: new Error('No profile returned for space gone') });
    expect(kept).toMatchObject({ status: 'fulfilled', value: { spaceId: 'a' } });
  });

  it('fails every space in a request that fails', async () => {
    fetchProfilesBySpaceIds.mockImplementation(() => Effect.die(new Error('offline')));

    const results = await Promise.allSettled([loadProfileBySpaceId('a'), loadProfileBySpaceId('b')]);

    expect(results.map(result => result.status)).toEqual(['rejected', 'rejected']);
  });
});
