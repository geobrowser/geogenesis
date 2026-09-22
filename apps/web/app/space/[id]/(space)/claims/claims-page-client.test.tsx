import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import type { Relation } from '~/core/types';

import { ClaimsPageClient } from './claims-page-client';

const mocks = vi.hoisted(() => ({
  nameSet: vi.fn(),
  relationSet: vi.fn(),
  setActiveSpace: vi.fn(),
  bumpReviewVersion: vi.fn(),
  setIsReviewOpen: vi.fn(),
  feedProps: [] as Record<string, unknown>[],
}));

/**
 * The list is the shared Explore feed now, and its own behaviour — paging, sorting, the claim card
 * — is covered where it lives. What this page still decides is what it hands that feed, which is
 * the whole of why the route is Best-ordered and space-scoped rather than a fixed fifty.
 */
vi.mock('~/partials/feed/entity-feed', () => ({
  EntityFeed: (props: Record<string, unknown>) => {
    mocks.feedProps.push(props);
    return <div data-testid="entity-feed" />;
  },
}));

vi.mock('~/core/state/diff-store', () => ({
  useDiff: () => ({
    setActiveSpace: mocks.setActiveSpace,
    bumpReviewVersion: mocks.bumpReviewVersion,
    setIsReviewOpen: mocks.setIsReviewOpen,
  }),
}));

vi.mock('~/core/sync/use-mutate', () => ({
  useMutate: () => ({
    storage: {
      entities: { name: { set: mocks.nameSet } },
      relations: { set: mocks.relationSet },
    },
  }),
}));

vi.mock('~/design-system/select-entity-compact', () => ({
  SelectEntityCompact: ({ placeholder }: { placeholder: string }) => (
    <div data-testid={`selector-${placeholder}`}>{placeholder}</div>
  ),
}));

const feed = () => mocks.feedProps.at(-1)!;

beforeEach(() => {
  mocks.feedProps.length = 0;
  vi.clearAllMocks();
});

afterEach(() => cleanup());

describe('ClaimsPageClient', () => {
  it('renders the space claims feed under its heading', () => {
    render(<ClaimsPageClient spaceId="space-1" />);

    expect(screen.getByRole('heading', { name: 'Claims' })).toBeInTheDocument();
    expect(screen.getByTestId('entity-feed')).toBeInTheDocument();
  });

  /**
   * The four properties that make this the right end of Overview's "See all claims": it reads the
   * space-pinned endpoint (not `/api/explore/feed`, which widens a filter naming spaces the reader
   * cannot see into the unfiltered feed), it is pinned to this space and to Claim, and it opens on
   * Best — the order the card above it ranks its six by.
   */
  it('pins the feed to this space and to Claim, ordered by Best', () => {
    render(<ClaimsPageClient spaceId="space-1" />);

    expect(feed()).toMatchObject({
      apiEndpoint: '/api/space/space-1/debate-activity/feed',
      lockedSpaceId: 'space-1',
      lockedTypeIds: [CLAIM_TYPE_ID],
      initialSort: 'best',
      showSortFilter: true,
    });
  });

  // A window narrow enough to be interesting across the whole graph can empty a single space.
  it('opens on all time rather than Explore’s month', () => {
    render(<ClaimsPageClient spaceId="space-1" />);

    expect(feed()).toMatchObject({ initialTime: 'all' });
  });

  it('follows the space it is given', () => {
    const view = render(<ClaimsPageClient spaceId="space-1" />);
    view.rerender(<ClaimsPageClient spaceId="space-2" />);

    expect(feed()).toMatchObject({
      apiEndpoint: '/api/space/space-2/debate-activity/feed',
      lockedSpaceId: 'space-2',
    });
  });

  // The staging form is unrelated to how the list is ordered, and it is the only place in the app
  // that opens a claim proposal from a space. Turning the list into a feed must not take it away.
  it('stages a claim with Claim and Topics relations only', () => {
    render(<ClaimsPageClient spaceId="space-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Add claim' }));
    fireEvent.change(screen.getByLabelText('Claim'), {
      target: { value: 'Public transit should be free' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Open proposal' }).closest('form')!);

    expect(mocks.nameSet).toHaveBeenCalledWith(expect.any(String), 'space-1', 'Public transit should be free');
    const relationTypes = mocks.relationSet.mock.calls.map(call => (call[0] as Relation).type.id);
    expect(relationTypes).toContain(SystemIds.TYPES_PROPERTY);
    expect(relationTypes).not.toContain('73609ae8644c4463a50a90a3ee585746');
    expect(relationTypes).not.toContain(TOPICS_PROPERTY_ID);
    expect(mocks.setIsReviewOpen).toHaveBeenCalledWith(true);
  });

  it('keeps the feed mounted while the form is open', () => {
    render(<ClaimsPageClient spaceId="space-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Add claim' }));

    expect(screen.getByTestId('entity-feed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add claim' })).not.toBeInTheDocument();
  });
});
