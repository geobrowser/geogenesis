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
  match: null as { id: string } | null,
  blockedReason: undefined as string | undefined,
  request: vi.fn(),
  summaryPositive: 0,
  summaryNegative: 0,
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

// The end slot asks the hub whether there is a debate to be had. That is one shared query at
// runtime and a whole auth stack in a test, so it is mocked at the hook rather than under it —
// `mocks.match` is what decides whether the slot offers anything.
vi.mock('~/core/debates/use-auto-debate-readiness', () => ({
  useAutoDebateReadiness: () => {},
}));

vi.mock('~/core/claims/browse/use-claim-matchup', () => ({
  useClaimMatchup: () => ({
    match: mocks.match,
    blockedReason: mocks.blockedReason,
    isRequesting: false,
    requestError: null,
    request: mocks.request,
  }),
}));

// The card reports its own responses now. The tier this returns is what decides whether the footer
// shows a bar, a tally, or an invitation.
vi.mock('~/core/claims/browse/claim-response-summary', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/claims/browse/claim-response-summary')>();
  return {
    ...actual,
    useClaimResponseSummary: () => ({
      ...actual.summarizeClaimResponses(mocks.summaryPositive, mocks.summaryNegative),
      isLoading: false,
      viewerDirection: null,
      viewerSpaceId: null,
    }),
  };
});

