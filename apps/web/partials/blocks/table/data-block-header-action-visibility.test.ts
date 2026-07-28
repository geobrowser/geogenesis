import { describe, expect, it } from 'vitest';

import type { DataBlockView } from '~/core/blocks/data/use-view';

import {
  filterPanelOpenStateForActions,
  shouldShowFilterAndFullscreenActions,
} from './data-block-header-action-visibility';

describe('shouldShowFilterAndFullscreenActions', () => {
  it('hides both actions for Explore view in browse mode', () => {
    expect(shouldShowFilterAndFullscreenActions('EXPLORE', false)).toBe(false);
  });

  it('keeps both actions for Explore view in edit mode', () => {
    expect(shouldShowFilterAndFullscreenActions('EXPLORE', true)).toBe(true);
  });

  it.each<DataBlockView>(['TABLE', 'LIST', 'GALLERY', 'BULLETED_LIST', 'PILL'])(
    'keeps both actions for %s view in browse mode',
    view => {
      expect(shouldShowFilterAndFullscreenActions(view, false)).toBe(true);
    }
  );
});

describe('filterPanelOpenStateForActions', () => {
  it('closes an open filter panel when its actions are hidden', () => {
    expect(filterPanelOpenStateForActions(true, false)).toBe(false);
  });

  it('preserves the filter panel state while its actions remain visible', () => {
    expect(filterPanelOpenStateForActions(true, true)).toBe(true);
    expect(filterPanelOpenStateForActions(false, true)).toBe(false);
  });
});
