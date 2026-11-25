import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { recordAction } from '~/core/analytics-operations';
import { clearLocalVotes, readLocalVotes } from '~/core/state/local-votes';
import { openSaveVotesPrompt } from '~/core/state/save-votes-prompt';

import { ClaimActions } from './centre-summary';

const mocks = vi.hoisted(() => ({
  entities: [] as Array<{ id: string; name: string }>,
  authenticated: true,
  submitResponse: vi.fn(),
  indexedViewerDirection: null as 'positive' | 'negative' | null,
  counts: { positive: 5, negative: 2 },
  hasCounts: true,
  countsLoading: false,
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: () => ({ entities: mocks.entities, isLoading: false }),
}));

// The counts have landed, and geo-chat has no row for this claim: what most of the map's spaces get.
vi.mock('~/core/claims/browse/claim-response-summary', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/claims/browse/claim-response-summary')>();
  return {
    ...actual,
    useClaimResponseSummary: () => ({
      ...actual.summarizeClaimResponses(mocks.counts.positive, mocks.counts.negative),
      isLoading: mocks.countsLoading,
      isViewerResponseLoading: false,
      hasCounts: mocks.hasCounts,
      indexedViewerDirection: mocks.indexedViewerDirection,
    }),
  };
});

// Everything from the hook down to the pills is real, including the signed-out device vote; only
// the publish and the session are stubbed.
vi.mock('~/core/hooks/use-entity-vote', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/hooks/use-entity-vote')>()),
  useEntityResponse: () => ({
    submitResponse: mocks.submitResponse,
    submitResponseAsync: vi.fn(),
    isConnected: mocks.authenticated,
    personalSpaceId: mocks.authenticated ? 'personal-space' : null,
  }),
}));

vi.mock('~/core/debates/hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/debates/hooks')>()),
  useGeoChatAuth: () => ({ ready: true, authenticated: mocks.authenticated }),
}));

vi.mock('~/core/hooks/use-profiles-by-space-ids', () => ({
  useProfilesBySpaceIds: () => ({ profilesBySpaceId: new Map() }),
}));

vi.mock('~/core/state/save-votes-prompt', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/state/save-votes-prompt')>();
  return { ...actual, openSaveVotesPrompt: vi.fn() };
});
vi.mock('~/core/analytics-operations', () => ({ recordAction: vi.fn() }));

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));

const CLAIM_ID = '01a20ecb8a617470b7e66de9ba5d82e8';
const SPACE_ID = 'a19c345ab9866679b001d7d2138d88a1';

function renderActions() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = () => (
    <QueryClientProvider client={client}>
      <ClaimActions claimId={CLAIM_ID} spaceId={SPACE_ID} />
    </QueryClientProvider>
  );
  const view = render(ui());
  return { ...view, rerender: () => view.rerender(ui()) };
}

beforeEach(() => {
  mocks.entities = [{ id: CLAIM_ID, name: 'There’s no genocide in Gaza' }];
  mocks.authenticated = true;
  mocks.submitResponse.mockReset();
  mocks.indexedViewerDirection = null;
  mocks.counts = { positive: 5, negative: 2 };
  mocks.hasCounts = true;
  mocks.countsLoading = false;
  vi.mocked(openSaveVotesPrompt).mockClear();
  vi.mocked(recordAction).mockClear();
  clearLocalVotes();
});

afterEach(cleanup);

