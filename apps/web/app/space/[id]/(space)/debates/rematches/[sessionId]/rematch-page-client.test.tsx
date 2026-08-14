import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { StrictMode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import type { DebateRematchClaim, DebateRematchSession } from '~/core/debates/api';

import { DebateRematchPageClient } from './rematch-page-client';

const { SPACE_1, SPACE_2, CLAIM_SHARED, CLAIM_MORE, CLAIM_SOURCE, CRYPTO_SPACE, PODCASTS_SPACE, NAME_PROPERTY } =
  vi.hoisted(() => ({
    SPACE_1: '019fedae-72b6-7ab2-927a-df044d57c566',
    SPACE_2: '019fedae-72b6-7ab2-927a-df044d57c567',
    // Real ids from the hard-coded ranking table, so the ordering under test is the real one.
    CRYPTO_SPACE: 'c9f267dcb0d270718c2a3c45a64afd32',
    PODCASTS_SPACE: 'b5a31f8182b042437ede0f84ee02f104',
    NAME_PROPERTY: 'a126ca530c8e48d5b88882c734c38935',
    CLAIM_SHARED: '019fedb1-0c41-7f3e-9a11-2c7d5e8b4419',
    CLAIM_MORE: '019fedb2-1d52-7a4f-8b22-3d8e6f9c5520',
    CLAIM_SOURCE: '019fedb3-2e63-7b50-9c33-4e9f7a0d6621',
  }));

const mocks = vi.hoisted(() => ({
  session: null as DebateRematchSession | null,
  claims: [] as DebateRematchClaim[],
  replace: vi.fn(),
  back: vi.fn(),
  mutate: vi.fn(),
  leaveMutate: vi.fn(),
  acceptMutate: vi.fn(),
  rejectMutate: vi.fn(),
  submitResponse: vi.fn(),
  optimisticResponses: new Map<string, 'positive' | 'negative' | null>(),
  setReadiness: vi.fn(),
  openSidePanel: vi.fn(),
  entityQueries: [] as Array<{ where?: unknown; after?: string }>,
  entityQueryPlaceholder: false,
  entityQueryHasNextPage: false,
  entityQueryLoading: false,
  entities: [] as Array<Record<string, unknown>>,
  recommendedSections: [] as Array<{ id: string; name: string; claimIds: string[] }>,
  recommendedEntities: [] as Array<Record<string, unknown>>,
  recommendedLoading: false,
  rematchClaimIds: [] as string[][],
  curatedIds: [] as string[],
  savedClaims: null as DebateRematchClaim[] | null,
  browsedLookupLoading: false,
  currentUserId: 'user-local' as string | null,
  scrollSentinelIntoView: null as null | (() => void),
  claimReadinessLoading: false,
  claimReadinessError: false,
  claimReadiness: [] as Array<{
    claim_entity_id: string;
    viewer_debate_ready: boolean;
    readiness_disabled_reason: string | null;
  }>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, back: mocks.back }),
}));

vi.mock('~/core/debates/api', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/debates/api')>();
  return {
    ...actual,
    getCurrentGeoChatUserId: () => mocks.currentUserId,
    resolveCurrentGeoChatUserId: () => Promise.resolve(mocks.currentUserId),
  };
});

vi.mock('~/core/debates/hooks', () => ({
  useDebateRematch: () => ({ data: mocks.session, isLoading: false, error: null }),
  // The session's own saved claims. `savedClaims` lets a test empty this so a claim can only
  // arrive through the id lookup.
  useDebateRematchClaims: () => ({
    data: { claims: mocks.savedClaims ?? mocks.claims, excluded_claim_ids: [CLAIM_SOURCE] },
    isLoading: false,
    error: null,
  }),
  // Two lookups run: one for the curated ids, one for the browsed ones. `curatedIds` lets a test
  // stall the browsed lookup on its own, which is the whole point of their being separate.
  useDebateRematchClaimsForIds: (_sessionId: string, claimIds: string[]) => {
    mocks.rematchClaimIds.push(claimIds);
    const isCuratedLookup =
      mocks.curatedIds.length > 0 && claimIds.every(claimId => mocks.curatedIds.includes(claimId));
    if (mocks.browsedLookupLoading && !isCuratedLookup) {
      return { data: { claims: [], excluded_claim_ids: [] }, isLoading: true, error: null };
    }
    return {
      data: { claims: mocks.claims, excluded_claim_ids: [CLAIM_SOURCE] },
      isLoading: false,
      error: null,
    };
  },
  useDebate: () => ({ data: { claim: { claim_entity_id: CLAIM_SOURCE } } }),
  useDebateClaimsBySpaces: () => ({
    claims: mocks.claimReadiness,
    isLoading: mocks.claimReadinessLoading,
    isError: mocks.claimReadinessError,
  }),
  useCreateDebateRematchRequest: () => mutation(),
  useLeaveDebateRematch: () => mutation(mocks.leaveMutate),
  useAcceptDebateRematchRequest: () => mutation(mocks.acceptMutate),
  useRejectDebateRematchRequest: () => mutation(mocks.rejectMutate),
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'account-a', getPrivyIdentityToken: vi.fn() }),
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: (options: { where?: unknown; after?: string }) => {
    mocks.entityQueries.push(options);
    return {
      entities: mocks.entities,
      isLoading: mocks.entityQueryLoading,
      isPlaceholderData: mocks.entityQueryPlaceholder,
      endCursor: mocks.entityQueryHasNextPage ? 'cursor-1' : null,
      hasNextPage: mocks.entityQueryHasNextPage,
    };
  },
}));

