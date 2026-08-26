import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Cell, Property, Row } from '~/core/types';

import { TableBlockBulletedListItem } from './table-block-bulleted-list-item';
import { TableBlockTable } from './table-block-table';

/**
 * GEO-2672: a row's hover controls belong beside its vote controls, not level with its title.
 *
 * Overlaying the title is not only a question of where they sit — `CollectionMetadata` reserves
 * `pr-14`/`pr-16` of the name's own width to keep it from running underneath them, so a row with
 * hover actions truncates its name earlier than one without. List and gallery views already moved
 * theirs down; these are the two views that had not.
 *
 * The assertions are about containment rather than class names: the controls and the votes must
 * end up in one row together, which is what "aligned" means in a flex layout and what the old
 * markup — a sibling pinned to the top of the row — could not satisfy.
 */

const HOVER_CONTROL = 'side-panel-button';
const COLLECTION_HOVER_CONTROL = 'collection-row-actions';
const VOTES = 'row-actions';

vi.mock('~/partials/entity-page/entity-row-actions', () => ({
  EntityRowActions: ({ entityId, spaceId }: { entityId: string; spaceId: string }) => (
    <div data-testid={VOTES} data-entity-id={entityId} data-space-id={spaceId} />
  ),
}));

vi.mock('~/partials/blocks/table/data-block-open-side-panel-button', () => ({
  DataBlockOpenSidePanelButton: () => <button data-testid={HOVER_CONTROL} />,
}));

vi.mock('~/partials/blocks/table/collection-row-actions', () => ({
  CollectionRowActions: () => <button data-testid={COLLECTION_HOVER_CONTROL} />,
}));

/**
 * Records what the name was told about its own hover actions. A stub that swallowed the prop would
 * let the duplicate-controls regression through: the row would grow a second set below while the
 * originals stayed pinned to the title.
 */
vi.mock('~/partials/blocks/table/collection-metadata', () => ({
  CollectionMetadata: ({ children, hideHoverActions }: { children?: React.ReactNode; hideHoverActions?: boolean }) => (
    <div data-testid="collection-metadata" data-hide-hover-actions={String(Boolean(hideHoverActions))}>
      {children}
    </div>
  ),
}));

/**
 * Keeps the real module from importing: its top-level `atomWithStorage` runs on import and Node's
 * own webstorage shadows jsdom's here, so anything reaching it fails to collect. Nothing in these
 * components uses it — it arrives via `use-space-id`.
 */
vi.mock('~/core/state/pending-personal-space', () => ({
  PENDING_PERSONAL_SPACE_PREFIX: 'pending:',
  pendingPersonalSpaceAtom: { init: null },
  pendingPersonalSpaceId: (topicId: string) => `pending:${topicId}`,
  isPendingPersonalSpaceId: () => false,
  usePendingPersonalSpace: () => ({ isPending: false }),
}));

vi.mock('~/core/hooks/use-user-is-editing', () => ({ useUserIsEditing: () => false }));
vi.mock('~/core/sync/use-mutate', () => ({ useMutate: () => ({ storage: {} }) }));
vi.mock('~/core/sync/use-store', () => ({
  useSpaceAwareValue: () => ({ value: 'AGI development should be paused.' }),
  useQueryEntity: () => ({ entity: null }),
  useRelations: () => [],
  useValues: () => [],
}));

vi.mock('jotai', async importOriginal => ({
  ...(await importOriginal<typeof import('jotai')>()),
  useAtomValue: () => false,
}));

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('~/design-system/select-entity', () => ({ SelectEntity: () => null }));
vi.mock('~/design-system/editable-fields/editable-fields', () => ({
  PageStringField: () => null,
  BlockImageField: () => null,
  ImageZoom: () => null,
}));
vi.mock('~/partials/blocks/table/edit-mode-name-field', () => ({ EditModeNameField: () => null }));
vi.mock('~/partials/entity-page/editable-entity-table-cell', () => ({ EditableEntityTableCell: () => null }));

afterEach(cleanup);

const BLOCK_SPACE = 'cc31e40f74231d530f1b5d0fc1cd94d8';
const ENTITY_SPACE = '41e851610e13a19441c4d980f2f2ce6b';
const OTHER_PROPERTY = 'aa5da9270000000000000000000000ff';

const nameProperty: Property = {
  id: SystemIds.NAME_PROPERTY,
  name: 'Name',
  dataType: 'TEXT',
} as Property;

const otherProperty: Property = {
  id: OTHER_PROPERTY,
  name: 'Description',
  dataType: 'TEXT',
} as Property;

function nameColumn(overrides: Partial<Cell> = {}) {
  return {
    [SystemIds.NAME_PROPERTY]: {
      propertyId: SystemIds.NAME_PROPERTY,
      slotId: SystemIds.NAME_PROPERTY,
      space: ENTITY_SPACE,
      name: 'AGI development should be paused.',
      ...overrides,
    },
  } as Record<string, Cell>;
}

function renderBulletedItem(source: { type: 'GEO' } | { type: 'COLLECTION' } = { type: 'GEO' }) {
  return render(
    <TableBlockBulletedListItem
      columns={nameColumn()}
      currentSpaceId={BLOCK_SPACE}
      isEditing={false}
      rowEntityId="entity-1"
      onChangeEntry={() => {}}
      onLinkEntry={() => {}}
      isPlaceholder={false}
      source={source as never}
    />
  );
}

