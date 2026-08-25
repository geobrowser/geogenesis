import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Cell } from '~/core/types';

import { TableBlockBulletedListItem } from './table-block-bulleted-list-item';
import { TableBlockListItem } from './table-block-list-item';

/**
 * The list and bulleted-list halves of GEO-2581, which fixed the table and gallery views only.
 *
 * A data block lists rows drawn from many spaces, so a row's entity does not necessarily live in
 * the block's space. `EntityRowActions` forwards its `spaceId` to two things that care: the Debate
 * button, which sends it to geo-chat (rejected as `claim_not_in_space`, surfaced as "Connection
 * failed"), and the claim response controls, which read the claim's response kind out of it.
 *
 * Every other space-scoped prop in both components already resolves `nameCell?.space` first — the
 * href, the side-panel button, the collection metadata. The actions row was the lone exception.
 */
vi.mock('~/partials/entity-page/entity-row-actions', () => ({
  EntityRowActions: ({ entityId, spaceId }: { entityId: string; spaceId: string }) => (
    <div data-testid="row-actions" data-entity-id={entityId} data-space-id={spaceId} />
  ),
}));

vi.mock('~/core/sync/use-mutate', () => ({ useMutate: () => ({ storage: {} }) }));
vi.mock('~/core/hooks/use-block-main-media-url', () => ({
  useBlockMainMediaUrl: () => ({ url: null, isResolving: false }),
}));
vi.mock('~/core/sync/use-store', () => ({ useSpaceAwareValue: () => null, useQueryEntity: () => ({ entity: null }) }));

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('~/design-system/select-entity', () => ({ SelectEntity: () => null }));
vi.mock('~/design-system/editable-fields/editable-fields', () => ({
  PageStringField: () => null,
  BlockImageField: () => null,
}));
vi.mock('~/design-system/geo-image', () => ({ GeoImage: () => null, DEFAULT_IMAGE_SIZES: '' }));
vi.mock('next/image', () => ({ default: () => null }));

vi.mock('~/partials/blocks/table/data-block-open-side-panel-button', () => ({
  DataBlockOpenSidePanelButton: () => null,
}));
vi.mock('~/partials/blocks/table/collection-row-actions', () => ({ CollectionRowActions: () => null }));
vi.mock('~/partials/blocks/table/collection-metadata', () => ({
  CollectionMetadata: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock('~/partials/blocks/table/edit-mode-name-field', () => ({ EditModeNameField: () => null }));
vi.mock('./table-block-property-field', () => ({ TableBlockPropertyField: () => null }));

afterEach(cleanup);

const BLOCK_SPACE = 'cc31e40f74231d530f1b5d0fc1cd94d8'; // The space whose page shows the block
const CLAIM_SPACE = '41e851610e13a19441c4d980f2f2ce6b'; // Where the claim was actually published

function nameColumn(nameCell: Partial<Cell>) {
  return { [SystemIds.NAME_PROPERTY]: { propertyId: SystemIds.NAME_PROPERTY, ...nameCell } } as Record<string, Cell>;
}

const renderListItem = (nameCell: Partial<Cell>) =>
  render(
    <TableBlockListItem
      columns={nameColumn(nameCell)}
      currentSpaceId={BLOCK_SPACE}
      isEditing={false}
      rowEntityId="entity-1"
      onChangeEntry={() => {}}
      onLinkEntry={() => {}}
      isPlaceholder={false}
      source={{ type: 'GEO' }}
    />
  );

const renderBulletedItem = (nameCell: Partial<Cell>) =>
  render(
    <TableBlockBulletedListItem
      columns={nameColumn(nameCell)}
      currentSpaceId={BLOCK_SPACE}
      isEditing={false}
      rowEntityId="entity-1"
      onChangeEntry={() => {}}
      onLinkEntry={() => {}}
      isPlaceholder={false}
      source={{ type: 'GEO' }}
    />
  );

describe.each([
  ['TableBlockListItem', renderListItem],
  ['TableBlockBulletedListItem', renderBulletedItem],
])('%s row actions space', (_name, renderItem) => {
  it("passes the entity's own space, not the block's", () => {
    renderItem({ space: CLAIM_SPACE, name: 'AGI development should be paused.' } as Partial<Cell>);

    expect(screen.getByTestId('row-actions')).toHaveAttribute('data-space-id', CLAIM_SPACE);
  });

  it("falls back to the block's space when the row's cell carries none", () => {
    renderItem({ name: 'AGI development should be paused.' } as Partial<Cell>);

    expect(screen.getByTestId('row-actions')).toHaveAttribute('data-space-id', BLOCK_SPACE);
  });
});
