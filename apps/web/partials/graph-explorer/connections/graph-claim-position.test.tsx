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
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: () => ({ entities: mocks.entities, isLoading: false }),
}));

// The counts have landed, and geo-chat has no row for this claim: what most of the map's spaces get.
vi.mock('~/core/claims/browse/claim-response-summary', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/claims/browse/claim-response-summary')>()),
  useClaimResponseSummary: () => ({
    isLoading: false,
    isViewerResponseLoading: false,
    hasCounts: true,
    positive: 5,
    negative: 2,
    total: 7,
    indexedViewerDirection: mocks.indexedViewerDirection,
  }),
}));

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

vi.mock('~/core/claims/browse/claim-summary', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/claims/browse/claim-summary')>()),
  ClaimSummary: ({ summary }: { summary: { positive: number; total: number } }) => (
    <div data-testid="claim-summary">
      {summary.positive} of {summary.total} agree
    </div>
  ),
}));

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
  vi.mocked(openSaveVotesPrompt).mockClear();
  vi.mocked(recordAction).mockClear();
  clearLocalVotes();
});

afterEach(cleanup);

describe('the open claim’s Agree and Disagree', () => {
  it('draws labeled Agree and Disagree under the claim’s split', () => {
    renderActions();

    const agree = screen.getByRole('button', { name: 'Agree' });
    const split = screen.getByTestId('claim-summary');
    expect(split).toHaveTextContent('5 of 7 agree');
    // The split reads first, then the buttons that change it.
    expect(split.compareDocumentPosition(agree) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The box is grey: the split's responder faces ring in grey, not white.
    expect(split.parentElement?.style.getPropertyValue('--avatar-group-ring')).toBe('var(--color-grey-01)');
    expect(screen.getByRole('button', { name: 'Disagree' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the claim →' })).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: /^Agree.*your response/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Disagree' })).toHaveAttribute('aria-pressed', 'false');
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
