import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { profileBySpaceIdQueryKey } from '~/core/io/query-keys';

import { useParticipantAvatars } from './participant-avatars';

const SPACE = 'd077b06b40ed4eb994bfa71c3f6d1146';
const GRAPH = 'ipfs://QmGraphAvatar';

const loadProfileBySpaceId = vi.hoisted(() => vi.fn());

vi.mock('~/core/io/subgraph/profile-batch-loader', () => ({ loadProfileBySpaceId }));

function renderResolver(enabled: boolean, client: QueryClient) {
  const seen: Array<string | null> = [];

  function Probe() {
    const withAvatar = useParticipantAvatars([{ profile_space_id: SPACE, avatar_cid: null }], enabled);
    seen.push(withAvatar({ profile_space_id: SPACE, avatar_cid: null }).avatar_cid ?? null);

    return null;
  }

  render(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>
  );

  return seen;
}

afterEach(() => {
  cleanup();
  loadProfileBySpaceId.mockReset();
});

describe('useParticipantAvatars enabled', () => {
  // GEO-2841 review. `DebatesHubButton` mounts `useDebateRequests(false)` on every page purely to
  // read a badge count out of someone else's cache. Resolving avatars there would put profile
  // requests on the wire from the one caller that deliberately makes none.
  it('issues no profile request when the parent query is disabled', () => {
    renderResolver(false, new QueryClient({ defaultOptions: { queries: { retry: false } } }));

    expect(loadProfileBySpaceId).not.toHaveBeenCalled();
  });

  it('issues the request when the parent query is enabled', () => {
    loadProfileBySpaceId.mockResolvedValue({ avatarUrl: GRAPH });
    renderResolver(true, new QueryClient({ defaultOptions: { queries: { retry: false } } }));

    expect(loadProfileBySpaceId).toHaveBeenCalledWith(SPACE);
  });

  // Disabled is not blind: a surface that already resolved these faces keeps drawing them.
  it('still serves an already-cached profile while disabled', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(profileBySpaceIdQueryKey(SPACE), { avatarUrl: GRAPH });

    const seen = renderResolver(false, client);

    expect(loadProfileBySpaceId).not.toHaveBeenCalled();
    expect(seen.at(-1)).toBe(GRAPH);
  });
});
