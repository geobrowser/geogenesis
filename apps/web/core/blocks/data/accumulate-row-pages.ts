import type { Row } from '~/core/types';

export type RowPage = { page: number; rows: Row[] };

function rowEntityIdsSignature(rows: Row[]): string {
  return rows.map(row => row.entityId).join('|');
}

export function upsertRowPage(pages: RowPage[], page: number, rows: Row[]): RowPage[] {
  const signature = rowEntityIdsSignature(rows);
  const existing = pages.find(p => p.page === page);
  if (existing && rowEntityIdsSignature(existing.rows) === signature) {
    return pages;
  }
  const without = pages.filter(p => p.page !== page);
  const next = [...without, { page, rows }];
  next.sort((a, b) => a.page - b.page);
  return next;
}

export function flattenRowPages(pages: RowPage[]): Row[] {
  const ordered: Row[] = [];
  const seen = new Set<string>();

  for (const page of pages) {
    for (const row of page.rows) {
      if (!row.entityId || seen.has(row.entityId)) continue;
      seen.add(row.entityId);
      ordered.push(row);
    }
  }

  return ordered;
}