vi.mock('~/core/hooks/use-entity-vote', () => ({
  useEntityResponse: ({ entityId }: { entityId: string }) => ({
    submitResponse: (direction: 'positive' | 'negative' | 'clear') => mocks.submitResponse(entityId, direction),
    optimisticResponse: mocks.optimisticResponses.get(entityId),
    isConnected: true,
    personalSpaceId: 'personal-space',
  }),
  useEntityResponseIndexingSnapshot: () => ({ status: 'idle', pending: null, runId: null }),
  useResetEntityResponseIndexingSnapshot: () => vi.fn(),
}));

// The card's Debate toggle publishes readiness through this.
vi.mock('~/core/debates/matchmaking/hooks', () => ({
  useClaimReadiness: () => ({ mutate: mocks.setReadiness, isPending: false, error: null }),
}));

// The curated lookup has its own tests; these cover the picker around it.
vi.mock('~/core/debates/recommended-claims', () => ({
  useRecommendedClaimSections: () => ({
    sections: mocks.recommendedSections,
    claimEntities: mocks.recommendedEntities,
    isLoading: mocks.recommendedLoading,
  }),
}));

vi.mock('~/core/hooks/use-entity-side-panel', () => ({
  useEntitySidePanel: () => ({ openSidePanel: mocks.openSidePanel, sidePanelTarget: null, closeSidePanel: vi.fn() }),
}));

vi.mock('~/core/hooks/use-spaces-by-ids', () => ({
  useSpacesByIds: () => ({
    spaces: [],
    spacesById: new Map([
      [SPACE_1, { entity: { name: 'Crypto', image: null } }],
      [SPACE_2, { entity: { name: 'Governance space', image: null } }],
    ]),
    isLoading: false,
  }),
}));

function mutation(mutate = mocks.mutate) {
  return { mutate, mutateAsync: mutate, isPending: false, error: null };
}