function renderTable(
  source: { type: 'GEO' } | { type: 'COLLECTION' } = { type: 'GEO' },
  columns: Record<string, Cell> = nameColumn()
) {
  const rows: Row[] = [{ entityId: 'entity-1', columns } as Row];

  return render(
    <TableBlockTable
      space={BLOCK_SPACE}
      properties={[nameProperty, otherProperty]}
      propertiesSchema={{ [SystemIds.NAME_PROPERTY]: nameProperty, [OTHER_PROPERTY]: otherProperty }}
      rows={rows}
      shownColumnIds={[SystemIds.NAME_PROPERTY, OTHER_PROPERTY]}
      placeholder={{ text: '', image: '' }}
      isLoading={false}
      isFetched={true}
      onChangeEntry={() => {}}
      onLinkEntry={() => {}}
      source={source as never}
      shouldAutoFocusPlaceholder={false}
      sortState={null as never}
      onSort={() => {}}
    />
  );
}

describe('TableBlockBulletedListItem control layout', () => {
  it('puts the hover control in the same row as the votes', () => {
    renderBulletedItem();

    const votes = screen.getByTestId(VOTES);
    const control = screen.getByTestId(HOVER_CONTROL);

    // Previously the control lived in a sibling of the text column, pinned to the title's line —
    // so the votes' own row could not contain it.
    expect(votes.parentElement).toContainElement(control);
  });

  it('tells the name to stop rendering its own hover actions', () => {
    renderBulletedItem({ type: 'COLLECTION' });

    expect(screen.getByTestId('collection-metadata')).toHaveAttribute('data-hide-hover-actions', 'true');
  });

  it('uses the collection controls, not the side panel button, for a collection row', () => {
    renderBulletedItem({ type: 'COLLECTION' });

    const votes = screen.getByTestId(VOTES);

    expect(votes.parentElement).toContainElement(screen.getByTestId(COLLECTION_HOVER_CONTROL));
    expect(screen.queryByTestId(HOVER_CONTROL)).not.toBeInTheDocument();
  });
});

describe('TableBlockTable control layout', () => {
  it('renders the votes inside the name cell rather than a trailing cell of their own', () => {
    renderTable();

    const votes = screen.getByTestId(VOTES);
    const cell = votes.closest('td');
    const nameCell = document.querySelectorAll('tbody td')[0];

    expect(cell).toBe(nameCell);
  });

  it('puts the hover control in the same row as the votes', () => {
    renderTable();

    expect(screen.getByTestId(VOTES).parentElement).toContainElement(screen.getByTestId(HOVER_CONTROL));
  });

  it('votes in the entity’s own space, not the block’s', () => {
    renderTable();

    expect(screen.getByTestId(VOTES)).toHaveAttribute('data-space-id', ENTITY_SPACE);
  });

  // The trailing actions column had a header cell of its own. Dropping one without the other
  // leaves every column header off by one against its body cells.
  it('keeps one header cell per body cell', () => {
    renderTable();

    const headers = document.querySelectorAll('thead th').length;
    const cells = document.querySelectorAll('tbody tr')[0].querySelectorAll('td').length;

    expect(headers).toBe(cells);
  });

  describe('collection rows', () => {
    it('tells the name to stop rendering its own hover actions', () => {
      renderTable({ type: 'COLLECTION' });

      expect(screen.getByTestId('collection-metadata')).toHaveAttribute('data-hide-hover-actions', 'true');
    });

    it('uses the collection controls, not the side panel button, beside the votes', () => {
      renderTable({ type: 'COLLECTION' });

      const votes = screen.getByTestId(VOTES);

      expect(votes.parentElement).toContainElement(screen.getByTestId(COLLECTION_HOVER_CONTROL));
      expect(screen.queryByTestId(HOVER_CONTROL)).not.toBeInTheDocument();
    });
  });

  /**
   * A mapping can render one property's data in another's slot — the entity's name in the Roles
   * slot (`mappingToCell`, use-mapping.ts:155). Where the controls go is a question about the
   * column, so it has to follow `slotId`; following the rendered property would drop them into
   * whichever column happens to show the name and leave the Name column without any, and with the
   * trailing cell gone there is no longer a second place for them to appear.
   */
  it('puts the controls in the Name column even when another column renders the name', () => {
    const crossedColumns = {
      [SystemIds.NAME_PROPERTY]: {
        propertyId: SystemIds.NAME_PROPERTY,
        slotId: SystemIds.NAME_PROPERTY,
        renderedPropertyId: OTHER_PROPERTY,
        space: ENTITY_SPACE,
        name: 'AGI development should be paused.',
      },
      [OTHER_PROPERTY]: {
        propertyId: OTHER_PROPERTY,
        slotId: OTHER_PROPERTY,
        renderedPropertyId: SystemIds.NAME_PROPERTY,
        space: ENTITY_SPACE,
        name: 'AGI development should be paused.',
      },
    } as Record<string, Cell>;

    renderTable({ type: 'GEO' }, crossedColumns);

    const cells = document.querySelectorAll('tbody td');

    expect(screen.getByTestId(VOTES).closest('td')).toBe(cells[0]);
  });
});
