import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { summarizeClaimResponses } from '~/core/claims/browse/claim-response-summary';
import type { DebateParticipant } from '~/core/debates/api';
import { claimVsArguments, poolResponses } from '~/core/debates/end-card';

import { DebateEndCard } from './debate-end-card';

afterEach(cleanup);

// Geo's own faces-to-voters control reads the network; what matters here is that the card uses it,
// for the right claim. The split bar is stood in for alongside it, being the same module's.
vi.mock('~/core/claims/browse/claim-summary', () => ({
  ClaimResponders: ({ entityId }: { entityId: string }) => <span data-testid="claim-voters" data-entity={entityId} />,
  ClaimSplitBar: ({ percent }: { percent: number }) => <span role="presentation" data-split={percent} />,
}));
vi.mock('~/partials/blocks/table/ranking-period-metadata', () => ({
  RankingAggregatedSubmitterAvatars: ({ submitterSpaceIds }: { submitterSpaceIds: string[] }) => (
    <span data-testid="debater-faces">{submitterSpaceIds.length}</span>
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

const debater = (spaceId: string, name: string, position: boolean, votes: [number, number], claimCount = 8) => {
  const split = poolResponses([{ counts: { positive: votes[0], negative: votes[1] }, responders: [] }]);
  return {
    participant: participant(spaceId, name, position),
    name,
    claimCount,
    split,
    responderSpaceIds: votes[0] + votes[1] > 0 ? ['a', 'b', 'c', 'd'] : [],
  };
};

function cardFixture({
  claim = summary(62, 38),
  steve = [44, 56] as [number, number],
  jonathan = [71, 29] as [number, number],
  countsReady = true,
}: {
  claim?: ReturnType<typeof summary>;
  steve?: [number, number];
  jonathan?: [number, number];
  countsReady?: boolean;
} = {}): CardData {
  const agreeSide = debater('steve-space', 'Steve Fuller', true, steve);
  const disagreeSide = debater('jonathan-space', 'Jonathan Bostock', false, jonathan, 9);
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
    debaters: [agreeSide, disagreeSide],
    agreeSide,
    disagreeSide,
    comparison: claimVsArguments({ claim, agreeSide: agreeSide.split, disagreeSide: disagreeSide.split }),
    countsReady,
    totalClaims: 17,
  } as unknown as CardData;
}

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

  it('draws the comparison in full at every width, not a narrow-player summary', () => {
    const { container } = renderCard(cardFixture());
    const box = container.querySelector('[data-end-card-comparison="ready"]') as HTMLElement;

    expect(within(box).getByText('Claim vs. arguments')).toBeInTheDocument();
    expect(box.querySelector('[role="img"]')?.className).not.toContain('@max-md:hidden');
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

  it('prints no claim count for a debater before the transcript has said which claims are theirs', () => {
    const card = cardFixture();
    card.debaters.forEach(debater => {
      (debater as { claimCount: number | null }).claimCount = null;
    });
    renderCard(card);

    expect(screen.queryByText(/\d+ claims/)).toBeNull();
  });

  it('asserts nothing about the votes before the counts have landed', () => {
    // "No votes yet" off a query still in flight would be a fact about the network, not the debate.
    renderCard(cardFixture({ claim: summary(0, 0, { hasCounts: false }), countsReady: false }));

    expect(screen.queryByText('No votes yet')).toBeNull();
    expect(screen.queryByText('Claim vs. arguments')).toBeNull();
  });

  it('shows each debater with their side, then their count, share and voters on one line', () => {
    renderCard(cardFixture());

    const steve = document.querySelector('[data-end-card-debater="steve-space"]') as HTMLElement;
    expect(within(steve).getByText('Steve Fuller')).toBeInTheDocument();
    expect(within(steve).getAllByText(/Agree/).length).toBeGreaterThan(0);

    const row = within(steve).getByText('44% agree').parentElement as HTMLElement;
    expect(row.textContent).toMatch(/^8 claims·44% agree4$/);
    expect(within(row).getByTestId('debater-faces')).toBeInTheDocument();
  });

  it("draws no split bar for a debater — only the claim's own row has one", () => {
    // A bar per debater repeated the claim's bar directly above at a size too small to read.
    const { container } = renderCard(cardFixture());

    expect(container.querySelectorAll('[data-split]')).toHaveLength(1);
    for (const column of container.querySelectorAll('[data-end-card-debater]')) {
      expect(column.querySelector('[data-split]')).toBeNull();
    }
  });

  it("opens the claims panel at a debater's claims from their count, share and voters", () => {
    const onOpenClaims = vi.fn();
    renderCard(cardFixture(), onOpenClaims);

    const open = screen.getByRole('button', { name: "9 claims, 71% agree — open Jonathan Bostock's claims" });
    // The count and the faces are both inside the one control, so either opens it.
    expect(within(open).getByText('9 claims')).toBeInTheDocument();
    expect(within(open).getByTestId('debater-faces')).toBeInTheDocument();

    fireEvent.click(within(open).getByText('9 claims'));
    expect(onOpenClaims).toHaveBeenCalledWith('jonathan-space');
  });

  it('draws no way into the claims when there is nowhere to open them', () => {
    renderCard(cardFixture());

    expect(screen.queryByRole('button', { name: /open Steve Fuller's claims/ })).toBeNull();
    // The count and faces are still shown, just not as a control.
    expect(screen.getAllByTestId('debater-faces')).toHaveLength(2);
    expect(screen.getByText('8 claims')).toBeInTheDocument();
  });

  it('puts the claim and the arguments on one line, and reads the gap', () => {
    const { container } = renderCard(cardFixture());

    expect(screen.getByText('24 pts apart')).toBeInTheDocument();
    expect(
      screen.getByText("Most agree with the claim, but found Jonathan Bostock's arguments against it more convincing.")
    ).toBeInTheDocument();
    // Agree runs from the left, under the Agree button: 62% agree sits 38% of the way along.
    expect((container.querySelector('[data-marker="claim"]') as HTMLElement).style.left).toBe('38%');
    expect((container.querySelector('[data-marker="arguments"]') as HTMLElement).style.left).toBe('62%');
  });

  it('names the ends of the line Agree and Disagree, left to right, and leaves the names above', () => {
    // Agree on the left, as the Agree button and the green end of every split bar are. Which debater
    // argued which side is already on the card directly above, so the line does not repeat it.
    const { container } = renderCard(cardFixture());
    const line = container.querySelector('[data-end-card-comparison] [role="img"]') as HTMLElement;
    const ends = [...line.children].filter(child => child.tagName === 'SPAN').map(child => child.textContent);

    expect(ends).toEqual(['Agree', 'Disagree']);
    expect(line.textContent).not.toContain('Steve Fuller');
    expect(line.textContent).not.toContain('Jonathan Bostock');
  });

  it('waits rather than characterising a split off a handful of votes', () => {
    const { container } = renderCard(cardFixture({ steve: [1, 1] }));

    expect(container.querySelector('[data-end-card-comparison]')).toHaveAttribute(
      'data-end-card-comparison',
      'waiting'
    );
    expect(container.querySelector('[data-marker]')).toBeNull();
    expect(screen.queryByText(/pts apart/)).toBeNull();
  });

  it('offers replay as the pause circle on a wide player and a header pill on a narrow one', () => {
    const onReplay = vi.fn();
    renderCard(cardFixture(), undefined, onReplay);

    // Both are drawn and the player's width shows one: the circle where pause sat, or a pill on the
    // question's line, which saves a phone the band the circle needs above the card.
    const [circle, pill] = screen.getAllByRole('button', { name: 'Replay debate' });
    expect([...circle.classList]).toContain('@max-md:hidden');
    expect([...pill.classList]).toContain('@max-md:flex');
    expect(pill).toHaveTextContent('Replay');
    // Marked, so a player's playback capture can tell the card's one ask-to-play from its other controls.
    expect(circle).toHaveAttribute('data-end-card-replay');
    expect(pill).toHaveAttribute('data-end-card-replay');

    fireEvent.click(circle);
    fireEvent.click(pill);
    expect(onReplay).toHaveBeenCalledTimes(2);
  });
});
