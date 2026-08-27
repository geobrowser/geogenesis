import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Source } from '~/core/blocks/data/source';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import type { Cell } from '~/core/types';

const mocks = vi.hoisted(() => ({
  media: { url: undefined as string | undefined, isResolving: false },
}));

vi.mock('~/core/hooks/use-block-main-media-url', () => ({
  useBlockMainMediaUrl: () => mocks.media,
}));

vi.mock('~/core/sync/use-mutate', () => ({
  useMutate: () => ({ storage: { images: { createAndLink: vi.fn() } } }),
}));

vi.mock('~/core/sync/use-store', () => ({
  useSpaceAwareValue: () => null,
}));

vi.mock('~/design-system/geo-image', () => ({
  DEFAULT_IMAGE_SIZES: '100vw',
  GeoImage: ({ value }: { value: string }) => <img data-testid="geo-image" src={value} alt="" />,
}));

vi.mock('next/image', () => ({
  default: ({ src }: { src: string }) => <img data-testid="next-image" src={src} alt="" />,
}));

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));

vi.mock('~/partials/entity-page/entity-row-actions', () => ({
  EntityRowActions: () => null,
}));

vi.mock('./data-block-open-side-panel-button', () => ({
  DataBlockOpenSidePanelButton: () => null,
}));

const { TableBlockGalleryItem } = await import('./table-block-gallery-item');

const source = { type: 'SPACES', value: ['space-1'] } as Source;
const columns: Record<string, Cell> = {
  [SystemIds.NAME_PROPERTY]: { slotId: SystemIds.NAME_PROPERTY, propertyId: 'row-1', name: 'A debate' } as Cell,
};

function renderCard() {
  return render(
    <TableBlockGalleryItem
      columns={columns}
      currentSpaceId="space-1"
      isEditing={false}
      rowEntityId="row-1"
      onChangeEntry={vi.fn()}
      onLinkEntry={vi.fn()}
      isPlaceholder={false}
      source={source}
      mainMedia={null}
    />
  );
}

const placeholders = (container: HTMLElement) =>
  Array.from(container.querySelectorAll(`img[src="${PLACEHOLDER_SPACE_IMAGE}"]`));

beforeEach(() => {
  mocks.media = { url: undefined, isResolving: false };
});

afterEach(cleanup);

describe('TableBlockGalleryItem media frame', () => {
  it('leaves the frame empty while the image is still being looked up', () => {
    // Filling it with the fallback here is what made every card flash the placeholder and then
    // swap to its real image a moment later.
    mocks.media = { url: undefined, isResolving: true };

    const { container } = renderCard();

    expect(placeholders(container)).toHaveLength(0);
    expect(container.querySelector('[data-testid="geo-image"]')).toBeNull();
  });

  it('shows the placeholder once the lookup settles with no image', () => {
    mocks.media = { url: undefined, isResolving: false };

    const { container } = renderCard();

    expect(placeholders(container)).toHaveLength(1);
  });

  it('goes straight to the real image without a placeholder in between', () => {
    mocks.media = { url: 'ipfs://real-image', isResolving: false };

    const { container } = renderCard();

    expect(placeholders(container)).toHaveLength(0);
    expect(container.querySelector('[data-testid="geo-image"]')).toHaveAttribute('src', 'ipfs://real-image');
  });
});
