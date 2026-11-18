import type { ExploreFeedRow } from '~/core/explore/explore-card-item';
import { fetchExploreRowsByIds } from '~/core/profile/explore-rows-by-ids';
import { chunk } from '~/core/utils/chunk';
import { normId } from '~/core/utils/norm-id';

export const CLAIM_RECORD_PAGE_SIZE = 20;

/** Stable request-sized chunks, preserving the complete Best-ranked id order. */
export function claimExploreRowPages(ids: readonly string[]): string[][] {
  return chunk(ids, CLAIM_RECORD_PAGE_SIZE);
}

export const claimExploreRowsQueryKey = (spaceId: string, page: string[]) =>
  ['claim', 'explore-rows', normId(spaceId), page.map(normId)] as const;

/** One request-page of a claim-scoped id list, as explore rows. Shared by the hook and the server's seed. */
export function fetchClaimExploreRowsPage(
  page: string[],
  spaceId: string,
  signal?: AbortSignal
): Promise<ExploreFeedRow[]> {
  const preferredSpaces = new Map(page.map(id => [normId(id), [spaceId]]));
  return fetchExploreRowsByIds(page, signal, preferredSpaces);
}
