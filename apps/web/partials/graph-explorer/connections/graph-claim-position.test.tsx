import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClaimActions } from './centre-summary';

const mocks = vi.hoisted(() => ({
  entities: [] as Array<{ id: string; name: string }>,
  authenticated: true,
  controlArgs: [] as Array<Record<string, unknown>>,
  respond: vi.fn(),
  queuePosition: vi.fn(),
  cancelQueuedPosition: vi.fn(),
  promptSignIn: vi.fn(),
  viewerPosition: null as boolean | null,
  summaryOrder: [] as string[],
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
    indexedViewerDirection: null,
  }),
}));

// The real derivation above it (`useDebateClaimResponse`, `useClaimResponseState`) and the real
// pills; only the control that publishes is stubbed, and it reports what it was built with.
vi.mock('~/core/debates/matchmaking/matchmaking-claim-card', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/debates/matchmaking/matchmaking-claim-card')>()),
  useClaimPositionControl: (args: Record<string, unknown>) => {
    mocks.controlArgs.push(args);
    const signedOut = !mocks.authenticated;
    return {
      optimisticPositions: [],
      viewerPosition: mocks.viewerPosition,
      respond: mocks.respond,
      actionTitle: () => '',
      responseError: null,
      localVoteSide: null,
      isResponseSubmitting: false,
      // As the real control: signed out, only a host that keeps votes on the device lets a press through.
      canRespond: Boolean(args.answersReady) && (!signedOut || Boolean(args.allowsSignedOutVotes)),
      queuePosition: mocks.queuePosition,
      cancelQueuedPosition: mocks.cancelQueuedPosition,
    };
  },
}));

vi.mock('~/core/debates/hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/debates/hooks')>()),
  useGeoChatAuth: () => ({ ready: true, authenticated: mocks.authenticated }),
}));

vi.mock('~/core/hooks/use-privy-sign-in', () => ({
  usePrivySignIn: () => mocks.promptSignIn,
}));

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
  return render(<ClaimActions claimId={CLAIM_ID} spaceId={SPACE_ID} />);
}

beforeEach(() => {
  mocks.entities = [{ id: CLAIM_ID, name: 'There’s no genocide in Gaza' }];
  mocks.authenticated = true;
  mocks.controlArgs.length = 0;
  mocks.respond.mockReset();
  mocks.queuePosition.mockReset();
  mocks.cancelQueuedPosition.mockReset();
  mocks.promptSignIn.mockReset();
  mocks.promptSignIn.mockReturnValue({ id: 'attempt-1' });
  mocks.viewerPosition = null;
});

afterEach(cleanup);

describe('the open claim’s Agree and Disagree', () => {
  it('draws labeled Agree and Disagree under the claim’s split', () => {
    renderActions();

    const agree = screen.getByRole('button', { name: 'Agree' });
    const disagree = screen.getByRole('button', { name: 'Disagree' });
    const split = screen.getByTestId('claim-summary');
    expect(split).toHaveTextContent('5 of 7 agree');
    // The split reads first, then the buttons that change it.
    expect(split.compareDocumentPosition(agree) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(disagree).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the claim →' })).toBeInTheDocument();
  });

  // Review finding: with neither geo-chat's row nor the graph entity, the response kind never
  // resolves and the buttons would stay disabled for good. Most of the map's spaces have no row.
  it('is pressable with no geo-chat row once the claim’s entity has loaded', () => {
    renderActions();

    expect(screen.getByRole('button', { name: 'Agree' })).toBeEnabled();
    expect(mocks.controlArgs.at(-1)).toMatchObject({ answersReady: true, offersDebate: false });
  });

  it('waits for the claim’s entity before taking a side', () => {
    mocks.entities = [];
    renderActions();

    expect(screen.getByRole('button', { name: 'Agree' })).toBeDisabled();
  });

  it('publishes the side pressed and draws it as the viewer’s', () => {
    const { rerender } = renderActions();

    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));
    expect(mocks.respond).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'Disagree' }));
    expect(mocks.respond).toHaveBeenCalledWith(false);

    mocks.viewerPosition = true;
    rerender(<ClaimActions claimId={CLAIM_ID} spaceId={SPACE_ID} />);
    expect(screen.getByRole('button', { name: /^Agree.*your response/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Disagree' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('labels the buttons for click analytics as the graph explorer’s', () => {
    renderActions();

    const agree = screen.getByRole('button', { name: 'Agree' });
    expect(agree).toHaveAttribute('data-geo-analytics-label', 'Graph explorer Claim card agree');
    expect(agree).toHaveAttribute('data-geo-analytics-intent', 'graph_explorer_action');
  });

  describe('signed out', () => {
    beforeEach(() => {
      mocks.authenticated = false;
    });

    // Preston, 24 Nov: sign in first, then the vote is cast; never a vote kept on this device.
    it('opens sign-in and holds the side for after it, rather than voting on this device', () => {
      renderActions();

      expect(mocks.controlArgs.at(-1)).toMatchObject({ allowsSignedOutVotes: false });
      const agree = screen.getByRole('button', { name: 'Agree' });
      expect(agree).toBeEnabled();
      fireEvent.click(agree);

      expect(mocks.promptSignIn).toHaveBeenCalledTimes(1);
      expect(mocks.promptSignIn.mock.calls[0][0]).toMatchObject({
        list_id: 'graph_explorer_centre',
        component: 'claim_position_control',
        auth_control: 'stance_positive',
        auth_intent: 'vote',
        auth_continuation: 'queued',
      });
      expect(mocks.queuePosition).toHaveBeenCalledWith(true);
      expect(mocks.respond).not.toHaveBeenCalled();
    });

    it('withdraws the held side when sign-in is dismissed', () => {
      renderActions();

      fireEvent.click(screen.getByRole('button', { name: 'Disagree' }));
      expect(mocks.queuePosition).toHaveBeenCalledWith(false);
      mocks.promptSignIn.mock.calls[0][1].onCancel();
      expect(mocks.cancelQueuedPosition).toHaveBeenCalled();
    });

    it('waits for the claim’s entity before offering sign-in', () => {
      mocks.entities = [];
      renderActions();

      fireEvent.click(screen.getByRole('button', { name: 'Agree' }));
      expect(mocks.promptSignIn).not.toHaveBeenCalled();
    });
  });
});