beforeEach(() => {
  mocks.replace.mockReset();
  mocks.back.mockReset();
  mocks.mutate.mockReset();
  mocks.leaveMutate.mockReset();
  mocks.acceptMutate.mockReset();
  mocks.rejectMutate.mockReset();
  mocks.submitResponse.mockReset();
  mocks.optimisticResponses.clear();
  mocks.claimReadiness = [];
  mocks.claimReadinessLoading = false;
  mocks.claimReadinessError = false;
  mocks.setReadiness.mockReset();
  mocks.openSidePanel.mockReset();
  mocks.entityQueries.length = 0;
  mocks.entityQueryPlaceholder = false;
  mocks.entityQueryHasNextPage = false;
  mocks.entityQueryLoading = false;
  mocks.entities = [publishedEntity()];
  mocks.recommendedSections = [];
  mocks.recommendedEntities = [];
  mocks.recommendedLoading = false;
  mocks.rematchClaimIds.length = 0;
  mocks.curatedIds = [];
  mocks.savedClaims = null;
  mocks.browsedLookupLoading = false;
  mocks.currentUserId = 'user-local';
  // jsdom has no IntersectionObserver, which the infinite-scroll sentinel builds. This one records
  // the callback so a test can say the sentinel scrolled into view.
  mocks.scrollSentinelIntoView = null;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(element: Element) {
        mocks.scrollSentinelIntoView = () =>
          this.callback([{ isIntersecting: true, target: element } as IntersectionObserverEntry], this as never);
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
  );
  // The hub's filter menus measure their dropdown.
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  mocks.session = session();
  mocks.claims = [sharedClaim()];
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe('DebateRematchPageClient', () => {
  it('does not leave a browsing rematch during the Strict Mode effect rehearsal', async () => {
    render(
      <StrictMode>
        <DebateRematchPageClient sessionId="rematch-1" />
      </StrictMode>
    );

    expect(await screen.findByText('A claim both participants chose')).toBeInTheDocument();
    await new Promise(resolve => window.setTimeout(resolve, 0));
    expect(mocks.leaveMutate).not.toHaveBeenCalled();
  });

  it('does not end a browsing rematch when the page unmounts', async () => {
    const { unmount } = render(<DebateRematchPageClient sessionId="rematch-1" />);

    unmount();
    await new Promise(resolve => window.setTimeout(resolve, 0));

    expect(mocks.leaveMutate).not.toHaveBeenCalled();
  });

  it('ends a browsing rematch only through the explicit leave action', () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Leave debate' }));

    expect(mocks.leaveMutate).toHaveBeenCalledOnce();
  });

  it('returns a profile challenge to the page before the debate flow after leaving', () => {
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(2);
    const endedSession = session({ source_debate_id: null, status: 'ended' });
    mocks.session = session({ source_debate_id: null });
    mocks.leaveMutate.mockImplementation(
      (_input: undefined, options: { onSuccess?: (ended: DebateRematchSession) => void }) => {
        options.onSuccess?.(endedSession);
      }
    );

    render(<DebateRematchPageClient sessionId="rematch-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Leave debate' }));

    expect(mocks.back).toHaveBeenCalledOnce();
    expect(mocks.replace).not.toHaveBeenCalledWith(`/space/${SPACE_1}/debates`);
  });

  it('preserves the debates-page exit for rematches started from a prior debate', () => {
    const endedSession = session({ status: 'ended' });
    mocks.leaveMutate.mockImplementation(
      (_input: undefined, options: { onSuccess?: (ended: DebateRematchSession) => void }) => {
        options.onSuccess?.(endedSession);
      }
    );

    render(<DebateRematchPageClient sessionId="rematch-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Leave debate' }));

    expect(mocks.replace).toHaveBeenCalledWith(`/space/${SPACE_1}/debates`);
    expect(mocks.back).not.toHaveBeenCalled();
  });

  it('pins shared preferences above additional published claims and enables opposing requests', () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    showAllClaims();

    const shared = screen.getByText('A claim both participants chose');
    const additional = screen.getByText('A newly published claim');
    expect(shared.compareDocumentPosition(additional) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Request debate' })[0]).toBeEnabled();
  });

  it('renders active semantic response buttons with holder avatars', () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    const sharedClaimCard = screen.getByText('A claim both participants chose').closest('article');
    expect(sharedClaimCard).not.toBeNull();
    expect(within(sharedClaimCard!).getByRole('button', { name: /^Agree/ })).toBeEnabled();
    expect(within(sharedClaimCard!).getByRole('button', { name: /^Disagree/ })).toBeEnabled();
    expect(
      within(sharedClaimCard!)
        .getByRole('button', { name: /^Agree/ })
        .querySelector('img, svg')
    ).not.toBeNull();
    expect(
      within(sharedClaimCard!)
        .getByRole('button', { name: /^Disagree/ })
        .querySelector('img, svg')
    ).not.toBeNull();
  });

  it('changes responses through the semantic buttons without rendering a second response area', () => {
    mocks.claims = [
      {
        ...sharedClaim(),
        participants: [
          { user_id: 'user-local', position: true, position_label: 'Agree' },
          { user_id: 'user-remote', position: true, position_label: 'Agree' },
        ],
      },
    ];

    render(<DebateRematchPageClient sessionId="rematch-1" />);
    showAllClaims();

    const sharedClaimCard = screen.getByText('A claim both participants chose').closest('article');
    expect(sharedClaimCard).not.toBeNull();
    fireEvent.click(within(sharedClaimCard!).getByRole('button', { name: /^Disagree/ }));
    expect(mocks.submitResponse).toHaveBeenCalledWith(CLAIM_SHARED, 'negative');
    expect(screen.queryByText('You both have the same response. Change yours to request this debate.')).toBeNull();
    const syntheticClaimCard = screen.getByText('A newly published claim').closest('article');
    expect(syntheticClaimCard).not.toBeNull();
    expect(within(syntheticClaimCard!).queryByText('Respond before requesting')).toBeNull();
    expect(within(syntheticClaimCard!).getByRole('button', { name: /^Agree/ })).toBeEnabled();
    expect(within(syntheticClaimCard!).getByRole('button', { name: /^Disagree/ })).toBeEnabled();
  });

  it('uses Verify and Dispute for factual claims', () => {
    mocks.claims = [
      {
        ...sharedClaim(),
        response_kind: 'veracity',
        participants: [
          { user_id: 'user-local', position: true, position_label: 'Verify' },
          { user_id: 'user-remote', position: false, position_label: 'Dispute' },
        ],
      },
    ];

    render(<DebateRematchPageClient sessionId="rematch-1" />);

    const claimCard = screen.getByText('A claim both participants chose').closest('article');
    expect(claimCard).not.toBeNull();
    expect(within(claimCard!).getByRole('button', { name: /^Verify/ })).toBeEnabled();
    expect(within(claimCard!).getByRole('button', { name: /^Dispute/ })).toBeEnabled();
  });

  it('shows authoritative stance labels in the incoming request dialog and preserves rematch actions', () => {
    mocks.session = session({
      status: 'request_pending',
      request: {
        id: 'request-1',
        status: 'pending',
        claim: claimSummary(CLAIM_SHARED, 'A claim both participants chose'),
        requester_user_id: 'user-remote',
        recipient_user_id: 'user-local',
        requester_position: false,
        requester_position_label: 'Disagree',
        recipient_position: true,
        recipient_position_label: 'Agree',
        response_kind: 'stance',
        turn_format_id: 'standard',
        created_at: '2026-07-10T10:00:00.000Z',
        expires_at: '2026-07-10T10:02:00.000Z',
      },
    });

    const { unmount } = render(<DebateRematchPageClient sessionId="rematch-1" />);

    const dialog = screen.getByRole('dialog', { name: 'A claim both participants chose' });
    expect(within(dialog).getByText('Debate request')).toBeInTheDocument();
    expect(within(dialog).getByText('You')).toBeInTheDocument();
    expect(within(dialog).getByText('Salina')).toBeInTheDocument();
    expect(within(dialog).getByText('VS')).toBeInTheDocument();
    expect(within(within(dialog).getByText('You').parentElement!).getByText('Agree')).toBeInTheDocument();
    expect(within(within(dialog).getByText('Salina').parentElement!).getByText('Disagree')).toBeInTheDocument();
    expect(within(dialog).getAllByText('1m')).toHaveLength(2);
    expect(within(dialog).getAllByText('45s')).toHaveLength(2);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Accept' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));

    expect(mocks.acceptMutate).toHaveBeenCalledWith('request-1');
    expect(mocks.rejectMutate).toHaveBeenCalledWith('request-1');

    unmount();

    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('falls back to Agree and Disagree for incoming requests without response metadata', () => {
    mocks.session = session({
      status: 'request_pending',
      request: {
        id: 'request-legacy',
        status: 'pending',
        claim: claimSummary(CLAIM_SHARED, 'A claim both participants chose'),
        requester_user_id: 'user-remote',
        recipient_user_id: 'user-local',
        requester_position: false,
        recipient_position: true,
        turn_format_id: 'standard',
        created_at: '2026-07-10T10:00:00.000Z',
        expires_at: '2026-07-10T10:02:00.000Z',
      },
    });

    render(<DebateRematchPageClient sessionId="rematch-1" />);

    const dialog = screen.getByRole('dialog', { name: 'A claim both participants chose' });
    expect(within(within(dialog).getByText('You').parentElement!).getByText('Agree')).toBeInTheDocument();
    expect(within(within(dialog).getByText('Salina').parentElement!).getByText('Disagree')).toBeInTheDocument();
  });

  it('disables debate requests while a rematch request is pending', () => {
    mocks.session = session({
      status: 'request_pending',
      request: {
        id: 'request-1',
        status: 'pending',
        claim: claimSummary(CLAIM_SHARED, 'A claim both participants chose'),
        requester_user_id: 'user-local',
        recipient_user_id: 'user-remote',
        requester_position: true,
        requester_position_label: 'Agree',
        recipient_position: false,
        recipient_position_label: 'Disagree',
        response_kind: 'stance',
        turn_format_id: 'standard',
        created_at: '2026-07-10T10:00:00.000Z',
        expires_at: '2026-07-10T10:02:00.000Z',
      },
    });

    render(<DebateRematchPageClient sessionId="rematch-1" />);
    showAllClaims();

    expect(screen.getByRole('button', { name: 'Requesting…' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: /^(Agree|Disagree)/ })).toHaveLength(4);
  });

  it('explains when response changes cancel a rematch request', () => {
    mocks.session = session({
      request: {
        id: 'request-1',
        status: 'expired',
        claim: claimSummary(CLAIM_SHARED, 'A claim both participants chose'),
        requester_user_id: 'user-local',
        recipient_user_id: 'user-remote',
        requester_position: true,
        requester_position_label: 'Agree',
        recipient_position: false,
        recipient_position_label: 'Disagree',
        response_kind: 'stance',
        cancellation_reason: 'claim_response_position_changed',
        turn_format_id: 'standard',
        created_at: '2026-07-10T10:00:00.000Z',
        expires_at: '2026-07-10T10:02:00.000Z',
      },
    });

    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(
      screen.getByText('This request was cancelled because the responses no longer oppose each other.')
    ).toBeInTheDocument();
  });

  it('opens on the opponent’s positions, named after them and counted', () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    const tab = screen.getByRole('button', { name: /Salina’s positions/ });
    // Only the shared claim carries a side from Salina.
    expect(within(tab).getByText('1')).toBeInTheDocument();
    expect(screen.getByText('A claim both participants chose')).toBeInTheDocument();
    expect(screen.queryByText('A newly published claim')).toBeNull();
  });

  // A curator's page for this pairing is the best thing to land on; without one the tab has no
  // reason to exist.
  it('hides the Recommended tab when nothing is curated for this pairing', () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.queryByRole('button', { name: 'Recommended' })).toBeNull();
    expect(screen.getByRole('button', { name: /Salina’s positions/ })).toBeInTheDocument();
  });

  it('opens on Recommended when a curator has, grouping each block into its own section', () => {
    mocks.recommendedSections = [
      { id: 'block-1', name: 'Geopolitics & chips', claimIds: [CLAIM_SHARED] },
      { id: 'block-2', name: 'Open weight AI', claimIds: [CLAIM_MORE] },
    ];
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.getByRole('button', { name: 'Recommended' })).toBeInTheDocument();
    const geopolitics = screen.getByRole('heading', { name: 'Geopolitics & chips' });
    const openWeight = screen.getByRole('heading', { name: 'Open weight AI' });
    expect(geopolitics.compareDocumentPosition(openWeight) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Each block lists its own claims.
    expect(screen.getByText('A claim both participants chose')).toBeInTheDocument();
    expect(screen.getByText('A newly published claim')).toBeInTheDocument();
  });

  it('collapses a section without touching the others', () => {
    mocks.recommendedSections = [
      { id: 'block-1', name: 'Geopolitics & chips', claimIds: [CLAIM_SHARED] },
      { id: 'block-2', name: 'Open weight AI', claimIds: [CLAIM_MORE] },
    ];
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    fireEvent.click(screen.getByRole('button', { name: /Geopolitics & chips/ }));

    expect(screen.queryByText('A claim both participants chose')).toBeNull();
    expect(screen.getByText('A newly published claim')).toBeInTheDocument();
  });

  // A curated claim the session hasn't heard of still has to render, so it joins the same pool the
  // browsed pages feed rather than being listed separately.
  it('drops a section whose claims all fall out of the filters', async () => {
    mocks.recommendedSections = [
      { id: 'block-1', name: 'Geopolitics & chips', claimIds: [CLAIM_SHARED] },
      { id: 'block-2', name: 'Open weight AI', claimIds: [CLAIM_MORE] },
    ];
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search claims' }), { target: { value: 'newly' } });

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Geopolitics & chips' })).toBeNull());
    expect(screen.getByRole('heading', { name: 'Open weight AI' })).toBeInTheDocument();
  });

  // Recommended comes from the curator's page whole, so paging the browsed corpus means nothing
  // there — offering it implies there are more recommendations waiting.
  it('keeps the paging sentinel off the Recommended tab while placing it on the others', () => {
    mocks.entityQueryHasNextPage = true;
    mocks.recommendedSections = [{ id: 'block-1', name: 'Geopolitics & chips', claimIds: [CLAIM_SHARED] }];
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.queryByTestId('claims-scroll-sentinel')).toBeNull();

    showAllClaims();
    expect(screen.getByTestId('claims-scroll-sentinel')).toBeInTheDocument();
  });

  // No button to press any more; reaching the end of the list is what asks for the next page.
  it('does not offer a Load more button', () => {
    mocks.entityQueryHasNextPage = true;
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    showAllClaims();

    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  // The picker pages by cursor rather than through an infinite query, so the sentinel firing has
  // to be shown to advance that cursor — a sentinel that renders but is wired to nothing would
  // satisfy every other test here.
  it('advances the cursor when the end of the list scrolls into view', () => {
    mocks.entityQueryHasNextPage = true;
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    showAllClaims();

    expect(browsedClaimsQueryOptions()?.after).toBeUndefined();

    act(() => mocks.scrollSentinelIntoView?.());

    expect(browsedClaimsQueryOptions()?.after).toBe('cursor-1');
  });

  it('leaves the sentinel out once there is no page left to fetch', () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    showAllClaims();

    expect(screen.queryByTestId('claims-scroll-sentinel')).toBeNull();
  });

  // Curated claims are picked by hand, so they can be ones the browsed pages never reach. They
  // have to land in the same pool, or a recommendation would head a section with nothing under it.
  it('renders a curated claim the browsed pages never returned', () => {
    const CURATED = '019fedb59a8f7d728e556ab19c3e8841';
    mocks.recommendedSections = [{ id: 'block-1', name: 'Geopolitics & chips', claimIds: [CURATED] }];
    mocks.recommendedEntities = [publishedEntity(CURATED, 'A curated claim from elsewhere')];
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.getByText('A curated claim from elsewhere')).toBeInTheDocument();
    // And it goes into the id lookup, so the session can report positions on it.
    expect(mocks.rematchClaimIds.flat()).toContain(CURATED);
  });

  // The browsed scan reads every Claim in the graph and is the slowest thing here. The curated tab
  // draws nothing from it, so waiting on it was pure delay.
  it('shows curated sections without waiting on the browsed claim scan', () => {
    mocks.entityQueryLoading = true;
    // The browsed half of the session lookup is still in flight too — the curated half is not,
    // and only stays independent while the two are asked for separately.
    mocks.browsedLookupLoading = true;
    mocks.curatedIds = [CLAIM_SHARED];
    // Not among the session's saved claims, so the curated lookup is its only source of positions.
    mocks.savedClaims = [];
    mocks.recommendedSections = [{ id: 'block-1', name: 'Geopolitics & chips', claimIds: [CLAIM_SHARED] }];
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.getByRole('heading', { name: 'Geopolitics & chips' })).toBeInTheDocument();
    // Not just the card: its sides come from the session lookup, so a curated claim sharing the
    // browsed lookup would render with no positions and no debate to request until the scan lands.
    expect(screen.getByRole('button', { name: 'Request debate' })).toBeInTheDocument();
  });

  // The session's own claims arrive in one round trip; they shouldn't sit behind the scan either.
  it('shows the opponent’s claims without waiting on the browsed claim scan', () => {
    mocks.entityQueryLoading = true;
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    fireEvent.click(screen.getByRole('button', { name: /Salina’s positions/ }));

    expect(screen.getByText('A claim both participants chose')).toBeInTheDocument();
  });

  // An empty result mid-flight is not "nothing recommended"; landing on the opponent tab and then
  // moving the viewer once the lookup settles is worse than waiting.
  it('waits on the Recommended tab while the curated lookup is still running', () => {
    mocks.recommendedLoading = true;
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.getByRole('button', { name: 'Recommended' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: /Salina’s positions/ })).toHaveAttribute('aria-selected', 'false');
    // And the claims stay behind the loading state rather than the opponent tab's list appearing.
    expect(screen.queryByText('A claim both participants chose')).toBeNull();
  });

  it('shortens the opponent tab to their first name', () => {
    const base = session();
    mocks.session = session({
      participants: [base.participants[0], { ...base.participants[1], display_name: 'Salina Okonkwo' }],
    });
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.getByRole('button', { name: /Salina’s positions/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Okonkwo/ })).toBeNull();
  });

  it('lists every eligible claim on the All tab', async () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    showAllClaims();

    expect(screen.getByText('A claim both participants chose')).toBeInTheDocument();
    expect(screen.getByText('A newly published claim')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Salina’s positions/ }));

    expect(screen.getByText('A claim both participants chose')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('A newly published claim')).toBeNull());
  });

  it('shows the opponent-specific empty state when no claim is debate-ready', () => {
    mocks.claims = [];
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.getByText(/Salina hasn’t responded yet/)).toBeInTheDocument();
  });

  it('narrows the list to the selected topic', async () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    showAllClaims();

    selectFilter('Any topic', 'Governance');

    // Only the Governance-tagged published claim survives; the untagged shared claim drops out.
    expect(screen.getByText('A newly published claim')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('A claim both participants chose')).toBeNull());
  });

  it('matches the topic filter on any of a claim topics, not just the first', () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    showAllClaims();

    // The published claim is tagged Governance and Ethics; filtering on the second still matches.
    selectFilter('Any topic', 'Ethics');

    expect(screen.getByText('A newly published claim')).toBeInTheDocument();
  });

  it('narrows the list to the selected space', async () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    showAllClaims();

    // The shared claim sits in Crypto; the published one is in Governance space.
    selectFilter('Any space', 'Crypto');

    expect(screen.getByText('A claim both participants chose')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('A newly published claim')).toBeNull());
  });

  it('searches claim text, and keeps searching across a tab switch', async () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    showAllClaims();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search claims' }), {
      target: { value: 'newly published' },
    });

    // Debounced, so the shared claim leaves a beat later.
    expect(screen.getByText('A newly published claim')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('A claim both participants chose')).toBeNull());

    // The search still applies on the opponent tab, where it leaves nothing.
    fireEvent.click(screen.getByRole('button', { name: /Salina’s positions/ }));
    await waitFor(() => expect(screen.queryByText('A newly published claim')).toBeNull());
    expect(screen.getByText('No claims match these filters.')).toBeInTheDocument();
  });

  // Following a link to the entity page would navigate out of the app shell and abandon the live
  // session, so the claim opens beside the picker instead.
  it('opens a claim in the side panel rather than navigating to it', () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    const claim = screen.getByText('A claim both participants chose');
    expect(claim.closest('a')).toBeNull();

    fireEvent.click(claim);

    expect(mocks.openSidePanel).toHaveBeenCalledWith(CLAIM_SHARED, SPACE_1, false);
  });

  // A switch drawn from a guess is worse than one that waits: reading an unresolved lookup as
  // "not ready" would report the opposite of the truth on a claim the viewer is standing ready on.
  it('leaves the Debate toggle out until readiness is known', () => {
    mocks.claimReadinessLoading = true;
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.queryByRole('switch', { name: 'Ready to debate this claim' })).toBeNull();
  });

  it('leaves it out when the readiness lookup failed', () => {
    mocks.claimReadinessError = true;
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.queryByRole('switch', { name: 'Ready to debate this claim' })).toBeNull();
  });

  // A settled lookup with no row for the claim genuinely means not ready, so the switch belongs.
  it('shows the toggle off once a settled lookup reports nothing for the claim', () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.getByRole('switch', { name: 'Ready to debate this claim' })).not.toBeChecked();
  });

  // `keepPreviousData` keeps the previous term's page on screen while the new one fetches. Filing
  // it under the new term would let a prior search's claims survive into this one — and into the
  // unfiltered list once the term is cleared.
  it('does not bank the previous search’s page against a new term', async () => {
    const STALE = '019fedb4-3f74-7c61-8d44-5fa08b1e7732';
    const { rerender } = render(<DebateRematchPageClient sessionId="rematch-1" />);
    showAllClaims();

    // The new term is in flight, so the page still on hand belongs to the previous one. Its name
    // contains the term, so nothing downstream would filter it out if it were banked.
    mocks.entities = [publishedEntity(STALE, 'A stale claim from the previous search')];
    mocks.entityQueryPlaceholder = true;
    fireEvent.change(screen.getByRole('textbox', { name: 'Search claims' }), { target: { value: 'claim' } });
    await waitFor(() => expect(browsedClaimsWhere()).toMatchObject({ name: { contains: 'claim' } }));

    // The real page for this term lands.
    mocks.entities = [publishedEntity()];
    mocks.entityQueryPlaceholder = false;
    rerender(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.getByText('A newly published claim')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('A stale claim from the previous search')).toBeNull());
  });

  // Taking a side here means you want to debate it, so readiness shouldn't be a second step.
  // A position can appear without anyone picking one — here because geo-chat's copy of a claim the
  // viewer had already answered lands after the card is on screen. That looks identical to a fresh
  // pick, and standing them ready for it reverses a stand-down they made elsewhere.
  it('does not stand the viewer ready when geo-chat reports a position they already held', () => {
    mocks.claims = [
      {
        ...sharedClaim(),
        participants: [
          { user_id: 'user-local', position: null, position_label: null },
          { user_id: 'user-remote', position: false, position_label: 'Disagree' },
        ],
      },
    ];
    const view = render(<DebateRematchPageClient sessionId="rematch-1" />);

    mocks.claims = [
      {
        ...sharedClaim(),
        participants: [
          { user_id: 'user-local', position: true, position_label: 'Agree' },
          { user_id: 'user-remote', position: false, position_label: 'Disagree' },
        ],
      },
    ];
    view.rerender(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(mocks.setReadiness).not.toHaveBeenCalled();
  });

  // Standing down elsewhere is deliberate; arriving here mustn't quietly reverse it.
  it('leaves readiness alone for positions already held on arrival', () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(mocks.setReadiness).not.toHaveBeenCalled();
  });

  it('does not re-publish readiness that is already on', () => {
    mocks.claims = [
      {
        ...sharedClaim(),
        participants: [
          { user_id: 'user-local', position: null, position_label: null },
          { user_id: 'user-remote', position: false, position_label: 'Disagree' },
        ],
      },
    ];
    mocks.claimReadiness = [
      { claim_entity_id: CLAIM_SHARED, viewer_debate_ready: true, readiness_disabled_reason: null },
    ];
    const { rerender } = render(<DebateRematchPageClient sessionId="rematch-1" />);

    mocks.optimisticResponses.set(CLAIM_SHARED, 'positive');
    rerender(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(mocks.setReadiness).not.toHaveBeenCalled();
  });

  // The All tab browses every published claim a page at a time, so filtering the loaded pages
  // only ever searched what had been paged in. The hub's Claims tab searches server-side.
  it('searches the whole claim corpus rather than the loaded pages', async () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    showAllClaims();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search claims' }), { target: { value: 'Fast fashion' } });

    await waitFor(() => expect(browsedClaimsWhere()).toMatchObject({ name: { contains: 'Fast fashion' } }));
  });

  it('renders the card’s Debate toggle against real readiness', () => {
    mocks.claimReadiness = [
      { claim_entity_id: CLAIM_SHARED, viewer_debate_ready: true, readiness_disabled_reason: null },
    ];
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.getByRole('switch', { name: 'Ready to debate this claim' })).toBeChecked();
  });

  // Waiting for geo-chat to echo the response back would leave the side you just picked
  // unhighlighted and Request debate missing for seconds.
  it('reflects a just-picked side and offers the debate straight away', () => {
    mocks.claims = [
      {
        ...sharedClaim(),
        participants: [
          { user_id: 'user-local', position: null, position_label: null },
          { user_id: 'user-remote', position: false, position_label: 'Disagree' },
        ],
      },
    ];
    mocks.optimisticResponses.set(CLAIM_SHARED, 'positive');
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    const card = screen.getByText('A claim both participants chose').closest('article');
    expect(within(card!).getByRole('button', { name: /^Agree/ })).toHaveAttribute('aria-pressed', 'true');
  });

  // geo-chat rejects a request for a claim it has no position for — "respond to this claim before
  // requesting a rematch" — so the button waits for geo-chat's copy, not the optimistic one. It
  // stays hidden rather than disabled: an unpressable button reads as broken.
  it('withholds the request until geo-chat has the position it will be validated against', () => {
    mocks.claims = [
      {
        ...sharedClaim(),
        participants: [
          { user_id: 'user-local', position: null, position_label: null },
          { user_id: 'user-remote', position: false, position_label: 'Disagree' },
        ],
      },
    ];
    mocks.optimisticResponses.set(CLAIM_SHARED, 'positive');
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.queryByRole('button', { name: 'Request debate' })).not.toBeInTheDocument();
  });

  it('sends the request once geo-chat agrees with the side on screen', () => {
    mocks.claims = [
      {
        ...sharedClaim(),
        participants: [
          { user_id: 'user-local', position: true, position_label: 'Agree' },
          { user_id: 'user-remote', position: false, position_label: 'Disagree' },
        ],
      },
    ];
    mocks.optimisticResponses.set(CLAIM_SHARED, 'positive');
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    const request = screen.getByRole('button', { name: 'Request debate' });
    expect(request).toBeEnabled();
    fireEvent.click(request);
    expect(mocks.mutate).toHaveBeenCalled();
  });

  // Switching sides leaves geo-chat holding the side you just moved off, which is no more valid to
  // request against than holding none.
  it('withholds the request while a side switch is still publishing', () => {
    mocks.claims = [
      {
        ...sharedClaim(),
        participants: [
          { user_id: 'user-local', position: false, position_label: 'Disagree' },
          { user_id: 'user-remote', position: false, position_label: 'Disagree' },
        ],
      },
    ];
    mocks.optimisticResponses.set(CLAIM_SHARED, 'positive');
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.queryByRole('button', { name: 'Request debate' })).not.toBeInTheDocument();
  });

  // Readiness is rejected for a claim geo-chat has no response for, and `useClaimReadiness` rolls
  // the switch back when that happens — so opting in off the optimistic position made the toggle
  // visibly flip on and straight back off.
  it('waits for the response to settle before standing the viewer ready', () => {
    const unresponded = {
      ...sharedClaim(),
      participants: [
        { user_id: 'user-local', position: null, position_label: null },
        { user_id: 'user-remote', position: false, position_label: 'Disagree' },
      ],
    };
    mocks.claims = [unresponded];
    const view = render(<DebateRematchPageClient sessionId="rematch-1" />);
    expect(mocks.setReadiness).not.toHaveBeenCalled();

    // The side is picked: optimistic only, geo-chat still has nothing.
    mocks.optimisticResponses.set(CLAIM_SHARED, 'positive');
    view.rerender(<DebateRematchPageClient sessionId="rematch-1" />);
    expect(mocks.setReadiness).not.toHaveBeenCalled();

    // geo-chat catches up, and only now is readiness sent.
    mocks.claims = [
      {
        ...sharedClaim(),
        participants: [
          { user_id: 'user-local', position: true, position_label: 'Agree' },
          { user_id: 'user-remote', position: false, position_label: 'Disagree' },
        ],
      },
    ];
    view.rerender(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(mocks.setReadiness).toHaveBeenCalledWith({
      spaceId: SPACE_1,
      claimId: CLAIM_SHARED,
      ready: true,
    });
  });

  // `entity.spaces` is rank-ordered and counts any space that merely references the claim, so
  // `spaces[0]` is a citing space whenever it outranks the claim's own. Responding in one space and
  // asking to debate in another is what the server answers with "respond to this claim in this
  // space before enabling debate readiness".
  it('scopes a browsed claim to the space it is named in, not the highest-ranked one citing it', () => {
    mocks.entities = [
      {
        ...publishedEntity(CLAIM_MORE, 'A claim that lives in Podcasts'),
        // Crypto (rank 2) outranks Podcasts (rank 8), but only Podcasts names the claim.
        spaces: [CRYPTO_SPACE, PODCASTS_SPACE],
        values: [
          { isDeleted: false, property: { id: NAME_PROPERTY }, spaceId: PODCASTS_SPACE, value: 'A claim that lives in Podcasts' },
        ],
      },
    ];
    // The toggle only offers itself once the viewer holds a position.
    mocks.optimisticResponses.set(CLAIM_MORE, 'positive');
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    showAllClaims();

    const card = screen.getByText('A claim that lives in Podcasts').closest('article');
    fireEvent.click(within(card!).getByRole('switch', { name: 'Ready to debate this claim' }));

    expect(mocks.setReadiness).toHaveBeenCalledWith({
      spaceId: PODCASTS_SPACE,
      claimId: CLAIM_MORE,
      ready: true,
    });
  });

  it('stands the viewer ready only once, even as the claim keeps refetching', () => {
    mocks.claims = [
      {
        ...sharedClaim(),
        participants: [
          { user_id: 'user-local', position: null, position_label: null },
          { user_id: 'user-remote', position: false, position_label: 'Disagree' },
        ],
      },
    ];
    const view = render(<DebateRematchPageClient sessionId="rematch-1" />);

    mocks.optimisticResponses.set(CLAIM_SHARED, 'positive');
    view.rerender(<DebateRematchPageClient sessionId="rematch-1" />);

    mocks.claims = [
      {
        ...sharedClaim(),
        participants: [
          { user_id: 'user-local', position: true, position_label: 'Agree' },
          { user_id: 'user-remote', position: false, position_label: 'Disagree' },
        ],
      },
    ];
    view.rerender(<DebateRematchPageClient sessionId="rematch-1" />);
    view.rerender(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(mocks.setReadiness).toHaveBeenCalledOnce();
  });
});

