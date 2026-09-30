import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { summarizeClaimResponses } from '~/core/claims/browse/claim-response-summary';
import type { DebateParticipant } from '~/core/debates/api';

import { DebateEndCard } from './debate-end-card';
import type { NextDebate } from './use-next-debate';

afterEach(cleanup);

// Geo's own faces-to-voters control reads the network; what matters here is that the card uses it,
// for the right claim. The split bar is stood in for alongside it, being the same module's.
vi.mock('~/core/claims/browse/claim-summary', () => ({
  ClaimResponders: ({ entityId }: { entityId: string }) => <span data-testid="claim-voters" data-entity={entityId} />,
  ClaimSplitBar: ({ percent }: { percent: number }) => <span role="presentation" data-split={percent} />,
}));
// The live claim card reads the network for its votes; what matters here is which claims the
// carousel hands it, in what order, and with whom as the speaker.
vi.mock('./debate-claim-ticker', () => ({
  DebateClaimTickerCard: ({
    window,
    speaker,
  }: {
    window: { claim: { id: string; text: string } };
    speaker: { display_name: string } | null;
  }) => (
    <div data-testid="claim-card" data-claim={window.claim.id}>
      {speaker?.display_name}: {window.claim.text}
    </div>
  ),
}));
vi.mock('~/core/debates/matchmaking/matchmaking-claim-card', () => ({
  PositionRow: ({ showParticipants }: { showParticipants?: boolean }) => (
    <div data-testid="position-row" data-show-participants={String(showParticipants)} />
  ),
}));

type CardData = React.ComponentProps<typeof DebateEndCard>['card'];

const summary = (positive: number, negative: number, extra: { hasCounts?: boolean } = {}) => ({
  ...summarizeClaimResponses(positive, negative),
  isLoading: false,
  hasCounts: extra.hasCounts ?? true,
  isViewerResponseLoading: false,
  viewerDirection: null,
  indexedViewerDirection: null,
  viewerSpaceId: null,
});

const participant = (spaceId: string, name: string, position: boolean): DebateParticipant =>
  ({
    profile_space_id: spaceId,
    display_name: name,
    position,
    avatar_cid: null,
    participant_slot: position ? 1 : 2,
  }) as unknown as DebateParticipant;

const carouselClaim = (id: string, spaceId: string | null = 'space-1') => ({
  id,
  text: `Claim ${id}`,
  spaceId,
  blockId: 'block',
  timing: null,
});

function cardFixture({
  claim = summary(62, 38),
  claimIds = ['c1', 'c2', 'c3'],
  nextDebate = null,
}: {
  claim?: ReturnType<typeof summary>;
  claimIds?: string[];
  nextDebate?: NextDebate | null;
} = {}): CardData {
  const steve = participant('steve-space', 'Steve Fuller', true);
  const jonathan = participant('jonathan-space', 'Jonathan Bostock', false);
  return {
    claimId: 'claim-1',
    spaceId: 'space-1',
    claimText: 'The risk of human extinction from AI is overstated',
    claimResponse: {
      responseKind: 'stance',
      summary: claim,
      control: {
        optimisticPositions: [],
        viewerPosition: null,
        respond: vi.fn(),
        canRespond: true,
        isResponsePending: false,
        actionTitle: () => '',
        responseError: null,
      },
    },
    carousel: {
      claims: claimIds.map(id => carouselClaim(id)),
      // Alternating, as a debate does.
      speakerByClaimId: new Map(claimIds.map((id, index) => [id, index % 2 === 0 ? steve : jonathan])),
      entitiesByClaimId: new Map(),
    },
    nextDebate,
  } as unknown as CardData;
}

const nextDebate = (overrides: Partial<NextDebate> = {}): NextDebate => ({
  debateId: 'next-debate',
  spaceId: 'space-1',
  claimName: 'We should slow down AI development',
  keyFrame: 'ipfs://keyframe',
  related: true,
  participants: [participant('ada-space', 'Ada', true), participant('bo-space', 'Bo', false)],
  ...overrides,
});

