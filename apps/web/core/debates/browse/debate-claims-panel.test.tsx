import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate, DebateParticipant } from '~/core/debates/api';
import type { DebateTranscriptClaims, TranscriptClaim } from '~/core/debates/transcript-claims';

import { DebateClaimsPanel } from './debate-claims-panel';

const PRESTON_SPACE = 'f3dab79cb5a3d9d1759656dd5361d1c6';
const ARTURAS_SPACE = 'cc31e40f74231d530f1b5d0fc1cd94d8';
const CLAIM_SPACE = '52c7ae149838b6d47ce0f3b2a5974546';

const mocks = vi.hoisted(() => ({
  claims: null as DebateTranscriptClaims | null,
  isLoading: false,
  rankingReady: true,
  error: null as Error | null,
  /** Props every rendered response control received, in render order. */
  responseControlProps: [] as Array<Record<string, unknown>>,
  rankByClaimId: new Map<string, number>(),
  /** What the batched entity lookup resolves to. Empty means it answered with nothing. */
  claimEntities: [] as Array<{ id: string }>,
  /** Every set of per-space groups the row lookup was asked for. */
  rowGroups: [] as Array<Array<{ spaceId: string; claimIds: string[] }>>,
  /** Whether each rendered row's controls asked for the account-level match, in render order. */
  positionControlOffersDebate: [] as boolean[],
}));

vi.mock('~/core/debates/use-debate-transcript-claims', () => ({
  useDebateTranscriptClaims: () => ({
    claims: mocks.claims,
    isLoading: mocks.isLoading,
    error: mocks.error,
  }),
}));

vi.mock('~/core/debates/use-debate-votes', () => ({
  useDebateVotes: () => ({
    sharePercentFor: () => null,
    isMyPick: () => false,
    hasVoted: false,
    isVoting: false,
    castVote: vi.fn(),
  }),
}));

vi.mock('~/core/debates/claims-best-order', async () => {
  const actual = await vi.importActual<typeof import('~/core/debates/claims-best-order')>(
    '~/core/debates/claims-best-order'
  );
  // The real sort is under test through the panel; only the network lookup is stubbed.
  return {
    ...actual,
    useClaimsBestOrder: () => ({ rankByClaimId: mocks.rankByClaimId, isReady: mocks.rankingReady }),
  };
});

// The rows carry the shared claim controls now — labelled pills and the shared summary —
// rather than the data block's chevrons. Mocked at the summary, which is the one part that receives
// the claim and its space, so these assertions still test what they always tested: which claim each row
// is for, and which space it is scoped to.
vi.mock('~/core/claims/browse/claim-summary', () => ({
  ClaimSummary: (props: Record<string, unknown>) => {
    mocks.responseControlProps.push(props);
    return <div data-testid={`row-actions-${String(props.entityId)}`} />;
  },
}));

// The pills publish through the entity-response stack, which is not what this panel is about.
vi.mock('~/core/debates/matchmaking/matchmaking-claim-card', () => ({
  PositionRow: ({ disabled }: { disabled?: boolean }) => (
    <div data-testid="position-row" data-disabled={String(Boolean(disabled))} />
  ),
  // Honours `answersReady`, because the real hook does. The gate used to live in each caller's
  // `disabled`, so a mock that hardcoded `canRespond: true` could still be caught by these
  // assertions; now that it lives in the hook, a hardcoded mock would report every claim as
  // answerable no matter what the lookups say — and these suites would go quiet on the bug they
  // exist to catch.
  useClaimPositionControl: ({
    answersReady = true,
    offersDebate = true,
  }: {
    answersReady?: boolean;
    offersDebate?: boolean;
  }) => {
    mocks.positionControlOffersDebate.push(offersDebate);
    return {
      viewerPosition: null,
      optimisticPositions: [],
      respond: vi.fn(),
      actionTitle: () => (answersReady ? '' : 'Loading this claim’s responses…'),
      responseError: null,
      canRespond: answersReady,
    // Mirrors the hook: the request offer reads this to tell a late index from a publish in flight.
    responseIndexing: { status: 'idle', pending: null, runId: null },
    };
  },
}));

vi.mock('~/core/claims/browse/claim-response-summary', () => ({
  useClaimResponseSummary: () => ({
    positive: 0,
    negative: 0,
    total: 0,
    percent: null,
    meetsFloor: false,
    isControversial: false,
    isLoading: false,
    isViewerResponseLoading: false,
    hasCounts: true,
    viewerDirection: null,
    viewerSpaceId: null,
  }),
}));

vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => vi.fn() }));

// The panel resolves the claim entities to answer the response vocabulary where geo-chat has no
// row. That is a graph read, and these suites are about grouping and ordering.
vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: () => ({ entities: mocks.claimEntities, isLoading: false }),
}));

vi.mock('~/core/debates/hooks', () => ({
  // Grouped per space, since a debate can quote a claim that lives somewhere else. `rowGroups`
  // records what the panel asked for, so the suite can assert it did not flatten them into one.
  useDebateClaimsBySpaces: (groups: Array<{ spaceId: string; claimIds: string[] }>) => {
    mocks.rowGroups.push(groups);
    return { claims: [], isLoading: false, isError: false };
  },
}));

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock('~/design-system/avatar', () => ({ Avatar: () => <div data-testid="avatar" /> }));

vi.mock('./winner-vote-button', () => ({ WinnerVoteButton: () => <button type="button">Winner?</button> }));

function claim(id: string, text: string, overrides: Partial<TranscriptClaim> = {}): TranscriptClaim {
  return { id, text, spaceId: CLAIM_SPACE, ...overrides };
}

function grouped(byAuthor: Record<string, TranscriptClaim[]>, unattributed: TranscriptClaim[] = []) {
  const byAuthorSpaceId = new Map(Object.entries(byAuthor));
  const all = [...byAuthorSpaceId.values()].flat().concat(unattributed);
  return { all, byAuthorSpaceId, unattributed, totalCount: all.length };
}

function participant(spaceId: string, name: string, slot: 1 | 2): DebateParticipant {
  return {
    user_id: `user-${name}`,
    profile_space_id: spaceId,
    display_name: name,
    avatar_cid: null,
    participant_slot: slot,
    position: slot === 1,
    position_label: slot === 1 ? 'Agree' : 'Disagree',
    joined_at: null,
    ready_at: null,
  };
}

function debate(): Debate {
  return {
    id: 'debate-1',
    claim: {
      id: 'claim-summary-1',
      space_id: CLAIM_SPACE,
      claim_entity_id: 'claim-entity-1',
      claim: 'Waking up early improves health and productivity',
      description: null,
    },
    status: 'complete',
    participants: [participant(PRESTON_SPACE, 'Preston Mantel', 1), participant(ARTURAS_SPACE, 'Arturas Vil', 2)],
  } as unknown as Debate;
}

/** The card for a given debater, so assertions can scope to one group. */
function cardFor(name: string) {
  return screen.getByText(name).closest('article') as HTMLElement;
}

beforeEach(() => {
  mocks.claims = grouped({});
  mocks.isLoading = false;
  mocks.error = null;
  mocks.responseControlProps.length = 0;
  mocks.rankByClaimId = new Map();
  mocks.claimEntities = [];
  mocks.rowGroups = [];
  mocks.positionControlOffersDebate = [];
  mocks.rankingReady = true;
});

afterEach(cleanup);

