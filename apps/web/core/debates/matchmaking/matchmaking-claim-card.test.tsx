import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import type { ReactElement } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateClaimPositionSummary, DebateClaimSummary, MatchmakingReadiness } from '../api';
import { MatchmakingClaimCard } from './matchmaking-claim-card';

// Claim and space ids are knowledge-graph ids, so the fixtures have to be real ones — the card
// refuses to touch the graph for anything else. The space id is hoisted because `vi.mock` factories
// are lifted above every module-level declaration, so a mock that reads it can't use a plain const.
const mocks = vi.hoisted(() => ({
  joinMutateAsync: vi.fn(),
  leaveMutateAsync: vi.fn(),
  submitResponse: vi.fn(),
  indexing: { status: 'idle', pending: null, runId: null } as {
    status: 'idle' | 'reconciling' | 'delayed' | 'indexed';
    pending: { expectedResponse: 'positive' | 'negative' | null } | null;
    runId: string | null;
  },
  spaceName: 'Crypto',
  spaceId: '019fedae-72b6-7ab2-927a-df044d57c566',
  viewerSpaceId: 'personal-space',
}));

// The readiness switch shares the entity page's queue-backed machine, so it needs geo-chat auth
// and the join/leave mutations rather than the hub's old one-shot readiness mutation.
vi.mock('../hooks', () => ({
  // Mirrors the real key factory: the readiness machine refetches these families before it
  // retries a `claim_response_required`.
  debateQueryKeys: {
    matchmakingClaimsRoot: (accountKey: string | null) =>
      ['debates', 'account', accountKey, 'matchmaking-claims'] as const,
    matches: (accountKey: string | null) => ['debates', 'account', accountKey, 'matches'] as const,
    rematchRoot: (accountKey: string | null) => ['debates', 'account', accountKey, 'rematch'] as const,
  },
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'account-1' }),
  useJoinDebateQueue: () => ({ mutateAsync: mocks.joinMutateAsync, reset: vi.fn(), isPending: false, error: null }),
  useLeaveDebateQueue: () => ({ mutateAsync: mocks.leaveMutateAsync, isPending: false, error: null }),
}));

vi.mock('~/core/hooks/use-entity-vote', () => ({
  useEntityResponse: () => ({
    submitResponse: mocks.submitResponse,
    optimisticResponse: undefined,
    isProcessingResponse: false,
    isResponseIndexingDelayed: false,
    isConnected: true,
    personalSpaceId: mocks.viewerSpaceId,
  }),
  useEntityResponseIndexingSnapshot: () => mocks.indexing,
  useResetEntityResponseIndexingSnapshot: () => vi.fn(),
}));

// useSpaceLabels reads the browse sidebar's cache before falling back to the mock below. These
// suites render without a QueryClientProvider, so the read is stubbed as "nothing cached yet".
vi.mock('~/core/browse/use-browse-sidebar-cache', () => ({
  useBrowseSidebarQuerySource: () => ({
    personalSpaceId: null,
    walletAddress: undefined,
    keyInput: null,
    isLoading: false,
  }),
  useCachedBrowseSidebarData: () => null,
}));

// The viewer's own profile is already cached from the navbar, which is what lets their avatar join
// the side they picked without waiting on anything.
vi.mock('~/core/hooks/use-profiles-by-space-ids', () => ({
  useProfilesBySpaceIds: (spaceIds: string[]) => ({
    profilesBySpaceId: new Map(
      spaceIds.map(spaceId => [spaceId, { spaceId, name: 'You', avatarUrl: 'https://example.com/you.png' }])
    ),
    isLoading: false,
  }),
}));

vi.mock('~/design-system/avatar', () => ({
  Avatar: ({ avatarUrl }: { avatarUrl?: string | null }) => <span data-testid="avatar">{avatarUrl ?? 'none'}</span>,
}));

vi.mock('~/core/hooks/use-spaces-by-ids', () => ({
  useSpacesByIds: () => ({
    spaces: [],
    spacesById: new Map([[mocks.spaceId, { entity: { name: mocks.spaceName, image: null } }]]),
    isLoading: false,
  }),
}));

vi.mock('~/core/state/pending-personal-space', () => ({
  usePendingPersonalSpace: () => ({ isPending: false }),
}));

const SPACE_ID = mocks.spaceId;
const CLAIM_ENTITY_ID = '019fedb1-0c41-7f3e-9a11-2c7d5e8b4419';
const CLAIM_TEXT = 'Chips are better than fries';

