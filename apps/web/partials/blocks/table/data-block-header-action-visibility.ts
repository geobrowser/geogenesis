import type { DataBlockView } from '~/core/blocks/data/use-view';

/** Explore browse is an infinite feed and does not expose filter/fullscreen header actions. */
export function shouldShowFilterAndFullscreenActions(view: DataBlockView, isEditing: boolean): boolean {
  return isEditing || view !== 'EXPLORE';
}

export function shouldShowExploreBrowseFilters(view: DataBlockView, isEditing: boolean): boolean {
  return view === 'EXPLORE' && !isEditing;
}

/** A hidden filter toggle must not leave its panel open with no way to close it. */
export function filterPanelOpenStateForActions(isFilterOpen: boolean, showActions: boolean): boolean {
  return showActions && isFilterOpen;
}
