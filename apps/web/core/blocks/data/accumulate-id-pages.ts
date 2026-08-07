export type IdPage = { page: number; ids: string[] };

function idsSignature(ids: string[]): string {
  return ids.join('|');
}

/**
 * Page-indexed accumulation of entity ids
 * Re-upserting an unchanged page returns the same array so it can't wake dependent effects.
 */
export function upsertIdPage(pages: IdPage[], page: number, ids: string[]): IdPage[] {
  const signature = idsSignature(ids);
  const existing = pages.find(p => p.page === page);
  if (existing && idsSignature(existing.ids) === signature) {
    return pages;
  }
  const next = [...pages.filter(p => p.page !== page), { page, ids }];
  next.sort((a, b) => a.page - b.page);
  return next;
}

/** Flattens pages in page order, keeping the first occurrence of an id repeated across pages. */
export function flattenIdPages(pages: IdPage[]): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const page of pages) {
    for (const id of page.ids) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ordered.push(id);
    }
  }

  return ordered;
}