const claim: DebateClaimSummary = {
  id: 'debate-claim-1',
  space_id: SPACE_ID,
  claim_entity_id: CLAIM_ENTITY_ID,
  claim: CLAIM_TEXT,
  description: null,
};

const positions: DebateClaimPositionSummary[] = [
  { position: true, position_label: 'Agree', total_count: 2, available_now_count: 1, participants: [] },
  { position: false, position_label: 'Disagree', total_count: 3, available_now_count: 2, participants: [] },
];

function readiness(overrides: Partial<MatchmakingReadiness> = {}): MatchmakingReadiness {
  return {
    response_kind: 'stance',
    viewer_response: { position: true, position_label: 'Agree' } as MatchmakingReadiness['viewer_response'],
    viewer_debate_ready: true,
    readiness_disabled_reason: null,
    ...overrides,
  };
}

const toggleName = 'Ready to debate this claim';

function renderCard(card: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{card}</QueryClientProvider>);
}

beforeEach(() => {
  mocks.joinMutateAsync.mockReset();
  mocks.joinMutateAsync.mockResolvedValue({ claim: null, match: null });
  mocks.leaveMutateAsync.mockReset();
  mocks.leaveMutateAsync.mockResolvedValue({ claim: null, match: null });
  mocks.submitResponse.mockReset();
  mocks.indexing = { status: 'idle', pending: null, runId: null };
  mocks.spaceName = 'Crypto';
  mocks.viewerSpaceId = 'personal-space';
});

afterEach(cleanup);

