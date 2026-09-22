import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import type { Relation } from '~/core/types';

import { ClaimsPageClient } from './claims-page-client';

const mocks = vi.hoisted(() => ({
  nameSet: vi.fn(),
  relationSet: vi.fn(),
  setActiveSpace: vi.fn(),
  bumpReviewVersion: vi.fn(),
  setIsReviewOpen: vi.fn(),
  fetchNextPage: vi.fn(),
  hookCalls: [] as { spaceId: string; kind: string }[],
  rows: [] as { entityId: string; spaceId: string }[],
  listState: { isLoading: false, isError: false, hasNextPage: false, isFetchingNextPage: false },
}));

/**
 * The ranked query is covered in `space-activity-rows.test.ts` and the card where it lives. What
 * this page decides is which list it asks for and how it draws the result, so the hook is faked and
 * its arguments recorded.
 */
vi.mock('~/core/space/use-space-debate-activity', () => ({
  useSpaceActivityRowsInfinite: (spaceId: string, kind: string) => {
    mocks.hookCalls.push({ spaceId, kind });
    return {
      rows: mocks.rows,
      isLoading: mocks.listState.isLoading,
      isError: mocks.listState.isError,
      hasNextPage: mocks.listState.hasNextPage,
      isFetchingNextPage: mocks.listState.isFetchingNextPage,
      fetchNextPage: mocks.fetchNextPage,
    };
  },
}));

vi.mock('~/partials/explore/explore-feed-card', () => ({
  ExploreFeedCard: ({ item, hideSpaceLink, hideJoinButton }: Record<string, any>) => (
    <div
      data-testid="claim-card"
      data-entity-id={item.entityId}
      data-hide-space-link={String(Boolean(hideSpaceLink))}
      data-hide-join={String(Boolean(hideJoinButton))}
    />
  ),
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

const asked = () => mocks.hookCalls.at(-1)!;

beforeEach(() => {
  mocks.hookCalls.length = 0;
  mocks.rows = [
    { entityId: 'c1', spaceId: 'space-1' },
    { entityId: 'c2', spaceId: 'space-1' },
  ];
  mocks.listState = { isLoading: false, isError: false, hasNextPage: false, isFetchingNextPage: false };
  vi.clearAllMocks();
});

afterEach(() => cleanup());

describe('ClaimsPageClient', () => {
  it('renders the space’s ranked claims under its heading', () => {
    render(<ClaimsPageClient spaceId="space-1" />);

    expect(screen.getByRole('heading', { name: 'Claims' })).toBeInTheDocument();
    expect(screen.getAllByTestId('claim-card').map(card => card.dataset.entityId)).toEqual(['c1', 'c2']);
  });

  // The ranked list for this space's claims, and nothing else — the hook scopes the query.
  it('asks for this space’s claims', () => {
    render(<ClaimsPageClient spaceId="space-1" />);

    expect(asked()).toEqual({ spaceId: 'space-1', kind: 'claims' });
  });

  it('follows the space it is given', () => {
    const view = render(<ClaimsPageClient spaceId="space-1" />);
    view.rerender(<ClaimsPageClient spaceId="space-2" />);

    expect(asked()).toEqual({ spaceId: 'space-2', kind: 'claims' });
  });

  // Every row is this space by construction, so a space chip and a Join button would say the same
  // thing on all of them.
  it('hides the per-card space chip and join button', () => {
    render(<ClaimsPageClient spaceId="space-1" />);

    const card = screen.getAllByTestId('claim-card')[0];
    expect(card).toHaveAttribute('data-hide-space-link', 'true');
    expect(card).toHaveAttribute('data-hide-join', 'true');
  });

  it('draws a skeleton rather than an empty list while the first page is out', () => {
    mocks.rows = [];
    mocks.listState = { ...mocks.listState, isLoading: true };
    render(<ClaimsPageClient spaceId="space-1" />);

    expect(screen.queryByText('No claims here yet.')).not.toBeInTheDocument();
    expect(screen.queryByTestId('claim-card')).not.toBeInTheDocument();
  });

  // An empty list and a failed one look identical and mean opposite things.
  it('says so when the list could not be read', () => {
    mocks.rows = [];
    mocks.listState = { ...mocks.listState, isError: true };
    render(<ClaimsPageClient spaceId="space-1" />);

    expect(screen.getByText('Could not load claims.')).toBeInTheDocument();
    expect(screen.queryByText('No claims here yet.')).not.toBeInTheDocument();
  });

  it('reports a genuinely empty space', () => {
    mocks.rows = [];
    render(<ClaimsPageClient spaceId="space-1" />);

    expect(screen.getByText('No claims here yet.')).toBeInTheDocument();
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

  it('keeps the list mounted while the form is open', () => {
    render(<ClaimsPageClient spaceId="space-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Add claim' }));

    expect(screen.getAllByTestId('claim-card')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Add claim' })).not.toBeInTheDocument();
  });
});
