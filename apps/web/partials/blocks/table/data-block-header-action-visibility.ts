import type { DataBlockView } from '~/core/blocks/data/use-view';

/** Explore browse is an infinite feed and does not expose filter/fullscreen header actions. */
export function shouldShowFilterAndFullscreenActions(view: DataBlockView, isEditing: boolean): boolean {
  return isEditing || view !== 'EXPLORE';
}
