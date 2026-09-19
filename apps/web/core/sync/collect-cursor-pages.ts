export type CursorPage<T> = {
  items: readonly T[];
  endCursor: string | null;
  hasNextPage: boolean;
};

/**
 * Exhaust a forward-only cursor connection without silently accepting a broken cursor chain.
 *
 * A connection that says another page exists must provide a new cursor. Throwing on a missing or
 * repeated cursor turns an incomplete record into a visible query error instead of an infinite
 * request loop or a plausible-looking truncated total.
 */
export async function collectCursorPages<T>(
  fetchPage: (after: string | undefined) => Promise<CursorPage<T>>
): Promise<T[]> {
  const items: T[] = [];
  const seenCursors = new Set<string>();
  let after: string | undefined;

  while (true) {
    const page = await fetchPage(after);
    items.push(...page.items);

    if (!page.hasNextPage) return items;
    if (!page.endCursor) throw new Error('Cursor connection has a next page but no end cursor');
    if (seenCursors.has(page.endCursor)) throw new Error('Cursor connection repeated its end cursor');

    seenCursors.add(page.endCursor);
    after = page.endCursor;
  }
}
