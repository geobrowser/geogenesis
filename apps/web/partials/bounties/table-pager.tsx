'use client';

import * as React from 'react';

import { SmallButton } from '~/design-system/button';
import { Text } from '~/design-system/text';

export const TABLE_PAGE_SIZE = 10;

/** Client-side paging over an already-loaded list; resets to the first page when the list changes. */
export function usePagedRows<T>(rows: readonly T[], pageSize = TABLE_PAGE_SIZE) {
  const [page, setPage] = React.useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const clampedPage = Math.min(page, pageCount - 1);

  React.useEffect(() => {
    setPage(0);
  }, [rows.length]);

  const start = clampedPage * pageSize;
  const pageRows = React.useMemo(() => rows.slice(start, start + pageSize), [rows, start, pageSize]);

  return {
    pageRows,
    page: clampedPage,
    pageCount,
    start,
    end: Math.min(start + pageSize, rows.length),
    total: rows.length,
    next: () => setPage(p => Math.min(p + 1, pageCount - 1)),
    previous: () => setPage(p => Math.max(p - 1, 0)),
  };
}

type Props = Omit<ReturnType<typeof usePagedRows<unknown>>, 'pageRows'>;

/** "1–10 of 53" with Previous / Next; renders nothing when everything fits on one page. */
export function TablePager({ page, pageCount, start, end, total, next, previous }: Props) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3" data-testid="table-pager">
      <Text variant="metadata" color="grey-04">
        {start + 1}–{end} of {total}
      </Text>
      <div className="flex items-center gap-2">
        <SmallButton disabled={page === 0} onClick={previous}>
          Previous
        </SmallButton>
        <SmallButton disabled={page >= pageCount - 1} onClick={next}>
          Next
        </SmallButton>
      </div>
    </div>
  );
}
