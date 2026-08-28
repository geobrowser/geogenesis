import type { DataBlockView } from './data-block-view';

/**
 * Views whose renderer draws every entry it is given, so accumulating pages actually grows the
 * list. TABLE is absent deliberately: `TableBlockTable` paginates internally at a fixed 9 rows
 * with no pager of its own, so rows past the first page would be invisible — the list would never
 * grow, the sentinel below it would never stop intersecting, and it would walk the whole source
 * one page at a time while the user saw nine rows.
 *
 * This is an allowlist rather than a `!== 'TABLE'` check because `TableBlockTable` is also the
 * fallback renderer for any view without its own component. A denylist would let a view added
 * later inherit that behaviour silently; this way it has to opt in.
 */
const INFINITE_SCROLLABLE_VIEWS = new Set<DataBlockView>(['LIST', 'BULLETED_LIST', 'GALLERY', 'PILL', 'EXPLORE']);

export function viewRendersAllEntries(view: DataBlockView): boolean {
  return INFINITE_SCROLLABLE_VIEWS.has(view);
}

/**
 * Identity of the query whose pages are being accumulated. When it changes, the accumulated pages
 * belong to a query that is no longer on screen and must be thrown away.
 *
 * `whereKey` and `sortKey` come straight from `useDataBlock` and are the serialized query identity.
 * Re-deriving them here — projecting a few fields off each filter — is how this drifted before:
 * `valueType`, `isBacklink` and `typesRelationSpaceId` all change the emitted `where` clause
 * without touching `columnId` or `value`, so a filter swap could re-run the query
 * while leaving this key byte-identical, stranding the previous filter's rows in the list.
 *
 * Equally, this must not key on anything the query ignores. `filterStateKey` would be wrong for
 * that reason: it carries display names resolved asynchronously, so a name arriving would discard
 * the user's accumulated pages for a query that never changed.
 *
 * The filter *mode* is absent for the same reason, though not because `whereKey` encodes it — it
 * does not. `filterStateToWhere` returns before reading the mode for zero or one filter, and
 * ignores it for single-filter groups. In exactly those cases `where` is unchanged, so the query
 * and its result set are unchanged and no reset is warranted; where the mode does change `where`,
 * `whereKey` picks it up. Keying on the mode directly would reset accumulation for queries that
 * never changed.
 */
export function buildAccumulationResetKey(input: {
  isInfiniteScroll: boolean;
  pageSize: number;
  sourceKey: string;
  whereKey: string;
  sortKey: string;
}): string {
  return JSON.stringify([input.isInfiniteScroll, input.pageSize, input.sourceKey, input.whereKey, input.sortKey]);
}

export type InfiniteScrollDisplay = {
  /** Mount the intersection sentinel that requests the next page. */
  showSentinel: boolean;
  /** Show the loading skeleton beneath the list. */
  showSkeleton: boolean;
  /** Show "couldn't load / try again" instead of the skeleton. */
  showRetry: boolean;
  /** Replace the list with the "nothing here" placeholder. */
  showEmptyState: boolean;
};

/**
 * The one place that decides what renders beneath (or instead of) an infinite-scroll list.
 *
 * These four outcomes were three conditionals in `table-block.tsx`, each with its own gate.
 * Deciding them together makes the states enumerable and testable without rendering the block,
 * which is otherwise impractical: nothing in the repo renders `ConfiguredTableBlock`.
 *
 * The distinction this exists to draw: a failed fetch and an empty result look identical from the
 * outside. React Query settles an error as `isFetched` with `data === undefined`, so the block
 * falls back to the local store (usually empty) and `hasNextPage` resolves to `false`. Without
 * `hasError`, a timeout renders as "nothing matched" on the first page, and as a skeleton that
 * pulses forever on a later one.
 */
export function resolveInfiniteScrollDisplay(input: {
  isInfiniteScroll: boolean;
  /** Whether the list currently has any rows to show (accumulated or current-page). */
  hasRows: boolean;
  hasNextPage: boolean;
  /**
   * Scoped to infinite scroll by the caller. An ordinary paginated block still renders the empty
   * placeholder on a failed fetch; `useDataBlock` now exposes the signal to fix that, but doing so
   * changes every data block and belongs in its own change.
   */
  hasError: boolean;
  /** A later page was requested and has not been recorded yet. */
  isFetchingNextPage: boolean;
  isFetched: boolean;
  isLoading: boolean;
  /** Collections manage their own empty state elsewhere. */
  isCollection: boolean;
}): InfiniteScrollDisplay {
  const { isInfiniteScroll, hasRows, hasNextPage, hasError, isFetchingNextPage, isFetched, isLoading, isCollection } =
    input;

  if (!isInfiniteScroll) {
    return {
      showSentinel: false,
      showSkeleton: false,
      showRetry: false,
      showEmptyState: !isCollection && !hasRows && isFetched && !isLoading,
    };
  }

  // An error outranks everything: never keep fetching, never claim the result set is empty, and
  // never leave the skeleton up. The user gets a retry instead.
  if (hasError) {
    return { showSentinel: false, showSkeleton: false, showRetry: true, showEmptyState: false };
  }

  // Note there is deliberately no "no rows but more pages exist, so keep walking" branch. It would
  // be an unbounded auto-fetch — the sentinel sits alone in an empty container with a 1000px root
  // margin, so it stays intersecting and re-fires as fast as responses arrive, walking the entire
  // source. The alternative, taken here, is that such a page reports the empty placeholder while
  // the query still claims more pages. That is wrong-looking but bounded, and it is what shipped
  // before this branch. It is rare rather than impossible: `isEntityVisibleInBlock` hides entities
  // registered at creation time, and that registry outlives the edit session that filled it.
  return {
    showSentinel: hasRows && hasNextPage,
    showSkeleton: hasRows && isFetchingNextPage,
    showRetry: false,
    showEmptyState: !isCollection && !hasRows && isFetched && !isLoading,
  };
}
