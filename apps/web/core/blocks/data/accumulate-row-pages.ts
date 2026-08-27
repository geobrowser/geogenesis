import type { Row } from '~/core/types';

export type RowPage<T extends { entityId: string } = Row> = { page: number; rows: T[] };

export function rowEntityIdsSignature(rows: Array<{ entityId: string }>): string {
  return rows.map(row => row.entityId).join('|');
}

export function upsertRowPage<T extends { entityId: string }>(
  pages: RowPage<T>[],
  page: number,
  rows: T[]
): RowPage<T>[] {
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

export function flattenRowPages<T extends { entityId: string }>(pages: RowPage<T>[]): T[] {
  const ordered: T[] = [];
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
