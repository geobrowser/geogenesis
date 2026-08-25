import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CollectionRowActions } from './collection-row-actions';

/**
 * GEO-2643. Removing a row from a collection used to live inside the "..." popover: hover the row,
 * find the control, open it, then click through. This covers the promoted button — that it is
 * there without opening anything, that it drops the row's own relation, and that it stays out of
 * the way when there is nothing to remove.
 */
const ENTITY = '019fedae72b67ab2927adf044d57c566';
const OTHER_ENTITY = '019fedae72b67ab2927adf044d57c567';
const RELATION = '019fedae72b67ab2927adf044d57c600';
const SPACE = '019fedae72b67ab2927adf044d57c500';

type FakeRelation = { id: string; entityId: string; toEntity: { id: string } };

const mocks = vi.hoisted(() => ({
  relations: [] as FakeRelation[],
  deleteRelation: vi.fn(),
}));

vi.mock('~/core/blocks/data/use-data-block', () => ({
  useDataBlock: () => ({ blockEntity: { relations: mocks.relations } }),
}));

vi.mock('~/core/sync/use-mutate', () => ({
  useMutate: () => ({ storage: { relations: { delete: mocks.deleteRelation } } }),
}));

vi.mock('~/core/hooks/use-space', () => ({ useSpace: () => ({ space: null }) }));

vi.mock('~/design-system/geo-image', () => ({ GeoImage: () => null }));
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));
vi.mock('~/design-system/select-space-dialog', () => ({
  SelectSpaceAsPopover: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));
vi.mock('~/partials/blocks/table/data-block-open-side-panel-button', () => ({
  DataBlockOpenSidePanelButton: () => null,
}));

function renderActions(overrides: Partial<React.ComponentProps<typeof CollectionRowActions>> = {}) {
  return render(
    <CollectionRowActions
      isEditing
      currentSpaceId={SPACE}
      entityId={ENTITY}
      relationId={RELATION}
      onLinkEntry={() => {}}
      {...overrides}
    />
  );
}

const removeButton = () => screen.queryByRole('button', { name: 'Remove from collection' });

beforeEach(() => {
  mocks.relations = [{ id: RELATION, entityId: 'relation-entity', toEntity: { id: ENTITY } }];
  mocks.deleteRelation.mockReset();
});

afterEach(cleanup);

describe('CollectionRowActions remove', () => {
  // The whole point of the ticket: no popover in the way.
  it('offers remove without opening the row menu', () => {
    renderActions();

    expect(removeButton()).toBeInTheDocument();
  });

  it('removes the row on a single click', () => {
    renderActions();

    fireEvent.click(removeButton()!);

    expect(mocks.deleteRelation).toHaveBeenCalledTimes(1);
    expect(mocks.deleteRelation).toHaveBeenCalledWith(mocks.relations[0]);
  });

  // `blockEntity.relations` carries everything hanging off the block, not just its rows. Matching
  // on what a relation points at would delete whichever reached this entity first.
  it('drops the row relation, not another relation reaching the same entity', () => {
    const blockType: FakeRelation = { id: 'types-relation', entityId: 'types-entity', toEntity: { id: ENTITY } };
    const rowRelation: FakeRelation = { id: RELATION, entityId: 'relation-entity', toEntity: { id: ENTITY } };
    mocks.relations = [blockType, rowRelation];

    renderActions();
    fireEvent.click(removeButton()!);

    expect(mocks.deleteRelation).toHaveBeenCalledWith(rowRelation);
  });

  it('does nothing when the row relation is no longer on the block', () => {
    mocks.relations = [{ id: 'someone-elses-relation', entityId: 'x', toEntity: { id: OTHER_ENTITY } }];

    renderActions();
    fireEvent.click(removeButton()!);

    expect(mocks.deleteRelation).not.toHaveBeenCalled();
  });

  // Reading a block is not editing one.
  it('leaves remove out when the block is not being edited', () => {
    renderActions({ isEditing: false });

    expect(removeButton()).not.toBeInTheDocument();
  });

  // A row with no collection-item relation has nothing to remove — query blocks derive their rows
  // from the query, which is why the ticket scopes this to collections.
  it('leaves remove out for a row with no relation of its own', () => {
    renderActions({ relationId: undefined });

    expect(removeButton()).not.toBeInTheDocument();
  });
});
