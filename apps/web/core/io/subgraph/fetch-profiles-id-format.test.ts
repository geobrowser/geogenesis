import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { profileBySpaceIdQueryKey } from '~/core/io/query-keys';

const restFetch = vi.hoisted(() => vi.fn());

vi.mock('../rest', async importOriginal => ({
  ...(await importOriginal<typeof import('../rest')>()),
  restFetch,
}));

vi.mock('~/core/environment', () => ({ Environment: { getConfig: () => ({ api: 'https://api.test' }) } }));

const { fetchProfilesBySpaceIds } = await import('./fetch-profile');

const BARE = 'd077b06b40ed4eb994bfa71c3f6d1146';
const DASHED = 'd077b06b-40ed-4eb9-94bf-a71c3f6d1146';
const AVATAR = 'ipfs://QmAvatar';

/**
 * The batch endpoint may answer with the same bytes dashed or bare, and callers ask with whichever
 * spelling their own payload carried. Matching the two exactly meant a spelling disagreement
 * substituted `defaultProfile` for every row — which every reader downstream takes to mean the
 * person simply has no profile.
 */
describe('fetchProfilesBySpaceIds id formats', () => {
  it('matches a dashed response against a bare request', async () => {
    restFetch.mockReturnValue(
      Effect.succeed({
        profiles: [{ spaceId: DASHED, entityId: 'e1', name: 'Scot', avatarUrl: AVATAR, address: '0x1' }],
      })
    );

    const [profile] = await Effect.runPromise(fetchProfilesBySpaceIds([BARE]));

    expect(profile?.avatarUrl).toBe(AVATAR);
    expect(profile?.profileLink).not.toBeNull();
  });

  it('matches a bare response against a dashed request', async () => {
    restFetch.mockReturnValue(
      Effect.succeed({ profiles: [{ spaceId: BARE, entityId: 'e1', name: 'Scot', avatarUrl: AVATAR, address: '0x1' }] })
    );

    const [profile] = await Effect.runPromise(fetchProfilesBySpaceIds([DASHED]));

    expect(profile?.avatarUrl).toBe(AVATAR);
  });

  it('still falls back to a default profile for an id the response omits', async () => {
    restFetch.mockReturnValue(Effect.succeed({ profiles: [] }));

    const [profile] = await Effect.runPromise(fetchProfilesBySpaceIds([BARE]));

    expect(profile?.avatarUrl).toBeNull();
    expect(profile?.profileLink).toBeNull();
  });
});

describe('profileBySpaceIdQueryKey', () => {
  // Three writers seed this entry from three different payloads; they have to agree on a spelling
  // or one writer's value sits unread beside another's request for the same person.
  it('keys the two spellings of one space to the same entry', () => {
    expect(profileBySpaceIdQueryKey(DASHED)).toEqual(profileBySpaceIdQueryKey(BARE));
  });

  it('passes a non-space id through rather than collapsing every bad key together', () => {
    expect(profileBySpaceIdQueryKey('not-a-space')).toEqual(['profile-by-space-id', 'not-a-space']);
  });
});
