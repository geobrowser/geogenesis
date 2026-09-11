import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';

import type { ReactElement } from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';

import type { MatchmakingMatch } from '../api';
import { MatchesList } from './matches-list';
import { debatesHubLobbySearchAtom, debatesHubLobbySpaceIdsAtom, debatesHubLobbyTopicIdsAtom } from '~/atoms';

const mocks = vi.hoisted(() => ({
  matches: [] as MatchmakingMatch[],
  outbound: null as unknown,
  createRequestMutate: vi.fn(),
  submitResponse: vi.fn(),
  indexing: { status: 'idle', pending: null, runId: null } as {
    status: 'idle' | 'reconciling' | 'delayed' | 'indexed';
    pending: { expectedResponse: 'positive' | 'negative' | null } | null;
    runId: string | null;
  },
  resetIndexing: vi.fn(),
  isConnected: true,
  availableToDebate: true,
  /** Whether the activity query has landed yet. It races the matches query. */
  activityLoading: false,
  /** A settled activity query with no data — what an exhausted retry looks like. */
  activityErrored: false,
  /** What the shared summary reports for every claim in the fixture. */
  responseCounts: { positive: 0, negative: 0 },
  /** The claim entities the topic filter is resolved from, and whether that lookup has answered. */
  claimEntities: [] as Array<{
    id: string;
    relations: Array<{ type: { id: string }; toEntity: { id: string; name: string | null } }>;
  }>,
  claimEntitiesLoading: false,
  claimEntitiesError: null as Error | null,
}));

// Topics come from the claim entities now (GEO-2861), which is a real request. Answerless while
// loading or failed, exactly as react-query reports it — which is the state the topic filter has to
// tell apart from "this claim carries no topics".
vi.mock('../claim-picker-page', () => ({
  useClaimEntitiesByIds: () => ({
    entities: mocks.claimEntitiesLoading || mocks.claimEntitiesError ? [] : mocks.claimEntities,
    isLoading: mocks.claimEntitiesLoading,
    error: mocks.claimEntitiesError,
  }),
}));

vi.mock('../hooks', () => ({
  useDebateActivity: () => ({
    // Undefined while loading, exactly as react-query reports it — the empty state has to wait for
    // this rather than read `available_to_debate` off nothing.
    data:
      mocks.activityLoading || mocks.activityErrored
        ? undefined
        : { outbound_request: null, available_to_debate: mocks.availableToDebate },
    isLoading: mocks.activityLoading,
  }),
  // Mirrors the real key factory: `vi.mock` replaces the whole module, so every query key read
  // below this needs one here.
  debateQueryKeys: {
    matchmakingClaimsRoot: (accountKey: string | null) =>
      ['debates', 'account', accountKey, 'matchmaking-claims'] as const,
    matches: (accountKey: string | null) => ['debates', 'account', accountKey, 'matches'] as const,
    rematchRoot: (accountKey: string | null) => ['debates', 'account', accountKey, 'rematch'] as const,
  },
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'account-1' }),
}));