describe('MatchmakingClaimCard', () => {
  it('puts the debate toggle in the card header beside the space name', () => {
    renderCard(<MatchmakingClaimCard claim={claim} positions={positions} readiness={readiness()} />);

    const toggle = screen.getByRole('switch', { name: toggleName });
    const spaceName = screen.getByText('Crypto');

    // The header row is the toggle's own row: the space chip and the toggle share it, which is
    // what puts the toggle top-right rather than below the response buttons.
    const headerRow = toggle.parentElement?.parentElement;
    expect(headerRow).not.toBeNull();
    expect(headerRow?.contains(spaceName)).toBe(true);

    // ...and the header sits above the claim, so the toggle precedes it in the document.
    const claimText = screen.getByText(CLAIM_TEXT);
    expect(toggle.compareDocumentPosition(claimText) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the toggle above the response buttons', () => {
    renderCard(<MatchmakingClaimCard claim={claim} positions={positions} readiness={readiness()} />);

    const toggle = screen.getByRole('switch', { name: toggleName });
    const agree = screen.getByRole('button', { name: /^Agree/ });

    expect(toggle.compareDocumentPosition(agree) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('still heads the card with the toggle when the claim is not on the graph', () => {
    const offGraph = { ...claim, claim_entity_id: 'not-a-graph-id' };
    renderCard(<MatchmakingClaimCard claim={offGraph} positions={positions} readiness={readiness()} />);

    const toggle = screen.getByRole('switch', { name: toggleName });
    expect(toggle.parentElement?.parentElement?.contains(screen.getByText('Crypto'))).toBe(true);
    // The unavailable notice loses the toggle it used to sit beside, but must still be shown.
    expect(screen.getByText('Claim unavailable')).toBeInTheDocument();
  });

  // geo-chat owns the avatar stacks, and its copy trails the response by a publish, an index and a
  // notification. Filling the pill with your colour but not your face read as the response not
  // having counted.
  it('puts the viewer on the side they just took, before geo-chat reports them', () => {
    mocks.indexing = { status: 'reconciling', pending: { expectedResponse: 'negative' }, runId: 'run-1' };
    renderCard(
      <MatchmakingClaimCard
        claim={claim}
        positions={positions}
        readiness={readiness({ viewer_response: null, viewer_debate_ready: false })}
      />
    );

    // Three on the server plus the viewer: their face is shown, the other three counted over.
    const disagree = screen.getByRole('button', { name: /^Disagree/ });
    expect(within(disagree).getByTestId('avatar')).toHaveTextContent('https://example.com/you.png');
    expect(within(disagree).getByText('+3')).toBeInTheDocument();

    // The side they didn't take is left exactly as the server reported it.
    const agree = screen.getByRole('button', { name: /^Agree/ });
    expect(within(agree).queryByTestId('avatar')).not.toBeInTheDocument();
    expect(within(agree).getByText('+2')).toBeInTheDocument();
  });

  // The switch of sides, which the test above doesn't reach: it starts from no server position, so
  // nothing is ever removed. geo-chat ids are treated as possibly hyphenated in this directory
  // while `personalSpaceId` is bare hex, so a raw `!==` left the viewer drawn on the side they had
  // just left as well as the new one.
  it.each([
    ['bare hex', '019fedb10c417f3e9a112c7d5e8b4419'],
    ['hyphenated', '019fedb1-0c41-7f3e-9a11-2c7d5e8b4419'],
  ])('moves the viewer off the side they left when geo-chat reports a %s id', (_form, storedId) => {
    const held: DebateClaimPositionSummary[] = [
      {
        position: true,
        position_label: 'Agree',
        total_count: 2,
        available_now_count: 1,
        participants: [{ user_id: 'geo-chat-user', profile_space_id: storedId, display_name: 'You', avatar_cid: null }],
      },
      { position: false, position_label: 'Disagree', total_count: 3, available_now_count: 2, participants: [] },
    ];
    mocks.viewerSpaceId = '019fedb10c417f3e9a112c7d5e8b4419';
    mocks.indexing = { status: 'reconciling', pending: { expectedResponse: 'negative' }, runId: 'run-1' };
    renderCard(<MatchmakingClaimCard claim={claim} positions={held} readiness={readiness()} />);

    const agree = screen.getByRole('button', { name: /^Agree/ });
    const disagree = screen.getByRole('button', { name: /^Disagree/ });
    // One avatar, on the new side only — not one on each.
    expect(within(disagree).getAllByTestId('avatar')).toHaveLength(1);
    expect(within(agree).queryAllByTestId('avatar')).toHaveLength(0);
    expect(within(agree).getByText('+1')).toBeInTheDocument();
  });

  // The rematch picker locates the viewer in `positions` by geo-chat user id, which is null until
  // its token exchange lands. Adjusting from a "no position" that only means "don't know yet" drew
  // the viewer onto a second side while the summaries still counted them on the first.
  it('leaves the summaries alone while the viewer cannot be identified in them', () => {
    const held: DebateClaimPositionSummary[] = [
      {
        position: true,
        position_label: 'Agree',
        total_count: 2,
        available_now_count: 1,
        participants: [
          {
            user_id: 'geo-chat-user',
            profile_space_id: '019fedb10c417f3e9a112c7d5e8b4419',
            display_name: 'You',
            avatar_cid: null,
          },
        ],
      },
      { position: false, position_label: 'Disagree', total_count: 3, available_now_count: 2, participants: [] },
    ];
    mocks.viewerSpaceId = '019fedb10c417f3e9a112c7d5e8b4419';
    mocks.indexing = { status: 'reconciling', pending: { expectedResponse: 'negative' }, runId: 'run-1' };
    renderCard(
      <MatchmakingClaimCard
        claim={claim}
        positions={held}
        readiness={readiness({ viewer_response: null })}
        viewerIdentityPending
      />
    );

    const agree = screen.getByRole('button', { name: /^Agree/ });
    const disagree = screen.getByRole('button', { name: /^Disagree/ });
    expect(within(agree).getAllByTestId('avatar')).toHaveLength(1);
    expect(within(disagree).queryAllByTestId('avatar')).toHaveLength(0);
  });

  it('keeps the response pills live while the response is publishing', () => {
    mocks.indexing = { status: 'reconciling', pending: { expectedResponse: 'positive' }, runId: 'run-1' };
    renderCard(<MatchmakingClaimCard claim={claim} positions={positions} readiness={readiness()} />);

    // Dimmed, dead pills for the length of an indexing round trip read as a stuck response.
    expect(screen.getByRole('button', { name: /^Agree/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /^Disagree/ })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /^Disagree/ }));
    expect(mocks.submitResponse).toHaveBeenCalled();
  });

  it('leaves the toggle disabled and uncaptioned without a response', () => {
    // The card still shows what to do: the response pills render directly beneath this header,
    // so the disabled switch no longer carries a caption of its own.
    renderCard(
      <MatchmakingClaimCard
        claim={claim}
        positions={positions}
        readiness={readiness({ viewer_response: null, viewer_debate_ready: false })}
      />
    );

    expect(screen.getByRole('switch', { name: toggleName })).toBeDisabled();
    expect(screen.queryByText('Respond to this claim to debate it.')).not.toBeInTheDocument();
  });
});
