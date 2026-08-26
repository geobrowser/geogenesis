import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ParticipantAvatarStrip } from './participant-avatar-strip';

const mocks = vi.hoisted(() => ({
  participants: [] as unknown[],
  /** Records the ids the strip actually asks for, and supplies their avatars. */
  requestedSpaceIds: vi.fn(),
  avatarUrlBySpaceId: new Map<string, string | null>(),
}));

vi.mock('~/core/community-calls/api', () => ({
  getLiveParticipants: () => Promise.resolve({ participants: mocks.participants, isEnded: false }),
}));

vi.mock('~/core/hooks/use-profiles-by-space-ids', () => ({
  useProfilesBySpaceIds: (spaceIds: string[]) => {
    mocks.requestedSpaceIds(spaceIds);
    return {
      profilesBySpaceId: new Map(
        spaceIds.map(spaceId => [spaceId, { spaceId, avatarUrl: mocks.avatarUrlBySpaceId.get(spaceId) ?? null }])
      ),
      isLoading: false,
    };
  },
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
  mocks.requestedSpaceIds.mockReset();
  mocks.avatarUrlBySpaceId = new Map();
  mocks.participants = [];
});

describe('ParticipantAvatarStrip avatars', () => {
  it('uses the Geo profile avatar when the call record carries no cid', async () => {
    // The reported case: curator-backend mints the token from its own profile store, so
    // someone whose avatar lives in the knowledge graph arrived with avatarCid: null and
    // rendered a generated avatar while the leaderboard showed their real photo.
    mocks.participants = [participant({ avatarCid: null })];
    mocks.avatarUrlBySpaceId.set('space-1', 'ipfs://real-avatar');

    const { container } = renderStrip();

    await waitFor(() => expect(images(container)[0]).toHaveAttribute('src', expect.stringContaining('real-avatar')));
  });

  it('resolves profiles by the participant identity, which is their space id', async () => {
    mocks.participants = [participant({ identity: 'space-42' })];
    mocks.avatarUrlBySpaceId.set('space-42', 'ipfs://a');

    renderStrip();

    await waitFor(() => expect(mocks.requestedSpaceIds).toHaveBeenCalledWith(['space-42']));
  });

  it('prefers the graph avatar over the call cid when a participant has both', async () => {
    // The precedence rule is the whole point of the change, and every other case here
    // leaves one of the two sources empty — so reversing `avatarFor` would keep them all
    // green. This is the one that pins the direction.
    mocks.participants = [participant({ avatarCid: 'cid-from-call' })];
    mocks.avatarUrlBySpaceId.set('space-1', 'ipfs://graph-avatar');

    const { container } = renderStrip();

    await waitFor(() => expect(images(container)[0]).toHaveAttribute('src'));
    const src = images(container)[0]?.getAttribute('src') ?? '';
    expect(src).toContain('graph-avatar');
    expect(src).not.toContain('cid-from-call');
  });

  it('falls back to the call cid when the graph has no avatar for them', async () => {
    mocks.participants = [participant({ avatarCid: 'cid-from-call' })];
    // Present in the graph, but with no avatar of their own.

    const { container } = renderStrip();

    await waitFor(() => expect(images(container)[0]).toHaveAttribute('src', expect.stringContaining('cid-from-call')));
  });

  it('resolves the overflow cluster too, not just the visible avatars', async () => {
    // The "+N more" cell had the same bug.
    mocks.participants = Array.from({ length: 6 }, (_, i) =>
      participant({ identity: `space-${i}`, name: `P${i}`, avatarCid: null })
    );
    for (let i = 0; i < 6; i++) mocks.avatarUrlBySpaceId.set(`space-${i}`, `ipfs://avatar-${i}`);

    const { container } = renderStrip();

    // 4 visible + 2 in the overflow grid all resolve to real images.
    await waitFor(() => expect(images(container)).toHaveLength(6));
    expect(screen.getByText('+2 more')).toBeInTheDocument();
    expect(images(container).at(-1)).toHaveAttribute('src', expect.stringContaining('avatar-5'));
  });

  it('only looks up the participants whose avatars are rendered', async () => {
    // Eight cells render at most (four visible plus the 2x2 overflow). Asking for the
    // whole room would fetch profiles nothing shows, and `fetchProfilesBySpaceIds` sends
    // one unchunked request whose failure path returns defaults for every id — so a
    // merely-popular call could lose all of its avatars.
    mocks.participants = Array.from({ length: 30 }, (_, i) => participant({ identity: `space-${i}`, name: `P${i}` }));

    renderStrip();

    // The first render precedes the participants query resolving, so wait for the
    // lookup that follows it rather than the initial empty one.
    await waitFor(() => {
      const requested = mocks.requestedSpaceIds.mock.calls.at(-1)?.[0] as string[];
      expect(requested).toEqual(Array.from({ length: 8 }, (_, i) => `space-${i}`));
    });
  });
});