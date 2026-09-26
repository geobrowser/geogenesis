import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { summarizeClaimResponses } from '~/core/claims/browse/claim-response-summary';
import type { DebateParticipant } from '~/core/debates/api';
import { claimVsArguments, poolResponses } from '~/core/debates/end-card';

import { DebateEndCard } from './debate-end-card';

afterEach(cleanup);

// The voter faces and their list read the network; what matters here is that the card hands them
// the right claim, and where it puts them.
vi.mock('~/partials/entity-page/claim-voter-avatars', () => ({
  ClaimResponderAvatars: ({ size }: { size?: number }) => <span data-testid="claim-faces" data-size={size} />,
}));
vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({
  RespondersPopover: ({ trigger, entityId }: { trigger: React.ReactNode; entityId: string }) => (
    <div data-testid="claim-voters" data-entity={entityId}>
      {trigger}
    </div>
  ),
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

const renderCard = (card: CardData, onOpenClaims?: (id?: string) => void) =>
  render(
    <DebateEndCard card={card} onOpenClaims={onOpenClaims} replay={<button type="button">Replay debate</button>} />
  );

describe('DebateEndCard', () => {
  it('asks where the viewer stands on the claim, above how the room voted on it', () => {
    renderCard(cardFixture());

    expect(screen.getByText('Where do you stand?')).toBeInTheDocument();
    expect(screen.getByText('The risk of human extinction from AI is overstated')).toBeInTheDocument();
    expect(screen.getByText(/^62%/)).toHaveTextContent('62% agree');
  });

  it("opens the claim's voter list from its faces, sized to the player", () => {
    renderCard(cardFixture());

    expect(screen.getByTestId('claim-voters')).toHaveAttribute('data-entity', 'claim-1');
    // 20px where the row has the width, Geo's 12px on a narrow player; the width picks one.
    expect(screen.getAllByTestId('claim-faces').map(faces => faces.getAttribute('data-size'))).toEqual(['20', '12']);
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

  it('asserts nothing about the votes before the counts have landed', () => {
    // "No votes yet" off a query still in flight would be a fact about the network, not the debate.
    renderCard(cardFixture({ claim: summary(0, 0, { hasCounts: false }), countsReady: false }));

    expect(screen.queryByText('No votes yet')).toBeNull();
    expect(screen.queryByText('Claim vs. arguments')).toBeNull();
  });

  it('shows each debater with their side, and their count and share on one line', () => {
    renderCard(cardFixture());

    const steve = document.querySelector('[data-end-card-debater="steve-space"]') as HTMLElement;
    expect(within(steve).getByText('Steve Fuller')).toBeInTheDocument();
    expect(within(steve).getAllByText(/Agree/).length).toBeGreaterThan(0);

    // The count leads the vote row rather than taking a line of its own, and the share drops the
    // verb the claim's row above has already said.
    const row = within(steve).getByText('44%').parentElement as HTMLElement;
    expect(row.textContent).toMatch(/^8 claims ·\s*44%/);
  });

  it("opens the claims panel at a debater's claims from their faces", () => {
    const onOpenClaims = vi.fn();
    renderCard(cardFixture(), onOpenClaims);

    fireEvent.click(screen.getByRole('button', { name: /voted on Jonathan Bostock's claims/ }));
    expect(onOpenClaims).toHaveBeenCalledWith('jonathan-space');
  });

  it('draws no way into the claims when there is nowhere to open them', () => {
    renderCard(cardFixture());

    expect(screen.queryByRole('button', { name: /voted on Steve Fuller's claims/ })).toBeNull();
    // The faces are still shown, just not as a control.
    expect(screen.getAllByTestId('debater-faces')).toHaveLength(2);
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

  it('draws the replay control it is handed', () => {
    renderCard(cardFixture());
    expect(screen.getByRole('button', { name: 'Replay debate' })).toBeInTheDocument();
  });
});
