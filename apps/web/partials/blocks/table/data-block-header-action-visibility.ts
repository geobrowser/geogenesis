import type { Source } from '~/core/blocks/data/source';
import type { DataBlockView } from '~/core/blocks/data/use-view';

/** Filters are an editing control and stay hidden on every browse surface. */
export function shouldShowFilterAction(isEditing: boolean): boolean {
  return isEditing;
}

/** Explore and collection browse surfaces do not expose the fullscreen header action. */
export function shouldShowFullscreenAction(
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
