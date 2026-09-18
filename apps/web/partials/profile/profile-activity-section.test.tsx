import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ExploreFeedRow } from '~/core/explore/explore-card-item';

import { ProfileActivitySection } from './profile-activity-section';

// The gallery is local to the file under test, so its dependencies are mocked
// rather than the gallery itself.
vi.mock('~/partials/explore/explore-feed-card', () => ({
  ExploreFeedCard: ({ item }: { item: { entityId: string } }) => <div data-testid="card">{item.entityId}</div>,
}));

vi.mock('./gallery-claim-card', () => ({
  GalleryClaimCard: ({ row }: { row: ExploreFeedRow }) => <div data-testid="card">{row.entityId}</div>,
}));

vi.mock('~/core/hooks/use-space-labels', () => ({
  useSpaceLabels: () => ({ labelsById: new Map(), isLoading: false }),
  spaceLabel: () => undefined,
}));

vi.mock('~/core/debates/debate-playback-gate', () => ({
  DebatePlaybackGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: React.ComponentPropsWithoutRef<'a'>) => <a href={href}>{children}</a>,
}));

// `types` is read to tell a claim from a debate, so a row without it is not a
// row this component can draw.
const row = (entityId: string) => ({ entityId, spaceId: 'space', types: [] }) as unknown as ExploreFeedRow;

const kind = (over: Partial<React.ComponentProps<typeof ProfileActivitySection>['kinds'][number]> = {}) => ({
  key: 'debates',
  label: 'Debates',
  rows: [row('d1')],
  total: 10,
  isLoading: false,
  href: '/space/s/debates',
  seeAllLabel: 'See all debates',
  ...over,
});

/**
 * What the Activity card says when half of it did not arrive (GEO-2859).
 *
 * The two kinds are separate requests. Filtering on `rows.length > 0` alone made
 * a failed one indistinguishable from an empty one — so a failed Claims query
 * left the card showing Debates and no toggle at all, implying this person holds
 * no positions, while the rail beside it counted 208.
 */
describe('ProfileActivitySection', () => {
  afterEach(cleanup);

  it('renders nothing when both kinds are genuinely empty', () => {
    // Most accounts have never been in a debate; a heading over blank space
    // reads as a page that failed.
    const { container } = render(
      <ProfileActivitySection kinds={[kind({ rows: [] }), kind({ key: 'claims', label: 'Claims', rows: [] })]} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('leaves out a kind that is empty but fine', () => {
    render(<ProfileActivitySection kinds={[kind(), kind({ key: 'claims', label: 'Claims', rows: [] })]} />);

    expect(screen.queryByRole('button', { name: /Claims/ })).not.toBeInTheDocument();
  });

  it('keeps a kind that failed, so half the record cannot vanish quietly', () => {
    render(
      <ProfileActivitySection kinds={[kind(), kind({ key: 'claims', label: 'Claims', rows: [], isError: true })]} />
    );

    expect(screen.getByRole('button', { name: /Claims/ })).toBeInTheDocument();
  });

  it('says so when the selected kind failed', () => {
    render(<ProfileActivitySection kinds={[kind({ rows: [], isError: true })]} />);

    expect(screen.getByText('Couldn’t load debates.')).toBeInTheDocument();
    expect(screen.queryByTestId('card')).not.toBeInTheDocument();
  });

  it('still shows the rows of a kind that failed only on a later page', () => {
    render(<ProfileActivitySection kinds={[kind({ isError: true })]} />);

    expect(screen.getAllByTestId('card')).toHaveLength(1);
  });

  it('draws a dash rather than a zero when the count could not be read', () => {
    render(
      <ProfileActivitySection kinds={[kind({ isCountUnavailable: true }), kind({ key: 'claims', label: 'Claims' })]} />
    );

    expect(screen.getByRole('button', { name: /Debates/ })).toHaveTextContent('—');
  });
});
