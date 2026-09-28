import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { PropsWithChildren } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProfileHistory } from '~/core/io/subgraph/fetch-profile-history';
import type { Profile } from '~/core/types';

import { useParticipantBylines } from './participant-bylines';

const SPACE_A = '11111111111111111111111111111111';
const SPACE_A_DASHED = '11111111-1111-1111-1111-111111111111';
const SPACE_B = '22222222222222222222222222222222';
const PERSON_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PERSON_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const mocks = vi.hoisted(() => ({
  profiles: new Map<string, Profile>(),
  fetchHistory: vi.fn<(entityId: string, spaceId: string) => Promise<ProfileHistory>>(),
  profileLookup: vi.fn(),
}));

vi.mock('~/core/hooks/use-profiles-by-space-ids', () => ({
  useProfilesBySpaceIds: (spaceIds: string[], enabled: boolean) => mocks.profileLookup(spaceIds, enabled),
}));

vi.mock('~/core/io/subgraph/fetch-profile-history', () => ({
  profileHistoryQueryKey: (entityId: string | undefined, spaceId: string) => ['profile-history', entityId, spaceId],
  fetchProfileHistory: (entityId: string, spaceId: string) => mocks.fetchHistory(entityId, spaceId),
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

const history = (
  role: string,
  organization: string,
  description: string | null = null,
  tagline: string | null = null
): ProfileHistory =>
  ({
    tagline,
    description,
    employment: [
      {
        organization: { id: `org-${organization}`, name: organization },
        entries: [
          {
            subject: { id: `role-${role}`, name: role },
            startDate: '2025-01-01Z',
            endDate: null,
            status: 'current',
          },
        ],
      },
    ],
    education: [],
  }) as unknown as ProfileHistory;

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
  mocks.fetchHistory.mockReset();
  mocks.fetchHistory.mockImplementation(async entityId =>
    entityId === PERSON_A ? history('Head of Product', 'Geo') : history('PhD student', 'Stanford')
  );
});

describe('useParticipantBylines', () => {
  it('resolves both personal spaces through their person entities', async () => {
    const { result } = renderHook(() => useParticipantBylines(participants), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.size).toBe(2));

    expect(result.current).toEqual(
      new Map([
        [SPACE_A, 'Head of Product at Geo'],
        [SPACE_B, 'PhD student at Stanford'],
      ])
    );
    expect(mocks.fetchHistory).toHaveBeenCalledWith(PERSON_A, SPACE_A);
    expect(mocks.fetchHistory).toHaveBeenCalledWith(PERSON_B, SPACE_B);
  });

  it('prefers the tagline over a current affiliation and a description', async () => {
    mocks.fetchHistory.mockResolvedValue(
      history('Head of Product', 'Geo', 'Researcher exploring decentralized knowledge.', 'Building debates on Geo')
    );

    const { result } = renderHook(() => useParticipantBylines([participants[0]]), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.get(SPACE_A)).toBe('Building debates on Geo'));
  });

  it('falls back to the affiliation when there is no tagline', async () => {
    mocks.fetchHistory.mockResolvedValue(
      history('Head of Product', 'Geo', 'Researcher exploring decentralized knowledge.')
    );

    const { result } = renderHook(() => useParticipantBylines([participants[0]]), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.get(SPACE_A)).toBe('Head of Product at Geo'));
  });

  it('falls back to the profile description when there is no tagline or current affiliation', async () => {
    mocks.fetchHistory.mockResolvedValue({
      tagline: null,
      description: 'Researcher exploring decentralized knowledge.',
      employment: [],
      education: [],
    });

    const { result } = renderHook(() => useParticipantBylines([participants[0]]), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.get(SPACE_A)).toBe('Researcher exploring decentralized knowledge.'));
  });

  it('prefers a current affiliation over the profile description', async () => {
    mocks.fetchHistory.mockResolvedValue(history('Head of Product', 'Geo', 'Profile description'));

    const { result } = renderHook(() => useParticipantBylines([participants[0]]), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.get(SPACE_A)).toBe('Head of Product at Geo'));
  });

  it('does not query history when the profile lookup has no person entity', () => {
    mocks.profiles = new Map([[SPACE_A, profile(SPACE_A, SPACE_A)]]);

    const { result } = renderHook(() => useParticipantBylines([participants[0]]), { wrapper: wrapper() });

    expect(result.current).toEqual(new Map());
    expect(mocks.fetchHistory).not.toHaveBeenCalled();
  });

  it('keeps malformed participant ids out of the shared profile batch', async () => {
    const malformedSpaceId = 'not-a-space-id';
    mocks.profileLookup.mockImplementation((spaceIds: string[]) => ({
      // Model the batch endpoint rejecting the entire flush when any one id is malformed.
      profilesBySpaceId: spaceIds.includes(malformedSpaceId) ? new Map() : mocks.profiles,
      isLoading: false,
    }));
    const mixedParticipants = [participants[0], { profile_space_id: malformedSpaceId }] as const;

    const { result } = renderHook(() => useParticipantBylines(mixedParticipants), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.get(SPACE_A)).toBe('Head of Product at Geo'));
    expect(mocks.profileLookup).toHaveBeenCalledWith([SPACE_A], true);
  });

  it('normalizes a dashed participant space id before resolving its profile', async () => {
    const { result } = renderHook(() => useParticipantBylines([{ profile_space_id: SPACE_A_DASHED }]), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.get(SPACE_A)).toBe('Head of Product at Geo'));
    expect(mocks.profileLookup).toHaveBeenCalledWith([SPACE_A], true);
    expect(mocks.fetchHistory).toHaveBeenCalledWith(PERSON_A, SPACE_A);
  });
});
