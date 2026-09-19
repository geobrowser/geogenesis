import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

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

const rect = (width: number, height: number): DOMRect => ({
  x: 0,
  y: 0,
  top: 0,
  right: width,
  bottom: height,
  left: 0,
  width,
  height,
  toJSON: () => ({}),
});

/** A 390×600 mobile viewport sitting 400px down a synthetic profile page. */
function mockMobileActivityGeometry(pageHeightWithoutActivity: number) {
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if ('activitySection' in this.dataset) {
      const debatesSelected =
        this.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.textContent?.includes('Debates');
      return rect(390, debatesSelected ? 500 : 250);
    }

    if ('activityScrollReserve' in this.dataset) {
      return rect(390, Number.parseFloat(this.style.height) || 0);
    }

    return originalRect.call(this);
  });

  vi.spyOn(window, 'scrollY', 'get').mockReturnValue(400);
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600);
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockImplementation(() => {
    const section = document.querySelector<HTMLElement>('[data-activity-section]');
    const reserve = document.querySelector<HTMLElement>('[data-activity-scroll-reserve]');
    return (
      pageHeightWithoutActivity +
      (section?.getBoundingClientRect().height ?? 0) +
      (reserve?.getBoundingClientRect().height ?? 0)
    );
  });
}

/**
 * What the Activity card says when half of it did not arrive (GEO-2859).
 *
 * The two kinds are separate requests. Filtering on `rows.length > 0` alone made
 * a failed one indistinguishable from an empty one — so a failed Claims query
 * left the card showing Debates and no toggle at all, implying this person holds
 * no positions, while the rail beside it counted 208.
 */
describe('ProfileActivitySection', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

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

  it('reserves the lost mobile document height while switching between kinds', () => {
    mockMobileActivityGeometry(600);

    const { container } = render(
      <ProfileActivitySection kinds={[kind(), kind({ key: 'claims', label: 'Claims', rows: [row('c1')] })]} />
    );
    const reserve = container.querySelector<HTMLElement>('[data-activity-scroll-reserve]');

    expect(reserve).toHaveStyle({ height: '0px' });

    fireEvent.click(screen.getByRole('button', { name: /Claims/ }));
    expect(reserve).toHaveStyle({ height: '150px' });

    fireEvent.click(screen.getByRole('button', { name: /Debates/ }));
    expect(reserve).toHaveStyle({ height: '0px' });

    fireEvent.click(screen.getByRole('button', { name: /Claims/ }));
    expect(reserve).toHaveStyle({ height: '150px' });
  });

  it('adds no reserve when content below Activity already preserves the scroll range', () => {
    mockMobileActivityGeometry(900);

    const { container } = render(
      <ProfileActivitySection kinds={[kind(), kind({ key: 'claims', label: 'Claims', rows: [row('c1')] })]} />
    );
    const reserve = container.querySelector<HTMLElement>('[data-activity-scroll-reserve]');

    fireEvent.click(screen.getByRole('button', { name: /Claims/ }));

    expect(reserve).toHaveStyle({ height: '0px' });
  });
});
