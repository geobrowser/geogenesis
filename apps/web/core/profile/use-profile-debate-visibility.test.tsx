import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import type * as React from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type PersonDebatesQueryData, personDebatesRowsQueryKey } from '~/core/debates/use-person-debates';
import type { ExploreFeedItem } from '~/core/explore/explore-card-item';
import { profileFactsQueryKey } from '~/core/io/subgraph/fetch-profile-facts';
import type { ProfileFacts } from '~/core/profile/profile-facts';

import { useProfileDebateVisibility } from './use-profile-debate-visibility';

const PERSONAL_SPACE = '11111111111111111111111111111111';
const PERSON = '22222222222222222222222222222222';
const DEBATE = '33333333333333333333333333333333';
const DEBATE_SPACE = '44444444444444444444444444444444';

const mocks = vi.hoisted(() => ({ makeProposal: vi.fn(), setToast: vi.fn() }));

vi.mock('~/core/hooks/use-publish', () => ({ usePublish: () => ({ makeProposal: mocks.makeProposal }) }));
vi.mock('~/core/hooks/use-toast', () => ({ useToast: () => [null, mocks.setToast] }));

const item = {
  entityId: DEBATE,
  spaceId: DEBATE_SPACE,
  title: 'A debate',
} as ExploreFeedItem;

function personDebates(): PersonDebatesQueryData {
  return {
    allRows: [item],
    sideByDebateId: new Map(),
    hiddenRelationsByDebateId: new Map(),
  };
}

function profileFacts(): ProfileFacts {
  return {
    debates: 1,
    totalDebates: 1,
    positions: 0,
    proposals: 0,
    spaces: [],
    verifiedBy: [],
    joinedAt: null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(next => {
    resolve = next;
  });
  return { promise, resolve };
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  mocks.makeProposal.mockReset();
  mocks.makeProposal.mockImplementation(async ({ onSuccess }: { onSuccess: () => void }) => onSuccess());
  mocks.setToast.mockReset();
});

describe('useProfileDebateVisibility cache coordination', () => {
  it('does not let pre-write refetches replace a successful hide', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const personKey = personDebatesRowsQueryKey(PERSONAL_SPACE);
    const factsKey = profileFactsQueryKey(PERSONAL_SPACE, PERSON);
    const stalePerson = personDebates();
    const staleFacts = profileFacts();
    client.setQueryData(personKey, stalePerson);
    client.setQueryData(factsKey, staleFacts);

    const personRequest = deferred<PersonDebatesQueryData>();
    const factsRequest = deferred<ProfileFacts>();
    const personFetch = client
      .fetchQuery({ queryKey: personKey, queryFn: () => personRequest.promise, staleTime: 0 })
      .catch(() => undefined);
    const factsFetch = client
      .fetchQuery({ queryKey: factsKey, queryFn: () => factsRequest.promise, staleTime: 0 })
      .catch(() => undefined);

    const { result } = renderHook(() => useProfileDebateVisibility(PERSONAL_SPACE), {
      wrapper: wrapper(client),
    });

    await act(async () => {
      expect(await result.current.setHidden(item, [], true)).toBe(true);
    });

    personRequest.resolve(stalePerson);
    factsRequest.resolve(staleFacts);
    await Promise.all([personFetch, factsFetch]);

    expect(client.getQueryData<PersonDebatesQueryData>(personKey)?.hiddenRelationsByDebateId.has(DEBATE)).toBe(true);
    expect(client.getQueryData<ProfileFacts>(factsKey)?.debates).toBe(0);
  });

  it('applies the hide count after an initially pending facts query resolves', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const personKey = personDebatesRowsQueryKey(PERSONAL_SPACE);
    const factsKey = profileFactsQueryKey(PERSONAL_SPACE, PERSON);
    client.setQueryData(personKey, personDebates());

    const factsRequest = deferred<ProfileFacts>();
    const factsFetch = client.fetchQuery({ queryKey: factsKey, queryFn: () => factsRequest.promise });
    const { result } = renderHook(() => useProfileDebateVisibility(PERSONAL_SPACE), {
      wrapper: wrapper(client),
    });

    await act(async () => {
      expect(await result.current.setHidden(item, [], true)).toBe(true);
    });

    factsRequest.resolve(profileFacts());
    await factsFetch;

    await waitFor(() => expect(client.getQueryData<ProfileFacts>(factsKey)?.debates).toBe(0));
  });
});