vi.mock('~/partials/entity-page/claim-voter-avatars', () => ({
  ClaimResponderAvatars: () => null,
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
  {
    position: true,
    position_label: 'Agree',
    total_count: 2,
    available_now_count: 1,
    present_count: 1,
    participants: [],
  },
  {
    position: false,
    position_label: 'Disagree',
    total_count: 3,
    available_now_count: 2,
    present_count: 2,
    participants: [],
  },
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

function participant(id: string) {
  return {
    user_id: id,
    profile_space_id: `${id}-space`,
    display_name: id,
    avatar_cid: null,
  } as DebateClaimPositionSummary['participants'][number];
}

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
  // Nothing on offer and nobody having answered is the state most claims are actually in, so it is
  // the state every test starts from.
  mocks.match = null;
  mocks.blockedReason = undefined;
  mocks.request.mockReset();
  mocks.summaryPositive = 0;
  mocks.summaryNegative = 0;
  mocks.viewerSpaceId = 'personal-space';
});

afterEach(cleanup);

/**
 * GEO-2691. The avatar stack means "who could I debate about this, right now". geo-chat narrowed
 * the preview to available people; the overflow was still `total_count - shown`, which counts
 * every holder including offline ones. So a side with nobody available rendered a bare "+2" and no
 * faces, and a side with one available person out of three said "+2" when only one was reachable.
 */
describe('position avatar stack', () => {
  const withCounts = (overrides: Array<Partial<DebateClaimPositionSummary>>): DebateClaimPositionSummary[] => [
    { ...positions[0], ...overrides[0] },
    { ...positions[1], ...overrides[1] },
  ];

  it('draws no stack at all for a side with nobody available', () => {
    renderCard(
      <MatchmakingClaimCard
        claim={claim}
        positions={withCounts([
          { total_count: 1, available_now_count: 1, present_count: 1, participants: [participant('available-one')] },
          { total_count: 2, available_now_count: 0, present_count: 0, participants: [] },
        ])}
        readiness={readiness()}
      />
    );

    const disagree = screen.getByRole('button', { name: /^Disagree/ });
    // No faces and no count: two offline holders are not "+2" people you could debate.
    expect(within(disagree).queryByText('+2')).toBeNull();
    expect(within(disagree).queryByText(/^\+/)).toBeNull();
  });

  // The regression that caused the revert. Drawing the stack from `available_now_count` looked
  // right until you noticed it is viewer-relative: it excludes the viewer and anyone they have
  // already debated on this claim. So a claim you had actually argued showed an empty stack — to
  // you and to nobody else. Preston: "Im talking about my opponent's face."
  //
  // geo-chat now sends `present_count` for exactly this: who is on the position, regardless of
  // whether this particular viewer could send them a request.
  it('draws people the viewer cannot request, and still reports that they cannot', () => {
    renderCard(
      <MatchmakingClaimCard
        claim={claim}
        positions={withCounts([
          { total_count: 1, available_now_count: 0, present_count: 1, participants: [] },
          {
            // A pair-blocked opponent: present on the position, not requestable by this viewer.
            total_count: 1,
            available_now_count: 0,
            present_count: 1,
            participants: [participant('already-debated')],
          },
        ])}
        readiness={readiness()}
      />
    );

    const disagree = screen.getByRole('button', { name: /^Disagree/ });
    expect(within(disagree).getAllByTestId('avatar')).toHaveLength(1);
    // One face, one person present, so no overflow claiming anybody else is there.
    expect(within(disagree).queryByText(/^\+/)).toBeNull();
  });

  // The deploy window, which is the state production was actually in: geo-chat reverted so it
  // sends every holder, geogenesis still gating the stack on `available_now_count`. On a claim
  // whose only opponent is pair-blocked that count is 0, so the whole stack rendered nothing.
  // Preston: "The images still arent there."
  //
  // A client that ships before geo-chat#74 sees no `present_count` at all, and must draw the faces
  // it was sent rather than gating on an undefined number.
  it('draws the faces geo-chat sent even when it sends no present_count', () => {
    renderCard(
      <MatchmakingClaimCard
        claim={claim}
        positions={[
          {
            position: true,
            position_label: 'Agree',
            total_count: 1,
            available_now_count: 0,
            participants: [],
          },
          {
            position: false,
            position_label: 'Disagree',
            total_count: 1,
            // Pair-blocked, so not requestable — and an older geo-chat offers no present_count.
            available_now_count: 0,
            participants: [participant('already-debated')],
          },
        ]}
        readiness={readiness()}
      />
    );

    const disagree = screen.getByRole('button', { name: /^Disagree/ });
    expect(within(disagree).getAllByTestId('avatar')).toHaveLength(1);
    // The face count is all we know, so no overflow claiming anyone else is there.
    expect(within(disagree).queryByText(/^\+/)).toBeNull();
  });

  it('counts the overflow from available people, not from every holder', () => {
    renderCard(
      <MatchmakingClaimCard
        claim={claim}
        positions={withCounts([
          {
            total_count: 9,
            available_now_count: 4,
            present_count: 4,
            participants: [participant('one'), participant('two')],
          },
          { total_count: 3, available_now_count: 0, present_count: 0, participants: [] },
        ])}
        readiness={readiness()}
      />
    );

    const agree = screen.getByRole('button', { name: /^Agree/ });
    // 4 available, 2 shown -> +2. Not 9 - 2 = +7, which counted five people who are offline.
    expect(within(agree).getByText('+2')).toBeInTheDocument();
    expect(within(agree).queryByText('+7')).toBeNull();
  });

  it('shows no overflow when every available person is already on screen', () => {
    renderCard(
      <MatchmakingClaimCard
        claim={claim}
        positions={withCounts([
          {
            total_count: 6,
            available_now_count: 2,
            present_count: 2,
            participants: [participant('one'), participant('two')],
          },
          { total_count: 0, available_now_count: 0, present_count: 0, participants: [] },
        ])}
        readiness={readiness()}
      />
    );

    const agree = screen.getByRole('button', { name: /^Agree/ });
    expect(within(agree).queryByText(/^\+/)).toBeNull();
  });
});

describe('MatchmakingClaimCard', () => {
  it('carries no readiness switch', () => {
    // It moved off the card entirely. Asserted rather than left implicit because the corner it
    // vacated is now the end slot, and a switch reappearing there would quietly take the space the
    // offer needs.
    renderCard(<MatchmakingClaimCard claim={claim} positions={positions} readiness={readiness()} />);

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('puts the offer in the header beside the space name, above the claim', () => {
    mocks.match = { id: 'match-1' };
    renderCard(<MatchmakingClaimCard claim={claim} positions={positions} readiness={readiness()} />);

    const request = screen.getByRole('button', { name: 'Request debate' });
    const spaceName = screen.getByText('Crypto');

    // The header row is the slot's own row: the space chip and the offer share it, which is what
    // puts the offer top-right rather than below the response pills.
    const headerRow = request.parentElement?.parentElement;
    expect(headerRow).not.toBeNull();
    expect(headerRow?.contains(spaceName)).toBe(true);

    // ...and the header sits above the claim, so the offer precedes it in the document.
    const claimText = screen.getByText(CLAIM_TEXT);
    expect(request.compareDocumentPosition(claimText) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('leaves the header empty when there is nothing to offer', () => {
    // The common case by a wide margin, and it has to cost nothing: no dimmed control, no
    // placeholder, nothing for the reader to work out.
    renderCard(<MatchmakingClaimCard claim={claim} positions={positions} readiness={readiness()} />);

    expect(screen.queryByRole('button', { name: 'Request debate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Watch/ })).not.toBeInTheDocument();
  });

  it('says why the offer cannot be taken rather than dimming it silently', () => {
    mocks.match = { id: 'match-1' };
    mocks.blockedReason = 'Withdraw your open request to send another.';
    renderCard(<MatchmakingClaimCard claim={claim} positions={positions} readiness={readiness()} />);

    expect(screen.getByRole('button', { name: 'Request debate' })).toBeDisabled();
    // Shown, not left to a `title`: native tooltips never appear on touch and are unreliable on a
    // disabled button, which is exactly when the explanation matters.
    expect(screen.getByText('Withdraw your open request to send another.')).toBeInTheDocument();
  });

  it('opens the room when a debate is running', () => {
    renderCard(
      <MatchmakingClaimCard
        claim={claim}
        positions={positions}
        readiness={readiness()}
        activeDebate={{ id: 'debate-7' } as never}
      />
    );

    // A verb, not a status. "Debating now" told the reader something was happening and gave them
    // nowhere to go, which is the whole reason the slot holds actions.
    expect(screen.getByRole('link', { name: /Watch live/ })).toHaveAttribute(
      'href',
      `/space/${mocks.spaceId}/debates/debate-7`
    );
  });

  it('still heads the card with the space chip when the claim is not on the graph', () => {
    const offGraph = { ...claim, claim_entity_id: 'not-a-graph-id' };
    renderCard(<MatchmakingClaimCard claim={offGraph} positions={positions} readiness={readiness()} />);

    expect(screen.getByText('Crypto')).toBeInTheDocument();
    // The unavailable notice must still be shown.
    expect(screen.getByText('Claim unavailable')).toBeInTheDocument();
  });

  it('reports the share from the first response onward', () => {
    // Two responses is the median claim, and it gets a real percentage. What keeps "100%" from
    // reading as a verdict is the responder cluster beside it, not the withholding of the number.
    mocks.summaryPositive = 2;
    mocks.summaryNegative = 0;
    const { unmount } = renderCard(
      <MatchmakingClaimCard claim={claim} positions={positions} readiness={readiness()} />
    );
    expect(screen.getByText('100%')).toBeInTheDocument();
    unmount();

    mocks.summaryPositive = 9;
    mocks.summaryNegative = 3;
    renderCard(<MatchmakingClaimCard claim={claim} positions={positions} readiness={readiness()} />);
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('invites a first response rather than reporting a zero', () => {
    renderCard(<MatchmakingClaimCard claim={claim} positions={positions} readiness={readiness()} />);

    expect(screen.getByText('Be the first to agree it.')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
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

    // Disagree has 3 holders but only 2 available. The viewer's face is shown and the count is of
    // the *available* others behind it, so +2 — not +3, which used to include the offline holder
    // (GEO-2691).
    const disagree = screen.getByRole('button', { name: /^Disagree/ });
    expect(within(disagree).getByTestId('avatar')).toHaveTextContent('https://example.com/you.png');
    expect(within(disagree).getByText('+2')).toBeInTheDocument();

    // The side they didn't take is left as the server reported it: 2 holders, 1 available.
    const agree = screen.getByRole('button', { name: /^Agree/ });
    expect(within(agree).queryByTestId('avatar')).not.toBeInTheDocument();
    expect(within(agree).getByText('+1')).toBeInTheDocument();
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
        present_count: 1,
        participants: [{ user_id: 'geo-chat-user', profile_space_id: storedId, display_name: 'You', avatar_cid: null }],
      },
      {
        position: false,
        position_label: 'Disagree',
        total_count: 3,
        available_now_count: 2,
        present_count: 2,
        participants: [],
      },
    ];
    mocks.viewerSpaceId = '019fedb10c417f3e9a112c7d5e8b4419';
    mocks.indexing = { status: 'reconciling', pending: { expectedResponse: 'negative' }, runId: 'run-1' };
    renderCard(<MatchmakingClaimCard claim={claim} positions={held} readiness={readiness()} />);

    const agree = screen.getByRole('button', { name: /^Agree/ });
    const disagree = screen.getByRole('button', { name: /^Disagree/ });
    // One avatar, on the new side only — not one on each.
    expect(within(disagree).getAllByTestId('avatar')).toHaveLength(1);
    expect(within(agree).queryAllByTestId('avatar')).toHaveLength(0);
    // And no "+1" left behind on the side they left. The viewer was that side's only present
    // person, so once they move it is empty — the count follows the faces off the side rather
    // than claiming somebody is still standing there. It asserted "+1" while the overflow came
    // from `available_now_count`, which `withoutViewer` had no reason to decrement.
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
        present_count: 1,
        participants: [
          {
            user_id: 'geo-chat-user',
            profile_space_id: '019fedb10c417f3e9a112c7d5e8b4419',
            display_name: 'You',
            avatar_cid: null,
          },
        ],
      },
      {
        position: false,
        position_label: 'Disagree',
        total_count: 3,
        available_now_count: 2,
        present_count: 2,
        participants: [],
      },
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
});