vi.mock('./hooks', () => ({
  useMatchmakingMatches: () => ({ data: { matches: mocks.matches }, isLoading: false, error: null }),
  useDebateRequests: () => ({ data: { outbound: mocks.outbound, incoming: [] }, isLoading: false, error: null }),
  useCreateDebateRequest: () => ({ mutate: mocks.createRequestMutate, isPending: false, error: null }),
  useWithdrawDebateRequest: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));

// The publish path itself is covered by the entity-response tests; here it only needs to record
// what the card asked for.
vi.mock('~/core/hooks/use-entity-vote', () => ({
  useEntityResponse: () => ({
    submitResponse: mocks.submitResponse,
    optimisticResponse: undefined,
    isProcessingResponse: false,
    isResponseIndexingDelayed: false,
    isConnected: mocks.isConnected,
    personalSpaceId: 'personal-space',
  }),
  useEntityResponseIndexingSnapshot: () => mocks.indexing,
  useResetEntityResponseIndexingSnapshot: () => mocks.resetIndexing,
}));

// The shared claim summary reads the viewer's personal space, which reaches wagmi through
// `useSmartAccount` — and these suites render without a `WagmiProvider` on purpose, stubbing the
// wallet-dependent seams instead (the `use-entity-vote` mock above supplies the same personal
// space to the publish path). The real arithmetic is kept, so `isControversial` and the response
// floor still come from the shared rule rather than a hand-written literal; only the two network
// reads and the wallet lookup are replaced.
vi.mock('~/core/claims/browse/claim-response-summary', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/claims/browse/claim-response-summary')>();
  return {
    ...actual,
    useClaimResponseSummary: () => ({
      ...actual.summarizeClaimResponses(mocks.responseCounts.positive, mocks.responseCounts.negative),
      isLoading: false,
      hasCounts: true,
      viewerDirection: null,
      indexedViewerDirection: null,
      viewerSpaceId: null,
    }),
  };
});

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

vi.mock('~/core/hooks/use-spaces-by-ids', () => ({
  useSpacesByIds: () => ({ spaces: [], spacesById: new Map(), isLoading: false }),
}));

function render(ui: ReactElement, sharedStore?: ReturnType<typeof createStore>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // A fresh jotai store per render, unless a case passes one in to model a reopen — the space filter is an atom since GEO-2850, so without this
  // one case's selection would be the next one's starting state.
  const store = sharedStore ?? createStore();
  const wrap = (node: ReactElement) => (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
    </Provider>
  );
  const view = rtlRender(wrap(ui));
  return { ...view, store, rerender: (next: ReactElement) => view.rerender(wrap(next)) };
}

// Claim and space ids are knowledge-graph ids, so the fixtures have to be real ones — the card
// refuses to touch the graph for anything else.
const SPACE_ID = '019fedae-72b6-7ab2-927a-df044d57c566';
const CLAIM_ENTITY_ID = '019fedb1-0c41-7f3e-9a11-2c7d5e8b4419';
const OTHER_SPACE_ID = '019fedae-72b6-7ab2-927a-df044d57c599';
const OTHER_CLAIM_ENTITY_ID = '019fedb2-1d52-7a4f-8b22-3d8e6f9c5520';

function party(userId: string, displayName: string, position: boolean, positionLabel: string) {
  return {
    user_id: userId,
    profile_space_id: `profile-${userId}`,
    display_name: displayName,
    avatar_cid: null,
    online: true,
    available_to_debate: true,
    in_debate: false,
    online_since: '2026-08-05T11:00:00.000Z',
    position,
    position_label: positionLabel,
  };
}

function topicRelation(id: string, name: string) {
  return { type: { id: TOPICS_PROPERTY_ID }, toEntity: { id, name } };
}

function match(overrides: Partial<MatchmakingMatch> = {}): MatchmakingMatch {
  return {
    claim: {
      id: 'debate-claim-1',
      space_id: SPACE_ID,
      claim_entity_id: CLAIM_ENTITY_ID,
      claim: 'Chips are better than fries',
      description: null,
    },
    topics: [],
    response_kind: 'stance',
    viewer_position: true,
    viewer_response: { position: true, position_label: 'Agree' },
    viewer_debate_ready: true,
    readiness_disabled_reason: null,
    positions: [
      { position: true, position_label: 'Agree', total_count: 2, available_now_count: 1, participants: [] },
      { position: false, position_label: 'Disagree', total_count: 3, available_now_count: 2, participants: [] },
    ],
    ...overrides,
  } as MatchmakingMatch;
}

