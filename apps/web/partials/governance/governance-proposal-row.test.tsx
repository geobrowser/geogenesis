import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Profile } from '~/core/types';

import { GovernanceProposalRow, percentageFromCounts } from './governance-proposal-row';

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href, ...rest }: React.ComponentPropsWithoutRef<'a'>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('./governance-proposal-vote-state', () => ({ GovernanceProposalVoteState: () => null }));
vi.mock('./governance-status-chip', () => ({ GovernanceStatusChip: () => null }));
vi.mock('./governance-outcome-timestamp', () => ({
  GovernanceOutcomeDate: () => null,
  GovernanceOutcomeTime: () => null,
}));

const profile: Profile = {
  id: 'person',
  spaceId: 'f3dab79cb5a3d9d1759656dd5361d1c6',
  name: 'Preston Mantel',
  avatarUrl: null,
  coverUrl: null,
  address: '0x0000000000000000000000000000000000000001',
  profileLink: '/space/f3dab79cb5a3d9d1759656dd5361d1c6',
};

function renderRow(overlay?: React.ReactNode) {
  return render(
    <GovernanceProposalRow
      overlay={overlay}
      title="Import universities into Academia"
      profile={profile}
      timestampSeconds={1789254358}
      yesPercentage={75}
      noPercentage={25}
      status="ACCEPTED"
      endTime={1789340763}
      canExecute={false}
    />
  );
}

/**
 * Where the whole-row link sits, which is not a detail (GEO-2859).
 *
 * The row's root is `position: relative`. An anchor placed *before* the row as a
 * sibling is painted under it — the row's box takes the pointer events and the
 * row stops being clickable except for the few controls carrying `z-10`. That is
 * exactly what extracting this component did to both of its callers, and jsdom
 * cannot see it because it does not paint.
 *
 * So the invariant is structural: the overlay is a child of the positioned root,
 * where the content's `z-10` can sit above it. Pin that, since the visual
 * symptom is invisible to the suite.
 */
describe('GovernanceProposalRow', () => {
  afterEach(cleanup);

  it('renders the overlay inside the positioned root, not beside it', () => {
    renderRow(<a href="/proposal" aria-label="Open proposal" className="absolute inset-0" />);

    const overlay = screen.getByLabelText('Open proposal');
    const positionedRoot = overlay.closest('.relative');

    expect(positionedRoot).not.toBeNull();
    // The root, not some inner wrapper: the anchor is `inset-0` against it.
    expect(positionedRoot).toHaveClass('relative', 'flex', 'w-full');
  });

  it('keeps the byline link above the overlay', () => {
    // `z-10` is what stops the overlay swallowing the one control inside it that
    // has to stay separately clickable.
    renderRow(<a href="/proposal" aria-label="Open proposal" className="absolute inset-0" />);

    const byline = screen.getByRole('link', { name: /Preston Mantel/ });

    expect(byline).toHaveClass('z-10');
  });

  it('renders without an overlay, for a surface that is not a link', () => {
    renderRow();

    expect(screen.getByRole('heading', { name: /Import universities/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('Open proposal')).not.toBeInTheDocument();
  });
});

describe('percentageFromCounts', () => {
  it('floors the share', () => {
    expect(percentageFromCounts(2, 3)).toBe(66);
  });

  it('reads as zero rather than dividing by nothing', () => {
    expect(percentageFromCounts(0, 0)).toBe(0);
  });
});