describe('DebateClaimsPanel', () => {
  it('groups each claim under the debater who made it', () => {
    mocks.claims = grouped({
      [PRESTON_SPACE]: [claim('claim-1', 'Waking up early provides more sunlight.')],
      [ARTURAS_SPACE]: [claim('claim-2', 'Sunlight exposure can cause skin cancer.')],
    });

    render(<DebateClaimsPanel debate={debate()} onClose={vi.fn()} />);

    expect(within(cardFor('Preston Mantel')).getByText('Waking up early provides more sunlight.')).toBeInTheDocument();
    expect(within(cardFor('Arturas Vil')).getByText('Sunlight exposure can cause skin cancer.')).toBeInTheDocument();
  });

  // The merge that fills an empty side with the people behind an account-level match belongs to the
  // offer it explains — a card must not offer a debate on a side showing nobody to debate. This
  // panel makes no offer: it has no end slot, because the reader is already watching the debate this
  // claim is being argued in. Left on, the merge would drop an unrelated online stranger's face into
  // a pill on a row about this debate's own participants.
  it('does not borrow faces from an account-level match it never offers', () => {
    mocks.claims = grouped({ [PRESTON_SPACE]: [claim('claim-1', 'Sleep matters.')] });

    render(<DebateClaimsPanel debate={debate()} onClose={vi.fn()} />);

    expect(mocks.positionControlOffersDebate).not.toHaveLength(0);
    expect(mocks.positionControlOffersDebate.every(offers => offers === false)).toBe(true);
  });

  it('links each claim to its entity in the space the claim lives in', () => {
    mocks.claims = grouped({ [PRESTON_SPACE]: [claim('claim-1', 'Sleep matters.')] });

    render(<DebateClaimsPanel debate={debate()} onClose={vi.fn()} />);

    const link = screen.getByText('Sleep matters.').closest('a');
    expect(link).toHaveAttribute('href', expect.stringContaining('claim-1'));
    expect(link).toHaveAttribute('href', expect.stringContaining(CLAIM_SPACE));
  });

  // EntityRowActions is the whole set a data block's bulleted-list row renders — the response
  // control *and* the Debate toggle. Reaching past it for the response control alone is what left
  // the toggle off these rows.
  it('renders the full row actions under every claim, scoped to that claim', () => {
    mocks.claims = grouped({
      [PRESTON_SPACE]: [claim('claim-1', 'One.'), claim('claim-2', 'Two.')],
    });

    render(<DebateClaimsPanel debate={debate()} onClose={vi.fn()} />);

    expect(screen.getByTestId('row-actions-claim-1')).toBeInTheDocument();
    expect(screen.getByTestId('row-actions-claim-2')).toBeInTheDocument();
    expect(mocks.responseControlProps.map(props => props.entityId)).toEqual(['claim-1', 'claim-2']);
    expect(mocks.responseControlProps.every(props => props.spaceId === CLAIM_SPACE)).toBe(true);
  });

  it('orders each debater\u2019s claims by the best ranking, unranked keeping transcript order', () => {
    // Lowercase, dash-free ids: ranks match through `uuidToHex`, which strips dashes and lowercases.
    mocks.rankByClaimId = new Map([['cccc', 0]]);
    mocks.claims = grouped({
      [PRESTON_SPACE]: [claim('aaaa', 'A.'), claim('bbbb', 'B.'), claim('cccc', 'C.')],
    });

    render(<DebateClaimsPanel debate={debate()} onClose={vi.fn()} />);

    expect(mocks.responseControlProps.map(props => props.entityId)).toEqual(['cccc', 'aaaa', 'bbbb']);
  });

  // Both the link and the response target are space-scoped, so a claim with no space has nothing
  // correct to point at. Showing the text without controls beats guessing a space.
  it('asks each claim\u2019s own space for its row, not the first space it saw', () => {
    // `TranscriptClaim.spaceId` is allowed to differ per claim — a debate that quotes an external
    // claim has at least two. Sending the whole list to one space returns nothing for the rest, and
    // those rows lose their vocabulary and their available participants without saying so.
    mocks.claims = grouped({
      [PRESTON_SPACE]: [claim('claim-1', 'Local.'), claim('claim-2', 'External.', { spaceId: 'space-other' })],
    });

    render(<DebateClaimsPanel debate={debate()} onClose={vi.fn()} />);

    const groups = mocks.rowGroups.at(-1) ?? [];
    expect(groups).toHaveLength(2);
    expect(groups.find(group => group.spaceId === CLAIM_SPACE)?.claimIds).toEqual(['claim-1']);
    expect(groups.find(group => group.spaceId === 'space-other')?.claimIds).toEqual(['claim-2']);
  });

  it('will not let anyone answer before the claim’s vocabulary is known', () => {
    // `stance` is the fallback while the entity batch is in flight, so the pills would say Agree and
    // Disagree on a claim that wants Verify and Dispute — and a click inside that window publishes a
    // stance response against a factual claim. The kind selects `voteKind` on the write, so this is
    // not a labelling problem; it is the wrong vote.
    mocks.claims = grouped({ [PRESTON_SPACE]: [claim('claim-1', 'One.')] });

    const { unmount } = render(<DebateClaimsPanel debate={debate()} onClose={vi.fn()} />);
    expect(screen.getByTestId('position-row').getAttribute('data-disabled')).toBe('true');
    unmount();

    // Answered, not merely settled. A graph timeout stops the batch loading too, and reading that
    // as "no factual flag" is the same wrong vote with a longer fuse — so it takes an actual entity
    // (or geo-chat's row, which would have answered sooner).
    mocks.claimEntities = [{ id: 'claim-1' }];
    render(<DebateClaimsPanel debate={debate()} onClose={vi.fn()} />);
    expect(screen.getByTestId('position-row').getAttribute('data-disabled')).toBe('false');
  });

  it('renders a claim with no space as plain text, with no link and no controls', () => {
    mocks.claims = grouped({ [PRESTON_SPACE]: [claim('claim-1', 'Homeless claim.', { spaceId: null })] });

    render(<DebateClaimsPanel debate={debate()} onClose={vi.fn()} />);

    expect(screen.getByText('Homeless claim.')).toBeInTheDocument();
    expect(screen.getByText('Homeless claim.').closest('a')).toBeNull();
    expect(screen.queryByTestId('row-actions-claim-1')).not.toBeInTheDocument();
  });

  it('shows only the first three claims, then reveals the rest on Show more', async () => {
    mocks.claims = grouped({
      [PRESTON_SPACE]: [1, 2, 3, 4, 5].map(n => claim(`claim-${n}`, `Claim ${n}.`)),
    });

    render(<DebateClaimsPanel debate={debate()} onClose={vi.fn()} />);

    expect(screen.getByText('Claim 3.')).toBeInTheDocument();
    expect(screen.queryByText('Claim 4.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show 2 more' }));

    expect(screen.getByText('Claim 4.')).toBeInTheDocument();
    expect(screen.getByText('Claim 5.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));

    expect(screen.queryByText('Claim 4.')).not.toBeInTheDocument();
  });

  it('offers no Show more when a debater has three claims or fewer', () => {
    mocks.claims = grouped({ [PRESTON_SPACE]: [claim('claim-1', 'One.'), claim('claim-2', 'Two.')] });

    render(<DebateClaimsPanel debate={debate()} onClose={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /Show/ })).not.toBeInTheDocument();
  });

  // Each debater's list collapses on its own, so expanding one must not expand the other.
  it('expands one debater\u2019s list without expanding the other', () => {
    mocks.claims = grouped({
      [PRESTON_SPACE]: [1, 2, 3, 4].map(n => claim(`p-${n}`, `Preston ${n}.`)),
      [ARTURAS_SPACE]: [1, 2, 3, 4].map(n => claim(`a-${n}`, `Arturas ${n}.`)),
    });

    render(<DebateClaimsPanel debate={debate()} onClose={vi.fn()} />);

    fireEvent.click(within(cardFor('Preston Mantel')).getByRole('button', { name: 'Show 1 more' }));

    expect(screen.getByText('Preston 4.')).toBeInTheDocument();
    expect(screen.queryByText('Arturas 4.')).not.toBeInTheDocument();
  });

  // Painting transcript order and reordering a moment later moves claims under someone already
  // reading, and can carry one across the "Show more" fold. The debate feed withholds rows for the
  // same reason while the same ranking loads.
  it('withholds rows until the ranking settles, rather than reordering them under the reader', () => {
    mocks.rankingReady = false;
    mocks.claims = grouped({ [PRESTON_SPACE]: [claim('claim-1', 'Sleep matters.')] });

    render(<DebateClaimsPanel debate={debate()} onClose={vi.fn()} />);

    expect(screen.queryByText('Sleep matters.')).not.toBeInTheDocument();
    expect(screen.getAllByText('Loading claims…').length).toBeGreaterThan(0);
  });

  it('paints the rows once the ranking settles', () => {
    mocks.rankingReady = true;
    mocks.claims = grouped({ [PRESTON_SPACE]: [claim('claim-1', 'Sleep matters.')] });

    render(<DebateClaimsPanel debate={debate()} onClose={vi.fn()} />);

    expect(screen.getByText('Sleep matters.')).toBeInTheDocument();
  });

  it('shows the total in the header and surfaces unattributed claims', () => {
    mocks.claims = grouped({ [PRESTON_SPACE]: [claim('claim-1', 'Mine.')] }, [claim('claim-2', 'Nobody’s.')]);

    render(<DebateClaimsPanel debate={debate()} onClose={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Claims · 2');
    expect(
      within(screen.getByText('Other claims').closest('article') as HTMLElement).getByText('Nobody’s.')
    ).toBeInTheDocument();
  });

  it('reports a load failure instead of an empty list', () => {
    mocks.error = new Error('network down');

    render(<DebateClaimsPanel debate={debate()} onClose={vi.fn()} />);

    expect(screen.getAllByText('Could not load claims: network down').length).toBeGreaterThan(0);
  });
});