const renderCard = (card: CardData, onOpenClaims?: (id?: string) => void, onReplay = vi.fn()) =>
  render(<DebateEndCard card={card} onOpenClaims={onOpenClaims} onReplay={onReplay} />);

describe('DebateEndCard', () => {
  it('asks where the viewer stands on the claim, above how the room voted on it', () => {
    renderCard(cardFixture());

    expect(screen.getByText('Where do you stand?')).toBeInTheDocument();
    expect(screen.getByText('The risk of human extinction from AI is overstated')).toBeInTheDocument();
    expect(screen.getByText(/^62%/)).toHaveTextContent('62% agree');
  });

  it("opens the claim's voters through Geo's own control, once", () => {
    // `ClaimResponders`, as the claim page and every claim card draw it — one stack, one popover —
    // rather than a second implementation of the same faces and list.
    renderCard(cardFixture());

    const voters = screen.getAllByTestId('claim-voters');
    expect(voters).toHaveLength(1);
    expect(voters[0]).toHaveAttribute('data-entity', 'claim-1');
  });

  it('keeps the ready-to-debate faces out of the pills, since the row above shows who voted', () => {
    renderCard(cardFixture());
    expect(screen.getByTestId('position-row')).toHaveAttribute('data-show-participants', 'false');
  });

  it('says there are no votes rather than drawing a 0%, and draws no faces', () => {
    renderCard(cardFixture({ claim: summary(0, 0) }));

    const card = screen.getByRole('region', { name: 'Debate results' });
    expect(within(card).getAllByText('No votes yet').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('claim-voters')).toBeNull();
  });

  it('asserts nothing about the votes before the counts have landed', () => {
    // "No votes yet" off a query still in flight would be a fact about the network, not the debate.
    renderCard(cardFixture({ claim: summary(0, 0, { hasCounts: false }) }));

    expect(screen.queryByText('No votes yet')).toBeNull();
  });

  it('lays the extracted claims out as a carousel of votable cards, in the order given', () => {
    renderCard(cardFixture());
    const strip = screen.getByRole('region', { name: 'Claims from this debate' });

    expect(
      within(strip)
        .getAllByTestId('claim-card')
        .map(card => card.dataset.claim)
    ).toEqual(['c1', 'c2', 'c3']);
    expect(within(strip).getByText('Steve Fuller: Claim c1')).toBeInTheDocument();
    expect(within(strip).getByText('Jonathan Bostock: Claim c2')).toBeInTheDocument();
    expect(within(strip).getByText(/Vote on claims made/)).toHaveTextContent('Vote on claims made · 3');
  });

  it('no longer draws a column per debater', () => {
    renderCard(cardFixture());

    expect(document.querySelector('[data-end-card-debater]')).toBeNull();
    expect(screen.queryByText(/\d+ claims ·/)).toBeNull();
  });

  it('snaps a card at a time, and bleeds to the edges of the card', () => {
    const { container } = renderCard(cardFixture());
    const strip = container.querySelector('[data-end-card-claims]') as HTMLElement;

    expect([...strip.classList]).toEqual(
      expect.arrayContaining(['snap-x', 'snap-mandatory', 'overflow-x-auto', '-mx-5'])
    );
    expect([...(strip.firstElementChild as HTMLElement).classList]).toContain('snap-start');
  });

  it('steps the strip a card at a time from the arrows, which a narrow player hides', () => {
    const { container } = renderCard(cardFixture());
    const strip = container.querySelector('[data-end-card-claims]') as HTMLElement;
    strip.scrollBy = vi.fn();
    Object.defineProperty(strip.firstElementChild, 'offsetWidth', { value: 264 });
    // jsdom lays nothing out; give the strip more cards than it can show, then let it re-read.
    Object.defineProperty(strip, 'clientWidth', { value: 400 });
    Object.defineProperty(strip, 'scrollWidth', { value: 800 });
    fireEvent.scroll(strip);

    const more = screen.getByRole('button', { name: 'More claims' });
    fireEvent.click(more);

    expect(strip.scrollBy).toHaveBeenCalledWith({ left: 264, behavior: 'smooth' });
    expect([...more.classList]).toContain('@max-md:hidden');
    // At the start, there is nothing to go back to.
    expect(screen.getByRole('button', { name: 'Previous claims' })).toBeDisabled();
  });

  it('opens the claims panel from See all', () => {
    const onOpenClaims = vi.fn();
    renderCard(cardFixture(), onOpenClaims);

    fireEvent.click(screen.getByRole('button', { name: 'See all' }));
    expect(onOpenClaims).toHaveBeenCalledWith();
  });

  it('offers no See all when there is nowhere to open the claims', () => {
    renderCard(cardFixture());
    expect(screen.queryByRole('button', { name: 'See all' })).toBeNull();
  });

  it('leaves the section out entirely when the debate extracted no claims yet', () => {
    renderCard(cardFixture({ claimIds: [] }));
    expect(screen.queryByRole('region', { name: 'Claims from this debate' })).toBeNull();
  });

  it('links a related debate to its page, with its claim and who argued it', () => {
    const { container } = renderCard(cardFixture({ nextDebate: nextDebate() }));
    const link = screen.getByRole('link', { name: /Watch a related debate/ });

    expect(link).toHaveAttribute('href', expect.stringContaining('next-debate'));
    expect(link).toHaveAttribute('data-end-card-next-debate', 'related');
    expect(within(link).getByText('We should slow down AI development')).toBeInTheDocument();
    expect(within(link).getByText('Ada vs. Bo')).toBeInTheDocument();
    expect(container.querySelector('[data-end-card-comparison]')).toBeNull();
  });

  it('does not call a debate related when it is only the next one in the space', () => {
    renderCard(cardFixture({ nextDebate: nextDebate({ related: false }) }));

    expect(screen.getByRole('link', { name: /Watch another debate/ })).toHaveAttribute(
      'data-end-card-next-debate',
      'space'
    );
    expect(screen.queryByText('Watch a related debate')).toBeNull();
  });

  it('still offers the debate when geo-chat could not say who argued it', () => {
    renderCard(cardFixture({ nextDebate: nextDebate({ participants: [], keyFrame: null }) }));

    const link = screen.getByRole('link', { name: /Watch a related debate/ });
    expect(within(link).getByText('We should slow down AI development')).toBeInTheDocument();
    expect(within(link).queryByText(/ vs\. /)).toBeNull();
  });

  it('ends after the claims when there is nothing left to suggest', () => {
    renderCard(cardFixture({ nextDebate: null }));

    expect(screen.queryByText(/Watch (a related|another) debate/)).toBeNull();
  });

  it('puts the claims above the next debate, which closes the card', () => {
    const { container } = renderCard(cardFixture({ nextDebate: nextDebate() }));
    const strip = container.querySelector('[data-end-card-claims]') as HTMLElement;
    const next = container.querySelector('[data-end-card-next-debate]') as HTMLElement;

    expect(strip.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('offers replay once, as a pill in the card header at every width', () => {
    const onReplay = vi.fn();
    renderCard(cardFixture(), undefined, onReplay);

    // One control, not a circle in the corner on a wide player and a pill on a narrow one.
    const replay = screen.getByRole('button', { name: 'Replay debate' });
    expect([...replay.classList]).toContain('flex');
    expect([...replay.classList]).not.toContain('hidden');
    expect(replay).toHaveTextContent('Replay');
    expect(replay.closest('section')).toHaveAttribute('aria-label', 'Debate results');
    // Marked, so a player's playback capture can tell the card's one ask-to-play from its other controls.
    expect(replay).toHaveAttribute('data-end-card-replay');

    fireEvent.click(replay);
    expect(onReplay).toHaveBeenCalledTimes(1);
  });
});
