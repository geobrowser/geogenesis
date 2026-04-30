import * as React from 'react';

import { atom, useAtom } from 'jotai';

/**
 * Hybrid cursor + bounded-offset pagination state per data block.
 *
 * For cursor-driven sources (SPACES/GEO data blocks), every fetch is
 * `(after = anchorCursor, offset)` where the offset bridges from the closest
 * known anchor to the active page. Sequential `'next'` walks add new anchors
 * so the offset stays small. Once a jumped-to page resolves, its `endCursor`
 * is recorded as a new anchor, letting the user keep hopping forward in
 * `MAX_JUMP_PAGES`-sized jumps.
 *
 * Anchors are sparse: `{ pageNumber, cursor }` where `pageNumber` is the page
 * the cursor unlocks as page-0 of its sub-window. `cursor === null` means
 * "start of the connection" and is always present at index 0.
 *
 * Note: `setPage` does **not** clamp numeric jumps — it always sets the
 * requested page. The cap is informational, exposed via `canJumpTo(target)`
 * and `maxJumpPages`. This is deliberate: COLLECTION data blocks paginate
 * locally (no cursor, no SQL offset) and need arbitrary numeric jumps. The
 * pager UI is responsible for gating chips/buttons by `canJumpTo` for
 * cursor-driven sources.
 */
export const MAX_JUMP_PAGES = 99;

type Anchor = {
  pageNumber: number;
  cursor: string | null;
};

type PaginationEntry = {
  pageNumber: number;
  anchors: Anchor[];
};

const INITIAL_ENTRY: PaginationEntry = {
  pageNumber: 0,
  anchors: [{ pageNumber: 0, cursor: null }],
};

const paginationAtom = atom<Map<string, PaginationEntry>>(new Map());

export type SetPageInput = number | 'next' | 'previous';

/** Find the highest-pageNumber anchor whose page is `<= target`. */
function findBestAnchor(anchors: Anchor[], target: number): Anchor {
  let best: Anchor = anchors[0];
  for (const anchor of anchors) {
    if (anchor.pageNumber <= target && anchor.pageNumber > best.pageNumber) {
      best = anchor;
    }
  }
  return best;
}

function canReachFromAnchors(anchors: Anchor[], target: number): boolean {
  if (target < 0) return false;
  const best = findBestAnchor(anchors, target);
  return target - best.pageNumber <= MAX_JUMP_PAGES;
}

function insertAnchor(anchors: Anchor[], next: Anchor): Anchor[] {
  if (next.cursor === null) return anchors; // null anchor is always implicitly present
  const existing = anchors.find(a => a.pageNumber === next.pageNumber);
  if (existing && existing.cursor === next.cursor) return anchors;
  const without = existing ? anchors.filter(a => a.pageNumber !== next.pageNumber) : anchors;
  const merged = [...without, next];
  merged.sort((a, b) => a.pageNumber - b.pageNumber);
  return merged;
}

export function usePagination(entityId: string) {
  const [paginationByEntity, setPaginationByEntity] = useAtom(paginationAtom);
  const entry = paginationByEntity.get(entityId) ?? INITIAL_ENTRY;
  const { pageNumber, anchors } = entry;

  const bestAnchor = findBestAnchor(anchors, pageNumber);
  const currentAfter = bestAnchor.cursor ?? undefined;
  const currentOffset = (pageNumber - bestAnchor.pageNumber) > 0 ? (pageNumber - bestAnchor.pageNumber) : undefined;

  const updateEntry = React.useCallback(
    (updater: (prev: PaginationEntry) => PaginationEntry) => {
      setPaginationByEntity(prev => {
        const next = new Map(prev);
        next.set(entityId, updater(prev.get(entityId) ?? INITIAL_ENTRY));
        return next;
      });
    },
    [entityId, setPaginationByEntity]
  );

  const setPage = React.useCallback(
    (page: SetPageInput) => {
      updateEntry(prev => {
        if (page === 'next') {
          return { ...prev, pageNumber: prev.pageNumber + 1 };
        }
        if (page === 'previous') {
          return { ...prev, pageNumber: Math.max(0, prev.pageNumber - 1) };
        }

        const target = Math.max(0, Math.floor(page));
        if (target === 0) return INITIAL_ENTRY;
        return { ...prev, pageNumber: target };
      });
    },
    [updateEntry]
  );

  /**
   * Record an anchor cursor for the page immediately following the one we
   * just fetched. After fetching page P, `endCursor` represents the boundary
   * after P's last item — so it unlocks page P+1 with offset 0.
   */
  const recordEndCursor = React.useCallback(
    (fetchedPage: number, endCursor: string | null) => {
      if (!endCursor) return;
      updateEntry(prev => {
        const nextAnchors = insertAnchor(prev.anchors, {
          pageNumber: fetchedPage + 1,
          cursor: endCursor,
        });
        if (nextAnchors === prev.anchors) return prev;
        return { ...prev, anchors: nextAnchors };
      });
    },
    [updateEntry]
  );

  /** Reset to page 0 and drop all known anchors. Used on filter/sort change. */
  const reset = React.useCallback(() => {
    updateEntry(() => INITIAL_ENTRY);
  }, [updateEntry]);

  const canJumpTo = React.useCallback(
    (target: number) => {
      if (target === pageNumber) return true;
      return canReachFromAnchors(anchors, target);
    },
    [anchors, pageNumber]
  );

  return {
    pageNumber,
    currentAfter,
    currentOffset,
    setPage,
    recordEndCursor,
    reset,
    canJumpTo,
    maxJumpPages: MAX_JUMP_PAGES,
  };
}
