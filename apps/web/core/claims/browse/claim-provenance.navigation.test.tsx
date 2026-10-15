import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEBATE_TYPE_ID, SOURCES_PROPERTY_ID } from '~/core/debates/ontology';
import type { ExploreFeedRow } from '~/core/explore/explore-card-item';
import type { Relation } from '~/core/types';

import { EntitySidePanelNavigation } from '~/partials/entity-page/entity-side-panel-navigation';

import { ClaimSourcesTab } from './claim-sources-tab';

const SPACE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CLAIM = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const PRIMARY = 'cccccccccccccccccccccccccccccccc';
const ADDITIONAL = 'dddddddddddddddddddddddddddddddd';
const mocks = vi.hoisted(() => ({
  openSidePanel: vi.fn(),
  rows: [] as ExploreFeedRow[],
  isLoading: false,
  isError: false,
}));
vi.mock('./use-claim-explore-rows', () => ({
  useClaimExploreRows: () => ({
    data: mocks.rows,
    isLoading: mocks.isLoading,
    isError: mocks.isError,
    refetch: vi.fn(),
  }),
}));
vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: () => ({ entities: [] }),
  useQueryEntity: ({ id }: { id: string }) => ({ entity: mocks.rows.find(row => row.entityId === id) ?? null }),
}));
vi.mock('~/core/hooks/use-profiles-by-space-ids', () => ({
  useProfilesBySpaceIds: () => ({ profilesBySpaceId: new Map() }),
}));
vi.mock('~/core/debates/rematch-panel-context', () => ({ useRematchPanelContext: () => ({}) }));
vi.mock('~/core/hooks/use-entity-side-panel', () => ({
  useEntitySidePanel: () => ({ openSidePanel: mocks.openSidePanel }),
}));
vi.mock('~/partials/profile/person-record-feed', () => ({ PersonRecordFeed: () => null }));
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));

function sourceRow(entityId: string, debate: boolean): ExploreFeedRow {
  return {
    entityId,
    spaceId: SPACE,
    types: debate
      ? [
          { id: 'article', name: 'Article' },
          { id: DEBATE_TYPE_ID, name: 'Debate' },
        ]
      : [{ id: 'article', name: 'Article' }],
  } as ExploreFeedRow;
}
function View() {
  const claimRelations = [PRIMARY, ADDITIONAL].map(
    (id, index) =>
      ({
        id: `relation-${index}`,
        type: { id: SOURCES_PROPERTY_ID },
        toEntity: { id, name: index === 0 ? 'Primary source' : 'Additional source' },
      }) as Relation
  );
  return (
    <EntitySidePanelNavigation entityId={CLAIM} spaceId={SPACE}>
      <ClaimSourcesTab claimId={CLAIM} claimRelations={claimRelations} spaceId={SPACE} />
    </EntitySidePanelNavigation>
  );
}
beforeEach(() => {
  mocks.rows = [];
  mocks.isLoading = false;
  mocks.isError = false;
  mocks.openSidePanel.mockReset();
  vi.spyOn(window, 'open').mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function clickSource(id: string) {
  fireEvent.click(screen.getByRole('link', { name: id === PRIMARY ? 'Primary source' : 'Additional source' }));
}
function expectFullPage(id: string) {
  expect(window.open).toHaveBeenCalledExactlyOnceWith(
    new URL(`/space/${SPACE}/${id}`, window.location.href).href,
    '_blank',
    'noopener,noreferrer'
  );
  expect(mocks.openSidePanel).not.toHaveBeenCalled();
}

describe('source title navigation beside a debate room', () => {
  it.each([PRIMARY, ADDITIONAL])('opens debate source %s in its full-page player', id => {
    mocks.rows = [sourceRow(PRIMARY, id === PRIMARY), sourceRow(ADDITIONAL, id === ADDITIONAL)];
    render(<View />);
    clickSource(id);
    expectFullPage(id);
  });
  it.each([PRIMARY, ADDITIONAL])('keeps a non-debate source %s in the panel even beside a debate source', id => {
    mocks.rows = [sourceRow(PRIMARY, id !== PRIMARY), sourceRow(ADDITIONAL, id !== ADDITIONAL)];
    render(<View />);
    clickSource(id);
    expect(mocks.openSidePanel).toHaveBeenCalledExactlyOnceWith(
      id,
      SPACE,
      false,
      expect.objectContaining({ forceRequestedSpace: true })
    );
    expect(window.open).not.toHaveBeenCalled();
  });
  it.each([PRIMARY, ADDITIONAL])('recognizes source %s when the feed returns dashed IDs', id => {
    const dashed = id.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
    mocks.rows = [sourceRow(dashed, false)];
    render(<View />);
    clickSource(id);
    expect(mocks.openSidePanel).toHaveBeenCalledTimes(1);
    expect(window.open).not.toHaveBeenCalled();
  });
  it.each(['loading', 'failed', 'missing'] as const)('preserves a source destination while its type is %s', state => {
    mocks.isLoading = state === 'loading';
    mocks.isError = state === 'failed';
    mocks.rows = [sourceRow(PRIMARY, false)];
    const view = render(<View />);
    clickSource(ADDITIONAL);
    expectFullPage(ADDITIONAL);
    vi.mocked(window.open).mockClear();
    mocks.isLoading = false;
    mocks.isError = false;
    mocks.rows = [sourceRow(PRIMARY, false), sourceRow(ADDITIONAL, false)];
    view.rerender(<View />);
    clickSource(ADDITIONAL);
    expect(mocks.openSidePanel).toHaveBeenCalledTimes(1);
    expect(window.open).not.toHaveBeenCalled();
  });
});
