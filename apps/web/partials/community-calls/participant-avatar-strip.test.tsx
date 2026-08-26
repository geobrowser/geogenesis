import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

import { Effect } from 'effect';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ParticipantAvatarStrip } from './participant-avatar-strip';

const mocks = vi.hoisted(() => ({
  participants: [] as unknown[],
  profilesBySpaceIds: vi.fn(),
}));

vi.mock('~/core/community-calls/api', () => ({
  getLiveParticipants: () => Promise.resolve({ participants: mocks.participants, isEnded: false }),
}));

vi.mock('~/core/io/subgraph/fetch-profile', () => ({
  fetchProfilesBySpaceIds: (spaceIds: string[]) => Effect.succeed(mocks.profilesBySpaceIds(spaceIds)),
}));

function participant(overrides: Record<string, unknown> = {}) {
  return {
    identity: 'space-1',
    name: 'CptMoh',
    joinedAt: 0,
    isAdmin: false,
    avatarCid: null,
    isEditor: true,
    isMember: true,
    ...overrides,
  };
}

/** `Avatar` renders `<img alt="">`, which carries role="presentation" rather than "img". */
function images(container: HTMLElement) {
  return [...container.querySelectorAll('img')];
}

function renderStrip() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ParticipantAvatarStrip spaceId="space-a" callId="call-a" occurrenceStart={1} />
    </QueryClientProvider>
  );
}

afterEach(cleanup);
beforeEach(() => {
  mocks.profilesBySpaceIds.mockReset();
  mocks.participants = [];
});

describe('ParticipantAvatarStrip avatars', () => {
  it('uses the Geo profile avatar when the call record carries no cid', async () => {
    // The reported case: curator-backend mints the token from its own profile store, so
    // someone whose avatar lives in the knowledge graph arrived with avatarCid: null and
    // rendered a generated avatar while the leaderboard showed their real photo.
    mocks.participants = [participant({ avatarCid: null })];
    mocks.profilesBySpaceIds.mockReturnValue([{ avatarUrl: 'ipfs://real-avatar' }]);

    const { container } = renderStrip();

    await waitFor(() => expect(images(container)[0]).toHaveAttribute('src', expect.stringContaining('real-avatar')));
  });

  it('resolves profiles by the participant identity, which is their space id', async () => {
    mocks.participants = [participant({ identity: 'space-42' })];
    mocks.profilesBySpaceIds.mockReturnValue([{ avatarUrl: 'ipfs://a' }]);

    renderStrip();

    await waitFor(() => expect(mocks.profilesBySpaceIds).toHaveBeenCalledWith(['space-42']));
  });

  it('falls back to the call cid when the graph has no avatar for them', async () => {
    mocks.participants = [participant({ avatarCid: 'cid-from-call' })];
    mocks.profilesBySpaceIds.mockReturnValue([{ avatarUrl: null }]);

    const { container } = renderStrip();

    await waitFor(() => expect(images(container)[0]).toHaveAttribute('src', expect.stringContaining('cid-from-call')));
  });

  it('resolves the overflow cluster too, not just the visible avatars', async () => {
    // The "+N more" cell had the same bug.
    mocks.participants = Array.from({ length: 6 }, (_, i) =>
      participant({ identity: `space-${i}`, name: `P${i}`, avatarCid: null })
    );
    mocks.profilesBySpaceIds.mockReturnValue(
      Array.from({ length: 6 }, (_, i) => ({ avatarUrl: `ipfs://avatar-${i}` }))
    );

    const { container } = renderStrip();

    // 4 visible + 2 in the overflow grid all resolve to real images.
    await waitFor(() => expect(images(container)).toHaveLength(6));
    expect(screen.getByText('+2 more')).toBeInTheDocument();
    expect(images(container).at(-1)).toHaveAttribute('src', expect.stringContaining('avatar-5'));
  });
});
