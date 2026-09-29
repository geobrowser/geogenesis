import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { PropsWithChildren } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Profile } from '~/core/types';

import { useParticipantProfiles } from './participant-bylines';
import type { ParticipantProfile } from './participant-profile';

const SPACE_A = '11111111111111111111111111111111';
const SPACE_A_DASHED = '11111111-1111-1111-1111-111111111111';
const SPACE_B = '22222222222222222222222222222222';
const PERSON_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PERSON_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const mocks = vi.hoisted(() => ({
  profiles: new Map<string, Profile>(),
  fetchProfile: vi.fn<(entityId: string, spaceId: string) => Promise<ParticipantProfile>>(),
  profileLookup: vi.fn(),
}));

vi.mock('~/core/hooks/use-profiles-by-space-ids', () => ({
  useProfilesBySpaceIds: (spaceIds: string[], enabled: boolean) => mocks.profileLookup(spaceIds, enabled),
}));

vi.mock('./participant-profile', () => ({
  fetchParticipantProfile: (entityId: string, spaceId: string) => mocks.fetchProfile(entityId, spaceId),
}));

const profile = (spaceId: string, id: string): Profile => ({
  id,
  spaceId,
  name: null,
  avatarUrl: null,
  coverUrl: null,
  profileLink: null,
  address: '0x0000000000000000000000000000000000000000',
});

const resolvedProfile = (byline: string): ParticipantProfile => ({
  name: 'Person',
  avatarUrl: 'ipfs://avatar',
  byline,
});

const participants = [{ profile_space_id: SPACE_A }, { profile_space_id: SPACE_B }] as const;

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  mocks.profiles = new Map([
    [SPACE_A, profile(SPACE_A, PERSON_A)],
    [SPACE_B, profile(SPACE_B, PERSON_B)],
  ]);
  mocks.profileLookup.mockReset();
  mocks.profileLookup.mockImplementation(() => ({ profilesBySpaceId: mocks.profiles, isLoading: false }));
  mocks.fetchProfile.mockReset();
  mocks.fetchProfile.mockImplementation(async entityId =>
    entityId === PERSON_A ? resolvedProfile('Head of Product at Geo') : resolvedProfile('PhD student at Stanford')
  );
});

describe('useParticipantProfiles', () => {
  it('resolves both personal spaces through their person entities', async () => {
    const { result } = renderHook(() => useParticipantProfiles(participants), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.size).toBe(2));

    expect(result.current).toEqual(
      new Map([
        [SPACE_A, resolvedProfile('Head of Product at Geo')],
        [SPACE_B, resolvedProfile('PhD student at Stanford')],
      ])
    );
    expect(mocks.fetchProfile).toHaveBeenCalledWith(PERSON_A, SPACE_A);
    expect(mocks.fetchProfile).toHaveBeenCalledWith(PERSON_B, SPACE_B);
  });

  it('does not fetch profiles for inactive videos', () => {
    renderHook(() => useParticipantProfiles(participants, false), { wrapper: wrapper() });
    expect(mocks.profileLookup).toHaveBeenCalledWith([SPACE_A, SPACE_B], false);
    expect(mocks.fetchProfile).not.toHaveBeenCalled();
  });

  it('does not query history when the profile lookup has no person entity', () => {
    mocks.profiles = new Map([[SPACE_A, profile(SPACE_A, SPACE_A)]]);

    const { result } = renderHook(() => useParticipantProfiles([participants[0]]), { wrapper: wrapper() });

    expect(result.current).toEqual(new Map());
    expect(mocks.fetchProfile).not.toHaveBeenCalled();
  });

  it('keeps malformed participant ids out of the shared profile batch', async () => {
    const malformedSpaceId = 'not-a-space-id';
    mocks.profileLookup.mockImplementation((spaceIds: string[]) => ({
      // Model the batch endpoint rejecting the entire flush when any one id is malformed.
      profilesBySpaceId: spaceIds.includes(malformedSpaceId) ? new Map() : mocks.profiles,
      isLoading: false,
    }));
    const mixedParticipants = [participants[0], { profile_space_id: malformedSpaceId }] as const;

    const { result } = renderHook(() => useParticipantProfiles(mixedParticipants), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.get(SPACE_A)?.byline).toBe('Head of Product at Geo'));
    expect(mocks.profileLookup).toHaveBeenCalledWith([SPACE_A], true);
  });

  it('normalizes a dashed participant space id before resolving its profile', async () => {
    const { result } = renderHook(() => useParticipantProfiles([{ profile_space_id: SPACE_A_DASHED }]), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.get(SPACE_A)?.byline).toBe('Head of Product at Geo'));
    expect(mocks.profileLookup).toHaveBeenCalledWith([SPACE_A], true);
    expect(mocks.fetchProfile).toHaveBeenCalledWith(PERSON_A, SPACE_A);
  });
});
