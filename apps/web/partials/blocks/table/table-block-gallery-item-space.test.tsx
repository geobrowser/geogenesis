import '@testing-library/jest-dom/vitest';
import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { cleanup, render, screen } from '@testing-library/react';

import type React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Cell } from '~/core/types';

import { TableBlockGalleryItem } from './table-block-gallery-item';

/**
 * GEO-2581. A data block lists rows from many spaces, so a row's entity does not
 * necessarily live in the block's space. `EntityRowActions` forwards its `spaceId` to
 * `ClaimDebateButton` -> `useDebateClaims` -> geo-chat, which rejects the claim with
 * `claim_not_in_space` when that space does not contain it — surfaced to users as
 * "Connection failed". Passing the block's space sent ROOT_SPACE for claims living
 * elsewhere; 3,357 failures in a single 5-hour window traced to exactly that.
 *
 * Every other space-scoped prop in this component already resolves `nameCell?.space`
 * first. This asserts the actions row does too, so it cannot quietly regress.
 */
vi.mock('~/partials/entity-page/entity-row-actions', () => ({
  EntityRowActions: ({ entityId, spaceId }: { entityId: string; spaceId: string }) => (
    <div data-testid="row-actions" data-entity-id={entityId} data-space-id={spaceId} />
  ),
}));

vi.mock('~/core/sync/use-mutate', () => ({ useMutate: () => ({ storage: {} }) }));
vi.mock('~/core/sync/use-store', () => ({ useSpaceAwareValue: () => null }));
vi.mock('~/core/hooks/use-block-main-media-url', () => ({
  useBlockMainMediaUrl: () => ({ url: null, isResolving: false }),
}));

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('~/design-system/geo-image', () => ({ GeoImage: () => null, DEFAULT_IMAGE_SIZES: '' }));
vi.mock('~/design-system/select-entity', () => ({ SelectEntity: () => null }));
vi.mock('~/design-system/editable-fields/editable-fields', () => ({
  BlockImageField: () => null,
  PageStringField: () => null,
}));
vi.mock('next/image', () => ({ default: () => null }));

vi.mock('~/partials/blocks/table/data-block-open-side-panel-button', () => ({
  DataBlockOpenSidePanelButton: () => null,
}));
vi.mock('~/partials/blocks/table/collection-row-actions', () => ({ CollectionRowActions: () => null }));
vi.mock('~/partials/blocks/table/collection-metadata', () => ({ CollectionMetadata: () => null }));
vi.mock('~/partials/blocks/table/edit-mode-name-field', () => ({ EditModeNameField: () => null }));
vi.mock('./table-block-property-field', () => ({ TableBlockPropertyField: () => null }));

afterEach(cleanup);

const BLOCK_SPACE = 'a19c345ab9866679b001d7d2138d88a1'; // ROOT_SPACE — the wrong answer
const CLAIM_SPACE = 'b5a31f8182b042437ede0f84ee02f104'; // Podcasts — where the claim lives

// The component destructures `nameCell` unguarded (`const { propertyId, verified } = nameCell`),
// so a row always carries a name cell — the `?? currentSpaceId` fallback is reachable only when
// the cell itself has no `space`, which is the case exercised below.
const renderItem = (nameCell: Partial<Cell>) =>
  render(
    <TableBlockGalleryItem
      columns={{ [SystemIds.NAME_PROPERTY]: { propertyId: SystemIds.NAME_PROPERTY, ...nameCell } } as Record<
        string,
        Cell
      >}
      currentSpaceId={BLOCK_SPACE}
      isEditing={false}
      rowEntityId="entity-1"
      onChangeEntry={() => {}}
      onLinkEntry={() => {}}
      isPlaceholder={false}
      source={{ type: 'GEO' }}
    />
  );

describe('TableBlockGalleryItem row actions space', () => {
  it("passes the entity's own space, not the block's", () => {
    renderItem({ space: CLAIM_SPACE, name: 'A claim' } as Partial<Cell>);

    expect(screen.getByTestId('row-actions')).toHaveAttribute('data-space-id', CLAIM_SPACE);
  });

  it("falls back to the block's space when the row's cell carries none", () => {
    renderItem({ name: 'A claim' } as Partial<Cell>);

    expect(screen.getByTestId('row-actions')).toHaveAttribute('data-space-id', BLOCK_SPACE);
  });
});
