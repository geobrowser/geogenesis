'use client';

import { useQuery } from '@tanstack/react-query';

import { commentsFetchedQueryKey } from '~/core/io/query-keys';

import type { CommentEntity } from '~/partials/comments/types';

/**
 * The comment count as the client currently knows it, seeded by a server-rendered one.
 *
 * Counts beside a comment icon are rendered by a server component next to whatever they label,
 * which is cheap but frozen: posting a comment writes the new row into the `['comments', entityId]`
 * cache and nothing re-runs the server count, so the number sits one behind the list it describes
 * until the page is reloaded.
 *
 * Subscribing to that cache key — without enabling the query — makes the count follow every write to
 * the list: optimistic, published, deleted. It costs no request of its own, because it never fetches.
 *
 * The cache does not win unconditionally, though. Because this hook subscribes, the entry is never
 * collected while any surface showing a count stays mounted, and nothing here refetches it — so a
 * list left over from an earlier panel visit would otherwise outrank a number the server rendered
 * just now, and keep outranking it indefinitely. It wins only when it knows something that number
 * cannot: it was written after the number was handed to us, or it holds rows that have not been
 * published yet.
 */
/**
 * When each entity's current server count reached the client.
 *
 * Deliberately not component state. The seed answers "was the cached list fetched after this count was
 * produced", and a component that remounts — an explore card scrolling out of view and back — would
 * otherwise mint a fresh timestamp for a count it has had all along, then disown a list it had already
 * fetched and revert its pill to the server's older number. One entry per entity, replaced when the
 * count changes, so it stays the same size as the set of entities on screen.
 */
const seeds = new Map<string, { count: number; at: number }>();

function seedFor(entityId: string, serverCount: number): number {
  const seen = seeds.get(entityId);
  if (seen && seen.count === serverCount) return seen.at;

  const at = Date.now();
  seeds.set(entityId, { count: serverCount, at });
  return at;
}

/** Test seam: the seeds outlive components by design, so a suite has to be able to start clean. */
export function resetCommentCountSeeds() {
  seeds.clear();
}

export function useCommentCount(
  entityId: string,
  serverCount: number,
  {
    commentsInSeed,
  }: {
    /**
     * How many of `serverCount` are this entity's comments, when the seed counts more than them.
     *
     * The claim card's pill is an *activity* total — the claim's debates, the claims extracted from
     * them, and every comment in that tree. The comment list is a strict subset of it, so the rule
     * below ("once the list has answered it *is* the count") turned a pill reading 33 into one
     * reading 1 as soon as anything fetched that list; the claim page does on every visit, so
     * opening a claim and going back to Explore was enough.
     *
     * Given this, the list still replaces — but only its own share. `serverCount - commentsInSeed`
     * is the part of the total the list cannot see, and the list's length is the part it can, so the
     * answer stays exact through publishing, indexing and rollback alike. Counting pending rows
     * instead would have been right only while a row was in flight: once indexed, the row loses its
     * flag and the pill fell back to the seed, going 33 → 34 → 33 with the comment still there.
     */
    commentsInSeed?: number;
  } = {}
): number {
  // Whether the list has ever been fetched, rather than merely written to. Same disabled-subscription
  // shape as the list below, for the same reason: this reads what another hook owns.
  const { data: hasFetchedList } = useQuery<boolean>({
    queryKey: commentsFetchedQueryKey(entityId),
    enabled: false,
  });

  const { data, dataUpdatedAt } = useQuery<CommentEntity[]>({
    queryKey: ['comments', entityId],
    // A cache subscription, not a second reader of the list — `useComments` owns the fetching, and
    // this hook is rendered on surfaces (cards, feed rows) where fetching every count would be a
    // request per row for a number.
    enabled: false,
  });

  const seededAt = seedFor(entityId, serverCount);

  if (!data) return serverCount;

  if (dataUpdatedAt > seededAt) {
    // Once the list has answered it *is* the count — `mergePendingWithServer` guarantees what it leaves
    // behind is the server's rows plus whatever is still only local, so its length already includes any
    // pending row and needs no arithmetic. That holds for an empty answer too: the list filters what the
    // count merely counted (the count is backlink ids, the list drops any whose relations do not come
    // back), so it can legitimately say none where the count said five, and a pill reading five beside a
    // visibly empty panel is the worse of those two wrongs.
    //
    // Asking whether the list was *fetched*, rather than whether it holds any server-looking rows, is
    // what keeps those two apart: a publish that fails before the list loads filters its own optimistic
    // row back out and leaves `[]` behind, which is not the list speaking — and a post on top of an
    // authoritatively empty list leaves only a pending row, which is.
    // The list replaces the whole count when it measures the whole count, and only its own share
    // when the seed is broader — see `commentsInSeed`.
    if (hasFetchedList === true) {
      return commentsInSeed == null ? data.length : Math.max(0, serverCount - commentsInSeed) + data.length;
    }

    // Never fetched, so this entry holds only what was written into it: `useCreateComment` seeds it with
    // `(old = [])`. Its length would read 1 where the server knows 5, so the count is the base those
    // local rows are added to. The flag is not a claim the server lacks them — it means "keep this row
    // through refetches" and outlives publishing — but nothing here has heard from the server at all.
    const optimisticRows = data.filter(comment => comment.isPendingPublish === true).length;
    return serverCount + optimisticRows;
  }

  // The cache predates this server count, so the count is the better record — including where a row in
  // it is still flagged, since adding one to a count that has already caught up reports it twice.
  return serverCount;
}