beforeEach(() => {
  mocks.matches = [match()];
  mocks.outbound = null;
  mocks.createRequestMutate.mockReset();
  mocks.submitResponse.mockReset();
  mocks.indexing = { status: 'idle', pending: null, runId: null };
  mocks.resetIndexing.mockReset();
  mocks.isConnected = true;
  mocks.availableToDebate = true;
  mocks.activityLoading = false;
  mocks.activityErrored = false;
  mocks.claimEntities = [];
  mocks.claimEntitiesLoading = false;
  mocks.claimEntitiesError = null;

  // The dropdown measures itself to pick a placement. Stubbed the way the Claims suite does it,
  // because a case that opens the menu is the only thing that reaches it.
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

describe('MatchesList', () => {
  it('offers exactly two response actions, labelled for the claim', () => {
    render(<MatchesList onTabChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /^Agree/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Disagree/ })).toBeInTheDocument();
    // "Exactly two" is the point: the hub takes a side on the claim, it does not vote on it, so
    // the vote arrows that live on the claim page must never appear here.
    expect(screen.queryByRole('button', { name: /Upvote|Downvote|vote/i })).not.toBeInTheDocument();
  });

  it('uses the veracity vocabulary for a factual claim', () => {
    mocks.matches = [match({ response_kind: 'veracity', positions: [] })];
    render(<MatchesList onTabChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /^Verify/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Dispute/ })).toBeInTheDocument();
  });

  it('publishes the opposite response when the other side is chosen', () => {
    render(<MatchesList onTabChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /^Disagree/ }));

    expect(mocks.submitResponse.mock.calls[0]?.[0]).toBe('negative');
  });

  it('clears the response when the side already held is chosen again', () => {
    render(<MatchesList onTabChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /^Agree/ }));

    expect(mocks.submitResponse.mock.calls[0]?.[0]).toBe('clear');
  });

  // A failed publish rolls the optimistic state back, so without this the response just appears to
  // vanish a few seconds after being chosen.
  it('says why when publishing the response fails', () => {
    mocks.submitResponse.mockImplementation((_direction, options) => {
      options?.onError?.(new Error('Transaction reverted.'));
    });
    render(<MatchesList onTabChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /^Disagree/ }));

    expect(screen.getByRole('alert')).toHaveTextContent('Transaction reverted.');
  });

  // The client knows its own response before geo-chat does, so the button reflects it immediately.
  it('shows the in-flight response rather than the stale server one', () => {
    mocks.indexing = { status: 'reconciling', pending: { expectedResponse: 'negative' }, runId: 'run-1' };
    render(<MatchesList onTabChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /^Disagree/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Agree/ })).toHaveAttribute('aria-pressed', 'false');
  });

  // The regression this replaced: once indexing finished, the card dropped back to geo-chat's copy
  // — which hasn't caught up yet — so a response that had just succeeded read as never made.
  it('keeps showing an indexed response while geo-chat is still catching up', () => {
    mocks.indexing = { status: 'indexed', pending: { expectedResponse: 'negative' }, runId: 'run-1' };
    mocks.matches = [match({ viewer_response: null, viewer_debate_ready: false })];
    render(<MatchesList onTabChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /^Disagree/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Respond to this claim to debate it.')).not.toBeInTheDocument();
    expect(mocks.resetIndexing).not.toHaveBeenCalled();
  });

  it('hands back to the server copy once it agrees', () => {
    mocks.indexing = { status: 'indexed', pending: { expectedResponse: 'negative' }, runId: 'run-1' };
    mocks.matches = [match({ viewer_response: { position: false, position_label: 'Disagree' } })];
    render(<MatchesList onTabChange={vi.fn()} />);

    expect(mocks.resetIndexing).toHaveBeenCalledWith('run-1');
  });

  it('cannot respond without a connected personal space', () => {
    mocks.isConnected = false;
    render(<MatchesList onTabChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /^Agree/ })).toBeDisabled();
  });

  // geo-chat can return a claim the knowledge graph has never seen. Querying the graph for one
  // fails the whole request, so the card must not offer to respond to it or link to it.
  it('does not offer a response when the claim id is not a graph id', () => {
    mocks.matches = [
      match({
        claim: {
          id: 'debate-claim-1',
          space_id: 'matchmaking-space-019fedae72b67ab2927adf044d57c566',
          claim_entity_id: 'matchmaking-claim-019fedae72b67ab2927adf044d57c566',
          claim: 'Leftover fixture claim',
          description: null,
        },
      }),
    ];
    render(<MatchesList onTabChange={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /^Agree/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Leftover fixture claim' })).not.toBeInTheDocument();
    expect(screen.getByText('Claim unavailable')).toBeInTheDocument();
  });

  // A request you send while marked unavailable could not be answered, so the design drops the
  // action in that state — kept visible here, with the reason, rather than silently missing.
  it('cannot request a debate while the viewer is unavailable', () => {
    mocks.availableToDebate = false;
    render(<MatchesList onTabChange={vi.fn()} />);

    const request = screen.getByRole('button', { name: 'Request debate' });
    expect(request).toBeDisabled();
    // Shown rather than a `title`: tooltips never appear on touch and are unreliable on a disabled
    // button, which is exactly when the reason matters.
    expect(screen.getByText('Switch yourself to available to send a request.')).toBeInTheDocument();
  });

  it('requests a debate on the claim and blocks a second concurrent request', () => {
    const { rerender } = render(<MatchesList onTabChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Request debate' }));
    expect(mocks.createRequestMutate).toHaveBeenCalledWith({ space_id: SPACE_ID, claim_entity_id: CLAIM_ENTITY_ID });

    mocks.outbound = {
      id: 'request-1',
      claim: match().claim,
      expires_at: '2099-01-01T00:00:00.000Z',
      requester: party('user-me', 'You', true, 'Agree'),
      recipient: party('user-them', 'Arturas', false, 'Disagree'),
    };
    rerender(<MatchesList onTabChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Request debate' })).toBeDisabled();
  });

  // GEO-2684. The outbound card was already pinned; the filters joined it rather than becoming a
  // second sticky, because two would both claim `top-0` and overlap — and the card is conditional,
  // so the filters could not be offset by a known height either. The shared helper's own test only
  // proves it has the sticky classes, so this is what would catch the card being lifted back out.
  it('keeps a sent request and the filters in the same pinned block', () => {
    mocks.outbound = {
      id: 'request-1',
      claim: match().claim,
      expires_at: '2099-01-01T00:00:00.000Z',
      requester: party('user-me', 'You', true, 'Agree'),
      recipient: party('user-them', 'Arturas', false, 'Disagree'),
    };
    render(<MatchesList onTabChange={vi.fn()} />);

    const pinned = screen.getByText('Awaiting response').closest('.sticky');
    expect(pinned).not.toBeNull();
    expect(pinned?.className).toContain('top-0');
    expect(screen.getByRole('button', { name: /Any space/ }).closest('.sticky')).toBe(pinned);
  });

  it('still pins the filters with no request outstanding', () => {
    render(<MatchesList onTabChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Any space/ }).closest('.sticky')).not.toBeNull();
  });

  // GEO-2850. The hub closes on an outside pointer-down, so clicking away to dismiss the dropdown
  // unmounts this tab — and with the selection in `useState` it went too. Held in session state
  // now, so a tab mounting fresh picks up what the viewer had already chosen. (The click that
  // writes it is covered on the Claims tab, whose menu options carry real names to click.)
  it('applies a space selection the viewer made earlier in the session', () => {
    const store = createStore();
    store.set(debatesHubLobbySpaceIdsAtom, [SPACE_ID]);
    render(<MatchesList onTabChange={vi.fn()} />, store);

    // The trigger reads the selection back rather than "Any space", and the list is narrowed to it.
    expect(screen.queryByRole('button', { name: /Any space/ })).not.toBeInTheDocument();
    expect(screen.getByText('Chips are better than fries')).toBeInTheDocument();
  });

  // The selection outlives the mount now, so it can outlive the match that put its space on the
  // menu — the other side goes offline while the panel is closed. Without keeping the selected row
  // visible the viewer comes back to an empty list filtered by a space with no row to untick.
  it('keeps a selected space on the menu after its matches are gone', async () => {
    const store = createStore();
    store.set(debatesHubLobbySpaceIdsAtom, [SPACE_ID]);
    mocks.matches = [];
    render(<MatchesList onTabChange={vi.fn()} />, store);

    fireEvent.click(screen.getByRole('button', { name: /Space|Any space/ }));

    // The row is still there, ticked, so the filter can be undone.
    const rows = await screen.findAllByRole('button');
    expect(rows.some(row => row.getAttribute('aria-pressed') === 'true')).toBe(true);
  });

  // The other direction: a fresh session starts unfiltered, so the atom is not quietly sticky
  // across viewers or page loads.
  it('starts unfiltered in a new session', () => {
    render(<MatchesList onTabChange={vi.fn()} />, createStore());

    expect(screen.getByRole('button', { name: /Any space/ })).toBeInTheDocument();
  });

  // The space filter survives a close and reopen now, so a list it emptied would otherwise be
  // blamed on having no positions or on nobody being online — and the only action offered was one
  // that could not help. There are matches; they are just not in the spaces on screen.
  it('blames the space filter, and offers to clear it, when that is what emptied the list', async () => {
    const store = createStore();
    store.set(debatesHubLobbySpaceIdsAtom, ['019fedae-72b6-7ab2-927a-df044d57c599']);
    render(<MatchesList onTabChange={vi.fn()} />, store);

    expect(await screen.findByText('No matches match these filters.')).toBeInTheDocument();
    expect(screen.queryByText(/Matches appear once you/)).not.toBeInTheDocument();
    // Debate hours would be the wrong answer: people are around, the filter is hiding them.
    expect(screen.queryByText(/Debate hours are every day between|Stay here —/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(await screen.findByText('Chips are better than fries')).toBeInTheDocument();
  });

  // GEO-2840.
  it('adds the debate hours line to the empty state', async () => {
    mocks.matches = [];
    render(<MatchesList onTabChange={vi.fn()} />);

    expect(await screen.findByText(/Matches appear once you/)).toBeInTheDocument();
    expect(screen.getByText(/Debate hours are every day between|Stay here —/)).toBeInTheDocument();
  });

  // `activity` is a second request racing the matches one. Landing second, it used to let the tab
  // assert the wrong empty state first — the generic message and the debate-hours line, shown to a
  // viewer who had marked themselves unavailable — and then correct itself.
  it('waits for the availability answer before describing an empty list', async () => {
    mocks.matches = [];
    mocks.availableToDebate = false;
    mocks.activityLoading = true;
    const { rerender } = render(<MatchesList onTabChange={vi.fn()} />);

    expect(screen.queryByText(/Matches appear once you/)).not.toBeInTheDocument();
    expect(screen.queryByText(/marked unavailable/)).not.toBeInTheDocument();

    mocks.activityLoading = false;
    rerender(<MatchesList onTabChange={vi.fn()} />);

    // The message is what needed the answer; the note never did. Awaited rather than read
    // synchronously: the note renders nothing until its own mount effect has run, and here it is
    // mounting for the first time as the skeleton cross-fades out.
    expect(await screen.findByText(/marked unavailable/)).toBeInTheDocument();
    expect(await screen.findByText(/Debate hours are every day between|Stay here —/)).toBeInTheDocument();
  });

  // The note does not read availability at all, so an activity request that ran out of retries
  // cannot take it away. Only the message above depends on that answer.
  it('still shows the debate hours line when the availability answer never arrives', async () => {
    mocks.matches = [];
    mocks.activityErrored = true;
    render(<MatchesList onTabChange={vi.fn()} />);

    expect(await screen.findByText(/Matches appear once you/)).toBeInTheDocument();
    expect(screen.getByText(/Debate hours are every day between|Stay here —/)).toBeInTheDocument();
  });

  // Only while there is nothing to show. A list with rows renders on the matches alone.
  it('still renders matches while the availability answer is outstanding', () => {
    mocks.activityLoading = true;
    render(<MatchesList onTabChange={vi.fn()} />);

    expect(screen.getByText('Chips are better than fries')).toBeInTheDocument();
  });

  // Being marked unavailable is not why the list is empty: geo-chat's matches query never reads
  // the viewer's own `available_to_debate`, only the opposite side's — which is also why a viewer
  // with matches still sees them while unavailable, just with the request button disabled. So an
  // unavailable viewer's empty list is a nobody-is-online list, and the pointer to debate hours is
  // the half of the answer they can actually use.
  it('still shows the debate hours line to a viewer who is marked unavailable', async () => {
    mocks.matches = [];
    mocks.availableToDebate = false;
    render(<MatchesList onTabChange={vi.fn()} />);

    expect(await screen.findByText(/marked unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/Debate hours are every day between|Stay here —/)).toBeInTheDocument();
  });

  /**
   * A menu that does not describe the list under it offers an option that empties it.
   *
   * Both of these counted the wrong set: the space menu counted every match whatever was in the
   * search box, and the topic menu was narrowed by space but not by search. So a search leaving one
   * claim on screen still offered the other one's space and the other one's topic, each with a
   * count beside it, and picking either produced nothing.
   */
  describe('the filter menus', () => {
    function twoMatchesInTwoSpaces() {
      mocks.matches = [
        match(),
        match({
          claim: {
            id: 'debate-claim-2',
            space_id: OTHER_SPACE_ID,
            claim_entity_id: OTHER_CLAIM_ENTITY_ID,
            claim: 'Fries are better than chips',
            description: null,
          },
        }),
      ];
    }

    /**
     * How many spaces the menu offers. Counted inside the popover: the position pills on the cards
     * carry `aria-pressed` too, so a document-wide count is mostly cards.
     */
    function spacesOffered() {
      fireEvent.click(screen.getByRole('button', { name: /Any space/ }));
      const menu = screen.getByRole('dialog');
      const offered = within(menu)
        .getAllByRole('button')
        .filter(button => button.hasAttribute('aria-pressed')).length;
      fireEvent.keyDown(document, { key: 'Escape' });

      return offered;
    }

    it('offers only the spaces the search leaves on the list', async () => {
      twoMatchesInTwoSpaces();
      render(<MatchesList onTabChange={vi.fn()} />);

      expect(spacesOffered()).toBe(2);

      fireEvent.change(screen.getByLabelText('Search claims'), { target: { value: 'Chips are' } });
      await waitFor(() => expect(screen.queryByText('Fries are better than chips')).toBeNull());

      expect(spacesOffered()).toBe(1);
    });

    /**
     * The topic filter is AND, so a topic with no claim in common with the one already picked is a
     * dead option: ticking it asks for both and gets nothing. The menu is counted over the rows
     * that already carry the selection for that reason — the same co-occurrence the hub's server
     * facet does (GEO-2696) — rather than over everything the other filters allow, which is the
     * right rule for the space menu and the wrong one here.
     */
    it('offers only the topics that co-occur with the one already picked', () => {
      twoMatchesInTwoSpaces();
      mocks.claimEntities = [
        { id: CLAIM_ENTITY_ID, relations: [topicRelation('topic-food', 'Food')] },
        { id: OTHER_CLAIM_ENTITY_ID, relations: [topicRelation('topic-health', 'Health')] },
      ];
      const store = createStore();
      store.set(debatesHubLobbyTopicIdsAtom, ['topic-food']);
      render(<MatchesList onTabChange={vi.fn()} />, store);

      // The trigger takes the name of the one picked topic, so that is what opens the menu.
      fireEvent.click(screen.getByRole('button', { name: /Food/ }));
      const menu = screen.getByRole('dialog');

      // Still offered, so it can be unticked; the one that shares no claim with it is not.
      expect(within(menu).getByRole('button', { name: /Food/ })).toBeInTheDocument();
      expect(within(menu).queryByRole('button', { name: /Health/ })).not.toBeInTheDocument();
    });

    it('offers only the topics the search leaves on the list', async () => {
      twoMatchesInTwoSpaces();
      mocks.claimEntities = [
        { id: CLAIM_ENTITY_ID, relations: [topicRelation('topic-food', 'Food')] },
        { id: OTHER_CLAIM_ENTITY_ID, relations: [topicRelation('topic-health', 'Health')] },
      ];
      render(<MatchesList onTabChange={vi.fn()} />);

      fireEvent.change(screen.getByLabelText('Search claims'), { target: { value: 'Chips are' } });
      await waitFor(() => expect(screen.queryByText('Fries are better than chips')).toBeNull());

      fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));

      expect(screen.getByRole('button', { name: /Food/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Health/ })).not.toBeInTheDocument();
    });
  });

  // GEO-2850 held the space and topic selections outside these components because the panel closing
  // took them with it. The search box is the third control in the same bar and was still local, so
  // flipping "Matches only" — which unmounts one of Lobby's lists and mounts the other — threw away
  // what the viewer had typed and widened the list they were narrowing.
  it('writes the search where Lobby’s other list will read it', async () => {
    const { store } = render(<MatchesList onTabChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Search claims'), { target: { value: 'chips' } });

    await waitFor(() => expect(store.get(debatesHubLobbySearchAtom)).toBe('chips'));
  });

  it('reads back the search the other list was left on', () => {
    const store = createStore();
    store.set(debatesHubLobbySearchAtom, 'chips');
    render(<MatchesList onTabChange={vi.fn()} />, store);

    expect(screen.getByLabelText('Search claims')).toHaveValue('chips');
  });

  /**
   * The topics come from a lookup behind the rows, and `carriesEveryTopic` rejects a claim it has
   * no topics for — so an unanswered lookup and a claim that genuinely carries nothing are the same
   * answer to it. With a topic picked, reading the first as the second empties the whole list under
   * "No matches match these filters", which is a filter being blamed for something it did not do.
   */
  describe('while the topics behind the filter are unresolved', () => {
    function renderWithTopic() {
      const store = createStore();
      store.set(debatesHubLobbyTopicIdsAtom, ['topic-ai']);

      return render(<MatchesList onTabChange={vi.fn()} />, store);
    }

    it('lists the matches rather than reporting the filter emptied them', async () => {
      mocks.claimEntitiesLoading = true;
      renderWithTopic();

      expect(await screen.findByText('Chips are better than fries')).toBeInTheDocument();
      expect(screen.queryByText('No matches match these filters.')).toBeNull();
    });

    // The same answer on failure, and for longer: without this the list stays empty for as long as
    // the lookup keeps failing, which is a permanent lie rather than a slow truth.
    it('lists them after a failed lookup too, rather than staying empty', async () => {
      mocks.claimEntitiesError = new Error('entities exploded');
      renderWithTopic();

      expect(await screen.findByText('Chips are better than fries')).toBeInTheDocument();
      expect(screen.queryByText('No matches match these filters.')).toBeNull();
    });

    // And the guard is a hold, not a hole: once the entities land the filter applies, or the tab
    // would simply have stopped filtering by topic.
    it('narrows once the entities land', async () => {
      mocks.claimEntities = [{ id: CLAIM_ENTITY_ID, relations: [] }];
      renderWithTopic();

      expect(await screen.findByText('No matches match these filters.')).toBeInTheDocument();
      expect(screen.queryByText('Chips are better than fries')).toBeNull();
    });
  });
});
