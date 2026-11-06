import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { describe, expect, it, vi } from 'vitest';

import { unknownPerson, useChatPeople, useSpaceChatParticipants } from './people';

const mocks = vi.hoisted(() => ({
  participants: [] as unknown[],
  spacesByPageId: new Map<string, string>(),
  profilesBySpaceId: new Map<string, unknown>(),
}));

vi.mock('~/core/space-members/use-space-participants-infinite', () => ({
  useSpaceParticipantsInfinite: ({ kind }: { kind: string }) => ({
    participants: kind === 'members' ? mocks.participants : [],
  }),
}));
vi.mock('~/core/io/subgraph/fetch-personal-spaces-by-page-ids', () => ({
  fetchPersonalSpacesByPageIds: async () => mocks.spacesByPageId,
}));
vi.mock('~/core/hooks/use-profiles-by-space-ids', () => ({
  useProfilesBySpaceIds: () => ({ profilesBySpaceId: mocks.profilesBySpaceId }),
}));

const ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';
const profile = (id: string, name: string | null, address = ADDRESS) => ({
  id,
  spaceId: `space-${id}`,
  name,
  avatarUrl: null,
  address,
  profileLink: null,
});

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe('chat people without a profile name', () => {
  it('names a participant with no profile name by short address, or Anonymous without one', () => {
    mocks.participants = [profile('aaaa', null), profile('bbbb', '', 'not-an-address')];
    const { result } = renderHook(() => useSpaceChatParticipants('space', true), { wrapper });
    expect(result.current.map(person => person.name)).toEqual(['0x123456...345678', 'Anonymous']);
  });

  it('leaves an author with no personal space or profile out, for the Anonymous fallback', async () => {
    mocks.spacesByPageId = new Map([['cccc', 'space-cccc']]);
    mocks.profilesBySpaceId = new Map();
    const { result } = renderHook(() => useChatPeople(['dddd', 'cccc'], []), { wrapper });
    await waitFor(() => expect(result.current.size).toBe(0));
    expect(unknownPerson('dd-dd')).toMatchObject({ id: 'dddd', name: 'Anonymous' });
  });

  it('names a non-participant whose profile has no name by short address', async () => {
    mocks.spacesByPageId = new Map([['eeee', 'space-eeee']]);
    mocks.profilesBySpaceId = new Map([['space-eeee', profile('ignored', null)]]);
    const { result } = renderHook(() => useChatPeople(['eeee'], []), { wrapper });
    await waitFor(() => expect(result.current.get('eeee')?.name).toBe('0x123456...345678'));
  });
});
