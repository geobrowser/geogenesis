import type { Source } from '~/core/blocks/data/source';
import type { DataBlockView } from '~/core/blocks/data/use-view';

/** Explore and collection browse surfaces do not expose filter/fullscreen header actions. */
export function shouldShowFilterAndFullscreenActions(
  view: DataBlockView,
  sourceType: Source['type'],
  isEditing: boolean
): boolean {
  return isEditing || (view !== 'EXPLORE' && sourceType !== 'COLLECTION');
}

/** A hidden filter toggle must not leave its panel open with no way to close it. */
export function filterPanelOpenStateForActions(isFilterOpen: boolean, showActions: boolean): boolean {
  return showActions && isFilterOpen;
}
