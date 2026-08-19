import { describe, expect, it } from 'vitest';

import type { DataBlockView } from '~/core/blocks/data/data-block-view';

import { shouldShowDataBlockLoadingPlaceholder } from './data-block-loading-visibility';

const ready = {
  isLoading: false,
  isFetched: true,
  view: 'TABLE' as DataBlockView,
  isFramePending: false,
};

describe('shouldShowDataBlockLoadingPlaceholder', () => {
  it('shows the placeholder while the rows are loading', () => {
    expect(shouldShowDataBlockLoadingPlaceholder({ ...ready, isLoading: true })).toBe(true);
  });

  it('shows the placeholder before the first fetch settles', () => {
    expect(shouldShowDataBlockLoadingPlaceholder({ ...ready, isFetched: false })).toBe(true);
  });

  it('shows the rows once they have loaded', () => {
    expect(shouldShowDataBlockLoadingPlaceholder(ready)).toBe(false);
  });

  it('holds the placeholder when a gallery has rows but no media dimensions yet', () => {
    expect(shouldShowDataBlockLoadingPlaceholder({ ...ready, view: 'GALLERY', isFramePending: true })).toBe(true);
  });

  it('shows the gallery once its media dimensions land', () => {
    expect(shouldShowDataBlockLoadingPlaceholder({ ...ready, view: 'GALLERY', isFramePending: false })).toBe(false);
  });

  it.each(['TABLE', 'LIST', 'BULLETED_LIST', 'EXPLORE', 'PILL'] as const)(
    'does not make %s wait on media dimensions it never reads',
    view => {
      expect(shouldShowDataBlockLoadingPlaceholder({ ...ready, view, isFramePending: true })).toBe(false);
    }
  );
});
