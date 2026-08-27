import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

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
  error: null as Error | null,
  /** Props every rendered response control received, in render order. */
  responseControlProps: [] as Array<Record<string, unknown>>,
  batchTargets: [] as Array<Record<string, unknown>>,
  batchSpaceIds: [] as string[],
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

vi.mock('~/core/responses/use-claim-response-summaries', () => ({
  ClaimResponseBatchBoundary: ({ children }: { children: React.ReactNode }) => children,
  useClaimResponseSummaryBatch: ({
    spaceId,
    targets,
  }: {
    spaceId: string;
    targets: Array<Record<string, unknown>>;
  }) => {
    mocks.batchSpaceIds.push(spaceId);
    mocks.batchTargets = targets;
    return { isSuccess: true, isError: false, refetch: vi.fn() };
  },
}));

vi.mock('../debate-entity-response-controls', () => ({
  DebateEntityResponseControls: (props: Record<string, unknown>) => {
    mocks.responseControlProps.push(props);
    return <div data-testid={`response-controls-${String(props.entityId)}`} data-kind={String(props.responseKind)} />;
  },
}));

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock('~/design-system/avatar', () => ({ Avatar: () => <div data-testid="avatar" /> }));

vi.mock('./winner-vote-button', () => ({ WinnerVoteButton: () => <button type="button">Winner?</button> }));

function claim(id: string, text: string, overrides: Partial<TranscriptClaim> = {}): TranscriptClaim {
  return { id, text, spaceId: CLAIM_SPACE, responseKind: 'stance', ...overrides };
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
  mocks.batchTargets = [];
  mocks.batchSpaceIds.length = 0;
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

  it('links each claim to its entity in the space the claim lives in', () => {
    mocks.claims = grouped({ [PRESTON_SPACE]: [claim('claim-1', 'Sleep matters.')] });

    render(<DebateClaimsPanel debate={debate()} onClose={vi.fn()} />);

    const link = screen.getByText('Sleep matters.').closest('a');
    expect(link).toHaveAttribute('href', expect.stringContaining('claim-1'));
    expect(link).toHaveAttribute('href', expect.stringContaining(CLAIM_SPACE));
  });

  it('renders position controls under every claim, scoped to that claim', () => {
    mocks.claims = grouped({
      [PRESTON_SPACE]: [claim('claim-1', 'One.'), claim('claim-2', 'Two.')],
    });

    render(<DebateClaimsPanel debate={debate()} onClose={vi.fn()} />);

    expect(screen.getByTestId('response-controls-claim-1')).toBeInTheDocument();
    expect(screen.getByTestId('response-controls-claim-2')).toBeInTheDocument();
    expect(mocks.responseControlProps.map(props => props.entityId)).toEqual(['claim-1', 'claim-2']);
    expect(mocks.responseControlProps.every(props => props.spaceId === CLAIM_SPACE)).toBe(true);
  });

  it('passes each claim’s own response kind, so a factual claim reads Verify/Dispute', () => {
    mocks.claims = grouped({
      [PRESTON_SPACE]: [claim('claim-1', 'Opinion.'), claim('claim-2', 'Fact.', { responseKind: 'veracity' })],
    });

    render(<DebateClaimsPanel debate={debate()} onClose={vi.fn()} />);

    expect(screen.getByTestId('response-controls-claim-1')).toHaveAttribute('data-kind', 'stance');
    expect(screen.getByTestId('response-controls-claim-2')).toHaveAttribute('data-kind', 'veracity');
  });

  // Both the link and the response target are space-scoped, so a claim with no space has nothing
  // correct to point at. Showing the text without controls beats guessing a space.
  it('renders a claim with no space as plain text, with no link and no controls', () => {
    mocks.claims = grouped({ [PRESTON_SPACE]: [claim('claim-1', 'Homeless claim.', { spaceId: null })] });

    render(<DebateClaimsPanel debate={debate()} onClose={vi.fn()} />);

    expect(screen.getByText('Homeless claim.')).toBeInTheDocument();
    expect(screen.getByText('Homeless claim.').closest('a')).toBeNull();
    expect(screen.queryByTestId('response-controls-claim-1')).not.toBeInTheDocument();
    expect(mocks.batchTargets).toHaveLength(0);
  });

  it('batches every claim’s responses into one request against the claims’ space', () => {
    mocks.claims = grouped({
      [PRESTON_SPACE]: [claim('claim-1', 'One.')],
      [ARTURAS_SPACE]: [claim('claim-2', 'Two.')],
    });

    render(<DebateClaimsPanel debate={debate()} onClose={vi.fn()} />);

    expect(mocks.batchTargets).toEqual([
      { entityId: 'claim-1', responseKind: 'stance' },
      { entityId: 'claim-2', responseKind: 'stance' },
    ]);
    expect(new Set(mocks.batchSpaceIds)).toEqual(new Set([CLAIM_SPACE]));
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
