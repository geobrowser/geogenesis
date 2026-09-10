import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityPageHeader } from './entity-page-header';

const mocks = vi.hoisted(() => ({
  /** Props `EntityPageActions` was rendered with, or null if the header rendered none. */
  actions: null as Record<string, unknown> | null,
}));

// The four children each reach for the sync engine, access control or geo-chat. What this file is
// about is which of them the header draws, so each is stubbed down to a marker.
vi.mock('~/partials/entity-page/editable-entity-header', () => ({
  EditableHeading: () => <div data-testid="title" />,
}));
vi.mock('~/partials/entity-page/entity-page-inline-description', () => ({
  EntityPageInlineDescription: () => <div data-testid="description" />,
}));
vi.mock('~/partials/entity-page/entity-page-relations', () => ({
  EntityPageRelations: () => <div data-testid="relations" />,
}));
vi.mock('~/partials/entity-page/entity-page-metadata-header', () => ({
  EntityPageMetadataHeader: () => <div data-testid="metadata" />,
}));
vi.mock('~/partials/entity-page/entity-page-actions', () => ({
  EntityPageActions: (props: Record<string, unknown>) => {
    mocks.actions = props;
    return <div data-testid="actions" />;
  },
}));

function renderHeader(overrides?: { showHeading?: boolean; showHeader?: boolean }) {
  return render(
    <EntityPageHeader
      showHeading={overrides?.showHeading ?? true}
      showHeader={overrides?.showHeader ?? true}
      entityId="entity-1"
      spaceId="space-1"
      serverRelations={[]}
    />
  );
}

beforeEach(() => {
  mocks.actions = null;
});

afterEach(cleanup);

/**
 * `showHeader` and `showHeading` answer different questions, and the pages that pass them use each
 * on its own — a page can want the title without the types-and-actions row under it.
 *
 * The row itself is what regressed: while the actions lived inside the metadata header, turning off
 * `showHeader` was the only way to hide either, and separating them made it possible to hide the
 * metadata and leave the menu, history and vote buttons drawn on a page that asked for no header.
 */
describe('EntityPageHeader', () => {
  it('draws the metadata strip and the actions when showHeader is on', () => {
    renderHeader({ showHeader: true });

    expect(screen.getByTestId('metadata')).toBeInTheDocument();
    expect(screen.getByTestId('actions')).toBeInTheDocument();
  });

  it('hides the metadata and every action when showHeader is off', () => {
    renderHeader({ showHeader: false });

    expect(screen.queryByTestId('metadata')).toBeNull();
    expect(screen.queryByTestId('actions')).toBeNull();
    // Not merely unrendered as a component — nothing from the row reaches the page, including the
    // vote controls that ride along inside it.
    expect(mocks.actions).toBeNull();
  });

  it('keeps the title independent of the header row', () => {
    renderHeader({ showHeading: true, showHeader: false });

    expect(screen.getByTestId('title')).toBeInTheDocument();
    expect(screen.getByTestId('description')).toBeInTheDocument();
  });

  it('keeps the header row independent of the title', () => {
    renderHeader({ showHeading: false, showHeader: true });

    expect(screen.queryByTestId('title')).toBeNull();
    expect(screen.queryByTestId('description')).toBeNull();
    expect(screen.getByTestId('metadata')).toBeInTheDocument();
    expect(screen.getByTestId('actions')).toBeInTheDocument();
  });

  // The route page is the surface that votes, so this is where `isVoteable` has to arrive — and on
  // the same entity the title and metadata were given.
  it('gives the actions the route entity and lets it vote', () => {
    renderHeader();

    expect(mocks.actions).toMatchObject({ entityId: 'entity-1', spaceId: 'space-1', isVoteable: true });
  });

  // Relations sit above the title and are not part of either switch.
  it('draws the relations strip whichever way the switches are set', () => {
    renderHeader({ showHeading: false, showHeader: false });

    expect(screen.getByTestId('relations')).toBeInTheDocument();
  });
});
