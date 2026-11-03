import { type BrowseSidebarData, browseSidebarVisibleSpaces } from '~/core/browse/fetch-browse-sidebar-data';
import { normId } from '~/core/utils/norm-id';

/**
 * Shared by the Explore feed and its topic-facet counts so they scope to the same spaces.
 *
 * Keeps only the ticked spaces this reader can see. Returns `null` (no narrowing) for `all`, an
 * empty value, or a list that matches nothing visible.
 */
export function narrowExploreSpaceFilter(browse: BrowseSidebarData, spaceIdsParam: string | null): string[] | null {
  if (!spaceIdsParam || spaceIdsParam === 'all') return null;
  const wanted = new Set(spaceIdsParam.split(',').map(normId).filter(Boolean));
  const visible = browseSidebarVisibleSpaces(browse)
    .filter(row => wanted.has(normId(row.id)))
    .map(row => row.id);
  return visible.length > 0 ? visible : null;
}