describe('the open claim’s Agree and Disagree', () => {
  // The prototype's map panel: "71% agree" and the count on one line, a thin bar, two outlined pills.
  it('reads the share and the count over a bar, then the two pills', () => {
    renderActions();

    const percent = screen.getByText('71%');
    expect(percent.parentElement).toHaveTextContent('71% agree');
    const count = screen.getByText('7 votes');
    // The count sits on the share's row, at the other end of it.
    expect(count.parentElement).toBe(percent.parentElement?.parentElement);
    const bar = screen.getByRole('img', { name: '71% agree, 29% disagree' });
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('71%');
    // One black fill on the grey track: ClaimSplitBar's mono tone, not the green/red split.
    expect(bar).toHaveClass('bg-divider');
    expect(bar.children).toHaveLength(1);
    expect(bar.firstElementChild).toHaveClass('bg-text');
    // Smaller than "agree", as in the prototype; not the chat widget's token, which chat.css resizes.
    expect(count).toHaveClass('text-browseSection');
    expect(count).not.toHaveClass('text-chat');

    const agree = screen.getByRole('button', { name: 'Agree' });
    const disagree = screen.getByRole('button', { name: 'Disagree' });
    expect(count.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bar.compareDocumentPosition(agree) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Solid outlines, not the debate card's dashed ones, and no faces in them.
    for (const pill of [agree, disagree]) {
      expect(pill).toHaveClass('border-grey-03', 'min-h-8');
      expect(pill).not.toHaveClass('border-dashed');
      expect(pill.querySelector('img')).toBeNull();
    }
    expect(screen.getByRole('link', { name: 'Open the claim →' })).toBeInTheDocument();
  });

  it('says "No votes yet" and draws no share or bar before anyone has voted', () => {
    mocks.counts = { positive: 0, negative: 0 };
    renderActions();

    expect(screen.getByText('No votes yet')).toBeInTheDocument();
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.queryByRole('img', { name: /agree/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Agree' })).toBeInTheDocument();
  });

  // Review finding (round 4): a failed or pending count reads as total 0, which is not "No votes yet".
  it.each([
    ['the counts failed', { hasCounts: false, countsLoading: false }],
    ['the counts are loading', { hasCounts: false, countsLoading: true }],
  ])('draws neither "No votes yet", a share nor a bar while %s, but keeps the pills', (_, state) => {
    mocks.counts = { positive: 0, negative: 0 };
    mocks.hasCounts = state.hasCounts;
    mocks.countsLoading = state.countsLoading;
    renderActions();

    expect(screen.queryByText('No votes yet')).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.queryByRole('img', { name: /agree/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Agree' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disagree' })).toBeInTheDocument();
  });

  // ClaimSummary's rule: the share from the first vote on.
  it('gives the share from a single vote', () => {
    mocks.counts = { positive: 1, negative: 0 };
    renderActions();

    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('1 vote')).toBeInTheDocument();
  });

  // Review finding: with neither geo-chat's row nor the graph entity, the response kind never
  // resolves and the buttons would stay disabled for good. Most of the map's spaces have no row.
  it('is pressable with no geo-chat row once the claim’s entity has loaded', () => {
    renderActions();
    expect(screen.getByRole('button', { name: 'Agree' })).toBeEnabled();
  });

  it('waits for the claim’s entity before taking a side', () => {
    mocks.entities = [];
    renderActions();
    expect(screen.getByRole('button', { name: 'Agree' })).toBeDisabled();
  });

  it('publishes the side pressed and draws the viewer’s side as selected', () => {
    const { rerender } = renderActions();

    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));
    expect(mocks.submitResponse).toHaveBeenCalledWith('positive', expect.anything());

    mocks.indexedViewerDirection = 'positive';
    rerender();
    const held = screen.getByRole('button', { name: /^Agree.*your response/ });
    expect(held).toHaveAttribute('aria-pressed', 'true');
    // Held is the grey fill, as in the prototype; the other side keeps its outline.
    expect(held).toHaveClass('bg-divider', 'border-transparent');
    const other = screen.getByRole('button', { name: 'Disagree' });
    expect(other).toHaveAttribute('aria-pressed', 'false');
    expect(other).toHaveClass('bg-white', 'border-grey-03');
  });

  // Preview test, ticket AC2: the vote count shows beside the percentage and moves with a vote.
  it('says how many voted, and counts a vote once it lands', () => {
    const { rerender } = renderActions();
    expect(screen.getByText('7 votes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));
    // The summary hook adds the viewer's side to the counts (stubbed here as the counts it returns).
    mocks.counts = { positive: 6, negative: 2 };
    rerender();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('8 votes')).toBeInTheDocument();
  });

  it('labels the buttons for click analytics as the graph explorer’s', () => {
    renderActions();

    const agree = screen.getByRole('button', { name: 'Agree' });
    expect(agree).toHaveAttribute('data-geo-analytics-label', 'Graph explorer Claim card agree');
    expect(agree).toHaveAttribute('data-geo-analytics-intent', 'graph_explorer_action');
  });

  // Preston, 24 Nov: as the thumbs and the claim page do — kept on the device, then the save sheet.
  it('signed out, keeps the side on this device, draws it as selected and opens the save sheet', () => {
    mocks.authenticated = false;
    renderActions();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Disagree' }));
    });

    expect(mocks.submitResponse).not.toHaveBeenCalled();
    expect(readLocalVotes().votes).toEqual([
      expect.objectContaining({ entityId: CLAIM_ID, spaceId: SPACE_ID, direction: 'negative' }),
    ]);
    expect(screen.getByRole('button', { name: /^Disagree.*your response/ })).toHaveAttribute('aria-pressed', 'true');
    expect(openSaveVotesPrompt).toHaveBeenCalledTimes(1);
    // The feed's first ask, as the panel's thumbs make: not the claim page's 'single_claim'.
    expect(openSaveVotesPrompt).toHaveBeenCalledWith('threshold');

    // "Not counted yet · Save" under the pill pressed, and Save opens the sheet.
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save.closest('p')).toHaveTextContent('Not counted yet · Save');
    fireEvent.click(save);
    expect(openSaveVotesPrompt).toHaveBeenLastCalledWith('inline_save');
  });

  // The vote's action carries the centre's list, so the graph explorer's votes can be told apart.
  it('attributes a vote to the graph explorer’s centre', () => {
    mocks.authenticated = false;
    renderActions();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Agree' }));
    });

    expect(recordAction).toHaveBeenCalledWith(
      'local_vote',
      expect.objectContaining({ component: 'claim_position_control', list_id: 'graph_explorer_centre' }),
      expect.anything()
    );
  });
});
