import { describe, expect, it } from 'vitest';

import type { DataBlockView } from '~/core/blocks/data/use-view';

import {
  filterPanelOpenStateForActions,
  shouldShowFilterAction,
  shouldShowFullscreenAction,
} from './data-block-header-action-visibility';

describe('shouldShowFilterAction', () => {
  it('hides the filter action in browse mode', () => {
    expect(shouldShowFilterAction(false)).toBe(false);
  });

  it('keeps the filter action in edit mode', () => {
    expect(shouldShowFilterAction(true)).toBe(true);
  });
});

describe('shouldShowFullscreenAction', () => {
  it('hides the fullscreen action for Explore view in browse mode', () => {
    expect(shouldShowFullscreenAction('EXPLORE', 'SPACES', false)).toBe(false);
  });

  it('keeps the fullscreen action for Explore view in edit mode', () => {
    expect(shouldShowFullscreenAction('EXPLORE', 'SPACES', true)).toBe(true);
  });

  it.each<DataBlockView>(['TABLE', 'LIST', 'GALLERY', 'BULLETED_LIST', 'PILL', 'EXPLORE'])(
    'hides the fullscreen action for a Collection source using %s view in browse mode',
    view => {
      expect(shouldShowFullscreenAction(view, 'COLLECTION', false)).toBe(false);
    }
  );

  it('keeps the fullscreen action for a Collection source in edit mode', () => {
    expect(shouldShowFullscreenAction('TABLE', 'COLLECTION', true)).toBe(true);
  });

  it.each<DataBlockView>(['TABLE', 'LIST', 'GALLERY', 'BULLETED_LIST', 'PILL'])(
    'keeps the fullscreen action for a query source using %s view in browse mode',
    view => {
      expect(shouldShowFullscreenAction(view, 'SPACES', false)).toBe(true);
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
