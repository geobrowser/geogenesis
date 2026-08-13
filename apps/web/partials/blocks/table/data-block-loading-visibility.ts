import type { DataBlockView } from '~/core/blocks/data/data-block-view';

type Args = {
  isLoading: boolean;
  isFetched: boolean;
  view: DataBlockView;
  /** `useBlockMainMedia().isFramePending` — the block's configured media dimensions aren't known yet. */
  isFramePending: boolean;
};

/**
 * Whether a data block shows its loading placeholder instead of its rows.
 *
 * Beyond the obvious "the rows haven't arrived", the gallery also waits on the block's
 * configured media dimensions. They arrive separately from the rows, and until they do a
 * gallery card can't tell "no custom size" from "not known yet" — so rendering early lays the
 * grid out at the default 2:1 ratio and reflows the page when the real ratio lands. Every
 * other view sizes its rows from CSS alone and doesn't need to wait.
 */
export function shouldShowDataBlockLoadingPlaceholder({ isLoading, isFetched, view, isFramePending }: Args): boolean {
  if (isLoading || !isFetched) return true;
  return view === 'GALLERY' && isFramePending;
}
