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

  it('keeps the vocabulary for the response kind on both pills', () => {
    render(<PositionRow positions={positions} responseKind="veracity" viewerPosition={null} />);

    expect(screen.getByText('Verify')).toBeInTheDocument();
    expect(screen.getByText('Dispute')).toBeInTheDocument();
  });
});
