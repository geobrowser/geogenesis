import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProfileHistory } from '~/core/io/subgraph/fetch-profile-history';
import type { Profile } from '~/core/types';

const SPACE_A = '11111111111111111111111111111111';
const SPACE_B = '22222222222222222222222222222222';
const PERSON_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PERSON_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const mocks = vi.hoisted(() => ({
  profiles: new Map<string, Profile>(),
  fetchHistory: vi.fn<(entityId: string, spaceId: string) => Promise<ProfileHistory>>(),
}));

vi.mock('~/core/hooks/use-profiles-by-space-ids', () => ({
  useProfilesBySpaceIds: () => ({ profilesBySpaceId: mocks.profiles, isLoading: false }),
}));

vi.mock('~/core/io/subgraph/fetch-profile-history', () => ({
  profileHistoryQueryKey: (entityId: string | undefined, spaceId: string) => [
    'profile-history',
    entityId,
    spaceId,
  ],
  fetchProfileHistory: (entityId: string, spaceId: string) => mocks.fetchHistory(entityId, spaceId),
}));

import { useParticipantAffiliations } from './participant-affiliations';

const profile = (spaceId: string, id: string): Profile => ({
  id,
  spaceId,
  name: null,
  avatarUrl: null,
  coverUrl: null,
  profileLink: null,
  address: '0x0000000000000000000000000000000000000000',
});

const history = (role: string, organization: string): ProfileHistory =>
  ({
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
  mocks.fetchHistory.mockReset();
  mocks.fetchHistory.mockImplementation(async entityId =>
    entityId === PERSON_A ? history('Head of Product', 'Geo') : history('PhD student', 'Stanford')
  );
});

describe('useParticipantAffiliations', () => {
  it('resolves both personal spaces through their person entities', async () => {
    const { result } = renderHook(() => useParticipantAffiliations(participants), { wrapper: wrapper() });

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

  it('does not query history when the profile lookup has no person entity', () => {
    mocks.profiles = new Map([[SPACE_A, profile(SPACE_A, SPACE_A)]]);

    const { result } = renderHook(() => useParticipantAffiliations([participants[0]]), { wrapper: wrapper() });

    expect(result.current).toEqual(new Map());
    expect(mocks.fetchHistory).not.toHaveBeenCalled();
  });
});
