import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Cell, Property, Row } from '~/core/types';

import { TableBlockTable } from './table-block-table';

/**
 * GEOGENESIS-8B / A3: "Maximum update depth exceeded" on `/space/:id`, 28 + 9 occurrences across
 * 4 users, open since 2026-06-10 and still ongoing.
 *
 * The table declared `state.pagination` — controlled — as a fresh object literal every render, with
 * no `onPaginationChange` to receive updates. `autoResetPageIndex` fires whenever the data changes,
 * so the reset could never settle: React cannot bail out on an object whose identity differs each
 * time, the way it does for an unchanged primitive.
 *
 * **These tests do not reproduce the loop, and should not be read as proof the fix works.** Both
 * pass against the old `state.pagination` too. The loop needs the sustained re-render churn a live
 * space page produces — a parent that re-renders in response to the table's own state change — and
 * a single `rerender` in jsdom does not recreate it: `resetPageIndex` writes 0 over 0 and settles.
 *
 * What they do guard is that the visible behaviour is unchanged by moving pagination from `state`
 * to `initialState` — the page size still applies, and the table still survives the new `rows`
 * identity that every refetch hands it. The fix itself rests on the stacktrace and on TanStack's
 * contract: passing `state.x` without `onXChange` is a documented misuse, and there is no
 * pagination UI here for the controlled form to serve.
 */

vi.mock('~/partials/entity-page/entity-row-actions', () => ({ EntityRowActions: () => null }));
vi.mock('~/partials/blocks/table/data-block-open-side-panel-button', () => ({
  DataBlockOpenSidePanelButton: () => null,
}));
vi.mock('~/partials/blocks/table/collection-row-actions', () => ({ CollectionRowActions: () => null }));
vi.mock('~/partials/blocks/table/collection-metadata', () => ({
  CollectionMetadata: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

// Keeps the real module from importing: its top-level `atomWithStorage` runs on import and Node's
// own webstorage shadows jsdom's here, so anything reaching it fails to collect.
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
  useSpaceAwareValue: () => ({ value: 'row' }),
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

const nameProperty: Property = { id: SystemIds.NAME_PROPERTY, name: 'Name', dataType: 'TEXT' } as Property;

/** A fresh array every call — the point is that identity changes, as it does on every refetch. */
function buildRows(count: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    entityId: `entity-${index}`,
    columns: {
      [SystemIds.NAME_PROPERTY]: {
        propertyId: SystemIds.NAME_PROPERTY,
        slotId: SystemIds.NAME_PROPERTY,
        space: ENTITY_SPACE,
        name: `Row ${index}`,
      },
    } as Record<string, Cell>,
  })) as Row[];
}

function tableWith(rows: Row[]) {
  return (
    <TableBlockTable
      space={BLOCK_SPACE}
      properties={[nameProperty]}
      propertiesSchema={{ [SystemIds.NAME_PROPERTY]: nameProperty }}
      rows={rows}
      shownColumnIds={[SystemIds.NAME_PROPERTY]}
      placeholder={{ text: '', image: '' }}
      isLoading={false}
      isFetched={true}
      onChangeEntry={() => {}}
      onLinkEntry={() => {}}
      source={{ type: 'GEO' } as never}
      shouldAutoFocusPlaceholder={false}
      sortState={null as never}
      onSort={() => {}}
    />
  );
}

describe('TableBlockTable pagination', () => {
  it('does not exceed the update depth when the row data changes identity', () => {
    const { rerender } = render(tableWith(buildRows(20)));

    expect(() => rerender(tableWith(buildRows(20)))).not.toThrow();
  });

  it('still shows only the first page of rows', () => {
    render(tableWith(buildRows(20)));

    // pageSize 9 — moving pagination to `initialState` must not stop it applying.
    expect(screen.getAllByRole('row').length - 1).toBe(9);
  });
});
