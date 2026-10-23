import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate, DebateClaimPositionSummary } from '~/core/debates/api';

import { DebateClaimFooter } from './debate-claim-footer';

const mocks = vi.hoisted(() => ({
  respond: vi.fn(),
  hookArgs: [] as Array<Record<string, unknown>>,
  queryEnabled: [] as boolean[],
  positions: [] as DebateClaimPositionSummary[],
  viewerPosition: null as boolean | null,
  summaryLoading: false,
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: ({ enabled }: { enabled: boolean }) => {
    mocks.queryEnabled.push(enabled);
    return { entities: enabled ? [{ id: 'claim-entity' }] : [], isLoading: false };
  },
}));

vi.mock('./use-debate-claim-response', () => ({
  useDebateClaimResponse: (args: Record<string, unknown>) => {
    mocks.hookArgs.push(args);
    return {
      responseKind: 'stance',
      summary: { isLoading: mocks.summaryLoading },
      control: {
        optimisticPositions: mocks.positions,
        viewerPosition: mocks.viewerPosition,
        respond: mocks.respond,
        canRespond: true,
        isResponseSubmitting: false,
        actionTitle: () => '',
        localVoteSide: null,
        responseError: null,
      },
    };
  },
}));

// Its tiers, bar and responder list have their own suite; here it only has to be placed.
vi.mock('~/core/claims/browse/claim-summary', () => ({
  ClaimSummary: ({ entityId, layout, className }: { entityId: string; layout?: string; className?: string }) => (
    <div data-testid="claim-summary" data-entity={entityId} data-layout={layout} className={className} />
  ),
}));

const claim = {
  id: 'claim-row',
  claim: 'Getting back with an ex is almost always a mistake',
  claim_entity_id: 'claim-entity',
  space_id: 'space-1',
} as unknown as Debate['claim'];

function renderFooter(props: Partial<React.ComponentProps<typeof DebateClaimFooter>> = {}) {
  return render(
    <DebateClaimFooter
      claim={claim}
      enabled
      meta={<span>Relationships</span>}
      title={<h2>{claim.claim}</h2>}
      actions={<button type="button">Comments (2)</button>}
      {...props}
    />
  );
}

beforeEach(() => {
  mocks.respond.mockReset();
  mocks.hookArgs.length = 0;
  mocks.queryEnabled.length = 0;
  mocks.positions = [];
  mocks.viewerPosition = null;
  mocks.summaryLoading = false;
});

afterEach(cleanup);

describe('DebateClaimFooter', () => {
  it('draws the meta row, the claim and the debate actions with the claim pills', () => {
    renderFooter();

    expect(screen.getByText('Relationships')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: claim.claim })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agree' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disagree' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comments (2)' })).toBeInTheDocument();
  });

  // The position is the claim's, so it lands wherever else that claim is answered.
  it("publishes a side on the debate's claim", () => {
    renderFooter();

    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));
    expect(mocks.respond).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'Disagree' }));
    expect(mocks.respond).toHaveBeenCalledWith(false);
    // In the one spelling the end card reads the same claim in, so the two share their caches.
    expect(mocks.hookArgs.at(-1)).toMatchObject({ claimId: 'claimentity', spaceId: 'space1', row: null });
  });

  it('labels the pills for click analytics alongside the card’s other actions', () => {
    renderFooter();

    const agree = screen.getByRole('button', { name: 'Agree' });
    expect(agree).toHaveAttribute('data-geo-analytics-label', 'Debate Claim card agree');
    expect(agree).toHaveAttribute('data-geo-analytics-intent', 'debate_action');
  });

  // The split band carries the voters' faces. Faces in the pills too would be the same people twice.
  it('keeps faces out of the pills, before and after a vote', () => {
    const participant = { profile_space_id: 'person', avatar_cid: null };
    mocks.positions = [
      {
        position: true,
        position_label: 'Agree',
        total_count: 5,
        available_now_count: 5,
        present_count: 5,
        participants: [participant, participant],
      } as unknown as DebateClaimPositionSummary,
    ];
    mocks.viewerPosition = true;
    renderFooter();

    const agree = screen.getByRole('button', { name: /^Agree/ });
    expect(agree).toHaveAttribute('aria-pressed', 'true');
    expect(agree.textContent).not.toContain('+');
    expect(agree.querySelector('.rounded-full')).toBeNull();
  });

  it('closes the card with the claim’s split, inline on the grey band', () => {
    renderFooter();

    const summary = screen.getByTestId('claim-summary');
    expect(summary).toHaveAttribute('data-entity', 'claimentity');
    expect(summary).toHaveAttribute('data-layout', 'inline');
    expect(summary).toHaveClass('claim-card-summary-band');
  });

  it('leaves the split out until the counts have answered', () => {
    mocks.summaryLoading = true;
    renderFooter();

    expect(screen.queryByTestId('claim-summary')).toBeNull();
  });

  // A card far down the feed has no reason to read its claim yet; once it has, scrolling away
  // must not drop the numbers it is showing.
  it('reads the claim only once enabled, and keeps reading after', () => {
    const { rerender } = renderFooter({ enabled: false });
    expect(mocks.queryEnabled.at(-1)).toBe(false);
    expect(mocks.hookArgs.at(-1)).toMatchObject({ entity: null });

    const props = {
      claim,
      meta: <span>Relationships</span>,
      title: <h2>{claim.claim}</h2>,
      actions: <button type="button">Comments (2)</button>,
    };
    rerender(<DebateClaimFooter {...props} enabled />);
    expect(mocks.queryEnabled.at(-1)).toBe(true);
    expect(mocks.hookArgs.at(-1)).toMatchObject({ entity: { id: 'claim-entity' } });

    rerender(<DebateClaimFooter {...props} enabled={false} />);
    expect(mocks.queryEnabled.at(-1)).toBe(true);
  });

  // The explore card draws the footer before its debate resolves. The row is there at its finished
  // size, so the card doesn't grow when the claim lands, but nothing in it can publish yet.
  it('holds an inert row while the debate is unresolved', () => {
    renderFooter({ claim: null });

    expect(screen.queryByRole('button', { name: 'Agree' })).toBeNull();
    expect(screen.getByText('Agree')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comments (2)' })).toBeInTheDocument();
    expect(mocks.hookArgs).toHaveLength(0);
  });
});
