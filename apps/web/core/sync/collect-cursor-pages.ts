export type CursorPage<T> = {
  items: readonly T[];
  endCursor: string | null;
  hasNextPage: boolean;
};

export type CursorPageCheckpoint<T> = {
  items: T[];
  seenCursors: Set<string>;
  after: string | undefined;
};

/** Mutable progress that lets a retried cursor walk resume at its failed page. */
export function createCursorPageCheckpoint<T>(): CursorPageCheckpoint<T> {
  return { items: [], seenCursors: new Set(), after: undefined };
}

/** Give each query execution private mutable progress while retaining the last safe retry point. */
export function cloneCursorPageCheckpoint<T>(checkpoint: CursorPageCheckpoint<T>): CursorPageCheckpoint<T> {
  return {
    items: [...checkpoint.items],
    seenCursors: new Set(checkpoint.seenCursors),
    after: checkpoint.after,
  };
}

/**
 * Exhaust a forward-only cursor connection without silently accepting a broken cursor chain.
 *
 * A connection that says another page exists must provide a new cursor. Throwing on a missing or
 * repeated cursor turns an incomplete record into a visible query error instead of an infinite
 * request loop or a plausible-looking truncated total.
 */
export async function collectCursorPages<T>(
  fetchPage: (after: string | undefined) => Promise<CursorPage<T>>,
  checkpoint = createCursorPageCheckpoint<T>()
): Promise<T[]> {
  while (true) {
    const page = await fetchPage(checkpoint.after);

    if (!page.hasNextPage) {
      checkpoint.items.push(...page.items);
      return checkpoint.items;
    }

    const nextCursor = page.endCursor;
    if (!nextCursor) throw new Error('Cursor connection has a next page but no end cursor');
    if (checkpoint.seenCursors.has(nextCursor)) throw new Error('Cursor connection repeated its end cursor');

    checkpoint.items.push(...page.items);
    checkpoint.seenCursors.add(nextCursor);
    checkpoint.after = nextCursor;
  }
}
