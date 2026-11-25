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
  localVoteSide: null as boolean | null,
  summaryLoading: false,
  // What the claim's graph read returns: the entity, or none with the read in flight or settled.
  claimRead: 'found' as 'found' | 'pending' | 'missing',
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: ({ enabled }: { enabled: boolean }) => {
    mocks.queryEnabled.push(enabled);
    const found = enabled && mocks.claimRead === 'found';
    return { entities: found ? [{ id: 'claim-entity' }] : [], isLoading: enabled && mocks.claimRead === 'pending' };
  },
}));

vi.mock('./use-debate-claim-response', () => ({
  useDebateClaimResponse: (args: Record<string, unknown>) => {
    mocks.hookArgs.push(args);
    return {
      responseKind: 'stance',
      isResponseKindResolved: args.entity != null,
      summary: { isLoading: mocks.summaryLoading },
      control: {
        optimisticPositions: mocks.positions,
        viewerPosition: mocks.viewerPosition,
        respond: mocks.respond,
        canRespond: true,
        isResponseSubmitting: false,
        actionTitle: () => '',
        localVoteSide: mocks.localVoteSide,
        responseError: null,
      },
    };
  },
}));

// Its tiers, bar and responder list have their own suite; here it only has to be placed.
vi.mock('~/core/claims/browse/claim-summary', () => ({
  ClaimSummary: ({
    entityId,
    layout,
    className,
    summary,
  }: {
    entityId: string;
    layout?: string;
    className?: string;
    summary: { isLoading: boolean };
  }) => (
    <div
      data-testid="claim-summary"
      data-entity={entityId}
      data-layout={layout}
      data-loading={String(summary.isLoading)}
      className={className}
    />
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
  mocks.localVoteSide = null;
  mocks.summaryLoading = false;
  mocks.claimRead = 'found';
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

  // geo-chat hands out hyphenated UUIDs and the graph dashless hex. The end card reads this claim in
  // the dashless spelling; a footer reading the other would get its own cache entries, and a side
  // taken in one would not show in the other.
  it('reads the claim in the spelling the end card does, whatever geo-chat sends', () => {
    renderFooter({
      claim: {
        ...claim,
        claim_entity_id: '0199A4B2-7C3D-7E8F-9A0B-1C2D3E4F5A6B',
        space_id: '41E85161-0E13-A194-41C4-D980F2F2CE6B',
      } as Debate['claim'],
    });

    expect(mocks.hookArgs.at(-1)).toMatchObject({
      claimId: '0199a4b27c3d7e8f9a0b1c2d3e4f5a6b',
      spaceId: '41e851610e13a19441c4d980f2f2ce6b',
    });
  });

  // The explore card draws the footer before its debate resolves. The row is there at its finished
  // size, so the card doesn't grow when the claim lands, and it starts in the disabled state the live
  // pills open in, so it doesn't look pressable and then dim.
  it('holds a disabled row while the debate is unresolved, keeping the debate actions live', () => {
    renderFooter({ claim: null });

    expect(screen.getByRole('button', { name: 'Agree' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Disagree' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Comments (2)' })).toBeEnabled();
    expect(mocks.hookArgs).toHaveLength(0);
  });

  // GEO-3833: the debates app's card, the one look on every surface — Geo's meta row under the
  // video, then the claim, the vote row and the results once voted.
  const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  // The debates app's web fonts, over Geo's Calibre: the system stack, and Helvetica Neue for the claim.
  it('sets the card in the debates app’s fonts', () => {
    const { container } = renderFooter({ className: 'px-4' });
    const root = container.firstElementChild!;
    expect(root.className).toContain("[font-family:-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,Helvetica,Arial,sans-serif]");
    expect(root.className).toContain('px-4');
    expect(screen.getByRole('heading', { name: claim.claim }).parentElement!.className).toContain(
      "[&_h2]:[font-family:'Helvetica_Neue',Arial,sans-serif]!"
    );
  });

  it('puts the meta row above the claim, then the vote row', () => {
    renderFooter();

    const title = screen.getByRole('heading', { name: claim.claim });
    const agree = screen.getByRole('button', { name: 'Agree' });
    const meta = screen.getByText('Relationships');
    expect(follows(meta, title)).toBe(true);
    expect(follows(title, agree)).toBe(true);
  });

  it('draws the app’s 44px outlined pills, with the actions on the same row', () => {
    renderFooter();

    const agree = screen.getByRole('button', { name: 'Agree' });
    expect(agree).toHaveClass('h-11', 'rounded-full', 'border-[#8a8a8a]', 'font-semibold');
    expect(agree).not.toHaveClass('border-dashed');
    const grid = agree.parentElement!.parentElement!;
    expect(grid).toHaveClass('grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]');
    expect(grid.children).toHaveLength(3);
    // The label gives way to the thumb in a narrow row, but stays the button's name.
    expect(screen.getByText('Agree')).toHaveClass('@max-[300px]/debate-actions:sr-only');
  });

  it('shows no results before a vote', () => {
    renderFooter();

    expect(screen.queryByTestId('claim-summary')).toBeNull();
  });

  it('reveals the results row once the viewer holds a side, and marks the picked pill', () => {
    mocks.viewerPosition = false;
    renderFooter();

    const disagree = screen.getByRole('button', { name: /^Disagree/ });
    expect(disagree).toHaveAttribute('aria-pressed', 'true');
    expect(disagree).toHaveClass('border-[#151515]', 'font-bold');
    const results = screen.getByTestId('claim-summary');
    expect(results).toHaveAttribute('data-layout', 'results');
    expect(follows(disagree, results)).toBe(true);
    expect(follows(screen.getByText('Relationships'), disagree)).toBe(true);
  });

  // Signed out: the vote is on this device only. The note moves from under the pill to under the
  // results, where the app's row would show the count it is not yet part of.
  it('notes a side held only on this device under the results, not under its pill', () => {
    mocks.viewerPosition = true;
    mocks.localVoteSide = true;
    renderFooter();

    const note = screen.getByText(/^Not counted yet/);
    const agree = screen.getByRole('button', { name: /^Agree/ });
    expect(agree.parentElement!.contains(note)).toBe(false);
    expect(follows(screen.getByTestId('claim-summary'), note)).toBe(true);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('holds a disabled app row while the debate is unresolved', () => {
    renderFooter({ claim: null });

    expect(screen.getByRole('button', { name: 'Agree' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Agree' })).toHaveClass('h-11');
    expect(screen.getByRole('button', { name: 'Comments (2)' })).toBeEnabled();
  });
});

// GEO-3833: a device vote shows the results row before the claim's entity is read. Until that read
// lands the counts are held back, so the row is told it is loading — but only while it is in
// flight: a read that failed or found nothing must not say "Loading results…" forever.
describe('DebateClaimFooter results row before the claim resolves', () => {
  it.each([
    ['pending', 'true'],
    ['missing', 'false'],
    ['found', 'false'],
  ] as const)('with the claim read %s, the row reads loading=%s', (claimRead, loading) => {
    mocks.claimRead = claimRead;
    mocks.localVoteSide = true;
    renderFooter();

    expect(screen.getByTestId('claim-summary')).toHaveAttribute('data-loading', loading);
  });

  it('reads as loading on a card that has not asked for its claim yet', () => {
    mocks.localVoteSide = true;
    renderFooter({ enabled: false });

    expect(screen.getByTestId('claim-summary')).toHaveAttribute('data-loading', 'true');
  });
});