/** The where clause of the query that browses published claims, not the curated lookups beside it. */
function browsedClaimsQueryOptions() {
  return mocks.entityQueries
    .filter(options => {
      const where = options.where as { types?: Array<{ id?: { equals?: string } }> } | undefined;
      return where?.types?.[0]?.id?.equals === CLAIM_TYPE_ID;
    })
    .at(-1);
}

function browsedClaimsWhere() {
  return browsedClaimsQueryOptions()?.where;
}

/** The picker opens on the opponent's positions; most assertions want the unfiltered list. */
function showAllClaims() {
  fireEvent.click(screen.getByRole('button', { name: 'All' }));
}

/**
 * Opens one of the hub filter menus and picks an option. Names are matched loosely: a space
 * option's accessible name picks up its avatar initial ("CCrypto").
 */
function selectFilter(trigger: string, option: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(trigger) }));
  fireEvent.click(screen.getByRole('button', { name: new RegExp(option) }));
}

function session(overrides: Partial<DebateRematchSession> = {}): DebateRematchSession {
  return {
    id: 'rematch-1',
    source_debate_id: 'debate-1',
    source_space_id: SPACE_1,
    status: 'browsing',
    participants: [
      {
        user_id: 'user-local',
        profile_space_id: 'profile-local',
        display_name: 'You',
        avatar_cid: null,
        participant_slot: 1,
        consented_at: '2026-07-10T10:00:00.000Z',
      },
      {
        user_id: 'user-remote',
        profile_space_id: 'profile-remote',
        display_name: 'Salina',
        avatar_cid: null,
        participant_slot: 2,
        consented_at: '2026-07-10T10:00:01.000Z',
      },
    ],
    decision_expires_at: '2026-07-10T10:00:20.000Z',
    browsing_expires_at: null,
    request: null,
    converted_debate_id: null,
    recently_rejected_claim_ids: [],
    created_at: '2026-07-10T10:00:00.000Z',
    updated_at: '2026-07-10T10:00:01.000Z',
    ...overrides,
  };
}

function sharedClaim(): DebateRematchClaim {
  return {
    claim: claimSummary(CLAIM_SHARED, 'A claim both participants chose'),
    response_kind: 'stance',
    participants: [
      { user_id: 'user-local', position: true, position_label: 'Agree' },
      { user_id: 'user-remote', position: false, position_label: 'Disagree' },
    ],
    shared_preference: true,
    recently_rejected: false,
    previously_debated: false,
  };
}

function publishedEntity(id = CLAIM_MORE, name = 'A newly published claim') {
  return {
    id,
    name,
    description: null,
    spaces: [SPACE_2],
    relations: [
      { type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: 'topic-gov', name: 'Governance' }, isDeleted: false },
      { type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: 'topic-eth', name: 'Ethics' }, isDeleted: false },
    ],
  };
}

function claimSummary(id: string, claim: string) {
  return { id, space_id: SPACE_1, claim_entity_id: id, claim, description: null };
}
