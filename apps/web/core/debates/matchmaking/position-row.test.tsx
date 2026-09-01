import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import type { DebateClaimPositionSummary } from '../api';
import { PositionRow } from './matchmaking-claim-card';

// GEO-2774. The pills carry `truncate` on the label while the icon and the avatar stack are
// `shrink-0`, so when the row runs out of width the label is what gives — which is how a button
// that says what pressing it does rendered as "Ag..." and "Dis..." on the explore feed. The row
// answers that by stacking instead of clipping, and it decides on its *own* width rather than the
// viewport's, because the same row is dropped into a feed card, a side panel and the claim page at
// widths none of them agrees on.
describe('PositionRow', () => {
  afterEach(cleanup);

  const positions: DebateClaimPositionSummary[] = [];

  // Two faces and a remainder — the widest stack the component will draw.
  const withParticipants: DebateClaimPositionSummary[] = [
    {
      position: true,
      position_label: 'Agree',
      total_count: 9,
      available_now_count: 9,
      present_count: 9,
      participants: [
        { user_id: 'u1', profile_space_id: 's1', display_name: 'One', avatar_cid: null },
        { user_id: 'u2', profile_space_id: 's2', display_name: 'Two', avatar_cid: null },
      ],
    },
  ];

  it('stacks by default and only goes two across once the row itself is wide enough', () => {
    render(<PositionRow positions={positions} responseKind="stance" viewerPosition={null} />);

    const grid = screen.getByText('Agree').closest('.grid') as HTMLElement;

    expect(grid).not.toBeNull();
    // One column is the base, so a row that never gets a container query still renders both labels
    // whole rather than clipping them.
    expect([...grid.classList]).toContain('grid-cols-1');
    expect([...grid.classList]).toContain('claim-pills-wide:grid-cols-2');
    // Deliberately not a media query: `md:grid-cols-2` would read the window, which says nothing
    // about the width of the panel this row was dropped into.
    expect(grid.className).not.toContain('md:grid-cols');
  });

  it('measures against its own width, not an ancestor container', () => {
    render(<PositionRow positions={positions} responseKind="stance" viewerPosition={null} />);

    const grid = screen.getByText('Agree').closest('.grid') as HTMLElement;

    // The query above resolves against the nearest container ancestor, so the row has to establish
    // one of its own. Without this the variant would silently resolve against whatever container
    // happened to be further up — the explore card, say — and report the wrong width.
    expect([...(grid.parentElement as HTMLElement).classList]).toContain('@container');
  });

  it('sheds the avatar stack as the pill narrows rather than letting the label truncate', () => {
    // Copilot caught this on PR #2325: `claim-pills-wide` guarantees a pill wide enough for the
    // label plus one face, but a full stack is a face, a second face and a `+N` badge. The stack is
    // `shrink-0` and the label is not, so the surplus came out of the word — the very bug the
    // breakpoint exists to prevent, on exactly the claims that have people to show.
    //
    // The thresholds are content-box widths, which is what a container query measures, so they read
    // 24px under the pill widths they correspond to (`px-3`).
    render(<PositionRow positions={withParticipants} responseKind="stance" viewerPosition={null} />);

    const pill = screen.getByText('Agree').closest('button, div') as HTMLElement;
    const stack = pill.querySelector('[aria-hidden="true"]') as HTMLElement;
    const [firstFace, secondFace] = [...stack.children] as HTMLElement[];
    const badge = stack.lastElementChild as HTMLElement;

    // The pill has to be a container of its own, or these query whatever is further up and shed at
    // the wrong width.
    expect([...pill.classList]).toContain('@container');

    // Widest goes first, narrowest last: badge, then the second face, then the first.
    expect([...badge.classList]).toContain('@max-[148px]:hidden');
    expect([...secondFace.classList]).toContain('@max-[124px]:hidden');
    expect([...firstFace.classList]).toContain('@max-[108px]:hidden');

    // The label carries no shed rule of its own — it is the thing all of the above protects.
    const label = screen.getByText('Agree');
    expect(label.className).not.toContain(':hidden');
  });

  it('drops the overflow badge before it drops a face, so the faces stay truthful', () => {
    // `+N` is computed against the participants rendered, so hiding a face would leave a badge that
    // no longer adds up. Hiding the badge only stops advertising a remainder.
    render(<PositionRow positions={withParticipants} responseKind="stance" viewerPosition={null} />);

    const stack = (screen.getByText('Agree').closest('button, div') as HTMLElement).querySelector(
      '[aria-hidden="true"]'
    ) as HTMLElement;
    const threshold = (el: Element) => Number(/@max-\[(\d+)px\]:hidden/.exec(el.className)?.[1] ?? NaN);

    const badge = threshold(stack.lastElementChild as HTMLElement);
    const secondFace = threshold(stack.children[1]);
    const firstFace = threshold(stack.children[0]);

    expect(badge).toBeGreaterThan(secondFace);
    expect(secondFace).toBeGreaterThan(firstFace);
  });

  it('keeps the vocabulary for the response kind on both pills', () => {
    render(<PositionRow positions={positions} responseKind="veracity" viewerPosition={null} />);

    expect(screen.getByText('Verify')).toBeInTheDocument();
    expect(screen.getByText('Dispute')).toBeInTheDocument();
  });
});
